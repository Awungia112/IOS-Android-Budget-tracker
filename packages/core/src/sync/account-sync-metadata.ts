import { db } from '../db/index.js';
import type { AccountSyncMetadata } from '../types/index.js';

export interface UpsertAccountSyncMetadataInput {
  localAccountId: string;
  serverAccountId: string;
  keyEpoch: number;
  lastSyncSequence?: number;
  role?: 'owner' | 'member';
}

export async function getAccountSyncMetadata(
  localAccountId: string,
): Promise<AccountSyncMetadata | undefined> {
  return db.accountSyncMetadata.get(localAccountId);
}

export async function getAccountSyncMetadataByServerId(
  serverAccountId: string,
): Promise<AccountSyncMetadata | undefined> {
  return db.accountSyncMetadata
    .where('serverAccountId')
    .equals(serverAccountId)
    .first();
}

export async function upsertAccountSyncMetadata(
  input: UpsertAccountSyncMetadataInput,
): Promise<AccountSyncMetadata> {
  const existing = await getAccountSyncMetadata(input.localAccountId);
  const now = new Date().toISOString();
  const record: AccountSyncMetadata = {
    localAccountId: input.localAccountId,
    serverAccountId: input.serverAccountId,
    keyEpoch: input.keyEpoch,
    lastSyncSequence: input.lastSyncSequence ?? existing?.lastSyncSequence,
    role: input.role ?? existing?.role,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };

  await db.accountSyncMetadata.put(record);
  return record;
}

export async function updateAccountSyncMetadataEpochByServerId(
  serverAccountId: string,
  keyEpoch: number,
): Promise<AccountSyncMetadata | undefined> {
  const existing = await getAccountSyncMetadataByServerId(serverAccountId);
  if (!existing) {
    return undefined;
  }

  return upsertAccountSyncMetadata({
    localAccountId: existing.localAccountId,
    serverAccountId,
    keyEpoch,
    lastSyncSequence: existing.lastSyncSequence,
  });
}

export async function deleteAccountSyncMetadata(localAccountId: string): Promise<void> {
  await db.accountSyncMetadata.delete(localAccountId);
}
