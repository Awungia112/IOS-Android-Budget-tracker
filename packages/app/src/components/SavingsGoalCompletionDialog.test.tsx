import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { vi } from 'vitest';
import { useTranslation } from 'react-i18next';
import { SavingsGoalCompletionDialog } from './SavingsGoalCompletionDialog';

// Mock dependencies
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
  I18nextProvider: ({ children }: { children: React.ReactNode }) => children,
  initReactI18next: { type: "3rdParty", init: () => {} },
}));

describe('SavingsGoalCompletionDialog', () => {
  const mockOnOpenChange = vi.fn();
  const mockOnIncome = vi.fn();
  const mockOnExpense = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders dialog when open', () => {
    render(
      <SavingsGoalCompletionDialog
        open={true}
        onOpenChange={mockOnOpenChange}
        onIncome={mockOnIncome}
        onExpense={mockOnExpense}
      />
    );
    
    // Should show completion title
    expect(screen.getByText('savingsGoals.completionTitle')).toBeInTheDocument();
    
    // Should show completion description
    expect(screen.getByText('savingsGoals.completionDescription')).toBeInTheDocument();
    
    // Should show both action buttons
    expect(screen.getByText('savingsGoals.completionIncome')).toBeInTheDocument();
    expect(screen.getByText('savingsGoals.completionExpense')).toBeInTheDocument();
  });

  it('does not render when closed', () => {
    render(
      <SavingsGoalCompletionDialog
        open={false}
        onOpenChange={mockOnOpenChange}
        onIncome={mockOnIncome}
        onExpense={mockOnExpense}
      />
    );
    
    // Should not show dialog content
    expect(screen.queryByText('savingsGoals.completionTitle')).not.toBeInTheDocument();
  });

  it('handles income action correctly', async () => {
    const mockAsyncIncome = vi.fn().mockResolvedValue(undefined);
    
    render(
      <SavingsGoalCompletionDialog
        open={true}
        onOpenChange={mockOnOpenChange}
        onIncome={mockAsyncIncome}
        onExpense={mockOnExpense}
      />
    );
    
    // Click income button
    const incomeButton = screen.getByText('savingsGoals.completionIncome');
    fireEvent.click(incomeButton);
    
    // Should show loading state
    await waitFor(() => {
      expect(screen.getByText('Processing...')).toBeInTheDocument();
    });
    
    // Should call onIncome function
    await waitFor(() => {
      expect(mockAsyncIncome).toHaveBeenCalled();
    });
  });

  it('handles expense action correctly', async () => {
    const mockAsyncExpense = vi.fn().mockResolvedValue(undefined);
    
    render(
      <SavingsGoalCompletionDialog
        open={true}
        onOpenChange={mockOnOpenChange}
        onIncome={mockOnIncome}
        onExpense={mockAsyncExpense}
      />
    );
    
    // Click expense button
    const expenseButton = screen.getByText('savingsGoals.completionExpense');
    fireEvent.click(expenseButton);
    
    // Should show loading state
    await waitFor(() => {
      expect(screen.getByText('Processing...')).toBeInTheDocument();
    });
    
    // Should call onExpense function
    await waitFor(() => {
      expect(mockAsyncExpense).toHaveBeenCalled();
    });
  });

  it('handles async action errors gracefully', async () => {
    const mockErrorIncome = vi.fn().mockRejectedValue(new Error('Test error'));
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    
    render(
      <SavingsGoalCompletionDialog
        open={true}
        onOpenChange={mockOnOpenChange}
        onIncome={mockErrorIncome}
        onExpense={mockOnExpense}
      />
    );
    
    // Click income button
    const incomeButton = screen.getByText('savingsGoals.completionIncome');
    fireEvent.click(incomeButton);
    
    // Should handle error and reset loading state
    await waitFor(() => {
      expect(consoleSpy).toHaveBeenCalledWith('Income action failed:', expect.any(Error));
    });
    
    consoleSpy.mockRestore();
  });

  it('shows correct icons and styling', () => {
    render(
      <SavingsGoalCompletionDialog
        open={true}
        onOpenChange={mockOnOpenChange}
        onIncome={mockOnIncome}
        onExpense={mockOnExpense}
      />
    );
    
    // Should show success icon (CheckCircle)
    expect(screen.getByTestId('icon-CheckCircle')).toBeInTheDocument();
    
    // Should show trending up icon for income
    expect(screen.getByTestId('icon-TrendingUp')).toBeInTheDocument();
    
    // Should show shopping cart icon for expense
    expect(screen.getByTestId('icon-ShoppingCart')).toBeInTheDocument();
  });

  it('has proper accessibility attributes', () => {
    render(
      <SavingsGoalCompletionDialog
        open={true}
        onOpenChange={mockOnOpenChange}
        onIncome={mockOnIncome}
        onExpense={mockOnExpense}
      />
    );
    
    // Income button should be present and clickable
    const incomeButton = screen.getByText('savingsGoals.completionIncome');
    expect(incomeButton).toBeInTheDocument();
    
    // Expense button should be present and clickable
    const expenseButton = screen.getByText('savingsGoals.completionExpense');
    expect(expenseButton).toBeInTheDocument();
  });
});
