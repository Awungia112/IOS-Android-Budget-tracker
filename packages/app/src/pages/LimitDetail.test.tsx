/**
 * @vitest-environment jsdom
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { MemoryRouter } from 'react-router-dom';
import type { Limit, Category, Transaction } from '@budget/core';

// Mock navigation
const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate,
    useParams: () => ({ limitId: 'limit-1' }),
  };
});

// Mock react-i18next
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => {
      const translations: Record<string, string> = {
        cancel: 'Cancel',
        edit_limit: 'Edit',
        delete_limit: 'Delete Limit',
        are_you_sure_delete: 'Are you sure?',
        delete: 'Delete',
        unknownCategory: 'Unknown',
        category_food: 'Food',
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
  limits: [] as Limit[],
  categories: [] as Category[],
  transactions: [] as Transaction[],
};
const mockDeleteLimit = vi.fn();

// Mock BudgetContext
vi.mock('@/contexts/BudgetContext', () => ({
  useBudget: () => ({
    get limits() { return mockData.limits; },
    get categories() { return mockData.categories; },
    get transactions() { return mockData.transactions; },
    deleteLimit: mockDeleteLimit,
    accounts: [{ id: 'account-1', name: 'Test' }],
    currentAccount: { id: 'account-1', name: 'Test' },
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

// Mock useMonthlyLimits
vi.mock('@/hooks/useMonthlyLimits', () => ({
  useMonthlyLimits: (limits: Limit[], transactions: Transaction[]) => {
    const now = new Date();
    const month = now.getMonth();
    const year = now.getFullYear();

    const limitsWithSpending = limits.map((limit: Limit) => {
      const spending = transactions
        .filter((t: Transaction) =>
          t.type === 'expense' &&
          t.category === limit.categoryId &&
          new Date(t.date).getMonth() === month &&
          new Date(t.date).getFullYear() === year,
        )
        .reduce((sum: number, t: Transaction) => sum + t.amount, 0);
      return { limit, spending };
    });

    return { limitsWithSpending };
  },
}));

// Mock category-icons
vi.mock('@/lib/category-icons', () => ({
  getIconPath: () => undefined,
}));

import LimitDetail from './LimitDetail';
import { formatCurrency } from '@/lib/formatters';

const TestWrapper = ({ children }: { children: React.ReactNode }) => (
  <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
    {children}
  </MemoryRouter>
);

describe('LimitDetail Page', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockData.limits = [
      { id: 'limit-1', accountId: 'account-1', categoryId: 'expense-food', amount: 500 },
    ];
    mockData.categories = [
      { id: 'expense-food', accountId: 'account-1', name: 'category_food', type: 'expense', isDefault: true },
    ];
    mockData.transactions = [];
  });

  afterEach(() => {
    cleanup();
  });

  it('renders the category name as heading', () => {
    render(
      <TestWrapper>
        <LimitDetail />
      </TestWrapper>,
    );
    // The category name should appear (translated)
    expect(screen.getAllByText('Food').length).toBeGreaterThan(0);
  });

  it('renders the limit amount', () => {
    render(
      <TestWrapper>
        <LimitDetail />
      </TestWrapper>,
    );
    expect(document.body.textContent).toContain(formatCurrency(500));
  });

  it('renders spending amount', () => {
    const now = new Date();
    const dateStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-15`;
    mockData.transactions = [
      {
        id: 'txn-1', accountId: 'account-1', type: 'expense',
        amount: 200, category: 'expense-food', date: dateStr, title: 'Groceries',
      },
    ];

    render(
      <TestWrapper>
        <LimitDetail />
      </TestWrapper>,
    );
    expect(document.body.textContent).toContain(formatCurrency(200));
  });

  it('shows not-found state when limit does not exist', () => {
    mockData.limits = [];

    render(
      <TestWrapper>
        <LimitDetail />
      </TestWrapper>,
    );
    expect(screen.getByText('Unknown')).toBeInTheDocument();
  });

  it('navigates to edit form when edit button clicked', () => {
    render(
      <TestWrapper>
        <LimitDetail />
      </TestWrapper>,
    );
    fireEvent.click(screen.getByText('Edit'));
    expect(mockNavigate).toHaveBeenCalledWith('/limits/edit/limit-1');
  });

  it('opens delete confirmation dialog', () => {
    render(
      <TestWrapper>
        <LimitDetail />
      </TestWrapper>,
    );

    // Click the delete (trash) button
    fireEvent.click(screen.getByRole('button', { name: 'Delete Limit' }));

    expect(screen.getByText('Are you sure?')).toBeInTheDocument();
  });

  it('calls deleteLimit and navigates on confirm', () => {
    render(
      <TestWrapper>
        <LimitDetail />
      </TestWrapper>,
    );

    // Open dialog
    fireEvent.click(screen.getByRole('button', { name: 'Delete Limit' }));

    // Confirm deletion
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    expect(mockDeleteLimit).toHaveBeenCalledWith('limit-1');
    expect(mockNavigate).toHaveBeenCalledWith('/limits');
  });

  it('navigates back when cancel is clicked', () => {
    render(
      <TestWrapper>
        <LimitDetail />
      </TestWrapper>,
    );
    fireEvent.click(screen.getByText('Cancel'));
    expect(mockNavigate).toHaveBeenCalledWith('/limits');
  });
});
