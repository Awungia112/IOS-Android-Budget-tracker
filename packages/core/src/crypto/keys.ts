import { getSodium } from './sodium.js';
import { PrivateKeyStore } from './private-key-store-plugin.js';

export interface Keypair {
  publicKey: Uint8Array;
  privateKey: Uint8Array;
}

export interface KeystoreCapability {
  hardwareBacked: boolean;
}

/** Length of a base64url-encoded X25519 public key. */
export const PUBLIC_KEY_BASE64URL_LENGTH = 43;

const PUBLIC_KEY_BASE64URL_CHARS = /^[A-Za-z0-9_-]+$/;

export function isPublicKeyFormat(value: string): boolean {
  return value.length === PUBLIC_KEY_BASE64URL_LENGTH && PUBLIC_KEY_BASE64URL_CHARS.test(value);
}

function storageKey(userId: string): string {
  return `de.deutschlandimplus.meinbudget.privatekey.${userId}`;
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (const b of bytes) binary += String.fromCodePoint(b);
  return btoa(binary);
}

function base64ToBytes(b64: string): Uint8Array {
  const binary = atob(b64);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.codePointAt(i) ?? 0;
  return out;
}

export async function generateKeypair(): Promise<Keypair> {
  const sod = await getSodium();
  const pair = sod.crypto_box_keypair();
  return {
    publicKey: new Uint8Array(pair.publicKey),
    privateKey: new Uint8Array(pair.privateKey),
  };
}

/**
 * Encodes a 32-byte X25519 public key as a 43-character base64url string
 * (no padding). Safe to call without prior sodium initialisation — uses
 * only btoa() and string replacement, no libsodium.
 */
export function publicKeyToBase64url(publicKey: Uint8Array): string {
  return bytesToBase64(publicKey)
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replaceAll('=', '');
}

/**
 * Returns whether the device's private-key store is backed by a hardware
 * security module. Call this during registration and surface a warning if
 * hardwareBacked is false — the private key will still be stored but without
 * hardware-level protection.
 */
export async function checkHardwareKeystore(): Promise<KeystoreCapability> {
  const { value } = await PrivateKeyStore.isHardwareBacked();
  return { hardwareBacked: value };
}

export async function storePrivateKey(userId: string, key: Uint8Array): Promise<void> {
  await PrivateKeyStore.set({
    service: storageKey(userId),
    value: bytesToBase64(key),
  });
}

export async function loadPrivateKey(userId: string): Promise<Uint8Array | null> {
  try {
    const { value } = await PrivateKeyStore.get({ service: storageKey(userId) });
    return base64ToBytes(value);
  } catch (err) {
    // The native plugin throws when the key does not exist. Re-throw anything
    // that looks like an unexpected error so callers aren't silently misled.
    const message = err instanceof Error ? err.message : String(err);
    if (message.toLowerCase().includes('does not exist') || message.toLowerCase().includes('not found')) {
      return null;
    }
    throw err;
  }
}

export async function getPublicKey(userId: string): Promise<Uint8Array | null> {
  const privateKey = await loadPrivateKey(userId);
  if (!privateKey) return null;
  const sod = await getSodium();
  return sod.crypto_scalarmult_base(privateKey);
}

export async function deletePrivateKey(userId: string): Promise<void> {
  try {
    await PrivateKeyStore.remove({ service: storageKey(userId) });
  } catch {
    // Key may not exist; treat as a no-op.
  }
}
