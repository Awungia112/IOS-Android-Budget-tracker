import React from 'react';
import { useTranslation } from 'react-i18next';
import { AlertCircle, RotateCcw, X } from 'lucide-react';
import { syncEngine } from '@budget/core';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { useBudget } from '@/contexts/BudgetContext';
import { useAccount } from '@/contexts/AccountContext';

interface SyncErrorSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export const SyncErrorSheet: React.FC<SyncErrorSheetProps> = ({ open, onOpenChange }) => {
  const { t } = useTranslation();
  const { triggerSync, goOnline, isOfflineMode } = useBudget();
  const { logout } = useAccount();
  const lastError = syncEngine.getLastError();
  const isSessionExpired = syncEngine.getLastErrorStatus?.() === 401;

  const handlePrimaryAction = () => {
    if (isSessionExpired) {
      // Retrying sync is pointless when the session has expired — the user
      // must re-authenticate. route through logout() which navigates to
      // the sign-in screen.
      void logout();
    } else if (isOfflineMode) {
      void goOnline();
    } else {
      triggerSync();
    }
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px] bg-budget-header text-white border-white/10 p-0 overflow-hidden rounded-t-[20px] sm:rounded-lg bottom-0 top-auto translate-y-0 sm:top-[50%] sm:translate-y-[-50%] duration-300">
        <div className="p-6">
          <DialogHeader className="mb-4">
            <div className="flex items-center justify-between mb-2">
              <div className="bg-red-500/20 p-2 rounded-full">
                <AlertCircle className="h-6 w-6 text-red-500" />
              </div>
              <DialogClose asChild>
                <Button variant="ghost" size="icon" className="text-white/70 hover:text-white hover:bg-white/10">
                  <X className="h-5 w-5" />
                </Button>
              </DialogClose>
            </div>
            <DialogTitle className="text-xl font-bold font-sans text-left">
              {t('sync.error_detail_title')}
            </DialogTitle>
            <DialogDescription className="text-white/70 text-sm text-left font-sans">
              {t('sync.error_detail_description')}
            </DialogDescription>
          </DialogHeader>

          <div className="mb-6">
            <p className="text-xs text-white/50 uppercase font-bold tracking-wider mb-2">
              {t('error')}
            </p>
            <p className="text-sm font-mono break-words text-red-200">
              {isSessionExpired
                ? t('session_expired_sign_in_again')
                : lastError || 'Unknown sync error'}
            </p>
          </div>

          <DialogFooter className="flex flex-col sm:flex-row gap-3">
            <Button
              className="w-full sm:flex-1 bg-budget-blue hover:bg-budget-blue/90 text-white font-bold h-12 rounded-xl flex items-center justify-center gap-2"
              onClick={handlePrimaryAction}
            >
              <RotateCcw className="h-4 w-4" />
              {isSessionExpired
                ? t('session_expired_sign_in_action')
                : t('sync.retry')}
            </Button>
            <DialogClose asChild>
              <Button
                variant="ghost"
                className="w-full sm:flex-1 text-white hover:bg-white/10 font-medium h-12 rounded-xl"
              >
                {t('cancel')}
              </Button>
            </DialogClose>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  );
};
