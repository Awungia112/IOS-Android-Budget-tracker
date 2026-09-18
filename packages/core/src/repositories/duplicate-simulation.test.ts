/**
 * S4 — Database-level duplication simulation (ticket #469)
 *
 * Deliberately inserts duplicate transaction rows into a real
 * BudgetWiseDB (fake-indexeddb) and verifies the front-end behavior
 * that affected users report: every transaction visible twice, income,
 * expense and balance sums doubled, and duplicates independently
 * deletable without touching the originals.
 *
 * This mirrors the computation in `packages/app/src/pages/Index.tsx`
 * (totalIncome / totalExpense / balance + filterExecutedTransactions).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import 'fake-indexeddb/auto';
import { db } from '../db/database.js';
import type { Account, Transaction, Category } from '../types/index.js';
import { filterExecutedTransactions } from '../services/pending-transaction.service.js';

// Suppress Dexie lifecycle console.log messages during tests
vi.spyOn(console, 'log').mockImplementation(() => {});

const ACCOUNT_ID = 'account-migrated-1';
const CATEGORY_ID = 'migrated-cat-food';

function makeAccount(): Account {
  return { id: ACCOUNT_ID, name: 'Migrated Account', initials: 'MA' };
}

function makeCategory(): Category {
  return {
    id: CATEGORY_ID,
    accountId: ACCOUNT_ID,
    name: 'category_food',
    type: 'expense',
    color: '#E33B80',
    isDefault: false,
  };
}

function makeTransaction(overrides: Partial<Transaction>): Transaction {
  return {
    id: '',
    type: 'expense',
    amount: 12.34,
    category: CATEGORY_ID,
    date: '2026-08-10T00:00:00.000Z',
    title: 'Groceries',
    accountId: ACCOUNT_ID,
    createdAt: '2026-08-10T00:00:00.000Z',
    ...overrides,
  };
}

describe('S4 duplicate-transaction simulation', () => {
  beforeEach(async () => {
    await db.delete();
    await db.open();
    await db.accounts.add(makeAccount());
    await db.categories.add(makeCategory());
  });

  afterEach(async () => {
    await db.close();
  });

  it('duplicated rows within one account double the balance', async () => {
    // One real transaction ...
    await db.transactions.add(
      makeTransaction({ id: 'tx-original', date: '2026-08-10T00:00:00.000Z' }),
    );
    // ... plus the duplicate artifact created by the re-run import (different id, same content)
    await db.transactions.add(
      makeTransaction({ id: 'tx-duplicate', date: '2026-08-10T00:00:00.000Z' }),
    );

    const rows = await db.transactions.where('accountId').equals(ACCOUNT_ID).toArray();
    expect(rows).toHaveLength(2);

    // The exact computation Index.tsx uses for the overview cards
    const executed = filterExecutedTransactions(rows, new Date('2026-08-14T00:00:00.000Z'));
    const expense = executed.filter((t) => t.type === 'expense').reduce((s, t) => s + t.amount, 0);
    const income = executed.filter((t) => t.type === 'income').reduce((s, t) => s + t.amount, 0);
    const balance = income - expense;

    expect(expense).toBe(24.68); // doubled
    expect(balance).toBe(-24.68);

    // Duplicate is independently deletable, original remains
    await db.transactions.delete('tx-duplicate');
    const remaining = await db.transactions.where('accountId').equals(ACCOUNT_ID).toArray();
    expect(remaining).toHaveLength(1);
    expect(remaining[0].id).toBe('tx-original');
  });

  it('a second duplicate account doubles every balance shown', async () => {
    // Two full accounts with identical content — the 461/463 second-import artifact
    const dupAccountId = 'account-migrated-2';
    await db.accounts.add({ id: dupAccountId, name: 'Migrated Account', initials: 'MA' });

    for (const accountId of [ACCOUNT_ID, dupAccountId]) {
      await db.transactions.add(
        makeTransaction({ id: `${accountId}-income`, type: 'income', amount: 100, accountId }),
      );
      await db.transactions.add(
        makeTransaction({ id: `${accountId}-expense`, type: 'expense', amount: 30, accountId }),
      );
    }

    const all = await db.transactions.toArray();
    expect(all).toHaveLength(4);

    const income = all.filter((t) => t.type === 'income').reduce((s, t) => s + t.amount, 0);
    const expense = all.filter((t) => t.type === 'expense').reduce((s, t) => s + t.amount, 0);
    const balance = income - expense;

    // The user sees 4 rows where there should be 2, and a doubled balance
    expect(income).toBe(200);
    expect(expense).toBe(60);
    expect(balance).toBe(140);
  });
});
