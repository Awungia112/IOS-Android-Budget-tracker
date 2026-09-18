/**
 * S2 / S3 simulation tests (ticket #469)
 *
 * S2 — Room vs legacy-SQLite-v1 ID divergence:
 *   The two Android readers derive *different* UUIDs for the same
 *   real-world row (Room: `legacyIdToUuid('balance'|'category', id)`;
 *   SQLite v1: `legacyIdToUuid('expense_tx'|'income_tx', _id)` and
 *   `resolveCategory()`). When a second migration run reads via a different
 *   source than the first, `importEntity()`'s ID-based dedup (scoped to a
 *   single account) finds no collision and imports everything again —
 *   a second, complete duplicate account. This is the "categories listed
 *   twice" / "all transactions doubled" user report (#461 part 2, #463).
 *
 * S3 — Duplicate category names + unknown-category Date.now() IDs:
 *   Empirically, `importData()` dedupes categories by *name + type* within
 *   an account, so duplicate category names in a single account collapse to
 *   one row. The "categories listed twice" symptom therefore comes from the
 *   S2 two-account artifact (each account carries its own copy of the same
 *   category set), not from a name-dedup failure. Separately, the unknown-
 *   category fallback seeds IDs with `Date.now()` (#464) — deterministic at
 *   reader level only if the fallback name/type also match on every run;
 *   when it differs, an extra duplicate row persists.
 */
import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '../../db/database.js';
import { BudgetService } from '../../services/budget.service.js';
import { importLocalMigrationPayload } from '../local/local-payload-importer.js';
import { legacyIdToUuid } from '../legacy-id.js';
import type { MigrationPayload } from '../local/local-legacy-types.js';

vi.spyOn(console, 'log').mockImplementation(() => {});

const SQLITE_ACCOUNT = legacyIdToUuid('account', 0);
const ROOM_ACCOUNT = legacyIdToUuid('account', 1);
const CATEGORY_ID = legacyIdToUuid('category', 10);

function sqliteV1Payload(): MigrationPayload {
  return {
    schemaVersion: 1,
    exportedAt: '2026-08-10T10:00:00.000Z',
    platform: 'android',
    accounts: [{
      id: SQLITE_ACCOUNT,
      name: 'Main Account (Imported)',
      initials: 'MA',
      legacyId: 0,
      legacySource: 'sqlite_v1',
    }],
    categories: [{
      id: CATEGORY_ID,
      name: 'category_food',
      type: 'expense',
      icon: 'lucide:food',
      isDefault: true,
      legacyId: 10,
      legacySource: 'sqlite_v1',
    }],
    transactions: [{
      id: legacyIdToUuid('expense_tx', 20),
      accountId: SQLITE_ACCOUNT,
      categoryId: CATEGORY_ID,
      amount: 12.34,
      date: '2026-08-10T10:10:00.000Z',
      title: 'Lunch',
      type: 'expense',
      legacyId: 20,
      legacySource: 'sqlite_v1',
    }],
    limits: [],
    recurringEntries: [],
    savingGoals: [],
    templates: [],
  };
}

function roomPayload(): MigrationPayload {
  return {
    schemaVersion: 1,
    exportedAt: '2026-08-10T10:00:00.000Z',
    platform: 'android',
    accounts: [{
      id: ROOM_ACCOUNT,
      name: 'Main Account',
      initials: 'MA',
      legacyId: 1,
      legacySource: 'room',
    }],
    categories: [{
      id: CATEGORY_ID,
      name: 'category_food',
      type: 'expense',
      icon: 'lucide:food',
      isDefault: true,
      legacyId: 10,
      legacySource: 'room',
    }],
    transactions: [{
      id: legacyIdToUuid('balance', 20),
      accountId: ROOM_ACCOUNT,
      categoryId: CATEGORY_ID,
      amount: 12.34,
      date: '2026-08-10T10:10:00.000Z',
      title: 'Lunch',
      type: 'expense',
      legacyId: 20,
      legacySource: 'room',
    }],
    limits: [],
    recurringEntries: [],
    savingGoals: [],
    templates: [],
  };
}

describe('S2 / S3 duplicate simulation (ticket #469)', () => {
  beforeEach(async () => {
    await db.delete();
    await db.open();
  });

  afterEach(async () => {
    await db.close();
  });

  it('S2: Room and SQLite-v1 readers yield two distinct accounts for the same logical row', async () => {
    const service = new BudgetService();
    await importLocalMigrationPayload(roomPayload(), service);
    await importLocalMigrationPayload(sqliteV1Payload(), service);

    const accounts = await db.accounts.toArray();
    const transactions = await db.transactions.toArray();

    // `main-account` is seeded by the DB populate hook on fresh open.
    expect(accounts.map((a) => a.id)).toEqual(
      expect.arrayContaining([ROOM_ACCOUNT, SQLITE_ACCOUNT]),
    );

    // The same Lunch transaction exists once per account, under different IDs.
    const lunchRows = transactions.filter((t) => t.title === 'Lunch');
    expect(lunchRows).toHaveLength(2);
    expect(lunchRows.map((t) => t.accountId)).toEqual(
      expect.arrayContaining([ROOM_ACCOUNT, SQLITE_ACCOUNT]),
    );
    expect(new Set(lunchRows.map((t) => t.id)).size).toBe(2);
  });

  it('S2: identical payload imported twice is a clean no-op (dedup works when source does not change)', async () => {
    const service = new BudgetService();
    const first = sqliteV1Payload();
    const second = sqliteV1Payload();
    await importLocalMigrationPayload(first, service);
    await importLocalMigrationPayload(second, service);

    const transactions = await db.transactions.where('accountId').equals(SQLITE_ACCOUNT).toArray();
    expect(transactions).toHaveLength(1);

    // Re-running the same logical payload must not multiply categories either.
    const cats = await db.categories.where('accountId').equals(SQLITE_ACCOUNT).toArray();
    const food = cats.filter((c) => c.name === 'category_food');
    expect(food).toHaveLength(1);
  });

  it('S2: two distinct runs with different sources duplicate the *same* account content', async () => {
    const service = new BudgetService();
    // First run reads SQLite v1 (fallback path)...
    await importLocalMigrationPayload(sqliteV1Payload(), service);
    // ...second run reads Room (primary path) — the 461/463 re-trigger artifact
    await importLocalMigrationPayload(roomPayload(), service);

    const transactions = await db.transactions.toArray();
    const balanceSum = transactions.reduce((s, t) => s + t.amount, 0);

    // User-visible artifact: the same 12.34 expense now counts twice.
    expect(balanceSum).toBeCloseTo(24.68);
  });

  it('S3: duplicate category names in one source payload collapse to one row (name+type dedup is robust)', async () => {
    const service = new BudgetService();
    const accountId = 'account-s3';
    const payloadSrc: MigrationPayload = {
      schemaVersion: 1,
      exportedAt: '2026-08-10T10:00:00.000Z',
      platform: 'android',
      accounts: [{ id: accountId, name: 'S3 Account', initials: 'S3', legacyId: 1, legacySource: 'room' }],
      categories: [
        { id: 'cat-food-1', name: 'category_food', type: 'expense', icon: 'lucide:food', isDefault: false, legacyId: 11, legacySource: 'room' },
        { id: 'cat-food-2', name: 'category_food', type: 'expense', icon: 'lucide:food', isDefault: false, legacyId: 12, legacySource: 'room' },
      ],
      transactions: [
        { id: 'tx-1', accountId, categoryId: 'cat-food-1', amount: 12.34, date: '2026-08-10T10:10:00.000Z', title: 'Lunch', type: 'expense', legacyId: 20, legacySource: 'room' },
        { id: 'tx-2', accountId, categoryId: 'cat-food-2', amount: 5, date: '2026-08-10T10:11:00.000Z', title: 'Snack', type: 'expense', legacyId: 21, legacySource: 'room' },
      ],
      limits: [],
      recurringEntries: [],
      savingGoals: [],
      templates: [],
    };

    await importLocalMigrationPayload(payloadSrc, service);

    const foods = (await db.categories.where('accountId').equals(accountId).toArray())
      .filter((c) => c.name === 'category_food' && c.type === 'expense' && !c.isDefault);
    expect(foods).toHaveLength(1);

    // Both transactions resolve to the single consolidated category.
    const txs = await db.transactions.where('accountId').equals(accountId).toArray();
    expect(new Set(txs.map((t) => t.category)).size).toBe(1);
  });

  it('S3: Date.now() unknown-category IDs diverge at reader level (ties to #464)', () => {
    // Two launches of the reader resolve the same unresolved legacy category
    // to different UUIDs because the ID is seeded with Date.now().
    const run1 = legacyIdToUuid('category', `unknown_${5}_${1_754_800_000_000}`);
    const run2 = legacyIdToUuid('category', `unknown_${5}_${1_754_800_001_000}`);
    expect(run1).not.toBe(run2);
  });

  it('#470: concurrent accounts with colliding legacy PKs stay idempotent across runs', async () => {
    // Two accounts whose legacy DBs both assign PK 10/20/... (the #470
    // collision). IDs are scoped by account (as the fixed android-reader now
    // emits them), so a second migration run must produce no duplicates.
    const accountOne = legacyIdToUuid('account', 1);
    const accountTwo = legacyIdToUuid('account', 2);
    const catOne = legacyIdToUuid('category', `${accountOne}:10`);
    const catTwo = legacyIdToUuid('category', `${accountTwo}:10`);

    const multiAccountPayload = (): MigrationPayload => ({
      schemaVersion: 1,
      exportedAt: '2026-08-10T10:00:00.000Z',
      platform: 'android',
      accounts: [
        { id: accountOne, name: 'Account One', initials: 'A1', legacyId: 1, legacySource: 'room' },
        { id: accountTwo, name: 'Account Two', initials: 'A2', legacyId: 2, legacySource: 'room' },
      ],
      categories: [
        { id: catOne, name: 'Custom A', type: 'expense', icon: 'lucide:food', isDefault: false, legacyId: 10, legacySource: 'room' },
        { id: catTwo, name: 'Custom B', type: 'expense', icon: 'lucide:food', isDefault: false, legacyId: 10, legacySource: 'room' },
      ],
      transactions: [
        { id: legacyIdToUuid('balance', `${accountOne}:20`), accountId: accountOne, categoryId: catOne, amount: 12.34, date: '2026-08-10T10:10:00.000Z', title: 'Lunch A', type: 'expense', legacyId: 20, legacySource: 'room' },
        { id: legacyIdToUuid('balance', `${accountTwo}:20`), accountId: accountTwo, categoryId: catTwo, amount: 12.34, date: '2026-08-10T10:10:00.000Z', title: 'Lunch B', type: 'expense', legacyId: 20, legacySource: 'room' },
      ],
      limits: [],
      recurringEntries: [],
      savingGoals: [],
      templates: [],
    });

    const service = new BudgetService();
    await importLocalMigrationPayload(multiAccountPayload(), service);
    await importLocalMigrationPayload(multiAccountPayload(), service);

    // Both accounts' rows exist exactly once, under stable scoped IDs.
    const transactions = await db.transactions.toArray();
    expect(transactions.filter((t) => t.accountId === accountOne)).toHaveLength(1);
    expect(transactions.filter((t) => t.accountId === accountTwo)).toHaveLength(1);
    expect(new Set(transactions.map((t) => t.id)).size).toBe(2);

    // IDs are exactly the deterministic scoped IDs — reproducible across runs.
    const txOne = transactions.find((t) => t.accountId === accountOne)!;
    const txTwo = transactions.find((t) => t.accountId === accountTwo)!;
    expect(txOne.id).toBe(legacyIdToUuid('balance', `${accountOne}:20`));
    expect(txTwo.id).toBe(legacyIdToUuid('balance', `${accountTwo}:20`));
  });
});
