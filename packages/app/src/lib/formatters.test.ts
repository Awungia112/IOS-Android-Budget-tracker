/**
 * @vitest-environment jsdom
 */

import { describe, it, expect, vi } from 'vitest';
import type { TFunction } from 'i18next';
import {
  formatCurrency,
  formatDate,
  getMonthName,
  toLocalDateString,
  parseDateString,
  calculateProgress,
} from './formatters';

// Use the same formatter the implementation uses, so tests are locale-safe
const eurFormatter = new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' });

describe('formatCurrency', () => {
  it('formats a positive number as EUR currency', () => {
    expect(formatCurrency(1234.56)).toBe(eurFormatter.format(1234.56));
  });

  it('formats zero', () => {
    expect(formatCurrency(0)).toBe(eurFormatter.format(0));
  });

  it('formats a negative number', () => {
    expect(formatCurrency(-50.99)).toBe(eurFormatter.format(-50.99));
  });

  it('formats a large number with thousands separators', () => {
    expect(formatCurrency(1000000)).toBe(eurFormatter.format(1000000));
  });

  it('formats a small decimal amount', () => {
    expect(formatCurrency(0.01)).toBe(eurFormatter.format(0.01));
  });

  it('rounds to two decimal places', () => {
    expect(formatCurrency(19.999)).toBe(eurFormatter.format(19.999));
  });
});

describe('formatDate', () => {
  it('formats an ISO date string to de-DE format', () => {
    const result = formatDate('2025-03-15T10:00:00Z');
    expect(result).toMatch(/15\.0?3\.2025/);
  });

  it('formats a YYYY-MM-DD date string correctly', () => {
    const result = formatDate('2024-12-05');
    expect(result).toBe('05.12.2024');
  });

  it('returns em-dash for invalid date string', () => {
    const result = formatDate('not-a-date');
    expect(result).toBe('—');
  });

  it('returns em-dash for empty or null input', () => {
    expect(formatDate('')).toBe('—');
    expect(formatDate(null as any)).toBe('—');
    expect(formatDate(undefined as any)).toBe('—');
  });

  it('formats another date correctly', () => {
    const result = formatDate('2024-12-01T00:00:00Z');
    expect(result).toMatch(/01\.12\.2024/);
  });
});

describe('getMonthName', () => {
  it('returns the translation key for each month index', () => {
    const t = ((key: string) => key) as unknown as TFunction;

    expect(getMonthName(0, t)).toBe('month_january');
    expect(getMonthName(5, t)).toBe('month_june');
    expect(getMonthName(11, t)).toBe('month_december');
  });

  it('calls the translation function with the correct key', () => {
    const t = vi.fn((key: string) => `translated_${key}`) as unknown as TFunction;

    const result = getMonthName(3, t);
    expect(t).toHaveBeenCalledWith('month_april');
    expect(result).toBe('translated_month_april');
  });
});

describe('toLocalDateString', () => {
  it('formats a date as YYYY-MM-DD', () => {
    const date = new Date(2025, 0, 15); // Jan 15, 2025
    expect(toLocalDateString(date)).toBe('2025-01-15');
  });

  it('pads single-digit month and day', () => {
    const date = new Date(2025, 2, 5); // Mar 5
    expect(toLocalDateString(date)).toBe('2025-03-05');
  });

  it('handles December 31st', () => {
    const date = new Date(2025, 11, 31); // Dec 31
    expect(toLocalDateString(date)).toBe('2025-12-31');
  });

  it('defaults to current date when no argument', () => {
    const result = toLocalDateString();
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe('parseDateString', () => {
  it('parses YYYY-MM-DD into components with 0-indexed month', () => {
    const result = parseDateString('2025-01-15');
    expect(result).toEqual({ year: 2025, month: 0, day: 15 });
  });

  it('parses December correctly', () => {
    const result = parseDateString('2024-12-31');
    expect(result).toEqual({ year: 2024, month: 11, day: 31 });
  });

  it('parses single-digit values (padded)', () => {
    const result = parseDateString('2025-03-05');
    expect(result).toEqual({ year: 2025, month: 2, day: 5 });
  });
});

describe('calculateProgress', () => {
  it('returns 0 when target is 0', () => {
    expect(calculateProgress(50, 0)).toBe(0);
  });

  it('returns 0 when target is negative', () => {
    expect(calculateProgress(50, -100)).toBe(0);
  });

  it('returns 50 for half progress', () => {
    expect(calculateProgress(50, 100)).toBe(50);
  });

  it('returns 100 when at target', () => {
    expect(calculateProgress(100, 100)).toBe(100);
  });

  it('caps at 100 when over target', () => {
    expect(calculateProgress(200, 100)).toBe(100);
  });

  it('returns 0 when current is 0', () => {
    expect(calculateProgress(0, 100)).toBe(0);
  });

  it('returns 0 when current is negative', () => {
    expect(calculateProgress(-10, 100)).toBe(0);
  });

  it('handles decimal precision', () => {
    const result = calculateProgress(33, 100);
    expect(result).toBeCloseTo(33, 1);
  });
});
