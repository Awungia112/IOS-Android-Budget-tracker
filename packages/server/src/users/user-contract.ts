/**
 * Single source of truth for the users domain contract.
 *
 * These constants are consumed by the route schema, cleanup job, and tests.
 * SQL migrations always use explicit literal values, but the TypeScript side
 * must not repeat magic numbers.
 */

// ── Email hash ────────────────────────────────────────────────────────────────

/** BLAKE2b-256 always produces a 64-character hex digest. */
export const EMAIL_HASH_HEX_LENGTH = 64;

/** Regex pattern for a valid email hash (64 lowercase hex chars). */
export const EMAIL_HASH_PATTERN = `^[0-9a-f]{${EMAIL_HASH_HEX_LENGTH}}$`;

// ── Public key ────────────────────────────────────────────────────────────────

/** base64url-encoded X25519 public key is always exactly 43 characters. */
export const PUBLIC_KEY_BASE64URL_LENGTH = 43;

/** Regex pattern for a valid base64url-encoded public key. */
export const PUBLIC_KEY_PATTERN = `^[A-Za-z0-9_-]{${PUBLIC_KEY_BASE64URL_LENGTH}}$`;

const PUBLIC_KEY_BASE64URL_CHARS = /^[A-Za-z0-9_-]+$/;

export function isPublicKeyFormat(value: string): boolean {
  return value.length === PUBLIC_KEY_BASE64URL_LENGTH && PUBLIC_KEY_BASE64URL_CHARS.test(value);
}

// ── Cleanup job ───────────────────────────────────────────────────────────────

/** Unvalidated registrations older than this many hours are deleted. */
export const UNVALIDATED_REGISTRATION_RETENTION_HOURS = 24;

/** How often the cleanup job runs, in milliseconds. */
export const UNVALIDATED_REGISTRATION_CLEANUP_INTERVAL_MS = 60 * 60 * 1000; // 1 hour
