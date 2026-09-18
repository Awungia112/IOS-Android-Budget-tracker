import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  privateKeyStoreMockStore,
  resetPrivateKeyStoreMock,
} from './private-key-store-plugin.test-mock.js';

vi.mock('./private-key-store-plugin', () => import('./private-key-store-plugin.test-mock'));

import {
  generateKeypair,
  publicKeyToBase64url,
  checkHardwareKeystore,
  storePrivateKey,
  loadPrivateKey,
  deletePrivateKey,
} from './keys.js';

const USER_ID = 'test-user-abc123';

beforeEach(() => {
  resetPrivateKeyStoreMock();
});

describe('generateKeypair', () => {
  it('returns 32-byte X25519 public and private keys', async () => {
    const { publicKey, privateKey } = await generateKeypair();

    expect(publicKey).toBeInstanceOf(Uint8Array);
    expect(publicKey.byteLength).toBe(32);
    expect(privateKey).toBeInstanceOf(Uint8Array);
    expect(privateKey.byteLength).toBe(32);
  });

  it('produces a different keypair on each call', async () => {
    const kp1 = await generateKeypair();
    const kp2 = await generateKeypair();

    expect(kp1.publicKey).not.toEqual(kp2.publicKey);
    expect(kp1.privateKey).not.toEqual(kp2.privateKey);
  });
});

describe('publicKeyToBase64url', () => {
  it('encodes a 32-byte key as 43 base64url characters with no padding', async () => {
    const { publicKey } = await generateKeypair();
    const encoded = publicKeyToBase64url(publicKey);

    expect(typeof encoded).toBe('string');
    expect(encoded).toHaveLength(43);
    expect(encoded).not.toMatch(/[+/=]/);
  });

  it('can be called without prior sodium initialisation', () => {
    const bytes = new Uint8Array(32).fill(0xff);
    expect(() => publicKeyToBase64url(bytes)).not.toThrow();
    expect(publicKeyToBase64url(bytes)).toHaveLength(43);
  });
});

describe('checkHardwareKeystore', () => {
  it('returns the hardwareBacked flag from the native plugin', async () => {
    const result = await checkHardwareKeystore();
    expect(result).toEqual({ hardwareBacked: true });
  });
});

describe('generate → store → load round-trip', () => {
  it('loads back the same bytes that were stored', async () => {
    const { privateKey } = await generateKeypair();

    await storePrivateKey(USER_ID, privateKey);
    const loaded = await loadPrivateKey(USER_ID);

    expect(loaded).not.toBeNull();
    expect(loaded).toEqual(privateKey);
  });

  it('stored bytes in the mock match the original private key bytes', async () => {
    const { privateKey } = await generateKeypair();
    await storePrivateKey(USER_ID, privateKey);

    const raw = privateKeyStoreMockStore.get(`de.deutschlandimplus.meinbudget.privatekey.${USER_ID}`);
    expect(raw).toBeDefined();
    const decoded = Uint8Array.from(atob(raw), (c) => c.codePointAt(0) ?? 0);
    expect(decoded).toEqual(privateKey);
  });
});

describe('loadPrivateKey', () => {
  it('returns null for an unknown userId', async () => {
    const result = await loadPrivateKey('nonexistent-user');
    expect(result).toBeNull();
  });
});

describe('deletePrivateKey', () => {
  it('causes loadPrivateKey to return null after deletion', async () => {
    const { privateKey } = await generateKeypair();
    await storePrivateKey(USER_ID, privateKey);

    await deletePrivateKey(USER_ID);
    const loaded = await loadPrivateKey(USER_ID);

    expect(loaded).toBeNull();
  });

  it('is a no-op when the key was never stored', async () => {
    await expect(deletePrivateKey('never-stored-user')).resolves.not.toThrow();
  });
});
