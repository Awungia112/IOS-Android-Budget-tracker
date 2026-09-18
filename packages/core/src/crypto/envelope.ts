/**
 * EncryptedEnvelope — algorithm-agnostic encrypted container
 *
 * Every encrypted value in the system carries the algorithm that produced it.
 * This allows cryptographic primitives to evolve without a big-bang migration:
 * the reader checks `alg` and dispatches to the right decryptor; old ciphertext
 * stays readable; new writes use the new algorithm.
 *
 * Algorithm selection rationale
 * ─────────────────────────────
 * • SymmetricEnvelope  — `xsalsa20-poly1305` (libsodium crypto_secretbox_easy)
 *   XSalsa20-Poly1305 with a 24-byte random nonce. The 192-bit nonce makes
 *   random-nonce reuse negligible even at high message volumes. Poly1305 provides
 *   authenticated encryption; any bit-flip in the ciphertext causes decryption to
 *   throw rather than return corrupt plaintext.
 *
 * • AsymmetricEnvelope — `x25519-xsalsa20-poly1305` (libsodium crypto_box_seal)
 *   Anonymous sender (sealed box): an ephemeral X25519 key pair is generated per
 *   message, the ephemeral public key is embedded in the ciphertext, and the
 *   ephemeral secret key is immediately destroyed. Only the recipient's private key
 *   can decrypt. The nonce is derived deterministically via BLAKE2b(ephemeral_pk ‖
 *   recipient_pk), so no nonce field is needed in the envelope.
 *
 * • RecoveryEnvelope   — `argon2id+xchacha20-poly1305`
 *   KDF parameters (salt, ops, mem) are stored alongside the ciphertext so that
 *   future work-factor increases do not require re-escrowing the recovery blob.
 *   The reader uses the stored parameters to re-derive the key, then decrypts.
 *   The current OA-100 ticket uses libsodium `crypto_secretbox_easy` for the
 *   authenticated encryption step while preserving the OA algorithm identifier.
 *
 * Migration protocol
 * ──────────────────
 * When an algorithm is superseded:
 *   1. New writes use the new `alg` value.
 *   2. Old records remain readable via the `switch (env.alg)` dispatch below.
 *   3. A background job re-encrypts each record on next read and writes back the
 *      new envelope, eventually draining the old algorithm from the dataset.
 *   4. Once no records with the old `alg` remain, the old case can be removed
 *      from the switch (after a suitable deprecation window).
 *
 * All binary fields are base64url-encoded without padding (RFC 4648 §5, no `=`).
 */

import { getSodium, encodeBase64url, decodeBase64url, type Sodium } from './sodium.js';

// ─── Base64url helpers ───────────────────────────────────────────────────────

// Module-private aliases so internal callers stay concise.
const encode = encodeBase64url;
const decode = decodeBase64url;

/**
 * Encode a Uint8Array to base64url without padding (RFC 4648 §5, no `=`).
 * Delegates to the internal `encode` helper via a resolved sodium instance.
 */
export async function toBase64url(bytes: Uint8Array): Promise<string> {
  return encode(await getSodium(), bytes);
}

/**
 * Decode a base64url string (no padding) to a Uint8Array.
 * Delegates to the internal `decode` helper via a resolved sodium instance.
 */
export async function fromBase64url(encoded: string): Promise<Uint8Array> {
  return decode(await getSodium(), encoded);
}

// ─── Envelope interfaces ──────────────────────────────────────────────────────

/**
 * Symmetric envelope — encrypts a ChangeRecord payload with an accountKey.
 * All string fields are base64url-encoded (no padding).
 */
export interface SymmetricEnvelope {
  v: 1;
  alg: 'xsalsa20-poly1305';
  /** 24-byte random nonce, base64url */
  nonce: string;
  /** Authenticated ciphertext (plaintext + 16-byte MAC), base64url */
  ciphertext: string;
}

/**
 * Asymmetric envelope — wraps an accountKey for a recipient's public key.
 * crypto_box_seal embeds the ephemeral public key and MAC inside the ciphertext,
 * so no separate nonce or sender-key field is needed.
 * All string fields are base64url-encoded (no padding).
 */
export interface AsymmetricEnvelope {
  v: 1;
  alg: 'x25519-xsalsa20-poly1305';
  /** Sealed-box ciphertext (ephemeral_pk ‖ MAC ‖ encrypted_payload), base64url */
  ciphertext: string;
}

/**
 * Recovery envelope — carries KDF parameters so future work-factor increases
 * do not require re-escrowing the recovery private key blob.
 * All string fields are base64url-encoded (no padding).
 */
export interface RecoveryEnvelope {
  v: 1;
  /**
   * OA-100 algorithm identifier for this construction.
   *
   * The label 'argon2id+xchacha20-poly1305' is the spec-defined string for
   * the Argon2id KDF + authenticated-encryption combination. The current
   * implementation uses libsodium `crypto_secretbox_easy` (XSalsa20-Poly1305)
   * for the encryption step — this is intentional per the OA-100 ticket and
   * must not be changed without a coordinated protocol version bump.
   */
  alg: 'argon2id+xchacha20-poly1305';
  /** Argon2id salt, base64url */
  kdf_salt: string;
  /** Argon2id opslimit */
  kdf_ops: number;
  /** Argon2id memlimit (bytes) */
  kdf_mem: number;
  /** 24-byte random nonce, base64url */
  nonce: string;
  /** Authenticated ciphertext, base64url */
  ciphertext: string;
}

// ─── Symmetric operations ─────────────────────────────────────────────────────

/**
 * Encrypt `plaintext` with a 32-byte `accountKey` using XSalsa20-Poly1305.
 *
 * @param plaintext  Raw bytes to encrypt.
 * @param accountKey 32-byte symmetric key (crypto_secretbox_KEYBYTES).
 * @returns          A SymmetricEnvelope ready for storage.
 */
export async function seal(
  plaintext: Uint8Array,
  accountKey: Uint8Array,
): Promise<SymmetricEnvelope> {
  const sodium = await getSodium();

  if (accountKey.length !== sodium.crypto_secretbox_KEYBYTES) {
    throw new Error(
      `accountKey must be ${sodium.crypto_secretbox_KEYBYTES} bytes, got ${accountKey.length}`,
    );
  }

  const nonce = sodium.randombytes_buf(sodium.crypto_secretbox_NONCEBYTES);
  const ct = sodium.crypto_secretbox_easy(plaintext, nonce, accountKey);

  return {
    v: 1,
    alg: 'xsalsa20-poly1305',
    nonce: encode(sodium, nonce),
    ciphertext: encode(sodium, ct),
  };
}

/**
 * Decrypt a SymmetricEnvelope with a 32-byte `accountKey`.
 * Dispatches on `env.alg` so future algorithms can be added without breaking
 * existing callers.
 *
 * @throws If the MAC check fails (tampered ciphertext/nonce or wrong key).
 * @throws If `env.alg` is not a recognised algorithm string.
 * @throws If `env.v` is not a recognised version.
 */
export async function open(
  envelope: SymmetricEnvelope,
  accountKey: Uint8Array,
): Promise<Uint8Array> {
  const sodium = await getSodium();

  if (envelope.v !== 1) {
    throw new Error(`Unsupported envelope version: ${envelope.v}`);
  }

  switch (envelope.alg) {
    case 'xsalsa20-poly1305': {
      if (accountKey.length !== sodium.crypto_secretbox_KEYBYTES) {
        throw new Error(
          `accountKey must be ${sodium.crypto_secretbox_KEYBYTES} bytes, got ${accountKey.length}`,
        );
      }
      const ct = decode(sodium, envelope.ciphertext);
      const nonce = decode(sodium, envelope.nonce);
      try {
        return sodium.crypto_secretbox_open_easy(ct, nonce, accountKey);
      } catch {
        throw new Error('Decryption failed: authentication tag mismatch');
      }
    }
    // case 'aes-256-gcm': return openAesGcm(envelope, accountKey); // future
    default: {
      const _exhaustive: never = envelope.alg;
      throw new Error(`Unsupported symmetric algorithm: ${String(_exhaustive)}`);
    }
  }
}

// ─── Asymmetric operations ────────────────────────────────────────────────────

/**
 * Wrap `accountKey` for `recipientPublicKey` using an anonymous sealed box
 * (X25519 + XSalsa20-Poly1305). The ephemeral key pair is generated internally
 * and destroyed after encryption; the ephemeral public key is embedded in the
 * ciphertext by libsodium.
 *
 * @param accountKey         32-byte key to wrap.
 * @param recipientPublicKey 32-byte X25519 public key of the recipient.
 * @returns                  An AsymmetricEnvelope ready for storage.
 */
export async function wrapKey(
  accountKey: Uint8Array,
  recipientPublicKey: Uint8Array,
): Promise<AsymmetricEnvelope> {
  const sodium = await getSodium();

  if (accountKey.length !== sodium.crypto_secretbox_KEYBYTES) {
    throw new Error(
      `accountKey must be ${sodium.crypto_secretbox_KEYBYTES} bytes, got ${accountKey.length}`,
    );
  }

  if (recipientPublicKey.length !== sodium.crypto_box_PUBLICKEYBYTES) {
    throw new Error(
      `recipientPublicKey must be ${sodium.crypto_box_PUBLICKEYBYTES} bytes, got ${recipientPublicKey.length}`,
    );
  }

  const ct = sodium.crypto_box_seal(accountKey, recipientPublicKey);

  return {
    v: 1,
    alg: 'x25519-xsalsa20-poly1305',
    ciphertext: encode(sodium, ct),
  };
}

/**
 * Unwrap an AsymmetricEnvelope using the recipient's key pair.
 * Dispatches on `env.alg` for forward compatibility.
 *
 * Key lifecycle is the caller's responsibility. In a WASM/browser context,
 * `fill(0)` on the JS-side Uint8Array cannot reach the copy already made in
 * WASM linear memory, so zeroisation here would be both ineffective and
 * destructive (it would silently corrupt any caller that reuses the same key
 * reference across multiple unwrap calls).
 *
 * @param envelope            The AsymmetricEnvelope to decrypt.
 * @param recipientPublicKey  32-byte X25519 public key of the recipient.
 * @param recipientPrivateKey 32-byte X25519 private key of the recipient.
 * @throws If the MAC check fails or the envelope was not intended for this key pair.
 * @throws If `env.alg` is not a recognised algorithm string.
 */
export async function unwrapKey(
  envelope: AsymmetricEnvelope,
  recipientPublicKey: Uint8Array,
  recipientPrivateKey: Uint8Array,
): Promise<Uint8Array> {
  const sodium = await getSodium();

  if (envelope.v !== 1) {
    throw new Error(`Unsupported envelope version: ${envelope.v}`);
  }

  switch (envelope.alg) {
    case 'x25519-xsalsa20-poly1305': {
      if (recipientPublicKey.length !== sodium.crypto_box_PUBLICKEYBYTES) {
        throw new Error(
          `recipientPublicKey must be ${sodium.crypto_box_PUBLICKEYBYTES} bytes, got ${recipientPublicKey.length}`,
        );
      }
      if (recipientPrivateKey.length !== sodium.crypto_box_SECRETKEYBYTES) {
        throw new Error(
          `recipientPrivateKey must be ${sodium.crypto_box_SECRETKEYBYTES} bytes, got ${recipientPrivateKey.length}`,
        );
      }
      const ct = decode(sodium, envelope.ciphertext);
      try {
        return sodium.crypto_box_seal_open(ct, recipientPublicKey, recipientPrivateKey);
      } catch {
        throw new Error('Decryption failed: authentication tag mismatch');
      }
    }
    // case 'x25519-xchacha20-poly1305': return openX25519XChaCha20(envelope, ...); // future
    default: {
      const _exhaustive: never = envelope.alg;
      throw new Error(`Unsupported asymmetric algorithm: ${String(_exhaustive)}`);
    }
  }
}
