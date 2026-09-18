/**
 * @vitest-environment jsdom
 */

import { describe, it, expect, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import type { Limit } from '@budget/core';

// Mock react-i18next
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => {
      const translations: Record<string, string> = {
        limit_empty_field: 'This field is required',
        limit_invalid_amount: 'Please enter a valid amount',
        limit_already_exists: 'A limit already exists for this category',
      };
      // eslint-disable-next-line security/detect-object-injection -- key is validated enum value/safe access pattern
      return translations[key] || key;
    },
    i18n: { language: 'en' },
  }),
}));

import { useLimitValidation } from './useLimitValidation';

const createLimit = (overrides: Partial<Limit> = {}): Limit => ({
  id: 'limit-1',
  accountId: 'account-1',
  categoryId: 'expense-food',
  amount: 500,
  ...overrides,
});

describe('useLimitValidation', () => {
  it('returns empty array for valid input', () => {
    const { result } = renderHook(() => useLimitValidation());
    const errors = result.current.validateLimitForm('expense-food', '500', []);
    expect(errors).toEqual([]);
  });

  describe('category validation', () => {
    it('requires category selection', () => {
      const { result } = renderHook(() => useLimitValidation());
      const errors = result.current.validateLimitForm('', '500', []);
      expect(errors).toContainEqual(
        expect.objectContaining({ field: 'categoryId', message: 'This field is required' }),
      );
    });

    it('rejects whitespace-only category', () => {
      const { result } = renderHook(() => useLimitValidation());
      const errors = result.current.validateLimitForm('   ', '500', []);
      expect(errors).toContainEqual(
        expect.objectContaining({ field: 'categoryId' }),
      );
    });
  });

  describe('amount validation', () => {
    it('requires amount', () => {
      const { result } = renderHook(() => useLimitValidation());
      const errors = result.current.validateLimitForm('expense-food', '', []);
      expect(errors).toContainEqual(
        expect.objectContaining({ field: 'amount', message: 'This field is required' }),
      );
    });

    it('rejects NaN amount', () => {
      const { result } = renderHook(() => useLimitValidation());
      const errors = result.current.validateLimitForm('expense-food', 'abc', []);
      expect(errors).toContainEqual(
        expect.objectContaining({ field: 'amount', message: 'Please enter a valid amount' }),
      );
    });

    it('rejects zero amount', () => {
      const { result } = renderHook(() => useLimitValidation());
      const errors = result.current.validateLimitForm('expense-food', '0', []);
      expect(errors).toContainEqual(
        expect.objectContaining({ field: 'amount', message: 'Please enter a valid amount' }),
      );
    });

    it('rejects negative amount', () => {
      const { result } = renderHook(() => useLimitValidation());
      const errors = result.current.validateLimitForm('expense-food', '-10', []);
      expect(errors).toContainEqual(
        expect.objectContaining({ field: 'amount', message: 'Please enter a valid amount' }),
      );
    });
  });

  describe('duplicate detection', () => {
    it('detects duplicate category limits', () => {
      const existingLimits = [createLimit({ id: 'limit-1', categoryId: 'expense-food' })];
      const { result } = renderHook(() => useLimitValidation());
      const errors = result.current.validateLimitForm('expense-food', '500', existingLimits);
      expect(errors).toContainEqual(
        expect.objectContaining({ field: 'categoryId', message: 'A limit already exists for this category' }),
      );
    });

    it('excludes the current limit when editing', () => {
      const existingLimits = [createLimit({ id: 'limit-1', categoryId: 'expense-food' })];
      const { result } = renderHook(() => useLimitValidation());
      const errors = result.current.validateLimitForm('expense-food', '500', existingLimits, 'limit-1');
      expect(errors).toEqual([]);
    });

    it('detects duplicate even when editing a different limit', () => {
      const existingLimits = [createLimit({ id: 'limit-1', categoryId: 'expense-food' })];
      const { result } = renderHook(() => useLimitValidation());
      const errors = result.current.validateLimitForm('expense-food', '500', existingLimits, 'limit-2');
      expect(errors).toContainEqual(
        expect.objectContaining({ field: 'categoryId' }),
      );
    });
  });
});
