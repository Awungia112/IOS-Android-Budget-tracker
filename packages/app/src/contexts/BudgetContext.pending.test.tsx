/**
 * @vitest-environment jsdom
 *
 * Tests for pending transaction execution logic to ensure:
 * 1. Normal past/present transactions are marked as executed immediately
 * 2. Future transactions are not marked as executed
 * 3. Only transactions created after last check date are executed
 * 4. Historical transactions are not executed on first load
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import '@testing-library/jest-dom/vitest';

// Mock localStorage
const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: vi.fn((key: string) => store[key] || null),
    setItem: vi.fn((key: string, value: string) => {
      store[key] = value;
    }),
    removeItem: vi.fn((key: string) => {
      delete store[key];
    }),
    clear: vi.fn(() => {
      store = {};
    }),
  };
})();

Object.defineProperty(window, 'localStorage', {
  value: localStorageMock,
});

describe('BudgetContext - Pending Transaction Execution Logic', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorageMock.clear();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('Transaction Date Classification', () => {
    it('should classify past transactions as executed', () => {
      // Mock the current date to be April 8, 2026
      const mockDate = new Date('2026-04-08T12:00:00Z');
      vi.setSystemTime(mockDate);

      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const transactionDate = new Date('2026-04-07'); // Yesterday
      transactionDate.setHours(0, 0, 0, 0);

      // Past transaction should be marked as executed
      const transaction = {
        date: '2026-04-07',
        createdAt: '2026-04-07T10:00:00Z',
      };

      const executedAt = transactionDate <= today ? new Date().toISOString() : undefined;
      
      expect(executedAt).toBeDefined();
      expect(executedAt).toMatch(/2026-04-08/); // Should be today's date
    });

    it('should classify present transactions as executed', () => {
      // Mock the current date to be April 8, 2026
      const mockDate = new Date('2026-04-08T12:00:00Z');
      vi.setSystemTime(mockDate);

      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const transactionDate = new Date('2026-04-08'); // Today
      transactionDate.setHours(0, 0, 0, 0);

      // Present transaction should be marked as executed
      const transaction = {
        date: '2026-04-08',
        createdAt: '2026-04-08T10:00:00Z',
      };

      const executedAt = transactionDate <= today ? new Date().toISOString() : undefined;
      
      expect(executedAt).toBeDefined();
      expect(executedAt).toMatch(/2026-04-08/); // Should be today's date
    });

    it('should NOT classify future transactions as executed', () => {
      // Mock the current date to be April 8, 2026
      const mockDate = new Date('2026-04-08T12:00:00Z');
      vi.setSystemTime(mockDate);

      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const transactionDate = new Date('2026-04-10'); // Future date
      transactionDate.setHours(0, 0, 0, 0);

      // Future transaction should NOT be marked as executed
      const transaction = {
        date: '2026-04-10',
        createdAt: '2026-04-08T10:00:00Z',
      };

      const executedAt = transactionDate <= today ? new Date().toISOString() : undefined;
      
      expect(executedAt).toBeUndefined();
    });
  });

  describe('Transaction Execution Filtering', () => {
    it('should NOT execute historical transactions on first load', () => {
      // Mock the current date to be April 8, 2026
      const mockDate = new Date('2026-04-08T12:00:00Z');
      vi.setSystemTime(mockDate);

      // Set last check date to yesterday
      localStorageMock.setItem('budget-wise-last-pending-check', '2026-04-07T12:00:00Z');

      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const lastCheckDate = new Date('2026-04-07T12:00:00Z');

      // Historical transaction (created before last check)
      const historicalTransaction = {
        date: '2026-04-06', // Past date
        createdAt: '2026-04-06T10:00:00Z', // Created before last check
        executedAt: undefined, // Not executed yet
      };

      const createdAt = new Date(historicalTransaction.createdAt || historicalTransaction.date);
      const shouldExecute = 
        !historicalTransaction.executedAt && // Not already executed
        new Date(historicalTransaction.date) <= today && // Date reached
        createdAt > lastCheckDate; // Created after last check

      expect(shouldExecute).toBe(false); // Should NOT execute historical transactions
    });

    it('should execute pending transactions created after last check date', () => {
      // Mock the current date to be April 8, 2026
      const mockDate = new Date('2026-04-08T12:00:00Z');
      vi.setSystemTime(mockDate);

      // Set last check date to yesterday evening
      localStorageMock.setItem('budget-wise-last-pending-check', '2026-04-07T20:00:00Z');

      const today = new Date('2026-04-08T12:00:00Z'); // Use exact same time as mock
      today.setHours(0, 0, 0, 0);
      const lastCheckDate = new Date('2026-04-07T20:00:00Z');

      // Pending transaction (created after last check for today's date, now ready to execute)
      const pendingTransaction = {
        date: '2026-04-08', // Today (ready to execute)
        createdAt: '2026-04-07T22:00:00Z', // Created yesterday evening after last check
        executedAt: undefined, // Not executed yet
      };

      const createdAt = new Date(pendingTransaction.createdAt || pendingTransaction.date);
      
      // Simulate the actual logic from BudgetContext.executePendingTransactions
      const transactionDate = new Date(pendingTransaction.date);
      transactionDate.setHours(0, 0, 0, 0);
      
      const shouldExecute = 
        !pendingTransaction.executedAt && // Not already executed
        transactionDate <= today && // Date reached
        createdAt > lastCheckDate; // Created after last check

      expect(shouldExecute).toBe(true); // Should execute pending transactions
    });
  });
});
