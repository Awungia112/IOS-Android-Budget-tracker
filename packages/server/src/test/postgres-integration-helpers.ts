import { execFileSync, spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';

import { Pool } from 'pg';

import { closePgPool, createDb, createPgPool } from '../db/client.js';
import type { Db } from '../users/user.repository.js';

export const dockerAvailable = spawnSync('docker', ['version'], { stdio: 'ignore' }).status === 0;

export interface TestPostgres {
  containerName: string;
  databaseUrl: string;
  pool: Pool;
  db: Db;
}

export function runDocker(args: string[]): string {
  return execFileSync('docker', args, {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
}

/**
 * Waits until a real query can be executed against the Postgres container.
 * This is more reliable than pg_isready, which only checks TCP connectivity
 * but returns success before Postgres is actually ready to serve queries.
 */
export async function waitForPostgres(databaseUrl: string): Promise<void> {
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

export async function startPostgres(prefix = 'budget-wise-server-it'): Promise<TestPostgres> {
  const containerName = `${prefix}-${randomUUID()}`;

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

  const pool = createPgPool(databaseUrl, { ssl: false });

  return {
    containerName,
    databaseUrl,
    pool,
    db: createDb(pool),
  };
}

export async function stopPostgres(testPostgres: TestPostgres | undefined): Promise<void> {
  if (!testPostgres) {
    return;
  }

  await closePgPool(testPostgres.pool);
  spawnSync('docker', ['rm', '-f', testPostgres.containerName], { stdio: 'ignore' });
}
