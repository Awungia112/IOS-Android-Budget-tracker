/**
 * Shared libsodium initialization helper for core crypto modules.
 *
 * We use libsodium-wrappers-sumo because recovery code needs Argon2id
 * (crypto_pwhash), which is not available in the standard wrapper package.
 */

import sodium from 'libsodium-wrappers-sumo';

let _ready: Promise<typeof sodium> | null = null;
export type Sodium = typeof sodium;

export async function getSodium(): Promise<typeof sodium> {
  if (!_ready) {
    _ready = sodium.ready.then(() => sodium);
  }
  return _ready;
}

// ─── Base64url helpers ────────────────────────────────────────────────────────
//
// These are sync helpers that require a pre-resolved Sodium instance.
// Keeping them here (rather than in each crypto module) avoids duplication
// while preserving the pattern of passing a resolved instance so callers
// don't re-initialise sodium per field.

/**
 * Encode bytes to base64url without padding (RFC 4648 §5, no `=`).
 * Requires a pre-resolved Sodium instance.
 */
export function encodeBase64url(sodium: Sodium, bytes: Uint8Array): string {
  return sodium.to_base64(bytes, sodium.base64_variants.URLSAFE_NO_PADDING);
}

/**
 * Decode a base64url string (no padding) to bytes.
 * Requires a pre-resolved Sodium instance.
 */
export function decodeBase64url(sodium: Sodium, encoded: string): Uint8Array {
  return sodium.from_base64(encoded, sodium.base64_variants.URLSAFE_NO_PADDING);
}
