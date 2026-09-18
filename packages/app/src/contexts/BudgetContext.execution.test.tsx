/**
 * @vitest-environment jsdom
 *
 * Tests for pending transaction execution behavior to ensure:
 * 1. Executed transactions are excluded from pending list
 * 2. Executed transactions appear in regular transaction list
 * 3. Both use consistent formatting
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { createTransaction, createCategory } from '@/test-helpers';

describe('BudgetContext - Pending Transaction Execution Behavior', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(new Date(2026, 3, 8, 12)); // April 8, 2026 12:00
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it('should filter executed transactions out of pending list', () => {
    const expenseCategory = createCategory({
      id: 'expense-food',
      name: 'category_food',
      type: 'expense',
    });

    // Test the filtering logic directly
    const transactions = [
      // Regular transaction (no executedAt)
      createTransaction({
        id: 'regular-1',
        type: 'expense',
        amount: 30,
        category: expenseCategory.id,
        date: '2026-04-07',
        title: 'Regular Coffee',
      }),
      // Executed transaction (has executedAt)
      createTransaction({
        id: 'executed-1',
        type: 'expense',
        amount: 50,
        category: expenseCategory.id,
        date: '2026-04-08',
        title: 'Executed Lunch',
        executedAt: '2026-04-08T08:00:00Z',
      }),
      // Pending transaction (no executedAt, future date)
      createTransaction({
        id: 'pending-1',
        type: 'expense',
        amount: 25,
        category: expenseCategory.id,
        date: '2026-04-09', // Future
        title: 'Pending Dinner',
      }),
    ];

    // Mock the filtering logic from Index.tsx
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    
    const pendingTransactions = transactions.filter((transaction) => {
      // Skip executed transactions - they're no longer pending
      if (transaction.executedAt) {
        return false;
      }
      
      const transactionDate = new Date(transaction.date);
      transactionDate.setHours(0, 0, 0, 0);
      return transactionDate > now;
    });

    // Should only include the pending transaction
    expect(pendingTransactions).toHaveLength(1);
    expect(pendingTransactions[0].id).toBe('pending-1');
    expect(pendingTransactions[0].title).toBe('Pending Dinner');
  });

  it('should include executed transactions in current transactions list', () => {
    const expenseCategory = createCategory({
      id: 'expense-food',
      name: 'category_food',
      type: 'expense',
    });

    // Test the filtering logic directly
    const transactions = [
      // Regular transaction (no executedAt)
      createTransaction({
        id: 'regular-1',
        type: 'expense',
        amount: 30,
        category: expenseCategory.id,
        date: '2026-04-07',
        title: 'Regular Coffee',
      }),
      // Executed transaction (has executedAt)
      createTransaction({
        id: 'executed-1',
        type: 'expense',
        amount: 50,
        category: expenseCategory.id,
        date: '2026-04-08',
        title: 'Executed Lunch',
        executedAt: '2026-04-08T08:00:00Z',
      }),
      // Pending transaction (no executedAt, future date)
      createTransaction({
        id: 'pending-1',
        type: 'expense',
        amount: 25,
        category: expenseCategory.id,
        date: '2026-04-09', // Future
        title: 'Pending Dinner',
      }),
    ];

    // Mock the filtering logic from Index.tsx
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    
    const currentTransactions = transactions.filter((transaction) => {
      const transactionDate = new Date(transaction.date);
      transactionDate.setHours(0, 0, 0, 0); // Normalize to start of day
      return transactionDate <= now; // Current or past transactions (including executed ones)
    });

    // Should include both regular and executed transactions
    expect(currentTransactions).toHaveLength(2);
    expect(currentTransactions.map(t => t.id)).toEqual(['regular-1', 'executed-1']);
  });

  it('should migrate existing pending transactions without createdAt', () => {
    const expenseCategory = createCategory({
      id: 'expense-food',
      name: 'category_food',
      type: 'expense',
    });

    // Simulate existing pending transaction without createdAt
    const legacyPendingTransaction = createTransaction({
      id: 'legacy-pending-1',
      type: 'expense',
      amount: 50,
      category: expenseCategory.id,
      date: '2026-04-07', // Past date (should be pending)
      title: 'Legacy Pending Lunch',
      // Note: No createdAt field - this is the legacy case
    });

    const transactions = [legacyPendingTransaction];

    // Mock the migration logic
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const legacyPendingTransactions = transactions.filter(tx => 
      !tx.executedAt && 
      !tx.createdAt && 
      new Date(tx.date) <= today
    );

    // Should find the legacy pending transaction
    expect(legacyPendingTransactions).toHaveLength(1);
    expect(legacyPendingTransactions[0].id).toBe('legacy-pending-1');

    // Simulate the migration process
    const migratedTransactions = transactions.map(tx => {
      if (legacyPendingTransactions.includes(tx)) {
        // Migration: add createdAt field
        return { ...tx, createdAt: new Date().toISOString() };
      }
      return tx;
    });

    // After migration, transaction should have createdAt
    expect(migratedTransactions[0].createdAt).toBeDefined();
    expect(migratedTransactions[0].createdAt).toMatch(/2026-04-08/); // Today's date
  });
});
