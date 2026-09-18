import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { BudgetService } from '../../services/budget.service.js';
import { createEmptyMigrationResult, createImportedCounts } from '../migration-result.js';
import { importLocalMigrationPayload } from './local-payload-importer.js';
import type { MigrationPayload } from './local-legacy-types.js';
import { makeBudgetServiceMock } from './test-helpers.js';

const basePayload = (): MigrationPayload => ({
  schemaVersion: 1,
  exportedAt: '2026-05-13T10:00:00.000Z',
  platform: 'ios',
  accounts: [{
    id: 'account-1',
    name: ' Main Account ',
    initials: ' MA ',
    legacyId: 1,
    legacySource: 'core_data',
  }],
  categories: [{
    id: 'category-food',
    name: 'category_food',
    type: 'expense',
    icon: 'lucide:food',
    isDefault: true,
    legacyId: 10,
    legacySource: 'core_data',
  }],
  transactions: [{
    id: 'transaction-1',
    accountId: 'account-1',
    categoryId: 'category-food',
    amount: 12.34,
    date: '2026-05-13T10:10:00.000Z',
    title: 'Lunch',
    type: 'expense',
    legacyId: 20,
    legacySource: 'core_data',
  }],
  limits: [{
    id: 'limit-1',
    accountId: 'account-1',
    categoryId: 'category-food',
    amount: 300,
    legacyId: 30,
    legacySource: 'core_data',
  }],
  recurringEntries: [{
    id: 'recurring-1',
    accountId: 'account-1',
    categoryId: 'category-food',
    amount: 50,
    frequency: 'monthly',
    startDate: '2026-05-01T00:00:00.000Z',
    name: 'Rent',
    type: 'expense',
    legacyId: 40,
    legacySource: 'core_data',
  }],
  savingGoals: [{
    id: 'goal-1',
    accountId: 'account-1',
    name: 'Bike',
    targetAmount: 1000,
    monthlyAmount: 100,
    deadline: '2027-05-13T00:00:00.000Z',
    categoryId: 'category-food',
    icon: 'cash',
    legacyId: 50,
    legacySource: 'core_data',
  }],
  templates: [{
    id: 'template-1',
    accountId: 'account-1',
    name: 'Groceries',
    amount: 70,
    categoryId: 'category-food',
    type: 'expense',
    legacyId: 60,
    legacySource: 'core_data',
  }],
});

function makeFullImportBudgetService() {
  return makeBudgetServiceMock(vi.fn, {
    counts: {
      limits: 1,
      templates: 1,
      recurringItems: 1,
      savingsGoals: 1,
    },
  });
}

// Timestamps are converted to the local calendar day, so expectations must be too.
const localDate = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

describe('importLocalMigrationPayload', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('converts a local payload to ExportData and imports it for the payload account', async () => {
    const budgetService = makeFullImportBudgetService();
    const importedRecurringItem = {
      id: 'recurring-1',
      accountId: 'account-1',
      categoryId: 'category-food',
      amount: 50,
      frequency: 'monthly' as const,
      startDate: '2026-05-01',
      endDate: null,
      name: 'Rent',
      type: 'expense' as const,
    };
    budgetService.getRecurringItemsByAccountId.mockResolvedValue([importedRecurringItem]);
    const result = await importLocalMigrationPayload(basePayload(), budgetService);

    expect(budgetService.importData).toHaveBeenCalledOnce();
    expect(budgetService.importData).toHaveBeenCalledWith(
      expect.objectContaining({
        version: '1',
        exportDate: '2026-05-13T10:00:00.000Z',
        account: {
          id: 'account-1',
          name: 'Main Account',
          initials: 'MA',
        },
        transactions: [expect.objectContaining({
          id: 'transaction-1',
          accountId: 'account-1',
          category: 'category-food',
          amount: 12.34,
          type: 'expense',
          date: localDate(new Date('2026-05-13T10:10:00.000Z')),
        })],
        categories: [expect.objectContaining({
          id: 'category-food',
          accountId: 'account-1',
          name: 'category_food',
          type: 'expense',
          isDefault: true,
        })],
        recurringItems: [expect.objectContaining({
          id: 'recurring-1',
          frequency: 'monthly',
          startDate: '2026-05-01',
        })],
        savingsGoals: [expect.objectContaining({
          deadline: '2027-05-13',
        })],
      }),
      'account-1',
    );
    expect(result.success).toBe(true);
    expect(result.imported).toEqual({
      accounts: 1,
      transactions: 1,
      categories: 1,
      limits: 1,
      templates: 1,
      recurringItems: 1,
      savingsGoals: 1,
    });
    expect(result.importedAccountIds).toEqual(['account-1']);
    expect(budgetService.reconcileRecurring).toHaveBeenCalledWith(importedRecurringItem, {
      adoptLegacy: true,
    });
  });

  it('imports multi-account payloads once per account and filters account-owned entities', async () => {
    const payload = basePayload();
    payload.accounts.push({
      id: 'account-2',
      name: 'Second',
      legacyId: 2,
      legacySource: 'room',
    });
    payload.categories.push({
      id: 'category-bus',
      accountId: 'account-2',
      name: 'category_bus',
      type: 'expense',
      legacyId: 11,
      legacySource: 'room',
    } as any);
    payload.transactions.push({
      id: 'transaction-2',
      accountId: 'account-2',
      categoryId: 'category-bus',
      amount: 200,
      date: '2026-05-13T11:00:00.000Z',
      title: 'Bus',
      type: 'expense',
      legacyId: 21,
      legacySource: 'room',
    });

    const budgetService = makeFullImportBudgetService();
    await importLocalMigrationPayload(payload, budgetService);

    expect(budgetService.importData).toHaveBeenCalledTimes(2);
    expect(budgetService.importData.mock.calls[0][0].transactions).toHaveLength(1);
    expect(budgetService.importData.mock.calls[0][0].transactions[0].id).toBe('transaction-1');
    expect(budgetService.importData.mock.calls[1][0].transactions).toHaveLength(1);
    expect(budgetService.importData.mock.calls[1][0].transactions[0].id).toBe('transaction-2');
    expect(budgetService.importData.mock.calls[1][0].categories).toContainEqual(
      expect.objectContaining({ id: 'category-bus', accountId: 'account-2' }),
    );
  });

  it('can retry after a later account fails without duplicating earlier idempotent imports', async () => {
    const payload = basePayload();
    payload.accounts.push({
      id: 'account-2',
      name: 'Second',
      legacyId: 2,
      legacySource: 'realm',
    });
    payload.transactions.push({
      id: 'transaction-2',
      accountId: 'account-2',
      categoryId: 'category-food',
      amount: 200,
      date: '2026-05-13T11:00:00.000Z',
      title: 'Bus',
      type: 'expense',
      legacyId: 21,
      legacySource: 'realm',
    });

    const persistedAccounts = new Set<string>();
    const persistedTransactions = new Set<string>();
    const createdTransactionIds: string[] = [];
    let failSecondAccount = true;

    const budgetService = {
      importData: vi.fn<BudgetService['importData']>(async (data, accountId) => {
        if (accountId === 'account-2' && failSecondAccount) {
          failSecondAccount = false;
          throw new Error('account 2 failed');
        }

        const accountAlreadyImported = persistedAccounts.has(accountId);
        persistedAccounts.add(accountId);

        let transactions = 0;
        for (const transaction of data.transactions) {
          if (!persistedTransactions.has(transaction.id)) {
            persistedTransactions.add(transaction.id);
            createdTransactionIds.push(transaction.id);
            transactions++;
          }
        }

        return createImportedCounts({
          accounts: accountAlreadyImported ? 0 : 1,
          transactions,
        });
      }),
      getRecurringItemsByAccountId: vi.fn<BudgetService['getRecurringItemsByAccountId']>(async () => []),
      reconcileRecurring: vi.fn<BudgetService['reconcileRecurring']>(async () => undefined),
    };

    await expect(importLocalMigrationPayload(payload, budgetService))
      .rejects.toThrow('account 2 failed');
    expect(createdTransactionIds).toEqual(['transaction-1']);

    const retryResult = await importLocalMigrationPayload(payload, budgetService);

    expect(budgetService.importData).toHaveBeenCalledTimes(4);
    expect(persistedAccounts).toEqual(new Set(['account-1', 'account-2']));
    expect(createdTransactionIds).toEqual(['transaction-1', 'transaction-2']);
    expect(retryResult.imported.accounts).toBe(1);
    expect(retryResult.imported.transactions).toBe(1);
  });

  it('falls back to monthly for malformed recurring frequencies', async () => {
    const payload = basePayload();
    payload.recurringEntries[0].frequency = 'weekly2';
    const budgetService = makeFullImportBudgetService();

    await importLocalMigrationPayload(payload, budgetService);

    expect(budgetService.importData.mock.calls[0][0].recurringItems[0].frequency)
      .toBe('monthly');
  });

  it('preserves valid interval recurring frequencies', async () => {
    const payload = basePayload();
    payload.recurringEntries[0].frequency = 'every_3_weeks';
    const budgetService = makeFullImportBudgetService();

    await importLocalMigrationPayload(payload, budgetService);

    expect(budgetService.importData.mock.calls[0][0].recurringItems[0].frequency)
      .toBe('every_3_weeks');
  });

  it('returns zero-count success for an empty payload', async () => {
    const budgetService = makeFullImportBudgetService();
    const empty: MigrationPayload = {
      schemaVersion: 1,
      exportedAt: '2026-05-13T10:00:00.000Z',
      platform: 'android',
      accounts: [],
      categories: [],
      transactions: [],
      limits: [],
      recurringEntries: [],
      savingGoals: [],
      templates: [],
    };

    const result = await importLocalMigrationPayload(empty, budgetService);

    expect(budgetService.importData).not.toHaveBeenCalled();
    expect(result).toEqual(createEmptyMigrationResult());
  });

  it('skips accounts with a blank name and their associated transactions', async () => {
    const payload = basePayload();
    // Add a blank-named phantom account with a transaction
    payload.accounts.push({
      id: 'blank-account',
      name: '  ',
      legacyId: 99,
      legacySource: 'core_data',
    });
    payload.transactions.push({
      id: 'phantom-tx',
      accountId: 'blank-account',
      categoryId: 'category-food',
      amount: 999,
      date: '2026-05-13T10:00:00.000Z',
      title: 'Ghost transaction',
      type: 'expense',
      legacyId: 99,
      legacySource: 'core_data',
    });

    const budgetService = makeFullImportBudgetService();
    const result = await importLocalMigrationPayload(payload, budgetService);

    // Only the real account should be imported
    expect(result.importedAccountIds).toEqual(['account-1']);
    expect(result.importedAccountIds).not.toContain('blank-account');

    // importData should have been called once, for the real account only
    expect(budgetService.importData).toHaveBeenCalledTimes(1);
    const exportData = budgetService.importData.mock.calls[0][0];
    expect(exportData.account.id).toBe('account-1');
    expect(exportData.transactions.map((t: { id: string }) => t.id)).not.toContain('phantom-tx');
  });

  it('throws when entities exist without an account', async () => {
    const payload = basePayload();
    payload.accounts = [];

    await expect(importLocalMigrationPayload(payload, makeFullImportBudgetService()))
      .rejects.toThrow('Local migration payload contains entities but no account');
  });

  it('imports server-mirrored online accounts alongside local accounts', async () => {
    const payload = basePayload();
    payload.accounts.push({
      id: 'account-2',
      name: 'Online Account',
      legacyId: 2,
      legacySource: 'realm',
      isOnline: true,
      onlineId: 'online-2',
    });
    payload.categories.push({
      id: 'category-bus',
      accountId: 'account-2',
      name: 'category_bus',
      type: 'expense',
      legacyId: 11,
      legacySource: 'realm',
    } as any);
    payload.transactions.push({
      id: 'transaction-2',
      accountId: 'account-2',
      categoryId: 'category-bus',
      amount: 200,
      date: '2026-05-13T11:00:00.000Z',
      title: 'Bus',
      type: 'expense',
      legacyId: 21,
      legacySource: 'realm',
    });

    const budgetService = makeFullImportBudgetService();
    const result = await importLocalMigrationPayload(payload, budgetService);

    expect(budgetService.importData).toHaveBeenCalledTimes(2);
    expect(budgetService.importData).toHaveBeenCalledWith(
      expect.objectContaining({
        account: expect.objectContaining({ id: 'account-1' }),
        transactions: [expect.objectContaining({ id: 'transaction-1' })],
      }),
      'account-1',
    );
    expect(budgetService.importData).toHaveBeenCalledWith(
      expect.objectContaining({
        account: expect.objectContaining({ id: 'account-2' }),
        transactions: [expect.objectContaining({ id: 'transaction-2' })],
      }),
      'account-2',
    );
    expect(result.importedAccountIds).toEqual(['account-1', 'account-2']);
    expect(result.skippedAccounts).toBe(0);
    expect(result.skippedAccountIds).toEqual([]);
  });

  it('does not treat a single active account as single-account mode when a deleted sibling exists', async () => {
    const payload = basePayload();
    payload.accounts.push({
      id: 'account-2',
      name: 'Deleted Sibling',
      legacyId: 2,
      legacySource: 'room',
      isDeleted: true,
    });
    payload.categories.push({
      id: 'category-unreferenced',
      name: 'cat-unreferenced',
      type: 'expense',
      legacyId: 12,
      legacySource: 'room',
    } as any);

    const budgetService = makeFullImportBudgetService();
    await importLocalMigrationPayload(payload, budgetService);

    expect(budgetService.importData).toHaveBeenCalledTimes(1);
    expect(budgetService.importData.mock.calls[0][0].categories).toEqual([
      expect.objectContaining({ id: 'category-food', accountId: 'account-1' }),
    ]);
    expect(budgetService.importData.mock.calls[0][0].categories).not.toContainEqual(
      expect.objectContaining({ id: 'category-unreferenced' }),
    );
  });

  it('imports a payload that contains only online accounts', async () => {
    const payload = basePayload();
    payload.accounts[0].isOnline = true;
    payload.accounts[0].onlineId = 'online-1';

    const budgetService = makeFullImportBudgetService();
    const result = await importLocalMigrationPayload(payload, budgetService);

    expect(budgetService.importData).toHaveBeenCalledTimes(1);
    expect(budgetService.importData).toHaveBeenCalledWith(
      expect.objectContaining({ account: expect.objectContaining({ id: 'account-1' }) }),
      'account-1',
    );
    expect(result.importedAccountIds).toEqual(['account-1']);
    expect(result.skippedAccounts).toBe(0);
    expect(result.skippedAccountIds).toEqual([]);
  });

  it('does not mark failed imports as successful', async () => {
    const budgetService = makeFullImportBudgetService();
    budgetService.importData.mockRejectedValue(new Error('Dexie write failed'));

    await expect(importLocalMigrationPayload(basePayload(), budgetService))
      .rejects.toThrow('Dexie write failed');
  });
});
