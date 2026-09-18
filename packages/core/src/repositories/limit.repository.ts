import { BaseRepository } from './base.repository.js';
import { db } from '../db/index.js';
import type { Limit } from '../types/index.js';

/**
 * Repository for Limit entities
 *
 * Uses Dexie indexed queries for efficient filtering.
 */
export class LimitRepository extends BaseRepository<Limit> {
  constructor() {
    super(db.limits);
  }

  /**
   * Get all limits for a specific account
   *
   * Uses accountId index - O(log n) performance
   * Filters out soft-archived items
   */
  async getByAccountId(accountId: string): Promise<Limit[]> {
    const items = await db.limits.where('accountId').equals(accountId).toArray();
    return items.filter((item: any) => !item.archivedAt);
  }
}
