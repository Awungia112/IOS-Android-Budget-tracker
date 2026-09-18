import { decryptChangeRecord } from '../changelog/change-record-crypto.js';
import type { ChangeRecord, Command } from '../commands/types.js';
import { storeAccountKey, unwrapAccountKey, type SymmetricEnvelope } from '../crypto/index.js';
import { db } from '../db/index.js';
import type { AccountSyncMetadata, RemoteReplayRecord } from '../types/index.js';
import {
  getAccountSyncMetadataByServerId,
  upsertAccountSyncMetadata,
} from './account-sync-metadata.js';
import type {
  OnlineAccountsClient,
  OnlineAccountSummary,
  PulledChangeRecord,
} from './online-accounts-client.js';

export interface AccountReplayProgress {
  accountId: string;
  replayed: number;
  total: number;
}

export interface ReplayRecoveredOnlineAccountsInput {
  client: OnlineAccountsClient;
  userPublicKey: Uint8Array;
  userPrivateKey: Uint8Array;
  executeCommand: (command: Command) => Promise<void>;
  onProgress?: (event: AccountReplayProgress) => void;
  clearLocalData?: boolean;
}

export interface ReplayRecoveredOnlineAccountsResult {
  accounts: Array<{
    serverAccountId: string;
    localAccountId?: string;
    keyEpoch: number;
    replayed: number;
    total: number;
  }>;
}

interface ReplayAccountInput {
  account: OnlineAccountSummary;
  accountKey: Uint8Array;
  keyEpoch: number;
  client: OnlineAccountsClient;
  executeCommand: (command: Command) => Promise<void>;
  onProgress?: (event: AccountReplayProgress) => void;
}

const REPLAY_CLEANUP_TABLES = [
  db.accounts,
  db.transactions,
  db.categories,
  db.limits,
  db.templates,
  db.recurringItems,
  db.savingsGoals,
  db.changeRecords,
  db.accountSyncMetadata,
  db.uploadQueue,
  db.remoteReplayRecords,
] as const;

async function clearLocalDataForRecoveryReplay(): Promise<void> {
  await db.transaction(
    'rw',
    REPLAY_CLEANUP_TABLES,
    async () => {
      for (const table of REPLAY_CLEANUP_TABLES) {
        await table.clear();
      }
    },
  );
}

function assertRemoteRecordMatchesPayload(
  remoteRecord: PulledChangeRecord,
  changeRecord: ChangeRecord,
): void {
  if (changeRecord.id !== remoteRecord.change_uuid) {
    throw new Error(
      `Remote change UUID mismatch for sequence ${remoteRecord.sequence}`,
    );
  }
}

function assertConsistentLocalAccount(
  serverAccountId: string,
  expectedLocalAccountId: string | undefined,
  changeRecord: ChangeRecord,
): string {
  return assertConsistentLocalAccountId(
    serverAccountId,
    expectedLocalAccountId,
    changeRecord.accountId,
  );
}

function assertConsistentLocalAccountId(
  serverAccountId: string,
  expectedLocalAccountId: string | undefined,
  actualLocalAccountId: string,
): string {
  if (!expectedLocalAccountId) {
    return actualLocalAccountId;
  }

  if (actualLocalAccountId !== expectedLocalAccountId) {
    throw new Error(
      `Recovered server account ${serverAccountId} contains records for multiple local accounts`,
    );
  }

  return expectedLocalAccountId;
}

async function updateReplayCursor(input: {
  localAccountId: string;
  serverAccountId: string;
  keyEpoch: number;
  sequence: number;
}): Promise<AccountSyncMetadata> {
  return upsertAccountSyncMetadata({
    localAccountId: input.localAccountId,
    serverAccountId: input.serverAccountId,
    keyEpoch: input.keyEpoch,
    lastSyncSequence: input.sequence,
  });
}

async function commitReplayedRecord(input: {
  serverAccountId: string;
  keyEpoch: number;
  remoteRecord: PulledChangeRecord;
  changeRecord: ChangeRecord;
  executeCommand: (command: Command) => Promise<void>;
}): Promise<{ applied: boolean; localAccountId: string }> {
  return db.transaction(
    'rw',
    [
      db.accounts,
      db.transactions,
      db.categories,
      db.limits,
      db.templates,
      db.recurringItems,
      db.savingsGoals,
      db.accountSyncMetadata,
      db.remoteReplayRecords,
    ],
    async () => {
      const existing = await db.remoteReplayRecords.get(input.remoteRecord.change_uuid);
      if (existing) {
        await updateReplayCursor({
          localAccountId: existing.localAccountId,
          serverAccountId: input.serverAccountId,
          keyEpoch: input.keyEpoch,
          sequence: input.remoteRecord.sequence,
        });

        return {
          applied: false,
          localAccountId: existing.localAccountId,
        };
      }

      await input.executeCommand(input.changeRecord.command);

      const replayedAt = new Date().toISOString();
      const replayMarker: RemoteReplayRecord = {
        changeUuid: input.remoteRecord.change_uuid,
        serverAccountId: input.serverAccountId,
        localAccountId: input.changeRecord.accountId,
        sequence: input.remoteRecord.sequence,
        replayedAt,
      };

      await db.remoteReplayRecords.put(replayMarker);
      await updateReplayCursor({
        localAccountId: input.changeRecord.accountId,
        serverAccountId: input.serverAccountId,
        keyEpoch: input.keyEpoch,
        sequence: input.remoteRecord.sequence,
      });

      return {
        applied: true,
        localAccountId: input.changeRecord.accountId,
      };
    },
  );
}

async function replayRecoveredAccount(input: ReplayAccountInput): Promise<{
  localAccountId?: string;
  replayed: number;
  total: number;
}> {
  const { account, accountKey, keyEpoch, client, executeCommand, onProgress } = input;
  const total = account.recordCount;
  let metadata = await getAccountSyncMetadataByServerId(account.id);
  let localAccountId = metadata?.localAccountId;
  let since = metadata?.lastSyncSequence ?? 0;
  let replayed = await db.remoteReplayRecords
    .where('serverAccountId')
    .equals(account.id)
    .count();

  if (total === 0) {
    onProgress?.({ accountId: account.id, replayed: 0, total });
  }

  while (true) {
    const page = await client.pullChangeRecords({
      accountId: account.id,
      since,
    });

    for (const remoteRecord of page.records) {
      const existing = await db.remoteReplayRecords.get(remoteRecord.change_uuid);
      if (existing) {
        localAccountId = assertConsistentLocalAccountId(
          account.id,
          localAccountId,
          existing.localAccountId,
        );
        await updateReplayCursor({
          localAccountId,
          serverAccountId: account.id,
          keyEpoch,
          sequence: remoteRecord.sequence,
        });
        since = remoteRecord.sequence;
        onProgress?.({ accountId: account.id, replayed, total });
        continue;
      }

      const changeRecord = await decryptChangeRecord(
        remoteRecord.encrypted_payload as SymmetricEnvelope,
        accountKey,
      );
      assertRemoteRecordMatchesPayload(remoteRecord, changeRecord);
      localAccountId = assertConsistentLocalAccount(account.id, localAccountId, changeRecord);

      const commit = await commitReplayedRecord({
        serverAccountId: account.id,
        keyEpoch,
        remoteRecord,
        changeRecord,
        executeCommand,
      });

      metadata = await getAccountSyncMetadataByServerId(account.id);
      localAccountId = metadata?.localAccountId ?? commit.localAccountId;
      since = remoteRecord.sequence;
      if (commit.applied) {
        replayed += 1;
      }
      onProgress?.({ accountId: account.id, replayed, total });
    }

    if (page.next_since === null) {
      break;
    }

    since = page.next_since;
  }

  return {
    localAccountId,
    replayed,
    total,
  };
}

export async function replayRecoveredOnlineAccounts(
  input: ReplayRecoveredOnlineAccountsInput,
): Promise<ReplayRecoveredOnlineAccountsResult> {
  if (input.clearLocalData ?? true) {
    await clearLocalDataForRecoveryReplay();
  }

  const { accounts } = await input.client.listAccounts();
  const results: ReplayRecoveredOnlineAccountsResult['accounts'] = [];

  for (const account of accounts) {
    const remoteKey = await input.client.getAccountKey({ accountId: account.id });
    const accountKey = await unwrapAccountKey(
      remoteKey.wrappedKey,
      input.userPublicKey,
      input.userPrivateKey,
    );

    await storeAccountKey(account.id, accountKey);

    const replayResult = await replayRecoveredAccount({
      account,
      accountKey,
      keyEpoch: remoteKey.epoch,
      client: input.client,
      executeCommand: input.executeCommand,
      onProgress: input.onProgress,
    });

    results.push({
      serverAccountId: account.id,
      localAccountId: replayResult.localAccountId,
      keyEpoch: remoteKey.epoch,
      replayed: replayResult.replayed,
      total: replayResult.total,
    });
  }

  return { accounts: results };
}
