/**
 * Integration-style tests for restore-duplicate-category-remediation.
 *
 * Uses real fake-indexeddb + Dexie to exercise the full DB read/write path.
 * Covers the acceptance criteria from ticket #502: affected accounts repaired,
 * references (including savings-payment by name) reassigned, clean accounts
 * untouched, and done-flag withheld on partial failure.
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { db } from '../db/index.js';
import { changeLog } from '../changelog/change-log.js';
import { DEFAULT_CATEGORIES } from '../db/config.js';
import {
  runRestoreDuplicateCategoryRemediation,
  isRestoreDuplicateRemediationDone,
  markRestoreDuplicateRemediationDone,
} from './restore-duplicate-category-remediation.js';
import type { Category, Transaction, Limit, Template, RecurringItem, SavingsGoal } from '../types/index.js';

// ─── Preferences mock ─────────────────────────────────────────────────────────

const preferenceStore = new Map<string, string>();

vi.mock('@capacitor/preferences', () => ({
  Preferences: {
    get: vi.fn(async ({ key }: { key: string }) => ({
      value: preferenceStore.get(key) ?? null,
    })),
    set: vi.fn(async ({ key, value }: { key: string; value: string }) => {
      preferenceStore.set(key, value);
    }),
    remove: vi.fn(async ({ key }: { key: string }) => {
      preferenceStore.delete(key);
    }),
  },
}));

// ─── Helpers ──────────────────────────────────────────────────────────────────

const ACCOUNT_ID = 'test-account';

function cat(id: string, name: string, type: 'income' | 'expense', isDefault = true): Category {
  return { id, name, type, isDefault, accountId: ACCOUNT_ID };
}

async function seedCorruptedState(loserCats: Category[], keeperCats: Category[]): Promise<void> {
  await db.categories.bulkAdd([...loserCats, ...keeperCats]);
  await db.changeRecords.add({
    id: 'bulk-create-record',
    accountId: ACCOUNT_ID,
    synced: false,
    timestamp: new Date().toISOString(),
    command: {
      type: 'BULK_CREATE_CATEGORIES',
      payload: { categories: loserCats },
      timestamp: new Date().toISOString(),
      sequence: 1,
    },
  });
}

function buildDefaultPairs(): { losers: Category[]; keepers: Category[] } {
  // Build from real DEFAULT_CATEGORIES to catch issues like name collisions
  // and stay in sync if defaults change (11 income + 25 expense = 36 total).
  const losers: Category[] = DEFAULT_CATEGORIES.map((def) => ({
    ...def,
    id: `loser-${def.id}`,
    accountId: ACCOUNT_ID,
  }));
  const keepers: Category[] = DEFAULT_CATEGORIES.map((def) => ({
    ...def,
    id: `keeper-${def.id}`,
    accountId: ACCOUNT_ID,
  }));
  return { losers, keepers };
}

const getAccounts = async () => [{ id: ACCOUNT_ID }];

// ─── Setup / teardown ─────────────────────────────────────────────────────────

beforeEach(async () => {
  preferenceStore.clear();
  await db.delete();
  await db.open();
  await db.categories.clear();
  await db.accounts.clear();
  await changeLog.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('runRestoreDuplicateCategoryRemediation', () => {
  it('leaves a clean account (36 categories, no BULK_CREATE record) completely untouched', async () => {
    const { keepers } = buildDefaultPairs();
    await db.categories.bulkAdd(keepers);

    const result = await runRestoreDuplicateCategoryRemediation(getAccounts);

    expect(result.accountsRepaired).toBe(0);
    expect(result.totalLosersArchived).toBe(0);
    expect(await db.categories.count()).toBe(36);
    expect(result.fullySuccessful).toBe(true);
  });

  it('skips a local-only account where no keeper can be found for any loser', async () => {
    const localCats = buildDefaultPairs().losers;
    await db.categories.bulkAdd(localCats);
    await db.changeRecords.add({
      id: 'local-bulk-create',
      accountId: ACCOUNT_ID,
      synced: false,
      timestamp: new Date().toISOString(),
      command: {
        type: 'BULK_CREATE_CATEGORIES',
        payload: { categories: localCats },
        timestamp: new Date().toISOString(),
        sequence: 1,
      },
    });

    const result = await runRestoreDuplicateCategoryRemediation(getAccounts);

    expect(result.accountsRepaired).toBe(0);
    const archived = (await db.categories.toArray()).filter(c => c.archivedAt);
    expect(archived).toHaveLength(0);
  });

  it('skips a BULK_CREATE record that contains non-default categories', async () => {
    // Simulate a user calling bulkCreateCategories() with custom (non-default) categories.
    // The remediation should skip this record entirely — it's not the MR #501 bug.
    // To properly test the isDefault guard, create default keepers with matching (type, name),
    // then verify the non-default losers are NOT paired with them (no archiving or reassignment).
    
    // Step 1: Seed default "keeper" categories (NOT in the BULK_CREATE payload).
    // These share (type, name) with the non-default losers below.
    const defaultKeepers: Category[] = [
      cat('keeper-1', 'My Custom Category', 'income', true), // isDefault: true
      cat('keeper-2', 'Another Custom', 'expense', true),
    ];
    await db.categories.bulkAdd(defaultKeepers);

    // Step 2: Seed non-default "loser" categories (in the BULK_CREATE payload).
    const customCats: Category[] = [
      cat('custom-1', 'My Custom Category', 'income', false), // isDefault: false, same (type, name) as keeper-1
      cat('custom-2', 'Another Custom', 'expense', false),    // isDefault: false, same (type, name) as keeper-2
    ];

    await db.categories.bulkAdd(customCats);
    await db.changeRecords.add({
      id: 'user-bulk-create',
      accountId: ACCOUNT_ID,
      synced: false,
      timestamp: new Date().toISOString(),
      command: {
        type: 'BULK_CREATE_CATEGORIES',
        payload: { categories: customCats },
        timestamp: new Date().toISOString(),
        sequence: 1,
      },
    });

    const result = await runRestoreDuplicateCategoryRemediation(getAccounts);

    // The guard should detect non-default categories in the payload and skip entirely.
    expect(result.accountsRepaired).toBe(0);
    const archived = (await db.categories.toArray()).filter(c => c.archivedAt);
    expect(archived).toHaveLength(0);
    
    // Verify all 4 categories are still active (2 keepers + 2 non-default losers).
    const activeCategories = (await db.categories.toArray()).filter(c => !c.archivedAt);
    expect(activeCategories).toHaveLength(4);
  });

  it('repairs 72 → 36 categories on an affected account', async () => {
    const { losers, keepers } = buildDefaultPairs();
    await seedCorruptedState(losers, keepers);

    const result = await runRestoreDuplicateCategoryRemediation(getAccounts);

    expect(result.accountsRepaired).toBe(1);
    expect(result.totalLosersArchived).toBe(36);
    expect(result.fullySuccessful).toBe(true);

    const activeCategories = (await db.categories.toArray()).filter(c => !c.archivedAt);
    expect(activeCategories).toHaveLength(36);
    const activeIds = new Set(activeCategories.map(c => c.id));
    for (const k of keepers) {
      expect(activeIds.has(k.id)).toBe(true);
    }
    for (const l of losers) {
      expect((await db.categories.get(l.id))?.archivedAt).toBeTruthy();
    }
  });

  it('reassigns all transactions from loser to keeper, preserving totals', async () => {
    const { losers, keepers } = buildDefaultPairs();
    await seedCorruptedState(losers, keepers);

    const loser = losers[0];
    const keeper = keepers[0];

    await db.transactions.bulkAdd([
      { id: 'tx-1', type: 'income', amount: 100, category: loser.id,  date: '2026-01-01', title: 'A', accountId: ACCOUNT_ID },
      { id: 'tx-2', type: 'income', amount: 200, category: loser.id,  date: '2026-01-02', title: 'B', accountId: ACCOUNT_ID },
      { id: 'tx-3', type: 'income', amount: 50,  category: keeper.id, date: '2026-01-03', title: 'C', accountId: ACCOUNT_ID },
    ] as Transaction[]);

    await runRestoreDuplicateCategoryRemediation(getAccounts);

    const allTx = await db.transactions.toArray();
    for (const tx of allTx) expect(tx.category).toBe(keeper.id);
    expect(allTx.reduce((sum, t) => sum + t.amount, 0)).toBe(350);
  });

  it('reassigns savings-payment transactions that store category name instead of ID', async () => {
    const { losers, keepers } = buildDefaultPairs();
    await seedCorruptedState(losers, keepers);

    const loser = losers[0];
    const keeper = keepers[0];

    // Savings-payment transactions store category?.name and have type matching the category type.
    // losers[0] is an income category, so the transaction must be type: 'income'.
    await db.transactions.add({
      id: 'tx-savings',
      type: 'income',  // Must match loser.type for the name-match to succeed
      amount: 75,
      category: loser.name, // name, not id
      date: '2026-01-05',
      title: 'Savings payment',
      accountId: ACCOUNT_ID,
    } as Transaction);

    await runRestoreDuplicateCategoryRemediation(getAccounts);

    expect((await db.transactions.get('tx-savings'))?.category).toBe(keeper.id);
  });

  it('archives the loser limit when keeper already has one', async () => {
    const { losers, keepers } = buildDefaultPairs();
    await seedCorruptedState(losers, keepers);

    const loser = losers[0];
    const keeper = keepers[0];

    await db.limits.bulkAdd([
      { id: 'limit-loser',  categoryId: loser.id,  amount: 200, accountId: ACCOUNT_ID },
      { id: 'limit-keeper', categoryId: keeper.id, amount: 300, accountId: ACCOUNT_ID },
    ] as Limit[]);

    await runRestoreDuplicateCategoryRemediation(getAccounts);

    expect((await db.limits.get('limit-loser'))?.archivedAt).toBeTruthy();
    expect((await db.limits.get('limit-keeper'))?.archivedAt).toBeUndefined();
    const activeLimits = (await db.limits.toArray()).filter(l => !l.archivedAt);
    expect(activeLimits.some(l => l.categoryId === loser.id)).toBe(false);
  });

  it('reassigns the loser limit to keeper when keeper has no limit', async () => {
    const { losers, keepers } = buildDefaultPairs();
    await seedCorruptedState(losers, keepers);

    const loser = losers[0];
    const keeper = keepers[0];

    await db.limits.add({ id: 'limit-loser', categoryId: loser.id, amount: 500, accountId: ACCOUNT_ID } as Limit);

    await runRestoreDuplicateCategoryRemediation(getAccounts);

    const stored = await db.limits.get('limit-loser');
    expect(stored?.categoryId).toBe(keeper.id);
    expect(stored?.archivedAt).toBeUndefined();
  });

  it('reassigns templates, recurringItems, and savingsGoals', async () => {
    const { losers, keepers } = buildDefaultPairs();
    await seedCorruptedState(losers, keepers);

    const loser = losers[0];
    const keeper = keepers[0];

    await db.templates.add({ id: 'tmpl-1', categoryId: loser.id, name: 'T', amount: 10, type: 'expense', accountId: ACCOUNT_ID } as Template);
    await db.recurringItems.add({ id: 'rec-1', categoryId: loser.id, name: 'R', amount: 20, type: 'expense', frequency: 'monthly', accountId: ACCOUNT_ID, startDate: '2026-01-01' } as RecurringItem);
    await db.savingsGoals.add({ id: 'goal-1', categoryId: loser.id, name: 'G', targetAmount: 1000, accountId: ACCOUNT_ID, deadline: '' } as SavingsGoal);

    await runRestoreDuplicateCategoryRemediation(getAccounts);

    expect((await db.templates.get('tmpl-1'))?.categoryId).toBe(keeper.id);
    expect((await db.recurringItems.get('rec-1'))?.categoryId).toBe(keeper.id);
    expect((await db.savingsGoals.get('goal-1'))?.categoryId).toBe(keeper.id);
  });

  it('is idempotent — running again on an already-repaired account archives nothing', async () => {
    const { losers, keepers } = buildDefaultPairs();
    await seedCorruptedState(losers, keepers);

    const result1 = await runRestoreDuplicateCategoryRemediation(getAccounts);
    expect(result1.accountsRepaired).toBe(1);

    await markRestoreDuplicateRemediationDone();
    expect(await isRestoreDuplicateRemediationDone()).toBe(true);

    // Losers are now archived → filtered from activeCategories → no pairs found
    const result2 = await runRestoreDuplicateCategoryRemediation(getAccounts);
    expect(result2.totalLosersArchived).toBe(0);
    expect(result2.fullySuccessful).toBe(true);
  });

  it('skips only the user-renamed pair and repairs all other pairs', async () => {
    const { losers, keepers } = buildDefaultPairs();
    losers[0] = { ...losers[0], name: 'user_custom_name' };
    await seedCorruptedState(losers, keepers);

    const result = await runRestoreDuplicateCategoryRemediation(getAccounts);

    expect(result.totalLosersArchived).toBe(35);
    expect(result.accountsRepaired).toBe(1);
    expect(result.fullySuccessful).toBe(true);
    expect((await db.categories.get(losers[0].id))?.archivedAt).toBeUndefined();
  });

  it('returns fullySuccessful=false on DB error and does not set the done-flag', async () => {
    const { losers, keepers } = buildDefaultPairs();
    await seedCorruptedState(losers, keepers);

    vi.spyOn(db.categories, 'update').mockRejectedValueOnce(
      new Error('Simulated IndexedDB error'),
    );

    const result = await runRestoreDuplicateCategoryRemediation(getAccounts);

    expect(result.fullySuccessful).toBe(false);
    expect(result.accountResults[0].pairsFailed).toBeGreaterThan(0);
    expect(await isRestoreDuplicateRemediationDone()).toBe(false);
  });

  it('continues to scan other accounts when one account throws an exception', async () => {
    // Create two accounts: one that will throw, one that will succeed.
    const account1 = 'account-1';
    const account2 = 'account-2';

    // Seed account2 with the duplicate bug
    const { losers, keepers } = buildDefaultPairs();
    // Change accountId to account2 for these categories
    const account2Losers = losers.map(c => ({ ...c, accountId: account2 }));
    const account2Keepers = keepers.map(c => ({ ...c, accountId: account2 }));

    await db.categories.bulkAdd([...account2Losers, ...account2Keepers]);
    await db.changeRecords.add({
      id: 'bulk-create-account2',
      accountId: account2,
      synced: false,
      timestamp: new Date().toISOString(),
      command: {
        type: 'BULK_CREATE_CATEGORIES',
        payload: { categories: account2Losers },
        timestamp: new Date().toISOString(),
        sequence: 1,
      },
    });

    // Save the original implementation
    const originalGetByAccountId = changeLog.getByAccountId.bind(changeLog);

    // Mock getByAccountId to throw for account1 but succeed for account2
    vi.spyOn(changeLog, 'getByAccountId').mockImplementation(async (accountId: string) => {
      if (accountId === account1) {
        throw new Error('Simulated changeLog.getByAccountId error');
      }
      // Call the original implementation for account2
      return originalGetByAccountId(accountId);
    });

    const result = await runRestoreDuplicateCategoryRemediation(
      async () => [{ id: account1 }, { id: account2 }],
    );

    // Both accounts should be scanned
    expect(result.accountsScanned).toBe(2);
    expect(result.accountResults).toHaveLength(2);

    // account1 should have failed
    const account1Result = result.accountResults.find(r => r.accountId === account1);
    expect(account1Result?.pairsFailed).toBe(1);
    expect(account1Result?.repaired).toBe(false);

    // account2 should have succeeded
    const account2Result = result.accountResults.find(r => r.accountId === account2);
    expect(account2Result?.repaired).toBe(true);
    expect(account2Result?.losersArchived).toBe(36);

    // Overall result should be partial failure
    expect(result.fullySuccessful).toBe(false);
    expect(result.accountsRepaired).toBe(1);
  });

  it('does not reassign a same-named expense transaction when processing an income loser', async () => {
    // Regression test for the unscoped name-match bug.
    // 'category_general' exists as both income-general and expense-general.
    // A savings-payment transaction stores the bare name 'category_general' as
    // its category field but has type 'income'. When the income loser (also named
    // 'category_general') is processed, the expense transaction must NOT be touched.
    const incomeLoser  = cat('loser-income-gen',  'category_general', 'income');
    const incomeKeeper = cat('keeper-income-gen', 'category_general', 'income');
    const expenseLoser  = cat('loser-expense-gen',  'category_general', 'expense');
    const expenseKeeper = cat('keeper-expense-gen', 'category_general', 'expense');

    await seedCorruptedState(
      [incomeLoser, expenseLoser],
      [incomeKeeper, expenseKeeper],
    );

    // Income transaction stored by name (savings-payment pattern).
    await db.transactions.add({
      id: 'tx-income-name',
      type: 'income',
      amount: 100,
      category: 'category_general',
      date: '2026-01-01',
      title: 'Goal completion',
      accountId: ACCOUNT_ID,
    } as Transaction);

    // Expense transaction also stored by name — must NOT be remapped to the income keeper.
    await db.transactions.add({
      id: 'tx-expense-name',
      type: 'expense',
      amount: 50,
      category: 'category_general',
      date: '2026-01-02',
      title: 'Expense',
      accountId: ACCOUNT_ID,
    } as Transaction);

    await runRestoreDuplicateCategoryRemediation(getAccounts);

    const incomeTx  = await db.transactions.get('tx-income-name');
    const expenseTx = await db.transactions.get('tx-expense-name');

    // Income tx → income keeper (same type)
    expect(incomeTx?.category).toBe(incomeKeeper.id);
    // Expense tx → expense keeper (same type), NOT income keeper
    expect(expenseTx?.category).toBe(expenseKeeper.id);
    expect(expenseTx?.category).not.toBe(incomeKeeper.id);
  });

  it('does not emit any DELETE commands to the changelog', async () => {
    const { losers, keepers } = buildDefaultPairs();
    await seedCorruptedState(losers, keepers);

    await runRestoreDuplicateCategoryRemediation(getAccounts);

    const records = await changeLog.getByAccountId(ACCOUNT_ID);
    expect(records.filter(r => r.command.type === 'DELETE_CATEGORY')).toHaveLength(0);
  });
});
