import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from './schema.js';
import type { RecoveryDb } from './recovery.repository.js';

export type { RecoveryDb };

/**
 * Builds a PostgreSQL connection URL from individual environment variables.
 * DB_NAME lets deployed environments reuse the RDS-created database; local
 * recovery-only setups still default to "budget_recovery".
 *
 * Falls back to RECOVERY_DB_URL if the individual vars are not set.
 */
function resolveRecoveryDbUrl(env: NodeJS.ProcessEnv = process.env): string {
  if (env.RECOVERY_DB_URL?.trim()) {
    return env.RECOVERY_DB_URL.trim();
  }

  const { DB_HOST, DB_PORT, DB_USER, DB_PASSWORD } = env;
  const dbName = env.RECOVERY_DB_NAME?.trim() || env.DB_NAME?.trim() || 'budget_recovery';

  if (DB_HOST && DB_PORT && DB_USER && DB_PASSWORD) {
    return `postgresql://${DB_USER}:${encodeURIComponent(DB_PASSWORD)}@${DB_HOST}:${DB_PORT}/${dbName}`;
  }

  throw new Error('RECOVERY_DB_URL or (DB_HOST, DB_PORT, DB_USER, DB_PASSWORD) must be set');
}

/**
 * Creates a PostgreSQL pool backed by RECOVERY_DB_URL.
 * The caller owns the lifecycle and must call closePgPool(pool) on shutdown.
 *
 * SSL is automatically disabled for localhost connections (common dev setup)
 * and enabled with rejectUnauthorized: false for remote hosts (e.g. AWS RDS).
 * Pass { ssl: false } to explicitly disable SSL.
 */
export function createPgPool(databaseUrl?: string, options?: { ssl?: false }): Pool {
  const url = databaseUrl ?? resolveRecoveryDbUrl();
  // Default to no SSL for localhost (common dev setup), SSL-on for remote hosts.
  // Detects: localhost, 127.0.0.1, 0.0.0.0, and Docker service names (hostnames without dots)
  const hostMatch = url.match(/(?:postgres|postgresql):\/\/[^:]+:[^@]+@([^:/]+)/);
  const host = hostMatch?.[1] ?? '';
  const isLocalhost = /localhost|127\.0\.0\.1|0\.0\.0\.0/.test(url) || !host.includes('.');
  const ssl = options?.ssl === false ? false : isLocalhost ? false : { rejectUnauthorized: false };

  return new Pool({ connectionString: url, ssl });
}

export async function closePgPool(pool: Pool): Promise<void> {
  await pool.end();
}

/**
 * Ensures the target database exists by connecting to the `postgres` maintenance
 * database and creating it if needed. This lets the recovery server bootstrap
 * its own database when RECOVERY_DB_NAME is explicitly configured, matching
 * the microservices pattern of one database per service.
 *
 * Only runs when RECOVERY_DB_NAME is explicitly set (not when falling back to
 * DB_NAME or 'budget_recovery' default), to avoid surprising side effects.
 */
export async function ensureDbExists(): Promise<void> {
  const dbName = process.env.RECOVERY_DB_NAME?.trim();
  if (!dbName) return;

  const host = process.env.DB_HOST?.trim();
  const port = process.env.DB_PORT?.trim();
  const user = process.env.DB_USER?.trim();
  const password = process.env.DB_PASSWORD?.trim();
  if (!host || !port || !user || !password) return;

  const ssl = host.includes('.') ? { rejectUnauthorized: false } : false;

  // 1. Create the target database if it does not exist yet
  const maintenanceUrl = `postgresql://${user}:${encodeURIComponent(password)}@${host}:${port}/postgres`;
  const mPool = new Pool({ connectionString: maintenanceUrl, ssl });
  try {
    const { rowCount } = await mPool.query(
      'SELECT 1 FROM pg_database WHERE datname = $1',
      [dbName],
    );
    if (rowCount === 0) {
      // CREATE DATABASE cannot run inside a transaction block
      await mPool.query(`CREATE DATABASE "${dbName.replace(/"/g, '""')}"`);
    }
  } finally {
    await mPool.end();
  }

  // 2. Clean up stale migration tracking rows that this server may have
  //    left in the shared database (`DB_NAME`) during previous deployments
  //    that used a shared database setup. This lets the main server re-run
  //    its own migrations after recovery transitions to its own database.
  const sharedDbName = process.env.DB_NAME?.trim();
  if (sharedDbName) {
    const sharedUrl = `postgresql://${user}:${encodeURIComponent(password)}@${host}:${port}/${sharedDbName}`;
    const sPool = new Pool({ connectionString: sharedUrl, ssl });
    try {
      await sPool.query('DELETE FROM drizzle.__drizzle_migrations');
    } catch {
      // Table may not exist in a fresh environment — nothing to clean
    } finally {
      await sPool.end();
    }
  }
}

export function createDb(pool: Pool): RecoveryDb {
  return drizzle(pool, { schema });
}
