import { BaseRepository } from './base.repository.js';
import { db } from '../db/index.js';
import type { Account } from '../types/index.js';

/**
 * Repository for Account entities
 *
 * Accounts don't have an accountId field (they ARE the account),
 * so this repository uses simple CRUD operations.
 */
export class AccountRepository extends BaseRepository<Account> {
  constructor() {
    super(db.accounts);
  }

  /**
   * Get account by name
   */
  async getByName(name: string): Promise<Account | undefined> {
    return db.accounts.where('name').equals(name).first();
  }

  /**
   * Check if an account name already exists
   * @public
   */
  async existsByName(name: string): Promise<boolean> {
    const account = await this.getByName(name);
    return account !== undefined;
  }

  /**
   * Check if an account name already exists for a different account (case-insensitive, trimmed)
   * @param name - The account name to check
   * @param excludeAccountId - Optional account ID to exclude from the check (for rename validation)
   * @returns true if a duplicate name exists, false otherwise
   * @public
   */
  async hasDuplicateName(name: string, excludeAccountId?: string): Promise<boolean> {
    const normalizedName = name.trim().toLowerCase();
    const accounts = await this.getAll();
    
    return accounts.some(account => {
      // Skip the account being updated (for rename operations)
      if (excludeAccountId && account.id === excludeAccountId) {
        return false;
      }
      // Case-insensitive, trimmed comparison
      return account.name.trim().toLowerCase() === normalizedName;
    });
  }

  /**
   * Delete an account and all associated data atomically
   *
   * Uses a Dexie transaction to ensure all related data is deleted
   * in a single atomic operation. If any part fails, nothing is deleted.
   * @public
   */
  async deleteAccountWithCascade(accountId: string): Promise<void> {
    await db.transaction('rw', [
      db.transactions,
      db.categories,
      db.limits,
      db.templates,
      db.recurringItems,
      db.savingsGoals,
      db.changeRecords,
      db.accountSyncMetadata,
      db.uploadQueue,
      db.pendingKeyRotations,
      db.remoteReplayRecords,
      db.accounts
    ], async () => {
      await db.transactions.where('accountId').equals(accountId).delete();
      await db.categories.where('accountId').equals(accountId).delete();
      await db.limits.where('accountId').equals(accountId).delete();
      await db.templates.where('accountId').equals(accountId).delete();
      await db.recurringItems.where('accountId').equals(accountId).delete();
      await db.savingsGoals.where('accountId').equals(accountId).delete();
      await db.changeRecords.where('accountId').equals(accountId).delete();
      await db.accountSyncMetadata.delete(accountId);
      await db.uploadQueue.where('localAccountId').equals(accountId).delete();
      await db.pendingKeyRotations.where('localAccountId').equals(accountId).delete();
      await db.remoteReplayRecords.where('localAccountId').equals(accountId).delete();
      await db.accounts.delete(accountId);
    });
  }

  /**
   * Find all account IDs that have online/sync metadata.
   */
  async getOnlineAccountIds(): Promise<string[]> {
    const metadata = await db.accountSyncMetadata.toArray();
    return metadata.map(m => m.localAccountId);
  }

  /**
   * Get summaries of online accounts (name + server mapping) for backup
   * before deletion on logout.
   */
  async getOnlineAccountSummaries(): Promise<Array<{ localAccountId: string; name: string; initials: string; serverAccountId: string }>> {
    const metadata = await db.accountSyncMetadata.toArray();
    if (metadata.length === 0) return [];
    const accounts = await db.accounts.bulkGet(metadata.map(m => m.localAccountId));
    const onlineAccounts = accounts.filter(Boolean);
    return metadata.map((m) => {
      const account = accounts.find(a => a?.id === m.localAccountId);
      return {
        localAccountId: m.localAccountId,
        name: account?.name ?? 'Unknown',
        initials: account?.initials ?? 'ON',
        serverAccountId: m.serverAccountId,
      };
    });
  }

  /**
   * Delete all online (synced) accounts and their data atomically.
   * Local-only accounts are preserved.
   */
  async deleteAllOnlineAccounts(): Promise<string[]> {
    const onlineIds = await this.getOnlineAccountIds();
    if (onlineIds.length === 0) return [];

    await db.transaction('rw', [
      db.transactions,
      db.categories,
      db.limits,
      db.templates,
      db.recurringItems,
      db.savingsGoals,
      db.changeRecords,
      db.accountSyncMetadata,
      db.uploadQueue,
      db.pendingKeyRotations,
      db.remoteReplayRecords,
      db.accounts
    ], async () => {
      for (const accountId of onlineIds) {
        await db.transactions.where('accountId').equals(accountId).delete();
        await db.categories.where('accountId').equals(accountId).delete();
        await db.limits.where('accountId').equals(accountId).delete();
        await db.templates.where('accountId').equals(accountId).delete();
        await db.recurringItems.where('accountId').equals(accountId).delete();
        await db.savingsGoals.where('accountId').equals(accountId).delete();
        await db.changeRecords.where('accountId').equals(accountId).delete();
        await db.accountSyncMetadata.delete(accountId);
        await db.uploadQueue.where('localAccountId').equals(accountId).delete();
        await db.pendingKeyRotations.where('localAccountId').equals(accountId).delete();
        await db.remoteReplayRecords.where('localAccountId').equals(accountId).delete();
        await db.accounts.delete(accountId);
      }
    });

    return onlineIds;
  }
}
