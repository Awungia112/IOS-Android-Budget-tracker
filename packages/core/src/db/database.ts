/**
 * Dexie Database Definition
 *
 * Professional IndexedDB management with:
 * - Type-safe table definitions
 * - Proper indexing for efficient queries
 * - Built-in migration system
 *
 * @see https://dexie.org/docs/Tutorial/Design
 */
import Dexie, { type Table } from 'dexie';
import type { Account } from '../types/index.js';
import type { AccountSyncMetadata, RemoteReplayRecord } from '../types/index.js';
import type { Transaction } from '../types/index.js';
import type { Category } from '../types/index.js';
import type { Limit } from '../types/index.js';
import type { Template } from '../types/index.js';
import type { RecurringItem } from '../types/index.js';
import type { SavingsGoal } from '../types/index.js';
import type { ChangeRecord, Command } from '../commands/types.js';
import type { AsymmetricEnvelope } from '../crypto/envelope.js';
import type { UploadQueueEntry } from '../changelog/upload-queue.js';
import { DEFAULT_ACCOUNT, DEFAULT_CATEGORIES } from './config.js';
import {
  CATEGORY_ID_TO_ICON,
  CATEGORY_NAME_TO_KEY
} from '../constants/index.js';
import { generateUUID } from '../utils/uuid.js';

export interface PendingKeyRotation {
  id: string;
  localAccountId: string;
  serverAccountId: string;
  userIdToRemove: string;
  newEpoch: number;
  wrappedKeys: Array<{ userId: string; wrappedKey: AsymmetricEnvelope }>;
  createdAt: number; // timestamp
}

export interface PendingKeyDelivery {
  id: string;
  serverAccountId: string;
  recipientUserId: string;
  recipientPublicKey: string;
  wrappedKey: AsymmetricEnvelope;
  epoch: number;
  createdAt: number; // timestamp
}

/**
 * BudgetWise Database
 *
 * Extends Dexie to provide typed tables for all application entities.
 * Automatically handles schema migrations and indexing.
 */
export class BudgetWiseDB extends Dexie {
  // Table declarations with types
  accounts!: Table<Account, string>;
  transactions!: Table<Transaction, string>;
  categories!: Table<Category, string>;
  limits!: Table<Limit, string>;
  templates!: Table<Template, string>;
  recurringItems!: Table<RecurringItem, string>;
  savingsGoals!: Table<SavingsGoal, string>;
  changeRecords!: Table<ChangeRecord, string>;
  accountSyncMetadata!: Table<AccountSyncMetadata, string>;
  uploadQueue!: Table<UploadQueueEntry, string>;
  pendingKeyRotations!: Table<PendingKeyRotation, string>;
  pendingKeyDeliveries!: Table<PendingKeyDelivery, string>;
  remoteReplayRecords!: Table<RemoteReplayRecord, string>;

  constructor() {
    super('BudgetWiseDB');

    /**
     * Version 1: Initial schema
     *
     * Index notation:
     * - 'id' = primary key
     * - 'accountId' = single-field index for filtering
     * - '[accountId+date]' = compound index for range queries
     *
     * Note: Dexie automatically detects and uses existing IndexedDB
     * databases with the same name, preserving user data.
     */
    this.version(1).stores({
      // Primary key only - accounts are few
      accounts: 'id',

      // Heavily indexed for filtering and date range queries
      transactions: 'id, accountId, date, category, [accountId+date]',

      // Indexed for type filtering (income/expense)
      categories: 'id, accountId, type, [accountId+type]',

      // Indexed for category-based lookups
      limits: 'id, accountId, categoryId',

      // Simple accountId index
      templates: 'id, accountId',

      // Indexed for frequency-based queries
      recurringItems: 'id, accountId, frequency',

      // Indexed for deadline sorting
      savingsGoals: 'id, accountId, deadline'
    });

    /**
     * Version 2: Category icon migration
     *
     * Migrates existing categories to include icons and translation keys.
     * This matches the migration logic from the old DatabaseConnection.
     */
    this.version(2).stores({}).upgrade(async tx => {
      // Migrate categories with missing icons or legacy names
      await tx.table('categories').toCollection().modify(cat => {
        // Add icon if missing
        if (!cat.icon && CATEGORY_ID_TO_ICON[cat.id]) {
          cat.icon = CATEGORY_ID_TO_ICON[cat.id];
        }

        // Convert legacy name to translation key
        if (!cat.name.startsWith('category_') && CATEGORY_NAME_TO_KEY[cat.name]) {
          cat.name = CATEGORY_NAME_TO_KEY[cat.name];
        }
      });

      console.log('Dexie: Category migration completed');
    });

    /**
     * Version 3: Expand default categories
     *
     * Adds new default categories to all existing accounts to match
     * the old app's category set. Uses name+type composite key to
     * avoid duplicating categories that already exist.
     */
    const V3_NEW_CATEGORIES = [
      { name: 'category_holiday_job', type: 'income' as const, isDefault: true },
      { name: 'category_transfer', type: 'income' as const, isDefault: true },
      { name: 'category_food', type: 'expense' as const, isDefault: true },
      { name: 'category_shopping', type: 'expense' as const, isDefault: true },
      { name: 'category_books', type: 'expense' as const, isDefault: true },
      { name: 'category_gift', type: 'expense' as const, isDefault: true },
      { name: 'category_office', type: 'expense' as const, isDefault: true },
      { name: 'category_internet', type: 'expense' as const, isDefault: true },
      { name: 'category_clothing', type: 'expense' as const, isDefault: true },
      { name: 'category_hobby', type: 'expense' as const, isDefault: true },
      { name: 'category_going_out', type: 'expense' as const, isDefault: true },
      { name: 'category_bus', type: 'expense' as const, isDefault: true },
      { name: 'category_leisure', type: 'expense' as const, isDefault: true },
      { name: 'category_travel', type: 'expense' as const, isDefault: true },
      { name: 'category_vacation', type: 'expense' as const, isDefault: true },
      { name: 'category_utilities', type: 'expense' as const, isDefault: true },
      // Youth-focused categories
      { name: 'category_tutoring', type: 'income' as const, isDefault: true },
      { name: 'category_selling_online', type: 'income' as const, isDefault: true },
      { name: 'category_babysitting', type: 'income' as const, isDefault: true },
      { name: 'category_scholarship', type: 'income' as const, isDefault: true },
      { name: 'category_cashback', type: 'income' as const, isDefault: true },
      { name: 'category_subscriptions', type: 'expense' as const, isDefault: true },
      { name: 'category_personal_care', type: 'expense' as const, isDefault: true },
      { name: 'category_health', type: 'expense' as const, isDefault: true },
      { name: 'category_education', type: 'expense' as const, isDefault: true },
      { name: 'category_sports', type: 'expense' as const, isDefault: true },
    ];

    this.version(3).stores({}).upgrade(async tx => {
      const categoriesTable = tx.table('categories');
      const accountsTable = tx.table('accounts');

      const allAccounts = await accountsTable.toArray();

      for (const account of allAccounts) {
        const existingCategories = await categoriesTable
          .where('accountId')
          .equals(account.id)
          .toArray();

        const existingKeys = new Set(
          existingCategories.map((c: { name: string; type: string }) => `${c.name}|${c.type}`)
        );

        const toAdd = [];
        for (const newCat of V3_NEW_CATEGORIES) {
          if (!existingKeys.has(`${newCat.name}|${newCat.type}`)) {
            toAdd.push({
              id: generateUUID(),
              name: newCat.name,
              type: newCat.type,
              isDefault: newCat.isDefault,
              accountId: account.id,
            });
          }
        }

        if (toAdd.length > 0) {
          await categoriesTable.bulkAdd(toAdd);
        }
      }

      console.log('Dexie: v3 migration - expanded default categories');
    });

    /**
     * Version 4: Add changeRecords table for Command-Based Change Capture
     *
     * Stores every write operation as a ChangeRecord for Phase 2 sync.
     * Purely additive — no data migration needed.
     */
    this.version(4).stores({
      changeRecords: 'id, timestamp, accountId'
    });

    /**
     * Version 5: Add online account sync metadata.
     *
     * Maps local app account IDs to server account UUIDs and key epochs.
     * Plaintext account keys remain outside IndexedDB in native secure storage.
     */
    this.version(5).stores({
      accountSyncMetadata: 'localAccountId, serverAccountId, keyEpoch'
    });

    /**
     * Version 6: Add uploadQueue table for encrypted pending-upload entries.
     *
     * Stores SymmetricEnvelope + change_uuid so encrypted records survive
     * app restarts without ever exposing plaintext to the upload path.
     */
    this.version(6).stores({
      uploadQueue: 'change_uuid, enqueued_at'
    });

    /**
     * Version 7: Add localAccountId to uploadQueue for account-scoped syncing.
     */
    this.version(7).stores({
      uploadQueue: 'change_uuid, enqueued_at, localAccountId'
    }).upgrade(async tx => {
      const uploadQueue = tx.table('uploadQueue');
      const changeRecords = tx.table('changeRecords');

      // Backfill localAccountId for orphaned records created before v7 (OA-168)
      // Dexie .modify() supports async callbacks since v3
      await uploadQueue.toCollection().modify(async entry => {
        if (!entry.localAccountId) {
          const record = await changeRecords.get(entry.change_uuid);
          // Prior to multi-account, everything was 'main-account'
          entry.localAccountId = record ? record.accountId : DEFAULT_ACCOUNT.id;
        }
      });
    });

    /**
     * Version 8: Add pendingKeyRotations table for idempotent member removal + key upload.
     *
     * Stores wrapped keys and epoch info locally before attempting server upload.
     * If upload fails, sync can retry without losing the rotation state.
     * This makes the operation recoverable from network failures.
     */
    this.version(8).stores({
      pendingKeyRotations: 'id, localAccountId, createdAt'
    });

    /**
     * Version 9: Add remote replay markers for recovered account restore.
     *
     * These markers make new-device replay idempotent even when a restore is
     * retried after a partial failure.
     */
    this.version(9).stores({
      remoteReplayRecords: 'changeUuid, serverAccountId, sequence, [serverAccountId+sequence]'
    });

    /**
     * Version 10: Add pendingKeyDeliveries table for invite accept key delivery.
     *
     * Stores pending account key deliveries when owner is offline.
     * Used to retry key delivery when recipient accepts an invite while owner's device
     * cannot reach the server.
     */
    this.version(10).stores({
      pendingKeyDeliveries: 'id, serverAccountId, recipientUserId, createdAt'
    });

    /**
     * Version 11: Add needsOnlinePush field to Account for legacy migration.
     *
     * This optional field indicates whether a migrated account needs to be
     * pushed to the online server. No index needed as it's a one-time migration flag.
     */
    this.version(11).stores({}).upgrade(async () => {
      // No-op migration - the field is optional and Dexie allows it without schema changes.
      // This version bump documents the schema change for future discoverability.
      console.log('Dexie: Schema version 11 - needsOnlinePush field added to Account');
    });

    /**
     * Version 12: Add localAccountId index to remoteReplayRecords.
     *
     * Required by deleteAccountWithCascade() and deleteAllOnlineAccounts()
     * which query this table by localAccountId during cleanup.
     */
    this.version(12).stores({
      remoteReplayRecords: 'changeUuid, localAccountId, serverAccountId, sequence, [serverAccountId+sequence]'
    });

    /**
     * Version 13: One-time cleanup of empty default "Personal" account for users
     * who completed migration before the fix was deployed.
     *
     * Context: Ticket #449 - After local migration, some users ended up with both
     * their migrated account AND an empty default "Personal" account. The fix
     * prevents this for new migrations, but existing users need cleanup.
     *
     * This migration:
     * 1. Checks if multiple accounts exist (indicating migration happened)
     * 2. Checks if the default "Personal" account exists
     * 3. Checks if it has zero transactions (truly empty)
     * 4. Deletes it if all conditions are met
     *
     * Safe to run multiple times - only acts if conditions are met.
     */
    this.version(13).stores({}).upgrade(async (tx) => {
      const accountsTable = tx.table<Account, string>('accounts');
      const transactionsTable = tx.table<Transaction, string>('transactions');

      // Check if we have multiple accounts (migration happened)
      const allAccounts = await accountsTable.toArray();

      if (allAccounts.length > 1) {
        // Check if default account exists
        const defaultAccount = await accountsTable.get(DEFAULT_ACCOUNT.id);

        if (defaultAccount) {
          // Check if it's truly empty
          const transactionCount = await transactionsTable
            .where('accountId')
            .equals(DEFAULT_ACCOUNT.id)
            .count();

          if (transactionCount === 0) {
            console.log('[DB Migration v13] Removing empty default account for existing user');
            await accountsTable.delete(DEFAULT_ACCOUNT.id);

            // Also clean up any default categories that belong only to this account
            const categoriesTable = tx.table<Category, string>('categories');
            await categoriesTable
              .where('accountId')
              .equals(DEFAULT_ACCOUNT.id)
              .delete();

            console.log('[DB Migration v13] Successfully removed empty default account and its categories');
          } else {
            console.log('[DB Migration v13] Default account has transactions, keeping it');
          }
        } else {
          console.log('[DB Migration v13] No default account found, no cleanup needed');
        }
      } else {
        console.log('[DB Migration v13] Single account setup, no cleanup needed');
      }
    });

    /**
     * Version 14: Add recurringItemId index to transactions.
     *
     * Restores the explicit FK link between a transaction and the recurring item
     * that generated it (mirrors the old app's `recuring` column). This enables
     * reliable duplicate detection regardless of amount overrides.
     */
    this.version(14).stores({
      transactions: 'id, accountId, date, category, recurringItemId, [accountId+date]'
    });



    // Hook: Populate default data on fresh install
    this.on('populate', () => {
      console.log('Dexie: Fresh install detected, populating default data');
      this.accounts.add(DEFAULT_ACCOUNT as Account);
      this.categories.bulkAdd(DEFAULT_CATEGORIES.map(category => ({ ...category })));
    });

    // Hook: Log when database is ready
    this.on('ready', () => {
      console.log('Dexie: Database ready');
    });
  }

  /**
   * Reset database - deletes all data and repopulates defaults
   *
   * Use with caution - this erases all user data!
   */
  async resetDatabase(): Promise<void> {
    console.log('Dexie: Resetting database...');

    // Delete all data from all tables except changeRecords (sync audit log)
    await this.transaction('rw', this.tables, async () => {
      for (const table of this.tables) {
        if (table.name === 'changeRecords') continue;
        await table.clear();
      }
    });

    // Repopulate defaults
    await this.accounts.add(DEFAULT_ACCOUNT as Account);
    await this.categories.bulkAdd(DEFAULT_CATEGORIES.map(category => ({ ...category })));

    console.log('Dexie: Database reset complete');
  }

  /**
   * Initialize database with default data if empty
   *
   * Safe to call multiple times - only populates if accounts table is empty.
   */
  async initializeDefaultData(): Promise<void> {
    const defaultExists = await this.accounts.get(DEFAULT_ACCOUNT.id);

    if (!defaultExists) {
      // Check if there are any other accounts in the database
      // If there are, it means data was imported (e.g., from migration)
      // and we should NOT create the default "Personal" account
      const accountCount = await this.accounts.count();

      if (accountCount > 0) {
        console.log('Dexie: Default account missing but other accounts exist (likely post-migration), skipping default account creation');
        return;
      }

      console.log('Dexie: Default account missing, seeding Personal account');
      await this.accounts.add(DEFAULT_ACCOUNT as Account);
      const categoryCount = await this.categories
        .where('accountId')
        .equals(DEFAULT_ACCOUNT.id)
        .count();
      if (categoryCount === 0) {
        await this.categories.bulkAdd(DEFAULT_CATEGORIES.map(category => ({ ...category })));
      }
    }
  }
}

/**
 * Singleton database instance
 *
 * Use this for all database operations throughout the application.
 */
export const db = new BudgetWiseDB();
