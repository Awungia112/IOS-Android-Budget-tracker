import type { Frequency, RecurringItem } from '../types/index.js';

const dayInterval = (frequency: Frequency) => frequency === 'daily' ? 1 : frequency.match(/^every_(\d+)_days$/)?.[1] ? Number(frequency.match(/^every_(\d+)_days$/)?.[1]) : null;
const weekInterval = (frequency: Frequency) => frequency === 'weekly' ? 1 : frequency.match(/^every_(\d+)_weeks$/)?.[1] ? Number(frequency.match(/^every_(\d+)_weeks$/)?.[1]) : null;
const monthInterval = (frequency: Frequency) => frequency === 'monthly' ? 1 : frequency.match(/^every_(\d+)_months$/)?.[1] ? Number(frequency.match(/^every_(\d+)_months$/)?.[1]) : null;
const dateOnly = (value: string) => value.substring(0, 10);
const formatDate = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

/** Occurrences are created in batches of this size; the form promises 12. */
export const RECURRING_BATCH_SIZE = 12;

export function getNextRecurringDate(date: Date, frequency: Frequency, originalDay: number): Date {
  const next = new Date(date);
  const days = dayInterval(frequency);
  const weeks = weekInterval(frequency);
  const months = monthInterval(frequency);
  if (days) next.setDate(next.getDate() + days);
  else if (weeks) next.setDate(next.getDate() + weeks * 7);
  else if (months) {
    const targetMonth = next.getMonth() + months;
    const targetYear = next.getFullYear() + Math.floor(targetMonth / 12);
    const normalizedMonth = targetMonth % 12;
    const daysInMonth = new Date(targetYear, normalizedMonth + 1, 0).getDate();
    return new Date(targetYear, normalizedMonth, Math.min(originalDay, daysInMonth));
  }
  return next;
}

export function generateRecurringOccurrenceDates(
  item: Pick<RecurringItem, 'startDate' | 'endDate' | 'frequency'>,
  limit = 12,
  fromDate?: string,
): string[] {
  const start = new Date(`${dateOnly(item.startDate)}T00:00:00`);
  const end = item.endDate ? new Date(`${dateOnly(item.endDate)}T00:00:00`) : null;
  const originalDay = start.getDate();
  const dates: string[] = [];
  let current = start;

  // Legacy recurring items can have a historical start date. For an
  // open-ended series, forecast from the next valid occurrence instead of
  // spending the twelve-item window entirely in the past.
  if (fromDate) {
    const threshold = new Date(`${fromDate}T00:00:00`);
    while (current < threshold) {
      current = getNextRecurringDate(current, item.frequency, originalDay);
    }
  }

  for (let index = 0; index < limit && (!end || current <= end); index += 1) {
    dates.push(formatDate(current));
    current = getNextRecurringDate(current, item.frequency, originalDay);
  }
  return dates;
}

/** Every scheduled date from the start date up to and including `untilDate`. */
export function generateScheduleDatesThrough(
  item: Pick<RecurringItem, 'startDate' | 'endDate' | 'frequency'>,
  untilDate: string,
): string[] {
  const start = new Date(`${dateOnly(item.startDate)}T00:00:00`);
  const end = item.endDate ? new Date(`${dateOnly(item.endDate)}T00:00:00`) : null;
  const until = new Date(`${dateOnly(untilDate)}T00:00:00`);
  const originalDay = start.getDate();
  const dates: string[] = [];
  let current = start;

  while (current <= until && (!end || current <= end)) {
    dates.push(formatDate(current));
    const next = getNextRecurringDate(current, item.frequency, originalDay);
    // An unrecognised frequency doesn't advance the date; stop instead of looping.
    if (next <= current) break;
    current = next;
  }
  return dates;
}
