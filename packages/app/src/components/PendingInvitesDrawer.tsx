import { useTranslation } from "react-i18next";
import { Mail, Clock, ChevronRight } from "lucide-react";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerDescription,
} from "@/components/ui/drawer";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import Spinner from "@/components/ui/Spinner";
import type { PendingInvite } from "@/contexts/PendingInvitesContext";
import { cn } from "@/lib/utils";
import { getInviteInitials, formatInviteDate } from "@/lib/inviteUtils";

interface PendingInvitesDrawerProps {
  open: boolean;
  onClose: () => void;
  pendingInvites: PendingInvite[];
  isLoading: boolean;
  onSelectInvite: (invite: PendingInvite) => void;
}

export function PendingInvitesDrawer({
  open,
  onClose,
  pendingInvites,
  isLoading,
  onSelectInvite,
}: PendingInvitesDrawerProps) {
  const { t } = useTranslation();

  return (
    <Drawer open={open} onOpenChange={(v) => !v && onClose()}>
      <DrawerContent className="max-h-[80dvh] bg-white dark:bg-[#1A2124]">
        <DrawerHeader className="pb-2">
          <DrawerTitle className="text-base font-semibold text-black dark:text-white flex items-center gap-2">
            <Mail className="h-5 w-5 text-budget-blue" />
            {t("pending_invites")}
          </DrawerTitle>
          <DrawerDescription className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            {pendingInvites.length === 1
              ? t("pending_invites_description_one", { count: pendingInvites.length })
              : t("pending_invites_description_other", { count: pendingInvites.length })}
          </DrawerDescription>
        </DrawerHeader>

        <div className="overflow-y-auto px-4 flex-1">
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Spinner size={32} />
            </div>
          ) : pendingInvites.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-gray-500 dark:text-gray-400">
              <Mail className="h-12 w-12 mb-2 opacity-50" />
              <p className="text-sm">{t("no_pending_invites")}</p>
            </div>
          ) : (
            <div className="divide-y divide-gray-100 dark:divide-white/10">
              {pendingInvites.map((invite) => (
                <button
                  key={invite.id}
                  onClick={() => onSelectInvite(invite)}
                  className={cn(
                    "w-full flex items-center justify-between py-3 gap-3",
                    "hover:bg-gray-50 dark:hover:bg-white/5 transition-colors rounded-lg px-2 -mx-2"
                  )}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <Avatar className="h-10 w-10 bg-budget-blue/10">
                      <AvatarFallback className="bg-budget-blue/10 text-budget-blue font-medium">
                        {getInviteInitials(invite.inviterEmail, invite.inviterName)}
                      </AvatarFallback>
                    </Avatar>
                    <div className="min-w-0 text-left">
                      <p className="text-sm font-medium text-black dark:text-white truncate">
                        {invite.inviterName || invite.inviterEmail || t("unknown_inviter")}
                      </p>
                      <p className="text-xs text-gray-400 dark:text-gray-500 flex items-center gap-1">
                        <span className="truncate">
                          {invite.accountName || t("unnamed_account")}
                        </span>
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <div className="flex items-center gap-1 text-xs text-gray-400 dark:text-gray-500">
                      <Clock className="h-3 w-3" />
                      <span>{formatInviteDate(invite.createdAt, t)}</span>
                    </div>
                    <ChevronRight className="h-4 w-4 text-gray-400" />
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="p-4 pt-2">
          <Button
            onClick={onClose}
            variant="outline"
            className="w-full rounded-[8px] border-gray-200 dark:border-white/10 text-black dark:text-white"
          >
            {t("close")}
          </Button>
        </div>
      </DrawerContent>
    </Drawer>
  );
}
