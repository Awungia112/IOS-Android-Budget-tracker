import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Ban, Clock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerDescription,
  DrawerFooter,
} from '@/components/ui/drawer';
import { useBudget } from '@/contexts/BudgetContext';
import {
  dismissMigrationBanner,
  snoozeMigrationBanner,
} from '@/lib/migrationStatus';

const ImportIcon = ({ className }: { className: string }) => (
  <span
    className={className}
    style={{
      WebkitMask: "url('/assets/import.svg') center / contain no-repeat",
      mask: "url('/assets/import.svg') center / contain no-repeat",
    }}
    aria-hidden="true"
  />
);

interface MigrationOptionsDrawerProps {
  open: boolean;
  onClose: () => void;
}

export function MigrationOptionsDrawer({ open, onClose }: MigrationOptionsDrawerProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { currentAccount } = useBudget();

  const handleMigrateNow = () => {
    onClose();
    navigate('/migration');
  };

  const handleSnooze = () => {
    if (currentAccount?.id) snoozeMigrationBanner(currentAccount.id, 7);
    onClose();
  };

  const handleIgnore = () => {
    if (currentAccount?.id) dismissMigrationBanner(currentAccount.id);
    onClose();
  };

  return (
    <Drawer open={open} onOpenChange={(v) => !v && onClose()}>
      <DrawerContent className="max-h-[80dvh] bg-white dark:bg-[#1A2124]">
        <DrawerHeader className="pb-2">
          <DrawerTitle className="text-base font-semibold text-black dark:text-white flex items-center gap-2">
            <ImportIcon className="h-5 w-5 bg-budget-blue" />
            {t('migration.options_drawer_title')}
          </DrawerTitle>
          <DrawerDescription className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            {t('migration.options_drawer_description')}
          </DrawerDescription>
        </DrawerHeader>

        <DrawerFooter className="gap-2 pt-2">
          <Button
            onClick={handleMigrateNow}
            className="w-full rounded-[8px] bg-budget-blue hover:bg-budget-blue/90 text-white font-bold flex items-center justify-center gap-2"
            data-testid="migration-options-migrate-now"
          >
            <ImportIcon className="h-4 w-4 bg-white" />
            {t('migration.banner_cta')}
          </Button>

          <Button
            onClick={handleSnooze}
            variant="outline"
            className="w-full rounded-[8px] bg-white dark:bg-white/10 border border-black/10 dark:border-white/10 text-black dark:text-white font-bold flex items-center justify-center gap-2 hover:bg-gray-50 dark:hover:bg-white/20"
            data-testid="migration-options-snooze-7d"
          >
            <Clock className="w-4 h-4" aria-hidden="true" />
            {t('migration.snooze_7_days')}
          </Button>

          <Button
            onClick={handleIgnore}
            variant="ghost"
            className="w-full rounded-[8px] text-gray-500 dark:text-gray-400 font-medium flex items-center justify-center gap-2 hover:bg-gray-50 dark:hover:bg-white/10"
            data-testid="migration-options-ignore"
          >
            <Ban className="w-4 h-4" aria-hidden="true" />
            {t('migration.ignore')}
          </Button>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  );
}
