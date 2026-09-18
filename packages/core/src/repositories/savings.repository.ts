import { BaseRepository } from './base.repository.js';
import { db } from '../db/index.js';
import type { SavingsGoal } from '../types/index.js';

/**
 * Repository for SavingsGoal entities
 *
 * Uses Dexie indexed queries for efficient filtering.
 */
export class SavingsRepository extends BaseRepository<SavingsGoal> {
  constructor() {
    super(db.savingsGoals);
  }

  /**
   * Get all savings goals for a specific account
   *
   * Uses accountId index - O(log n) performance
   * Filters out soft-archived items
   */
  async getByAccountId(accountId: string): Promise<SavingsGoal[]> {
    const items = await db.savingsGoals.where('accountId').equals(accountId).toArray();
    return items.filter((item: any) => !item.archivedAt);
  }
}
