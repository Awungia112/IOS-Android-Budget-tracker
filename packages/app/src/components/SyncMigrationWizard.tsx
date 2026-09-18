import { useEffect, useRef, useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import Spinner from '@/components/ui/Spinner';
import { CheckCircle, XCircle, RefreshCw, AlertTriangle } from 'lucide-react';
import type { MigrationResult, MigrationStep } from '@budget/core';
import { SUPPORT_EMAIL, buildMailto } from '@/config/support';

const LOGO_SRC = '/assets/deutschland-preview.png';

// =============================================================================
// TYPES
// =============================================================================

export interface ImportProgress {
  /** Entity currently being imported, e.g. "balances" */
  currentEntity: string;
  current: number;
  total: number;
}

export interface ImportSummary {
  accounts: number;
  categories: number;
  balances: number;
  recurringEntries: number;
  savingGoals: number;
  templates: number;
}

export interface MigrationError {
  /** Human-readable message shown to the user */
  message: string;
  /** Short code shown for support reference, e.g. "ERR_FETCH_401" */
  code: string;
}

export type WizardState =
  | { phase: 'preparing' }
  | { phase: 'importing'; progress: ImportProgress }
  | { phase: 'complete'; summary: ImportSummary }
  | { phase: 'error'; error: MigrationError; retryCount: number };

/**
 * The migration function injected as a prop.
 * Receives an onProgress callback and returns a MigrationResult.
 * Must NOT be called directly inside the component. Injected for testability.
 */
export type FetchLegacyDataFn = (
  onProgress: (step: MigrationStep) => void,
) => Promise<MigrationResult>;

export interface SyncMigrationWizardProps {
  /**
   * The migration function to call on mount (and on retry).
   * Injected as a prop so the component remains unit-testable without
   * any real native plugin calls.
   */
  fetchLegacyData: FetchLegacyDataFn;
  /** Called when the user clicks "Let's go" on the complete phase */
  onComplete: (result: MigrationResult) => void;
  /**
   * Called when the user clicks "Skip" after 3 failed retries.
   * Only rendered after retryCount >= 3.
   */
  onSkip: () => void;
  /** App version string injected for the support mailto */
  appVersion?: string;
  /** Platform string injected for the support mailto, e.g. "ios" | "android" | "web" */
  platform?: string;
  /** Support email address for the mailto link */
  supportEmail?: string;
}

// =============================================================================
// ENTITY LABEL MAP
// =============================================================================

type SummaryKey = keyof ImportSummary;

const ENTITY_KEYS: SummaryKey[] = [
  'accounts',
  'categories',
  'balances',
  'recurringEntries',
  'savingGoals',
  'templates',
];

const ENTITY_I18N_KEY: Record<SummaryKey, string> = {
  accounts: 'sync_wizard.entity_accounts',
  categories: 'sync_wizard.entity_categories',
  balances: 'sync_wizard.entity_balances',
  recurringEntries: 'sync_wizard.entity_recurring',
  savingGoals: 'sync_wizard.entity_saving_goals',
  templates: 'sync_wizard.entity_templates',
};

// =============================================================================
// HELPERS
// =============================================================================

function toImportSummary(result: MigrationResult): ImportSummary {
  return {
    accounts: result.imported.accounts,
    categories: result.imported.categories,
    balances: result.imported.transactions,
    recurringEntries: result.imported.recurringItems,
    savingGoals: result.imported.savingsGoals,
    templates: result.imported.templates,
  };
}

function isEmptyMigrationResult(result: MigrationResult): boolean {
  return (
    result.success &&
    result.imported.accounts === 0 &&
    result.imported.transactions === 0 &&
    result.imported.categories === 0 &&
    result.imported.limits === 0 &&
    result.imported.templates === 0 &&
    result.imported.recurringItems === 0 &&
    result.imported.savingsGoals === 0 &&
    result.importedAccountIds.length === 0
  );
}

// =============================================================================
// PHASE: PREPARING
// =============================================================================

const PreparingPhase = () => {
  const { t } = useTranslation();
  return (
    <div className="flex flex-col items-center text-center">
      <Spinner size={48} className="mb-8" aria-hidden="true" />
      <div className="space-y-3">
        <p
          className="text-[16px] leading-[21px] text-[#0b0b0b]/80"
          aria-live="polite"
          data-testid="sync-wizard-preparing-text"
        >
          {t('sync_wizard.preparing_description')}
        </p>
        <p className="text-[14px] leading-[20px] text-[#0b0b0b]/55">
          {t('sync_wizard.preparing_note')}
        </p>
      </div>
    </div>
  );
};

// =============================================================================
// PHASE: IMPORTING
// =============================================================================

const ImportingPhase = ({ progress }: { progress: ImportProgress }) => {
  const { t } = useTranslation();
  const pct = progress.total > 0
    ? Math.round((progress.current / progress.total) * 100)
    : 0;

  return (
    <div className="flex flex-col gap-7 text-center">
      <div className="space-y-3">
        <p className="text-[16px] leading-[21px] text-[#0b0b0b]/80">
          {t('sync_wizard.importing_description')}
        </p>
        <p className="text-[14px] leading-[20px] text-[#0b0b0b]/55">
          {t('sync_wizard.importing_note')}
        </p>
      </div>

      <div className="space-y-3">
        <Progress
          value={pct}
          className="h-2 bg-black/10 [&>div]:bg-[#0b75c2]"
          aria-label={progress.currentEntity}
        />
        <p
          className="text-[13px] text-[#0b0b0b]/60 text-center tabular-nums"
          aria-live="polite"
          data-testid="sync-wizard-progress-text"
        >
          {progress.currentEntity}: {progress.current} {t('sync_wizard.progress_of')} {progress.total}
        </p>
      </div>
    </div>
  );
};

// =============================================================================
// PHASE: COMPLETE
// =============================================================================

const CompletePhase = ({
  summary,
  onComplete,
}: {
  summary: ImportSummary;
  onComplete: () => void;
}) => {
  const { t } = useTranslation();

  return (
    <div className="flex flex-col gap-7">
      <div className="flex justify-center">
        <CheckCircle className="w-14 h-14 text-[#16a34a]" aria-hidden="true" />
      </div>

      <div className="space-y-3 text-center">
        <p className="text-[16px] leading-[21px] text-[#0b0b0b]/80">
          {t('sync_wizard.complete_description')}
        </p>
        <p className="text-[14px] leading-[20px] text-[#0b0b0b]/55">
          {t('sync_wizard.complete_note')}
        </p>
      </div>

      <div
        className="space-y-2"
        aria-live="polite"
        data-testid="sync-wizard-summary"
      >
        {ENTITY_KEYS.map((key) => (
          <div
            key={key}
            className="flex items-center justify-between text-[15px]"
          >
            <span className="text-[#0b0b0b]/70">{t(ENTITY_I18N_KEY[key])}</span>
            <span className="font-semibold text-[#0b0b0b]" data-testid={`sync-wizard-count-${key}`}>
              {summary[key]}
            </span>
          </div>
        ))}
      </div>

      <Button
        onClick={onComplete}
        className="w-full h-[54px] bg-budget-blue hover:bg-budget-blue/90 text-white rounded-[8px] font-bold"
        data-testid="sync-wizard-lets-go"
      >
        {t('sync_wizard.lets_go')}
      </Button>
    </div>
  );
};

// =============================================================================
// PHASE: ERROR
// =============================================================================

const buildSupportMailto = (
  supportEmail: string,
  error: MigrationError,
  appVersion: string,
  platform: string,
): string => {
  const subject = `[Migrationsfehler] ${error.code}`;
  const body = `Hallo,\n\nIch habe einen Fehler bei der Datenmigration festgestellt.\n\nFehler: ${error.message}\nCode: ${error.code}\nApp-Version: ${appVersion}\nPlattform: ${platform}\n\nBitte helfen Sie mir, dieses Problem zu lösen.`;
  return buildMailto(supportEmail, subject, body);
};

const ErrorPhase = ({
  error,
  retryCount,
  onRetry,
  onSkip,
  appVersion,
  platform,
  supportEmail,
}: {
  error: MigrationError;
  retryCount: number;
  onRetry: () => void;
  onSkip: () => void;
  appVersion: string;
  platform: string;
  supportEmail: string;
}) => {
  const { t } = useTranslation();
  const showSkip = retryCount >= 3;
  const mailtoHref = buildSupportMailto(supportEmail, error, appVersion, platform);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex justify-center">
        <XCircle className="w-14 h-14 text-budget-red" aria-hidden="true" />
      </div>

      <div
        role="alert"
        aria-live="assertive"
        className="space-y-1 text-center"
        data-testid="sync-wizard-error-box"
      >
        <p className="text-[16px] leading-[21px] text-budget-red">{error.message}</p>
        <p className="text-[13px] text-budget-red/70">
          {t('sync_wizard.error_code_label')}: <span className="font-mono" data-testid="sync-wizard-error-code">{error.code}</span>
        </p>
      </div>

      {showSkip && (
        <div
          role="status"
          aria-live="polite"
          className="flex items-start gap-2 text-left"
          data-testid="sync-wizard-skip-warning"
        >
          <AlertTriangle className="w-4 h-4 text-amber-600 mt-0.5 shrink-0" aria-hidden="true" />
          <p className="text-xs text-amber-700">
            {t('sync_wizard.skip_warning')}
          </p>
        </div>
      )}

      <div className="flex flex-col gap-3">
        <Button
          onClick={onRetry}
          className="w-full h-[54px] bg-budget-blue hover:bg-budget-blue/90 text-white rounded-[8px] font-bold"
          data-testid="sync-wizard-retry"
        >
          <RefreshCw className="w-4 h-4 mr-2" aria-hidden="true" />
          {t('sync_wizard.try_again')}
        </Button>

        <a
          href={mailtoHref}
          className="flex items-center justify-center w-full h-[54px] rounded-[8px] bg-[#D7DDE4] text-black font-bold text-sm hover:bg-gray-300 transition-colors"
          data-testid="sync-wizard-contact-support"
        >
          {t('sync_wizard.contact_support')}
        </a>

        {showSkip && (
          <button
            onClick={onSkip}
            className="text-xs text-gray-400 underline underline-offset-2 hover:text-gray-600 transition-colors py-1"
            data-testid="sync-wizard-skip"
          >
            {t('sync_wizard.skip')}
          </button>
        )}
      </div>
    </div>
  );
};

// =============================================================================
// HEADING MAP
// =============================================================================

const PHASE_HEADING_KEY: Record<WizardState['phase'], string> = {
  preparing: 'sync_wizard.preparing_title',
  importing: 'sync_wizard.importing_title',
  complete: 'sync_wizard.complete_title',
  error: 'sync_wizard.error_title',
};

// =============================================================================
// BACK / SWIPE PREVENTION HOOK
// =============================================================================

function usePreventNavigation(active: boolean) {
  const handlerRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    if (!active) return;

    // Push a dummy history entry so the first back-press hits it instead of
    // navigating away from the wizard.
    window.history.pushState({ syncWizardLock: true }, '');

    const handler = () => {
      // Re-push to keep the lock in place for subsequent back-presses.
      window.history.pushState({ syncWizardLock: true }, '');
    };

    handlerRef.current = handler;
    window.addEventListener('popstate', handler);

    return () => {
      window.removeEventListener('popstate', handler);
      handlerRef.current = null;

      // Pop the dummy entry we pushed so the user doesn't get a "dead" back
      // button click after the wizard is dismissed. history.back() is async
      // (fires a popstate event) but we've already removed our listener above,
      // so it won't re-trigger the lock handler.
      window.history.back();
    };
  }, [active]);
}

// =============================================================================
// MAIN WIZARD: stateful, owns the WizardState machine
// =============================================================================

export const SyncMigrationWizard = ({
  fetchLegacyData,
  onComplete,
  onSkip,
  appVersion = APP_VERSION,
  platform = 'web',
  supportEmail = SUPPORT_EMAIL,
}: SyncMigrationWizardProps) => {
  const { t, i18n } = useTranslation();

  const [state, setState] = useState<WizardState>({ phase: 'preparing' });
  const retryCountRef = useRef(0);
  const resultRef = useRef<MigrationResult | null>(null);

  // Block back-button / swipe while wizard is active (not complete)
  usePreventNavigation(state.phase !== 'complete');

  // ==========================================================================
  // MIGRATION RUNNER: called on mount and on each retry
  // ==========================================================================

  const runMigration = useCallback(async () => {
    setState({ phase: 'preparing' });
    let completeFired = false;
    let autoCompleted = false;

    const completeWithResult = (result: MigrationResult) => {
      resultRef.current = result;
      if (isEmptyMigrationResult(result)) {
        autoCompleted = true;
        onComplete(result);
        return;
      }
      setState({ phase: 'complete', summary: toImportSummary(result) });
    };

    const onProgress = (step: MigrationStep) => {
      if (step.step === 'FETCHING') {
        setState({
          phase: 'importing',
          progress: { currentEntity: step.entity, current: 0, total: 1 },
        });
        return;
      }

      if (step.step === 'IMPORTING_ENTITY') {
        setState({
          phase: 'importing',
          progress: {
            currentEntity: step.entity,
            current: step.current,
            total: step.total,
          },
        });
        return;
      }

      if (step.step === 'IMPORTING') {
        setState((prev) => ({
          phase: 'importing',
          progress:
            prev.phase === 'importing'
              ? { ...prev.progress, current: prev.progress.current + 1 }
              : { currentEntity: t('sync_wizard.entity_balances'), current: 1, total: 1 },
        }));
        return;
      }

      if (step.step === 'COMPLETE') {
        completeFired = true;
        completeWithResult(step.result);
      }
    };

    try {
      const result = await fetchLegacyData(onProgress);
      resultRef.current = result;
      if (!completeFired && !autoCompleted) {
        completeWithResult(result);
      }
    } catch (err) {
      const message =
        err instanceof Error ? err.message : t('migration.local_failed_description');
      const code =
        err instanceof Error && 'code' in err
          ? String((err as { code?: unknown }).code)
          : 'ERR_LOCAL_MIGRATION';

      setState({
        phase: 'error',
        error: { message, code },
        retryCount: retryCountRef.current,
      });
    }
  }, [fetchLegacyData, onComplete, t]); // eslint-disable-line react-hooks/exhaustive-deps

  // Run on mount
  useEffect(() => {
    void runMigration();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleRetry = useCallback(() => {
    retryCountRef.current += 1;
    void runMigration();
  }, [runMigration]);

  const handleComplete = useCallback(() => {
    onComplete(resultRef.current!);
  }, [onComplete]);

  const handleSkip = useCallback(() => onSkip(), [onSkip]);

  const headingKey = PHASE_HEADING_KEY[state.phase];

  return (
    <div
      className="min-h-screen w-full bg-white flex flex-col"
      role="region"
      aria-labelledby="sync-wizard-heading"
      data-testid="sync-migration-wizard"
    >
      <div
        className="flex items-start justify-between px-9"
        style={{ paddingTop: 'calc(var(--safe-area-top, 0px) + 1.25rem)' }}
      >
        <img
          src={LOGO_SRC}
          alt="Deutschland im Plus"
          className="w-[91px] h-[91px] object-contain"
        />
        <button
          onClick={() => i18n.changeLanguage(i18n.language === 'de' ? 'en' : 'de')}
          aria-label={t('registration.change_language')}
          className="px-3 py-1.5 mt-2 rounded-full bg-white border border-black/10 text-[13px] font-semibold text-[#0b0b0b] hover:bg-gray-50 transition-colors shadow-sm"
        >
          {i18n.language === 'de' ? 'EN' : 'DE'}
        </button>
      </div>

      <div className="flex-1 flex flex-col items-center justify-center px-10 pb-20">
        <div className="w-full max-w-[320px]">
          <h2
            id="sync-wizard-heading"
            className="text-[32px] font-bold leading-tight text-[#0b0b0b] text-center mb-8"
          >
            {t(headingKey)}
          </h2>

          {state.phase === 'preparing' && <PreparingPhase />}

          {state.phase === 'importing' && (
            <ImportingPhase progress={state.progress} />
          )}

          {state.phase === 'complete' && (
            <CompletePhase summary={state.summary} onComplete={handleComplete} />
          )}

          {state.phase === 'error' && (
            <ErrorPhase
              error={state.error}
              retryCount={state.retryCount}
              onRetry={handleRetry}
              onSkip={handleSkip}
              appVersion={appVersion}
              platform={platform}
              supportEmail={supportEmail}
            />
          )}
        </div>
      </div>
    </div>
  );
};
