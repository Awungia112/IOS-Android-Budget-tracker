/**
 * LegacyDataTransformer Tests
 *
 * Tests transformation of legacy Django API data to Budget Wise domain types
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { LegacyDataTransformer } from './legacy-data-transformer.js';
import type {
  LegacyBalance,
  LegacyCategory,
  LegacyAccount,
  LegacyRecuring,
  LegacySavingGoal,
  LegacyUserData,
} from './legacy-types.js';

describe('LegacyDataTransformer', () => {
  let transformer: LegacyDataTransformer;

  beforeEach(() => {
    transformer = new LegacyDataTransformer();
  });

  // ===========================================================================
  // ACCOUNT TRANSFORMATION
  // ===========================================================================

  describe('transformAccount', () => {
    it('should transform legacy account to Budget Wise account', () => {
      const legacyAccount: LegacyAccount = {
        id: 1,
        name: 'My Budget Account',
        description: 'Personal account',
        acronym: 'MB',
        color: '#ff8840',
        created_at: '2022-11-21T17:37:28.556360Z',
        last_change: '2022-11-21T17:37:28.556451Z',
        deleted: false,
        last_synced: null,
        version: '1fbebc5a-c877-4d95-9146-6a23172ac74b',
        user: 3,
      };

      const result = transformer.transformAccount(legacyAccount);

      expect(result.name).toBe('My Budget Account');
      expect(result.initials).toBe('MB');
      expect(result.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
    });

    it('should generate initials from name if acronym is missing', () => {
      const legacyAccount: LegacyAccount = {
        id: 1,
        name: 'John Doe',
        description: null,
        acronym: null,
        color: null,
        created_at: '2022-11-21T17:37:28.556360Z',
        last_change: '2022-11-21T17:37:28.556451Z',
        deleted: false,
        last_synced: null,
        version: '1fbebc5a-c877-4d95-9146-6a23172ac74b',
        user: 3,
      };

      const result = transformer.transformAccount(legacyAccount);

      expect(result.initials).toBe('JD');
    });

    it('should generate initials from single word name', () => {
      const legacyAccount: LegacyAccount = {
        id: 1,
        name: 'Budget',
        description: null,
        acronym: null,
        color: null,
        created_at: '2022-11-21T17:37:28.556360Z',
        last_change: '2022-11-21T17:37:28.556451Z',
        deleted: false,
        last_synced: null,
        version: '1fbebc5a-c877-4d95-9146-6a23172ac74b',
        user: 3,
      };

      const result = transformer.transformAccount(legacyAccount);

      expect(result.initials).toBe('BU');
    });

    it('should produce the same ID on every call (deterministic UUIDv5)', () => {
      const legacyAccount: LegacyAccount = {
        id: 1,
        name: 'Budget',
        description: null,
        acronym: null,
        color: null,
        created_at: '2022-11-21T17:37:28.556360Z',
        last_change: '2022-11-21T17:37:28.556451Z',
        deleted: false,
        last_synced: null,
        version: '1fbebc5a-c877-4d95-9146-6a23172ac74b',
        user: 3,
      };

      const first = transformer.transformAccount(legacyAccount);
      transformer = new LegacyDataTransformer(); // fresh instance
      const second = transformer.transformAccount(legacyAccount);

      expect(first.id).toBe(second.id);
    });
  });

  // ===========================================================================
  // CATEGORY TRANSFORMATION
  // ===========================================================================

  describe('transformCategories', () => {
    it('should match legacy categories to default Budget Wise categories by name and type', () => {
      const legacyCategories: LegacyCategory[] = [
        {
          id: 1,
          name: 'Food', // Matches default expense category
          icon: 'kategorie_ausgaben_1',
          balanceType: 'BT_EXPENSE',
          active: true,
          deletable: false, // non-deletable = system-seeded → safe to map to default
          limits: null,
          limitsDate: null,
          deleted: false,
          account: 1,
        },
        {
          id: 2,
          name: 'Salary', // Matches default income category
          icon: 'kategorie_einnahmen_1',
          balanceType: 'BT_INCOME',
          active: true,
          deletable: false,
          limits: null,
          limitsDate: null,
          deleted: false,
          account: 1,
        },
      ];

      const result = transformer.transformCategories(legacyCategories, 'account-123');

      // Matched defaults are included so importData() can remap
      // cross-account category collisions during migration
      expect(result).toHaveLength(2);
      expect(result[0]).toEqual(expect.objectContaining({
        id: 'expense-food',
        name: 'category_food',
        type: 'expense',
        isDefault: true,
        accountId: 'account-123',
      }));
      expect(result[1]).toEqual(expect.objectContaining({
        id: 'income-salary',
        name: 'category_salary',
        type: 'income',
        isDefault: true,
        accountId: 'account-123',
      }));
      const categoryIdMap = (transformer as any).categoryIdMap;
      expect(categoryIdMap.get(1)).toBeDefined();
      expect(categoryIdMap.get(2)).toBeDefined();

      // Matched categories map to the well-known default IDs
      expect(categoryIdMap.get(1)).toBe('expense-food');
      expect(categoryIdMap.get(2)).toBe('income-salary');
    });

    it('should match legacy German category names to defaults via shared mapping', () => {
      // Real legacy API returns German names, not translation keys.
      // Only non-deletable (system-seeded) categories are mapped to defaults;
      // deletable ones are user-created and must be preserved as custom.
      const legacyCategories: LegacyCategory[] = [
        {
          id: 1,
          name: 'Essen', // German → normalizes to 'category_food' → matches expense-food
          icon: 'kategorie_ausgaben_3',
          balanceType: 'BT_EXPENSE',
          active: true,
          deletable: false, // non-deletable = system-seeded → maps to default
          limits: null,
          limitsDate: null,
          deleted: false,
          account: 1,
        },
        {
          id: 2,
          name: 'Lohn', // German → normalizes to 'category_salary' → matches income-salary
          icon: 'kategorie_einnahmen_2',
          balanceType: 'BT_INCOME',
          active: true,
          deletable: false,
          limits: null,
          limitsDate: null,
          deleted: false,
          account: 1,
        },
        {
          id: 3,
          name: 'Allgemein', // German → normalizes to 'category_general' → matches expense-general
          icon: 'kategorie_ausgaben_1',
          balanceType: 'BT_EXPENSE',
          active: true,
          deletable: false,
          limits: null,
          limitsDate: null,
          deleted: false,
          account: 1,
        },
      ];

      const result = transformer.transformCategories(legacyCategories, 'account-123');

      // All matched defaults are still returned for cross-account remapping
      expect(result).toHaveLength(3);
      expect(result.map(category => category.id)).toEqual([
        'expense-food',
        'income-salary',
        'expense-general',
      ]);
      // Names come from matchedDefault.name (the translation key), not the German legacy name
      expect(result[0].name).toBe('category_food');
      expect(result[1].name).toBe('category_salary');
      expect(result[2].name).toBe('category_general');

      const categoryIdMap = (transformer as any).categoryIdMap;
      expect(categoryIdMap.get(1)).toBeDefined();
      expect(categoryIdMap.get(2)).toBeDefined();
      expect(categoryIdMap.get(3)).toBeDefined();
    });

    it('should create new categories for unmatched legacy categories', () => {
      const legacyCategories: LegacyCategory[] = [
        {
          id: 1,
          name: 'Custom Category', // Does not match any default
          icon: 'kategorie_ausgaben_1',
          balanceType: 'BT_EXPENSE',
          active: true,
          deletable: true,
          limits: null,
          limitsDate: null,
          deleted: false,
          account: 1,
        },
      ];

      const result = transformer.transformCategories(legacyCategories, 'account-123');

      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('Custom Category');
      expect(result[0].type).toBe('expense');
      expect(result[0].isDefault).toBe(false);
      expect(result[0].id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
    });

    it('should preserve user-created translation-key-like names as custom categories', () => {
      const legacyCategories: LegacyCategory[] = [
        {
          id: 10,
          name: 'category_general', // user-created name that looks like a translation key
          icon: 'kategorie_ausgaben_1',
          balanceType: 'BT_INCOME',
          active: true,
          deletable: true, // user-created should be deletable
          limits: null,
          limitsDate: null,
          deleted: false,
          account: 1,
        },
      ];

      const result = transformer.transformCategories(legacyCategories, 'account-xyz');

      expect(result).toHaveLength(1);
      // Should NOT map to the stable default ID (income-general)
      expect(result[0].id).not.toBe('income-general');
      expect(result[0].isDefault).toBe(false);
      expect(result[0].name).toBe('category_general');
    });

    it('should preserve user-created category_* names in the transformed payload', () => {
      // A user who literally typed "category_household" as a custom category
      // name in the legacy app must have it preserved in the transformed
      // payload. importData owns later matching against target defaults.
      const legacyCategories: LegacyCategory[] = [
        {
          id: 99,
          name: 'category_household',
          icon: 'kategorie_ausgaben_2',
          balanceType: 'BT_EXPENSE',
          active: true,
          deletable: true,
          limits: null,
          limitsDate: null,
          deleted: false,
          account: 1,
        },
      ];

      const result = transformer.transformCategories(legacyCategories, 'account-123');

      expect(result).toHaveLength(1);
      // Must NOT be the stable default 'expense-household' ID
      expect(result[0].id).not.toBe('expense-household');
      expect(result[0].isDefault).toBe(false);
      // Original user-created name preserved
      expect(result[0].name).toBe('category_household');
    });

    it('should preserve deletable German-named categories in the transformed payload', () => {
      // A German-speaking user created a custom category with a name that
      // happens to match a system default (e.g. "Essen" → category_food).
      // Because deletable=true, the legacy app itself considers it user-created.
      // The transformer respects the deletable flag and preserves it until
      // importData resolves it against the target account's seeded defaults.
      const legacyCategories: LegacyCategory[] = [
        {
          id: 55,
          name: 'Essen', // German for "food" — normalizes to category_food
          icon: 'kategorie_ausgaben_3',
          balanceType: 'BT_EXPENSE',
          active: true,
          deletable: true, // ← user-created; legacy app allows deletion
          limits: null,
          limitsDate: null,
          deleted: false,
          account: 1,
        },
      ];

      const result = transformer.transformCategories(legacyCategories, 'account-123');

      expect(result).toHaveLength(1);
      // Must NOT be the stable default ID for expense-food
      expect(result[0].id).not.toBe('expense-food');
      expect(result[0].isDefault).toBe(false);
      // Original name preserved as-is — do NOT replace with translation key
      expect(result[0].name).toBe('Essen');
    });

    it('should preserve the full German custom category name set (Haushalt, Freizeit, Kleidung, Gesundheit, Lohn)', () => {
      // Covers the full set of German category names a German-speaking user
      // might plausibly create as custom categories — all remain custom in the
      // transformed payload when deletable=true.
      const germanCustomCategories: LegacyCategory[] = [
        { id: 1, name: 'Haushalt', icon: 'kategorie_ausgaben_2', balanceType: 'BT_EXPENSE', active: true, deletable: true, limits: null, limitsDate: null, deleted: false, account: 1 },
        { id: 2, name: 'Freizeit', icon: 'kategorie_ausgaben_1', balanceType: 'BT_EXPENSE', active: true, deletable: true, limits: null, limitsDate: null, deleted: false, account: 1 },
        { id: 3, name: 'Kleidung', icon: 'kategorie_ausgaben_1', balanceType: 'BT_EXPENSE', active: true, deletable: true, limits: null, limitsDate: null, deleted: false, account: 1 },
        { id: 4, name: 'Gesundheit', icon: 'kategorie_ausgaben_1', balanceType: 'BT_EXPENSE', active: true, deletable: true, limits: null, limitsDate: null, deleted: false, account: 1 },
        { id: 5, name: 'Lohn', icon: 'kategorie_einnahmen_2', balanceType: 'BT_INCOME', active: true, deletable: true, limits: null, limitsDate: null, deleted: false, account: 1 },
      ];

      const result = transformer.transformCategories(germanCustomCategories, 'account-de');

      expect(result).toHaveLength(5);
      const defaultIds = ['expense-household', 'expense-leisure', 'expense-clothing', 'expense-health', 'income-salary'];
      for (const cat of result) {
        expect(defaultIds).not.toContain(cat.id);
        expect(cat.isDefault).toBe(false);
      }
      // Names must be preserved exactly as the user entered them
      expect(result.map(c => c.name)).toEqual(['Haushalt', 'Freizeit', 'Kleidung', 'Gesundheit', 'Lohn']);
    });

    it('should still map non-deletable German-named categories to system defaults', () => {
      // Sanity check: a non-deletable (system-seeded) category named "Essen"
      // SHOULD still be mapped to expense-food — the flag is the discriminator.
      const legacyCategories: LegacyCategory[] = [
        {
          id: 10,
          name: 'Essen',
          icon: 'kategorie_ausgaben_3',
          balanceType: 'BT_EXPENSE',
          active: true,
          deletable: false, // ← non-deletable = system default
          limits: null,
          limitsDate: null,
          deleted: false,
          account: 1,
        },
      ];

      const result = transformer.transformCategories(legacyCategories, 'account-123');

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('expense-food');
      expect(result[0].name).toBe('category_food');
      expect(result[0].isDefault).toBe(true);
    });

    it('should handle mix of matched and unmatched categories', () => {
      const legacyCategories: LegacyCategory[] = [
        {
          id: 1,
          name: 'Food', // Matches default — deletable:false = system-seeded → gets default ID 'expense-food'
          icon: 'kategorie_ausgaben_1',
          balanceType: 'BT_EXPENSE',
          active: true,
          deletable: false, // non-deletable = system-seeded → maps to default
          limits: null,
          limitsDate: null,
          deleted: false,
          account: 1,
        },
        {
          id: 2,
          name: 'My Custom Expense', // Does not match → gets a fresh migration UUID
          icon: 'kategorie_ausgaben_2',
          balanceType: 'BT_EXPENSE',
          active: true,
          deletable: true,
          limits: null,
          limitsDate: null,
          deleted: false,
          account: 1,
        },
      ];

      const result = transformer.transformCategories(legacyCategories, 'account-123');

      // Both matched and unmatched categories are returned
      expect(result).toHaveLength(2);
      expect(result[0]).toEqual(expect.objectContaining({
        id: 'expense-food',
        name: 'category_food',
        type: 'expense',
        isDefault: true,
      }));
      expect(result[1].name).toBe('My Custom Expense');

      // Both should be in the ID map
      const categoryIdMap = (transformer as any).categoryIdMap;
      expect(categoryIdMap.get(1)).toBeDefined();
      expect(categoryIdMap.get(2)).toBeDefined();

      // Matched default uses the well-known default ID
      expect(categoryIdMap.get(1)).toBe('expense-food');

      // Unmatched custom category gets a fresh deterministic UUID (never the default ID)
      expect(categoryIdMap.get(2)).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
      expect(categoryIdMap.get(2)).not.toBe('expense-food');
    });

    it('should transform legacy categories to Budget Wise categories', () => {
      const legacyCategories: LegacyCategory[] = [
        {
          id: 1,
          name: 'Groceries',
          icon: 'kategorie_ausgaben_1',
          balanceType: 'BT_EXPENSE',
          active: true,
          deletable: true,
          limits: null,
          limitsDate: null,
          deleted: false,
          account: 1,
        },
        {
          id: 2,
          name: 'Salary',
          icon: 'kategorie_einnahmen_1',
          balanceType: 'BT_INCOME',
          active: true,
          deletable: false,
          limits: null,
          limitsDate: null,
          deleted: false,
          account: 1,
        },
      ];

      const result = transformer.transformCategories(legacyCategories, 'account-123');

      expect(result).toHaveLength(2);
      expect(result[0].name).toBe('Groceries');
      expect(result[0].type).toBe('expense');
      expect(result[0].isDefault).toBe(false); // deletable = true
      expect(result[0].accountId).toBe('account-123');
      expect(result[0].icon).toBe('cash'); // kategorie_ausgaben_1 → cash (Allgemein)

      // 'Salary' normalizes to 'category_salary' → matches income-salary default
      expect(result[1].name).toBe('category_salary'); // Uses matchedDefault.name (translation key)
      expect(result[1].type).toBe('income');
      expect(result[1].isDefault).toBe(true); // Matched default → always true
      expect(result[1].icon).toBe('money'); // income-salary default icon
    });

    it('should handle live API response with is_deletable field', () => {
      const legacyCategories: LegacyCategory[] = [
        {
          id: 1,
          name: 'Custom Unique Category',
          icon: 'kategorie_ausgaben_1',
          balanceType: 'BT_EXPENSE',
          active: true,
          is_deletable: true, // Live API uses is_deletable
          limits: null,
          limitsDate: null,
          deleted: false,
          account: 1,
        },
        {
          id: 2,
          name: 'Default Category',
          icon: 'kategorie_ausgaben_2',
          balanceType: 'BT_EXPENSE',
          active: true,
          is_deletable: false, // Non-deletable = default
          limits: null,
          limitsDate: null,
          deleted: false,
          account: 1,
        },
      ];

      const result = transformer.transformCategories(legacyCategories, 'account-123');

      expect(result).toHaveLength(2);
      expect(result[0].isDefault).toBe(false); // is_deletable = true
      expect(result[1].isDefault).toBe(true); // is_deletable = false
    });

    it('should default to deletable when neither field is present', () => {
      const legacyCategories: LegacyCategory[] = [
        {
          id: 1,
          name: 'Category Without Deletable Field',
          icon: 'kategorie_ausgaben_1',
          balanceType: 'BT_EXPENSE',
          active: true,
          // Neither deletable nor is_deletable present
          limits: null,
          limitsDate: null,
          deleted: false,
          account: 1,
        },
      ];

      const result = transformer.transformCategories(legacyCategories, 'account-123');

      expect(result).toHaveLength(1);
      expect(result[0].isDefault).toBe(false); // Defaults to deletable (not default)
    });

    it('should prioritize deletable over is_deletable when both present', () => {
      const legacyCategories: LegacyCategory[] = [
        {
          id: 1,
          name: 'Category With Both Fields',
          icon: 'kategorie_ausgaben_1',
          balanceType: 'BT_EXPENSE',
          active: true,
          deletable: false, // Should take precedence
          is_deletable: true,
          limits: null,
          limitsDate: null,
          deleted: false,
          account: 1,
        },
      ];

      const result = transformer.transformCategories(legacyCategories, 'account-123');

      expect(result).toHaveLength(1);
      expect(result[0].isDefault).toBe(true); // Uses deletable (false) → isDefault (true)
    });

    it('should skip deleted categories', () => {
      const legacyCategories: LegacyCategory[] = [
        {
          id: 1,
          name: 'Active Category',
          icon: 'kategorie_ausgaben_1',
          balanceType: 'BT_EXPENSE',
          active: true,
          deletable: true,
          limits: null,
          limitsDate: null,
          deleted: false,
          account: 1,
        },
        {
          id: 2,
          name: 'Deleted Category',
          icon: 'kategorie_ausgaben_2',
          balanceType: 'BT_EXPENSE',
          active: true,
          deletable: true,
          limits: null,
          limitsDate: null,
          deleted: true,
          account: 1,
        },
      ];

      const result = transformer.transformCategories(legacyCategories, 'account-123');

      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('Active Category');
    });

    it('should skip inactive categories', () => {
      const legacyCategories: LegacyCategory[] = [
        {
          id: 1,
          name: 'Active Category',
          icon: 'kategorie_ausgaben_1',
          balanceType: 'BT_EXPENSE',
          active: true,
          deletable: true,
          limits: null,
          limitsDate: null,
          deleted: false,
          account: 1,
        },
        {
          id: 2,
          name: 'Inactive Category',
          icon: 'kategorie_ausgaben_2',
          balanceType: 'BT_EXPENSE',
          active: false,
          deletable: true,
          limits: null,
          limitsDate: null,
          deleted: false,
          account: 1,
        },
      ];

      const result = transformer.transformCategories(legacyCategories, 'account-123');

      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('Active Category');
    });

    it('matched-default category: in returned array, ID in map, usable by transformTransactions', () => {
      // category_food + BT_EXPENSE matches DEFAULT_CATEGORIES entry 'expense-food'.
      // deletable:false = non-deletable = system-seeded → safe to map to the default.
      const legacyCategories: LegacyCategory[] = [
        {
          id: 42,
          name: 'Food',
          icon: 'kategorie_ausgaben_3',
          balanceType: 'BT_EXPENSE',
          active: true,
          deletable: false, // non-deletable = system-seeded → maps to default
          limits: null,
          limitsDate: null,
          deleted: false,
          account: 1,
        },
      ];

      const categories = transformer.transformCategories(legacyCategories, 'account-123');

      // Included in the returned array so importData() can remap it when
      // importing into a newly created account
      expect(categories).toHaveLength(1);
      expect(categories[0]).toEqual(expect.objectContaining({
        id: 'expense-food',
        name: 'category_food',
        isDefault: true,
      }));

      // Legacy ID 42 maps to the well-known default ID, not a migration UUID
      const categoryIdMap = (transformer as any).categoryIdMap;
      const mappedId = categoryIdMap.get(42);
      expect(mappedId).toBeDefined();
      expect(mappedId).toBe('expense-food');

      // The mapping is usable: a transaction referencing legacy ID 42 resolves to 'expense-food'
      const legacyBalances: LegacyBalance[] = [
        {
          id: 1,
          name: 'Lunch',
          balanceType: 'BT_EXPENSE',
          date: '2022-09-09T13:49:51.141000Z',
          amount: 12.5,
          deleted: false,
          account: 1,
          category: 42,
          saving_goal: null,
          recuring: null,
          user: 9,
          target_account: null,
          sender_account: null,
          target_balance_id: null,
          sender_balance_id: null,
          is_transfer_balance: null,
        },
      ];
      const transactions = transformer.transformTransactions(legacyBalances, 'account-123');

      expect(transactions).toHaveLength(1);
      expect(transactions[0].category).toBe('expense-food');
      expect((transformer as any).errors).toHaveLength(0);
    });

    it('unmatched category: present in returned array with a fresh UUID', () => {
      const legacyCategories: LegacyCategory[] = [
        {
          id: 7,
          name: 'My Custom Category', // No match in DEFAULT_CATEGORIES
          icon: 'kategorie_ausgaben_1',
          balanceType: 'BT_EXPENSE',
          active: true,
          deletable: true,
          limits: null,
          limitsDate: null,
          deleted: false,
          account: 1,
        },
      ];

      const categories = transformer.transformCategories(legacyCategories, 'account-123');

      expect(categories).toHaveLength(1);
      expect(categories[0].name).toBe('My Custom Category');
      // ID is a fresh migration UUID, not a default ID
      expect(categories[0].id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
      expect(categories[0].id).not.toBe('expense-food');
    });
  });

  // ===========================================================================
  // TRANSACTION TRANSFORMATION
  // ===========================================================================

  describe('transformTransactions', () => {
    beforeEach(() => {
      // Setup category mapping — use deletable:false so Food maps to the
      // stable default ID 'expense-food', giving transactions a resolvable ref.
      const legacyCategories: LegacyCategory[] = [
        {
          id: 1,
          name: 'Food',
          icon: 'kategorie_ausgaben_1',
          balanceType: 'BT_EXPENSE',
          active: true,
          deletable: false,
          limits: null,
          limitsDate: null,
          deleted: false,
          account: 1,
        },
      ];
      transformer.transformCategories(legacyCategories, 'account-123');
    });

    it('should transform legacy balances to Budget Wise transactions', () => {
      const legacyBalances: LegacyBalance[] = [
        {
          id: 1,
          name: 'Grocery Shopping',
          balanceType: 'BT_EXPENSE',
          date: '2022-09-09T13:49:51.141000Z',
          amount: 45.5,
          deleted: false,
          account: 1,
          category: 1,
          saving_goal: null,
          recuring: null,
          user: 9,
          target_account: null,
          sender_account: null,
          target_balance_id: null,
          sender_balance_id: null,
          is_transfer_balance: null,
        },
      ];

      const result = transformer.transformTransactions(legacyBalances, 'account-123');

      expect(result).toHaveLength(1);
      expect(result[0].title).toBe('Grocery Shopping');
      expect(result[0].type).toBe('expense');
      expect(result[0].date).toBe('2022-09-09'); // Date converted to YYYY-MM-DD
      expect(result[0].amount).toBe(45.5);
      expect(result[0].accountId).toBe('account-123');
      expect(result[0].createdAt).toBe('2022-09-09T13:49:51.141000Z'); // createdAt keeps ISO datetime for audit/ordering
    });

    it('should skip deleted transactions', () => {
      const legacyBalances: LegacyBalance[] = [
        {
          id: 1,
          name: 'Active Transaction',
          balanceType: 'BT_EXPENSE',
          date: '2022-09-09T13:49:51.141000Z',
          amount: 45.5,
          deleted: false,
          account: 1,
          category: 1,
          saving_goal: null,
          recuring: null,
          user: 9,
          target_account: null,
          sender_account: null,
          target_balance_id: null,
          sender_balance_id: null,
          is_transfer_balance: null,
        },
        {
          id: 2,
          name: 'Deleted Transaction',
          balanceType: 'BT_EXPENSE',
          date: '2022-09-09T13:49:51.141000Z',
          amount: 25.0,
          deleted: true,
          account: 1,
          category: 1,
          saving_goal: null,
          recuring: null,
          user: 9,
          target_account: null,
          sender_account: null,
          target_balance_id: null,
          sender_balance_id: null,
          is_transfer_balance: null,
        },
      ];

      const result = transformer.transformTransactions(legacyBalances, 'account-123');

      expect(result).toHaveLength(1);
      expect(result[0].title).toBe('Active Transaction');
    });

    it('should skip transfer transactions', () => {
      const legacyBalances: LegacyBalance[] = [
        {
          id: 1,
          name: 'Transfer to Savings',
          balanceType: 'BT_EXPENSE',
          date: '2022-09-09T13:49:51.141000Z',
          amount: 100.0,
          deleted: false,
          account: 1,
          category: 1,
          saving_goal: null,
          recuring: null,
          user: 9,
          target_account: 2, // Transfer indicator
          sender_account: null,
          target_balance_id: 123,
          sender_balance_id: null,
          is_transfer_balance: true,
        },
      ];

      const result = transformer.transformTransactions(legacyBalances, 'account-123');

      expect(result).toHaveLength(0);
    });

    it('should not skip transactions where transfer fields are undefined (absent from API response)', () => {
      // The legacy API sometimes omits transfer fields entirely (undefined),
      // which must not be treated as a transfer — undefined != null is false.
      const legacyBalances: LegacyBalance[] = [
        {
          id: 1,
          name: 'Normal Expense',
          balanceType: 'BT_EXPENSE',
          date: '2022-09-09T13:49:51.141000Z',
          amount: 25.0,
          deleted: false,
          account: 1,
          category: 1,
          saving_goal: null,
          recuring: null,
          user: 9,
          // target_account, sender_account, is_transfer_balance intentionally absent
        } as any,
      ];

      const result = transformer.transformTransactions(legacyBalances, 'account-123');

      expect(result).toHaveLength(1);
      expect(result[0].title).toBe('Normal Expense');
    });

    it('should mark recurring transactions', () => {
      const legacyBalances: LegacyBalance[] = [
        {
          id: 1,
          name: 'Monthly Subscription',
          balanceType: 'BT_EXPENSE',
          date: '2022-09-09T13:49:51.141000Z',
          amount: 9.99,
          deleted: false,
          account: 1,
          category: 1,
          saving_goal: null,
          recuring: 5, // Linked to recurring item
          user: 9,
          target_account: null,
          sender_account: null,
          target_balance_id: null,
          sender_balance_id: null,
          is_transfer_balance: null,
        },
      ];

      const result = transformer.transformTransactions(legacyBalances, 'account-123');

      expect(result).toHaveLength(1);
      expect(result[0].isRecurring).toBe(true);
    });

    it('should handle savings goal ID 0 correctly', () => {
      // Setup savings goal with ID 0
      const legacySavingGoals: LegacySavingGoal[] = [
        {
          id: 0,
          name: 'Emergency Fund',
          created_at: '2022-10-12T09:30:24.065300Z',
          dueDate: '2023-12-31',
          amount: 5000.0,
          monthly_amount: 500.0,
          isopen: true,
          deleted: false,
          category: 1,
        },
      ];
      transformer.transformSavingsGoals(legacySavingGoals, 'account-123');

      const legacyBalances: LegacyBalance[] = [
        {
          id: 1,
          name: 'Emergency Contribution',
          balanceType: 'BT_EXPENSE',
          date: '2022-09-09T13:49:51.141000Z',
          amount: 100.0,
          deleted: false,
          account: 1,
          category: 1,
          saving_goal: 0, // ID 0 should be treated as valid
          recuring: null,
          user: 9,
          target_account: null,
          sender_account: null,
          target_balance_id: null,
          sender_balance_id: null,
          is_transfer_balance: null,
        },
      ];

      const result = transformer.transformTransactions(legacyBalances, 'account-123');

      expect(result).toHaveLength(1);
      expect(result[0].savingsGoalId).toBeDefined();
      expect(result[0].savingsGoalId).not.toBeUndefined();
    });

    it('should skip transactions with null category', () => {
      const legacyBalances: LegacyBalance[] = [
        {
          id: 1,
          name: 'Transaction Without Category',
          balanceType: 'BT_EXPENSE',
          date: '2022-09-09T13:49:51.141000Z',
          amount: 50.0,
          deleted: false,
          account: 1,
          category: null, // No category assigned
          saving_goal: null,
          recuring: null,
          user: 9,
          target_account: null,
          sender_account: null,
          target_balance_id: null,
          sender_balance_id: null,
          is_transfer_balance: null,
        },
      ];

      const result = transformer.transformTransactions(legacyBalances, 'account-123');

      expect(result).toHaveLength(0);
      // Verify error message is clear
      const errors = (transformer as any).errors;
      expect(errors.some((e: string) => e.includes('has no category'))).toBe(true);
      expect(errors.some((e: string) => e.includes('Transaction Without Category'))).toBe(true);
    });

    it('should backfill recurringItemId FK that resolves to transformed recurring item ID', () => {
      // Setup: transform a recurring item so it gets a deterministic UUID
      const legacyRecurring: LegacyRecuring[] = [
        {
          id: 42,
          account: 1,
          name: 'Monthly Rent',
          balanceType: 'BT_EXPENSE',
          startDate: '2022-01-01',
          endDate: '2024-12-31',
          amount: 1000.0,
          repeating: 1, // Monthly
          category: 1,
        },
      ];

      const recurringItems = transformer.transformRecurringItems(legacyRecurring, 'account-123');

      // The recurring item's ID is generated via migrationId('recurring', 'account-123', 42)
      expect(recurringItems).toHaveLength(1);
      const recurringItemId = recurringItems[0].id;

      // Now transform a transaction that was generated from this recurring item
      const legacyBalances: LegacyBalance[] = [
        {
          id: 100,
          name: 'Monthly Rent',
          balanceType: 'BT_EXPENSE',
          date: '2022-03-01T10:00:00.000Z',
          amount: 1000.0,
          deleted: false,
          account: 1,
          category: 1,
          saving_goal: null,
          recuring: 42, // Links back to the recurring item with legacy ID 42
          user: 9,
          target_account: null,
          sender_account: null,
          target_balance_id: null,
          sender_balance_id: null,
          is_transfer_balance: null,
        },
      ];

      const transactions = transformer.transformTransactions(legacyBalances, 'account-123');

      expect(transactions).toHaveLength(1);
      expect(transactions[0].isRecurring).toBe(true);
      expect(transactions[0].recurringItemId).toBeDefined();

      // The FK should resolve: transaction.recurringItemId === recurringItem.id
      // Both use migrationId('recurring', 'account-123', 42) so they match
      expect(transactions[0].recurringItemId).toBe(recurringItemId);
    });
  });

  // ===========================================================================
  // LIMIT TRANSFORMATION
  // ===========================================================================

  describe('transformLimits', () => {
    beforeEach(() => {
      // Setup category mapping — deletable:false so Food maps to expense-food
      const legacyCategories: LegacyCategory[] = [
        {
          id: 1,
          name: 'Food',
          icon: 'kategorie_ausgaben_1',
          balanceType: 'BT_EXPENSE',
          active: true,
          deletable: false,
          limits: 500.0,
          limitsDate: '2023-12-10T13:49:51.141Z',
          deleted: false,
          account: 1,
        },
      ];
      transformer.transformCategories(legacyCategories, 'account-123');
    });

    it('should extract limits from categories', () => {
      const legacyCategories: LegacyCategory[] = [
        {
          id: 1,
          name: 'Food',
          icon: 'kategorie_ausgaben_1',
          balanceType: 'BT_EXPENSE',
          active: true,
          deletable: false,
          limits: 500.0,
          limitsDate: '2023-12-10T13:49:51.141Z',
          deleted: false,
          account: 1,
        },
      ];

      const result = transformer.transformLimits(legacyCategories, 'account-123');

      expect(result).toHaveLength(1);
      expect(result[0].amount).toBe(500.0);
      expect(result[0].accountId).toBe('account-123');
    });

    it('should skip categories without limits', () => {
      const legacyCategories: LegacyCategory[] = [
        {
          id: 1,
          name: 'Food',
          icon: 'kategorie_ausgaben_1',
          balanceType: 'BT_EXPENSE',
          active: true,
          deletable: true,
          limits: null,
          limitsDate: null,
          deleted: false,
          account: 1,
        },
      ];

      const result = transformer.transformLimits(legacyCategories, 'account-123');

      expect(result).toHaveLength(0);
    });
  });

  // ===========================================================================
  // RECURRING ITEM TRANSFORMATION
  // ===========================================================================

  describe('transformRecurringItems', () => {
    beforeEach(() => {
      // Setup category mapping
      const legacyCategories: LegacyCategory[] = [
        {
          id: 1,
          name: 'Subscriptions',
          icon: 'kategorie_ausgaben_1',
          balanceType: 'BT_EXPENSE',
          active: true,
          deletable: true,
          limits: null,
          limitsDate: null,
          deleted: false,
          account: 1,
        },
      ];
      transformer.transformCategories(legacyCategories, 'account-123');
    });

    it('should transform recurring items with monthly frequency', () => {
      const legacyRecurring: LegacyRecuring[] = [
        {
          id: 1,
          account: 1,
          name: 'Netflix',
          balanceType: 'BT_EXPENSE',
          startDate: '2022-11-01',
          endDate: '2024-11-01',
          amount: 12.99,
          repeating: 1, // Monthly
          category: 1,
        },
      ];

      const result = transformer.transformRecurringItems(legacyRecurring, 'account-123');

      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('Netflix');
      expect(result[0].frequency).toBe('monthly');
      expect(result[0].startDate).toBe('2022-11-01');
      expect(result[0].endDate).toBe('2024-11-01');
      expect(result[0].amount).toBe(12.99);
    });

    it('keeps an open-ended recurring item without an end date', () => {
      const result = transformer.transformRecurringItems([
        {
          id: 2,
          account: 1,
          name: 'Gym',
          balanceType: 'BT_EXPENSE',
          startDate: '2023-02-15T00:00:00',
          endDate: null,
          amount: 30,
          repeating: 1,
          category: 1,
        },
      ], 'account-123');

      expect(result[0].startDate).toBe('2023-02-15');
      expect(result[0].endDate).toBeNull();
    });

    it('should transform recurring items with custom frequency', () => {
      const legacyRecurring: LegacyRecuring[] = [
        {
          id: 1,
          account: 1,
          name: 'Quarterly Payment',
          balanceType: 'BT_EXPENSE',
          startDate: '2022-11-01',
          endDate: '2024-11-01',
          amount: 300.0,
          repeating: 3, // Every 3 months
          category: 1,
        },
      ];

      const result = transformer.transformRecurringItems(legacyRecurring, 'account-123');

      expect(result).toHaveLength(1);
      expect(result[0].frequency).toBe('every_3_months');
    });

    it('should skip deleted recurring items', () => {
      const legacyRecurring: LegacyRecuring[] = [
        {
          id: 1,
          account: 1,
          name: 'Deleted Subscription',
          balanceType: 'BT_EXPENSE',
          startDate: '2022-11-01',
          endDate: '2024-11-01',
          amount: 9.99,
          repeating: 1,
          category: 1,
          deleted: true,
        },
      ];

      const result = transformer.transformRecurringItems(legacyRecurring, 'account-123');

      expect(result).toHaveLength(0);
    });

    it('should skip recurring items with invalid repeating interval (zero)', () => {
      const legacyRecurring: LegacyRecuring[] = [
        {
          id: 1,
          account: 1,
          name: 'Invalid Zero Interval',
          balanceType: 'BT_EXPENSE',
          startDate: '2022-11-01',
          endDate: '2024-11-01',
          amount: 50.0,
          repeating: 0, // Invalid: zero
          category: 1,
        },
      ];

      const result = transformer.transformRecurringItems(legacyRecurring, 'account-123');

      expect(result).toHaveLength(0);
      // Verify error message
      const errors = (transformer as any).errors;
      expect(errors.some((e: string) => e.includes('invalid repeating interval: 0'))).toBe(true);
    });

    it('should skip recurring items with invalid repeating interval (negative)', () => {
      const legacyRecurring: LegacyRecuring[] = [
        {
          id: 1,
          account: 1,
          name: 'Invalid Negative Interval',
          balanceType: 'BT_EXPENSE',
          startDate: '2022-11-01',
          endDate: '2024-11-01',
          amount: 50.0,
          repeating: -5, // Invalid: negative
          category: 1,
        },
      ];

      const result = transformer.transformRecurringItems(legacyRecurring, 'account-123');

      expect(result).toHaveLength(0);
      // Verify error message
      const errors = (transformer as any).errors;
      expect(errors.some((e: string) => e.includes('invalid repeating interval: -5'))).toBe(true);
    });

    it('should skip recurring items with invalid repeating interval (too large)', () => {
      const legacyRecurring: LegacyRecuring[] = [
        {
          id: 1,
          account: 1,
          name: 'Invalid Large Interval',
          balanceType: 'BT_EXPENSE',
          startDate: '2022-11-01',
          endDate: '2024-11-01',
          amount: 50.0,
          repeating: 150, // Invalid: > 120 months (10 years)
          category: 1,
        },
      ];

      const result = transformer.transformRecurringItems(legacyRecurring, 'account-123');

      expect(result).toHaveLength(0);
      // Verify error message
      const errors = (transformer as any).errors;
      expect(errors.some((e: string) => e.includes('invalid repeating interval: 150'))).toBe(true);
    });

    it('should skip recurring items with invalid repeating interval (decimal)', () => {
      const legacyRecurring: LegacyRecuring[] = [
        {
          id: 1,
          account: 1,
          name: 'Invalid Decimal Interval',
          balanceType: 'BT_EXPENSE',
          startDate: '2022-11-01',
          endDate: '2024-11-01',
          amount: 50.0,
          repeating: 1.5, // Invalid: not an integer
          category: 1,
        },
      ];

      const result = transformer.transformRecurringItems(legacyRecurring, 'account-123');

      expect(result).toHaveLength(0);
      // Verify error message
      const errors = (transformer as any).errors;
      expect(errors.some((e: string) => e.includes('invalid repeating interval: 1.5'))).toBe(true);
    });

    it('should handle valid edge case intervals', () => {
      const legacyRecurring: LegacyRecuring[] = [
        {
          id: 1,
          account: 1,
          name: 'Bimonthly',
          balanceType: 'BT_EXPENSE',
          startDate: '2022-11-01',
          endDate: '2024-11-01',
          amount: 50.0,
          repeating: 2,
          category: 1,
        },
        {
          id: 2,
          account: 1,
          name: 'Yearly',
          balanceType: 'BT_EXPENSE',
          startDate: '2022-11-01',
          endDate: '2024-11-01',
          amount: 1200.0,
          repeating: 12,
          category: 1,
        },
        {
          id: 3,
          account: 1,
          name: 'Every 10 Years',
          balanceType: 'BT_EXPENSE',
          startDate: '2022-11-01',
          endDate: '2032-11-01',
          amount: 5000.0,
          repeating: 120, // Max valid: 10 years
          category: 1,
        },
      ];

      const result = transformer.transformRecurringItems(legacyRecurring, 'account-123');

      expect(result).toHaveLength(3);
      expect(result[0].frequency).toBe('every_2_months');
      expect(result[1].frequency).toBe('every_12_months');
      expect(result[2].frequency).toBe('every_120_months');
    });
  });

  // ===========================================================================
  // SAVINGS GOAL TRANSFORMATION
  // ===========================================================================

  describe('transformSavingsGoals', () => {
    beforeEach(() => {
      // Setup category mapping
      const legacyCategories: LegacyCategory[] = [
        {
          id: 1,
          name: 'Savings',
          icon: 'kategorie_einnahmen_1',
          balanceType: 'BT_INCOME',
          active: true,
          deletable: true,
          limits: null,
          limitsDate: null,
          deleted: false,
          account: 1,
        },
      ];
      transformer.transformCategories(legacyCategories, 'account-123');
    });

    it('should transform savings goals', () => {
      const legacySavingGoals: LegacySavingGoal[] = [
        {
          id: 1,
          name: 'Vacation Fund',
          created_at: '2022-10-12T09:30:24.065300Z',
          dueDate: '2023-12-31',
          amount: 2000.0,
          monthly_amount: 200.0,
          isopen: true,
          deleted: false,
          category: 1,
        },
      ];

      const result = transformer.transformSavingsGoals(legacySavingGoals, 'account-123');

      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('Vacation Fund');
      expect(result[0].targetAmount).toBe(2000.0);
      expect(result[0].deadline).toBe('2023-12-31');
      expect(result[0].monthlyAmount).toBe(200.0);
    });

    it('should handle date field from GET response', () => {
      const legacySavingGoals: LegacySavingGoal[] = [
        {
          id: 1,
          name: 'Emergency Fund',
          created_at: '2022-10-12T09:30:24.065300Z',
          dueDate: '2023-12-31T00:00:00.000Z', // Can be ISO datetime
          amount: 5000.0,
          monthly_amount: 500.0,
          isopen: true,
          deleted: false,
          category: 1,
        },
      ];

      const result = transformer.transformSavingsGoals(legacySavingGoals, 'account-123');

      expect(result).toHaveLength(1);
      expect(result[0].deadline).toBe('2023-12-31');
    });

    it('should skip deleted savings goals', () => {
      const legacySavingGoals: LegacySavingGoal[] = [
        {
          id: 1,
          name: 'Deleted Goal',
          created_at: '2022-10-12T09:30:24.065300Z',
          dueDate: '2023-12-31',
          amount: 1000.0,
          monthly_amount: 100.0,
          isopen: false,
          deleted: true,
          category: 1,
        },
      ];

      const result = transformer.transformSavingsGoals(legacySavingGoals, 'account-123');

      expect(result).toHaveLength(0);
    });

    it('should skip savings goals with unknown category references', () => {
      const legacySavingGoals: LegacySavingGoal[] = [
        {
          id: 1,
          name: 'Orphan Goal',
          created_at: '2022-10-12T09:30:24.065300Z',
          dueDate: '2023-12-31',
          amount: 1000.0,
          monthly_amount: 100.0,
          isopen: true,
          deleted: false,
          category: 999, // Non-existent category
        },
      ];

      const result = transformer.transformSavingsGoals(legacySavingGoals, 'account-123');

      expect(result).toHaveLength(0);
    });

    it('should not register orphaned savings goal in map — transaction referencing it gets undefined savingsGoalId', () => {
      // Goal references unknown category → skipped → not in savingsGoalIdMap
      const legacySavingGoals: LegacySavingGoal[] = [
        {
          id: 5,
          name: 'Orphan Goal',
          created_at: '2022-10-12T09:30:24.065300Z',
          dueDate: '2023-12-31',
          amount: 1000.0,
          monthly_amount: 100.0,
          isopen: true,
          deleted: false,
          category: 999, // Unknown category — goal will be skipped
        },
      ];
      transformer.transformSavingsGoals(legacySavingGoals, 'account-123');

      // Transaction references the orphaned goal
      const legacyBalances: LegacyBalance[] = [
        {
          id: 1,
          name: 'Contribution',
          balanceType: 'BT_EXPENSE',
          date: '2022-09-09T13:49:51.141000Z',
          amount: 100.0,
          deleted: false,
          account: 1,
          category: 1, // Valid category (set up in beforeEach)
          saving_goal: 5, // References the skipped goal
          recuring: null,
          user: 9,
          target_account: null,
          sender_account: null,
          target_balance_id: null,
          sender_balance_id: null,
          is_transfer_balance: null,
        },
      ];

      const result = transformer.transformTransactions(legacyBalances, 'account-123');

      expect(result).toHaveLength(1);
      expect(result[0].savingsGoalId).toBeUndefined();
    });
  });

  // ===========================================================================
  // FULL TRANSFORMATION
  // ===========================================================================

  describe('transform (full)', () => {
    it('should transform complete legacy data', () => {
      const legacyData: LegacyUserData = {
        accounts: [
          {
            id: 1,
            name: 'Main Account',
            description: 'My main budget',
            acronym: 'MA',
            color: '#ff8840',
            created_at: '2022-11-21T17:37:28.556360Z',
            last_change: '2022-11-21T17:37:28.556451Z',
            deleted: false,
            last_synced: null,
            version: '1fbebc5a-c877-4d95-9146-6a23172ac74b',
            user: 3,
          },
        ],
        accesses: [],
        categories: [
          {
            id: 1,
            name: 'Food',
            icon: 'kategorie_ausgaben_1',
            balanceType: 'BT_EXPENSE',
            active: true,
            deletable: false, // non-deletable = system-seeded → maps to expense-food
            limits: 500.0,
            limitsDate: null,
            deleted: false,
            account: 1,
          },
        ],
        balances: [
          {
            id: 1,
            name: 'Groceries',
            balanceType: 'BT_EXPENSE',
            date: '2022-09-09T13:49:51.141000Z',
            amount: 45.5,
            deleted: false,
            account: 1,
            category: 1,
            saving_goal: null,
            recuring: null,
            user: 9,
            target_account: null,
            sender_account: null,
            target_balance_id: null,
            sender_balance_id: null,
            is_transfer_balance: null,
          },
        ],
        recurings: [],
        savingGoals: [],
        limits: [],
      };

      const result = transformer.transform(legacyData);

      expect(result.data.account.name).toBe('Main Account');
      expect(result.data.categories).toHaveLength(1);
      expect(result.data.transactions).toHaveLength(1);
      expect(result.data.limits).toHaveLength(1);
      expect(result.errors).toHaveLength(0);
    });

    it('should preserve savings goal references in transactions', () => {
      const legacyData: LegacyUserData = {
        accounts: [
          {
            id: 1,
            name: 'Main Account',
            description: 'My main budget',
            acronym: 'MA',
            color: '#ff8840',
            created_at: '2022-11-21T17:37:28.556360Z',
            last_change: '2022-11-21T17:37:28.556451Z',
            deleted: false,
            last_synced: null,
            version: '1fbebc5a-c877-4d95-9146-6a23172ac74b',
            user: 3,
          },
        ],
        accesses: [],
        categories: [
          {
            id: 1,
            name: 'Savings',
            icon: 'kategorie_einnahmen_1',
            balanceType: 'BT_INCOME',
            active: true,
            deletable: true,
            limits: null,
            limitsDate: null,
            deleted: false,
            account: 1,
          },
        ],
        savingGoals: [
          {
            id: 5,
            name: 'Vacation Fund',
            created_at: '2022-10-12T09:30:24.065300Z',
            dueDate: '2023-12-31',
            amount: 2000.0,
            monthly_amount: 200.0,
            isopen: true,
            deleted: false,
            category: 1,
          },
        ],
        balances: [
          {
            id: 1,
            name: 'Vacation Contribution',
            balanceType: 'BT_EXPENSE',
            date: '2022-09-09T13:49:51.141000Z',
            amount: 200.0,
            deleted: false,
            account: 1,
            category: 1,
            saving_goal: 5, // Should be mapped to new UUID
            recuring: null,
            user: 9,
            target_account: null,
            sender_account: null,
            target_balance_id: null,
            sender_balance_id: null,
            is_transfer_balance: null,
          },
        ],
        recurings: [],
        limits: [],
      };

      const result = transformer.transform(legacyData);

      expect(result.data.savingsGoals).toHaveLength(1);
      expect(result.data.transactions).toHaveLength(1);
      expect(result.data.transactions[0].savingsGoalId).toBeDefined();
      expect(result.data.transactions[0].savingsGoalId).toBe(result.data.savingsGoals[0].id);
      expect(result.errors).toHaveLength(0);
    });

    it('should handle empty legacy data', () => {
      const legacyData: LegacyUserData = {
        accounts: [],
        accesses: [],
        categories: [],
        balances: [],
        recurings: [],
        savingGoals: [],
        limits: [],
      };

      const result = transformer.transform(legacyData);

      expect(result.errors).toContain('No accounts found in legacy data');
      expect(result.data.transactions).toHaveLength(0);
    });

    it('should handle all deleted accounts', () => {
      const legacyData: LegacyUserData = {
        accounts: [
          {
            id: 1,
            name: 'Deleted Account 1',
            description: null,
            acronym: 'DA1',
            color: null,
            created_at: '2022-11-21T17:37:28.556360Z',
            last_change: '2022-11-21T17:37:28.556451Z',
            deleted: true, // Deleted
            last_synced: null,
            version: '1fbebc5a-c877-4d95-9146-6a23172ac74b',
            user: 3,
          },
          {
            id: 2,
            name: 'Deleted Account 2',
            description: null,
            acronym: 'DA2',
            color: null,
            created_at: '2022-11-21T17:37:28.556360Z',
            last_change: '2022-11-21T17:37:28.556451Z',
            deleted: true, // Also deleted
            last_synced: null,
            version: '2fbebc5a-c877-4d95-9146-6a23172ac74b',
            user: 3,
          },
        ],
        accesses: [],
        categories: [],
        balances: [],
        recurings: [],
        savingGoals: [],
        limits: [],
      };

      const result = transformer.transform(legacyData);

      expect(result.errors).toContain('No active accounts found - all accounts are deleted');
      expect(result.data.transactions).toHaveLength(0);
      expect(result.data.categories).toHaveLength(0);
    });

    it('should transform only the first account when multiple active accounts are passed', () => {
      // The transformer is single-account per call by design.
      // MigrationService splits by account and calls transform() once per account.
      const legacyData: LegacyUserData = {
        accounts: [
          {
            id: 1,
            name: 'Personal Account',
            description: 'My personal budget',
            acronym: 'PA',
            color: '#ff8840',
            created_at: '2022-11-21T17:37:28.556360Z',
            last_change: '2022-11-21T17:37:28.556451Z',
            deleted: false,
            last_synced: null,
            version: '1fbebc5a-c877-4d95-9146-6a23172ac74b',
            user: 3,
          },
          {
            id: 2,
            name: 'Business Account',
            description: 'My business budget',
            acronym: 'BA',
            color: '#00ff00',
            created_at: '2022-11-21T17:37:28.556360Z',
            last_change: '2022-11-21T17:37:28.556451Z',
            deleted: false,
            last_synced: null,
            version: '2fbebc5a-c877-4d95-9146-6a23172ac74b',
            user: 3,
          },
        ],
        accesses: [],
        categories: [],
        balances: [],
        recurings: [],
        savingGoals: [],
        limits: [],
      };

      const result = transformer.transform(legacyData);

      // Uses the first active account — no warning emitted
      expect(result.data.account.name).toBe('Personal Account');
      expect(result.errors).toHaveLength(0);
    });

    it('should collect validation errors', () => {
      const legacyData: LegacyUserData = {
        accounts: [
          {
            id: 1,
            name: 'Main Account',
            description: null,
            acronym: 'MA',
            color: null,
            created_at: '2022-11-21T17:37:28.556360Z',
            last_change: '2022-11-21T17:37:28.556451Z',
            deleted: false,
            last_synced: null,
            version: '1fbebc5a-c877-4d95-9146-6a23172ac74b',
            user: 3,
          },
        ],
        accesses: [],
        categories: [],
        balances: [
          {
            id: 1,
            name: 'Orphan Transaction',
            balanceType: 'BT_EXPENSE',
            date: '2022-09-09T13:49:51.141000Z',
            amount: 45.5,
            deleted: false,
            account: 1,
            category: 999, // Non-existent category
            saving_goal: null,
            recuring: null,
            user: 9,
            target_account: null,
            sender_account: null,
            target_balance_id: null,
            sender_balance_id: null,
            is_transfer_balance: null,
          },
        ],
        recurings: [],
        savingGoals: [],
        limits: [],
      };

      const result = transformer.transform(legacyData);

      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors.some(e => e.includes('unknown category'))).toBe(true);
    });

    it('should produce no errors when transaction references a matched default category', () => {
      // category_food + BT_EXPENSE matches the default 'expense-food' entry.
      // The transformer reuses 'expense-food' as the category ID — no UUID is generated.
      const legacyData: LegacyUserData = {
        accounts: [
          {
            id: 1,
            name: 'Main Account',
            description: null,
            acronym: 'MA',
            color: null,
            created_at: '2022-11-21T17:37:28.556360Z',
            last_change: '2022-11-21T17:37:28.556451Z',
            deleted: false,
            last_synced: null,
            version: '1fbebc5a-c877-4d95-9146-6a23172ac74b',
            user: 3,
          },
        ],
        accesses: [],
        categories: [
          {
            id: 1,
            name: 'Food', // Matches default 'expense-food'
            icon: 'kategorie_ausgaben_3',
            balanceType: 'BT_EXPENSE',
            active: true,
            deletable: false, // non-deletable = system-seeded → maps to expense-food
            limits: null,
            limitsDate: null,
            deleted: false,
            account: 1,
          },
        ],
        balances: [
          {
            id: 1,
            name: 'Lunch',
            balanceType: 'BT_EXPENSE',
            date: '2022-09-09T13:49:51.141000Z',
            amount: 12.5,
            deleted: false,
            account: 1,
            category: 1, // References the matched default category
            saving_goal: null,
            recuring: null,
            user: 9,
            target_account: null,
            sender_account: null,
            target_balance_id: null,
            sender_balance_id: null,
            is_transfer_balance: null,
          },
        ],
        recurings: [],
        savingGoals: [],
        limits: [],
      };

      const result = transformer.transform(legacyData);

      // Zero errors: the matched category IS in the returned array, so validateReferences passes
      expect(result.errors).toHaveLength(0);
      expect(result.data.categories).toHaveLength(1);
      expect(result.data.categories[0].id).toBe('expense-food');
      expect(result.data.transactions).toHaveLength(1);
      // Transaction category is the well-known default ID, not a migration UUID
      expect(result.data.transactions[0].category).toBe('expense-food');
    });
  });
});
