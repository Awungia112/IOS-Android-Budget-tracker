// @vitest-environment node
//
// We use the Node environment here because libsodium loads a WASM binary.
// The jsdom environment can interfere with WASM initialisation in some
// Vitest versions; Node is the correct environment for pure crypto code.

import { describe, it, expect, beforeAll } from 'vitest';
import _sodium from 'libsodium-wrappers';
import {
  seal,
  open,
  wrapKey,
  unwrapKey,
  toBase64url,
  fromBase64url,
  type SymmetricEnvelope,
  type AsymmetricEnvelope,
  type RecoveryEnvelope,
} from './envelope.js';

// TODO: RecoveryEnvelope round-trip test is intentionally deferred.
// The RecoveryEnvelope interface and type are defined in this ticket, but
// sealRecovery / openRecovery (Argon2id KDF + XChaCha20-Poly1305) require
// libsodium-wrappers-sumo (crypto_pwhash is not in the standard build) and
// are scoped to a follow-up ticket.
// When implemented, add:
//   describe('RecoveryEnvelope', () => {
//     it('round-trips a recovery blob', async () => { ... });
//     it('throws when ciphertext is tampered', async () => { ... });
//     it('throws on unknown alg', async () => { ... });
//   });
// See: https://gitlab.com/<org>/<repo>/-/issues/<ISSUE_NUMBER>
void (null as unknown as RecoveryEnvelope); // keep the import live for type-checking

// ─── Shared test fixtures ─────────────────────────────────────────────────────

let accountKey: Uint8Array;
let recipientKeyPair: { publicKey: Uint8Array; privateKey: Uint8Array };

beforeAll(async () => {
  await _sodium.ready;
  accountKey = _sodium.randombytes_buf(_sodium.crypto_secretbox_KEYBYTES);
  recipientKeyPair = _sodium.crypto_box_keypair();
});

// ─── Base64url helpers ────────────────────────────────────────────────────────

describe('toBase64url / fromBase64url', () => {
  it('round-trips arbitrary bytes', async () => {
    const original = new Uint8Array([0, 1, 127, 128, 255, 42, 99]);
    const encoded = await toBase64url(original);
    const decoded = await fromBase64url(encoded);
    expect(decoded).toEqual(original);
  });

  it('produces URL-safe characters without padding', async () => {
    const bytes = new Uint8Array(32).fill(0xff);
    const encoded = await toBase64url(bytes);
    expect(encoded).not.toMatch(/[+/=]/);
    expect(encoded).toMatch(/^[A-Za-z0-9_-]+$/);
  });
});

// ─── SymmetricEnvelope ────────────────────────────────────────────────────────

describe('SymmetricEnvelope', () => {
  it('round-trips plaintext', async () => {
    const plaintext = new TextEncoder().encode('hello symmetric world');
    const envelope = await seal(plaintext, accountKey);

    expect(envelope.v).toBe(1);
    expect(envelope.alg).toBe('xsalsa20-poly1305');
    expect(typeof envelope.nonce).toBe('string');
    expect(typeof envelope.ciphertext).toBe('string');

    const recovered = await open(envelope, accountKey);
    expect(recovered).toEqual(plaintext);
  });

  it('produces different ciphertext on each call (random nonce)', async () => {
    const plaintext = new TextEncoder().encode('same message');
    const env1 = await seal(plaintext, accountKey);
    const env2 = await seal(plaintext, accountKey);
    expect(env1.nonce).not.toBe(env2.nonce);
    expect(env1.ciphertext).not.toBe(env2.ciphertext);
  });

  it('throws when ciphertext is tampered', async () => {
    const plaintext = new TextEncoder().encode('tamper test');
    const envelope = await seal(plaintext, accountKey);

    // Flip the last character of the base64url ciphertext
    const tampered: SymmetricEnvelope = {
      ...envelope,
      ciphertext: envelope.ciphertext.slice(0, -1) + (envelope.ciphertext.endsWith('A') ? 'B' : 'A'),
    };

    await expect(open(tampered, accountKey)).rejects.toThrow();
  });

  it('throws when nonce is tampered', async () => {
    const plaintext = new TextEncoder().encode('nonce tamper test');
    const envelope = await seal(plaintext, accountKey);

    const tampered: SymmetricEnvelope = {
      ...envelope,
      nonce: envelope.nonce.slice(0, -1) + (envelope.nonce.endsWith('A') ? 'B' : 'A'),
    };

    await expect(open(tampered, accountKey)).rejects.toThrow();
  });

  it('throws when the wrong key is used', async () => {
    const plaintext = new TextEncoder().encode('wrong key test');
    const envelope = await seal(plaintext, accountKey);
    const wrongKey = _sodium.randombytes_buf(_sodium.crypto_secretbox_KEYBYTES);

    await expect(open(envelope, wrongKey)).rejects.toThrow();
  });

  it('throws on unknown alg', async () => {
    const plaintext = new TextEncoder().encode('unknown alg');
    const envelope = await seal(plaintext, accountKey);
    const bad = { ...envelope, alg: 'aes-128-cbc' } as unknown as SymmetricEnvelope;

    await expect(open(bad, accountKey)).rejects.toThrow('Unsupported symmetric algorithm: aes-128-cbc');
  });

  it('throws on unknown version', async () => {
    const plaintext = new TextEncoder().encode('unknown version');
    const envelope = await seal(plaintext, accountKey);
    const bad = { ...envelope, v: 99 } as unknown as SymmetricEnvelope;

    await expect(open(bad, accountKey)).rejects.toThrow('Unsupported envelope version: 99');
  });

  it('rejects an accountKey of the wrong length', async () => {
    const shortKey = new Uint8Array(16);
    await expect(seal(new Uint8Array(8), shortKey)).rejects.toThrow('accountKey must be');
  });

  it('rejects an accountKey of the wrong length on open', async () => {
    const plaintext = new TextEncoder().encode('key length check');
    const envelope = await seal(plaintext, accountKey);
    const shortKey = new Uint8Array(16);
    await expect(open(envelope, shortKey)).rejects.toThrow('accountKey must be');
  });
});

// ─── AsymmetricEnvelope ───────────────────────────────────────────────────────

describe('AsymmetricEnvelope', () => {
  it('round-trips an accountKey', async () => {
    const envelope = await wrapKey(accountKey, recipientKeyPair.publicKey);

    expect(envelope.v).toBe(1);
    expect(envelope.alg).toBe('x25519-xsalsa20-poly1305');
    expect(typeof envelope.ciphertext).toBe('string');

    const recovered = await unwrapKey(
      envelope,
      recipientKeyPair.publicKey,
      recipientKeyPair.privateKey,
    );
    expect(recovered).toEqual(accountKey);
  });

  it('produces different ciphertext on each call (ephemeral key)', async () => {
    const env1 = await wrapKey(accountKey, recipientKeyPair.publicKey);
    const env2 = await wrapKey(accountKey, recipientKeyPair.publicKey);
    expect(env1.ciphertext).not.toBe(env2.ciphertext);
  });

  it('throws when ciphertext is tampered', async () => {
    const envelope = await wrapKey(accountKey, recipientKeyPair.publicKey);

    const tampered: AsymmetricEnvelope = {
      ...envelope,
      ciphertext: envelope.ciphertext.slice(0, -1) + (envelope.ciphertext.endsWith('A') ? 'B' : 'A'),
    };

    await expect(
      unwrapKey(tampered, recipientKeyPair.publicKey, recipientKeyPair.privateKey),
    ).rejects.toThrow();
  });

  it('throws when the wrong private key is used', async () => {
    const envelope = await wrapKey(accountKey, recipientKeyPair.publicKey);
    const wrongKeyPair = _sodium.crypto_box_keypair();

    await expect(
      unwrapKey(envelope, wrongKeyPair.publicKey, wrongKeyPair.privateKey),
    ).rejects.toThrow();
  });

  it('throws on unknown alg', async () => {
    const envelope = await wrapKey(accountKey, recipientKeyPair.publicKey);
    const bad = { ...envelope, alg: 'rsa-oaep' } as unknown as AsymmetricEnvelope;

    await expect(
      unwrapKey(bad, recipientKeyPair.publicKey, recipientKeyPair.privateKey),
    ).rejects.toThrow('Unsupported asymmetric algorithm: rsa-oaep');
  });

  it('throws on unknown version', async () => {
    const envelope = await wrapKey(accountKey, recipientKeyPair.publicKey);
    const bad = { ...envelope, v: 2 } as unknown as AsymmetricEnvelope;

    await expect(
      unwrapKey(bad, recipientKeyPair.publicKey, recipientKeyPair.privateKey),
    ).rejects.toThrow('Unsupported envelope version: 2');
  });

  it('throws when recipientPublicKey has wrong length', async () => {
    const shortPk = new Uint8Array(16);
    await expect(wrapKey(accountKey, shortPk)).rejects.toThrow('recipientPublicKey must be');
  });

  it('throws when accountKey has wrong length', async () => {
    const shortKey = new Uint8Array(16);
    await expect(wrapKey(shortKey, recipientKeyPair.publicKey)).rejects.toThrow('accountKey must be');
  });

  it('throws when recipientPublicKey has wrong length on unwrapKey', async () => {
    const envelope = await wrapKey(accountKey, recipientKeyPair.publicKey);
    const shortPk = new Uint8Array(16);
    await expect(
      unwrapKey(envelope, shortPk, recipientKeyPair.privateKey),
    ).rejects.toThrow('recipientPublicKey must be');
  });

  it('throws when recipientPrivateKey has wrong length on unwrapKey', async () => {
    const envelope = await wrapKey(accountKey, recipientKeyPair.publicKey);
    const shortSk = new Uint8Array(16);
    await expect(
      unwrapKey(envelope, recipientKeyPair.publicKey, shortSk),
    ).rejects.toThrow('recipientPrivateKey must be');
  });
});
