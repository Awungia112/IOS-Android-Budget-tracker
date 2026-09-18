import type { FastifyInstance, FastifyPluginAsync } from 'fastify';

import type { Db } from '../users/user.repository.js';
import { registerPendingUser } from '../users/registration.service.js';
import { deleteUser } from '../users/user-deletion.service.js';
import {
  getRecipientPublicKey,
} from '../users/user.repository.js';
import {
  ERROR_CODES,
  ERROR_RESPONSE_SCHEMA,
  HTTP_STATUS,
} from '../http/http-contract.js';
import { SKIP_REPLAY_PROTECTION_CONFIG } from '../security/replay-protection-contract.js';
import {
  EMAIL_HASH_PATTERN,
  PUBLIC_KEY_PATTERN,
} from '../users/user-contract.js';
import { authenticateSession } from '../auth/session.js';
import { and, eq, isNull } from 'drizzle-orm';
import * as schema from '../db/schema.js';
import { encryptEmail } from '../crypto/email-encryption.js';

/**
 * Best-effort deletion of the recovery entry on the recovery server.
 *
 * Signs a short-lived session JWT (same secret as the main server's
 * MAGIC_LINK_SECRET, which the recovery server knows as RECOVERY_JWT_SECRET)
 * and sends a DELETE /v1/recovery/account request.
 *
 * Errors are logged but never propagated to the caller — the main account
 * deletion already succeeded and we don't want to block the response for a
 * secondary concern.
 */
async function deleteRecoveryEntry(
  server: FastifyInstance,
  emailHash: string,
): Promise<void> {
  const recoveryUrl = server.env.recoveryServerUrl;
  if (!recoveryUrl) {
    return;
  }

  try {
    const token = server.jwt.sign(
      { sub: emailHash, typ: 'session' },
      { expiresIn: '30s' },
    );

    const response = await fetch(`${recoveryUrl}/v1/recovery/account`, {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ email_hash: emailHash }),
      signal: AbortSignal.timeout(5_000),
    });

    if (!response.ok) {
      server.log.warn(
        { status: response.status, emailHash },
        'Recovery server returned non-ok status during account deletion',
      );
    }
  } catch (error) {
    server.log.error(error, 'Failed to delete recovery entry on recovery server');
  }
}

export interface UsersRouteOptions {
  db: Db;
}

export const USERS_ROUTES = {
  register: '/users',
  publicKey: '/v1/users/:user_id/public-key',
  updateDisplayEmail: '/v1/users/me/display-email',
  deleteAccount: '/v1/users/me',
} as const;

export const usersRoutes: FastifyPluginAsync<UsersRouteOptions> = async (server, { db }) => {
  server.post<{
    Body: { emailHash: string; publicKey: string };
  }>(
    USERS_ROUTES.register,
    {
      config: SKIP_REPLAY_PROTECTION_CONFIG,
      schema: {
        body: {
          type: 'object',
          required: ['emailHash', 'publicKey'],
          properties: {
            emailHash: { type: 'string', pattern: EMAIL_HASH_PATTERN },
            publicKey: { type: 'string', pattern: PUBLIC_KEY_PATTERN },
          },
        },
        response: {
          [HTTP_STATUS.created]: {
            type: 'object',
            required: ['status'],
            properties: {
              status: { type: 'string' },
            },
          },
          [HTTP_STATUS.conflict]: ERROR_RESPONSE_SCHEMA,
          [HTTP_STATUS.internalServerError]: ERROR_RESPONSE_SCHEMA,
        },
      },
    },
    async (request, reply) => {
      const result = await registerPendingUser(db, request.body);

      if (result.success) {
        return reply.code(HTTP_STATUS.created).send({ status: 'registered' });
      }

      const failure = result as Extract<typeof result, { success: false }>;
      if (failure.reason === 'duplicate') {
        return reply.code(HTTP_STATUS.conflict).send({ error: 'Email already registered' });
      }

      server.log.error(failure.cause, 'Failed to register user');
      return reply
        .code(HTTP_STATUS.internalServerError)
        .send({ error: 'Internal server error' });
    },
  );

  server.get(
    USERS_ROUTES.publicKey,
    {
      config: { skipNonce: true },
      schema: {
        params: {
          type: 'object',
          required: ['user_id'],
          properties: { user_id: { type: 'string', pattern: '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' } },
        },
        response: {
          [HTTP_STATUS.ok]: {
            type: 'object',
            required: ['public_key'],
            properties: {
              public_key: { type: 'string', pattern: PUBLIC_KEY_PATTERN },
            },
          },
          [HTTP_STATUS.notFound]: ERROR_RESPONSE_SCHEMA,
        },
      },
    },
    async (request, reply) => {
      const { user_id } = request.params as { user_id: string };
      const result = await getRecipientPublicKey(db, user_id);

      if (result.status === 'not_found') {
        return reply.code(HTTP_STATUS.notFound).send({ error: ERROR_CODES.userNotFound });
      }

      return { public_key: result.publicKey };
    },
  );

  // PATCH /v1/users/me/display-email
  // Lets an authenticated user register their own plaintext email for display
  // in sharing settings. Called once on first login by the client.
  server.patch(
    USERS_ROUTES.updateDisplayEmail,
    {
      schema: {
        body: {
          type: 'object',
          required: ['display_email'],
          properties: {
            display_email: { type: 'string', format: 'email' },
          },
          additionalProperties: false,
        },
        response: {
          [HTTP_STATUS.ok]: { type: 'object', properties: { status: { type: 'string' } } },
          [HTTP_STATUS.unauthorized]: ERROR_RESPONSE_SCHEMA,
        },
      },
    },
    async (request, reply) => {
      const session = await authenticateSession(server, request);
      if (!session) {
        return reply.code(HTTP_STATUS.unauthorized).send({ error: ERROR_CODES.unauthorized });
      }

      const { display_email } = request.body as { display_email: string };

      // Encrypt before storing — no plaintext email in the DB
      const encryptedEmail = encryptEmail(display_email);

      // Update display_email on all accountMembers rows for this user where it's not yet set
      await db
        .update(schema.accountMembers)
        .set({ displayEmail: encryptedEmail })
        .where(
          and(
            eq(schema.accountMembers.userId, session.userId),
            isNull(schema.accountMembers.displayEmail),
          ),
        );

      return reply.code(HTTP_STATUS.ok).send({ status: 'ok' });
    },
  );

  // DELETE /v1/users/me
  // Permanently deletes the authenticated user's account and all associated data.
  // This is an irreversible action — all personal data, accounts, and records
  // are removed from the server.
  //
  // Session invalidation:
  //   After deletion the user row no longer exists in the DB. authenticateSession()
  //   verifies the JWT signature and then looks up the user record — if the lookup
  //   returns nothing the request is treated as unauthenticated (401). Old JWTs
  //   therefore become implicitly invalid without needing a token blocklist.
  //
  // Idempotency (safe for retry):
  //   If the user is already deleted (user_not_found) we still return 200 so the
  //   client can safely retry after a network timeout without treating a 404 as
  //   an error.
  server.delete(
    USERS_ROUTES.deleteAccount,
    {
      schema: {
        response: {
          [HTTP_STATUS.ok]: {
            type: 'object',
            properties: {
              status: { type: 'string' },
            },
          },
          [HTTP_STATUS.unauthorized]: ERROR_RESPONSE_SCHEMA,
          [HTTP_STATUS.internalServerError]: ERROR_RESPONSE_SCHEMA,
        },
      },
    },
    async (request, reply) => {
      const session = await authenticateSession(server, request);
      if (!session) {
        return reply.code(HTTP_STATUS.unauthorized).send({ error: ERROR_CODES.unauthorized });
      }

      try {
        const result = await deleteUser(db, session.userId);

        // user_not_found is still 200: the user's goal (to be deleted) is already
        // achieved, and this makes retries after network timeouts safe.
        if (result.status === 'user_not_found') {
          return reply.code(HTTP_STATUS.ok).send({ status: 'deleted' });
        }

        if (result.status === 'error') {
          server.log.error(result.cause, 'User deletion failed');
          return reply.code(HTTP_STATUS.internalServerError).send({ error: ERROR_CODES.userDeletionFailed });
        }

        // Best-effort: delete the recovery entry on the recovery server so the
        // user can re-enroll with the same email. This is a secondary concern —
        // if the recovery server is unreachable the main account is still deleted.
        await deleteRecoveryEntry(server, session.emailHash);

        return reply.code(HTTP_STATUS.ok).send({ status: 'deleted' });
      } catch (error) {
        server.log.error(error, 'User deletion failed');
        return reply.code(HTTP_STATUS.internalServerError).send({ error: ERROR_CODES.userDeletionFailed });
      }
    },
  );
};
