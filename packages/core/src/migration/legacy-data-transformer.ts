/**
 * LegacyDataTransformer - Transforms legacy Django API data to Budget Wise domain types
 * 
 * Responsibilities:
 * - Convert legacy entity structures to Budget Wise domain models
 * - Generate deterministic UUIDs (UUIDv5) so the migration is safely re-runnable
 * - Convert date formats (ISO datetime → YYYY-MM-DD)
 * - Map legacy integer IDs to new UUID references
 * - Apply defaults for missing fields
 * - Validate transformed data and collect errors
 * 
 * Source: docs/legacy-api-schema-mapping.md
 */

import { v5 as uuidv5 } from 'uuid';
import type {
  Account,
  Transaction,
  Category,
  Limit,
  Template,
  RecurringItem,
  SavingsGoal,
  ExportData,
  TransactionType,
  Frequency,
} from '../types/index.js';
import type {
  LegacyBalance,
  LegacyCategory,
  LegacyAccount,
  LegacyTemplate,
  LegacyRecuring,
  LegacySavingGoal,
  LegacyBalanceType,
} from './legacy-types.js';
import type { TransformResult } from './migration.service.js';
import type { LegacyUserData } from './legacy-types.js';
import {
  findDefaultCategoryForLegacy,
  legacyCategoryIconKey,
  toLegacyTransactionType,
} from './legacy-category-mapping.js';

// =============================================================================
// MIGRATION NAMESPACE
// Fixed UUIDv5 namespace — same input always produces the same output UUID,
// making the migration safely re-runnable (retries won't duplicate data).
// =============================================================================

/** DNS namespace UUID — standard, well-known, safe to use as a base namespace */
const MIGRATION_NAMESPACE = '6ba7b810-9dad-11d1-80b4-00c04fd430c8';

/** Derive a deterministic UUID from an entity type + legacy account ID + legacy entity ID */
function migrationId(entityType: string, legacyAccountId: number, legacyId: number): string {
  return uuidv5(`${entityType}:${legacyAccountId}:${legacyId}`, MIGRATION_NAMESPACE);
}

// =============================================================================
// TRANSFORMER CLASS
// =============================================================================

/**
 * LegacyDataTransformer - Transforms legacy Django API data to Budget Wise domain types
 * 
 * PUBLIC API:
 * - transform(legacyData): Main entry point - use this for all transformations
 * 
 * IMPORTANT: Individual transform methods (transformAccount, transformCategories, etc.) 
 * maintain internal state (categoryIdMap, savingsGoalIdMap) and MUST NOT be called 
 * directly or out of order. They are public only for testing purposes. Always use the 
 * transform() method which properly manages state and ensures correct transformation order.
 */
export class LegacyDataTransformer {
  // ID mapping tables (legacy integer ID → new UUID)
  // These are populated during transformation and used for cross-references
  private categoryIdMap = new Map<number, string>();
  private savingsGoalIdMap = new Map<number, string>();

  // Validation errors collected during transformation
  private errors: string[] = [];

  /**
   * Main transformation entry point
   */
  transform(legacyData: LegacyUserData): TransformResult {
    // Reset state
    this.categoryIdMap.clear();
    this.savingsGoalIdMap.clear();
    this.errors = [];

    // Validate input
    if (!legacyData.accounts || legacyData.accounts.length === 0) {
      this.errors.push('No accounts found in legacy data');
      return {
        data: this.createEmptyExportData(),
        errors: this.errors,
      };
    }

    // Find all non-deleted accounts
    const activeAccounts = legacyData.accounts.filter(a => !a.deleted);

    if (activeAccounts.length === 0) {
      this.errors.push('No active accounts found - all accounts are deleted');
      return {
        data: this.createEmptyExportData(),
        errors: this.errors,
      };
    }

    const legacyAccount = activeAccounts[0];
    const account = this.transformAccount(legacyAccount);

    // Filter all entities to only those belonging to this account
    const accountCategories = (legacyData.categories || []).filter(c => c.account === legacyAccount.id);
    const accountBalances = (legacyData.balances || []).filter(b => b.account === legacyAccount.id);
    const accountRecurings = (legacyData.recurings || []).filter(r => r.account === legacyAccount.id);

    // Savings goals are fetched by category_id (API quirk), so `account` may be
    // undefined in older responses. Resolve via the category when absent — a goal
    // belongs to this account if its category belongs to this account.
    const categoryAccountMap = new Map((legacyData.categories || []).map(c => [c.id, c.account]));
    const accountSavingGoals = (legacyData.savingGoals || []).filter(g => {
      const resolvedAccount = g.account ?? categoryAccountMap.get(g.category);
      return resolvedAccount === legacyAccount.id;
    });

    // Transform categories first (needed for ID mapping)
    const categories = this.transformCategories(accountCategories, account.id);

    // Transform savings goals before transactions (needed for savingsGoalIdMap)
    const savingsGoals = this.transformSavingsGoals(accountSavingGoals, account.id);

    // Transform other entities
    const transactions = this.transformTransactions(accountBalances, account.id);
    const limits = this.transformLimits(accountCategories, account.id);
    const templates = this.transformTemplates([], account.id); // Templates not in API
    const recurringItems = this.transformRecurringItems(accountRecurings, account.id);

    // Validate referential integrity
    this.validateReferences(transactions, categories, limits);

    const data: ExportData = {
      version: '1.0',
      exportDate: new Date().toISOString(),
      account,
      transactions,
      categories,
      limits,
      templates,
      recurringItems,
      savingsGoals,
    };

    return {
      data,
      errors: this.errors,
    };
  }

  // ===========================================================================
  // ENTITY TRANSFORMERS
  // ===========================================================================
  // 
  // WARNING: These methods are stateful and depend on internal maps (categoryIdMap, 
  // savingsGoalIdMap). DO NOT call them directly - use transform() instead.
  // They are public only for unit testing individual transformation logic.
  //
  // Calling these methods out of order or without proper state initialization will
  // produce incorrect results (e.g., missing category references, broken savings goal links).
  // ===========================================================================

  /**
   * Transform legacy Account to Budget Wise Account
   * 
   * @internal Use transform() instead - this method is public only for testing
   */
  transformAccount(legacy: LegacyAccount): Account {
    return {
      // `legacy.id` is passed twice because LegacyAccount has no parent scope.
      id: migrationId('account', legacy.id, legacy.id),
      name: legacy.name,
      initials: legacy.acronym || this.generateInitials(legacy.name),
      // profileImage is optional, not in legacy
    };
  }

  /**
   * Transform legacy Categories to Budget Wise Categories
   * 
   * Strategy:
   * 1. Match legacy categories to default Budget Wise categories by name/type
   * 2. Reuse existing default category IDs where matches are found
   * 3. Include matched defaults in the export payload so importData() can
   *    remap cross-account category ID collisions correctly
   * 4. Create new custom categories for unmatched legacy categories
   * 
   * This prevents duplicate categories after migration (e.g., two "Food" categories)
   * 
   * @internal Use transform() instead - this method is public only for testing
   * @sideEffect Populates categoryIdMap for use by other transformers
   */
  transformCategories(legacyCategories: LegacyCategory[], accountId: string): Category[] {
    const categories: Category[] = [];

    for (const legacy of legacyCategories) {
      // Skip deleted categories
      if (legacy.deleted) continue;

      // Skip inactive categories (optional - could import all)
      if (!legacy.active) continue;

      // Handle both deletable and is_deletable fields (API inconsistency)
      // Default to true (deletable) if neither field is present
      const isDeletable = legacy.deletable ?? legacy.is_deletable ?? true;
      const legacyType = this.convertBalanceType(legacy.balanceType);

      // Try to match with existing default categories only when the legacy app
      // itself marks this category as non-deletable (= system default).
      //
      // A deletable category is user-created and must remain custom in this
      // transformed payload, even if its name matches a system default. The
      // target-account import layer owns any later canonicalization against
      // seeded defaults.
      const trimmedName = legacy.name.trim();
      const matchedDefault = !isDeletable
        ? findDefaultCategoryForLegacy(trimmedName, legacyType)
        : undefined;


      let categoryId: string;
      let isDefault: boolean;

      // Map to a default category when the legacy name corresponds to a known
      // default. This ensures stable default IDs are reused in the migration
      // output so downstream import/remapping can resolve correctly.
      if (matchedDefault) {
        // Reuse existing default category ID
        categoryId = matchedDefault.id;
        isDefault = true;
        this.categoryIdMap.set(legacy.id, categoryId);

        categories.push({
          id: categoryId,
          name: matchedDefault.name,
          type: matchedDefault.type,
          isDefault,
          accountId,
          ...(matchedDefault.icon ? { icon: matchedDefault.icon } : {}),
          ...(matchedDefault.color ? { color: matchedDefault.color } : {}),
        });
        continue;
      } else {
        // Create new custom category and preserve legacy name for user-owned categories
        categoryId = migrationId('category', legacy.account, legacy.id);
        isDefault = !isDeletable; // Non-deletable legacy categories become defaults
      }

      this.categoryIdMap.set(legacy.id, categoryId);

      categories.push({
        id: categoryId,
        name: legacy.name,
        type: legacyType,
        isDefault,
        accountId,
        icon: this.convertIcon(legacy.icon || '', legacy.balanceType),
        // color is optional, not directly mapped
      });
    }

    return categories;
  }


  /**
   * Transform legacy Balances to Budget Wise Transactions
   * 
   * @internal Use transform() instead - this method is public only for testing
   * @requires categoryIdMap must be populated (call transformCategories first)
   * @requires savingsGoalIdMap must be populated if transactions reference goals
   */
  transformTransactions(legacyBalances: LegacyBalance[], accountId: string): Transaction[] {
    const transactions: Transaction[] = [];

    for (const legacy of legacyBalances) {
      // Skip deleted transactions
      if (legacy.deleted) continue;

      // Skip transfer transactions (not supported in Budget Wise)
      // Use != null to catch both null and undefined (fields are optional in the API)
      if (legacy.target_account != null || legacy.sender_account != null || legacy.is_transfer_balance === true) {
        this.errors.push(`Skipped transfer transaction: ${legacy.name} (id: ${legacy.id})`);
        continue;
      }

      // Skip transactions without a category
      if (legacy.category === null) {
        this.errors.push(`Transaction "${legacy.name}" (id: ${legacy.id}) has no category — skipped`);
        continue;
      }

      // Map category ID
      const categoryId = this.categoryIdMap.get(legacy.category);
      if (!categoryId) {
        this.errors.push(`Transaction "${legacy.name}" references unknown category ${legacy.category}`);
        continue;
      }

      transactions.push({
        id: migrationId('transaction', legacy.account, legacy.id),
        title: legacy.name,
        type: this.convertBalanceType(legacy.balanceType),
        date: this.convertDate(legacy.date), // YYYY-MM-DD for display
        amount: legacy.amount,
        accountId,
        category: categoryId,
        createdAt: legacy.date, // Keep ISO datetime for audit/ordering (not converted)
        savingsGoalId: legacy.saving_goal !== null ? this.savingsGoalIdMap.get(legacy.saving_goal) : undefined,
        isRecurring: legacy.recuring !== null,
        // Restore the old app's explicit FK link: legacy.recuring held the numeric ID of the
        // recurring item this transaction was generated from (or manually linked to).
        recurringItemId: legacy.recuring !== null
          ? migrationId('recurring', legacy.account, legacy.recuring)
          : undefined,
      });
    }

    return transactions;
  }

  /**
   * Transform legacy Category limits to Budget Wise Limits
   * 
   * @internal Use transform() instead - this method is public only for testing
   * @requires categoryIdMap must be populated (call transformCategories first)
   */
  transformLimits(legacyCategories: LegacyCategory[], accountId: string): Limit[] {
    const limits: Limit[] = [];

    for (const legacy of legacyCategories) {
      // Skip if no limit set or limit is zero (legacy app treats 0 the same as no limit)
      if (legacy.limits === null || legacy.limits === 0 || legacy.deleted) continue;

      const categoryId = this.categoryIdMap.get(legacy.id);
      if (!categoryId) {
        this.errors.push(`Limit for category ${legacy.id} references unknown category — skipped`);
        continue;
      }

      limits.push({
        id: migrationId('limit', legacy.account, legacy.id),
        categoryId,
        amount: legacy.limits,
        accountId,
      });
    }

    return limits;
  }

  /**
   * Transform legacy Templates to Budget Wise Templates
   * Note: Templates exist in legacy DB but are not exposed via API
   * 
   * @internal Use transform() instead - this method is public only for testing
   * @requires categoryIdMap must be populated (call transformCategories first)
   */
  transformTemplates(legacyTemplates: LegacyTemplate[], accountId: string): Template[] {
    const templates: Template[] = [];

    for (const legacy of legacyTemplates) {
      if (legacy.deleted) continue;

      const categoryId = this.categoryIdMap.get(legacy.category);
      if (!categoryId) {
        this.errors.push(`Template "${legacy.name}" references unknown category ${legacy.category}`);
        continue;
      }

      templates.push({
        id: migrationId('template', legacy.category, legacy.id),
        name: legacy.name,
        amount: legacy.amount,
        categoryId,
        type: this.convertBalanceType(legacy.balanceType),
        accountId,
      });
    }

    return templates;
  }

  /**
   * Transform legacy Recurring items to Budget Wise RecurringItems
   * 
   * @internal Use transform() instead - this method is public only for testing
   * @requires categoryIdMap must be populated (call transformCategories first)
   */
  transformRecurringItems(legacyRecurring: LegacyRecuring[], accountId: string): RecurringItem[] {
    const recurringItems: RecurringItem[] = [];

    for (const legacy of legacyRecurring) {
      if (legacy.deleted) continue;

      const categoryId = this.categoryIdMap.get(legacy.category);
      if (!categoryId) {
        this.errors.push(`Recurring item "${legacy.name}" references unknown category ${legacy.category}`);
        continue;
      }

      // Validate and convert frequency
      const frequency = this.convertFrequency(legacy.repeating);
      if (!frequency) {
        this.errors.push(
          `Recurring item "${legacy.name}" has invalid repeating interval: ${legacy.repeating} — skipped`
        );
        continue;
      }

      recurringItems.push({
        id: migrationId('recurring', legacy.account, legacy.id),
        name: legacy.name,
        amount: legacy.amount,
        categoryId,
        type: this.convertBalanceType(legacy.balanceType),
        frequency,
        startDate: this.convertDate(legacy.startDate),
        endDate: legacy.endDate ? this.convertDate(legacy.endDate) : null,
        accountId,
      });
    }

    return recurringItems;
  }

  /**
   * Transform legacy SavingGoals to Budget Wise SavingsGoals
   * 
   * @internal Use transform() instead - this method is public only for testing
   * @requires categoryIdMap must be populated (call transformCategories first)
   * @sideEffect Populates savingsGoalIdMap for use by transformTransactions
   */
  transformSavingsGoals(legacySavingGoals: LegacySavingGoal[], accountId: string): SavingsGoal[] {
    const savingsGoals: SavingsGoal[] = [];

    for (const legacy of legacySavingGoals) {
      if (legacy.deleted) continue;

      const categoryId = this.categoryIdMap.get(legacy.category);
      if (!categoryId) {
        this.errors.push(`Savings goal "${legacy.name}" references unknown category ${legacy.category}`);
        continue;
      }

      const newId = migrationId('savings_goal', legacy.account ?? legacy.category, legacy.id);
      this.savingsGoalIdMap.set(legacy.id, newId);

      // Use dueDate (already in YYYY-MM-DD or ISO format)
      const deadline = legacy.dueDate ? this.convertDate(legacy.dueDate) : '';

      savingsGoals.push({
        id: newId,
        name: legacy.name,
        targetAmount: legacy.amount,
        deadline,
        accountId,
        categoryId,
        monthlyAmount: legacy.monthly_amount,
      });
    }

    return savingsGoals;
  }

  // ===========================================================================
  // CONVERSION HELPERS
  // ===========================================================================

  /**
   * Convert legacy balance type to Budget Wise transaction type
   */
  private convertBalanceType(legacyType: LegacyBalanceType): TransactionType {
    return toLegacyTransactionType(legacyType);
  }

  /**
   * Convert ISO datetime to YYYY-MM-DD date string
   */
  private convertDate(isoDateTime: string): string {
    return isoDateTime.split('T')[0];
  }

  /**
   * Convert legacy repeating interval to Budget Wise frequency
   * 
   * Legacy repeating field = number of MONTHS between occurrences
   * (verified from Android app code and database migrations)
   * 
   * Examples:
   * - repeating: 1  → 'monthly'
   * - repeating: 3  → 'every_3_months' (quarterly)
   * - repeating: 6  → 'every_6_months' (semi-annually)
   * - repeating: 12 → 'every_12_months' (annually)
   * 
   * @returns Frequency string or null if invalid (caller should skip the item)
   */
  private convertFrequency(repeating: number): Frequency | null {
    // Validate: must be positive integer
    if (repeating <= 0 || !Number.isInteger(repeating)) {
      return null;
    }

    // Validate: reasonable upper bound (10 years = 120 months)
    if (repeating > 120) {
      return null;
    }

    // Special case: monthly
    if (repeating === 1) {
      return 'monthly';
    }

    // All other valid intervals
    return `every_${repeating}_months` as Frequency;
  }

  /**
   * Convert legacy icon name to Budget Wise icon key.
   * Unmapped icons fall back to type defaults in legacy-category-mapping.
   */
  private convertIcon(legacyIcon: string | undefined, balanceType: LegacyBalanceType): string {
    return legacyCategoryIconKey(legacyIcon, balanceType);
  }

  /**
   * Generate initials from account name
   */
  private generateInitials(name: string): string {
    const words = name.trim().split(/\s+/);
    if (words.length === 1) {
      return words[0].substring(0, 2).toUpperCase();
    }
    return (words[0][0] + words[1][0]).toUpperCase();
  }

  // ===========================================================================
  // VALIDATION
  // ===========================================================================

  /**
   * Validate referential integrity after transformation
   */
  private validateReferences(
    transactions: Transaction[],
    categories: Category[],
    limits: Limit[],
  ): void {
    const categoryIds = new Set(categories.map(c => c.id));

    // Validate transaction categories
    for (const txn of transactions) {
      if (!categoryIds.has(txn.category)) {
        this.errors.push(`Transaction "${txn.title}" references non-existent category ${txn.category}`);
      }
    }

    // Validate limit categories
    for (const limit of limits) {
      if (!categoryIds.has(limit.categoryId)) {
        this.errors.push(`Limit references non-existent category ${limit.categoryId}`);
      }
    }
  }

  /**
   * Create empty export data structure
   */
  private createEmptyExportData(): ExportData {
    return {
      version: '1.0',
      exportDate: new Date().toISOString(),
      account: {
        id: 'migration-error-placeholder',
        name: 'Imported Account',
        initials: 'IA',
      },
      transactions: [],
      categories: [],
      limits: [],
      templates: [],
      recurringItems: [],
      savingsGoals: [],
    };
  }
}
