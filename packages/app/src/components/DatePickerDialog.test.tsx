/**
 * @vitest-environment jsdom
 */

/**
 * DatePickerDialog Tests
 *
 * Tests for the shared date picker dialog component.
 * Covers calendar generation, day selection, past date filtering, and callbacks.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { DatePickerDialog } from './DatePickerDialog';

// Mock react-i18next
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => {
      const translations: Record<string, string> = {
        month_january: 'January',
        month_february: 'February',
        month_march: 'March',
        month_april: 'April',
        month_may: 'May',
        month_june: 'June',
        month_july: 'July',
        month_august: 'August',
        month_september: 'September',
        month_october: 'October',
        month_november: 'November',
        month_december: 'December',
        select_date: 'Select Date',
        select: 'Select',
        cancel: 'Cancel',
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

describe('DatePickerDialog', () => {
  const defaultProps = {
    open: true,
    onOpenChange: vi.fn(),
    selectedYear: 2024,
    selectedMonth: 5, // June (0-indexed)
    onYearChange: vi.fn(),
    onMonthChange: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  describe('Calendar Rendering', () => {
    it('renders the dialog when open is true', () => {
      render(<DatePickerDialog {...defaultProps} />);

      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });

    it('does not render the dialog when open is false', () => {
      render(<DatePickerDialog {...defaultProps} open={false} />);

      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

    it('displays the selected month name', () => {
      render(<DatePickerDialog {...defaultProps} selectedMonth={0} />);

      expect(screen.getByText('January')).toBeInTheDocument();
    });

    it('displays the selected year', () => {
      render(<DatePickerDialog {...defaultProps} selectedYear={2025} />);

      expect(screen.getByText('2025')).toBeInTheDocument();
    });

    it('renders weekday headers', () => {
      render(<DatePickerDialog {...defaultProps} />);

      // Intl.DateTimeFormat short weekday names for 'en' locale
      const formatter = new Intl.DateTimeFormat('en', { weekday: 'short' });
      const expectedWeekdays = Array.from({ length: 7 }, (_, i) =>
        formatter.format(new Date(2024, 0, i + 1))
      );

      expectedWeekdays.forEach((day) => {
        expect(screen.getByText(day)).toBeInTheDocument();
      });
    });

    it('renders correct number of days for June (30 days)', () => {
      render(<DatePickerDialog {...defaultProps} selectedMonth={5} selectedYear={2024} />);

      // June has 30 days — find the enabled day-30 button (not a padding day)
      const allButtons = screen.getAllByRole('button') as HTMLButtonElement[];
      const day30 = allButtons.find(btn => btn.textContent?.trim() === '30' && !btn.disabled);
      expect(day30).toBeInTheDocument();

      // No enabled day-31 should exist for June
      const day31Enabled = allButtons.find(btn => btn.textContent?.trim() === '31' && !btn.disabled);
      expect(day31Enabled).toBeUndefined();
    });

    it('handles leap year February correctly (29 days)', () => {
      render(<DatePickerDialog {...defaultProps} selectedYear={2024} selectedMonth={1} />);

      // 2024 is a leap year — day 29 must appear as an enabled button
      const allButtons = screen.getAllByRole('button') as HTMLButtonElement[];
      const day29 = allButtons.find(btn => btn.textContent?.trim() === '29' && !btn.disabled);
      expect(day29).toBeInTheDocument();
    });

    it('handles non-leap year February correctly (28 days)', () => {
      render(<DatePickerDialog {...defaultProps} selectedYear={2023} selectedMonth={1} />);

      const allButtons = screen.getAllByRole('button') as HTMLButtonElement[];
      const day28 = allButtons.find(btn => btn.textContent?.trim() === '28' && !btn.disabled);
      expect(day28).toBeInTheDocument();

      // Day 29 should not exist as an enabled current-month button
      const day29Enabled = allButtons.find(btn => btn.textContent?.trim() === '29' && !btn.disabled);
      expect(day29Enabled).toBeUndefined();
    });
  });

  describe('Day Selection', () => {
    it('calls onDayChange when a day is clicked and Select is confirmed', () => {
      const onDayChange = vi.fn();
      render(<DatePickerDialog {...defaultProps} onDayChange={onDayChange} />);

      // Click a day (sets draft)
      fireEvent.click(screen.getByText('15'));

      // onDayChange should NOT fire yet — only on Select
      expect(onDayChange).not.toHaveBeenCalled();

      // Confirm with Select
      fireEvent.click(screen.getByText('Select'));

      expect(onDayChange).toHaveBeenCalledWith(15);
    });

    it('closes the dialog after clicking Select button', () => {
      const onOpenChange = vi.fn();
      render(<DatePickerDialog {...defaultProps} onOpenChange={onOpenChange} />);

      fireEvent.click(screen.getByText('15'));
      fireEvent.click(screen.getByText('Select'));

      expect(onOpenChange).toHaveBeenCalledWith(false);
    });

    it('calls onSelect callback after clicking Select button', () => {
      const onSelect = vi.fn();
      render(<DatePickerDialog {...defaultProps} onSelect={onSelect} />);

      fireEvent.click(screen.getByText('15'));
      fireEvent.click(screen.getByText('Select'));

      expect(onSelect).toHaveBeenCalled();
    });

    it('highlights the selected day when selectedDay is provided', () => {
      render(<DatePickerDialog {...defaultProps} selectedDay={15} />);

      const dayButton = screen.getByText('15').closest('button');
      expect(dayButton).toHaveClass('bg-[#0B75C2]');
    });

    it('does not call onDayChange when Cancel is clicked', () => {
      const onDayChange = vi.fn();
      const onOpenChange = vi.fn();
      render(<DatePickerDialog {...defaultProps} onDayChange={onDayChange} onOpenChange={onOpenChange} />);

      fireEvent.click(screen.getByText('15'));
      fireEvent.click(screen.getByText('Cancel'));

      expect(onDayChange).not.toHaveBeenCalled();
      expect(onOpenChange).toHaveBeenCalledWith(false);
    });
  });

  describe('Past Date Filtering', () => {
    it('does not disable dates when disablePastDates is false', () => {
      render(
        <DatePickerDialog
          {...defaultProps}
          selectedYear={2020}
          selectedMonth={0}
          disablePastDates={false}
        />
      );

      const dayButton = screen.getByText('15').closest('button');
      expect(dayButton).not.toBeDisabled();
    });

    it('disables past dates when disablePastDates is true', () => {
      vi.setSystemTime(new Date(2024, 5, 15)); // June 15, 2024

      render(
        <DatePickerDialog
          {...defaultProps}
          selectedYear={2024}
          selectedMonth={5}
          disablePastDates={true}
        />
      );

      const pastDayButton = screen.getByText('1').closest('button');
      expect(pastDayButton).toBeDisabled();

      const futureDayButton = screen.getByText('20').closest('button');
      expect(futureDayButton).not.toBeDisabled();

      vi.useRealTimers();
    });

    it('does not call onDayChange for disabled dates', () => {
      const onDayChange = vi.fn();
      vi.setSystemTime(new Date(2024, 5, 15));

      render(
        <DatePickerDialog
          {...defaultProps}
          selectedYear={2024}
          selectedMonth={5}
          disablePastDates={true}
          onDayChange={onDayChange}
        />
      );

      const pastDayButton = screen.getByText('1').closest('button');
      fireEvent.click(pastDayButton!);

      expect(onDayChange).not.toHaveBeenCalled();

      vi.useRealTimers();
    });
  });

  describe('Month Navigation', () => {
    it('calls onMonthChange when previous month button is clicked', () => {
      render(<DatePickerDialog {...defaultProps} selectedMonth={5} />);

      const prevButton = screen.getByTestId('date-picker-prev-month');
      fireEvent.click(prevButton);

      // Navigation updates draft; parent callbacks fire on Select
      fireEvent.click(screen.getByText('Select'));
      expect(defaultProps.onMonthChange).toHaveBeenCalledWith(4);
    });

    it('calls onMonthChange when next month button is clicked', () => {
      render(<DatePickerDialog {...defaultProps} selectedMonth={5} />);

      const nextButton = screen.getByTestId('date-picker-next-month');
      fireEvent.click(nextButton);

      fireEvent.click(screen.getByText('Select'));
      expect(defaultProps.onMonthChange).toHaveBeenCalledWith(6);
    });

    it('wraps to December when going previous from January', () => {
      render(<DatePickerDialog {...defaultProps} selectedMonth={0} />);

      const prevButton = screen.getByTestId('date-picker-prev-month');
      fireEvent.click(prevButton);

      fireEvent.click(screen.getByText('Select'));
      expect(defaultProps.onMonthChange).toHaveBeenCalledWith(11);
      expect(defaultProps.onYearChange).toHaveBeenCalledWith(2023);
    });

    it('wraps to January when going next from December', () => {
      render(<DatePickerDialog {...defaultProps} selectedMonth={11} />);

      const nextButton = screen.getByTestId('date-picker-next-month');
      fireEvent.click(nextButton);

      fireEvent.click(screen.getByText('Select'));
      expect(defaultProps.onMonthChange).toHaveBeenCalledWith(0);
      expect(defaultProps.onYearChange).toHaveBeenCalledWith(2025);
    });
  });

  describe('Year Selection', () => {
    it('calls onYearChange when a year is selected from dropdown and confirmed', () => {
      render(<DatePickerDialog {...defaultProps} selectedYear={2024} />);

      // Open year dropdown
      fireEvent.click(screen.getByText('2024'));
      // Select a different year
      fireEvent.click(screen.getByText('2025'));

      // Year change only fires on Select
      fireEvent.click(screen.getByText('Select'));
      expect(defaultProps.onYearChange).toHaveBeenCalledWith(2025);
    });
  });

  describe('Month Selection', () => {
    it('calls onMonthChange when a month is selected from dropdown and confirmed', () => {
      render(<DatePickerDialog {...defaultProps} selectedMonth={5} />);

      // Open month dropdown
      fireEvent.click(screen.getByText('June'));
      // Select a different month
      fireEvent.click(screen.getByText('August'));

      // Month change only fires on Select
      fireEvent.click(screen.getByText('Select'));
      expect(defaultProps.onMonthChange).toHaveBeenCalledWith(7);
    });
  });
});
