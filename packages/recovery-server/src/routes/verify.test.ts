import type { FastifyInstance } from 'fastify';
import argon2 from 'argon2';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { buildServer } from '../app.js';
import type { RecoveryDb } from '../db/recovery.repository.js';
import { RECOVERY_ERRORS, MAX_VERIFY_ATTEMPTS } from './recovery-contract.js';
import { RECOVERY_ALG } from './enroll-contract.js';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const VALID_EMAIL_HASH = 'b'.repeat(64);
const VALID_CODE = '123456';

const VALID_ENVELOPE = {
  v: 1 as const,
  alg: RECOVERY_ALG,
  kdf_salt: 'AAAAAAAAAAAAAAAAAAAAAA',
  kdf_ops: 2,
  kdf_mem: 67108864,
  nonce: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
  ciphertext: 'A'.repeat(64),
};

async function makeValidHash(): Promise<string> {
  return argon2.hash(VALID_CODE, { type: argon2.argon2id });
}

const FUTURE_DATE = new Date(Date.now() + 10 * 60 * 1000);
const PAST_DATE = new Date(Date.now() - 1000);

// ─── DB mock ──────────────────────────────────────────────────────────────────

interface EntryState {
  tmp_code_hash?: string | null;
  code_expires_at?: Date | null;
  code_used_at?: Date | null;
  verify_attempts?: number;
  verify_window_start?: Date | null;
  encrypted_private_key?: typeof VALID_ENVELOPE;
}

function buildDbMock(opts: { entry?: EntryState | null } = {}): RecoveryDb {
  const { entry = null } = opts;

  const queryResult = entry
    ? [{
        id: 'uuid',
        email_hash: VALID_EMAIL_HASH,
        tmp_code_hash: entry.tmp_code_hash ?? null,
        code_expires_at: entry.code_expires_at ?? null,
        code_used_at: entry.code_used_at ?? null,
        verify_attempts: entry.verify_attempts ?? 0,
        verify_window_start: entry.verify_window_start ?? null,
        enrolled_at: new Date(),
        encrypted_private_key: entry.encrypted_private_key ?? VALID_ENVELOPE,
        request_count: 0,
        request_window_start: null,
      }]
    : [];

  // Helper: the first call to the returning mock for the wrong-code path
  // returns the current verify_attempts; subsequent calls work as normal.
  const returningMock = vi.fn();
  returningMock.mockImplementation(() => {
    // For the wrong-code path, return updated verify_attempts
    if (entry && returningMock.mock.calls.length <= 1) {
      return Promise.resolve([{ verify_attempts: (entry.verify_attempts ?? 0) + 1 }]);
    }
    return Promise.resolve([{ id: 'uuid' }]);
  });

  const updateWhereMock = vi.fn().mockReturnValue({ returning: returningMock });
  const setMock = vi.fn().mockReturnValue({ where: updateWhereMock });
  const updateMock = vi.fn().mockReturnValue({ set: setMock });

  const limitMock = vi.fn().mockResolvedValue(queryResult);
  const whereMock = vi.fn().mockReturnValue({ limit: limitMock });
  const fromMock = vi.fn().mockReturnValue({ where: whereMock });
  const selectMock = vi.fn().mockReturnValue({ from: fromMock });

  return { select: selectMock, update: updateMock } as unknown as RecoveryDb;
}

function createServer(db: RecoveryDb): Promise<FastifyInstance> {
  return buildServer({ db, fastifyOptions: { logger: false } });
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('POST /v1/recovery/verify', () => {
  let server: FastifyInstance;
  let validHash: string;

  beforeEach(async () => {
    validHash = await makeValidHash();
    server = await createServer(buildDbMock({
      entry: {
        tmp_code_hash: validHash,
        code_expires_at: FUTURE_DATE,
        verify_attempts: 0,
        encrypted_private_key: VALID_ENVELOPE,
      },
    }));
  });

  afterEach(async () => {
    await server.close();
  });

  // ── Happy path ──────────────────────────────────────────────────────────────

  it('returns 200 and the encrypted_private_key on correct code', async () => {
    const res = await server.inject({
      method: 'POST',
      url: '/v1/recovery/verify',
      payload: { email_hash: VALID_EMAIL_HASH, code: VALID_CODE },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ encrypted_private_key: VALID_ENVELOPE });
  });

  // ── All failure paths return 404 — no enrollment leakage ───────────────────

  it('returns 401 for unknown email_hash', async () => {
    server = await createServer(buildDbMock({ entry: null }));

    const res = await server.inject({
      method: 'POST',
      url: '/v1/recovery/verify',
      payload: { email_hash: VALID_EMAIL_HASH, code: VALID_CODE },
    });

    expect(res.statusCode).toBe(401);
    expect(res.json()).toEqual({ error: RECOVERY_ERRORS.notFound });
  });

  it('returns 401 on wrong code with attempts_remaining', async () => {
    const res = await server.inject({
      method: 'POST',
      url: '/v1/recovery/verify',
      payload: { email_hash: VALID_EMAIL_HASH, code: '000000' },
    });

    expect(res.statusCode).toBe(401);
    const body = res.json() as { error: string; attempts_remaining: number };
    expect(body.error).toBe(RECOVERY_ERRORS.notFound);
    expect(body.attempts_remaining).toBe(MAX_VERIFY_ATTEMPTS - 1);
  });

  it('returns 429 (not 423) when locked — prevents enrollment leakage', async () => {
    server = await createServer(buildDbMock({
      entry: { tmp_code_hash: validHash, code_expires_at: FUTURE_DATE, verify_attempts: MAX_VERIFY_ATTEMPTS },
    }));

    const res = await server.inject({
      method: 'POST',
      url: '/v1/recovery/verify',
      payload: { email_hash: VALID_EMAIL_HASH, code: VALID_CODE },
    });

    expect(res.statusCode).toBe(429);
    expect(res.json()).toEqual({ error: RECOVERY_ERRORS.codeLocked, attempts_remaining: 0 });
  });

  it('returns 401 (not 423) after the 5th wrong attempt locks the entry', async () => {
    server = await createServer(buildDbMock({
      entry: { tmp_code_hash: validHash, code_expires_at: FUTURE_DATE, verify_attempts: MAX_VERIFY_ATTEMPTS - 1 },
    }));

    const res = await server.inject({
      method: 'POST',
      url: '/v1/recovery/verify',
      payload: { email_hash: VALID_EMAIL_HASH, code: '000000' },
    });

    expect(res.statusCode).toBe(401);
    const body = res.json() as { error: string; attempts_remaining: number };
    expect(body.error).toBe(RECOVERY_ERRORS.notFound);
    expect(body.attempts_remaining).toBe(0);
  });

  it('returns 401 (not 410) for expired code — prevents enrollment leakage', async () => {
    server = await createServer(buildDbMock({
      entry: { tmp_code_hash: validHash, code_expires_at: PAST_DATE, verify_attempts: 0 },
    }));

    const res = await server.inject({
      method: 'POST',
      url: '/v1/recovery/verify',
      payload: { email_hash: VALID_EMAIL_HASH, code: VALID_CODE },
    });

    expect(res.statusCode).toBe(401);
    expect(res.json()).toEqual({ error: RECOVERY_ERRORS.notFound });
  });

  it('returns 401 (not 410) when no code was ever issued', async () => {
    server = await createServer(buildDbMock({
      entry: { tmp_code_hash: null, code_expires_at: null, verify_attempts: 0 },
    }));

    const res = await server.inject({
      method: 'POST',
      url: '/v1/recovery/verify',
      payload: { email_hash: VALID_EMAIL_HASH, code: VALID_CODE },
    });

    expect(res.statusCode).toBe(401);
  });

  it('returns 401 (not 410) for an already-used code — prevents enrollment leakage', async () => {
    // Simulate the atomic UPDATE returning 0 rows (code_used_at already set).
    const db = {
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([{
              id: 'uuid',
              email_hash: VALID_EMAIL_HASH,
              tmp_code_hash: validHash,
              code_expires_at: FUTURE_DATE,
              code_used_at: null, // reads as null — concurrent race
              verify_attempts: 0,
              verify_window_start: null,
              enrolled_at: new Date(),
              encrypted_private_key: VALID_ENVELOPE,
              request_count: 0,
              request_window_start: null,
            }]),
          }),
        }),
      }),
      update: vi.fn().mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            returning: vi.fn().mockResolvedValue([]), // 0 rows — already used
          }),
        }),
      }),
    } as unknown as RecoveryDb;

    server = await createServer(db);

    const res = await server.inject({
      method: 'POST',
      url: '/v1/recovery/verify',
      payload: { email_hash: VALID_EMAIL_HASH, code: VALID_CODE },
    });

    expect(res.statusCode).toBe(401);
    expect(res.json()).toEqual({ error: RECOVERY_ERRORS.notFound });
  });

  // ── Schema validation ─────────────────────────────────────────────────────────

  it('returns 400 when code is not 6 digits', async () => {
    const res = await server.inject({
      method: 'POST',
      url: '/v1/recovery/verify',
      payload: { email_hash: VALID_EMAIL_HASH, code: '12345' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('returns 400 when code contains non-digits', async () => {
    const res = await server.inject({
      method: 'POST',
      url: '/v1/recovery/verify',
      payload: { email_hash: VALID_EMAIL_HASH, code: 'abcdef' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('returns 400 when email_hash is invalid', async () => {
    const res = await server.inject({
      method: 'POST',
      url: '/v1/recovery/verify',
      payload: { email_hash: 'invalid', code: VALID_CODE },
    });
    expect(res.statusCode).toBe(400);
  });

  // ── Internal error ────────────────────────────────────────────────────────────

  it('returns 500 on database error', async () => {
    const db = {
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockRejectedValue(new Error('db error')),
          }),
        }),
      }),
      update: vi.fn(),
    } as unknown as RecoveryDb;

    server = await createServer(db);

    const res = await server.inject({
      method: 'POST',
      url: '/v1/recovery/verify',
      payload: { email_hash: VALID_EMAIL_HASH, code: VALID_CODE },
    });

    expect(res.statusCode).toBe(500);
    expect(res.json()).toEqual({ error: RECOVERY_ERRORS.internalError });
  });

  // ── Sliding window ───────────────────────────────────────────────────────────

  it('resets verify_attempts when verify_window_start is outside the window', async () => {
    const oldWindowStart = new Date(Date.now() - 30 * 60 * 1000); // 30 min ago (expired)
    server = await createServer(buildDbMock({
      entry: {
        tmp_code_hash: validHash,
        code_expires_at: FUTURE_DATE,
        verify_attempts: MAX_VERIFY_ATTEMPTS, // would be locked, but window expired
        verify_window_start: oldWindowStart,  // window expired → reset
      },
    }));

    // Should NOT return 429 because the window expired and attempts were reset
    const res = await server.inject({
      method: 'POST',
      url: '/v1/recovery/verify',
      payload: { email_hash: VALID_EMAIL_HASH, code: VALID_CODE },
    });

    // With reset attempts, correct code → 200
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ encrypted_private_key: VALID_ENVELOPE });
  });
});
