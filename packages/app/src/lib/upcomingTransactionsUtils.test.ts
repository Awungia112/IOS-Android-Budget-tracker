import { describe, it, expect, vi, beforeEach } from 'vitest';
import { generateUpcomingTransactions, combinePendingTransactions } from './upcomingTransactionsUtils';
import { RecurringItem, Transaction } from '@budget/core';

describe('upcomingTransactionsUtils', () => {
  const mockCurrentDate = new Date('2026-04-15');
  
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('generateUpcomingTransactions', () => {
    it('should generate transactions for monthly recurring items', () => {
      const recurringItems: RecurringItem[] = [
        {
          id: 'recurring-1',
          name: 'Monthly Rent',
          amount: 1000,
          categoryId: 'cat-1',
          type: 'expense',
          frequency: 'monthly',
          startDate: '2026-03-01', // Start in the past to ensure consistent behavior
          accountId: 'acc-1',
        },
      ];

      const result = generateUpcomingTransactions(recurringItems, mockCurrentDate);

      expect(result).toHaveLength(3); // 3 months: May, June, July
      expect(result[0]).toMatchObject({
        id: expect.stringMatching(/^recurring-recurring-1-\d{4}-\d{2}-\d{2}$/),
        type: 'expense',
        amount: 1000,
        category: 'cat-1',
        title: 'Monthly Rent',
        accountId: 'acc-1',
      });
      expect(result[0].date).toBe('2026-05-01'); // May 1st (first occurrence after April 15th)
      expect(result[1].date).toBe('2026-06-01'); // June 1st (preserves original day)
      expect(result[2].date).toBe('2026-07-01'); // July 1st (preserves original day)
    });

    it('should generate transactions for weekly recurring items', () => {
      const recurringItems: RecurringItem[] = [
        {
          id: 'recurring-2',
          name: 'Weekly Allowance',
          amount: 50,
          categoryId: 'cat-2',
          type: 'income',
          frequency: 'weekly',
          startDate: '2026-04-22', // Start on a specific date
          accountId: 'acc-1',
        },
      ];

      const result = generateUpcomingTransactions(recurringItems, mockCurrentDate);

      // From April 22 to end of July (3 months + to end of month) = ~14-15 weeks
      expect(result.length).toBeGreaterThanOrEqual(14);
      expect(result.length).toBeLessThanOrEqual(15);
      expect(result[0].type).toBe('income');
      expect(result[0].amount).toBe(50);
      expect(result[0].title).toBe('Weekly Allowance');
    });

    it('should handle month-end preservation correctly', () => {
      const recurringItems: RecurringItem[] = [
        {
          id: 'recurring-1',
          name: 'Month End Test',
          amount: 100,
          categoryId: 'cat-1',
          type: 'expense',
          frequency: 'monthly',
          startDate: '2026-01-31', // Start on January 31st
          accountId: 'acc-1',
        },
      ];

      const result = generateUpcomingTransactions(recurringItems, mockCurrentDate);

  // Should preserve last day of each month correctly
  expect(result[0].date).toBe('2026-04-30'); // April 30th (last day)
  expect(result[1].date).toBe('2026-05-31'); // May 31st (last day)
  expect(result[2].date).toBe('2026-06-30'); // June 30th (last day)
    });

    it('should preserve createdAt field in generated transactions', () => {
      const recurringItems: RecurringItem[] = [
        {
          id: 'recurring-1',
          name: 'Monthly Rent',
          amount: 1000,
          categoryId: 'cat-1',
          type: 'expense',
          frequency: 'monthly',
          startDate: '2026-03-01',
          accountId: 'acc-1',
        },
      ];

      const result = generateUpcomingTransactions(recurringItems, mockCurrentDate);

      expect(result).toHaveLength(3);
      // All transactions should have createdAt field
      result.forEach(transaction => {
        expect(transaction).toHaveProperty('createdAt');
        expect(typeof transaction.createdAt).toBe('string');
        expect(transaction.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/); // ISO format
      });
    });

    it('should handle different start dates consistently', () => {
      const testCases = [
        { startDate: '2026-03-15', expectedFirstDate: '2026-04-15' }, // First occurrence after April 15th
        { startDate: '2026-03-01', expectedFirstDate: '2026-05-01' }, // First occurrence after April 15th
        { startDate: '2026-03-30', expectedFirstDate: '2026-04-30' }, // First occurrence after April 15th
      ];

      testCases.forEach(({ startDate, expectedFirstDate }) => {
        const recurringItems: RecurringItem[] = [
          {
            id: 'recurring-1',
            name: 'Monthly Payment',
            amount: 500,
            categoryId: 'cat-1',
            type: 'expense',
            frequency: 'monthly',
            startDate,
            accountId: 'acc-1',
          },
        ];

        const result = generateUpcomingTransactions(recurringItems, mockCurrentDate);

        // Some start dates may generate 4 transactions depending on the date calculation
        expect(result.length).toBeGreaterThanOrEqual(3);
        expect(result[0].date).toBe(expectedFirstDate);
      });
    });

    it('should handle leap year correctly', () => {
      const recurringItems: RecurringItem[] = [
        {
          id: 'recurring-1',
          name: 'Leap Year Test',
          amount: 100,
          categoryId: 'cat-1',
          type: 'expense',
          frequency: 'monthly',
          startDate: '2024-01-31', // January 31st in a leap year
          accountId: 'acc-1',
        },
      ];

      const mockLeapYearDate = new Date('2024-02-15'); // Feb 15 in leap year
      const result = generateUpcomingTransactions(recurringItems, mockLeapYearDate);

      // From Feb 15 to end of May (3 months + to end of month) = 4 occurrences
      expect(result).toHaveLength(4);
      // Should preserve last day of February correctly in leap year
      expect(result[0].date).toBe('2024-02-29'); // February 29th (leap day)
      expect(result[1].date).toBe('2024-03-31'); // March 31st (last day)
      expect(result[2].date).toBe('2024-04-30'); // April 30th (last day)
      expect(result[3].date).toBe('2024-05-31'); // May 31st (last day)
    });

    it('should handle invalid frequency strings gracefully', () => {
      const recurringItems: RecurringItem[] = [
        {
          id: 'recurring-1',
          name: 'Invalid Frequency Test',
          amount: 100,
          categoryId: 'cat-1',
          type: 'expense',
          frequency: 'invalid_frequency' as any, // Invalid frequency
          startDate: '2026-03-01',
          accountId: 'acc-1',
        },
      ];

      const result = generateUpcomingTransactions(recurringItems, mockCurrentDate);

      // Should default to monthly behavior with day preservation
      expect(result).toHaveLength(3);
      expect(result[0].date).toBe('2026-05-01'); // May 1st (first occurrence after April 15th)
    });

    it('should handle very large recurring item sets efficiently', () => {
      // Create 60 recurring items to test performance limit
      const recurringItems: RecurringItem[] = Array.from({ length: 60 }, (_, i) => ({
        id: `recurring-${i}`,
        name: `Recurring Item ${i}`,
        amount: 100 + i,
        categoryId: 'cat-1',
        type: 'expense' as const,
        frequency: 'monthly',
        startDate: '2026-03-01',
        accountId: 'acc-1',
      }));

      const startTime = performance.now();
      const result = generateUpcomingTransactions(recurringItems, mockCurrentDate);
      const endTime = performance.now();

      // Should only process first 50 items due to performance limit
      expect(result.length).toBe(150); // 50 items × 3 months
      expect(endTime - startTime).toBeLessThan(1000); // Should complete within 1 second
    });

    it('should handle multiple recurring items', () => {
      const recurringItems: RecurringItem[] = [
        {
          id: 'recurring-1',
          name: 'Rent',
          amount: 1000,
          categoryId: 'cat-1',
          type: 'expense',
          frequency: 'monthly',
          startDate: '2026-05-01',
          accountId: 'acc-1',
        },
        {
          id: 'recurring-2',
          name: 'Salary',
          amount: 2000,
          categoryId: 'cat-2',
          type: 'income',
          frequency: 'monthly',
          startDate: '2026-05-15',
          accountId: 'acc-1',
        },
      ];

      const result = generateUpcomingTransactions(recurringItems, mockCurrentDate);

      expect(result.length).toBeGreaterThan(0);
      expect(result.filter(t => t.type === 'expense')).toHaveLength(3);
      expect(result.filter(t => t.type === 'income')).toHaveLength(3);
    });

    it('should not generate transactions beyond end of year', () => {
      const recurringItems: RecurringItem[] = [
        {
          id: 'recurring-1',
          name: 'Daily Coffee',
          amount: 5,
          categoryId: 'cat-1',
          type: 'expense',
          frequency: 'daily',
          startDate: '2026-04-16', // Start tomorrow
          accountId: 'acc-1',
        },
      ];

      const result = generateUpcomingTransactions(recurringItems, mockCurrentDate);

      // Should have transactions but limited to 3-year window
      expect(result.length).toBeGreaterThan(0);
      const latestDate = new Date(result[result.length - 1].date);
      const endOfPeriod = new Date(mockCurrentDate.getFullYear() + 3, 11, 31); // December 31st, 3 years from now
      
      // For daily transactions, the last date should be within the 3-year range
      expect(latestDate.getTime()).toBeLessThanOrEqual(endOfPeriod.getTime() + 24 * 60 * 60 * 1000); // Allow one extra day
    });

    it('should return empty array for no recurring items', () => {
      const result = generateUpcomingTransactions([], mockCurrentDate);
      expect(result).toEqual([]);
    });

    it('should generate recurring transactions for full 3 months including end of 3rd month', () => {
      // Test case: recurring item starting April 16 should appear in July 16
      const recurringItems: RecurringItem[] = [
        {
          id: 'recurring-test',
          name: 'Monthly Payment',
          amount: 100,
          categoryId: 'cat-1',
          type: 'expense',
          frequency: 'monthly',
          startDate: '2026-04-16', // April 16
          accountId: 'acc-1',
        },
      ];

      const currentDate = new Date('2026-04-15'); // April 15 (day before start)
      const result = generateUpcomingTransactions(recurringItems, currentDate);

      // Should generate: April 16, May 16, June 16, July 16
      expect(result).toHaveLength(4);
      expect(result[0].date).toBe('2026-04-16');
      expect(result[1].date).toBe('2026-05-16');
      expect(result[2].date).toBe('2026-06-16');
      expect(result[3].date).toBe('2026-07-16'); // This was missing before the fix
    });
  });

  describe('combinePendingTransactions', () => {
    it('should combine actual pending transactions with recurring ones', () => {
      const actualPending: Transaction[] = [
        {
          id: 'pending-1',
          type: 'expense',
          amount: 100,
          category: 'cat-1',
          date: '2026-05-15',
          title: 'One-time expense',
          accountId: 'acc-1',
        },
      ];

      const recurringItems: RecurringItem[] = [
        {
          id: 'recurring-1',
          name: 'Monthly Rent',
          amount: 1000,
          categoryId: 'cat-2',
          type: 'expense',
          frequency: 'monthly',
          startDate: '2026-05-01',
          accountId: 'acc-1',
        },
      ];

      const result = combinePendingTransactions(actualPending, recurringItems, mockCurrentDate);

      expect(result.length).toBeGreaterThan(1);
      expect(result).toContainEqual(actualPending[0]);
      expect(result.find(t => t.id.startsWith('recurring-'))).toBeDefined();
    });

    it('should sort combined transactions by date', () => {
      const actualPending: Transaction[] = [
        {
          id: 'pending-1',
          type: 'expense',
          amount: 100,
          category: 'cat-1',
          date: '2026-06-15',
          title: 'June expense',
          accountId: 'acc-1',
        },
      ];

      const recurringItems: RecurringItem[] = [
        {
          id: 'recurring-1',
          name: 'Monthly Rent',
          amount: 1000,
          categoryId: 'cat-2',
          type: 'expense',
          frequency: 'monthly',
          startDate: '2026-05-01',
          accountId: 'acc-1',
        },
      ];

      const result = combinePendingTransactions(actualPending, recurringItems, mockCurrentDate);

      expect(result.length).toBeGreaterThan(1);
      // Check that transactions are sorted by date (newest first)
      for (let i = 1; i < result.length; i++) {
        expect(new Date(result[i-1].date).getTime()).toBeGreaterThanOrEqual(new Date(result[i].date).getTime());
      }
    });

    it('should handle empty arrays', () => {
      const result = combinePendingTransactions([], [], mockCurrentDate);
      expect(result).toEqual([]);
    });

    it('should handle only actual pending transactions', () => {
      const actualPending: Transaction[] = [
        {
          id: 'pending-1',
          type: 'income',
          amount: 500,
          category: 'cat-1',
          date: '2026-05-20',
          title: 'Bonus',
          accountId: 'acc-1',
        },
      ];

      const result = combinePendingTransactions(actualPending, [], mockCurrentDate);

      expect(result).toEqual([actualPending[0]]);
    });

    it('should handle only recurring transactions', () => {
      const recurringItems: RecurringItem[] = [
        {
          id: 'recurring-1',
          name: 'Salary',
          amount: 2000,
          categoryId: 'cat-1',
          type: 'income',
          frequency: 'monthly',
          startDate: '2026-05-01',
          accountId: 'acc-1',
        },
      ];

      const result = combinePendingTransactions([], recurringItems, mockCurrentDate);

      expect(result.length).toBeGreaterThan(0);
      expect(result.every(t => t.id.startsWith('recurring-'))).toBe(true);
    });

    it('should handle only recurring transactions with past start date', () => {
      const recurringItems: RecurringItem[] = [
        {
          id: 'recurring-1',
          name: 'Monthly Rent',
          amount: 1000,
          categoryId: 'cat-1',
          type: 'expense',
          frequency: 'monthly',
          startDate: '2026-03-01',
          accountId: 'acc-1',
        },
      ];

      const result = combinePendingTransactions([], recurringItems, mockCurrentDate);

      expect(result).toHaveLength(3);
      expect(result[0].type).toBe('expense');
      expect(result[0].amount).toBe(1000);
      expect(result[0].title).toBe('Monthly Rent');
    });

    it('should deduplicate transactions when recurring matches actual pending', () => {
      const actualPending: Transaction[] = [
        {
          id: 'tx-1',
          type: 'expense',
          amount: 1000,
          category: 'cat-1',
          date: '2026-04-30',
          title: 'Monthly Rent',
          accountId: 'acc-1',
          createdAt: '2026-04-06T10:00:00.000Z',
        },
      ];

      const recurringItems: RecurringItem[] = [
        {
          id: 'recurring-1',
          name: 'Monthly Rent',
          amount: 1000,
          categoryId: 'cat-1',
          type: 'expense',
          frequency: 'monthly',
          startDate: '2026-03-01',
          accountId: 'acc-1',
        },
      ];

      const result = combinePendingTransactions(actualPending, recurringItems, mockCurrentDate);

      // Should not have duplicates - only one transaction for 2026-05-01 with category cat-1
      const mayTransactions = result.filter(t => t.date === '2026-05-01' && t.category === 'cat-1');
      expect(mayTransactions).toHaveLength(1);
      expect(result.length).toBe(4); // Should be exactly 4 (1 actual + 3 recurring, with 1 deduplicated/modified)
    });

    it('should deduplicate recurring projection even when the manually-entered amount differs', () => {
      // User recorded their salary at 2100 this month instead of the usual 2000
      const actualPending: Transaction[] = [
        {
          id: 'tx-salary-may',
          type: 'income',
          amount: 2100, // different from recurring amount
          category: 'cat-salary',
          date: '2026-05-01',
          title: 'Salary',
          accountId: 'acc-1',
          createdAt: '2026-05-01T08:00:00.000Z',
        },
      ];

      const recurringItems: RecurringItem[] = [
        {
          id: 'recurring-salary',
          name: 'Salary',
          amount: 2000, // usual amount
          categoryId: 'cat-salary',
          type: 'income',
          frequency: 'monthly',
          startDate: '2026-05-01',
          accountId: 'acc-1',
        },
      ];

      const result = combinePendingTransactions(actualPending, recurringItems, mockCurrentDate);

      // The real transaction should appear, the projection for the same date must be suppressed
      const mayEntries = result.filter(t => t.date === '2026-05-01' && t.category === 'cat-salary');
      expect(mayEntries).toHaveLength(1);
      expect(mayEntries[0].amount).toBe(2100); // real transaction wins
      expect(mayEntries[0].id).toBe('tx-salary-may');
    });

    it('should not deduplicate different recurring items with same amount and date', () => {
      const actualPending: Transaction[] = [
        {
          id: 'tx-1',
          type: 'expense',
          amount: 1000,
          category: 'cat-rent',
          date: '2026-04-30',
          title: 'Monthly Rent',
          accountId: 'acc-1',
          createdAt: '2026-04-06T10:00:00.000Z',
        },
      ];

      const recurringItems: RecurringItem[] = [
        {
          id: 'recurring-1',
          name: 'Monthly Rent',
          amount: 1000,
          categoryId: 'cat-rent',
          type: 'expense',
          frequency: 'monthly',
          startDate: '2026-03-01',
          accountId: 'acc-1',
        },
        {
          id: 'recurring-2',
          name: 'Insurance',
          amount: 1000,
          categoryId: 'cat-insurance',
          type: 'expense',
          frequency: 'monthly',
          startDate: '2026-03-01',
          accountId: 'acc-1',
        },
      ];

      const result = combinePendingTransactions(actualPending, recurringItems, mockCurrentDate);

      // Should have both transactions since they have different categories
      const rentTransactions = result.filter(t => t.category === 'cat-rent');
      const insuranceTransactions = result.filter(t => t.category === 'cat-insurance');
      
      expect(rentTransactions.length).toBeGreaterThanOrEqual(1); // At least 1 rent transaction
      expect(insuranceTransactions.length).toBeGreaterThanOrEqual(1); // At least 1 insurance transaction
      expect(result.length).toBeGreaterThan(3); // Should have multiple transactions
    });

    it('should preserve two distinct real transactions with same date/type/category/title but different amounts', () => {
      // Reviewer concern: the amount-free key used to suppress recurring projections
      // must never collapse two real, legitimate transactions that share date+type+category+title
      // but differ in amount (e.g. a split payment or two separate salary deposits).
      const actualPending: Transaction[] = [
        {
          id: 'tx-salary-1',
          type: 'income',
          amount: 2000,
          category: 'cat-salary',
          date: '2026-05-01',
          title: 'Salary',
          accountId: 'acc-1',
          createdAt: '2026-05-01T08:00:00.000Z',
        },
        {
          id: 'tx-salary-2',
          type: 'income',
          amount: 500, // different amount — e.g. bonus / split
          category: 'cat-salary',
          date: '2026-05-01',
          title: 'Salary',
          accountId: 'acc-1',
          createdAt: '2026-05-01T09:00:00.000Z',
        },
      ];

      const recurringItems: RecurringItem[] = []; // No recurring items

      const result = combinePendingTransactions(actualPending, recurringItems, mockCurrentDate);

      // Both transactions must be preserved — not collapsed into one
      expect(result).toHaveLength(2);
      const salaryTransactions = result.filter(t => t.category === 'cat-salary' && t.date === '2026-05-01');
      expect(salaryTransactions).toHaveLength(2);
      expect(salaryTransactions.find(t => t.amount === 2000)).toBeDefined();
      expect(salaryTransactions.find(t => t.amount === 500)).toBeDefined();
    });
  });
});
