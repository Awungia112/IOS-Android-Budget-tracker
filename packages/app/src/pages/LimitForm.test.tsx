/**
 * @vitest-environment jsdom
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { MemoryRouter } from 'react-router-dom';
import type { Limit, Category } from '@budget/core';

// Mock navigation — default: no limitId (new limit mode)
let mockParams: Record<string, string | undefined> = {};
const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate,
    useParams: () => mockParams,
  };
});

// Mock react-i18next
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => {
      const translations: Record<string, string> = {
        cancel: 'Cancel',
        save: 'Save',
        new_limit: 'New Limit',
        edit_limit: 'Edit Limit',
        enter_amount: 'Enter amount',
        category: 'Category',
        category_food: 'Food',
        category_entertainment: 'Entertainment',
        category_household: 'Household',
        limit_empty_field: 'This field is required',
        limit_invalid_amount: 'Please enter a valid amount',
        limit_already_exists: 'A limit already exists for this category',
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
};
const mockAddLimit = vi.fn();
const mockUpdateLimit = vi.fn();

// Mock BudgetContext
vi.mock('@/contexts/BudgetContext', () => ({
  useBudget: () => ({
    get limits() { return mockData.limits; },
    get categories() { return mockData.categories; },
    addLimit: mockAddLimit,
    updateLimit: mockUpdateLimit,
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

import LimitForm from './LimitForm';

const TestWrapper = ({ children }: { children: React.ReactNode }) => (
  <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
    {children}
  </MemoryRouter>
);

describe('LimitForm Page', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockParams = {};
    mockData.limits = [];
    mockData.categories = [
      { id: 'expense-food', accountId: 'account-1', name: 'category_food', type: 'expense', isDefault: true },
      { id: 'expense-entertainment', accountId: 'account-1', name: 'category_entertainment', type: 'expense', isDefault: true },
      { id: 'income-salary', accountId: 'account-1', name: 'category_salary', type: 'income', isDefault: true },
    ];
  });

  afterEach(() => {
    cleanup();
  });

  it('renders "New Limit" heading for new limit', () => {
    render(
      <TestWrapper>
        <LimitForm />
      </TestWrapper>,
    );
    expect(screen.getByText('New Limit')).toBeInTheDocument();
  });

  it('renders "Edit Limit" heading when editing', () => {
    mockParams = { limitId: 'limit-1' };
    mockData.limits = [
      { id: 'limit-1', accountId: 'account-1', categoryId: 'expense-food', amount: 500 },
    ];

    render(
      <TestWrapper>
        <LimitForm />
      </TestWrapper>,
    );
    expect(screen.getByText('Edit Limit')).toBeInTheDocument();
  });

  it('shows only expense categories in the grid', () => {
    render(
      <TestWrapper>
        <LimitForm />
      </TestWrapper>,
    );

    // Should show expense categories
    expect(screen.getByText('Food')).toBeInTheDocument();
    expect(screen.getByText('Entertainment')).toBeInTheDocument();
    // Should not show income categories
    expect(screen.queryByText('Salary')).not.toBeInTheDocument();
  });

  it('shows validation error when submitting without category', () => {
    render(
      <TestWrapper>
        <LimitForm />
      </TestWrapper>,
    );

    // Enter amount but no category
    const amountInput = screen.getByPlaceholderText('Enter amount');
    fireEvent.change(amountInput, { target: { value: '500' } });

    // Click save
    fireEvent.click(screen.getByLabelText('Save'));

    expect(screen.getByText('This field is required')).toBeInTheDocument();
  });

  it('shows validation error when submitting without amount', () => {
    render(
      <TestWrapper>
        <LimitForm />
      </TestWrapper>,
    );

    // Select a category but no amount
    fireEvent.click(screen.getByLabelText('Food'));

    // Click save
    fireEvent.click(screen.getByLabelText('Save'));

    expect(screen.getByText('This field is required')).toBeInTheDocument();
  });

  it('calls addLimit with valid new limit data', () => {
    render(
      <TestWrapper>
        <LimitForm />
      </TestWrapper>,
    );

    // Select category
    fireEvent.click(screen.getByLabelText('Food'));

    // Enter amount
    const amountInput = screen.getByPlaceholderText('Enter amount');
    fireEvent.change(amountInput, { target: { value: '500' } });

    // Submit
    fireEvent.click(screen.getByLabelText('Save'));

    expect(mockAddLimit).toHaveBeenCalledWith({
      categoryId: 'expense-food',
      amount: 500,
    });
    expect(mockNavigate).toHaveBeenCalledWith('/limits');
  });

  it('calls updateLimit when editing an existing limit', () => {
    mockParams = { limitId: 'limit-1' };
    mockData.limits = [
      { id: 'limit-1', accountId: 'account-1', categoryId: 'expense-food', amount: 500 },
    ];

    render(
      <TestWrapper>
        <LimitForm />
      </TestWrapper>,
    );

    // Change amount
    const amountInput = screen.getByPlaceholderText('Enter amount');
    fireEvent.change(amountInput, { target: { value: '750' } });

    // Submit
    fireEvent.click(screen.getByLabelText('Save'));

    expect(mockUpdateLimit).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'limit-1',
        categoryId: 'expense-food',
        amount: 750,
      }),
    );
    expect(mockNavigate).toHaveBeenCalledWith('/limits');
  });

  it('navigates back on cancel', () => {
    render(
      <TestWrapper>
        <LimitForm />
      </TestWrapper>,
    );

    fireEvent.click(screen.getByLabelText('Cancel'));
    expect(mockNavigate).toHaveBeenCalledWith('/limits');
  });

  it('shows validation error for non-numeric amount', () => {
    // type="number" inputs sanitize non-numeric values to empty string in the DOM,
    // so 'abc' results in an empty field validation error
    render(
      <TestWrapper>
        <LimitForm />
      </TestWrapper>,
    );

    fireEvent.click(screen.getByLabelText('Food'));
    const amountInput = screen.getByPlaceholderText('Enter amount');
    fireEvent.change(amountInput, { target: { value: 'abc' } });
    fireEvent.click(screen.getByLabelText('Save'));

    expect(screen.getByText('This field is required')).toBeInTheDocument();
    expect(mockAddLimit).not.toHaveBeenCalled();
  });

  it('shows validation error for negative amount', () => {
    render(
      <TestWrapper>
        <LimitForm />
      </TestWrapper>,
    );

    fireEvent.click(screen.getByLabelText('Food'));
    const amountInput = screen.getByPlaceholderText('Enter amount');
    fireEvent.change(amountInput, { target: { value: '-100' } });
    fireEvent.click(screen.getByLabelText('Save'));

    expect(screen.getByText('Please enter a valid amount')).toBeInTheDocument();
    expect(mockAddLimit).not.toHaveBeenCalled();
  });

  it('shows validation error for zero amount', () => {
    render(
      <TestWrapper>
        <LimitForm />
      </TestWrapper>,
    );

    fireEvent.click(screen.getByLabelText('Food'));
    const amountInput = screen.getByPlaceholderText('Enter amount');
    fireEvent.change(amountInput, { target: { value: '0' } });
    fireEvent.click(screen.getByLabelText('Save'));

    expect(screen.getByText('Please enter a valid amount')).toBeInTheDocument();
    expect(mockAddLimit).not.toHaveBeenCalled();
  });

  it('detects duplicate category limit', () => {
    mockData.limits = [
      { id: 'limit-1', accountId: 'account-1', categoryId: 'expense-food', amount: 500 },
    ];

    render(
      <TestWrapper>
        <LimitForm />
      </TestWrapper>,
    );

    // Select the same category that already has a limit
    fireEvent.click(screen.getByLabelText('Food'));
    const amountInput = screen.getByPlaceholderText('Enter amount');
    fireEvent.change(amountInput, { target: { value: '300' } });

    fireEvent.click(screen.getByLabelText('Save'));

    expect(screen.getByText('A limit already exists for this category')).toBeInTheDocument();
    expect(mockAddLimit).not.toHaveBeenCalled();
  });
});
