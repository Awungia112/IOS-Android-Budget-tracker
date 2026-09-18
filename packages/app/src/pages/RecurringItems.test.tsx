/**
 * @vitest-environment jsdom
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, within } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { MemoryRouter } from 'react-router-dom';
import type { RecurringItem, Category } from '@budget/core';

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
        recurring_items: 'Recurring Items',
        create_recurring_item: 'Create Recurring Item',
        delete_recurring_item: 'Delete Recurring Item',
        delete_confirmation: 'Are you sure you want to delete this item?',
        delete_recurring_confirmation: 'Deleting this recurring item removes it and all of its transactions, including ones that are already booked.',
        cancel: 'Cancel',
        delete: 'Delete',
        edit: 'Edit',
        unknownCategory: 'Unknown Category',
        category_food: 'Food',
        category_transport: 'Transport',
        category_salary: 'Salary',
        frequency_daily: 'Daily',
        frequency_weekly: 'Weekly',
        frequency_monthly: 'Monthly',
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

// Mock formatDate to return a readable string
vi.mock('@/lib/formatters', async () => {
  const actual = await vi.importActual('@/lib/formatters');
  return {
    ...actual,
    formatDate: (dateString: string) => dateString,
  };
});

// Mock data factories
const createRecurringItem = (overrides: Partial<RecurringItem> = {}): RecurringItem => ({
  id: `recurring-${Date.now()}-${Math.random()}`, // nosemgrep: nodejs_scan.javascript-crypto-rule-node_insecure_random_generator -- test fixture ID, no security context
  accountId: 'account-1',
  name: 'Test Recurring',
  amount: 200,
  categoryId: 'expense-food',
  type: 'expense',
  frequency: 'monthly',
  startDate: '2026-01-01',
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
  recurringItems: [] as RecurringItem[],
  categories: [] as Category[],
};
const mockDeleteRecurringItem = vi.fn();
const mockSwitchAccount = vi.fn();

// Mock the BudgetContext
vi.mock('@/contexts/BudgetContext', () => ({
  useBudget: () => ({
    get recurringItems() { return mockData.recurringItems; },
    get categories() { return mockData.categories; },
    deleteRecurringItem: mockDeleteRecurringItem,
    // Layout component requirements
    accounts: [{ id: 'account-1', name: 'Test Account', balance: 1000 }],
    currentAccount: { id: 'account-1', name: 'Test Account', balance: 1000 },
    switchAccount: mockSwitchAccount,
    isLoading: false,
    isOfflineMode: false,
    setIsOfflineMode: vi.fn(),
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

// Import RecurringItems after mocking
import RecurringItems from './RecurringItems';

// Wrapper component with providers
const TestWrapper = ({ children }: { children: React.ReactNode }) => (
  <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>{children}</MemoryRouter>
);

describe('RecurringItems Page', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockData.recurringItems = [];
    mockData.categories = [];
  });

  afterEach(() => {
    cleanup();
  });

  describe('Empty State', () => {
    it('shows create recurring item button when no items exist', () => {
      render(
        <TestWrapper>
          <RecurringItems />
        </TestWrapper>
      );

      expect(screen.getByLabelText('Create Recurring Item')).toBeInTheDocument();
    });

    it('navigates to add recurring item page when create button is clicked', () => {
      render(
        <TestWrapper>
          <RecurringItems />
        </TestWrapper>
      );

      fireEvent.click(screen.getByLabelText('Create Recurring Item'));

      expect(mockNavigate).toHaveBeenCalledWith('/recurring/add');
    });
  });

  describe('Recurring Items List', () => {
    it('displays recurring item cards when items exist', () => {
      const item = createRecurringItem({ name: 'Rent Payment' });
      const category = createCategory();
      mockData.recurringItems = [item];
      mockData.categories = [category];

      render(
        <TestWrapper>
          <RecurringItems />
        </TestWrapper>
      );

      expect(screen.getByText('Rent Payment')).toBeInTheDocument();
    });

    it('displays category label with frequency', () => {
      const item = createRecurringItem({ frequency: 'monthly' });
      const category = createCategory();
      mockData.recurringItems = [item];
      mockData.categories = [category];

      render(
        <TestWrapper>
          <RecurringItems />
        </TestWrapper>
      );

      // Category and frequency displayed together: stored key (persistence-first) + frequency
      const categoryText = screen.getByText(/category_food.*Monthly/);
      expect(categoryText).toBeInTheDocument();
      // Ensure stored key is preserved in the data model (regression guard)
      expect(mockData.categories[0].name).toBe('category_food');
    });

    it('displays translated label for default categories', () => {
      const item = createRecurringItem({ frequency: 'monthly' });
      const category = createCategory({ isDefault: true });
      mockData.recurringItems = [item];
      mockData.categories = [category];

      render(
        <TestWrapper>
          <RecurringItems />
        </TestWrapper>
      );

      // Default categories should be translated for display: "Food • Monthly"
      const translated = screen.getByText(/Food.*Monthly/);
      expect(translated).toBeInTheDocument();
    });

    it('displays the start date the user chose, even when it is in the past', () => {
      const item = createRecurringItem({ startDate: '2025-07-14' });
      const category = createCategory();
      mockData.recurringItems = [item];
      mockData.categories = [category];

      render(
        <TestWrapper>
          <RecurringItems />
        </TestWrapper>
      );

      // formatDate is mocked to return the raw date string
      expect(screen.getByText('2025-07-14')).toBeInTheDocument();
    });

    it('shows unknown category when category is not found', () => {
      const item = createRecurringItem({ categoryId: 'nonexistent' });
      mockData.recurringItems = [item];
      mockData.categories = [];

      render(
        <TestWrapper>
          <RecurringItems />
        </TestWrapper>
      );

      expect(screen.getByText(/Unknown Category/)).toBeInTheDocument();
    });

    it('shows add new recurring item card at the bottom of the list', () => {
      const item = createRecurringItem();
      const category = createCategory();
      mockData.recurringItems = [item];
      mockData.categories = [category];

      render(
        <TestWrapper>
          <RecurringItems />
        </TestWrapper>
      );

      const createButtons = screen.getAllByLabelText('Create Recurring Item');
      expect(createButtons.length).toBe(1);
    });

    it('displays different frequency labels correctly', () => {
      const dailyItem = createRecurringItem({ id: 'daily-1', name: 'Coffee', frequency: 'daily' });
      const weeklyItem = createRecurringItem({ id: 'weekly-1', name: 'Gym', frequency: 'weekly' });
      const category = createCategory();
      mockData.recurringItems = [dailyItem, weeklyItem];
      mockData.categories = [category];

      render(
        <TestWrapper>
          <RecurringItems />
        </TestWrapper>
      );

      expect(screen.getByText(/Daily/)).toBeInTheDocument();
      expect(screen.getByText(/Weekly/)).toBeInTheDocument();
    });
  });

  describe('Navigation - Edit Button', () => {
    it('navigates to edit page when edit button is clicked', () => {
      const item = createRecurringItem({ id: 'recurring-edit-test' });
      const category = createCategory();
      mockData.recurringItems = [item];
      mockData.categories = [category];

      render(
        <TestWrapper>
          <RecurringItems />
        </TestWrapper>
      );

      const editButton = screen.getByLabelText('Edit');
      fireEvent.click(editButton);

      expect(mockNavigate).toHaveBeenCalledWith('/recurring/edit/recurring-edit-test');
    });
  });

  describe('Delete Recurring Item', () => {
    it('opens confirmation dialog when delete button is clicked', () => {
      const item = createRecurringItem({ id: 'recurring-delete-test' });
      const category = createCategory();
      mockData.recurringItems = [item];
      mockData.categories = [category];

      render(
        <TestWrapper>
          <RecurringItems />
        </TestWrapper>
      );

      const deleteButton = screen.getByLabelText('Delete');
      fireEvent.click(deleteButton);

      expect(screen.getByText('Delete Recurring Item')).toBeInTheDocument();
      expect(screen.getByText('Deleting this recurring item removes it and all of its transactions, including ones that are already booked.')).toBeInTheDocument();
    });

    it('calls deleteRecurringItem when confirmation is accepted', () => {
      const item = createRecurringItem({ id: 'recurring-confirm-delete' });
      const category = createCategory();
      mockData.recurringItems = [item];
      mockData.categories = [category];

      render(
        <TestWrapper>
          <RecurringItems />
        </TestWrapper>
      );

      // Open dialog
      fireEvent.click(screen.getByLabelText('Delete'));

      // Find and click the Delete button inside the dialog
      const dialog = screen.getByRole('alertdialog');
      const confirmButton = within(dialog).getByRole('button', { name: 'Delete' });
      fireEvent.click(confirmButton);

      expect(mockDeleteRecurringItem).toHaveBeenCalledWith('recurring-confirm-delete');
    });

    it('does not delete when cancel is clicked', () => {
      const item = createRecurringItem({ id: 'recurring-cancel-delete' });
      const category = createCategory();
      mockData.recurringItems = [item];
      mockData.categories = [category];

      render(
        <TestWrapper>
          <RecurringItems />
        </TestWrapper>
      );

      // Open dialog
      fireEvent.click(screen.getByLabelText('Delete'));

      // Click cancel
      const dialog = screen.getByRole('alertdialog');
      const cancelButton = within(dialog).getByRole('button', { name: 'Cancel' });
      fireEvent.click(cancelButton);

      expect(mockDeleteRecurringItem).not.toHaveBeenCalled();
    });
  });

  describe('Page Header', () => {
    it('displays the page title', () => {
      render(
        <TestWrapper>
          <RecurringItems />
        </TestWrapper>
      );

      const heading = screen.getByRole('heading', { name: 'Recurring Items' });
      expect(heading).toBeInTheDocument();
    });
  });
});
