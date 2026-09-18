import {
  generateAccountKey,
  storeAccountKey,
  unwrapAccountKey,
  wrapAccountKey,
} from '../crypto/index.js';
import { fromBase64url } from '../crypto/envelope.js';
import { isPublicKeyFormat, publicKeyToBase64url } from '../crypto/keys.js';
import {
  getAccountSyncMetadata,
  updateAccountSyncMetadataEpochByServerId,
  upsertAccountSyncMetadata,
} from './account-sync-metadata.js';
import type { OnlineAccountsClient } from './online-accounts-client.js';
import { pendingKeyRotationService } from './pending-key-rotation.js';
import { pendingKeyDeliveryQueue } from './pending-key-delivery.js';

export interface MemberInfo {
  userId: string;
  publicKey: string;
}

export interface ProvisionAccountKeyForFirstSyncInput {
  localAccountId: string;
  userPublicKey: Uint8Array;
  client: OnlineAccountsClient;
}

export interface FetchUnwrapAndStoreAccountKeyInput {
  serverAccountId: string;
  userPublicKey: Uint8Array;
  userPrivateKey: Uint8Array;
  client: OnlineAccountsClient;
  epoch?: number;
}

export async function provisionAccountKeyForFirstSync(
  input: ProvisionAccountKeyForFirstSyncInput,
): Promise<{ serverAccountId: string; keyEpoch: 1 }> {
  const accountKey = await generateAccountKey();
  const wrappedKey = await wrapAccountKey(accountKey, input.userPublicKey);
  const createdAccount = await input.client.createAccount({
    wrappedKey,
    epoch: 1,
  });

  await storeAccountKey(createdAccount.id, accountKey);
  await upsertAccountSyncMetadata({
    localAccountId: input.localAccountId,
    serverAccountId: createdAccount.id,
    keyEpoch: createdAccount.keyEpoch,
    role: 'owner',
  });

  return {
    serverAccountId: createdAccount.id,
    keyEpoch: createdAccount.keyEpoch,
  };
}

export async function fetchUnwrapAndStoreAccountKey(
  input: FetchUnwrapAndStoreAccountKeyInput,
): Promise<{ keyEpoch: number }> {
  const remoteKey = await input.client.getAccountKey({
    accountId: input.serverAccountId,
    epoch: input.epoch,
  });
  const accountKey = await unwrapAccountKey(
    remoteKey.wrappedKey,
    input.userPublicKey,
    input.userPrivateKey,
  );

  await storeAccountKey(remoteKey.accountId, accountKey);
  await updateAccountSyncMetadataEpochByServerId(remoteKey.accountId, remoteKey.epoch);

  return {
    keyEpoch: remoteKey.epoch,
  };
}

export interface DeliverAccountKeyToRecipientInput {
  serverAccountId: string;
  recipientUserId: string;
  recipientPublicKey: string;
  accountKey: Uint8Array;
  epoch: number;
  client: OnlineAccountsClient;
}

function isTransientDeliveryError(error: unknown): boolean {
  if (error instanceof TypeError) {
    return true;
  }

  if (error instanceof Error) {
    const message = error.message?.toLowerCase() ?? '';
    if (
      message.includes('network') ||
      message.includes('timeout') ||
      message.includes('failed to fetch') ||
      message.includes('failed to connect')
    ) {
      return true;
    }

    const match = message.match(/http (\d{3})/);
    if (match) {
      const statusCode = Number(match[1]);
      return statusCode >= 500 || statusCode === 429;
    }
  }

  return false;
}

export async function deliverAccountKeyToRecipient(
  input: DeliverAccountKeyToRecipientInput,
): Promise<void> {
  // Validate the public key format before use (43-char base64url)
  if (!isPublicKeyFormat(input.recipientPublicKey)) {
    throw new Error('Invalid recipient public key format');
  }

  // Wrap the account key for the recipient
  const publicKeyBytes = await fromBase64url(input.recipientPublicKey);
  const wrappedKey = await wrapAccountKey(input.accountKey, publicKeyBytes);

  try {
    // Attempt to deliver immediately
    await input.client.deliverAccountKey({
      accountId: input.serverAccountId,
      userId: input.recipientUserId,
      wrappedKey,
      epoch: input.epoch,
    });
  } catch (error) {
    if (isTransientDeliveryError(error)) {
      await pendingKeyDeliveryQueue.enqueue({
        serverAccountId: input.serverAccountId,
        recipientUserId: input.recipientUserId,
        recipientPublicKey: input.recipientPublicKey,
        wrappedKey,
        epoch: input.epoch,
      });
    }
    throw error;
  }
}

export interface RestoreAccountFromServerInput {
  serverAccountId: string;
  localAccountId: string;
  userPublicKey: Uint8Array;
  userPrivateKey: Uint8Array;
  client: OnlineAccountsClient;
  role?: 'owner' | 'member';
}

export async function restoreAccountFromServer(
  input: RestoreAccountFromServerInput,
): Promise<{ keyEpoch: number }> {
  const remoteKey = await input.client.getAccountKey({
    accountId: input.serverAccountId,
  });
  const accountKey = await unwrapAccountKey(
    remoteKey.wrappedKey,
    input.userPublicKey,
    input.userPrivateKey,
  );

  await storeAccountKey(remoteKey.accountId, accountKey);
  await upsertAccountSyncMetadata({
    localAccountId: input.localAccountId,
    serverAccountId: remoteKey.accountId,
    keyEpoch: remoteKey.epoch,
    role: input.role ?? 'owner',
  });

  return { keyEpoch: remoteKey.epoch };
}

export interface ProcessPendingKeyRequestsInput {
  serverAccountId: string;
  accountKey: Uint8Array;
  epoch: number;
  client: OnlineAccountsClient;
}

export interface KeyDeliveryResult {
  serverAccountId: string;
  recipientUserId: string;
  success: boolean;
}

export async function processPendingKeyRequests(
  input: ProcessPendingKeyRequestsInput,
): Promise<KeyDeliveryResult[]> {
  const results: KeyDeliveryResult[] = [];
  let pendingRequests;
  try {
    pendingRequests = await input.client.pollPendingKeyRequests({
      accountId: input.serverAccountId,
    });
  } catch (error: any) {
    // 403 is expected when the current user is a member (not owner) of the account.
    // Silently return — only owners can deliver keys.
    const status = error?.status ?? error?.body?.status;
    if (status === 403) return results;
    console.warn('Failed to poll pending account key requests', { error });
    return results;
  }

  for (const pending of pendingRequests.pendingKeyDeliveries) {
    try {
      const { publicKey } = await input.client.getRecipientPublicKey({
        userId: pending.recipientUserId,
      });

      await deliverAccountKeyToRecipient({
        serverAccountId: input.serverAccountId,
        recipientUserId: pending.recipientUserId,
        recipientPublicKey: publicKey,
        accountKey: input.accountKey,
        epoch: input.epoch,
        client: input.client,
      });

      results.push({
        serverAccountId: input.serverAccountId,
        recipientUserId: pending.recipientUserId,
        success: true,
      });
    } catch (error) {
      console.warn(
        'Failed to process pending account key request for invite accept',
        { recipientUserId: pending.recipientUserId, error },
      );
      results.push({
        serverAccountId: input.serverAccountId,
        recipientUserId: pending.recipientUserId,
        success: false,
      });
    }
  }

  return results;
}

export async function processPendingKeyDeliveries(
  client: OnlineAccountsClient,
): Promise<KeyDeliveryResult[]> {
  const results: KeyDeliveryResult[] = [];
  const pending = await pendingKeyDeliveryQueue.getAll();
  const removeIds: string[] = [];

  for (const entry of pending) {
    try {
      await client.deliverAccountKey({
        accountId: entry.serverAccountId,
        userId: entry.recipientUserId,
        wrappedKey: entry.wrappedKey,
        epoch: entry.epoch,
      });
      // Successfully delivered — mark for removal
      removeIds.push(entry.id);
      results.push({
        serverAccountId: entry.serverAccountId,
        recipientUserId: entry.recipientUserId,
        success: true,
      });
    } catch (error) {
      // If the error is non-transient, drop the entry from the queue
      if (!isTransientDeliveryError(error)) {
        console.warn('Permanent failure delivering account key — removing from queue', {
          id: entry.id,
          serverAccountId: entry.serverAccountId,
          recipientUserId: entry.recipientUserId,
          error,
        });
        removeIds.push(entry.id);
        results.push({
          serverAccountId: entry.serverAccountId,
          recipientUserId: entry.recipientUserId,
          success: false,
        });
      } else {
        // Transient error — keep in queue for retry
        console.info('Transient failure delivering account key; will retry later', {
          id: entry.id,
          serverAccountId: entry.serverAccountId,
          recipientUserId: entry.recipientUserId,
        });
        results.push({
          serverAccountId: entry.serverAccountId,
          recipientUserId: entry.recipientUserId,
          success: false,
        });
      }
    }
  }

  if (removeIds.length > 0) {
    await pendingKeyDeliveryQueue.removeMany(removeIds);
  }

  return results;
}

export interface RotateAccountKeyAfterMemberRemovalInput {
  localAccountId: string;
  serverAccountId: string;
  userIdToRemove: string;
  remainingMembers: MemberInfo[];
  ownerPublicKey: Uint8Array;
  ownerPrivateKey: Uint8Array;
  client: OnlineAccountsClient;
}

export async function rotateAccountKeyAfterMemberRemoval(
  input: RotateAccountKeyAfterMemberRemovalInput,
): Promise<{ newEpoch: number }> {
  if (input.remainingMembers.length === 0) {
    throw new Error('Cannot rotate key with no remaining members');
  }

  // Verify that the owner is in the remaining members list
  const ownerPublicKeyBase64url = publicKeyToBase64url(input.ownerPublicKey);
  const ownerInRemainingMembers = input.remainingMembers.some(
    (member) => member.publicKey === ownerPublicKeyBase64url,
  );
  if (!ownerInRemainingMembers) {
    throw new Error('Owner must be included in remaining members');
  }

  // Generate new account key
  const newAccountKey = await generateAccountKey();

  // Wrap the new key for all remaining members (including owner)
  const wrappedKeys = await Promise.all(
    input.remainingMembers.map(async (member) => {
      const publicKeyBytes = await fromBase64url(member.publicKey);
      const wrappedKey = await wrapAccountKey(newAccountKey, publicKeyBytes);
      return {
        userId: member.userId,
        wrappedKey,
      };
    }),
  );

  // Check if there's already a pending rotation for this member removal.
  // This handles retries after network failures.
  const existingRotations = await pendingKeyRotationService.getPendingRotationsByAccount(
    input.localAccountId,
  );
  const existingRotation = existingRotations.find(
    (r) => r.userIdToRemove === input.userIdToRemove,
  );

  let pendingRotationId: string;

  if (existingRotation) {
    // Use existing pending rotation ID for retries
    pendingRotationId = existingRotation.id;
  } else {
    // First attempt: create new pending rotation
    // Note: We don't know the final epoch yet, so assume it will increment by 1.
    const currentMetadata = await getAccountSyncMetadata(input.localAccountId);
    const newEpoch = (currentMetadata?.keyEpoch ?? 0) + 1;

    pendingRotationId = await pendingKeyRotationService.createPendingRotation(
      input.localAccountId,
      input.serverAccountId,
      input.userIdToRemove,
      newEpoch,
      wrappedKeys,
    );
  }

  try {
    const result = await input.client.removeAccountMemberAndUploadWrappedKeys({
      accountId: input.serverAccountId,
      userIdToRemove: input.userIdToRemove,
      wrappedKeys,
    });

    // Store the new key locally
    await storeAccountKey(input.serverAccountId, newAccountKey);

    // Update local metadata with actual new epoch from server
    await updateAccountSyncMetadataEpochByServerId(
      input.serverAccountId,
      result.newEpoch,
    );

    // Upload succeeded - delete pending rotation
    await pendingKeyRotationService.deletePendingRotation(pendingRotationId);

    return {
      newEpoch: result.newEpoch,
    };
  } catch (error) {
    // Upload failed - pending rotation persists for retry on next sync
    // The sync engine should detect pending rotations and retry them
    throw error;
  }
}
