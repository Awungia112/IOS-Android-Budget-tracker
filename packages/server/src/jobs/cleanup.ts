import type { FastifyBaseLogger } from 'fastify';
import { sql } from 'drizzle-orm';

import type { createDb } from '../db/client.js';
import { users } from '../db/schema.js';
import {
  UNVALIDATED_REGISTRATION_RETENTION_HOURS,
  UNVALIDATED_REGISTRATION_CLEANUP_INTERVAL_MS,
} from '../users/user-contract.js';

/**
 * Starts the cleanup job that removes unvalidated registrations older than
 * UNVALIDATED_REGISTRATION_RETENTION_HOURS hours.
 *
 * Runs immediately on startup, then repeats every
 * UNVALIDATED_REGISTRATION_CLEANUP_INTERVAL_MS milliseconds.
 *
 * Returns a handle that can be used to stop the interval on shutdown.
 *
 * The partial index on (created_at) WHERE validated_at IS NULL makes this
 * scan cheap even at scale.
 */
export function startCleanupJob(
  db: ReturnType<typeof createDb>,
  log: FastifyBaseLogger,
): NodeJS.Timeout {
  const JOB_NAME = 'cleanup-unvalidated-registrations';

  const run = async (): Promise<void> => {
    try {
      const result = await db.execute(sql`
        DELETE FROM ${users}
        WHERE ${users.validatedAt} IS NULL
          AND ${users.createdAt} < now() - make_interval(hours => ${UNVALIDATED_REGISTRATION_RETENTION_HOURS})
      `);
      log.info({ deleted: result.rowCount ?? 0 }, `${JOB_NAME}: done`);
    } catch (err) {
      log.error(err, `${JOB_NAME}: failed`);
    }
  };

  // Run immediately on startup so stale rows are not left until the first tick.
  void run();
  return setInterval(() => {
    void run();
  }, UNVALIDATED_REGISTRATION_CLEANUP_INTERVAL_MS);
}
