/**
 * Integration test for account duplicate name validation
 * 
 * Tests the complete flow from service layer through repository to database
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { BudgetService } from '../services/budget.service.js';
import { db } from '../db/index.js';

describe('Account Duplicate Name Validation - Integration', () => {
  let service: BudgetService;

  beforeEach(async () => {
    service = new BudgetService();
    await db.open();
    // Clear all data for clean test state
    await db.accounts.clear();
    await db.categories.clear();
    await db.changeRecords.clear();
  });

  afterEach(async () => {
    await db.accounts.clear();
    await db.categories.clear();
    await db.changeRecords.clear();
  });

  describe('Account Creation', () => {
    it('should successfully create two accounts with different names', async () => {
      const account1 = await service.createAccount({
        name: 'Checking',
        initials: 'CH'
      });

      const account2 = await service.createAccount({
        name: 'Savings',
        initials: 'SA'
      });

      expect(account1.name).toBe('Checking');
      expect(account2.name).toBe('Savings');

      const allAccounts = await service.getAccounts();
      expect(allAccounts).toHaveLength(2);
    });

    it('should prevent creating account with exact duplicate name', async () => {
      await service.createAccount({
        name: 'Checking',
        initials: 'CH'
      });

      await expect(
        service.createAccount({
          name: 'Checking',
          initials: 'CH'
        })
      ).rejects.toThrow("An account named 'Checking' already exists.");

      const allAccounts = await service.getAccounts();
      expect(allAccounts).toHaveLength(1);
    });

    it('should prevent creating account with case-insensitive duplicate', async () => {
      await service.createAccount({
        name: 'Checking',
        initials: 'CH'
      });

      await expect(
        service.createAccount({
          name: 'CHECKING',
          initials: 'CH'
        })
      ).rejects.toThrow("An account named 'CHECKING' already exists.");

      const allAccounts = await service.getAccounts();
      expect(allAccounts).toHaveLength(1);
    });

    it('should prevent creating account with whitespace-padded duplicate', async () => {
      await service.createAccount({
        name: 'Checking',
        initials: 'CH'
      });

      await expect(
        service.createAccount({
          name: '  Checking  ',
          initials: 'CH'
        })
      ).rejects.toThrow("An account named 'Checking' already exists."); // Error shows trimmed name

      const allAccounts = await service.getAccounts();
      expect(allAccounts).toHaveLength(1);
    });
  });

  describe('Account Renaming', () => {
    it('should successfully rename account to a unique name', async () => {
      const account = await service.createAccount({
        name: 'Checking',
        initials: 'CH'
      });

      const updated = await service.updateAccount({
        ...account,
        name: 'Personal Checking',
        initials: 'PC'
      });

      expect(updated.name).toBe('Personal Checking');

      const retrieved = await service.getAccountById(account.id);
      expect(retrieved?.name).toBe('Personal Checking');
    });

    it('should prevent renaming to match another existing account', async () => {
      const account1 = await service.createAccount({
        name: 'Checking',
        initials: 'CH'
      });

      await service.createAccount({
        name: 'Savings',
        initials: 'SA'
      });

      await expect(
        service.updateAccount({
          ...account1,
          name: 'Savings'
        })
      ).rejects.toThrow("An account named 'Savings' already exists.");

      const retrieved = await service.getAccountById(account1.id);
      expect(retrieved?.name).toBe('Checking'); // Name unchanged
    });

    it('should allow renaming account to its own name (no-op)', async () => {
      const account = await service.createAccount({
        name: 'Checking',
        initials: 'CH'
      });

      const updated = await service.updateAccount({
        ...account,
        name: 'Checking' // Same name
      });

      expect(updated.name).toBe('Checking');
    });

    it('should allow changing only the case of the account name', async () => {
      const account = await service.createAccount({
        name: 'Checking',
        initials: 'CH'
      });

      const updated = await service.updateAccount({
        ...account,
        name: 'CHECKING' // Different case, same account
      });

      expect(updated.name).toBe('CHECKING');
    });

    it('should prevent renaming with case-insensitive duplicate', async () => {
      const account1 = await service.createAccount({
        name: 'Checking',
        initials: 'CH'
      });

      await service.createAccount({
        name: 'Savings',
        initials: 'SA'
      });

      await expect(
        service.updateAccount({
          ...account1,
          name: 'SAVINGS' // Case-insensitive match
        })
      ).rejects.toThrow("An account named 'SAVINGS' already exists.");
    });
  });

  describe('Complex Scenarios', () => {
    it('should handle multiple accounts with similar names', async () => {
      await service.createAccount({ name: 'Checking', initials: 'CH' });
      await service.createAccount({ name: 'Checking Account', initials: 'CA' });
      await service.createAccount({ name: 'My Checking', initials: 'MC' });

      // All three should exist
      const accounts = await service.getAccounts();
      expect(accounts).toHaveLength(3);

      // But exact duplicate should still fail
      await expect(
        service.createAccount({ name: 'Checking', initials: 'CH' })
      ).rejects.toThrow("An account named 'Checking' already exists.");
    });

    it('should maintain validation across create and rename operations', async () => {
      const account1 = await service.createAccount({
        name: 'Account A',
        initials: 'AA'
      });

      const account2 = await service.createAccount({
        name: 'Account B',
        initials: 'AB'
      });

      // Rename account1 to "Account C" - should succeed
      await service.updateAccount({
        ...account1,
        name: 'Account C'
      });

      // Try to create new account with old name "Account A" - should succeed
      const account3 = await service.createAccount({
        name: 'Account A',
        initials: 'AA'
      });

      expect(account3.name).toBe('Account A');

      // Try to rename account2 to "Account C" (now taken by renamed account1) - should fail
      await expect(
        service.updateAccount({
          ...account2,
          name: 'Account C'
        })
      ).rejects.toThrow("An account named 'Account C' already exists.");
    });
  });
});
