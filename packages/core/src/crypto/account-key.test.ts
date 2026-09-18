// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  privateKeyStoreMockStore,
  resetPrivateKeyStoreMock,
} from './private-key-store-plugin.test-mock.js';

vi.mock('./private-key-store-plugin', () => import('./private-key-store-plugin.test-mock'));

import {
  ACCOUNT_KEY_BYTES,
  accountKeyServiceName,
  deleteAccountKey,
  generateAccountKey,
  loadAccountKey,
  storeAccountKey,
  unwrapAccountKey,
  wrapAccountKey,
} from './account-key.js';
import { generateKeypair } from './keys.js';
import type { AsymmetricEnvelope } from './envelope.js';

const ACCOUNT_ID = '11111111-1111-4111-8111-111111111111';

beforeEach(() => {
  resetPrivateKeyStoreMock();
});

describe('generateAccountKey', () => {
  it('returns a 32-byte Uint8Array', async () => {
    const accountKey = await generateAccountKey();

    expect(accountKey).toBeInstanceOf(Uint8Array);
    expect(accountKey.byteLength).toBe(ACCOUNT_KEY_BYTES);
  });

  it('produces different account keys', async () => {
    const keyOne = await generateAccountKey();
    const keyTwo = await generateAccountKey();

    expect(keyOne).not.toEqual(keyTwo);
  });
});

describe('wrapAccountKey / unwrapAccountKey', () => {
  it('round-trips an account key', async () => {
    const accountKey = await generateAccountKey();
    const { publicKey, privateKey } = await generateKeypair();
    const envelope = await wrapAccountKey(accountKey, publicKey);

    expect(envelope.alg).toBe('x25519-xsalsa20-poly1305');
    expect(envelope.v).toBe(1);

    const unwrapped = await unwrapAccountKey(envelope, publicKey, privateKey);
    expect(unwrapped).toEqual(accountKey);
  });

  it('throws when the ciphertext is tampered', async () => {
    const accountKey = await generateAccountKey();
    const { publicKey, privateKey } = await generateKeypair();
    const envelope = await wrapAccountKey(accountKey, publicKey);
    const tampered: AsymmetricEnvelope = {
      ...envelope,
      ciphertext: envelope.ciphertext.slice(0, -1) + (envelope.ciphertext.endsWith('A') ? 'B' : 'A'),
    };

    await expect(unwrapAccountKey(tampered, publicKey, privateKey)).rejects.toThrow();
  });

  it('throws when the wrong private key is used', async () => {
    const accountKey = await generateAccountKey();
    const { publicKey } = await generateKeypair();
    const wrongKeypair = await generateKeypair();
    const envelope = await wrapAccountKey(accountKey, publicKey);

    await expect(
      unwrapAccountKey(envelope, publicKey, wrongKeypair.privateKey),
    ).rejects.toThrow();
  });
});

describe('account key secure storage', () => {
  it('uses the canonical native secure-storage service name', () => {
    expect(accountKeyServiceName(ACCOUNT_ID)).toBe(`com.budget.accountkey.${ACCOUNT_ID}`);
  });

  it('stores, loads, and deletes an account key', async () => {
    const accountKey = await generateAccountKey();

    await storeAccountKey(ACCOUNT_ID, accountKey);
    expect(privateKeyStoreMockStore.has(accountKeyServiceName(ACCOUNT_ID))).toBe(true);
    expect(privateKeyStoreMockStore.get(accountKeyServiceName(ACCOUNT_ID))).not.toMatch(/[+/=]/);

    await expect(loadAccountKey(ACCOUNT_ID)).resolves.toEqual(accountKey);

    await deleteAccountKey(ACCOUNT_ID);
    await expect(loadAccountKey(ACCOUNT_ID)).resolves.toBeNull();
  });

  it('returns null when no account key is stored', async () => {
    await expect(loadAccountKey(ACCOUNT_ID)).resolves.toBeNull();
  });

  it('rejects storing the wrong key length', async () => {
    await expect(storeAccountKey(ACCOUNT_ID, new Uint8Array(16))).rejects.toThrow(
      'Account key must be 32 bytes',
    );
  });
});
