// @vitest-environment node
//
// A replayed CREATE_ACCOUNT carries the account's name as its author first
// wrote it. Applying that through updateAccount() logged an UPDATE_ACCOUNT and
// pushed it back to the server behind any later rename, so every device that
// replayed the account reverted to the original name.
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach } from 'vitest';
import { BudgetService } from './budget.service.js';
import { db } from '../db/database.js';
import type { Account } from '../types/index.js';

const LOCAL_ID = 'local-copy-of-shared-account';

describe('applyRemoteAccountName', () => {
  beforeEach(async () => {
    await db.open();
    await Promise.all(db.tables.map((table) => table.clear()));
  });

  it('renames the local account without logging a command', async () => {
    const service = new BudgetService();
    await db.accounts.put({ id: LOCAL_ID, name: 'Account (077405ba)', initials: 'ON' } as Account);

    const applied = await service.applyRemoteAccountName(LOCAL_ID, {
      name: 'Online Account 1',
      initials: 'OA',
    });

    expect(applied).toBe(true);
    expect(await db.accounts.get(LOCAL_ID)).toMatchObject({
      name: 'Online Account 1',
      initials: 'OA',
    });
    expect(await db.changeRecords.count()).toBe(0);
  });

  it('keeps the local name when another local account already holds it', async () => {
    const service = new BudgetService();
    await db.accounts.bulkPut([
      { id: 'main-account', name: 'Personal', initials: 'P' },
      { id: LOCAL_ID, name: 'Account (077405ba)', initials: 'ON' },
    ] as Account[]);

    const applied = await service.applyRemoteAccountName(LOCAL_ID, {
      name: 'Personal',
      initials: 'P',
    });

    expect(applied).toBe(false);
    expect(await db.accounts.get(LOCAL_ID)).toMatchObject({
      name: 'Account (077405ba)',
      initials: 'ON',
    });
  });

  it('never creates an account that does not exist on this device', async () => {
    const service = new BudgetService();

    const applied = await service.applyRemoteAccountName('author-device-account-id', {
      name: 'Online Account 1',
      initials: 'OA',
    });

    expect(applied).toBe(false);
    expect(await db.accounts.count()).toBe(0);
  });
});
