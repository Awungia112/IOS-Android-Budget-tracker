/**
 * Unit tests for android-reader.ts
 *
 * Uses an in-memory SQLite fixture via vi.mock to simulate both the Room
 * databases (legacy_account, legacy_general) and the legacy SQLite v1 database.
 *
 * All column names are sourced from docs/migration/local_schema_map.md.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  readAndroidRoomData,
  readAndroidLegacySQLiteData,
  readAllAndroidData,
  readAndroidLegacyAccountIds,
} from './android-reader.js';
import { openReadOnly } from './db.js';
import { legacyIdToUuid } from './local-migration-utils.js';
import type { MigrationCategory } from './local-legacy-types.js';

// =============================================================================
// MOCK SETUP
// =============================================================================

// Mock the Capacitor plugin bridge — prepareAndroidDatabases returns copied account DB names for tests
vi.mock('./android-plugin', () => ({
  MigrationFileCopyPlugin: {
    prepareAndroidDatabases: vi.fn().mockResolvedValue({ accountDbCount: 1, accountDbNames: ['legacy_account_1'] }),
  },
}));

// In-memory fixture data keyed by (dbName, sql)
type QueryResult = { values: Record<string, unknown>[] };
const queryFixtures = new Map<string, QueryResult>();

function seedQuery(dbName: string, tableKeyword: string, rows: Record<string, unknown>[]) {
  queryFixtures.set(`${dbName}:${tableKeyword}`, { values: rows });
}

function getFixture(dbName: string, sql: string): QueryResult {
  // Normalize SQL for matching: collapse whitespace, uppercase
  const normalizedSql = sql.replace(/\s+/g, ' ').trim().toUpperCase();

  // Sort by keyword length descending so more specific keys match first
  // e.g. "FROM income_categories WHERE limits IS NOT NULL" beats "FROM income_categories"
  const sortedEntries = [...queryFixtures.entries()]
    .filter(([key]) => key.startsWith(`${dbName}:`))
    .sort(([a], [b]) => b.length - a.length);

  for (const [key, result] of sortedEntries) {
    const keyword = key.slice(dbName.length + 1);
    if (normalizedSql.includes(keyword.toUpperCase())) return result;
  }
  return { values: [] };
}

// Mock db.ts openReadOnly / closeConnection
vi.mock('./db', () => ({
  openReadOnly: vi.fn().mockImplementation((dbName: string) => ({
    connection: {
      query: vi.fn().mockImplementation((sql: string) => {
        return Promise.resolve(getFixture(dbName, sql));
      }),
    },
  })),
  closeConnection: vi.fn().mockResolvedValue(undefined),
}));

// =============================================================================
// FIXTURES
// =============================================================================

beforeEach(() => {
  queryFixtures.clear();
  vi.clearAllMocks();
});

function seedRoomFixtures() {
  // general_db: accounts + access
  seedQuery('legacy_general', 'FROM accounts', [
    {
      id: 1,
      name: 'Test Account',
      account_abbreviation: 'TA',
      is_online: 0,
      last_synced_at: null,
      created_at: null,
      remote_id: null,
      role: 'OWNER',
      email: 'test@example.com',
      firstName: 'Test',
      lastname: 'User',
    },
  ]);

  // account_db: categories
  seedQuery('legacy_account_1', 'FROM categories', [
    {
      id: 10,
      name: 'Food',
      type: 'EXPENSE',
      icon_name: 'ic_food',
      default_flag: 'DEFAULT',
      deleted: 0,
      limit: 50.0,
      limit_date: '20241201',
    },
    {
      id: 11,
      name: 'Salary',
      type: 'INCOME',
      icon_name: null,
      default_flag: 'CUSTOM',
      deleted: 0,
      limit: null,
      limit_date: null,
    },
    {
      id: 12,
      name: 'Deleted Cat',
      type: 'EXPENSE',
      icon_name: null,
      default_flag: 'CUSTOM',
      deleted: 1,
      limit: null,
      limit_date: null,
    },
  ]);

  // account_db: balances
  seedQuery('legacy_account_1', 'FROM balances', [
    {
      id: 100,
      user_id: 1,
      amount: 12.5,
      date: '20240315',
      category_id: 10,
      name: 'Supermarket',
      type: 'EXPENSE',
      created_at: '20240315',
      saving_goal_id: null,
      deleted: 0,
      is_transfer_balance: 0,
    },
    {
      id: 101,
      user_id: 1,
      amount: 2000.0,
      date: '20240301',
      category_id: 11,
      name: 'March Salary',
      type: 'INCOME',
      created_at: '20240301',
      saving_goal_id: null,
      deleted: 0,
      is_transfer_balance: 0,
    },
    {
      id: 102,
      user_id: 1,
      amount: 5.0,
      date: '20240310',
      category_id: 10,
      name: 'Deleted tx',
      type: 'EXPENSE',
      created_at: '20240310',
      saving_goal_id: null,
      deleted: 1,
      is_transfer_balance: 0,
    },
  ]);

  // account_db: recurring
  seedQuery('legacy_account_1', 'FROM recurring', [
    {
      id: 200,
      repeating: 1,
      amount: 9.99,
      category_id: 10,
      start_date: '20240101',
      name: 'Netflix',
      type: 'EXPENSE',
      deleted: 0,
    },
  ]);

  // account_db: saving_goals
  seedQuery('legacy_account_1', 'FROM saving_goals', [
    {
      id: 300,
      name: 'Vacation',
      amount: 1000.0,
      monthly_amount: 100.0,
      due_date: '20241231',
      category_id: 10,
      is_open: 1,
      creation_date: '20240101',
      deleted: 0,
    },
  ]);

  // Room DB doesn't use ticketing table - it uses saving_goal_id directly in balances

  // account_db: templates
  seedQuery('legacy_account_1', 'FROM templates', [
    {
      id: 400,
      name: 'Phone Bill',
      amount: 29.99,
      category_id: 10,
      type: 'EXPENSE',
      deleted: 0,
    },
  ]);
}

function seedLegacySQLiteFixtures() {
  seedQuery('legacy_sqlite_v1', 'FROM income_categories', [
    { _id: 1, name: 'Salary', icon: 'ic_salary', deletable: 0 },
  ]);
  seedQuery('legacy_sqlite_v1', 'FROM expense_categories', [
    { _id: 2, name: 'Food', icon: 'ic_food', deletable: 1 },
  ]);
  seedQuery('legacy_sqlite_v1', 'income WHERE repeating = 0', [
    { _id: 10, amount: 2000.0, date: '2024-03-01', name: 'Salary', category: 1 },
  ]);
  seedQuery('legacy_sqlite_v1', 'expenses WHERE repeating = 0', [
    { _id: 20, amount: 12.5, date: '2024-03-15', name: 'Supermarket', category: 2 },
  ]);
  seedQuery('legacy_sqlite_v1', 'income WHERE repeating != 0', []);
  seedQuery('legacy_sqlite_v1', 'expenses WHERE repeating != 0', [
    { _id: 30, repeating: 1, amount: 9.99, category: 2, next_repeating_date: '2024-04-01', name: 'Netflix' },
  ]);
  seedQuery('legacy_sqlite_v1', 'savinggoals', [
    { _id: 40, name: 'Vacation', amount: 1000.0, monthly_amount: 100.0, date: '2024-12-31', category: 2 },
  ]);
  seedQuery('legacy_sqlite_v1', 'ticketing', [
    { _id: 1, balanceID: 20, savingGoal: 40 }, // Expense ID 20 is a completion of saving goal 40
  ]);
  seedQuery('legacy_sqlite_v1', 'income_templates', []);
  seedQuery('legacy_sqlite_v1', 'expense_templates', [
    { _id: 50, name: 'Phone Bill', amount: 29.99, category: 2 },
  ]);
  seedQuery('legacy_sqlite_v1', 'income_categories WHERE limits IS NOT NULL AND limits > 0', []);
  seedQuery('legacy_sqlite_v1', 'expense_categories WHERE limits IS NOT NULL AND limits > 0', [
    { _id: 2, limits: 50.0, limitsDate: '2024-12-01' },
  ]);
}

// =============================================================================
// ROOM READER TESTS
// =============================================================================

describe('readAndroidRoomData', () => {
  it('returns empty object when zero account databases are found (fresh install)', async () => {
    const { MigrationFileCopyPlugin } = await import('./android-plugin');
    vi.mocked(MigrationFileCopyPlugin.prepareAndroidDatabases).mockResolvedValueOnce({
      accountDbCount: 0,
      accountDbNames: [],
    });

    const result = await readAndroidRoomData();

    expect(result).toEqual({});
    // Should not attempt to open any database
    expect(openReadOnly).not.toHaveBeenCalled();
  });

  it('maps accounts from general_db with correct UUIDs and fields', async () => {
    seedRoomFixtures();
    const result = await readAndroidRoomData();

    expect(result.accounts).toHaveLength(1);
    const account = result.accounts![0];
    expect(account.name).toBe('Test Account');
    expect(account.initials).toBe('TA');
    expect(account.legacySource).toBe('room');
    expect(account.legacyId).toBe(1);
    expect(account.id).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('opens only account databases returned by the plugin', async () => {
    seedRoomFixtures();
    await readAndroidRoomData();

    expect(openReadOnly).toHaveBeenCalledWith('legacy_account_1');
    expect(openReadOnly).not.toHaveBeenCalledWith('legacy_account_2');
  });

  it('filters deleted categories and maps remaining ones', async () => {
    seedRoomFixtures();
    const result = await readAndroidRoomData();

    // 3 rows seeded, 1 deleted → 2 categories
    expect(result.categories).toHaveLength(2);
    expect(result.categories!.every(c => c.legacySource === 'room')).toBe(true);
    const food = result.categories!.find(c => c.name === 'category_food');
    expect(food?.type).toBe('expense');
    expect(food?.isDefault).toBe(true);
  });

  it('preserves a Room CUSTOM category whose name matches a default as user-created (Room guard)', async () => {
    // Regression for the Room-reader source-preservation guard.
    // The fixture seeds "Salary" with default_flag: 'CUSTOM'. "Salary" maps to
    // category_salary which exists in DEFAULT_CATEGORIES as income-salary.
    // Without the (isRoomDefault && !isUserCreatedKeyName) guard the reader
    // would collapse it into the stable default ID before importData runs.
    // With the guard it must get a scoped UUID and isDefault: false.
    seedRoomFixtures();
    const result = await readAndroidRoomData();

    const salary = result.categories!.find(c => c.type === 'income');
    expect(salary).toBeDefined();

    // Must remain custom in the source payload.
    expect(salary!.id).not.toBe('income-salary');

    // isDefault must reflect the Room flag (CUSTOM → false), not the name match
    expect(salary!.isDefault).toBe(false);

    // Original name preserved — do NOT replace with the translation key
    expect(salary!.name).toBe('Salary');
  });

  it('extracts limits from categories with non-null limit values', async () => {
    seedRoomFixtures();
    const result = await readAndroidRoomData();

    expect(result.limits).toHaveLength(1);
    const limit = result.limits![0];
    // fromRoomAmount(50.0) = 50.0 euros
    expect(limit.amount).toBe(50);
    expect(limit.legacySource).toBe('room');
  });

  it('filters deleted transactions and converts amounts to euros', async () => {
    seedRoomFixtures();
    const result = await readAndroidRoomData();

    // 3 rows seeded, 1 deleted → 2 transactions
    expect(result.transactions).toHaveLength(2);
    const supermarket = result.transactions!.find(t => t.title === 'Supermarket');
    expect(supermarket?.amount).toBe(12.5); // 12.5 euros
    expect(supermarket?.type).toBe('expense');
    expect(supermarket?.legacySource).toBe('room');
  });

  it('converts dates using fromRoomLocalDate (yyyyMMdd format)', async () => {
    seedRoomFixtures();
    const result = await readAndroidRoomData();

    const tx = result.transactions!.find(t => t.title === 'Supermarket');
    expect(tx?.date).toBe('2024-03-15T00:00:00.000Z');
  });

  it('maps recurring items with correct frequency', async () => {
    seedRoomFixtures();
    const result = await readAndroidRoomData();

    expect(result.recurringEntries).toHaveLength(1);
    expect(result.recurringEntries![0].frequency).toBe('monthly');
    expect(result.recurringEntries![0].amount).toBe(9.99); // 9.99 euros
  });

  it('maps saving goals with targetAmount in euros', async () => {
    seedRoomFixtures();
    const result = await readAndroidRoomData();

    expect(result.savingGoals).toHaveLength(1);
    expect(result.savingGoals![0].targetAmount).toBe(1000); // 1000.0 euros
    expect(result.savingGoals![0].monthlyAmount).toBe(100); // 100.0 euros
  });

  it('maps templates with correct amount in euros', async () => {
    seedRoomFixtures();
    const result = await readAndroidRoomData();

    expect(result.templates).toHaveLength(1);
    expect(result.templates![0].amount).toBe(29.99); // 29.99 euros
    expect(result.templates![0].legacySource).toBe('room');
  });

  it('Room DB uses saving_goal_id directly, no ticketing table needed', async () => {
    seedRoomFixtures();
    const result = await readAndroidRoomData();

    expect(result.transactions).toHaveLength(2);

    // Income transaction should not be a completion transaction
    const salary = result.transactions!.find(t => t.title === 'March Salary');
    expect(salary?.isCompletionTransaction).toBe(false);
    expect(salary?.savingsGoalId).toBeUndefined();

    // Expense transaction should not be a completion transaction in Room DB
    // because it uses saving_goal_id directly, not ticketing table
    const supermarket = result.transactions!.find(t => t.title === 'Supermarket');
    expect(supermarket?.isCompletionTransaction).toBe(false);
    expect(supermarket?.savingsGoalId).toBeUndefined();
    expect(supermarket?.type).toBe('expense');
  });

  it('sets legacySource: room on all entities', async () => {
    seedRoomFixtures();
    const result = await readAndroidRoomData();

    expect(result.accounts!.every(e => e.legacySource === 'room')).toBe(true);
    expect(result.transactions!.every(e => e.legacySource === 'room')).toBe(true);
    expect(result.recurringEntries!.every(e => e.legacySource === 'room')).toBe(true);
  });

  it('#470: same legacy PK across two account DBs yields distinct, scoped entity IDs', async () => {
    const { MigrationFileCopyPlugin } = await import('./android-plugin');
    vi.mocked(MigrationFileCopyPlugin.prepareAndroidDatabases).mockResolvedValue({
      accountDbCount: 2,
      accountDbNames: ['legacy_account_1', 'legacy_account_2'],
    });

    // Two accounts, each with a colliding primary key sequence (id 10 category,
    // id 100 balance, id 200 recurring, id 300 saving goal, id 400 template).
    seedQuery('legacy_general', 'FROM accounts', [
      {
        id: 1,
        name: 'Account One',
        account_abbreviation: 'A1',
        is_online: 0,
        last_synced_at: null,
        created_at: null,
        remote_id: null,
        role: 'OWNER',
        email: null,
        firstName: null,
        lastname: null,
      },
      {
        id: 2,
        name: 'Account Two',
        account_abbreviation: 'A2',
        is_online: 0,
        last_synced_at: null,
        created_at: null,
        remote_id: null,
        role: 'OWNER',
        email: null,
        firstName: null,
        lastname: null,
      },
    ]);

    // Custom (non-default) category names so scoping is observable — default
    // categories are mapped to stable IDs regardless of account.
    const seedAccount = (dbName: string, catName: string) => {
      seedQuery(dbName, 'FROM categories', [
        {
          id: 10,
          name: catName,
          type: 'EXPENSE',
          icon_name: null,
          default_flag: 'CUSTOM',
          deleted: 0,
          limit: null,
          limit_date: null,
        },
      ]);
      seedQuery(dbName, 'FROM balances', [
        {
          id: 100,
          user_id: 1,
          amount: 12.5,
          date: '20240315',
          category_id: 10,
          name: `Supermarket ${catName}`,
          type: 'EXPENSE',
          created_at: '20240315',
          saving_goal_id: null,
          deleted: 0,
          is_transfer_balance: 0,
        },
      ]);
      seedQuery(dbName, 'FROM recurring', [
        {
          id: 200,
          repeating: 1,
          amount: 9.99,
          category_id: 10,
          start_date: '20240101',
          name: 'Netflix',
          type: 'EXPENSE',
          deleted: 0,
        },
      ]);
      seedQuery(dbName, 'FROM saving_goals', [
        {
          id: 300,
          name: 'Vacation',
          amount: 1000.0,
          monthly_amount: 100.0,
          due_date: '20241231',
          category_id: 10,
          is_open: 1,
          creation_date: '20240101',
          deleted: 0,
        },
      ]);
      seedQuery(dbName, 'FROM templates', [
        {
          id: 400,
          name: 'Phone Bill',
          amount: 29.99,
          category_id: 10,
          type: 'EXPENSE',
          deleted: 0,
        },
      ]);
    };

    seedAccount('legacy_account_1', 'Custom A');
    seedAccount('legacy_account_2', 'Custom B');

    const result = await readAndroidRoomData();

    // Two accounts exist with deterministic UUIDs.
    expect(result.accounts).toHaveLength(2);
    const accountOne = result.accounts!.find((a) => a.legacyId === 1)!;
    const accountTwo = result.accounts!.find((a) => a.legacyId === 2)!;

    // Same legacy PKs must produce different IDs across accounts.
    const categoryAccountId = (category: MigrationCategory) =>
      (category as MigrationCategory & { accountId?: string }).accountId;
    const categoryOne = result.categories!.find((c) => categoryAccountId(c) === accountOne.id)!;
    const categoryTwo = result.categories!.find((c) => categoryAccountId(c) === accountTwo.id)!;
    expect(categoryOne.id).not.toBe(categoryTwo.id);
    expect(categoryOne.id).toBe(legacyIdToUuid('category', `${accountOne.id}:10`));
    expect(categoryTwo.id).toBe(legacyIdToUuid('category', `${accountTwo.id}:10`));

    const txOne = result.transactions!.find((t) => t.accountId === accountOne.id)!;
    const txTwo = result.transactions!.find((t) => t.accountId === accountTwo.id)!;
    expect(txOne.id).not.toBe(txTwo.id);
    expect(txOne.id).toBe(legacyIdToUuid('balance', `${accountOne.id}:100`));
    expect(txTwo.id).toBe(legacyIdToUuid('balance', `${accountTwo.id}:100`));

    // Each entity type is scoped, not just categories/balances.
    const recOne = result.recurringEntries!.find((r) => r.accountId === accountOne.id)!;
    const recTwo = result.recurringEntries!.find((r) => r.accountId === accountTwo.id)!;
    expect(recOne.id).not.toBe(recTwo.id);
    const goalOne = result.savingGoals!.find((g) => g.accountId === accountOne.id)!;
    const goalTwo = result.savingGoals!.find((g) => g.accountId === accountTwo.id)!;
    expect(goalOne.id).not.toBe(goalTwo.id);
    const tmplOne = result.templates!.find((t) => t.accountId === accountOne.id)!;
    const tmplTwo = result.templates!.find((t) => t.accountId === accountTwo.id)!;
    expect(tmplOne.id).not.toBe(tmplTwo.id);

    // Re-running the reader yields identical IDs (reproducible across runs).
    const secondRun = await readAndroidRoomData();
    const secondTxOne = secondRun.transactions!.find((t) => t.accountId === accountOne.id)!;
    const secondTxTwo = secondRun.transactions!.find((t) => t.accountId === accountTwo.id)!;
    expect(secondTxOne.id).toBe(txOne.id);
    expect(secondTxTwo.id).toBe(txTwo.id);
  });
});

// =============================================================================
// LEGACY SQLITE v1 READER TESTS
// =============================================================================

describe('readAndroidLegacySQLiteData', () => {
  it('returns empty object when database file is absent', async () => {
    const { openReadOnly } = await import('./db');
    vi.mocked(openReadOnly).mockRejectedValueOnce(new Error('Database not found'));

    const result = await readAndroidLegacySQLiteData();
    expect(result).toEqual({});
  });

  it('creates a synthetic main account with legacySource: sqlite_v1', async () => {
    seedLegacySQLiteFixtures();
    const result = await readAndroidLegacySQLiteData();

    expect(result.accounts).toHaveLength(1);
    expect(result.accounts![0].name).toBe('Main Account (Imported)');
    expect(result.accounts![0].legacySource).toBe('sqlite_v1');
  });

  it('maps income and expense categories with correct isDefault', async () => {
    seedLegacySQLiteFixtures();
    const result = await readAndroidLegacySQLiteData();

    expect(result.categories).toHaveLength(2);

    // deletable: 0 → system-seeded → must map to the stable default ID and use
    // the translation-key name (category_salary), not the raw legacy name.
    const salary = result.categories!.find(c => c.name === 'category_salary');
    expect(salary).toBeDefined();
    expect(salary?.isDefault).toBe(true);

    // deletable: 1 → user-created in the source payload. The original name
    // ('Food') is preserved; importData performs later target matching.
    const food = result.categories!.find(c => c.name === 'Food');
    expect(food).toBeDefined();
    expect(food?.isDefault).toBe(false);
    expect(food?.id).not.toBe('expense-food');
  });

  it('maps transactions from income and expenses tables', async () => {
    seedLegacySQLiteFixtures();
    const result = await readAndroidLegacySQLiteData();

    expect(result.transactions).toHaveLength(2);
    const income = result.transactions!.find(t => t.type === 'income');
    expect(income?.title).toBe('Salary');
    expect(income?.legacySource).toBe('sqlite_v1');
  });

  it('maps recurring items from expenses where repeating != 0', async () => {
    seedLegacySQLiteFixtures();
    const result = await readAndroidLegacySQLiteData();

    expect(result.recurringEntries).toHaveLength(1);
    expect(result.recurringEntries![0].frequency).toBe('monthly');
    expect(result.recurringEntries![0].legacySource).toBe('sqlite_v1');
  });

  it('maps limits from categories with non-zero limits', async () => {
    seedLegacySQLiteFixtures();
    const result = await readAndroidLegacySQLiteData();

    expect(result.limits).toHaveLength(1);
    expect(result.limits![0].amount).toBe(50); // 50.0 euros
  });

  it('tracks savings goal completions using ticketing table', async () => {
    seedLegacySQLiteFixtures();
    const result = await readAndroidLegacySQLiteData();

    expect(result.transactions).toHaveLength(2);

    // Income transaction should not be a completion transaction
    const salary = result.transactions!.find(t => t.title === 'Salary');
    expect(salary?.isCompletionTransaction).toBe(false);

    // Expense transaction (Supermarket) should NOT be a completion transaction
    // because isCompletionTransaction is now set to false for all expenses
    const supermarket = result.transactions!.find(t => t.title === 'Supermarket');
    expect(supermarket?.isCompletionTransaction).toBe(false);
    expect(supermarket?.type).toBe('expense');
  });

  // ---------------------------------------------------------------------------
  // Source-payload preservation tests — legacy SQLite v1 path
  // Mirror the matching tests in legacy-data-transformer.test.ts; each case
  // corresponds to a real user scenario reported in ticket #451.
  // ---------------------------------------------------------------------------

  it('preserves a user-created German-named category in the source payload (deletable=1)', async () => {
    // A German-speaking user created a custom "Essen" expense category.
    // deletable=1 → user-created; importData owns final target-account matching.
    seedQuery('legacy_sqlite_v1', 'FROM income_categories', []);
    seedQuery('legacy_sqlite_v1', 'FROM expense_categories', [
      { _id: 1, name: 'Essen', icon: 'ic_food', deletable: 1 },
    ]);
    seedQuery('legacy_sqlite_v1', 'income WHERE repeating = 0', []);
    seedQuery('legacy_sqlite_v1', 'expenses WHERE repeating = 0', [
      { _id: 10, amount: 5.0, date: '2024-01-01', name: 'Lunch', category: 1 },
    ]);
    seedQuery('legacy_sqlite_v1', 'income WHERE repeating != 0', []);
    seedQuery('legacy_sqlite_v1', 'expenses WHERE repeating != 0', []);
    seedQuery('legacy_sqlite_v1', 'savinggoals', []);
    seedQuery('legacy_sqlite_v1', 'ticketing', []);
    seedQuery('legacy_sqlite_v1', 'income_templates', []);
    seedQuery('legacy_sqlite_v1', 'expense_templates', []);
    seedQuery('legacy_sqlite_v1', 'income_categories WHERE limits IS NOT NULL AND limits > 0', []);
    seedQuery('legacy_sqlite_v1', 'expense_categories WHERE limits IS NOT NULL AND limits > 0', []);

    const result = await readAndroidLegacySQLiteData();

    expect(result.categories).toHaveLength(1);
    const cat = result.categories![0];
    // Must remain custom in the source payload.
    expect(cat.id).not.toBe('expense-food');
    expect(cat.isDefault).toBe(false);
    // Original German name must be preserved exactly
    expect(cat.name).toBe('Essen');
  });

  it('preserves all common German user-created names in the source payload (deletable=1)', async () => {
    // These names must survive reader parsing as independent custom entries;
    // importData owns final matching against the target account's defaults.
    const germanExpenseCategories = [
      { _id: 1, name: 'Essen', icon: 'ic_1', deletable: 1 },
      { _id: 2, name: 'Haushalt', icon: 'ic_2', deletable: 1 },
      { _id: 3, name: 'Freizeit', icon: 'ic_3', deletable: 1 },
      { _id: 4, name: 'Einkaufen', icon: 'ic_4', deletable: 1 },
      { _id: 5, name: 'Kleidung', icon: 'ic_5', deletable: 1 },
      { _id: 6, name: 'Urlaub', icon: 'ic_6', deletable: 1 },
      { _id: 7, name: 'Hobby', icon: 'ic_7', deletable: 1 },
      { _id: 8, name: 'Gesundheit', icon: 'ic_8', deletable: 1 },
      { _id: 9, name: 'Sport', icon: 'ic_9', deletable: 1 },
    ];

    seedQuery('legacy_sqlite_v1', 'FROM income_categories', []);
    seedQuery('legacy_sqlite_v1', 'FROM expense_categories', germanExpenseCategories);
    seedQuery('legacy_sqlite_v1', 'income WHERE repeating = 0', []);
    seedQuery('legacy_sqlite_v1', 'expenses WHERE repeating = 0', []);
    seedQuery('legacy_sqlite_v1', 'income WHERE repeating != 0', []);
    seedQuery('legacy_sqlite_v1', 'expenses WHERE repeating != 0', []);
    seedQuery('legacy_sqlite_v1', 'savinggoals', []);
    seedQuery('legacy_sqlite_v1', 'ticketing', []);
    seedQuery('legacy_sqlite_v1', 'income_templates', []);
    seedQuery('legacy_sqlite_v1', 'expense_templates', []);
    seedQuery('legacy_sqlite_v1', 'income_categories WHERE limits IS NOT NULL AND limits > 0', []);
    seedQuery('legacy_sqlite_v1', 'expense_categories WHERE limits IS NOT NULL AND limits > 0', []);

    const result = await readAndroidLegacySQLiteData();

    expect(result.categories).toHaveLength(9);

    const matchingDefaultIds = [
      'expense-food', 'expense-household', 'expense-leisure',
      'expense-shopping', 'expense-clothing', 'expense-vacation',
      'expense-hobby', 'expense-health', 'expense-sports',
    ];

    for (const cat of result.categories!) {
      // None should have been collapsed into a system default ID
      expect(matchingDefaultIds).not.toContain(cat.id);
      expect(cat.isDefault).toBe(false);
    }

    // Original German names must be preserved exactly
    const names = result.categories!.map(c => c.name);
    expect(names).toEqual(
      expect.arrayContaining(['Essen', 'Haushalt', 'Freizeit', 'Einkaufen', 'Kleidung', 'Urlaub', 'Hobby', 'Gesundheit', 'Sport']),
    );
  });

  it('preserves a user-created category_* name in the source payload (deletable=1)', async () => {
    // A user who literally typed "category_household" as their category name
    // must have it preserved as a custom entry — NOT collapsed into expense-household.
    seedQuery('legacy_sqlite_v1', 'FROM income_categories', []);
    seedQuery('legacy_sqlite_v1', 'FROM expense_categories', [
      { _id: 1, name: 'category_household', icon: 'ic_house', deletable: 1 },
    ]);
    seedQuery('legacy_sqlite_v1', 'income WHERE repeating = 0', []);
    seedQuery('legacy_sqlite_v1', 'expenses WHERE repeating = 0', []);
    seedQuery('legacy_sqlite_v1', 'income WHERE repeating != 0', []);
    seedQuery('legacy_sqlite_v1', 'expenses WHERE repeating != 0', []);
    seedQuery('legacy_sqlite_v1', 'savinggoals', []);
    seedQuery('legacy_sqlite_v1', 'ticketing', []);
    seedQuery('legacy_sqlite_v1', 'income_templates', []);
    seedQuery('legacy_sqlite_v1', 'expense_templates', []);
    seedQuery('legacy_sqlite_v1', 'income_categories WHERE limits IS NOT NULL AND limits > 0', []);
    seedQuery('legacy_sqlite_v1', 'expense_categories WHERE limits IS NOT NULL AND limits > 0', []);

    const result = await readAndroidLegacySQLiteData();

    expect(result.categories).toHaveLength(1);
    const cat = result.categories![0];
    expect(cat.id).not.toBe('expense-household');
    expect(cat.isDefault).toBe(false);
    expect(cat.name).toBe('category_household');
  });

  it('still maps a non-deletable German-named category to its system default (deletable=0)', async () => {
    // Sanity check: deletable=0 = system-seeded → must still resolve to the
    // stable default ID so cross-account remapping works correctly.
    seedQuery('legacy_sqlite_v1', 'FROM income_categories', []);
    seedQuery('legacy_sqlite_v1', 'FROM expense_categories', [
      { _id: 1, name: 'Essen', icon: 'ic_food', deletable: 0 },
    ]);
    seedQuery('legacy_sqlite_v1', 'income WHERE repeating = 0', []);
    seedQuery('legacy_sqlite_v1', 'expenses WHERE repeating = 0', [
      { _id: 10, amount: 8.0, date: '2024-02-01', name: 'Döner', category: 1 },
    ]);
    seedQuery('legacy_sqlite_v1', 'income WHERE repeating != 0', []);
    seedQuery('legacy_sqlite_v1', 'expenses WHERE repeating != 0', []);
    seedQuery('legacy_sqlite_v1', 'savinggoals', []);
    seedQuery('legacy_sqlite_v1', 'ticketing', []);
    seedQuery('legacy_sqlite_v1', 'income_templates', []);
    seedQuery('legacy_sqlite_v1', 'expense_templates', []);
    seedQuery('legacy_sqlite_v1', 'income_categories WHERE limits IS NOT NULL AND limits > 0', []);
    seedQuery('legacy_sqlite_v1', 'expense_categories WHERE limits IS NOT NULL AND limits > 0', []);

    const result = await readAndroidLegacySQLiteData();

    expect(result.categories).toHaveLength(1);
    const cat = result.categories![0];
    // Non-deletable system-seeded category MUST map to the stable default
    expect(cat.id).toBe('expense-food');
    expect(cat.isDefault).toBe(true);
    // Name must be the translation key, not the raw German word
    expect(cat.name).toBe('category_food');
  });
});

// =============================================================================
// RUNTIME DETECTION TESTS
// =============================================================================

describe('readAllAndroidData', () => {
  it('calls prepareAndroidDatabases before reading', async () => {
    seedRoomFixtures();
    const { MigrationFileCopyPlugin } = await import('./android-plugin');

    await readAllAndroidData();

    expect(MigrationFileCopyPlugin.prepareAndroidDatabases).toHaveBeenCalledTimes(1);
  });

  it('returns Room data when Room has transactions', async () => {
    seedRoomFixtures();
    const result = await readAllAndroidData();

    expect(result.transactions).toHaveLength(2);
    expect(result.transactions![0].legacySource).toBe('room');
  });

  it('injects primaryAccountId into Room entities that lack accountId', async () => {
    seedRoomFixtures();
    const result = await readAllAndroidData();

    const primaryId = result.accounts![0].id;
    expect(primaryId).toBeTruthy();

    // All recurring, saving goals, templates and limits should have the primary accountId
    result.recurringEntries?.forEach(e => expect(e.accountId).toBe(primaryId));
    result.savingGoals?.forEach(g => expect(g.accountId).toBe(primaryId));
    result.templates?.forEach(t => expect(t.accountId).toBe(primaryId));
    result.limits?.forEach(l => expect(l.accountId).toBe(primaryId));
  });

  it('falls back to legacy SQLite when Room has no transactions', async () => {
    // Seed Room with empty balances
    seedQuery('legacy_general', 'FROM accounts', [
      {
        id: 1, name: 'Test', account_abbreviation: 'T', is_online: 0,
        last_synced_at: null, created_at: null, remote_id: null,
        role: 'OWNER', email: null, firstName: null, lastname: null
      },
    ]);
    seedQuery('legacy_account', 'FROM categories', []);
    seedQuery('legacy_account', 'FROM balances', []); // empty → triggers fallback
    seedQuery('legacy_account', 'FROM recurring', []);
    seedQuery('legacy_account', 'FROM saving_goals', []);
    seedQuery('legacy_account', 'FROM templates', []);
    seedLegacySQLiteFixtures();

    const result = await readAllAndroidData();

    expect(result.transactions).toHaveLength(2);
    expect(result.transactions![0].legacySource).toBe('sqlite_v1');
  });

  it('falls back to legacy SQLite when no Room databases exist (pre-Room update install)', async () => {
    // Plugin returns no account databases — user was on pre-Room version of old app
    const { MigrationFileCopyPlugin } = await import('./android-plugin');
    vi.mocked(MigrationFileCopyPlugin.prepareAndroidDatabases).mockResolvedValue({
      accountDbCount: 0,
      accountDbNames: [],
    });
    seedLegacySQLiteFixtures();

    const result = await readAllAndroidData();

    // Should have read from legacy SQLite, not returned empty
    expect(result.transactions).toHaveLength(2);
    expect(result.transactions![0].legacySource).toBe('sqlite_v1');
  });

  it('returns empty when neither Room nor legacy SQLite databases exist (true fresh install)', async () => {
    const { MigrationFileCopyPlugin } = await import('./android-plugin');
    vi.mocked(MigrationFileCopyPlugin.prepareAndroidDatabases).mockResolvedValue({
      accountDbCount: 0,
      accountDbNames: [],
    });
    // No legacy fixtures seeded — openReadOnly throws file-not-found
    const { openReadOnly } = await import('./db');
    vi.mocked(openReadOnly).mockRejectedValueOnce(new Error('Database not found'));

    const result = await readAllAndroidData();

    expect(result.transactions ?? []).toHaveLength(0);
    expect(result.accounts ?? []).toHaveLength(0);
  });
});

describe('readAndroidLegacyAccountIds', () => {
  it('reads only legacy_general.accounts and never opens a per-account database', async () => {
    const { MigrationFileCopyPlugin } = await import('./android-plugin');
    vi.mocked(MigrationFileCopyPlugin.prepareAndroidDatabases).mockResolvedValueOnce({
      accountDbCount: 1,
      accountDbNames: ['legacy_account_1'],
    });
    // The mock fixture harness returns raw seeded rows regardless of the
    // query's SQL WHERE clause (it matches on keyword, not a real SQL
    // engine), so only a row that would pass "deleted = 0 OR deleted IS
    // NULL" against a real SQLite engine is seeded here.
    seedQuery('legacy_general', 'FROM accounts', [
      { id: 1, name: 'Main Account', deleted: 0, is_online: 0, remote_id: null },
    ]);

    const result = await readAndroidLegacyAccountIds();

    expect(result).toEqual([legacyIdToUuid('account', 1)]);

    const { openReadOnly } = await import('./db');
    expect(openReadOnly).toHaveBeenCalledWith('legacy_general');
    expect(openReadOnly).not.toHaveBeenCalledWith(expect.stringMatching(/^legacy_account_/));
  });

  it('excludes server-mirrored (online) accounts, matching what importLocalMigrationPayload() actually imports', async () => {
    const { MigrationFileCopyPlugin } = await import('./android-plugin');
    vi.mocked(MigrationFileCopyPlugin.prepareAndroidDatabases).mockResolvedValueOnce({
      accountDbCount: 1,
      accountDbNames: ['legacy_account_1'],
    });
    seedQuery('legacy_general', 'FROM accounts', [
      { id: 1, name: 'Local Account', deleted: 0, is_online: 0, remote_id: null },
      { id: 2, name: 'Shared Online Account', deleted: 0, is_online: 1, remote_id: null },
      { id: 3, name: 'Linked Account', deleted: 0, is_online: 0, remote_id: 42 },
    ]);

    const result = await readAndroidLegacyAccountIds();

    // Only the genuinely local account is a candidate the importer would
    // ever have created a Dexie row for — an online/mirrored account must
    // never show up here, or it reads back as "missing" forever.
    expect(result).toEqual([legacyIdToUuid('account', 1)]);
  });

  it('excludes blank-name accounts, matching what importLocalMigrationPayload() actually imports', async () => {
    const { MigrationFileCopyPlugin } = await import('./android-plugin');
    vi.mocked(MigrationFileCopyPlugin.prepareAndroidDatabases).mockResolvedValueOnce({
      accountDbCount: 1,
      accountDbNames: ['legacy_account_1'],
    });
    seedQuery('legacy_general', 'FROM accounts', [
      { id: 1, name: 'Main Account', deleted: 0, is_online: 0, remote_id: null },
      { id: 2, name: '   ', deleted: 0, is_online: 0, remote_id: null },
    ]);

    const result = await readAndroidLegacyAccountIds();

    expect(result).toEqual([legacyIdToUuid('account', 1)]);
  });

  it('falls back to the synthetic legacy SQLite v1 account when there are no Room databases', async () => {
    const { MigrationFileCopyPlugin } = await import('./android-plugin');
    vi.mocked(MigrationFileCopyPlugin.prepareAndroidDatabases).mockResolvedValueOnce({
      accountDbCount: 0,
      accountDbNames: [],
    });
    // Default openReadOnly mock resolves successfully — simulates the file existing.

    const result = await readAndroidLegacyAccountIds();

    expect(result).toEqual([legacyIdToUuid('account', 0)]);
  });

  it('returns an empty list on a true fresh install (no Room databases, no legacy SQLite file)', async () => {
    const { MigrationFileCopyPlugin } = await import('./android-plugin');
    vi.mocked(MigrationFileCopyPlugin.prepareAndroidDatabases).mockResolvedValueOnce({
      accountDbCount: 0,
      accountDbNames: [],
    });
    const { openReadOnly } = await import('./db');
    vi.mocked(openReadOnly).mockRejectedValueOnce(new Error('Database not found'));

    const result = await readAndroidLegacyAccountIds();

    expect(result).toEqual([]);
  });

  it('returns an empty list when legacy_general fails to open despite reported account databases', async () => {
    const { MigrationFileCopyPlugin } = await import('./android-plugin');
    vi.mocked(MigrationFileCopyPlugin.prepareAndroidDatabases).mockResolvedValueOnce({
      accountDbCount: 1,
      accountDbNames: ['legacy_account_1'],
    });
    const { openReadOnly } = await import('./db');
    vi.mocked(openReadOnly).mockRejectedValueOnce(new Error('unable to open database'));

    const result = await readAndroidLegacyAccountIds();

    expect(result).toEqual([]);
  });
});
