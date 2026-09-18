/**
 * @vitest-environment jsdom
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import type { Transaction, Category } from '@budget/core';

// Mock react-i18next
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key, // Return key as-is for testing
    i18n: { language: 'en' },
  }),
  I18nextProvider: ({ children }: { children: React.ReactNode }) => children,
  initReactI18next: { type: '3rdParty', init: () => {} },
}));

// Mock translateCategoryLabel helper
vi.mock('@/lib/categoryHelpers', () => ({
  translateCategoryLabel: (t: any, key: string) => key, // Return key as-is
}));

// Mock formatCurrency helper
vi.mock('@/lib/formatters', () => ({
  formatCurrency: (amount: number) => `${amount.toFixed(2)} €`,
  formatDate: (date: Date | string) => {
    const dateObj = typeof date === 'string' ? new Date(date) : date;
    const day = String(dateObj.getDate()).padStart(2, '0');
    const month = String(dateObj.getMonth() + 1).padStart(2, '0');
    const year = dateObj.getFullYear();
    return `${day}.${month}.${year}`;
  },
}));

// Mock data factories
const createTransaction = (overrides: Partial<Transaction> = {}): Transaction => ({
  id: `transaction-${Date.now()}-${Math.random()}`, // nosemgrep: nodejs_scan.javascript-crypto-rule-node_insecure_random_generator -- test fixture ID, no security context
  accountId: 'account-1',
  title: 'Test Transaction',
  amount: 100,
  category: 'expense-food',
  type: 'expense',
  date: '2025-01-15T10:00:00Z',
  ...overrides,
});

const createCategory = (overrides: Partial<Category> = {}): Category => ({
  id: 'expense-food',
  accountId: 'account-1',
  name: 'category_food',
  type: 'expense',
  color: '#E33B80',
  isDefault: false,
  ...overrides,
});

// Mock useBudget hook data
const mockData = {
  categories: [] as Category[],
};
const mockDeleteTransaction = vi.fn();

// Mock BudgetContext
vi.mock('@/contexts/BudgetContext', () => ({
  useBudget: () => ({
    get categories() { return mockData.categories; },
    deleteTransaction: mockDeleteTransaction,
  }),
}));

// Import TransactionItem after mocking
import TransactionItem from './TransactionItem';

describe('TransactionItem Component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockData.categories = [];
  });

  afterEach(() => {
    cleanup();
  });

  describe('Transaction Display', () => {
    it('displays transaction title correctly', () => {
      const transaction = createTransaction({ title: 'Netflix Subscription' });
      const category = createCategory();
      mockData.categories = [category];

      render(<TransactionItem transaction={transaction} />);

      expect(screen.getByText('Netflix Subscription')).toBeInTheDocument();
    });

    it('displays income amount in green with + sign', () => {
      const transaction = createTransaction({
        type: 'income',
        amount: 300,
        category: 'income-salary',
      });
      const category = createCategory({ 
        id: 'income-salary',
        name: 'category_salary',
        type: 'income'
      });
      mockData.categories = [category];

      render(<TransactionItem transaction={transaction} />);

      const amountElement = screen.getByText('+300.00 €');
      expect(amountElement).toHaveClass('text-budget-green');
    });

    it('displays expense amount in red with - sign', () => {
      const transaction = createTransaction({
        type: 'expense',
        amount: 19.99,
      });
      const category = createCategory();
      mockData.categories = [category];

      render(<TransactionItem transaction={transaction} />);

      const amountElement = screen.getByText('-19.99 €');
      expect(amountElement).toHaveClass('text-budget-red');
    });

    it('formats currency correctly with 2 decimal places', () => {
      const transaction = createTransaction({ amount: 50.5 });
      const category = createCategory();
      mockData.categories = [category];

      render(<TransactionItem transaction={transaction} />);

      expect(screen.getByText('-50.50 €')).toBeInTheDocument();
    });
  });

  describe('Interactive Elements', () => {
    it('renders edit button', () => {
      const transaction = createTransaction();
      const category = createCategory();
      mockData.categories = [category];

      render(<TransactionItem transaction={transaction} />);

      const buttons = screen.getAllByRole('button');
      expect(buttons).toHaveLength(2); // Edit and delete buttons
    });

    it('renders delete button', () => {
      const transaction = createTransaction();
      const category = createCategory();
      mockData.categories = [category];

      render(<TransactionItem transaction={transaction} />);

      const buttons = screen.getAllByRole('button');
      expect(buttons).toHaveLength(2); // Edit and delete buttons
    });
  });

  describe('Accessibility', () => {
    it('has proper button roles', () => {
      const transaction = createTransaction();
      const category = createCategory();
      mockData.categories = [category];

      render(<TransactionItem transaction={transaction} />);

      const buttons = screen.getAllByRole('button');
      expect(buttons).toHaveLength(2);
    });

    it('has proper semantic structure', () => {
      const transaction = createTransaction();
      const category = createCategory();
      mockData.categories = [category];

      render(<TransactionItem transaction={transaction} />);

      // Check that the component renders without errors
      expect(screen.getByText('Test Transaction')).toBeInTheDocument();
      expect(screen.getByText('-100.00 €')).toBeInTheDocument();
    });
  });
});
