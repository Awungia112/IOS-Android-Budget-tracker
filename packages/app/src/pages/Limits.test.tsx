/**
 * @vitest-environment jsdom
 */

/**
 * Limits Page Tests
 *
 * Tests for the spending limits page component.
 * Covers navigation, button click handling, and event propagation.
 */

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
  };
});

// Mock react-i18next
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => {
      const translations: Record<string, string> = {
        set_limits: 'Set Limits',
        new_limit_button: 'New Limit',
        edit_limit: 'Edit Limit',
        delete_limit: 'Delete Limit',
        are_you_sure_delete: 'Are you sure you want to delete this limit?',
        cancel: 'Cancel',
        delete: 'Delete',
        unknownCategory: 'Unknown',
        category_food: 'Food',
        category_transport: 'Transport',
      };
      // eslint-disable-next-line security/detect-object-injection -- key is validated enum value/safe access pattern
      return translations[key] || key;
    },
    i18n: {
      language: 'en',
    },
  }),
  I18nextProvider: ({ children }: { children: React.ReactNode }) => children,
  initReactI18next: { type: '3rdParty', init: () => {} },
}));

// Mock data factories
const createLimit = (overrides: Partial<Limit> = {}): Limit => ({
  id: `limit-${Date.now()}-${Math.random()}`, // nosemgrep: nodejs_scan.javascript-crypto-rule-node_insecure_random_generator -- test fixture ID, no security context
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
  id: `transaction-${Date.now()}-${Math.random()}`, // nosemgrep: nodejs_scan.javascript-crypto-rule-node_insecure_random_generator -- test fixture ID, no security context
  accountId: 'account-1',
  type: 'expense',
  amount: 100,
  category: 'expense-food',
  date: new Date().toISOString().split('T')[0],
  title: 'Test Transaction',
  ...overrides,
});

// Mock useBudget hook data - using an object to allow mutations to be visible
const mockData = {
  limits: [] as Limit[],
  categories: [] as Category[],
  transactions: [] as Transaction[],
};
const mockDeleteLimit = vi.fn();
const mockSwitchAccount = vi.fn();

// Mock the BudgetContext
vi.mock('@/contexts/BudgetContext', () => ({
  useBudget: () => ({
    get limits() { return mockData.limits; },
    get categories() { return mockData.categories; },
    get transactions() { return mockData.transactions; },
    deleteLimit: mockDeleteLimit,
    // Layout component requirements
    accounts: [{ id: 'account-1', name: 'Test Account', balance: 1000 }],
    currentAccount: { id: 'account-1', name: 'Test Account', balance: 1000 },
    switchAccount: mockSwitchAccount,
    isLoading: false,
    isOfflineMode: false,
    setIsOfflineMode: vi.fn(),
    goOnline: vi.fn(),
    missedNotifications: [],
    dismissMissedNotifications: vi.fn(),
  }),
}));

// Mock the AccountContext (required by Layout)
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

// Import Limits after mocking
import Limits from './Limits';

// Wrapper component with providers
const TestWrapper = ({ children, initialEntries = ['/limits'] }: { children: React.ReactNode, initialEntries?: string[] }) => (
  <MemoryRouter initialEntries={initialEntries} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>{children}</MemoryRouter>
);

describe('Limits Page', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockData.limits = [];
    mockData.categories = [];
    mockData.transactions = [];
  });

  afterEach(() => {
    cleanup();
  });

  describe('Empty State', () => {
    it('shows add new limit button when no limits exist', () => {
      render(
        <TestWrapper>
          <Limits />
        </TestWrapper>
      );

      expect(screen.getByLabelText('New Limit')).toBeInTheDocument();
    });

    it('navigates to add limit page when new limit button is clicked', () => {
      render(
        <TestWrapper>
          <Limits />
        </TestWrapper>
      );

      fireEvent.click(screen.getByLabelText('New Limit'));

      expect(mockNavigate).toHaveBeenCalledWith('/limits/add');
    });
  });

  describe('Limits List', () => {
    it('displays limit cards when limits exist', () => {
      const limit = createLimit({ id: 'limit-1', amount: 500 });
      const category = createCategory({ id: 'expense-food', name: 'category_food' });
      mockData.limits = [limit];
      mockData.categories = [category];

      render(
        <TestWrapper>
          <Limits />
        </TestWrapper>
      );

      // Should display the limit amount (German locale: "500,00 €")
      expect(screen.getByText(/500.*€|€.*500/)).toBeInTheDocument();
    });

    it('displays spending against limit', () => {
      const limit = createLimit({ id: 'limit-1', categoryId: 'expense-food', amount: 500 });
      const category = createCategory({ id: 'expense-food' });
      const transaction = createTransaction({
        category: 'expense-food',
        amount: 200,
        date: new Date().toISOString().split('T')[0],
      });
      mockData.limits = [limit];
      mockData.categories = [category];
      mockData.transactions = [transaction];

      render(
        <TestWrapper>
          <Limits />
        </TestWrapper>
      );

      // Should display spending and limit (German locale: "200,00 €" / "500,00 €")
      expect(screen.getByText(/200.*€|€.*200/)).toBeInTheDocument();
      expect(screen.getByText(/500.*€|€.*500/)).toBeInTheDocument();
    });
  });

  describe('Navigation - Card Click', () => {
    it('navigates to limit detail when card is clicked', () => {
      const limit = createLimit({ id: 'limit-123' });
      const category = createCategory({ id: 'expense-food' });
      mockData.limits = [limit];
      mockData.categories = [category];

      render(
        <TestWrapper>
          <Limits />
        </TestWrapper>
      );

      // Find the card by role
      const card = screen.getByRole('button', { name: /food/i });
      fireEvent.click(card);

      expect(mockNavigate).toHaveBeenCalledWith('/limits/limit-123');
    });

    it('supports keyboard navigation with Enter key', () => {
      const limit = createLimit({ id: 'limit-456' });
      const category = createCategory({ id: 'expense-food' });
      mockData.limits = [limit];
      mockData.categories = [category];

      render(
        <TestWrapper>
          <Limits />
        </TestWrapper>
      );

      const card = screen.getByRole('button', { name: /food/i });
      fireEvent.keyDown(card, { key: 'Enter' });

      expect(mockNavigate).toHaveBeenCalledWith('/limits/limit-456');
    });

    it('does not navigate on other keys', () => {
      const limit = createLimit({ id: 'limit-789' });
      const category = createCategory({ id: 'expense-food' });
      mockData.limits = [limit];
      mockData.categories = [category];

      render(
        <TestWrapper>
          <Limits />
        </TestWrapper>
      );

      const card = screen.getByRole('button', { name: /food/i });
      fireEvent.keyDown(card, { key: 'Space' });

      expect(mockNavigate).not.toHaveBeenCalled();
    });
  });

  describe('Navigation - Edit Button', () => {
    it('navigates to edit page when edit button is clicked', () => {
      const limit = createLimit({ id: 'limit-edit-test' });
      const category = createCategory({ id: 'expense-food' });
      mockData.limits = [limit];
      mockData.categories = [category];

      render(
        <TestWrapper>
          <Limits />
        </TestWrapper>
      );

      const editButton = screen.getByLabelText('Edit Limit');
      fireEvent.click(editButton);

      expect(mockNavigate).toHaveBeenCalledWith('/limits/edit/limit-edit-test');
    });

    it('does not trigger card navigation when edit button is clicked', () => {
      const limit = createLimit({ id: 'limit-no-propagate' });
      const category = createCategory({ id: 'expense-food' });
      mockData.limits = [limit];
      mockData.categories = [category];

      render(
        <TestWrapper>
          <Limits />
        </TestWrapper>
      );

      const editButton = screen.getByLabelText('Edit Limit');
      fireEvent.click(editButton);

      // Should navigate to edit, not to detail
      expect(mockNavigate).toHaveBeenCalledTimes(1);
      expect(mockNavigate).not.toHaveBeenCalledWith('/limits/limit-no-propagate');
    });
  });

  describe('DOM Structure', () => {
    it('does not have nested button elements', () => {
      const limit = createLimit({ id: 'limit-dom-test' });
      const category = createCategory({ id: 'expense-food' });
      mockData.limits = [limit];
      mockData.categories = [category];

      const { container } = render(
        <TestWrapper>
          <Limits />
        </TestWrapper>
      );

      // Find all buttons
      const buttons = container.querySelectorAll('button');

      // Check that no button contains another button
      buttons.forEach(button => {
        const nestedButtons = button.querySelectorAll('button');
        // The button should not have any nested buttons
        expect(nestedButtons.length).toBe(0);
      });
    });

    it('limit card uses div with role="button" for accessibility', () => {
      const limit = createLimit({ id: 'limit-a11y-test' });
      const category = createCategory({ id: 'expense-food' });
      mockData.limits = [limit];
      mockData.categories = [category];

      render(
        <TestWrapper>
          <Limits />
        </TestWrapper>
      );

      // The card should have role="button" and tabIndex for accessibility
      const card = screen.getByRole('button', { name: /food/i });
      expect(card.tagName).toBe('DIV');
      expect(card).toHaveAttribute('tabIndex', '0');
    });
  });

  describe('Page Header', () => {
    it('displays the page title', () => {
      render(
        <TestWrapper>
          <Limits />
        </TestWrapper>
      );

      expect(screen.getByText('Set Limits')).toBeInTheDocument();
    });
  });
});
