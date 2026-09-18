import React, { useState } from "react";
import { useTranslation } from "react-i18next";
import { useBudget } from "@/contexts/BudgetContext";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import Spinner from "@/components/ui/Spinner";
import {
  Trash2,
  ShieldCheck,
  Shield,
  Users,
  Mail,
  Send,
  UserPlus,
  AlertCircle,
} from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { cn } from "@/lib/utils";
import {
  useAccountMembers,
  getMemberInitials,
} from "@/hooks/useAccountMembers";

interface MembersListProps {
  accountId: string;
  /** When true, inviting is gated behind the online-features prompt. */
  isOfflineMode?: boolean;
  /** Trigger the "go online" transition (shows the online-features prompt). */
  onGoOnline?: () => void;
}

/**
 * Displays the members of a shared (online) account with their avatars and
 * roles, lets the owner invite co-users and remove members. When offline, the
 * invite entry point is still shown and routes the user through the
 * online-features prompt so they can go online first.
 */
const MembersList: React.FC<MembersListProps> = ({
  accountId,
  isOfflineMode = false,
  onGoOnline,
}) => {
  const { t } = useTranslation();
  const { currentAccount, accounts } = useBudget();
  const {
    members,
    loading,
    currentUserId,
    isOwner,
    memberToRemove,
    setMemberToRemove,
    removeMember,
    removing,
    inviteMember,
    inviting,
  } = useAccountMembers(accountId, { isOfflineMode });

  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteError, setInviteError] = useState<string | null>(null);

  const accountName =
    accounts.find((a) => a.id === accountId)?.name ||
    currentAccount?.name ||
    "";

  const handleInviteClick = () => {
    if (isOfflineMode) {
      // Offline — route through the online-features prompt first.
      onGoOnline?.();
      return;
    }
    setInviteOpen((open) => !open);
    setInviteError(null);
  };

  const handleInvite = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!inviteEmail.trim() || inviting) return;
    setInviteError(null);
    const error = await inviteMember(inviteEmail, accountName);
    if (error) {
      setInviteError(error);
    } else {
      setInviteEmail("");
      setInviteOpen(false);
    }
  };

  if (loading && members.length === 0) {
    return (
      <div className="w-full py-6 flex justify-center">
        <Spinner />
      </div>
    );
  }

  return (
    <>
      <div className="w-full">
        <div className="flex items-center justify-between px-1 mb-2">
          <h3 className="font-bold text-xs uppercase tracking-wider text-gray-500 dark:text-gray-400 flex items-center gap-1.5">
            <Users className="w-3.5 h-3.5" />
            {t("current_members")}
          </h3>
          <div className="flex items-center gap-2">
            {isOwner && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={handleInviteClick}
                className="h-7 px-2 text-[11px] font-bold text-budget-blue hover:bg-budget-blue/10 rounded-[6px]"
                data-testid="invite-member-button"
              >
                <UserPlus className="w-3.5 h-3.5" />
                {t("invite_someone")}
              </Button>
            )}
            {members.length > 0 && (
              <span className="text-[10px] font-bold bg-gray-100 dark:bg-white/10 px-1.5 py-0.5 rounded-full text-gray-500 dark:text-gray-400">
                {members.length}
              </span>
            )}
          </div>
        </div>

        {inviteOpen && (
          <form
            onSubmit={handleInvite}
            className="mb-2 rounded-[8px] bg-gray-50 dark:bg-white/5 border border-gray-200 dark:border-white/10 p-2 space-y-2"
            data-testid="invite-form"
          >
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <Input
                type="email"
                placeholder={t("enter_email")}
                value={inviteEmail}
                onChange={(e) => {
                  setInviteEmail(e.target.value);
                  setInviteError(null);
                }}
                className={cn(
                  "pl-9 h-9 bg-white dark:bg-white/5 border-black/10 dark:border-white/10 text-black dark:text-white text-sm",
                  inviteError &&
                    "border-budget-red focus-visible:ring-budget-red",
                )}
                data-testid="invite-email-input"
                required
              />
            </div>
            {inviteError && (
              <p className="text-[11px] font-bold text-budget-red flex items-center gap-1">
                <AlertCircle className="w-3 h-3" />
                {inviteError}
              </p>
            )}
            <Button
              type="submit"
              disabled={inviting || !inviteEmail.trim()}
              className="w-full h-8 rounded-[6px] bg-budget-blue hover:bg-budget-blue/90 text-white text-xs font-bold"
              data-testid="send-invite-button"
            >
              {inviting ? (
                <Spinner size={14} className="text-white" />
              ) : (
                <span className="flex items-center gap-1.5">
                  {t("send_invite")} <Send className="w-3 h-3" />
                </span>
              )}
            </Button>
          </form>
        )}

        {members.length > 0 && (
          <div className="space-y-2">
            {members.map((member) => {
              const isSelf = member.userId === currentUserId;
              return (
                <div
                  key={member.userId}
                  className="flex items-center justify-between rounded-[8px] bg-gray-50 dark:bg-white/5 border border-gray-200 dark:border-white/10 px-3 py-2"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <Avatar className="h-9 w-9 border border-black/5">
                      {isSelf && currentAccount?.profileImage ? (
                        <AvatarImage src={currentAccount.profileImage} alt="" />
                      ) : (
                        <AvatarFallback className="bg-budget-blue/5 text-budget-blue font-bold text-xs">
                          {isSelf
                            ? currentAccount?.initials
                            : getMemberInitials(member.displayEmail)}
                        </AvatarFallback>
                      )}
                    </Avatar>
                    <div className="min-w-0">
                      <p className="font-bold text-sm truncate max-w-[150px] text-black dark:text-white">
                        {isSelf
                          ? currentAccount?.name || t("you")
                          : member.displayEmail || t("anonymous_user")}
                      </p>
                      <div className="flex items-center gap-1">
                        {member.role === "owner" ? (
                          <ShieldCheck className="w-3.5 h-3.5 text-budget-blue" />
                        ) : (
                          <Shield className="w-3.5 h-3.5 text-gray-400" />
                        )}
                        <span
                          className={cn(
                            "text-[10px] font-bold uppercase tracking-wide",
                            member.role === "owner"
                              ? "text-budget-blue"
                              : "text-gray-400",
                          )}
                        >
                          {t(member.role)}
                        </span>
                      </div>
                    </div>
                  </div>
                  {isOwner && !isSelf && member.role !== "owner" && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="text-gray-400 hover:text-budget-red hover:bg-budget-red/10 rounded-full transition-all"
                      onClick={() => setMemberToRemove(member)}
                      data-testid={`remove-member-${member.userId}`}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      <AlertDialog
        open={!!memberToRemove}
        onOpenChange={(open) => !open && setMemberToRemove(null)}
      >
        <AlertDialogContent className="rounded-[12px] max-w-[calc(100%-2rem)] bg-white dark:bg-[#1A2124] border-gray-200 dark:border-white/10 shadow-lg">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-black dark:text-white">
              {t("remove_member")}
            </AlertDialogTitle>
            <AlertDialogDescription className="text-gray-500">
              {t("remove_member_warning")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={removing}>
              {t("cancel")}
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={removeMember}
              disabled={removing}
              className="bg-budget-red hover:bg-budget-red/90 text-white"
              data-testid="confirm-remove-member-button"
            >
              {removing ? <Spinner size={16} /> : t("remove_member")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};

export default MembersList;
