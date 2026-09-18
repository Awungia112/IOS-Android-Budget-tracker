/**
 * @vitest-environment jsdom
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { MemoryRouter } from 'react-router-dom';
import type { Limit, Category, Transaction } from '@budget/core';

const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { language: 'en' },
  }),
  I18nextProvider: ({ children }: { children: React.ReactNode }) => children,
  initReactI18next: { type: '3rdParty', init: () => {} },
}));

const createLimit = (overrides: Partial<Limit> = {}): Limit => ({
  id: `limit-${Date.now()}`,
  accountId: 'account-1',
  categoryId: 'expense-food',
  amount: 500,
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

const createTransaction = (overrides: Partial<Transaction> = {}): Transaction => ({
  id: `transaction-${Date.now()}`,
  accountId: 'account-1',
  type: 'expense',
  amount: 100,
  category: 'expense-food',
  date: new Date().toISOString().split('T')[0],
  title: 'Test Transaction',
  ...overrides,
});

const mockData = {
  limits: [] as Limit[],
  categories: [] as Category[],
  transactions: [] as Transaction[],
};

vi.mock('@/contexts/BudgetContext', () => ({
  useBudget: () => ({
    get limits() { return mockData.limits; },
    get categories() { return mockData.categories; },
    get transactions() { return mockData.transactions; },
    deleteLimit: vi.fn(),
    accounts: [{ id: 'account-1', name: 'Test Account', balance: 1000 }],
    currentAccount: { id: 'account-1', name: 'Test Account', balance: 1000 },
    switchAccount: vi.fn(),
    isLoading: false,
    isOfflineMode: false,
    setIsOfflineMode: vi.fn(),
    missedNotifications: [],
    dismissMissedNotifications: vi.fn(),
  }),
}));

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

import Limits from './Limits';

const TestWrapper = ({ children }: { children: React.ReactNode }) => (
  <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>{children}</MemoryRouter>
);

describe('Limits Debug Test', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockData.limits = [];
    mockData.categories = [];
    mockData.transactions = [];
  });

  it('debug: displays spending against limit', () => {
    const today = new Date().toISOString().split('T')[0];
    console.log('DEBUG: Today =', today);
    console.log('DEBUG: Current month =', new Date().getMonth());
    console.log('DEBUG: Current year =', new Date().getFullYear());

    const limit = createLimit({ id: 'limit-1', categoryId: 'expense-food', amount: 500 });
    const category = createCategory({ id: 'expense-food' });
    const transaction = createTransaction({
      category: 'expense-food',
      amount: 200,
      date: today,
    });

    console.log('DEBUG: Transaction =', JSON.stringify(transaction, null, 2));
    console.log('DEBUG: Limit =', JSON.stringify(limit, null, 2));

    mockData.limits = [limit];
    mockData.categories = [category];
    mockData.transactions = [transaction];

    console.log('DEBUG: mockData.transactions =', JSON.stringify(mockData.transactions, null, 2));

    const { container } = render(
      <TestWrapper>
        <Limits />
      </TestWrapper>
    );

    // Look for spending display
    const spendingElement = container.querySelector('[data-testid="limit-card-spending-limit-1"]');
    console.log('DEBUG: Spending element text =', spendingElement?.textContent);

    // Look for any text containing numbers
    const allText = container.textContent;
    console.log('DEBUG: Contains 200?', allText?.includes('200'));
    console.log('DEBUG: Contains 500?', allText?.includes('500'));
  });
});
