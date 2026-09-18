import { createEmptyMigrationResult, type MigrationResult } from '@budget/core';

export type DebugLocalMigrationScenario =
  | 'fresh_install'
  | 'existing_local_user'
  | 'migration_error'
  | 'already_migrated';

export type DebugOnlineMigrationScenario =
  | 'required'
  | 'success_single_account'
  | 'success_multiple_accounts'
  | 'migration_error'
  | 'already_migrated';

export const DEBUG_LOCAL_MIGRATION_SCENARIO_KEY = 'budget-wise-debug-local-migration-scenario';
export const DEBUG_ONLINE_MIGRATION_SCENARIO_KEY = 'budget-wise-debug-online-migration-scenario';

export function isDebugMigrationScenarioEnabled(): boolean {
  if (typeof window === 'undefined') return false;
  return import.meta.env.DEV || window.location.hostname === 'localhost';
}

function isDebugLocalMigrationScenario(value: string | null): value is DebugLocalMigrationScenario {
  return (
    value === 'fresh_install' ||
    value === 'existing_local_user' ||
    value === 'migration_error' ||
    value === 'already_migrated'
  );
}

function isDebugOnlineMigrationScenario(value: string | null): value is DebugOnlineMigrationScenario {
  return (
    value === 'required' ||
    value === 'success_single_account' ||
    value === 'success_multiple_accounts' ||
    value === 'migration_error' ||
    value === 'already_migrated'
  );
}

export function getDebugLocalMigrationScenario(): DebugLocalMigrationScenario | null {
  if (!isDebugMigrationScenarioEnabled()) return null;

  const params = new URLSearchParams(window.location.search);
  const fromUrl = params.get('localMigrationScenario') ?? params.get('migrationScenario');
  if (isDebugLocalMigrationScenario(fromUrl)) {
    window.localStorage.setItem(DEBUG_LOCAL_MIGRATION_SCENARIO_KEY, fromUrl);
    return fromUrl;
  }

  const fromStorage = window.localStorage.getItem(DEBUG_LOCAL_MIGRATION_SCENARIO_KEY);
  return isDebugLocalMigrationScenario(fromStorage) ? fromStorage : null;
}

export function clearDebugLocalMigrationScenario(): void {
  if (!isDebugMigrationScenarioEnabled()) return;
  window.localStorage.removeItem(DEBUG_LOCAL_MIGRATION_SCENARIO_KEY);
}

export function getDebugOnlineMigrationScenario(): DebugOnlineMigrationScenario | null {
  if (!isDebugMigrationScenarioEnabled()) return null;

  const params = new URLSearchParams(window.location.search);
  const fromUrl = params.get('onlineMigrationScenario');
  if (isDebugOnlineMigrationScenario(fromUrl)) {
    window.localStorage.setItem(DEBUG_ONLINE_MIGRATION_SCENARIO_KEY, fromUrl);
    return fromUrl;
  }

  const fromStorage = window.localStorage.getItem(DEBUG_ONLINE_MIGRATION_SCENARIO_KEY);
  return isDebugOnlineMigrationScenario(fromStorage) ? fromStorage : null;
}

export function clearDebugOnlineMigrationScenario(): void {
  if (!isDebugMigrationScenarioEnabled()) return;
  window.localStorage.removeItem(DEBUG_ONLINE_MIGRATION_SCENARIO_KEY);
}

export function createDebugLegacyPayload(empty = false) {
  return {
    schemaVersion: 1 as const,
    exportedAt: new Date().toISOString(),
    platform: 'ios' as const,
    accounts: empty ? [] : [{ id: 'debug-account-1', name: 'Debug Household' }],
    categories: empty ? [] : [{ id: 'debug-category-1', name: 'Groceries' }],
    transactions: empty ? [] : [{ id: 'debug-transaction-1' }],
    limits: empty ? [] : [{ id: 'debug-limit-1' }],
    recurringEntries: empty ? [] : [{ id: 'debug-recurring-1' }],
    savingGoals: empty ? [] : [{ id: 'debug-saving-goal-1' }],
    templates: empty ? [] : [{ id: 'debug-template-1' }],
  };
}

export function createDebugMigrationResult(accountCount = 1): MigrationResult {
  const importedAccounts = Array.from({ length: accountCount }, (_, index) => {
    const n = index + 1;
    return {
      id: `debug-account-${n}`,
      name: n === 1 ? 'Debug Household' : `Debug Account ${n}`,
      initials: n === 1 ? 'DH' : `D${n}`,
      needsOnlinePush: n > 1,
      counts: {
        transactions: n,
        categories: 1,
        limits: 1,
        templates: 1,
        recurringItems: 1,
        savingsGoals: 1,
      },
    };
  });

  return createEmptyMigrationResult({
    imported: {
      accounts: accountCount,
      transactions: accountCount,
      categories: accountCount,
      limits: accountCount,
      templates: accountCount,
      recurringItems: accountCount,
      savingsGoals: accountCount,
    },
    pushed: accountCount > 1 ? { accounts: 1, records: 6 } : undefined,
    importedAccountIds: importedAccounts.map((account) => account.id),
    importedAccounts,
  });
}
