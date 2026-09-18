import { describe, it, expect, vi } from 'vitest';
import {
  legacyIdToUuid,
  fromRoomAmount,
  fromCoreDataAmount,
  fromRealmAmount,
  fromUnixMs,
  fromCoreDataTimestamp,
  fromCoreDataLegacyDateString,
  tryFromCoreDataLegacyDateString,
  fromRoomLocalDate,
  fromRoomDateTime,
  isDeleted,
  toTransactionType,
  fromRoomFrequency,
  fromCoreDataFrequency,
  reconstructStartDateFromDayOfMonth,
  fromRoomBalanceType,
  fromRoomDefaultType,
  fromRoomAccessRole,
  toLocalCalendarDate,
} from './local-migration-utils.js';

describe('Migration Utils', () => {
  describe('legacyIdToUuid', () => {
    it('should generate stable deterministic UUIDs', () => {
      const id1 = legacyIdToUuid('balance', 42);
      const id2 = legacyIdToUuid('balance', 42);
      const id3 = legacyIdToUuid('category', 42);

      expect(id1).toBe(id2);
      expect(id1).not.toBe(id3);
    });
  });

  describe('fromRoomAmount', () => {
    it('should return decimal euro values rounded to 2 decimal places', () => {
      expect(fromRoomAmount(12.50)).toBe(12.50);
      expect(fromRoomAmount(10)).toBe(10);
      expect(fromRoomAmount(12.505)).toBe(12.51); // rounding to 2 dp
      expect(fromRoomAmount(0.1 + 0.2)).toBeCloseTo(0.30, 10); // IEEE 754 safety
    });
  });

  describe('fromCoreDataAmount', () => {
    it('should convert integer centimes to decimal euros', () => {
      expect(fromCoreDataAmount(1250)).toBe(12.5);
      expect(fromCoreDataAmount(1000)).toBe(10);
      expect(fromCoreDataAmount(199)).toBe(1.99);
    });

    it('should throw on float values', () => {
      expect(() => fromCoreDataAmount(12.50)).toThrowError('Core Data amount must be an integer (centimes): 12.5');
    });
  });

  describe('fromRealmAmount', () => {
    it('should convert integer centimes to decimal euros', () => {
      expect(fromRealmAmount(200)).toBe(2);
      expect(fromRealmAmount(1234)).toBe(12.34);
    });

    it('should throw on float values', () => {
      expect(() => fromRealmAmount(12.50)).toThrowError('Realm amount must be an integer (centimes): 12.5');
    });
  });

  describe('fromRoomLocalDate', () => {
    it('should parse basicDate format correctly', () => {
      expect(fromRoomLocalDate('20240315')).toBe('2024-03-15T00:00:00.000Z');
    });
    it('should parse basicDateTime with a numeric offset', () => {
      expect(fromRoomLocalDate('20260511T125044.257+0100')).toBe('2026-05-11T11:50:44.257Z');
    });
    it('should parse basicDateTime with a literal "Z" UTC offset', () => {
      // Joda-Time's basicDateTime() formatter prints "Z" instead of "+0000"
      // when the stored offset is UTC — regression coverage for the case
      // that was slipping through as ERR_LOCAL_MIGRATION.
      expect(fromRoomLocalDate('20250317T075646.022Z')).toBe('2025-03-17T07:56:46.022Z');
    });
    it('should throw on invalid formats', () => {
      expect(() => fromRoomLocalDate('invalid')).toThrowError();
    });
  });

  describe('fromRoomDateTime', () => {
    it('should parse basicDateTime format correctly', () => {
      expect(fromRoomDateTime('20240315T103045.000+0000')).toBe('2024-03-15T10:30:45.000Z');
    });
    it('should parse a literal "Z" UTC offset', () => {
      expect(fromRoomDateTime('20250317T075646.022Z')).toBe('2025-03-17T07:56:46.022Z');
    });
    it('should parse a negative offset', () => {
      expect(fromRoomDateTime('20240315T103045.000-0500')).toBe('2024-03-15T15:30:45.000Z');
    });
    it('should throw on invalid formats', () => {
      expect(() => fromRoomDateTime('invalid')).toThrowError();
    });
  });

  describe('fromUnixMs', () => {
    it('should convert unix ms to iso string', () => {
      expect(fromUnixMs(1000)).toBe('1970-01-01T00:00:01.000Z');
    });
  });

  describe('fromCoreDataTimestamp', () => {
    it('should convert core data offset to iso string', () => {
      expect(fromCoreDataTimestamp(0)).toBe('2001-01-01T00:00:00.000Z');
    });
  });

  describe('fromCoreDataLegacyDateString', () => {
    it('should parse German Core Data v1 date strings at UTC midnight', () => {
      expect(fromCoreDataLegacyDateString('2.01.2014')).toBe('2014-01-02T00:00:00.000Z');
      expect(fromCoreDataLegacyDateString('03.01.2014')).toBe('2014-01-03T00:00:00.000Z');
    });

    it('should throw on invalid Core Data v1 date strings', () => {
      expect(() => fromCoreDataLegacyDateString('2014-01-02')).toThrowError();
      expect(() => fromCoreDataLegacyDateString('31.02.2014')).toThrowError();
    });

    it('should expose a non-throwing parser for row-level migration fallbacks', () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

      expect(tryFromCoreDataLegacyDateString('31.02.2014')).toBeUndefined();
      expect(warn).toHaveBeenCalledWith(expect.stringContaining('Skipped malformed Core Data v1 date'));

      warn.mockRestore();
    });
  });

  describe('isDeleted', () => {
    it('should detect deleted flags', () => {
      expect(isDeleted({ deleted: 1 })).toBe(true);
      expect(isDeleted({ deleted: true })).toBe(true);
      expect(isDeleted({ deleted: 0 })).toBe(false);
      expect(isDeleted({})).toBe(false);
    });
  });

  describe('toTransactionType', () => {
    it('should map booleans, numbers, and strings correctly', () => {
      expect(toTransactionType(true)).toBe('income');
      expect(toTransactionType(false)).toBe('expense');
      expect(toTransactionType(1)).toBe('income');
      expect(toTransactionType(0)).toBe('expense');
      expect(toTransactionType('INCOME')).toBe('income');
      expect(toTransactionType('expense')).toBe('expense');
      expect(toTransactionType('BT_INCOME')).toBe('income');
      expect(toTransactionType('BT_EXPENSE')).toBe('expense');
      expect(toTransactionType('unknown')).toBe('expense');
    });
  });

  describe('fromRoomFrequency & fromCoreDataFrequency', () => {
    it('should map repeating integers to strict frequency strings', () => {
      expect(fromRoomFrequency(1)).toBe('monthly');
      expect(fromRoomFrequency(3)).toBe('every_3_months');
      expect(fromRoomFrequency(6)).toBe('every_6_months');
      expect(fromRoomFrequency(12)).toBe('every_12_months');
      expect(() => fromRoomFrequency(99)).toThrowError();
      
      expect(fromCoreDataFrequency(1)).toBe('monthly');
      expect(fromCoreDataFrequency(2)).toBe('every_2_months');
    });
  });

  describe('reconstructStartDateFromDayOfMonth', () => {
    it('should return the correct ISO string for a mid-month day', () => {
      const now = new Date();
      const year = now.getUTCFullYear();
      const month = now.getUTCMonth();
      const expected = new Date(Date.UTC(year, month, 15)).toISOString();
      expect(reconstructStartDateFromDayOfMonth(15)).toBe(expected);
    });

    it('should clamp day 31 to the last day of a 30-day month (June)', () => {
      // Pin "now" to June 2024 (30 days) via fake timers
      vi.useFakeTimers();
      vi.setSystemTime(new Date(Date.UTC(2024, 5, 10))); // 2024-06-10 UTC
      const result = reconstructStartDateFromDayOfMonth(31);
      vi.useRealTimers();
      expect(result).toBe('2024-06-30T00:00:00.000Z');
    });

    it('should clamp day 31 to the last day of February (non-leap year)', () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date(Date.UTC(2023, 1, 1))); // 2023-02-01 UTC
      const result = reconstructStartDateFromDayOfMonth(31);
      vi.useRealTimers();
      expect(result).toBe('2023-02-28T00:00:00.000Z');
    });

    it('should clamp day 31 to the last day of February (leap year)', () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date(Date.UTC(2024, 1, 1))); // 2024-02-01 UTC
      const result = reconstructStartDateFromDayOfMonth(31);
      vi.useRealTimers();
      expect(result).toBe('2024-02-29T00:00:00.000Z');
    });

    it('maxDay must be derived from UTC (guards against UTC+ timezone regression)', () => {
      // Verify that month-end is computed with Date.UTC and not new Date(year, m, 0).
      // For March 2024: UTC last day is 31. A local-API regression in UTC+5:30 would
      // produce getUTCDate() === 30 (midnight local = 18:30 UTC prev day).
      vi.useFakeTimers();
      vi.setSystemTime(new Date(Date.UTC(2024, 2, 1))); // 2024-03-01 UTC
      const result = reconstructStartDateFromDayOfMonth(31);
      vi.useRealTimers();
      expect(result).toBe('2024-03-31T00:00:00.000Z');
    });
  });

  describe('fromRoomBalanceType', () => {
    it('should correctly map Kotlin ENUMs', () => {
      expect(fromRoomBalanceType('INCOME')).toBe('income');
      expect(fromRoomBalanceType('EXPENSE')).toBe('expense');
      expect(() => fromRoomBalanceType('OTHER')).toThrowError();
    });
  });

  describe('fromRoomDefaultType', () => {
    it('should map specific enums to boolean correctly', () => {
      expect(fromRoomDefaultType('DEFAULT')).toBe(true);
      expect(fromRoomDefaultType('TRANSFER_DEFAULT')).toBe(true);
      expect(fromRoomDefaultType('CUSTOM_CATEGORY')).toBe(false);
    });
  });

  describe('fromRoomAccessRole', () => {
    it('should strictly map to AccessRole types', () => {
      expect(fromRoomAccessRole('OWNER')).toBe('owner');
      expect(fromRoomAccessRole('MEMBER')).toBe('member');
      expect(() => fromRoomAccessRole('ADMIN')).toThrowError();
    });
  });
});

describe('toLocalCalendarDate', () => {
  const localDate = (date: Date) =>
    `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

  it('keeps plain calendar dates', () => {
    expect(toLocalCalendarDate('2024-03-15')).toBe('2024-03-15');
  });

  it('keeps the date of a date-only value encoded as UTC midnight', () => {
    expect(toLocalCalendarDate('2024-03-15T00:00:00.000Z')).toBe('2024-03-15');
    expect(toLocalCalendarDate('2024-03-15T00:00:00Z')).toBe('2024-03-15');
  });

  it('uses the local calendar day of a real timestamp', () => {
    // 22:30 UTC is already the next day in Germany; the result must follow
    // the local clock, whatever timezone the test runs in.
    const instant = '2024-03-14T22:30:00.000Z';
    expect(toLocalCalendarDate(instant)).toBe(localDate(new Date(instant)));
  });

  it('returns unparseable values unchanged', () => {
    expect(toLocalCalendarDate('not a date')).toBe('not a date');
  });
});
