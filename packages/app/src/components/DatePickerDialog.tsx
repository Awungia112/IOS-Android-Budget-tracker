/**
 * Shared DatePickerDialog component
 * Used by Limits, Statistics, SavingsGoals and RecurringItems pages for consistent date selection
 * Redesigned per issue #187 — light & dark mode polish
 */

import { useState, useRef, useEffect, useMemo } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import { ChevronDown, Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { Frequency } from "@budget/core";

interface DatePickerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selectedYear: number;
  selectedMonth: number;
  selectedDay?: number;
  onYearChange: (year: number) => void;
  onMonthChange: (month: number) => void;
  onDayChange?: (day: number) => void;
  onConfirm?: (year: number, month: number, day: number | undefined) => void;
  onSelect?: () => void;
  disablePastDates?: boolean;
  /** Earliest selectable year. Defaults to current year − 10. */
  minYear?: number;
  /** Latest selectable year. Defaults to current year + 10. */
  maxYear?: number;
  // Recurring toggle (optional - only shown in TransactionForm context)
  showRecurringToggle?: boolean;
  isRecurring?: boolean;
  onRecurringChange?: (isRecurring: boolean) => void;
  recurringFrequency?: Frequency;
  onRecurringFrequencyChange?: (frequency: Frequency) => void;
}

interface DayCell {
  day: number;
  isCurrentMonth: boolean;
}

// ── Frequency helpers (exported for reuse in RecurringItemForm) ──

/** Derive the active unit ('days' | 'weeks' | 'months') from a Frequency */
export function frequencyUnit(freq: Frequency): 'days' | 'weeks' | 'months' {
  if (freq === 'daily' || freq.endsWith('_days')) return 'days';
  if (freq === 'weekly' || freq.endsWith('_weeks')) return 'weeks';
  return 'months';
}

/** Convert a unit + interval number to a Frequency value */
export function unitIntervalToFrequency(unit: 'days' | 'weeks' | 'months', n: number): Frequency {
  if (unit === 'days')   return n === 1 ? 'daily'   : (`every_${n}_days`   as Frequency);
  if (unit === 'weeks')  return n === 1 ? 'weekly'  : (`every_${n}_weeks`  as Frequency);
  return                        n === 1 ? 'monthly' : (`every_${n}_months` as Frequency);
}

/** Extract the interval number from any Frequency */
export function frequencyToInterval(freq: Frequency): number {
  if (freq === 'daily' || freq === 'weekly' || freq === 'monthly') return 1;
  const match = freq.match(/^every_(\d+)_(?:days|weeks|months)$/);
  return match ? parseInt(match[1], 10) : 1;
}

// Max intervals per unit
export const MAX_INTERVALS: Record<'days' | 'weeks' | 'months', number> = {
  days: 30,
  weeks: 12,
  months: 12,
};

// ── Inline dropdown (renders inside the dialog so it never escapes the boundary) ──

function InlineDropdown({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: { label: string; value: number }[];
  value: number;
  onChange: (v: number) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  useEffect(() => {
    if (!open || !listRef.current) return;
    const selected = listRef.current.querySelector("[data-selected='true']") as HTMLElement | null;
    selected?.scrollIntoView?.({ block: "nearest" });
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-1.5 text-[15px] font-semibold rounded-lg
          px-2.5 py-1 cursor-pointer border
          bg-[#f3f4f6] text-[#111827] border-[#e5e7eb]
          dark:bg-[#1A2124] dark:text-[#EBEBEB] dark:border-white/20
          hover:bg-[#e9eaf0] dark:hover:bg-[#2A3337] transition-colors
          focus:outline-none focus:ring-2 focus:ring-[#0B75C2] focus:ring-offset-1"
        aria-label={label}
      >
        {options.find((o) => o.value === value)?.label ?? label}
        <svg width="10" height="6" viewBox="0 0 10 6" fill="none" className="shrink-0">
          <path d="M1 1l4 4 4-4" stroke="#6b7280" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {open && (
        <div
          ref={listRef}
          className="absolute top-full left-0 mt-1 z-50 rounded-lg overflow-y-auto
            max-h-[180px] w-full min-w-[100px]
            bg-[#f3f4f6] border border-[#d1d5db] shadow-lg
            dark:bg-[#1A2124] dark:border-white/20 dark:shadow-[0_4px_20px_rgba(0,0,0,0.5)]"
        >
          {options.map((opt) => (
            <button
              key={opt.value}
              type="button"
              data-selected={opt.value === value}
              onClick={() => { onChange(opt.value); setOpen(false); }}
              className={[
                "w-full text-left px-3 py-1.5 text-[13px] transition-colors",
                opt.value === value
                  ? "bg-[#0B75C2] text-white font-semibold"
                  : "text-[#374151] dark:text-[#EBEBEB] hover:bg-[#e9eaf0] dark:hover:bg-white/10",
              ].join(" ")}
            >
              {opt.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Frequency dropdown (matches Time Period design from Balance page) ──

function FrequencyDropdown({
  value,
  onChange,
  t,
}: {
  value: Frequency;
  onChange: (freq: Frequency) => void;
  t: TFunction;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between px-4 py-2.5 rounded-lg border
          border-[#e5e7eb] bg-[#f3f4f6] text-[#374151] text-sm
          dark:border-white/20 dark:bg-[#1A2124] dark:text-[#EBEBEB]
          hover:bg-[#e9eaf0] dark:hover:bg-[#2A3337] transition-colors"
      >
        <span>{t(`frequency_${value}`, value)}</span>
        <ChevronDown className={cn("w-4 h-4 text-[#6b7280] dark:text-white/50 transition-transform", open && "rotate-180")} />
      </button>
      {open && (
        <div className="absolute z-50 mt-1 w-full rounded-lg border border-[#d1d5db] dark:border-white/10 bg-white dark:bg-[#1A2124] shadow-lg dark:shadow-[0_4px_20px_rgba(0,0,0,0.5)] max-h-[200px] overflow-y-auto">
          {Array.from({ length: MAX_INTERVALS.months }, (_, i) => i + 1).map((n) => {
            const freq = unitIntervalToFrequency('months', n);
            const isSelected = value === freq;
            return (
              <button
                key={freq}
                type="button"
                onClick={() => { onChange(freq); setOpen(false); }}
                className={cn(
                  "w-full flex items-center justify-between px-4 py-2.5 text-sm text-left transition-colors hover:bg-[#f3f4f6] dark:hover:bg-white/10",
                  isSelected ? "text-[#0B75C2] font-medium" : "text-[#374151] dark:text-[#EBEBEB]",
                )}
              >
                <span>{t(`frequency_${freq}`, freq)}</span>
                {isSelected && <Check className="w-4 h-4 text-[#0B75C2]" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Main DatePickerDialog ──

export function DatePickerDialog({
  open,
  onOpenChange,
  selectedYear,
  selectedMonth,
  selectedDay,
  onYearChange,
  onMonthChange,
  onDayChange,
  onConfirm,
  onSelect,
  disablePastDates = false,
  minYear,
  maxYear,
  showRecurringToggle = false,
  isRecurring = false,
  onRecurringChange,
  recurringFrequency = 'monthly',
  onRecurringFrequencyChange,
}: DatePickerDialogProps) {
  const { t, i18n } = useTranslation();

  // Draft state — internal to the dialog. Parent state is only updated on Select.
  const [draftYear, setDraftYear] = useState(selectedYear);
  const [draftMonth, setDraftMonth] = useState(selectedMonth);
  const [draftDay, setDraftDay] = useState(selectedDay);

  // Re-sync draft whenever the dialog opens so it always starts fresh from props.
  useEffect(() => {
    if (open) {
      setDraftYear(selectedYear);
      setDraftMonth(selectedMonth);
      setDraftDay(selectedDay);
    }
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const monthNames = [
    t("month_january"), t("month_february"), t("month_march"),
    t("month_april"),   t("month_may"),      t("month_june"),
    t("month_july"),    t("month_august"),   t("month_september"),
    t("month_october"), t("month_november"), t("month_december"),
  ];

  const monthOptions = monthNames.map((name, idx) => ({ label: name, value: idx }));

  const yearOptions = useMemo(() => {
    const cur = new Date().getFullYear();
    const from = minYear ?? cur - 10;
    const to = maxYear ?? cur + 10;
    return Array.from({ length: to - from + 1 }, (_, i) => ({
      label: String(from + i),
      value: from + i,
    }));
  }, [minYear, maxYear]);

  // Memoized calendar grid — only recomputes when the viewed month/year changes.
  const calendarDays = useMemo((): DayCell[] => {
    const firstDay = new Date(draftYear, draftMonth, 1);
    const daysInMonth = new Date(draftYear, draftMonth + 1, 0).getDate();
    const prevMonthDays = new Date(draftYear, draftMonth, 0).getDate();

    let startOffset = firstDay.getDay() - 1;
    if (startOffset === -1) startOffset = 6;

    const cells: DayCell[] = [];

    for (let i = startOffset - 1; i >= 0; i--)
      cells.push({ day: prevMonthDays - i, isCurrentMonth: false });

    for (let d = 1; d <= daysInMonth; d++)
      cells.push({ day: d, isCurrentMonth: true });

    const remainder = cells.length % 7;
    if (remainder !== 0)
      for (let d = 1; d <= 7 - remainder; d++)
        cells.push({ day: d, isCurrentMonth: false });

    return cells;
  }, [draftYear, draftMonth]);

  const isDateInPast = (day: number): boolean => {
    if (!disablePastDates) return false;
    const today = new Date();
    const todayNorm = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    return new Date(draftYear, draftMonth, day) < todayNorm;
  };

  const isToday = (day: number): boolean => {
    const now = new Date();
    return day === now.getDate() && draftMonth === now.getMonth() && draftYear === now.getFullYear();
  };

  const handlePrevMonth = () => {
    if (draftMonth === 0) { setDraftMonth(11); setDraftYear(draftYear - 1); }
    else setDraftMonth(draftMonth - 1);
  };

  const handleNextMonth = () => {
    if (draftMonth === 11) { setDraftMonth(0); setDraftYear(draftYear + 1); }
    else setDraftMonth(draftMonth + 1);
  };

  const handleCancel = () => {
    onOpenChange(false);
  };

  const handleSelect = () => {
    if (onConfirm) {
      onConfirm(draftYear, draftMonth, draftDay);
    } else {
      onYearChange(draftYear);
      onMonthChange(draftMonth);
      if (onDayChange && draftDay !== undefined) onDayChange(draftDay);
    }
    onOpenChange(false);
    onSelect?.();
  };

  const weekdays = useMemo(() =>
    Array.from({ length: 7 }, (_, i) =>
      new Intl.DateTimeFormat(i18n.language, { weekday: "short" })
        .format(new Date(2024, 0, i + 1)) // Jan 1 2024 is a Monday
    ),
  [i18n.language]);

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) handleCancel(); }}>
      <DialogContent
        data-testid="date-picker-dialog"
        className="w-[calc(100vw-32px)] max-w-[380px] max-h-[85vh] overflow-y-auto p-0 rounded-2xl border
          bg-white border-[#e5e7eb] shadow-[0_8px_32px_rgba(0,0,0,0.10)]
          dark:bg-[#1A2124] dark:border-white/10 dark:shadow-[0_8px_32px_rgba(0,0,0,0.5)]"
      >
        <DialogTitle className="sr-only">{t("select_date")}</DialogTitle>
        <DialogDescription className="sr-only">
          {t("select_date_description", "Select a date from the calendar")}
        </DialogDescription>

        {/* ── Header ── */}
        <div className="flex items-center justify-between px-4 pt-4 pb-2">
          <button
            onClick={handlePrevMonth}
            data-testid="date-picker-prev-month"
            className="w-8 h-8 rounded-lg flex items-center justify-center text-xl
              bg-[#f3f4f6] text-[#6b7280] hover:bg-[#e9eaf0]
              dark:bg-[#1A2124] dark:text-gray-400 dark:hover:bg-[#2A3337]
              transition-colors border-none cursor-pointer
              focus:outline-none focus:ring-2 focus:ring-[#0B75C2] focus:ring-offset-1"
          >
            ←
          </button>

          <div className="flex items-center gap-1.5">
            <InlineDropdown
              label="Month"
              options={monthOptions}
              value={draftMonth}
              onChange={setDraftMonth}
            />
            <InlineDropdown
              label="Year"
              options={yearOptions}
              value={draftYear}
              onChange={setDraftYear}
            />
          </div>

          <button
            onClick={handleNextMonth}
            data-testid="date-picker-next-month"
            className="w-8 h-8 rounded-lg flex items-center justify-center text-xl
              bg-[#f3f4f6] text-[#6b7280] hover:bg-[#e9eaf0]
              dark:bg-[#1A2124] dark:text-gray-400 dark:hover:bg-[#2A3337]
              transition-colors border-none cursor-pointer
              focus:outline-none focus:ring-2 focus:ring-[#0B75C2] focus:ring-offset-1"
          >
            →
          </button>
        </div>

        {/* ── Weekday labels ── */}
        <div className="grid grid-cols-7 px-3 mb-0.5">
          {weekdays.map((d) => (
            <div
              key={d}
              className="text-center text-[11px] font-semibold uppercase tracking-wide py-1.5
                text-[#9ca3af] dark:text-[#7A8A94]"
            >
              {d}
            </div>
          ))}
        </div>

        {/* ── Day grid ── */}
        <div className="grid grid-cols-7 gap-0.5 px-3 pb-3">
          {calendarDays.map(({ day, isCurrentMonth }, idx) => {
            const past = isCurrentMonth && isDateInPast(day);
            const selected = isCurrentMonth && day === draftDay;
            const today = isCurrentMonth && isToday(day);
            const highlighted = selected || today;

            return (
              <button
                key={idx}
                disabled={!isCurrentMonth || past}
                onClick={() => isCurrentMonth && !past && setDraftDay(day)}
                className={[
                  "aspect-square w-full flex items-center justify-center text-[13px] rounded-lg border-none transition-colors focus:outline-none focus:ring-2 focus:ring-[#0B75C2] focus:ring-offset-1",
                  !isCurrentMonth
                    ? "text-[#d1d5db] dark:text-white/20 cursor-default bg-transparent"
                    : highlighted
                      ? "bg-[#0B75C2] text-white font-semibold hover:bg-[#0960A0] cursor-pointer"
                      : past
                        ? "text-[#d1d5db] dark:text-white/20 cursor-not-allowed bg-transparent"
                        : "text-[#374151] dark:text-[#EBEBEB] hover:bg-[#f3f4f6] dark:hover:bg-[#2a2a3e] hover:border hover:border-[#0B75C2] cursor-pointer bg-transparent border border-transparent",
                ].join(" ")}
              >
                {day}
              </button>
            );
          })}
        </div>

        {/* ── Recurring toggle (only shown in TransactionForm context) ── */}
        {showRecurringToggle && (
          <>
            <div className="h-px mx-3 bg-[#f3f4f6] dark:bg-white/10" />
            <div className="px-4 py-3">
              <p className="text-[13px] text-[#6b7280] dark:text-gray-400 mb-3">
                {t("recurring_future_limit_note")}
              </p>

              {/* Toggle row */}
              <div className="flex items-center gap-3 mb-1">
                <button
                  type="button"
                  role="switch"
                  aria-checked={isRecurring}
                  aria-label={t("recurring")}
                  onClick={() => onRecurringChange?.(!isRecurring)}
                  className={`relative inline-flex h-[28px] w-[50px] shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none ${
                    isRecurring ? "bg-[#3FCB72]" : "bg-gray-300 dark:bg-white/20"
                  }`}
                >
                  <span
                    className={`pointer-events-none inline-block h-[24px] w-[24px] transform rounded-full bg-white shadow-lg transition duration-200 ${
                      isRecurring ? "translate-x-[22px]" : "translate-x-0"
                    }`}
                  />
                </button>
                <span className="text-[14px] font-medium text-[#374151] dark:text-[#EBEBEB]">
                  {isRecurring
                    ? t(`frequency_${recurringFrequency}`, recurringFrequency)
                    : t("recurring")}
                </span>
              </div>

              <p className="text-[13px] text-[#6b7280] dark:text-gray-400 mb-3">
                {t("recurring_toggle_hint")}
              </p>

              {/* Frequency dropdown — shown when toggle is on */}
              {isRecurring && (
                <FrequencyDropdown
                  value={recurringFrequency}
                  onChange={(freq) => onRecurringFrequencyChange?.(freq)}
                  t={t}
                />
              )}
            </div>
          </>
        )}

        {/* ── Divider ── */}
        <div className="h-px mx-3 bg-[#f3f4f6] dark:bg-white/10" />

        {/* ── Footer ── */}
        <div className="flex items-center justify-between px-4 py-3">
          {/* Today shortcut */}
          <button
            onClick={() => {
              const now = new Date();
              setDraftYear(now.getFullYear());
              setDraftMonth(now.getMonth());
              setDraftDay(now.getDate());
            }}
            className="rounded-lg px-3.5 py-1.5 text-[13px] font-medium cursor-pointer border
              border-[#0B75C2] text-[#0B75C2]
              hover:bg-[#0B75C2] hover:text-white transition-colors
              dark:border-[#0B75C2] dark:text-[#0B75C2]
              dark:hover:bg-[#0B75C2] dark:hover:text-white
              focus:outline-none focus:ring-2 focus:ring-[#0B75C2] focus:ring-offset-1"
          >
            {t("date_today", "Today")}
          </button>

          <div className="flex gap-2">
            <button
              onClick={handleCancel}
              className="rounded-lg px-3.5 py-1.5 text-[13px] bg-transparent border cursor-pointer
                border-[#e5e7eb] text-[#6b7280]
                dark:border-white/10 dark:text-gray-400
                hover:bg-[#f3f4f6] dark:hover:bg-[#2a2a3e] transition-colors
                focus:outline-none focus:ring-2 focus:ring-[#0B75C2] focus:ring-offset-1"
            >
              {t("cancel", "Cancel")}
            </button>
            <button
              onClick={handleSelect}
              className="rounded-lg px-4 py-1.5 text-[13px] font-semibold
                bg-[#0B75C2] text-white border-none cursor-pointer
                hover:bg-[#0960A0] transition-colors
                focus:outline-none focus:ring-2 focus:ring-[#0B75C2] focus:ring-offset-1"
            >
              {t("select", "Select")}
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
