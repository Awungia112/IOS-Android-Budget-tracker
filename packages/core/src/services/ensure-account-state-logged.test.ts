// @vitest-environment node
//
// The install-time account row and its categories are written straight into
// IndexedDB by the Dexie `populate` hook, `resetDatabase()`,
// `initializeDefaultData()` and the v3 upgrade — none of which log a command.
// Nothing published them afterwards, so an account that went online carried no
// CREATE_ACCOUNT and no BULK_CREATE_CATEGORIES: a member of the shared account
// received no categories, replayed rows referenced ids the server never saw,
// and a restore fell back to `Account (…)` for the name.
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach } from 'vitest';
import { BudgetService } from './budget.service.js';
import { db } from '../db/database.js';
import { DEFAULT_CATEGORIES, DEFAULT_ACCOUNT } from '../db/config.js';
import { COMMAND_TYPES } from '../commands/types.js';
import type { Account, Category } from '../types/index.js';

async function recordsFor(accountId: string) {
  const records = await db.changeRecords.toArray();
  return records.filter((r) => r.accountId === accountId);
}

function published(records: Awaited<ReturnType<typeof recordsFor>>) {
  return records
    .filter((r) => r.command.type === COMMAND_TYPES.BULK_CREATE_CATEGORIES)
    .flatMap((r) => (r.command.payload as { categories: Category[] }).categories);
}

/** Reproduce what the Dexie populate hook writes on a fresh install. */
async function seedInstallDefaults(accountId = DEFAULT_ACCOUNT.id) {
  await db.accounts.put({ ...DEFAULT_ACCOUNT, id: accountId } as Account);
  await db.categories.bulkPut(
    DEFAULT_CATEGORIES.map((category) => ({ ...category, accountId })),
  );
}

describe('ensureAccountStateLogged', () => {
  beforeEach(async () => {
    await db.open();
    await Promise.all(db.tables.map((table) => table.clear()));
  });

  it('logs the account and its install categories, which never entered the changelog', async () => {
    const service = new BudgetService();
    await seedInstallDefaults();

    expect(await recordsFor(DEFAULT_ACCOUNT.id)).toHaveLength(0);

    const result = await service.ensureAccountStateLogged(DEFAULT_ACCOUNT.id);

    expect(result).toEqual({
      accountLogged: true,
      categoriesLogged: DEFAULT_CATEGORIES.length,
    });

    const records = await recordsFor(DEFAULT_ACCOUNT.id);
    const created = records.find((r) => r.command.type === COMMAND_TYPES.CREATE_ACCOUNT);
    expect((created?.command.payload as Account).name).toBe('Personal');
    expect(published(records)).toHaveLength(DEFAULT_CATEGORIES.length);
  });

  it('publishes no stable default id, so another device cannot have its own row stolen', async () => {
    const service = new BudgetService();
    await seedInstallDefaults();

    await service.ensureAccountStateLogged(DEFAULT_ACCOUNT.id);

    const stable = new Set(DEFAULT_CATEGORIES.map((c) => c.id));
    const ids = published(await recordsFor(DEFAULT_ACCOUNT.id)).map((c) => c.id);
    expect(ids).toHaveLength(DEFAULT_CATEGORIES.length);
    expect(ids.filter((id) => stable.has(id))).toEqual([]);
    expect(new Set(ids).size).toBe(ids.length);

    // The local rows carry the same fresh ids — nothing is left behind under
    // the stable id and nothing is duplicated.
    const local = await service.getCategoriesByAccountId(DEFAULT_ACCOUNT.id);
    expect(local.map((c) => c.id).sort()).toEqual(ids.sort());
  });

  it('re-points local rows and not-yet-uploaded records at the rekeyed ids', async () => {
    const service = new BudgetService();
    await seedInstallDefaults();

    // Recorded before the account went online, against the stable install id.
    const transaction = await service.createTransaction(
      {
        type: 'expense',
        amount: 12.5,
        category: 'expense-books',
        date: '2026-01-05',
        title: 'Buch',
      },
      DEFAULT_ACCOUNT.id,
    );
    await service.createLimit(
      { categoryId: 'expense-food', amount: 200, period: 'monthly' } as never,
      DEFAULT_ACCOUNT.id,
    );

    await service.ensureAccountStateLogged(DEFAULT_ACCOUNT.id);

    const categories = await service.getCategoriesByAccountId(DEFAULT_ACCOUNT.id);
    const books = categories.find(
      (c) => c.type === 'expense' && c.name === 'category_books',
    )!;
    const food = categories.find(
      (c) => c.type === 'expense' && c.name === 'category_food',
    )!;

    const stored = await db.transactions.get(transaction.id);
    expect(stored?.category).toBe(books.id);
    const limits = await db.limits.where('accountId').equals(DEFAULT_ACCOUNT.id).toArray();
    expect(limits[0]?.categoryId).toBe(food.id);

    // The records queued for upload must carry the same ids, or every other
    // device replays a reference it cannot resolve.
    const records = await recordsFor(DEFAULT_ACCOUNT.id);
    const txRecord = records.find((r) => r.command.type === COMMAND_TYPES.CREATE_TRANSACTION);
    expect((txRecord?.command.payload as { category: string }).category).toBe(books.id);
    const limitRecord = records.find((r) => r.command.type === COMMAND_TYPES.CREATE_LIMIT);
    expect((limitRecord?.command.payload as { categoryId: string }).categoryId).toBe(food.id);
  });

  it('is idempotent — a second call publishes nothing', async () => {
    const service = new BudgetService();
    await seedInstallDefaults();

    await service.ensureAccountStateLogged(DEFAULT_ACCOUNT.id);
    const after = await service.ensureAccountStateLogged(DEFAULT_ACCOUNT.id);

    expect(after).toEqual({ accountLogged: false, categoriesLogged: 0 });
    const records = await recordsFor(DEFAULT_ACCOUNT.id);
    expect(
      records.filter((r) => r.command.type === COMMAND_TYPES.CREATE_ACCOUNT),
    ).toHaveLength(1);
    expect(
      records.filter((r) => r.command.type === COMMAND_TYPES.BULK_CREATE_CATEGORIES),
    ).toHaveLength(1);
    expect(await service.getCategoriesByAccountId(DEFAULT_ACCOUNT.id)).toHaveLength(
      DEFAULT_CATEGORIES.length,
    );
  });

  it('adds nothing for an account created through createAccount()', async () => {
    const service = new BudgetService();
    const account = await service.createAccount({ name: 'Haushalt', initials: 'H' });

    const before = (await recordsFor(account.id)).length;
    const result = await service.ensureAccountStateLogged(account.id);

    expect(result).toEqual({ accountLogged: false, categoriesLogged: 0 });
    expect(await recordsFor(account.id)).toHaveLength(before);
  });

  it('publishes a v3-upgraded category under the uuid it already has', async () => {
    // The v3 upgrade mints uuids, which cannot collide across devices, so they
    // must survive untouched — rekeying them would orphan references held by
    // records this device has already pushed.
    const service = new BudgetService();
    await db.accounts.put({ ...DEFAULT_ACCOUNT } as Account);
    await db.categories.put({
      id: 'v3-generated-uuid',
      name: 'category_sports',
      type: 'expense',
      isDefault: true,
      accountId: DEFAULT_ACCOUNT.id,
    });

    await service.ensureAccountStateLogged(DEFAULT_ACCOUNT.id);

    expect(published(await recordsFor(DEFAULT_ACCOUNT.id)).map((c) => c.id)).toEqual([
      'v3-generated-uuid',
    ]);
  });

  it('leaves an already-published custom category out of the new record', async () => {
    const service = new BudgetService();
    await seedInstallDefaults();
    const custom = await service.createCategory(
      { name: 'Fahrrad', type: 'expense' },
      DEFAULT_ACCOUNT.id,
    );

    const result = await service.ensureAccountStateLogged(DEFAULT_ACCOUNT.id);

    expect(result.categoriesLogged).toBe(DEFAULT_CATEGORIES.length);
    const ids = published(await recordsFor(DEFAULT_ACCOUNT.id)).map((c) => c.id);
    expect(ids).not.toContain(custom.id);
  });

  it('leaves an account with no local rows alone', async () => {
    const service = new BudgetService();
    const result = await service.ensureAccountStateLogged('does-not-exist');
    expect(result).toEqual({ accountLogged: false, categoriesLogged: 0 });
  });
});
