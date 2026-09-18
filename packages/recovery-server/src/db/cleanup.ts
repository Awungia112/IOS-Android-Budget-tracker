import { and, isNotNull, lt, sql } from 'drizzle-orm';
import type { RecoveryDb } from './recovery.repository.js';
import { recoveryEntries } from './schema.js';

const INTERVAL_MS = 24 * 60 * 60 * 1000; // 24 hours

/**
 * Deletes stale recovery entries: rows where a recovery code was used
 * AND the record is older than 90 days.
 */
export async function runCleanup(db: RecoveryDb): Promise<number> {
  const result = await db
    .delete(recoveryEntries)
    .where(
      and(
        isNotNull(recoveryEntries.code_used_at),
        lt(recoveryEntries.enrolled_at, sql`now() - INTERVAL '90 days'`),
      ),
    )
    .returning({ id: recoveryEntries.id });
  return result.length;
}

export interface Logger {
  info(msg: string, meta?: Record<string, unknown>): void;
  error(msg: string, meta?: Record<string, unknown>): void;
}

/**
 * Starts a daily cleanup timer. Runs once immediately on boot, then every 24h.
 * Returns a cleanup function that stops the timer.
 */
export function startCleanupScheduler(db: RecoveryDb, log: Logger): () => void {
  const run = async () => {
    try {
      const deleted = await runCleanup(db);
      log.info('Recovery entries cleanup complete', { deleted });
    } catch (error) {
      log.error('Recovery entries cleanup failed', { error });
    }
  };

  void run();
  const timer = setInterval(() => { void run(); }, INTERVAL_MS);
  timer.unref();
  return () => clearInterval(timer);
}
