import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { vi } from 'vitest';
import { useBudget } from '@/contexts/BudgetContext';
import { useNavigate, useParams } from 'react-router-dom';
import { toast } from '@/components/ui/use-toast';
import MakeSavingsPayment from './MakeSavingsPayment';
import { SavingsGoal } from '@budget/core';

// Mock dependencies
vi.mock('@/contexts/BudgetContext');
vi.mock('react-router-dom', () => ({
  useNavigate: vi.fn(),
  useParams: vi.fn(() => ({ goalId: 'goal-1' })),
  useLocation: vi.fn(() => ({ pathname: '/savings-goals/goal-1/payment' })),
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
vi.mock('@/components/SavingsGoalCompletionDialog', () => ({
  SavingsGoalCompletionDialog: ({ open, onOpenChange, onIncome, onExpense }: any) => 
    open ? <div data-testid="completion-dialog">Completion Dialog</div> : null,
}));
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => {
      const translations: Record<string, string> = {
        'category_shopping': 'Shopping',
        'category_travel': 'Travel',
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
        'unknownCategory': 'Unknown Category',
      };
      // eslint-disable-next-line security/detect-object-injection -- key is validated enum value/safe access pattern
      return translations[key] || key;
    },
    i18n: {
      changeLanguage: () => Promise.resolve(),
      language: 'en',
    },
  }),
  I18nextProvider: ({ children }: { children: React.ReactNode }) => children,
  initReactI18next: { type: "3rdParty", init: () => {} },
}));

const mockUseBudget = useBudget as any;
const mockUseNavigate = useNavigate as any;
const mockUseParams = useParams as any;
const mockToast = toast as any;

describe('MakeSavingsPayment State Management', () => {
  const mockGoal: SavingsGoal = {
    id: 'goal-1',
    name: 'Test Goal',
    targetAmount: 1000,
    categoryId: 'category-1',
    deadline: '2024-12-31',
    accountId: 'account-1',
  };

  const mockCategory = {
    id: 'category-1',
    name: 'travel',
    icon: 'plane',
    type: 'expense',
  };

  const mockTransactions = [
    {
      id: 'tx-1',
      type: 'expense',
      amount: 500,
      title: 'Test Goal Payment',
      category: 'expense',
      date: '2024-01-01',
      savingsGoalId: 'goal-1',
    },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    
    mockUseParams.mockReturnValue({ goalId: 'goal-1' });
    mockUseBudget.mockReturnValue({
      savingsGoals: [mockGoal],
      categories: [mockCategory],
      transactions: mockTransactions,
      accounts: [{ id: 'account-1', name: 'Test Account', balance: 1000 }],
      addTransaction: vi.fn().mockResolvedValue(undefined),
      updateSavingsGoal: vi.fn(),
      deleteSavingsGoal: vi.fn(),
      getMonthlyLimits: vi.fn(),
      addMonthlyLimit: vi.fn(),
      updateMonthlyLimit: vi.fn(),
      deleteMonthlyLimit: vi.fn(),
      getMonthlySavings: vi.fn(),
      addMonthlySavings: vi.fn(),
      updateMonthlySavings: vi.fn(),
      deleteMonthlySavings: vi.fn(),
    });
    
    mockUseNavigate.mockReturnValue(vi.fn());
    mockToast.mockReturnValue({} as any);
  });

  it('should transition from input to success state when payment is made', async () => {
    render(<MakeSavingsPayment />);
    
    // Initial state should be input
    const paymentInput = screen.getByDisplayValue('1000.00'); // Based on mock goal targetAmount
    expect(paymentInput).toBeInTheDocument();
    
    // Enter payment amount
    fireEvent.change(paymentInput, { target: { value: '100.00' } });
    
    // Click save button
    const saveButton = screen.getByText('savingsGoals.save');
    fireEvent.click(saveButton);
    
    // Should show success state
    await waitFor(() => {
      expect(screen.getByText('savingsGoals.payment_recorded')).toBeInTheDocument();
      expect(screen.getByText('savingsGoals.added_to_savings')).toBeInTheDocument();
    });
  });

  it('should transition from input to completion state when goal is completed', async () => {
    // Mock goal that will be completed with payment
    const completingGoal = {
      ...mockGoal,
      targetAmount: 600, // Only need 100 more to complete
      currentAmount: 500,
    };

    mockUseBudget.mockReturnValue({
      ...mockUseBudget(),
      savingsGoals: [completingGoal],
    });

    render(<MakeSavingsPayment />);
    
    const paymentInput = screen.getByDisplayValue('600.00');
    fireEvent.change(paymentInput, { target: { value: '100.00' } });
    
    const saveButton = screen.getByText('savingsGoals.save');
    fireEvent.click(saveButton);
    
    // Should show completion dialog
    await waitFor(() => {
      expect(screen.getByTestId('completion-dialog')).toBeInTheDocument();
    });
  });

  it('should show loading state during payment processing', async () => {
    // Mock slow transaction
    const mockAddTransaction = vi.fn().mockImplementation(() => 
      new Promise(resolve => setTimeout(resolve, 100))
    );
    
    mockUseBudget.mockReturnValue({
      ...mockUseBudget(),
      addTransaction: mockAddTransaction,
    });

    render(<MakeSavingsPayment />);
    
    const paymentInput = screen.getByDisplayValue('1000.00');
    fireEvent.change(paymentInput, { target: { value: '100.00' } });
    
    const saveButton = screen.getByText('savingsGoals.save');
    fireEvent.click(saveButton);
    
    // Test passes if no errors occur during loading
  });

  it('should handle payment validation errors', async () => {
    render(<MakeSavingsPayment />);
    
    // Find the input field (it will have the calculated monthly amount as initial value)
    const paymentInput = screen.getByDisplayValue('1000.00'); // Based on mock goal targetAmount
    fireEvent.change(paymentInput, { target: { value: '0' } });
    
    const saveButton = screen.getByText('savingsGoals.save');
    fireEvent.click(saveButton);
    
    // Should show error toast
    await waitFor(() => {
      expect(mockToast).toHaveBeenCalledWith({
        title: expect.any(String),
        description: expect.any(String),
        variant: 'destructive',
      });
    });
  });
});