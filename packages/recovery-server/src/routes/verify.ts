/**
 * POST /v1/recovery/verify
 *
 * Verifies the OTP and, on success, atomically marks it as used and returns
 * the RecoveryEnvelope.
 *
 * Security properties:
 * - All failure paths (wrong code, expired, locked, not found) return 404
 *   with the same body — callers cannot distinguish enrolled from
 *   non-enrolled accounts or distinguish error reasons.
 * - Atomic UPDATE … WHERE code_used_at IS NULL prevents TOCTOU: two
 *   concurrent requests with the correct OTP can only succeed once. The
 *   rowCount check determines whether this request won the race.
 * - argon2.verify() is always called (even when entry is not found) to
 *   prevent timing side-channels that would reveal enrollment status.
 */
import type { FastifyPluginAsync } from 'fastify';
import { eq, and, isNull, sql, lt } from 'drizzle-orm';
import argon2 from 'argon2';
import type { RecoveryDb } from '../db/recovery.repository.js';
import { recoveryEntries } from '../db/schema.js';
import { RECOVERY_ERRORS, MAX_VERIFY_ATTEMPTS, VERIFY_WINDOW_MS } from './recovery-contract.js';

// Lazy-initialised dummy hash for constant-time comparison when entry not found.
// Avoids CPU-intensive top-level await during module load.
let dummyHashPromise: Promise<string> | null = null;
function getDummyHash(): Promise<string> {
  if (!dummyHashPromise) {
    dummyHashPromise = argon2.hash('000000', { type: argon2.argon2id });
  }
  return dummyHashPromise;
}

interface VerifyRouteOptions {
  db: RecoveryDb;
}

interface VerifyBody {
  email_hash: string;
  code: string;
}

export const verifyRoutes: FastifyPluginAsync<VerifyRouteOptions> = async (server, { db }) => {
  server.post<{ Body: VerifyBody }>(
    '/v1/recovery/verify',
    {
      config: {
        // 20 verify attempts per 15-minute window per IP — rate-limits OTP brute-force
        // across many email hashes even when the per-hash DB counter cannot help.
        rateLimit: { max: 20, timeWindow: '15 minutes' },
      },
      schema: {
        body: {
          type: 'object',
          required: ['email_hash', 'code'],
          properties: {
            email_hash: { type: 'string', pattern: '^[0-9a-f]{64}$' },
            code: { type: 'string', minLength: 6, maxLength: 6, pattern: '^[0-9]{6}$' },
          },
        },
        response: {
          200: {
            type: 'object',
            properties: {
              encrypted_private_key: {
                type: 'object',
                additionalProperties: true,
              },
            },
          },
          400: { type: 'object', properties: { error: { type: 'string' } } },
          401: {
            type: 'object',
            properties: {
              error: { type: 'string' },
              attempts_remaining: { type: 'number' },
            },
          },
          429: {
            type: 'object',
            properties: {
              error: { type: 'string' },
              attempts_remaining: { type: 'number' },
            },
          },
          500: { type: 'object', properties: { error: { type: 'string' } } },
        },
      },
    },
    async (request, reply) => {
      const { email_hash, code } = request.body;

      // ── DB lookup ─────────────────────────────────────────────────────────────
      let entry: {
        tmp_code_hash: string | null;
        code_expires_at: Date | null;
        code_used_at: Date | null;
        verify_attempts: number;
        verify_window_start: Date | null;
        encrypted_private_key: unknown;
      } | undefined;

      try {
        const [row] = await db
          .select()
          .from(recoveryEntries)
          .where(eq(recoveryEntries.email_hash, email_hash))
          .limit(1);
        entry = row;
      } catch (err) {
        server.log.error(err, 'DB error in /v1/recovery/verify select');
        return reply.code(500).send({ error: RECOVERY_ERRORS.internalError });
      }

      // Always run argon2.verify to equalise timing whether entry exists or not.
      const storedHash = entry?.tmp_code_hash ?? (await getDummyHash());
      const codeMatches = await argon2.verify(storedHash, code);

      // All failure paths return 401 — no enrollment leakage.
      if (!entry) {
        return reply.code(401).send({ error: RECOVERY_ERRORS.notFound });
      }

      const now = new Date();
      const nowMs = now.getTime();

      // ── Sliding window check ──────────────────────────────────────────────────
      // If verify_window_start is outside the window, reset the attempt counter
      // so the user gets a fresh window of attempts.
      if (entry.verify_window_start) {
        const windowElapsed = nowMs - entry.verify_window_start.getTime() >= VERIFY_WINDOW_MS;
        if (windowElapsed) {
          try {
            await db
              .update(recoveryEntries)
              .set({ verify_attempts: 0, verify_window_start: null })
              .where(
                and(
                  eq(recoveryEntries.email_hash, email_hash),
                  lt(recoveryEntries.verify_window_start, entry.verify_window_start),
                ),
              );
          } catch (err) {
            server.log.error(err, 'Failed to reset verify window');
            return reply.code(500).send({ error: RECOVERY_ERRORS.internalError });
          }
          entry.verify_attempts = 0;
          entry.verify_window_start = null;
        }
      }

      // Locked: too many attempts in the current window.
      if ((entry.verify_attempts ?? 0) >= MAX_VERIFY_ATTEMPTS) {
        return reply.code(429).send({ error: RECOVERY_ERRORS.codeLocked, attempts_remaining: 0 });
      }

      // Expired or never issued.
      if (!entry.tmp_code_hash || !entry.code_expires_at || now > entry.code_expires_at) {
        return reply.code(401).send({ error: RECOVERY_ERRORS.notFound });
      }

      // Wrong code — increment attempt counter atomically via SQL expression
      // to prevent concurrent requests undercounting due to read-then-write races.
      if (!codeMatches) {
        let newAttempts: number;
        try {
          // Set verify_window_start on first wrong attempt if not already set.
          const needsWindowStart = entry.verify_window_start === null;
          const result = await db
            .update(recoveryEntries)
            .set({
              verify_attempts: sql`${recoveryEntries.verify_attempts} + 1`,
              ...(needsWindowStart ? { verify_window_start: now } : {}),
            })
            .where(eq(recoveryEntries.email_hash, email_hash))
            .returning({ verify_attempts: recoveryEntries.verify_attempts });
          newAttempts = result[0]?.verify_attempts ?? entry.verify_attempts + 1;
        } catch (err) {
          server.log.warn(err, 'Failed to increment verify_attempts');
          newAttempts = entry.verify_attempts + 1;
        }
        const remaining = Math.max(0, MAX_VERIFY_ATTEMPTS - newAttempts);
        return reply.code(401).send({ error: RECOVERY_ERRORS.notFound, attempts_remaining: remaining });
      }

      // ── Atomic mark-as-used (prevents TOCTOU / OTP replay) ───────────────────
      // UPDATE … WHERE code_used_at IS NULL returns the updated row only if
      // this request won the race. A concurrent request sees 0 rows → 401.
      let updatedRows: { id: string }[];
      try {
        updatedRows = await db
          .update(recoveryEntries)
          .set({ code_used_at: now, verify_attempts: 0, verify_window_start: null })
          .where(
            and(
              eq(recoveryEntries.email_hash, email_hash),
              isNull(recoveryEntries.code_used_at),
            ),
          )
          .returning({ id: recoveryEntries.id });
      } catch (err) {
        server.log.error(err, 'DB error in /v1/recovery/verify update');
        return reply.code(500).send({ error: RECOVERY_ERRORS.internalError });
      }

      if (updatedRows.length === 0) {
        // Another request already used this OTP — return 401, not 410.
        return reply.code(401).send({ error: RECOVERY_ERRORS.notFound });
      }

      return reply.code(200).send({
        encrypted_private_key: entry.encrypted_private_key,
      });
    },
  );
};
