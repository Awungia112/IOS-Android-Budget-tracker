import sodium from 'libsodium-wrappers';
import {
  fromBase64url,
  toBase64url,
  unwrapKey,
  wrapKey,
  type AsymmetricEnvelope,
} from './envelope.js';
import { PrivateKeyStore } from './private-key-store-plugin.js';

export const ACCOUNT_KEY_BYTES = 32;
export const ACCOUNT_KEY_SERVICE_PREFIX = 'com.budget.accountkey';

async function getSodium(): Promise<typeof sodium> {
  await sodium.ready;
  return sodium;
}

function assertAccountKey(accountKey: Uint8Array): void {
  if (accountKey.length !== ACCOUNT_KEY_BYTES) {
    throw new Error(`Account key must be ${ACCOUNT_KEY_BYTES} bytes`);
  }
}

function isMissingSecureStorageItem(error: unknown): boolean {
  if (!(error instanceof Error)) return false;

  const message = error.message.toLowerCase();
  return (
    message.includes('not found') ||
    message.includes('does not exist') ||
    message.includes('item not found')
  );
}

export async function generateAccountKey(): Promise<Uint8Array> {
  const sodiumReady = await getSodium();
  return sodiumReady.randombytes_buf(ACCOUNT_KEY_BYTES);
}

export async function wrapAccountKey(
  accountKey: Uint8Array,
  recipientPublicKey: Uint8Array,
): Promise<AsymmetricEnvelope> {
  assertAccountKey(accountKey);
  return wrapKey(accountKey, recipientPublicKey);
}

export async function unwrapAccountKey(
  envelope: AsymmetricEnvelope,
  recipientPublicKey: Uint8Array,
  recipientPrivateKey: Uint8Array,
): Promise<Uint8Array> {
  const accountKey = await unwrapKey(envelope, recipientPublicKey, recipientPrivateKey);
  assertAccountKey(accountKey);
  return accountKey;
}

export function accountKeyServiceName(accountId: string): string {
  if (accountId.trim() === '') {
    throw new Error('Account ID is required');
  }

  return `${ACCOUNT_KEY_SERVICE_PREFIX}.${accountId}`;
}

export async function storeAccountKey(
  accountId: string,
  accountKey: Uint8Array,
): Promise<void> {
  assertAccountKey(accountKey);

  await PrivateKeyStore.set({
    service: accountKeyServiceName(accountId),
    value: await toBase64url(accountKey),
  });
}

export async function loadAccountKey(accountId: string): Promise<Uint8Array | null> {
  try {
    const { value } = await PrivateKeyStore.get({
      service: accountKeyServiceName(accountId),
    });
    const accountKey = await fromBase64url(value);
    assertAccountKey(accountKey);
    return accountKey;
  } catch (error) {
    if (isMissingSecureStorageItem(error)) {
      return null;
    }

    throw error;
  }
}

export async function deleteAccountKey(accountId: string): Promise<void> {
  await PrivateKeyStore.remove({
    service: accountKeyServiceName(accountId),
  });
}
