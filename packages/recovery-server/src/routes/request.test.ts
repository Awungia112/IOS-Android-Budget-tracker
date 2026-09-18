import type { FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { buildServer } from '../app.js';
import type { RecoveryDb } from '../db/recovery.repository.js';
import type { BrevoClient } from '../email/brevo.js';
import { requestRateLimitMap } from './request.js';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const VALID_EMAIL_HASH = '0a1ddbd0abbb98427541eacee515b5176ff05d9a5b9f0f69fa250ae40636629e';
const VALID_EMAIL = 'user@example.com';

// ─── DB mock ──────────────────────────────────────────────────────────────────

function buildDbMock(opts: {
  entryExists?: boolean;
  requestCount?: number;
  windowStartMsAgo?: number; // how old the current window is
  shouldFail?: boolean;
} = {}): RecoveryDb {
  const {
    entryExists = true,
    requestCount = 0,
    windowStartMsAgo = 0,
    shouldFail = false,
  } = opts;

  const entry = entryExists
    ? {
        id: 'some-uuid',
        email_hash: VALID_EMAIL_HASH,
        request_count: requestCount,
        request_window_start: windowStartMsAgo != null
          ? new Date(Date.now() - windowStartMsAgo)
          : null,
        verify_attempts: 0,
        tmp_code_hash: null,
        code_expires_at: null,
        code_used_at: null,
        enrolled_at: new Date(),
        encrypted_private_key: {} as never,
      }
    : null;

  const limitMock = shouldFail
    ? vi.fn().mockRejectedValue(new Error('db error'))
    : vi.fn().mockResolvedValue(entry ? [entry] : []);

  const whereMockForSelect = vi.fn().mockReturnValue({ limit: limitMock });
  const fromMockForSelect = vi.fn().mockReturnValue({ where: whereMockForSelect });
  const selectMock = vi.fn().mockReturnValue({ from: fromMockForSelect });

  const setMock = vi.fn().mockReturnValue({
    where: vi.fn().mockResolvedValue(undefined),
  });
  const updateMock = vi.fn().mockReturnValue({ set: setMock });

  return { select: selectMock, update: updateMock } as unknown as RecoveryDb;
}

function buildBrevoMock(opts: { shouldFail?: boolean } = {}): BrevoClient {
  return {
    sendRecoveryCode: opts.shouldFail
      ? vi.fn().mockRejectedValue(new Error('brevo error'))
      : vi.fn().mockResolvedValue(undefined),
    sendNoop: vi.fn().mockResolvedValue(undefined),
  };
}

function createServer(
  db: RecoveryDb = buildDbMock(),
  brevo: BrevoClient = buildBrevoMock(),
): Promise<FastifyInstance> {
  return buildServer({ db, brevo, fastifyOptions: { logger: false } });
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('POST /v1/recovery/request', () => {
  let server: FastifyInstance;

  beforeEach(async () => {
    requestRateLimitMap.clear();
    server = await createServer();
  });

  afterEach(async () => {
    await server.close();
  });

  it('returns 200 and sent status on happy path', async () => {
    const res = await server.inject({
      method: 'POST',
      url: '/v1/recovery/request',
      payload: { email_hash: VALID_EMAIL_HASH, email: VALID_EMAIL },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ status: 'sent', email_hash: expect.any(String), registered: true });
  });

  it('sends the code via brevo', async () => {
    const brevo = buildBrevoMock();
    server = await createServer(buildDbMock(), brevo);

    await server.inject({
      method: 'POST',
      url: '/v1/recovery/request',
      payload: { email_hash: VALID_EMAIL_HASH, email: VALID_EMAIL },
    });

    expect(brevo.sendRecoveryCode).toHaveBeenCalledOnce();
    const call = (brevo.sendRecoveryCode as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(call.toEmail).toBe(VALID_EMAIL);
    expect(call.code).toMatch(/^\d{6}$/);
  });

  it('returns 200 even when Brevo fails — code is already stored', async () => {
    server = await createServer(buildDbMock(), buildBrevoMock({ shouldFail: true }));

    const res = await server.inject({
      method: 'POST',
      url: '/v1/recovery/request',
      payload: { email_hash: VALID_EMAIL_HASH, email: VALID_EMAIL },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ status: 'sent', email_hash: expect.any(String), registered: true });
  });

  it('returns 200 for unknown email_hash — prevents account enumeration', async () => {
    server = await createServer(buildDbMock({ entryExists: false }));

    const res = await server.inject({
      method: 'POST',
      url: '/v1/recovery/request',
      payload: { email_hash: VALID_EMAIL_HASH, email: VALID_EMAIL },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ status: 'sent', email_hash: expect.any(String), registered: false });
  });

  it('returns 200 (not 429) when rate limit exceeded — prevents enrollment leakage', async () => {
    // Pre-fill the in-process map to the limit for this hash
    requestRateLimitMap.set(VALID_EMAIL_HASH, { count: 3, windowStart: Date.now() });

    const res = await server.inject({
      method: 'POST',
      url: '/v1/recovery/request',
      payload: { email_hash: VALID_EMAIL_HASH, email: VALID_EMAIL },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ status: 'sent', email_hash: expect.any(String), registered: true });
  });

  it('rate limits unknown hashes the same as enrolled ones', async () => {
    // Unknown hash (DB returns no entry) — pre-fill the map to the limit
    server = await createServer(buildDbMock({ entryExists: false }));
    requestRateLimitMap.set(VALID_EMAIL_HASH, { count: 3, windowStart: Date.now() });

    const res = await server.inject({
      method: 'POST',
      url: '/v1/recovery/request',
      payload: { email_hash: VALID_EMAIL_HASH, email: VALID_EMAIL },
    });

    // Rate limit applies to unknown hashes too — closes the bypass
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ status: 'sent', email_hash: expect.any(String), registered: false });
  });

  it('resets rate limit after window expires', async () => {
    // Window started 61 minutes ago — expired, next request should succeed
    requestRateLimitMap.set(VALID_EMAIL_HASH, {
      count: 3,
      windowStart: Date.now() - 61 * 60 * 1000,
    });

    const res = await server.inject({
      method: 'POST',
      url: '/v1/recovery/request',
      payload: { email_hash: VALID_EMAIL_HASH, email: VALID_EMAIL },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ status: 'sent', email_hash: expect.any(String), registered: true });
    // Counter reset to 1 for new window
    expect(requestRateLimitMap.get(VALID_EMAIL_HASH)?.count).toBe(1);
  });



  it('strips unknown extra fields like email_hash instead of rejecting', async () => {
    const res = await server.inject({
      method: 'POST',
      url: '/v1/recovery/request',
      payload: { email_hash: 'invalid', email: VALID_EMAIL },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ status: 'sent', email_hash: expect.any(String), registered: true });
  });

  it('returns 400 when email is missing', async () => {
    const res = await server.inject({
      method: 'POST',
      url: '/v1/recovery/request',
      payload: { email_hash: VALID_EMAIL_HASH },
    });
    expect(res.statusCode).toBe(400);
  });

  it('returns 500 on database error', async () => {
    server = await createServer(buildDbMock({ shouldFail: true }));

    const res = await server.inject({
      method: 'POST',
      url: '/v1/recovery/request',
      payload: { email_hash: VALID_EMAIL_HASH, email: VALID_EMAIL },
    });

    expect(res.statusCode).toBe(500);
  });
});
