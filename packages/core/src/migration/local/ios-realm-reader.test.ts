import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readRealmData, readRealmLegacyAccountIds } from './ios-realm-reader.js';
import { legacyIdToUuid } from './local-migration-utils.js';
import type { RealmDataResult } from './ios-plugin.js';

const mocks = vi.hoisted(() => ({
  readRealmData: vi.fn(),
}));

vi.mock('./ios-plugin', () => ({
  MigrationSetupPlugin: {
    readRealmData: mocks.readRealmData,
  },
}));

function emptyRealmPayload(): RealmDataResult {
  return {
    accounts: [],
    balances: [],
    categories: [],
    savingGoals: [],
    recurringBalances: [],
    templates: [],
  };
}

describe('readRealmData', () => {
  beforeEach(() => {
    mocks.readRealmData.mockReset();
    mocks.readRealmData.mockResolvedValue(emptyRealmPayload());
  });

  it('maps the native Realm payload into the migration payload', async () => {
    const transactionDate = 1_700_000_000_000;
    const deadline = 1_800_000_000_000;
    const recurringStart = 1_710_000_000_000;

    mocks.readRealmData.mockResolvedValue({
      accounts: [{
        legacyId: 1,
        name: ' Main ',
        initials: ' MK ',
        role: 'owner',
        onlineId: 100,
        categoryLegacyIds: [10],
        legacySource: 'realm',
      }],
      categories: [
        {
          legacyId: 10,
          name: 'Essen',
          balanceType: 'expense',
          icon: 3,
          isDefault: true,
          limit: 30_000,
          onlineId: 200,
          legacySource: 'realm',
        },
        {
          legacyId: 11,
          name: 'Lohn',
          balanceType: 'income',
          icon: 2,
          isDefault: true,
          legacySource: 'realm',
        },
      ],
      balances: [{
        legacyId: 30,
        amount: 1234,
        date: transactionDate,
        title: ' Groceries ',
        accountLegacyId: 1,
        categoryLegacyId: 10,
        savingGoalLegacyId: 20,
        onlineId: 300,
        legacySource: 'realm',
      }],
      savingGoals: [{
        legacyId: 20,
        name: ' Holiday ',
        targetAmount: 100_000,
        monthlyAmount: 5_000,
        deadline,
        accountLegacyId: 1,
        categoryLegacyId: 10,
        onlineId: 400,
        legacySource: 'realm',
      }],
      recurringBalances: [{
        legacyId: 40,
        name: ' Rent ',
        amount: 80_000,
        startDate: recurringStart,
        interval: 3,
        accountLegacyId: 1,
        categoryLegacyId: 10,
        onlineId: 500,
        legacySource: 'realm',
      }],
      templates: [{
        legacyId: 50,
        name: ' Coffee ',
        amount: 350,
        accountLegacyId: 1,
        categoryLegacyId: 10,
        onlineId: 600,
        legacySource: 'realm',
      }],
    } satisfies RealmDataResult);

    const result = await readRealmData();

    expect(result.accounts).toEqual([{
      id: legacyIdToUuid('account', 1),
      name: 'Main',
      initials: 'MK',
      role: 'owner',
      onlineId: '100',
      legacyId: 1,
      legacySource: 'realm',
    }]);

    expect(result.categories).toEqual([
      {
        id: legacyIdToUuid('category', 10),
        name: 'category_food',
        type: 'expense',
        icon: 'lucide:food',
        isDefault: true,
        onlineId: '200',
        legacyId: 10,
        legacySource: 'realm',
      },
      {
        id: legacyIdToUuid('category', 11),
        name: 'category_salary',
        type: 'income',
        icon: 'money',
        isDefault: true,
        onlineId: undefined,
        legacyId: 11,
        legacySource: 'realm',
      },
    ]);

    expect(result.transactions).toEqual([{
      id: legacyIdToUuid('transaction', 30),
      accountId: legacyIdToUuid('account', 1),
      categoryId: legacyIdToUuid('category', 10),
      amount: 12.34,
      date: new Date(transactionDate).toISOString(),
      title: 'Groceries',
      type: 'expense',
      savingsGoalId: legacyIdToUuid('savingGoal', 20),
      onlineId: '300',
      legacyId: 30,
      legacySource: 'realm',
    }]);

    expect(result.savingGoals).toEqual([{
      id: legacyIdToUuid('savingGoal', 20),
      accountId: legacyIdToUuid('account', 1),
      name: 'Holiday',
      targetAmount: 1000,
      monthlyAmount: 50,
      deadline: new Date(deadline).toISOString(),
      categoryId: legacyIdToUuid('category', 10),
      icon: 'lucide:food',
      onlineId: '400',
      legacyId: 20,
      legacySource: 'realm',
    }]);

    expect(result.recurringEntries).toEqual([{
      id: legacyIdToUuid('recurring', 40),
      accountId: legacyIdToUuid('account', 1),
      categoryId: legacyIdToUuid('category', 10),
      amount: 800,
      frequency: 'every_3_months',
      startDate: new Date(recurringStart).toISOString(),
      name: 'Rent',
      type: 'expense',
      onlineId: '500',
      legacyId: 40,
      legacySource: 'realm',
    }]);

    expect(result.templates).toEqual([{
      id: legacyIdToUuid('template', 50),
      accountId: legacyIdToUuid('account', 1),
      name: 'Coffee',
      amount: 3.5,
      categoryId: legacyIdToUuid('category', 10),
      type: 'expense',
      onlineId: '600',
      legacyId: 50,
      legacySource: 'realm',
    }]);

    expect(result.limits).toEqual([{
      id: legacyIdToUuid('limit', '10:1'),
      accountId: legacyIdToUuid('account', 1),
      categoryId: legacyIdToUuid('category', 10),
      amount: 300,
      legacyId: '10:1',
      legacySource: 'realm',
    }]);
  });

  it('returns empty arrays when the native plugin reports no Realm file data', async () => {
    const result = await readRealmData();

    expect(result).toEqual({
      accounts: [],
      transactions: [],
      categories: [],
      savingGoals: [],
      recurringEntries: [],
      templates: [],
      limits: [],
    });
  });

  it('uses deterministic fallback IDs for unlinked Realm records', async () => {
    const date = 1_700_000_000_000;

    mocks.readRealmData.mockResolvedValue({
      ...emptyRealmPayload(),
      balances: [{
        legacyId: 31,
        amount: 999,
        date,
        title: 'Orphan',
        legacySource: 'realm',
      }],
    } satisfies RealmDataResult);

    const result = await readRealmData();

    expect(result.transactions[0]).toMatchObject({
      accountId: legacyIdToUuid('account', '__realm_default__'),
      categoryId: legacyIdToUuid('category', '__unknown__'),
      type: 'expense',
      date: new Date(date).toISOString(),
      legacySource: 'realm',
    });
  });

  it('handles legacy balance type strings from older native payloads', async () => {
    mocks.readRealmData.mockResolvedValue({
      ...emptyRealmPayload(),
      categories: [{
        legacyId: 12,
        name: 'Taschengeld',
        balanceType: 'BT_INCOME',
        icon: 3,
        isDefault: true,
        legacySource: 'realm',
      }],
    } satisfies RealmDataResult);

    const result = await readRealmData();

    expect(result.categories[0]).toMatchObject({
      name: 'category_allowance',
      type: 'income',
      icon: 'pig',
      isDefault: true,
      legacySource: 'realm',
    });
  });

  it('infers missing category balanceType consistently for linked Realm records', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const date = 1_700_000_000_000;

    mocks.readRealmData.mockResolvedValue({
      accounts: [],
      categories: [{
        legacyId: 12,
        name: 'Taschengeld',
        icon: 3,
        isDefault: true,
        legacySource: 'realm',
      }],
      balances: [{
        legacyId: 30,
        amount: 100,
        date,
        title: 'Allowance',
        categoryLegacyId: '12',
        legacySource: 'realm',
      }],
      savingGoals: [{
        legacyId: 20,
        name: 'Save allowance',
        targetAmount: 1000,
        monthlyAmount: 100,
        deadline: date,
        categoryLegacyId: '12',
        legacySource: 'realm',
      }],
      recurringBalances: [{
        legacyId: 40,
        name: 'Monthly allowance',
        amount: 100,
        startDate: date,
        interval: 1,
        categoryLegacyId: '12',
        legacySource: 'realm',
      }],
      templates: [{
        legacyId: 50,
        name: 'Allowance template',
        amount: 100,
        categoryLegacyId: '12',
        legacySource: 'realm',
      }],
    } satisfies RealmDataResult);

    const result = await readRealmData();

    expect(result.categories[0]).toMatchObject({
      name: 'category_allowance',
      type: 'income',
      icon: 'pig',
    });
    expect(result.transactions[0]).toMatchObject({
      type: 'income',
      categoryId: legacyIdToUuid('category', '12'),
    });
    expect(result.savingGoals[0]).toMatchObject({
      icon: 'pig',
      categoryId: legacyIdToUuid('category', '12'),
    });
    expect(result.recurringEntries[0]).toMatchObject({
      type: 'income',
      categoryId: legacyIdToUuid('category', '12'),
    });
    expect(result.templates[0]).toMatchObject({
      type: 'income',
      categoryId: legacyIdToUuid('category', '12'),
    });
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("inferred 'income'"));

    warn.mockRestore();
  });
});

describe('readRealmLegacyAccountIds', () => {
  beforeEach(() => {
    mocks.readRealmData.mockReset();
  });

  it('returns deterministic UUIDs for genuinely local accounts', async () => {
    mocks.readRealmData.mockResolvedValue({
      ...emptyRealmPayload(),
      accounts: [{ legacyId: 1, name: 'Main', legacySource: 'realm' }],
    });

    const result = await readRealmLegacyAccountIds();

    expect(result).toEqual([legacyIdToUuid('account', 1)]);
  });

  it('excludes server-mirrored (online) accounts, matching what importLocalMigrationPayload() actually imports', async () => {
    mocks.readRealmData.mockResolvedValue({
      ...emptyRealmPayload(),
      accounts: [
        { legacyId: 1, name: 'Local', legacySource: 'realm' },
        { legacyId: 2, name: 'Shared Online', onlineId: 200, legacySource: 'realm' },
      ],
    });

    const result = await readRealmLegacyAccountIds();

    // Only the local account is a candidate the importer would ever have
    // created a Dexie row for — an online account must never show up here,
    // or it reads back as "missing" forever.
    expect(result).toEqual([legacyIdToUuid('account', 1)]);
  });

  it('excludes blank-name accounts, matching what importLocalMigrationPayload() actually imports', async () => {
    mocks.readRealmData.mockResolvedValue({
      ...emptyRealmPayload(),
      accounts: [
        { legacyId: 1, name: 'Main', legacySource: 'realm' },
        { legacyId: 2, name: '   ', legacySource: 'realm' },
      ],
    });

    const result = await readRealmLegacyAccountIds();

    expect(result).toEqual([legacyIdToUuid('account', 1)]);
  });
});
