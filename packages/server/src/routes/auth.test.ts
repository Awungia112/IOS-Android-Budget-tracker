import type { FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { AUTH_ROUTES } from './auth.js';
import { verifyCode } from '../auth/magic-link.service.js';
import {
  buildDbStub,
  createServer,
  issueNonce,
  replayHeaders,
} from '../test/route-test-helpers.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const VALID_EMAIL_HASH = 'd61fae3e33a858517c1a0385aa4747e4999499491a17abd20282165fd90e5696';
const VALID_PUBLIC_KEY = 'A'.repeat(43);
const VALID_EMAIL = 'user@example.com';
const MAGIC_LINK_TOKEN_TYPE = 'magic_link';
const SESSION_TOKEN_TYPE = 'session';

function signMagicLinkToken(
  server: FastifyInstance,
  expiresIn: string = '24h',
): string {
  return server.jwt.sign(
    {
      sub: VALID_EMAIL_HASH,
      pk: VALID_PUBLIC_KEY,
      typ: MAGIC_LINK_TOKEN_TYPE,
    },
    { expiresIn },
  );
}

// ---------------------------------------------------------------------------
// Service mocks
// ---------------------------------------------------------------------------

const mockUpsertRegistration = vi.fn();
const mockUpdateRegistrationCode = vi.fn();
const mockValidateMagicLinkToken = vi.fn();
const mockConsumeMagicLink = vi.fn();
const mockVerifyRegistrationCode = vi.fn();
const mockRecoverSession = vi.fn();
const mockCheckEmailExists = vi.fn();
const mockSendMagicLinkEmail = vi.fn().mockResolvedValue(undefined);

vi.mock('../auth/auth.service.js', () => ({
  upsertRegistration: (...args: unknown[]) => mockUpsertRegistration(...args),
  updateRegistrationCode: (...args: unknown[]) => mockUpdateRegistrationCode(...args),
  validateMagicLinkToken: (...args: unknown[]) => mockValidateMagicLinkToken(...args),
  consumeMagicLink: (...args: unknown[]) => mockConsumeMagicLink(...args),
  verifyRegistrationCode: (...args: unknown[]) => mockVerifyRegistrationCode(...args),
  recoverSession: (...args: unknown[]) => mockRecoverSession(...args),
  checkEmailExists: (...args: unknown[]) => mockCheckEmailExists(...args),
}));

vi.mock('../auth/email.service.js', () => ({
  sendMagicLinkEmail: (...args: unknown[]) => mockSendMagicLinkEmail(...args),
}));

vi.stubEnv('MAGIC_LINK_SECRET', 'test-secret-for-ci');
vi.stubEnv('BREVO_API_KEY', 'test-key');

// ---------------------------------------------------------------------------
// POST /v1/auth/register
// ---------------------------------------------------------------------------

describe('POST /v1/auth/register', () => {
  let server: FastifyInstance;

  beforeEach(async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    mockUpsertRegistration.mockClear();
    mockUpdateRegistrationCode.mockClear();
    mockSendMagicLinkEmail.mockClear();
    server = await createServer();
  });

  afterEach(async () => {
    await server.close();
    vi.useRealTimers();
  });

  it('enforces replay protection — rejects when nonce is missing', async () => {
    const res = await server.inject({
      method: 'POST',
      url: AUTH_ROUTES.register,
      payload: { email_hash: VALID_EMAIL_HASH, public_key: VALID_PUBLIC_KEY, email: VALID_EMAIL },
    });
    expect(res.statusCode).toBe(401);
  });

  it('rejects an invalid public_key format', async () => {
    const nonce = await issueNonce(server);
    const res = await server.inject({
      method: 'POST',
      url: AUTH_ROUTES.register,
      headers: replayHeaders(nonce),
      payload: { email_hash: VALID_EMAIL_HASH, public_key: 'not-valid', email: VALID_EMAIL },
    });
    expect(res.statusCode).toBe(400);
  });

  it('rejects an invalid email_hash (not 64 hex chars)', async () => {
    const nonce = await issueNonce(server);
    const res = await server.inject({
      method: 'POST',
      url: AUTH_ROUTES.register,
      headers: replayHeaders(nonce),
      payload: { email_hash: 'tooshort', public_key: VALID_PUBLIC_KEY, email: VALID_EMAIL },
    });
    expect(res.statusCode).toBe(400);
  });

  it('rejects a missing email field', async () => {
    const nonce = await issueNonce(server);
    const res = await server.inject({
      method: 'POST',
      url: AUTH_ROUTES.register,
      headers: replayHeaders(nonce),
      payload: { email_hash: VALID_EMAIL_HASH, public_key: VALID_PUBLIC_KEY },
    });
    expect(res.statusCode).toBe(400);
  });

  it('returns 500 when upsertRegistration throws', async () => {
    mockUpsertRegistration.mockRejectedValueOnce(new Error('db error'));
    const nonce = await issueNonce(server);
    const res = await server.inject({
      method: 'POST',
      url: AUTH_ROUTES.register,
      headers: replayHeaders(nonce),
      payload: { email_hash: VALID_EMAIL_HASH, public_key: VALID_PUBLIC_KEY, email: VALID_EMAIL },
    });
    expect(res.statusCode).toBe(500);
    expect(res.json()).toMatchObject({ error: 'registration_failed' });
  });

  it('happy path — upserts user and sends magic-link email', async () => {
    vi.stubEnv('MAGIC_LINK_TEMPLATE_ID', '1');
    mockUpsertRegistration.mockResolvedValueOnce({ status: 'ok' });
    const nonce = await issueNonce(server);
    const res = await server.inject({
      method: 'POST',
      url: AUTH_ROUTES.register,
      headers: replayHeaders(nonce),
      payload: { email_hash: VALID_EMAIL_HASH, public_key: VALID_PUBLIC_KEY, email: VALID_EMAIL },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json()).toMatchObject({ success: true, message: 'Magic link sent' });
    expect(mockSendMagicLinkEmail).toHaveBeenCalledOnce();
    const emailCall = mockSendMagicLinkEmail.mock.calls[0][0];
    expect(emailCall.to).toBe(VALID_EMAIL);
    expect(emailCall.magicLink).toContain('token=');
    const token = new URL(emailCall.magicLink as string).searchParams.get('token');
    expect(token).toBeTruthy();
    expect(server.jwt.verify<{ sub: string; pk: string; typ: string }>(token ?? '')).toMatchObject({
      sub: VALID_EMAIL_HASH,
      pk: VALID_PUBLIC_KEY,
      typ: MAGIC_LINK_TOKEN_TYPE,
    });
    expect(emailCall.code).toMatch(/^\d{6}$/);
    expect(emailCall.templateId).toBe(1);
  });

  it('magic link uses searchParams — base URL with existing query params handled correctly', async () => {
    vi.stubEnv('AUTH_DEEP_LINK_BASE', 'https://example.com/verify?source=email');
    mockUpsertRegistration.mockResolvedValueOnce({ status: 'ok' });
    const nonce = await issueNonce(server);
    await server.inject({
      method: 'POST',
      url: AUTH_ROUTES.register,
      headers: replayHeaders(nonce),
      payload: { email_hash: VALID_EMAIL_HASH, public_key: VALID_PUBLIC_KEY, email: VALID_EMAIL },
    });
    const url = new URL(mockSendMagicLinkEmail.mock.calls[0][0].magicLink as string);
    expect(url.searchParams.get('source')).toBe('email');
    expect(url.searchParams.get('token')).toBeTruthy();
  });

  it('sends sign-in code for an already-validated user', async () => {
    mockUpsertRegistration.mockResolvedValueOnce({ status: 'already_validated', publicKey: VALID_PUBLIC_KEY });
    const nonce = await issueNonce(server);
    const res = await server.inject({
      method: 'POST',
      url: AUTH_ROUTES.register,
      headers: replayHeaders(nonce),
      payload: { email_hash: VALID_EMAIL_HASH, public_key: VALID_PUBLIC_KEY, email: VALID_EMAIL },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ success: true, message: 'Sign-in code sent', email_hash: VALID_EMAIL_HASH });
    expect(mockUpdateRegistrationCode).toHaveBeenCalledOnce();
    expect(mockSendMagicLinkEmail).toHaveBeenCalledOnce();
  });

  it('rejects sign-in with intent=signin for an unregistered email', async () => {
    // No user row exists — mock returns email_not_found
    mockUpsertRegistration.mockResolvedValueOnce({ status: 'email_not_found' });
    const nonce = await issueNonce(server);
    const res = await server.inject({
      method: 'POST',
      url: AUTH_ROUTES.register,
      headers: replayHeaders(nonce),
      payload: {
        email_hash: VALID_EMAIL_HASH,
        public_key: VALID_PUBLIC_KEY,
        email: VALID_EMAIL,
        intent: 'signin',
      },
    });
    const body = JSON.parse(res.body);
    expect(res.statusCode).toBe(404);
    expect(body).toMatchObject({ error: 'email_not_registered' });
    expect(mockUpsertRegistration).toHaveBeenCalled();
    expect(mockSendMagicLinkEmail).not.toHaveBeenCalled();
    expect(mockSendMagicLinkEmail).not.toHaveBeenCalled();
  }, 10000);
});

// ---------------------------------------------------------------------------
// POST /v1/auth/register — store-review account (fixed code, no email)
// ---------------------------------------------------------------------------

describe('POST /v1/auth/register — store-review account', () => {
  const REVIEW_EMAIL = 'storereview@example.com';
  const REVIEW_CODE = '424242';

  let server: FastifyInstance;

  beforeEach(async () => {
    mockUpsertRegistration.mockClear();
    mockUpdateRegistrationCode.mockClear();
    mockSendMagicLinkEmail.mockClear();
    server = await createServer(buildDbStub(), {
      reviewAccountEmail: REVIEW_EMAIL,
      reviewAccountCode: REVIEW_CODE,
    });
  });

  afterEach(async () => {
    await server.close();
  });

  it('stores the fixed code and sends no email (new account, case-insensitive match)', async () => {
    mockUpsertRegistration.mockResolvedValueOnce({ status: 'ok' });
    const nonce = await issueNonce(server);
    const res = await server.inject({
      method: 'POST',
      url: AUTH_ROUTES.register,
      headers: replayHeaders(nonce),
      payload: { public_key: VALID_PUBLIC_KEY, email: 'StoreReview@Example.com' },
    });
    expect(res.statusCode).toBe(201);
    expect(mockSendMagicLinkEmail).not.toHaveBeenCalled();
    // upsertRegistration(db, email_hash, public_key, codeHash, expiresAt, intent)
    const codeHash = mockUpsertRegistration.mock.calls[0][3] as string;
    expect(await verifyCode(REVIEW_CODE, codeHash)).toBe(true);
  }, 15000);

  it('stores the fixed code and sends no email (already-validated sign-in)', async () => {
    mockUpsertRegistration.mockResolvedValueOnce({ status: 'already_validated', publicKey: VALID_PUBLIC_KEY });
    const nonce = await issueNonce(server);
    const res = await server.inject({
      method: 'POST',
      url: AUTH_ROUTES.register,
      headers: replayHeaders(nonce),
      payload: { public_key: VALID_PUBLIC_KEY, email: REVIEW_EMAIL, intent: 'signin' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ success: true });
    expect(mockSendMagicLinkEmail).not.toHaveBeenCalled();
    // updateRegistrationCode(db, email_hash, codeHash, expiresAt)
    const codeHash = mockUpdateRegistrationCode.mock.calls[0][2] as string;
    expect(await verifyCode(REVIEW_CODE, codeHash)).toBe(true);
  }, 15000);

  it('leaves every other email untouched — random code, email sent', async () => {
    vi.stubEnv('MAGIC_LINK_TEMPLATE_ID', '1');
    mockUpsertRegistration.mockResolvedValueOnce({ status: 'ok' });
    const nonce = await issueNonce(server);
    const res = await server.inject({
      method: 'POST',
      url: AUTH_ROUTES.register,
      headers: replayHeaders(nonce),
      payload: { public_key: VALID_PUBLIC_KEY, email: VALID_EMAIL },
    });
    expect(res.statusCode).toBe(201);
    expect(mockSendMagicLinkEmail).toHaveBeenCalledOnce();
    const emailCall = mockSendMagicLinkEmail.mock.calls[0][0];
    expect(emailCall.to).toBe(VALID_EMAIL);
    expect(emailCall.code).toMatch(/^\d{6}$/);
  }, 15000);
});

// ---------------------------------------------------------------------------
// GET /v1/auth/verify — validate only, no writes, no session material
// ---------------------------------------------------------------------------

describe('GET /v1/auth/verify', () => {
  let server: FastifyInstance;

  beforeEach(async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    mockValidateMagicLinkToken.mockClear();
    server = await createServer();
  });

  afterEach(async () => {
    await server.close();
    vi.useRealTimers();
  });

  it('rejects a missing token', async () => {
    const res = await server.inject({ method: 'GET', url: AUTH_ROUTES.verify });
    expect(res.statusCode).toBe(400);
  });

  it('rejects an invalid / tampered token', async () => {
    const res = await server.inject({
      method: 'GET',
      url: `${AUTH_ROUTES.verify}?token=this.is.not.valid`,
    });
    expect(res.statusCode).toBe(401);
    expect(res.json()).toMatchObject({ error: 'invalid_token' });
  });

  it('rejects session JWTs as magic-link tokens', async () => {
    const token = server.jwt.sign(
      { sub: VALID_EMAIL_HASH, typ: SESSION_TOKEN_TYPE },
      { expiresIn: '7d' },
    );
    const res = await server.inject({ method: 'GET', url: `${AUTH_ROUTES.verify}?token=${token}` });
    expect(res.statusCode).toBe(401);
    expect(res.json()).toMatchObject({ error: 'invalid_token' });
    expect(mockValidateMagicLinkToken).not.toHaveBeenCalled();
  });

  it('rejects an expired token', async () => {
    const expired = signMagicLinkToken(server, '1ms');
    vi.advanceTimersByTime(5000);
    const res = await server.inject({
      method: 'GET',
      url: `${AUTH_ROUTES.verify}?token=${expired}`,
    });
    expect(res.statusCode).toBe(401);
    expect(res.json()).toMatchObject({ error: 'token_expired' });
  });

  it('does not require a nonce (GET is exempt from replay protection)', async () => {
    mockValidateMagicLinkToken.mockResolvedValueOnce({ status: 'ok', emailHash: VALID_EMAIL_HASH });
    const token = signMagicLinkToken(server);
    const res = await server.inject({ method: 'GET', url: `${AUTH_ROUTES.verify}?token=${token}` });
    expect(res.statusCode).not.toBe(401);
  });

  it('happy path — returns email_hash only, no session token', async () => {
    mockValidateMagicLinkToken.mockResolvedValueOnce({ status: 'ok', emailHash: VALID_EMAIL_HASH });
    const token = signMagicLinkToken(server);
    const res = await server.inject({ method: 'GET', url: `${AUTH_ROUTES.verify}?token=${token}` });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.email_hash).toBe(VALID_EMAIL_HASH);
    // Must NOT return a session token
    expect(body.token).toBeUndefined();
    // Must NOT have consumed the token
    expect(mockConsumeMagicLink).not.toHaveBeenCalled();
  });

  it('returns 404 when user not found', async () => {
    mockValidateMagicLinkToken.mockResolvedValueOnce({ status: 'user_not_found' });
    const token = signMagicLinkToken(server);
    const res = await server.inject({ method: 'GET', url: `${AUTH_ROUTES.verify}?token=${token}` });
    expect(res.statusCode).toBe(404);
  });

  it('returns 401 for stale key', async () => {
    mockValidateMagicLinkToken.mockResolvedValueOnce({ status: 'token_invalid_for_current_key' });
    const token = signMagicLinkToken(server);
    const res = await server.inject({ method: 'GET', url: `${AUTH_ROUTES.verify}?token=${token}` });
    expect(res.statusCode).toBe(401);
    expect(res.json()).toMatchObject({ error: 'token_invalid_for_current_key' });
  });

  it('returns 401 for already-used token', async () => {
    mockValidateMagicLinkToken.mockResolvedValueOnce({ status: 'token_already_used' });
    const token = signMagicLinkToken(server);
    const res = await server.inject({ method: 'GET', url: `${AUTH_ROUTES.verify}?token=${token}` });
    expect(res.statusCode).toBe(401);
    expect(res.json()).toMatchObject({ error: 'token_already_used' });
  });
});

// ---------------------------------------------------------------------------
// POST /v1/auth/verify — deliberate app call that consumes token + issues session
// ---------------------------------------------------------------------------

describe('POST /v1/auth/verify', () => {
  let server: FastifyInstance;

  beforeEach(async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    mockConsumeMagicLink.mockClear();
    server = await createServer();
  });

  afterEach(async () => {
    await server.close();
    vi.useRealTimers();
  });

  it('enforces replay protection — rejects when nonce is missing', async () => {
    const token = signMagicLinkToken(server);
    const res = await server.inject({
      method: 'POST',
      url: AUTH_ROUTES.verify,
      payload: { token },
    });
    expect(res.statusCode).toBe(401);
    expect(mockConsumeMagicLink).not.toHaveBeenCalled();
  });

  it('rejects an invalid token', async () => {
    const nonce = await issueNonce(server);
    const res = await server.inject({
      method: 'POST',
      url: AUTH_ROUTES.verify,
      headers: replayHeaders(nonce),
      payload: { token: 'not.a.valid.jwt' },
    });
    expect(res.statusCode).toBe(401);
    expect(res.json()).toMatchObject({ error: 'invalid_token' });
  });

  it('rejects session JWTs as magic-link tokens', async () => {
    const token = server.jwt.sign(
      { sub: VALID_EMAIL_HASH, typ: SESSION_TOKEN_TYPE },
      { expiresIn: '7d' },
    );
    const nonce = await issueNonce(server);
    const res = await server.inject({
      method: 'POST',
      url: AUTH_ROUTES.verify,
      headers: replayHeaders(nonce),
      payload: { token },
    });
    expect(res.statusCode).toBe(401);
    expect(res.json()).toMatchObject({ error: 'invalid_token' });
    expect(mockConsumeMagicLink).not.toHaveBeenCalled();
  });

  it('rejects an expired token', async () => {
    const expired = signMagicLinkToken(server, '1ms');
    vi.advanceTimersByTime(5000);
    const nonce = await issueNonce(server);
    const res = await server.inject({
      method: 'POST',
      url: AUTH_ROUTES.verify,
      headers: replayHeaders(nonce),
      payload: { token: expired },
    });
    expect(res.statusCode).toBe(401);
    expect(res.json()).toMatchObject({ error: 'token_expired' });
  });

  it('happy path — consumes token and returns a 30-day session JWT', async () => {
    mockConsumeMagicLink.mockResolvedValueOnce({ status: 'ok', emailHash: VALID_EMAIL_HASH });
    const token = signMagicLinkToken(server);
    const nonce = await issueNonce(server);
    const res = await server.inject({
      method: 'POST',
      url: AUTH_ROUTES.verify,
      headers: replayHeaders(nonce),
      payload: { token },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.user).toMatchObject({ email_hash: VALID_EMAIL_HASH });
    expect(typeof body.token).toBe('string');
    const session = server.jwt.verify<{ sub: string; typ: string; exp: number; iat: number }>(body.token);
    expect(session).toMatchObject({
      sub: VALID_EMAIL_HASH,
      typ: SESSION_TOKEN_TYPE,
    });
    expect(session.exp - session.iat).toBe(30 * 24 * 60 * 60);
    expect(mockConsumeMagicLink).toHaveBeenCalledOnce();
  });

  it('returns 401 for already-consumed token', async () => {
    mockConsumeMagicLink.mockResolvedValueOnce({ status: 'token_already_used' });
    const token = signMagicLinkToken(server);
    const nonce = await issueNonce(server);
    const res = await server.inject({
      method: 'POST',
      url: AUTH_ROUTES.verify,
      headers: replayHeaders(nonce),
      payload: { token },
    });
    expect(res.statusCode).toBe(401);
    expect(res.json()).toMatchObject({ error: 'token_already_used' });
  });

  it('returns 401 for stale key', async () => {
    mockConsumeMagicLink.mockResolvedValueOnce({ status: 'token_invalid_for_current_key' });
    const token = signMagicLinkToken(server);
    const nonce = await issueNonce(server);
    const res = await server.inject({
      method: 'POST',
      url: AUTH_ROUTES.verify,
      headers: replayHeaders(nonce),
      payload: { token },
    });
    expect(res.statusCode).toBe(401);
    expect(res.json()).toMatchObject({ error: 'token_invalid_for_current_key' });
  });

  it('returns 404 when user not found', async () => {
    mockConsumeMagicLink.mockResolvedValueOnce({ status: 'user_not_found' });
    const token = signMagicLinkToken(server);
    const nonce = await issueNonce(server);
    const res = await server.inject({
      method: 'POST',
      url: AUTH_ROUTES.verify,
      headers: replayHeaders(nonce),
      payload: { token },
    });
    expect(res.statusCode).toBe(404);
  });

  it('returns 500 when consumeMagicLink throws', async () => {
    mockConsumeMagicLink.mockRejectedValueOnce(new Error('db error'));
    const token = signMagicLinkToken(server);
    const nonce = await issueNonce(server);
    const res = await server.inject({
      method: 'POST',
      url: AUTH_ROUTES.verify,
      headers: replayHeaders(nonce),
      payload: { token },
    });
    expect(res.statusCode).toBe(500);
    expect(res.json()).toMatchObject({ error: 'internal_error' });
  });
});

// ---------------------------------------------------------------------------
// POST /v1/auth/verify-code
// ---------------------------------------------------------------------------

describe('POST /v1/auth/verify-code', () => {
  let server: FastifyInstance;

  beforeEach(async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    mockVerifyRegistrationCode.mockClear();
    server = await createServer();
  });

  afterEach(async () => {
    await server.close();
    vi.useRealTimers();
  });

  it('enforces replay protection — rejects when nonce is missing', async () => {
    const res = await server.inject({
      method: 'POST',
      url: AUTH_ROUTES.verifyCode,
      payload: { email_hash: VALID_EMAIL_HASH, code: '123456' },
    });
    expect(res.statusCode).toBe(401);
    expect(mockVerifyRegistrationCode).not.toHaveBeenCalled();
  });

  it('happy path — issues a 30-day session JWT for a verified code', async () => {
    mockVerifyRegistrationCode.mockResolvedValueOnce({ status: 'ok', publicKey: VALID_PUBLIC_KEY });
    const nonce = await issueNonce(server);
    const res = await server.inject({
      method: 'POST',
      url: AUTH_ROUTES.verifyCode,
      headers: replayHeaders(nonce),
      payload: { email_hash: VALID_EMAIL_HASH, code: '123456' },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.user).toMatchObject({
      email_hash: VALID_EMAIL_HASH,
      public_key: VALID_PUBLIC_KEY,
    });
    const session = server.jwt.verify<{ sub: string; typ: string; pk: string; exp: number; iat: number }>(body.token);
    expect(session).toMatchObject({
      sub: VALID_EMAIL_HASH,
      typ: SESSION_TOKEN_TYPE,
      pk: VALID_PUBLIC_KEY,
    });
    expect(session.exp - session.iat).toBe(30 * 24 * 60 * 60);
    expect(mockVerifyRegistrationCode).toHaveBeenCalledOnce();
  });

  it('accepts an email instead of a hash and returns 404 for unknown users', async () => {
    mockVerifyRegistrationCode.mockResolvedValueOnce({ status: 'user_not_found' });
    const nonce = await issueNonce(server);
    const res = await server.inject({
      method: 'POST',
      url: AUTH_ROUTES.verifyCode,
      headers: replayHeaders(nonce),
      payload: { email: VALID_EMAIL, code: '123456' },
    });
    expect(res.statusCode).toBe(404);
    expect(res.json()).toMatchObject({ error: 'user_not_found' });
  });

  it('rejects invalid and expired codes', async () => {
    mockVerifyRegistrationCode.mockResolvedValueOnce({ status: 'invalid_code' });
    let nonce = await issueNonce(server);
    const invalid = await server.inject({
      method: 'POST',
      url: AUTH_ROUTES.verifyCode,
      headers: replayHeaders(nonce),
      payload: { email_hash: VALID_EMAIL_HASH, code: '000000' },
    });
    expect(invalid.statusCode).toBe(401);
    expect(invalid.json()).toMatchObject({ error: 'invalid_code' });

    mockVerifyRegistrationCode.mockResolvedValueOnce({ status: 'code_expired' });
    nonce = await issueNonce(server);
    const expired = await server.inject({
      method: 'POST',
      url: AUTH_ROUTES.verifyCode,
      headers: replayHeaders(nonce),
      payload: { email_hash: VALID_EMAIL_HASH, code: '123456' },
    });
    expect(expired.statusCode).toBe(401);
    expect(expired.json()).toMatchObject({ error: 'code_expired' });
  });
});

// ---------------------------------------------------------------------------
// POST /v1/auth/recover-session — issues session JWT for recovered users
// ---------------------------------------------------------------------------

describe('POST /v1/auth/recover-session', () => {
  let server: FastifyInstance;

  beforeEach(async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    mockRecoverSession.mockClear();
    server = await createServer();
  });

  afterEach(async () => {
    await server.close();
    vi.useRealTimers();
  });

  it('enforces replay protection — rejects when nonce is missing', async () => {
    const res = await server.inject({
      method: 'POST',
      url: AUTH_ROUTES.recoverSession,
      payload: { email_hash: VALID_EMAIL_HASH, public_key: VALID_PUBLIC_KEY },
    });
    expect(res.statusCode).toBe(401);
    expect(mockRecoverSession).not.toHaveBeenCalled();
  });

  it('rejects an invalid public_key format', async () => {
    const nonce = await issueNonce(server);
    const res = await server.inject({
      method: 'POST',
      url: AUTH_ROUTES.recoverSession,
      headers: replayHeaders(nonce),
      payload: { email_hash: VALID_EMAIL_HASH, public_key: 'not-valid' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('rejects an invalid email_hash format', async () => {
    const nonce = await issueNonce(server);
    const res = await server.inject({
      method: 'POST',
      url: AUTH_ROUTES.recoverSession,
      headers: replayHeaders(nonce),
      payload: { email_hash: 'tooshort', public_key: VALID_PUBLIC_KEY },
    });
    expect(res.statusCode).toBe(400);
  });

  it('happy path — issues a 30-day session JWT for a validated user', async () => {
    mockRecoverSession.mockResolvedValueOnce({ status: 'ok', emailHash: VALID_EMAIL_HASH });
    const nonce = await issueNonce(server);
    const res = await server.inject({
      method: 'POST',
      url: AUTH_ROUTES.recoverSession,
      headers: replayHeaders(nonce),
      payload: { email_hash: VALID_EMAIL_HASH, public_key: VALID_PUBLIC_KEY },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.user).toMatchObject({
      email_hash: VALID_EMAIL_HASH,
      public_key: VALID_PUBLIC_KEY,
    });
    expect(typeof body.token).toBe('string');
    const session = server.jwt.verify<{ sub: string; typ: string; pk: string; exp: number; iat: number }>(body.token);
    expect(session).toMatchObject({
      sub: VALID_EMAIL_HASH,
      typ: SESSION_TOKEN_TYPE,
      pk: VALID_PUBLIC_KEY,
    });
    expect(session.exp - session.iat).toBe(30 * 24 * 60 * 60);
    expect(mockRecoverSession).toHaveBeenCalledOnce();
  });

  it('returns 404 when user is not found (or not validated)', async () => {
    mockRecoverSession.mockResolvedValueOnce({ status: 'user_not_found' });
    const nonce = await issueNonce(server);
    const res = await server.inject({
      method: 'POST',
      url: AUTH_ROUTES.recoverSession,
      headers: replayHeaders(nonce),
      payload: { email_hash: VALID_EMAIL_HASH, public_key: VALID_PUBLIC_KEY },
    });
    expect(res.statusCode).toBe(404);
    expect(res.json()).toMatchObject({ error: 'user_not_found' });
  });

  it('returns 401 when the recovered public key does not match', async () => {
    mockRecoverSession.mockResolvedValueOnce({ status: 'token_invalid_for_current_key' });
    const nonce = await issueNonce(server);
    const res = await server.inject({
      method: 'POST',
      url: AUTH_ROUTES.recoverSession,
      headers: replayHeaders(nonce),
      payload: { email_hash: VALID_EMAIL_HASH, public_key: VALID_PUBLIC_KEY },
    });
    expect(res.statusCode).toBe(401);
    expect(res.json()).toMatchObject({ error: 'token_invalid_for_current_key' });
  });

  it('returns 500 when recoverSession throws', async () => {
    mockRecoverSession.mockRejectedValueOnce(new Error('db error'));
    const nonce = await issueNonce(server);
    const res = await server.inject({
      method: 'POST',
      url: AUTH_ROUTES.recoverSession,
      headers: replayHeaders(nonce),
      payload: { email_hash: VALID_EMAIL_HASH, public_key: VALID_PUBLIC_KEY },
    });
    expect(res.statusCode).toBe(500);
    expect(res.json()).toMatchObject({ error: 'internal_error' });
  });
});

// ---------------------------------------------------------------------------
// POST /v1/auth/preflight
// ---------------------------------------------------------------------------

describe('POST /v1/auth/preflight', () => {
  let server: FastifyInstance;

  beforeEach(async () => {
    mockCheckEmailExists.mockClear();
    server = await createServer();
  });

  afterEach(async () => {
    await server.close();
  });

  it('returns found + email_hash when the email exists', async () => {
    mockCheckEmailExists.mockResolvedValueOnce(true);
    const res = await server.inject({
      method: 'POST',
      url: AUTH_ROUTES.preflight,
      payload: { email: VALID_EMAIL },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({
      status: 'found',
      email_hash: VALID_EMAIL_HASH,
    });
  });

  it('returns not_found when the email does not exist', async () => {
    mockCheckEmailExists.mockResolvedValueOnce(false);
    const res = await server.inject({
      method: 'POST',
      url: AUTH_ROUTES.preflight,
      payload: { email: VALID_EMAIL },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ status: 'not_found' });
  });

  it('rejects invalid email', async () => {
    const res = await server.inject({
      method: 'POST',
      url: AUTH_ROUTES.preflight,
      payload: { email: 'not-an-email' },
    });
    expect(res.statusCode).toBe(400);
  });
});
