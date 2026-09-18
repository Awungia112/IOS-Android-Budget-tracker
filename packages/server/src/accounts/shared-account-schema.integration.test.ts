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

const OWNER_EMAIL_HASH = 'c'.repeat(64);
const OTHER_EMAIL_HASH = 'd'.repeat(64);
const RECIPIENT_EMAIL_HASH = 'e'.repeat(64);
const OWNER_ID = '30000000-0000-4000-8000-000000000001';
const OTHER_ID = '30000000-0000-4000-8000-000000000002';
const EXISTING_ACCOUNT_ID = '40000000-0000-4000-8000-000000000001';
const CASCADE_ACCOUNT_ID = '40000000-0000-4000-8000-000000000002';
const WRAPPED_KEY = {
  v: 99,
  alg: 'future-asymmetric-envelope',
  ciphertext: 'opaque-to-server',
};
const describeWithDocker = dockerAvailable ? describe : describe.skip;

type MigrationFileName = '0000_initial_schema.sql' | '0002_nonces.sql';

function migrationSql(fileName: MigrationFileName): string {
  return readFileSync(`drizzle/${fileName}`, 'utf8');
}

async function applyMigration(testPostgres: TestPostgres, fileName: MigrationFileName): Promise<void> {
  await testPostgres.pool.query(migrationSql(fileName));
}

async function applyBaseMigrations(testPostgres: TestPostgres): Promise<void> {
  await applyMigration(testPostgres, '0000_initial_schema.sql');
  await applyMigration(testPostgres, '0002_nonces.sql');
}

describeWithDocker('shared account schema migration', () => {
  let previousMagicLinkSecret: string | undefined;
  let previousEmailEncryptionKey: string | undefined;
  let testPostgres: TestPostgres | undefined;
  let server: FastifyInstance | undefined;

  beforeAll(async () => {
    previousMagicLinkSecret = process.env.MAGIC_LINK_SECRET;
    previousEmailEncryptionKey = process.env.EMAIL_ENCRYPTION_KEY;
    process.env.MAGIC_LINK_SECRET = 'shared-account-schema-test-secret';
    process.env.EMAIL_ENCRYPTION_KEY = [
      '95fb2ed623392de4', '4b7eed8761e6e414',
      '799e446119bb0437', '72a795d27fdda61d',
    ].join('');
    testPostgres = await startPostgres('budget-wise-shared-schema-it');

    await applyBaseMigrations(testPostgres);
    await testPostgres.pool.query(
      `
        INSERT INTO users (id, email_hash, public_key, validated_at)
        VALUES
          ($1, $2, $3, now()),
          ($4, $5, $6, now())
      `,
      [OWNER_ID, OWNER_EMAIL_HASH, 'C'.repeat(43), OTHER_ID, OTHER_EMAIL_HASH, 'D'.repeat(43)],
    );
    await testPostgres.pool.query(
      `
        INSERT INTO accounts (id, owner_user_id, key_epoch, created_at)
        VALUES ($1, $2, 1, '2026-06-01T00:00:00Z')
      `,
      [EXISTING_ACCOUNT_ID, OWNER_ID],
    );
    await testPostgres.pool.query(
      `INSERT INTO account_members (account_id, user_id, role, joined_at)
       SELECT id, owner_user_id, 'owner', created_at
       FROM accounts
       ON CONFLICT (account_id, user_id) DO NOTHING`,
    );

    server = await buildServer({ db: testPostgres.db, fastifyOptions: { logger: false } });
  }, 90_000);

  afterAll(async () => {
    if (server) {
      await server.close();
    }

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

  async function issueNonce(): Promise<string> {
    if (!server) {
      throw new Error('server_not_initialized');
    }

    const res = await server.inject({ method: 'GET', url: NONCE_ROUTE });

    expect(res.statusCode).toBe(200);
    return res.json<{ nonce: string }>().nonce;
  }

  function authHeaders(emailHash: string): Record<string, string> {
    if (!server) {
      throw new Error('server_not_initialized');
    }

    return {
      authorization: `Bearer ${server.jwt.sign({ sub: emailHash, typ: 'session' })}`,
    };
  }

  async function replayHeaders(): Promise<Record<string, string>> {
    return {
      [REPLAY_PROTECTION_HEADERS.nonce]: await issueNonce(),
      [REPLAY_PROTECTION_HEADERS.timestamp]: String(Date.now()),
    };
  }

  it('backfills owner members and enforces schema constraints', async () => {
    if (!testPostgres) {
      throw new Error('test_postgres_not_initialized');
    }

    const backfilled = await testPostgres.pool.query(
      'SELECT account_id, user_id, role FROM account_members WHERE account_id = $1',
      [EXISTING_ACCOUNT_ID],
    );

    expect(backfilled.rows).toEqual([{
      account_id: EXISTING_ACCOUNT_ID,
      user_id: OWNER_ID,
      role: 'owner',
    }]);

    const constraints = await testPostgres.pool.query(
      `
        SELECT conname
        FROM pg_constraint
        WHERE conrelid IN ('invites'::regclass, 'account_members'::regclass)
        ORDER BY conname
      `,
    );

    expect(constraints.rows.map((row) => row.conname)).toEqual(
      expect.arrayContaining([
        'account_members_pkey',
        'account_members_role_check',
        'invites_pkey',
        'invites_recipient_email_hash_length_check',
        'invites_status_check',
      ]),
    );

    const partialIndex = await testPostgres.pool.query(
      `
        SELECT indexdef
        FROM pg_indexes
        WHERE tablename = 'invites'
          AND indexname = 'invites_pending_by_recipient_idx'
      `,
    );

    expect(partialIndex.rows[0].indexdef).toContain('WHERE (status = ');
    expect(partialIndex.rows[0].indexdef).toContain("'pending'::text");

    await expect(testPostgres.pool.query(
      `
        INSERT INTO invites (sender_user_id, recipient_email_hash, account_id, status)
        VALUES ($1, $2, $3, 'unknown')
      `,
      [OWNER_ID, RECIPIENT_EMAIL_HASH, EXISTING_ACCOUNT_ID],
    )).rejects.toThrow(/invites_status_check/);

    await expect(testPostgres.pool.query(
      `
        INSERT INTO account_members (account_id, user_id, role)
        VALUES ($1, $2, 'admin')
      `,
      [EXISTING_ACCOUNT_ID, OTHER_ID],
    )).rejects.toThrow(/account_members_role_check/);
  });

  it('creates owner membership through POST /v1/accounts and cascades account-owned rows', async () => {
    if (!server || !testPostgres) {
      throw new Error('test_not_initialized');
    }

    const createAccount = await server.inject({
      method: 'POST',
      url: '/v1/accounts',
      headers: {
        ...(await replayHeaders()),
        ...authHeaders(OWNER_EMAIL_HASH),
      },
      payload: { wrapped_key: WRAPPED_KEY, epoch: 1 },
    });

    if (createAccount.statusCode !== 201) console.error('createAccount 500 body:', createAccount.body);
    expect(createAccount.statusCode).toBe(201);
    const createdAccountId = createAccount.json<{ id: string }>().id;

    const createdMember = await testPostgres.pool.query(
      'SELECT account_id, user_id, role FROM account_members WHERE account_id = $1',
      [createdAccountId],
    );

    expect(createdMember.rows).toEqual([{
      account_id: createdAccountId,
      user_id: OWNER_ID,
      role: 'owner',
    }]);

    await testPostgres.pool.query(
      `
        INSERT INTO accounts (id, owner_user_id)
        VALUES ($1, $2)
      `,
      [CASCADE_ACCOUNT_ID, OWNER_ID],
    );
    await testPostgres.pool.query(
      `
        INSERT INTO invites (sender_user_id, recipient_email_hash, account_id)
        VALUES ($1, $2, $3)
      `,
      [OWNER_ID, RECIPIENT_EMAIL_HASH, CASCADE_ACCOUNT_ID],
    );
    await testPostgres.pool.query(
      `
        INSERT INTO account_members (account_id, user_id, role)
        VALUES ($1, $2, 'member')
      `,
      [CASCADE_ACCOUNT_ID, OTHER_ID],
    );

    await testPostgres.pool.query('DELETE FROM accounts WHERE id = $1', [CASCADE_ACCOUNT_ID]);

    const cascadeCounts = await testPostgres.pool.query(
      `
        SELECT
          (SELECT count(*)::int FROM invites WHERE account_id = $1) AS invites,
          (SELECT count(*)::int FROM account_members WHERE account_id = $1) AS members
      `,
      [CASCADE_ACCOUNT_ID],
    );

    expect(cascadeCounts.rows[0]).toEqual({ invites: 0, members: 0 });
  });
});
