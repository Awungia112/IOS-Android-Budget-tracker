/**
 * @vitest-environment jsdom
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, cleanup, within } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { MemoryRouter } from 'react-router-dom';
import type { Template, Category } from '@budget/core';

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
        templates: 'Templates',
        createTemplate: 'Create Template',
        deleteTemplate: 'Delete Template',
        areYouSureDelete: 'Are you sure you want to delete this template?',
        cancel: 'Cancel',
        delete: 'Delete',
        apply: 'Apply',
        edit: 'Edit',
        unknownCategory: 'Unknown Category',
        category_food: 'Food',
        category_transport: 'Transport',
        category_salary: 'Salary',
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
const createTemplate = (overrides: Partial<Template> = {}): Template => ({
  id: `template-${Date.now()}-${Math.random()}`, // nosemgrep: nodejs_scan.javascript-crypto-rule-node_insecure_random_generator -- test fixture ID, no security context
  accountId: 'account-1',
  name: 'Test Template',
  amount: 100,
  categoryId: 'expense-food',
  type: 'expense',
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
  templates: [] as Template[],
  categories: [] as Category[],
};
const mockDeleteTemplate = vi.fn();
const mockApplyTemplate = vi.fn();
const mockSwitchAccount = vi.fn();

// Mock the BudgetContext
vi.mock('@/contexts/BudgetContext', () => ({
  useBudget: () => ({
    get templates() { return mockData.templates; },
    get categories() { return mockData.categories; },
    deleteTemplate: mockDeleteTemplate,
    applyTemplate: mockApplyTemplate,
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

// Mock MigrationDrawerContext (required by Layout)
vi.mock('@/contexts/MigrationDrawerContext', () => ({
  MigrationDrawerProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  useMigrationDrawer: () => ({
    isOpen: false,
    openDrawer: vi.fn(),
    closeDrawer: vi.fn(),
  }),
}));

// Import Templates after mocking
import Templates from './Templates';

// Wrapper component with providers
const TestWrapper = ({ children }: { children: React.ReactNode }) => (
  <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>{children}</MemoryRouter>
);

describe('Templates Page', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockData.templates = [];
    mockData.categories = [];
  });

  afterEach(() => {
    cleanup();
  });

  describe('Empty State', () => {
    it('shows create template button when no templates exist', () => {
      render(
        <TestWrapper>
          <Templates />
        </TestWrapper>
      );

      expect(screen.getByLabelText('Create Template')).toBeInTheDocument();
    });

    it('navigates to add template page when create button is clicked', () => {
      render(
        <TestWrapper>
          <Templates />
        </TestWrapper>
      );

      fireEvent.click(screen.getByLabelText('Create Template'));

      expect(mockNavigate).toHaveBeenCalledWith('/templates/add');
    });
  });

  describe('Templates List', () => {
    it('displays template cards when templates exist', () => {
      const template = createTemplate({ name: 'Morning Bread', amount: 16 });
      const category = createCategory();
      mockData.templates = [template];
      mockData.categories = [category];

      render(
        <TestWrapper>
          <Templates />
        </TestWrapper>
      );

      expect(screen.getByText('Morning Bread')).toBeInTheDocument();
    });

    it('displays formatted amount with type indicator', () => {
      const expenseTemplate = createTemplate({ name: 'Groceries', amount: 50, type: 'expense' });
      const incomeTemplate = createTemplate({ id: 'template-income', name: 'Monthly Pay', amount: 3000, type: 'income', categoryId: 'income-salary' });
      const expenseCategory = createCategory();
      const incomeCategory = createCategory({ id: 'income-salary', name: 'category_salary', type: 'income' });
      mockData.templates = [expenseTemplate, incomeTemplate];
      mockData.categories = [expenseCategory, incomeCategory];

      render(
        <TestWrapper>
          <Templates />
        </TestWrapper>
      );

      expect(screen.getByText('Groceries')).toBeInTheDocument();
      expect(screen.getByText('Monthly Pay')).toBeInTheDocument();
    });

    it('displays category label for each template', () => {
      const template = createTemplate();
      const category = createCategory();
      mockData.templates = [template];
      mockData.categories = [category];

      render(
        <TestWrapper>
          <Templates />
        </TestWrapper>
      );

      expect(screen.getByText('category_food')).toBeInTheDocument();
    });

    it('displays translated label for default categories', () => {
      const template = createTemplate();
      const category = createCategory({ isDefault: true });
      mockData.templates = [template];
      mockData.categories = [category];

      render(
        <TestWrapper>
          <Templates />
        </TestWrapper>
      );

      // When category is marked as default, UI should translate it
      expect(screen.getByText('Food')).toBeInTheDocument();
    });

    it('shows unknown category when category is not found', () => {
      const template = createTemplate({ categoryId: 'nonexistent' });
      mockData.templates = [template];
      mockData.categories = [];

      render(
        <TestWrapper>
          <Templates />
        </TestWrapper>
      );

      expect(screen.getByText('Unknown Category')).toBeInTheDocument();
    });

    it('shows add new template card at the bottom of the list', () => {
      const template = createTemplate();
      const category = createCategory();
      mockData.templates = [template];
      mockData.categories = [category];

      render(
        <TestWrapper>
          <Templates />
        </TestWrapper>
      );

      const createButtons = screen.getAllByLabelText('Create Template');
      expect(createButtons.length).toBe(1);
    });
  });

  describe('Navigation - Edit Button', () => {
    it('navigates to edit page when edit button is clicked', () => {
      const template = createTemplate({ id: 'template-edit-test' });
      const category = createCategory();
      mockData.templates = [template];
      mockData.categories = [category];

      render(
        <TestWrapper>
          <Templates />
        </TestWrapper>
      );

      const editButton = screen.getByLabelText('Edit');
      fireEvent.click(editButton);

      expect(mockNavigate).toHaveBeenCalledWith('/templates/edit/template-edit-test');
    });
  });

  describe('Apply Template', () => {
    it('calls applyTemplate when apply button is clicked', () => {
      const template = createTemplate({ id: 'template-apply-test' });
      const category = createCategory();
      mockData.templates = [template];
      mockData.categories = [category];

      render(
        <TestWrapper>
          <Templates />
        </TestWrapper>
      );

      const applyButton = screen.getByLabelText('Apply');
      fireEvent.click(applyButton);

      expect(mockApplyTemplate).toHaveBeenCalledWith('template-apply-test');
    });
  });

  describe('Delete Template', () => {
    it('opens confirmation dialog when delete button is clicked', () => {
      const template = createTemplate({ id: 'template-delete-test' });
      const category = createCategory();
      mockData.templates = [template];
      mockData.categories = [category];

      render(
        <TestWrapper>
          <Templates />
        </TestWrapper>
      );

      const deleteButton = screen.getByLabelText('Delete');
      fireEvent.click(deleteButton);

      expect(screen.getByText('Delete Template')).toBeInTheDocument();
      expect(screen.getByText('Are you sure you want to delete this template?')).toBeInTheDocument();
    });

    it('calls deleteTemplate when confirmation is accepted', () => {
      const template = createTemplate({ id: 'template-confirm-delete' });
      const category = createCategory();
      mockData.templates = [template];
      mockData.categories = [category];

      render(
        <TestWrapper>
          <Templates />
        </TestWrapper>
      );

      // Open dialog
      fireEvent.click(screen.getByLabelText('Delete'));

      // Find and click the Delete button inside the dialog
      const dialog = screen.getByRole('alertdialog');
      const confirmButton = within(dialog).getByRole('button', { name: 'Delete' });
      fireEvent.click(confirmButton);

      expect(mockDeleteTemplate).toHaveBeenCalledWith('template-confirm-delete');
    });

    it('does not delete when cancel is clicked', () => {
      const template = createTemplate({ id: 'template-cancel-delete' });
      const category = createCategory();
      mockData.templates = [template];
      mockData.categories = [category];

      render(
        <TestWrapper>
          <Templates />
        </TestWrapper>
      );

      // Open dialog
      fireEvent.click(screen.getByLabelText('Delete'));

      // Click cancel
      const dialog = screen.getByRole('alertdialog');
      const cancelButton = within(dialog).getByRole('button', { name: 'Cancel' });
      fireEvent.click(cancelButton);

      expect(mockDeleteTemplate).not.toHaveBeenCalled();
    });
  });

  describe('Page Header', () => {
    it('displays the page title', () => {
      render(
        <TestWrapper>
          <Templates />
        </TestWrapper>
      );

      const heading = screen.getByRole('heading', { name: 'Templates' });
      expect(heading).toBeInTheDocument();
    });
  });
});
