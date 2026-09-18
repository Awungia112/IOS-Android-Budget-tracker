import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Mail, Clock, Folder, XCircle, CheckCircle, Loader2 } from "lucide-react";
import { OnlineAccountsError } from "@budget/core";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import Spinner from "@/components/ui/Spinner";
import type { PendingInvite } from "@/contexts/PendingInvitesContext";
import { usePendingInvites } from "@/contexts/PendingInvitesContext";
import { useBudget } from "@/contexts/BudgetContext";
import { getInviteInitials, formatInviteDateLong } from "@/lib/inviteUtils";

interface InviteDetailDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  invite: PendingInvite | null;
  onAccept: (inviteId: string, accountId: string) => Promise<{ success: boolean; error?: string }>;
  onDecline: (inviteId: string) => Promise<{ success: boolean; error?: string }>;
  acceptingInviteId: string | null;
  decliningInviteId: string | null;
}

type AcceptanceState = 'initial' | 'accepting' | 'preparing' | 'pending' | 'success' | 'error';

export function InviteDetailDialog({
  open,
  onOpenChange,
  invite,
  onAccept,
  onDecline,
  acceptingInviteId,
  decliningInviteId,
}: InviteDetailDialogProps) {
  const { t } = useTranslation();
  const { provisionSharedAccount } = useBudget();
  const { removePendingKeyDeliveryAccount } = usePendingInvites();
  const [acceptanceState, setAcceptanceState] = useState<AcceptanceState>('initial');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const isProcessing = invite && (acceptingInviteId === invite.id || decliningInviteId === invite.id);
  const isAccepting = invite && acceptingInviteId === invite.id;
  const isDeclining = invite && decliningInviteId === invite.id;

  useEffect(() => {
    if (!open) {
      setAcceptanceState('initial');
      setErrorMessage(null);
    }
  }, [open]);

  const handleAccept = async () => {
    if (!invite) return;

    setAcceptanceState('accepting');
    setErrorMessage(null);

    try {
      await onAccept(invite.id, invite.accountId);

      // Invite accepted on server — now provision the shared account.
      // This polls listAccounts until the owner delivers the key (up to 3 min).
      setAcceptanceState('preparing');

      const result = await provisionSharedAccount(
        invite.accountId,
        invite.accountName || t('unnamed_account'),
      );

      if (result.success) {
        setAcceptanceState('success');
        // Clean up: the key was delivered, so remove from pending set.
        if (invite) removePendingKeyDeliveryAccount(invite.accountId);
      } else {
        // Provisioning timed out — the owner hasn't delivered the key yet.
        setAcceptanceState('pending');
      }
    } catch (error) {
      console.error('Error accepting invite:', error);
      setAcceptanceState('error');
      setErrorMessage(
        error instanceof OnlineAccountsError && error.status === 401
          ? t('session_expired_sign_in_again')
          : t("failed_to_accept_invite"),
      );
    }
  };

  const handleDecline = async () => {
    if (!invite) return;

    setAcceptanceState('initial');
    setErrorMessage(null);

    try {
      await onDecline(invite.id);
      onOpenChange(false);
    } catch (error) {
      console.error('Error declining invite:', error);
      setAcceptanceState('error');
      setErrorMessage(
        error instanceof OnlineAccountsError && error.status === 401
          ? t('session_expired_sign_in_again')
          : t("failed_to_decline_invite"),
      );
    }
  };

  if (!invite) return null;

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="rounded-[12px] max-w-[calc(100%-2rem)] bg-white dark:bg-[#1A2124] border-gray-200 dark:border-white/10 shadow-lg">
        <AlertDialogHeader>
          <AlertDialogTitle className="text-lg font-semibold text-black dark:text-white flex items-center gap-2">
            <Mail className="h-5 w-5 text-budget-blue" />
            {t("invite_details")}
          </AlertDialogTitle>
          <AlertDialogDescription className="text-gray-500 dark:text-gray-400">
            {t("invite_details_description")}
          </AlertDialogDescription>
        </AlertDialogHeader>

        <div className="py-4 space-y-4">
          {/* Inviter info */}
          <div className="flex items-center gap-3">
            <Avatar className="h-12 w-12 bg-budget-blue/10">
              <AvatarFallback className="bg-budget-blue/10 text-budget-blue font-medium text-lg">
                {getInviteInitials(invite.inviterEmail, invite.inviterName)}
              </AvatarFallback>
            </Avatar>
            <div>
              <p className="text-sm font-medium text-black dark:text-white">
                {invite.inviterName || invite.inviterEmail || t("unknown_inviter")}
              </p>
              {invite.inviterEmail && (
                <p className="text-xs text-gray-400 dark:text-gray-500">
                  {invite.inviterEmail}
                </p>
              )}
            </div>
          </div>

          {/* Account info */}
          <div className="bg-gray-50 dark:bg-white/5 rounded-lg p-3 space-y-2">
            <div className="flex items-center gap-2 text-sm">
              <Folder className="h-4 w-4 text-gray-400" />
              <span className="text-gray-500 dark:text-gray-400">{t("account")}:</span>
              <span className="text-black dark:text-white font-medium">
                {invite.accountName || t("unnamed_account")}
              </span>
            </div>
            <div className="flex items-center gap-2 text-sm">
              <Clock className="h-4 w-4 text-gray-400" />
              <span className="text-gray-500 dark:text-gray-400">{t("sent")}:</span>
              <span className="text-black dark:text-white">
                {formatInviteDateLong(invite.createdAt)}
              </span>
            </div>
          </div>

          {/* Status states */}
          {acceptanceState === 'preparing' && (
            <div className="flex items-center gap-3 p-3 bg-blue-50 dark:bg-blue-500/10 rounded-lg">
              <Loader2 className="h-5 w-5 text-budget-blue animate-spin flex-shrink-0" />
              <div>
                <p className="text-sm font-medium text-budget-blue dark:text-blue-400">
                  {t("setting_up_access")}
                </p>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  {t("waiting_for_key_delivery_description")}
                </p>
              </div>
            </div>
          )}

          {acceptanceState === 'pending' && (
            <div className="flex items-center gap-3 p-3 bg-blue-50 dark:bg-blue-500/10 rounded-lg border-l-4 border-budget-blue">
              <Clock className="h-5 w-5 text-budget-blue dark:text-blue-400 flex-shrink-0" />
              <div>
                <p className="text-sm font-medium text-budget-blue dark:text-blue-400">
                  {t("waiting_for_key_delivery")}
                </p>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  {t("waiting_for_key_delivery_description")}
                </p>
              </div>
            </div>
          )}

          {acceptanceState === 'success' && (
            <div className="flex items-center gap-3 p-3 bg-green-50 dark:bg-green-500/10 rounded-lg">
              <CheckCircle className="h-5 w-5 text-green-600 dark:text-green-400 flex-shrink-0" />
              <div>
                <p className="text-sm font-medium text-green-600 dark:text-green-400">
                  {t("invite_accepted")}
                </p>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  {t("invite_accepted_description")}
                </p>
              </div>
            </div>
          )}

          {acceptanceState === 'error' && errorMessage && (
            <div className="flex items-center gap-3 p-3">
              <XCircle className="h-5 w-5 text-red-600 dark:text-red-400 flex-shrink-0" />
              <div>
                <p className="text-sm font-medium text-red-600 dark:text-red-400">
                  {t("error")}
                </p>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  {errorMessage}
                </p>
              </div>
            </div>
          )}
        </div>

        <AlertDialogFooter className="flex-row gap-3 sm:gap-3">
          {(acceptanceState === 'initial') && (
            <>
              <Button
                variant="ghost"
                onClick={() => onOpenChange(false)}
                className="flex-1 rounded-[8px] bg-gray-100 dark:bg-white/10 border border-gray-200 dark:border-white/10 text-black dark:text-white hover:bg-gray-200 dark:hover:bg-white/20"
                disabled={isProcessing}
              >
                {t("cancel")}
              </Button>
              <Button
                onClick={handleDecline}
                className="flex-1 rounded-[8px] bg-red-500 hover:bg-red-600 text-white"
                disabled={isProcessing}
              >
                {isDeclining ? <Spinner size={20} /> : t("decline")}
              </Button>
              <Button
                onClick={handleAccept}
                className="flex-1 rounded-[8px] bg-budget-blue hover:bg-budget-blue/90 text-white"
                disabled={isProcessing}
              >
                {isAccepting ? <Spinner size={20} /> : t("accept")}
              </Button>
            </>
          )}
          {(acceptanceState === 'preparing') && (
            <Button
              onClick={() => onOpenChange(false)}
              className="flex-1 rounded-[8px] bg-gray-100 dark:bg-white/10 border border-gray-200 dark:border-white/10 text-black dark:text-white hover:bg-gray-200 dark:hover:bg-white/20"
            >
              {t("close")}
            </Button>
          )}
          {(acceptanceState === 'pending') && (
            <Button
              onClick={() => onOpenChange(false)}
              className="flex-1 rounded-[8px] bg-budget-blue hover:bg-budget-blue/90 text-white"
            >
              {t("close")}
            </Button>
          )}
          {(acceptanceState === 'success') && (
            <Button
              onClick={() => onOpenChange(false)}
              className="flex-1 rounded-[8px] bg-budget-blue hover:bg-budget-blue/90 text-white"
            >
              {t("close")}
            </Button>
          )}
          {acceptanceState === 'error' && (
            <>
              <Button
                variant="ghost"
                onClick={() => { setAcceptanceState('initial'); setErrorMessage(null); }}
                className="flex-1 rounded-[8px] bg-gray-100 dark:bg-white/10 border border-gray-200 dark:border-white/10 text-black dark:text-white"
              >
                {t("back")}
              </Button>
              <Button
                onClick={() => onOpenChange(false)}
                className="flex-1 rounded-[8px] bg-budget-blue hover:bg-budget-blue/90 text-white"
              >
                {t("close")}
              </Button>
            </>
          )}
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
