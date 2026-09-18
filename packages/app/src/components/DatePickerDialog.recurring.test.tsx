/**
 * @vitest-environment jsdom
 *
 * Tests for the recurring toggle inside DatePickerDialog,
 * and for the helper functions frequencyUnit / unitIntervalToFrequency / frequencyToInterval.
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import {
  frequencyUnit,
  unitIntervalToFrequency,
  frequencyToInterval,
  DatePickerDialog,
} from './DatePickerDialog';
import type { Frequency } from '@budget/core';

// ---------------------------------------------------------------------------
// i18n mock — returns the key so assertions are predictable
// ---------------------------------------------------------------------------
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => {
      const map: Record<string, string> = {
        select_date: 'Select Date',
        recurring: 'Wiederkehrend',
        recurring_toggle_hint: 'Activate recurring items via the switch.',
        recurring_future_limit_note: 'Future income or expenses can only be recorded up to 3 months in advance.',
        frequency_monthly: 'Monthly',
        select: 'Select',
        cancel: 'Cancel',
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
// Helper: default props for DatePickerDialog
// ---------------------------------------------------------------------------
const defaultProps = {
  open: true,
  onOpenChange: vi.fn(),
  selectedYear: 2026,
  selectedMonth: 2, // March (0-indexed)
  selectedDay: 18,
  onYearChange: vi.fn(),
  onMonthChange: vi.fn(),
  onDayChange: vi.fn(),
  onSelect: vi.fn(),
  disablePastDates: false,
};

// ---------------------------------------------------------------------------
// 1. Pure helper functions (still exported for RecurringItemForm)
// ---------------------------------------------------------------------------
describe('frequencyUnit', () => {
  it('returns "days" for "daily"', () => {
    expect(frequencyUnit('daily')).toBe('days');
  });
  it('returns "days" for every_N_days', () => {
    expect(frequencyUnit('every_5_days')).toBe('days');
  });
  it('returns "weeks" for "weekly"', () => {
    expect(frequencyUnit('weekly')).toBe('weeks');
  });
  it('returns "weeks" for every_N_weeks', () => {
    expect(frequencyUnit('every_3_weeks')).toBe('weeks');
  });
  it('returns "months" for "monthly"', () => {
    expect(frequencyUnit('monthly')).toBe('months');
  });
  it('returns "months" for every_N_months', () => {
    expect(frequencyUnit('every_6_months')).toBe('months');
  });
});

describe('unitIntervalToFrequency', () => {
  it('returns "daily" for days/1', () => {
    expect(unitIntervalToFrequency('days', 1)).toBe('daily');
  });
  it('returns "every_N_days" for days/N>1', () => {
    expect(unitIntervalToFrequency('days', 7)).toBe('every_7_days');
  });
  it('returns "weekly" for weeks/1', () => {
    expect(unitIntervalToFrequency('weeks', 1)).toBe('weekly');
  });
  it('returns "every_N_weeks" for weeks/N>1', () => {
    expect(unitIntervalToFrequency('weeks', 4)).toBe('every_4_weeks');
  });
  it('returns "monthly" for months/1', () => {
    expect(unitIntervalToFrequency('months', 1)).toBe('monthly');
  });
  it('returns "every_N_months" for months/N>1', () => {
    expect(unitIntervalToFrequency('months', 6)).toBe('every_6_months');
  });
});

describe('frequencyToInterval', () => {
  it('returns 1 for "daily"', () => {
    expect(frequencyToInterval('daily')).toBe(1);
  });
  it('returns 1 for "weekly"', () => {
    expect(frequencyToInterval('weekly')).toBe(1);
  });
  it('returns 1 for "monthly"', () => {
    expect(frequencyToInterval('monthly')).toBe(1);
  });
  it('returns N for every_N_days', () => {
    expect(frequencyToInterval('every_5_days' as Frequency)).toBe(5);
  });
  it('returns N for every_N_weeks', () => {
    expect(frequencyToInterval('every_3_weeks' as Frequency)).toBe(3);
  });
  it('returns N for every_N_months', () => {
    for (let n = 2; n <= 12; n++) {
      expect(frequencyToInterval(`every_${n}_months` as Frequency)).toBe(n);
    }
  });
});

// ---------------------------------------------------------------------------
// 2. DatePickerDialog — recurring toggle hidden by default
// ---------------------------------------------------------------------------
describe('DatePickerDialog — no recurring toggle', () => {
  afterEach(cleanup);

  it('does not render the recurring toggle when showRecurringToggle is false', () => {
    render(<DatePickerDialog {...defaultProps} showRecurringToggle={false} />);
    expect(screen.queryByRole('switch')).not.toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// 3. DatePickerDialog — recurring toggle visible (simple on/off, always monthly)
// ---------------------------------------------------------------------------
describe('DatePickerDialog — with recurring toggle', () => {
  afterEach(cleanup);

  it('renders the recurring toggle switch', () => {
    render(
      <DatePickerDialog
        {...defaultProps}
        showRecurringToggle
        isRecurring={false}
        onRecurringChange={vi.fn()}
      />
    );
    expect(screen.getByRole('switch', { name: /wiederkehrend/i })).toBeInTheDocument();
  });

  it('toggle is off by default and shows "Wiederkehrend" label', () => {
    render(
      <DatePickerDialog
        {...defaultProps}
        showRecurringToggle
        isRecurring={false}
        onRecurringChange={vi.fn()}
      />
    );
    const toggle = screen.getByRole('switch');
    expect(toggle).toHaveAttribute('aria-checked', 'false');
    expect(screen.getByText('Wiederkehrend')).toBeInTheDocument();
  });

  it('shows frequency label and dropdown when toggle is on', () => {
    render(
      <DatePickerDialog
        {...defaultProps}
        showRecurringToggle
        isRecurring={true}
        onRecurringChange={vi.fn()}
        recurringFrequency="monthly"
        onRecurringFrequencyChange={vi.fn()}
      />
    );
    // "Monthly" appears in both the toggle label and dropdown trigger
    const monthlyElements = screen.getAllByText('Monthly');
    expect(monthlyElements.length).toBeGreaterThanOrEqual(2);
  });

  it('calls onRecurringChange(true) when toggle is clicked while off', () => {
    const onRecurringChange = vi.fn();
    render(
      <DatePickerDialog
        {...defaultProps}
        showRecurringToggle
        isRecurring={false}
        onRecurringChange={onRecurringChange}
      />
    );
    fireEvent.click(screen.getByRole('switch'));
    expect(onRecurringChange).toHaveBeenCalledWith(true);
  });

  it('calls onRecurringChange(false) when toggle is clicked while on', () => {
    const onRecurringChange = vi.fn();
    render(
      <DatePickerDialog
        {...defaultProps}
        showRecurringToggle
        isRecurring={true}
        onRecurringChange={onRecurringChange}
      />
    );
    fireEvent.click(screen.getByRole('switch'));
    expect(onRecurringChange).toHaveBeenCalledWith(false);
  });

  it('does not render frequency chips or interval picker', () => {
    render(
      <DatePickerDialog
        {...defaultProps}
        showRecurringToggle
        isRecurring={true}
        onRecurringChange={vi.fn()}
      />
    );
    expect(screen.queryByTestId('frequency-chips')).not.toBeInTheDocument();
    expect(screen.queryByTestId('interval-wheel')).not.toBeInTheDocument();
  });
});
