import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';

import * as schema from './schema.js';

/**
 * Builds a PostgreSQL connection URL from individual environment variables
 * (DB_HOST, DB_PORT, DB_USER, DB_PASSWORD, DB_NAME). This avoids shell
 * interpolation issues with special characters in the password (e.g. @, /, #)
 * that break URL parsing when DATABASE_URL is constructed via shell variable
 * substitution.
 *
 * Falls back to DATABASE_URL if the individual vars are not set.
*/
function resolveDatabaseUrl(env: NodeJS.ProcessEnv = process.env): string {
  if (env.DATABASE_URL?.trim()) {
    return env.DATABASE_URL.trim();
  }

  const { DB_HOST, DB_PORT, DB_USER, DB_PASSWORD, DB_NAME } = env;

  if (DB_HOST && DB_PORT && DB_USER && DB_PASSWORD && DB_NAME) {
    return `postgresql://${DB_USER}:${encodeURIComponent(DB_PASSWORD)}@${DB_HOST}:${DB_PORT}/${DB_NAME}`;
  }

  throw new Error('DATABASE_URL or (DB_HOST, DB_PORT, DB_USER, DB_PASSWORD, DB_NAME) must be set');
}

/**
 * Creates a PostgreSQL pool. The caller owns its lifecycle and must call
 * closePgPool(pool) during shutdown.
 *
 * SSL is automatically disabled for localhost connections (common dev setup)
 * and enabled with rejectUnauthorized: false for remote hosts (e.g. AWS RDS).
 * Pass { ssl: false } to explicitly disable SSL.
 */
export function createPgPool(databaseUrl?: string, options?: { ssl?: false }): Pool {
  const url = databaseUrl ?? resolveDatabaseUrl();
  // Default to no SSL for localhost (common dev setup), SSL-on for remote hosts.
  // Detects: localhost, 127.0.0.1, 0.0.0.0, and Docker service names (hostnames without dots)
  const hostMatch = url.match(/(?:postgres|postgresql):\/\/[^:]+:[^@]+@([^:/]+)/);
  const host = hostMatch?.[1] ?? '';
  const isLocalhost = /localhost|127\.0\.0\.1|0\.0\.0\.0/.test(url) || !host.includes('.');
  const ssl = options?.ssl === false ? false : isLocalhost ? false : { rejectUnauthorized: false };

  return new Pool({
    connectionString: url,
    ssl,
  });
}

export async function closePgPool(pool: Pool): Promise<void> {
  await pool.end();
}

export function createDb(pool: Pool) {
  return drizzle(pool, { schema, casing: 'snake_case' });
}

export type Db = ReturnType<typeof createDb>;
