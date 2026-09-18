import { and, eq } from 'drizzle-orm';
import * as schema from '../db/schema.js';
import type { Db } from '../users/user.repository.js';
import { sendInviteEmail } from '../auth/email.service.js';
import { encryptEmail, decryptEmail } from '../crypto/email-encryption.js';

export interface InviteMemberInput {
  accountId: string;
  senderUserId: string;
  senderName: string;
  senderEmail?: string; // Used in invite email body so recipient can identify the sender
  recipientEmail: string | null; // Used for email delivery, persisted encrypted at rest
  recipientEmailHash: string;
  accountName: string;
  /** BCP-47 language tag from the client (e.g. 'de', 'en'). Used to localise the invite email. */
  language?: string;
}

export type SharingResult =
  | { status: 'ok' }
  | { status: 'account_not_found' }
  | { status: 'forbidden' }
  | { status: 'already_member' }
  | { status: 'already_invited' }
  | { status: 'cannot_invite_self' }
  | { status: 'not_found' }
  | { status: 'already_responded' }
  | { status: 'cannot_remove_self' }
  | { status: 'error'; message: string };

export async function inviteMember(
  db: Db,
  input: InviteMemberInput,
): Promise<SharingResult> {
  // 1. Check if account exists and user is owner
  const [accountMember] = await db
    .select()
    .from(schema.accountMembers)
    .where(
      and(
        eq(schema.accountMembers.accountId, input.accountId),
        eq(schema.accountMembers.userId, input.senderUserId),
      ),
    )
    .limit(1);

  if (!accountMember) {
    return { status: 'account_not_found' };
  }

  if (accountMember.role !== 'owner') {
    return { status: 'forbidden' };
  }

  // 2. Check if inviting self (simplified check by hash)
  const [sender] = await db
    .select({ emailHash: schema.users.emailHash })
    .from(schema.users)
    .where(eq(schema.users.id, input.senderUserId))
    .limit(1);
    
  if (sender && sender.emailHash === input.recipientEmailHash) {
    return { status: 'cannot_invite_self' };
  }

  // 3. Check if already a member
  const [existingUser] = await db
    .select({ id: schema.users.id })
    .from(schema.users)
    .where(eq(schema.users.emailHash, input.recipientEmailHash))
    .limit(1);

  if (existingUser) {
    const [isMember] = await db
      .select()
      .from(schema.accountMembers)
      .where(
        and(
          eq(schema.accountMembers.accountId, input.accountId),
          eq(schema.accountMembers.userId, existingUser.id),
        ),
      )
      .limit(1);

    if (isMember) {
      return { status: 'already_member' };
    }
  }

  // 4. Check if already invited
  const [isInvited] = await db
    .select()
    .from(schema.invites)
    .where(
      and(
        eq(schema.invites.accountId, input.accountId),
        eq(schema.invites.recipientEmailHash, input.recipientEmailHash),
        eq(schema.invites.status, 'pending'),
      ),
    )
    .limit(1);

  if (isInvited) {
    return { status: 'already_invited' };
  }

  // 5. Create invite — use ON CONFLICT DO NOTHING to handle the unique partial index
  // (invites_pending_account_recipient_unique_idx) which prevents duplicate pending
  // invites under concurrent requests. If a concurrent insert wins the race, treat it
  // as already_invited.
  const inserted = await db
    .insert(schema.invites)
    .values({
      senderUserId: input.senderUserId,
      recipientEmail: encryptEmail(input.recipientEmail),
      recipientEmailHash: input.recipientEmailHash,
      accountId: input.accountId,
      status: 'pending',
      senderName: encryptEmail(input.senderName) ?? input.senderName,
      accountName: input.accountName,
    })
    .onConflictDoNothing()
    .returning({ id: schema.invites.id });

  if (inserted.length === 0) {
    return { status: 'already_invited' };
  }

  // 6. Send email — only if the caller provided the plaintext address (used for delivery, not stored)
  if (input.recipientEmail) {
    try {
      await sendInviteEmail({
        to: input.recipientEmail,
        senderName: input.senderName,
        senderEmail: decryptEmail(accountMember.displayEmail) ?? input.senderEmail,
        accountName: input.accountName,
        language: input.language,
      });
    } catch (error) {
      console.error('Failed to send invite email:', error);
      // Continue anyway, the invite is created
    }
  }

  // 7. Backfill the owner's displayEmail if it was null (first time they invite someone)
  if (!accountMember.displayEmail && input.senderEmail) {
    await db
      .update(schema.accountMembers)
      .set({ displayEmail: encryptEmail(input.senderEmail) })
      .where(
        and(
          eq(schema.accountMembers.accountId, input.accountId),
          eq(schema.accountMembers.userId, input.senderUserId),
        ),
      );
  }

  return { status: 'ok' };
}

export async function getAccountSharingInfo(
  db: Db,
  accountId: string,
  userId: string,
) {
  // Check if user is member
  const [membership] = await db
    .select()
    .from(schema.accountMembers)
    .where(
      and(
        eq(schema.accountMembers.accountId, accountId),
        eq(schema.accountMembers.userId, userId),
      ),
    )
    .limit(1);

  if (!membership) {
    return { status: 'forbidden' };
  }

  const members = await db
    .select({
      userId: schema.accountMembers.userId,
      displayEmail: schema.accountMembers.displayEmail,
      role: schema.accountMembers.role,
      joinedAt: schema.accountMembers.joinedAt,
    })
    .from(schema.accountMembers)
    .where(eq(schema.accountMembers.accountId, accountId));

  // Decrypt displayEmail for UI consumption
  const decryptedMembers = members.map((m) => ({
    ...m,
    displayEmail: decryptEmail(m.displayEmail),
  }));

  const pendingInvites = await db
    .select({
      id: schema.invites.id,
      recipientEmail: schema.invites.recipientEmail,
      recipientEmailHash: schema.invites.recipientEmailHash,
      status: schema.invites.status,
      createdAt: schema.invites.createdAt,
    })
    .from(schema.invites)
    .where(
      and(
        eq(schema.invites.accountId, accountId),
        eq(schema.invites.status, 'pending'),
      ),
    );

  const decryptedPendingInvites = pendingInvites.map((invite) => ({
    ...invite,
    recipientEmail: decryptEmail(invite.recipientEmail),
  }));

  return {
    status: 'ok',
    currentUserId: userId,
    members: decryptedMembers,
    pendingInvites: decryptedPendingInvites,
  };
}

export async function cancelInvite(
  db: Db,
  accountId: string,
  userId: string,
  inviteId: string,
): Promise<SharingResult> {
  const [membership] = await db
    .select()
    .from(schema.accountMembers)
    .where(
      and(
        eq(schema.accountMembers.accountId, accountId),
        eq(schema.accountMembers.userId, userId),
        eq(schema.accountMembers.role, 'owner'),
      ),
    )
    .limit(1);

  if (!membership) {
    return { status: 'forbidden' };
  }

  const updated = await db
    .update(schema.invites)
    .set({ status: 'revoked', respondedAt: new Date() })
    .where(
      and(
        eq(schema.invites.id, inviteId),
        eq(schema.invites.accountId, accountId),
        eq(schema.invites.status, 'pending'),
      ),
    )
    .returning({ id: schema.invites.id });

  if (updated.length === 0) {
    // Check whether the invite exists at all (not_found) or was already responded to
    const [existing] = await db
      .select({ status: schema.invites.status })
      .from(schema.invites)
      .where(
        and(
          eq(schema.invites.id, inviteId),
          eq(schema.invites.accountId, accountId),
        ),
      )
      .limit(1);

    if (!existing) {
      return { status: 'not_found' };
    }

    return { status: 'already_responded' };
  }

  return { status: 'ok' };
}

export async function removeMember(
  db: Db,
  accountId: string,
  userId: string,
  targetUserId: string,
): Promise<SharingResult> {
  const [membership] = await db
    .select()
    .from(schema.accountMembers)
    .where(
      and(
        eq(schema.accountMembers.accountId, accountId),
        eq(schema.accountMembers.userId, userId),
        eq(schema.accountMembers.role, 'owner'),
      ),
    )
    .limit(1);

  if (!membership) {
    return { status: 'forbidden' };
  }

  if (userId === targetUserId) {
    return { status: 'cannot_remove_self' };
  }

  await db.transaction(async (tx) => {
    await tx
      .delete(schema.accountMembers)
      .where(
        and(
          eq(schema.accountMembers.accountId, accountId),
          eq(schema.accountMembers.userId, targetUserId),
        ),
      );

    // Also revoke their keys
    await tx
      .update(schema.accountKeys)
      .set({ revokedAt: new Date() })
      .where(
        and(
          eq(schema.accountKeys.accountId, accountId),
          eq(schema.accountKeys.userId, targetUserId),
        ),
      );
  });

  return { status: 'ok' };
}
