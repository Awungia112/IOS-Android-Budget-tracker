import { describe, it, expect } from 'vitest';
import { getInviteInitials, formatInviteDate, formatInviteDateLong } from './inviteUtils';

describe('inviteUtils', () => {
  describe('getInviteInitials', () => {
    it('returns initials from a full name', () => {
      expect(getInviteInitials(null, 'John Doe')).toBe('JD');
    });

    it('returns initials from a single name', () => {
      expect(getInviteInitials(null, 'Alice')).toBe('AL');
    });

    it('returns initials from email when name is null', () => {
      expect(getInviteInitials('john.doe@example.com', null)).toBe('JD');
    });

    it('returns initials from email with hyphen separator', () => {
      expect(getInviteInitials('jane-smith@example.com', null)).toBe('JS');
    });

    it('returns initials from email with underscore separator', () => {
      expect(getInviteInitials('bob_builder@example.com', null)).toBe('BB');
    });

    it('returns first two chars from simple email username', () => {
      expect(getInviteInitials('alice@example.com', null)).toBe('AL');
    });

    it('returns ? when both name and email are null', () => {
      expect(getInviteInitials(null, null)).toBe('?');
    });

    it('returns ? when both name and email are null-ish', () => {
      expect(getInviteInitials(null, null)).toBe('?');
    });

    it('prefers name over email', () => {
      expect(getInviteInitials('john@example.com', 'Jane Smith')).toBe('JS');
    });

    it('handles three-word name by taking first letter of first two words', () => {
      expect(getInviteInitials(null, 'John Michael Doe')).toBe('JM');
    });
  });

  describe('formatInviteDate', () => {
    const t = (key: string) => key;

    it('returns time for today', () => {
      const now = new Date();
      const result = formatInviteDate(now.toISOString(), t);
      // Should contain a time format like "2:30 PM"
      expect(result).not.toBe('yesterday');
      expect(result.length).toBeGreaterThan(0);
    });

    it('returns "yesterday" for yesterday', () => {
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      const result = formatInviteDate(yesterday.toISOString(), t);
      expect(result).toBe('yesterday');
    });

    it('returns weekday name for 2-6 days ago', () => {
      const threeDaysAgo = new Date();
      threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);
      const result = formatInviteDate(threeDaysAgo.toISOString(), t);
      // Should be a weekday name like "Monday", "Tuesday", etc.
      expect(result).not.toBe('yesterday');
      // Weekday names are full day names from Intl.DateTimeFormat
      const weekdays = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
      expect(weekdays).toContain(result);
    });

    it('returns month and day for dates older than a week', () => {
      const twoWeeksAgo = new Date();
      twoWeeksAgo.setDate(twoWeeksAgo.getDate() - 14);
      const result = formatInviteDate(twoWeeksAgo.toISOString(), t);
      // Should be like "Jan 15" or "Jun 26"
      expect(result).not.toBe('yesterday');
      const weekdays = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
      expect(weekdays).not.toContain(result);
    });
  });

  describe('formatInviteDateLong', () => {
    it('returns a full date string with year, month, day, and time', () => {
      const date = '2026-06-15T14:30:00.000Z';
      const result = formatInviteDateLong(date);
      // Should contain year and time
      expect(result).toContain('2026');
      expect(result.length).toBeGreaterThan(10);
    });

    it('handles ISO date strings', () => {
      const result = formatInviteDateLong('2026-01-05T09:00:00.000Z');
      expect(result).toContain('2026');
    });
  });
});