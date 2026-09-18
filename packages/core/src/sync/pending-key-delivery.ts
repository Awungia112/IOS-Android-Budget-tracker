import type { PendingKeyDelivery } from '../db/database.js';
import type { AsymmetricEnvelope } from '../crypto/envelope.js';
import { db } from '../db/index.js';
import { generateUUID } from '../utils/uuid.js';

export interface EnqueuePendingKeyDeliveryInput {
  serverAccountId: string;
  recipientUserId: string;
  recipientPublicKey: string;
  wrappedKey: AsymmetricEnvelope;
  epoch: number;
}

export class PendingKeyDeliveryQueue {
  async enqueue(input: EnqueuePendingKeyDeliveryInput): Promise<string> {
    const id = generateUUID();
    const entry: PendingKeyDelivery = {
      id,
      serverAccountId: input.serverAccountId,
      recipientUserId: input.recipientUserId,
      recipientPublicKey: input.recipientPublicKey,
      wrappedKey: input.wrappedKey,
      epoch: input.epoch,
      createdAt: Date.now(),
    };
    await db.pendingKeyDeliveries.add(entry);
    return id;
  }

  async getAll(): Promise<PendingKeyDelivery[]> {
    return db.pendingKeyDeliveries.orderBy('createdAt').toArray();
  }

  async remove(id: string): Promise<void> {
    await db.pendingKeyDeliveries.delete(id);
  }

  async removeMany(ids: string[]): Promise<void> {
    await db.pendingKeyDeliveries.bulkDelete(ids);
  }

  async clear(): Promise<void> {
    await db.pendingKeyDeliveries.clear();
  }
}

export const pendingKeyDeliveryQueue = new PendingKeyDeliveryQueue();