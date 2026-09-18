import { describe, expect, it } from 'vitest';
import {
  generateRecurringOccurrenceDates,
  generateScheduleDatesThrough,
} from './recurring-occurrence.service.js';

describe('generateRecurringOccurrenceDates', () => {
  it('generates the next twelve monthly occurrences', () => {
    const dates = generateRecurringOccurrenceDates({ startDate: '2026-01-31', endDate: null, frequency: 'monthly' });

    expect(dates).toHaveLength(12);
    expect(dates.slice(0, 3)).toEqual(['2026-01-31', '2026-02-28', '2026-03-31']);
  });

  it('stops at an inclusive end date', () => {
    const dates = generateRecurringOccurrenceDates({ startDate: '2026-01-01', endDate: '2026-03-01', frequency: 'monthly' });

    expect(dates).toEqual(['2026-01-01', '2026-02-01', '2026-03-01']);
  });

  it('supports daily and weekly frequencies', () => {
    expect(generateRecurringOccurrenceDates({ startDate: '2026-01-01', endDate: '2026-01-04', frequency: 'daily' })).toEqual([
      '2026-01-01', '2026-01-02', '2026-01-03', '2026-01-04',
    ]);
    expect(generateRecurringOccurrenceDates({ startDate: '2026-01-01', endDate: '2026-01-22', frequency: 'weekly' })).toEqual([
      '2026-01-01', '2026-01-08', '2026-01-15', '2026-01-22',
    ]);
  });

  it('starts an open-ended forecast at the next valid occurrence after the reference date', () => {
    const dates = generateRecurringOccurrenceDates(
      { startDate: '2026-01-01', endDate: null, frequency: 'monthly' },
      3,
      '2026-09-07',
    );

    expect(dates).toEqual(['2026-10-01', '2026-11-01', '2026-12-01']);
  });

  it('accepts ISO timestamp start dates from migrated recurring items', () => {
    expect(generateRecurringOccurrenceDates({
      startDate: '2026-09-08T00:00:00.000Z',
      endDate: null,
      frequency: 'monthly',
    }, 3, '2026-09-08')).toEqual([
      '2026-09-08',
      '2026-10-08',
      '2026-11-08',
    ]);
  });
});

describe('generateScheduleDatesThrough', () => {
  it('lists every scheduled date up to and including the given date', () => {
    expect(generateScheduleDatesThrough(
      { startDate: '2026-01-15', endDate: null, frequency: 'monthly' },
      '2026-03-15',
    )).toEqual(['2026-01-15', '2026-02-15', '2026-03-15']);
  });

  it('returns nothing when the item starts after the given date', () => {
    expect(generateScheduleDatesThrough(
      { startDate: '2026-05-02', endDate: null, frequency: 'monthly' },
      '2026-05-01',
    )).toEqual([]);
  });

  it('clamps a 31st start date to the last day of shorter months', () => {
    expect(generateScheduleDatesThrough(
      { startDate: '2026-01-31', endDate: null, frequency: 'monthly' },
      '2026-05-01',
    )).toEqual(['2026-01-31', '2026-02-28', '2026-03-31', '2026-04-30']);
  });

  it('handles a leap-day start date', () => {
    expect(generateScheduleDatesThrough(
      { startDate: '2024-02-29', endDate: null, frequency: 'every_12_months' },
      '2025-03-01',
    )).toEqual(['2024-02-29', '2025-02-28']);
  });

  it('supports weekly frequencies', () => {
    expect(generateScheduleDatesThrough(
      { startDate: '2026-01-01', endDate: null, frequency: 'weekly' },
      '2026-01-21',
    )).toEqual(['2026-01-01', '2026-01-08', '2026-01-15']);
  });

  it('stops at an inclusive end date', () => {
    expect(generateScheduleDatesThrough(
      { startDate: '2026-01-01', endDate: '2026-02-01', frequency: 'monthly' },
      '2026-06-01',
    )).toEqual(['2026-01-01', '2026-02-01']);
  });

  it('stops instead of looping on an unrecognised frequency', () => {
    expect(generateScheduleDatesThrough(
      { startDate: '2026-01-01', endDate: null, frequency: 'yearly' as never },
      '2026-06-01',
    )).toEqual(['2026-01-01']);
  });
});
