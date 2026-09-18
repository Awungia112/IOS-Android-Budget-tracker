import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { sql } from 'drizzle-orm';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { readMigrationFiles } from 'drizzle-orm/migrator';
import type { Db } from './client.js';

const MIGRATIONS_DIR = join(dirname(fileURLToPath(import.meta.url)), '../../drizzle');

/**
 * Apply pending migrations programmatically.
 * Uses drizzle-orm's programmatic migrator instead of the drizzle-kit CLI,
 * which has a known hang issue (drizzle-kit@0.31.x hangs after
 * "Using 'pg' driver for database querying" in containerized environments).
 *
 * Before running pending migrations, bootstraps the Drizzle migration tracking
 * table if it's empty but the database already has the applied schema. This
 * prevents failures when the initial schema was created outside Drizzle's
 * migration tracking (e.g., by a previous deployment mechanism) and multiple
 * pods start concurrently.
 */
export async function runMigrations(db: Db): Promise<void> {
  await bootstrapDrizzleTracking(db);
  await migrate(db, { migrationsFolder: MIGRATIONS_DIR });
}

/**
 * Ensure the Drizzle migration tracking table is consistent with the actual
 * database schema before running pending migrations.
 *
 * Drizzle's `migrate()` checks whether a migration needs to be applied by
 * comparing the last recorded `created_at` against each migration's
 * `folderMillis` (`when` in the journal). If the `__drizzle_migrations`
 * table is empty, ALL journaled migrations are re-applied - including
 * `ALTER TABLE ADD CONSTRAINT` statements that fail with PG error 42710
 * ("constraint already exists") when the schema was previously applied
 * outside Drizzle's tracking.
 *
 * This function detects that scenario and pre-populates the tracking table
 * with the journal entries so that `migrate()` correctly skips them.
 */
async function bootstrapDrizzleTracking(db: Db): Promise<void> {
  // 1. Ensure the tracking schema and table exist (same pattern Drizzle uses)
  await db.execute(sql`CREATE SCHEMA IF NOT EXISTS drizzle`);
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS drizzle.__drizzle_migrations (
      id SERIAL PRIMARY KEY,
      hash text NOT NULL,
      created_at bigint
    )
  `);

  // 2. Check if tracking already has entries
  const countResult = await db.execute(
    sql`SELECT count(*)::text AS count FROM drizzle.__drizzle_migrations`,
  );
  const count = Number((countResult.rows[0] as Record<string, unknown>)?.count ?? 0);
  if (count > 0) {
    return; // Already bootstrapped - let Drizzle skip applied migrations
  }

  // 3. Detect whether the database already has the initial schema applied
  const tableResult = await db.execute(
    sql`SELECT EXISTS (
      SELECT FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = 'accounts'
    ) AS "exists"`,
  );
  const schemaExists = (tableResult.rows[0] as Record<string, unknown>)?.exists;
  if (!schemaExists) {
    return; // Fresh database - Drizzle will apply all migrations normally
  }

  // 4. Schema exists but tracking is empty: check which journal entries
  //    are already reflected in the database by probing for their objects,
  //    and seed only those into the tracking table so Drizzle skips them.
  //    Entries that haven't been applied yet remain for migrate() to run.
  const migrations = readMigrationFiles({ migrationsFolder: MIGRATIONS_DIR });
  // Map migration array index → table it creates (if any).
  // Index in the sorted array corresponds to the journal order
  // (0000 → 0, 0001 → 1, 0002 → 2, …).
  // Migrations that only ALTER TABLE with IF NOT EXISTS are always safe to
  // re-run and don't need entries here.
  const migrationTableMap = new Map<number, string>([
    [0, 'accounts'],
    [2, 'nonces'],
  ]);

  for (const [i, m] of migrations.entries()) {
    const table = migrationTableMap.get(i);
    if (!table) continue; // Idempotent migration — Drizzle can safely re-run it

    const result = await db.execute(
      sql`SELECT EXISTS (
        SELECT FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = ${table}
      ) AS "exists"`,
    );
    if ((result.rows[0] as Record<string, unknown>)?.exists) {
      await db.execute(
        sql`INSERT INTO drizzle.__drizzle_migrations (hash, created_at)
            VALUES (${m.hash}, ${m.folderMillis})
            ON CONFLICT DO NOTHING`,
      );
    }
  }
}