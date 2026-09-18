/**
 * Integration tests for the deleteUser cascade logic.
 *
 * These tests exercise the REAL database (Docker PostgreSQL) and the REAL
 * deleteUser service function (NOT mocked), verifying that the transactional
 * cascade correctly handles:
 *   - owned accounts (fully deleted with all FK cascades)
 *   - shared account memberships (removed + keys deleted for FK constraint)
 *   - invites (sent by or to the user)
 *   - user record deletion
 *   - idempotency on repeated calls
 *   - complete cleanup of a freshly created user with owned account
 */

import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';

import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { buildServer } from '../app.js';
import {
  dockerAvailable,
  startPostgres,
  stopPostgres,
  type TestPostgres,
} from '../test/postgres-integration-helpers.js';
import { deleteUser } from './user-deletion.service.js';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const OWNER_A_EMAIL_HASH = 'a'.repeat(64);
const OWNER_B_EMAIL_HASH = 'b'.repeat(64);
const USER_C_EMAIL_HASH = 'c'.repeat(64);

const PUBLIC_KEY_OWNER_A = 'A' + 'x'.repeat(42);
const PUBLIC_KEY_OWNER_B = 'B' + 'x'.repeat(42);
const PUBLIC_KEY_USER_C = 'C' + 'x'.repeat(42);

const WRAPPED_KEY_V1 = { v: 1, alg: 'x25519-xsalsa20-poly1305', ciphertext: 'test-key' };

const describeWithDocker = dockerAvailable ? describe : describe.skip;

// ─── Migration helpers ─────────────────────────────────────────────────────────

type MigrationFile = '0000_initial_schema.sql' | '0001_invite_display_fields.sql';

function migrationSql(file: MigrationFile): string {
  return readFileSync(new URL(`../../drizzle/${file}`, import.meta.url), 'utf8');
}

async function applyAllMigrations(pg: TestPostgres): Promise<void> {
  await pg.pool.query(migrationSql('0000_initial_schema.sql'));
  await pg.pool.query(migrationSql('0001_invite_display_fields.sql'));
}

// ─── Seed helpers ──────────────────────────────────────────────────────────────

// Use simple integer IDs to make assertions readable
let nextId = 1;
function freshUuid(): string {
  // Deterministic UUID-ish values for readability in test output
  const id = nextId++;
  return `00000000-0000-4000-8000-${String(id).padStart(12, '0')}`;
}

// ─── Test suite ────────────────────────────────────────────────────────────────

describeWithDocker('deleteUser cascade — integration', () => {
  let testPostgres: TestPostgres | undefined;
  let server: FastifyInstance | undefined;
  let previousMagicLinkSecret: string | undefined;
  let previousEmailEncryptionKey: string | undefined;

  // Resolved user IDs
  let ownerAId: string;
  let ownerBId: string;
  let userCId: string;

  // Resolved account IDs
  let ownerAOnlyAccountId: string;
  let sharedAccountId: string;

  beforeAll(async () => {
    previousMagicLinkSecret = process.env.MAGIC_LINK_SECRET;
    previousEmailEncryptionKey = process.env.EMAIL_ENCRYPTION_KEY;
    process.env.MAGIC_LINK_SECRET = 'user-deletion-integration-test-secret';
    process.env.EMAIL_ENCRYPTION_KEY = [
      '95fb2ed623392de4', '4b7eed8761e6e414',
      '799e446119bb0437', '72a795d27fdda61d',
    ].join('');

    testPostgres = await startPostgres('budget-wise-user-deletion-it');
    await applyAllMigrations(testPostgres);

    // Create 3 users: OwnerA (will be deleted), OwnerB (kept), UserC (member on shared)
    const usersResult = await testPostgres.pool.query<{ id: string }>(
      `
        INSERT INTO users (email_hash, public_key, validated_at)
        VALUES
          ($1, $2, now()),
          ($3, $4, now()),
          ($5, $6, now())
        RETURNING id
      `,
      [OWNER_A_EMAIL_HASH, PUBLIC_KEY_OWNER_A, OWNER_B_EMAIL_HASH, PUBLIC_KEY_OWNER_B, USER_C_EMAIL_HASH, PUBLIC_KEY_USER_C],
    );
    ownerAId = usersResult.rows[0]!.id;
    ownerBId = usersResult.rows[1]!.id;
    userCId = usersResult.rows[2]!.id;

    // Create account owned ONLY by OwnerA (will be fully deleted)
    const account1Result = await testPostgres.pool.query<{ id: string }>(
      'INSERT INTO accounts (owner_user_id) VALUES ($1) RETURNING id',
      [ownerAId],
    );
    ownerAOnlyAccountId = account1Result.rows[0]!.id;

    // Create a shared account owned by OwnerB, with OwnerA as member
    const account2Result = await testPostgres.pool.query<{ id: string }>(
      'INSERT INTO accounts (owner_user_id) VALUES ($1) RETURNING id',
      [ownerBId],
    );
    sharedAccountId = account2Result.rows[0]!.id;

    // Add OwnerA as member of the shared account (so they have a membership)
    await testPostgres.pool.query(
      'INSERT INTO account_members (account_id, user_id, role) VALUES ($1, $2, $3)',
      [sharedAccountId, ownerAId, 'member'],
    );

    // Also add UserC as member of the shared account (control — should remain after deletion)
    await testPostgres.pool.query(
      'INSERT INTO account_members (account_id, user_id, role) VALUES ($1, $2, $3)',
      [sharedAccountId, userCId, 'member'],
    );

    // Add OwnerA as member of their own account (mimics real system where owner row is inserted)
    await testPostgres.pool.query(
      'INSERT INTO account_members (account_id, user_id, role) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING',
      [ownerAOnlyAccountId, ownerAId, 'owner'],
    );

    // Add OwnerB as member of their own account
    await testPostgres.pool.query(
      'INSERT INTO account_members (account_id, user_id, role) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING',
      [sharedAccountId, ownerBId, 'owner'],
    );

    // Add account_keys for all members on each account
    for (const [accountId, userId] of [
      [ownerAOnlyAccountId, ownerAId],
      [sharedAccountId, ownerBId],
      [sharedAccountId, ownerAId],
      [sharedAccountId, userCId],
    ]) {
      await testPostgres.pool.query(
        'INSERT INTO account_keys (account_id, user_id, wrapped_key, epoch) VALUES ($1, $2, $3, 1)',
        [accountId, userId, JSON.stringify(WRAPPED_KEY_V1)],
      );
    }

    // Add change records to OwnerA's owned account (should be cascade-deleted)
    const crUuid1 = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
    const crUuid2 = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
    await testPostgres.pool.query(
      'INSERT INTO change_records (account_id, change_uuid, encrypted_payload) VALUES ($1, $2, $3), ($1, $4, $5)',
      [ownerAOnlyAccountId, crUuid1, JSON.stringify({ v: 1, ciphertext: 'rec1' }), crUuid2, JSON.stringify({ v: 1, ciphertext: 'rec2' })],
    );

    // Add invites sent by OwnerA
    await testPostgres.pool.query(
      'INSERT INTO invites (sender_user_id, recipient_email_hash, account_id) VALUES ($1, $2, $3)',
      [ownerAId, 'd'.repeat(64), ownerAOnlyAccountId],
    );

    // Add invites sent TO OwnerA (by email_hash)
    await testPostgres.pool.query(
      'INSERT INTO invites (sender_user_id, recipient_email_hash, account_id) VALUES ($1, $2, $3)',
      [ownerBId, OWNER_A_EMAIL_HASH, sharedAccountId],
    );

    server = await buildServer({ db: testPostgres.db, fastifyOptions: { logger: false } });
  }, 90_000);

  afterAll(async () => {
    if (server) await server.close();
    await stopPostgres(testPostgres);

    if (previousMagicLinkSecret === undefined) {
      delete process.env.MAGIC_LINK_SECRET;
    } else {
      process.env.MAGIC_LINK_SECRET = previousMagicLinkSecret;
    }

    if (previousEmailEncryptionKey === undefined) {
      delete process.env.EMAIL_ENCRYPTION_KEY;
    } else {
      process.env.EMAIL_ENCRYPTION_KEY = previousEmailEncryptionKey;
    }
  });

  // ═════════════════════════════════════════════════════════════════════════
  // 1. Pre-deletion verification
  // ═════════════════════════════════════════════════════════════════════════

  it('precondition: all seed data exists', async () => {
    if (!testPostgres) throw new Error('test postgres not initialized');

    // User exists
    const { rows: users } = await testPostgres.pool.query(
      'SELECT id FROM users WHERE id = $1',
      [ownerAId],
    );
    expect(users).toHaveLength(1);

    // Owned account exists
    const { rows: ownedAccounts } = await testPostgres.pool.query(
      'SELECT id FROM accounts WHERE id = $1',
      [ownerAOnlyAccountId],
    );
    expect(ownedAccounts).toHaveLength(1);

    // OwnerA is a member of the shared account
    const { rows: memberRows } = await testPostgres.pool.query(
      'SELECT * FROM account_members WHERE account_id = $1 AND user_id = $2',
      [sharedAccountId, ownerAId],
    );
    expect(memberRows).toHaveLength(1);

    // OwnerA has account_keys on their owned + shared account (2)
    const { rows: keyRows } = await testPostgres.pool.query(
      'SELECT * FROM account_keys WHERE user_id = $1',
      [ownerAId],
    );
    expect(keyRows).toHaveLength(2);

    // Change records on owned account
    const { rows: crRows } = await testPostgres.pool.query(
      'SELECT * FROM change_records WHERE account_id = $1',
      [ownerAOnlyAccountId],
    );
    expect(crRows).toHaveLength(2);

    // Invites sent by OwnerA
    const { rows: sentInvites } = await testPostgres.pool.query(
      'SELECT * FROM invites WHERE sender_user_id = $1',
      [ownerAId],
    );
    expect(sentInvites).toHaveLength(1);

    // Invites sent to OwnerA
    const { rows: receivedInvites } = await testPostgres.pool.query(
      'SELECT * FROM invites WHERE recipient_email_hash = $1',
      [OWNER_A_EMAIL_HASH],
    );
    expect(receivedInvites).toHaveLength(1);
  });

  // ═════════════════════════════════════════════════════════════════════════
  // 2. Delete the user
  // ═════════════════════════════════════════════════════════════════════════

  it('deleteUser removes the user and all associated data', async () => {
    if (!testPostgres) throw new Error('test postgres not initialized');

    const result = await deleteUser(testPostgres.db, ownerAId);

    expect(result).toEqual({ status: 'ok' });
  });

  // ═════════════════════════════════════════════════════════════════════════
  // 3. Verify cascade effects
  // ═════════════════════════════════════════════════════════════════════════

  it('user record is deleted', async () => {
    if (!testPostgres) throw new Error('test postgres not initialized');

    const { rows } = await testPostgres.pool.query(
      'SELECT id FROM users WHERE id = $1',
      [ownerAId],
    );
    expect(rows).toHaveLength(0);
  });

  it('owned account is deleted (including FK cascades)', async () => {
    if (!testPostgres) throw new Error('test postgres not initialized');

    // Account gone
    const { rows: accounts } = await testPostgres.pool.query(
      'SELECT id FROM accounts WHERE id = $1',
      [ownerAOnlyAccountId],
    );
    expect(accounts).toHaveLength(0);

    // account_keys cascade-deleted (no revoked_at check needed — rows just gone)
    const { rows: keys } = await testPostgres.pool.query(
      'SELECT * FROM account_keys WHERE account_id = $1',
      [ownerAOnlyAccountId],
    );
    expect(keys).toHaveLength(0);

    // account_members cascade-deleted
    const { rows: members } = await testPostgres.pool.query(
      'SELECT * FROM account_members WHERE account_id = $1',
      [ownerAOnlyAccountId],
    );
    expect(members).toHaveLength(0);

    // change_records cascade-deleted
    const { rows: records } = await testPostgres.pool.query(
      'SELECT * FROM change_records WHERE account_id = $1',
      [ownerAOnlyAccountId],
    );
    expect(records).toHaveLength(0);
  });

  it('shared account membership is removed', async () => {
    if (!testPostgres) throw new Error('test postgres not initialized');

    const { rows } = await testPostgres.pool.query(
      'SELECT * FROM account_members WHERE account_id = $1 AND user_id = $2',
      [sharedAccountId, ownerAId],
    );
    expect(rows).toHaveLength(0);

    // UserC should still be a member of the shared account (not affected)
    const { rows: userCRows } = await testPostgres.pool.query(
      'SELECT * FROM account_members WHERE account_id = $1 AND user_id = $2',
      [sharedAccountId, userCId],
    );
    expect(userCRows).toHaveLength(1);

    // OwnerB should still be the owner
    const { rows: ownerBRows } = await testPostgres.pool.query(
      'SELECT * FROM account_members WHERE account_id = $1 AND user_id = $2',
      [sharedAccountId, ownerBId],
    );
    expect(ownerBRows).toHaveLength(1);
    expect(ownerBRows[0]!.role).toBe('owner');

    // Shared account itself still exists
    const { rows: sharedAccount } = await testPostgres.pool.query(
      'SELECT id FROM accounts WHERE id = $1',
      [sharedAccountId],
    );
    expect(sharedAccount).toHaveLength(1);
  });

  it('account_keys on shared account are deleted (revoked + removed for FK constraint)', async () => {
    if (!testPostgres) throw new Error('test postgres not initialized');

    // The user's keys on shared accounts are deleted (not just revoked) so the
    // FK on account_keys.user_id → users.id (ON DELETE NO ACTION) doesn't
    // block the user record deletion.
    const { rows } = await testPostgres.pool.query(
      'SELECT * FROM account_keys WHERE account_id = $1 AND user_id = $2',
      [sharedAccountId, ownerAId],
    );
    expect(rows).toHaveLength(0);

    // UserC's key should still be present (not affected by OwnerA's deletion)
    const { rows: userCKeys } = await testPostgres.pool.query(
      'SELECT * FROM account_keys WHERE account_id = $1 AND user_id = $2',
      [sharedAccountId, userCId],
    );
    expect(userCKeys).toHaveLength(1);
    expect(userCKeys[0]!.revoked_at).toBeNull();

    // OwnerB's key should still be present (not affected by OwnerA's deletion)
    const { rows: ownerBKeys } = await testPostgres.pool.query(
      'SELECT * FROM account_keys WHERE account_id = $1 AND user_id = $2',
      [sharedAccountId, ownerBId],
    );
    expect(ownerBKeys).toHaveLength(1);
    expect(ownerBKeys[0]!.revoked_at).toBeNull();
  });

  it('invites sent by the user are deleted', async () => {
    if (!testPostgres) throw new Error('test postgres not initialized');

    const { rows } = await testPostgres.pool.query(
      'SELECT * FROM invites WHERE sender_user_id = $1',
      [ownerAId],
    );
    expect(rows).toHaveLength(0);
  });

  it('invites addressed to the user (by email_hash) are deleted', async () => {
    if (!testPostgres) throw new Error('test postgres not initialized');

    const { rows } = await testPostgres.pool.query(
      'SELECT * FROM invites WHERE recipient_email_hash = $1',
      [OWNER_A_EMAIL_HASH],
    );
    expect(rows).toHaveLength(0);
  });

  // ═════════════════════════════════════════════════════════════════════════
  // 4. Idempotency
  // ═════════════════════════════════════════════════════════════════════════

  it('deleteUser returns user_not_found when called again (idempotent)', async () => {
    if (!testPostgres) throw new Error('test postgres not initialized');

    const result = await deleteUser(testPostgres.db, ownerAId);

    expect(result).toEqual({ status: 'user_not_found' });
  });

  // ═════════════════════════════════════════════════════════════════════════
  // 5. Orphaned account_keys from a previous shared-account removal
  // ═════════════════════════════════════════════════════════════════════════

  it('deleteUser succeeds when orphaned account_keys exist from a prior shared-account removal', async () => {
    if (!testPostgres) throw new Error('test postgres not initialized');

    // Create a user who was previously added to a shared account and then removed.
    // The member-removal flow in sharing.service.ts / account.service.ts deletes
    // the account_members row but only revokes (sets revoked_at) the account_keys
    // row, leaving it in place. deleteUser must handle these orphaned keys.
    const orphanUserId = freshUuid();
    await testPostgres.pool.query(
      'INSERT INTO users (id, email_hash, public_key, validated_at) VALUES ($1, $2, $3, now())',
      [orphanUserId, 'o'.repeat(64), 'O' + 'x'.repeat(42)],
    );

    // Another user who owns a shared account
    const otherUserId = freshUuid();
    await testPostgres.pool.query(
      'INSERT INTO users (id, email_hash, public_key, validated_at) VALUES ($1, $2, $3, now())',
      [otherUserId, 'p'.repeat(64), 'P' + 'x'.repeat(42)],
    );

    const sharedAcctId = freshUuid();
    await testPostgres.pool.query(
      'INSERT INTO accounts (id, owner_user_id) VALUES ($1, $2)',
      [sharedAcctId, otherUserId],
    );

    // Add orphan user as member with an account key
    await testPostgres.pool.query(
      'INSERT INTO account_members (account_id, user_id, role) VALUES ($1, $2, $3)',
      [sharedAcctId, orphanUserId, 'member'],
    );
    await testPostgres.pool.query(
      'INSERT INTO account_keys (account_id, user_id, wrapped_key, epoch) VALUES ($1, $2, $3, 1)',
      [sharedAcctId, orphanUserId, JSON.stringify(WRAPPED_KEY_V1)],
    );
    await testPostgres.pool.query(
      'INSERT INTO account_members (account_id, user_id, role) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING',
      [sharedAcctId, otherUserId, 'owner'],
    );

    // Simulate a prior member-removal flow: delete the membership row but
    // only revoke the key (the exact pattern used by sharing.service.ts).
    await testPostgres.pool.query(
      'DELETE FROM account_members WHERE account_id = $1 AND user_id = $2',
      [sharedAcctId, orphanUserId],
    );
    await testPostgres.pool.query(
      'UPDATE account_keys SET revoked_at = now() WHERE account_id = $1 AND user_id = $2',
      [sharedAcctId, orphanUserId],
    );

    // Verify orphaned key exists (no membership, key is revoked but still present)
    const { rows: orphanKeyRows } = await testPostgres.pool.query(
      'SELECT * FROM account_keys WHERE account_id = $1 AND user_id = $2',
      [sharedAcctId, orphanUserId],
    );
    expect(orphanKeyRows).toHaveLength(1);
    expect(orphanKeyRows[0]!.revoked_at).not.toBeNull();

    const { rows: orphanMemberRows } = await testPostgres.pool.query(
      'SELECT * FROM account_members WHERE account_id = $1 AND user_id = $2',
      [sharedAcctId, orphanUserId],
    );
    expect(orphanMemberRows).toHaveLength(0);

    // Now delete the orphan user's account — must succeed despite the
    // orphaned key (no membership to derive sharedAccountIds from).
    const result = await deleteUser(testPostgres.db, orphanUserId);
    expect(result).toEqual({ status: 'ok' });

    // User record is gone
    const { rows: userRows } = await testPostgres.pool.query(
      'SELECT id FROM users WHERE id = $1',
      [orphanUserId],
    );
    expect(userRows).toHaveLength(0);

    // Orphaned key is also gone (unconditional delete)
    const { rows: keyRows } = await testPostgres.pool.query(
      'SELECT * FROM account_keys WHERE user_id = $1',
      [orphanUserId],
    );
    expect(keyRows).toHaveLength(0);
  });

  // ═════════════════════════════════════════════════════════════════════════
  // 6. Owned account identified by owner_user_id, not by account_members.role
  // ═════════════════════════════════════════════════════════════════════════

  it('deleteUser deletes an owned account even when the self-membership row is missing', async () => {
    if (!testPostgres) throw new Error('test postgres not initialized');

    // Create a user who owns an account but whose self-membership row is absent
    // (e.g. created by a different code path, data repair, or schema drift).
    // Ownership is determined by accounts.owner_user_id, not by a membership
    // row with role='owner'. Without this fix, ownedAccountIds would be empty
    // and the final DELETE FROM users would fail on the owner_user_id FK.
    const testUserId = freshUuid();
    await testPostgres.pool.query(
      'INSERT INTO users (id, email_hash, public_key, validated_at) VALUES ($1, $2, $3, now())',
      [testUserId, 'm'.repeat(64), 'M' + 'x'.repeat(42)],
    );

    const testAccountId = freshUuid();
    await testPostgres.pool.query(
      'INSERT INTO accounts (id, owner_user_id) VALUES ($1, $2)',
      [testAccountId, testUserId],
    );

    // NOTE: No self-membership row is inserted here — this is the edge case.
    // The account still has owner_user_id set correctly.

    // Add a change record so we can verify cascade
    const crUuid = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
    await testPostgres.pool.query(
      'INSERT INTO change_records (account_id, change_uuid, encrypted_payload) VALUES ($1, $2, $3)',
      [testAccountId, crUuid, JSON.stringify({ v: 1, ciphertext: 'edge-test' })],
    );

    // Verify: no membership row exists for this user on this account
    const { rows: memberRows } = await testPostgres.pool.query(
      'SELECT * FROM account_members WHERE account_id = $1 AND user_id = $2',
      [testAccountId, testUserId],
    );
    expect(memberRows).toHaveLength(0);

    // Now delete — must succeed and cascade the owned account
    const result = await deleteUser(testPostgres.db, testUserId);
    expect(result).toEqual({ status: 'ok' });

    // User record gone
    const { rows: userRows } = await testPostgres.pool.query(
      'SELECT id FROM users WHERE id = $1',
      [testUserId],
    );
    expect(userRows).toHaveLength(0);

    // Owned account deleted (not orphaned by missing membership)
    const { rows: accountRows } = await testPostgres.pool.query(
      'SELECT id FROM accounts WHERE id = $1',
      [testAccountId],
    );
    expect(accountRows).toHaveLength(0);

    // Change records cascade-deleted
    const { rows: crRows } = await testPostgres.pool.query(
      'SELECT * FROM change_records WHERE account_id = $1',
      [testAccountId],
    );
    expect(crRows).toHaveLength(0);
  });

  // ═════════════════════════════════════════════════════════════════════════
  // 7. Complete cleanup of a fresh user (transaction boundary is a Drizzle/Postgres guarantee)
  // ═════════════════════════════════════════════════════════════════════════

  it('deleteUser cleans up a fresh user with owned account completely', async () => {
    if (!testPostgres) throw new Error('test postgres not initialized');

    // Create a fresh user with one owned account, then verify deleteUser
    // removes all associated rows.
    //
    // TODO: This does not test the rollback-on-failure property (the function
    // runs inside a Drizzle transaction so if any step throws the whole
    // operation rolls back, but we don't instrument the DB to trigger a
    // controlled mid-transaction failure here).

    const testUserId = freshUuid();
    await testPostgres.pool.query(
      'INSERT INTO users (id, email_hash, public_key, validated_at) VALUES ($1, $2, $3, now())',
      [testUserId, 'z'.repeat(64), 'Z' + 'x'.repeat(42)],
    );

    const testAccountId = freshUuid();
    await testPostgres.pool.query(
      'INSERT INTO accounts (id, owner_user_id) VALUES ($1, $2)',
      [testAccountId, testUserId],
    );
    await testPostgres.pool.query(
      'INSERT INTO account_members (account_id, user_id, role) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING',
      [testAccountId, testUserId, 'owner'],
    );

    const result = await deleteUser(testPostgres.db, testUserId);
    expect(result).toEqual({ status: 'ok' });

    const { rows: userRows } = await testPostgres.pool.query(
      'SELECT id FROM users WHERE id = $1',
      [testUserId],
    );
    expect(userRows).toHaveLength(0);

    const { rows: accountRows } = await testPostgres.pool.query(
      'SELECT id FROM accounts WHERE id = $1',
      [testAccountId],
    );
    expect(accountRows).toHaveLength(0);
  });
}, 120_000);
