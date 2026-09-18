/**
 * Standalone BudgetService instance for use outside of BudgetContext
 * (e.g. MigrationPage, which runs the migration service independently).
 *
 * Note: BudgetContext maintains its own separate BudgetService instance.
 * Both instances share the same underlying IndexedDB (Dexie) database,
 * so data written by one is immediately visible to the other.
 */
import { BudgetService } from '@budget/core';

export const budgetService = new BudgetService();
