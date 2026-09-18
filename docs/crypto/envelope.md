# EncryptedEnvelope — Design & Migration Protocol

## Overview

Every encrypted value in the system carries the algorithm that produced it via
an `alg` field. This makes it possible to evolve cryptographic primitives
without a big-bang migration: the reader checks `alg` and dispatches to the
right decryptor; old ciphertext stays readable; new writes use the new
algorithm.

All binary fields in envelopes are **base64url-encoded without padding**
(RFC 4648 §5, URL-safe alphabet, no trailing `=`).

---

## Envelope Types

### `SymmetricEnvelope`

```ts
{ v: 1; alg: 'xsalsa20-poly1305'; nonce: string; ciphertext: string }
```

Used to encrypt `ChangeRecord` payloads with an `accountKey`.

### `AsymmetricEnvelope`

```ts
{ v: 1; alg: 'x25519-xsalsa20-poly1305'; ciphertext: string }
```

Used to wrap `accountKey`s for a recipient's public key. The ephemeral public
key and MAC are embedded inside `ciphertext` by libsodium's sealed-box
construction, so no separate nonce field is needed.

### `RecoveryEnvelope`

```ts
{
  v: 1;
  alg: 'argon2id+xchacha20-poly1305';
  kdf_salt: string;
  kdf_ops: number;
  kdf_mem: number;
  nonce: string;
  ciphertext: string;
}
```

Carries KDF parameters alongside the ciphertext so that future work-factor
increases do not require re-escrowing the recovery private key blob. The reader
uses the stored `kdf_ops`/`kdf_mem` to re-derive the key, then decrypts.

---

## Algorithm Selection Rationale

### `xsalsa20-poly1305` (SymmetricEnvelope)

libsodium's `crypto_secretbox_easy` uses **XSalsa20-Poly1305**. The 192-bit
(24-byte) random nonce makes nonce reuse negligible even at high message volumes.
Poly1305 provides authenticated encryption: any bit-flip in the ciphertext causes
decryption to throw rather than return corrupt plaintext.

### `x25519-xsalsa20-poly1305` (AsymmetricEnvelope)

libsodium's `crypto_box_seal` implements an **anonymous sealed box**:

1. An ephemeral X25519 key pair is generated per message.
2. A shared secret is derived via X25519(ephemeral_sk, recipient_pk).
3. The message is encrypted with XSalsa20-Poly1305 using a nonce derived from
   `BLAKE2b(ephemeral_pk ‖ recipient_pk)`.
4. The ephemeral public key is prepended to the ciphertext; the ephemeral
   secret key is immediately destroyed.

The sender's identity is not revealed. Only the holder of `recipient_sk` can
decrypt.

### `argon2id+xchacha20-poly1305` (RecoveryEnvelope)

Argon2id is the [PHC winner](https://www.password-hashing.net/) and the
recommended KDF for password-based key derivation. Storing `kdf_ops` and
`kdf_mem` in the envelope means the work factor can be increased for new
recovery blobs without invalidating existing ones.

---

## Migration Protocol

When an algorithm is superseded (e.g. `xsalsa20-poly1305` → `aes-256-gcm`):

### Step 1 — New writes use the new `alg`

Update `seal()` / `wrapKey()` to produce envelopes with the new `alg` string.
Old records are untouched.

### Step 2 — Old records remain readable via dispatch

The `switch (env.alg)` in `open()` / `unwrapKey()` already handles the old
algorithm. Add a new `case` for the new algorithm. Old ciphertext continues to
decrypt correctly.

```ts
switch (env.alg) {
  case 'xsalsa20-poly1305':
    return sodium.crypto_secretbox_open_easy(ct, nonce, key); // legacy
  case 'aes-256-gcm':
    return openAesGcm(env, key); // new
  default:
    throw new Error(`Unsupported alg: ${env.alg}`);
}
```

### Step 3 — Background re-encryption on next read

A background job (or lazy re-encryption on read) re-encrypts each record with
the new algorithm and writes back the updated envelope. This drains the old
algorithm from the dataset over time without a blocking migration.

```
read record
  → decrypt with old alg (dispatch)
  → re-encrypt with new alg
  → write back new envelope
```

### Step 4 — Remove the old case (after deprecation window)

Once telemetry confirms no records with the old `alg` remain, remove the old
`case` from the dispatch switch. This is a safe, auditable change.

---

## Key Sizes & Constants

| Constant                          | Value  | Purpose                        |
|-----------------------------------|--------|--------------------------------|
| `crypto_secretbox_KEYBYTES`       | 32     | accountKey length              |
| `crypto_secretbox_NONCEBYTES`     | 24     | SymmetricEnvelope nonce length |
| `crypto_secretbox_MACBYTES`       | 16     | Poly1305 MAC length            |
| `crypto_box_PUBLICKEYBYTES`       | 32     | X25519 public key length       |
| `crypto_box_SECRETKEYBYTES`       | 32     | X25519 private key length      |
| `crypto_box_SEALBYTES`            | 48     | ephemeral_pk (32) + MAC (16)   |
