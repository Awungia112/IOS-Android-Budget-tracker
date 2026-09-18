// @vitest-environment node

import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { encryptChangeRecord } from '../changelog/change-record-crypto.js';
import type { ChangeRecord, Command } from '../commands/types.js';
import { COMMAND_TYPES } from '../commands/types.js';
import {
  generateAccountKey,
  loadAccountKey,
  wrapAccountKey,
  type AsymmetricEnvelope,
  type SymmetricEnvelope,
} from '../crypto/index.js';
import { generateKeypair } from '../crypto/keys.js';
import { resetPrivateKeyStoreMock } from '../crypto/private-key-store-plugin.test-mock.js';
import { db } from '../db/index.js';
import { BudgetService } from '../services/budget.service.js';
import { getAccountSyncMetadataByServerId, upsertAccountSyncMetadata } from './account-sync-metadata.js';
import type { OnlineAccountsClient, PulledChangeRecord } from './online-accounts-client.js';
import { replayRecoveredOnlineAccounts } from './recovery-replay.js';

vi.mock('../crypto/private-key-store-plugin', () => import('../crypto/private-key-store-plugin.test-mock'));

const SERVER_ACCOUNT_ID = '11111111-1111-4111-8111-111111111111';
const LOCAL_ACCOUNT_ID = 'restored-account';
const CREATED_AT = '2026-06-01T00:00:00.000Z';

interface FakeClientInput {
  wrappedKey: AsymmetricEnvelope;
  records: PulledChangeRecord[];
  pageSize?: number;
}

function makeCommand(
  sequence: number,
  payload: Record<string, unknown> = { id: `tx-${sequence}`, accountId: LOCAL_ACCOUNT_ID },
): Command {
  return {
    type: COMMAND_TYPES.CREATE_TRANSACTION,
    payload: {
      type: 'expense',
      amount: sequence,
      category: 'cat-1',
      date: '2026-06-01',
      title: `Transaction ${sequence}`,
      ...payload,
    },
    timestamp: CREATED_AT,
    sequence,
  } as unknown as Command;
}

function makeChangeRecord(
  sequence: number,
  overrides: Partial<ChangeRecord> = {},
): ChangeRecord {
  return {
    id: `change-${sequence}`,
    accountId: LOCAL_ACCOUNT_ID,
    command: makeCommand(sequence),
    timestamp: CREATED_AT,
    synced: true,
    ...overrides,
  };
}

async function encryptRemoteRecords(
  records: ChangeRecord[],
  accountKey: Uint8Array,
): Promise<PulledChangeRecord[]> {
  return Promise.all(
    records.map(async (record, index) => ({
      change_uuid: record.id,
      sequence: index + 1,
      encrypted_payload: await encryptChangeRecord(record, accountKey),
    })),
  );
}

function createFakeClient(input: FakeClientInput): OnlineAccountsClient & {
  listAccounts: ReturnType<typeof vi.fn<OnlineAccountsClient['listAccounts']>>;
  getAccountKey: ReturnType<typeof vi.fn<OnlineAccountsClient['getAccountKey']>>;
  pullChangeRecords: ReturnType<typeof vi.fn<OnlineAccountsClient['pullChangeRecords']>>;
} {
  const pageSize = input.pageSize ?? input.records.length;
  const listAccounts = vi.fn<OnlineAccountsClient['listAccounts']>(async () => ({
    accounts: [
      {
        id: SERVER_ACCOUNT_ID,
        keyEpoch: 1,
        role: 'owner',
        recordCount: input.records.length,
        createdAt: CREATED_AT,
      },
    ],
  }));
  const getAccountKey = vi.fn<OnlineAccountsClient['getAccountKey']>(async () => ({
    accountId: SERVER_ACCOUNT_ID,
    epoch: 1,
    wrappedKey: input.wrappedKey,
  }));
  const pullChangeRecords = vi.fn<OnlineAccountsClient['pullChangeRecords']>(async ({ since = 0 }) => {
    const remaining = input.records.filter(record => record.sequence > since);
    const page = remaining.slice(0, pageSize);
    const hasMore = remaining.length > page.length;
    const last = page[page.length - 1];

    return {
      records: page,
      next_since: hasMore && last ? last.sequence : null,
    };
  });

  return {
    listAccounts,
    getAccountKey,
    pullChangeRecords,
    createAccount: vi.fn(async () => {
      throw new Error('unexpected createAccount call');
    }),
    pushChangeRecords: vi.fn(async () => {
      throw new Error('unexpected pushChangeRecords call');
    }),
    pollPendingKeyRequests: vi.fn(async () => {
      throw new Error('unexpected pollPendingKeyRequests call');
    }),
    getRecipientPublicKey: vi.fn(async () => {
      throw new Error('unexpected getRecipientPublicKey call');
    }),
    deliverAccountKey: vi.fn(async () => {
      throw new Error('unexpected deliverAccountKey call');
    }),
    getAccountMembers: vi.fn(async () => {
      throw new Error('unexpected getAccountMembers call');
    }),
    removeAccountMember: vi.fn(async () => {
      throw new Error('unexpected removeAccountMember call');
    }),
    removeAccountMemberAndUploadWrappedKeys: vi.fn(async () => {
      throw new Error('unexpected removeAccountMemberAndUploadWrappedKeys call');
    }),
    batchUploadWrappedKeys: vi.fn(async () => {
      throw new Error('unexpected batchUploadWrappedKeys call');
    }),
    getSharingInfo: vi.fn(async () => {
      throw new Error('unexpected getSharingInfo call');
    }),
    inviteMember: vi.fn(async () => {
      throw new Error('unexpected inviteMember call');
    }),
    cancelInvite: vi.fn(async () => {
      throw new Error('unexpected cancelInvite call');
    }),
    removeMember: vi.fn(async () => {
      throw new Error('unexpected removeMember call');
    }),
    listPendingInvitesForMe: vi.fn(async () => {
      throw new Error('unexpected listPendingInvitesForMe call');
    }),
    acceptInvite: vi.fn(async () => {
      throw new Error('unexpected acceptInvite call');
    }),
    declineInvite: vi.fn(async () => {
      throw new Error('unexpected declineInvite call');
    }),
    updateDisplayEmail: vi.fn().mockResolvedValue(undefined),
    deleteAccount: vi.fn(async () => {
      throw new Error('unexpected deleteAccount call');
    }),
    deleteRecoveryData: vi.fn(async () => {
      throw new Error('unexpected deleteRecoveryData call');
    }),
  };
}

async function createCryptoFixture(records: ChangeRecord[], pageSize?: number) {
  const { publicKey, privateKey } = await generateKeypair();
  const accountKey = await generateAccountKey();
  const wrappedKey = await wrapAccountKey(accountKey, publicKey);
  const remoteRecords = await encryptRemoteRecords(records, accountKey);

  return {
    publicKey,
    privateKey,
    accountKey,
    client: createFakeClient({ wrappedKey, records: remoteRecords, pageSize }),
  };
}

beforeEach(async () => {
  resetPrivateKeyStoreMock();
  await db.delete();
  await db.open();
});

describe('replayRecoveredOnlineAccounts', () => {
  it('unwraps the account key, stores it, paginates records, replays commands, and emits progress', async () => {
    const records = [1, 2, 3].map(sequence => makeChangeRecord(sequence));
    const { publicKey, privateKey, accountKey, client } = await createCryptoFixture(records, 2);
    const executeCommand = vi.fn(async () => undefined);
    const onProgress = vi.fn();

    const result = await replayRecoveredOnlineAccounts({
      client,
      userPublicKey: publicKey,
      userPrivateKey: privateKey,
      executeCommand,
      onProgress,
    });

    expect(result).toEqual({
      accounts: [
        {
          serverAccountId: SERVER_ACCOUNT_ID,
          localAccountId: LOCAL_ACCOUNT_ID,
          keyEpoch: 1,
          replayed: 3,
          total: 3,
        },
      ],
    });
    await expect(loadAccountKey(SERVER_ACCOUNT_ID)).resolves.toEqual(accountKey);
    expect(executeCommand).toHaveBeenCalledTimes(3);
    expect(client.pullChangeRecords).toHaveBeenNthCalledWith(1, {
      accountId: SERVER_ACCOUNT_ID,
      since: 0,
    });
    expect(client.pullChangeRecords).toHaveBeenNthCalledWith(2, {
      accountId: SERVER_ACCOUNT_ID,
      since: 2,
    });
    expect(onProgress).toHaveBeenLastCalledWith({
      accountId: SERVER_ACCOUNT_ID,
      replayed: 3,
      total: 3,
    });
    await expect(getAccountSyncMetadataByServerId(SERVER_ACCOUNT_ID)).resolves.toMatchObject({
      localAccountId: LOCAL_ACCOUNT_ID,
      lastSyncSequence: 3,
    });
    await expect(db.remoteReplayRecords.count()).resolves.toBe(3);
  });

  it('resumes from the last committed sequence after command failure', async () => {
    const records = [1, 2, 3].map(sequence => makeChangeRecord(sequence));
    const { publicKey, privateKey, client } = await createCryptoFixture(records);
    let calls = 0;
    const failingCommand = vi.fn(async () => {
      calls += 1;
      if (calls === 2) {
        throw new Error('command failed');
      }
    });

    await expect(
      replayRecoveredOnlineAccounts({
        client,
        userPublicKey: publicKey,
        userPrivateKey: privateKey,
        executeCommand: failingCommand,
      }),
    ).rejects.toThrow('command failed');

    await expect(getAccountSyncMetadataByServerId(SERVER_ACCOUNT_ID)).resolves.toMatchObject({
      lastSyncSequence: 1,
    });
    await expect(db.remoteReplayRecords.count()).resolves.toBe(1);

    client.pullChangeRecords.mockClear();
    const executeCommand = vi.fn(async () => undefined);
    await replayRecoveredOnlineAccounts({
      client,
      userPublicKey: publicKey,
      userPrivateKey: privateKey,
      executeCommand,
      clearLocalData: false,
    });

    expect(client.pullChangeRecords).toHaveBeenNthCalledWith(1, {
      accountId: SERVER_ACCOUNT_ID,
      since: 1,
    });
    expect(executeCommand).toHaveBeenCalledTimes(2);
    await expect(getAccountSyncMetadataByServerId(SERVER_ACCOUNT_ID)).resolves.toMatchObject({
      lastSyncSequence: 3,
    });
    await expect(db.remoteReplayRecords.count()).resolves.toBe(3);
  });

  it('skips already marked records without calling the command executor', async () => {
    const records = [1, 2].map(sequence => makeChangeRecord(sequence));
    const { publicKey, privateKey, client } = await createCryptoFixture(records);

    await replayRecoveredOnlineAccounts({
      client,
      userPublicKey: publicKey,
      userPrivateKey: privateKey,
      executeCommand: vi.fn(async () => undefined),
    });
    await upsertAccountSyncMetadata({
      localAccountId: LOCAL_ACCOUNT_ID,
      serverAccountId: SERVER_ACCOUNT_ID,
      keyEpoch: 1,
      lastSyncSequence: 0,
    });

    const executeCommand = vi.fn(async () => undefined);
    await replayRecoveredOnlineAccounts({
      client,
      userPublicKey: publicKey,
      userPrivateKey: privateKey,
      executeCommand,
      clearLocalData: false,
    });

    expect(executeCommand).not.toHaveBeenCalled();
    await expect(getAccountSyncMetadataByServerId(SERVER_ACCOUNT_ID)).resolves.toMatchObject({
      lastSyncSequence: 2,
    });
  });

  it('does not mark or advance cursor when decrypting a record fails', async () => {
    const records = [makeChangeRecord(1)];
    const { publicKey, privateKey } = await generateKeypair();
    const accountKey = await generateAccountKey();
    const wrappedKey = await wrapAccountKey(accountKey, publicKey);
    const remoteRecords = await encryptRemoteRecords(records, accountKey);
    const firstRecord = remoteRecords[0];
    if (!firstRecord) {
      throw new Error('missing test record');
    }

    const envelope = firstRecord.encrypted_payload as SymmetricEnvelope;
    firstRecord.encrypted_payload = {
      ...envelope,
      ciphertext: `${envelope.ciphertext.slice(0, -1)}${envelope.ciphertext.endsWith('A') ? 'B' : 'A'}`,
    };
    const client = createFakeClient({ wrappedKey, records: remoteRecords });

    await expect(
      replayRecoveredOnlineAccounts({
        client,
        userPublicKey: publicKey,
        userPrivateKey: privateKey,
        executeCommand: vi.fn(async () => undefined),
      }),
    ).rejects.toThrow();

    await expect(getAccountSyncMetadataByServerId(SERVER_ACCOUNT_ID)).resolves.toBeUndefined();
    await expect(db.remoteReplayRecords.count()).resolves.toBe(0);
  });

  it('rejects when one server account decrypts records for multiple local accounts', async () => {
    const records = [
      makeChangeRecord(1),
      makeChangeRecord(2, { accountId: 'different-local-account' }),
    ];
    const { publicKey, privateKey, client } = await createCryptoFixture(records);

    await expect(
      replayRecoveredOnlineAccounts({
        client,
        userPublicKey: publicKey,
        userPrivateKey: privateKey,
        executeCommand: vi.fn(async () => undefined),
      }),
    ).rejects.toThrow('contains records for multiple local accounts');

    await expect(getAccountSyncMetadataByServerId(SERVER_ACCOUNT_ID)).resolves.toMatchObject({
      lastSyncSequence: 1,
    });
    await expect(db.remoteReplayRecords.count()).resolves.toBe(1);
  });

  it('replays 50 encrypted records into a fresh Dexie database and is idempotent on rerun', async () => {
    const records: ChangeRecord[] = [
      makeChangeRecord(1, {
        command: {
          type: COMMAND_TYPES.CREATE_ACCOUNT,
          payload: {
            id: LOCAL_ACCOUNT_ID,
            name: 'Restored account',
            initials: 'RA',
          },
          timestamp: CREATED_AT,
          sequence: 1,
        } as unknown as Command,
      }),
      makeChangeRecord(2, {
        command: {
          type: COMMAND_TYPES.CREATE_CATEGORY,
          payload: {
            id: 'cat-1',
            accountId: LOCAL_ACCOUNT_ID,
            name: 'Food',
            type: 'expense',
            isDefault: false,
          },
          timestamp: CREATED_AT,
          sequence: 2,
        } as unknown as Command,
      }),
      ...Array.from({ length: 48 }, (_, index) => {
        const sequence = index + 3;
        return makeChangeRecord(sequence, {
          command: makeCommand(sequence),
        });
      }),
    ];
    const { publicKey, privateKey, client } = await createCryptoFixture(records, 20);
    const service = new BudgetService();

    await replayRecoveredOnlineAccounts({
      client,
      userPublicKey: publicKey,
      userPrivateKey: privateKey,
      executeCommand: command => service.executeCommand(command),
    });

    await expect(db.accounts.get(LOCAL_ACCOUNT_ID)).resolves.toMatchObject({
      id: LOCAL_ACCOUNT_ID,
      name: 'Restored account',
    });
    await expect(db.categories.where('accountId').equals(LOCAL_ACCOUNT_ID).count()).resolves.toBe(1);
    await expect(db.transactions.where('accountId').equals(LOCAL_ACCOUNT_ID).count()).resolves.toBe(48);

    const secondRunExecutor = vi.fn((command: Command) => service.executeCommand(command));
    await replayRecoveredOnlineAccounts({
      client,
      userPublicKey: publicKey,
      userPrivateKey: privateKey,
      executeCommand: secondRunExecutor,
      clearLocalData: false,
    });

    expect(secondRunExecutor).not.toHaveBeenCalled();
    await expect(db.accounts.count()).resolves.toBe(1);
    await expect(db.categories.where('accountId').equals(LOCAL_ACCOUNT_ID).count()).resolves.toBe(1);
    await expect(db.transactions.where('accountId').equals(LOCAL_ACCOUNT_ID).count()).resolves.toBe(48);
    await expect(db.remoteReplayRecords.count()).resolves.toBe(50);
  });
});
