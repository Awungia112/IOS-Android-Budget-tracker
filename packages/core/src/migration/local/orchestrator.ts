import { Capacitor } from '@capacitor/core';
import { Preferences } from '@capacitor/preferences';
import type { BudgetService } from '../../services/budget.service.js';
import type { MigrationResult, MigrationStep } from '../migration.service.js';
import { createEmptyMigrationResult } from '../migration-result.js';
import { readAllAndroidData } from './android-reader.js';
import { readAlliOSData } from './ios-reader.js';
import { importLocalMigrationPayload } from './local-payload-importer.js';
import type { MigrationPayload } from './local-legacy-types.js';
import { DEFAULT_ACCOUNT_ID } from '../../db/config.js';
import { db } from '../../db/index.js';

export const MIGRATION_FLAG_KEY = 'migration_performed';
// Set alongside MIGRATION_FLAG_KEY only when the user hits "Skip" after
// repeated failures (not on a genuine successful/empty migration). Its
// presence tells the gate to automatically retry migration on a bounded
// number of future launches, since the legacy source data is untouched and
// re-import is idempotent (see importLocalMigrationPayload).
const MIGRATION_SKIPPED_FLAG_KEY = 'migration_skipped_pending_retry';
const MIGRATION_SKIP_RETRY_COUNT_KEY = 'migration_skip_retry_count';
export const MAX_AUTOMATIC_SKIP_RETRIES = 3;

type NativeMigrationPlatform = 'android' | 'ios';
type LocalMigrationBudgetService = Pick<
  BudgetService,
  'initializeDatabase' | 'importData' | 'deleteAccount' | 'getRecurringItemsByAccountId' | 'reconcileRecurring'
>;

function isNativeMigrationPlatform(platform: string): platform is NativeMigrationPlatform {
  return platform === 'android' || platform === 'ios';
}

function completePayload(
  platform: NativeMigrationPlatform,
  partial: Partial<MigrationPayload>,
): MigrationPayload {
  return {
    schemaVersion: 1,
    exportedAt: partial.exportedAt ?? new Date().toISOString(),
    platform,
    accounts: partial.accounts ?? [],
    categories: partial.categories ?? [],
    transactions: partial.transactions ?? [],
    limits: partial.limits ?? [],
    recurringEntries: partial.recurringEntries ?? [],
    savingGoals: partial.savingGoals ?? [],
    templates: partial.templates ?? [],
  };
}

function isEmptyMigrationPayload(payload: MigrationPayload): boolean {
  return (
    payload.accounts.length === 0 &&
    payload.categories.length === 0 &&
    payload.transactions.length === 0 &&
    payload.limits.length === 0 &&
    payload.recurringEntries.length === 0 &&
    payload.savingGoals.length === 0 &&
    payload.templates.length === 0
  );
}

export async function isMigrationDone(): Promise<boolean> {
  const { value } = await Preferences.get({ key: MIGRATION_FLAG_KEY });
  return value === 'true';
}

/**
 * Marks migration done after a successful import or a confirmed-empty payload.
 * Unlike markMigrationSkipped(), this clears any pending skip-retry state so
 * the gate stops automatically retrying on future launches.
 */
export async function markMigrationDone(): Promise<void> {
  await Preferences.set({ key: MIGRATION_FLAG_KEY, value: 'true' });
  await Preferences.remove({ key: MIGRATION_SKIPPED_FLAG_KEY });
  await Preferences.remove({ key: MIGRATION_SKIP_RETRY_COUNT_KEY });
}

/**
 * Marks migration done via an explicit user "Skip" after repeated failures.
 * Unlike markMigrationDone(), this leaves a marker so the gate automatically
 * retries migration on the next few launches — see shouldAttemptSkipRetry().
 */
export async function markMigrationSkipped(): Promise<void> {
  await Preferences.set({ key: MIGRATION_FLAG_KEY, value: 'true' });
  await Preferences.set({ key: MIGRATION_SKIPPED_FLAG_KEY, value: 'true' });
}

export async function wasMigrationSkipped(): Promise<boolean> {
  const { value } = await Preferences.get({ key: MIGRATION_SKIPPED_FLAG_KEY });
  return value === 'true';
}

/**
 * Call once per launch when wasMigrationSkipped() is true, to decide whether
 * to silently retry migration this launch. Bumps the attempt counter on
 * every call so a persistently-broken device stops re-showing the wizard
 * after MAX_AUTOMATIC_SKIP_RETRIES launches instead of retrying forever.
 */
export async function shouldAttemptSkipRetry(): Promise<boolean> {
  const { value } = await Preferences.get({ key: MIGRATION_SKIP_RETRY_COUNT_KEY });
  const attempts = value ? Number.parseInt(value, 10) : 0;

  if (attempts >= MAX_AUTOMATIC_SKIP_RETRIES) {
    // Give up silently — stop treating this install as auto-recoverable.
    await Preferences.remove({ key: MIGRATION_SKIPPED_FLAG_KEY });
    await Preferences.remove({ key: MIGRATION_SKIP_RETRY_COUNT_KEY });
    return false;
  }

  await Preferences.set({ key: MIGRATION_SKIP_RETRY_COUNT_KEY, value: String(attempts + 1) });
  return true;
}

export async function resetMigrationFlag(): Promise<void> {
  await Preferences.remove({ key: MIGRATION_FLAG_KEY });
  await Preferences.remove({ key: MIGRATION_SKIPPED_FLAG_KEY });
  await Preferences.remove({ key: MIGRATION_SKIP_RETRY_COUNT_KEY });
}

export async function fetchLegacyData(): Promise<MigrationPayload> {
  const platform = Capacitor.getPlatform();

  if (!isNativeMigrationPlatform(platform)) {
    throw new Error(`Local native migration is not supported on platform "${platform}"`);
  }

  if (platform === 'android') {
    const partial = await readAllAndroidData();
    return completePayload(platform, partial);
  }

  return completePayload(platform, await readAlliOSData());
}

export async function runMigration(
  budgetService: LocalMigrationBudgetService,
  onProgress: (step: MigrationStep) => Promise<void> | void = () => undefined,
): Promise<MigrationResult> {
  const platform = Capacitor.getPlatform();

  if (!isNativeMigrationPlatform(platform)) {
    return createEmptyMigrationResult();
  }

  await onProgress({ step: 'FETCHING', entity: platform });
  const payload = await fetchLegacyData();

  if (isEmptyMigrationPayload(payload)) {
    const result = createEmptyMigrationResult();
    await markMigrationDone();
    await onProgress({ step: 'COMPLETE', result });
    return result;
  }

  await onProgress({ step: 'IMPORTING' });
  await budgetService.initializeDatabase();

  // Entity keys in import order — used to drive per-entity progress reporting.
  const ENTITY_KEYS = [
    'accounts',
    'categories',
    'transactions',
    'limits',
    'recurringItems',
    'savingGoals',
    'templates',
  ] as const;
  const total = ENTITY_KEYS.length;

  // Fire IMPORTING_ENTITY for each entity type before the actual import call.
  // importData is a single atomic operation so we report progress optimistically
  // as each entity type is queued — this gives the user smooth visual feedback
  // while the Dexie write is in flight.
  const importPromise = importLocalMigrationPayload(payload, budgetService);
  // Attach a no-op catch so Node doesn't flag the rejection as unhandled while
  // we're still in the progress loop below. The real await below will re-surface
  // any error to the caller.
  importPromise.catch(() => undefined);

  for (let i = 0; i < total; i++) {
    await onProgress({
      step: 'IMPORTING_ENTITY',
      entity: ENTITY_KEYS[i],
      current: i + 1,
      total,
    });
    // Small yield so React can flush the state update and the progress bar
    // actually moves on screen before we fire the next step.
    await new Promise<void>(r => setTimeout(r, 0));
  }

  const result = await importPromise;

  // After successful local migration with imported accounts, check if the default
  // "Personal" account should be deleted. This account is seeded on fresh install
  // but should be removed once the user's real data is imported.
  //
  // We check all entity types (transactions, limits, recurring items, savings goals)
  // to ensure we don't accidentally delete an account that has non-transaction data.
  // If any entity exists for this account, it means migrated data was merged into
  // it and it should be kept.
  if (result.importedAccountIds.length > 0) {
    try {
      const [transactions, limits, recurringItems, savingsGoals] = await Promise.all([
        db.transactions.where('accountId').equals(DEFAULT_ACCOUNT_ID).count(),
        db.limits.where('accountId').equals(DEFAULT_ACCOUNT_ID).count(),
        db.recurringItems.where('accountId').equals(DEFAULT_ACCOUNT_ID).count(),
        db.savingsGoals.where('accountId').equals(DEFAULT_ACCOUNT_ID).count(),
      ]);

      const hasAnyData = transactions > 0 || limits > 0 || recurringItems > 0 || savingsGoals > 0;

      if (!hasAnyData) {
        const defaultAccount = await db.accounts.get(DEFAULT_ACCOUNT_ID);
        if (defaultAccount) {
          await budgetService.deleteAccount(DEFAULT_ACCOUNT_ID);
          console.log('[Migration] Removed empty default account after import');
        }
      }
    } catch (err) {
      console.error('[Migration] Failed to clean up default account:', err);
    }
  }

  await markMigrationDone();
  await onProgress({ step: 'COMPLETE', result });

  return result;
}
