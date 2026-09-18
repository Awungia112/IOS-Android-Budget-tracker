import type { FastifyInstance, FastifyRequest } from 'fastify';
import Fastify from 'fastify';
import jwt from '@fastify/jwt';
import { describe, expect, it, vi } from 'vitest';

import type { Db } from '../users/user.repository.js';
import {
  authenticateSession,
  installSessionRenewal,
  SESSION_TOKEN_TTL,
} from './session.js';
import { SESSION_TOKEN_RENEWAL_HEADER } from '@budget/shared/session-token';

const USER_ID = '22222222-2222-4222-8222-222222222222';
const EMAIL_HASH = 'a'.repeat(64);
const VALID_PUBLIC_KEY = 'A'.repeat(43);
const VALID_SESSION_PAYLOAD = {
  sub: EMAIL_HASH,
  typ: 'session',
};

function dbWithUserRows(rows: unknown[]): Db {
  const chain = {
    from: vi.fn(() => chain),
    where: vi.fn(() => chain),
    limit: vi.fn(async () => rows),
  };

  return {
    select: vi.fn(() => chain),
  } as unknown as Db;
}

function serverWithDb(db: Db): FastifyInstance {
  return { db } as unknown as FastifyInstance;
}

function requestWithJwt(payloadOrError: unknown): FastifyRequest {
  return {
    jwtVerify: vi.fn(async () => {
      if (payloadOrError instanceof Error) {
        throw payloadOrError;
      }

      return payloadOrError;
    }),
  } as unknown as FastifyRequest;
}

describe('authenticateSession', () => {
  it('resolves the session token subject to a validated user row', async () => {
    const db = dbWithUserRows([{
      id: USER_ID,
      emailHash: EMAIL_HASH,
      validatedAt: new Date(),
    }]);

    await expect(
      authenticateSession(
        serverWithDb(db),
        requestWithJwt(VALID_SESSION_PAYLOAD),
      ),
    ).resolves.toEqual({
      userId: USER_ID,
      emailHash: EMAIL_HASH,
    });
  });

  it('returns null when JWT verification fails', async () => {
    await expect(
      authenticateSession(
        serverWithDb(dbWithUserRows([])),
        requestWithJwt(new Error('invalid token')),
      ),
    ).resolves.toBeNull();
  });

  it('returns null when the user is missing or unvalidated', async () => {
    await expect(
      authenticateSession(
        serverWithDb(dbWithUserRows([])),
        requestWithJwt(VALID_SESSION_PAYLOAD),
      ),
    ).resolves.toBeNull();

    await expect(
      authenticateSession(
        serverWithDb(dbWithUserRows([{
          id: USER_ID,
          emailHash: EMAIL_HASH,
          validatedAt: null,
        }])),
        requestWithJwt(VALID_SESSION_PAYLOAD),
      ),
    ).resolves.toBeNull();
  });

  it('returns null when a non-session token is presented', async () => {
    await expect(
      authenticateSession(
        serverWithDb(dbWithUserRows([{
          id: USER_ID,
          emailHash: EMAIL_HASH,
          validatedAt: new Date(),
        }])),
        requestWithJwt({
          sub: EMAIL_HASH,
          pk: 'A'.repeat(43),
          typ: 'magic_link',
        }),
      ),
    ).resolves.toBeNull();
  });

  it('skips renewal when the session token carries no pk claim', async () => {
    const request = requestWithJwt(VALID_SESSION_PAYLOAD);

    await expect(
      authenticateSession(
        serverWithDb(dbWithUserRows([{
          id: USER_ID,
          emailHash: EMAIL_HASH,
          validatedAt: new Date(),
        }])),
        request,
      ),
    ).resolves.toEqual({
      userId: USER_ID,
      emailHash: EMAIL_HASH,
    });

    expect(request.renewedSessionToken).toBeUndefined();
  });
});

describe('sliding session renewal (HTTP level)', () => {
  async function buildSessionServer(userRows: unknown[]): Promise<FastifyInstance> {
    const server = Fastify({ logger: false });
    await server.register(jwt, { secret: 'test-secret-for-renewal' });
    server.decorate('db', dbWithUserRows(userRows));
    installSessionRenewal(server);
    server.get('/protected', async (request, reply) => {
      const session = await authenticateSession(server, request);
      if (!session) {
        return reply.code(401).send({ error: 'unauthorized' });
      }
      return { ok: true, userId: session.userId };
    });
    return server;
  }

  function signSessionToken(server: FastifyInstance, expiresIn = SESSION_TOKEN_TTL): string {
    return server.jwt.sign(
      { sub: EMAIL_HASH, typ: 'session', pk: VALID_PUBLIC_KEY },
      { expiresIn },
    );
  }

  it('renews a valid session token with identical claims and a fresh 30-day expiry', async () => {
    const server = await buildSessionServer([{
      id: USER_ID,
      emailHash: EMAIL_HASH,
      validatedAt: new Date(),
    }]);
    const token = signSessionToken(server);

    const res = await server.inject({
      method: 'GET',
      url: '/protected',
      headers: { authorization: `Bearer ${token}` },
    });

    expect(res.statusCode).toBe(200);

    const renewed = res.headers[SESSION_TOKEN_RENEWAL_HEADER];
    expect(typeof renewed).toBe('string');

    const original = server.jwt.verify<{ sub: string; typ: string; pk: string }>(token);
    const refreshed = server.jwt.verify<{
      sub: string;
      typ: string;
      pk: string;
      iat: number;
      exp: number;
    }>(renewed as string);

    // Same identity — only the expiry moves forward.
    expect(refreshed.sub).toBe(original.sub);
    expect(refreshed.typ).toBe(original.typ);
    expect(refreshed.pk).toBe(original.pk);
    expect(refreshed.exp - refreshed.iat).toBe(30 * 24 * 60 * 60);

    await server.close();
  });

  it('does not renew an expired session token — plain 401, no renewal header', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    try {
      const server = await buildSessionServer([{
        id: USER_ID,
        emailHash: EMAIL_HASH,
        validatedAt: new Date(),
      }]);
      const expired = signSessionToken(server, '1ms');
      vi.advanceTimersByTime(5000);

      const res = await server.inject({
        method: 'GET',
        url: '/protected',
        headers: { authorization: `Bearer ${expired}` },
      });

      expect(res.statusCode).toBe(401);
      expect(res.headers[SESSION_TOKEN_RENEWAL_HEADER]).toBeUndefined();

      await server.close();
    } finally {
      vi.useRealTimers();
    }
  });

  it('does not renew when the token is invalid or the user is missing', async () => {
    const server = await buildSessionServer([]);

    const res = await server.inject({
      method: 'GET',
      url: '/protected',
      headers: { authorization: 'Bearer not.a.jwt' },
    });

    expect(res.statusCode).toBe(401);
    expect(res.headers[SESSION_TOKEN_RENEWAL_HEADER]).toBeUndefined();

    await server.close();
  });
});
