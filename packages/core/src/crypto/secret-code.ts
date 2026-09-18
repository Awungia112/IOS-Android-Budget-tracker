import { EFF_WORDLIST } from './wordlist.js';

const WORD_COUNT = 6;

/**
 * Returns a cryptographically secure random integer in [0, max).
 * Uses Web Crypto (globalThis.crypto.getRandomValues) so it works in both
 * the browser (Vite/app bundle) and Node.js (server / tests).
 * Never uses Math.random().
 */
function secureRandomIndex(max: number): number {
  // Use rejection sampling to avoid modulo bias.
  // A Uint32 has range [0, 2^32). We reject values >= floor(2^32 / max) * max
  // so the remaining values map uniformly onto [0, max).
  const limit = Math.floor(0x1_0000_0000 / max) * max;
  const buf = new Uint32Array(1);
  let value: number;
  do {
    globalThis.crypto.getRandomValues(buf);
    value = buf[0];
  } while (value >= limit);
  return value % max;
}

/**
 * Generates a cryptographically secure 6-word secret recovery code from the
 * EFF large wordlist (7776 words, ~77 bits of entropy).
 *
 * Format: 'word1-word2-word3-word4-word5-word6'
 */
export function generateSecretCode(): string {
  const words: string[] = [];
  for (let i = 0; i < WORD_COUNT; i++) {
    words.push(EFF_WORDLIST[secureRandomIndex(EFF_WORDLIST.length)]);
  }
  return words.join('-');
}
