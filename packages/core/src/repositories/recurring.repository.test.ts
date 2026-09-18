import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import 'fake-indexeddb/auto';
import { RecurringRepository } from './recurring.repository.js';
import { db } from '../db/database.js';
import type { RecurringItem } from '../types/index.js';

// Suppress Dexie lifecycle console.log messages during tests
vi.spyOn(console, 'log').mockImplementation(() => {});

describe('RecurringRepository', () => {
  let repository: RecurringRepository;

  beforeEach(async () => {
    // Reset database before each test
    await db.delete();
    await db.open();
    repository = new RecurringRepository();
  });

  afterEach(async () => {
    await db.close();
  });

  describe('getDueItems', () => {
    it('should return recurring items that are due on the specified date', async () => {
      // Add test recurring items
      const mockRecurringItems: RecurringItem[] = [
        {
          id: '1',
          accountId: 'account-1',
          name: 'Rent',
          amount: 1000,
          categoryId: 'housing',
          type: 'expense',
          frequency: 'monthly',
          startDate: '2024-01-31', // January 31st
        },
        {
          id: '2',
          accountId: 'account-1',
          name: 'Salary',
          amount: 3000,
          categoryId: 'income',
          type: 'income',
          frequency: 'monthly',
          startDate: '2024-01-15', // January 15th
        },
      ];

      await db.recurringItems.bulkAdd(mockRecurringItems);

      // Test February 29th (should trigger rent due to month-end logic)
      const dueItemsFeb29 = await repository.getDueItems('2024-02-29', 'account-1');
      expect(dueItemsFeb29).toHaveLength(1);
      expect(dueItemsFeb29[0].id).toBe('1'); // Rent should be due

      // Test February 15th (should trigger salary on exact date)
      const dueItemsFeb15 = await repository.getDueItems('2024-02-15', 'account-1');
      expect(dueItemsFeb15).toHaveLength(1);
      expect(dueItemsFeb15[0].id).toBe('2'); // Salary should be due

      // Test March 31st (should trigger rent on exact date)
      const dueItemsMar31 = await repository.getDueItems('2024-03-31', 'account-1');
      expect(dueItemsMar31).toHaveLength(1);
      expect(dueItemsMar31[0].id).toBe('1'); // Rent should be due

      // Test April 30th (should trigger rent due to 30-day month)
      const dueItemsApr30 = await repository.getDueItems('2024-04-30', 'account-1');
      expect(dueItemsApr30).toHaveLength(1);
      expect(dueItemsApr30[0].id).toBe('1'); // Rent should be due
    });

    it('should handle leap year February 29th correctly', async () => {
      const mockRecurringItems: RecurringItem[] = [
        {
          id: '1',
          accountId: 'account-1',
          name: 'Monthly Fee',
          amount: 50,
          categoryId: 'fees',
          type: 'expense',
          frequency: 'monthly',
          startDate: '2024-02-29', // February 29th (leap year)
        },
      ];

      await db.recurringItems.bulkAdd(mockRecurringItems);

      // Test March 29th (should trigger on exact date)
      const dueItemsMar29 = await repository.getDueItems('2024-03-29', 'account-1');
      expect(dueItemsMar29).toHaveLength(1);

      // Test February 28th in non-leap year (should trigger due to month-end logic)
      const dueItemsFeb28_2025 = await repository.getDueItems('2025-02-28', 'account-1');
      expect(dueItemsFeb28_2025).toHaveLength(1);
    });

    it('should return empty array for dates before start date', async () => {
      const mockRecurringItems: RecurringItem[] = [
        {
          id: '1',
          accountId: 'account-1',
          name: 'Future Item',
          amount: 100,
          categoryId: 'misc',
          type: 'expense',
          frequency: 'monthly',
          startDate: '2024-03-01', // Future date
        },
      ];

      await db.recurringItems.bulkAdd(mockRecurringItems);

      // Query for February (before start date)
      const dueItems = await repository.getDueItems('2024-02-15', 'account-1');
      expect(dueItems).toHaveLength(0);
    });

    it('should filter by account ID', async () => {
      const mockRecurringItems: RecurringItem[] = [
        {
          id: '1',
          accountId: 'account-1',
          name: 'Account 1 Item',
          amount: 100,
          categoryId: 'misc',
          type: 'expense',
          frequency: 'monthly',
          startDate: '2024-01-15',
        },
        {
          id: '2',
          accountId: 'account-2',
          name: 'Account 2 Item',
          amount: 200,
          categoryId: 'misc',
          type: 'expense',
          frequency: 'monthly',
          startDate: '2024-01-15',
        },
      ];

      await db.recurringItems.bulkAdd(mockRecurringItems);

      // Query for account-1
      const dueItemsAccount1 = await repository.getDueItems('2024-02-15', 'account-1');
      expect(dueItemsAccount1).toHaveLength(1);
      expect(dueItemsAccount1[0].accountId).toBe('account-1');

      // Query for account-2
      const dueItemsAccount2 = await repository.getDueItems('2024-02-15', 'account-2');
      expect(dueItemsAccount2).toHaveLength(1);
      expect(dueItemsAccount2[0].accountId).toBe('account-2');
    });
  });
});
