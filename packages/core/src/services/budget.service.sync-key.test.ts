// @vitest-environment node

import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { resetPrivateKeyStoreMock } from '../crypto/private-key-store-plugin.test-mock.js';

vi.mock('../crypto/private-key-store-plugin', () => import('../crypto/private-key-store-plugin.test-mock'));

import { uploadQueue, decryptChangeRecord } from '../changelog/index.js';
import { generateAccountKey, storeAccountKey } from '../crypto/account-key.js';
import { db } from '../db/index.js';
import { upsertAccountSyncMetadata } from '../sync/account-sync-metadata.js';
import { BudgetService } from './budget.service.js';

const LOCAL_ACCOUNT_A = '11111111-1111-4111-8111-111111111111';
const LOCAL_ACCOUNT_B = '22222222-2222-4222-8222-222222222222';
const SERVER_ACCOUNT_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const SERVER_ACCOUNT_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

beforeEach(async () => {
  resetPrivateKeyStoreMock();
  await db.delete();
  await db.open();
});

describe('BudgetService online account key selection', () => {
  it('encrypts a write with the key for the target local account, not a previously loaded account key', async () => {
    await db.accounts.bulkPut([
      { id: LOCAL_ACCOUNT_A, name: 'Account A', initials: 'AA' },
      { id: LOCAL_ACCOUNT_B, name: 'Account B', initials: 'BB' },
    ]);

    const accountKeyA = await generateAccountKey();
    const accountKeyB = await generateAccountKey();
    await storeAccountKey(SERVER_ACCOUNT_A, accountKeyA);
    await storeAccountKey(SERVER_ACCOUNT_B, accountKeyB);

    await upsertAccountSyncMetadata({
      localAccountId: LOCAL_ACCOUNT_A,
      serverAccountId: SERVER_ACCOUNT_A,
      keyEpoch: 1,
      role: 'owner',
    });
    await upsertAccountSyncMetadata({
      localAccountId: LOCAL_ACCOUNT_B,
      serverAccountId: SERVER_ACCOUNT_B,
      keyEpoch: 1,
      role: 'owner',
    });

    const service = new BudgetService();
    await service.loadKeyForAccount(SERVER_ACCOUNT_A);

    await service.createTransaction(
      {
        type: 'expense',
        amount: 42,
        category: 'expense-food',
        date: '2026-06-29',
        title: 'Account B transaction',
      },
      LOCAL_ACCOUNT_B,
    );

    const queued = await uploadQueue.getAllByAccount(LOCAL_ACCOUNT_B);
    expect(queued).toHaveLength(1);

    const decryptedWithB = await decryptChangeRecord(queued[0].encrypted_payload, accountKeyB);
    expect(decryptedWithB.accountId).toBe(LOCAL_ACCOUNT_B);
    expect(decryptedWithB.command.type).toBe('CREATE_TRANSACTION');
    expect(decryptedWithB.command.payload).toMatchObject({
      accountId: LOCAL_ACCOUNT_B,
      title: 'Account B transaction',
    });

    await expect(decryptChangeRecord(queued[0].encrypted_payload, accountKeyA)).rejects.toThrow(
      /decryption failed/i,
    );
  });
});
