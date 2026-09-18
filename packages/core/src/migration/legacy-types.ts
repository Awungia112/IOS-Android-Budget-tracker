/**
 * TypeScript types for the legacy "Mein Budget" Django API responses.
 *
 * All shapes are derived from the verified Postman collection
 * (postman/Mein Budget.postman_collection.json) and the Newman contract
 * tests (postman/test-contract.cjs).
 *
 * LIMITS: The legacy API has no dedicated /api/limit endpoint.
 * Spending limits are embedded inline on each category as `limits` (amount)
 * and `limitsDate` (expiry). The transformer must extract these into Budget
 * Wise Limit entities during migration.
 *
 * TEMPLATES: The legacy API has no template concept. Budget Wise templates
 * will not be populated during migration — this is a known data gap.
 */

// =============================================================================
// AUTHENTICATION
// =============================================================================

/** POST /user/get-token → { token } */
export interface LegacyAuthResponse {
  token: string;
}

// =============================================================================
// USER
// =============================================================================

/** GET /user/details */
export interface LegacyUserDetails {
  id: number;
  username: string;
  first_name: string;
  last_name: string;
  email: string;
  date_joined: string; // ISO datetime
}

// =============================================================================
// ACCOUNT
// =============================================================================

/** GET /api/accounts  or  GET /api/accounts?id=X */
export interface LegacyAccount {
  id: number;
  name: string;
  description?: string;
  acronym: string;   // e.g. "EA"
  color: string;     // hex, e.g. "#ff8840"
  created_at?: string;
  last_change?: string;
  deleted: boolean;
  last_synced?: string | null;
  version?: string;
  user?: number;
}

// =============================================================================
// ACCESS
// =============================================================================

/**
 * GET /api/access
 * Returns the accounts the authenticated user owns or has access to.
 * `account` is the numeric account ID used as `account_id` in all other calls.
 * Verified against live API: { id, role, account, version, user: { id, email } }
 */
export interface LegacyAccess {
  id: number;
  role: 'owner' | 'member' | string;
  account: number;
  version?: string;
  user: number | { id: number; email: string; first_name?: string; last_name?: string };
}

// =============================================================================
// BALANCE (= Transaction in Budget Wise)
// =============================================================================

export type LegacyBalanceType = 'BT_INCOME' | 'BT_EXPENSE';

/**
 * GET /api/balance?account_id=X
 * A "balance" in the legacy API maps to a Transaction in Budget Wise.
 * Field names verified against live test API (account 177).
 */
export interface LegacyBalance {
  id: number;
  name: string;                        // transaction title / description
  balanceType: LegacyBalanceType;
  date: string;                        // ISO datetime string e.g. "2022-09-09T13:49:51.141000Z" — truncate to date on import
  amount: number;
  deleted: boolean;
  account: number;
  category: number | null;
  saving_goal: number | null;
  recuring: number | null;             // note: legacy API spells it "recuring"
  user?: number;
  target_account?: number | null;
  sender_account?: number | null;
  // Additional fields present in live API
  target_balance_id?: number | null;
  sender_balance_id?: number | null;
  is_transfer_balance?: boolean;
  version?: string;
}

// =============================================================================
// CATEGORY
// =============================================================================

/**
 * GET /api/category?account_id=X
 * Categories also carry the limit (budget cap) inline.
 * Field names verified against live test API (account 177).
 * Note: API returns `is_deletable` (not `deletable`) in some responses.
 *
 * LIMITS NOTE: There is no separate /api/limit endpoint in the legacy API.
 * `limits` (amount) and `limitsDate` (expiry) on this type are the only
 * source of limit data. The transformer must derive Budget Wise Limit
 * entities from these fields for each category where `limits !== null`.
 */
export interface LegacyCategory {
  id: number;
  name: string;
  icon?: string;
  balanceType: LegacyBalanceType;
  active: boolean;
  deletable?: boolean;             // present in some responses
  is_deletable?: boolean;          // present in live API response
  limits: number | null;           // spending limit amount
  limitsDate: string | null;       // ISO date
  deleted: boolean;
  account: number;
  default?: string | null;         // e.g. "DEFAULT_TRANSFER"
  version?: string;
}

// =============================================================================
// RECURRING
// =============================================================================

/**
 * GET /api/recuring?account_id=X
 * Note: the legacy API endpoint and field names use the typo "recuring".
 * Field names verified against live test API (account 177).
 */
export interface LegacyRecuring {
  id: number;
  name: string;
  balanceType: LegacyBalanceType;
  startDate: string;               // ISO date e.g. "2026-01-01"
  endDate?: string | null;         // ISO date
  nextRepeatingDate?: string | null;
  amount: number;
  repeating: number;               // interval in MONTHS (e.g. 1 = monthly, 3 = quarterly, 12 = annually)
  deleted?: boolean;
  account: number;
  category: number;
  version?: string;
}

// =============================================================================
// TEMPLATE
// =============================================================================

/**
 * Template model from the legacy Django backend (mbbackend/models.py).
 *
 *   NOT ACCESSIBLE VIA THE API — the Template model exists in the database
 * but was never exposed through a REST endpoint. The sync API has a
 * `# *** Templates *** # TODO:` comment confirming this was planned but
 * never implemented. Budget Wise templates will be empty after migration.
 *
 * This type is defined here for completeness and future use if the endpoint
 * is ever added to the legacy API.
 */
export interface LegacyTemplate {
  id: number;
  name: string;
  balanceType: LegacyBalanceType;
  amount: number;
  category: number;    // FK to Category.id
  deleted: boolean;
}

// =============================================================================
// LIMIT
// =============================================================================

/**
 * The legacy API has no dedicated /api/limit endpoint.
 * Limits are stored inline on the Category model as `limits` (amount) and
 * `limitsDate` (expiry date). The only limit-related endpoint is
 * PUT /api/category/limit which *removes* a limit (sets it to null).
 *
 * This type represents the limit data that the transformer must extract
 * from LegacyCategory.limits / LegacyCategory.limitsDate for each category
 * where `limits !== null`, and map to a Budget Wise Limit entity.
 *
 *   NOT a direct API response — derived from LegacyCategory during transform.
 */
export interface LegacyLimit {
  categoryId: number;          // source: LegacyCategory.id
  categoryName: string;        // source: LegacyCategory.name
  balanceType: LegacyBalanceType; // source: LegacyCategory.balanceType
  amount: number;              // source: LegacyCategory.limits
  limitsDate: string;          // source: LegacyCategory.limitsDate (ISO date)
  accountId: number;           // source: LegacyCategory.account
}

// =============================================================================
// SAVING GOAL
// =============================================================================

/**
 * GET /api/saving-goal?category_id=X
 * Note: saving goals are scoped by category_id, not account_id.
 * Field names verified against live test API (account 177).
 * Note: live API returns `dueDate` (not `date`) and includes `account`.
 */
export interface LegacySavingGoal {
  id: number;
  name: string;
  created_at: string;              // ISO date e.g. "2026-04-01"
  dueDate: string;                 // ISO date (target/deadline date)
  amount: number;                  // target amount
  monthly_amount: number;          // monthly contribution
  isopen: boolean;                 // true = goal not yet reached
  deleted: boolean;
  category: number;
  account?: number;                // present in live API response
  version?: string;
}

// =============================================================================
// TYPE ALIASES — ticket-facing names mapping to real API shapes
// =============================================================================

/** Alias: LegacyBalance is the raw API type; LegacyTransaction is the ticket-facing name */
export type LegacyTransaction = LegacyBalance;

/**
 * Aggregated result of all fetch calls, keyed by entity type.
 *
 * `limits` is derived from categories (LegacyCategory.limits / limitsDate)
 * by the client — there is no dedicated /api/limit endpoint in the legacy API.
 *
 * NOTE — templates: the legacy API has no template concept; Budget Wise
 * templates will be empty after migration (known data gap).
 */
export interface LegacyUserData {
  accounts: LegacyAccount[];
  accesses: LegacyAccess[];
  balances: LegacyBalance[];
  categories: LegacyCategory[];
  recurings: LegacyRecuring[];
  savingGoals: LegacySavingGoal[];
  /** Limits extracted inline from categories where LegacyCategory.limits !== null */
  limits: LegacyLimit[];
}
