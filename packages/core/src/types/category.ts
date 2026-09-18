import type { TransactionType } from './transaction.js';

/**
 * Category entity stored in IndexedDB
 */
export interface Category {
  id: string;
  name: string;              // Translation key (e.g., 'category_salary') or custom name
  type: TransactionType;
  isDefault: boolean;
  accountId: string;
  icon?: string;             // Icon key (e.g., 'cash', 'pig')
  color?: string;            // Optional custom color
  hidden?: boolean;          // When true, the category is hidden from pickers but not deleted
  archivedAt?: string; // ISO timestamp when the row was soft-archived
}

/**
 * Data required to create a new category
 */
export type CreateCategory = Omit<Category, 'id' | 'accountId' | 'isDefault'>;

/**
 * Validation result for category operations
 */
export interface CategoryValidationResult {
  valid: boolean;
  errors: string[];
}

/**
 * Category with resolved display data (for UI)
 */
export interface ResolvedCategory extends Category {
  displayName: string;       // Translated or original name
  iconPath?: string;         // Full path to icon SVG
  displayColor: string;      // Resolved color (from preset or default)
}
