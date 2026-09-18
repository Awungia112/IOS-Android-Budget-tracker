import type { FastifyPluginAsync } from 'fastify';
import { SKIP_REPLAY_PROTECTION_CONFIG } from '../security/replay-protection-contract.js';
import {
  upsertRegistration,
  updateRegistrationCode,
  validateMagicLinkToken,
  consumeMagicLink,
  type ConsumeTokenResult,
  type ValidateTokenResult,
  verifyRegistrationCode,
  recoverSession,
  checkEmailExists,
} from '../auth/auth.service.js';
import {
  buildMagicLink,
  generateSixDigitCode,
  MAGIC_LINK_EXPIRY,
  hashCode,
  verifyCode,
  CODE_EXPIRY_MINUTES,
} from '../auth/magic-link.service.js';
import { SESSION_TOKEN_TTL } from '../auth/session.js';
import { sendMagicLinkEmail } from '../auth/email.service.js';
import {
  ERROR_CODES,
  ERROR_RESPONSE_SCHEMA,
  HTTP_STATUS,
  OPAQUE_JSON_OBJECT_SCHEMA,
  type ErrorCode,
  type ErrorResponse,
} from '../http/http-contract.js';
import {
  EMAIL_HASH_PATTERN,
  isPublicKeyFormat,
  PUBLIC_KEY_PATTERN,
} from '../users/user-contract.js';
import { hashEmail } from '@budget/core';

/**
 * Request / response shapes.
 *
 * The API uses snake_case to match the ticket contract.
 * The raw email is accepted for sending only — it is never persisted.
 */
export interface RegisterRequest {
  email_hash?: string;
  public_key: string;
  email: string;
  intent?: 'signin' | 'register';
  language?: string;
}

export interface RegisterResponse {
  success: true;
  message: string;
  email_hash: string;
}

/** Response for GET /v1/auth/verify — validation only, no session material. */
export interface ValidateResponse {
  email_hash: string;
}

/** Response for POST /v1/auth/verify — token consumed, session issued. */
export interface VerifyResponse {
  token: string;
  user: {
    email_hash: string;
    public_key: string;
  };
}


const MAGIC_LINK_TOKEN_TYPE = 'magic_link';
const SESSION_TOKEN_TYPE = 'session';

interface MagicLinkJwtPayload {
  sub?: unknown;
  pk?: unknown;
  typ?: unknown;
}

type MagicLinkDecodeResult =
  | { status: 'ok'; emailHash: string; tokenPublicKey: string }
  | { status: 'error'; error: typeof ERROR_CODES.tokenExpired | typeof ERROR_CODES.invalidToken };

interface RouteError {
  statusCode: typeof HTTP_STATUS.unauthorized | typeof HTTP_STATUS.notFound;
  error: ErrorCode;
}

function readMagicLinkTemplateId(): number | undefined {
  const raw = process.env.MAGIC_LINK_TEMPLATE_ID?.trim();
  if (!raw) return undefined;

  const templateId = Number(raw);
  if (!Number.isInteger(templateId) || templateId <= 0) {
    throw new Error(`Invalid MAGIC_LINK_TEMPLATE_ID value: ${raw}`);
  }

  return templateId;
}
function decodeMagicLinkToken(
  server: Parameters<FastifyPluginAsync>[0],
  token: string,
): MagicLinkDecodeResult {
  let decoded: MagicLinkJwtPayload;

  try {
    decoded = server.jwt.verify<MagicLinkJwtPayload>(token);
  } catch (error) {
    if (error instanceof Error && error.message.toLowerCase().includes('expired')) {
      return { status: 'error', error: ERROR_CODES.tokenExpired };
    }
    return { status: 'error', error: ERROR_CODES.invalidToken };
  }

  if (
    decoded.typ !== MAGIC_LINK_TOKEN_TYPE ||
    typeof decoded.sub !== 'string' ||
    typeof decoded.pk !== 'string'
  ) {
    return { status: 'error', error: ERROR_CODES.invalidToken };
  }

  return { status: 'ok', emailHash: decoded.sub, tokenPublicKey: decoded.pk };
}

function magicLinkServiceError(
  status: ValidateTokenResult['status'] | ConsumeTokenResult['status'],
): RouteError | null {
  if (status === 'ok') {
    return null;
  }

  if (status === 'user_not_found') {
    return { statusCode: HTTP_STATUS.notFound, error: ERROR_CODES.userNotFound };
  }

  if (status === 'token_invalid_for_current_key') {
    return {
      statusCode: HTTP_STATUS.unauthorized,
      error: ERROR_CODES.tokenInvalidForCurrentKey,
    };
  }

  return { statusCode: HTTP_STATUS.unauthorized, error: ERROR_CODES.tokenAlreadyUsed };
}

export const AUTH_ROUTES = {
  register: '/v1/auth/register',
  verify: '/v1/auth/verify',
  verifyCode: '/v1/auth/verify-code',
  recoverSession: '/v1/auth/recover-session',
  preflight: '/v1/auth/preflight',
} as const;

/**
 * GET /register/verify?token=…
 *
 * Redirect page that the magic-link email points to (instead of directly at the
 * budgetwise:// scheme). Brevo's click tracking wraps HTTPS URLs, so the link
 * arrives at this server-hosted page, which then issues a client-side redirect
 * to the custom scheme URL. This lets Brevo wrap HTTPS → our server handles it
 * → JS redirect to budgetwise:// → Android opens the app.
 *
 * Chrome on Android blocks automatic window.location navigation to custom URL
 * schemes unless it comes from a user gesture (a tap/click). The page:
 *  1. Auto-tries budgetwise:// via JS — may work depending on Chrome version.
 *  2. Shows a prominent "Open App" button — tapping it = user gesture = works.
 *  3. Auto-clicks a hidden link after 100ms — sometimes works as gesture.
 */
const REDIRECT_HTML = (token: string) => {
  const encodedToken = encodeURIComponent(token);
  const budgetwiseUrl = `budgetwise:///register/verify?token=${encodedToken}`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>Opening Mein Budget…</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
           text-align: center; padding: 2rem 1rem; background: #f8f9fa; }
    .card { background: #fff; max-width: 360px; margin: 3rem auto;
            padding: 2.5rem 1.5rem; border-radius: 16px; box-shadow: 0 2px 12px rgba(0,0,0,0.08); }
    h2 { font-size: 22px; color: #0b0b0b; margin-bottom: 0.75rem; }
    p.sub { color: #6b7280; font-size: 15px; margin-bottom: 2rem; line-height: 1.5; }
    .btn { display: block; width: 100%; background: #0b75c2; color: #fff;
           padding: 16px 0; border: none; border-radius: 12px;
           font-size: 17px; font-weight: 700; cursor: pointer;
           text-decoration: none; transition: background 0.15s; }
    .btn:hover { background: #095ea0; }
    .btn:active { transform: scale(0.98); }
    .fallback { margin-top: 1.5rem; font-size: 13px; color: #9ca3af; }
    .fallback a { color: #0b75c2; }
  </style>
</head>
<body>
  <div class="card">
    <h2>Opening Mein Budget…</h2>
    <p class="sub">Tap the button below to finish registration.</p>
    <button class="btn" id="openBtn">Open the app</button>
    <p class="fallback">
      Button not working?
      <br>
      <a href="${budgetwiseUrl}">Tap here to try directly</a>
    </p>
  </div>
  <script>
    var url = '${budgetwiseUrl}';
    function openApp() { window.location.href = url; }

    // Auto-try after 200ms — may work in some browsers
    setTimeout(openApp, 200);

    // Button click handler (user gesture — most reliable)
    document.getElementById('openBtn').addEventListener('click', function(e) {
      openApp();
    });

    // Also auto-focus the button so user can just tap the screen
    document.getElementById('openBtn').focus();
  </script>
</body>
</html>`;
};

export const authRoutes: FastifyPluginAsync = async (server) => {
  server.get('/register/verify', {
    schema: {
      querystring: {
        type: 'object',
        required: ['token'],
        properties: { token: { type: 'string', minLength: 1 } },
      },
    },
  }, async (request, reply) => {
    const { token } = request.query as { token: string };
    return reply.type('text/html').send(REDIRECT_HTML(token));
  });
  /**
   * POST /v1/auth/preflight
   *
   * Lightweight pre-flight check for sign-in flows.
   * Returns whether the email is registered and its email_hash, without any
   * side effects — no code rotation, no email dispatch. The client uses this
   * to check if the device holds the private key before proceeding to register.
   *
   * Rate limit: 30 requests per IP per hour (generous to avoid blocking
   * legitimate users while still preventing enumeration abuse).
   */
  server.post(
    AUTH_ROUTES.preflight,
    {
      config: { rateLimit: { max: 30, timeWindow: '1 hour' }, ...SKIP_REPLAY_PROTECTION_CONFIG },
      schema: {
        body: {
          type: 'object',
          required: ['email'],
          properties: {
            email: { type: 'string', format: 'email' },
          },
        },
        response: {
          [HTTP_STATUS.ok]: {
            type: 'object',
            required: ['status'],
            properties: {
              status: { type: 'string', enum: ['found', 'not_found'] },
              email_hash: { type: 'string', pattern: EMAIL_HASH_PATTERN },
            },
          },
          [HTTP_STATUS.badRequest]: ERROR_RESPONSE_SCHEMA,
          [HTTP_STATUS.internalServerError]: ERROR_RESPONSE_SCHEMA,
        },
      },
    },
    async (request, reply): Promise<{ status: string; email_hash?: string } | ErrorResponse> => {
      const { email } = request.body as { email: string };
      const email_hash = await hashEmail(email, server.env.emailHashPepper);

      const exists = await checkEmailExists(server.db, email_hash);

      if (!exists) {
        return reply.code(HTTP_STATUS.ok).send({ status: 'not_found' });
      }

      return reply.code(HTTP_STATUS.ok).send({ status: 'found', email_hash });
    },
  );

  /**
   * POST /v1/auth/register
   *
   * Accepts { email_hash, public_key, email }.
   * - Upserts an unvalidated user row (auth.service).
   * - Signs a magic-link JWT bound to the public_key (magic-link.service).
   * - Sends the magic-link email via Brevo (email.service).
   *
   * Replay protection enforced by the global preHandler hook.
   * Rate limit: 5 requests per IP per hour.
   *
   * Note: manual code fallback — the six-digit code is
   * included in the email params and verified via /v1/auth/verify-code.
   */
  server.post(
    AUTH_ROUTES.register,
    {
      config: { rateLimit: { max: 10, timeWindow: '1 hour' } },
      schema: {
        body: {
          type: 'object',
          required: ['public_key', 'email'],
          properties: {
            email_hash: { type: 'string', pattern: EMAIL_HASH_PATTERN },
            public_key: { type: 'string', pattern: PUBLIC_KEY_PATTERN },
            email: { type: 'string', format: 'email' },
            intent: { type: 'string', enum: ['signin', 'register'] },
            language: { type: 'string' },
          },
        },
        response: {
          [HTTP_STATUS.ok]: {
            type: 'object',
            required: ['success', 'message', 'email_hash'],
            properties: {
              success: { type: 'boolean', const: true },
              message: { type: 'string' },
              email_hash: { type: 'string', pattern: EMAIL_HASH_PATTERN },
            },
          },
          [HTTP_STATUS.created]: {
            type: 'object',
            required: ['success', 'message', 'email_hash'],
            properties: {
              success: { type: 'boolean', const: true },
              message: { type: 'string' },
              email_hash: { type: 'string', pattern: EMAIL_HASH_PATTERN },
            },
          },
          [HTTP_STATUS.badRequest]: ERROR_RESPONSE_SCHEMA,
          [HTTP_STATUS.notFound]: ERROR_RESPONSE_SCHEMA,
          [HTTP_STATUS.conflict]: OPAQUE_JSON_OBJECT_SCHEMA,
          [HTTP_STATUS.internalServerError]: ERROR_RESPONSE_SCHEMA,
        },
      },
    },
    async (request, reply): Promise<RegisterResponse | ErrorResponse> => {
      const { email_hash: providedHash, public_key, email, intent, language } = request.body as RegisterRequest;

      if (!isPublicKeyFormat(public_key)) {
        return reply.code(HTTP_STATUS.badRequest).send({ error: ERROR_CODES.invalidPublicKey });
      }

      try {
        // ALWAYS compute email_hash on the server to prevent hash mismatch
        // if the client uses a different (or hardcoded dev) pepper.
        const email_hash = await hashEmail(email, server.env.emailHashPepper);

        // Security check: if the client provided a hash, it MUST match the server's.
        if (providedHash && providedHash !== email_hash) {
          server.log.warn({ providedHash, email_hash }, 'Client provided mismatched email_hash');
          // We continue with the server-computed one to be safe, but log it.
        }

        // Store-review account: issue the fixed code from the environment
        // instead of a random one and skip the email send below — store
        // reviewers have no access to the mailbox and enter the code via
        // the manual-code flow (/v1/auth/verify-code).
        const reviewAccountCode =
          server.env.reviewAccountCode !== undefined &&
          server.env.reviewAccountEmail === email.trim().toLowerCase()
            ? server.env.reviewAccountCode
            : undefined;
        const isReviewAccount = reviewAccountCode !== undefined;

        const code = reviewAccountCode ?? generateSixDigitCode();
        const codeHash = await hashCode(code);
        const expiresAt = new Date();
        expiresAt.setMinutes(expiresAt.getMinutes() + CODE_EXPIRY_MINUTES);

        const result = await upsertRegistration(
          server.db,
          email_hash,
          public_key,
          codeHash,
          expiresAt,
          intent,
        );

        if (result.status === 'email_not_found') {
          return reply.code(HTTP_STATUS.notFound).send({ error: ERROR_CODES.emailNotRegistered });
        }

        if (result.status === 'already_validated') {
          // Existing user signing in: store the code, send the email with a magic
          // link JWT signed with the user's EXISTING public_key (returned by
          // upsertRegistration so we don't need a second DB round-trip), then
          // return 200 with email_hash so the client can proceed to the
          // check-email / OTP flow.
          await updateRegistrationCode(server.db, email_hash, codeHash, expiresAt);

          if (!isReviewAccount) {
            const token = server.jwt.sign(
              { sub: email_hash, pk: result.publicKey, typ: MAGIC_LINK_TOKEN_TYPE },
              { expiresIn: MAGIC_LINK_EXPIRY },
            );

            await sendMagicLinkEmail({
              to: email,
              magicLink: buildMagicLink(token),
              code,
              templateId: readMagicLinkTemplateId(),
              language,
            });
          }

          if (process.env.NODE_ENV !== 'production') {
            server.log.info({ email_hash }, `[dev] Sign-in code: ${code}`);
          }

          return reply.code(HTTP_STATUS.ok).send({ success: true, message: 'Sign-in code sent', email_hash });
        }

        // New user: upsert succeeded, server accepted the public_key.
        // Sign the magic link JWT with the accepted key and send the email.
        if (!isReviewAccount) {
          const token = server.jwt.sign(
            { sub: email_hash, pk: public_key, typ: MAGIC_LINK_TOKEN_TYPE },
            { expiresIn: MAGIC_LINK_EXPIRY },
          );

          await sendMagicLinkEmail({
            to: email,
            magicLink: buildMagicLink(token),
            code,
            templateId: readMagicLinkTemplateId(),
            language,
          });
        }

        // In non-production, always print the code to the server console so
        // local dev and testing work without relying on email delivery.
        if (process.env.NODE_ENV !== 'production') {
          server.log.info({ email_hash }, `[dev] Registration code: ${code}`);
        }

        return reply.code(HTTP_STATUS.created).send({ success: true, message: 'Magic link sent', email_hash });
      } catch (error) {
        server.log.error({ error }, 'Registration failed');
        return reply
          .code(HTTP_STATUS.internalServerError)
          .send({ error: ERROR_CODES.registrationFailed });
      }
    },
  );

  /**
   * GET /v1/auth/verify?token=…
   *
   * Validates the magic-link JWT and checks the DB — but makes NO writes
   * and returns NO session material. Safe for email scanners to prefetch.
   *
   * The emailed deep link points here. The app receives the token via the
   * deep link, confirms the identity, then calls POST /v1/auth/verify to
   * deliberately consume the token and obtain a session JWT.
   *
   * Returns { email_hash } so the app can display who is being verified.
   */
  server.get(
    AUTH_ROUTES.verify,
    {
      config: SKIP_REPLAY_PROTECTION_CONFIG,
      schema: {
        querystring: {
          type: 'object',
          required: ['token'],
          properties: { token: { type: 'string', minLength: 1 } },
        },
        response: {
          [HTTP_STATUS.ok]: {
            type: 'object',
            required: ['email_hash'],
            properties: { email_hash: { type: 'string' } },
          },
          [HTTP_STATUS.unauthorized]: ERROR_RESPONSE_SCHEMA,
          [HTTP_STATUS.notFound]: ERROR_RESPONSE_SCHEMA,
          [HTTP_STATUS.internalServerError]: ERROR_RESPONSE_SCHEMA,
        },
      },
    },
    async (request, reply): Promise<ValidateResponse | ErrorResponse> => {
      const { token } = request.query as { token: string };

      const decoded = decodeMagicLinkToken(server, token);
      if (decoded.status === 'error') {
        return reply.code(HTTP_STATUS.unauthorized).send({ error: decoded.error });
      }

      try {
        const result = await validateMagicLinkToken(
          server.db,
          decoded.emailHash,
          decoded.tokenPublicKey,
        );
        const serviceError = magicLinkServiceError(result.status);

        if (serviceError) {
          return reply.code(serviceError.statusCode).send({ error: serviceError.error });
        }

        // Return only the identity — no session token, no DB write.
        return { email_hash: decoded.emailHash };
      } catch (error) {
        server.log.error({ error }, 'Verify validation failed');
        return reply.code(HTTP_STATUS.internalServerError).send({ error: ERROR_CODES.internalError });
      }
    },
  );

  /**
   * POST /v1/auth/verify
   *
   * The deliberate app-initiated call that consumes the magic-link token
   * and issues a 30-day session JWT.
   *
   * The app calls this after the user taps the magic link and the GET
   * confirms the identity. Replay protection is enforced (nonce required).
   */
  server.post(
    AUTH_ROUTES.verify,
    {
      schema: {
        body: {
          type: 'object',
          required: ['token'],
          properties: { token: { type: 'string', minLength: 1 } },
        },
        response: {
          [HTTP_STATUS.ok]: {
            type: 'object',
            required: ['token', 'user'],
            properties: {
              token: { type: 'string' },
              user: {
                type: 'object',
                required: ['email_hash', 'public_key'],
                properties: { email_hash: { type: 'string' }, public_key: { type: 'string' } },
              },
            },
          },
          [HTTP_STATUS.unauthorized]: ERROR_RESPONSE_SCHEMA,
          [HTTP_STATUS.notFound]: ERROR_RESPONSE_SCHEMA,
          [HTTP_STATUS.internalServerError]: ERROR_RESPONSE_SCHEMA,
        },
      },
    },
    async (request, reply): Promise<VerifyResponse | ErrorResponse> => {
      const { token } = request.body as { token: string };

      const decoded = decodeMagicLinkToken(server, token);
      if (decoded.status === 'error') {
        return reply.code(HTTP_STATUS.unauthorized).send({ error: decoded.error });
      }

      try {
        const result = await consumeMagicLink(
          server.db,
          decoded.emailHash,
          decoded.tokenPublicKey,
        );
        const serviceError = magicLinkServiceError(result.status);

        if (serviceError) {
          return reply.code(serviceError.statusCode).send({ error: serviceError.error });
        }

        const sessionToken = server.jwt.sign(
          { sub: decoded.emailHash, typ: SESSION_TOKEN_TYPE, pk: decoded.tokenPublicKey },
          { expiresIn: SESSION_TOKEN_TTL },
        );
        return { token: sessionToken, user: { email_hash: decoded.emailHash, public_key: decoded.tokenPublicKey } };
      } catch (error) {
        server.log.error({ error }, 'Verify consume failed');
        return reply.code(HTTP_STATUS.internalServerError).send({ error: ERROR_CODES.internalError });
      }
    },
  );

  /**
   * POST /v1/auth/verify-code
   *
   * Verifies the 6-digit code and issues a 30-day session JWT.
   * Manual fallback for when magic links are not practical.
   */
  server.post(
    AUTH_ROUTES.verifyCode,
    {
      config: { rateLimit: { max: 10, timeWindow: '15 minutes' } },
      schema: {
        body: {
          type: 'object',
          required: ['code'],
          properties: {
            email_hash: { type: 'string', pattern: EMAIL_HASH_PATTERN },
            email: { type: 'string', format: 'email' },
            code: { type: 'string', pattern: '^[0-9]{6}$' },
          },
        },
        response: {
          200: {
            type: 'object',
            required: ['token', 'user'],
            properties: {
              token: { type: 'string' },
              user: {
                type: 'object',
                required: ['email_hash', 'public_key'],
                properties: { email_hash: { type: 'string' }, public_key: { type: 'string' } },
              },
            },
          },
          401: { type: 'object', required: ['error'], properties: { error: { type: 'string' } } },
          404: { type: 'object', required: ['error'], properties: { error: { type: 'string' } } },
          500: { type: 'object', required: ['error'], properties: { error: { type: 'string' } } },
        },
      },
    },
    async (request, reply): Promise<VerifyResponse | { error: string }> => {
      const { email_hash: providedHash, email, code } = request.body as { email_hash?: string; email?: string; code: string };

      try {
        let email_hash = providedHash;
        if (!email_hash) {
          if (!email) {
            return reply.code(401).send({ error: 'email_or_hash_required' });
          }
          email_hash = await hashEmail(email, server.env.emailHashPepper);
        }

        const result = await verifyRegistrationCode(server.db, email_hash, code);

        if (result.status === 'user_not_found') return reply.code(404).send({ error: 'user_not_found' });
        if (result.status === 'invalid_code') return reply.code(401).send({ error: 'invalid_code' });
        if (result.status === 'code_expired') return reply.code(401).send({ error: 'code_expired' });

        const sessionToken = server.jwt.sign(
          { sub: email_hash, typ: SESSION_TOKEN_TYPE, pk: result.publicKey },
          { expiresIn: SESSION_TOKEN_TTL },
        );
        return { token: sessionToken, user: { email_hash: email_hash, public_key: result.publicKey } };
      } catch (error) {
        server.log.error({ error }, 'Verify code failed');
        return reply.code(500).send({ error: 'internal_error' });
      }
    },
  );

  /**
   * POST /v1/auth/recover-session
   *
   * Issues a 30-day session JWT for a user who just completed account recovery.
   *
   * After the recovery server returns the encrypted private key envelope and
   * the client decrypts it with the 12-word recovery code, the client derives
   * the X25519 public key from the recovered private key and calls this endpoint
   * with { email_hash, public_key }.
   *
   * The server verifies that the user exists, is validated, and that the
   * recovered public key matches the one stored at registration. On success,
   * it issues the same 30-day session JWT as POST /v1/auth/verify.
   *
   * This closes the "forced re-registration" blocker: without it, a recovered
   * user has no session_token, so goOnline()/triggerSync() bail and the online
   * features prompt routes them to /register for an account that already exists.
   *
* Replay protection is enforced by the global preHandler hook installed by
   * installReplayProtection() in app.ts — this route does NOT set
   * config.skipNonce, so the hook validates the x-nonce header before the
   * handler runs (ref: packages/server/src/security/replay-protection.ts).
    * Rate limit: 10 requests per 15 minutes per IP.
    */
  server.post(
    AUTH_ROUTES.recoverSession,
    {
      config: { rateLimit: { max: 10, timeWindow: '15 minutes' } },
      schema: {
        body: {
          type: 'object',
          required: ['email_hash', 'public_key'],
          properties: {
            email_hash: { type: 'string', pattern: EMAIL_HASH_PATTERN },
            public_key: { type: 'string', pattern: PUBLIC_KEY_PATTERN },
          },
        },
        response: {
          [HTTP_STATUS.ok]: {
            type: 'object',
            required: ['token', 'user'],
            properties: {
              token: { type: 'string' },
              user: {
                type: 'object',
                required: ['email_hash', 'public_key'],
                properties: {
                  email_hash: { type: 'string' },
                  public_key: { type: 'string' },
                },
              },
            },
          },
          [HTTP_STATUS.badRequest]: ERROR_RESPONSE_SCHEMA,
          [HTTP_STATUS.unauthorized]: ERROR_RESPONSE_SCHEMA,
          [HTTP_STATUS.notFound]: ERROR_RESPONSE_SCHEMA,
          [HTTP_STATUS.internalServerError]: ERROR_RESPONSE_SCHEMA,
        },
      },
    },
    async (request, reply): Promise<VerifyResponse | ErrorResponse> => {
      const { email_hash, public_key } = request.body as {
        email_hash: string;
        public_key: string;
      };

      if (!isPublicKeyFormat(public_key)) {
        return reply
          .code(HTTP_STATUS.badRequest)
          .send({ error: ERROR_CODES.invalidPublicKey });
      }

      try {
        const result = await recoverSession(server.db, email_hash, public_key);

        if (result.status === 'user_not_found') {
          return reply
            .code(HTTP_STATUS.notFound)
            .send({ error: ERROR_CODES.userNotFound });
        }
        if (result.status === 'token_invalid_for_current_key') {
          return reply
            .code(HTTP_STATUS.unauthorized)
            .send({ error: ERROR_CODES.tokenInvalidForCurrentKey });
        }

        const sessionToken = server.jwt.sign(
          { sub: email_hash, typ: SESSION_TOKEN_TYPE, pk: public_key },
          { expiresIn: SESSION_TOKEN_TTL },
        );
        return {
          token: sessionToken,
          user: { email_hash, public_key },
        };
      } catch (error) {
        server.log.error({ error }, 'Recover session failed');
        return reply
          .code(HTTP_STATUS.internalServerError)
          .send({ error: ERROR_CODES.internalError });
      }
    },
  );
};
