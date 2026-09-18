/**
 * @vitest-environment jsdom
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { MemoryRouter } from 'react-router-dom';
import type { Transaction, Category } from '@budget/core';

// Mock navigation
const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

// Mock react-i18next
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => {
      const translations: Record<string, string> = {
        statistics: 'Statistics',
        balance: 'Balance',
        history: 'History',
        annual_balance: 'Annual Balance',
        monthly: 'Monthly',
        yearly: 'Yearly',
        savings_rate: 'Savings Rate',
        most_frequent_categories: 'Most Frequent Categories',
        total_income: 'Total Income',
        total_expenses: 'Total Expenses',
        total_expenses_short: 'Total Expenses',
        average_per_month: 'Avg/Month',
        summary: 'Summary',
        no_data_available: 'No data available',
        income_short: 'Income',
        expense_short: 'Expense',
        month_january: 'January',
        month_february: 'February',
        month_march: 'March',
        month_april: 'April',
        month_may: 'May',
        month_june: 'June',
        month_july: 'July',
        month_august: 'August',
        month_september: 'September',
        month_october: 'October',
        month_november: 'November',
        month_december: 'December',
        category_food: 'Food',
        category_salary: 'Salary',
        filter_month: 'Filter by Month',
        select_date: 'Select Date',
      };
      // eslint-disable-next-line security/detect-object-injection -- key is validated enum value/safe access pattern
      return translations[key] || key;
    },
    i18n: { language: 'en' },
  }),
  I18nextProvider: ({ children }: { children: React.ReactNode }) => children,
  initReactI18next: { type: '3rdParty', init: () => {} },
}));

// Mutable mock data
const mockData = {
  transactions: [] as Transaction[],
  categories: [] as Category[],
};

// Mock BudgetContext
vi.mock('@/contexts/BudgetContext', () => ({
  useBudget: () => ({
    get transactions() { return mockData.transactions; },
    get categories() { return mockData.categories; },
    accounts: [{ id: 'account-1', name: 'Test Account' }],
    currentAccount: { id: 'account-1', name: 'Test Account' },
    switchAccount: vi.fn(),
    isLoading: false,
    isOfflineMode: false,
    setIsOfflineMode: vi.fn(),
    missedNotifications: [],
    dismissMissedNotifications: vi.fn(),
  }),
}));

// Mock AccountContext
vi.mock('@/contexts/AccountContext', () => ({
  useAccount: () => ({
    logout: vi.fn(),
    isAuthenticated: true,
    setIsAuthenticated: vi.fn(),
    resetOnboarding: vi.fn(),
  }),
}));

vi.mock('@/contexts/PendingInvitesContext', () => ({
  usePendingInvites: () => ({
    pendingInvites: [],
    isLoading: false,
    error: null,
    fetchPendingInvites: vi.fn(),
    acceptInvite: vi.fn(),
    declineInvite: vi.fn(),
    pendingCount: 0,
    acceptingInviteId: null,
    decliningInviteId: null,
  }),
  PendingInvitesProvider: ({ children }: { children: React.ReactNode }) => children,
}));

// Mock DatePickerDialog
vi.mock('@/components/DatePickerDialog', () => ({
  DatePickerDialog: () => null,
}));

// Mock category-icons
vi.mock('@/lib/category-icons', () => ({
  getIconPath: () => undefined,
}));

import Statistics from './Statistics';
import { formatCurrency } from '@/lib/formatters';

const createTransaction = (overrides: Partial<Transaction> = {}): Transaction => ({
  id: `txn-${Math.random()}`, // nosemgrep: nodejs_scan.javascript-crypto-rule-node_insecure_random_generator -- test fixture ID, no security context
  accountId: 'account-1',
  type: 'expense',
  amount: 100,
  category: 'expense-food',
  date: '2025-01-15',
  title: 'Test',
  ...overrides,
});

const createCategory = (overrides: Partial<Category> = {}): Category => ({
  id: 'expense-food',
  accountId: 'account-1',
  name: 'category_food',
  type: 'expense',
  isDefault: true,
  ...overrides,
});

const TestWrapper = ({ children }: { children: React.ReactNode }) => (
  <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
    {children}
  </MemoryRouter>
);

/** Helper: switch to the History tab */
const switchToHistory = () => {
  fireEvent.click(screen.getByRole('button', { name: 'History' }));
};

/** Helper: switch to the Balance tab */
const switchToBalance = () => {
  fireEvent.click(screen.getByRole('button', { name: 'Balance' }));
};

describe('Statistics Page', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockData.transactions = [];
    mockData.categories = [];
  });

  afterEach(() => {
    cleanup();
  });

  // ── Tab navigation ──────────────────────────────────────────────────────

  it('renders statistics heading', () => {
    render(<TestWrapper><Statistics /></TestWrapper>);
    expect(screen.getAllByText('Statistics').length).toBeGreaterThan(0);
  });

  it('renders Balance and History tab buttons', () => {
    render(<TestWrapper><Statistics /></TestWrapper>);
    expect(screen.getByRole('button', { name: 'Balance' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'History' })).toBeInTheDocument();
  });

  it('defaults to Balance tab', () => {
    render(<TestWrapper><Statistics /></TestWrapper>);
    // Balance tab content: period toggle buttons are visible, History tab content is not
    expect(screen.getByRole('button', { name: 'Monthly' })).toBeInTheDocument();
    expect(screen.queryByText('Savings Rate')).not.toBeInTheDocument();
  });

  it('switches to History tab and shows history content', () => {
    render(<TestWrapper><Statistics /></TestWrapper>);
    switchToHistory();
    expect(screen.getByText('Savings Rate')).toBeInTheDocument();
    expect(screen.getByText('Total Income')).toBeInTheDocument();
    expect(screen.getByText('Total Expenses')).toBeInTheDocument();
  });

  // ── Balance tab ─────────────────────────────────────────────────────────

  it('shows period toggle (Monthly / Yearly) on Balance tab', () => {
    render(<TestWrapper><Statistics /></TestWrapper>);
    expect(screen.getByTestId('balance-period-monthly')).toBeInTheDocument();
    expect(screen.getByTestId('balance-period-yearly')).toBeInTheDocument();
  });

  it('shows "no data available" on Balance tab when no transactions', () => {
    mockData.categories = [createCategory()];
    render(<TestWrapper><Statistics /></TestWrapper>);
    expect(screen.getByText('No data available')).toBeInTheDocument();
  });

  it('shows category breakdown on Balance tab when transactions exist', () => {
    const now = new Date();
    const dateStr = now.toISOString().split('T')[0];

    mockData.categories = [
      createCategory({ id: 'income-salary', name: 'category_salary', type: 'income' }),
      createCategory({ id: 'expense-food', name: 'category_food', type: 'expense' }),
    ];
    mockData.transactions = [
      createTransaction({ type: 'income', amount: 3000, category: 'income-salary', date: dateStr }),
      createTransaction({ type: 'expense', amount: 500, category: 'expense-food', date: dateStr }),
    ];

    render(<TestWrapper><Statistics /></TestWrapper>);

    // Switch to monthly so current-month data is visible
    fireEvent.click(screen.getByTestId('balance-period-monthly'));

    const text = document.body.textContent || '';
    expect(text).toContain(formatCurrency(3000));
    expect(text).toContain(formatCurrency(500));
  });

  it('Balance tab yearly mode aggregates full year data', () => {
    const year = new Date().getFullYear();
    // Use past dates so transactions are not pending
    mockData.categories = [
      createCategory({ id: 'income-salary', name: 'category_salary', type: 'income' }),
    ];
    mockData.transactions = [
      createTransaction({ type: 'income', amount: 1000, category: 'income-salary', date: `${year}-01-15` }), // Jan 15 - past
      createTransaction({ type: 'income', amount: 2000, category: 'income-salary', date: `${year}-02-15` }), // Feb 15 - past
    ];

    render(<TestWrapper><Statistics /></TestWrapper>);
    // Yearly is the default on Balance tab — both transactions should be included
    const text = document.body.textContent || '';
    expect(text).toContain(formatCurrency(3000));
  });

  // ── History tab ─────────────────────────────────────────────────────────

  it('renders summary card labels on History tab', () => {
    render(<TestWrapper><Statistics /></TestWrapper>);
    switchToHistory();
    expect(screen.getByText('Savings Rate')).toBeInTheDocument();
    expect(screen.getByText('Total Income')).toBeInTheDocument();
    expect(screen.getByText('Total Expenses')).toBeInTheDocument();
  });

  it('calculates income and expense totals on History tab', () => {
    const now = new Date();
    const dateStr = now.toISOString().split('T')[0];

    mockData.categories = [
      createCategory({ id: 'income-salary', name: 'category_salary', type: 'income' }),
      createCategory({ id: 'expense-food', name: 'category_food', type: 'expense' }),
    ];
    mockData.transactions = [
      createTransaction({ type: 'income', amount: 3000, category: 'income-salary', date: dateStr }),
      createTransaction({ type: 'expense', amount: 500, category: 'expense-food', date: dateStr }),
      createTransaction({ type: 'expense', amount: 200, category: 'expense-food', date: dateStr }),
    ];

    render(<TestWrapper><Statistics /></TestWrapper>);
    switchToHistory();

    const text = document.body.textContent || '';
    expect(text).toContain(formatCurrency(3000));
    expect(text).toContain(formatCurrency(700));
  });

  it('calculates savings rate correctly on History tab', () => {
    const now = new Date();
    const dateStr = now.toISOString().split('T')[0];

    mockData.categories = [
      createCategory({ id: 'income-salary', name: 'category_salary', type: 'income' }),
      createCategory({ id: 'expense-food', name: 'category_food', type: 'expense' }),
    ];
    mockData.transactions = [
      createTransaction({ type: 'income', amount: 1000, category: 'income-salary', date: dateStr }),
      createTransaction({ type: 'expense', amount: 500, category: 'expense-food', date: dateStr }),
    ];

    render(<TestWrapper><Statistics /></TestWrapper>);
    switchToHistory();

    // Savings rate: (1000 - 500) / 1000 * 100 = 50.0%
    expect(document.body.textContent).toContain('50.0');
  });

  it('shows 0.0% savings rate when no income on History tab', () => {
    const now = new Date();
    const dateStr = now.toISOString().split('T')[0];

    mockData.categories = [createCategory()];
    mockData.transactions = [
      createTransaction({ type: 'expense', amount: 500, category: 'expense-food', date: dateStr }),
    ];

    render(<TestWrapper><Statistics /></TestWrapper>);
    switchToHistory();

    expect(document.body.textContent).toContain('0.0');
  });

  it('renders the summary chart section with year on History tab', () => {
    render(<TestWrapper><Statistics /></TestWrapper>);
    switchToHistory();

    const year = new Date().getFullYear().toString();
    expect(screen.getByText(`Summary ${year}`)).toBeInTheDocument();
  });

  it('renders month abbreviations in the chart on History tab', () => {
    render(<TestWrapper><Statistics /></TestWrapper>);
    switchToHistory();

    expect(screen.getByText('JAN')).toBeInTheDocument();
    expect(screen.getByText('FEB')).toBeInTheDocument();
    expect(screen.getByText('DEC')).toBeInTheDocument();
  });

  it('shows top categories when transactions exist on History tab', () => {
    const now = new Date();
    const dateStr = now.toISOString().split('T')[0];

    mockData.categories = [
      createCategory({ id: 'income-salary', name: 'category_salary', type: 'income' }),
      createCategory({ id: 'expense-food', name: 'category_food', type: 'expense' }),
    ];
    mockData.transactions = [
      createTransaction({ type: 'income', amount: 3000, category: 'income-salary', date: dateStr }),
      createTransaction({ type: 'expense', amount: 500, category: 'expense-food', date: dateStr }),
    ];

    render(<TestWrapper><Statistics /></TestWrapper>);
    switchToHistory();

    expect(screen.getByText('Most Frequent Categories')).toBeInTheDocument();
    expect(screen.queryByText('No data available')).not.toBeInTheDocument();
  });

  it('History tab has its own period toggle', () => {
    render(<TestWrapper><Statistics /></TestWrapper>);
    switchToHistory();
    expect(screen.getByTestId('history-period-monthly')).toBeInTheDocument();
    expect(screen.getByTestId('history-period-yearly')).toBeInTheDocument();
  });
});
