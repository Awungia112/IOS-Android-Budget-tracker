/**
 * DELETE /v1/recovery/account
 *
 * Deletes the recovery data (encrypted private key) for the authenticated user's
 * email_hash. Used when a user permanently deletes their account from the main
 * server — ensures the right to erasure (GDPR Art. 17) is fully honoured.
 *
 * Authentication: requires a session JWT issued by the main server (verified
 * via @fastify/jwt with the shared RECOVERY_JWT_SECRET). The email_hash in the
 * request body must match the `sub` claim in the JWT, preventing a user from
 * deleting another user's recovery data.
 *
 * Idempotent: returns 200 even if no recovery entry exists for the given
 * email_hash, so retries after network timeouts are safe.
 */

import type { FastifyPluginAsync } from 'fastify';
import { eq } from 'drizzle-orm';
import type { RecoveryDb } from '../db/recovery.repository.js';
import { recoveryEntries } from '../db/schema.js';

interface DeleteAccountRouteOptions {
  db: RecoveryDb;
}

interface DeleteAccountBody {
  email_hash: string;
}

const DELETE_RECOVERY_ERRORS = {
  internalError: 'internal_error',
  unauthorized: 'unauthorized',
} as const;

export const deleteAccountRoutes: FastifyPluginAsync<DeleteAccountRouteOptions> = async (server, { db }) => {
  server.delete<{ Body: DeleteAccountBody }>(
    '/v1/recovery/account',
    {
      schema: {
        body: {
          type: 'object',
          required: ['email_hash'],
          properties: {
            email_hash: { type: 'string', pattern: '^[0-9a-f]{64}$' },
          },
        },
        response: {
          200: {
            type: 'object',
            properties: {
              status: { type: 'string' },
            },
          },
          401: { type: 'object', properties: { error: { type: 'string' } } },
          500: { type: 'object', properties: { error: { type: 'string' } } },
        },
      },
    },
    async (request, reply) => {
      // Verify the session JWT
      let payload: { sub?: unknown; typ?: unknown };
      try {
        payload = await request.jwtVerify<{ sub?: unknown; typ?: unknown }>();
      } catch {
        return reply.code(401).send({ error: DELETE_RECOVERY_ERRORS.unauthorized });
      }

      if (payload.typ !== 'session' || typeof payload.sub !== 'string') {
        return reply.code(401).send({ error: DELETE_RECOVERY_ERRORS.unauthorized });
      }

      const { email_hash } = request.body;

      // The session's `sub` claim is the user's email_hash — it must match the
      // email_hash in the request body. This prevents a user from deleting
      // another user's recovery data even with a valid session token.
      if (payload.sub !== email_hash) {
        return reply.code(401).send({ error: DELETE_RECOVERY_ERRORS.unauthorized });
      }

      try {
        // Idempotent delete: DELETE succeeds even if the row doesn't exist.
        // rowCount can be 0 and that's fine — the caller gets a successful
        // response either way, making retries safe after network timeouts.
        await db
          .delete(recoveryEntries)
          .where(eq(recoveryEntries.email_hash, email_hash));

        return reply.code(200).send({ status: 'deleted' });
      } catch (err) {
        server.log.error(err, 'Failed to delete recovery entry');
        return reply.code(500).send({ error: DELETE_RECOVERY_ERRORS.internalError });
      }
    },
  );
};
