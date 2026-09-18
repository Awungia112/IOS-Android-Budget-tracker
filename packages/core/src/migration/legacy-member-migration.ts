/**
 * LegacyMemberMigrationService
 *
 * Maps legacy shared-account permissions to new account_members model.
 *
 * For each legacy shared-account member:
 * 1. Checks if they are already a member of the new server account
 * 2. If YES (already registered + member): wraps the account key with their
 *    public key and delivers the AsymmetricEnvelope via POST /v1/accounts/:id/keys
 * 3. If NO (not yet a member): sends a pending invite via POST /v1/accounts/:id/invites
 *    with the BLAKE2b-256 email hash
 *
 * Role mapping:
 *   legacy 'owner' → 'owner'
 *   legacy 'member' → 'member'
 */

import { wrapAccountKey } from '../crypto/account-key.js';
import { fromBase64url } from '../crypto/envelope.js';
import { hashEmail } from '../crypto/hashing.js';
import type { OnlineAccountsClient } from '../sync/online-accounts-client.js';
import { OnlineAccountsError } from '../sync/online-accounts-client.js';
import type { LegacyAccess } from './legacy-types.js';

// =============================================================================
// TYPES
// =============================================================================

export interface LegacyMemberMigrationInput {
  /** Server-side account UUID (NOT the local Dexie account ID) */
  serverAccountId: string;
  /** The 32-byte symmetric account key to wrap for each registered member */
  accountKey: Uint8Array;
  /** Current key epoch of the server account */
  epoch: number;
  /** Authenticated client for the new online accounts API */
  client: OnlineAccountsClient;
  /** Email of the legacy account owner (skipped during migration) */
  ownerEmail: string;
  /** Emails of all legacy shared members */
  memberEmails: string[];
  /**
   * Maps each member email to their legacy role string (e.g. 'owner' | 'member').
   * Used with mapLegacyRole() to determine the new account_members role.
   * If a member is not present in this map, defaults to 'member'.
   */
  memberRoles?: Record<string, string>;
  /** Pepper used for BLAKE2b-256 email hashing (shared secret with server) */
  emailHashPepper: string;
  /** Display name of the sender (shown in invite notification) */
  senderName: string;
  /** Name of the account (shown in invite notification) */
  accountName: string;
  /**
   * BCP-47 language tag (e.g. 'de', 'en') used to localise invite emails.
   * Defaults to 'en' when omitted.
   */
  language?: string;
}

export interface LegacyMemberMigrationResult {
  /** Number of members for whom a wrapped key was successfully delivered */
  deliveredKeys: number;
  /** Number of invites sent to not-yet-registered members */
  sentInvites: number;
  /** Number of members skipped (e.g. already invited, already had key) */
  skipped: number;
  /** Non-fatal error messages collected during migration */
  errors: string[];
  /**
   * Maps each migrated member email to their resolved new-system role.
   * Roles are determined via mapLegacyRole() from the input memberRoles map.
   * Callers may use this to issue a PATCH if the server supports role assignment.
   */
  memberRoles: Record<string, 'owner' | 'member'>;
}

// =============================================================================
// ROLE MAPPING
// =============================================================================

/**
 * Maps a legacy API role string to the new account_members role.
 *
 * Legacy API roles: 'owner', 'member'
 * New API roles:    'owner', 'member'
 *
 * The mapping is a pass-through for known roles; unknown values default to
 * 'member' for forward compatibility.
 */
export function mapLegacyRole(role: string): 'owner' | 'member' {
  if (role === 'owner') return 'owner';
  return 'member';
}

// =============================================================================
// LEGACY ACCESS EXTRACTION
// =============================================================================

export interface ExtractedMembers {
  ownerEmail: string | undefined;
  memberEmails: string[];
  memberRoles: Record<string, string>;
}

/**
 * Extracts owner email, member emails, and member roles from LegacyAccess[]
 * for a specific account.
 *
 * This bridges the dataflow from LegacyApiClient.fetchAccesses() →
 * LegacyMemberMigrationService.migrateMembers(), covering the extraction
 * that was previously untested.
 *
 * @param accesses - All access records from the legacy API
 * @param accountId - The numeric legacy account ID to filter by
 * @returns Extracted owner email, member emails, and a role map
 */
export function extractMembersFromAccesses(
  accesses: LegacyAccess[],
  accountId: number,
): ExtractedMembers {
  const accountAccesses = accesses.filter(a => a.account === accountId);

  const ownerAccess = accountAccesses.find(a => a.role === 'owner');
  const ownerEmail =
    ownerAccess && typeof ownerAccess.user === 'object'
      ? ownerAccess.user.email
      : undefined;

  const memberAccesses = accountAccesses.filter(a => a.role === 'member');
  const memberEmails: string[] = [];
  const memberRoles: Record<string, string> = {};

  for (const access of memberAccesses) {
    if (typeof access.user === 'object' && access.user.email) {
      memberEmails.push(access.user.email);
      memberRoles[access.user.email] = access.role;
    }
  }

  return { ownerEmail, memberEmails, memberRoles };
}

// =============================================================================
// SERVICE
// =============================================================================

export class LegacyMemberMigrationService {
  constructor(private readonly emailHashPepper: string) {}

  /**
   * Migrates legacy shared-account members into the new account_members model.
   *
   * Strategy:
   *   1. Fetch current sharing info from server (existing members + their emails)
   *   2. Fetch current member keys (to map userId → publicKey)
   *   3. For each legacy member (excluding owner):
   *      a. If already a server member → wrap account key with their public key
   *         and deliver it via POST /v1/accounts/:id/keys
   *      b. If not a server member → send invite with BLAKE2b-256 email hash
   */
  async migrateMembers(
    input: LegacyMemberMigrationInput,
  ): Promise<LegacyMemberMigrationResult> {
    const result: LegacyMemberMigrationResult = {
      deliveredKeys: 0,
      sentInvites: 0,
      skipped: 0,
      errors: [],
      memberRoles: {},
    };

    // 1. Fetch current sharing info to identify existing members by email
    const sharingInfo = await input.client.getSharingInfo(input.serverAccountId);
    const memberByEmail = new Map<string, string>();
    for (const member of sharingInfo.members) {
      if (member.displayEmail) {
        memberByEmail.set(member.displayEmail.toLowerCase(), member.userId);
      }
    }

    // 2. Fetch current member keys to map userId → publicKey
    const accountMembers = await input.client.getAccountMembers({
      accountId: input.serverAccountId,
    });
    const publicKeyByUserId = new Map<string, string>();
    for (const member of accountMembers.members) {
      if (member.publicKey) {
        publicKeyByUserId.set(member.userId, member.publicKey);
      }
    }

    // 3. Process each legacy member
    for (const email of input.memberEmails) {
      if (email.toLowerCase() === input.ownerEmail.toLowerCase()) continue;

      const emailHash = await hashEmail(email, input.emailHashPepper);
      const existingUserId = memberByEmail.get(email.toLowerCase());

      // Resolve the new-system role via mapLegacyRole().
      // Legacy roles: 'owner' → 'owner', everything else → 'member'.
      const legacyRole = input.memberRoles?.[email] ?? 'member';
      const resolvedRole = mapLegacyRole(legacyRole);
      result.memberRoles[email] = resolvedRole;

      if (existingUserId) {
        // Already a server member — deliver wrapped account key
        const publicKey = publicKeyByUserId.get(existingUserId);
        if (!publicKey) {
          // Member is registered on the server but hasn't uploaded a public key yet.
          // They will get access when they register and upload one.
          result.skipped++;
          continue;
        }

        try {
          const publicKeyBytes = await fromBase64url(publicKey);
          const wrappedKey = await wrapAccountKey(input.accountKey, publicKeyBytes);
          await input.client.deliverAccountKey({
            accountId: input.serverAccountId,
            userId: existingUserId,
            wrappedKey,
            epoch: input.epoch,
          });

          // Role: legacy 'member' → new 'member'; legacy 'owner' already skipped.
          // TODO: Neither deliverAccountKey nor inviteMember accepts a role parameter today.
          // The server assigns 'member' by default for new members, which matches the
          // legacy mapping for all non-owner members. If role differentiation is needed,
          // a PATCH /v1/accounts/:id/members/:userId/role endpoint should be added.
          result.deliveredKeys++;
        } catch (err) {
          result.errors.push(
            `Key delivery failed for ${email}: ${err instanceof Error ? err.message : 'Unknown error'}`,
          );
        }
      } else {
        // Not a server member — send invite
        try {
          await input.client.inviteMember({
            accountId: input.serverAccountId,
            recipientEmail: email,
            recipientEmailHash: emailHash,
            senderName: input.senderName,
            accountName: input.accountName,
            language: input.language,
          });
          result.sentInvites++;
        } catch (err) {
          // already_invited or already_member are not errors for us
          if (err instanceof OnlineAccountsError) {
            const errorBody = err.body as { error?: string } | undefined;
            if (
              errorBody?.error === 'already_member' ||
              errorBody?.error === 'already_invited' ||
              errorBody?.error === 'cannot_invite_self'
            ) {
              result.skipped++;
            } else {
              result.errors.push(
                `Invite failed for ${email}: HTTP ${err.status} - ${err.message}`,
              );
            }
          } else {
            result.errors.push(
              `Invite failed for ${email}: ${err instanceof Error ? err.message : 'Unknown error'}`,
            );
          }
        }
      }
    }

    return result;
  }
}
