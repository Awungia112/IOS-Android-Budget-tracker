import { BaseRepository } from './base.repository.js';
import { db } from '../db/index.js';
import type { Template } from '../types/index.js';

/**
 * Repository for Template entities
 *
 * Uses Dexie indexed queries for efficient filtering.
 */
export class TemplateRepository extends BaseRepository<Template> {
  constructor() {
    super(db.templates);
  }

  /**
   * Get all templates for a specific account
   *
   * Uses accountId index - O(log n) performance
   * Filters out soft-archived items
   */
  async getByAccountId(accountId: string): Promise<Template[]> {
    const items = await db.templates.where('accountId').equals(accountId).toArray();
    return items.filter((item: any) => !item.archivedAt);
  }
}
