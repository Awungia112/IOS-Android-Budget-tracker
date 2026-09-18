/**
 * Unit tests for createRemoteCommandReplayer, plus the duplicate-account
 * regression replayed against a real BudgetService and IndexedDB.
 *
 * The regression: a member's shared-account provisioning replayed the owner's
 * UPDATE_ACCOUNT without re-targeting it, so put() inserted the owner's
 * account under the owner's id as a second, empty, unlinked account. Logout
 * kept it (it had no sync metadata) and the next sign-in restored the real
 * account beside it, leaving two accounts with the same name.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  BudgetService,
  db,
  upsertAccountSyncMetadata,
  type Command,
} from '@budget/core';
import { createRemoteCommandReplayer, type RemoteReplayService } from './remoteCommandReplay';

const LOCAL_ID = 'member-local-account';
const AUTHOR_ID = 'owner-local-account';

function remote(type: string, payload: unknown, sequence = 1): Command {
  return { type, payload, timestamp: '2026-09-10T18:04:17.311Z', sequence } as Command;
}

function makeService(): RemoteReplayService & { executed: Command[] } {
  const executed: Command[] = [];
  return {
    executed,
    executeCommand: vi.fn(async (command: Command) => {
      executed.push(command);
    }),
    applyRemoteAccountName: vi.fn().mockResolvedValue(true),
  };
}

describe('createRemoteCommandReplayer', () => {
  it('points UPDATE_ACCOUNT at the local account instead of its author', async () => {
    const service = makeService();

    await createRemoteCommandReplayer(LOCAL_ID, service)(
      remote('UPDATE_ACCOUNT', { id: AUTHOR_ID, name: 'Online Account 1', initials: 'OA' }),
    );

    expect(service.executed).toHaveLength(1);
    expect(service.executed[0].payload).toEqual({
      id: LOCAL_ID,
      name: 'Online Account 1',
      initials: 'OA',
    });
  });

  it('re-targets accountId on entity commands and keeps the entity id', async () => {
    const service = makeService();

    await createRemoteCommandReplayer(LOCAL_ID, service)(
      remote('CREATE_TRANSACTION', { id: 'tx-1', accountId: AUTHOR_ID, amount: 12 }),
    );

    expect(service.executed[0].payload).toEqual({ id: 'tx-1', accountId: LOCAL_ID, amount: 12 });
  });

  it('re-targets every category in BULK_CREATE_CATEGORIES', async () => {
    const service = makeService();

    await createRemoteCommandReplayer(LOCAL_ID, service)(
      remote('BULK_CREATE_CATEGORIES', {
        categories: [
          { id: 'cat-1', accountId: AUTHOR_ID },
          { id: 'cat-2', accountId: AUTHOR_ID },
        ],
      }),
    );

    expect(service.executed[0].payload).toEqual({
      categories: [
        { id: 'cat-1', accountId: LOCAL_ID },
        { id: 'cat-2', accountId: LOCAL_ID },
      ],
    });
  });

  it('passes commands without an account reference through unchanged', async () => {
    const service = makeService();
    const command = remote('DELETE_TRANSACTION', { id: 'tx-1' });

    await createRemoteCommandReplayer(LOCAL_ID, service)(command);

    expect(service.executed).toEqual([command]);
  });

  it('re-targets nested transaction tombstones to the local account', async () => {
    const service = makeService();
    const tombstone = {
      id: 'tx-occurrence',
      accountId: AUTHOR_ID,
      recurringItemId: 'rec-1',
      recurringOccurrenceDate: '2026-09-12',
      archivedAt: '2026-09-12T10:00:00.000Z',
    };

    await createRemoteCommandReplayer(LOCAL_ID, service)(
      remote('DELETE_TRANSACTION', { id: tombstone.id, transaction: tombstone }),
    );

    expect(service.executed[0].payload).toEqual({
      id: tombstone.id,
      transaction: { ...tombstone, accountId: LOCAL_ID },
    });
  });

  it('takes only the name from CREATE_ACCOUNT and never executes it', async () => {
    const service = makeService();

    await createRemoteCommandReplayer(LOCAL_ID, service)(
      remote('CREATE_ACCOUNT', { id: AUTHOR_ID, name: 'Online Account 1', initials: 'OA' }),
    );

    expect(service.applyRemoteAccountName).toHaveBeenCalledWith(LOCAL_ID, {
      name: 'Online Account 1',
      initials: 'OA',
    });
    expect(service.executeCommand).not.toHaveBeenCalled();
  });

  it('does not let a failed rename abort the pull', async () => {
    const service = makeService();
    vi.mocked(service.applyRemoteAccountName).mockRejectedValue(new Error('db closed'));
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => { });

    await expect(
      createRemoteCommandReplayer(LOCAL_ID, service)(
        remote('CREATE_ACCOUNT', { id: AUTHOR_ID, name: 'Online Account 1', initials: 'OA' }),
      ),
    ).resolves.toBeUndefined();

    warn.mockRestore();
  });
});

describe('replaying an owner stream into a member account', () => {
  beforeEach(async () => {
    await db.open();
    await Promise.all(db.tables.map((table) => table.clear()));
  });

  it('leaves exactly one copy of the shared account, which logout removes', async () => {
    const service = new BudgetService();
    await db.accounts.put({ id: 'main-account', name: 'Personal', initials: 'P' });

    // What provisionSharedAccount creates and links before its first pull.
    const local = await service.createAccount({ name: 'Shared Account', initials: 'SA' }, true);
    await upsertAccountSyncMetadata({
      localAccountId: local.id,
      serverAccountId: 'server-account',
      keyEpoch: 1,
      role: 'member',
    });
    const recordsBeforePull = await db.changeRecords.count();

    const owner = { id: AUTHOR_ID, name: 'Online Account 1', initials: 'OA' };
    const replay = createRemoteCommandReplayer(local.id, service);
    for (const command of [
      remote('CREATE_ACCOUNT', owner, 1),
      remote('BULK_CREATE_CATEGORIES', { categories: [{ id: 'cat-1', name: 'Books', type: 'expense', accountId: AUTHOR_ID }] }, 2),
      remote('CREATE_TRANSACTION', { id: 'tx-1', accountId: AUTHOR_ID, categoryId: 'cat-1', amount: 12 }, 3),
      remote('UPDATE_ACCOUNT', owner, 4),
    ]) {
      await replay(command);
    }

    expect((await service.getAccounts()).map((a) => a.id).sort()).toEqual(
      ['main-account', local.id].sort(),
    );
    expect(await db.accounts.get(AUTHOR_ID)).toBeUndefined();
    expect(await db.accounts.get(local.id)).toMatchObject({ name: 'Online Account 1', initials: 'OA' });
    expect(await db.categories.where('accountId').equals(local.id).count()).toBe(1);
    expect(await db.transactions.where('accountId').equals(local.id).count()).toBe(1);
    // Applying the pulled name must not publish it back as an UPDATE_ACCOUNT.
    expect(await db.changeRecords.count()).toBe(recordsBeforePull);

    await service.deleteAllOnlineAccounts();

    expect((await service.getAccounts()).map((a) => a.id)).toEqual(['main-account']);
  });
});
