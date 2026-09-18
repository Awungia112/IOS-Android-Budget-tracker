import { vi } from 'vitest';
import React from 'react';

/**
 * Common test helpers and mocks for savings goals tests
 * Centralizes all the repeated mocking code to reduce duplication
 */

// Common translation keys used across savings goals tests
export const SAVINGS_GOALS_TRANSLATIONS = {
  // Categories
  'category_shopping': 'Shopping',
  'category_travel': 'Travel',

  // Common UI text
  'savingsGoals.runningGoals': 'Running Goals',
  'savingsGoals.addGoal': 'Add Goal',
  'savingsGoals.deleteGoal': 'Delete Goal',
  'savingsGoals.deleteGoalDescription': 'Are you sure you want to delete this goal?',
  'savingsGoals.completed': 'Completed',
  'savingsGoals.deleteConfirmTitle': 'Delete Goal',
  'savingsGoals.deleteConfirmDescription': 'Are you sure you want to delete this goal?',
  'savingsGoals.deleteConfirmCancel': 'Cancel',
  'savingsGoals.deleteConfirmDelete': 'Delete',
  'savingsGoals.until': 'until',
  'savingsGoals.alreadySaved': 'Already saved',
  'savingsGoals.savingsGoal': 'Savings goal',

  // MakeSavingsPayment
  'savingsGoals.makePayment': 'Make Payment',
  'savingsGoals.paymentAmount': 'Payment Amount',
  'savingsGoals.paymentDescription': 'Payment Description',
  'savingsGoals.completePayment': 'Complete Payment',
  'savingsGoals.cancel': 'cancel',
  'savingsGoals.save': 'savingsGoals.save',
  'savingsGoals.paymentSuccess': 'Payment Successful',
  'savingsGoals.paymentError': 'Payment Error',
  'savingsGoals.target_rate': 'savingsGoals.target_rate',
  'savingsGoals.savingsGoalReached': 'Savings Goal Reached',
  'savingsGoals.completionTitle': 'Goal Completed!',
  'savingsGoals.completionDescription': 'Congratulations! You\'ve reached your savings goal. How would you like to handle the completed amount?',
  'savingsGoals.completionIncome': 'Income',
  'savingsGoals.completionExpense': 'Expense',
  'error': 'Error',
  'savingsGoals.invalid_payment_amount': 'Invalid payment amount',

  // SavingsGoalDetail
  'savingsGoals.goalDetails': 'Goal Details',
  'savingsGoals.edit': 'Edit',
  'savingsGoals.delete': 'Delete Savings Goal',
  'savingsGoals.paymentHistory': 'Payment History',
  'savingsGoals.progress': 'Progress',
  'savingsGoals.deadline': 'Deadline',
  'savingsGoals.monthlyAmount': 'Monthly Amount',
  'savingsGoals.nextPayment': 'Next Payment',
  'savingsGoals.paymentsMade': 'payments made',
  'savingsGoals.of': 'of',
  'frequency_monthly': 'monthly',
  'savingsGoals.completedOn': 'savingsGoals.completedOn',

  // SavingsGoalForm
  'savingsGoals.createGoal': 'Create Goal',
  'savingsGoals.editGoal': 'Edit Goal',
  'savingsGoals.goalName': 'Goal Name',
  'savingsGoals.category': 'Category',
  'savingsGoals.account': 'Account',
  'validation.required': 'This field is required',
  'validation.invalidAmount': 'Invalid amount',

  'savingsGoals.achieved': 'savingsGoals.achieved',
  'savingsGoals.target': 'savingsGoals.target',
  'unknownCategory': 'unknownCategory',
} as const;

// Mock react-i18next with savings goals translations
export const mockReactI18next = () => {
  vi.mock('react-i18next', () => ({
    useTranslation: () => ({
      t: (key: string) => SAVINGS_GOALS_TRANSLATIONS[key as keyof typeof SAVINGS_GOALS_TRANSLATIONS] || key,
      i18n: {
        changeLanguage: () => Promise.resolve(),
        language: 'en',
      },
    }),
  }));
};

// Mock common components
export const mockCommonComponents = () => {
  vi.mock('@/components/Layout', () => ({
    default: ({ children }: { children: React.ReactNode }) => React.createElement('div', null, children),
  }));

  vi.mock('@/components/CategoryAvatar', () => ({
    CategoryAvatar: ({ categoryKey, icon, size }: any) => React.createElement('div', { 'data-testid': 'category-avatar' }, categoryKey),
  }));

  vi.mock('@/components/SavingsGoalCompletionDialog', () => ({
    SavingsGoalCompletionDialog: ({ open, onOpenChange, onIncome, onExpense }: any) =>
      open ? React.createElement('div', { 'data-testid': 'completion-dialog' }, [
        React.createElement('button', { key: 'income', onClick: onIncome }, 'Income'),
        React.createElement('button', { key: 'expense', onClick: onExpense }, 'Expense')
      ]) : null,
  }));
};

// Mock react-router-dom
export const mockReactRouterDom = () => {
  vi.mock('react-router-dom', () => ({
    useNavigate: vi.fn(),
    useLocation: vi.fn(() => ({ pathname: '/savings-goals' })),
    useParams: vi.fn(() => ({ goalId: 'goal-1' })),
    Link: ({ children, to, ...props }: any) => React.createElement('a', { href: to, ...props }, children),
  }));
};

// Mock toast
export const mockToast = () => {
  vi.mock('@/components/ui/use-toast', () => ({
    toast: vi.fn(),
  }));
};

// Setup all common mocks for savings goals tests
export const setupSavingsGoalsTestMocks = () => {
  mockReactI18next();
  mockCommonComponents();
  mockReactRouterDom();
  mockToast();

  // Mock BudgetContext
  vi.mock('@/contexts/BudgetContext', () => ({
    useBudget: vi.fn(),
  }));
};

// Common mock data
export const createMockGoal = (overrides: Partial<any> = {}) => ({
  id: 'goal-1',
  name: 'Travel Goal',
  targetAmount: 1000,
  monthlyAmount: 1000,
  categoryId: 'category-1',
  deadline: '2024-12-31',
  accountId: 'account-1',
  ...overrides,
});

export const createMockCategory = (overrides: Partial<any> = {}) => ({
  id: 'category-1',
  name: 'travel',
  icon: 'plane',
  type: 'expense',
  ...overrides,
});

export const createMockTransaction = (overrides: Partial<any> = {}) => ({
  id: 'tx-1',
  type: 'income',
  amount: 100,
  title: 'Test Transaction',
  category: 'income',
  date: '2024-01-01',
  savingsGoalId: 'goal-1',
  ...overrides,
});

// Helper to create mock budget context
export const createMockBudgetContext = (overrides: any = {}) => ({
  savingsGoals: [],
  categories: [],
  transactions: [],
  accounts: [],
  addSavingsGoal: vi.fn(),
  updateSavingsGoal: vi.fn(),
  deleteSavingsGoal: vi.fn(),
  addTransaction: vi.fn(),
  updateTransaction: vi.fn(),
  deleteTransaction: vi.fn(),
  ...overrides,
});
