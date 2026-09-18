import type { AsymmetricEnvelope } from '@budget/core/crypto/envelope';
import { and, count, desc, eq, isNull, sql } from 'drizzle-orm';

import * as schema from '../db/schema.js';
import type { Db } from '../users/user.repository.js';

type TransactionDb = Parameters<Parameters<Db['transaction']>[0]>[0];

/**
 * Verifies that the given user is the owner of the specified account.
 * @param tx - Database transaction or connection
 * @param accountId - The account ID to check
 * @param userId - The user ID to verify
 * @returns A discriminated union indicating the result:
 *   - { status: 'ok' } if the user is the owner
 *   - { status: 'account_not_found' } if the account doesn't exist
 *   - { status: 'forbidden' } if the user is not a member or is not the owner
 */
async function verifyOwnerAccess(
  tx: Db | TransactionDb,
  accountId: string,
  userId: string,
): Promise<
  | { status: 'ok' }
  | { status: 'account_not_found' }
  | { status: 'forbidden' }
> {
  const [member] = await tx
    .select({ role: schema.accountMembers.role })
    .from(schema.accountMembers)
    .where(
      and(
        eq(schema.accountMembers.accountId, accountId),
        eq(schema.accountMembers.userId, userId),
      ),
    )
    .limit(1);

  if (!member) {
    const [account] = await tx
      .select({ id: schema.accounts.id })
      .from(schema.accounts)
      .where(eq(schema.accounts.id, accountId))
      .limit(1);

    return account ? { status: 'forbidden' } : { status: 'account_not_found' };
  }

  if (member.role !== 'owner') {
    return { status: 'forbidden' };
  }

  return { status: 'ok' };
}

async function revokeAcceptedInvitesForRemovedMember(
  tx: TransactionDb,
  input: {
    accountId: string;
    userIdToRemove: string;
  },
): Promise<void> {
  const [removedUser] = await tx
    .select({ emailHash: schema.users.emailHash })
    .from(schema.users)
    .where(eq(schema.users.id, input.userIdToRemove))
    .limit(1);

  if (!removedUser) {
    return;
  }

  await tx
    .update(schema.invites)
    .set({
      status: 'revoked',
      respondedAt: sql`now()`,
    })
    .where(
      and(
        eq(schema.invites.accountId, input.accountId),
        eq(schema.invites.recipientEmailHash, removedUser.emailHash),
        eq(schema.invites.status, 'accepted'),
      ),
    );
}

export interface CreateAccountWithOwnerKeyInput {
  userId: string;
  wrappedKey: Record<string, unknown>;
  epoch: 1;
}

export interface CreateAccountWithOwnerKeyResult {
  id: string;
  keyEpoch: 1;
}

export type AccountKeyLookupResult =
  | {
      status: 'ok';
      accountId: string;
      epoch: number;
      wrappedKey: AsymmetricEnvelope;
    }
  | { status: 'account_not_found' }
  | { status: 'forbidden' };

export interface AccountDiscoveryItem {
  id: string;
  keyEpoch: number;
  role: 'owner' | 'member';
  recordCount: number;
  createdAt: Date;
}

export async function createAccountWithOwnerKey(
  db: Db,
  input: CreateAccountWithOwnerKeyInput,
): Promise<CreateAccountWithOwnerKeyResult> {
  return db.transaction(async (tx) => {
    const [account] = await tx
      .insert(schema.accounts)
      .values({
        ownerUserId: input.userId,
        keyEpoch: input.epoch,
      })
      .returning({
        id: schema.accounts.id,
        keyEpoch: schema.accounts.keyEpoch,
      });

    if (!account) {
      throw new Error('account_create_failed');
    }

    await tx.insert(schema.accountKeys).values({
      accountId: account.id,
      userId: input.userId,
      wrappedKey: input.wrappedKey as unknown as AsymmetricEnvelope,
      epoch: input.epoch,
    });

    await tx.insert(schema.accountMembers).values({
      accountId: account.id,
      userId: input.userId,
      role: 'owner',
    });

    return {
      id: account.id,
      keyEpoch: account.keyEpoch as 1,
    };
  });
}

export async function listAccountsForUser(
  db: Db,
  input: { userId: string },
): Promise<AccountDiscoveryItem[]> {
  const recordCounts = db
    .select({
      accountId: schema.changeRecords.accountId,
      recordCount: count(schema.changeRecords.id).as('record_count'),
    })
    .from(schema.changeRecords)
    .groupBy(schema.changeRecords.accountId)
    .as('record_counts');

  const rows = await db
    .select({
      id: schema.accounts.id,
      keyEpoch: schema.accounts.keyEpoch,
      role: schema.accountMembers.role,
      recordCount: recordCounts.recordCount,
      createdAt: schema.accounts.createdAt,
    })
    .from(schema.accounts)
    .innerJoin(
      schema.accountMembers,
      and(
        eq(schema.accountMembers.accountId, schema.accounts.id),
        eq(schema.accountMembers.userId, input.userId),
      ),
    )
    .innerJoin(
      schema.accountKeys,
      and(
        eq(schema.accountKeys.accountId, schema.accounts.id),
        eq(schema.accountKeys.userId, input.userId),
        isNull(schema.accountKeys.revokedAt),
      ),
    )
    .leftJoin(recordCounts, eq(recordCounts.accountId, schema.accounts.id));

  const byAccountId = new Map<string, AccountDiscoveryItem>();

  for (const row of rows) {
    if (!byAccountId.has(row.id)) {
      byAccountId.set(row.id, {
        id: row.id,
        keyEpoch: row.keyEpoch,
        role: row.role,
        recordCount: Number(row.recordCount ?? 0),
        createdAt: row.createdAt,
      });
    }
  }

  return [...byAccountId.values()];
}

export async function getAccountKeyForUser(
  db: Db,
  input: {
    accountId: string;
    userId: string;
    epoch?: number;
  },
): Promise<AccountKeyLookupResult> {
  // Validate epoch parameter if provided
  if (input.epoch !== undefined && (input.epoch < 1 || !Number.isInteger(input.epoch))) {
    return { status: 'forbidden' };
  }

  const [account] = await db
    .select({ id: schema.accounts.id })
    .from(schema.accounts)
    .where(eq(schema.accounts.id, input.accountId))
    .limit(1);

  if (!account) {
    return { status: 'account_not_found' };
  }

  const where =
    input.epoch === undefined
      ? and(
          eq(schema.accountKeys.accountId, input.accountId),
          eq(schema.accountKeys.userId, input.userId),
          isNull(schema.accountKeys.revokedAt),
        )
      : and(
          eq(schema.accountKeys.accountId, input.accountId),
          eq(schema.accountKeys.userId, input.userId),
          eq(schema.accountKeys.epoch, input.epoch),
          isNull(schema.accountKeys.revokedAt),
        );

  const [key] = await db
    .select({
      accountId: schema.accountKeys.accountId,
      epoch: schema.accountKeys.epoch,
      wrappedKey: schema.accountKeys.wrappedKey,
    })
    .from(schema.accountKeys)
    .where(where)
    .orderBy(desc(schema.accountKeys.epoch))
    .limit(1);

  if (!key) {
    return { status: 'forbidden' };
  }

  return {
    status: 'ok',
    accountId: key.accountId,
    epoch: key.epoch,
    wrappedKey: key.wrappedKey,
  };
}

export interface AccountMember {
  userId: string;
  role: 'owner' | 'member';
  joinedAt: Date;
  publicKey: string;
}

export type GetAccountMembersResult =
  | { status: 'ok'; members: AccountMember[] }
  | { status: 'account_not_found' }
  | { status: 'forbidden' };

export async function getAccountMembers(
  db: Db,
  input: {
    accountId: string;
    requestorUserId: string;
  },
): Promise<GetAccountMembersResult> {
  const [account] = await db
    .select({ id: schema.accounts.id })
    .from(schema.accounts)
    .where(eq(schema.accounts.id, input.accountId))
    .limit(1);

  if (!account) {
    return { status: 'account_not_found' };
  }

  const [requestorKey] = await db
    .select({ accountId: schema.accountKeys.accountId })
    .from(schema.accountKeys)
    .where(
      and(
        eq(schema.accountKeys.accountId, input.accountId),
        eq(schema.accountKeys.userId, input.requestorUserId),
        isNull(schema.accountKeys.revokedAt),
      ),
    )
    .limit(1);

  if (!requestorKey) {
    return { status: 'forbidden' };
  }

  const members = await db
    .select({
      userId: schema.accountMembers.userId,
      role: schema.accountMembers.role,
      joinedAt: schema.accountMembers.joinedAt,
      publicKey: schema.users.publicKey,
    })
    .from(schema.accountMembers)
    .innerJoin(
      schema.users,
      eq(schema.users.id, schema.accountMembers.userId),
    )
    .where(eq(schema.accountMembers.accountId, input.accountId));

  return {
    status: 'ok',
    members: members.map((m) => ({
      userId: m.userId,
      role: m.role,
      joinedAt: m.joinedAt,
      publicKey: m.publicKey,
    })),
  };
}

export type RemoveAccountMemberResult =
  | { status: 'ok'; newEpoch: number }
  | { status: 'account_not_found' }
  | { status: 'forbidden' }
  | { status: 'cannot_remove_owner' }
  | { status: 'member_not_found' };

export async function removeAccountMember(
  db: Db,
  input: {
    accountId: string;
    requestorUserId: string;
    userIdToRemove: string;
  },
): Promise<RemoveAccountMemberResult> {
  return db.transaction(async (tx) => {
    // Verify requestor is owner
    const authResult = await verifyOwnerAccess(tx, input.accountId, input.requestorUserId);
    if (authResult.status !== 'ok') {
      return authResult;
    }

    // Cannot remove the owner
    if (input.requestorUserId === input.userIdToRemove) {
      return { status: 'cannot_remove_owner' };
    }

    // Verify the member to remove exists
    const [memberToRemove] = await tx
      .select({ role: schema.accountMembers.role })
      .from(schema.accountMembers)
      .where(
        and(
          eq(schema.accountMembers.accountId, input.accountId),
          eq(schema.accountMembers.userId, input.userIdToRemove),
        ),
      )
      .limit(1);

    if (!memberToRemove) {
      return { status: 'member_not_found' };
    }

    if (memberToRemove.role === 'owner') {
      return { status: 'cannot_remove_owner' };
    }

    await revokeAcceptedInvitesForRemovedMember(tx, input);

    // Remove the member
    await tx
      .delete(schema.accountMembers)
      .where(
        and(
          eq(schema.accountMembers.accountId, input.accountId),
          eq(schema.accountMembers.userId, input.userIdToRemove),
        ),
      );

    // Revoke the user's account key
    await tx
      .update(schema.accountKeys)
      .set({ revokedAt: sql`now()` })
      .where(
        and(
          eq(schema.accountKeys.accountId, input.accountId),
          eq(schema.accountKeys.userId, input.userIdToRemove),
          isNull(schema.accountKeys.revokedAt),
        ),
      );

    // Increment the key epoch
    const [updatedAccount] = await tx
      .update(schema.accounts)
      .set({ keyEpoch: sql`${schema.accounts.keyEpoch} + 1` })
      .where(eq(schema.accounts.id, input.accountId))
      .returning({ keyEpoch: schema.accounts.keyEpoch });

    if (!updatedAccount) {
      throw new Error('account_update_failed');
    }

    return { status: 'ok', newEpoch: updatedAccount.keyEpoch };
  });
}

export interface RemoveAccountMemberAndUploadWrappedKeysInput {
  accountId: string;
  requestorUserId: string;
  userIdToRemove: string;
  wrappedKeys: Array<{
    userId: string;
    wrappedKey: Record<string, unknown>;
  }>;
}

export type RemoveAccountMemberAndUploadWrappedKeysResult =
  | { status: 'ok'; newEpoch: number }
  | { status: 'account_not_found' }
  | { status: 'forbidden' }
  | { status: 'cannot_remove_owner' }
  | { status: 'member_not_found' }
  | { status: 'non_member'; userId: string };

export async function removeAccountMemberAndUploadWrappedKeys(
  db: Db,
  input: RemoveAccountMemberAndUploadWrappedKeysInput,
): Promise<RemoveAccountMemberAndUploadWrappedKeysResult> {
  return db.transaction(async (tx) => {
    const authResult = await verifyOwnerAccess(tx, input.accountId, input.requestorUserId);
    if (authResult.status !== 'ok') {
      return authResult;
    }

    if (input.requestorUserId === input.userIdToRemove) {
      return { status: 'cannot_remove_owner' };
    }

    const [memberToRemove] = await tx
      .select({ role: schema.accountMembers.role })
      .from(schema.accountMembers)
      .where(
        and(
          eq(schema.accountMembers.accountId, input.accountId),
          eq(schema.accountMembers.userId, input.userIdToRemove),
        ),
      )
      .limit(1);

    if (!memberToRemove) {
      return { status: 'member_not_found' };
    }

    if (memberToRemove.role === 'owner') {
      return { status: 'cannot_remove_owner' };
    }

    await revokeAcceptedInvitesForRemovedMember(tx, input);

    await tx
      .delete(schema.accountMembers)
      .where(
        and(
          eq(schema.accountMembers.accountId, input.accountId),
          eq(schema.accountMembers.userId, input.userIdToRemove),
        ),
      );

    await tx
      .update(schema.accountKeys)
      .set({ revokedAt: sql`now()` })
      .where(
        and(
          eq(schema.accountKeys.accountId, input.accountId),
          eq(schema.accountKeys.userId, input.userIdToRemove),
          isNull(schema.accountKeys.revokedAt),
        ),
      );

    const [updatedAccount] = await tx
      .update(schema.accounts)
      .set({ keyEpoch: sql`${schema.accounts.keyEpoch} + 1` })
      .where(eq(schema.accounts.id, input.accountId))
      .returning({ keyEpoch: schema.accounts.keyEpoch });

    if (!updatedAccount) {
      throw new Error('account_update_failed');
    }

    const currentMembers = await tx
      .select({ userId: schema.accountMembers.userId })
      .from(schema.accountMembers)
      .where(eq(schema.accountMembers.accountId, input.accountId));

    const memberSet = new Set(currentMembers.map((m) => m.userId));

    for (const wrappedKey of input.wrappedKeys) {
      if (!memberSet.has(wrappedKey.userId)) {
        return { status: 'non_member', userId: wrappedKey.userId };
      }
    }

    for (const wrappedKey of input.wrappedKeys) {
      await tx
        .insert(schema.accountKeys)
        .values({
          accountId: input.accountId,
          userId: wrappedKey.userId,
          wrappedKey: wrappedKey.wrappedKey as unknown as AsymmetricEnvelope,
          epoch: updatedAccount.keyEpoch,
        })
        .onConflictDoUpdate({
          target: [schema.accountKeys.accountId, schema.accountKeys.userId, schema.accountKeys.epoch],
          set: {
            wrappedKey: wrappedKey.wrappedKey as unknown as AsymmetricEnvelope,
          },
        });
    }

    return { status: 'ok', newEpoch: updatedAccount.keyEpoch };
  });
}

export interface BatchUploadWrappedKeysInput {
  accountId: string;
  requestorUserId: string;
  newEpoch: number;
  wrappedKeys: Array<{
    userId: string;
    wrappedKey: Record<string, unknown>;
  }>;
}

export type BatchUploadWrappedKeysResult =
  | { status: 'ok' }
  | { status: 'account_not_found' }
  | { status: 'forbidden' }
  | { status: 'epoch_mismatch' }
  | { status: 'non_member'; userId: string };

export async function batchUploadWrappedKeys(
  db: Db,
  input: BatchUploadWrappedKeysInput,
): Promise<BatchUploadWrappedKeysResult> {
  return db.transaction(async (tx) => {
    // Verify requestor is owner
    const authResult = await verifyOwnerAccess(tx, input.accountId, input.requestorUserId);
    if (authResult.status !== 'ok') {
      return authResult;
    }

    // Verify the epoch matches
    const [account] = await tx
      .select({ keyEpoch: schema.accounts.keyEpoch })
      .from(schema.accounts)
      .where(eq(schema.accounts.id, input.accountId))
      .limit(1);

    if (!account) {
      return { status: 'account_not_found' };
    }

    if (account.keyEpoch !== input.newEpoch) {
      return { status: 'epoch_mismatch' };
    }

    // Fetch the current member set once for the membership check below
    const currentMembers = await tx
      .select({ userId: schema.accountMembers.userId })
      .from(schema.accountMembers)
      .where(eq(schema.accountMembers.accountId, input.accountId));

    const memberSet = new Set(currentMembers.map((m) => m.userId));

    // Reject any wrapped key whose target user is no longer a member.
    // Without this guard a removed user included in the batch would get a
    // fresh non-revoked account_keys row, silently re-enabling their access.
    for (const wrappedKey of input.wrappedKeys) {
      if (!memberSet.has(wrappedKey.userId)) {
        return { status: 'non_member', userId: wrappedKey.userId };
      }
    }

    // Insert the new wrapped keys (upsert to allow retries)
    for (const wrappedKey of input.wrappedKeys) {
      await tx
        .insert(schema.accountKeys)
        .values({
          accountId: input.accountId,
          userId: wrappedKey.userId,
          wrappedKey: wrappedKey.wrappedKey as unknown as AsymmetricEnvelope,
          epoch: input.newEpoch,
        })
        .onConflictDoUpdate({
          target: [schema.accountKeys.accountId, schema.accountKeys.userId, schema.accountKeys.epoch],
          set: {
            wrappedKey: wrappedKey.wrappedKey as unknown as AsymmetricEnvelope,
          },
        });
    }

    return { status: 'ok' };
  });
}
