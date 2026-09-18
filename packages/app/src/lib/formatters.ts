import { TFunction } from 'i18next';
import { filterExecutedTransactions } from '@budget/core';
import { Transaction } from '@budget/core';

/**
 * Format a number as a currency string (€)
 */

export const formatCurrency = (amount: number, locale?: string): string => {
  const resolvedLocale = locale ?? "de-DE";
  return new Intl.NumberFormat(resolvedLocale, {
    style: "currency",
    currency: "EUR",
  }).format(amount);
};

export const formatCurrencyShort = (amount: number): string => {
  const absAmount = Math.abs(amount);

  // Abbreviate large numbers
  // Since the application is for a german public at least for the abbreviation we will go with german abbreviations whatever the language of the app is
  const formatShort = (value: number, suffix: string) =>
      new Intl.NumberFormat('de-DE', {
          minimumFractionDigits: 2, maximumFractionDigits: 2,}).format(value) + ` ${suffix} €`;
  if (absAmount >= 1_000_000_000_000) {
    return formatShort(amount / 1_000_000_000_000, "Bio.");
  }
  if (absAmount >= 1_000_000_000) {
    return formatShort(amount / 1_000_000_000, "Mrd.");
  }
  if (absAmount >= 1_000_000) {
    return formatShort(amount / 1_000_000, "Mio.");
  }
  if (absAmount >= 100_000) {
    return formatShort(amount / 1_000, "Tsd.")
  }

  return new Intl.NumberFormat('de-DE', {
    style: 'currency',
    currency: 'EUR',
  }).format(amount);
};

/**
 * Format a date as a localized string (DD.MM.YYYY)
 */
export const formatDate = (date: Date | string): string => {
  if (!date) return "—";

  // Handle YYYY-MM-DD string directly to avoid timezone issues
  if (typeof date === 'string' && date.match(/^\d{4}-\d{2}-\d{2}$/)) {
    const [year, month, day] = date.split('-').map(Number);
    return `${String(day).padStart(2, '0')}.${String(month).padStart(2, '0')}.${year}`;
  }

  const dateObj = typeof date === 'string' ? new Date(date) : date;

  if (isNaN(dateObj.getTime())) {
    console.warn("Invalid date passed to formatDate:", date);
    return "—";
  }

  const day = String(dateObj.getDate()).padStart(2, '0');
  const month = String(dateObj.getMonth() + 1).padStart(2, '0');
  const year = dateObj.getFullYear();
  return `${day}.${month}.${year}`;
};

/**
 * Calculate total savings from transactions (only income marked as savingsGoalId)
 */
export const calculateTotalSavings = (transactions: any[]): number => {
  return transactions
    .filter(t => t.type === 'income' && t.savingsGoalId)
    .reduce((sum, t) => sum + t.amount, 0);
};

/**
 * Format a month number to its name
 */
export function getMonthName(index: number, t: TFunction): string {
  const keys = [
    'month_january',
    'month_february',
    'month_march',
    'month_april',
    'month_may',
    'month_june',
    'month_july',
    'month_august',
    'month_september',
    'month_october',
    'month_november',
    'month_december',
  ];
  // eslint-disable-next-line security/detect-object-injection -- key is validated enum value/safe access pattern
  return t(keys[index]);
}

/**
 * Format a Date as YYYY-MM-DD using local timezone.
 * Avoids the UTC shift that toISOString().split('T')[0] can cause
 * (e.g. 11pm local time could return tomorrow's date in UTC).
 */
export function toLocalDateString(date: Date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Parse a YYYY-MM-DD string into its numeric components.
 * Returns month as 0-indexed (matching Date constructor convention).
 */
export function parseDateString(dateString: string): { year: number; month: number; day: number } {
  const [year, month, day] = dateString.split('-').map(Number);
  return { year, month: month - 1, day };
}

/**
 * Calculate progress percentage
 */
export const calculateProgress = (current: number, target: number): number => {
  if (target <= 0) return 0;
  const percentage = (current / target) * 100;
  return Math.min(Math.max(0, percentage), 100);
};

/**
 * Calculate total payments needed based on payments made and remaining amount
 */
export const calculateTotalPaymentsNeeded = (
  targetAmount: number,
  currentSavings: number,
  paymentsMade: number,
  monthlyAmount: number
): number => {
  if (monthlyAmount <= 0) return 0;
  const remainingAmount = Math.max(0, targetAmount - currentSavings);
  const additionalPaymentsNeeded = Math.ceil(remainingAmount / monthlyAmount);
  return paymentsMade + additionalPaymentsNeeded;
};

/**
 * Calculate number of payments left based on target, current savings, and monthly amount
 */
export const calculatePaymentsLeft = (
  targetAmount: number,
  currentSavings: number,
  paymentsMade: number,
  monthlyAmount: number
): number => {
  const totalPaymentsNeeded = calculateTotalPaymentsNeeded(targetAmount, currentSavings, paymentsMade, monthlyAmount);
  return Math.max(0, totalPaymentsNeeded - paymentsMade);
};

/**
 * Calculate the end date as a Date object based on remaining payments
 * This is for business logic calculations, not display
 */
export const calculateSavingsGoalEndDateAsDate = (
  goal: any,
  transactions: any[]
): Date => {
  // Calculate monthly amount
  const monthlyAmount = goal.monthlyAmount
    ? (goal.monthlyAmount > goal.targetAmount)
      ? goal.targetAmount
      : goal.monthlyAmount
    : (() => {
      // If no monthly amount set, calculate based on remaining amount and original deadline
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const deadlineDate = new Date(goal.deadline);
      deadlineDate.setHours(0, 0, 0, 0);

      const monthsUntilDeadline = Math.max(
        1,
        Math.ceil(
          (deadlineDate.getTime() - today.getTime()) /
          (1000 * 60 * 60 * 24 * 30.44),
        ),
      );

      // Calculate current savings
      const currentSavings = filterExecutedTransactions(transactions)
        .filter((t) => t.type === "expense" && t.savingsGoalId === goal.id)
        .reduce((sum, t) => sum + t.amount, 0);

      // Use remaining amount
      const remainingAmount = Math.max(0, goal.targetAmount - currentSavings);

      return remainingAmount > 0 ? remainingAmount / monthsUntilDeadline : 0;
    })();

  // Calculate current savings
  const currentSavings = filterExecutedTransactions(transactions)
    .filter((t) => t.type === "expense" && t.savingsGoalId === goal.id)
    .reduce((sum, t) => sum + t.amount, 0);

  // Use remaining amount for accurate calculation
  const remainingAmount = Math.max(0, goal.targetAmount - currentSavings);

  // Calculate total payments needed based on remaining amount, not full target amount
  const totalPaymentsNeeded = remainingAmount > 0
    ? Math.ceil(remainingAmount / monthlyAmount)
    : 0;

  // Calculate payments made
  const paymentsMade = transactions
    .filter((t) => t.type === "expense" && t.savingsGoalId === goal.id)
    .length;

  // Calculate remaining payments - this should now be accurate
  const remainingPayments = Math.max(0, totalPaymentsNeeded);

  // Calculate end date by adding remaining payments to current date
  const currentDate = new Date();
  currentDate.setHours(0, 0, 0, 0);

  const endDate = new Date(currentDate);
  endDate.setMonth(endDate.getMonth() + remainingPayments);

  return endDate;
};

/**
 * Calculate the end date based on remaining payments
 * This ensures the date reflects actual payment progress
 */
export const calculateSavingsGoalEndDate = (
  goal: any,
  transactions: any[],
  _language: string = 'de-DE'
): string => {
  const endDate = calculateSavingsGoalEndDateAsDate(goal, transactions);
  return formatDate(endDate);
};
