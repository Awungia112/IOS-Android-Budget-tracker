import type { FastifyPluginAsync } from 'fastify';

import { EMAIL_HASH_PATTERN } from './enroll-contract.js';
import { debugCodeStore } from './request.js';

/**
 * GET /v1/recovery/debug/last-code
 *
 * Returns the last generated plaintext recovery code for a given email_hash.
 *
 * ONLY active when RECOVERY_DEBUG=true AND the request originates from localhost.
 * This endpoint must never be exposed in production — BREVO_API_KEY is required
 * in non-test environments, making this path unreachable in prod.
 *
 * Usage (local dev without Brevo):
 *   curl 'http://localhost:3001/v1/recovery/debug/last-code?email_hash=<hex>'
 */
export const debugRoutes: FastifyPluginAsync = async (server) => {
  // Defence-in-depth: both this guard and the registration condition in
  // app.ts must remain in place. If one is removed, the other still prevents
  // this endpoint from serving plaintext OTPs outside of local dev.
  if (process.env['RECOVERY_DEBUG'] !== 'true') return;

  server.get<{ Querystring: { email_hash: string } }>(
    '/v1/recovery/debug/last-code',
    {
      schema: {
        querystring: {
          type: 'object',
          required: ['email_hash'],
          properties: {
            email_hash: { type: 'string', pattern: EMAIL_HASH_PATTERN },
          },
        },
      },
    },
    async (request, reply) => {
      // Restrict to loopback addresses only.
      const ip = request.ip;
      if (ip !== '127.0.0.1' && ip !== '::1' && ip !== '::ffff:127.0.0.1') {
        return reply.code(403).send({ error: 'forbidden' });
      }

      const { email_hash } = request.query;
      const code = debugCodeStore.get(email_hash);

      if (!code) {
        return reply.code(404).send({ error: 'no_code' });
      }

      return reply.code(200).send({ code });
    },
  );
};
