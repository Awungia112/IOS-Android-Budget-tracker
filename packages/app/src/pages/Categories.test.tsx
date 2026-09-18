/**
 * @vitest-environment jsdom
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { MemoryRouter } from 'react-router-dom';
import type { Category } from '@budget/core';

// Mock navigation
const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate,
    useParams: () => ({ type: 'expense' }),
  };
});

// Mock react-i18next
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => {
      const translations: Record<string, string> = {
        income_categories: 'Income Categories',
        expense_categories: 'Expense Categories',
        no_categories: 'No categories',
        add_category: 'Add Category',
        category: 'Category',
        cancel: 'Cancel',
        delete: 'Delete',
        delete_category: 'Delete Category',
        are_you_sure_delete: 'Are you sure?',
        are_you_sure_delete_category: 'Are you sure you want to delete this category? This action cannot be undone.',
        new_income: 'New Income',
        new_expense: 'New Expense',
        category_food: 'Food',
        category_salary: 'Salary',
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
  categories: [] as Category[],
};
const mockAddCategory = vi.fn();
const mockDeleteCategory = vi.fn();

// Mock BudgetContext
vi.mock('@/contexts/BudgetContext', () => ({
  useBudget: () => ({
    get categories() { return mockData.categories; },
    addCategory: mockAddCategory,
    deleteCategory: mockDeleteCategory,
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

// Mock category-icons
vi.mock('@/lib/category-icons', () => ({
  getIconPath: () => undefined,
}));

// Mock icon-picker
vi.mock('@/components/ui/icon-picker', () => ({
  IconPicker: ({ value, onChange }: { value: string; onChange: (v: string) => void }) => (
    <button data-testid="icon-picker" onClick={() => onChange('cash')}>
      Pick Icon
    </button>
  ),
  getLucideIcon: () => null,
}));

import Categories from './Categories';

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

describe('Categories Page', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockData.categories = [];
  });

  afterEach(() => {
    cleanup();
  });

  it('renders expense categories heading', () => {
    render(
      <TestWrapper>
        <Categories />
      </TestWrapper>,
    );
    expect(screen.getAllByText('Expense Categories').length).toBeGreaterThan(0);
  });

  it('shows empty state when no categories', () => {
    render(
      <TestWrapper>
        <Categories />
      </TestWrapper>,
    );
    expect(screen.getByText('No categories')).toBeInTheDocument();
  });

  it('renders category chips when categories exist', () => {
    mockData.categories = [
      createCategory({ id: 'expense-food', name: 'category_food', type: 'expense' }),
    ];

    render(
      <TestWrapper>
        <Categories />
      </TestWrapper>,
    );

    expect(screen.getByText('Food')).toBeInTheDocument();
  });

  it('filters categories by type (only expense)', () => {
    mockData.categories = [
      createCategory({ id: 'expense-food', name: 'category_food', type: 'expense' }),
      createCategory({ id: 'income-salary', name: 'category_salary', type: 'income' }),
    ];

    render(
      <TestWrapper>
        <Categories />
      </TestWrapper>,
    );

    expect(screen.getByText('Food')).toBeInTheDocument();
    expect(screen.queryByText('Salary')).not.toBeInTheDocument();
  });

  it('does not show delete button for default categories', () => {
    mockData.categories = [
      createCategory({ id: 'expense-food', name: 'category_food', isDefault: true }),
    ];

    render(
      <TestWrapper>
        <Categories />
      </TestWrapper>,
    );

    // No delete button should appear for default categories
    expect(screen.queryByRole('button', { name: /^Delete /i })).not.toBeInTheDocument();
  });

  it('shows delete button for non-default categories', () => {
    mockData.categories = [
      createCategory({ id: 'custom-1', name: 'My Custom', isDefault: false }),
    ];

    render(
      <TestWrapper>
        <Categories />
      </TestWrapper>,
    );

    expect(screen.getByRole('button', { name: /^Delete /i })).toBeInTheDocument();
  });

  it('opens delete confirmation when delete button clicked', () => {
    mockData.categories = [
      createCategory({ id: 'custom-1', name: 'My Custom', isDefault: false }),
    ];

    render(
      <TestWrapper>
        <Categories />
      </TestWrapper>,
    );

    fireEvent.click(screen.getByRole('button', { name: /^Delete /i }));

    expect(screen.getByText('Delete Category')).toBeInTheDocument();
  });

  it('calls deleteCategory when delete confirmed', () => {
    mockData.categories = [
      createCategory({ id: 'custom-1', name: 'My Custom', isDefault: false }),
    ];

    render(
      <TestWrapper>
        <Categories />
      </TestWrapper>,
    );

    // Open delete dialog
    fireEvent.click(screen.getByRole('button', { name: /^Delete /i }));

    // Confirm delete
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));

    expect(mockDeleteCategory).toHaveBeenCalledWith('custom-1');
  });
});
