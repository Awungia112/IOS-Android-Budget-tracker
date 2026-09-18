import type { Table } from 'dexie';

/**
 * Generic base repository class providing common CRUD operations
 *
 * Uses Dexie directly for all database operations with proper indexing support.
 * Subclasses should override methods to use indexed queries where applicable.
 */
export class BaseRepository<T extends { id: string; accountId?: string }> {
  protected table: Table<T, string>;

  constructor(table: Table<T, string>) {
    this.table = table;
  }

  /**
   * Get all items from the store
   */
  async getAll(): Promise<T[]> {
    return this.table.toArray();
  }

  /**
   * Get item by ID
   * @public
   */
  async getById(id: string): Promise<T | undefined> {
    return this.table.get(id);
  }

  /**
   * Create a new item
   * @public
   */
  async create(item: T): Promise<T> {
    await this.table.add(item);
    return item;
  }

  /**
   * Update an existing item
   * @public
   */
  async update(item: T): Promise<T> {
    await this.table.put(item);
    return item;
  }

  /**
   * Delete item by ID
   * @public
   */
  async delete(id: string): Promise<void> {
    await this.table.delete(id);
  }

  /**
   * Delete all items for a specific account (cascade deletion)
   *
   * Uses indexed query if accountId index exists, otherwise falls back to filter.
   * @public
   */
  async deleteByAccountId(accountId: string): Promise<void> {
    // Try to use indexed query first
    try {
      const items = await this.table.where('accountId').equals(accountId).toArray();
      await this.table.bulkDelete(items.map(item => item.id));
    } catch {
      // Fallback for tables without accountId index (e.g., accounts)
      const allItems = await this.getAll();
      const itemsToDelete = allItems.filter(item => item.accountId === accountId);
      await this.table.bulkDelete(itemsToDelete.map(item => item.id));
    }
  }

  /**
   * Get all items for a specific account
   *
   * Uses indexed query for O(log n) performance.
   * Override in subclass if table has accountId index.
   */
  async getByAccountId(accountId: string): Promise<T[]> {
    try {
      const items = await this.table.where('accountId').equals(accountId).toArray();
      // Filter out soft-archived items when the optional `archivedAt` field exists
      return items.filter((it: any) => !it.archivedAt);
    } catch {
      // Fallback for tables without accountId index
      const allItems = await this.getAll();
      return allItems.filter(item => item.accountId === accountId && !(item as any).archivedAt);
    }
  }

  /**
   * Count all items in the store
   * @public
   */
  async count(): Promise<number> {
    return this.table.count();
  }

  /**
   * Count items for a specific account
   * Filters out soft-archived items for consistency with getByAccountId()
   * @public
   */
  async countByAccountId(accountId: string): Promise<number> {
    const items = await this.getByAccountId(accountId);
    return items.length;
  }

  /**
   * Bulk create multiple items
   * @public
   */
  async bulkCreate(items: T[]): Promise<void> {
    await this.table.bulkAdd(items);
  }

  /**
   * Bulk upsert (create-or-update) multiple items.
   * Uses bulkPut so existing keys are overwritten rather than throwing
   * a ConstraintError. Use this in sync-replay paths where the same
   * command may arrive more than once.
   * @public
   */
  async bulkUpsert(items: T[]): Promise<void> {
    await this.table.bulkPut(items);
  }

  /**
   * Bulk delete multiple items by ID
   * @public
   */
  async bulkDelete(ids: string[]): Promise<void> {
    await this.table.bulkDelete(ids);
  }
}
