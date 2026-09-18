import type { FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { buildServer } from '../app.js';
import type { RecoveryDb } from '../db/recovery.repository.js';
import { ENROLL_ERRORS, RECOVERY_ALG } from './enroll-contract.js';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const VALID_EMAIL_HASH = 'a'.repeat(64);

// Lengths match the real libsodium constants:
//   kdf_salt  → crypto_pwhash_SALTBYTES (16 bytes) → 22 base64url chars
//   nonce     → crypto_secretbox_NONCEBYTES (24 bytes) → 32 base64url chars
//   ciphertext → 32-byte key + 16-byte MAC = 48 bytes → 64 base64url chars
const VALID_ENVELOPE = {
  v: 1 as const,
  alg: RECOVERY_ALG,
  kdf_salt: 'AAAAAAAAAAAAAAAAAAAAAA',            // 22 chars
  kdf_ops: 2,
  kdf_mem: 67108864,
  nonce: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',     // 32 chars
  ciphertext: 'A'.repeat(64),                    // 64 chars (minimum valid length)
};

// ─── DB mock ──────────────────────────────────────────────────────────────────

function buildDbMock(opts: {
  shouldFail?: boolean;
  alreadyEnrolled?: boolean;
} = {}): RecoveryDb {
  let insertError: Error | null = null;

  if (opts.alreadyEnrolled) {
    // Simulate PostgreSQL unique_violation (23505)
    insertError = Object.assign(new Error('duplicate key'), { code: '23505' });
  } else if (opts.shouldFail) {
    insertError = new Error('db error');
  }

  return {
    insert: vi.fn().mockReturnValue({
      values: insertError
        ? vi.fn().mockRejectedValue(insertError)
        : vi.fn().mockResolvedValue(undefined),
    }),
  } as unknown as RecoveryDb;
}

// ─── Server factory ───────────────────────────────────────────────────────────

function createServer(db: RecoveryDb = buildDbMock()): Promise<FastifyInstance> {
  return buildServer({ db, fastifyOptions: { logger: false } });
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('POST /v1/recovery/enroll', () => {
  let server: FastifyInstance;

  beforeEach(async () => {
    server = await createServer();
  });

  afterEach(async () => {
    await server.close();
  });

  it('returns 200 and enrolled status on success', async () => {
    const res = await server.inject({
      method: 'POST',
      url: '/v1/recovery/enroll',
      payload: {
        email_hash: VALID_EMAIL_HASH,
        encrypted_private_key: VALID_ENVELOPE,
      },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ status: 'enrolled' });
  });

  it('inserts the correct payload into the database', async () => {
    const db = buildDbMock();
    server = await createServer(db);

    await server.inject({
      method: 'POST',
      url: '/v1/recovery/enroll',
      payload: {
        email_hash: VALID_EMAIL_HASH,
        encrypted_private_key: VALID_ENVELOPE,
      },
    });

    expect(db.insert).toHaveBeenCalledOnce();

    const valuesMock = (db.insert as ReturnType<typeof vi.fn>).mock.results[0].value.values as ReturnType<typeof vi.fn>;
    expect(valuesMock).toHaveBeenCalledOnce();
    expect(valuesMock).toHaveBeenCalledWith({
      email_hash: VALID_EMAIL_HASH,
      encrypted_private_key: VALID_ENVELOPE,
    });
  });

  it('returns 409 when email_hash is already enrolled (insert-only semantics)', async () => {
    // The route is INSERT-ONLY — re-enrollment requires an authenticated endpoint.
    // A unique_violation from the DB is mapped to 409 so callers can distinguish
    // "duplicate" from "server error".
    server = await createServer(buildDbMock({ alreadyEnrolled: true }));

    const res = await server.inject({
      method: 'POST',
      url: '/v1/recovery/enroll',
      payload: {
        email_hash: VALID_EMAIL_HASH,
        encrypted_private_key: VALID_ENVELOPE,
      },
    });

    expect(res.statusCode).toBe(409);
    expect(res.json()).toEqual({ error: ENROLL_ERRORS.alreadyEnrolled });
  });

  it('returns 409 when Drizzle wraps the unique violation in DrizzleQueryError', async () => {
    const pgError = Object.assign(new Error('duplicate key'), { code: '23505' });
    const drizzleWrapped = Object.assign(new Error('Failed query'), { cause: pgError });

    const db = {
      insert: vi.fn().mockReturnValue({
        values: vi.fn().mockRejectedValue(drizzleWrapped),
      }),
    } as unknown as RecoveryDb;

    server = await createServer(db);

    const res = await server.inject({
      method: 'POST',
      url: '/v1/recovery/enroll',
      payload: {
        email_hash: VALID_EMAIL_HASH,
        encrypted_private_key: VALID_ENVELOPE,
      },
    });

    expect(res.statusCode).toBe(409);
    expect(res.json()).toEqual({ error: ENROLL_ERRORS.alreadyEnrolled });
  });

  it('returns 400 when email_hash is not 64 hex chars', async () => {
    const res = await server.inject({
      method: 'POST',
      url: '/v1/recovery/enroll',
      payload: { email_hash: 'tooshort', encrypted_private_key: VALID_ENVELOPE },
    });
    expect(res.statusCode).toBe(400);
  });

  it('returns 400 when email_hash contains uppercase hex', async () => {
    const res = await server.inject({
      method: 'POST',
      url: '/v1/recovery/enroll',
      payload: { email_hash: 'A'.repeat(64), encrypted_private_key: VALID_ENVELOPE },
    });
    expect(res.statusCode).toBe(400);
  });

  it('returns 400 when encrypted_private_key is missing required fields', async () => {
    const { kdf_salt: _omit, ...incompleteEnvelope } = VALID_ENVELOPE;
    const res = await server.inject({
      method: 'POST',
      url: '/v1/recovery/enroll',
      payload: { email_hash: VALID_EMAIL_HASH, encrypted_private_key: incompleteEnvelope },
    });
    expect(res.statusCode).toBe(400);
  });

  it('returns 400 when alg is not the expected value', async () => {
    const res = await server.inject({
      method: 'POST',
      url: '/v1/recovery/enroll',
      payload: { email_hash: VALID_EMAIL_HASH, encrypted_private_key: { ...VALID_ENVELOPE, alg: 'aes-256-gcm' } },
    });
    expect(res.statusCode).toBe(400);
  });

  it('returns 400 when v is not 1', async () => {
    const res = await server.inject({
      method: 'POST',
      url: '/v1/recovery/enroll',
      payload: { email_hash: VALID_EMAIL_HASH, encrypted_private_key: { ...VALID_ENVELOPE, v: 2 } },
    });
    expect(res.statusCode).toBe(400);
  });

  it('returns 400 when body is missing entirely', async () => {
    const res = await server.inject({ method: 'POST', url: '/v1/recovery/enroll', payload: {} });
    expect(res.statusCode).toBe(400);
  });

  it('returns 400 when kdf_salt is too short (below minLength)', async () => {
    const res = await server.inject({
      method: 'POST',
      url: '/v1/recovery/enroll',
      payload: { email_hash: VALID_EMAIL_HASH, encrypted_private_key: { ...VALID_ENVELOPE, kdf_salt: 'short' } },
    });
    expect(res.statusCode).toBe(400);
  });

  it('returns 400 when nonce is too short (below minLength)', async () => {
    const res = await server.inject({
      method: 'POST',
      url: '/v1/recovery/enroll',
      payload: { email_hash: VALID_EMAIL_HASH, encrypted_private_key: { ...VALID_ENVELOPE, nonce: 'tooshort' } },
    });
    expect(res.statusCode).toBe(400);
  });

  it('returns 400 when kdf_ops exceeds the maximum allowed value', async () => {
    const res = await server.inject({
      method: 'POST',
      url: '/v1/recovery/enroll',
      payload: { email_hash: VALID_EMAIL_HASH, encrypted_private_key: { ...VALID_ENVELOPE, kdf_ops: 100_000_001 } },
    });
    expect(res.statusCode).toBe(400);
  });

  it('returns 400 when kdf_mem exceeds the maximum allowed value', async () => {
    const res = await server.inject({
      method: 'POST',
      url: '/v1/recovery/enroll',
      payload: { email_hash: VALID_EMAIL_HASH, encrypted_private_key: { ...VALID_ENVELOPE, kdf_mem: 1_073_741_825 } },
    });
    expect(res.statusCode).toBe(400);
  });

  it('returns 400 when ciphertext is too short (below minLength)', async () => {
    const res = await server.inject({
      method: 'POST',
      url: '/v1/recovery/enroll',
      payload: { email_hash: VALID_EMAIL_HASH, encrypted_private_key: { ...VALID_ENVELOPE, ciphertext: 'tooshort' } },
    });
    expect(res.statusCode).toBe(400);
  });

  it('returns 400 when ciphertext exceeds maxLength (abuse / oversized payload)', async () => {
    const res = await server.inject({
      method: 'POST',
      url: '/v1/recovery/enroll',
      payload: { email_hash: VALID_EMAIL_HASH, encrypted_private_key: { ...VALID_ENVELOPE, ciphertext: 'A'.repeat(81) } },
    });
    expect(res.statusCode).toBe(400);
  });

  it('returns 500 on unexpected database error', async () => {
    server = await createServer(buildDbMock({ shouldFail: true }));

    const res = await server.inject({
      method: 'POST',
      url: '/v1/recovery/enroll',
      payload: { email_hash: VALID_EMAIL_HASH, encrypted_private_key: VALID_ENVELOPE },
    });

    expect(res.statusCode).toBe(500);
    expect(res.json()).toEqual({ error: ENROLL_ERRORS.internalError });
  });

  it('strips unknown extra fields in encrypted_private_key (additionalProperties: false removes, not rejects)', async () => {
    const res = await server.inject({
      method: 'POST',
      url: '/v1/recovery/enroll',
      payload: {
        email_hash: VALID_EMAIL_HASH,
        encrypted_private_key: { ...VALID_ENVELOPE, unknown_field: 'stripped-not-rejected' },
      },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ status: 'enrolled' });
  });
});
