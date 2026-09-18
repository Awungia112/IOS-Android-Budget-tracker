/**
 * Integration tests for DELETE /v1/users/me
 *
 * These tests use mocked dependencies to verify route-level behaviour:
 * - authentication (session JWT verification + user lookup)
 * - the user deletion service
 * - HTTP response codes and bodies under every scenario
 *
 * The recovery-server test for DELETE /v1/recovery/account lives in
 * packages/recovery-server/src/routes/delete-account.test.ts.
 */

import type { FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { USERS_ROUTES } from './users.js';
import {
  createServer,
  issueNonce,
  replayHeaders,
} from '../test/route-test-helpers.js';
import {
  NONCE_TTL_MS,
  REPLAY_PROTECTION_HEADERS,
} from '../security/replay-protection-contract.js';
import type { DeleteUserResult } from '../users/user-deletion.service.js';

// ---------------------------------------------------------------------------
// Mocks — replace real auth and deletion with test doubles
// ---------------------------------------------------------------------------

const mockAuthenticateSession = vi.fn();
const mockDeleteUser = vi.fn<(...args: unknown[]) => Promise<DeleteUserResult>>();

vi.mock('../auth/session.js', () => ({
  authenticateSession: (...args: unknown[]) => mockAuthenticateSession(...args),
  installSessionRenewal: () => undefined,
}));

vi.mock('../users/user-deletion.service.js', () => ({
  deleteUser: (...args: unknown[]) => mockDeleteUser(...args),
}));

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const VALID_USER_ID = '11111111-1111-4111-8111-111111111111';
const VALID_EMAIL_HASH = 'd61fae3e33a858517c1a0385aa4747e4999499491a17abd20282165fd90e5696';

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('DELETE /v1/users/me', () => {
  let server: FastifyInstance;

  beforeEach(async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    mockAuthenticateSession.mockClear();
    mockDeleteUser.mockClear();
    server = await createServer();
  });

  afterEach(async () => {
    await server.close();
    vi.useRealTimers();
  });

  // ── Authentication ────────────────────────────────────────────────────────

  it('returns 401 when no Authorization header is provided', async () => {
    const nonce = await issueNonce(server);
    const res = await server.inject({
      method: 'DELETE',
      url: USERS_ROUTES.deleteAccount,
      headers: replayHeaders(nonce),
    });
    expect(res.statusCode).toBe(401);
    expect(mockDeleteUser).not.toHaveBeenCalled();
  });

  it('returns 401 when authenticateSession returns null', async () => {
    mockAuthenticateSession.mockResolvedValueOnce(null);
    const nonce = await issueNonce(server);
    const res = await server.inject({
      method: 'DELETE',
      url: USERS_ROUTES.deleteAccount,
      headers: {
        authorization: 'Bearer invalid-token',
        ...replayHeaders(nonce),
      },
    });
    expect(res.statusCode).toBe(401);
    expect(mockDeleteUser).not.toHaveBeenCalled();
  });

  it('enforces replay protection — rejects when nonce is missing', async () => {
    const res = await server.inject({
      method: 'DELETE',
      url: USERS_ROUTES.deleteAccount,
      headers: { authorization: 'Bearer some-token' },
    });
    expect(res.statusCode).toBe(401);
    expect(mockDeleteUser).not.toHaveBeenCalled();
  });

  // ── Deletion scenarios ────────────────────────────────────────────────────

  it('returns 200 with { status: "deleted" } on successful deletion', async () => {
    mockAuthenticateSession.mockResolvedValueOnce({
      userId: VALID_USER_ID,
      emailHash: VALID_EMAIL_HASH,
    });
    mockDeleteUser.mockResolvedValueOnce({ status: 'ok' });

    const nonce = await issueNonce(server);

    // Sign a real session JWT so authorization passes schema validation
    const sessionToken = server.jwt.sign({
      sub: VALID_EMAIL_HASH,
      typ: 'session',
    });

    const res = await server.inject({
      method: 'DELETE',
      url: USERS_ROUTES.deleteAccount,
      headers: {
        authorization: `Bearer ${sessionToken}`,
        ...replayHeaders(nonce),
      },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ status: 'deleted' });
    expect(mockAuthenticateSession).toHaveBeenCalledOnce();
    expect(mockDeleteUser).toHaveBeenCalledOnce();
    expect(mockDeleteUser).toHaveBeenCalledWith(
      expect.anything(),
      VALID_USER_ID,
    );
  });

  it('returns 200 with { status: "deleted" } when user not found (idempotent)', async () => {
    mockAuthenticateSession.mockResolvedValueOnce({
      userId: VALID_USER_ID,
      emailHash: VALID_EMAIL_HASH,
    });
    mockDeleteUser.mockResolvedValueOnce({ status: 'user_not_found' });

    const nonce = await issueNonce(server);
    const sessionToken = server.jwt.sign({
      sub: VALID_EMAIL_HASH,
      typ: 'session',
    });

    const res = await server.inject({
      method: 'DELETE',
      url: USERS_ROUTES.deleteAccount,
      headers: {
        authorization: `Bearer ${sessionToken}`,
        ...replayHeaders(nonce),
      },
    });

    // Must still be 200 — the user's goal (to be deleted) is already achieved,
    // and this makes retries after network timeouts safe.
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ status: 'deleted' });
  });

  it('returns 500 when the deletion service reports an error', async () => {
    mockAuthenticateSession.mockResolvedValueOnce({
      userId: VALID_USER_ID,
      emailHash: VALID_EMAIL_HASH,
    });
    mockDeleteUser.mockResolvedValueOnce({
      status: 'error',
      cause: new Error('db connection lost'),
    });

    const nonce = await issueNonce(server);
    const sessionToken = server.jwt.sign({
      sub: VALID_EMAIL_HASH,
      typ: 'session',
    });

    const res = await server.inject({
      method: 'DELETE',
      url: USERS_ROUTES.deleteAccount,
      headers: {
        authorization: `Bearer ${sessionToken}`,
        ...replayHeaders(nonce),
      },
    });

    expect(res.statusCode).toBe(500);
    // The actual error message is NOT exposed to the client
    expect(res.json()).toMatchObject({ error: 'user_deletion_failed' });
  });

  it('returns 500 when the deletion service throws an unexpected exception', async () => {
    mockAuthenticateSession.mockResolvedValueOnce({
      userId: VALID_USER_ID,
      emailHash: VALID_EMAIL_HASH,
    });
    mockDeleteUser.mockRejectedValueOnce(new Error('unexpected crash'));

    const nonce = await issueNonce(server);
    const sessionToken = server.jwt.sign({
      sub: VALID_EMAIL_HASH,
      typ: 'session',
    });

    const res = await server.inject({
      method: 'DELETE',
      url: USERS_ROUTES.deleteAccount,
      headers: {
        authorization: `Bearer ${sessionToken}`,
        ...replayHeaders(nonce),
      },
    });

    expect(res.statusCode).toBe(500);
    expect(res.json()).toMatchObject({ error: 'user_deletion_failed' });
  });

  // ── Validation ────────────────────────────────────────────────────────────

  it('rejects a nonce that expires before the request', async () => {
    mockAuthenticateSession.mockResolvedValueOnce({
      userId: VALID_USER_ID,
      emailHash: VALID_EMAIL_HASH,
    });

    const nonce = await issueNonce(server);

    // Advance time past the NONCE_TTL
    vi.advanceTimersByTime(5 * 60 * 1000 + 1);

    const sessionToken = server.jwt.sign({
      sub: VALID_EMAIL_HASH,
      typ: 'session',
    });

    const res = await server.inject({
      method: 'DELETE',
      url: USERS_ROUTES.deleteAccount,
      headers: {
        authorization: `Bearer ${sessionToken}`,
        [REPLAY_PROTECTION_HEADERS.nonce]: nonce,
        [REPLAY_PROTECTION_HEADERS.timestamp]: String(Date.now()),
      },
    });

    expect(res.statusCode).toBe(401);
    expect(mockDeleteUser).not.toHaveBeenCalled();
  });

  // ── Recovery server cascade ───────────────────────────────────────────────

  it('calls recovery server when recoveryServerUrl is configured', async () => {
    mockAuthenticateSession.mockResolvedValueOnce({
      userId: VALID_USER_ID,
      emailHash: VALID_EMAIL_HASH,
    });
    mockDeleteUser.mockResolvedValueOnce({ status: 'ok' });

    // Mock fetch to intercept the recovery server call
    const mockFetch = vi.fn<typeof fetch>().mockResolvedValueOnce({
      ok: true,
      status: 200,
    } as Response);
    vi.stubGlobal('fetch', mockFetch);

    // Create a server with recoveryServerUrl configured
    const serverWithRecovery = await createServer(undefined, {
      recoveryServerUrl: 'https://recovery.test.local',
    });

    const nonce = await issueNonce(serverWithRecovery);
    const sessionToken = serverWithRecovery.jwt.sign({
      sub: VALID_EMAIL_HASH,
      typ: 'session',
    });

    const res = await serverWithRecovery.inject({
      method: 'DELETE',
      url: USERS_ROUTES.deleteAccount,
      headers: {
        authorization: `Bearer ${sessionToken}`,
        ...replayHeaders(nonce),
      },
    });

    expect(res.statusCode).toBe(200);
    expect(mockFetch).toHaveBeenCalledOnce();
    expect(mockFetch).toHaveBeenCalledWith(
      'https://recovery.test.local/v1/recovery/account',
      expect.objectContaining({
        method: 'DELETE',
        headers: expect.objectContaining({
          'Content-Type': 'application/json',
          Authorization: expect.stringMatching(/^Bearer /),
        }),
        body: JSON.stringify({ email_hash: VALID_EMAIL_HASH }),
      }),
    );

    await serverWithRecovery.close();
    vi.unstubAllGlobals();
  });

  it('does not call recovery server when recoveryServerUrl is not configured', async () => {
    mockAuthenticateSession.mockResolvedValueOnce({
      userId: VALID_USER_ID,
      emailHash: VALID_EMAIL_HASH,
    });
    mockDeleteUser.mockResolvedValueOnce({ status: 'ok' });

    const mockFetch = vi.fn<typeof fetch>();
    vi.stubGlobal('fetch', mockFetch);

    const nonce = await issueNonce(server);
    const sessionToken = server.jwt.sign({
      sub: VALID_EMAIL_HASH,
      typ: 'session',
    });

    const res = await server.inject({
      method: 'DELETE',
      url: USERS_ROUTES.deleteAccount,
      headers: {
        authorization: `Bearer ${sessionToken}`,
        ...replayHeaders(nonce),
      },
    });

    expect(res.statusCode).toBe(200);
    expect(mockFetch).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it('still returns 200 when recovery server is unreachable (best-effort)', async () => {
    mockAuthenticateSession.mockResolvedValueOnce({
      userId: VALID_USER_ID,
      emailHash: VALID_EMAIL_HASH,
    });
    mockDeleteUser.mockResolvedValueOnce({ status: 'ok' });

    // Mock fetch to reject (network error)
    const mockFetch = vi.fn<typeof fetch>().mockRejectedValueOnce(new Error('connection refused'));
    vi.stubGlobal('fetch', mockFetch);

    // Create a server with recoveryServerUrl configured
    const serverWithRecovery = await createServer(undefined, {
      recoveryServerUrl: 'https://recovery.test.local',
    });

    const nonce = await issueNonce(serverWithRecovery);
    const sessionToken = serverWithRecovery.jwt.sign({
      sub: VALID_EMAIL_HASH,
      typ: 'session',
    });

    const res = await serverWithRecovery.inject({
      method: 'DELETE',
      url: USERS_ROUTES.deleteAccount,
      headers: {
        authorization: `Bearer ${sessionToken}`,
        ...replayHeaders(nonce),
      },
    });

    // Must still be 200 — recovery server failure is not fatal
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ status: 'deleted' });

    await serverWithRecovery.close();
    vi.unstubAllGlobals();
  });
});
