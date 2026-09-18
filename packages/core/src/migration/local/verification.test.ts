import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { MigrationPayload } from './local-legacy-types.js';

const mocks = vi.hoisted(() => {
  const preferences = new Map<string, string>();
  const dexieAccountIds = new Set<string>();
  const tables = {
    transactions: [] as any[],
    limits: [] as any[],
    recurringItems: [] as any[],
    savingsGoals: [] as any[],
    templates: [] as any[],
  };

  return {
    platform: 'android' as string,
    preferences,
    dexieAccountIds,
    tables,
    legacyAccountIds: [] as string[],
    fetchLegacyData: vi.fn<() => Promise<MigrationPayload>>(),
    preferencesGet: vi.fn(async ({ key }: { key: string }) => ({
      value: preferences.get(key) ?? null,
    })),
    preferencesSet: vi.fn(async ({ key, value }: { key: string; value: string }) => {
      preferences.set(key, value);
    }),
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
    remove: vi.fn(async () => undefined),
  },
}));

vi.mock('./android-reader.js', () => ({
  readAndroidLegacyAccountIds: vi.fn(async () => mocks.legacyAccountIds),
}));

vi.mock('./ios-reader.js', () => ({
  readiOSLegacyAccountIds: vi.fn(async () => mocks.legacyAccountIds),
}));

vi.mock('./orchestrator.js', () => ({
  fetchLegacyData: mocks.fetchLegacyData,
}));

function makeAccountTable(entity: keyof typeof mocks.tables) {
  return {
    where: (_key: string) => ({
      equals: (accountId: string) => ({
        toArray: async () => mocks.tables[entity].filter((row) => row.accountId === accountId),
      }),
    }),
  };
}

vi.mock('../../db/index.js', () => ({
  db: {
    accounts: {
      get: async (id: string) => (mocks.dexieAccountIds.has(id) ? { id } : undefined),
    },
    get transactions() { return makeAccountTable('transactions'); },
    get limits() { return makeAccountTable('limits'); },
    get recurringItems() { return makeAccountTable('recurringItems'); },
    get savingsGoals() { return makeAccountTable('savingsGoals'); },
    get templates() { return makeAccountTable('templates'); },
  },
}));

import {
  MIGRATION_VERIFICATION_CHECKED_KEY,
  hasCheckedMigrationVerification,
  resolveLocalMigrationVerification,
  verifyLocalMigrationState,
} from './verification.js';

function emptyPayload(): MigrationPayload {
  return {
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
}

const ACCOUNT_ID = 'legacy-account-1';

beforeEach(() => {
  mocks.platform = 'android';
  mocks.preferences.clear();
  mocks.dexieAccountIds.clear();
  mocks.legacyAccountIds = [];
  mocks.tables.transactions = [];
  mocks.tables.limits = [];
  mocks.tables.recurringItems = [];
  mocks.tables.savingsGoals = [];
  mocks.tables.templates = [];
  mocks.fetchLegacyData.mockReset();
  mocks.fetchLegacyData.mockResolvedValue(emptyPayload());
});

describe('verifyLocalMigrationState', () => {
  it('classifies web/non-native platforms as fresh without reading anything', async () => {
    mocks.platform = 'web';
    mocks.legacyAccountIds = [ACCOUNT_ID];

    const result = await verifyLocalMigrationState();

    expect(result).toEqual({ classification: 'fresh', accounts: [] });
    expect(mocks.fetchLegacyData).not.toHaveBeenCalled();
  });

  it('classifies as fresh when the device has no legacy accounts at all', async () => {
    mocks.legacyAccountIds = [];

    const result = await verifyLocalMigrationState();

    expect(result).toEqual({ classification: 'fresh', accounts: [] });
    expect(mocks.fetchLegacyData).not.toHaveBeenCalled();
  });

  it('classifies as skipped-unmigrated when legacy accounts exist but none are in Dexie (Tier 1 only)', async () => {
    mocks.legacyAccountIds = [ACCOUNT_ID];
    // Intentionally not added to mocks.dexieAccountIds.

    const result = await verifyLocalMigrationState();

    expect(result.classification).toBe('skipped-unmigrated');
    expect(result.accounts).toEqual([{ accountId: ACCOUNT_ID, status: 'missing', details: [] }]);
    // Tier 1 must short-circuit — no per-account legacy database read.
    expect(mocks.fetchLegacyData).not.toHaveBeenCalled();
  });

  it('classifies as migrated when the account exists and every last element matches (Tier 2)', async () => {
    mocks.legacyAccountIds = [ACCOUNT_ID];
    mocks.dexieAccountIds.add(ACCOUNT_ID);
    mocks.fetchLegacyData.mockResolvedValue({
      ...emptyPayload(),
      transactions: [
        { id: 't1', accountId: ACCOUNT_ID, categoryId: 'c1', amount: 100, date: '2026-01-01T00:00:00.000Z', title: 'Lunch', legacyId: 1, legacySource: 'room' },
      ],
      limits: [
        { id: 'l1', accountId: ACCOUNT_ID, categoryId: 'c1', amount: 50, legacyId: 1, legacySource: 'room' },
      ],
    });
    mocks.tables.transactions = [
      { id: 'dex-t1', accountId: ACCOUNT_ID, amount: 100, date: '2026-01-01T00:00:00.000Z', title: 'Lunch' },
    ];
    mocks.tables.limits = [{ id: 'dex-l1', accountId: ACCOUNT_ID, categoryId: 'different-category', amount: 50 }];

    const result = await verifyLocalMigrationState();

    expect(result.classification).toBe('migrated');
    expect(result.accounts).toHaveLength(1);
    expect(result.accounts[0].status).toBe('verified');
    const txDetail = result.accounts[0].details.find((d) => d.entity === 'transactions');
    expect(txDetail).toEqual({ entity: 'transactions', legacyCount: 1, lastElementPresent: true });
  });

  it('classifies as partial when the last legacy transaction has no Dexie match', async () => {
    mocks.legacyAccountIds = [ACCOUNT_ID];
    mocks.dexieAccountIds.add(ACCOUNT_ID);
    mocks.fetchLegacyData.mockResolvedValue({
      ...emptyPayload(),
      transactions: [
        { id: 't1', accountId: ACCOUNT_ID, categoryId: 'c1', amount: 100, date: '2026-01-01T00:00:00.000Z', title: 'Lunch', legacyId: 1, legacySource: 'room' },
        { id: 't2', accountId: ACCOUNT_ID, categoryId: 'c1', amount: 200, date: '2026-01-02T00:00:00.000Z', title: 'Groceries', legacyId: 2, legacySource: 'room' },
      ],
    });
    // Only the first transaction (not the last) has a Dexie match.
    mocks.tables.transactions = [
      { id: 'dex-t1', accountId: ACCOUNT_ID, amount: 100, date: '2026-01-01T00:00:00.000Z', title: 'Lunch' },
    ];

    const result = await verifyLocalMigrationState();

    expect(result.classification).toBe('partial');
    expect(result.accounts[0].status).toBe('partial');
    const txDetail = result.accounts[0].details.find((d) => d.entity === 'transactions');
    expect(txDetail).toEqual({ entity: 'transactions', legacyCount: 2, lastElementPresent: false });
  });

  it('does not check deleted legacy rows when picking the "last" element', async () => {
    mocks.legacyAccountIds = [ACCOUNT_ID];
    mocks.dexieAccountIds.add(ACCOUNT_ID);
    mocks.fetchLegacyData.mockResolvedValue({
      ...emptyPayload(),
      transactions: [
        { id: 't1', accountId: ACCOUNT_ID, categoryId: 'c1', amount: 100, date: '2026-01-01T00:00:00.000Z', title: 'Lunch', legacyId: 1, legacySource: 'room' },
        { id: 't2', accountId: ACCOUNT_ID, categoryId: 'c1', amount: 999, date: '2026-01-09T00:00:00.000Z', title: 'Deleted row', legacyId: 2, legacySource: 'room', isDeleted: true },
      ],
    });
    mocks.tables.transactions = [
      { id: 'dex-t1', accountId: ACCOUNT_ID, amount: 100, date: '2026-01-01T00:00:00.000Z', title: 'Lunch' },
    ];

    const result = await verifyLocalMigrationState();

    expect(result.classification).toBe('migrated');
    const txDetail = result.accounts[0].details.find((d) => d.entity === 'transactions');
    expect(txDetail).toEqual({ entity: 'transactions', legacyCount: 1, lastElementPresent: true });
  });

  it('matches by id even when content drifted after import (e.g. the user later edited the title)', async () => {
    mocks.legacyAccountIds = [ACCOUNT_ID];
    mocks.dexieAccountIds.add(ACCOUNT_ID);
    mocks.fetchLegacyData.mockResolvedValue({
      ...emptyPayload(),
      transactions: [
        { id: 'tx-uuid-1', accountId: ACCOUNT_ID, categoryId: 'c1', amount: 100, date: '2026-01-01T00:00:00.000Z', title: 'Lunch', legacyId: 1, legacySource: 'room' },
      ],
    });
    // Same id as the legacy row, but every content field has since changed —
    // content matching alone would report this as missing.
    mocks.tables.transactions = [
      { id: 'tx-uuid-1', accountId: ACCOUNT_ID, amount: 999, date: '2026-06-01T00:00:00.000Z', title: 'Renamed' },
    ];

    const result = await verifyLocalMigrationState();

    expect(result.classification).toBe('migrated');
    const txDetail = result.accounts[0].details.find((d) => d.entity === 'transactions');
    expect(txDetail?.lastElementPresent).toBe(true);
  });

  it('does not flag a genuinely-successful import as partial merely because the legacy reader normalized dates/whitespace differently at import time than on this live re-read (#464)', async () => {
    mocks.legacyAccountIds = [ACCOUNT_ID];
    mocks.dexieAccountIds.add(ACCOUNT_ID);
    mocks.fetchLegacyData.mockResolvedValue({
      ...emptyPayload(),
      transactions: [
        // Live re-read produces a different id (frozen Dexie row predates a
        // reader change) and a full-timestamp date; amount has float noise.
        { id: 'tx-live-id', accountId: ACCOUNT_ID, categoryId: 'c1', amount: 12.005, date: '2026-01-01T14:32:00.000Z', title: '  lunch  ', legacyId: 1, legacySource: 'room' },
      ],
    });
    mocks.tables.transactions = [
      { id: 'tx-old-id', accountId: ACCOUNT_ID, amount: 12.01, date: '2026-01-01T00:00:00.000Z', title: 'Lunch' },
    ];

    const result = await verifyLocalMigrationState();

    expect(result.classification).toBe('migrated');
    const txDetail = result.accounts[0].details.find((d) => d.entity === 'transactions');
    expect(txDetail?.lastElementPresent).toBe(true);
  });

  it('does not trust an ambiguous content match in duplicate-affected populations (#457/#465/#462) — a genuine miss must still report partial', async () => {
    mocks.legacyAccountIds = [ACCOUNT_ID];
    mocks.dexieAccountIds.add(ACCOUNT_ID);
    mocks.fetchLegacyData.mockResolvedValue({
      ...emptyPayload(),
      transactions: [
        { id: 'tx-never-imported', accountId: ACCOUNT_ID, categoryId: 'c1', amount: 500, date: '2026-01-01T00:00:00.000Z', title: 'Rent', legacyId: 1, legacySource: 'room' },
      ],
    });
    // Two domain rows already share this exact content signature (e.g. from
    // an earlier duplicate-import bug) — neither is actually the legacy row
    // above (different, unrelated ids). Content alone would trivially
    // "pass" here even though this account's import never actually ran.
    mocks.tables.transactions = [
      { id: 'dup-1', accountId: ACCOUNT_ID, amount: 500, date: '2026-01-01T00:00:00.000Z', title: 'Rent' },
      { id: 'dup-2', accountId: ACCOUNT_ID, amount: 500, date: '2026-01-01T00:00:00.000Z', title: 'Rent' },
    ];

    const result = await verifyLocalMigrationState();

    expect(result.classification).toBe('partial');
    const txDetail = result.accounts[0].details.find((d) => d.entity === 'transactions');
    expect(txDetail?.lastElementPresent).toBe(false);
  });

  it('reports mixed missing/present accounts as partial', async () => {
    const secondAccountId = 'legacy-account-2';
    mocks.legacyAccountIds = [ACCOUNT_ID, secondAccountId];
    mocks.dexieAccountIds.add(ACCOUNT_ID);
    // secondAccountId is intentionally absent from Dexie.

    const result = await verifyLocalMigrationState();

    expect(result.classification).toBe('partial');
    const statuses = Object.fromEntries(result.accounts.map((a) => [a.accountId, a.status]));
    expect(statuses).toEqual({ [ACCOUNT_ID]: 'verified', [secondAccountId]: 'missing' });
  });
});

function flushMicrotasks() {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

describe('resolveLocalMigrationVerification', () => {
  it('returns none and persists the flag when there is nothing to migrate (fresh)', async () => {
    mocks.legacyAccountIds = [];

    expect(await hasCheckedMigrationVerification()).toBe(false);

    const outcome = await resolveLocalMigrationVerification();

    expect(outcome).toBe('none');
    expect(mocks.preferences.get(MIGRATION_VERIFICATION_CHECKED_KEY)).toBe('true');
    expect(mocks.fetchLegacyData).not.toHaveBeenCalled();
  });

  it('returns remediate when Tier 1 conclusively shows a pre-4.5.0 skip, without ever reading the full payload', async () => {
    mocks.legacyAccountIds = [ACCOUNT_ID];
    // Intentionally not added to mocks.dexieAccountIds — simulates a device
    // whose migration_performed flag is true but nothing was ever imported.

    const outcome = await resolveLocalMigrationVerification();

    expect(outcome).toBe('remediate');
    // Deciding to remediate must never itself read legacy entity data —
    // that's the caller's job once it resets the flag and re-enters the
    // normal migration flow.
    expect(mocks.fetchLegacyData).not.toHaveBeenCalled();
  });

  it('does not burn the one-shot flag on a remediate decision — a kill before the caller resets the migration flag must not strand the device', async () => {
    mocks.legacyAccountIds = [ACCOUNT_ID];

    const outcome = await resolveLocalMigrationVerification();
    expect(outcome).toBe('remediate');

    // The flag must still be unset: if the app were killed right here,
    // before the caller ever calls resetMigrationFlag(), the next launch
    // has to be able to re-run this same decision rather than finding the
    // one-shot check already spent with nothing done about it.
    expect(await hasCheckedMigrationVerification()).toBe(false);

    // Simulating that re-run (as if this were the next launch) reaches the
    // same conclusion again rather than silently no-op'ing as "already
    // checked".
    const secondOutcome = await resolveLocalMigrationVerification();
    expect(secondOutcome).toBe('remediate');
  });

  it('returns none without remediating when the legacy account already exists in Dexie (genuine successful migration)', async () => {
    mocks.legacyAccountIds = [ACCOUNT_ID];
    mocks.dexieAccountIds.add(ACCOUNT_ID);

    const onAnomalyDetected = vi.fn();
    const outcome = await resolveLocalMigrationVerification(onAnomalyDetected);
    await flushMicrotasks();

    expect(outcome).toBe('none');
    expect(onAnomalyDetected).not.toHaveBeenCalled();
  });

  it('reports partial via the callback in the background without ever remediating', async () => {
    mocks.legacyAccountIds = [ACCOUNT_ID];
    mocks.dexieAccountIds.add(ACCOUNT_ID);
    mocks.fetchLegacyData.mockResolvedValue({
      ...emptyPayload(),
      transactions: [
        { id: 't1', accountId: ACCOUNT_ID, categoryId: 'c1', amount: 100, date: '2026-01-01T00:00:00.000Z', title: 'Lunch', legacyId: 1, legacySource: 'room' },
      ],
    });
    // No matching Dexie transaction — last-element check fails -> partial.

    const onAnomalyDetected = vi.fn();
    const outcome = await resolveLocalMigrationVerification(onAnomalyDetected);

    // The decision itself is synchronous/immediate — Tier 2 runs after.
    expect(outcome).toBe('none');

    await flushMicrotasks();

    expect(onAnomalyDetected).toHaveBeenCalledTimes(1);
    expect(onAnomalyDetected.mock.calls[0][0].classification).toBe('partial');
  });

  it('only ever runs once per install', async () => {
    mocks.legacyAccountIds = [ACCOUNT_ID];

    const first = await resolveLocalMigrationVerification();
    expect(first).toBe('remediate');

    mocks.legacyAccountIds = []; // irrelevant — should never be read again
    const second = await resolveLocalMigrationVerification();
    expect(second).toBe('none');
  });
});
