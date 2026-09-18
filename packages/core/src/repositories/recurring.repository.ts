import { BaseRepository } from './base.repository.js';
import { db } from '../db/index.js';
import type { RecurringItem, Frequency } from '../types/index.js';

/** Returns the interval in days for daily/every_N_days frequencies, null otherwise. */
function getDayInterval(freq: Frequency): number | null {
  if (freq === 'daily') return 1;
  const m = freq.match(/^every_(\d+)_days$/);
  return m ? parseInt(m[1], 10) : null;
}

/** Returns the interval in weeks for weekly/every_N_weeks frequencies, null otherwise. */
function getWeekInterval(freq: Frequency): number | null {
  if (freq === 'weekly') return 1;
  const m = freq.match(/^every_(\d+)_weeks$/);
  return m ? parseInt(m[1], 10) : null;
}

/** Returns the interval in months for monthly/every_N_months frequencies, null otherwise. */
function getMonthInterval(freq: Frequency): number | null {
  if (freq === 'monthly') return 1;
  const m = freq.match(/^every_(\d+)_months$/);
  return m ? parseInt(m[1], 10) : null;
}

/**
 * Repository for RecurringItem entities
 *
 * Uses Dexie indexed queries for efficient filtering.
 */
export class RecurringRepository extends BaseRepository<RecurringItem> {
  constructor() {
    super(db.recurringItems);
  }

  /**
   * Get all recurring items for a specific account
   *
   * Uses accountId index - O(log n) performance
   * Filters out soft-archived items
   */
  async getByAccountId(accountId: string): Promise<RecurringItem[]> {
    const items = await db.recurringItems.where('accountId').equals(accountId).toArray();
    return items.filter((item: any) => !item.archivedAt);
  }

  /**
   * Get recurring items that are due on a specific date
   *
   * This method contains complex business logic to determine if a recurring item
   * should trigger on a given date based on its frequency and start date.
   * @public
   */
  async getDueItems(date: string, accountId: string): Promise<RecurringItem[]> {
    const accountItems = await this.getByAccountId(accountId);
    const checkDate = new Date(date);

    return accountItems.filter(item => {
      const startDate = new Date(item.startDate);
      const timeDiff = checkDate.getTime() - startDate.getTime();
      const daysDiff = Math.floor(timeDiff / (1000 * 3600 * 24));
      const freq = item.frequency;

      // --- Daily / every_N_days ---
      const dayInterval = getDayInterval(freq);
      if (dayInterval !== null) {
        return daysDiff >= 0 && daysDiff % dayInterval === 0;
      }

      // --- Weekly / every_N_weeks ---
      const weekInterval = getWeekInterval(freq);
      if (weekInterval !== null) {
        return daysDiff >= 0 && daysDiff % (weekInterval * 7) === 0;
      }

      // --- Monthly / every_N_months ---
      const monthInterval = getMonthInterval(freq);
      if (monthInterval !== null) {
        const startMonth = startDate.getMonth();
        const startYear = startDate.getFullYear();
        const checkMonth = checkDate.getMonth();
        const checkYear = checkDate.getFullYear();

        const monthsElapsed = (checkYear - startYear) * 12 + (checkMonth - startMonth);
        if (monthsElapsed < 0 || monthsElapsed % monthInterval !== 0) return false;

        const startDay = startDate.getDate();
        const checkDay = checkDate.getDate();
        const daysInCheckMonth = new Date(checkYear, checkMonth + 1, 0).getDate();

        if (startDay >= 29 && startDay > daysInCheckMonth) {
          return checkDay === daysInCheckMonth;
        }
        return checkDay === startDay;
      }

      return false;
    });
  }
}
