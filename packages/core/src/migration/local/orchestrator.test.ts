import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { MigrationPayload } from './local-legacy-types.js';

const mocks = vi.hoisted(() => {
  const preferences = new Map<string, string>();
  const callOrder: string[] = [];
  const transactionCountsByAccount = new Map<string, number>();
  // Controls whether the default account exists in the DB (simulates post-migration state)
  let defaultAccountExists = false;

  return {
    platform: 'ios',
    preferences,
    callOrder,
    transactionCountsByAccount,
    get defaultAccountExists() { return defaultAccountExists; },
    set defaultAccountExists(val: boolean) { defaultAccountExists = val; },
    preferencesGet: vi.fn(async ({ key }: { key: string }) => ({
      value: preferences.get(key) ?? null,
    })),
    preferencesSet: vi.fn(async ({ key, value }: { key: string; value: string }) => {
      callOrder.push(`set:${key}`);
      preferences.set(key, value);
    }),
    preferencesRemove: vi.fn(async ({ key }: { key: string }) => {
      preferences.delete(key);
    }),
    readAllAndroidData: vi.fn(),
    readAlliOSData: vi.fn(),
  };
});

vi.mock('@capacitor/core', () => ({
  Capacitor: {
    getPlatform: vi.fn(() => mocks.platform),
  },
}));

vi.mock('@capacitor/preferences', () => ({
  Preferences: {
    get: mocks.preferencesGet,
    set: mocks.preferencesSet,
    remove: mocks.preferencesRemove,
  },
}));

vi.mock('./android-reader', () => ({
  readAllAndroidData: mocks.readAllAndroidData,
}));

vi.mock('./ios-reader', () => ({
  readAlliOSData: mocks.readAlliOSData,
}));

vi.mock('../../db/index.js', () => ({
  db: {
    transactions: {
      where: (_key: string) => ({
        equals: (accountId: string) => ({
          count: async () => mocks.transactionCountsByAccount.get(accountId) || 0,
        }),
      }),
    },
    limits: {
      where: (_key: string) => ({
        equals: (_accountId: string) => ({
          count: async () => 0,
        }),
      }),
    },
    recurringItems: {
      where: (_key: string) => ({
        equals: (_accountId: string) => ({
          count: async () => 0,
        }),
      }),
    },
    savingsGoals: {
      where: (_key: string) => ({
        equals: (_accountId: string) => ({
          count: async () => 0,
        }),
      }),
    },
    accounts: {
      toArray: async () => {
        // Return imported accounts (not including default account since we prevent its creation)
        const accounts = [];
        if (mocks.platform === 'ios') {
          accounts.push({ id: 'ios-account', name: 'Main' });
        } else if (mocks.platform === 'android') {
          accounts.push({ id: 'android-account', name: 'Main' });
        }
        return accounts;
      },
      get: async (id: string) => {
        // Default account existence is controlled per-test via mocks.defaultAccountExists
        if (id === 'main-account') {
          return mocks.defaultAccountExists
            ? { id: 'main-account', name: 'Personal' }
            : undefined;
        }
        // Return imported accounts
        if (id === 'ios-account') {
          return { id: 'ios-account', name: 'Main' };
        }
        if (id === 'android-account') {
          return { id: 'android-account', name: 'Main' };
        }
        return undefined;
      },
    },
  },
}));

import {
  MAX_AUTOMATIC_SKIP_RETRIES,
  MIGRATION_FLAG_KEY,
  fetchLegacyData,
  isMigrationDone,
  markMigrationDone,
  markMigrationSkipped,
  resetMigrationFlag,
  runMigration,
  shouldAttemptSkipRetry,
  wasMigrationSkipped,
} from './orchestrator.js';
import { makeBudgetServiceMock } from './test-helpers.js';

function payload(platform: 'android' | 'ios'): MigrationPayload {
  return {
    schemaVersion: 1,
    exportedAt: '2026-05-13T10:00:00.000Z',
    platform,
    accounts: [{
      id: `${platform}-account`,
      name: 'Main',
      legacyId: 1,
      legacySource: platform === 'android' ? 'room' : 'core_data',
    }],
    categories: [{
      id: `${platform}-category`,
      name: 'category_food',
      type: 'expense',
      legacyId: 10,
      legacySource: platform === 'android' ? 'room' : 'core_data',
    }],
    transactions: [{
      id: `${platform}-transaction`,
      accountId: `${platform}-account`,
      categoryId: `${platform}-category`,
      amount: 100,
      date: '2026-05-13T10:30:00.000Z',
      title: 'Lunch',
      type: 'expense',
      legacyId: 20,
      legacySource: platform === 'android' ? 'room' : 'core_data',
    }],
    limits: [],
    recurringEntries: [],
    savingGoals: [],
    templates: [],
  };
}

function emptyPayload(platform: 'android' | 'ios'): MigrationPayload {
  return {
    schemaVersion: 1,
    exportedAt: '2026-05-13T10:00:00.000Z',
    platform,
    accounts: [],
    categories: [],
    transactions: [],
    limits: [],
    recurringEntries: [],
    savingGoals: [],
    templates: [],
  };
}

function makeImportTrackingBudgetService() {
  return makeBudgetServiceMock(vi.fn, {
    onImport: () => mocks.callOrder.push('importData'),
  });
}

describe('local migration orchestrator', () => {
  beforeEach(() => {
    mocks.platform = 'ios';
    mocks.preferences.clear();
    mocks.callOrder.length = 0;
    mocks.transactionCountsByAccount.clear();
    mocks.defaultAccountExists = false;
    mocks.preferencesGet.mockClear();
    mocks.preferencesSet.mockClear();
    mocks.preferencesRemove.mockClear();
    mocks.readAllAndroidData.mockReset();
    mocks.readAlliOSData.mockReset();
    mocks.readAllAndroidData.mockResolvedValue(payload('android'));
    mocks.readAlliOSData.mockResolvedValue(payload('ios'));
  });

  it('reads the named migration flag from Capacitor Preferences', async () => {
    expect(await isMigrationDone()).toBe(false);

    mocks.preferences.set(MIGRATION_FLAG_KEY, 'true');

    expect(await isMigrationDone()).toBe(true);
    expect(mocks.preferencesGet).toHaveBeenCalledWith({ key: MIGRATION_FLAG_KEY });
  });

  it('sets and removes the named migration flag', async () => {
    await markMigrationDone();
    expect(mocks.preferences.get(MIGRATION_FLAG_KEY)).toBe('true');

    await resetMigrationFlag();
    expect(mocks.preferences.has(MIGRATION_FLAG_KEY)).toBe(false);
    expect(mocks.preferencesRemove).toHaveBeenCalledWith({ key: MIGRATION_FLAG_KEY });
  });

  it('dispatches to the iOS reader on iOS', async () => {
    mocks.platform = 'ios';

    const result = await fetchLegacyData();

    expect(mocks.readAlliOSData).toHaveBeenCalledOnce();
    expect(mocks.readAllAndroidData).not.toHaveBeenCalled();
    expect(result.platform).toBe('ios');
    expect(result.accounts).toHaveLength(1);
  });

  it('dispatches to the Android reader on Android', async () => {
    mocks.platform = 'android';

    const result = await fetchLegacyData();

    expect(mocks.readAllAndroidData).toHaveBeenCalledOnce();
    expect(mocks.readAlliOSData).not.toHaveBeenCalled();
    expect(result.platform).toBe('android');
    expect(result.transactions).toHaveLength(1);
  });

  it('does not fake a native success payload on web', async () => {
    mocks.platform = 'web';

    await expect(fetchLegacyData()).rejects.toThrow('Local native migration is not supported');
    expect(mocks.readAllAndroidData).not.toHaveBeenCalled();
    expect(mocks.readAlliOSData).not.toHaveBeenCalled();
  });

  it('marks migration done only after Dexie import succeeds', async () => {
    const budgetService = makeImportTrackingBudgetService();

    const result = await runMigration(budgetService);

    expect(result.success).toBe(true);
    expect(budgetService.initializeDatabase).toHaveBeenCalledOnce();
    expect(budgetService.importData).toHaveBeenCalledOnce();
    expect(mocks.preferencesSet).toHaveBeenCalledWith({
      key: MIGRATION_FLAG_KEY,
      value: 'true',
    });
    expect(mocks.callOrder).toEqual(['importData', `set:${MIGRATION_FLAG_KEY}`]);
  });

  it('marks migration done without opening Dexie when the native payload is empty', async () => {
    mocks.readAlliOSData.mockResolvedValue(emptyPayload('ios'));
    const budgetService = makeImportTrackingBudgetService();
    const onProgress = vi.fn();

    const result = await runMigration(budgetService, onProgress);

    expect(result.success).toBe(true);
    expect(result.importedAccountIds).toEqual([]);
    expect(budgetService.initializeDatabase).not.toHaveBeenCalled();
    expect(budgetService.importData).not.toHaveBeenCalled();
    expect(mocks.preferencesSet).toHaveBeenCalledWith({
      key: MIGRATION_FLAG_KEY,
      value: 'true',
    });
    expect(onProgress).toHaveBeenLastCalledWith({ step: 'COMPLETE', result });
  });

  it('does not mark migration done when Dexie import fails', async () => {
    const budgetService = makeImportTrackingBudgetService();
    budgetService.importData.mockRejectedValue(new Error('DB write failed'));

    await expect(runMigration(budgetService)).rejects.toThrow('DB write failed');

    expect(mocks.preferencesSet).not.toHaveBeenCalled();
    expect(mocks.preferences.has(MIGRATION_FLAG_KEY)).toBe(false);
  });

  it('marks the skipped-pending-retry marker distinctly from a normal completion', async () => {
    await markMigrationSkipped();

    expect(await isMigrationDone()).toBe(true);
    expect(await wasMigrationSkipped()).toBe(true);
  });

  it('clears the skipped-pending-retry marker once markMigrationDone runs (real success or re-checked empty payload)', async () => {
    await markMigrationSkipped();
    expect(await wasMigrationSkipped()).toBe(true);

    await markMigrationDone();

    expect(await wasMigrationSkipped()).toBe(false);
  });

  it('allows automatic skip-retries up to MAX_AUTOMATIC_SKIP_RETRIES, then gives up', async () => {
    await markMigrationSkipped();

    for (let i = 0; i < MAX_AUTOMATIC_SKIP_RETRIES; i++) {
      expect(await shouldAttemptSkipRetry()).toBe(true);
    }

    // Budget exhausted: stop retrying and clear the pending-retry state so
    // a persistently broken device doesn't keep re-showing the wizard.
    expect(await shouldAttemptSkipRetry()).toBe(false);
    expect(await wasMigrationSkipped()).toBe(false);
  });

  it('resetMigrationFlag clears the skipped-pending-retry marker too', async () => {
    await markMigrationSkipped();

    await resetMigrationFlag();

    expect(await isMigrationDone()).toBe(false);
    expect(await wasMigrationSkipped()).toBe(false);
  });

  it('bypasses runMigration on web without touching Preferences', async () => {
    mocks.platform = 'web';
    const budgetService = makeImportTrackingBudgetService();

    const result = await runMigration(budgetService);

    expect(result.success).toBe(true);
    expect(budgetService.initializeDatabase).not.toHaveBeenCalled();
    expect(budgetService.importData).not.toHaveBeenCalled();
    expect(mocks.preferencesSet).not.toHaveBeenCalled();
  });

  it('prevents the default account from being created when accounts are imported', async () => {
    const budgetService = makeImportTrackingBudgetService();

    const result = await runMigration(budgetService);

    // Migration imported ios-account — default account should not be created
    expect(result.importedAccountIds).toContain('ios-account');
    // Since initializeDefaultData now checks account count and skips creation,
    // deleteAccount won't be called (the account never existed in the first place)
    expect(budgetService.deleteAccount).not.toHaveBeenCalled();
  });

  it('deletes the default account after migration when it exists and is empty', async () => {
    // Simulate the scenario where initializeDefaultData ran before the fix
    // and seeded the empty "Personal" account alongside the migrated account.
    mocks.defaultAccountExists = true;
    // Default account has zero transactions (empty)
    mocks.transactionCountsByAccount.set('main-account', 0);

    const budgetService = makeImportTrackingBudgetService();

    const result = await runMigration(budgetService);

    // Migration imported ios-account
    expect(result.importedAccountIds).toContain('ios-account');
    // The empty default account must be deleted
    expect(budgetService.deleteAccount).toHaveBeenCalledOnce();
    expect(budgetService.deleteAccount).toHaveBeenCalledWith('main-account');
  });

  it('does not create the default account when migration payload is empty (fresh install)', async () => {
    mocks.readAlliOSData.mockResolvedValue(emptyPayload('ios'));
    const budgetService = makeImportTrackingBudgetService();

    const result = await runMigration(budgetService);

    expect(result.importedAccountIds).toHaveLength(0);
    // Empty payload means fresh install, no deletion needed
    expect(budgetService.deleteAccount).not.toHaveBeenCalled();
  });

  it('does not attempt to delete the default account if it was itself migrated', async () => {
    // Edge case: old app used 'main-account' as its account ID.
    // After migration, this account will have transactions, so deletion won't be attempted.
    const mainAccountPayload = {
      ...payload('ios'),
      accounts: [{ id: 'main-account', name: 'Personal', legacyId: 1, legacySource: 'core_data' as const }],
    };
    mocks.readAlliOSData.mockResolvedValue(mainAccountPayload);
    
    // Simulate that the migrated main-account now has transactions
    mocks.transactionCountsByAccount.set('main-account', 5);
    
    const budgetService = makeBudgetServiceMock(vi.fn, {
      onImport: () => mocks.callOrder.push('importData'),
    });

    await runMigration(budgetService);

    // The account has transactions, so it won't be deleted
    expect(budgetService.deleteAccount).not.toHaveBeenCalled();
    
    // Clean up for next test
    mocks.transactionCountsByAccount.clear();
  });

  it('marks migration done successfully even with edge cases', async () => {
    // This test verifies that migration completes successfully even if there are
    // edge cases during the cleanup phase
    const budgetService = makeImportTrackingBudgetService();

    const result = await runMigration(budgetService);

    expect(result.success).toBe(true);
    expect(mocks.preferences.get('migration_performed')).toBe('true');
  });
});
