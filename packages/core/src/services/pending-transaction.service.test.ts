import {
  isPendingTransaction,
  shouldExecuteTransaction,
  filterPendingTransactions,
  filterExecutedTransactions,
  getReadyToExecuteTransactions,
  formatPendingDate,
  daysUntilExecution,
} from './pending-transaction.service.js';
import type { Transaction } from '../types/index.js';

describe('Pending Transaction Service', () => {
  const mockTransaction: Transaction = {
    id: '1',
    type: 'expense',
    amount: 100,
    category: 'food',
    date: '2024-01-15',
    title: 'Test Transaction',
    accountId: 'account1',
    createdAt: '2024-01-01T00:00:00Z',
  };

  describe('isPendingTransaction', () => {
    it('should return true for future dates', () => {
      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + 5);
      const futureTransaction = {
        ...mockTransaction,
        date: futureDate.toISOString().split('T')[0],
      };

      expect(isPendingTransaction(futureTransaction)).toBe(true);
    });

    it('should return false for past dates', () => {
      const pastDate = new Date();
      pastDate.setDate(pastDate.getDate() - 5);
      const pastTransaction = {
        ...mockTransaction,
        date: pastDate.toISOString().split('T')[0],
      };

      expect(isPendingTransaction(pastTransaction)).toBe(false);
    });

    it('should return false for today', () => {
      const today = new Date();
      const todayTransaction = {
        ...mockTransaction,
        date: today.toISOString().split('T')[0],
      };

      expect(isPendingTransaction(todayTransaction)).toBe(false);
    });

    it('should return false for executed transactions regardless of date', () => {
      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + 5);
      const executedTransaction = {
        ...mockTransaction,
        date: futureDate.toISOString().split('T')[0],
        executedAt: '2024-01-10T10:00:00Z',
      };

      expect(isPendingTransaction(executedTransaction)).toBe(false);
    });

    it('should handle custom current date', () => {
      const currentDate = new Date('2024-01-10');
      const futureTransaction = {
        ...mockTransaction,
        date: '2024-01-15',
      };

      expect(isPendingTransaction(futureTransaction, currentDate)).toBe(true);
    });
  });

  describe('shouldExecuteTransaction', () => {
    it('should return true for past dates', () => {
      const pastDate = new Date();
      pastDate.setDate(pastDate.getDate() - 5);
      const pastTransaction = {
        ...mockTransaction,
        date: pastDate.toISOString().split('T')[0],
      };

      expect(shouldExecuteTransaction(pastTransaction)).toBe(true);
    });

    it('should return true for today', () => {
      const today = new Date();
      const todayTransaction = {
        ...mockTransaction,
        date: today.toISOString().split('T')[0],
      };

      expect(shouldExecuteTransaction(todayTransaction)).toBe(true);
    });

    it('should return false for future dates', () => {
      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + 5);
      const futureTransaction = {
        ...mockTransaction,
        date: futureDate.toISOString().split('T')[0],
      };

      expect(shouldExecuteTransaction(futureTransaction)).toBe(false);
    });
  });

  describe('filterPendingTransactions', () => {
    it('should filter only pending transactions', () => {
      const today = new Date();
      const pastDate = new Date();
      pastDate.setDate(pastDate.getDate() - 5);
      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + 5);

      const transactions: Transaction[] = [
        { ...mockTransaction, id: '1', date: pastDate.toISOString().split('T')[0] },
        { ...mockTransaction, id: '2', date: today.toISOString().split('T')[0] },
        { ...mockTransaction, id: '3', date: futureDate.toISOString().split('T')[0] },
      ];

      const pending = filterPendingTransactions(transactions);
      expect(pending).toHaveLength(1);
      expect(pending[0].id).toBe('3');
    });
  });

  describe('filterExecutedTransactions', () => {
    it('should filter only executed transactions', () => {
      const today = new Date();
      const pastDate = new Date();
      pastDate.setDate(pastDate.getDate() - 5);
      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + 5);

      const transactions: Transaction[] = [
        { ...mockTransaction, id: '1', date: pastDate.toISOString().split('T')[0] },
        { ...mockTransaction, id: '2', date: today.toISOString().split('T')[0] },
        { ...mockTransaction, id: '3', date: futureDate.toISOString().split('T')[0] },
      ];

      const executed = filterExecutedTransactions(transactions);
      expect(executed).toHaveLength(2);
      expect(executed.map(t => t.id)).toEqual(['1', '2']);
    });
  });

  describe('getReadyToExecuteTransactions', () => {
    it('should find transactions that became ready between last check and now', () => {
      const lastCheckDate = new Date('2024-01-10');
      const currentDate = new Date('2024-01-15');

      const transactions: Transaction[] = [
        { ...mockTransaction, id: '1', date: '2024-01-08' }, // Before last check
        { ...mockTransaction, id: '2', date: '2024-01-12' }, // Between check and now
        { ...mockTransaction, id: '3', date: '2024-01-15' }, // Current date
        { ...mockTransaction, id: '4', date: '2024-01-20' }, // Future
      ];

      const ready = getReadyToExecuteTransactions(transactions, lastCheckDate, currentDate);
      expect(ready).toHaveLength(2);
      expect(ready.map(t => t.id)).toEqual(['2', '3']);
    });
  });

  describe('formatPendingDate', () => {
    it('should format date correctly', () => {
      const dateString = '2024-01-15';
      const formatted = formatPendingDate(dateString, 'en-US');
      expect(formatted).toBe('15.01.2024');
    });

    it('should use default locale when not specified', () => {
      const dateString = '2024-01-15';
      const formatted = formatPendingDate(dateString);
      expect(formatted).toBe('15.01.2024');
    });
  });

  describe('daysUntilExecution', () => {
    it('should return positive days for future dates', () => {
      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + 5);
      const days = daysUntilExecution(futureDate.toISOString().split('T')[0]);
      expect(days).toBe(5);
    });

    it('should return 0 for today', () => {
      const today = new Date();
      const days = daysUntilExecution(today.toISOString().split('T')[0]);
      expect(days).toBe(0);
    });

    it('should return negative days for past dates', () => {
      const pastDate = new Date();
      pastDate.setDate(pastDate.getDate() - 3);
      const days = daysUntilExecution(pastDate.toISOString().split('T')[0]);
      expect(days).toBe(-3);
    });
  });
});
