import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { CalendarClock, X } from 'lucide-react';
import { useBudget } from '@/contexts/BudgetContext';
import { useMigrationRequired } from '@/lib/migrationStatus';
import { useMigrationDrawer } from '@/contexts/MigrationDrawerContext';

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

export const MigrationBanner = () => {
  const { currentAccount } = useBudget();
  const { t } = useTranslation();
  const navigate = useNavigate();
  const migrationRequired = useMigrationRequired(currentAccount?.id, { respectSnooze: true });
  const { openDrawer } = useMigrationDrawer();

  if (!migrationRequired) return null;

  return (
    <div
      className="mx-4 mt-4 overflow-hidden rounded-[8px] border border-black/10 bg-white shadow-sm dark:border-white/10 dark:bg-white/5"
      role="alert"
      data-testid="migration-banner"
    >
      <div className="h-1 bg-budget-blue" aria-hidden="true" />

      <div className="flex items-start gap-3 px-4 py-3">
        <ImportIcon className="mt-1 h-5 w-5 shrink-0 bg-budget-blue" />

        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold leading-snug text-black dark:text-white">
            {t('migration.banner_title')}
          </p>
          <span className="mt-2 inline-flex max-w-full items-center gap-1.5 text-[11px] font-bold leading-tight text-budget-blue">
            <CalendarClock className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            <span>{t('migration.maintenance_end_label')}</span>
          </span>
          <p className="mt-2 text-xs leading-relaxed text-gray-600 dark:text-gray-400 whitespace-pre-line">
            {t('migration.banner_description')}
          </p>
          <button
            type="button"
            onClick={() => navigate('/migration')}
            className="mt-3 inline-flex h-8 items-center gap-1.5 rounded-[8px] bg-budget-blue px-3 text-xs font-bold text-white hover:bg-budget-blue/90 focus:outline-none focus-visible:ring-2 focus-visible:ring-budget-blue/40"
            data-testid="migration-banner-cta"
          >
            {t('migration.banner_cta')}
            <ImportIcon className="h-3.5 w-3.5 bg-white" />
          </button>
        </div>

        <button
          type="button"
          onClick={openDrawer}
          className="shrink-0 rounded-[6px] p-1 text-gray-400 hover:bg-gray-50 hover:text-gray-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-budget-blue/40 dark:hover:bg-white/10 dark:hover:text-gray-300"
          aria-label={t('migration.options_label')}
          data-testid="migration-banner-options"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
};
