import { describe, expect, it } from 'vitest';
import {
  findDefaultCategoryForLegacy,
  legacyCategoryIconKey,
  mapLegacyCategoryToMigrationCategory,
  normalizeLegacyCategoryName,
  toLegacyTransactionType,
} from './legacy-category-mapping.js';

describe('legacy category mapping', () => {
  it('normalizes verified German legacy category names to translation keys', () => {
    expect(normalizeLegacyCategoryName('Essen')).toBe('category_food');
    expect(normalizeLegacyCategoryName('Lohn')).toBe('category_salary');
    expect(normalizeLegacyCategoryName('Schatz')).toBe('Schatz');
    expect(normalizeLegacyCategoryName('My Custom Category')).toBe('My Custom Category');
  });

  it('maps legacy category type encodings to transaction types', () => {
    expect(toLegacyTransactionType(true)).toBe('income');
    expect(toLegacyTransactionType(false)).toBe('expense');
    expect(toLegacyTransactionType(1)).toBe('income');
    expect(toLegacyTransactionType(0)).toBe('expense');
    expect(toLegacyTransactionType('BT_INCOME')).toBe('income');
    expect(toLegacyTransactionType('BT_EXPENSE')).toBe('expense');
  });

  it('maps iOS image numbers and legacy icon resource names to icon keys', () => {
    expect(legacyCategoryIconKey(3, 'expense')).toBe('lucide:food');
    expect(legacyCategoryIconKey(2, 'income')).toBe('money');
    expect(legacyCategoryIconKey('kategorie_ausgaben_16', 'BT_EXPENSE')).toBe('lucide:car');
    expect(legacyCategoryIconKey(undefined, 'income')).toBe('cash');
  });

  it('matches default categories by normalized name and type', () => {
    expect(findDefaultCategoryForLegacy('Allgemein', 'income')?.id).toBe('income-general');
    expect(findDefaultCategoryForLegacy('Allgemein', 'expense')?.id).toBe('expense-general');
    expect(findDefaultCategoryForLegacy('Geschenk', 'income')?.id).toBe('income-gift');
    expect(findDefaultCategoryForLegacy('Geschenk', 'expense')?.id).toBe('expense-gift');
  });

  it('uses default IDs when available and deterministic custom IDs otherwise', () => {
    // isDefault: true → system-seeded → must map to the stable default entry
    expect(mapLegacyCategoryToMigrationCategory({
      legacyId: 1,
      name: 'Essen',
      type: 'expense',
      icon: 3,
      isDefault: true,
    })).toMatchObject({
      id: 'expense-food',
      name: 'category_food',
      type: 'expense',
      icon: 'lucide:food',
      isDefault: true,
    });

    // isDefault: false → preserve as user-created in the mapped payload, even
    // though "Essen" normalises to category_food. importData owns final matching.
    const userCreatedEssen = mapLegacyCategoryToMigrationCategory({
      legacyId: 99,
      name: 'Essen',
      type: 'expense',
      icon: 3,
      isDefault: false,
    });
    expect(userCreatedEssen.id).not.toBe('expense-food');
    expect(userCreatedEssen.isDefault).toBe(false);
    expect(userCreatedEssen.name).toBe('Essen');

    const custom = mapLegacyCategoryToMigrationCategory({
      legacyId: 'custom-1',
      name: 'Board Games',
      type: 'expense',
      icon: 11,
    });

    expect(custom.name).toBe('Board Games');
    expect(custom.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(custom.isDefault).toBe(false);
  });

  it('keeps legacy defaults as custom categories when no modern default corresponds', () => {
    const schatz = mapLegacyCategoryToMigrationCategory({
      legacyId: 'core_data:schatz',
      name: 'Schatz',
      type: 'expense',
      icon: 9,
      isDefault: true,
    });

    expect(schatz).toMatchObject({
      name: 'Schatz',
      type: 'expense',
      icon: 'lucide:heart',
      isDefault: false,
    });
    expect(schatz.id).toMatch(/^[0-9a-f-]{36}$/);
  });
});
