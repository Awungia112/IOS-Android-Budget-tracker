/**
 * Unit tests for BudgetWiseDB.initializeDefaultData()
 *
 * Covers the guard added in ticket #449: when the default "Personal" account
 * is absent but other accounts already exist (post-migration state), the method
 * must NOT seed main-account or its default categories.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import Dexie from 'dexie';
import { BudgetWiseDB } from './database.js';
import { DEFAULT_ACCOUNT_ID } from './config.js';
import type { Account } from '../types/index.js';

describe('BudgetWiseDB.initializeDefaultData()', () => {
  const testDbName = 'BudgetWiseDB-test-initializeDefaultData';
  let db: BudgetWiseDB;

  beforeEach(async () => {
    await Dexie.delete(testDbName);
    db = new BudgetWiseDB();
    (db as any).name = testDbName;
    await db.open();
  });

  afterEach(async () => {
    db.close();
    await Dexie.delete(testDbName);
  });

  it('seeds the default account and categories on a completely empty database', async () => {
    // Start from a blank slate (no accounts, no categories)
    await db.accounts.clear();
    await db.categories.clear();

    await db.initializeDefaultData();

    expect(await db.accounts.get(DEFAULT_ACCOUNT_ID)).toBeDefined();
    const defaultCategories = await db.categories
      .where('accountId')
      .equals(DEFAULT_ACCOUNT_ID)
      .count();
    expect(defaultCategories).toBeGreaterThan(0);
  });

  it('does NOT seed main-account when other accounts exist (post-migration)', async () => {
    // Simulate a post-migration state: migrated account present, default absent
    await db.accounts.clear();
    await db.categories.clear();

    const migratedAccount: Account = {
      id: 'migrated-account-abc',
      name: 'Mein Konto',
      initials: 'MK',
    };
    await db.accounts.add(migratedAccount);

    await db.initializeDefaultData();

    // main-account must NOT have been created
    expect(await db.accounts.get(DEFAULT_ACCOUNT_ID)).toBeUndefined();
    // Still only the one migrated account
    expect(await db.accounts.count()).toBe(1);
  });

  it('does NOT seed default categories when other accounts exist (post-migration)', async () => {
    await db.accounts.clear();
    await db.categories.clear();

    const migratedAccount: Account = {
      id: 'migrated-account-abc',
      name: 'Mein Konto',
      initials: 'MK',
    };
    await db.accounts.add(migratedAccount);

    await db.initializeDefaultData();

    // No categories belonging to the default account should exist
    const defaultAccountCategories = await db.categories
      .where('accountId')
      .equals(DEFAULT_ACCOUNT_ID)
      .count();
    expect(defaultAccountCategories).toBe(0);
  });

  it('is idempotent: calling twice on a fresh install does not duplicate the default account', async () => {
    await db.accounts.clear();
    await db.categories.clear();

    await db.initializeDefaultData();
    await db.initializeDefaultData();

    expect(await db.accounts.count()).toBe(1);
  });
});
