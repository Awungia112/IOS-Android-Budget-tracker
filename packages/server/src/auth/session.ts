import { eq } from 'drizzle-orm';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { SESSION_TOKEN_RENEWAL_HEADER } from '@budget/shared/session-token';

import { users } from '../db/schema.js';

export interface AuthenticatedSession {
  userId: string;
  emailHash: string;
}

interface SessionJwtPayload {
  sub?: unknown;
  typ?: unknown;
  pk?: unknown;
}

/**
 * Lifetime of issued session tokens, used with sliding expiration.
 *
 * Every request that authenticates successfully with a still-valid session
 * token causes the server to re-sign it with this TTL measured from "now",
 * so active users never hit the wall. A token only becomes a dead end when
 * it is genuinely unused for a full window.
 */
export const SESSION_TOKEN_TTL = '30d';

declare module 'fastify' {
  interface FastifyRequest {
    /**
     * Set by authenticateSession when a valid session token should be
     * renewed. Consumed by installSessionRenewal's onSend hook.
     */
    renewedSessionToken?: string;
  }
}

export async function authenticateSession(
  server: FastifyInstance,
  request: FastifyRequest,
): Promise<AuthenticatedSession | null> {
  let payload: SessionJwtPayload;

  try {
    payload = await request.jwtVerify<SessionJwtPayload>();
  } catch {
    return null;
  }

  if (payload.typ !== 'session') {
    return null;
  }

  if (typeof payload.sub !== 'string' || payload.sub.length === 0) {
    return null;
  }

  const [user] = await server.db
    .select({
      id: users.id,
      emailHash: users.emailHash,
      validatedAt: users.validatedAt,
    })
    .from(users)
    .where(eq(users.emailHash, payload.sub))
    .limit(1);

  if (!user?.validatedAt) {
    return null;
  }

  // Sliding expiration: re-sign the token with the identical claims (sub/typ/pk)
  // and a fresh exp. The renewed token is handed back to the client via the
  // x-auth-token response header. Skipped when pk is missing so we never mint
  // a token with different claims than the one the user presented.
  if (typeof payload.pk === 'string' && payload.pk.length > 0) {
    request.renewedSessionToken = server.jwt.sign(
      { sub: payload.sub, typ: payload.typ, pk: payload.pk },
      { expiresIn: SESSION_TOKEN_TTL },
    );
  }

  return {
    userId: user.id,
    emailHash: user.emailHash,
  };
}

/**
 * Attach the renewed session token (when authenticateSession produced one)
 * to every response via the x-auth-token header. Because the token is only
 * ever set after a successful verification, expired or invalid tokens are
 * never renewed — they keep their plain 401.
 */
export function installSessionRenewal(server: FastifyInstance): void {
  server.addHook('onSend', async (request, reply) => {
    if (request.renewedSessionToken) {
      reply.header(SESSION_TOKEN_RENEWAL_HEADER, request.renewedSessionToken);
    }
  });
}
