import { execFileSync, spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';

import type { FastifyInstance } from 'fastify';
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { migrate } from 'drizzle-orm/node-postgres/migrator';

import { buildServer } from '../app.js';
import { closePgPool, createDb, createPgPool, type Db } from '../db/client.js';
import { nonces } from '../db/schema.js';
import { DbNonceStore } from './nonce-store.js';
import {
  NONCE_ROUTE,
  NONCE_TTL_MS,
  REPLAY_PROTECTION_ERRORS,
  REPLAY_PROTECTION_HEADERS,
  type NonceResponse,
} from './replay-protection-contract.js';

const dockerAvailable = spawnSync('docker', ['version'], { stdio: 'ignore' }).status === 0;
const describeWithDocker = dockerAvailable ? describe : describe.skip;

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

function replayHeaders(nonce: string): Record<string, string> {
  return {
    [REPLAY_PROTECTION_HEADERS.nonce]: nonce,
    [REPLAY_PROTECTION_HEADERS.timestamp]: String(Date.now()),
  };
}

/**
 * Production runs several server replicas behind a load balancer, so the
 * request that fetches a nonce and the mutation that spends it can land on
 * different instances. These tests run two server instances against one
 * database to verify the store is truly shared.
 */
describeWithDocker('DB-backed nonce store integration', () => {
  let previousMagicLinkSecret: string | undefined;
  let previousEmailEncryptionKey: string | undefined;
  let containerName: string;
  let pool: Pool;
  let db: Db;
  let serverA: FastifyInstance;
  let serverB: FastifyInstance;

  beforeAll(async () => {
    previousMagicLinkSecret = process.env.MAGIC_LINK_SECRET;
    previousEmailEncryptionKey = process.env.EMAIL_ENCRYPTION_KEY;
    process.env.MAGIC_LINK_SECRET = 'integration-test-secret';
    process.env.EMAIL_ENCRYPTION_KEY = [
      '95fb2ed623392de4', '4b7eed8761e6e414',
      '799e446119bb0437', '72a795d27fdda61d',
    ].join('');
    containerName = `budget-wise-nonce-it-${randomUUID()}`;

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

    serverA = await buildServer({ db, fastifyOptions: { logger: false } });
    serverB = await buildServer({ db, fastifyOptions: { logger: false } });
    for (const server of [serverA, serverB]) {
      server.post('/test/protected', async () => ({ ok: true }));
    }
  }, 90_000);

  afterAll(async () => {
    if (serverA) await serverA.close();
    if (serverB) await serverB.close();
    if (pool) await closePgPool(pool);
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

  it('accepts a nonce issued by a different server instance', async () => {
    const issued = await serverA.inject({ method: 'GET', url: NONCE_ROUTE });
    expect(issued.statusCode).toBe(200);
    const { nonce } = issued.json<NonceResponse>();

    const response = await serverB.inject({
      method: 'POST',
      url: '/test/protected',
      headers: replayHeaders(nonce),
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ ok: true });
  });

  it('rejects a replay of a consumed nonce on any instance', async () => {
    const issued = await serverA.inject({ method: 'GET', url: NONCE_ROUTE });
    const { nonce } = issued.json<NonceResponse>();

    const first = await serverB.inject({
      method: 'POST',
      url: '/test/protected',
      headers: replayHeaders(nonce),
    });
    expect(first.statusCode).toBe(200);

    for (const server of [serverA, serverB]) {
      const replay = await server.inject({
        method: 'POST',
        url: '/test/protected',
        headers: replayHeaders(nonce),
      });
      expect(replay.statusCode).toBe(401);
      expect(replay.json()).toEqual({ error: REPLAY_PROTECTION_ERRORS.invalidNonce });
    }
  });

  it('rejects an expired nonce', async () => {
    const store = new DbNonceStore(db);
    try {
      const issuedAt = Date.now();
      const { nonce } = await store.issue(issuedAt);

      await expect(store.consumeIfUsable(nonce, issuedAt + NONCE_TTL_MS + 1)).resolves.toBe(false);
    } finally {
      await store.close();
    }
  });

  it('sweeps expired nonces out of the table', async () => {
    const sweepIntervalMs = 50;
    const store = new DbNonceStore(db, undefined, sweepIntervalMs);
    try {
      // Issue a nonce that is already expired from the sweep's perspective.
      const { nonce } = await store.issue(Date.now() - NONCE_TTL_MS - 1_000);

      await vi.waitFor(async () => {
        const remaining = await db.select().from(nonces);
        expect(remaining.map((row) => row.nonce)).not.toContain(nonce);
      }, { timeout: 5_000, interval: 100 });
    } finally {
      await store.close();
    }
  });
});
