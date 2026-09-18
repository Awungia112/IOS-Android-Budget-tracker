/**
 * Pending Transaction Service
 * 
 * Handles the logic for managing pending transactions:
 * - Checking if a transaction date is in the future
 * - Executing pending transactions when their date is reached
 * - Marking transactions as executed vs pending
 */
import type { Transaction } from '../types/index.js';

/**
 * Determines if a transaction is pending (scheduled for a future date)
 * 
 * @param transaction - The transaction to check
 * @param currentDate - The date to compare against (defaults to today)
 * @returns true if transaction date is in the future, false otherwise
 */
export function isPendingTransaction(
    transaction: Transaction,
    currentDate: Date = new Date()
): boolean {
    // If transaction has been executed, it's no longer pending
    if (transaction.executedAt) {
        return false;
    }

    // Use string comparison to avoid timezone issues completely
    const compareDate = new Date(currentDate);
    compareDate.setHours(0, 0, 0, 0);
    const compareDateString = `${compareDate.getFullYear()}-${String(compareDate.getMonth() + 1).padStart(2, '0')}-${String(compareDate.getDate()).padStart(2, '0')}`;

    // Extract only the date portion (YYYY-MM-DD) from the transaction date to handle full ISO strings
    const transactionDateString = transaction.date.substring(0, 10);

    return transactionDateString > compareDateString;
}

/**
 * Determines if a transaction should be executed (its date has been reached)
 * 
 * @param transaction - The transaction to check
 * @param currentDate - The date to compare against (defaults to today)
 * @returns true if transaction date is today or earlier, false otherwise
 */
export function shouldExecuteTransaction(
    transaction: Transaction,
    currentDate: Date = new Date()
): boolean {
    return !isPendingTransaction(transaction, currentDate);
}

/**
 * Filters pending transactions
 * 
 * @param transactions - Array of transactions to filter
 * @param currentDate - The date to compare against (defaults to today)
 * @returns Array of pending transactions
 */
export function filterPendingTransactions(
    transactions: Transaction[],
    currentDate: Date = new Date()
): Transaction[] {
    return transactions.filter(t => isPendingTransaction(t, currentDate));
}

/**
 * Filters executed transactions (non-pending)
 * 
 * @param transactions - Array of transactions to filter
 * @param currentDate - The date to compare against (defaults to today)
 * @returns Array of executed/current transactions
 */
export function filterExecutedTransactions(
    transactions: Transaction[],
    currentDate: Date = new Date()
): Transaction[] {
    return transactions.filter(t => !isPendingTransaction(t, currentDate));
}

/**
 * Gets pending transactions that are ready to be executed (date has been reached)
 * This is used to identify transactions that weren't picked up by the last check
 * 
 * @param transactions - Array of transactions to check
 * @param lastCheckDate - The last date we checked for pending transactions
 * @param currentDate - The current date
 * @returns Array of transactions that became executable between lastCheckDate and currentDate
 */
export function getReadyToExecuteTransactions(
    transactions: Transaction[],
    lastCheckDate: Date,
    currentDate: Date = new Date()
): Transaction[] {
    return transactions.filter(t => {
        // Use string comparison to avoid timezone issues completely
        const checkDate = new Date(lastCheckDate);
        checkDate.setHours(0, 0, 0, 0);
        const checkDateString = `${checkDate.getFullYear()}-${String(checkDate.getMonth() + 1).padStart(2, '0')}-${String(checkDate.getDate()).padStart(2, '0')}`;

        const current = new Date(currentDate);
        current.setHours(0, 0, 0, 0);
        const currentDateString = `${current.getFullYear()}-${String(current.getMonth() + 1).padStart(2, '0')}-${String(current.getDate()).padStart(2, '0')}`;

        // Transaction date is between lastCheck and now (inclusive)
        const transactionDate = t.date.substring(0, 10);
        return transactionDate > checkDateString && transactionDate <= currentDateString;
    });
}

/**
 * Formats a transaction date for pending transaction display
 * 
 * @param dateString - ISO date string
 * @param locale - Language locale (e.g., 'en-US', 'de-DE')
 * @returns Formatted date string
 */
export function formatPendingDate(dateString: string, locale: string = 'en-US'): string {
    const date = new Date(dateString);
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const year = date.getFullYear();
    return `${day}.${month}.${year}`;
}

/**
 * Calculates days until a pending transaction is executed
 * 
 * @param dateString - ISO date string
 * @param currentDate - Current date (defaults to today)
 * @returns Number of days until execution (0 if today, negative if past)
 */
export function daysUntilExecution(
    dateString: string,
    currentDate: Date = new Date()
): number {
    const transactionDate = new Date(dateString);
    const current = new Date(currentDate);

    // Normalize to midnight
    transactionDate.setHours(0, 0, 0, 0);
    current.setHours(0, 0, 0, 0);

    const diffMs = transactionDate.getTime() - current.getTime();
    return Math.ceil(diffMs / (1000 * 60 * 60 * 24));
}
