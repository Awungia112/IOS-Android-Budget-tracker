import type {
  Account,
  CreateAccount,
  Transaction,
  CreateTransaction,
  Category,
  CreateCategory,
  Limit,
  CreateLimit,
  Template,
  CreateTemplate,
  RecurringItem,
  CreateRecurringItem,
  SavingsGoal,
  CreateSavingsGoal,
  ExportData,
} from '../types/index.js';

// ---------------------------------------------------------------------------
// CommandType — string literal union of all 24 command types
// ---------------------------------------------------------------------------

/**
 * Command types for write operations.
 * 
 * Each command represents a write operation that modifies the database state.
 * Commands are logged to the ChangeLog for audit trail and potential sync.
 */
export type CommandType =
  | 'CREATE_ACCOUNT'
  | 'UPDATE_ACCOUNT'
  | 'DELETE_ACCOUNT'
  | 'CREATE_TRANSACTION'
  | 'UPDATE_TRANSACTION'
  | 'DELETE_TRANSACTION'
  | 'CREATE_CATEGORY'
  | 'UPDATE_CATEGORY'
  | 'BULK_CREATE_CATEGORIES'
  | 'DELETE_CATEGORY'
  | 'CREATE_LIMIT'
  | 'UPDATE_LIMIT'
  | 'DELETE_LIMIT'
  | 'CREATE_TEMPLATE'
  | 'UPDATE_TEMPLATE'
  | 'DELETE_TEMPLATE'
  | 'CREATE_RECURRING'
  | 'UPDATE_RECURRING'
  | 'DELETE_RECURRING'
  | 'CREATE_SAVINGS_GOAL'
  | 'UPDATE_SAVINGS_GOAL'
  | 'DELETE_SAVINGS_GOAL'
  | 'IMPORT_DATA'
  | 'RESET_DATABASE';

/**
 * Command type constants for convenient access.
 * Provides enum-like syntax while maintaining string literal type safety.
 * 
 * @example
 * // Both approaches work:
 * const cmd1 = { type: 'CREATE_ACCOUNT', ... };
 * const cmd2 = { type: COMMAND_TYPES.CREATE_ACCOUNT, ... };
 */
export const COMMAND_TYPES = {
  CREATE_ACCOUNT: 'CREATE_ACCOUNT',
  UPDATE_ACCOUNT: 'UPDATE_ACCOUNT',
  DELETE_ACCOUNT: 'DELETE_ACCOUNT',
  CREATE_TRANSACTION: 'CREATE_TRANSACTION',
  UPDATE_TRANSACTION: 'UPDATE_TRANSACTION',
  DELETE_TRANSACTION: 'DELETE_TRANSACTION',
  CREATE_CATEGORY: 'CREATE_CATEGORY',
  UPDATE_CATEGORY: 'UPDATE_CATEGORY',
  BULK_CREATE_CATEGORIES: 'BULK_CREATE_CATEGORIES',
  DELETE_CATEGORY: 'DELETE_CATEGORY',
  CREATE_LIMIT: 'CREATE_LIMIT',
  UPDATE_LIMIT: 'UPDATE_LIMIT',
  DELETE_LIMIT: 'DELETE_LIMIT',
  CREATE_TEMPLATE: 'CREATE_TEMPLATE',
  UPDATE_TEMPLATE: 'UPDATE_TEMPLATE',
  DELETE_TEMPLATE: 'DELETE_TEMPLATE',
  CREATE_RECURRING: 'CREATE_RECURRING',
  UPDATE_RECURRING: 'UPDATE_RECURRING',
  DELETE_RECURRING: 'DELETE_RECURRING',
  CREATE_SAVINGS_GOAL: 'CREATE_SAVINGS_GOAL',
  UPDATE_SAVINGS_GOAL: 'UPDATE_SAVINGS_GOAL',
  DELETE_SAVINGS_GOAL: 'DELETE_SAVINGS_GOAL',
  IMPORT_DATA: 'IMPORT_DATA',
  RESET_DATABASE: 'RESET_DATABASE',
} as const;

// ---------------------------------------------------------------------------
// Account commands
// ---------------------------------------------------------------------------

export interface CreateAccountCommand {
  type: 'CREATE_ACCOUNT';
  payload: CreateAccount;
  timestamp?: string;
  sequence?: number;
}

export interface UpdateAccountCommand {
  type: 'UPDATE_ACCOUNT';
  payload: Account;
  timestamp?: string;
  sequence?: number;
}

export interface DeleteAccountCommand {
  type: 'DELETE_ACCOUNT';
  payload: { id: string };
  timestamp?: string;
  sequence?: number;
}

// ---------------------------------------------------------------------------
// Transaction commands
// ---------------------------------------------------------------------------

export interface CreateTransactionCommand {
  type: 'CREATE_TRANSACTION';
  payload: CreateTransaction;
  timestamp?: string;
  sequence?: number;
}

export interface UpdateTransactionCommand {
  type: 'UPDATE_TRANSACTION';
  payload: Transaction;
  timestamp?: string;
  sequence?: number;
}

export interface DeleteTransactionCommand {
  type: 'DELETE_TRANSACTION';
  payload: { id: string; transaction?: Transaction };
  timestamp?: string;
  sequence?: number;
}

// ---------------------------------------------------------------------------
// Category commands
// ---------------------------------------------------------------------------

export interface CreateCategoryCommand {
  type: 'CREATE_CATEGORY';
  payload: CreateCategory;
  timestamp?: string;
  sequence?: number;
}

export interface BulkCreateCategoriesCommand {
  type: 'BULK_CREATE_CATEGORIES';
  payload: { categories: Category[] };
  timestamp?: string;
  sequence?: number;
}

export interface DeleteCategoryCommand {
  type: 'DELETE_CATEGORY';
  payload: { id: string };
  timestamp?: string;
  sequence?: number;
}

export interface UpdateCategoryCommand {
  type: 'UPDATE_CATEGORY';
  payload: Category;
  timestamp?: string;
  sequence?: number;
}

// ---------------------------------------------------------------------------
// Limit commands
// ---------------------------------------------------------------------------

export interface CreateLimitCommand {
  type: 'CREATE_LIMIT';
  payload: CreateLimit;
  timestamp?: string;
  sequence?: number;
}

export interface UpdateLimitCommand {
  type: 'UPDATE_LIMIT';
  payload: Limit;
  timestamp?: string;
  sequence?: number;
}

export interface DeleteLimitCommand {
  type: 'DELETE_LIMIT';
  payload: { id: string };
  timestamp?: string;
  sequence?: number;
}

// ---------------------------------------------------------------------------
// Template commands
// ---------------------------------------------------------------------------

export interface CreateTemplateCommand {
  type: 'CREATE_TEMPLATE';
  payload: CreateTemplate;
  timestamp?: string;
  sequence?: number;
}

export interface UpdateTemplateCommand {
  type: 'UPDATE_TEMPLATE';
  payload: Template;
  timestamp?: string;
  sequence?: number;
}

export interface DeleteTemplateCommand {
  type: 'DELETE_TEMPLATE';
  payload: { id: string };
  timestamp?: string;
  sequence?: number;
}

// ---------------------------------------------------------------------------
// RecurringItem commands
// ---------------------------------------------------------------------------

export interface CreateRecurringCommand {
  type: 'CREATE_RECURRING';
  payload: CreateRecurringItem;
  timestamp?: string;
  sequence?: number;
}

export interface UpdateRecurringCommand {
  type: 'UPDATE_RECURRING';
  payload: RecurringItem;
  timestamp?: string;
  sequence?: number;
}

export interface DeleteRecurringCommand {
  type: 'DELETE_RECURRING';
  /** Removes the item and every transaction linked to it, booked ones included. */
  payload: { id: string; accountId?: string };
  timestamp?: string;
  sequence?: number;
}

// ---------------------------------------------------------------------------
// SavingsGoal commands
// ---------------------------------------------------------------------------

export interface CreateSavingsGoalCommand {
  type: 'CREATE_SAVINGS_GOAL';
  payload: CreateSavingsGoal;
  timestamp?: string;
  sequence?: number;
}

export interface UpdateSavingsGoalCommand {
  type: 'UPDATE_SAVINGS_GOAL';
  payload: SavingsGoal;
  timestamp?: string;
  sequence?: number;
}

export interface DeleteSavingsGoalCommand {
  type: 'DELETE_SAVINGS_GOAL';
  payload: { id: string };
  timestamp?: string;
  sequence?: number;
}

// ---------------------------------------------------------------------------
// Bulk / special commands
// ---------------------------------------------------------------------------

export interface ImportDataCommand {
  type: 'IMPORT_DATA';
  payload: ExportData;
  timestamp?: string;
  sequence?: number;
}

export interface ResetDatabaseCommand {
  type: 'RESET_DATABASE';
  payload: Record<string, never>;
  timestamp?: string;
  sequence?: number;
}

// ---------------------------------------------------------------------------
// Command — discriminated union of all 24 command types
// ---------------------------------------------------------------------------

/**
 * Base command union with optional timestamp (used internally for type construction)
 */
type BaseCommand =
  | CreateAccountCommand
  | UpdateAccountCommand
  | DeleteAccountCommand
  | CreateTransactionCommand
  | UpdateTransactionCommand
  | DeleteTransactionCommand
  | CreateCategoryCommand
  | UpdateCategoryCommand
  | BulkCreateCategoriesCommand
  | DeleteCategoryCommand
  | CreateLimitCommand
  | UpdateLimitCommand
  | DeleteLimitCommand
  | CreateTemplateCommand
  | UpdateTemplateCommand
  | DeleteTemplateCommand
  | CreateRecurringCommand
  | UpdateRecurringCommand
  | DeleteRecurringCommand
  | CreateSavingsGoalCommand
  | UpdateSavingsGoalCommand
  | DeleteSavingsGoalCommand
  | ImportDataCommand
  | ResetDatabaseCommand;

/**
 * Union type of all commands with required timestamp and sequence.
 * 
 * Each command includes:
 * - type: The command type discriminator
 * - payload: Strongly-typed data specific to the command
 * - timestamp: ISO 8601 timestamp when the command was created (REQUIRED)
 * - sequence: Auto-assigned by ChangeLog.append() for ordering
 * 
 * Note: timestamp is required on Command because it's needed for Dexie indexing
 * in ChangeRecord. CommandInput (below) keeps timestamp optional for convenience.
 */
export type Command = BaseCommand & { timestamp: string; sequence: number };

// ---------------------------------------------------------------------------
// CommandInput — for creating commands before sequence assignment
// ---------------------------------------------------------------------------

/**
 * Distributive Omit utility type.
 * 
 * Unlike the built-in Omit, this version distributes over union types,
 * preserving the discriminated union structure. This ensures type safety
 * when omitting fields from Command union types.
 * 
 * Without this, Omit<Command, 'sequence'> would collapse the discriminated
 * union into a single type where 'type' and 'payload' are both unions,
 * breaking the type→payload relationship and allowing mismatched combinations.
 */
type DistributiveOmit<T, K extends keyof any> = T extends any ? Omit<T, K> : never;

/**
 * Command input structure (before sequence and timestamp assignment).
 * 
 * Use this type when creating commands to pass to ChangeLog.append().
 * - sequence: Will be auto-assigned by ChangeLog (omitted from input)
 * - timestamp: Optional, will be auto-generated if not provided
 * 
 * Uses DistributiveOmit to preserve the discriminated union, ensuring
 * type safety: TypeScript will error if you pass a mismatched type/payload.
 */
export type CommandInput = DistributiveOmit<Command, 'sequence' | 'timestamp'> & {
  timestamp?: string;
};

// ---------------------------------------------------------------------------
// ChangeRecord — persisted to IndexedDB for Phase 2 sync
// ---------------------------------------------------------------------------

/**
 * ChangeRecord represents a persisted command in IndexedDB.
 * 
 * Used in Task 2 for IndexedDB persistence via Dexie changeRecords table.
 * 
 * Fields:
 * - id: Unique identifier for the record
 * - command: The full command with sequence number
 * - timestamp: ISO 8601 timestamp (REQUIRED for Dexie indexing)
 * - accountId: Account this command belongs to (for multi-account sync)
 * - synced: Whether this record has been synced to the server
 * 
 * Note: timestamp is duplicated from command.timestamp for efficient Dexie
 * indexing. The Dexie table schema is: 'id, timestamp, accountId, synced'
 */
export interface ChangeRecord {
  id: string;
  command: Command;
  timestamp: string;  // Required for Dexie index
  accountId: string;
  synced: boolean;
}
