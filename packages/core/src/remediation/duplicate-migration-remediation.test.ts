import { describe, expect, it, vi, beforeEach } from 'vitest';
import {
  runDuplicateMigrationRemediation,
  isRemediationDone,
  markRemediationDone,
  REMEDIATION_DONE_FLAG_KEY,
  type RemediationResult,
} from './duplicate-migration-remediation.js';
import { changeLog } from '../changelog/change-log.js';
import type { ChangeRecord, Command } from '../commands/types.js';
import type { Transaction, Category, Limit, RecurringItem, SavingsGoal, Template } from '../types/index.js';
import { Preferences } from '@capacitor/preferences';

// =============================================================================
// TEST HELPERS
// =============================================================================

function makeChangeRecord(overrides: Partial<ChangeRecord> = {}): ChangeRecord {
  return {
    id: `cr-${Math.random().toString(36).slice(2, 9)}`,
    command: {
      type: 'CREATE_TRANSACTION',
      payload: {} as any,
      timestamp: new Date().toISOString(),
      sequence: 1,
    },
    timestamp: new Date().toISOString(),
    accountId: 'account-1',
    synced: false,
    ...overrides,
  };
}

function txCommand(sequence: number, hoursAgo: number, overrides: Partial<Transaction> = {}): Command {
  const date = new Date();
  date.setHours(date.getHours() - hoursAgo);
  const dateStr = date.toISOString().slice(0, 10);
  return {
    type: 'CREATE_TRANSACTION',
    payload: {
      id: `tx-${sequence}`,
      type: 'expense',
      amount: 100,
      category: 'cat-food',
      date: dateStr,
      title: 'Groceries',
      accountId: 'account-1',
      ...overrides,
    } as Transaction,
    timestamp: date.toISOString(),
    sequence,
  };
}

function catCommand(sequence: number, hoursAgo: number, overrides: Partial<Category> = {}): Command {
  const date = new Date();
  date.setHours(date.getHours() - hoursAgo);
  return {
    type: 'CREATE_CATEGORY',
    payload: {
      id: `cat-${sequence}`,
      name: 'Food',
      type: 'expense',
      isDefault: false,
      accountId: 'account-1',
      ...overrides,
    } as Category,
    timestamp: date.toISOString(),
    sequence,
  };
}

function bulkCatCommand(sequence: number, hoursAgo: number, categories: Category[]): Command {
  const date = new Date();
  date.setHours(date.getHours() - hoursAgo);
  return {
    type: 'BULK_CREATE_CATEGORIES',
    payload: { categories },
    timestamp: date.toISOString(),
    sequence,
  };
}

// =============================================================================
// MOCKS
// =============================================================================

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

// =============================================================================
// TESTS
// =============================================================================

describe('duplicate-migration-remediation', () => {
  beforeEach(() => {
    preferenceStore.clear();
    vi.clearAllMocks();
  });

  describe('runDuplicateMigrationRemediation', () => {
    it('returns zero counts when no accounts exist', async () => {
      const result = await runDuplicateMigrationRemediation(() => Promise.resolve([]));
      expect(result).toMatchObject({
        accountsAnalyzed: 0,
        accountsWithClusters: 0,
        totalClusters: 0,
        totalDuplicateHashes: 0,
        duplicateMatches: [],
        wasCapped: false,
      });
    });

    it('skips accounts with empty changelogs', async () => {
      const mockChangeLog = vi.spyOn(changeLog, 'getByAccountId').mockResolvedValue([]);

      const result = await runDuplicateMigrationRemediation(() =>
        Promise.resolve([{ id: 'account-1' }]),
      );

      expect(result.accountsAnalyzed).toBe(0);
      expect(mockChangeLog).toHaveBeenCalledWith('account-1');
    });

    it('skips accounts with only one cluster', async () => {
      const records = [
        makeChangeRecord({
          accountId: 'account-1',
          command: txCommand(1, 2),
        }),
        makeChangeRecord({
          accountId: 'account-1',
          command: txCommand(2, 2),
        }),
      ];

      vi.spyOn(changeLog, 'getByAccountId').mockResolvedValue(records);

      const result = await runDuplicateMigrationRemediation(() =>
        Promise.resolve([{ id: 'account-1' }]),
      );

      expect(result.accountsWithClusters).toBe(0);
      expect(result.totalDuplicateHashes).toBe(0);
    });

    it('skips clusters that predate the bug window', async () => {
      const records = [
        makeChangeRecord({
          accountId: 'account-1',
          command: txCommand(1, 720), // 30 days ago — before bug window
        }),
        makeChangeRecord({
          accountId: 'account-1',
          command: txCommand(2, 720),
        }),
        makeChangeRecord({
          accountId: 'account-1',
          command: txCommand(3, 1), // 1 hour ago — after bug window
        }),
        makeChangeRecord({
          accountId: 'account-1',
          command: txCommand(4, 1),
        }),
      ];

      vi.spyOn(changeLog, 'getByAccountId').mockResolvedValue(records);

      const result = await runDuplicateMigrationRemediation(() =>
        Promise.resolve([{ id: 'account-1' }]),
      );

      // Two post-bug-window records form one cluster (gap < 60s) → skipped
      expect(result.accountsWithClusters).toBe(0);
    });

    it('detects duplicate transactions across two post-bug-window clusters', async () => {
      const baseDate = new Date();
      baseDate.setHours(baseDate.getHours() - 1);

      const cluster1Time = new Date(baseDate.getTime() - 2 * 60 * 60 * 1000); // 2 hours ago
      const cluster2Time = new Date(baseDate.getTime() - 30 * 60 * 1000); // 30 mins ago (> 60s gap)

      const records: ChangeRecord[] = [
        makeChangeRecord({
          accountId: 'account-1',
          command: {
            type: 'CREATE_TRANSACTION',
            payload: {
              id: 'tx-1',
              type: 'expense',
              amount: 100,
              category: 'cat-food',
              date: '2026-07-30',
              title: 'Groceries',
              accountId: 'account-1',
            } as Transaction,
            timestamp: new Date(cluster1Time.getTime()).toISOString(),
            sequence: 1,
          },
          timestamp: new Date(cluster1Time.getTime()).toISOString(),
        }),
        makeChangeRecord({
          accountId: 'account-1',
          command: {
            type: 'CREATE_TRANSACTION',
            payload: {
              id: 'tx-2',
              type: 'expense',
              amount: 200,
              category: 'cat-food',
              date: '2026-07-30',
              title: 'Rent',
              accountId: 'account-1',
            } as Transaction,
            timestamp: new Date(cluster1Time.getTime() + 1000).toISOString(),
            sequence: 2,
          },
          timestamp: new Date(cluster1Time.getTime() + 1000).toISOString(),
        }),
        makeChangeRecord({
          accountId: 'account-1',
          command: {
            type: 'CREATE_TRANSACTION',
            payload: {
              // #470 makes legacy-derived IDs deterministic: the re-imported
              // duplicate row carries the SAME id as the original.
              id: 'tx-1',
              type: 'expense',
              amount: 100,
              category: 'cat-food',
              date: '2026-07-30',
              title: 'Groceries',
              accountId: 'account-1',
            } as Transaction,
            timestamp: new Date(cluster2Time.getTime()).toISOString(),
            sequence: 3,
          },
          timestamp: new Date(cluster2Time.getTime()).toISOString(),
        }),
      ];

      vi.spyOn(changeLog, 'getByAccountId').mockResolvedValue(records);

      const result = await runDuplicateMigrationRemediation(() =>
        Promise.resolve([{ id: 'account-1' }]),
      );

      expect(result.accountsWithClusters).toBe(1);
      expect(result.totalClusters).toBe(2);
      expect(result.totalDuplicateHashes).toBe(1);
      expect(result.duplicateMatches).toHaveLength(1);
      expect(result.duplicateMatches[0]).toMatchObject({
        accountId: 'account-1',
        entityType: 'CREATE_TRANSACTION',
        entityId: 'tx-1',
        originalSequence: 1,
        duplicateSequence: 3,
      });
    });

    it('does not flag unique data in later clusters', async () => {
      const cluster1Time = new Date(Date.now() - 2 * 60 * 60 * 1000);
      const cluster2Time = new Date(Date.now() - 30 * 60 * 1000);

      const records: ChangeRecord[] = [
        makeChangeRecord({
          accountId: 'account-1',
          command: {
            type: 'CREATE_TRANSACTION',
            payload: {
              id: 'tx-1',
              type: 'expense',
              amount: 100,
              category: 'cat-food',
              date: '2026-07-30',
              title: 'Groceries',
              accountId: 'account-1',
            } as Transaction,
            timestamp: new Date(cluster1Time.getTime()).toISOString(),
            sequence: 1,
          },
          timestamp: new Date(cluster1Time.getTime()).toISOString(),
        }),
        makeChangeRecord({
          accountId: 'account-1',
          command: {
            type: 'CREATE_TRANSACTION',
            payload: {
              id: 'tx-2',
              type: 'expense',
              amount: 200,
              category: 'cat-food',
              date: '2026-07-30',
              title: 'Rent',
              accountId: 'account-1',
            } as Transaction,
            timestamp: new Date(cluster2Time.getTime()).toISOString(),
            sequence: 2,
          },
          timestamp: new Date(cluster2Time.getTime()).toISOString(),
        }),
      ];

      vi.spyOn(changeLog, 'getByAccountId').mockResolvedValue(records);

      const result = await runDuplicateMigrationRemediation(() =>
        Promise.resolve([{ id: 'account-1' }]),
      );

      expect(result.totalDuplicateHashes).toBe(0);
      expect(result.duplicateMatches).toHaveLength(0);
    });

    it('expands BULK_CREATE_CATEGORIES into individual category hashes', async () => {
      const cluster1Time = new Date(Date.now() - 2 * 60 * 60 * 1000);
      const cluster2Time = new Date(Date.now() - 30 * 60 * 1000);

      const categories: Category[] = [
        { id: 'cat-food', name: 'Food', type: 'expense', isDefault: false, accountId: 'account-1' },
      ];

      const records: ChangeRecord[] = [
        makeChangeRecord({
          accountId: 'account-1',
          command: {
            type: 'BULK_CREATE_CATEGORIES',
            payload: { categories },
            timestamp: new Date(cluster1Time.getTime()).toISOString(),
            sequence: 1,
          },
          timestamp: new Date(cluster1Time.getTime()).toISOString(),
        }),
        makeChangeRecord({
          accountId: 'account-1',
          command: catCommand(2, 0.5, { id: 'cat-food', name: 'Food' }),
        }),
      ];

      vi.spyOn(changeLog, 'getByAccountId').mockResolvedValue(records);

      const result = await runDuplicateMigrationRemediation(() =>
        Promise.resolve([{ id: 'account-1' }]),
      );

      expect(result.totalDuplicateHashes).toBe(1);
      expect(result.duplicateMatches[0].entityType).toBe('CREATE_CATEGORY');
    });

    it('does not flag duplicates within the first cluster, but flags them in subsequent clusters', async () => {
      const cluster1Time = new Date(Date.now() - 2 * 60 * 60 * 1000);
      const cluster2Time = new Date(Date.now() - 30 * 60 * 1000);

      const records: ChangeRecord[] = [
        // Cluster 1: Two identical transactions
        makeChangeRecord({
          accountId: 'account-1',
          command: {
            type: 'CREATE_TRANSACTION',
            payload: {
              id: 'tx-1',
              type: 'expense',
              amount: 100,
              category: 'cat-food',
              date: '2026-07-30',
              title: 'Groceries',
              accountId: 'account-1',
            } as Transaction,
            timestamp: new Date(cluster1Time.getTime()).toISOString(),
            sequence: 1,
          },
          timestamp: new Date(cluster1Time.getTime()).toISOString(),
        }),
        makeChangeRecord({
          accountId: 'account-1',
          command: {
            type: 'CREATE_TRANSACTION',
            payload: {
              id: 'tx-2',
              type: 'expense',
              amount: 100,
              category: 'cat-food',
              date: '2026-07-30',
              title: 'Groceries',
              accountId: 'account-1',
            } as Transaction,
            timestamp: new Date(cluster1Time.getTime() + 100).toISOString(),
            sequence: 2,
          },
          timestamp: new Date(cluster1Time.getTime() + 100).toISOString(),
        }),
        // Cluster 2: One transaction identical to Cluster 1 (same deterministic id)
        makeChangeRecord({
          accountId: 'account-1',
          command: {
            type: 'CREATE_TRANSACTION',
            payload: {
              id: 'tx-1',
              type: 'expense',
              amount: 100,
              category: 'cat-food',
              date: '2026-07-30',
              title: 'Groceries',
              accountId: 'account-1',
            } as Transaction,
            timestamp: new Date(cluster2Time.getTime()).toISOString(),
            sequence: 3,
          },
          timestamp: new Date(cluster2Time.getTime()).toISOString(),
        }),
      ];

      vi.spyOn(changeLog, 'getByAccountId').mockResolvedValue(records);

      const result = await runDuplicateMigrationRemediation(() =>
        Promise.resolve([{ id: 'account-1' }]),
      );

      expect(result.accountsWithClusters).toBe(1);
      expect(result.totalDuplicateHashes).toBe(1);
      expect(result.duplicateMatches).toHaveLength(1);
      expect(result.duplicateMatches[0].entityId).toBe('tx-1');
      expect(result.duplicateMatches[0].originalSequence).toBe(1);
    });

    it('records gap distribution for telemetry', async () => {
      const cluster1Time = new Date(Date.now() - 2 * 60 * 60 * 1000);
      const cluster2Time = new Date(Date.now() - 30 * 60 * 1000);

      const records: ChangeRecord[] = [
        makeChangeRecord({
          accountId: 'account-1',
          timestamp: new Date(cluster1Time.getTime()).toISOString(),
          command: txCommand(1, 2),
        }),
        makeChangeRecord({
          accountId: 'account-1',
          timestamp: new Date(cluster1Time.getTime() + 1000).toISOString(),
          command: txCommand(2, 2),
        }),
        makeChangeRecord({
          accountId: 'account-1',
          timestamp: new Date(cluster2Time.getTime()).toISOString(),
          command: txCommand(3, 0.5),
        }),
      ];

      vi.spyOn(changeLog, 'getByAccountId').mockResolvedValue(records);

      const result = await runDuplicateMigrationRemediation(() =>
        Promise.resolve([{ id: 'account-1' }]),
      );

      expect(result.gapDistribution.betweenClusters.length).toBeGreaterThan(0);
      expect(result.gapDistribution.withinClusters.length).toBeGreaterThan(0);
    });

    it('caps records and clusters on large datasets', async () => {
      const records: ChangeRecord[] = [];
      const now = Date.now();
      for (let i = 0; i < 60000; i++) {
        records.push(makeChangeRecord({
          accountId: 'account-1',
          command: txCommand(i, 1, { id: `tx-${i}` }),
        }));
      }

      vi.spyOn(changeLog, 'getByAccountId').mockResolvedValue(records);

      const result = await runDuplicateMigrationRemediation(() =>
        Promise.resolve([{ id: 'account-1' }]),
      );

      expect(result.wasCapped).toBe(true);
    });

    it('analyzes multiple accounts independently', async () => {
      const cluster1Time = new Date(Date.now() - 2 * 60 * 60 * 1000);
      const cluster2Time = new Date(Date.now() - 30 * 60 * 1000);

      const makeRecord = (accountId: string, seq: number, hoursAgo: number): ChangeRecord =>
        makeChangeRecord({
          accountId,
          timestamp: new Date(Date.now() - hoursAgo * 60 * 60 * 1000).toISOString(),
          command: txCommand(seq, hoursAgo, { accountId }),
        });

      const recordsA: ChangeRecord[] = [
        makeRecord('account-a', 1, 2),
        makeRecord('account-a', 2, 2),
        makeRecord('account-a', 3, 0.5),
      ];

      const recordsB: ChangeRecord[] = [
        makeRecord('account-b', 1, 2),
        makeRecord('account-b', 2, 2),
        makeRecord('account-b', 3, 0.5),
      ];

      vi.spyOn(changeLog, 'getByAccountId')
        .mockResolvedValueOnce(recordsA)
        .mockResolvedValueOnce(recordsB);

      const result = await runDuplicateMigrationRemediation(() =>
        Promise.resolve([
          { id: 'account-a' },
          { id: 'account-b' },
        ]),
      );

      expect(result.accountsAnalyzed).toBe(2);
      expect(result.accountsWithClusters).toBe(2);
    });

    it('handles categories, limits, recurring, savings goals, and templates', async () => {
      const cluster1Time = new Date(Date.now() - 2 * 60 * 60 * 1000);
      const cluster2Time = new Date(Date.now() - 30 * 60 * 1000);

      const records: ChangeRecord[] = [
        makeChangeRecord({
          accountId: 'account-1',
          command: {
            type: 'CREATE_LIMIT',
            payload: { id: 'lim-1', amount: 500, categoryId: 'cat-food', accountId: 'account-1' } as Limit,
            timestamp: new Date(cluster1Time.getTime()).toISOString(),
            sequence: 1,
          },
          timestamp: new Date(cluster1Time.getTime()).toISOString(),
        }),
        makeChangeRecord({
          accountId: 'account-1',
          command: {
            type: 'CREATE_RECURRING',
            payload: {
              id: 'rec-1',
              name: 'Rent',
              amount: 800,
              categoryId: 'cat-rent',
              type: 'expense',
              frequency: 'monthly',
              startDate: '2026-07-01',
              accountId: 'account-1',
            } as RecurringItem,
            timestamp: new Date(cluster1Time.getTime() + 1000).toISOString(),
            sequence: 2,
          },
          timestamp: new Date(cluster1Time.getTime() + 1000).toISOString(),
        }),
        makeChangeRecord({
          accountId: 'account-1',
          command: {
            type: 'CREATE_SAVINGS_GOAL',
            payload: {
              id: 'goal-1',
              name: 'Vacation',
              targetAmount: 2000,
              deadline: '2026-12-31',
              accountId: 'account-1',
            } as SavingsGoal,
            timestamp: new Date(cluster1Time.getTime() + 2000).toISOString(),
            sequence: 3,
          },
          timestamp: new Date(cluster1Time.getTime() + 2000).toISOString(),
        }),
        makeChangeRecord({
          accountId: 'account-1',
          command: {
            type: 'CREATE_TEMPLATE',
            payload: {
              id: 'tmpl-1',
              name: 'Lunch',
              amount: 12,
              categoryId: 'cat-food',
              type: 'expense',
              accountId: 'account-1',
            } as Template,
            timestamp: new Date(cluster1Time.getTime() + 3000).toISOString(),
            sequence: 4,
          },
          timestamp: new Date(cluster1Time.getTime() + 3000).toISOString(),
        }),
        // Duplicate in second cluster (same deterministic id as lim-1)
        makeChangeRecord({
          accountId: 'account-1',
          command: {
            type: 'CREATE_LIMIT',
            payload: { id: 'lim-1', amount: 500, categoryId: 'cat-food', accountId: 'account-1' } as Limit,
            timestamp: new Date(cluster2Time.getTime()).toISOString(),
            sequence: 5,
          },
          timestamp: new Date(cluster2Time.getTime()).toISOString(),
        }),
      ];

      vi.spyOn(changeLog, 'getByAccountId').mockResolvedValue(records);

      const result = await runDuplicateMigrationRemediation(() =>
        Promise.resolve([{ id: 'account-1' }]),
      );

      expect(result.totalDuplicateHashes).toBe(1);
      expect(result.duplicateMatches[0].entityType).toBe('CREATE_LIMIT');
    });
  });

  describe('isRemediationDone / markRemediationDone', () => {
    it('returns false when flag is not set', async () => {
      expect(await isRemediationDone()).toBe(false);
    });

    it('returns true after markRemediationDone', async () => {
      await markRemediationDone();
      expect(await isRemediationDone()).toBe(true);
    });

    it('uses the correct flag key', async () => {
      const mockSet = vi.mocked(Preferences.set);
      await markRemediationDone();
      expect(mockSet).toHaveBeenCalledWith({ key: REMEDIATION_DONE_FLAG_KEY, value: 'true' });
    });
  });
});
