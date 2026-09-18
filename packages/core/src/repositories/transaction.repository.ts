import { BaseRepository } from './base.repository.js';
import { db } from '../db/index.js';
import type { Transaction } from '../types/index.js';

/**
 * Repository for Transaction entities
 *
 * Uses Dexie indexed queries for efficient filtering.
 */
export class TransactionRepository extends BaseRepository<Transaction> {
  constructor() {
    super(db.transactions);
  }

  /**
   * Get all transactions for a specific account
   *
   * Uses accountId index - O(log n) performance
   * Filters out soft-archived items
   */
  async getByAccountId(accountId: string): Promise<Transaction[]> {
    const items = await db.transactions.where('accountId').equals(accountId).toArray();
    return items.filter((item: any) => !item.archivedAt);
  }

  async getByAccountIdIncludingArchived(accountId: string): Promise<Transaction[]> {
    return db.transactions.where('accountId').equals(accountId).toArray();
  }
}
