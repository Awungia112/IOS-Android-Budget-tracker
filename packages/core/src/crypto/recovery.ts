/**
 * Recovery key derivation and private-key encryption.
 *
 * Implements the OA-100 RecoveryEnvelope spec:
 *   alg: 'argon2id+xchacha20-poly1305'
 *
 * Flow:
 *   1. generateSecretCode()  → 6 words from EFF large wordlist (~77 bits entropy)
 *   2. sealRecovery()        → Argon2id KDF → secretbox encrypt → RecoveryEnvelope
 *   3. openRecovery()        → re-derive key from code → decrypt → private key bytes
 *
 * libsodium-wrappers-sumo is required because crypto_pwhash (Argon2id) is not
 * included in the standard libsodium-wrappers build.
 *
 * All binary fields in RecoveryEnvelope are base64url-encoded without padding
 * (RFC 4648 §5, no `=`), consistent with the rest of the envelope module.
 */

import { getSodium, encodeBase64url, decodeBase64url } from './sodium.js';
import { EFF_WORDLIST, EFF_WORDLIST_SIZE } from './eff-wordlist.js';
import type { RecoveryEnvelope } from './envelope.js';

import type { Sodium } from './sodium.js';

// Module-private aliases so internal callers stay concise.
const encode = encodeBase64url;
const decode = decodeBase64url;

// ─── EFF word set cache ───────────────────────────────────────────────────────

let effWordSet: Set<string> | null = null;

function getEffWordSet(): Set<string> {
  if (!effWordSet) {
    effWordSet = new Set(EFF_WORDLIST);
  }
  return effWordSet;
}

// ─── Secret code generation ───────────────────────────────────────────────────

/** Number of words in a recovery secret code. */
export const SECRET_CODE_WORD_COUNT = 6;

type SecretCodeParseState = {
  readonly index: number;
  readonly words: string[];
};

/**
 * Generates a 6-word secret code from the EFF large wordlist using
 * cryptographically secure random bytes.
 *
 * Each word is selected by drawing a random index in [0, EFF_WORDLIST_SIZE)
 * using rejection sampling to avoid modulo bias.
 *
 * @returns  Words joined by hyphens: 'word1-word2-word3-word4-word5-word6'
 */
export async function generateSecretCode(): Promise<string> {
  const sodium = await getSodium();
  const words: string[] = [];

  for (let i = 0; i < SECRET_CODE_WORD_COUNT; i++) {
    words.push(pickWord(sodium));
  }

  return words.join('-');
}

/**
 * Splits a hyphen-separated secret code back into exactly six EFF words.
 *
 * Some official EFF words contain hyphens (for example "drop-down"), so a
 * plain `code.split('-')` is ambiguous. This parser walks the token stream and
 * greedily accepts wordlist entries while keeping enough tokens for the
 * remaining words.
 */
export function parseSecretCodeWords(secretCode: string): string[] {
  const tokens = secretCode.split('-').filter(Boolean);
  const wordSet = getEffWordSet();
  const parsed = parseSecretCodeFrom(
    tokens,
    {
      index: 0,
      words: [],
    },
    wordSet,
  );

  if (
    !parsed ||
    parsed.index !== tokens.length ||
    parsed.words.length !== SECRET_CODE_WORD_COUNT
  ) {
    throw new Error('Recovery secret code must contain exactly 6 EFF words');
  }

  return parsed.words;
}

/**
 * Greedy-leftmost backtracking parser for a hyphen-separated EFF secret code.
 *
 * Algorithm:
 *   At each position, try the longest possible token span first (greedy-left).
 *   If a candidate matches a wordlist entry, recurse for the remaining words.
 *   If the recursive call fails, shrink the span by one token and retry.
 *   This ensures hyphenated EFF words (e.g. "drop-down") are matched before
 *   their constituent tokens are consumed as separate words.
 *
 * Time complexity: O(n) tokens in the common case (no ambiguous prefixes).
 *   Worst case is O(n²) if many token spans are valid wordlist prefixes, but
 *   the EFF wordlist has no such ambiguities in practice.
 *
 * Word selection uses libsodium's randombytes_uniform(EFF_WORDLIST_SIZE),
 *   which handles rejection sampling internally to avoid modulo bias.
 *
 * @param tokens   Hyphen-split token array from the raw secret code string.
 * @param state    Immutable parse state: current token index + accepted words.
 * @param wordSet  Set of all valid EFF words for O(1) membership checks.
 * @returns        Final state if a valid 6-word parse was found, null otherwise.
 */
function parseSecretCodeFrom(
  tokens: string[],
  state: SecretCodeParseState,
  wordSet: Set<string>,
): SecretCodeParseState | null {
  const remainingWords = SECRET_CODE_WORD_COUNT - state.words.length;
  const remainingTokens = tokens.length - state.index;

  if (remainingWords === 0) {
    return state.index === tokens.length ? state : null;
  }

  if (remainingTokens < remainingWords) return null;

  const maxTokenCount = remainingTokens - (remainingWords - 1);
  for (let tokenCount = maxTokenCount; tokenCount >= 1; tokenCount--) {
    const candidate = tokens
      .slice(state.index, state.index + tokenCount)
      .join('-');
    if (!wordSet.has(candidate)) continue;

    const parsed = parseSecretCodeFrom(
      tokens,
      {
        index: state.index + tokenCount,
        words: [...state.words, candidate],
      },
      wordSet,
    );
    if (parsed) return parsed;
  }

  return null;
}

/**
 * Picks a single word from the EFF wordlist using libsodium's
 * randombytes_uniform(upper_bound), which internally implements rejection
 * sampling to avoid modulo bias while keeping all bounded-random logic inside
 * the audited crypto library.
 */
function pickWord(sodium: Sodium): string {
  const index = sodium.randombytes_uniform(EFF_WORDLIST_SIZE);
  // eslint-disable-next-line security/detect-object-injection -- index is bounds-checked by randombytes_uniform
  return EFF_WORDLIST[index]!;
}

// ─── Envelope encryption / decryption ────────────────────────────────────────

/**
 * Encrypts `privateKey` using a key derived from `wordCode` via Argon2id.
 *
 * @param privateKey  Raw 32-byte X25519 private key bytes.
 * @param wordCode    6-word hyphen-separated secret code (from generateSecretCode).
 * @returns           A RecoveryEnvelope ready to POST to the recovery server.
 */
export async function sealRecovery(
  privateKey: Uint8Array,
  wordCode: string,
): Promise<RecoveryEnvelope> {
  const sodium = await getSodium();

  const salt = sodium.randombytes_buf(sodium.crypto_pwhash_SALTBYTES);
  const ops = sodium.crypto_pwhash_OPSLIMIT_INTERACTIVE;
  const mem = sodium.crypto_pwhash_MEMLIMIT_INTERACTIVE;

  const derivedKey = sodium.crypto_pwhash(
    32,
    wordCode,
    salt,
    ops,
    mem,
    sodium.crypto_pwhash_ALG_ARGON2ID13,
  );

  const nonce = sodium.randombytes_buf(sodium.crypto_secretbox_NONCEBYTES);
  const ciphertext = sodium.crypto_secretbox_easy(privateKey, nonce, derivedKey);

  return {
    v: 1,
    alg: 'argon2id+xchacha20-poly1305',
    kdf_salt: encode(sodium, salt),
    kdf_ops: ops,
    kdf_mem: mem,
    nonce: encode(sodium, nonce),
    ciphertext: encode(sodium, ciphertext),
  };
}

/**
 * Decrypts a RecoveryEnvelope using the provided secret code.
 *
 * @param envelope  The RecoveryEnvelope from the recovery server.
 * @param wordCode  The user's 6-word hyphen-separated secret code.
 * @returns         The decrypted private key bytes.
 * @throws          If the MAC check fails (wrong code or tampered envelope).
 * @throws          If `envelope.alg` is not a recognised algorithm.
 */
export async function openRecovery(
  envelope: RecoveryEnvelope,
  wordCode: string,
): Promise<Uint8Array> {
  const sodium = await getSodium();

  if (envelope.v !== 1) {
    throw new Error(`Unsupported recovery envelope version: ${envelope.v}`);
  }

  switch (envelope.alg) {
    case 'argon2id+xchacha20-poly1305': {
      const salt = decode(sodium, envelope.kdf_salt);
      const derivedKey = sodium.crypto_pwhash(
        32,
        wordCode,
        salt,
        envelope.kdf_ops,
        envelope.kdf_mem,
        sodium.crypto_pwhash_ALG_ARGON2ID13,
      );

      const ct = decode(sodium, envelope.ciphertext);
      const nonce = decode(sodium, envelope.nonce);

      try {
        return sodium.crypto_secretbox_open_easy(ct, nonce, derivedKey);
      } catch {
        throw new Error('Recovery decryption failed: wrong code or tampered envelope');
      }
    }
    default: {
      const _exhaustive: never = envelope.alg;
      throw new Error(`Unsupported recovery algorithm: ${String(_exhaustive)}`);
    }
  }
}
