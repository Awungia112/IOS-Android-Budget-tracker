import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import type { MigrationCategory, MigrationPayload } from './local-legacy-types.js';
import { legacyIdToUuid } from './local-migration-utils.js';
import { MigrationIntegrityError, importToIndexedDB } from './importer.js';

function createTemporaryDb(dbName: string) {
  const db = new Dexie(dbName);
  db.version(1).stores({
    accounts: 'id',
    categories: 'id',
    transactions: 'id,accountId',
    limits: 'id',
    recurringItems: 'id',
    savingsGoals: 'id',
    templates: 'id',
  });
  return db;
}

const makePayload = (transactionCount = 5): MigrationPayload => ({
  schemaVersion: 1,
  exportedAt: '2024-03-15T10:30:00.000Z',
  platform: 'android',
  accounts: [
    {
      id: 'account-1',
      name: 'Main account',
      legacyId: 1,
      legacySource: 'room',
    },
  ],
  categories: [
    {
      id: 'category-1',
      name: 'Groceries',
      legacyId: 2,
      legacySource: 'room',
    },
  ],
  transactions: Array.from({ length: transactionCount }, (_, index) => ({
    id: `tx-${index + 1}`,
    accountId: 'account-1',
    categoryId: 'category-1',
    amount: 100 + index,
    date: '2024-03-15T10:30:00.000Z',
    title: `Transaction ${index + 1}`,
    legacyId: index + 1,
    legacySource: 'room',
  })),
  limits: [
    {
      id: 'limit-1',
      accountId: 'account-1',
      amount: 5000,
      categoryId: 'category-1',
      legacyId: 4,
      legacySource: 'room',
    },
  ],
  recurringEntries: [
    {
      id: 'recurring-1',
      accountId: 'account-1',
      categoryId: 'category-1',
      amount: 5000,
      frequency: 'monthly',
      startDate: '2024-03-15T10:30:00.000Z',
      name: 'Phone Bill',
      legacyId: 5,
      legacySource: 'room',
    },
  ],
  savingGoals: [
    {
      id: 'saving-1',
      accountId: 'account-1',
      name: 'Vacation',
      targetAmount: 100000,
      deadline: '2024-12-31T23:59:59.000Z',
      categoryId: 'category-1',
      legacyId: 6,
      legacySource: 'room',
    },
  ],
  templates: [
    {
      id: 'template-1',
      accountId: 'account-1',
      name: 'Standard Transfer',
      amount: 10000,
      categoryId: 'category-1',
      legacyId: 7,
      legacySource: 'room',
    },
  ],
});

describe('importer.ts Dexie import layer', () => {
  let db: any;
  let transactionMock: ReturnType<typeof vi.fn>;
  let accountsTable: any;
  let categoriesTable: any;
  let transactionsTable: any;
  let limitsTable: any;
  let recurringItemsTable: any;
  let savingsGoalsTable: any;
  let templatesTable: any;

  beforeEach(() => {
    transactionMock = vi.fn(async (_mode: string, tables: unknown[], callback: () => Promise<void>) => {
      await callback();
    });

    const makeTable = () => ({
      bulkPut: vi.fn(async () => undefined),
      bulkGet: vi.fn(async (ids: readonly string[]) => ids.map((id) => ({ id }))),
      count: vi.fn(async () => 0),
      get: vi.fn(async () => undefined),
    });

    accountsTable = makeTable();
    categoriesTable = makeTable();
    transactionsTable = makeTable();
    limitsTable = makeTable();
    recurringItemsTable = makeTable();
    savingsGoalsTable = makeTable();
    templatesTable = makeTable();

    db = {
      transaction: transactionMock,
      accounts: accountsTable,
      categories: categoriesTable,
      transactions: transactionsTable,
      limits: limitsTable,
      recurringItems: recurringItemsTable,
      savingsGoals: savingsGoalsTable,
      templates: templatesTable,
    };
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('writes entities in FK order and reports progress before and after each bulkPut', async () => {
    const payload = makePayload(5);

    transactionsTable.get.mockImplementation(async (id: string) => payload.transactions.find((item) => item.id === id));

    const progress: Array<[string, number, number]> = [];
    await importToIndexedDB(db, payload, (entity, current, total) => {
      progress.push([entity, current, total]);
    });

    expect(transactionMock).toHaveBeenCalledTimes(1);
    expect(transactionMock.mock.calls[0][0]).toBe('rw');
    expect(progress).toEqual([
      ['accounts', 0, 1],
      ['accounts', 1, 1],
      ['categories', 0, 1],
      ['categories', 1, 1],
      ['transactions', 0, 5],
      ['transactions', 5, 5],
      ['limits', 0, 1],
      ['limits', 1, 1],
      ['recurringItems', 0, 1],
      ['recurringItems', 1, 1],
      ['savingsGoals', 0, 1],
      ['savingsGoals', 1, 1],
      ['templates', 0, 1],
      ['templates', 1, 1],
    ]);

    expect(accountsTable.bulkPut).toHaveBeenCalledWith([
      {
        id: 'account-1',
        name: 'Main account',
        initials: 'MA',
      },
    ]);
    expect(categoriesTable.bulkPut).toHaveBeenCalledWith([
      {
        id: 'category-1',
        name: 'Groceries',
        type: 'expense',
        isDefault: false,
        accountId: 'account-1',
      },
    ]);
    expect(transactionsTable.bulkPut).toHaveBeenCalledWith(
      payload.transactions.map((transaction) => ({
        id: transaction.id,
        accountId: transaction.accountId,
        category: transaction.categoryId,
        amount: transaction.amount,
        date: transaction.date,
        title: transaction.title,
        type: 'expense',
      }))
    );
    expect(limitsTable.bulkPut).toHaveBeenCalledWith([
      {
        id: 'limit-1',
        accountId: 'account-1',
        categoryId: 'category-1',
        amount: 5000,
      },
    ]);
    expect(recurringItemsTable.bulkPut).toHaveBeenCalledWith([
      {
        id: 'recurring-1',
        accountId: 'account-1',
        categoryId: 'category-1',
        amount: 5000,
        frequency: 'monthly',
        startDate: '2024-03-15T10:30:00.000Z',
        name: 'Phone Bill',
        type: 'expense',
      },
    ]);
    expect(savingsGoalsTable.bulkPut).toHaveBeenCalledWith([
      {
        id: 'saving-1',
        accountId: 'account-1',
        name: 'Vacation',
        targetAmount: 100000,
        deadline: '2024-12-31T23:59:59.000Z',
        categoryId: 'category-1',
      },
    ]);
    expect(templatesTable.bulkPut).toHaveBeenCalledWith([
      {
        id: 'template-1',
        accountId: 'account-1',
        name: 'Standard Transfer',
        amount: 10000,
        categoryId: 'category-1',
        type: 'expense',
      },
    ]);
    expect(transactionsTable.get).toHaveBeenCalledTimes(5);
    expect(accountsTable.bulkGet).toHaveBeenCalledWith(['account-1']);
    expect(categoriesTable.bulkGet).toHaveBeenCalledWith(['category-1']);
    expect(transactionsTable.bulkGet).toHaveBeenCalledWith(payload.transactions.map((transaction) => transaction.id));
    expect(limitsTable.bulkGet).toHaveBeenCalledWith(['limit-1']);
    expect(recurringItemsTable.bulkGet).toHaveBeenCalledWith(['recurring-1']);
    expect(savingsGoalsTable.bulkGet).toHaveBeenCalledWith(['saving-1']);
    expect(templatesTable.bulkGet).toHaveBeenCalledWith(['template-1']);
  });

  it('does nothing for an empty payload and still runs inside a transaction', async () => {
    const emptyPayload: MigrationPayload = {
      schemaVersion: 1,
      exportedAt: '2024-03-15T10:30:00.000Z',
      platform: 'android',
      accounts: [],
      categories: [],
      transactions: [],
      limits: [],
      recurringEntries: [],
      savingGoals: [],
      templates: [],
    };

    await importToIndexedDB(db, emptyPayload, () => undefined);

    expect(transactionMock).toHaveBeenCalledTimes(1);
    expect(accountsTable.bulkPut).not.toHaveBeenCalled();
    expect(categoriesTable.bulkPut).not.toHaveBeenCalled();
    expect(transactionsTable.bulkPut).not.toHaveBeenCalled();
  });

  it('remaps duplicate category IDs per account when importing multiple accounts', async () => {
    const payload = {
      schemaVersion: 1 as const,
      exportedAt: '2024-03-15T10:30:00.000Z' as const,
      platform: 'android' as const,
      accounts: [
        {
          id: 'account-1',
          name: 'Main account',
          legacyId: 1,
          legacySource: 'room',
        },
        {
          id: 'account-2',
          name: 'Secondary account',
          legacyId: 2,
          legacySource: 'room',
        },
      ],
      categories: [
        {
          id: 'category-1',
          name: 'Groceries',
          legacyId: 10,
          legacySource: 'room',
          accountId: 'account-1',
        },
        {
          id: 'category-1',
          name: 'Groceries',
          legacyId: 11,
          legacySource: 'room',
          accountId: 'account-2',
        },
      ],
      transactions: [
        {
          id: 'tx-1',
          accountId: 'account-1',
          categoryId: 'category-1',
          amount: 100,
          date: '2024-03-15T10:30:00.000Z',
          title: 'Transaction A',
          legacyId: 1,
          legacySource: 'room',
        },
        {
          id: 'tx-2',
          accountId: 'account-2',
          categoryId: 'category-1',
          amount: 200,
          date: '2024-03-15T10:30:00.000Z',
          title: 'Transaction B',
          legacyId: 2,
          legacySource: 'room',
        },
      ],
      limits: [],
      recurringEntries: [],
      savingGoals: [],
      templates: [],
    };

    const expectedCategoryId1 = legacyIdToUuid('category', 'account-1:category-1');
    const expectedCategoryId2 = legacyIdToUuid('category', 'account-2:category-1');

    transactionsTable.get.mockImplementation(async (id: string) => payload.transactions.find((item) => item.id === id));

    await importToIndexedDB(db, payload as unknown as MigrationPayload, () => undefined);

    expect(categoriesTable.bulkPut).toHaveBeenCalledWith([
      {
        id: expectedCategoryId1,
        name: 'Groceries',
        type: 'expense',
        isDefault: false,
        accountId: 'account-1',
      },
      {
        id: expectedCategoryId2,
        name: 'Groceries',
        type: 'expense',
        isDefault: false,
        accountId: 'account-2',
      },
    ]);

    expect(transactionsTable.bulkPut).toHaveBeenCalledWith([
      {
        id: 'tx-1',
        accountId: 'account-1',
        category: expectedCategoryId1,
        amount: 100,
        date: '2024-03-15T10:30:00.000Z',
        title: 'Transaction A',
        type: 'expense',
      },
      {
        id: 'tx-2',
        accountId: 'account-2',
        category: expectedCategoryId2,
        amount: 200,
        date: '2024-03-15T10:30:00.000Z',
        title: 'Transaction B',
        type: 'expense',
      },
    ]);
  });

  it('imports a 1000-record payload in under 2 seconds using Dexie', async () => {
    const payload = makePayload(1000);
    const dbName = `migration-importer-perf-${Date.now()}`;
    const db = createTemporaryDb(dbName);
    let opened = false;

    try {
      await db.open();
      opened = true;
      const start = performance.now();
      await importToIndexedDB(db, payload, () => undefined);
      const duration = performance.now() - start;
      const maxDuration = process.env.CI ? 4000 : 2000;

      expect(duration).toBeLessThan(maxDuration);
      expect(duration).toBeGreaterThan(0);
    } finally {
      if (opened) {
        await db.delete();
      }
    }
  });

  it('skips accounts with a blank name and their associated data', async () => {
    const payload: MigrationPayload = {
      schemaVersion: 1,
      exportedAt: '2024-03-15T10:30:00.000Z',
      platform: 'android',
      accounts: [
        { id: 'real-account', name: 'Main account', legacyId: 1, legacySource: 'room' },
        { id: 'blank-account', name: '   ', legacyId: 2, legacySource: 'room' },
      ],
      categories: [
        { id: 'cat-1', name: 'Food', legacyId: 10, legacySource: 'room', accountId: 'real-account' } as MigrationCategory,
        { id: 'cat-2', name: 'Other', legacyId: 11, legacySource: 'room', accountId: 'blank-account' } as MigrationCategory,
      ],
      transactions: [
        { id: 'tx-1', accountId: 'real-account', categoryId: 'cat-1', amount: 100, date: '2024-03-15T10:30:00.000Z', title: 'Lunch', legacyId: 1, legacySource: 'room' },
        { id: 'tx-2', accountId: 'blank-account', categoryId: 'cat-2', amount: 200, date: '2024-03-15T10:30:00.000Z', title: 'Ghost', legacyId: 2, legacySource: 'room' },
      ],
      limits: [],
      recurringEntries: [],
      savingGoals: [],
      templates: [],
    };

    transactionsTable.get.mockImplementation(async (id: string) =>
      payload.transactions.find((t) => t.id === id),
    );

    await importToIndexedDB(db, payload, () => undefined);

    // Only the real account should be imported
    expect(accountsTable.bulkPut).toHaveBeenCalledWith([
      expect.objectContaining({ id: 'real-account', name: 'Main account' }),
    ]);

    // Transactions belonging to the blank-named account should not be imported
    const importedTransactions = transactionsTable.bulkPut.mock.calls[0][0] as { id: string }[];
    expect(importedTransactions.map((t) => t.id)).not.toContain('tx-2');
    expect(importedTransactions.map((t) => t.id)).toContain('tx-1');
  });

  it('throws MigrationIntegrityError when a bulkPut record is missing after import', async () => {
    const payload = makePayload(3);
    accountsTable.bulkGet.mockResolvedValue([undefined, undefined, undefined]);

    await expect(importToIndexedDB(db, payload, () => undefined)).rejects.toMatchObject({
      entityType: 'accounts',
      expected: 1,
      actual: '1 missing',
    });
  });

  it('throws MigrationIntegrityError when spot validation mismatches a transaction amount', async () => {
    const payload = makePayload(5);
    accountsTable.count.mockResolvedValue(1);
    categoriesTable.count.mockResolvedValue(1);
    transactionsTable.count.mockResolvedValue(5);
    limitsTable.count.mockResolvedValue(1);
    recurringItemsTable.count.mockResolvedValue(1);
    savingsGoalsTable.count.mockResolvedValue(1);
    templatesTable.count.mockResolvedValue(1);

    transactionsTable.get.mockImplementation(async (id: string) => {
      const stored = payload.transactions.find((item) => item.id === id);
      if (!stored) return undefined;
      return { ...stored, amount: stored.amount + 1 };
    });

    await expect(importToIndexedDB(db, payload, () => undefined)).rejects.toThrow(MigrationIntegrityError);
  });
});
