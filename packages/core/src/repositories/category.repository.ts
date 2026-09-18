import { BaseRepository } from './base.repository.js';
import { db } from '../db/index.js';
import type { Category } from '../types/index.js';

/**
 * Repository for Category entities
 *
 * Uses Dexie indexed queries for efficient filtering.
 */
export class CategoryRepository extends BaseRepository<Category> {
  constructor() {
    super(db.categories);
  }

  /**
   * Get all categories for a specific account
   *
   * Uses accountId index - O(log n) performance
   * Filters out soft-archived items
   */
  async getByAccountId(accountId: string): Promise<Category[]> {
    const items = await db.categories.where('accountId').equals(accountId).toArray();
    return items.filter((item: any) => !item.archivedAt);
  }
}
