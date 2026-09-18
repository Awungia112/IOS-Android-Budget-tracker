// @vitest-environment node
//
// Regression tests for the doubled-categories bug: restoreOnlineAccounts()
// (BudgetContext.tsx) used to recreate a local account with
// skipCategories = false, seeding a full set of DEFAULT_CATEGORIES under fresh
// UUIDs. The account's original BULK_CREATE_CATEGORIES record then arrived via
// sync carrying the *first* device's UUIDs and was applied with bulkUpsert(),
// which is keyed by id — so nothing deduped and every default category ended up
// in the table twice.
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach } from 'vitest';
import { BudgetService } from './budget.service.js';
import { db } from '../db/database.js';
import { DEFAULT_CATEGORIES } from '../db/config.js';
import { COMMAND_TYPES } from '../commands/types.js';

/** The categories as the server holds them: minted by the device that first
 *  created the account, i.e. different UUIDs from anything seeded locally. */
function serverSideCategories(localAccountId: string) {
  return DEFAULT_CATEGORIES.map((category, i) => ({
    ...category,
    id: `owner-device-uuid-${i}`,
    accountId: localAccountId,
  }));
}

async function bulkCreateCategoryRecords(accountId: string) {
  const records = await db.changeRecords.toArray();
  return records.filter(
    (r) =>
      r.accountId === accountId &&
      r.command.type === COMMAND_TYPES.BULK_CREATE_CATEGORIES,
  );
}

describe('restore path default categories', () => {
  beforeEach(async () => {
    await db.open();
  });

  it('does not double the defaults when the synced set is applied', async () => {
    const service = new BudgetService();

    // What restoreOnlineAccounts() now does: create the placeholder account
    // without seeding categories.
    const restored = await service.createAccount(
      { name: 'Account (a1b2c3d4)', initials: 'ON' },
      true,
    );
    expect(await service.getCategoriesByAccountId(restored.id)).toHaveLength(0);

    // The sync engine pulls the account's original BULK_CREATE_CATEGORIES.
    await service.executeCommand({
      type: COMMAND_TYPES.BULK_CREATE_CATEGORIES,
      timestamp: new Date().toISOString(),
      payload: { categories: serverSideCategories(restored.id) },
    });

    const categories = await service.getCategoriesByAccountId(restored.id);
    expect(categories).toHaveLength(DEFAULT_CATEGORIES.length);

    const names = categories.map((c) => `${c.type}|${c.name}`);
    expect(new Set(names).size).toBe(names.length);
  });

  it('seedDefaultCategories seeds an account the server sent nothing for', async () => {
    const service = new BudgetService();
    const restored = await service.createAccount(
      { name: 'Account (e5f6a7b8)', initials: 'ON' },
      true,
    );

    const seeded = await service.seedDefaultCategories(restored.id);

    expect(seeded).toBe(true);
    expect(await service.getCategoriesByAccountId(restored.id)).toHaveLength(
      DEFAULT_CATEGORIES.length,
    );
  });

  it('repairs a partial set: server sent a custom category but no defaults', async () => {
    // The account the app itself creates at install seeds its categories via
    // the Dexie populate, so they never enter the changelog and never reach the
    // server. Restoring such an account used to leave it with nothing but the
    // one custom category the server did know about.
    const service = new BudgetService();
    const restored = await service.createAccount(
      { name: 'Account (partial1)', initials: 'ON' },
      true,
    );

    await service.executeCommand({
      type: COMMAND_TYPES.CREATE_CATEGORY,
      timestamp: new Date().toISOString(),
      payload: {
        id: 'server-custom-1',
        name: 'My Custom Category',
        type: 'expense',
        isDefault: false,
        accountId: restored.id,
      },
    });
    expect(await service.getCategoriesByAccountId(restored.id)).toHaveLength(1);

    const seeded = await service.seedDefaultCategories(restored.id);

    expect(seeded).toBe(true);
    const categories = await service.getCategoriesByAccountId(restored.id);
    expect(categories).toHaveLength(DEFAULT_CATEGORIES.length + 1);
    // The custom one is untouched, and nothing is duplicated.
    expect(categories.filter((c) => c.id === 'server-custom-1')).toHaveLength(1);
    const names = categories.map((c) => `${c.type}|${c.name}`);
    expect(new Set(names).size).toBe(names.length);
  });

  it('leaves a hidden default alone instead of resurrecting it', async () => {
    // Hiding sets `hidden`, and getByAccountId still returns hidden rows, so a
    // hidden default counts as present. Re-creating it would both un-hide the
    // category and duplicate it.
    const service = new BudgetService();
    const restored = await service.createAccount(
      { name: 'Account (hidden1)', initials: 'ON' },
      false,
    );
    const all = await service.getCategoriesByAccountId(restored.id);
    await service.updateCategory(all[0].id, { hidden: true }, restored.id);

    const seeded = await service.seedDefaultCategories(restored.id);

    expect(seeded).toBe(false);
    const after = await service.getCategoriesByAccountId(restored.id);
    expect(after).toHaveLength(DEFAULT_CATEGORIES.length);
    expect(after.filter((c) => c.hidden)).toHaveLength(1);
  });

  it('seedDefaultCategories is a no-op once the synced set has arrived', async () => {
    const service = new BudgetService();
    const restored = await service.createAccount(
      { name: 'Account (c9d0e1f2)', initials: 'ON' },
      true,
    );

    await service.executeCommand({
      type: COMMAND_TYPES.BULK_CREATE_CATEGORIES,
      timestamp: new Date().toISOString(),
      payload: { categories: serverSideCategories(restored.id) },
    });

    const seeded = await service.seedDefaultCategories(restored.id);

    expect(seeded).toBe(false);
    expect(await service.getCategoriesByAccountId(restored.id)).toHaveLength(
      DEFAULT_CATEGORIES.length,
    );
  });

  it('re-points rows left on a stale default category id', async () => {
    // The install-time populate writes DEFAULT_CATEGORIES under stable ids, so
    // anything recorded on the default account before it went online points at
    // e.g. 'expense-books'. Those category rows never reach the server, so a
    // restore replays the transaction but recreates the category under a fresh
    // uuid — leaving the transaction with no resolvable category.
    const service = new BudgetService();
    const restored = await service.createAccount(
      { name: 'Account (stale1)', initials: 'ON' },
      true,
    );

    // Replayed from the server, still carrying the origin device's stable id.
    await db.transactions.put({
      id: 'tx-stale-1',
      accountId: restored.id,
      category: 'expense-books',
      amount: 12,
      type: 'expense',
      date: '2026-01-01',
    } as never);
    await db.limits.put({
      id: 'limit-stale-1',
      accountId: restored.id,
      categoryId: 'income-gift',
      amount: 50,
    } as never);

    await service.seedDefaultCategories(restored.id);
    const repaired = await service.repairDefaultCategoryReferences(restored.id);

    expect(repaired).toBe(2);

    const categories = await service.getCategoriesByAccountId(restored.id);
    const tx = await db.transactions.get('tx-stale-1');
    const limit = await db.limits.get('limit-stale-1');
    // Matched on (type, name): category_gift exists as both an income and an
    // expense default, so name alone is ambiguous.
    const books = categories.find(
      (c) => c.name === 'category_books' && c.type === 'expense',
    );
    const gift = categories.find(
      (c) => c.name === 'category_gift' && c.type === 'income',
    );

    expect(tx!.category).toBe(books!.id);
    expect(limit!.categoryId).toBe(gift!.id);
    // Every reference now resolves inside this account.
    expect(categories.some((c) => c.id === tx!.category)).toBe(true);
  });

  it('leaves rows alone when their category already resolves', async () => {
    const service = new BudgetService();
    const restored = await service.createAccount(
      { name: 'Account (stale2)', initials: 'ON' },
      false,
    );
    const categories = await service.getCategoriesByAccountId(restored.id);
    const target = categories[0];

    await db.transactions.put({
      id: 'tx-ok-1',
      accountId: restored.id,
      category: target.id,
      amount: 5,
      type: target.type,
      date: '2026-01-01',
    } as never);

    const repaired = await service.repairDefaultCategoryReferences(restored.id);

    expect(repaired).toBe(0);
    expect((await db.transactions.get('tx-ok-1'))!.category).toBe(target.id);
  });

  it('logs BULK_CREATE_CATEGORIES only when asked to', async () => {
    const service = new BudgetService();
    const silent = await service.createAccount(
      { name: 'Account (11111111)', initials: 'ON' },
      true,
    );
    const logged = await service.createAccount(
      { name: 'Account (22222222)', initials: 'ON' },
      true,
    );

    await service.seedDefaultCategories(silent.id);
    await service.seedDefaultCategories(logged.id, { logCommand: true });

    // Local-only set: nothing for the sync engine to push, which is why it
    // must never be used for an account whose server state is unknown.
    expect(await bulkCreateCategoryRecords(silent.id)).toHaveLength(0);

    const records = await bulkCreateCategoryRecords(logged.id);
    expect(records).toHaveLength(1);
    const payload = records[0].command.payload as { categories: unknown[] };
    expect(payload.categories).toHaveLength(DEFAULT_CATEGORIES.length);
  });

  it('seeds exactly one set when two callers race', async () => {
    // The restore pull and the post-sync guard in BudgetContext can both
    // decide an account is empty at the same time.
    const service = new BudgetService();
    const restored = await service.createAccount(
      { name: 'Account (33333333)', initials: 'ON' },
      true,
    );

    const results = await Promise.all([
      service.seedDefaultCategories(restored.id),
      service.seedDefaultCategories(restored.id),
    ]);

    expect(results.filter(Boolean)).toHaveLength(1);
    expect(await service.getCategoriesByAccountId(restored.id)).toHaveLength(
      DEFAULT_CATEGORIES.length,
    );
  });
});
