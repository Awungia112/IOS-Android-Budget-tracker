import type { PendingKeyRotation } from '../db/database.js';
import type { AsymmetricEnvelope } from '../crypto/envelope.js';
import { db } from '../db/index.js';
import { generateUUID } from '../utils/uuid.js';

/**
 * Service for managing pending key rotations.
 *
 * Stores wrapped keys and epoch info locally before attempting server upload.
 * If the upload fails (network error, timeout, etc.), the sync engine can retry
 * by re-uploading the stored wrapped keys without losing state.
 *
 * This makes member removal + wrapped key upload idempotent and recoverable.
 */
export class PendingKeyRotationService {
  /**
   * Create and store a pending key rotation.
   * Call this BEFORE attempting the server upload to ensure recovery on failure.
   */
  async createPendingRotation(
    localAccountId: string,
    serverAccountId: string,
    userIdToRemove: string,
    newEpoch: number,
    wrappedKeys: Array<{ userId: string; wrappedKey: AsymmetricEnvelope }>,
  ): Promise<string> {
    const id = generateUUID();
    const rotation: PendingKeyRotation = {
      id,
      localAccountId,
      serverAccountId,
      userIdToRemove,
      newEpoch,
      wrappedKeys,
      createdAt: Date.now(),
    };

    await db.pendingKeyRotations.add(rotation);
    return id;
  }

  /**
   * Get a pending rotation by ID.
   */
  async getPendingRotation(id: string): Promise<PendingKeyRotation | undefined> {
    return db.pendingKeyRotations.get(id);
  }

  /**
   * Get all pending rotations for an account.
   */
  async getPendingRotationsByAccount(localAccountId: string): Promise<PendingKeyRotation[]> {
    return db.pendingKeyRotations
      .where('localAccountId')
      .equals(localAccountId)
      .toArray();
  }

  /**
   * Get all pending rotations, sorted by creation time (oldest first).
   * Useful for retry logic that processes rotations in order.
   */
  async getAllPendingRotations(): Promise<PendingKeyRotation[]> {
    return db.pendingKeyRotations
      .orderBy('createdAt')
      .toArray();
  }

  /**
   * Delete a pending rotation after successful upload.
   */
  async deletePendingRotation(id: string): Promise<void> {
    await db.pendingKeyRotations.delete(id);
  }

  /**
   * Delete all pending rotations for an account.
   * Use with caution - typically only for testing or account cleanup.
   */
  async deleteAccountRotations(localAccountId: string): Promise<void> {
    await db.pendingKeyRotations
      .where('localAccountId')
      .equals(localAccountId)
      .delete();
  }
}

export const pendingKeyRotationService = new PendingKeyRotationService();
