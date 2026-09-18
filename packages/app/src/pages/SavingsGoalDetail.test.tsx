import { vi } from 'vitest';
import {
  setupSavingsGoalsTestMocks,
  createMockGoal,
  createMockCategory,
  createMockTransaction,
  createMockBudgetContext
} from '@/test-utils/testHelpers';

// Setup all common mocks BEFORE importing the components
setupSavingsGoalsTestMocks();

import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { useBudget } from '@/contexts/BudgetContext';
import { useNavigate, useParams } from 'react-router-dom';
import { toast } from '@/components/ui/use-toast';
import SavingsGoalDetail from './SavingsGoalDetail';
import { useSavingsGoalValidation } from '@/hooks/useSavingsGoalValidation';
import { SavingsGoal } from '@budget/core';

const mockUseBudget = useBudget as any;
const mockUseNavigate = useNavigate as any;
const mockUseParams = useParams as any;
const mockToast = toast as any;
const mockUseSavingsGoalValidation = useSavingsGoalValidation as any;

describe('SavingsGoalDetail', () => {
  const mockGoal = createMockGoal({
    id: 'goal-1',
    name: 'Travel Goal',
    targetAmount: 1000,
    monthlyAmount: 1000,
    categoryId: 'category-1',
    deadline: '2024-12-31',
  });

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
      amount: 200,
      title: 'Travel Goal Payment',
      category: 'expense',
      date: '2024-01-01',
      savingsGoalId: 'goal-1',
    },
    {
      id: 'tx-2',
      type: 'expense',
      amount: 100,
      title: 'Travel Goal Payment',
      category: 'expense',
      date: '2024-01-15',
      savingsGoalId: 'goal-1',
    },
  ];

  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(new Date('2024-12-01'));
    vi.clearAllMocks();

    mockUseParams.mockReturnValue({ goalId: 'goal-1' });
    mockUseBudget.mockReturnValue({
      savingsGoals: [mockGoal],
      categories: [mockCategory],
      transactions: mockTransactions,
      accounts: [{ id: 'account-1', name: 'Test Account', balance: 1000 }],
      deleteSavingsGoal: vi.fn(),
      addTransaction: vi.fn(),
      deleteTransaction: vi.fn(),
    });

    mockUseNavigate.mockReturnValue(vi.fn());
    mockToast.mockReturnValue({} as any);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders goal detail page correctly', () => {
    render(<SavingsGoalDetail />);

    const goalNameElements = screen.getAllByText('Travel Goal');
    expect(goalNameElements.length).toBeGreaterThan(0);
    expect(screen.getByText('300,00 €')).toBeInTheDocument();
    expect(screen.getByText('1.000,00 €')).toBeInTheDocument();
  });

  it('displays progress information', () => {
    // Set explicit monthlyAmount to make the test deterministic
    // (without it, the component calculates monthlyAmount from today's date)
    const goalWithMonthly = { ...mockGoal, monthlyAmount: 350 };
    mockUseBudget.mockReturnValue({
      ...mockUseBudget(),
      savingsGoals: [goalWithMonthly],
    });

    render(<SavingsGoalDetail />);


    // Should show payment progress based on actual transaction count
    // With 2 transactions (200€ + 100€ = 300€ saved) and monthly amount of 1000€
    // Payments made: 2 (actual transactions)
    // Remaining: 700€, Additional payments needed: Math.ceil(700/350) = 2
    // Total needed: 2 + 2 = 4
    expect(screen.getByText('2 of 4 payments made')).toBeInTheDocument();
  });

  it('displays payment history', () => {
    render(<SavingsGoalDetail />);

    // Should show payment transactions (DD.MM.YYYY format)
    expect(screen.getByText('01.01.2024')).toBeInTheDocument();
    expect(screen.getByText('15.01.2024')).toBeInTheDocument();
    expect(screen.getByText('200,00 €')).toBeInTheDocument();
    expect(screen.getByText('100,00 €')).toBeInTheDocument();
  });

  it('handles edit button click', () => {
    const mockNavigate = vi.fn();
    mockUseNavigate.mockReturnValue(mockNavigate);

    render(<SavingsGoalDetail />);

    const editButton = screen.getByText('edit');
    fireEvent.click(editButton);

    expect(mockNavigate).toHaveBeenCalledWith('/savings-goals/edit/goal-1');
  });

  it('handles cancel button click', () => {
    const mockNavigate = vi.fn();
    mockUseNavigate.mockReturnValue(mockNavigate);

    render(<SavingsGoalDetail />);

    const cancelButton = screen.getByText('cancel');
    fireEvent.click(cancelButton);

    expect(mockNavigate).toHaveBeenCalledWith('/savings-goals');
  });

  it('handles goal deletion', async () => {
    const mockDeleteSavingsGoal = vi.fn();
    mockUseBudget.mockReturnValue({
      ...mockUseBudget(),
      deleteSavingsGoal: mockDeleteSavingsGoal,
    });

    render(<SavingsGoalDetail />);

    // Click delete button
    const deleteButton = screen.getByTestId('savings-goal-detail-delete');
    fireEvent.click(deleteButton);

    // Should show delete confirmation
    expect(screen.getByText('Delete Goal')).toBeInTheDocument();
    expect(screen.getByText('Are you sure you want to delete this goal?')).toBeInTheDocument();

    // Confirm deletion using testid
    fireEvent.click(screen.getByTestId('savings-goal-detail-delete-confirm'));

    await waitFor(() => {
      expect(mockDeleteSavingsGoal).toHaveBeenCalledWith('goal-1');
    });
  });

  it('shows next payment button when goal is not completed', () => {
    render(<SavingsGoalDetail />);

    // Should show next payment button
    expect(screen.getByText('Next Payment')).toBeInTheDocument();
  });

  it('hides next payment button when goal is completed', () => {
    // Mock completed goal
    const completedGoal = {
      ...mockGoal,
      targetAmount: 300,
    };

    mockUseBudget.mockReturnValue({
      ...mockUseBudget(),
      savingsGoals: [completedGoal],
    });

    render(<SavingsGoalDetail />);

    // Should not show next payment button
    expect(screen.queryByText('Next Payment')).not.toBeInTheDocument();
  });

  it('displays correct deadline format', () => {
    render(<SavingsGoalDetail />);

    // Should show deadline in correct format
    expect(screen.getByText(/until/)).toBeInTheDocument();
  });

  it('displays correct monthly amount calculation', () => {
    render(<SavingsGoalDetail />);

    // Should show monthly amount
    expect(screen.getByText(/monthly/)).toBeInTheDocument();
  });
});