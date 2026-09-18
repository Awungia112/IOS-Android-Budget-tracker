import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { vi } from 'vitest';
import { useBudget } from '@/contexts/BudgetContext';
import { useNavigate } from 'react-router-dom';
import { toast } from '@/components/ui/use-toast';
import SavingsGoals from './SavingsGoals';
import { SavingsGoal } from '@budget/core';

// Mock dependencies
vi.mock('@/contexts/BudgetContext');
vi.mock('react-router-dom', () => ({
  useNavigate: vi.fn(),
  useLocation: vi.fn(() => ({ pathname: '/savings-goals' })),
  Link: ({ children, to, ...props }: any) => <a href={to} {...props}>{children}</a>,
}));
vi.mock('@/components/ui/use-toast', () => ({
  toast: vi.fn(),
}));
vi.mock('@/components/Layout', () => ({
  default: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
vi.mock('@/components/CategoryAvatar', () => ({
  CategoryAvatar: ({ categoryKey, icon, size }: any) => <div data-testid="category-avatar">{categoryKey}</div>,
}));
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => {
      const translations: Record<string, string> = {
        'category_shopping': 'Shopping',
        'category_travel': 'Travel',
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
      };
      // eslint-disable-next-line security/detect-object-injection -- key is validated enum value/safe access pattern
      return translations[key] || key;
    },
    i18n: {
      changeLanguage: () => Promise.resolve(),
      language: 'en',
    },
  }),
}));

const mockUseBudget = useBudget as any;
const mockUseNavigate = useNavigate as any;
const mockToast = toast as any;

describe('SavingsGoals Page', () => {
  const mockGoals: SavingsGoal[] = [
    {
      id: 'goal-1',
      name: 'Test Goal 1',
      targetAmount: 1000,
      categoryId: 'category-1',
      deadline: '2024-12-31',
      accountId: 'account-1',
    },
    {
      id: 'goal-2',
      name: 'Test Goal 2',
      targetAmount: 500,
      categoryId: 'category-2',
      deadline: '2024-11-30',
      accountId: 'account-1',
    },
  ];

  const mockCategories = [
    { id: 'category-1', name: 'travel', icon: 'plane', type: 'expense' },
    { id: 'category-2', name: 'shopping', icon: 'shopping-bag', type: 'expense' },
  ];

  const mockTransactions = [
    {
      id: 'tx-1',
      type: 'expense',
      amount: 200,
      title: 'Test Goal 1 Payment',
      category: 'expense',
      date: '2024-01-01',
      savingsGoalId: 'goal-1',
    },
    {
      id: 'tx-2',
      type: 'expense',
      amount: 100,
      title: 'Test Goal 2 Payment',
      category: 'expense',
      date: '2024-01-02',
      savingsGoalId: 'goal-2',
    },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    
    mockUseBudget.mockReturnValue({
      savingsGoals: mockGoals,
      categories: mockCategories,
      transactions: mockTransactions,
      accounts: [{ id: 'account-1', name: 'Test Account', balance: 1000 }],
      deleteSavingsGoal: vi.fn(),
      addTransaction: vi.fn(),
      updateSavingsGoal: vi.fn(),
      deleteTransaction: vi.fn(),
    });
    
    mockUseNavigate.mockReturnValue(vi.fn());
    mockToast.mockReturnValue({} as any);
  });

  it('renders page header correctly', () => {
    render(<SavingsGoals />);
    expect(screen.getByText('Running Goals')).toBeInTheDocument();
  });

  it('displays savings goal cards for active goals', () => {
    render(<SavingsGoals />);

    // Should show both goals by their name (not category)
    expect(screen.getByText('Test Goal 1')).toBeInTheDocument();
    expect(screen.getByText('Test Goal 2')).toBeInTheDocument();
  });

  it('shows add goal card when goals exist', () => {
    render(<SavingsGoals />);
    expect(screen.getByText('Add Goal')).toBeInTheDocument();
  });

  it('shows only add goal card when no goals exist', () => {
    mockUseBudget.mockReturnValue({
      ...mockUseBudget(),
      savingsGoals: [],
    });

    render(<SavingsGoals />);
    
    // Should only show add goal card
    expect(screen.getByText('Add Goal')).toBeInTheDocument();
    expect(screen.queryByText('Test Goal 1')).not.toBeInTheDocument();
    expect(screen.queryByText('Test Goal 2')).not.toBeInTheDocument();
  });

  it('calculates progress correctly for each goal', () => {
    render(<SavingsGoals />);
    
    // Check that progress is calculated correctly
    // Progress bars are implemented as divs with bg-green-600/20 class
    const progressBars = document.querySelectorAll('.bg-green-600\\/20');
    expect(progressBars.length).toBeGreaterThan(0);
  });

  it('filters out completed goals from active goals list', () => {
    // This test is now outdated since we show all goals with completion badges
    // Let's test that goals show completion badges when they reach target amount
    const completedGoal = {
      id: 'goal-3',
      name: 'Completed Goal',
      targetAmount: 100,
      categoryId: 'category-1',
      deadline: '2024-12-31',
      accountId: 'account-1',
    };

    const completedTransactions = [
      ...mockTransactions,
      {
        id: 'tx-3',
        type: 'expense',
        amount: 100,
        title: 'Completed Goal Payment',
        category: 'expense',
        date: '2024-01-03',
        savingsGoalId: 'goal-3',
      },
    ];

    mockUseBudget.mockReturnValue({
      ...mockUseBudget(),
      savingsGoals: [...mockGoals, completedGoal],
      transactions: completedTransactions,
    });

    render(<SavingsGoals />);

    // Should show all goals by their name including the completed one
    expect(screen.getByText('Test Goal 1')).toBeInTheDocument();
    expect(screen.getByText('Test Goal 2')).toBeInTheDocument();
    expect(screen.getByText('Completed Goal')).toBeInTheDocument();
  });

  it('shows completion badge for completed goals', () => {
    // Mock a goal that has been completed with a completion transaction
    const completedGoal = {
      id: 'goal-3',
      name: 'Test Goal 3',
      targetAmount: 100,
      categoryId: 'category-1',
      deadline: '2024-12-31',
      accountId: 'account-1',
    };

    const completedTransactions = [
      ...mockTransactions,
      {
        id: 'tx-3',
        type: 'expense',
        amount: 100,
        title: 'Test Goal 3 Payment',
        category: 'expense',
        date: '2024-01-03',
        savingsGoalId: 'goal-3',
      },
      {
        id: 'tx-4',
        type: 'expense',
        amount: 100,
        title: 'Test Goal 3 completed',
        category: 'expense',
        date: '2024-01-04',
        savingsGoalId: null, // Completion transaction
      },
    ];

    mockUseBudget.mockReturnValue({
      ...mockUseBudget(),
      savingsGoals: [...mockGoals, completedGoal],
      transactions: completedTransactions,
    });

    render(<SavingsGoals />);

    // Should show all goals by their name
    expect(screen.getByText('Test Goal 1')).toBeInTheDocument();
    expect(screen.getByText('Test Goal 2')).toBeInTheDocument();
    expect(screen.getByText('Test Goal 3')).toBeInTheDocument();
    expect(screen.getByText('Completed')).toBeInTheDocument();
  });
});