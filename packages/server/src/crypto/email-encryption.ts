import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

/**
 * Email encryption at rest for Budget Wise.
 *
 * Uses AES-256-GCM to encrypt email fields before writing them to the
 * database and decrypt them on read. Legacy plaintext values (those not
 * starting with the `$enc$` prefix) pass through unchanged so no migration
 * is required.
 *
 * Ciphertext format: `$enc$<iv-hex>:<auth-tag-hex>:<ciphertext-hex>`
 */

const PREFIX = '$enc$';
const IV_LENGTH = 12; // 96 bits — recommended for AES-GCM
const AUTH_TAG_LENGTH = 16; // 128 bits

let cachedKey: Buffer | undefined;

/**
 * Initialise the encryption key. Must be called once during server startup
 * (inside `buildServer`). The key must be a 64-character hex string
 * representing 32 bytes (256 bits) for AES-256.
 */
export function initEmailEncryption(hexKey: string): void {
  if (!hexKey || hexKey.length !== 64 || !/^[0-9a-fA-F]{64}$/.test(hexKey)) {
    throw new Error(
      'EMAIL_ENCRYPTION_KEY must be a 64-character hex string (32 bytes for AES-256). ' +
      'Generate one with: openssl rand -hex 32',
    );
  }
  cachedKey = Buffer.from(hexKey, 'hex');
}

/**
 * Reset the cached key. Intended for tests only.
 */
export function resetKeyCache(): void {
  cachedKey = undefined;
}

function getKey(): Buffer {
  if (!cachedKey) {
    throw new Error(
      'Email encryption key not initialised. Call initEmailEncryption() during server startup.',
    );
  }
  return cachedKey;
}

/**
 * Encrypt a plaintext email. Returns a string with the `$enc$` prefix.
 * If the input is nullish, returns null.
 */
export function encryptEmail(plaintext: string | null | undefined): string | null {
  if (plaintext === null || plaintext === undefined) return null;
  if (plaintext === '') return '';

  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv('aes-256-gcm', getKey(), iv, { authTagLength: AUTH_TAG_LENGTH });
  const encrypted = Buffer.concat([
    cipher.update(plaintext, 'utf8'),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();

  return `${PREFIX}${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted.toString('hex')}`;
}

/**
 * Decrypt an email value. If the value starts with the `$enc$` prefix it is
 * decrypted; otherwise it is returned unchanged (legacy plaintext pass-through).
 * If the input is nullish, returns null.
 */
export function decryptEmail(ciphertext: string | null | undefined): string | null {
  if (ciphertext === null || ciphertext === undefined) return null;
  if (ciphertext === '') return '';

  if (!ciphertext.startsWith(PREFIX)) {
    // Legacy plaintext — pass through unchanged
    return ciphertext;
  }

  const payload = ciphertext.slice(PREFIX.length);
  const parts = payload.split(':');
  if (parts.length !== 3) {
    throw new Error('Invalid encrypted email format');
  }

  const iv = Buffer.from(parts[0], 'hex');
  const authTag = Buffer.from(parts[1], 'hex');
  const encrypted = Buffer.from(parts[2], 'hex');

  const decipher = createDecipheriv('aes-256-gcm', getKey(), iv, { authTagLength: AUTH_TAG_LENGTH });
  decipher.setAuthTag(authTag);

  const decrypted = Buffer.concat([
    decipher.update(encrypted),
    decipher.final(),
  ]);

  return decrypted.toString('utf8');
}