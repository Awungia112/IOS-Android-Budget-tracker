/**
 * upload-queue.ts
 *
 * Persists encrypted ChangeRecords in IndexedDB so they survive app restarts.
 *
 * Each entry holds:
 *  - change_uuid       — the original ChangeRecord.id, used for deduplication
 *  - encrypted_payload — a SymmetricEnvelope (v, alg, nonce, ciphertext)
 *  - enqueued_at       — ISO-8601 timestamp, for ordering / TTL
 *
 * Scope
 * ─────
 * This module is intentionally limited to persistence only (OA-278).
 * The upload consumer — the service that reads entries, POSTs them to the
 * server, calls removeMany() on success, and retries on failure — is out of
 * scope for this ticket and will be implemented in the sync/upload service
 * ticket (OA-300 or equivalent).
 *
 * The queue contract for that consumer is:
 *   const entries = await uploadQueue.getAll();          // read pending
 *   await sendToServer(entries);                         // POST encrypted payloads
 *   await uploadQueue.removeMany(entries.map(e => e.change_uuid)); // confirm
 */

import { db } from '../db/database.js';
import type { SymmetricEnvelope } from '../crypto/envelope.js';

export interface UploadQueueEntry {
  /** Primary key — mirrors ChangeRecord.id */
  change_uuid: string;
  /** Encrypted payload produced by encryptChangeRecord() */
  encrypted_payload: SymmetricEnvelope;
  /** When this entry was added to the queue */
  enqueued_at: string;
  /** Local account ID for multi-account isolation (OA-168) */
  localAccountId: string;
}

export class UploadQueue {
  /**
   * Add an encrypted ChangeRecord to the pending-upload queue.
   * Idempotent: putting the same change_uuid twice is a no-op (put semantics).
   */
  async enqueue(entry: Omit<UploadQueueEntry, 'enqueued_at'>): Promise<void> {
    await db.uploadQueue.put({
      ...entry,
      enqueued_at: new Date().toISOString(),
    });
  }

  /**
   * Return all queued entries for a specific account, ordered by enqueued_at ascending.
   * Uses the Dexie index on localAccountId.
   */
  async getAllByAccount(localAccountId: string): Promise<UploadQueueEntry[]> {
    return db.uploadQueue
      .where('localAccountId')
      .equals(localAccountId)
      .sortBy('enqueued_at');
  }

  /**
   * Return all queued entries ordered by enqueued_at ascending.
   * @deprecated Use getAllByAccount for multi-account safety.
   */
  async getAll(): Promise<UploadQueueEntry[]> {
    return db.uploadQueue.orderBy('enqueued_at').toArray();
  }

  /**
   * Remove a single entry after it has been successfully uploaded.
   */
  async remove(change_uuid: string): Promise<void> {
    await db.uploadQueue.delete(change_uuid);
  }

  /**
   * Remove multiple entries after a batch upload succeeds.
   */
  async removeMany(change_uuids: string[]): Promise<void> {
    await db.uploadQueue.bulkDelete(change_uuids);
  }

  /**
   * How many entries are waiting to be uploaded.
   */
  async count(): Promise<number> {
    return db.uploadQueue.count();
  }

  /**
   * Clear the entire queue (used in tests / account wipe).
   */
  async clear(): Promise<void> {
    await db.uploadQueue.clear();
  }
}

/** Singleton instance shared across the application. */
export const uploadQueue = new UploadQueue();
