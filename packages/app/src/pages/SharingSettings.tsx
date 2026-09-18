import React, { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useBudget } from "@/contexts/BudgetContext";
import { useAccount } from "@/contexts/AccountContext";
import Layout from "@/components/Layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { 
  AlertDialog, 
  AlertDialogAction, 
  AlertDialogCancel, 
  AlertDialogContent, 
  AlertDialogDescription, 
  AlertDialogFooter, 
  AlertDialogHeader, 
  AlertDialogTitle 
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { 
  Mail, 
  Trash2, 
  Send, 
  Clock, 
  ShieldCheck, 
  Shield,
  AlertCircle,
  ArrowLeft,
  Users,
  XCircle,
  WifiOff,
} from "lucide-react";
import { getAccountSyncMetadata } from "@budget/core";
import Spinner from "@/components/ui/Spinner";
import { cn } from "@/lib/utils";
import { useAccountMembers, getMemberInitials } from "@/hooks/useAccountMembers";
import type { AccountMember, PendingInvite } from "@/hooks/useAccountMembers";

import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerDescription,
  DrawerFooter,
} from "@/components/ui/drawer";
import OnlineFeaturesPrompt from "@/components/OnlineFeaturesPrompt";
import { hasOptedOutOfOnlinePrompt, setPendingRedirect, setPendingSharingRetry, consumePendingSharingRetry, getHasSession } from "@/lib/accountStorage";

const cardBase = "p-3 rounded-[8px] shadow-sm bg-white dark:bg-white/5 border border-black/10 dark:border-white/10 hover:bg-gray-50 dark:hover:bg-white/10 transition-colors font-sans";

const SharingSettings: React.FC = () => {
  const { accountId } = useParams<{ accountId: string }>();
  const navigate = useNavigate();
  const { t, i18n } = useTranslation();
  const { currentAccount, accounts, isNetworkOnline, triggerSync, goOnline, isOfflineMode } = useBudget();
  const { isLoggedIn } = useAccount();
  const hasSession = getHasSession();
  const { toast } = useToast();

  const {
    members,
    pendingInvites,
    loading: membersLoading,
    currentUserId,
    isOwner,
    memberToRemove,
    setMemberToRemove,
    removeMember,
    removing,
    inviteMember,
    inviting,
    cancelInvite,
  } = useAccountMembers(accountId);

  const [serverAccountId, setServerAccountId] = useState<string | null>(null);
  const [notSynced, setNotSynced] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [inviteToCancel, setInviteToCancel] = useState<PendingInvite | null>(null);
  const [inviteDrawerOpen, setInviteDrawerOpen] = useState(false);
  const [onlinePromptOpen, setOnlinePromptOpen] = useState(false);

  const account = accounts.find(a => a.id === accountId) || currentAccount;

  // Resolve sync state on mount and whenever the offline toggle changes.
  // An account must have sync metadata AND be online to access sharing features.
  // This ensures the "not synced" gate is shown when the user toggles offline
  // from the sidebar, and lifted when they toggle back online.
  useEffect(() => {
    if (!accountId) return;

    if (isOfflineMode) {
      setNotSynced(true);
      return;
    }

    getAccountSyncMetadata(accountId).then((meta) => {
      if (meta?.serverAccountId) {
        setServerAccountId(meta.serverAccountId);
        setNotSynced(false);
      } else {
        setNotSynced(true);
      }
    }).catch(() => {
      // IndexedDB unavailable or quota exceeded — fail safe to the gate
      setNotSynced(true);
    });
  }, [accountId, isOfflineMode]);

  // Auto-retry sync when returning from registration/online prompt.
  // If the user clicked "Sync now" → saw the prompt → registered/went online
  // → was redirected back here, we should automatically retry the sync
  // without requiring another button press.
  useEffect(() => {
    const pendingRetryAccountId = consumePendingSharingRetry();
    if (!pendingRetryAccountId || !isLoggedIn) return;
    // Only auto-retry if we're on the same account
    if (pendingRetryAccountId !== accountId) return;

    const autoRetry = async () => {
      try {
        if (isOfflineMode) {
          await goOnline();
        } else {
          await triggerSync();
        }
        const meta = await getAccountSyncMetadata(pendingRetryAccountId);
        if (meta?.serverAccountId) {
          setServerAccountId(meta.serverAccountId);
          setNotSynced(false);
        }
      } catch {
        toast({
          title: t("error"),
          description: t("failed_to_sync") || "Auto-sync failed. Please try syncing manually.",
          variant: "destructive",
        });
      }
    };
    void autoRetry();
  // goOnline, triggerSync, toast and t are stable references from context/hooks
  // and do not need to be listed — adding them would cause spurious re-runs
  // because consumePendingSharingRetry() is destructive (clears localStorage)
  // and must only fire once per navigation back to this page.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accountId, isLoggedIn]);

  const handleSyncAndRetry = async () => {
    if (isOfflineMode || !isLoggedIn) {
      const optedOut = hasOptedOutOfOnlinePrompt();
      if (optedOut) {
        if (!isLoggedIn) {
          // Store the return path so registration flow redirects back here,
          // and flag that we need to auto-retry the sync upon return.
          if (accountId) {
            setPendingRedirect(`/settings/sharing/${accountId}`);
            setPendingSharingRetry(accountId);
          }
          navigate("/register");
          return;
        }
        await goOnline();
      } else {
        setOnlinePromptOpen(true);
        return;
      }
    } else {
      await triggerSync();
    }
    if (accountId) {
      const meta = await getAccountSyncMetadata(accountId);
      if (meta?.serverAccountId) {
        setServerAccountId(meta.serverAccountId);
        setNotSynced(false);
      }
    }
  };

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inviteEmail.trim() || !account || inviting) return;
    setInviteError(null);
    const error = await inviteMember(inviteEmail, account.name);
    if (error) {
      setInviteError(error);
    } else {
      setInviteDrawerOpen(false);
    }
  };

  const handleCancelInvite = async () => {
    if (!inviteToCancel) return;
    await cancelInvite(inviteToCancel.id);
    setInviteToCancel(null);
  };

  const handleRemoveMember = () => {
    removeMember();
  };

  if (!isNetworkOnline) {
    return (
      <Layout>
        <div className="min-h-screen bg-white dark:bg-[#1A2124] flex flex-col items-center justify-center p-6 text-center">
          <AlertCircle className="w-12 h-12 text-muted-foreground mb-4" />
          <h2 className="text-xl font-bold mb-2">{t("connectivity_network_offline")}</h2>
          <p className="text-muted-foreground">{t("sharing_offline_desc") || "Sharing management is only available online."}</p>
          <Button onClick={() => navigate(-1)} variant="outline" className="mt-6">
            {t("back")}
          </Button>
        </div>
      </Layout>
    );
  }

  if (notSynced) {
    return (
      <Layout>
        <div className="min-h-screen bg-white dark:bg-[#1A2124] flex flex-col items-center justify-center p-6 text-center gap-4">
          <WifiOff className="w-12 h-12 text-muted-foreground" />
          <h2 className="text-xl font-bold">{t("account_not_synced")}</h2>
          <p className="text-muted-foreground text-sm max-w-xs">
            {t("account_not_synced_desc")}
          </p>
          <div className="flex gap-3 mt-2">
            <Button onClick={() => navigate(-1)} variant="outline">{t("back")}</Button>
            {isNetworkOnline && (
              <Button
                onClick={handleSyncAndRetry}
                className="bg-budget-blue hover:bg-budget-blue/90 text-white"
              >
                {t("sync.retry") || "Sync now"}
              </Button>
            )}
          </div>
        </div>
        <OnlineFeaturesPrompt
          open={onlinePromptOpen}
          onOpenChange={setOnlinePromptOpen}
          isLoggedIn={isLoggedIn}
          hasSession={hasSession}
          onRegister={() => {
            if (accountId) {
              setPendingRedirect(`/settings/sharing/${accountId}`);
              setPendingSharingRetry(accountId);
            }
            navigate("/register");
          }}
          onCancel={() => setOnlinePromptOpen(false)}
          onConfirm={async () => {
            await goOnline();
            if (accountId) {
              const meta = await getAccountSyncMetadata(accountId);
              if (meta?.serverAccountId) {
                setServerAccountId(meta.serverAccountId);
                setNotSynced(false);
              }
            }
          }}
        />
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="min-h-screen bg-white dark:bg-[#1A2124] px-6 pt-6 pb-24 transition-colors duration-300">
        <div className="space-y-6">
          {/* Invite Entry point */}
          {isOwner && (
            <button
              onClick={() => {
                setInviteEmail("");
                setInviteError(null);
                setInviteDrawerOpen(true);
              }}
              className={cn(cardBase, "w-full flex items-center justify-between h-auto py-3 text-sm font-bold text-black dark:text-white rounded-[8px]")}
            >
              <div className="flex items-center gap-4">
                <div className="flex-shrink-0" style={{ width: 38, height: 38 }}>
                  <svg
                    width="38"
                    height="38"
                    viewBox="0 0 38 38"
                    fill="none"
                    xmlns="http://www.w3.org/2000/svg"
                  >
                    <path
                      d="M38 19C38 29.4927 29.4927 38 19 38C8.50732 38 0 29.4927 0 19C0 8.50732 8.50732 0 19 0C29.4927 0 38 8.50732 38 19Z"
                      fill="#DFE3E4"
                      fillOpacity="0.8"
                    />
                    <path
                      d="M29.6301 16.5019H21.9389V9.12012H16.8114V16.5019H9.12012V21.4232H16.8114V28.805H21.9389V21.4232H29.6301V16.5019Z"
                      className="fill-[#1A2124] dark:fill-white"
                    />
                  </svg>
                </div>
                <span>{t("invite_someone")}</span>
              </div>
              <ArrowLeft className="h-4 w-4 rotate-180 text-gray-400" />
            </button>
          )}

          {/* Section: Members */}
          <section className="space-y-3">
            <div className="flex items-center justify-between px-1">
              <h3 className="font-bold text-[13px] uppercase tracking-wider text-muted-foreground flex items-center gap-2">
                <Users className="w-3.5 h-3.5" />
                {t("current_members")}
              </h3>
              {members.length > 0 && (
                <span className="text-[10px] font-bold bg-muted px-1.5 py-0.5 rounded-full text-muted-foreground">
                  {members.length}
                </span>
              )}
            </div>
            
            <div className="space-y-2">
              {membersLoading && members.length === 0 ? (
                <div className="py-12 flex justify-center"><Spinner /></div>
              ) : members.map((member) => (
                <div 
                  key={member.userId} 
                  className={cn(cardBase, "flex items-center justify-between h-auto py-3")}
                >
                  <div className="flex items-center gap-3">
                    <Avatar className="h-10 w-10 border border-black/5">
                      {member.userId === currentUserId && currentAccount?.profileImage ? (
                        <AvatarImage src={currentAccount.profileImage} alt="" />
                      ) : (
                        <AvatarFallback className="bg-budget-blue/5 text-budget-blue font-bold text-xs">
                          {member.userId === currentUserId ? (currentAccount?.initials || 'MK') : getMemberInitials(member.displayEmail)}
                        </AvatarFallback>
                      )}
                    </Avatar>
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <p className="font-bold text-sm truncate max-w-[150px] text-black dark:text-white">
                          {member.userId === currentUserId ? (currentAccount?.name || t("you")) : (member.displayEmail || t("anonymous_user"))}
                        </p>
                        {member.userId === currentUserId && (
                          <span className="text-[9px] bg-budget-blue text-white px-1.5 py-0.5 rounded font-black uppercase tracking-tighter">
                            {t("you")}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-1">
                        {member.role === 'owner' ? (
                          <ShieldCheck className="w-3.5 h-3.5 text-budget-blue" />
                        ) : (
                          <Shield className="w-3.5 h-3.5 text-muted-foreground" />
                        )}
                        <span className={cn(
                          "text-xs font-bold uppercase tracking-wide",
                          member.role === 'owner' ? 'text-budget-blue' : 'text-muted-foreground'
                        )}>
                          {t(member.role)}
                        </span>
                      </div>
                    </div>
                  </div>
                  {isOwner && member.userId !== currentUserId && member.role !== 'owner' && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="text-muted-foreground hover:text-budget-red hover:bg-budget-red/10 rounded-full transition-all"
                      onClick={() => setMemberToRemove(member)}
                      data-testid={`remove-member-${member.userId}`}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  )}
                </div>
              ))}
            </div>
          </section>

          {/* Section: Pending */}
          {pendingInvites.length > 0 && (
            <section className="space-y-3 pt-2">
              <h3 className="font-bold text-[13px] uppercase tracking-wider text-muted-foreground px-1 flex items-center gap-2">
                <Clock className="w-3.5 h-3.5" />
                {t("pending_invites")}
              </h3>
              <div className="space-y-2">
                {pendingInvites.map((invite) => {
                    const displayEmail = invite.recipientEmail;
                    return (
                  <div 
                    key={invite.id} 
                    className={cn(cardBase, "flex items-center justify-between h-auto py-3")}
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-budget-blue/5 flex items-center justify-center border border-budget-blue/10">
                        <Mail className="w-4 h-4 text-budget-blue/60" />
                      </div>
                      <div>
                        <p className="font-bold text-sm text-black dark:text-white truncate max-w-[180px]">
                          {displayEmail || t("anonymous_user")}
                        </p>
                        <div className="flex items-center gap-1.5 mt-0.5">
                          <span className="w-1.5 h-1.5 rounded-full bg-budget-blue animate-pulse" />
                          <span className="text-[10px] text-budget-blue font-black uppercase tracking-tight">
                            {t("pending")}
                          </span>
                        </div>
                      </div>
                    </div>
                    {isOwner && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="text-muted-foreground hover:text-budget-red hover:bg-budget-red/10 rounded-full transition-all"
                        onClick={() => setInviteToCancel(invite)}
                        data-testid={`cancel-invite-${invite.id}`}
                      >
                        <XCircle className="w-4 h-4" />
                      </Button>
                    )}
                  </div>
                );
                })}
              </div>
            </section>
          )}
        </div>

        {/* Invite Member Drawer */}
        <Drawer open={inviteDrawerOpen} onOpenChange={setInviteDrawerOpen}>
          <DrawerContent className="bg-white dark:bg-[#1A2124] border-gray-200 dark:border-white/10 pb-4">
            <DrawerHeader>
              <DrawerTitle className="text-black dark:text-white">{t("invite_someone")}</DrawerTitle>
              <DrawerDescription className="text-xs text-muted-foreground">
                {t("sharing_invite_desc") || "Share your budget with family or friends"}
              </DrawerDescription>
            </DrawerHeader>
            <div className="px-5 py-4 overflow-y-auto flex-1">
              <form onSubmit={handleInvite} className="space-y-4">
                <div className="space-y-2">
                  <div className="relative group">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground group-focus-within:text-budget-blue transition-colors" />
                    <Input
                      type="email"
                      placeholder={t("enter_email")}
                      value={inviteEmail}
                      onChange={(e) => {
                        setInviteEmail(e.target.value);
                        setInviteError(null);
                      }}
                      className={cn(
                        "pl-10 h-10 bg-white dark:bg-white/5 border-black/10 dark:border-white/10 text-black dark:text-white transition-all",
                        inviteError && "border-budget-red focus-visible:ring-budget-red"
                      )}
                      required
                    />
                  </div>
                  {inviteError && (
                    <p className="text-xs font-bold text-budget-red flex items-center gap-1">
                      <AlertCircle className="w-3 h-3" />
                      {inviteError}
                    </p>
                  )}
                </div>
                <Button 
                  type="submit" 
                  disabled={inviting || !inviteEmail.trim()}
                  className="w-full bg-budget-blue hover:bg-budget-blue/90 h-11 rounded-lg font-bold text-white shadow-lg transition-all"
                >
                  {inviting ? <Spinner size={20} className="text-white" /> : (
                    <span className="flex items-center gap-2">
                      {t("send_invite")} <Send className="w-4 h-4" />
                    </span>
                  )}
                </Button>
              </form>
            </div>
            <DrawerFooter>
              <Button variant="outline" onClick={() => setInviteDrawerOpen(false)} className="w-full">
                {t("cancel")}
              </Button>
            </DrawerFooter>
          </DrawerContent>
        </Drawer>

        {/* Dialog: Remove Member */}
        <AlertDialog open={!!memberToRemove} onOpenChange={(o) => !o && setMemberToRemove(null)}>
          <AlertDialogContent className="rounded-3xl max-w-[calc(100%-2rem)] mx-auto p-0 overflow-hidden border-none shadow-2xl">
            <div className="p-8 space-y-6">
              <div className="w-16 h-16 bg-budget-red/10 rounded-2xl flex items-center justify-center text-budget-red mx-auto">
                <Trash2 className="w-8 h-8" />
              </div>
              <div className="text-center space-y-2">
                <AlertDialogTitle className="text-xl font-black">{t("remove_member_title")}</AlertDialogTitle>
                <AlertDialogDescription className="text-sm font-medium">
                  {t("remove_member_desc", { email: memberToRemove?.displayEmail })}
                </AlertDialogDescription>
              </div>
              <div className="bg-budget-red/5 p-4 rounded-2xl border border-budget-red/10 flex gap-3 italic">
                <AlertCircle className="w-5 h-5 text-budget-red shrink-0" />
                <p className="text-xs text-budget-red leading-relaxed font-bold">
                  {t("remove_member_warning")}
                </p>
              </div>
              <div className="flex flex-col sm:flex-row gap-3 pt-2">
                <AlertDialogCancel className="w-full rounded-2xl h-12 font-bold order-2 sm:order-1">{t("cancel")}</AlertDialogCancel>
                <AlertDialogAction 
                  onClick={handleRemoveMember} 
                  className="w-full rounded-2xl h-12 font-bold bg-budget-red hover:bg-budget-red/90 text-white shadow-lg shadow-budget-red/20 order-1 sm:order-2"
                >
                  {t("remove")}
                </AlertDialogAction>
              </div>
            </div>
          </AlertDialogContent>
        </AlertDialog>

        {/* Dialog: Cancel Invite */}
        <AlertDialog open={!!inviteToCancel} onOpenChange={(o) => !o && setInviteToCancel(null)}>
          <AlertDialogContent className="rounded-3xl max-w-[calc(100%-2rem)] mx-auto">
            <AlertDialogHeader className="p-2">
              <AlertDialogTitle className="text-xl font-black">{t("cancel_invite_title")}</AlertDialogTitle>
              <AlertDialogDescription className="text-sm font-medium pt-2">
                {t("cancel_invite_desc", { email: inviteToCancel?.recipientEmail })}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter className="flex-row gap-3 mt-4">
              <AlertDialogCancel className="flex-1 rounded-2xl h-12 font-bold mt-0">{t("back")}</AlertDialogCancel>
              <AlertDialogAction 
                onClick={handleCancelInvite} 
                className="flex-1 rounded-2xl h-12 font-bold bg-budget-blue hover:bg-budget-blue/90 text-white"
              >
                {t("cancel_invite")}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </Layout>
  );
};

export default SharingSettings;
