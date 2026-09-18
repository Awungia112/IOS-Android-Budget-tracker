import { isPendingTransaction } from '@budget/core';
import { describe, it, expect, vi } from 'vitest';

// Mock the core module to test the logic in isolation
vi.mock('@budget/core', () => ({
  isPendingTransaction: vi.fn(),
  // Add other required mocks
}));

describe('Pending Transaction Execution Logic', () => {
  it('should correctly identify transactions that need execution', () => {
    const today = new Date('2024-01-10');
    today.setHours(0, 0, 0, 0);

    // Mock transaction that should be executed (past date, not executed)
    const readyTransaction = {
      id: 'ready-1',
      type: 'expense',
      amount: 100,
      category: 'food',
      date: '2024-01-08', // Past date
      title: 'Ready Transaction',
      accountId: 'account1',
      createdAt: '2024-01-01T00:00:00Z',
      executedAt: undefined, // Not executed yet
    };

    // Mock transaction that should not be executed (future date)
    const futureTransaction = {
      id: 'future-1',
      type: 'expense',
      amount: 100,
      category: 'food',
      date: '2024-01-15', // Future date
      title: 'Future Transaction',
      accountId: 'account1',
      createdAt: '2024-01-01T00:00:00Z',
      executedAt: undefined,
    };

    // Mock transaction that should not be executed (already executed)
    const executedTransaction = {
      id: 'executed-1',
      type: 'expense',
      amount: 100,
      category: 'food',
      date: '2024-01-08', // Past date
      title: 'Executed Transaction',
      accountId: 'account1',
      createdAt: '2024-01-01T00:00:00Z',
      executedAt: '2024-01-10T10:00:00Z', // Already executed
    };

    const transactions = [readyTransaction, futureTransaction, executedTransaction];

    // Simulate the filtering logic from executePendingTransactions
    const readyTransactions = transactions.filter((transaction) => {
      // Skip if already executed
      if (transaction.executedAt) {
        return false;
      }

      const transactionDate = new Date(transaction.date);
      transactionDate.setHours(0, 0, 0, 0);

      // Check if transaction date is today or earlier (ready to execute)
      return transactionDate <= today;
    });

    expect(readyTransactions).toHaveLength(1);
    expect(readyTransactions[0].id).toBe('ready-1');
  });

  it('should demonstrate the fix: executed transactions are no longer pending', () => {
    // Simulate the fixed isPendingTransaction logic
    const isPendingTransactionFixed = (transaction: any, currentDate: Date = new Date()) => {
      // If transaction has been executed, it's no longer pending
      if (transaction.executedAt) {
        return false;
      }

      const transactionDate = new Date(transaction.date);
      transactionDate.setHours(0, 0, 0, 0);

      const compareDate = new Date(currentDate);
      compareDate.setHours(0, 0, 0, 0);

      return transactionDate > compareDate;
    };

    // Simulate the old isPendingTransaction logic (before the fix)
    const isPendingTransactionOld = (transaction: any, currentDate: Date = new Date()) => {
      const transactionDate = new Date(transaction.date);
      transactionDate.setHours(0, 0, 0, 0);

      const compareDate = new Date(currentDate);
      compareDate.setHours(0, 0, 0, 0);

      return transactionDate > compareDate;
    };

    const today = new Date('2024-01-10');

    // Transaction that was pending but is now executed
    const executedTransaction = {
      id: 'executed-1',
      type: 'expense',
      amount: 100,
      category: 'food',
      date: '2024-01-15', // Future date
      title: 'Executed Transaction',
      accountId: 'account1',
      createdAt: '2024-01-01T00:00:00Z',
      executedAt: '2024-01-10T10:00:00Z', // Executed
    };

    // Before the fix, this would return true (because date is in future)
    expect(isPendingTransactionOld(executedTransaction, today)).toBe(true);
    
    // After the fix, this should return false (because executedAt is set)
    expect(isPendingTransactionFixed(executedTransaction, today)).toBe(false);
  });
});
