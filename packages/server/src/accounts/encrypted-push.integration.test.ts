/**
 * Gate 6 — Legacy encrypted push migration E2E test (server side)
 *
 * Verifies that real SymmetricEnvelope payloads (produced by the core crypto
 * library) can be pushed to the server, stored, pulled back, and decrypted
 * without data loss.
 *
 * This test proves that:
 * 1. Real xsalsa20-poly1305 SymmetricEnvelope payloads are accepted by the
 *    server's push endpoint and stored correctly in PostgreSQL.
 * 2. Pulled payloads are byte-identical to what was pushed.
 * 3. The round-trip decrypt succeeds and the original plaintext is recovered.
 * 4. Deduplication works correctly with real encrypted payloads.
 * 5. Cross-account conflict detection works with real encrypted payloads.
 */
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

// Import real crypto from core package (aliased in vitest.config.ts)
import { seal, open, type SymmetricEnvelope } from '@budget/core/crypto/envelope';
import { generateAccountKey } from '@budget/core/crypto/account-key';

const dockerAvailable = spawnSync('docker', ['version'], { stdio: 'ignore' }).status === 0;
const describeWithDocker = dockerAvailable ? describe : describe.skip;

const OWNER_EMAIL_HASH = 'c'.repeat(64);
const OWNER_ID = '30000000-0000-4000-8000-000000000001';
const OTHER_EMAIL_HASH = 'd'.repeat(64);
const OTHER_ID = '30000000-0000-4000-8000-000000000002';

function runDocker(args: string[]): string {
  return execFileSync('docker', args, {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
}

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

const WRAPPED_KEY = {
  v: 99,
  alg: 'future-asymmetric-envelope',
  ciphertext: 'opaque-to-server',
};

describeWithDocker('Gate 6 — encrypted push migration E2E (server)', () => {
  let previousMagicLinkSecret: string | undefined;
  let previousEmailEncryptionKey: string | undefined;
  let containerName: string;
  let pool: Pool;
  let db: Db;
  let server: FastifyInstance;

  beforeAll(async () => {
    previousMagicLinkSecret = process.env.MAGIC_LINK_SECRET;
    previousEmailEncryptionKey = process.env.EMAIL_ENCRYPTION_KEY;
    process.env.MAGIC_LINK_SECRET = 'gate6-integration-test-secret';
    process.env.EMAIL_ENCRYPTION_KEY = [
      '95fb2ed623392de4', '4b7eed8761e6e414',
      '799e446119bb0437', '72a795d27fdda61d',
    ].join('');
    containerName = `budget-wise-gate6-it-${randomUUID()}`;

    runDocker([
      'run',
      '--name', containerName,
      '-e', 'POSTGRES_USER=budget',
      '-e', 'POSTGRES_PASSWORD=budget',
      '-e', 'POSTGRES_DB=budget',
      '-p', '127.0.0.1::5432',
      '-d', 'postgres:16-alpine',
    ]);

    const port = runDocker([
      'inspect',
      '-f', '{{(index (index .NetworkSettings.Ports "5432/tcp") 0).HostPort}}',
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
        publicKey: 'C'.repeat(43),
        validatedAt: new Date(),
      },
      {
        id: OTHER_ID,
        emailHash: OTHER_EMAIL_HASH,
        publicKey: 'D'.repeat(43),
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

  // ---------------------------------------------------------------------------
  // Real encrypted payload round-trip
  // ---------------------------------------------------------------------------

  it('pushes real SymmetricEnvelope payloads, pulls them back, and decrypts them', async () => {
    const accountId = await createAccount(OWNER_EMAIL_HASH);
    const accountKey = await generateAccountKey();

    // Create real encrypted payloads using the core crypto library
    const plaintexts = [
      JSON.stringify({ type: 'CREATE_TRANSACTION', amount: 42.5, title: 'Coffee' }),
      JSON.stringify({ type: 'CREATE_CATEGORY', name: 'Food', icon: 'utensils' }),
      JSON.stringify({ type: 'CREATE_LIMIT', categoryId: 'cat-1', amount: 500 }),
    ];

    const envelopes: SymmetricEnvelope[] = [];
    for (const plaintext of plaintexts) {
      const encoded = new TextEncoder().encode(plaintext);
      const envelope = await seal(encoded, accountKey);
      envelopes.push(envelope);
    }

    const changeUuids = [
      '40000000-0000-4000-8000-000000000001',
      '40000000-0000-4000-8000-000000000002',
      '40000000-0000-4000-8000-000000000003',
    ];

    // Push real encrypted payloads
    const pushResult = await pushRecords(
      accountId,
      OWNER_EMAIL_HASH,
      envelopes.map((envelope, i) => ({
        change_uuid: changeUuids[i],
        encrypted_payload: envelope as unknown as Record<string, unknown>,
      })),
    );

    expect(pushResult.statusCode).toBe(200);
    const pushBody = pushResult.json();
    expect(pushBody.results).toHaveLength(3);
    expect(pushBody.results[0]).toEqual({ change_uuid: changeUuids[0], sequence: 1 });
    expect(pushBody.results[1]).toEqual({ change_uuid: changeUuids[1], sequence: 2 });
    expect(pushBody.results[2]).toEqual({ change_uuid: changeUuids[2], sequence: 3 });

    // Pull them back
    const pullResult = await server.inject({
      method: 'GET',
      url: `/v1/accounts/${accountId}/records?since=0`,
      headers: authHeaders(OWNER_EMAIL_HASH),
    });

    expect(pullResult.statusCode).toBe(200);
    const pullBody = pullResult.json<{
      records: Array<{ change_uuid: string; sequence: number; encrypted_payload: unknown }>;
      next_since: number | null;
    }>();

    expect(pullBody.records).toHaveLength(3);

    // Decrypt each pulled record and verify the plaintext matches
    for (let i = 0; i < pullBody.records.length; i++) {
      const pulled = pullBody.records[i];
      expect(pulled.change_uuid).toBe(changeUuids[i]);
      expect(pulled.sequence).toBe(i + 1);

      // The pulled payload should be a valid SymmetricEnvelope
      const pulledEnvelope = pulled.encrypted_payload as SymmetricEnvelope;
      expect(pulledEnvelope.v).toBe(1);
      expect(pulledEnvelope.alg).toBe('xsalsa20-poly1305');
      expect(typeof pulledEnvelope.nonce).toBe('string');
      expect(typeof pulledEnvelope.ciphertext).toBe('string');

      // Decrypt and verify the original plaintext
      const decrypted = await open(pulledEnvelope, accountKey);
      const decoded = new TextDecoder().decode(decrypted);
      expect(decoded).toBe(plaintexts[i]);
    }

    // Verify the stored payloads in the database have the correct algorithm
    const algRow = await pool.query(
      "SELECT change_uuid, encrypted_payload->>'alg' AS alg FROM change_records WHERE account_id = $1 ORDER BY sequence",
      [accountId],
    );
    expect(algRow.rows).toHaveLength(3);
    for (const row of algRow.rows) {
      expect(row.alg).toBe('xsalsa20-poly1305');
    }
  }, 30_000);

  it('deduplicates real encrypted payloads by change_uuid', async () => {
    const accountId = await createAccount(OWNER_EMAIL_HASH);
    const accountKey = await generateAccountKey();

    const plaintext = JSON.stringify({ type: 'CREATE_TRANSACTION', amount: 99.9 });
    const envelope = await seal(new TextEncoder().encode(plaintext), accountKey);

    const changeUuid = '41000000-0000-4000-8000-000000000001';

    // Push once
    const push1 = await pushRecords(accountId, OWNER_EMAIL_HASH, [{
      change_uuid: changeUuid,
      encrypted_payload: envelope as unknown as Record<string, unknown>,
    }]);
    expect(push1.statusCode).toBe(200);
    const push1Results = push1.json().results;
    expect(push1Results).toHaveLength(1);
    expect(push1Results[0].change_uuid).toBe(changeUuid);
    const firstSequence = push1Results[0].sequence;

    // Push again (same UUID, same payload — idempotent)
    const push2 = await pushRecords(accountId, OWNER_EMAIL_HASH, [{
      change_uuid: changeUuid,
      encrypted_payload: envelope as unknown as Record<string, unknown>,
    }]);
    expect(push2.statusCode).toBe(200);
    const push2Results = push2.json().results;
    expect(push2Results).toHaveLength(1);
    expect(push2Results[0].change_uuid).toBe(changeUuid);
    expect(push2Results[0].sequence).toBe(firstSequence);

    // Verify only one record in the database
    const countResult = await pool.query(
      'SELECT count(*)::int AS count FROM change_records WHERE change_uuid = $1',
      [changeUuid],
    );
    expect(countResult.rows[0].count).toBe(1);
  }, 30_000);

  it('rejects cross-account conflict with real encrypted payloads', async () => {
    const account1 = await createAccount(OWNER_EMAIL_HASH);
    const account2 = await createAccount(OWNER_EMAIL_HASH);
    const accountKey = await generateAccountKey();

    const plaintext = JSON.stringify({ type: 'CREATE_TRANSACTION', amount: 10 });
    const envelope = await seal(new TextEncoder().encode(plaintext), accountKey);

    const sharedUuid = '42000000-0000-4000-8000-000000000001';

    // Push to first account
    const push1 = await pushRecords(account1, OWNER_EMAIL_HASH, [{
      change_uuid: sharedUuid,
      encrypted_payload: envelope as unknown as Record<string, unknown>,
    }]);
    expect(push1.statusCode).toBe(200);

    // Push same UUID to second account — should conflict
    const push2 = await pushRecords(account2, OWNER_EMAIL_HASH, [{
      change_uuid: sharedUuid,
      encrypted_payload: envelope as unknown as Record<string, unknown>,
    }]);
    expect(push2.statusCode).toBe(409);
    expect(push2.json()).toEqual({ error: 'change_uuid_conflict' });
  }, 30_000);

  it('pulls records incrementally with since parameter', async () => {
    const accountId = await createAccount(OWNER_EMAIL_HASH);
    const accountKey = await generateAccountKey();

    const plaintext1 = JSON.stringify({ type: 'CREATE_TRANSACTION', amount: 1 });
    const plaintext2 = JSON.stringify({ type: 'CREATE_TRANSACTION', amount: 2 });
    const plaintext3 = JSON.stringify({ type: 'CREATE_TRANSACTION', amount: 3 });

    const envelope1 = await seal(new TextEncoder().encode(plaintext1), accountKey);
    const envelope2 = await seal(new TextEncoder().encode(plaintext2), accountKey);
    const envelope3 = await seal(new TextEncoder().encode(plaintext3), accountKey);

    const uuids = [
      '43000000-0000-4000-8000-000000000001',
      '43000000-0000-4000-8000-000000000002',
      '43000000-0000-4000-8000-000000000003',
    ];

    // Push all three
    const pushResult = await pushRecords(accountId, OWNER_EMAIL_HASH, [
      { change_uuid: uuids[0], encrypted_payload: envelope1 as unknown as Record<string, unknown> },
      { change_uuid: uuids[1], encrypted_payload: envelope2 as unknown as Record<string, unknown> },
      { change_uuid: uuids[2], encrypted_payload: envelope3 as unknown as Record<string, unknown> },
    ]);
    expect(pushResult.statusCode).toBe(200);
    const pushSequences = pushResult.json().results.map((r: { sequence: number }) => r.sequence);

    // Pull since=pushSequences[0] — should get records 2 and 3
    const pullSince1 = await server.inject({
      method: 'GET',
      url: `/v1/accounts/${accountId}/records?since=${pushSequences[0]}`,
      headers: authHeaders(OWNER_EMAIL_HASH),
    });

    expect(pullSince1.statusCode).toBe(200);
    const body1 = pullSince1.json<{
      records: Array<{ change_uuid: string; sequence: number; encrypted_payload: unknown }>;
      next_since: number | null;
    }>();
    expect(body1.records).toHaveLength(2);
    expect(body1.records[0].change_uuid).toBe(uuids[1]);
    expect(body1.records[1].change_uuid).toBe(uuids[2]);

    // Decrypt the first pulled record to verify round-trip
    const pulledEnvelope = body1.records[0].encrypted_payload as SymmetricEnvelope;
    const decrypted = await open(pulledEnvelope, accountKey);
    expect(new TextDecoder().decode(decrypted)).toBe(plaintext2);
  }, 30_000);

  it('rejects unauthorized access to encrypted records', async () => {
    const accountId = await createAccount(OWNER_EMAIL_HASH);
    const accountKey = await generateAccountKey();

    const plaintext = JSON.stringify({ type: 'CREATE_TRANSACTION', amount: 77 });
    const envelope = await seal(new TextEncoder().encode(plaintext), accountKey);

    // Push as owner
    const pushResult = await pushRecords(accountId, OWNER_EMAIL_HASH, [{
      change_uuid: '44000000-0000-4000-8000-000000000001',
      encrypted_payload: envelope as unknown as Record<string, unknown>,
    }]);
    expect(pushResult.statusCode).toBe(200);

    // Try to pull as different user — should be forbidden
    const unauthorizedPull = await server.inject({
      method: 'GET',
      url: `/v1/accounts/${accountId}/records?since=0`,
      headers: authHeaders(OTHER_EMAIL_HASH),
    });
    expect(unauthorizedPull.statusCode).toBe(403);
    expect(unauthorizedPull.json()).toEqual({ error: 'account_key_not_found' });
  }, 30_000);

  it('stores and retrieves multiple encrypted payloads with different nonces', async () => {
    const accountId = await createAccount(OWNER_EMAIL_HASH);
    const accountKey = await generateAccountKey();

    // Create 5 records with the same plaintext but different nonces
    const plaintext = JSON.stringify({ type: 'CREATE_TRANSACTION', amount: 50 });
    const envelopes: SymmetricEnvelope[] = [];
    for (let i = 0; i < 5; i++) {
      envelopes.push(await seal(new TextEncoder().encode(plaintext), accountKey));
    }

    // Verify all nonces are unique (semantic security)
    const nonces = envelopes.map(e => e.nonce);
    expect(new Set(nonces).size).toBe(5);

    const uuids = Array.from({ length: 5 }, (_, i) =>
      `45000000-0000-4000-8000-00000000000${i + 1}`,
    );

    // Push all
    const pushResult = await pushRecords(
      accountId,
      OWNER_EMAIL_HASH,
      envelopes.map((envelope, i) => ({
        change_uuid: uuids[i],
        encrypted_payload: envelope as unknown as Record<string, unknown>,
      })),
    );
    expect(pushResult.statusCode).toBe(200);

    // Pull all
    const pullResult = await server.inject({
      method: 'GET',
      url: `/v1/accounts/${accountId}/records?since=0`,
      headers: authHeaders(OWNER_EMAIL_HASH),
    });
    expect(pullResult.statusCode).toBe(200);
    const pullBody = pullResult.json<{
      records: Array<{ change_uuid: string; sequence: number; encrypted_payload: unknown }>;
    }>();
    expect(pullBody.records).toHaveLength(5);

    // Decrypt all and verify they all produce the same plaintext
    for (const record of pullBody.records) {
      const envelope = record.encrypted_payload as SymmetricEnvelope;
      const decrypted = await open(envelope, accountKey);
      expect(new TextDecoder().decode(decrypted)).toBe(plaintext);
    }

    // Verify all ciphertexts are unique (different nonces → different ciphertexts)
    const ciphertexts = pullBody.records.map(
      r => (r.encrypted_payload as SymmetricEnvelope).ciphertext,
    );
    expect(new Set(ciphertexts).size).toBe(5);
  }, 30_000);
});
