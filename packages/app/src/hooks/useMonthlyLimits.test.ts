/**
 * @vitest-environment jsdom
 */

/**
 * useMonthlyLimits Hook Tests
 *
 * Tests for the monthly limits hook that calculates spending against limits.
 * Covers spending calculations, progress tracking, and dependency updates.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { useMonthlyLimits } from './useMonthlyLimits';
import type { Transaction, Limit } from '@budget/core';

describe('useMonthlyLimits', () => {
  // Mock data factories
  const createTransaction = (overrides: Partial<Transaction> = {}): Transaction => ({
    id: `transaction-${Date.now()}-${Math.random()}`, // nosemgrep: nodejs_scan.javascript-crypto-rule-node_insecure_random_generator -- test fixture ID, no security context
    accountId: 'account-1',
    type: 'expense',
    amount: 100,
    category: 'expense-general',
    date: '2024-06-15',
    title: 'Test Transaction',
    ...overrides,
  });

  const createLimit = (overrides: Partial<Limit> = {}): Limit => ({
    id: `limit-${Date.now()}-${Math.random()}`, // nosemgrep: nodejs_scan.javascript-crypto-rule-node_insecure_random_generator -- test fixture ID, no security context
    accountId: 'account-1',
    categoryId: 'expense-general',
    amount: 500,
    ...overrides,
  });

  beforeEach(() => {
    // Set a fixed date for consistent testing
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2024, 5, 15)); // June 15, 2024
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('getSpendingForCategory', () => {
    it('returns 0 when there are no transactions', () => {
      const limits: Limit[] = [createLimit()];
      const transactions: Transaction[] = [];

      const { result } = renderHook(() =>
        useMonthlyLimits(limits, transactions, { year: 2024, month: 5 })
      );

      expect(result.current.getSpendingForCategory('expense-general')).toBe(0);
    });

    it('sums transactions for the specified category', () => {
      const limits: Limit[] = [createLimit()];
      const transactions: Transaction[] = [
        createTransaction({ amount: 100, category: 'expense-general' }),
        createTransaction({ amount: 200, category: 'expense-general' }),
        createTransaction({ amount: 50, category: 'expense-general' }),
      ];

      const { result } = renderHook(() =>
        useMonthlyLimits(limits, transactions, { year: 2024, month: 5 })
      );

      expect(result.current.getSpendingForCategory('expense-general')).toBe(350);
    });

    it('only includes expense transactions, not income', () => {
      const limits: Limit[] = [createLimit()];
      const transactions: Transaction[] = [
        createTransaction({ amount: 100, type: 'expense', category: 'expense-general' }),
        createTransaction({ amount: 500, type: 'income', category: 'expense-general' }),
      ];

      const { result } = renderHook(() =>
        useMonthlyLimits(limits, transactions, { year: 2024, month: 5 })
      );

      expect(result.current.getSpendingForCategory('expense-general')).toBe(100);
    });

    it('only includes transactions for the specified category', () => {
      const limits: Limit[] = [createLimit()];
      const transactions: Transaction[] = [
        createTransaction({ amount: 100, category: 'expense-general' }),
        createTransaction({ amount: 200, category: 'expense-food' }),
        createTransaction({ amount: 150, category: 'expense-general' }),
      ];

      const { result } = renderHook(() =>
        useMonthlyLimits(limits, transactions, { year: 2024, month: 5 })
      );

      expect(result.current.getSpendingForCategory('expense-general')).toBe(250);
      expect(result.current.getSpendingForCategory('expense-food')).toBe(200);
    });

    it('only includes transactions within the date range', () => {
      const limits: Limit[] = [createLimit()];
      const transactions: Transaction[] = [
        createTransaction({ amount: 100, date: '2024-06-10' }), // In range
        createTransaction({ amount: 200, date: '2024-06-25' }), // In range
        createTransaction({ amount: 300, date: '2024-05-15' }), // Out of range (May)
        createTransaction({ amount: 400, date: '2024-07-05' }), // Out of range (July)
      ];

      const { result } = renderHook(() =>
        useMonthlyLimits(limits, transactions, { year: 2024, month: 5 })
      );

      expect(result.current.getSpendingForCategory('expense-general')).toBe(300);
    });

    it('includes transactions on the first day of the month', () => {
      const limits: Limit[] = [createLimit()];
      const transactions: Transaction[] = [
        createTransaction({ amount: 100, date: '2024-06-01' }),
      ];

      const { result } = renderHook(() =>
        useMonthlyLimits(limits, transactions, { year: 2024, month: 5 })
      );

      expect(result.current.getSpendingForCategory('expense-general')).toBe(100);
    });

    it('includes transactions from middle of the month', () => {
      const limits: Limit[] = [createLimit()];
      // Use mid-month date to avoid timezone boundary issues
      const transactions: Transaction[] = [
        createTransaction({ amount: 100, date: '2024-06-15' }),
      ];

      const { result } = renderHook(() =>
        useMonthlyLimits(limits, transactions, { year: 2024, month: 5 })
      );

      expect(result.current.getSpendingForCategory('expense-general')).toBe(100);
    });
  });

  describe('calculateProgress', () => {
    it('returns 0 when limit is 0', () => {
      const limits: Limit[] = [createLimit({ amount: 0 })];
      const transactions: Transaction[] = [];

      const { result } = renderHook(() =>
        useMonthlyLimits(limits, transactions, { year: 2024, month: 5 })
      );

      expect(result.current.calculateProgress(100, 0)).toBe(0);
    });

    it('returns 0 when limit is negative', () => {
      const limits: Limit[] = [createLimit({ amount: -100 })];
      const transactions: Transaction[] = [];

      const { result } = renderHook(() =>
        useMonthlyLimits(limits, transactions, { year: 2024, month: 5 })
      );

      expect(result.current.calculateProgress(100, -100)).toBe(0);
    });

    it('calculates correct percentage', () => {
      const limits: Limit[] = [createLimit()];
      const transactions: Transaction[] = [];

      const { result } = renderHook(() =>
        useMonthlyLimits(limits, transactions, { year: 2024, month: 5 })
      );

      expect(result.current.calculateProgress(250, 500)).toBe(50);
      expect(result.current.calculateProgress(100, 400)).toBe(25);
    });

    it('caps progress at 100%', () => {
      const limits: Limit[] = [createLimit()];
      const transactions: Transaction[] = [];

      const { result } = renderHook(() =>
        useMonthlyLimits(limits, transactions, { year: 2024, month: 5 })
      );

      expect(result.current.calculateProgress(600, 500)).toBe(100);
      expect(result.current.calculateProgress(1000, 500)).toBe(100);
    });
  });

  describe('limitsWithSpending', () => {
    it('returns empty array when there are no limits', () => {
      const limits: Limit[] = [];
      const transactions: Transaction[] = [];

      const { result } = renderHook(() =>
        useMonthlyLimits(limits, transactions, { year: 2024, month: 5 })
      );

      expect(result.current.limitsWithSpending).toEqual([]);
    });

    it('calculates spending for each limit', () => {
      const limits: Limit[] = [
        createLimit({ categoryId: 'expense-general', amount: 500 }),
        createLimit({ categoryId: 'expense-food', amount: 300 }),
      ];
      const transactions: Transaction[] = [
        createTransaction({ amount: 100, category: 'expense-general' }),
        createTransaction({ amount: 200, category: 'expense-general' }),
        createTransaction({ amount: 150, category: 'expense-food' }),
      ];

      const { result } = renderHook(() =>
        useMonthlyLimits(limits, transactions, { year: 2024, month: 5 })
      );

      expect(result.current.limitsWithSpending).toHaveLength(2);
      expect(result.current.limitsWithSpending[0].spending).toBe(300);
      expect(result.current.limitsWithSpending[1].spending).toBe(150);
    });

    it('calculates correct progress percentage', () => {
      const limits: Limit[] = [createLimit({ amount: 500 })];
      const transactions: Transaction[] = [
        createTransaction({ amount: 250 }), // 50% of 500
      ];

      const { result } = renderHook(() =>
        useMonthlyLimits(limits, transactions, { year: 2024, month: 5 })
      );

      expect(result.current.limitsWithSpending[0].progress).toBe(50);
    });

    it('marks limit as exceeded when spending is over limit', () => {
      const limits: Limit[] = [createLimit({ amount: 500 })];
      const transactions: Transaction[] = [
        createTransaction({ amount: 600 }), // Over limit
      ];

      const { result } = renderHook(() =>
        useMonthlyLimits(limits, transactions, { year: 2024, month: 5 })
      );

      expect(result.current.limitsWithSpending[0].isExceeded).toBe(true);
    });

    it('does not mark limit as exceeded when spending equals limit', () => {
      const limits: Limit[] = [createLimit({ amount: 500 })];
      const transactions: Transaction[] = [
        createTransaction({ amount: 500 }), // Exactly at limit
      ];

      const { result } = renderHook(() =>
        useMonthlyLimits(limits, transactions, { year: 2024, month: 5 })
      );

      expect(result.current.limitsWithSpending[0].isExceeded).toBe(false);
    });

    it('does not mark limit as exceeded when spending is under limit', () => {
      const limits: Limit[] = [createLimit({ amount: 500 })];
      const transactions: Transaction[] = [
        createTransaction({ amount: 400 }), // Under limit
      ];

      const { result } = renderHook(() =>
        useMonthlyLimits(limits, transactions, { year: 2024, month: 5 })
      );

      expect(result.current.limitsWithSpending[0].isExceeded).toBe(false);
    });
  });

  describe('Date Range Calculations', () => {
    // Helper to calculate expected date strings the same way the hook does
    // This ensures tests are consistent with implementation regardless of timezone
    const getExpectedDateRange = (year: number, month: number) => {
      const first = new Date(year, month, 1);
      const last = new Date(year, month + 1, 0);
      const fmt = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      return { firstDay: fmt(first), lastDay: fmt(last) };
    };

    it('uses current month when no options provided', () => {
      const limits: Limit[] = [];
      const transactions: Transaction[] = [];

      const { result } = renderHook(() =>
        useMonthlyLimits(limits, transactions)
      );

      expect(result.current.selectedYear).toBe(2024);
      expect(result.current.selectedMonth).toBe(5); // June (0-indexed)
    });

    it('uses provided year and month options', () => {
      const limits: Limit[] = [];
      const transactions: Transaction[] = [];

      const { result } = renderHook(() =>
        useMonthlyLimits(limits, transactions, { year: 2025, month: 11 })
      );

      expect(result.current.selectedYear).toBe(2025);
      expect(result.current.selectedMonth).toBe(11);
    });

    it('calculates date range consistently for June', () => {
      const limits: Limit[] = [];
      const transactions: Transaction[] = [];

      const { result } = renderHook(() =>
        useMonthlyLimits(limits, transactions, { year: 2024, month: 5 })
      );

      const expected = getExpectedDateRange(2024, 5);
      expect(result.current.currentMonth.firstDay).toBe(expected.firstDay);
      expect(result.current.currentMonth.lastDay).toBe(expected.lastDay);
    });

    it('calculates date range consistently for February in leap year', () => {
      const limits: Limit[] = [];
      const transactions: Transaction[] = [];

      const { result } = renderHook(() =>
        useMonthlyLimits(limits, transactions, { year: 2024, month: 1 })
      );

      const expected = getExpectedDateRange(2024, 1);
      expect(result.current.currentMonth.firstDay).toBe(expected.firstDay);
      expect(result.current.currentMonth.lastDay).toBe(expected.lastDay);
    });

    it('calculates date range consistently for February in non-leap year', () => {
      const limits: Limit[] = [];
      const transactions: Transaction[] = [];

      const { result } = renderHook(() =>
        useMonthlyLimits(limits, transactions, { year: 2023, month: 1 })
      );

      const expected = getExpectedDateRange(2023, 1);
      expect(result.current.currentMonth.firstDay).toBe(expected.firstDay);
      expect(result.current.currentMonth.lastDay).toBe(expected.lastDay);
    });

    it('returns date strings in YYYY-MM-DD format', () => {
      const limits: Limit[] = [];
      const transactions: Transaction[] = [];

      const { result } = renderHook(() =>
        useMonthlyLimits(limits, transactions, { year: 2024, month: 5 })
      );

      // Verify date format using regex
      const dateFormat = /^\d{4}-\d{2}-\d{2}$/;
      expect(result.current.currentMonth.firstDay).toMatch(dateFormat);
      expect(result.current.currentMonth.lastDay).toMatch(dateFormat);
    });
  });

  describe('Memoization and Dependencies', () => {
    it('returns same limitsWithSpending reference when inputs unchanged', () => {
      const limits: Limit[] = [createLimit()];
      const transactions: Transaction[] = [createTransaction()];

      const { result, rerender } = renderHook(() =>
        useMonthlyLimits(limits, transactions, { year: 2024, month: 5 })
      );

      const firstResult = result.current.limitsWithSpending;
      rerender();
      const secondResult = result.current.limitsWithSpending;

      expect(firstResult).toBe(secondResult);
    });

    it('returns same getSpendingForCategory reference when inputs unchanged', () => {
      const limits: Limit[] = [createLimit()];
      const transactions: Transaction[] = [createTransaction()];

      const { result, rerender } = renderHook(() =>
        useMonthlyLimits(limits, transactions, { year: 2024, month: 5 })
      );

      const firstResult = result.current.getSpendingForCategory;
      rerender();
      const secondResult = result.current.getSpendingForCategory;

      expect(firstResult).toBe(secondResult);
    });
  });
});
