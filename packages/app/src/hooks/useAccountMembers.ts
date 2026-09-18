import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useAccount } from "@/contexts/AccountContext";
import { useToast } from "@/hooks/use-toast";
import { API_BASE_URL, createAppOnlineAccountsClient } from "@/lib/api";
import {
  getAccountSyncMetadata,
  loadPrivateKey,
  rotateAccountKeyAfterMemberRemoval,
  fromBase64url,
  hashEmail,
} from "@budget/core";
import type { MemberInfo } from "@budget/core";

export interface AccountMember {
  userId: string;
  displayEmail: string | null;
  role: "owner" | "member";
  joinedAt: string;
  publicKey?: string;
}

export interface PendingInvite {
  id: string;
  recipientEmail: string | null;
  recipientEmailHash: string;
  status: string;
  createdAt: string;
}

export const getMemberInitials = (email: string | null) => {
  if (!email) return "?";
  const parts = email.split("@")[0].split(/[._-]/);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }
  return parts[0].slice(0, 2).toUpperCase();
};

/**
 * Loads the members of a shared (online) account and exposes owner-only
 * member removal (including the account key rotation that follows a removal).
 * Returns nulls/empty when the account is not synced or offline.
 */
export function useAccountMembers(
  accountId: string | undefined,
  options?: { isOfflineMode?: boolean },
) {
  const { t, i18n } = useTranslation();
  const { toast } = useToast();
  const { isAuthenticated } = useAccount();
  const isOfflineMode = options?.isOfflineMode ?? false;

  const [members, setMembers] = useState<AccountMember[]>([]);
  const [pendingInvites, setPendingInvites] = useState<PendingInvite[]>([]);
  const [loading, setLoading] = useState(false);
  const [serverAccountId, setServerAccountId] = useState<string | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [memberToRemove, setMemberToRemove] = useState<AccountMember | null>(
    null,
  );
  const [removing, setRemoving] = useState(false);
  const [inviting, setInviting] = useState(false);
  const [cancellingInvite, setCancellingInvite] = useState(false);
  // Ownership is derived from the locally stored sync metadata role, so it is
  // available even offline (members are not loaded while offline).
  const [isOwner, setIsOwner] = useState(false);

  // Session token is stable for the lifetime of the page, so the client is
  // created once.
  const client = useMemo(
    () =>
      createAppOnlineAccountsClient({
        sessionToken: localStorage.getItem("session_token") || "",
        baseUrl: API_BASE_URL || window.location.origin,
      }),
    [],
  );

  const loadMembers = useCallback(
    async (serverId: string) => {
      if (!isAuthenticated) return;
      setLoading(true);
      try {
        const [sharingData, membersData] = await Promise.all([
          client.getSharingInfo(serverId),
          client.getAccountMembers({ accountId: serverId }),
        ]);
        setCurrentUserId(sharingData.currentUserId);
        setPendingInvites(sharingData.pendingInvites as PendingInvite[]);
        const publicKeyByUserId = new Map(
          membersData.members.map((m) => [m.userId, m.publicKey]),
        );
        const membersWithKeys: AccountMember[] = (
          sharingData.members as AccountMember[]
        ).map((m) => ({
          ...m,
          publicKey: publicKeyByUserId.get(m.userId),
        }));
        setMembers(membersWithKeys);
      } catch (error) {
        console.error("Failed to load account members:", error);
        toast({
          title: t("error"),
          description: t("failed_to_load_sharing_info"),
          variant: "destructive",
        });
      } finally {
        setLoading(false);
      }
    },
    [client, isAuthenticated, t, toast],
  );

  // Resolve the server account id and load members whenever the account
  // changes. Only online, synced accounts expose members; when offline we
  // skip loading (the invite entry point is still shown and routes the user
  // through the online-features prompt).
  useEffect(() => {
    if (!accountId) return;
    let cancelled = false;
    getAccountSyncMetadata(accountId)
      .then((meta) => {
        if (cancelled) return;
        setIsOwner(meta?.role === "owner");
        if (isOfflineMode) {
          // Skip loading members while offline; ownership is already known.
          setServerAccountId(null);
          setMembers([]);
          return;
        }
        if (meta?.serverAccountId) {
          setServerAccountId(meta.serverAccountId);
          loadMembers(meta.serverAccountId);
        } else {
          setServerAccountId(null);
          setMembers([]);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setServerAccountId(null);
          setMembers([]);
          setIsOwner(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [accountId, loadMembers, isOfflineMode]);

  const removeMember = useCallback(async () => {
    if (!memberToRemove || !serverAccountId || !accountId) return;
    setRemoving(true);
    try {
      // The owner's private key is stored indexed by email_hash (userId).
      const keyUserId = localStorage.getItem("userId");
      if (!keyUserId) throw new Error("User ID not found");

      const privateKey = await loadPrivateKey(keyUserId);
      if (!privateKey) throw new Error("Owner private key not available");

      const ownerMember = members.find((m) => m.userId === currentUserId);
      if (!ownerMember?.publicKey) throw new Error("Owner public key not found");
      const ownerPublicKey = await fromBase64url(ownerMember.publicKey);

      const remainingMembers: MemberInfo[] = members
        .filter((m) => m.userId !== memberToRemove.userId && m.publicKey)
        .map((m) => ({ userId: m.userId, publicKey: m.publicKey! }));

      await rotateAccountKeyAfterMemberRemoval({
        localAccountId: accountId,
        serverAccountId,
        userIdToRemove: memberToRemove.userId,
        remainingMembers,
        ownerPublicKey,
        ownerPrivateKey: privateKey,
        client,
      });

      toast({ title: t("member_removed") });
      await loadMembers(serverAccountId);
    } catch (error) {
      console.error("Failed to remove member:", error);
      toast({
        title: t("error"),
        description: t("failed_to_remove_member"),
        variant: "destructive",
      });
    } finally {
      setRemoving(false);
      setMemberToRemove(null);
    }
  }, [
    memberToRemove,
    serverAccountId,
    accountId,
    members,
    currentUserId,
    client,
    loadMembers,
    t,
    toast,
  ]);

  /**
   * Invite a co-user by email. Returns an error message (or null on success)
   * so the caller can surface inline validation feedback.
   */
  const inviteMember = useCallback(
    async (email: string, accountName: string): Promise<string | null> => {
      if (!serverAccountId) return t("failed_to_invite");
      const trimmed = email.toLowerCase().trim();

      if (trimmed === localStorage.getItem("userEmail")) {
        return t("error_invite_self");
      }
      if (members.some((m) => m.displayEmail?.toLowerCase() === trimmed)) {
        return t("already_member_error");
      }
      if (
        pendingInvites.some((i) => i.recipientEmail?.toLowerCase() === trimmed)
      ) {
        return t("duplicate_invite_error");
      }

      setInviting(true);
      try {
        const pepper = (import.meta as any).env?.VITE_EMAIL_HASH_PEPPER ?? "";
        const emailHash = await hashEmail(trimmed, pepper);
        await client.inviteMember({
          accountId: serverAccountId,
          recipientEmail: trimmed,
          recipientEmailHash: emailHash,
          senderName:
            localStorage.getItem("userName") ||
            localStorage.getItem("userEmail") ||
            t("you"),
          senderEmail: localStorage.getItem("userEmail") || undefined,
          accountName,
          language: i18n.language,
        });
        toast({
          title: t("invite_sent"),
          description: t("invite_sent_desc", { email: trimmed }),
        });
        await loadMembers(serverAccountId);
        return null;
      } catch (error: any) {
        console.error("Failed to invite member:", error);
        const apiError: string | undefined =
          (error?.body as any)?.error ?? error?.error;
        if (apiError === "already_invited") return t("duplicate_invite_error");
        if (apiError === "already_member") return t("already_member_error");
        if (apiError === "cannot_invite_self") return t("error_invite_self");
        return t("failed_to_invite");
      } finally {
        setInviting(false);
      }
    },
    [
      serverAccountId,
      members,
      pendingInvites,
      client,
      loadMembers,
      t,
      i18n.language,
      toast,
    ],
  );

  const cancelInvite = useCallback(
    async (inviteId: string) => {
      if (!serverAccountId) return;
      setCancellingInvite(true);
      try {
        await client.cancelInvite(serverAccountId, inviteId);
        toast({ title: t("invite_cancelled") });
        await loadMembers(serverAccountId);
      } catch (error) {
        console.error("Failed to cancel invite:", error);
        toast({
          title: t("error"),
          description: t("failed_to_cancel_invite"),
          variant: "destructive",
        });
      } finally {
        setCancellingInvite(false);
      }
    },
    [serverAccountId, client, loadMembers, t, toast],
  );

  return {
    members,
    pendingInvites,
    loading,
    currentUserId,
    isOwner,
    memberToRemove,
    setMemberToRemove,
    removeMember,
    removing,
    inviteMember,
    inviting,
    cancelInvite,
    cancellingInvite,
  };
}
