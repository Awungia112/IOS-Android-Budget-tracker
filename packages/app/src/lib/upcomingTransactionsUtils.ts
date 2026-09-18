import { RecurringItem, Transaction } from "@budget/core";
import { useMemo } from "react";
import { toLocalDateString } from './formatters';

/**
 * Generate future transactions from recurring items for the next 3 months
 */
export function generateUpcomingTransactions(
  recurringItems: RecurringItem[],
  currentDate: Date = new Date()
): Transaction[] {
  // Defensive check for test environments
  if (!recurringItems || !Array.isArray(recurringItems)) {
    return [];
  }

  const now = new Date(currentDate);
  now.setHours(0, 0, 0, 0);

  // Set end date to the last day of the month that is 3 months from now
  // This ensures we capture all occurrences in the 3-month window
  const threeMonthsFromNow = new Date(now);
  threeMonthsFromNow.setMonth(threeMonthsFromNow.getMonth() + 3);
  // Set to last day of that month
  threeMonthsFromNow.setMonth(threeMonthsFromNow.getMonth() + 1, 0);

  const futureTransactions: Transaction[] = [];

  // Process each recurring item - limit to reasonable number to prevent performance issues
  const maxRecurringItems = 50;
  const itemsToProcess = recurringItems.slice(0, maxRecurringItems);
  
  itemsToProcess.forEach((recurringItem) => {
    const generatedTransactions = generateRecurringTransactionsForItem(
      recurringItem,
      now,
      threeMonthsFromNow
    );
    futureTransactions.push(...generatedTransactions);
  });

  return futureTransactions.sort((a, b) => a.date.localeCompare(b.date));
}

/**
 * Memoized hook for generating upcoming transactions to prevent unnecessary recalculations
 */
export function useUpcomingTransactions(
  recurringItems: RecurringItem[],
  currentDate: Date = new Date()
): Transaction[] {
  return useMemo(() => generateUpcomingTransactions(recurringItems, currentDate), [recurringItems, currentDate]);
}

/**
 * Generate transactions for a single recurring item within the date range
 */
function generateRecurringTransactionsForItem(
  recurringItem: RecurringItem,
  startDate: Date,
  endDate: Date
): Transaction[] {
  const transactions: Transaction[] = [];
  let currentDate = new Date(recurringItem.startDate);
  currentDate.setHours(0, 0, 0, 0);

  // Store the original day for month-end preservation
  const originalDay = new Date(recurringItem.startDate).getDate();

  // If start date is before our range start, find the first occurrence after startDate
  if (currentDate < startDate) {
    // Use the same logic as getNextOccurrenceDate but starting from the recurring item's start date
    currentDate = new Date(recurringItem.startDate);
    currentDate.setHours(0, 0, 0, 0);
    while (currentDate < startDate) {
      currentDate = getNextOccurrenceDate(currentDate, recurringItem.frequency, originalDay);
    }
  }

  // Generate transactions while within the 3-month range
  let iterations = 0;
  const maxIterations = 1000; // Safety guard to prevent infinite loops
  while (currentDate <= endDate && iterations < maxIterations) {
    // Create a transaction-like object from the recurring item
    const transaction: Transaction = {
      id: `recurring-${recurringItem.id}-${toLocalDateString(currentDate)}`,
      type: recurringItem.type,
      amount: recurringItem.amount,
      category: recurringItem.categoryId,
      date: toLocalDateString(currentDate),
      title: recurringItem.name,
      accountId: recurringItem.accountId,
      createdAt: new Date().toISOString(),
      recurringItemId: recurringItem.id, // Link to source recurring item
    };

    transactions.push(transaction);

    // Move to next occurrence
    currentDate = getNextOccurrenceDate(currentDate, recurringItem.frequency, originalDay);
    iterations++;
  }

  return transactions;
}

/**
 * Calculate the next occurrence date based on frequency
 */
function getNextOccurrenceDate(currentDate: Date, frequency: string, originalDay?: number): Date {
  let nextDate = new Date(currentDate);

  // Daily frequencies
  if (frequency === 'daily') {
    nextDate.setDate(nextDate.getDate() + 1);
  } else if (frequency.startsWith('every_') && frequency.endsWith('_days')) {
    const days = parseInt(frequency.split('_')[1], 10);
    nextDate.setDate(nextDate.getDate() + days);
  }
  // Weekly frequencies
  else if (frequency === 'weekly') {
    nextDate.setDate(nextDate.getDate() + 7);
  } else if (frequency.startsWith('every_') && frequency.endsWith('_weeks')) {
    const weeks = parseInt(frequency.split('_')[1], 10);
    nextDate.setDate(nextDate.getDate() + (weeks * 7));
  }
  // Monthly frequencies - use same logic as getNextDueDate for consistency
  else if (frequency === 'monthly') {
    const dayOfMonth = originalDay ?? currentDate.getDate();
    const targetMonth = currentDate.getMonth() + 1;
    const targetYear = currentDate.getFullYear() + Math.floor(targetMonth / 12);
    const normalizedMonth = targetMonth % 12;
    const daysInTargetMonth = new Date(targetYear, normalizedMonth + 1, 0).getDate();
    
    // Use exact same approach as getNextDueDate
    nextDate = new Date(targetYear, normalizedMonth, Math.min(dayOfMonth, daysInTargetMonth));
  } else if (frequency.startsWith('every_') && frequency.endsWith('_months')) {
    const months = parseInt(frequency.split('_')[1], 10);
    const dayOfMonth = originalDay ?? currentDate.getDate();
    const targetMonth = currentDate.getMonth() + months;
    const targetYear = currentDate.getFullYear() + Math.floor(targetMonth / 12);
    const normalizedMonth = targetMonth % 12;
    const daysInTargetMonth = new Date(targetYear, normalizedMonth + 1, 0).getDate();
    nextDate = new Date(targetYear, normalizedMonth, Math.min(dayOfMonth, daysInTargetMonth));
  }
  // Default to monthly if unrecognized
  else {
    const dayOfMonth = originalDay ?? currentDate.getDate();
    const targetMonth = currentDate.getMonth() + 1;
    const targetYear = currentDate.getFullYear() + Math.floor(targetMonth / 12);
    const normalizedMonth = targetMonth % 12;
    const daysInTargetMonth = new Date(targetYear, normalizedMonth + 1, 0).getDate();
    nextDate = new Date(targetYear, normalizedMonth, Math.min(dayOfMonth, daysInTargetMonth));
  }

  return nextDate;
}

/**
 * Combine actual pending transactions with upcoming recurring transactions
 */
export function combinePendingTransactions(
  actualPendingTransactions: Transaction[],
  recurringItems: RecurringItem[],
  currentDate: Date = new Date()
): Transaction[] {
  const upcomingRecurringTransactions = generateUpcomingTransactions(
    recurringItems,
    currentDate
  );

  // Two key strategies to avoid over-deduplication while still suppressing recurring projections:
  //
  // 1. Exact key (with amount): used to build lookups from real transactions so that
  //    two distinct real transactions sharing date+type+category+title but with DIFFERENT
  //    amounts are never collapsed against each other.
  //
  // 2. Amount-free key: used ONLY to match virtual recurring projections against real
  //    transactions, because a manual override for a recurring item intentionally has
  //    a different amount (e.g. variable salary) — amount exclusion is correct here.
  const getExactKey = (tx: Transaction) => `${tx.date}|${tx.type}|${tx.category ?? ''}|${tx.title ?? ''}|${Number(tx.amount ?? 0).toFixed(2)}`;
  const getRecurringMatchKey = (tx: Transaction) => `${tx.date}|${tx.type}|${tx.category ?? ''}|${tx.title ?? ''}`;

  // Build lookups with the EXACT key so real transactions are never over-deduplicated
  const actualExactKeys = new Set(actualPendingTransactions.map(getExactKey));
  
  // Build lookup with the amount-free key ONLY for suppressing recurring projections
  const actualRecurringKeys = new Set(actualPendingTransactions.map(getRecurringMatchKey));

  // Filter out virtual recurring projections that are already covered by a real transaction
  const filteredRecurring = upcomingRecurringTransactions.filter(rtx => {
    const rtxExactKey = getExactKey(rtx);
    const rtxRecurringKey = getRecurringMatchKey(rtx);
    
    // If an exact match exists, the projection is clearly redundant
    if (actualExactKeys.has(rtxExactKey)) return false;
    
    // Amount-free match: a manual override with a different amount suppresses the projection
    if (actualRecurringKeys.has(rtxRecurringKey)) return false;
    
    return true;
  });

  const allTransactions = [...actualPendingTransactions, ...filteredRecurring];
  
  // Sort by date (newest first to match overview page behavior)
  return allTransactions.sort((a, b) => b.date.localeCompare(a.date));
}
