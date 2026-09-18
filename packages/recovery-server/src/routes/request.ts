/**
 * POST /v1/recovery/request
 *
 * Accepts a raw email address, computes the BLAKE2b-256 hash server-side
 * using the server-only pepper (RECOVERY_EMAIL_PEPPER), and issues an OTP.
 *
 * Security properties:
 * - Email hashing is performed server-side so the pepper never appears in the
 *   client JS bundle. Moving hashing to the server closes the pre-computation
 *   attack where an attacker extracts VITE_EMAIL_PEPPER from the bundle and
 *   enumerates all enrolled accounts via /request or /enroll.
 * - Always returns 200 { status: 'sent', email_hash } regardless of whether
 *   the email is enrolled — callers cannot distinguish enrolled from
 *   non-enrolled accounts (prevents account enumeration). The email_hash is
 *   safe to return: without the server-only pepper the client cannot
 *   re-derive it for other addresses.
 * - Rate-limit (3 req/hr) is applied to ALL hashes via an in-process Map,
 *   including unknown ones — closes the bypass where unknown hashes had no
 *   rate limit and could be probed at high speed.
 * - For unknown hashes, sendNoop() is called to equalise Brevo response timing.
 */
import { webcrypto } from 'node:crypto';
import sodium from 'libsodium-wrappers';
import type { FastifyPluginAsync } from 'fastify';
import { eq } from 'drizzle-orm';
import argon2 from 'argon2';
import type { RecoveryDb } from '../db/recovery.repository.js';
import { recoveryEntries } from '../db/schema.js';
import type { BrevoClient } from '../email/brevo.js';
import { RECOVERY_ERRORS } from './recovery-contract.js';

const CODE_TTL_MS = 15 * 60 * 1000;    // 15 minutes
const RATE_WINDOW_MS = 60 * 60 * 1000; // 1 hour
const RATE_LIMIT = 3;                   // max requests per window

/** In-process rate limit map — keyed by email_hash. Exported for testing. */
export const requestRateLimitMap = new Map<string, { count: number; windowStart: number }>();

/**
 * Prune expired rate-limit entries from requestRateLimitMap.
 * Called after each counter update to prevent unbounded memory growth.
 */
function pruneRateLimitMap(now: number): void {
  // Only prune when the map grows large to amortise the iteration cost.
  if (requestRateLimitMap.size <= 10_000) return;
  for (const [key, entry] of requestRateLimitMap) {
    if (now - entry.windowStart >= RATE_WINDOW_MS) {
      requestRateLimitMap.delete(key);
    }
  }
}

/**
 * In-process debug code store — keyed by email_hash, holds the last plaintext OTP.
 * Only populated when RECOVERY_DEBUG=true. Exported for the debug route.
 */
export const debugCodeStore = new Map<string, string>();

interface RequestRouteOptions {
  db: RecoveryDb;
  brevo?: BrevoClient;
  /** Server-only pepper for BLAKE2b email hashing. */
  emailPepper: string;
}

interface RequestBody {
  email: string;
  language?: string;
}

/**
 * BLAKE2b-256 email hash — matches the client-side hashEmail() in @budget/core.
 *   hash = BLAKE2b-256( lowercase(email) + pepper )  → 64-char hex string
 *
 * Uses libsodium to match the client-side implementation exactly and avoid
 * platform-dependent behavior in Node's crypto.createHash.
 */
function hashEmailServer(email: string, pepper: string): string {
  const input = email.toLowerCase().trim() + pepper;
  const hash = sodium.crypto_generichash(32, input, null);
  return sodium.to_hex(hash);
}

function generateOtp(): string {
  const buf = new Uint32Array(1);
  webcrypto.getRandomValues(buf);
  return String(buf[0]! % 1_000_000).padStart(6, '0');
}

export const requestRoutes: FastifyPluginAsync<RequestRouteOptions> = async (
  server,
  { db, brevo, emailPepper },
) => {
  await sodium.ready;

  server.post<{ Body: RequestBody }>(
    '/v1/recovery/request',
    {
      config: {
        rateLimit: {
          max: 10,
          timeWindow: '1 hour',
        },
      },
      schema: {
        body: {
          type: 'object',
          additionalProperties: false,
          required: ['email'],
          properties: {
            email: { type: 'string', format: 'email' },
            language: { type: 'string' },
          },
        },
        response: {
          200: {
            type: 'object',
            properties: {
              status: { type: 'string', enum: ['sent'] },
              // Returned so the client can pass it to /v1/recovery/verify
              // without ever knowing the server-side pepper.
              email_hash: { type: 'string' },
              // Indicates whether the email is enrolled in recovery.
              // Safe to return: does not leak enumeration beyond what user typed.
              registered: { type: 'boolean' },
            },
          },
          400: { type: 'object', properties: { error: { type: 'string' } } },
          500: { type: 'object', properties: { error: { type: 'string' } } },
        },
      },
    },
    async (request, reply) => {
      const { email, language } = request.body;

      // ── Server-side hash (pepper never leaves the server) ─────────────────────
      let email_hash: string;
      try {
        email_hash = hashEmailServer(email, emailPepper);
      } catch (err) {
        server.log.error(err, 'Failed to hash email in /v1/recovery/request');
        return reply.code(500).send({ error: RECOVERY_ERRORS.internalError });
      }

      // ── DB lookup first (needed to determine 'registered' for rate limit response) ─────
      let entry: { email_hash: string } | undefined;
      try {
        const [row] = await db
          .select()
          .from(recoveryEntries)
          .where(eq(recoveryEntries.email_hash, email_hash))
          .limit(1);
        entry = row;
      } catch (err) {
        server.log.error(err, 'DB error in /v1/recovery/request');
        return reply.code(500).send({ error: RECOVERY_ERRORS.internalError });
      }

      const registered = entry !== undefined;

      // ── In-process rate limit (applied to ALL hashes, enrolled or not) ──────
      const now = Date.now();
      const existing = requestRateLimitMap.get(email_hash);
      const inWindow = existing !== undefined && now - existing.windowStart < RATE_WINDOW_MS;

      if (inWindow && existing!.count >= RATE_LIMIT) {
        // Rate limited — return 200 silently to prevent enrollment leakage
        return reply.code(200).send({ status: 'sent', email_hash, registered });
      }

      // Update counter
      requestRateLimitMap.set(email_hash, {
        count: inWindow ? existing!.count + 1 : 1,
        windowStart: inWindow ? existing!.windowStart : now,
      });
      pruneRateLimitMap(now);

      if (!entry) {
        // Unknown hash — still call sendNoop() to equalise Brevo response timing
        await brevo?.sendNoop();
        return reply.code(200).send({ status: 'sent', email_hash, registered: false });
      }

      // ── Generate and store OTP ────────────────────────────────────────────────
      const code = generateOtp();
      const codeHash = await argon2.hash(code, { type: argon2.argon2id });
      const expiresAt = new Date(now + CODE_TTL_MS);

      // In debug mode, record the plaintext code so the debug route can return it.
      if (process.env['RECOVERY_DEBUG'] === 'true') {
        debugCodeStore.set(email_hash, code);
      }

      try {
        await db
          .update(recoveryEntries)
          .set({
            tmp_code_hash: codeHash,
            code_expires_at: expiresAt,
            code_used_at: null,
            verify_attempts: 0,
            verify_window_start: null,
          })
          .where(eq(recoveryEntries.email_hash, email_hash));
      } catch (err) {
        server.log.error(err, 'DB error storing OTP in /v1/recovery/request');
        return reply.code(500).send({ error: RECOVERY_ERRORS.internalError });
      }

      // ── Send OTP via Brevo (best-effort — code is already stored) ────────────
      if (brevo) {
        await brevo.sendRecoveryCode({ toEmail: email, code, language }).catch((err: unknown) => {
          server.log.warn(err, 'Brevo send failed — OTP already stored, client can retry');
        });
      }

      return reply.code(200).send({ status: 'sent', email_hash, registered: true });
    },
  );
};
