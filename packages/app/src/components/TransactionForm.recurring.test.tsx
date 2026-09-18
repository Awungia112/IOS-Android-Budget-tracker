/**
 * @vitest-environment jsdom
 *
 * Tests for the recurring toggle integration in TransactionForm:
 * - Toggle is shown when adding a new transaction
 * - Toggle is hidden when editing an existing transaction
 * - When recurring is enabled, addRecurringItem is called alongside addTransaction
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import type { Category } from '@budget/core';

// Mock the current date to make tests deterministic
const mockDate = new Date('2026-04-06T12:00:00Z');

// ---------------------------------------------------------------------------
// i18n mock
// ---------------------------------------------------------------------------
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => {
      const map: Record<string, string> = {
        amount: 'Amount',
        note: 'Note',
        enter_title: 'Note',
        note_placeholder: 'Add a note',
        category: 'Category',
        select_category: 'Select category',
        date: 'Date',
        select_date: 'Select Date',
        cancel: 'Cancel',
        save: 'Save',
        update: 'Update',
        error: 'Error',
        error_amount_required: 'Please enter a valid amount',
        error_category_required: 'Please select a category',
        income: 'Income',
        expense: 'Expense',
        recurring: 'Wiederkehrend',
        recurring_toggle_hint: 'Activate recurring items via the switch.',
        recurring_future_limit_note: 'Future income or expenses can only be recorded up to 3 months in advance.',
        select: 'Select',
        frequency: 'Frequency',
        frequency_monthly: 'Monthly',
        frequency_every_2_months: 'Every 2 Months',
        frequency_every_3_months: 'Every 3 Months',
        frequency_every_4_months: 'Every 4 Months',
        frequency_every_5_months: 'Every 5 Months',
        frequency_every_6_months: 'Every 6 Months',
        frequency_every_7_months: 'Every 7 Months',
        frequency_every_8_months: 'Every 8 Months',
        frequency_every_9_months: 'Every 9 Months',
        frequency_every_10_months: 'Every 10 Months',
        frequency_every_11_months: 'Every 11 Months',
        frequency_every_12_months: 'Every 12 Months',
        month_january: 'January', month_february: 'February', month_march: 'March',
        month_april: 'April', month_may: 'May', month_june: 'June',
        month_july: 'July', month_august: 'August', month_september: 'September',
        month_october: 'October', month_november: 'November', month_december: 'December',
      };
      return map[key] ?? key;
    },
    i18n: { language: 'en' },
  }),
}));

// ---------------------------------------------------------------------------
// BudgetContext mock
// ---------------------------------------------------------------------------
const mockAddTransaction = vi.fn().mockResolvedValue(undefined);
const mockUpdateTransaction = vi.fn().mockResolvedValue(undefined);
const mockAddRecurringItem = vi.fn().mockResolvedValue(undefined);

const mockCategory: Category = {
  id: 'cat-food',
  accountId: 'acc-1',
  name: 'category_food',
  type: 'expense',
  color: '#E33B80',
  isDefault: false,
};

vi.mock('@/contexts/BudgetContext', () => ({
  useBudget: () => ({
    categories: [mockCategory],
    addTransaction: mockAddTransaction,
    updateTransaction: mockUpdateTransaction,
    addRecurringItem: mockAddRecurringItem,
  }),
}));

// ---------------------------------------------------------------------------
// Toast mock
// ---------------------------------------------------------------------------
vi.mock('@/components/ui/use-toast', () => ({
  toast: vi.fn(),
}));

// ---------------------------------------------------------------------------
// CategoryChip mock
// ---------------------------------------------------------------------------
vi.mock('@/components/ui/category-chip', () => ({
  CategoryChip: ({ label, selected, onClick }: any) => (
    <button
      data-testid={`category-chip-${label}`}
      aria-pressed={selected}
      onClick={onClick}
    >
      {label}
    </button>
  ),
}));

// ---------------------------------------------------------------------------
// Import component under test
// ---------------------------------------------------------------------------
import TransactionForm from './TransactionForm';

const defaultProps = {
  type: 'expense' as const,
  onSave: vi.fn(),
  onCancel: vi.fn(),
};

describe('TransactionForm — recurring toggle', () => {
  beforeEach(() => {
    // Mock the current date to April 7, 2026 to ensure consistent test behavior
    // This prevents timezone-related test failures in CI
    // Configure fake timers to not interfere with async operations (waitFor, etc.)
    vi.useFakeTimers({
      shouldAdvanceTime: true,
      toFake: ['Date'] // Only fake Date, not setTimeout/setInterval
    });
    vi.setSystemTime(new Date('2026-04-07T12:00:00Z'));
    
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
    cleanup();
  });

  const openDatePicker = () => {
    const dateButton = screen.getByTestId('transaction-date-picker-button');
    fireEvent.click(dateButton);
  };

  const fillAmount = (amount = '50') => {
    const input = screen.getByTestId('transaction-amount-input');
    fireEvent.change(input, { target: { value: amount } });
  };

  it('shows the recurring toggle inside the date picker when adding a new transaction', () => {
    render(<TransactionForm {...defaultProps} />);
    openDatePicker();
    expect(screen.getByRole('switch', { name: /wiederkehrend/i })).toBeInTheDocument();
  });

  it('does NOT show the recurring toggle when editing an existing transaction', () => {
    const editTransaction = {
      id: 'tx-1',
      accountId: 'acc-1',
      type: 'expense' as const,
      amount: 100,
      category: 'cat-food',
      date: '2026-03-18',
      title: 'Groceries',
    };
    render(<TransactionForm {...defaultProps} editTransaction={editTransaction} />);
    openDatePicker();
    expect(screen.queryByRole('switch')).not.toBeInTheDocument();
  });

  it('does not call addRecurringItem when recurring toggle is off', async () => {
    render(<TransactionForm {...defaultProps} />);
    fillAmount('75');

    fireEvent.submit(screen.getByTestId('transaction-form'));

    await waitFor(() => {
      expect(mockAddTransaction).toHaveBeenCalledTimes(1);
    });
    expect(mockAddRecurringItem).not.toHaveBeenCalled();
  });

  it('calls addRecurringItem with correct data when recurring toggle is enabled', async () => {
    render(<TransactionForm {...defaultProps} />);
    fillAmount('120');

    // Open date picker, set a specific date, and enable recurring
    openDatePicker();
    fireEvent.click(screen.getByRole('switch'));

    fireEvent.click(screen.getByText('Select'));
    fireEvent.submit(screen.getByTestId('transaction-form'));

    await waitFor(() => {
      expect(mockAddTransaction).toHaveBeenCalledTimes(1);
      expect(mockAddRecurringItem).toHaveBeenCalledTimes(1);
    });

    const recurringCall = mockAddRecurringItem.mock.calls[0][0];
    expect(recurringCall.amount).toBe(120);
    expect(recurringCall.categoryId).toBe('cat-food');
    expect(recurringCall.type).toBe('expense');
    expect(recurringCall.frequency).toBe('monthly');
    expect(recurringCall.startDate).toBe('2026-05-07');
    // name falls back to translated category label when no title is set
    expect(recurringCall.name).toBe('category_food');
  });

  it('always uses monthly frequency when creating the recurring item', async () => {
    render(<TransactionForm {...defaultProps} />);
    fillAmount('200');

    openDatePicker();
    fireEvent.click(screen.getByRole('switch'));

    fireEvent.click(screen.getByText('Select'));
    fireEvent.submit(screen.getByTestId('transaction-form'));

    await waitFor(() => {
      expect(mockAddRecurringItem).toHaveBeenCalledTimes(1);
    });

    expect(mockAddRecurringItem.mock.calls[0][0].frequency).toBe('monthly');
  });

  it('uses the transaction title as the recurring item name when title is set', async () => {
    render(<TransactionForm {...defaultProps} />);
    fillAmount('50');

    fireEvent.change(screen.getByTestId('transaction-note-input'), {
      target: { value: 'Custom recurring item' },
    });

    openDatePicker();
    fireEvent.click(screen.getByRole('switch'));

    fireEvent.click(screen.getByText('Select'));
    fireEvent.submit(screen.getByTestId('transaction-form'));

    await waitFor(() => {
      expect(mockAddRecurringItem).toHaveBeenCalledTimes(1);
    });

    expect(mockAddRecurringItem.mock.calls[0][0].name).toBe('Custom recurring item');
  });

  it('handles month-end dates correctly without JavaScript Date overflow bug', async () => {
    render(<TransactionForm {...defaultProps} />);
    fillAmount('100');

    // Open date picker and enable recurring — system time is April 7, 2026
    openDatePicker();
    fireEvent.click(screen.getByRole('switch'));

    fireEvent.click(screen.getByText('Select'));
    fireEvent.submit(screen.getByTestId('transaction-form'));

    await waitFor(() => {
      expect(mockAddRecurringItem).toHaveBeenCalledTimes(1);
    });

    expect(mockAddRecurringItem.mock.calls[0][0].startDate).toBe('2026-05-07');
  });
});