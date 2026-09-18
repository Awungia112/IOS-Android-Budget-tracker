import { describe, it, expect } from 'vitest';
import { CategoryService } from './category.service.js';
import { CATEGORY_COLORS } from '../constants/category-mappings.js';
import type { Category } from '../types/index.js';

describe('CategoryService', () => {
  describe('getDefaultColor', () => {
    it('returns green for income type', () => {
      expect(CategoryService.getDefaultColor('income')).toBe(CATEGORY_COLORS.green);
    });

    it('returns pink for expense type', () => {
      expect(CategoryService.getDefaultColor('expense')).toBe(CATEGORY_COLORS.pink);
    });
  });

  describe('resolveColor', () => {
    it('returns custom color when set', () => {
      const category: Category = {
        id: 'custom-1',
        name: 'Test',
        type: 'expense',
        isDefault: false,
        accountId: 'acc-1',
        color: '#FF0000',
      };
      expect(CategoryService.resolveColor(category)).toBe('#FF0000');
    });

    it('returns preset color for preset category without custom color', () => {
      const category: Category = {
        id: 'income-salary',
        name: 'category_salary',
        type: 'income',
        isDefault: true,
        accountId: 'acc-1',
      };
      expect(CategoryService.resolveColor(category)).toBe('#059669');
    });

    it('returns type default for non-preset category without custom color', () => {
      const category: Category = {
        id: 'unknown-id',
        name: 'My Custom',
        type: 'expense',
        isDefault: false,
        accountId: 'acc-1',
      };
      expect(CategoryService.resolveColor(category)).toBe(CATEGORY_COLORS.pink);
    });

    it('prioritizes custom color over preset color', () => {
      const category: Category = {
        id: 'income-salary',
        name: 'category_salary',
        type: 'income',
        isDefault: true,
        accountId: 'acc-1',
        color: '#ABCDEF',
      };
      expect(CategoryService.resolveColor(category)).toBe('#ABCDEF');
    });
  });

  describe('isTranslationKey', () => {
    it('returns true for category_ prefixed names', () => {
      expect(CategoryService.isTranslationKey('category_food')).toBe(true);
      expect(CategoryService.isTranslationKey('category_salary')).toBe(true);
    });

    it('returns false for non-prefixed names', () => {
      expect(CategoryService.isTranslationKey('Essen')).toBe(false);
      expect(CategoryService.isTranslationKey('Food')).toBe(false);
      expect(CategoryService.isTranslationKey('my_category')).toBe(false);
    });

    it('returns false for empty string', () => {
      expect(CategoryService.isTranslationKey('')).toBe(false);
    });
  });

  describe('getLegacyNameKey', () => {
    it('maps German legacy names to translation keys', () => {
      expect(CategoryService.getLegacyNameKey('Lohn')).toBe('category_salary');
      expect(CategoryService.getLegacyNameKey('Haushalt')).toBe('category_household');
      expect(CategoryService.getLegacyNameKey('Allgemein')).toBe('category_general');
    });

    it('maps English legacy names to translation keys', () => {
      expect(CategoryService.getLegacyNameKey('Salary')).toBe('category_salary');
      expect(CategoryService.getLegacyNameKey('Food')).toBe('category_food');
      expect(CategoryService.getLegacyNameKey('Housing')).toBe('category_housing');
    });

    it('returns null for unknown names', () => {
      expect(CategoryService.getLegacyNameKey('RandomName')).toBeNull();
      expect(CategoryService.getLegacyNameKey('')).toBeNull();
    });

    it('maps new German legacy names to translation keys', () => {
      expect(CategoryService.getLegacyNameKey('Ferienjob')).toBe('category_holiday_job');
      expect(CategoryService.getLegacyNameKey('Umbuchung')).toBe('category_transfer');
      expect(CategoryService.getLegacyNameKey('Bücher')).toBe('category_books');
    });

    it('maps new English legacy names to translation keys', () => {
      expect(CategoryService.getLegacyNameKey('Holiday Job')).toBe('category_holiday_job');
      expect(CategoryService.getLegacyNameKey('Transfer')).toBe('category_transfer');
      expect(CategoryService.getLegacyNameKey('Books')).toBe('category_books');
    });
  });

  describe('resolveTranslationKey', () => {
    it('returns the name as-is if already a translation key', () => {
      expect(CategoryService.resolveTranslationKey('category_food')).toBe('category_food');
      expect(CategoryService.resolveTranslationKey('category_salary')).toBe('category_salary');
    });

    it('returns the mapped key for legacy German names', () => {
      expect(CategoryService.resolveTranslationKey('Lohn')).toBe('category_salary');
      expect(CategoryService.resolveTranslationKey('Haushalt')).toBe('category_household');
    });

    it('returns the mapped key for legacy English names', () => {
      expect(CategoryService.resolveTranslationKey('Salary')).toBe('category_salary');
      expect(CategoryService.resolveTranslationKey('Food')).toBe('category_food');
    });

    it('returns the original name if no mapping exists', () => {
      expect(CategoryService.resolveTranslationKey('My Custom Category')).toBe('My Custom Category');
    });
  });
});
