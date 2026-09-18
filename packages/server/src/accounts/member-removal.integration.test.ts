import { readFileSync } from 'node:fs';

import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { buildServer } from '../app.js';
import {
  NONCE_ROUTE,
  REPLAY_PROTECTION_HEADERS,
} from '../security/replay-protection-contract.js';
import {
  dockerAvailable,
  startPostgres,
  stopPostgres,
  type TestPostgres,
} from '../test/postgres-integration-helpers.js';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const OWNER_EMAIL_HASH = 'f'.repeat(64);
const MEMBER_EMAIL_HASH = 'e'.repeat(64);
const OWNER_PUBLIC_KEY = 'O'.repeat(43);
const MEMBER_PUBLIC_KEY = 'M'.repeat(43);
const WRAPPED_KEY_OWNER = { v: 1, alg: 'x25519-xsalsa20-poly1305', ciphertext: 'owner-key' };
const WRAPPED_KEY_MEMBER = {
  v: 1,
  alg: 'x25519-xsalsa20-poly1305',
  ciphertext: 'member-key',
};
const WRAPPED_KEY_MEMBER_EPOCH_2 = {
  v: 1,
  alg: 'x25519-xsalsa20-poly1305',
  ciphertext: 'member-key-epoch-2',
};

const describeWithDocker = dockerAvailable ? describe : describe.skip;

// ─── Migration helpers ─────────────────────────────────────────────────────────

type MigrationFile = '0000_initial_schema.sql' | '0002_nonces.sql';

function migrationSql(file: MigrationFile): string {
  return readFileSync(`drizzle/${file}`, 'utf8');
}

async function applyAllMigrations(pg: TestPostgres): Promise<void> {
  await pg.pool.query(migrationSql('0000_initial_schema.sql'));
  await pg.pool.query(migrationSql('0002_nonces.sql'));
}

// ─── Test suite ────────────────────────────────────────────────────────────────

describeWithDocker('member removal and epoch rotation — integration', () => {
  let testPostgres: TestPostgres | undefined;
  let server: FastifyInstance | undefined;
  let previousMagicLinkSecret: string | undefined;
  let previousEmailEncryptionKey: string | undefined;

  // IDs resolved after user creation
  let ownerId: string;
  let memberId: string;
  let ownerAccountId: string;

  beforeAll(async () => {
    previousMagicLinkSecret = process.env.MAGIC_LINK_SECRET;
    previousEmailEncryptionKey = process.env.EMAIL_ENCRYPTION_KEY;
    process.env.MAGIC_LINK_SECRET = 'member-removal-integration-test-secret';
    process.env.EMAIL_ENCRYPTION_KEY = [
      '95fb2ed623392de4', '4b7eed8761e6e414',
      '799e446119bb0437', '72a795d27fdda61d',
    ].join('');

    testPostgres = await startPostgres('budget-wise-member-removal-it');
    await applyAllMigrations(testPostgres);

    // Seed owner and member users (already validated)
    const usersResult = await testPostgres.pool.query<{ id: string }>(
      `
        INSERT INTO users (email_hash, public_key, validated_at)
        VALUES
          ($1, $2, now()),
          ($3, $4, now())
        RETURNING id
      `,
      [OWNER_EMAIL_HASH, OWNER_PUBLIC_KEY, MEMBER_EMAIL_HASH, MEMBER_PUBLIC_KEY],
    );
    ownerId = usersResult.rows[0]!.id;
    memberId = usersResult.rows[1]!.id;

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

  function authHeaders(emailHash: string): Record<string, string> {
    if (!server) throw new Error('server not initialized');
    return {
      authorization: `Bearer ${server.jwt.sign({ sub: emailHash, typ: 'session' })}`,
    };
  }

  async function replayHeaders(): Promise<Record<string, string>> {
    if (!server) throw new Error('server not initialized');
    const res = await server.inject({ method: 'GET', url: NONCE_ROUTE });
    return {
      [REPLAY_PROTECTION_HEADERS.nonce]: res.json<{ nonce: string }>().nonce,
      [REPLAY_PROTECTION_HEADERS.timestamp]: String(Date.now()),
    };
  }

  it('setup: owner creates an account with initial wrapped key', async () => {
    if (!server) throw new Error('server not initialized');

    const res = await server.inject({
      method: 'POST',
      url: '/v1/accounts',
      headers: { ...(await replayHeaders()), ...authHeaders(OWNER_EMAIL_HASH) },
      payload: { wrapped_key: WRAPPED_KEY_OWNER, epoch: 1 },
    });

    expect(res.statusCode).toBe(201);
    ownerAccountId = res.json<{ id: string }>().id;
    expect(ownerAccountId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );
  });

  it('setup: add member to account via direct account_keys insert and account_members', async () => {
    if (!testPostgres) throw new Error('test postgres not initialized');

    // Insert wrapped key for member
    await testPostgres.pool.query(
      `
        INSERT INTO account_keys (account_id, user_id, wrapped_key, epoch)
        VALUES ($1, $2, $3, 1)
      `,
      [ownerAccountId, memberId, JSON.stringify(WRAPPED_KEY_MEMBER)],
    );

    // Add member to account_members
    await testPostgres.pool.query(
      `
        INSERT INTO account_members (account_id, user_id, role)
        VALUES ($1, $2, 'member')
      `,
      [ownerAccountId, memberId],
    );
  });

  it('GET /v1/accounts/:id/members returns list of members', async () => {
    if (!server) throw new Error('server not initialized');

    const res = await server.inject({
      method: 'GET',
      url: `/v1/accounts/${ownerAccountId}/members`,
      headers: authHeaders(OWNER_EMAIL_HASH),
    });

    expect(res.statusCode).toBe(200);
    const { members } = res.json<{
      members: Array<{
        user_id: string;
        role: string;
        public_key: string;
      }>
    }>();
    expect(members).toHaveLength(2);
    expect(members).toContainEqual({
      user_id: ownerId,
      role: 'owner',
      public_key: OWNER_PUBLIC_KEY,
      joined_at: expect.any(String),
    });
    expect(members).toContainEqual({
      user_id: memberId,
      role: 'member',
      public_key: MEMBER_PUBLIC_KEY,
      joined_at: expect.any(String),
    });
  });

  it('DELETE /v1/accounts/:id/members/:userId removes member and increments epoch', async () => {
    if (!server || !testPostgres) throw new Error('server not initialized');

    const res = await server.inject({
      method: 'DELETE',
      url: `/v1/accounts/${ownerAccountId}/members/${memberId}`,
      headers: { ...(await replayHeaders()), ...authHeaders(OWNER_EMAIL_HASH) },
    });

    expect(res.statusCode).toBe(200);
    const { new_epoch } = res.json<{ new_epoch: number }>();
    expect(new_epoch).toBe(2);

    // Verify member is removed from account_members
    const memberRow = await testPostgres.pool.query(
      'SELECT * FROM account_members WHERE account_id = $1 AND user_id = $2',
      [ownerAccountId, memberId],
    );
    expect(memberRow.rows).toHaveLength(0);

    // Verify epoch is incremented
    const accountRow = await testPostgres.pool.query(
      'SELECT key_epoch FROM accounts WHERE id = $1',
      [ownerAccountId],
    );
    expect(accountRow.rows[0]!.key_epoch).toBe(2);

    // Verify member's account key is revoked
    const keyRow = await testPostgres.pool.query(
      'SELECT revoked_at FROM account_keys WHERE account_id = $1 AND user_id = $2',
      [ownerAccountId, memberId],
    );
    expect(keyRow.rows[0]!.revoked_at).not.toBeNull();
  });

  it('removed user cannot push change records (403 forbidden)', async () => {
    if (!server) throw new Error('server not initialized');

    const res = await server.inject({
      method: 'POST',
      url: `/v1/accounts/${ownerAccountId}/records`,
      headers: { ...(await replayHeaders()), ...authHeaders(MEMBER_EMAIL_HASH) },
      payload: {
        records: [
          {
            change_uuid: '55000000-0000-4000-8000-000000000001',
            encrypted_payload: { v: 1, alg: 'xsalsa20-poly1305', nonce: 'test', ciphertext: 'test' },
          },
        ],
      },
    });

    expect(res.statusCode).toBe(403);
    expect(res.json()).toMatchObject({ error: 'account_key_not_found' });
  });

  it('owner can upload new wrapped keys for remaining members after epoch increment', async () => {
    if (!server) throw new Error('server not initialized');

    const res = await server.inject({
      method: 'POST',
      url: `/v1/accounts/${ownerAccountId}/keys/batch`,
      headers: { ...(await replayHeaders()), ...authHeaders(OWNER_EMAIL_HASH) },
      payload: {
        new_epoch: 2,
        wrapped_keys: [
          {
            user_id: ownerId,
            wrapped_key: { v: 1, alg: 'x25519-xsalsa20-poly1305', ciphertext: 'owner-key-epoch-2' },
          },
        ],
      },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ status: 'ok' });

    // Verify new key is stored
    if (!testPostgres) throw new Error('test postgres not initialized');
    const keyRow = await testPostgres.pool.query(
      'SELECT epoch, wrapped_key FROM account_keys WHERE account_id = $1 AND user_id = $2 AND epoch = 2',
      [ownerAccountId, ownerId],
    );
    expect(keyRow.rows).toHaveLength(1);
    expect(keyRow.rows[0]!.epoch).toBe(2);
  });

  it('remaining member (owner) can fetch new epoch key', async () => {
    if (!server) throw new Error('server not initialized');

    const res = await server.inject({
      method: 'GET',
      url: `/v1/accounts/${ownerAccountId}/keys?epoch=2`,
      headers: authHeaders(OWNER_EMAIL_HASH),
    });

    expect(res.statusCode).toBe(200);
    const { epoch, wrapped_key } = res.json<{ epoch: number; wrapped_key: unknown }>();
    expect(epoch).toBe(2);
    expect(wrapped_key).toBeDefined();
  });

  it('owner cannot remove themselves (409 conflict)', async () => {
    if (!server) throw new Error('server not initialized');

    const res = await server.inject({
      method: 'DELETE',
      url: `/v1/accounts/${ownerAccountId}/members/${ownerId}`,
      headers: { ...(await replayHeaders()), ...authHeaders(OWNER_EMAIL_HASH) },
    });

    expect(res.statusCode).toBe(409);
    expect(res.json()).toMatchObject({ error: 'cannot_remove_owner' });
  });

  it('non-owner cannot remove members (403 forbidden)', async () => {
    if (!server || !testPostgres) throw new Error('server not initialized');

    // Re-add member for this test (may already be removed by prior test)
    await testPostgres.pool.query(
      `
        INSERT INTO account_members (account_id, user_id, role)
        VALUES ($1, $2, 'member')
        ON CONFLICT (account_id, user_id) DO NOTHING
      `,
      [ownerAccountId, memberId],
    );

    const res = await server.inject({
      method: 'DELETE',
      url: `/v1/accounts/${ownerAccountId}/members/${ownerId}`,
      headers: { ...(await replayHeaders()), ...authHeaders(MEMBER_EMAIL_HASH) },
    });

    expect(res.statusCode).toBe(403);
    expect(res.json()).toMatchObject({ error: 'forbidden' });
  });

  it('batch upload with epoch mismatch returns 409 conflict', async () => {
    if (!server) throw new Error('server not initialized');

    const res = await server.inject({
      method: 'POST',
      url: `/v1/accounts/${ownerAccountId}/keys/batch`,
      headers: { ...(await replayHeaders()), ...authHeaders(OWNER_EMAIL_HASH) },
      payload: {
        new_epoch: 3, // Wrong epoch
        wrapped_keys: [
          {
            user_id: ownerId,
            wrapped_key: { v: 1, alg: 'x25519-xsalsa20-poly1305', ciphertext: 'owner-key-epoch-3' },
          },
        ],
      },
    });

    expect(res.statusCode).toBe(409);
    expect(res.json()).toMatchObject({ error: 'conflict' });
  });

  it('batch upload including a removed user is rejected with 409 non_member', async () => {
    if (!server || !testPostgres) throw new Error('server not initialized');

    // Ensure the member is not in account_members for this test
    // (a prior test re-adds them; we need them absent to verify the guard)
    await testPostgres.pool.query(
      'DELETE FROM account_members WHERE account_id = $1 AND user_id = $2',
      [ownerAccountId, memberId],
    );

    // Attempt to sneak the removed user into the batch — the server must reject it.
    const res = await server.inject({
      method: 'POST',
      url: `/v1/accounts/${ownerAccountId}/keys/batch`,
      headers: { ...(await replayHeaders()), ...authHeaders(OWNER_EMAIL_HASH) },
      payload: {
        new_epoch: 2,
        wrapped_keys: [
          {
            user_id: ownerId,
            wrapped_key: { v: 1, alg: 'x25519-xsalsa20-poly1305', ciphertext: 'owner-key-epoch-2-retry' },
          },
          {
            user_id: memberId, // removed user — must not be accepted
            wrapped_key: { v: 1, alg: 'x25519-xsalsa20-poly1305', ciphertext: 'member-key-epoch-2-sneaked' },
          },
        ],
      },
    });

    expect(res.statusCode).toBe(409);
    expect(res.json()).toMatchObject({ error: 'non_member' });

    // Confirm the removed user still has no active (non-revoked) epoch-2 key
    const keyRow = await testPostgres.pool.query(
      `SELECT revoked_at FROM account_keys
       WHERE account_id = $1 AND user_id = $2 AND epoch = 2`,
      [ownerAccountId, memberId],
    );
    expect(keyRow.rows).toHaveLength(0);

    // And the removed user still cannot push
    const pushRes = await server.inject({
      method: 'POST',
      url: `/v1/accounts/${ownerAccountId}/records`,
      headers: { ...(await replayHeaders()), ...authHeaders(MEMBER_EMAIL_HASH) },
      payload: {
        records: [{
          change_uuid: '66000000-0000-4000-8000-000000000001',
          encrypted_payload: { v: 1, alg: 'xsalsa20-poly1305', nonce: 'n', ciphertext: 'sneaked-write' },
        }],
      },
    });
    expect(pushRes.statusCode).toBe(403);
  });

  it('non-owner member can fetch new epoch key after removal', async () => {
    if (!server || !testPostgres) throw new Error('server not initialized');

    // Re-add member for this test (may already be present from prior test)
    await testPostgres.pool.query(
      `
        INSERT INTO account_members (account_id, user_id, role)
        VALUES ($1, $2, 'member')
        ON CONFLICT (account_id, user_id) DO NOTHING
      `,
      [ownerAccountId, memberId],
    );

    // Insert wrapped key for member at epoch 2 (upsert in case already inserted)
    await testPostgres.pool.query(
      `
        INSERT INTO account_keys (account_id, user_id, wrapped_key, epoch)
        VALUES ($1, $2, $3, 2)
        ON CONFLICT (account_id, user_id, epoch) DO UPDATE SET wrapped_key = EXCLUDED.wrapped_key
      `,
      [ownerAccountId, memberId, JSON.stringify(WRAPPED_KEY_MEMBER_EPOCH_2)],
    );

    // Non-owner member fetches their new epoch key
    const res = await server.inject({
      method: 'GET',
      url: `/v1/accounts/${ownerAccountId}/keys?epoch=2`,
      headers: authHeaders(MEMBER_EMAIL_HASH),
    });

    expect(res.statusCode).toBe(200);
    const { epoch, wrapped_key } = res.json<{ epoch: number; wrapped_key: unknown }>();
    expect(epoch).toBe(2);
    expect(wrapped_key).toBeDefined();
  });
}, 120_000);
