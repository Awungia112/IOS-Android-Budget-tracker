import type { FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { buildServer } from './app.js';
import { authenticateSession } from './auth/session.js';
import { SESSION_TOKEN_RENEWAL_HEADER } from '@budget/shared/session-token';
import { InMemoryNonceStore } from './security/nonce-store.js';
import type { Db } from './users/user.repository.js';
import { SERVER_SERVICE_NAME } from './routes/health.js';
import {
  NONCE_ROUTE,
  NONCE_TTL_MS,
  REPLAY_PROTECTION_ERRORS,
  REPLAY_PROTECTION_HEADERS,
  SKIP_REPLAY_PROTECTION_CONFIG,
  TIMESTAMP_TOLERANCE_MS,
  type NonceResponse,
} from './security/replay-protection-contract.js';
import {
  EMAIL_HASH_HEX_LENGTH,
  PUBLIC_KEY_BASE64URL_LENGTH,
} from './users/user-contract.js';

const BASE_TIME = new Date('2026-05-25T12:00:00.000Z');

// Stub required env vars — CI does not set these, tests must not depend on the environment.
vi.stubEnv('MAGIC_LINK_SECRET', 'test-secret-for-ci');

// Valid test fixtures derived from the contract constants
const VALID_EMAIL_HASH = 'a'.repeat(EMAIL_HASH_HEX_LENGTH);
const VALID_PUBLIC_KEY = 'A'.repeat(PUBLIC_KEY_BASE64URL_LENGTH);

/** Minimal db stub — only the methods exercised by the routes under test. */
const mockInsert = vi.fn();
const mockDb = {
  insert: mockInsert,
  execute: vi.fn(),
} as unknown as Db;

function buildTestServer(db: Db = mockDb): Promise<FastifyInstance> {
  return buildServer({
    db,
    // The replay-protection hook is exercised against the in-memory store;
    // the default DbNonceStore needs a real database.
    nonceStore: new InMemoryNonceStore(),
    fastifyOptions: { logger: false },
    env: {
      host: '127.0.0.1',
      port: 3000,
      nodeEnv: 'development',
      databaseUrl: 'postgres://localhost:5432/test',
      emailHashPepper: 'test-pepper',
      emailEncryptionKey: [
        '95fb2ed623392de4', '4b7eed8761e6e414',
        '799e446119bb0437', '72a795d27fdda61d',
      ].join(''),
      magicLinkSecret: 'test-secret-for-ci',
      corsOrigin: true,
      feedbackRecipientPrimary: 'feedback@test.com',
      feedbackRecipientBackup: 'backup-feedback@test.com',
      feedbackRateLimitMax: 10,
      feedbackRateLimitWindowMs: 15 * 60 * 1000,
      appleTeamId: 'ABCDE12345',
      androidSha256Fingerprint: '43:12:D4:27:D7:C4:14:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00',
    },
  });
}

function registerReplayTestRoutes(server: FastifyInstance): void {
  server.post('/test/protected', async () => ({ ok: true }));

  server.post('/test/protected-throws', async () => {
    throw new Error('handler failed');
  });

  server.post(
    '/test/skip-nonce',
    { config: SKIP_REPLAY_PROTECTION_CONFIG },
    async () => ({ ok: true }),
  );
}

async function createTestServer(): Promise<FastifyInstance> {
  const server = await buildTestServer();
  registerReplayTestRoutes(server);
  return server;
}

async function issueNonce(server: FastifyInstance): Promise<NonceResponse> {
  const response = await server.inject({ method: 'GET', url: NONCE_ROUTE });
  return response.json<NonceResponse>();
}

function nonceHeaders(nonce: string, timestamp: number = Date.now()): Record<string, string> {
  return {
    [REPLAY_PROTECTION_HEADERS.nonce]: nonce,
    [REPLAY_PROTECTION_HEADERS.timestamp]: String(timestamp),
  };
}

async function expectTimestampRejectionConsumesNonce(
  server: FastifyInstance,
  nonce: string,
  headers: Record<string, string>,
): Promise<void> {
  const response = await server.inject({ method: 'POST', url: '/test/protected', headers });
  const retryResponse = await server.inject({
    method: 'POST',
    url: '/test/protected',
    headers: nonceHeaders(nonce),
  });

  expect(response.statusCode).toBe(401);
  expect(response.json()).toEqual({ error: REPLAY_PROTECTION_ERRORS.timestampOutOfRange });
  expect(retryResponse.statusCode).toBe(401);
  expect(retryResponse.json()).toEqual({ error: REPLAY_PROTECTION_ERRORS.invalidNonce });
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(BASE_TIME);
  vi.clearAllMocks();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('buildServer', () => {
  describe('GET /health', () => {
    it('returns health status', async () => {
      const server = await buildTestServer();

      try {
        const response = await server.inject({ method: 'GET', url: '/health' });
        const body = response.json();

        expect(response.statusCode).toBe(200);
        expect(body).toMatchObject({ status: 'ok', service: SERVER_SERVICE_NAME });
        expect(typeof body.version).toBe('string');
        expect(new Date(body.timestamp).toISOString()).toBe(body.timestamp);
      } finally {
        await server.close();
      }
    });
  });

  describe('well-known routes', () => {
    it('GET /.well-known/apple-app-site-association returns AASA JSON', async () => {
      const server = await buildTestServer();

      try {
        const response = await server.inject({ method: 'GET', url: '/.well-known/apple-app-site-association' });
        const body = response.json();

        expect(response.statusCode).toBe(200);
        expect(response.headers['content-type']).toContain('application/json');
        expect(body).toMatchObject({
          applinks: {
            details: [
              {
                appIDs: ['ABCDE12345.com.dipbudget.app'],
                components: [{ '/': '/register/verify' }],
              },
            ],
          },
        });
      } finally {
        await server.close();
      }
    });

    it('GET /.well-known/assetlinks.json returns assetlinks JSON', async () => {
      const server = await buildTestServer();

      try {
        const response = await server.inject({ method: 'GET', url: '/.well-known/assetlinks.json' });
        const body = response.json();

        expect(response.statusCode).toBe(200);
        expect(response.headers['content-type']).toContain('application/json');
        expect(body).toHaveLength(1);
        expect(body[0]).toMatchObject({
          relation: ['delegate_permission/common.handle_all_urls'],
          target: {
            namespace: 'android_app',
            package_name: 'com.dipbudget.app',
          },
        });
        // Verify sha256_cert_fingerprints is present and non-empty
        expect(Array.isArray(body[0].target.sha256_cert_fingerprints)).toBe(true);
        expect(body[0].target.sha256_cert_fingerprints[0]).toBeTruthy();
      } finally {
        await server.close();
      }
    });

    it('both well-known routes are public (no auth, no replay protection)', async () => {
      const server = await buildTestServer();

      try {
        const appleRes = await server.inject({ method: 'GET', url: '/.well-known/apple-app-site-association' });
        const androidRes = await server.inject({ method: 'GET', url: '/.well-known/assetlinks.json' });

        // No 401 or 403 for unauthenticated requests
        expect(appleRes.statusCode).toBe(200);
        expect(androidRes.statusCode).toBe(200);
      } finally {
        await server.close();
      }
    });
  });

  describe('POST /users', () => {
    it('returns 201 and registered status on success', async () => {
      mockInsert.mockReturnValue({ values: vi.fn().mockResolvedValue(undefined) });
      const server = await buildTestServer();

      try {
        const response = await server.inject({
          method: 'POST',
          url: '/users',
          payload: { emailHash: VALID_EMAIL_HASH, publicKey: VALID_PUBLIC_KEY },
        });

        expect(response.statusCode).toBe(201);
        expect(response.json()).toEqual({ status: 'registered' });
      } finally {
        await server.close();
      }
    });

    it('returns 409 when email hash already exists (unique violation)', async () => {
      const uniqueViolation = Object.assign(new Error('duplicate key'), { code: '23505' });
      mockInsert.mockReturnValue({ values: vi.fn().mockRejectedValue(uniqueViolation) });
      const server = await buildTestServer();

      try {
        const response = await server.inject({
          method: 'POST',
          url: '/users',
          payload: { emailHash: VALID_EMAIL_HASH, publicKey: VALID_PUBLIC_KEY },
        });

        expect(response.statusCode).toBe(409);
        expect(response.json()).toEqual({ error: 'Email already registered' });
      } finally {
        await server.close();
      }
    });

    it('returns 409 when Drizzle wraps the unique violation in DrizzleQueryError', async () => {
      // Drizzle wraps the pg DatabaseError: the 23505 code is on error.cause, not error itself
      const pgError = Object.assign(new Error('duplicate key'), { code: '23505' });
      const drizzleWrapped = Object.assign(new Error('Failed query'), { cause: pgError });
      mockInsert.mockReturnValue({ values: vi.fn().mockRejectedValue(drizzleWrapped) });
      const server = await buildTestServer();

      try {
        const response = await server.inject({
          method: 'POST',
          url: '/users',
          payload: { emailHash: VALID_EMAIL_HASH, publicKey: VALID_PUBLIC_KEY },
        });

        expect(response.statusCode).toBe(409);
        expect(response.json()).toEqual({ error: 'Email already registered' });
      } finally {
        await server.close();
      }
    });

    it('returns 500 on unexpected database error', async () => {
      mockInsert.mockReturnValue({ values: vi.fn().mockRejectedValue(new Error('connection lost')) });
      const server = await buildTestServer();

      try {
        const response = await server.inject({
          method: 'POST',
          url: '/users',
          payload: { emailHash: VALID_EMAIL_HASH, publicKey: VALID_PUBLIC_KEY },
        });

        expect(response.statusCode).toBe(500);
        expect(response.json()).toEqual({ error: 'Internal server error' });
      } finally {
        await server.close();
      }
    });

    it('returns 400 when emailHash is not 64 hex characters', async () => {
      const server = await buildTestServer();

      try {
        const response = await server.inject({
          method: 'POST',
          url: '/users',
          payload: { emailHash: 'tooshort', publicKey: VALID_PUBLIC_KEY },
        });

        expect(response.statusCode).toBe(400);
      } finally {
        await server.close();
      }
    });

    it('returns 400 when publicKey contains invalid base64url characters', async () => {
      const server = await buildTestServer();

      try {
        const response = await server.inject({
          method: 'POST',
          url: '/users',
          payload: { emailHash: VALID_EMAIL_HASH, publicKey: ' '.repeat(43) },
        });

        expect(response.statusCode).toBe(400);
      } finally {
        await server.close();
      }
    });

    it('returns 400 when required fields are missing', async () => {
      const server = await buildTestServer();

      try {
        const response = await server.inject({
          method: 'POST',
          url: '/users',
          payload: {},
        });

        expect(response.statusCode).toBe(400);
      } finally {
        await server.close();
      }
    });
  });

  describe('nonce / replay protection', () => {
    it('issues a base64url nonce with an ISO expiration timestamp', async () => {
      const server = await buildTestServer();

      try {
        const response = await server.inject({ method: 'GET', url: NONCE_ROUTE });
        const body = response.json<NonceResponse>();

        expect(response.statusCode).toBe(200);
        expect(body.nonce).toMatch(/^[A-Za-z0-9_-]{22}$/);
        expect(body.expires_at).toBe(new Date(BASE_TIME.getTime() + NONCE_TTL_MS).toISOString());
      } finally {
        await server.close();
      }
    });

    it('rejects a mutation when the nonce is missing', async () => {
      const server = await createTestServer();

      try {
        const response = await server.inject({ method: 'POST', url: '/test/protected' });

        expect(response.statusCode).toBe(401);
        expect(response.json()).toEqual({ error: REPLAY_PROTECTION_ERRORS.invalidNonce });
      } finally {
        await server.close();
      }
    });

    it('rejects a mutation when the nonce is unknown', async () => {
      const server = await createTestServer();

      try {
        const response = await server.inject({
          method: 'POST',
          url: '/test/protected',
          headers: nonceHeaders('unknown_nonce'),
        });

        expect(response.statusCode).toBe(401);
        expect(response.json()).toEqual({ error: REPLAY_PROTECTION_ERRORS.invalidNonce });
      } finally {
        await server.close();
      }
    });

    it('rejects a mutation when the nonce is expired', async () => {
      const server = await createTestServer();

      try {
        const { nonce } = await issueNonce(server);
        vi.setSystemTime(BASE_TIME.getTime() + NONCE_TTL_MS + 1);

        const response = await server.inject({
          method: 'POST',
          url: '/test/protected',
          headers: nonceHeaders(nonce),
        });

        expect(response.statusCode).toBe(401);
        expect(response.json()).toEqual({ error: REPLAY_PROTECTION_ERRORS.invalidNonce });
      } finally {
        await server.close();
      }
    });

    it('rejects a mutation when the timestamp is outside the allowed window', async () => {
      const server = await createTestServer();

      try {
        const { nonce } = await issueNonce(server);
        const staleHeaders = nonceHeaders(nonce, Date.now() - TIMESTAMP_TOLERANCE_MS - 1);
        await expectTimestampRejectionConsumesNonce(server, nonce, staleHeaders);
      } finally {
        await server.close();
      }
    });

    it('rejects a mutation when the timestamp is missing', async () => {
      const server = await createTestServer();

      try {
        const { nonce } = await issueNonce(server);
        await expectTimestampRejectionConsumesNonce(server, nonce, {
          [REPLAY_PROTECTION_HEADERS.nonce]: nonce,
        });
      } finally {
        await server.close();
      }
    });

    it('allows a mutation with a valid nonce and timestamp', async () => {
      const server = await createTestServer();

      try {
        const { nonce } = await issueNonce(server);
        const response = await server.inject({
          method: 'POST',
          url: '/test/protected',
          headers: nonceHeaders(nonce),
        });

        expect(response.statusCode).toBe(200);
        expect(response.json()).toEqual({ ok: true });
      } finally {
        await server.close();
      }
    });

    it('rejects a reused nonce', async () => {
      const server = await createTestServer();

      try {
        const { nonce } = await issueNonce(server);
        const headers = nonceHeaders(nonce);

        const firstResponse = await server.inject({ method: 'POST', url: '/test/protected', headers });
        const secondResponse = await server.inject({ method: 'POST', url: '/test/protected', headers });

        expect(firstResponse.statusCode).toBe(200);
        expect(secondResponse.statusCode).toBe(401);
        expect(secondResponse.json()).toEqual({ error: REPLAY_PROTECTION_ERRORS.invalidNonce });
      } finally {
        await server.close();
      }
    });

    it('consumes a valid nonce before the route handler executes', async () => {
      const server = await createTestServer();

      try {
        const { nonce } = await issueNonce(server);
        const headers = nonceHeaders(nonce);

        const throwingResponse = await server.inject({ method: 'POST', url: '/test/protected-throws', headers });
        const retryResponse = await server.inject({ method: 'POST', url: '/test/protected', headers });

        expect(throwingResponse.statusCode).toBe(500);
        expect(retryResponse.statusCode).toBe(401);
        expect(retryResponse.json()).toEqual({ error: REPLAY_PROTECTION_ERRORS.invalidNonce });
      } finally {
        await server.close();
      }
    });

    it('allows a route to opt out with skipNonce config', async () => {
      const server = await createTestServer();

      try {
        const response = await server.inject({ method: 'POST', url: '/test/skip-nonce' });

        expect(response.statusCode).toBe(200);
        expect(response.json()).toEqual({ ok: true });
      } finally {
        await server.close();
      }
    });
  });

  describe('session renewal wiring (x-auth-token)', () => {
    const RENEWAL_USER_ID = '22222222-2222-4222-8222-222222222222';
    const RENEWAL_EMAIL_HASH = 'a'.repeat(64);
    const RENEWAL_PUBLIC_KEY = 'A'.repeat(43);

    function serverWithSessionUser(): Promise<FastifyInstance> {
      const chain = {
        from: vi.fn(() => chain),
        where: vi.fn(() => chain),
        limit: vi.fn(async () => [{
          id: RENEWAL_USER_ID,
          emailHash: RENEWAL_EMAIL_HASH,
          validatedAt: new Date(),
        }]),
      };

      return buildTestServer({
        select: vi.fn(() => chain),
      } as unknown as Db);
    }

    function registerSessionRoute(server: FastifyInstance): void {
      server.get('/test/session-protected', async (request, reply) => {
        const session = await authenticateSession(server, request);
        if (!session) {
          return reply.code(401).send({ error: 'unauthorized' });
        }
        return { ok: true, userId: session.userId };
      });
    }

    it('renews a valid session token through the built server, resetting expiry to 30 days', async () => {
      const server = await serverWithSessionUser();
      registerSessionRoute(server);

      try {
        const token = server.jwt.sign(
          { sub: RENEWAL_EMAIL_HASH, typ: 'session', pk: RENEWAL_PUBLIC_KEY },
          { expiresIn: '1h' },
        );
        const response = await server.inject({
          method: 'GET',
          url: '/test/session-protected',
          headers: { authorization: `Bearer ${token}` },
        });

        expect(response.statusCode).toBe(200);

        const renewed = response.headers[SESSION_TOKEN_RENEWAL_HEADER];
        expect(typeof renewed).toBe('string');

        const original = server.jwt.verify<{ sub: string; typ: string; pk: string }>(token);
        const refreshed = server.jwt.verify<{
          sub: string;
          typ: string;
          pk: string;
          exp: number;
          iat: number;
        }>(renewed as string);

        // Claims are preserved verbatim; only the expiry moves to a fresh 30-day window.
        expect(refreshed.sub).toBe(original.sub);
        expect(refreshed.typ).toBe(original.typ);
        expect(refreshed.pk).toBe(original.pk);
        expect(refreshed.exp - refreshed.iat).toBe(30 * 24 * 60 * 60);
      } finally {
        await server.close();
      }
    });

    it('does not attach x-auth-token to unauthenticated responses', async () => {
      const server = await serverWithSessionUser();
      registerSessionRoute(server);

      try {
        const response = await server.inject({ method: 'GET', url: '/test/session-protected' });

        expect(response.statusCode).toBe(401);
        expect(response.headers[SESSION_TOKEN_RENEWAL_HEADER]).toBeUndefined();
      } finally {
        await server.close();
      }
    });
  });

  describe('CORS', () => {
    it('exposes the x-auth-token renewal header to browsers', async () => {
      const server = await buildTestServer();

      try {
        const response = await server.inject({
          method: 'GET',
          url: '/health',
          headers: { origin: 'https://app.example.test' },
        });

        expect(response.statusCode).toBe(200);
        expect(response.headers['access-control-expose-headers']).toContain(
          SESSION_TOKEN_RENEWAL_HEADER,
        );
      } finally {
        await server.close();
      }
    });
  });
});
