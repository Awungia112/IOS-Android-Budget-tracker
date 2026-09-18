/**
 * User Deletion Service
 *
 * Handles permanent deletion of a user account and all associated data.
 * Runs transactionally to prevent orphaned rows on partial failure.
 *
 * Cascade deletion order (all within a single DB transaction):
 *   1. Identify owned accounts via accounts.owner_user_id (authoritative source)
 *      and shared accounts via account_members minus owned IDs
 *   2. Remove the user's account_members entries on shared accounts
 *   3. Delete the user's account_keys unconditionally (FK on user_id is NO ACTION)
 *   4. Remove invites sent by or addressed to the user
 *   5. Delete accounts OWNED by the user (cascades to account_keys, change_records, account_members)
 *   6. Delete the user record itself
 */

import { and, eq, inArray, or, sql } from 'drizzle-orm';
import * as schema from '../db/schema.js';
import type { Db } from './user.repository.js';

export type DeleteUserResult =
  | { status: 'ok' }
  | { status: 'user_not_found' }
  | { status: 'error'; cause: unknown };

type TransactionDb = Parameters<Parameters<Db['transaction']>[0]>[0];

/**
 * Permanently deletes the calling user and all associated server-side data.
 *
 * Runs inside a single database transaction so that a partial failure (e.g.
 * network or constraint error) rolls back the entire operation and leaves no
 * orphaned rows.
 */
export async function deleteUser(
  db: Db,
  userId: string,
): Promise<DeleteUserResult> {
  return db.transaction(async (tx) => {
    // 1. Verify the user exists and get their email hash
    const [user] = await tx
      .select({ id: schema.users.id, emailHash: schema.users.emailHash })
      .from(schema.users)
      .where(eq(schema.users.id, userId))
      .limit(1);

    if (!user) {
      return { status: 'user_not_found' };
    }

    // 2. Find accounts the user OWNS vs accounts they are just a member of.
    //    Owned accounts are fully deleted (including all members' data).
    //    Shared accounts only get the user's membership revoked.
    //
    //    Ownership is determined from accounts.owner_user_id (the authoritative
    //    source), NOT from account_members.role. Relying on the membership row
    //    would cause a silent skip if a self-membership row is ever missing
    //    (created by a different code path, data repair, drift, etc.), leaving
    //    the owned account undelated and the final DELETE FROM users to fail
    //    on the accounts.owner_user_id FK constraint.
    const ownedRows = await tx
      .select({ id: schema.accounts.id })
      .from(schema.accounts)
      .where(eq(schema.accounts.ownerUserId, userId));

    const ownedAccountIds = ownedRows.map((r) => r.id);

    // Shared accounts — everything the user is a member of that they don't own.
    const membershipAccountIds = await tx
      .select({ accountId: schema.accountMembers.accountId })
      .from(schema.accountMembers)
      .where(eq(schema.accountMembers.userId, userId));

    const sharedAccountIds = membershipAccountIds
      .map((r) => r.accountId)
      .filter((id) => !ownedAccountIds.includes(id));

    // 3. Remove the user from shared accounts (where they are a member, not owner)
    if (sharedAccountIds.length > 0) {
      await tx
        .delete(schema.accountMembers)
        .where(
          and(
            eq(schema.accountMembers.userId, userId),
            inArray(schema.accountMembers.accountId, sharedAccountIds),
          ),
        );
    }

    // 4. Delete ALL of the user's account_keys unconditionally.
    // This covers orphaned keys from accounts the user was previously removed
    // from (where the membership row was deleted but the key row was only
    // revoked, not deleted). Without this, the FK on account_keys.user_id →
    // users.id (NO ACTION) would cause step 7 to fail with a FK violation,
    // making GDPR erasure permanently impossible for that user.
    await tx
      .delete(schema.accountKeys)
      .where(eq(schema.accountKeys.userId, userId));

    // 5. Delete invites sent by or addressed to the user
    await tx
      .delete(schema.invites)
      .where(
        or(
          eq(schema.invites.senderUserId, userId),
          eq(schema.invites.recipientEmailHash, user.emailHash),
        ),
      );

    // 6. Delete accounts OWNED by the user.
    //    Foreign key cascades (onDelete: 'cascade') handle:
    //    - account_keys for those accounts
    //    - change_records for those accounts
    //    - account_members for those accounts
    if (ownedAccountIds.length > 0) {
      await tx
        .delete(schema.accounts)
        .where(inArray(schema.accounts.id, ownedAccountIds));
    }

    // 7. Finally, delete the user record itself.
    await tx
      .delete(schema.users)
      .where(eq(schema.users.id, userId));

    return { status: 'ok' };
  });
}
