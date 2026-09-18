/**
 * Tests for Database Migration v13
 * 
 * Verifies cleanup of empty default "Personal" account for existing users.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import Dexie from 'dexie';
import type { Account, Transaction, Category } from '../types/index.js';
import { DEFAULT_ACCOUNT_ID } from './config.js';

/**
 * Helper to create a database at version 12 (before migration v13)
 * This simulates an existing user's database state before the upgrade.
 */
function createV12Database(dbName: string) {
  const db = new Dexie(dbName);
  
  // Define schema up to v12 (without migration v13)
  db.version(12).stores({
    accounts: 'id',
    transactions: 'id, accountId, date, category, [accountId+date]',
    categories: 'id, accountId, type, [accountId+type]',
    limits: 'id, accountId, categoryId',
    templates: 'id, accountId',
    recurringItems: 'id, accountId, frequency',
    savingsGoals: 'id, accountId, deadline',
    changeRecords: 'id, timestamp, accountId',
    accountSyncMetadata: 'localAccountId, serverAccountId, keyEpoch',
    uploadQueue: 'change_uuid, enqueued_at, localAccountId',
    pendingKeyRotations: 'id, localAccountId, createdAt',
    remoteReplayRecords: 'changeUuid, localAccountId, serverAccountId, sequence, [serverAccountId+sequence]',
    pendingKeyDeliveries: 'id, serverAccountId, recipientUserId, createdAt',
  });
  
  return db;
}

describe('Database Migration v13 - Empty Default Account Cleanup', () => {
  const testDbName = 'BudgetWiseDB-test-v13';

  beforeEach(async () => {
    // Clean up any existing test database
    await Dexie.delete(testDbName);
  });

  afterEach(async () => {
    // Clean up after each test
    await Dexie.delete(testDbName);
  });


  it('removes empty default account when multiple accounts exist (post-migration scenario)', async () => {
    // Step 1: Create a v12 database with post-migration state
    // (migrated account + empty default account)
    const v12db = createV12Database(testDbName);
    await v12db.open();
    
    const migratedAccount: Account = {
      id: 'migrated-account-123',
      name: 'Mein Konto',
      initials: 'MK',
      profileImage: '',

    };
    
    const defaultAccount: Account = {
      id: DEFAULT_ACCOUNT_ID,
      name: 'Personal',
      initials: 'P',
      profileImage: '',

    };

    await v12db.table<Account>('accounts').bulkAdd([defaultAccount, migratedAccount]);

    // Add a transaction only to the migrated account (default stays empty)
    await v12db.table<Transaction>('transactions').add({
      id: 'tx-1',
      accountId: migratedAccount.id,
      category: 'cat-1',
      amount: 1000,
      date: new Date().toISOString(),
      title: 'Test Transaction',
      type: 'expense',
    });

    // Verify v12 state: should have 2 accounts
    expect(await v12db.table('accounts').count()).toBe(2);
    
    await v12db.close();

    // Step 2: Upgrade to v13 by importing the real database class
    // This triggers migration v13
    const { BudgetWiseDB } = await import('./database.js');
    const v13db = new BudgetWiseDB();
    // Override the database name to use our test database
    (v13db as any).name = testDbName;
    
    await v13db.open();
    await v13db.accounts.toArray(); // Force any pending operations

    // Verify: default account should be removed by migration v13
    const remainingAccounts = await v13db.accounts.toArray();
    expect(remainingAccounts).toHaveLength(1);
    expect(remainingAccounts[0].id).toBe(migratedAccount.id);
    expect(await v13db.accounts.get(DEFAULT_ACCOUNT_ID)).toBeUndefined();
    
    await v13db.close();
  });

  it('keeps default account when it has transactions', async () => {
    // Step 1: Create v12 database with default account that has transactions
    const v12db = createV12Database(testDbName);
    await v12db.open();
    
    const migratedAccount: Account = {
      id: 'migrated-account-123',
      name: 'Mein Konto',
      initials: 'MK',
      profileImage: '',

    };
    
    const defaultAccount: Account = {
      id: DEFAULT_ACCOUNT_ID,
      name: 'Personal',
      initials: 'P',
      profileImage: '',

    };

    await v12db.table<Account>('accounts').bulkAdd([defaultAccount, migratedAccount]);

    // Add transactions to BOTH accounts
    await v12db.table<Transaction>('transactions').bulkAdd([
      {
        id: 'tx-1',
        accountId: migratedAccount.id,
        category: 'cat-1',
        amount: 1000,
        date: new Date().toISOString(),
        title: 'Test Transaction 1',
        type: 'expense',
      },
      {
        id: 'tx-2',
        accountId: DEFAULT_ACCOUNT_ID,
        category: 'cat-1',
        amount: 500,
        date: new Date().toISOString(),
        title: 'Test Transaction 2',
        type: 'expense',
      },
    ]);

    await v12db.close();

    // Step 2: Upgrade to v13
    const { BudgetWiseDB } = await import('./database.js');
    const v13db = new BudgetWiseDB();
    (v13db as any).name = testDbName;
    
    await v13db.open();
    await v13db.accounts.toArray();

    // Verify: both accounts should still exist (default has transactions)
    expect(await v13db.accounts.count()).toBe(2);
    expect(await v13db.accounts.get(DEFAULT_ACCOUNT_ID)).toBeDefined();
    
    await v13db.close();
  });

  it('does nothing when only one account exists (fresh install)', async () => {
    // Step 1: Create v12 database with only default account (fresh install)
    const v12db = createV12Database(testDbName);
    await v12db.open();
    
    const defaultAccount: Account = {
      id: DEFAULT_ACCOUNT_ID,
      name: 'Personal',
      initials: 'P',
      profileImage: '',

    };

    await v12db.table<Account>('accounts').add(defaultAccount);
    
    expect(await v12db.table('accounts').count()).toBe(1);
    await v12db.close();

    // Step 2: Upgrade to v13
    const { BudgetWiseDB } = await import('./database.js');
    const v13db = new BudgetWiseDB();
    (v13db as any).name = testDbName;
    
    await v13db.open();
    await v13db.accounts.toArray();

    // Verify: account should still exist (single account = fresh install)
    expect(await v13db.accounts.count()).toBe(1);
    expect(await v13db.accounts.get(DEFAULT_ACCOUNT_ID)).toBeDefined();
    
    await v13db.close();
  });

  it('does nothing when default account does not exist', async () => {
    // Step 1: Create v12 database with only migrated account (default already cleaned)
    const v12db = createV12Database(testDbName);
    await v12db.open();
    
    const migratedAccount: Account = {
      id: 'migrated-account-123',
      name: 'Mein Konto',
      initials: 'MK',
      profileImage: '',

    };

    await v12db.table<Account>('accounts').add(migratedAccount);
    
    expect(await v12db.table('accounts').count()).toBe(1);
    await v12db.close();

    // Step 2: Upgrade to v13
    const { BudgetWiseDB } = await import('./database.js');
    const v13db = new BudgetWiseDB();
    (v13db as any).name = testDbName;
    
    await v13db.open();
    await v13db.accounts.toArray();

    // Verify: migrated account still exists, no errors
    expect(await v13db.accounts.count()).toBe(1);
    expect((await v13db.accounts.toArray())[0].id).toBe(migratedAccount.id);
    
    await v13db.close();
  });

  it('cleans up default categories when removing empty default account', async () => {
    // Step 1: Create v12 database with migrated account + empty default account
    const v12db = createV12Database(testDbName);
    await v12db.open();
    
    const migratedAccount: Account = {
      id: 'migrated-account-123',
      name: 'Mein Konto',
      initials: 'MK',
      profileImage: '',

    };
    
    const defaultAccount: Account = {
      id: DEFAULT_ACCOUNT_ID,
      name: 'Personal',
      initials: 'P',
      profileImage: '',

    };

    await v12db.table<Account>('accounts').bulkAdd([defaultAccount, migratedAccount]);

    // Add categories for both accounts
    await v12db.table<Category>('categories').bulkAdd([
      {
        id: 'cat-migrated-1',
        accountId: migratedAccount.id,
        name: 'Migrated Category',
        type: 'expense',
        isDefault: false,
        icon: 'lucide:shopping',
      },
      {
        id: 'cat-default-1',
        accountId: DEFAULT_ACCOUNT_ID,
        name: 'Default Category',
        type: 'expense',
        isDefault: true,
        icon: 'cash',
      },
      {
        id: 'cat-default-2',
        accountId: DEFAULT_ACCOUNT_ID,
        name: 'Another Default Category',
        type: 'income',
        isDefault: true,
        icon: 'money',
      },
    ]);

    // Add transaction only to migrated account (default stays empty)
    await v12db.table<Transaction>('transactions').add({
      id: 'tx-1',
      accountId: migratedAccount.id,
      category: 'cat-migrated-1',
      amount: 1000,
      date: new Date().toISOString(),
      title: 'Test',
      type: 'expense',
    });

    // Verify setup
    expect(await v12db.table('categories').count()).toBe(3);
    await v12db.close();

    // Step 2: Upgrade to v13
    const { BudgetWiseDB } = await import('./database.js');
    const v13db = new BudgetWiseDB();
    (v13db as any).name = testDbName;
    
    await v13db.open();
    await v13db.categories.toArray();

    // Verify: default account's categories should be removed
    const remainingCategories = await v13db.categories.toArray();
    const migratedAccountCategories = remainingCategories.filter(
      c => c.accountId === migratedAccount.id
    );
    const defaultAccountCategories = remainingCategories.filter(
      c => c.accountId === DEFAULT_ACCOUNT_ID
    );
    
    expect(migratedAccountCategories.length).toBe(1);
    expect(defaultAccountCategories.length).toBe(0);
    
    await v13db.close();
  });
});
