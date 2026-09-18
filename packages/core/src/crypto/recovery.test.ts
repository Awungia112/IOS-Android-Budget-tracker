// @vitest-environment node
//
// Argon2id (crypto_pwhash) requires libsodium-wrappers-sumo and WASM.
// Node environment avoids jsdom WASM interference.

import { describe, it, expect, beforeAll } from 'vitest';
import _sodium from 'libsodium-wrappers-sumo';
import {
  generateSecretCode,
  parseSecretCodeWords,
  sealRecovery,
  openRecovery,
  SECRET_CODE_WORD_COUNT,
} from './recovery.js';
import { EFF_WORDLIST, EFF_WORDLIST_SIZE } from './eff-wordlist.js';
import type { RecoveryEnvelope } from './envelope.js';

beforeAll(async () => {
  await _sodium.ready;
});

// ─── EFF wordlist integrity ───────────────────────────────────────────────────

describe('EFF_WORDLIST', () => {
  it('contains exactly 7776 words (6^5 dice combinations)', () => {
    expect(EFF_WORDLIST_SIZE).toBe(7776);
    expect(EFF_WORDLIST).toHaveLength(7776);
  });

  it('starts with "abacus" and ends with "zoom" (official EFF ordering)', () => {
    expect(EFF_WORDLIST[0]).toBe('abacus');
    expect(EFF_WORDLIST[7775]).toBe('zoom');
  });

  it('contains only lowercase alphabetic words (hyphens permitted per EFF list)', () => {
    for (const word of EFF_WORDLIST) {
      expect(word).toMatch(/^[a-z-]+$/);
    }
  });
});

// ─── generateSecretCode ───────────────────────────────────────────────────────

describe('generateSecretCode', () => {
  it('returns a hyphen-separated code that parses to exactly 6 EFF words', async () => {
    const code = await generateSecretCode();
    const words = parseSecretCodeWords(code);

    expect(words).toHaveLength(SECRET_CODE_WORD_COUNT);
    for (const word of words) {
      expect(word.length).toBeGreaterThan(0);
      expect(EFF_WORDLIST).toContain(word);
    }
  });

  it('produces different codes on each call', async () => {
    const code1 = await generateSecretCode();
    const code2 = await generateSecretCode();
    // Probability of collision is astronomically small (~1 in 2^77)
    expect(code1).not.toBe(code2);
  });

  it('parses generated codes back to exactly 6 EFF words', async () => {
    const code = await generateSecretCode();
    const words = parseSecretCodeWords(code);

    expect(words).toHaveLength(SECRET_CODE_WORD_COUNT);
    for (const word of words) {
      expect(EFF_WORDLIST).toContain(word);
    }
  });

  it('handles official EFF words that contain hyphens', () => {
    expect(parseSecretCodeWords('drop-down-felt-tip-t-shirt-yo-yo-abacus-zoom')).toEqual([
      'drop-down',
      'felt-tip',
      't-shirt',
      'yo-yo',
      'abacus',
      'zoom',
    ]);
  });
});

// ─── sealRecovery / openRecovery round-trip ───────────────────────────────────

describe('RecoveryEnvelope', () => {
  let privateKey: Uint8Array;
  const wordCode = 'correct-horse-battery-staple-login-secret';

  beforeAll(async () => {
    const sod = await _sodium.ready.then(() => _sodium);
    privateKey = sod.randombytes_buf(32);
  });

  it('round-trips a private key', async () => {
    const envelope = await sealRecovery(privateKey, wordCode);
    const recovered = await openRecovery(envelope, wordCode);
    expect(recovered).toEqual(privateKey);
  });

  it('produces a well-formed RecoveryEnvelope', async () => {
    const envelope = await sealRecovery(privateKey, wordCode);

    expect(envelope.v).toBe(1);
    expect(envelope.alg).toBe('argon2id+xchacha20-poly1305');
    expect(typeof envelope.kdf_salt).toBe('string');
    expect(typeof envelope.kdf_ops).toBe('number');
    expect(typeof envelope.kdf_mem).toBe('number');
    expect(typeof envelope.nonce).toBe('string');
    expect(typeof envelope.ciphertext).toBe('string');

    // All binary fields must be base64url (no padding, no +/)
    for (const field of [envelope.kdf_salt, envelope.nonce, envelope.ciphertext]) {
      expect(field).toMatch(/^[A-Za-z0-9_-]+$/);
      expect(field).not.toContain('=');
    }
  });

  it('kdf_ops and kdf_mem read back correctly from envelope', async () => {
    const envelope = await sealRecovery(privateKey, wordCode);
    const sod = await _sodium.ready.then(() => _sodium);

    expect(envelope.kdf_ops).toBe(sod.crypto_pwhash_OPSLIMIT_INTERACTIVE);
    expect(envelope.kdf_mem).toBe(sod.crypto_pwhash_MEMLIMIT_INTERACTIVE);
  });

  it('produces different ciphertext on each call (random salt + nonce)', async () => {
    const env1 = await sealRecovery(privateKey, wordCode);
    const env2 = await sealRecovery(privateKey, wordCode);

    expect(env1.kdf_salt).not.toBe(env2.kdf_salt);
    expect(env1.nonce).not.toBe(env2.nonce);
    expect(env1.ciphertext).not.toBe(env2.ciphertext);
  });

  it('throws when the wrong code is used', async () => {
    const envelope = await sealRecovery(privateKey, wordCode);
    await expect(openRecovery(envelope, 'wrong-code-here-will-fail-now')).rejects.toThrow(
      'Recovery decryption failed',
    );
  });

  it('throws when ciphertext is tampered', async () => {
    const envelope = await sealRecovery(privateKey, wordCode);
    const tampered: RecoveryEnvelope = {
      ...envelope,
      ciphertext:
        envelope.ciphertext.slice(0, -1) + (envelope.ciphertext.endsWith('A') ? 'B' : 'A'),
    };
    await expect(openRecovery(tampered, wordCode)).rejects.toThrow();
  });

  it('throws on unsupported version', async () => {
    const envelope = await sealRecovery(privateKey, wordCode);
    const bad = { ...envelope, v: 99 } as unknown as RecoveryEnvelope;
    await expect(openRecovery(bad, wordCode)).rejects.toThrow(
      'Unsupported recovery envelope version: 99',
    );
  });
});
