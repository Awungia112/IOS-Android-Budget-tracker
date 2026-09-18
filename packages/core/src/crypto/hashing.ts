import { getSodium } from './sodium.js';

/**
 * Hashes an email address with a pepper using BLAKE2b-256.
 * The server expects a 64-character lowercase hex digest.
 *
 *   hash = BLAKE2b-256(lowercase(email) + pepper)
 *
 * EMAIL_HASH_PEPPER is a secret shared out-of-band with the trusted client.
 */
export async function hashEmail(email: string, pepper: string): Promise<string> {
  const sod = await getSodium();
  const input = email.toLowerCase().trim() + pepper;
  const hash = sod.crypto_generichash(32, sod.from_string(input), undefined);
  return sod.to_hex(hash);
}
