/**
 * POST /v1/recovery/enroll
 *
 * INSERT-ONLY: stores the encrypted private key for an email hash.
 * Re-enrollment requires an authenticated endpoint to prevent unauthenticated
 * overwrites — an attacker who knows the email_hash (computable from a public
 * pepper) must not be able to silently replace the stored envelope.
 *
 * Returns 409 when the email_hash is already enrolled.
 * Zero-knowledge: the server only sees email_hash and the encrypted blob.
 */
import type { FastifyPluginAsync } from 'fastify';
import type { RecoveryDb } from '../db/recovery.repository.js';
import { recoveryEntries } from '../db/schema.js';
import {
  EMAIL_HASH_PATTERN,
  RECOVERY_ALG,
  ENROLL_ERRORS,
  type EnrollRequestBody,
} from './enroll-contract.js';

interface EnrollRouteOptions {
  db: RecoveryDb;
}

/** Returns true if the error (or its cause) is a PostgreSQL unique_violation. */
function isUniqueViolation(err: unknown): boolean {
  const code = (err as { code?: string })?.code;
  if (code === '23505') return true;
  const cause = (err as { cause?: unknown })?.cause;
  return (cause as { code?: string })?.code === '23505';
}

export const enrollRoutes: FastifyPluginAsync<EnrollRouteOptions> = async (server, { db }) => {
  server.post<{ Body: EnrollRequestBody }>(
    '/v1/recovery/enroll',
    {
      config: {
        // 5 enrollments per hour per IP — prevents DB flooding / storage exhaustion.
        rateLimit: { max: 5, timeWindow: '1 hour' },
      },
      schema: {
        body: {
          type: 'object',
          additionalProperties: false,
          required: ['email_hash', 'encrypted_private_key'],
          properties: {
            email_hash: {
              type: 'string',
              pattern: EMAIL_HASH_PATTERN,
            },
            encrypted_private_key: {
              type: 'object',
              additionalProperties: false,
              required: ['v', 'alg', 'kdf_salt', 'kdf_ops', 'kdf_mem', 'nonce', 'ciphertext'],
              properties: {
                v: { type: 'number', enum: [1] },
                alg: { type: 'string', enum: [RECOVERY_ALG] },
                // Argon2id salt: crypto_pwhash_SALTBYTES = 16 bytes = 22 base64url chars (no padding)
                kdf_salt: { type: 'string', pattern: '^[A-Za-z0-9_-]{22}$', minLength: 22, maxLength: 22 },
                kdf_ops: { type: 'number', minimum: 1, maximum: 100_000_000 },
                kdf_mem: { type: 'number', minimum: 1, maximum: 1_073_741_824 },
                // Secretbox nonce: crypto_secretbox_NONCEBYTES = 24 bytes = 32 base64url chars
                nonce: { type: 'string', pattern: '^[A-Za-z0-9_-]{32}$', minLength: 32, maxLength: 32 },
                // Ciphertext bounds: 32-byte key + 16-byte MAC = 48 bytes = exactly 64 base64url chars.
                // maxLength: 80 adds a 12-byte / 16-char safety margin for future key-size increases
                // while preventing abuse via oversized payloads stored as JSONB.
                ciphertext: { type: 'string', pattern: '^[A-Za-z0-9_-]+$', minLength: 64, maxLength: 80 },
              },
            },
          },
        },
        response: {
          200: {
            type: 'object',
            properties: { status: { type: 'string', enum: ['enrolled'] } },
          },
          400: { type: 'object', properties: { error: { type: 'string' } } },
          409: { type: 'object', properties: { error: { type: 'string' } } },
          500: { type: 'object', properties: { error: { type: 'string' } } },
        },
      },
    },
    async (request, reply) => {
      const { email_hash, encrypted_private_key } = request.body;

      try {
        await db
          .insert(recoveryEntries)
          .values({ email_hash, encrypted_private_key });
      } catch (err) {
        if (isUniqueViolation(err)) {
          return reply.code(409).send({ error: ENROLL_ERRORS.alreadyEnrolled });
        }
        server.log.error(err, 'Failed to store recovery enrollment');
        return reply.code(500).send({ error: ENROLL_ERRORS.internalError });
      }

      return reply.code(200).send({ status: 'enrolled' });
    },
  );
};
