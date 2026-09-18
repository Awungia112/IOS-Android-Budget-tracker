import { execFileSync, spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';

import type { FastifyInstance } from 'fastify';
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { migrate } from 'drizzle-orm/node-postgres/migrator';

import { buildServer } from '../app.js';
import { closePgPool, createDb, createPgPool } from '../db/client.js';
import { users } from '../db/schema.js';
import {
  NONCE_ROUTE,
  REPLAY_PROTECTION_HEADERS,
} from '../security/replay-protection-contract.js';
import type { Db } from '../users/user.repository.js';

const dockerAvailable = spawnSync('docker', ['version'], { stdio: 'ignore' }).status === 0;
const describeWithDocker = dockerAvailable ? describe : describe.skip;

const OWNER_EMAIL_HASH = 'a'.repeat(64);
const OTHER_EMAIL_HASH = 'b'.repeat(64);
const OWNER_ID = '10000000-0000-4000-8000-000000000001';
const OTHER_ID = '10000000-0000-4000-8000-000000000002';
const CHANGE_UUIDS = [
  '20000000-0000-4000-8000-000000000001',
  '20000000-0000-4000-8000-000000000002',
  '20000000-0000-4000-8000-000000000003',
] as const;
const MIXED_BATCH_NEW_UUID = '20000000-0000-4000-8000-000000000004';
const WRAPPED_KEY = {
  v: 99,
  alg: 'future-asymmetric-envelope',
  ciphertext: 'opaque-to-server',
};

function runDocker(args: string[]): string {
  return execFileSync('docker', args, {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
}

/**
 * Waits until a real query can be executed against the Postgres container.
 * More reliable than pg_isready, which checks TCP but not DB readiness.
 */
async function waitForPostgres(databaseUrl: string): Promise<void> {
  const probe = new Pool({ connectionString: databaseUrl, connectionTimeoutMillis: 1_000 });
  try {
    for (let attempt = 0; attempt < 60; attempt += 1) {
      try {
        await probe.query('SELECT 1');
        return;
      } catch {
        await new Promise((resolve) => setTimeout(resolve, 1_000));
      }
    }
    throw new Error('PostgreSQL test container did not become ready');
  } finally {
    await probe.end().catch(() => undefined);
  }
}

function encryptedPayload(index: number): Record<string, unknown> {
  return {
    v: 99,
    alg: 'future-symmetric-envelope',
    ciphertext: `opaque-${index}`,
  };
}

describeWithDocker('change record relay integration', () => {
  let previousMagicLinkSecret: string | undefined;
  let previousEmailEncryptionKey: string | undefined;
  let containerName: string;
  let pool: Pool;
  let db: Db;
  let server: FastifyInstance;

  beforeAll(async () => {
    previousMagicLinkSecret = process.env.MAGIC_LINK_SECRET;
    previousEmailEncryptionKey = process.env.EMAIL_ENCRYPTION_KEY;
    process.env.MAGIC_LINK_SECRET = 'integration-test-secret';
    process.env.EMAIL_ENCRYPTION_KEY = [
      '95fb2ed623392de4', '4b7eed8761e6e414',
      '799e446119bb0437', '72a795d27fdda61d',
    ].join('');
    containerName = `budget-wise-server-it-${randomUUID()}`;

    runDocker([
      'run',
      '--name',
      containerName,
      '-e',
      'POSTGRES_USER=budget',
      '-e',
      'POSTGRES_PASSWORD=budget',
      '-e',
      'POSTGRES_DB=budget',
      '-p',
      '127.0.0.1::5432',
      '-d',
      'postgres:16-alpine',
    ]);

    const port = runDocker([
      'inspect',
      '-f',
      '{{(index (index .NetworkSettings.Ports "5432/tcp") 0).HostPort}}',
      containerName,
    ]);
    const databaseUrl = `postgresql://budget:budget@127.0.0.1:${port}/budget`;

    await waitForPostgres(databaseUrl);

    pool = createPgPool(databaseUrl, { ssl: false });
    db = createDb(pool);
    await migrate(db, { migrationsFolder: './drizzle' });
    server = await buildServer({ db, fastifyOptions: { logger: false } });

    await db.insert(users).values([
      {
        id: OWNER_ID,
        emailHash: OWNER_EMAIL_HASH,
        publicKey: 'A'.repeat(43),
        validatedAt: new Date(),
      },
      {
        id: OTHER_ID,
        emailHash: OTHER_EMAIL_HASH,
        publicKey: 'B'.repeat(43),
        validatedAt: new Date(),
      },
    ]);
  }, 90_000);

  afterAll(async () => {
    if (server) {
      await server.close();
    }

    if (pool) {
      await closePgPool(pool);
    }

    if (containerName) {
      spawnSync('docker', ['rm', '-f', containerName], { stdio: 'ignore' });
    }

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
    const res = await server.inject({ method: 'GET', url: NONCE_ROUTE });

    expect(res.statusCode).toBe(200);
    return res.json<{ nonce: string }>().nonce;
  }

  function authHeaders(emailHash: string): Record<string, string> {
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

  async function createAccount(emailHash: string): Promise<string> {
    const res = await server.inject({
      method: 'POST',
      url: '/v1/accounts',
      headers: {
        ...(await replayHeaders()),
        ...authHeaders(emailHash),
      },
      payload: { wrapped_key: WRAPPED_KEY, epoch: 1 },
    });

    expect(res.statusCode).toBe(201);
    return res.json<{ id: string }>().id;
  }

  async function pushRecords(
    accountId: string,
    emailHash: string,
    records: Array<{ change_uuid: string; encrypted_payload: Record<string, unknown> }>,
  ) {
    return await server.inject({
      method: 'POST',
      url: `/v1/accounts/${accountId}/records`,
      headers: {
        ...(await replayHeaders()),
        ...authHeaders(emailHash),
      },
      payload: { records },
    });
  }

  it('pushes, pulls, deduplicates, rejects conflicts, and enforces authorization', async () => {
    const accountId = await createAccount(OWNER_EMAIL_HASH);
    const pushThree = await pushRecords(
      accountId,
      OWNER_EMAIL_HASH,
      CHANGE_UUIDS.map((changeUuid, index) => ({
        change_uuid: changeUuid,
        encrypted_payload: encryptedPayload(index + 1),
      })),
    );

    expect(pushThree.statusCode).toBe(200);
    expect(pushThree.json()).toEqual({
      results: [
        { change_uuid: CHANGE_UUIDS[0], sequence: 1 },
        { change_uuid: CHANGE_UUIDS[1], sequence: 2 },
        { change_uuid: CHANGE_UUIDS[2], sequence: 3 },
      ],
    });

    const pullAll = await server.inject({
      method: 'GET',
      url: `/v1/accounts/${accountId}/records?since=0`,
      headers: authHeaders(OWNER_EMAIL_HASH),
    });

    expect(pullAll.statusCode).toBe(200);
    expect(pullAll.json()).toMatchObject({
      records: [
        { change_uuid: CHANGE_UUIDS[0], sequence: 1 },
        { change_uuid: CHANGE_UUIDS[1], sequence: 2 },
        { change_uuid: CHANGE_UUIDS[2], sequence: 3 },
      ],
      next_since: null,
    });

    const duplicate = await pushRecords(accountId, OWNER_EMAIL_HASH, [{
      change_uuid: CHANGE_UUIDS[0],
      encrypted_payload: encryptedPayload(99),
    }]);

    expect(duplicate.statusCode).toBe(200);
    expect(duplicate.json()).toEqual({
      results: [{ change_uuid: CHANGE_UUIDS[0], sequence: 1 }],
    });

    const pullSinceTwo = await server.inject({
      method: 'GET',
      url: `/v1/accounts/${accountId}/records?since=2`,
      headers: authHeaders(OWNER_EMAIL_HASH),
    });

    expect(pullSinceTwo.statusCode).toBe(200);
    expect(pullSinceTwo.json()).toMatchObject({
      records: [{ change_uuid: CHANGE_UUIDS[2], sequence: 3 }],
      next_since: null,
    });

    const secondAccountId = await createAccount(OWNER_EMAIL_HASH);
    const mixedConflict = await pushRecords(secondAccountId, OWNER_EMAIL_HASH, [
      {
        change_uuid: MIXED_BATCH_NEW_UUID,
        encrypted_payload: encryptedPayload(4),
      },
      {
        change_uuid: CHANGE_UUIDS[1],
        encrypted_payload: encryptedPayload(5),
      },
    ]);

    expect(mixedConflict.statusCode).toBe(409);
    expect(mixedConflict.json()).toEqual({ error: 'change_uuid_conflict' });

    const mixedRowCount = await pool.query(
      'SELECT count(*)::int AS count FROM change_records WHERE change_uuid = $1',
      [MIXED_BATCH_NEW_UUID],
    );
    expect(mixedRowCount.rows[0].count).toBe(0);

    const unauthorized = await server.inject({
      method: 'GET',
      url: `/v1/accounts/${accountId}/records?since=0`,
      headers: authHeaders(OTHER_EMAIL_HASH),
    });

    expect(unauthorized.statusCode).toBe(403);
    expect(unauthorized.json()).toEqual({ error: 'account_key_not_found' });

    const algRow = await pool.query(
      "SELECT encrypted_payload->>'alg' AS alg FROM change_records WHERE change_uuid = $1",
      [CHANGE_UUIDS[0]],
    );
    expect(algRow.rows[0].alg).toBe('future-symmetric-envelope');
  }, 30_000);

  it('discovers only current accounts with active keys and record counts', async () => {
    const accountId = await createAccount(OWNER_EMAIL_HASH);
    const otherAccountId = await createAccount(OTHER_EMAIL_HASH);

    const pushTwo = await pushRecords(
      accountId,
      OWNER_EMAIL_HASH,
      Array.from({ length: 2 }, (_, index) => ({
        change_uuid: randomUUID(),
        encrypted_payload: encryptedPayload(index + 10),
      })),
    );
    expect(pushTwo.statusCode).toBe(200);

    await pool.query(
      `
        INSERT INTO account_keys (account_id, user_id, wrapped_key, epoch)
        VALUES ($1, $2, $3, 2)
      `,
      [accountId, OWNER_ID, WRAPPED_KEY],
    );

    const listed = await server.inject({
      method: 'GET',
      url: '/v1/accounts',
      headers: authHeaders(OWNER_EMAIL_HASH),
    });

    expect(listed.statusCode).toBe(200);
    const accounts = listed.json<{
      accounts: Array<{ id: string; key_epoch: number; role: string; record_count: number }>;
    }>().accounts;
    const matchingAccounts = accounts.filter((account) => account.id === accountId);

    expect(matchingAccounts).toHaveLength(1);
    expect(matchingAccounts[0]).toMatchObject({
      id: accountId,
      key_epoch: 1,
      role: 'owner',
      record_count: 2,
    });
    expect(accounts.some((account) => account.id === otherAccountId)).toBe(false);

    await pool.query(
      `
        UPDATE account_keys
        SET revoked_at = now()
        WHERE account_id = $1
          AND user_id = $2
      `,
      [accountId, OWNER_ID],
    );

    const afterRevoke = await server.inject({
      method: 'GET',
      url: '/v1/accounts',
      headers: authHeaders(OWNER_EMAIL_HASH),
    });

    expect(afterRevoke.statusCode).toBe(200);
    expect(
      afterRevoke
        .json<{ accounts: Array<{ id: string }> }>()
        .accounts.some((account) => account.id === accountId),
    ).toBe(false);
  }, 30_000);
});
