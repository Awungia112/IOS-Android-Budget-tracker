/**
 * AccountRepository Unit Tests
 * 
 * Tests the duplicate name detection logic for account creation and updates.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { AccountRepository } from './account.repository.js';
import { db } from '../db/index.js';
import type { Account } from '../types/index.js';

describe('AccountRepository - Duplicate Name Validation', () => {
  let repository: AccountRepository;

  beforeEach(async () => {
    repository = new AccountRepository();
    await db.open();
    await db.accounts.clear();
  });

  afterEach(async () => {
    await db.accounts.clear();
  });

  describe('hasDuplicateName', () => {
    it('should return false when no accounts exist', async () => {
      const result = await repository.hasDuplicateName('Checking');
      expect(result).toBe(false);
    });

    it('should return true for exact name match', async () => {
      await db.accounts.add({
        id: 'account-1',
        name: 'Checking',
        initials: 'CH'
      });

      const result = await repository.hasDuplicateName('Checking');
      expect(result).toBe(true);
    });

    it('should return true for case-insensitive match', async () => {
      await db.accounts.add({
        id: 'account-1',
        name: 'Checking',
        initials: 'CH'
      });

      const result = await repository.hasDuplicateName('CHECKING');
      expect(result).toBe(true);
    });

    it('should return true for case-insensitive match with different casing', async () => {
      await db.accounts.add({
        id: 'account-1',
        name: 'Checking',
        initials: 'CH'
      });

      const result = await repository.hasDuplicateName('checking');
      expect(result).toBe(true);
    });

    it('should return true for name with extra whitespace', async () => {
      await db.accounts.add({
        id: 'account-1',
        name: 'Checking',
        initials: 'CH'
      });

      const result = await repository.hasDuplicateName('  Checking  ');
      expect(result).toBe(true);
    });

    it('should return true for trimmed match', async () => {
      await db.accounts.add({
        id: 'account-1',
        name: '  Savings  ',
        initials: 'SA'
      });

      const result = await repository.hasDuplicateName('Savings');
      expect(result).toBe(true);
    });

    it('should return false for different name', async () => {
      await db.accounts.add({
        id: 'account-1',
        name: 'Checking',
        initials: 'CH'
      });

      const result = await repository.hasDuplicateName('Savings');
      expect(result).toBe(false);
    });

    it('should return false when excluding the only matching account', async () => {
      await db.accounts.add({
        id: 'account-1',
        name: 'Checking',
        initials: 'CH'
      });

      // Renaming account-1 to "Checking" (same name) should be allowed
      const result = await repository.hasDuplicateName('Checking', 'account-1');
      expect(result).toBe(false);
    });

    it('should return true when another account has the same name (exclude different account)', async () => {
      await db.accounts.add({
        id: 'account-1',
        name: 'Checking',
        initials: 'CH'
      });
      await db.accounts.add({
        id: 'account-2',
        name: 'Savings',
        initials: 'SA'
      });

      // Renaming account-2 to "Checking" should fail
      const result = await repository.hasDuplicateName('Checking', 'account-2');
      expect(result).toBe(true);
    });

    it('should handle multiple accounts with different names', async () => {
      await db.accounts.add({
        id: 'account-1',
        name: 'Checking',
        initials: 'CH'
      });
      await db.accounts.add({
        id: 'account-2',
        name: 'Savings',
        initials: 'SA'
      });
      await db.accounts.add({
        id: 'account-3',
        name: 'Investment',
        initials: 'IN'
      });

      expect(await repository.hasDuplicateName('checking')).toBe(true);
      expect(await repository.hasDuplicateName('SAVINGS')).toBe(true);
      expect(await repository.hasDuplicateName('  Investment  ')).toBe(true);
      expect(await repository.hasDuplicateName('Credit Card')).toBe(false);
    });

    it('should allow renaming to same name with different casing', async () => {
      await db.accounts.add({
        id: 'account-1',
        name: 'Checking',
        initials: 'CH'
      });

      // Renaming account-1 from "Checking" to "CHECKING" should be allowed
      const result = await repository.hasDuplicateName('CHECKING', 'account-1');
      expect(result).toBe(false);
    });

    it('should handle empty name edge case', async () => {
      await db.accounts.add({
        id: 'account-1',
        name: 'Checking',
        initials: 'CH'
      });

      const result = await repository.hasDuplicateName('');
      expect(result).toBe(false);
    });

    it('should handle whitespace-only name edge case', async () => {
      await db.accounts.add({
        id: 'account-1',
        name: 'Checking',
        initials: 'CH'
      });

      const result = await repository.hasDuplicateName('   ');
      expect(result).toBe(false);
    });
  });
});
