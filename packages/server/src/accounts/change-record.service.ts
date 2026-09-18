import type { SymmetricEnvelope } from '@budget/core/crypto/envelope';
import { and, asc, eq, gt, inArray, isNull } from 'drizzle-orm';

import * as schema from '../db/schema.js';
import type { Db } from '../users/user.repository.js';

export const CHANGE_RECORD_PULL_PAGE_SIZE = 500;

export interface PushChangeRecordInput {
  accountId: string;
  userId: string;
  records: Array<{
    changeUuid: string;
    encryptedPayload: Record<string, unknown>;
  }>;
}

export interface PullChangeRecordsInput {
  accountId: string;
  userId: string;
  since: number;
}

export interface PushedChangeRecord {
  changeUuid: string;
  sequence: number;
}

export interface PulledChangeRecord extends PushedChangeRecord {
  encryptedPayload: unknown;
}

export type PushChangeRecordsResult =
  | {
      status: 'ok';
      results: PushedChangeRecord[];
    }
  | { status: 'account_not_found' }
  | { status: 'forbidden' }
  | { status: 'change_uuid_conflict' };

export type PullChangeRecordsResult =
  | {
      status: 'ok';
      records: PulledChangeRecord[];
      nextSince: number | null;
    }
  | { status: 'account_not_found' }
  | { status: 'forbidden' };

type AccountAccessResult =
  | { status: 'ok' }
  | { status: 'account_not_found' }
  | { status: 'forbidden' };

class ChangeUuidConflictError extends Error {
  constructor() {
    super('change_uuid_conflict');
  }
}

class ChangeRecordInsertFailedError extends Error {
  constructor(readonly missingUuids: string[]) {
    super(`change_record_insert_failed: missing change UUIDs ${missingUuids.join(', ')}`);
  }
}

function distinctRecords(
  records: PushChangeRecordInput['records'],
): PushChangeRecordInput['records'] {
  const seen = new Set<string>();
  const uniqueRecords: PushChangeRecordInput['records'] = [];

  for (const record of records) {
    if (seen.has(record.changeUuid)) {
      continue;
    }

    seen.add(record.changeUuid);
    uniqueRecords.push(record);
  }

  return uniqueRecords;
}

async function authorizeAccountAccess(
  db: Pick<Db, 'select'>,
  input: {
    accountId: string;
    userId: string;
  },
): Promise<AccountAccessResult> {
  const [account] = await db
    .select({ id: schema.accounts.id })
    .from(schema.accounts)
    .where(eq(schema.accounts.id, input.accountId))
    .limit(1);

  if (!account) {
    return { status: 'account_not_found' };
  }

  const [key] = await db
    .select({ accountId: schema.accountKeys.accountId })
    .from(schema.accountKeys)
    .where(
      and(
        eq(schema.accountKeys.accountId, input.accountId),
        eq(schema.accountKeys.userId, input.userId),
        isNull(schema.accountKeys.revokedAt),
      ),
    )
    .limit(1);

  if (!key) {
    return { status: 'forbidden' };
  }

  return { status: 'ok' };
}

export async function pushChangeRecords(
  db: Db,
  input: PushChangeRecordInput,
): Promise<PushChangeRecordsResult> {
  try {
    return await db.transaction(async (tx) => {
      const access = await authorizeAccountAccess(tx, input);
      if (access.status !== 'ok') {
        return access;
      }

      const uniqueRecords = distinctRecords(input.records);
      if (uniqueRecords.length === 0) {
        return { status: 'ok', results: [] };
      }

      const changeUuids = uniqueRecords.map((record) => record.changeUuid);
      const existingRows = await tx
        .select({
          changeUuid: schema.changeRecords.changeUuid,
          accountId: schema.changeRecords.accountId,
        })
        .from(schema.changeRecords)
        .where(inArray(schema.changeRecords.changeUuid, changeUuids))
        .limit(uniqueRecords.length);

      if (existingRows.some((row) => row.accountId !== input.accountId)) {
        throw new ChangeUuidConflictError();
      }

      await tx
        .insert(schema.changeRecords)
        .values(
          uniqueRecords.map((record) => ({
            accountId: input.accountId,
            changeUuid: record.changeUuid,
            encryptedPayload: record.encryptedPayload as unknown as SymmetricEnvelope,
          })),
        )
        .onConflictDoNothing({ target: schema.changeRecords.changeUuid });

      const accountRows = await tx
        .select({
          changeUuid: schema.changeRecords.changeUuid,
          sequence: schema.changeRecords.sequence,
        })
        .from(schema.changeRecords)
        .where(
          and(
            eq(schema.changeRecords.accountId, input.accountId),
            inArray(schema.changeRecords.changeUuid, changeUuids),
          ),
        )
        .limit(uniqueRecords.length);

      const byChangeUuid = new Map(
        accountRows.map((row) => [row.changeUuid, row.sequence]),
      );
      const missingUuids = changeUuids.filter((changeUuid) => !byChangeUuid.has(changeUuid));

      if (missingUuids.length > 0) {
        const conflictingRows = await tx
          .select({ changeUuid: schema.changeRecords.changeUuid })
          .from(schema.changeRecords)
          .where(inArray(schema.changeRecords.changeUuid, missingUuids))
          .limit(missingUuids.length);

        if (conflictingRows.length > 0) {
          throw new ChangeUuidConflictError();
        }

        throw new ChangeRecordInsertFailedError(missingUuids);
      }

      return {
        status: 'ok',
        results: uniqueRecords.map((record) => ({
          changeUuid: record.changeUuid,
          sequence: byChangeUuid.get(record.changeUuid) as number,
        })),
      };
    });
  } catch (error) {
    if (error instanceof ChangeUuidConflictError) {
      return { status: 'change_uuid_conflict' };
    }

    throw error;
  }
}

export async function pullChangeRecords(
  db: Db,
  input: PullChangeRecordsInput,
): Promise<PullChangeRecordsResult> {
  const access = await authorizeAccountAccess(db, input);
  if (access.status !== 'ok') {
    return access;
  }

  const rows = await db
    .select({
      changeUuid: schema.changeRecords.changeUuid,
      sequence: schema.changeRecords.sequence,
      encryptedPayload: schema.changeRecords.encryptedPayload,
    })
    .from(schema.changeRecords)
    .where(
      and(
        eq(schema.changeRecords.accountId, input.accountId),
        gt(schema.changeRecords.sequence, input.since),
      ),
    )
    .orderBy(asc(schema.changeRecords.sequence))
    .limit(CHANGE_RECORD_PULL_PAGE_SIZE + 1);

  const hasMore = rows.length > CHANGE_RECORD_PULL_PAGE_SIZE;
  const page = rows.slice(0, CHANGE_RECORD_PULL_PAGE_SIZE);
  const lastRecord = page.at(-1);

  return {
    status: 'ok',
    records: page.map((record) => ({
      changeUuid: record.changeUuid,
      sequence: record.sequence,
      encryptedPayload: record.encryptedPayload,
    })),
    nextSince: hasMore && lastRecord ? lastRecord.sequence : null,
  };
}
