import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { PgDialect } from 'drizzle-orm/pg-core';
import { and, isNotNull, lt, sql } from 'drizzle-orm';
import { runCleanup, startCleanupScheduler } from './cleanup.js';
import { recoveryEntries } from './schema.js';

// ── SQL predicate helper ──────────────────────────────────────────────────────

const dialect = new PgDialect();

function toSql(condition: Parameters<typeof dialect.sqlToQuery>[0]): string {
  return dialect.sqlToQuery(condition).sql;
}

// ── Shared mock db factory ────────────────────────────────────────────────────

function makeMockDb(returningRows: { id: string }[] = []) {
  const returning = vi.fn().mockResolvedValue(returningRows);
  const where = vi.fn().mockReturnValue({ returning });
  const del = vi.fn().mockReturnValue({ where });
  return {
    delete: del,
    _mocks: { del, where, returning },
  };
}

// ── runCleanup ────────────────────────────────────────────────────────────────

describe('runCleanup', () => {
  it('deletes with predicate: code_used_at IS NOT NULL AND enrolled_at < now() - INTERVAL 90 days', async () => {
    const db = makeMockDb([{ id: 'uuid-1' }, { id: 'uuid-2' }]);

    const deleted = await runCleanup(db as any);

    // Verify the exact WHERE predicate passed to Drizzle matches the ticket spec
    const predicateArg = db._mocks.where.mock.calls[0]?.[0] as ReturnType<typeof and>;
    expect(predicateArg).toBeDefined();
    const renderedSql = toSql(predicateArg!.getSQL());

    expect(renderedSql).toContain('"recovery_entries"."code_used_at" is not null');
    expect(renderedSql).toContain('"recovery_entries"."enrolled_at" < now() - INTERVAL \'90 days\'');
    expect(deleted).toBe(2);
  });

  it('returns 0 when no rows are deleted', async () => {
    const db = makeMockDb([]);
    const deleted = await runCleanup(db as any);
    expect(deleted).toBe(0);
  });

  it('propagates errors thrown by the db', async () => {
    const returning = vi.fn().mockRejectedValue(new Error('db error'));
    const where = vi.fn().mockReturnValue({ returning });
    const db = { delete: vi.fn().mockReturnValue({ where }) };

    await expect(runCleanup(db as any)).rejects.toThrow('db error');
  });

  it('builds the expected predicate independently of runCleanup', () => {
    // Construct the same predicate the ticket specifies and assert its SQL —
    // this acts as a compile-time + runtime spec for the WHERE clause.
    const predicate = and(
      isNotNull(recoveryEntries.code_used_at),
      lt(recoveryEntries.enrolled_at, sql`now() - INTERVAL '90 days'`),
    );

    const rendered = toSql(predicate!.getSQL());
    expect(rendered).toBe(
      `("recovery_entries"."code_used_at" is not null and "recovery_entries"."enrolled_at" < now() - INTERVAL '90 days')`,
    );
  });
});

// ── startCleanupScheduler ─────────────────────────────────────────────────────

describe('startCleanupScheduler', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('runs cleanup immediately on start', async () => {
    const db = makeMockDb([]);
    const log = { info: vi.fn(), error: vi.fn() };

    const stop = startCleanupScheduler(db as any, log);

    // advance just enough to flush the initial void promise
    await vi.advanceTimersByTimeAsync(0);

    expect(db.delete).toHaveBeenCalledOnce();
    expect(log.info).toHaveBeenCalledWith('Recovery entries cleanup complete', { deleted: 0 });

    stop();
  });

  it('runs cleanup again after 24 hours', async () => {
    const db = makeMockDb([]);
    const log = { info: vi.fn(), error: vi.fn() };

    const stop = startCleanupScheduler(db as any, log);
    await vi.advanceTimersByTimeAsync(0); // flush initial run

    await vi.advanceTimersByTimeAsync(24 * 60 * 60 * 1000); // trigger interval

    expect(db.delete).toHaveBeenCalledTimes(2);

    stop();
  });

  it('does not run again after stop() is called', async () => {
    const db = makeMockDb([]);
    const log = { info: vi.fn(), error: vi.fn() };

    const stop = startCleanupScheduler(db as any, log);
    await vi.advanceTimersByTimeAsync(0); // flush initial run

    stop();

    await vi.advanceTimersByTimeAsync(24 * 60 * 60 * 1000);

    // only the initial run, not the interval
    expect(db.delete).toHaveBeenCalledOnce();
  });

  it('logs an error and does not throw when cleanup fails', async () => {
    const returning = vi.fn().mockRejectedValue(new Error('connection lost'));
    const where = vi.fn().mockReturnValue({ returning });
    const db = { delete: vi.fn().mockReturnValue({ where }) };
    const log = { info: vi.fn(), error: vi.fn() };

    const stop = startCleanupScheduler(db as any, log);
    await vi.advanceTimersByTimeAsync(0);

    expect(log.error).toHaveBeenCalledWith('Recovery entries cleanup failed', {
      error: expect.any(Error),
    });
    expect(log.info).not.toHaveBeenCalled();

    stop();
  });
});
