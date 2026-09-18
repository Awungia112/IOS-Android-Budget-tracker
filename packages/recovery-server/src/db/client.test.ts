import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mocks are declared at the top level so Vitest hoists them before any import.
// The actual mock implementations are re-created on each test via resetModules().
vi.mock('pg', () => {
  const Pool = vi.fn().mockImplementation(() => ({ end: vi.fn().mockResolvedValue(undefined) }));
  return { Pool };
});

vi.mock('drizzle-orm/node-postgres', () => ({
  drizzle: vi.fn().mockReturnValue({ _tag: 'MockDb' }),
}));

beforeEach(() => {
  // Re-evaluate client.ts and its mocked deps for every test so Pool call
  // counts and constructor references never bleed between tests.
  vi.resetModules();
});

afterEach(() => {
  vi.clearAllMocks();
  delete process.env.RECOVERY_DB_URL;
  delete process.env.RECOVERY_DB_NAME;
  delete process.env.DB_HOST;
  delete process.env.DB_PORT;
  delete process.env.DB_USER;
  delete process.env.DB_PASSWORD;
  delete process.env.DB_NAME;
});

describe('createPgPool', () => {
  it('throws when no URL is provided and env var is absent', async () => {
    delete process.env.RECOVERY_DB_URL;
    delete process.env.DB_HOST;
    delete process.env.DB_PORT;
    delete process.env.DB_USER;
    delete process.env.DB_PASSWORD;
    const { createPgPool } = await import('./client.js');
    expect(() => createPgPool(undefined)).toThrow('RECOVERY_DB_URL or (DB_HOST, DB_PORT, DB_USER, DB_PASSWORD) must be set');
  });

  it('creates a Pool with SSL enabled for remote hosts', async () => {
    const { createPgPool } = await import('./client.js');
    const { Pool } = await import('pg');
    createPgPool('postgres://user:pass@db.aws.example.com/recovery');
    expect(Pool).toHaveBeenCalledWith({ connectionString: 'postgres://user:pass@db.aws.example.com/recovery', ssl: { rejectUnauthorized: false } });
  });

  it('enables SSL for remote hosts with postgresql:// scheme', async () => {
    const { createPgPool } = await import('./client.js');
    const { Pool } = await import('pg');
    createPgPool('postgresql://user:pass@db.aws.example.com/recovery');
    expect(Pool).toHaveBeenCalledWith({ connectionString: 'postgresql://user:pass@db.aws.example.com/recovery', ssl: { rejectUnauthorized: false } });
  });

  it('disables SSL for localhost URLs by default', async () => {
    const { createPgPool } = await import('./client.js');
    const { Pool } = await import('pg');
    createPgPool('postgres://user:pass@localhost/recovery');
    expect(Pool).toHaveBeenCalledWith({ connectionString: 'postgres://user:pass@localhost/recovery', ssl: false });
  });

  it('disables SSL for Docker service names (hostnames without dots)', async () => {
    const { createPgPool } = await import('./client.js');
    const { Pool } = await import('pg');
    createPgPool('postgres://user:pass@recovery-db:5432/recovery');
    expect(Pool).toHaveBeenCalledWith({ connectionString: 'postgres://user:pass@recovery-db:5432/recovery', ssl: false });
  });

  it('falls back to RECOVERY_DB_URL env var with SSL for remote hosts', async () => {
    process.env.RECOVERY_DB_URL = 'postgres://user:pass@db.aws.example.com/recovery';
    const { createPgPool } = await import('./client.js');
    const { Pool } = await import('pg');
    createPgPool();
    expect(Pool).toHaveBeenCalledWith({ connectionString: 'postgres://user:pass@db.aws.example.com/recovery', ssl: { rejectUnauthorized: false } });
  });

  it('builds a URL from DB parts and DB_NAME', async () => {
    process.env.DB_HOST = 'db.local';
    process.env.DB_PORT = '5432';
    process.env.DB_USER = 'budget_user';
    process.env.DB_PASSWORD = 'p@ss/word';
    process.env.DB_NAME = 'budget';
    const { createPgPool } = await import('./client.js');
    const { Pool } = await import('pg');
    createPgPool();
    expect(Pool).toHaveBeenCalledWith({
      connectionString: 'postgresql://budget_user:p%40ss%2Fword@db.local:5432/budget',
      ssl: { rejectUnauthorized: false },
    });
  });

  it('defaults DB parts to the recovery database name', async () => {
    process.env.DB_HOST = 'db.local';
    process.env.DB_PORT = '5432';
    process.env.DB_USER = 'budget_user';
    process.env.DB_PASSWORD = 'secret';
    const { createPgPool } = await import('./client.js');
    const { Pool } = await import('pg');
    createPgPool();
    expect(Pool).toHaveBeenCalledWith({
      connectionString: 'postgresql://budget_user:secret@db.local:5432/budget_recovery',
      ssl: { rejectUnauthorized: false },
    });
  });

  it('builds a URL from DB parts and DB_NAME', async () => {
    process.env.DB_HOST = 'db.local';
    process.env.DB_PORT = '5432';
    process.env.DB_USER = 'budget_user';
    process.env.DB_PASSWORD = 'p@ss/word';
    process.env.DB_NAME = 'budget';
    const { createPgPool } = await import('./client.js');
    const { Pool } = await import('pg');
    createPgPool();
    expect(Pool).toHaveBeenCalledWith({
      connectionString: 'postgresql://budget_user:p%40ss%2Fword@db.local:5432/budget',
      ssl: { rejectUnauthorized: false },
    });
  });

  it('defaults DB parts to the recovery database name', async () => {
    process.env.DB_HOST = 'db.local';
    process.env.DB_PORT = '5432';
    process.env.DB_USER = 'budget_user';
    process.env.DB_PASSWORD = 'secret';
    const { createPgPool } = await import('./client.js');
    const { Pool } = await import('pg');
    createPgPool();
    expect(Pool).toHaveBeenCalledWith({
      connectionString: 'postgresql://budget_user:secret@db.local:5432/budget_recovery',
      ssl: { rejectUnauthorized: false },
    });
  });

  it('disables SSL when { ssl: false } is passed', async () => {
    const { createPgPool } = await import('./client.js');
    const { Pool } = await import('pg');
    createPgPool('postgres://user:pass@localhost/recovery', { ssl: false });
    expect(Pool).toHaveBeenCalledWith({ connectionString: 'postgres://user:pass@localhost/recovery', ssl: false });
  });
});

describe('closePgPool', () => {
  it('calls pool.end()', async () => {
    const { createPgPool, closePgPool } = await import('./client.js');
    const pool = createPgPool('postgres://x/y');
    await closePgPool(pool);
    expect(pool.end).toHaveBeenCalledOnce();
  });
});

describe('createDb', () => {
  it('returns a drizzle db instance', async () => {
    const { createPgPool, createDb } = await import('./client.js');
    const { drizzle } = await import('drizzle-orm/node-postgres');
    const pool = createPgPool('postgres://x/y');
    const db = createDb(pool);
    expect(drizzle).toHaveBeenCalledWith(pool, expect.objectContaining({ schema: expect.anything() }));
    expect(db).toEqual({ _tag: 'MockDb' });
  });
});
