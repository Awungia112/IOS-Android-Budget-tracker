/**
 * Shared contract for POST /v1/recovery/request and POST /v1/recovery/verify.
 */

export const RECOVERY_ERRORS = {
  notFound: 'not_found',
  codeExpired: 'code_expired',
  codeUsed: 'code_used',
  codeLocked: 'code_locked',
  internalError: 'internal_error',
} as const;

/** Max failed verify attempts before the entry is locked. */
export const MAX_VERIFY_ATTEMPTS = 5;

/** Code expiry: 15 minutes. */
export const CODE_TTL_MS = 15 * 60 * 1000;

/** Sliding window for verify attempts: 15 minutes. */
export const VERIFY_WINDOW_MS = 15 * 60 * 1000;

// ─── Request ──────────────────────────────────────────────────────────────────

/**
 * POST /v1/recovery/request body.
 *
 * `email` is the plain address the code will be sent to. It is never stored —
 * the server is zero-knowledge with respect to raw email addresses. The client
 * provides it here purely so Brevo can deliver the code.
 */
export interface RequestBody {
  email_hash: string;
  email: string;
}

export interface RequestResponse {
  status: 'sent';
}

// ─── Verify ───────────────────────────────────────────────────────────────────

export interface VerifyBody {
  email_hash: string;
  code: string;
}

export interface VerifyResponse {
  encrypted_private_key: import('./enroll-contract.js').RecoveryEnvelopeBody;
}
