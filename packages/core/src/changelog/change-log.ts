/**
 * ChangeLog - High-level interface for command-based change capture
 *
 * Wraps ChangeLogRepository with semantic methods for appending commands,
 * querying unsynced records, and marking records as synced.
 * 
 * Adds sequence number management on top of the repository layer for:
 * - Auto-incrementing sequence numbers
 * - Cursor-based sync operations
 * - Transaction rollback support
 * 
 * DESIGN CHOICE: Sequence-based filtering over synced-flag filtering
 * - Sequence numbers provide reliable ordering even with concurrent operations
 * - Cursor-based sync (getAfterSequence) is more robust than flag-based (getUnsynced)
 * - Prevents data loss when multiple commands occur in the same millisecond
 * - Simplifies sync logic: "give me everything after sequence N"
 * - Synced flags provide additional flexibility for alternative sync strategies
 */

import Dexie from 'dexie';
import type { Command, CommandInput, ChangeRecord } from '../commands/types.js';
import { ChangeLogRepository } from './change-log.repository.js';
import { encryptChangeRecord } from './change-record-crypto.js';
import { generateUUID } from '../utils/uuid.js';
import { db } from '../db/database.js';
import type { UploadQueueEntry } from './upload-queue.js';

/** Change records that are sequenced and encrypted but not yet written. */
export interface PreparedChangeRecords {
  records: ChangeRecord[];
  queueEntries: UploadQueueEntry[];
}

/**
 * ChangeLog - High-level command logging interface
 * 
 * Extends ChangeLogRepository with sequence number management
 */
export class ChangeLog {
  private repository: ChangeLogRepository;
  private nextSequence: number = 1;
  private initialized: boolean = false;

  constructor() {
    this.repository = new ChangeLogRepository();
  }

  /**
   * Initialize the ChangeLog by loading the last sequence number from IndexedDB
   * This ensures sequence numbers continue from where they left off after a page refresh
   */
  private async initialize(): Promise<void> {
    if (this.initialized) return;
    
    const lastSequence = await this.repository.getLastSequence();
    this.nextSequence = lastSequence + 1;
    this.initialized = true;
  }

  /**
   * Append a command to the log
   * Automatically assigns a unique sequence number and persists to IndexedDB.
   * When `accountKey` is provided the record is also encrypted and added to
   * the pending-upload queue — no plaintext ever enters the upload path.
   *
   * @param command    - Command without sequence (sequence is auto-assigned)
   * @param accountId  - Account ID for multi-account sync support
   * @param accountKey - Optional 32-byte symmetric key; if supplied the record
   *                     is sealed and enqueued for upload automatically.
   * @returns The complete ChangeRecord with sequence number assigned
   */
  async append(
    command: CommandInput,
    accountId: string,
    accountKey?: Uint8Array,
  ): Promise<ChangeRecord> {
    const [record] = await this.appendMany([{ command, accountId, accountKey }]);
    return record;
  }

  async appendMany(
    commands: Array<{ command: CommandInput; accountId: string; accountKey?: Uint8Array }>,
  ): Promise<ChangeRecord[]> {
    return this.persistPrepared(await this.prepareMany(commands));
  }

  /**
   * Assign sequence numbers and encrypt records without touching IndexedDB.
   *
   * Encryption awaits libsodium, which is not a Dexie promise. Callers that
   * write records inside a Dexie transaction must prepare them before opening
   * it, then pass the result to persistPrepared() inside the transaction.
   */
  async prepareMany(
    commands: Array<{ command: CommandInput; accountId: string; accountKey?: Uint8Array }>,
  ): Promise<PreparedChangeRecords> {
    await this.initialize();
    const records: ChangeRecord[] = [];
    const queueEntries: PreparedChangeRecords['queueEntries'] = [];

    for (const entry of commands) {
      const commandWithSequence: Command = {
        ...entry.command,
        timestamp: entry.command.timestamp ?? new Date().toISOString(),
        sequence: this.nextSequence++,
      } as Command;
      const record: ChangeRecord = {
        id: generateUUID(),
        command: commandWithSequence,
        timestamp: commandWithSequence.timestamp,
        accountId: entry.accountId,
        synced: false,
      };
      records.push(record);
      if (entry.accountKey) {
        const envelope = await encryptChangeRecord(record, entry.accountKey);
        queueEntries.push({
          change_uuid: record.id,
          encrypted_payload: envelope,
          localAccountId: entry.accountId,
          enqueued_at: new Date().toISOString(),
        });
      }
    }

    return { records, queueEntries };
  }

  /**
   * Write prepared records and their upload-queue entries. Joins the caller's
   * Dexie transaction when there is one, so the records commit together with
   * the entity writes they describe.
   */
  async persistPrepared({ records, queueEntries }: PreparedChangeRecords): Promise<ChangeRecord[]> {
    if (records.length === 0) return records;

    const persist = async () => {
      await db.changeRecords.bulkAdd(records);
      if (queueEntries.length > 0) await db.uploadQueue.bulkAdd(queueEntries);
    };
    if (Dexie.currentTransaction) {
      await persist();
    } else {
      await db.transaction('rw', db.changeRecords, db.uploadQueue, persist);
    }
    return records;
  }

  /**
   * Get all change records, ordered by sequence
   */
  async getAll(): Promise<ChangeRecord[]> {
    const records = await this.repository.getAll();
    return records.sort((a, b) => a.command.sequence - b.command.sequence);
  }

  /**
   * Get change records for a specific account, ordered by sequence
   */
  async getByAccountId(accountId: string): Promise<ChangeRecord[]> {
    const records = await this.repository.getByAccountId(accountId);
    return records.sort((a, b) => a.command.sequence - b.command.sequence);
  }

  /**
   * Get change records after a specific timestamp
   * @deprecated Use getAfterSequence for reliable cursor-based filtering
   */
  async getAfter(timestamp: string): Promise<ChangeRecord[]> {
    return this.repository.getAfter(timestamp);
  }

  /**
   * Get change records after a specific sequence number
   * This is the recommended method for cursor-based sync operations
   * 
   * @param sequence - The sequence number to filter after (exclusive)
   * @returns All change records with sequence > specified sequence
   */
  async getAfterSequence(sequence: number): Promise<ChangeRecord[]> {
    return this.repository.getAfterSequence(sequence);
  }

  /**
   * Get unsynced change records
   * Returns all records where synced === false
   */
  async getUnsynced(): Promise<ChangeRecord[]> {
    return this.repository.getUnsynced();
  }

  /**
   * Get unsynced change records for a specific account
   */
  async getUnsyncedByAccountId(accountId: string): Promise<ChangeRecord[]> {
    return this.repository.getUnsyncedByAccountId(accountId);
  }

  /**
   * Mark a change record as synced
   */
  async markSynced(id: string): Promise<void> {
    await this.repository.markSynced(id);
  }

  /**
   * Mark multiple change records as synced
   */
  async markManySynced(ids: string[]): Promise<void> {
    await this.repository.markManySynced(ids);
  }

  /**
   * Clear all synced records
   * Used for housekeeping to prevent unbounded growth
   * 
   * @returns Number of records deleted
   */
  async clearSynced(): Promise<number> {
    return this.repository.clearSynced();
  }

  /**
   * Clear synced records for a specific account
   */
  async clearSyncedByAccountId(accountId: string): Promise<number> {
    return this.repository.clearSyncedByAccountId(accountId);
  }

  /**
   * Get the last sequence number in the log
   * Useful for establishing a cursor position for sync operations
   * 
   * @returns The highest sequence number, or 0 if log is empty
   */
  async getLastSequence(): Promise<number> {
    return this.repository.getLastSequence();
  }

  /**
   * Clear all change records from the log
   * Also resets the sequence counter
   */
  async clear(): Promise<void> {
    await this.repository.clear();
    this.nextSequence = 1;
    this.initialized = false;
  }

  /**
   * Rollback change records after a specific sequence number
   * Used for transaction rollback when an operation fails partway through
   * 
   * @param sequence - Remove all records with sequence > this value
   * @returns Number of records removed
   */
  async rollbackAfter(sequence: number): Promise<number> {
    const deletedCount = await this.repository.deleteAfterSequence(sequence);
    
    // Reset nextSequence to continue from the last remaining record
    const lastSequence = await this.repository.getLastSequence();
    this.nextSequence = lastSequence + 1;
    
    return deletedCount;
  }

  /**
   * Get the number of change records in the log
   */
  async count(): Promise<number> {
    return this.repository.count();
  }

  /**
   * Get the number of unsynced change records
   */
  async countUnsynced(): Promise<number> {
    return this.repository.countUnsynced();
  }
}

/**
 * Singleton ChangeLog instance
 */
export const changeLog = new ChangeLog();
