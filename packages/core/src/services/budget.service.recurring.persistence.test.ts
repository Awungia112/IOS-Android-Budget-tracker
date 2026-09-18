import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { changeLog } from '../changelog/index.js';
import { db } from '../db/index.js';
import { BudgetService } from './budget.service.js';
import { RecurringRepository } from '../repositories/recurring.repository.js';

// Reconciliation works in local calendar days, so fixtures must too.
const localDate = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
const localToday = () => localDate(new Date());
const firstOfMonthsAgo = (months: number) => {
  const date = new Date();
  date.setDate(1);
  date.setMonth(date.getMonth() - months);
  return localDate(date);
};

describe('BudgetService recurring startup reconciliation', () => {
  beforeEach(async () => {
    await db.delete();
    await db.open();
  });

  it('materializes twelve future instances for an existing recurring item starting today', async () => {
    const accountId = 'account-reproduction';
    const recurringItem = {
      id: 'recurring-reproduction',
      accountId,
      name: 'Recurring expense',
      amount: 800,
      categoryId: 'category-hobby',
      type: 'expense' as const,
      frequency: 'monthly' as const,
      startDate: localToday(),
      endDate: null,
    };

    await new RecurringRepository().create(recurringItem);

    const service = new BudgetService();
    await service.reconcileRecurring(recurringItem);
    await service.reconcileRecurring(recurringItem);

    const persisted = await service.getTransactionsByAccountId(accountId);

    expect(persisted).toHaveLength(12);
    expect(persisted.every((transaction) =>
      transaction.recurringItemId === recurringItem.id &&
      transaction.isRecurring === true,
    )).toBe(true);
    expect(persisted[0].date).toBe(recurringItem.startDate);
    expect(new Set(persisted.map((transaction) => transaction.id)).size).toBe(12);
  });

  it('generates occurrences on WebViews without Array.prototype.at (Chrome < 92)', async () => {
    const at = Object.getOwnPropertyDescriptor(Array.prototype, 'at');
    // Simulate an older Android System WebView.
    delete (Array.prototype as { at?: unknown }).at;
    try {
      const service = new BudgetService();
      const item = await service.createRecurring({
        name: 'Old WebView rent',
        amount: 100,
        categoryId: 'category-housing',
        type: 'expense',
        frequency: 'monthly',
        startDate: localToday(),
        endDate: null,
      }, 'account-old-webview');
      await service.updateRecurring(item);

      expect(await db.transactions.where('recurringItemId').equals(item.id).count()).toBe(12);
    } finally {
      if (at) Object.defineProperty(Array.prototype, 'at', at);
    }
  });

  it('adopts an exact legacy occurrence instead of creating a duplicate', async () => {
    const accountId = 'account-legacy-occurrence';
    const recurringItem = {
      id: 'recurring-legacy-occurrence',
      accountId,
      name: 'Salary',
      amount: 2000,
      categoryId: 'category-income',
      type: 'income' as const,
      frequency: 'monthly' as const,
      startDate: localToday(),
      endDate: null,
    };

    await new RecurringRepository().create(recurringItem);
    await db.transactions.add({
      id: 'legacy-salary-occurrence',
      accountId,
      type: 'income',
      amount: 2000,
      category: 'category-income',
      title: 'Salary',
      date: recurringItem.startDate,
      executedAt: new Date().toISOString(),
    });

    const service = new BudgetService();
    await service.reconcileRecurring(recurringItem, { adoptLegacy: true });

    const persisted = await service.getTransactionsByAccountId(accountId);
    const occurrence = persisted.filter((transaction) => transaction.date === recurringItem.startDate);

    expect(occurrence).toHaveLength(1);
    expect(occurrence[0]).toMatchObject({
      id: 'legacy-salary-occurrence',
      recurringItemId: recurringItem.id,
      recurringOccurrenceDate: recurringItem.startDate,
      isRecurring: true,
    });
  });

  it('does not remove a user-created linked transaction without an occurrence marker', async () => {
    const accountId = 'account-user-linked';
    const recurringItem = {
      id: 'recurring-user-linked',
      accountId,
      name: 'Rent',
      amount: 50,
      categoryId: 'category-hobby',
      type: 'expense' as const,
      frequency: 'monthly' as const,
      startDate: localToday(),
      endDate: null,
    };

    await new RecurringRepository().create(recurringItem);
    await db.transactions.add({
      id: 'user-created-rent',
      accountId,
      type: 'expense',
      amount: 50,
      category: 'category-hobby',
      title: 'Rent',
      date: recurringItem.startDate,
      recurringItemId: recurringItem.id,
    });

    const service = new BudgetService();
    await service.reconcileRecurring(recurringItem);

    expect(await db.transactions.get('user-created-rent')).toBeDefined();
  });

  it('does not recreate an occurrence that the user archived', async () => {
    const accountId = 'account-archived-occurrence';
    const recurringItem = {
      id: 'recurring-archived',
      accountId,
      name: 'Subscription',
      amount: 25,
      categoryId: 'category-hobby',
      type: 'expense' as const,
      frequency: 'monthly' as const,
      startDate: localToday(),
      endDate: null,
    };

    await new RecurringRepository().create(recurringItem);
    const occurrenceId = `${recurringItem.id}:${recurringItem.startDate}`;
    await db.transactions.add({
      id: occurrenceId,
      accountId,
      type: 'expense',
      amount: 25,
      category: 'category-hobby',
      title: 'Subscription',
      date: recurringItem.startDate,
      isRecurring: true,
      recurringItemId: recurringItem.id,
      recurringOccurrenceDate: recurringItem.startDate,
      archivedAt: new Date().toISOString(),
    });

    const service = new BudgetService();
    await service.reconcileRecurring(recurringItem);

    expect(await db.transactions.get(occurrenceId)).toMatchObject({ archivedAt: expect.any(String) });
    const occurrences = await db.transactions.where('recurringItemId').equals(recurringItem.id).toArray();
    expect(occurrences).toHaveLength(12);
    expect(occurrences.filter((transaction) => transaction.id === occurrenceId)).toHaveLength(1);
  });

  it('recreates generated occurrences when an end date is later cleared', async () => {
    const accountId = 'account-range-restoration';
    const startDate = localToday();
    const recurringItem = {
      id: 'recurring-range-restoration',
      accountId,
      name: 'Subscription',
      amount: 25,
      categoryId: 'category-hobby',
      type: 'expense' as const,
      frequency: 'monthly' as const,
      startDate,
      endDate: null as string | null,
    };

    const service = new BudgetService();
    await new RecurringRepository().create(recurringItem);
    await service.reconcileRecurring(recurringItem);
    expect(await service.getTransactionsByAccountId(accountId)).toHaveLength(12);

    const shortened = { ...recurringItem, endDate: startDate };
    await service.updateRecurring(shortened);
    expect(await service.getTransactionsByAccountId(accountId)).toHaveLength(1);

    await service.updateRecurring(recurringItem);
    expect(await service.getTransactionsByAccountId(accountId)).toHaveLength(12);
  });

  describe('occurrence batches', () => {
    const rentData = (monthsAgo: number) => ({
      name: 'Rent',
      amount: 700,
      categoryId: 'category-housing',
      type: 'expense' as const,
      frequency: 'monthly' as const,
      startDate: firstOfMonthsAgo(monthsAgo),
      endDate: null,
    });
    const occurrences = (recurringItemId: string) =>
      db.transactions.where('recurringItemId').equals(recurringItemId).sortBy('date');
    // The first 1st of a month on or after today.
    const nextFirstOfMonth = () => {
      const date = new Date();
      if (date.getDate() !== 1) date.setMonth(date.getMonth() + 1, 1);
      return localDate(date);
    };

    it('creates exactly 12 occurrences counted from a past start date', async () => {
      const service = new BudgetService();
      const item = await service.createRecurring(rentData(2), 'account-past-start');

      const persisted = await occurrences(item.id);
      expect(persisted).toHaveLength(12);
      expect(persisted[0].date).toBe(item.startDate);
      expect(persisted.filter((transaction) => transaction.date <= localToday())
        .every((transaction) => transaction.executedAt)).toBe(true);
      expect(persisted.filter((transaction) => transaction.date > localToday())
        .every((transaction) => !transaction.executedAt)).toBe(true);
    });

    it('creates only 12 when the start date is more than 12 occurrences back', async () => {
      const service = new BudgetService();
      const item = await service.createRecurring(rentData(14), 'account-old-start');

      const dates = (await occurrences(item.id)).map((transaction) => transaction.date);
      expect(dates).toHaveLength(12);
      expect(dates[0]).toBe(item.startDate);

      // Later runs (e.g. the next app start) don't add another batch either.
      await expect(service.reconcileRecurring(item)).resolves.toBe(false);
      expect(await occurrences(item.id)).toHaveLength(12);
    });

    it('adds the next 12 from the next due date once a batch has run out', async () => {
      const item = { ...rentData(13), id: 'recurring-ran-out', accountId: 'account-ran-out' };
      await new RecurringRepository().create(item);
      // A batch generated a year ago, while all of its occurrences were upcoming.
      const generatedAt = new Date();
      generatedAt.setMonth(generatedAt.getMonth() - 14);
      const batchDates = Array.from({ length: 12 }, (_, index) => firstOfMonthsAgo(13 - index));
      await db.transactions.bulkAdd(batchDates.map((date) => ({
        id: `${item.id}:${date}`,
        accountId: item.accountId,
        type: item.type,
        amount: item.amount,
        category: item.categoryId,
        title: item.name,
        date,
        createdAt: generatedAt.toISOString(),
        isRecurring: true,
        recurringItemId: item.id,
        recurringOccurrenceDate: date,
      })));

      await expect(new BudgetService().reconcileRecurring(item)).resolves.toBe(true);

      const dates = (await occurrences(item.id)).map((transaction) => transaction.date);
      expect(dates).toHaveLength(24);
      expect(dates[12]).toBe(nextFirstOfMonth());
    });

    it('continues an item whose history predates batches', async () => {
      const item = { ...rentData(3), id: 'recurring-old-history', accountId: 'account-old-history' };
      await new RecurringRepository().create(item);
      // Occurrences booked by the old catch-up carry no occurrence marker.
      await db.transactions.bulkAdd([3, 2, 1].map((monthsAgo) => ({
        id: `old-${monthsAgo}`,
        accountId: item.accountId,
        type: item.type,
        amount: item.amount,
        category: item.categoryId,
        title: item.name,
        date: firstOfMonthsAgo(monthsAgo),
        createdAt: new Date().toISOString(),
        isRecurring: true,
        recurringItemId: item.id,
      })));

      await new BudgetService().reconcileRecurring(item);

      const dates = (await occurrences(item.id)).map((transaction) => transaction.date);
      expect(dates.filter((date) => date > localToday()).length).toBeGreaterThan(0);
    });

    it('does not add a new batch while occurrences are still upcoming', async () => {
      const service = new BudgetService();
      const item = await service.createRecurring(rentData(2), 'account-batch-running');

      await expect(service.reconcileRecurring(item)).resolves.toBe(false);
      expect(await occurrences(item.id)).toHaveLength(12);
    });

    it('counts from the start date in a background run too', async () => {
      const item = { ...rentData(2), id: 'recurring-background', accountId: 'account-background' };
      await new RecurringRepository().create(item);

      await new BudgetService().reconcileRecurring(item);

      const dates = (await occurrences(item.id)).map((transaction) => transaction.date);
      expect(dates).toHaveLength(12);
      expect(dates[0]).toBe(item.startDate);
    });

    it('does not book a past occurrence the user already entered', async () => {
      const accountId = 'account-manual-override';
      const data = rentData(2);
      // A manual entry with a different amount stands in for that occurrence.
      await db.transactions.add({
        id: 'manual-rent',
        accountId,
        type: 'expense',
        amount: 650,
        category: data.categoryId,
        title: 'rent',
        date: data.startDate,
        executedAt: new Date().toISOString(),
      });

      const item = await new BudgetService().createRecurring(data, accountId);

      const onStartDate = await db.transactions.where('date').equals(item.startDate).toArray();
      expect(onStartDate.map((transaction) => transaction.id)).toEqual(['manual-rent']);
      expect(await occurrences(item.id)).toHaveLength(11);
    });

    it('does not bring back an occurrence the user deleted', async () => {
      const service = new BudgetService();
      const item = await service.createRecurring(rentData(2), 'account-skipped-past');

      await service.deleteTransaction(`${item.id}:${item.startDate}`, item.accountId);
      await service.updateRecurring(item);

      const visible = await service.getTransactionsByAccountId(item.accountId);
      expect(visible.map((transaction) => transaction.date)).not.toContain(item.startDate);
      expect(visible).toHaveLength(11);
    });
  });

  describe('editing the end date', () => {
    const rent = {
      name: 'Rent',
      amount: 700,
      categoryId: 'category-housing',
      type: 'expense' as const,
      frequency: 'monthly' as const,
    };
    const setToday = (date: string) => vi.setSystemTime(new Date(`${date}T09:00:00`));
    const occurrenceDates = async (recurringItemId: string) =>
      (await db.transactions.where('recurringItemId').equals(recurringItemId).sortBy('date'))
        .map((transaction) => transaction.date);
    const monthlyDates = (from: string, count: number) => Array.from({ length: count }, (_, index) => {
      const date = new Date(`${from}T00:00:00`);
      date.setMonth(date.getMonth() + index);
      return localDate(date);
    });

    beforeEach(() => {
      vi.useFakeTimers({ toFake: ['Date'] });
      setToday('2026-09-14');
    });
    afterEach(() => {
      vi.useRealTimers();
    });

    it('removes booked occurrences after an earlier end date', async () => {
      setToday('2025-09-02');
      const service = new BudgetService();
      const item = await service.createRecurring({ ...rent, startDate: '2025-09-01', endDate: null }, 'account-shorten');
      setToday('2026-09-14');
      await service.reconcileRecurring(item);
      expect(await occurrenceDates(item.id)).toHaveLength(24);

      await service.updateRecurring({ ...item, endDate: '2026-05-01' });

      expect(await occurrenceDates(item.id)).toEqual(monthlyDates('2025-09-01', 9));
      const deletes = (await changeLog.getByAccountId(item.accountId))
        .filter((record) => record.command.type === 'DELETE_TRANSACTION');
      expect(deletes).toHaveLength(15);
    });

    it('adds every occurrence up to a later end date, booking the past ones', async () => {
      setToday('2026-01-02');
      const service = new BudgetService();
      const item = await service.createRecurring({ ...rent, startDate: '2026-01-01', endDate: '2026-03-01' }, 'account-extend');
      setToday('2026-09-14');

      const extended = await service.updateRecurring({ ...item, endDate: '2027-12-01' });

      const expected = monthlyDates('2026-01-01', 24);
      expect(await occurrenceDates(item.id)).toEqual(expected);
      const rows = await db.transactions.where('recurringItemId').equals(item.id).toArray();
      const addedPast = rows.filter((row) => row.date > '2026-03-01' && row.date <= '2026-09-14');
      expect(addedPast).toHaveLength(6);
      expect(addedPast.every((row) => row.executedAt)).toBe(true);
      expect(rows.filter((row) => row.date > '2026-09-14').every((row) => !row.executedAt)).toBe(true);

      setToday('2026-09-15');
      await expect(service.reconcileRecurring(extended)).resolves.toBe(false);
      expect(await occurrenceDates(item.id)).toEqual(expected);
    });

    it('books the new occurrence when an ended item is extended by a month into the past', async () => {
      setToday('2026-03-02');
      const service = new BudgetService();
      const item = await service.createRecurring({ ...rent, startDate: '2026-01-01', endDate: '2026-03-01' }, 'account-extend-past');
      setToday('2026-09-14');

      await service.updateRecurring({ ...item, endDate: '2026-04-01' });

      expect(await occurrenceDates(item.id)).toEqual(monthlyDates('2026-01-01', 4));
      expect(await db.transactions.get(`${item.id}:2026-04-01`)).toMatchObject({ executedAt: expect.any(String) });
    });

    it('does not backfill occurrences missed between batches when the end date moves later', async () => {
      setToday('2025-09-02');
      const service = new BudgetService();
      const item = await service.createRecurring({ ...rent, startDate: '2025-09-01', endDate: null }, 'account-extend-batches');
      setToday('2026-09-14');
      await service.reconcileRecurring(item);
      // Sep 2026 fell between the two batches.
      const withEnd = await service.updateRecurring({ ...item, endDate: '2027-09-01' });

      await service.updateRecurring({ ...withEnd, endDate: '2027-12-01' });

      const dates = await occurrenceDates(item.id);
      expect(dates).not.toContain('2026-09-01');
      expect(dates).toEqual([...monthlyDates('2025-09-01', 12), ...monthlyDates('2026-10-01', 15)]);
    });

    it('fills the first 12 from the start date when the end date is cleared', async () => {
      setToday('2026-01-02');
      const service = new BudgetService();
      const item = await service.createRecurring({ ...rent, startDate: '2026-01-01', endDate: '2026-03-01' }, 'account-clear');
      setToday('2026-09-14');
      await service.updateRecurring({ ...item, endDate: '2026-12-01' });

      await service.updateRecurring({ ...item, endDate: null });

      expect(await occurrenceDates(item.id)).toEqual(monthlyDates('2026-01-01', 12));
    });

    it('does not add occurrences when an end date is set on an open item', async () => {
      const service = new BudgetService();
      const item = await service.createRecurring({ ...rent, startDate: '2026-09-01', endDate: null }, 'account-set-end');

      await service.updateRecurring({ ...item, endDate: '2028-06-01' });

      expect(await occurrenceDates(item.id)).toEqual(monthlyDates('2026-09-01', 12));
    });
  });
});
