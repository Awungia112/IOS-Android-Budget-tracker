// @vitest-environment node
// libsodium rejects jsdom's Uint8Array, so the encrypted path runs under node.
import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '../db/index.js';
import { changeLog, decryptChangeRecord } from '../changelog/index.js';
import { RecurringRepository } from '../repositories/recurring.repository.js';
import { BudgetService } from './budget.service.js';
import type { RecurringItem } from '../types/index.js';

const ACCOUNT_KEY = new Uint8Array(32).fill(7);

const localToday = () => {
  const today = new Date();
  return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
};

const monthlyItem = (accountId: string): RecurringItem => ({
  id: `recurring-${accountId}`,
  accountId,
  name: 'Rent',
  amount: 900,
  categoryId: 'category-housing',
  type: 'expense',
  frequency: 'monthly',
  startDate: localToday(),
  endDate: null,
});

const occurrenceCount = (item: RecurringItem) =>
  db.transactions.where('recurringItemId').equals(item.id).count();

describe('BudgetService recurring writes and their change records', () => {
  let service: BudgetService;

  beforeEach(async () => {
    await db.delete();
    await db.open();
    await changeLog.clear();
    service = new BudgetService();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('encrypts and queues every generated occurrence in the same commit as the rows', async () => {
    vi.spyOn(service as any, 'resolveAccountKeyForLocalAccount').mockResolvedValue(ACCOUNT_KEY);
    const item = monthlyItem('account-encrypted');
    await new RecurringRepository().create(item);

    await expect(service.reconcileRecurring(item)).resolves.toBe(true);

    expect(await occurrenceCount(item)).toBe(12);
    const records = await changeLog.getByAccountId(item.accountId);
    expect(records).toHaveLength(12);
    expect(records.every((record) => record.command.type === 'CREATE_TRANSACTION')).toBe(true);

    const queued = await db.uploadQueue.toArray();
    expect(queued).toHaveLength(12);
    const decrypted = await decryptChangeRecord(queued[0].encrypted_payload, ACCOUNT_KEY);
    expect(records.map((record) => record.id)).toContain(decrypted.id);
  });

  it('rolls back the generated rows when their change records cannot be written', async () => {
    const item = monthlyItem('account-rollback');
    await new RecurringRepository().create(item);
    vi.spyOn(changeLog, 'persistPrepared').mockRejectedValueOnce(new Error('disk full'));

    await expect(service.reconcileRecurring(item)).rejects.toThrow('disk full');

    expect(await occurrenceCount(item)).toBe(0);
    expect(await changeLog.count()).toBe(0);
  });

  it('removes every linked transaction with the definition, booked ones included', async () => {
    const item = monthlyItem('account-delete');
    await new RecurringRepository().create(item);
    await service.reconcileRecurring(item);
    await db.transactions.add({
      id: 'entered-with-item',
      accountId: item.accountId,
      type: 'expense',
      amount: 900,
      category: item.categoryId,
      title: 'Rent',
      date: '2026-01-01',
      isRecurring: true,
      recurringItemId: item.id,
    });
    await changeLog.clear();

    await service.deleteRecurring(item.id, item.accountId);

    expect(await db.recurringItems.get(item.id)).toBeUndefined();
    expect(await occurrenceCount(item)).toBe(0);

    const commands = (await changeLog.getByAccountId(item.accountId)).map((record) => record.command);
    expect(commands.filter((command) => command.type === 'DELETE_TRANSACTION')).toHaveLength(13);
    expect(commands.at(-1)).toMatchObject({
      type: 'DELETE_RECURRING',
      payload: { id: item.id, accountId: item.accountId },
    });
  });

  it('removes every linked transaction when a recurring delete is replayed', async () => {
    const item = monthlyItem('account-replayed-delete');
    await new RecurringRepository().create(item);
    await service.reconcileRecurring(item);

    await service.executeCommand({
      type: 'DELETE_RECURRING',
      payload: { id: item.id, accountId: item.accountId },
    });

    expect(await db.recurringItems.get(item.id)).toBeUndefined();
    expect(await occurrenceCount(item)).toBe(0);
  });

  it('keeps the definition and its occurrences when the delete cannot be logged', async () => {
    const item = monthlyItem('account-delete-rollback');
    await new RecurringRepository().create(item);
    await service.reconcileRecurring(item);
    vi.spyOn(changeLog, 'persistPrepared').mockRejectedValueOnce(new Error('disk full'));

    await expect(service.deleteRecurring(item.id, item.accountId)).rejects.toThrow('disk full');

    expect(await db.recurringItems.get(item.id)).toBeDefined();
    expect(await occurrenceCount(item)).toBe(12);
    const records = await changeLog.getByAccountId(item.accountId);
    expect(records.some((record) => record.command.type === 'DELETE_RECURRING')).toBe(false);
  });
});
