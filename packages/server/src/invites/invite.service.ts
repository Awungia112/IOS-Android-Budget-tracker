import type { AsymmetricEnvelope } from '@budget/core/crypto/envelope';
import { and, eq, isNull, notExists, sql } from 'drizzle-orm';

import * as schema from '../db/schema.js';
import type { Db } from '../users/user.repository.js';
import { decryptEmail } from '../crypto/email-encryption.js';


// ─── List Pending Invites (recipient) ────────────────────────────────────────

export interface PendingInvite {
  id: string;
  accountId: string;
  senderUserId: string;
  /** Sender's display name stored at invite creation time. */
  senderName: string | null;
  /** Sender's display email resolved from accountMembers at query time. */
  senderEmail: string | null;
  /** Account name stored at invite creation time. */
  accountName: string | null;
  createdAt: Date;
}

export async function listPendingInvitesForRecipient(
  db: Db,
  input: { recipientEmailHash: string },
): Promise<PendingInvite[]> {
  const rows = await db
    .select({
      id: schema.invites.id,
      accountId: schema.invites.accountId,
      senderUserId: schema.invites.senderUserId,
      senderName: schema.invites.senderName,
      accountName: schema.invites.accountName,
      createdAt: schema.invites.createdAt,
      // Resolve the sender's display email from their account membership row.
      // Uses a LEFT JOIN so invites are still returned even if the sender has
      // been removed from the account in the meantime.
      senderEmail: schema.accountMembers.displayEmail,
    })
    .from(schema.invites)
    .leftJoin(
      schema.accountMembers,
      and(
        eq(schema.accountMembers.accountId, schema.invites.accountId),
        eq(schema.accountMembers.userId, schema.invites.senderUserId),
      ),
    )
    .where(
      and(
        eq(schema.invites.recipientEmailHash, input.recipientEmailHash),
        eq(schema.invites.status, 'pending'),
      ),
    );

  return rows.map((row) => ({
    id: row.id,
    accountId: row.accountId,
    senderUserId: row.senderUserId,
    senderName: decryptEmail(row.senderName),
    senderEmail: decryptEmail(row.senderEmail) ?? null,
    accountName: row.accountName,
    createdAt: row.createdAt,
  }));
}

// ─── Accept Invite ────────────────────────────────────────────────────────────

export type AcceptInviteResult =
  | { status: 'ok' }
  | { status: 'not_found' }
  | { status: 'already_responded' }
  | { status: 'forbidden' };

export async function acceptInvite(
  db: Db,
  input: { inviteId: string; recipientEmailHash: string },
): Promise<AcceptInviteResult> {
  // First verify the invite exists and belongs to this recipient (these checks
  // don't need to be atomic — ownership of an invite is immutable).
  const [invite] = await db
    .select({
      id: schema.invites.id,
      recipientEmailHash: schema.invites.recipientEmailHash,
    })
    .from(schema.invites)
    .where(eq(schema.invites.id, input.inviteId))
    .limit(1);

  if (!invite) {
    return { status: 'not_found' };
  }

  if (invite.recipientEmailHash !== input.recipientEmailHash) {
    return { status: 'forbidden' };
  }

  // Atomic conditional update: only succeeds if the row is still 'pending'.
  // Concurrent accept/cancel calls race on this UPDATE; exactly one gets a row back.
  const [updated] = await db
    .update(schema.invites)
    .set({ status: 'accepted', respondedAt: sql`now()` })
    .where(
      and(
        eq(schema.invites.id, input.inviteId),
        eq(schema.invites.status, 'pending'),
      ),
    )
    .returning({ id: schema.invites.id });

  if (!updated) {
    return { status: 'already_responded' };
  }

  return { status: 'ok' };
}

// ─── Decline Invite (recipient) ──────────────────────────────────────────────

export type DeclineInviteResult =
  | { status: 'ok' }
  | { status: 'not_found' }
  | { status: 'already_responded' }
  | { status: 'forbidden' };

export async function declineInvite(
  db: Db,
  input: { inviteId: string; recipientEmailHash: string },
): Promise<DeclineInviteResult> {
  const [invite] = await db
    .select({
      id: schema.invites.id,
      recipientEmailHash: schema.invites.recipientEmailHash,
    })
    .from(schema.invites)
    .where(eq(schema.invites.id, input.inviteId))
    .limit(1);

  if (!invite) {
    return { status: 'not_found' };
  }

  if (invite.recipientEmailHash !== input.recipientEmailHash) {
    return { status: 'forbidden' };
  }

  const [updated] = await db
    .update(schema.invites)
    .set({ status: 'declined', respondedAt: sql`now()` })
    .where(
      and(
        eq(schema.invites.id, input.inviteId),
        eq(schema.invites.status, 'pending'),
      ),
    )
    .returning({ id: schema.invites.id });

  if (!updated) {
    return { status: 'already_responded' };
  }

  return { status: 'ok' };
}

// ─── Cancel Invite (owner) ────────────────────────────────────────────────────

export type CancelInviteResult =
  | { status: 'ok' }
  | { status: 'not_found' }
  | { status: 'forbidden' }
  | { status: 'already_responded' };

export async function cancelInvite(
  db: Db,
  input: { inviteId: string; senderUserId: string },
): Promise<CancelInviteResult> {
  // Ownership is immutable — safe to check separately.
  const [invite] = await db
    .select({
      id: schema.invites.id,
      senderUserId: schema.invites.senderUserId,
    })
    .from(schema.invites)
    .where(eq(schema.invites.id, input.inviteId))
    .limit(1);

  if (!invite) {
    return { status: 'not_found' };
  }

  if (invite.senderUserId !== input.senderUserId) {
    return { status: 'forbidden' };
  }

  // Atomic conditional update: only succeeds if the row is still 'pending'.
  const [updated] = await db
    .update(schema.invites)
    .set({ status: 'revoked', respondedAt: sql`now()` })
    .where(
      and(
        eq(schema.invites.id, input.inviteId),
        eq(schema.invites.status, 'pending'),
      ),
    )
    .returning({ id: schema.invites.id });

  if (!updated) {
    return { status: 'already_responded' };
  }

  return { status: 'ok' };
}

// ─── Pending Key Requests (owner polling) ────────────────────────────────────

export interface PendingKeyDelivery {
  inviteId: string;
  recipientUserId: string;
  recipientPublicKey: string;
}

export async function listPendingKeyDeliveries(
  db: Db,
  input: { accountId: string; ownerUserId: string },
  logger?: { info: (msg: Record<string, unknown>, label: string) => void },
): Promise<PendingKeyDelivery[] | 'account_not_found' | 'forbidden'> {
  // Verify the account exists and caller is owner
  const [member] = await db
    .select({ role: schema.accountMembers.role })
    .from(schema.accountMembers)
    .where(
      and(
        eq(schema.accountMembers.accountId, input.accountId),
        eq(schema.accountMembers.userId, input.ownerUserId),
      ),
    )
    .limit(1);

  if (!member) {
    const [account] = await db
      .select({ id: schema.accounts.id })
      .from(schema.accounts)
      .where(eq(schema.accounts.id, input.accountId))
      .limit(1);

    return account ? 'forbidden' : 'account_not_found';
  }

  if (member.role !== 'owner') {
    return 'forbidden';
  }

  // Return accepted invites where no account_key has been delivered yet
  const rows = await db
    .select({
      inviteId: schema.invites.id,
      recipientUserId: schema.users.id,
      recipientPublicKey: schema.users.publicKey,
    })
    .from(schema.invites)
    .innerJoin(
      schema.users,
      eq(schema.users.emailHash, schema.invites.recipientEmailHash),
    )
    .where(
      and(
        eq(schema.invites.accountId, input.accountId),
        eq(schema.invites.status, 'accepted'),
        notExists(
          db
            .select({ one: sql`1` })
            .from(schema.accountKeys)
            .where(
              and(
                eq(schema.accountKeys.accountId, input.accountId),
                eq(schema.accountKeys.userId, schema.users.id),
                isNull(schema.accountKeys.revokedAt),
              ),
            ),
        ),
      ),
    );

  // ── Diagnostic: if no rows, check whether invites exist but the JOIN fails ──
  if (rows.length === 0 && logger) {
    const [acceptedInvite] = await db
      .select({
        id: schema.invites.id,
        recipientEmailHash: schema.invites.recipientEmailHash,
        status: schema.invites.status,
      })
      .from(schema.invites)
      .where(
        and(
          eq(schema.invites.accountId, input.accountId),
          eq(schema.invites.status, 'accepted'),
        ),
      )
      .limit(1);

    if (acceptedInvite) {
      const [matchingUser] = await db
        .select({ id: schema.users.id, emailHash: schema.users.emailHash })
        .from(schema.users)
        .where(eq(schema.users.emailHash, acceptedInvite.recipientEmailHash))
        .limit(1);

      // Check if a key already exists for this user+account (the NOT EXISTS clause)
      let existingKey: { accountId: string; userId: string; epoch: number; revokedAt: Date | null } | undefined;
      if (matchingUser) {
        [existingKey] = await db
          .select({
            accountId: schema.accountKeys.accountId,
            userId: schema.accountKeys.userId,
            epoch: schema.accountKeys.epoch,
            revokedAt: schema.accountKeys.revokedAt,
          })
          .from(schema.accountKeys)
          .where(
            and(
              eq(schema.accountKeys.accountId, input.accountId),
              eq(schema.accountKeys.userId, matchingUser.id),
            ),
          )
          .limit(1);
      }

      const reason = existingKey
        ? 'key already delivered'
        : !matchingUser
          ? 'recipient user not found by email hash'
          : 'unknown reason';
      logger.info(
        {
          accountId: input.accountId,
          acceptedInviteId: acceptedInvite.id,
          recipientEmailHash: acceptedInvite.recipientEmailHash,
          matchingUserFound: !!matchingUser,
          matchingUserId: matchingUser?.id,
          matchingUserEmailHash: matchingUser?.emailHash,
          existingKeyForUser: !!existingKey,
          existingKeyEpoch: existingKey?.epoch,
          existingKeyRevokedAt: existingKey?.revokedAt,
          reason,
        },
        `listPendingKeyDeliveries: no pending deliveries (${reason})`,
      );
    } else {
      logger.info(
        { accountId: input.accountId },
        'listPendingKeyDeliveries: no accepted invites for this account',
      );
    }
  }

  return rows;
}

// ─── Deliver Wrapped Key ──────────────────────────────────────────────────────

export type DeliverKeyResult =
  | { status: 'ok' }
  | { status: 'account_not_found' }
  | { status: 'forbidden' }
  | { status: 'invite_not_accepted' };

export async function deliverWrappedKey(
  db: Db,
  input: {
    accountId: string;
    ownerUserId: string;
    recipientUserId: string;
    wrappedKey: Record<string, unknown>;
    epoch: number;
  },
): Promise<DeliverKeyResult> {
  return db.transaction(async (tx) => {
    // Verify caller is owner of account
    const [member] = await tx
      .select({ role: schema.accountMembers.role })
      .from(schema.accountMembers)
      .where(
        and(
          eq(schema.accountMembers.accountId, input.accountId),
          eq(schema.accountMembers.userId, input.ownerUserId),
        ),
      )
      .limit(1);

    if (!member) {
      const [account] = await tx
        .select({ id: schema.accounts.id })
        .from(schema.accounts)
        .where(eq(schema.accounts.id, input.accountId))
        .limit(1);

      return account ? { status: 'forbidden' } : { status: 'account_not_found' };
    }

    if (member.role !== 'owner') {
      return { status: 'forbidden' };
    }

    // Verify an accepted invite exists for this recipient
    const [recipientUser] = await tx
      .select({ emailHash: schema.users.emailHash })
      .from(schema.users)
      .where(eq(schema.users.id, input.recipientUserId))
      .limit(1);

    if (!recipientUser) {
      return { status: 'invite_not_accepted' };
    }

    const [invite] = await tx
      .select({ id: schema.invites.id })
      .from(schema.invites)
      .where(
        and(
          eq(schema.invites.accountId, input.accountId),
          eq(schema.invites.recipientEmailHash, recipientUser.emailHash),
          eq(schema.invites.status, 'accepted'),
        ),
      )
      .limit(1);

    if (!invite) {
      return { status: 'invite_not_accepted' };
    }

    // Store the wrapped key for the current account epoch only. Do not
    // reactivate older revoked key rows: after member removal the account epoch
    // increments, and reusing an old epoch row would make the recipient visible
    // in listAccounts but unable to fetch the current account key.
    const [active] = await tx
      .select({ accountId: schema.accountKeys.accountId })
      .from(schema.accountKeys)
      .where(
        and(
          eq(schema.accountKeys.accountId, input.accountId),
          eq(schema.accountKeys.userId, input.recipientUserId),
          isNull(schema.accountKeys.revokedAt),
        ),
      )
      .limit(1);

    if (!active) {
      await tx
        .insert(schema.accountKeys)
        .values({
          accountId: input.accountId,
          userId: input.recipientUserId,
          wrappedKey: input.wrappedKey as unknown as AsymmetricEnvelope,
          epoch: input.epoch,
        })
        .onConflictDoUpdate({
          target: [schema.accountKeys.accountId, schema.accountKeys.userId, schema.accountKeys.epoch],
          set: {
            wrappedKey: input.wrappedKey as unknown as AsymmetricEnvelope,
            revokedAt: null,
          },
        });
    }

    // Add as account member, storing the display email from the invite
    // First check if the recipient already has a displayEmail on another account (their owner row)
    const [recipientOwnerRow] = await tx
      .select({ displayEmail: schema.accountMembers.displayEmail })
      .from(schema.accountMembers)
      .where(
        and(
          eq(schema.accountMembers.userId, input.recipientUserId),
          eq(schema.accountMembers.role, 'owner'),
        ),
      )
      .limit(1);

    const [inviteRow] = await tx
      .select({ recipientEmail: schema.invites.recipientEmail })
      .from(schema.invites)
      .where(eq(schema.invites.id, invite.id))
      .limit(1);

    const displayEmail =
      recipientOwnerRow?.displayEmail ??
      inviteRow?.recipientEmail ??
      null;

    await tx
      .insert(schema.accountMembers)
      .values({
        accountId: input.accountId,
        userId: input.recipientUserId,
        role: 'member',
        displayEmail,
      })
      .onConflictDoUpdate({
        target: [schema.accountMembers.accountId, schema.accountMembers.userId],
        set: { displayEmail },
      });

    return { status: 'ok' };
  });
}
