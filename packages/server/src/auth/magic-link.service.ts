import { randomInt } from 'node:crypto';
import argon2 from 'argon2';

export const MAGIC_LINK_EXPIRY = '24h';
export const CODE_EXPIRY_MINUTES = 15;

/**
 * Builds a magic-link URL by appending the token as a query parameter.
 * Uses URL + searchParams so the token is correctly appended regardless
 * of whether the base URL already contains query parameters.
 */
export function buildMagicLink(token: string): string {
  const baseUrl = process.env.AUTH_DEEP_LINK_BASE ?? 'https://api.prod.dip.on.adorsys.com/register/verify';
  const url = new URL(baseUrl);
  url.searchParams.set('token', token);
  return url.toString();
}

/**
 * Returns an Argon2id hash of the 6-digit registration code.
 * Argon2id is a slow, memory-hard hash — far more resistant to
 * brute-force than SHA-256 for a small 6-digit input space.
 *
 * Note: this is async because Argon2 is intentionally CPU/memory expensive.
 */
export async function hashCode(code: string): Promise<string> {
  return argon2.hash(code, { type: argon2.argon2id });
}

/**
 * Verifies a plain-text code against a stored Argon2id hash.
 * Must be used instead of direct string comparison.
 */
export async function verifyCode(code: string, hash: string): Promise<boolean> {
  try {
    return await argon2.verify(hash, code);
  } catch {
    return false;
  }
}

/**
 * Generates a cryptographically secure 6-digit fallback code.
 * Uses randomInt (not Math.random) so it is safe to use once
 * manual-code verification lands.
 */
export function generateSixDigitCode(): string {
  return randomInt(100000, 1000000).toString();
}
