import { BaseRepository } from '../repositories/base.repository.js';
import { db } from '../db/database.js';
import type { ChangeRecord } from '../commands/types.js';

/**
 * Repository for ChangeRecord persistence in IndexedDB.
 *
 * Used internally by ChangeLog — not intended for direct use by application code.
 * Supports both sequence-based and synced-flag filtering for flexible sync strategies.
 */
export class ChangeLogRepository extends BaseRepository<ChangeRecord> {
  constructor() {
    super(db.changeRecords);
  }

  /**
   * Get all unsynced change records, ordered by sequence ascending.
   *
   * Uses filter() instead of where('synced') because IndexedDB does not
   * support boolean values as index keys. The table is kept bounded by
   * clearSynced() which purges already-synced records after each sync cycle.
   */
  async getUnsynced(): Promise<ChangeRecord[]> {
    const records = await db.changeRecords
      .filter(record => record.synced === false)
      .toArray();
    return records.sort((a, b) => a.command.sequence - b.command.sequence);
  }

  /**
   * Get unsynced change records for a specific account
   */
  async getUnsyncedByAccountId(accountId: string): Promise<ChangeRecord[]> {
    const accountRecords = await this.getByAccountId(accountId);
    return accountRecords.filter(record => !record.synced);
  }

  /**
   * Get change records after a specific timestamp
   * @deprecated Use getAfterSequence for reliable cursor-based filtering
   */
  async getAfter(timestamp: string): Promise<ChangeRecord[]> {
    return db.changeRecords.where('timestamp').above(timestamp).toArray();
  }

  /**
   * Get change records after a specific sequence number
   * This is the recommended method for cursor-based sync operations
   */
  async getAfterSequence(sequence: number): Promise<ChangeRecord[]> {
    const allRecords = await db.changeRecords.toArray();
    return allRecords
      .filter(record => record.command.sequence > sequence)
      .sort((a, b) => a.command.sequence - b.command.sequence);
  }

  /**
   * Get the highest sequence number in the log
   */
  async getLastSequence(): Promise<number> {
    const allRecords = await db.changeRecords.toArray();
    if (allRecords.length === 0) {
      return 0;
    }
    
    const sequences = allRecords.map(record => record.command.sequence);
    return Math.max(...sequences);
  }

  /**
   * Mark a single change record as synced.
   */
  async markSynced(id: string): Promise<void> {
    await db.changeRecords.update(id, { synced: true });
  }

  /**
   * Mark multiple change records as synced
   */
  async markManySynced(ids: string[]): Promise<void> {
    await db.transaction('rw', db.changeRecords, async () => {
      for (const id of ids) {
        await db.changeRecords.update(id, { synced: true });
      }
    });
  }

  /**
   * Delete all synced records to keep the table bounded.
   *
   * Called after a successful sync cycle to prevent unbounded growth.
   * Returns the number of records deleted.
   */
  async clearSynced(): Promise<number> {
    return db.changeRecords
      .filter(record => record.synced === true)
      .delete();
  }

  /**
   * Clear synced records for a specific account
   */
  async clearSyncedByAccountId(accountId: string): Promise<number> {
    const accountRecords = await this.getByAccountId(accountId);
    const syncedIds = accountRecords
      .filter(record => record.synced)
      .map(record => record.id);
    
    if (syncedIds.length > 0) {
      await db.changeRecords.bulkDelete(syncedIds);
    }
    
    return syncedIds.length;
  }

  /**
   * Delete change records after a specific sequence number
   * Used for transaction rollback
   */
  async deleteAfterSequence(sequence: number): Promise<number> {
    const allRecords = await db.changeRecords.toArray();
    const toDelete = allRecords.filter(record => record.command.sequence > sequence);
    const idsToDelete = toDelete.map(record => record.id);
    
    if (idsToDelete.length > 0) {
      await db.changeRecords.bulkDelete(idsToDelete);
    }
    
    return idsToDelete.length;
  }

  /**
   * Get the count of unsynced change records
   */
  async countUnsynced(): Promise<number> {
    const unsynced = await this.getUnsynced();
    return unsynced.length;
  }

  /**
   * Clear all change records
   */
  async clear(): Promise<void> {
    await db.changeRecords.clear();
  }
}
