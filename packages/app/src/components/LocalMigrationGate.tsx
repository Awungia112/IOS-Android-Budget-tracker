import { ReactNode, useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Capacitor } from '@capacitor/core';
import {
  isMigrationDone,
  markMigrationDone,
  markMigrationSkipped,
  wasMigrationSkipped,
  shouldAttemptSkipRetry,
  resetMigrationFlag,
  runMigration,
  fetchLegacyData as fetchLegacyPayload,
  type BudgetService,
  type MigrationResult,
  type MigrationStep,
} from '@budget/core';
import { setStoredCurrentAccountId } from '@/lib/accountStorage';
import { checkForSkippedLocalMigration } from '@/lib/migrationVerification';
import { budgetService } from '@/services/budgetServiceInstance';
import { SyncMigrationWizard } from '@/components/SyncMigrationWizard';
import type { FetchLegacyDataFn } from '@/components/SyncMigrationWizard';
import {
  createDebugLegacyPayload,
  createDebugMigrationResult,
  getDebugLocalMigrationScenario,
} from '@/lib/debugMigrationScenarios';
import { SUPPORT_EMAIL } from '@/config/support';

const LOGO_SRC = '/assets/deutschland-preview.png';

// =============================================================================
// TYPES
// =============================================================================

type LocalMigrationBudgetService = Pick<
  BudgetService,
  'initializeDatabase' | 'importData' | 'deleteAccount' | 'getRecurringItemsByAccountId' | 'reconcileRecurring'
>;

interface LocalMigrationGateProps {
  children: ReactNode;
  service?: LocalMigrationBudgetService;
}

function isNativeMigrationPlatform(platform: string): boolean {
  return platform === 'android' || platform === 'ios';
}

// =============================================================================
// LOCAL MIGRATION GATE
// Wraps the entire app. On native platforms (iOS/Android), checks whether a
// local migration is needed and runs it through the SyncMigrationWizard before
// rendering children. On web, passes through immediately.
//
// Fresh-install / empty-payload handling:
//   Migration runs silently in the check phase before any UI is shown.
//   If the result has zero records (fresh install), the gate initializes the
//   database and opens immediately. The wizard is never shown.
//   If real legacy data was found, it is handed off to the wizard.
// =============================================================================

function applyStoredTheme() {
  const storedTheme = localStorage.getItem('budget-wise-theme');
  const resolvedTheme = storedTheme === 'dark' || storedTheme === 'light'
    ? storedTheme
    : window.matchMedia('(prefers-color-scheme: dark)').matches
      ? 'dark'
      : 'light';

  document.documentElement.classList.remove('light', 'dark');
  document.documentElement.classList.add(resolvedTheme);
}

export function LocalMigrationGate({
  children,
  service = budgetService,
}: LocalMigrationGateProps) {
  // 'checking': isMigrationDone() in flight + empty payload check
  // 'wizard': wizard visible (only shown when legacy data was found)
  // 'done': render children
  const [gateStatus, setGateStatus] = useState<'checking' | 'wizard' | 'done'>('checking');

  // ==========================================================================
  // INITIAL CHECK
  // ==========================================================================

  useEffect(() => {
    const check = async () => {
      const platform = Capacitor.getPlatform();
      const debugScenario = getDebugLocalMigrationScenario();

      if (!isNativeMigrationPlatform(platform) && !debugScenario) {
        setGateStatus('done');
        return;
      }

      try {
        const done = debugScenario === 'already_migrated' ? true : await isMigrationDone();
        if (done) {
          // Debug scenario overrides always short-circuit as fully done.
          const skipped = debugScenario ? false : await wasMigrationSkipped();
          if (skipped) {
            // Previously marked done via "Skip" after repeated failures. The
            // legacy source data is untouched and re-import is idempotent, so
            // silently retry instead of leaving the user stuck without their
            // historical data forever. Bounded by shouldAttemptSkipRetry() so
            // a persistently broken device stops retrying after a few launches.
            const shouldRetry = await shouldAttemptSkipRetry();
            if (!shouldRetry) {
              setGateStatus('done');
              return;
            }
          } else {
            // Migration is marked complete (not a skip-pending-retry), but
            // that flag alone can't distinguish a genuine successful
            // migration from a pre-4.5.0 install that was marked done
            // without any real import ever happening (see
            // docs/migration/pre-4.5.0-skip-detection-ticket.md). Resolve
            // this once per install via a cheap, read-only account-
            // existence check before treating it as a dead end.
            const verificationOutcome = debugScenario
              ? 'none'
              : await checkForSkippedLocalMigration();

            if (verificationOutcome !== 'remediate') {
              // Either a genuine successful migration, or nothing to
              // migrate at all — unconditional dead end. fetchLegacyPayload
              // and runMigration must never be called again in this branch.
              setGateStatus('done');
              return;
            }

            // The check conclusively found real legacy accounts that never
            // made it into Dexie — nothing there for a re-import to
            // duplicate, so it's safe to reset and fall through to the
            // normal "check legacy payload" flow below, exactly as on a
            // first launch. The user sees the real wizard and can complete
            // or skip it, same as always.
            await resetMigrationFlag();
          }
        }
      } catch {
        // Flag check failed. Proceed to migration rather than silently skipping
      }

      // Check if there is any legacy data to migrate by reading the payload
      // without importing it. If empty (fresh install), initialize the DB and
      // pass through silently. No wizard shown, no import progress UI.
      // If there IS data, go straight to the wizard so it can show full
      // progress UI ("Importing Your Data") while the actual import runs.
      try {
        const payload = debugScenario === 'fresh_install'
          ? createDebugLegacyPayload(true)
          : debugScenario === 'existing_local_user' || debugScenario === 'migration_error'
            ? createDebugLegacyPayload(false)
            : await fetchLegacyPayload();
        const isEmpty =
          payload.accounts.length === 0 &&
          payload.transactions.length === 0 &&
          payload.categories.length === 0 &&
          payload.limits.length === 0 &&
          payload.recurringEntries.length === 0 &&
          payload.savingGoals.length === 0 &&
          payload.templates.length === 0;

        if (isEmpty) {
          // Nothing to migrate. Initialize DB and proceed silently.
          try {
            await service.initializeDatabase();
          } catch {
            // best-effort
          }
          await markMigrationDone();
          setGateStatus('done');
          return;
        }
        // Real legacy data found. Fall through to show the wizard.
      } catch {
        // Payload read failed. Show the wizard so the user can retry or skip.
      }

      setGateStatus('wizard');
    };

    void check();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const handleStorageThemeChange = (event: StorageEvent) => {
      if (event.key === 'budget-wise-theme') {
        applyStoredTheme();
      }
    };

    const handleSameTabThemeChange = () => {
      applyStoredTheme();
    };

    window.addEventListener('storage', handleStorageThemeChange);
    window.addEventListener('budget-wise-theme-change', handleSameTabThemeChange);

    return () => {
      window.removeEventListener('storage', handleStorageThemeChange);
      window.removeEventListener('budget-wise-theme-change', handleSameTabThemeChange);
    };
  }, []);

  // ==========================================================================
  // FETCH LEGACY DATA: injected into SyncMigrationWizard as a prop
  // ==========================================================================

  const fetchLegacyData = useCallback<FetchLegacyDataFn>(
    async (onProgress: (step: MigrationStep) => void) => {
      const debugScenario = getDebugLocalMigrationScenario();

      if (debugScenario === 'migration_error') {
        throw new Error('Debug migration failure');
      }

      if (debugScenario === 'existing_local_user') {
        const result = createDebugMigrationResult();
        await new Promise((resolve) => setTimeout(resolve, 900));
        onProgress({ step: 'IMPORTING_ENTITY', entity: 'accounts', current: 1, total: 6 });
        await new Promise((resolve) => setTimeout(resolve, 900));
        onProgress({ step: 'IMPORTING_ENTITY', entity: 'transactions', current: 2, total: 6 });
        await new Promise((resolve) => setTimeout(resolve, 900));
        onProgress({ step: 'IMPORTING_ENTITY', entity: 'categories', current: 3, total: 6 });
        await new Promise((resolve) => setTimeout(resolve, 900));
        onProgress({ step: 'COMPLETE', result });
        return result;
      }

      return runMigration(service, onProgress);
    },
    [service],
  );

  // ==========================================================================
  // WIZARD CALLBACKS
  // ==========================================================================

  const handleComplete = useCallback(async (result: MigrationResult) => {
    const firstId = result.importedAccountIds[0];
    if (firstId) {
      setStoredCurrentAccountId(firstId);
    }

    if (
      result.success &&
      result.imported.accounts === 0 &&
      result.imported.transactions === 0 &&
      result.imported.categories === 0 &&
      result.imported.limits === 0 &&
      result.imported.templates === 0 &&
      result.imported.recurringItems === 0 &&
      result.imported.savingsGoals === 0
    ) {
      try {
        await service.initializeDatabase();
      } catch {
        // Best-effort: if DB init fails here, the app will surface its own error later.
      }
      try {
        await markMigrationDone();
      } catch {
        // ignore, best-effort persistence
      }
      // On native WebView there can be subtle timing/race issues between the
      // gate closing and the app's DB/context initialisation. A full reload
      // after marking migration done ensures the app mounts cleanly with the
      // initialized DB. Only do this on native platforms so web dev flow is
      // unaffected (and tests remain deterministic).
      if (Capacitor.isNativePlatform()) {
        try {
          window.location.reload();
          return;
        } catch {
          // ignore failures to reload. Proceed to render normally
        }
      }
    }

    setGateStatus('done');
  }, [service]);

  const handleSkip = useCallback(async () => {
    // Ensure the database is initialized even when the user skips migration,
    // otherwise the app renders with an uninitialized DB and shows a blank screen.
    try {
      await service.initializeDatabase();
    } catch {
      // Best-effort. If init fails here the app will surface its own error.
    }
    try {
      await markMigrationSkipped();
    } catch {
      // ignore
    }
    setGateStatus('done');
  }, [service]);

  // ==========================================================================
  // RENDER
  // ==========================================================================

  if (gateStatus === 'done') {
    return <>{children}</>;
  }

  const CheckingPhase = () => {
    const { t } = useTranslation();

    return (
      <div
        className="min-h-screen bg-white flex flex-col items-center justify-center px-10"
        data-testid="local-migration-checking"
      >
        <img
          src={LOGO_SRC}
          alt="Deutschland im Plus"
          className="w-[72px] h-[72px] object-contain mb-10"
        />
        <div className="w-12 h-12 rounded-full border-4 border-[#0b75c2]/20 border-t-[#0b75c2] animate-spin mb-4" />
        <p className="text-[#0b0b0b]/70 text-sm font-medium animate-pulse">
          {t('loading')}
        </p>
      </div>
    );
  };

  if (gateStatus === 'checking') {
    return <CheckingPhase />;
  }

  return (
    <div className="min-h-screen bg-white">
      {gateStatus === 'wizard' && (
        <SyncMigrationWizard
          fetchLegacyData={fetchLegacyData}
          onComplete={handleComplete}
          onSkip={handleSkip}
          platform={Capacitor.getPlatform()}
          supportEmail={SUPPORT_EMAIL}
        />
      )}
    </div>
  );
}
