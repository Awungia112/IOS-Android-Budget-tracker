import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Mail, Clock } from 'lucide-react';
import Layout from '@/components/Layout';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { InviteDetailDialog } from '@/components/InviteDetailDialog';
import Spinner from '@/components/ui/Spinner';
import { cn } from '@/lib/utils';
import { usePendingInvites, type PendingInvite } from '@/contexts/PendingInvitesContext';
import { getInviteInitials, formatInviteDate } from '@/lib/inviteUtils';

const cardBase =
  'p-3 rounded-[7px] shadow-sm bg-white dark:bg-white/5 border border-black/10 dark:border-white/10 hover:bg-gray-50 dark:hover:bg-white/10 transition-colors font-sans';

const PendingInvites = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const {
    pendingInvites,
    isLoading,
    acceptInvite,
    declineInvite,
    acceptingInviteId,
    decliningInviteId,
  } = usePendingInvites();

  const [selectedInvite, setSelectedInvite] = useState<PendingInvite | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);

  return (
    <Layout>
      <div className="min-h-screen bg-white dark:bg-[#1A2124] px-6 pt-6 pb-24">
        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
          <button
            onClick={() => navigate(-1)}
            className="p-2 -ml-2 rounded-full hover:bg-gray-100 dark:hover:bg-white/10 transition-colors"
            aria-label={t('back')}
          >
            <ArrowLeft className="h-5 w-5 text-black dark:text-white" />
          </button>
          <h1 className="text-lg font-semibold text-black dark:text-white">
            {t('pending_invites')}
          </h1>
        </div>

        {/* Content */}
        {isLoading ? (
          <div className="flex items-center justify-center py-16">
            <Spinner size={32} />
          </div>
        ) : pendingInvites.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-3 text-gray-400 dark:text-gray-500">
            <Mail className="h-12 w-12 opacity-40" />
            <p className="text-sm">{t('no_pending_invites')}</p>
          </div>
        ) : (
          <div className="space-y-3">
            {pendingInvites.map((invite) => (
              <button
                key={invite.id}
                onClick={() => {
                  setSelectedInvite(invite);
                  setDialogOpen(true);
                }}
                className={cn(
                  cardBase,
                  'w-full flex items-center justify-between text-sm font-medium text-black dark:text-white',
                )}
                data-testid={`pending-invite-${invite.id}`}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <Avatar className="h-10 w-10 bg-budget-blue/10 flex-shrink-0">
                    <AvatarFallback className="bg-budget-blue/10 text-budget-blue font-medium">
                      {getInviteInitials(invite.inviterEmail, invite.inviterName)}
                    </AvatarFallback>
                  </Avatar>
                  <div className="min-w-0 text-left">
                    <p className="truncate font-medium">
                      {invite.inviterName || invite.inviterEmail || t('unknown_inviter')}
                    </p>
                    <p className="text-xs text-gray-400 dark:text-gray-500 truncate">
                      {invite.accountName || t('unnamed_account')}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0 ml-2">
                  <div className="flex items-center gap-1 text-xs text-gray-400 dark:text-gray-500">
                    <Clock className="h-3 w-3" />
                    <span>{formatInviteDate(invite.createdAt, t)}</span>
                  </div>
                  <span className="text-xs text-budget-blue font-medium bg-budget-blue/10 px-2 py-1 rounded-full">
                    {t('new')}
                  </span>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      <InviteDetailDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        invite={selectedInvite}
        onAccept={acceptInvite}
        onDecline={declineInvite}
        acceptingInviteId={acceptingInviteId}
        decliningInviteId={decliningInviteId}
      />
    </Layout>
  );
};

export default PendingInvites;
