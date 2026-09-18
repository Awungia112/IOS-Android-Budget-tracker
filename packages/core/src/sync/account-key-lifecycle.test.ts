// @vitest-environment node

import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { resetPrivateKeyStoreMock } from '../crypto/private-key-store-plugin.test-mock.js';

vi.mock('../crypto/private-key-store-plugin', () => import('../crypto/private-key-store-plugin.test-mock'));

import {
  generateAccountKey,
  loadAccountKey,
  unwrapAccountKey,
  wrapAccountKey,
} from '../crypto/index.js';
import { generateKeypair, publicKeyToBase64url } from '../crypto/keys.js';
import { db } from '../db/index.js';
import type { OnlineAccountsClient } from './online-accounts-client.js';
import {
  getAccountSyncMetadata,
  upsertAccountSyncMetadata,
} from './account-sync-metadata.js';
import {
  fetchUnwrapAndStoreAccountKey,
  provisionAccountKeyForFirstSync,
  rotateAccountKeyAfterMemberRemoval,
} from './account-key-lifecycle.js';
import { pendingKeyRotationService } from './pending-key-rotation.js';
import { pendingKeyDeliveryQueue } from './pending-key-delivery.js';
import {
  deliverAccountKeyToRecipient,
   processPendingKeyDeliveries,
   processPendingKeyRequests,
 } from './account-key-lifecycle.js';

const LOCAL_ACCOUNT_ID = 'main-account';
const SERVER_ACCOUNT_ID = '11111111-1111-4111-8111-111111111111';

/**
 * Creates a mock OnlineAccountsClient with all required methods.
 * All methods throw errors by default to ensure tests explicitly mock the methods they use.
 */
function createMockOnlineAccountsClient(): OnlineAccountsClient {
  return {
    listAccounts: vi.fn(async () => {
      throw new Error('unexpected listAccounts call');
    }),
    createAccount: vi.fn(async () => {
      throw new Error('unexpected createAccount call');
    }),
    getAccountKey: vi.fn(async () => {
      throw new Error('unexpected getAccountKey call');
    }),
    pushChangeRecords: vi.fn(async () => {
      throw new Error('unexpected pushChangeRecords call');
    }),
    pullChangeRecords: vi.fn(async () => {
      throw new Error('unexpected pullChangeRecords call');
    }),
    pollPendingKeyRequests: vi.fn(async () => {
      throw new Error('unexpected pollPendingKeyRequests call');
    }),
    getRecipientPublicKey: vi.fn(async () => {
      throw new Error('unexpected getRecipientPublicKey call');
    }),
    deliverAccountKey: vi.fn(async () => {
      throw new Error('unexpected deliverAccountKey call');
    }),
    getAccountMembers: vi.fn(async () => {
      throw new Error('unexpected getAccountMembers call');
    }),
    removeAccountMember: vi.fn(async () => {
      throw new Error('unexpected removeAccountMember call');
    }),
    removeAccountMemberAndUploadWrappedKeys: vi.fn(async () => {
      throw new Error('unexpected removeAccountMemberAndUploadWrappedKeys call');
    }),
    batchUploadWrappedKeys: vi.fn(async () => {
      throw new Error('unexpected batchUploadWrappedKeys call');
    }),
    getSharingInfo: vi.fn(async () => {
      throw new Error('unexpected getSharingInfo call');
    }),
    inviteMember: vi.fn(async () => {
      throw new Error('unexpected inviteMember call');
    }),
    cancelInvite: vi.fn(async () => {
      throw new Error('unexpected cancelInvite call');
    }),
    removeMember: vi.fn(async () => {
      throw new Error('unexpected removeMember call');
    }),
    listPendingInvitesForMe: vi.fn(async () => {
      throw new Error('unexpected listPendingInvitesForMe call');
    }),
    acceptInvite: vi.fn(async () => {
      throw new Error('unexpected acceptInvite call');
    }),
    declineInvite: vi.fn(async () => {
      throw new Error('unexpected declineInvite call');
    }),
    updateDisplayEmail: vi.fn().mockResolvedValue(undefined),
    deleteAccount: vi.fn(async () => {
      throw new Error('unexpected deleteAccount call');
    }),
    deleteRecoveryData: vi.fn(async () => {
      throw new Error('unexpected deleteRecoveryData call');
    }),
  };
}

beforeEach(async () => {
  resetPrivateKeyStoreMock();
  await db.delete();
  await db.open();
});

describe('provisionAccountKeyForFirstSync', () => {
  it('generates, wraps, uploads, stores, and records local metadata', async () => {
    const { publicKey, privateKey } = await generateKeypair();
    const client = createMockOnlineAccountsClient();
    const createAccount = vi.fn<OnlineAccountsClient['createAccount']>(async () => ({
      id: SERVER_ACCOUNT_ID,
      keyEpoch: 1 as const,
    }));
    client.createAccount = createAccount;

    const result = await provisionAccountKeyForFirstSync({
      localAccountId: LOCAL_ACCOUNT_ID,
      userPublicKey: publicKey,
      client,
    });

    expect(result).toEqual({ serverAccountId: SERVER_ACCOUNT_ID, keyEpoch: 1 });
    expect(createAccount).toHaveBeenCalledOnce();
    const createInput = createAccount.mock.calls[0]![0];
    expect(createInput.epoch).toBe(1);

    const storedKey = await loadAccountKey(SERVER_ACCOUNT_ID);
    expect(storedKey).not.toBeNull();
    const unwrapped = await unwrapAccountKey(
      createInput.wrappedKey,
      publicKey,
      privateKey,
    );
    expect(storedKey).toEqual(unwrapped);

    await expect(getAccountSyncMetadata(LOCAL_ACCOUNT_ID)).resolves.toMatchObject({
      localAccountId: LOCAL_ACCOUNT_ID,
      serverAccountId: SERVER_ACCOUNT_ID,
      keyEpoch: 1,
    });
  });
});

describe('fetchUnwrapAndStoreAccountKey', () => {
  it('fetches a wrapped key, unwraps it, stores it, and updates existing metadata', async () => {
    const { publicKey, privateKey } = await generateKeypair();
    const accountKey = await generateAccountKey();
    const wrappedKey = await wrapAccountKey(accountKey, publicKey);
    const client = createMockOnlineAccountsClient();
    const getAccountKey = vi.fn<OnlineAccountsClient['getAccountKey']>(async () => ({
      accountId: SERVER_ACCOUNT_ID,
      epoch: 2,
      wrappedKey,
    }));
    client.getAccountKey = getAccountKey;

    await upsertAccountSyncMetadata({
      localAccountId: LOCAL_ACCOUNT_ID,
      serverAccountId: SERVER_ACCOUNT_ID,
      keyEpoch: 1,
    });

    const result = await fetchUnwrapAndStoreAccountKey({
      serverAccountId: SERVER_ACCOUNT_ID,
      userPublicKey: publicKey,
      userPrivateKey: privateKey,
      client,
      epoch: 2,
    });

    expect(result).toEqual({ keyEpoch: 2 });
    expect(getAccountKey).toHaveBeenCalledWith({
      accountId: SERVER_ACCOUNT_ID,
      epoch: 2,
    });
    await expect(loadAccountKey(SERVER_ACCOUNT_ID)).resolves.toEqual(accountKey);
    await expect(getAccountSyncMetadata(LOCAL_ACCOUNT_ID)).resolves.toMatchObject({
      keyEpoch: 2,
      serverAccountId: SERVER_ACCOUNT_ID,
    });
  });

  it('stores the key even when local metadata does not exist yet', async () => {
    const { publicKey, privateKey } = await generateKeypair();
    const accountKey = await generateAccountKey();
    const wrappedKey = await wrapAccountKey(accountKey, publicKey);
    const client = createMockOnlineAccountsClient();
    client.getAccountKey = vi.fn(async () => ({
      accountId: SERVER_ACCOUNT_ID,
      epoch: 1,
      wrappedKey,
    }));

    await fetchUnwrapAndStoreAccountKey({
      serverAccountId: SERVER_ACCOUNT_ID,
      userPublicKey: publicKey,
      userPrivateKey: privateKey,
      client,
    });

    await expect(loadAccountKey(SERVER_ACCOUNT_ID)).resolves.toEqual(accountKey);
  });
});

describe('rotateAccountKeyAfterMemberRemoval', () => {
  it('generates new key, wraps for remaining members, removes member, uploads keys, and stores locally', async () => {
    const { publicKey: ownerPublicKey, privateKey: ownerPrivateKey } = await generateKeypair();
    const { publicKey: memberPublicKey } = await generateKeypair();
    const client = createMockOnlineAccountsClient();

    // Mock the atomic remove-and-upload operation to increment epoch
    const removeAccountMemberAndUploadWrappedKeys = vi.fn<OnlineAccountsClient['removeAccountMemberAndUploadWrappedKeys']>(
      async () => ({ newEpoch: 2 }),
    );
    client.removeAccountMemberAndUploadWrappedKeys = removeAccountMemberAndUploadWrappedKeys;

    // Setup initial metadata
    await upsertAccountSyncMetadata({
      localAccountId: LOCAL_ACCOUNT_ID,
      serverAccountId: SERVER_ACCOUNT_ID,
      keyEpoch: 1,
    });

    const result = await rotateAccountKeyAfterMemberRemoval({
      localAccountId: LOCAL_ACCOUNT_ID,
      serverAccountId: SERVER_ACCOUNT_ID,
      userIdToRemove: 'user-to-remove',
      remainingMembers: [
        { userId: 'owner-id', publicKey: publicKeyToBase64url(ownerPublicKey) },
        { userId: 'member-id', publicKey: publicKeyToBase64url(memberPublicKey) },
      ],
      ownerPublicKey,
      ownerPrivateKey,
      client,
    });

    expect(result).toEqual({ newEpoch: 2 });
    expect(removeAccountMemberAndUploadWrappedKeys).toHaveBeenCalledWith({
      accountId: SERVER_ACCOUNT_ID,
      userIdToRemove: 'user-to-remove',
      wrappedKeys: expect.arrayContaining([
        expect.objectContaining({ userId: 'owner-id' }),
        expect.objectContaining({ userId: 'member-id' }),
      ]),
    });

    // Verify new key is stored locally
    const storedKey = await loadAccountKey(SERVER_ACCOUNT_ID);
    expect(storedKey).not.toBeNull();

    // Verify metadata is updated with new epoch
    const metadata = await getAccountSyncMetadata(LOCAL_ACCOUNT_ID);
    expect(metadata?.keyEpoch).toBe(2);
  });

  it('throws when removeAccountMember fails', async () => {
    const { publicKey: ownerPublicKey, privateKey: ownerPrivateKey } = await generateKeypair();
    const { publicKey: memberPublicKey } = await generateKeypair();
    const client = createMockOnlineAccountsClient();

    client.removeAccountMemberAndUploadWrappedKeys = vi.fn(async () => {
      throw new Error('Network error');
    });

    await expect(
      rotateAccountKeyAfterMemberRemoval({
        localAccountId: LOCAL_ACCOUNT_ID,
        serverAccountId: SERVER_ACCOUNT_ID,
        userIdToRemove: 'user-to-remove',
        remainingMembers: [
          { userId: 'owner-id', publicKey: publicKeyToBase64url(ownerPublicKey) },
          { userId: 'member-id', publicKey: publicKeyToBase64url(memberPublicKey) },
        ],
        ownerPublicKey,
        ownerPrivateKey,
        client,
      }),
    ).rejects.toThrow('Network error');
  });

  it('throws when the combined remove-and-upload operation fails', async () => {
    const { publicKey: ownerPublicKey, privateKey: ownerPrivateKey } = await generateKeypair();
    const { publicKey: memberPublicKey } = await generateKeypair();
    const client = createMockOnlineAccountsClient();

    client.removeAccountMemberAndUploadWrappedKeys = vi.fn(async () => {
      throw new Error('Upload failed');
    });

    await expect(
      rotateAccountKeyAfterMemberRemoval({
        localAccountId: LOCAL_ACCOUNT_ID,
        serverAccountId: SERVER_ACCOUNT_ID,
        userIdToRemove: 'user-to-remove',
        remainingMembers: [
          { userId: 'owner-id', publicKey: publicKeyToBase64url(ownerPublicKey) },
          { userId: 'member-id', publicKey: publicKeyToBase64url(memberPublicKey) },
        ],
        ownerPublicKey,
        ownerPrivateKey,
        client,
      }),
    ).rejects.toThrow('Upload failed');
  });

  it('persists wrapped keys to pending rotation queue when upload fails, allowing retry', async () => {
    const { publicKey: ownerPublicKey, privateKey: ownerPrivateKey } = await generateKeypair();
    const { publicKey: memberPublicKey } = await generateKeypair();
    const client = createMockOnlineAccountsClient();

    // Simulate upload failure (e.g., network timeout)
    client.removeAccountMemberAndUploadWrappedKeys = vi.fn(async () => {
      throw new Error('Network timeout');
    });

    // Clear any previous pending rotations
    await pendingKeyRotationService.deleteAccountRotations(LOCAL_ACCOUNT_ID);

    // Attempt member removal (will fail on upload)
    await expect(
      rotateAccountKeyAfterMemberRemoval({
        localAccountId: LOCAL_ACCOUNT_ID,
        serverAccountId: SERVER_ACCOUNT_ID,
        userIdToRemove: 'user-to-remove',
        remainingMembers: [
          { userId: 'owner-id', publicKey: publicKeyToBase64url(ownerPublicKey) },
          { userId: 'member-id', publicKey: publicKeyToBase64url(memberPublicKey) },
        ],
        ownerPublicKey,
        ownerPrivateKey,
        client,
      }),
    ).rejects.toThrow('Network timeout');

    // Verify pending rotation was stored (recovery point)
    const pendingRotations = await pendingKeyRotationService.getPendingRotationsByAccount(
      LOCAL_ACCOUNT_ID,
    );
    expect(pendingRotations).toHaveLength(1);

    const pending = pendingRotations[0];
    expect(pending.userIdToRemove).toBe('user-to-remove');
    expect(pending.wrappedKeys).toHaveLength(2); // owner + member
    expect(pending.wrappedKeys.map((wk) => wk.userId).sort()).toEqual([
      'member-id',
      'owner-id',
    ]);

    // Now simulate successful retry
    client.removeAccountMemberAndUploadWrappedKeys = vi.fn(async () => ({
      status: 'ok',
      newEpoch: 2,
    }));

    // Sync engine should be able to retry using the stored pending rotation
    const retryResult = await rotateAccountKeyAfterMemberRemoval({
      localAccountId: LOCAL_ACCOUNT_ID,
      serverAccountId: SERVER_ACCOUNT_ID,
      userIdToRemove: 'user-to-remove',
      remainingMembers: [
        { userId: 'owner-id', publicKey: publicKeyToBase64url(ownerPublicKey) },
        { userId: 'member-id', publicKey: publicKeyToBase64url(memberPublicKey) },
      ],
      ownerPublicKey,
      ownerPrivateKey,
      client,
    });

    expect(retryResult.newEpoch).toBe(2);

// After successful upload, pending rotation should be cleaned up
     const pendingAfterRetry =
       await pendingKeyRotationService.getPendingRotationsByAccount(LOCAL_ACCOUNT_ID);
     expect(pendingAfterRetry).toHaveLength(0);
   });
 });

describe('deliverAccountKeyToRecipient', () => {
   const RECIPIENT_USER_ID = '22222222-2222-4222-8222-222222222222';

   beforeEach(async () => {
     await pendingKeyDeliveryQueue.clear();
   });

   it('wraps account key with recipient public key and delivers immediately', async () => {
     const { publicKey, privateKey } = await generateKeypair();
     const accountKey = await generateAccountKey();
     const recipientPublicKey = publicKeyToBase64url(publicKey);
     const client = createMockOnlineAccountsClient();

     const deliverAccountKey = vi.fn<OnlineAccountsClient['deliverAccountKey']>(async () => ({ status: 'ok' }));
     client.deliverAccountKey = deliverAccountKey;

     await deliverAccountKeyToRecipient({
       serverAccountId: SERVER_ACCOUNT_ID,
       recipientUserId: RECIPIENT_USER_ID,
       recipientPublicKey,
       accountKey,
       epoch: 1,
       client,
     });

     expect(deliverAccountKey).toHaveBeenCalledWith({
       accountId: SERVER_ACCOUNT_ID,
       userId: RECIPIENT_USER_ID,
       wrappedKey: expect.objectContaining({
         v: 1,
         alg: 'x25519-xsalsa20-poly1305',
       }),
       epoch: 1,
     });

     // Verify no pending deliveries remain
     const pending = await pendingKeyDeliveryQueue.getAll();
     expect(pending).toHaveLength(0);
   });

   it('wraps for recipient and unwraps with recipient private key produces original account key', async () => {
     const { publicKey, privateKey } = await generateKeypair();
     const accountKey = await generateAccountKey();
     const recipientPublicKey = publicKeyToBase64url(publicKey);
     const client = createMockOnlineAccountsClient();

     const deliverAccountKey = vi.fn<OnlineAccountsClient['deliverAccountKey']>(async () => ({ status: 'ok' }));
     client.deliverAccountKey = deliverAccountKey;

     await deliverAccountKeyToRecipient({
       serverAccountId: SERVER_ACCOUNT_ID,
       recipientUserId: RECIPIENT_USER_ID,
       recipientPublicKey,
       accountKey,
       epoch: 1,
       client,
     });

     const wrappedKey = deliverAccountKey.mock.calls[0]![0].wrappedKey;
     const unwrapped = await unwrapAccountKey(wrappedKey, publicKey, privateKey);
     expect(unwrapped).toEqual(accountKey);
   });

   it('persists to queue when deliver fails and throws', async () => {
     const { publicKey } = await generateKeypair();
     const accountKey = await generateAccountKey();
     const recipientPublicKey = publicKeyToBase64url(publicKey);
     const client = createMockOnlineAccountsClient();

     client.deliverAccountKey = vi.fn(async () => {
       throw new Error('Network error');
     });

     await expect(
       deliverAccountKeyToRecipient({
         serverAccountId: SERVER_ACCOUNT_ID,
         recipientUserId: RECIPIENT_USER_ID,
         recipientPublicKey,
         accountKey,
         epoch: 1,
         client,
       }),
     ).rejects.toThrow('Network error');

     const pending = await pendingKeyDeliveryQueue.getAll();
     expect(pending).toHaveLength(1);
     expect(pending[0]!.recipientUserId).toBe(RECIPIENT_USER_ID);
     expect(pending[0]!.recipientPublicKey).toBe(recipientPublicKey);
   });

   it('does not persist to queue for logical delivery failures', async () => {
     const { publicKey } = await generateKeypair();
     const accountKey = await generateAccountKey();
     const recipientPublicKey = publicKeyToBase64url(publicKey);
     const client = createMockOnlineAccountsClient();

     client.deliverAccountKey = vi.fn(async () => {
       throw new Error('Online accounts request failed with HTTP 409');
     });

     await expect(
       deliverAccountKeyToRecipient({
         serverAccountId: SERVER_ACCOUNT_ID,
         recipientUserId: RECIPIENT_USER_ID,
         recipientPublicKey,
         accountKey,
         epoch: 1,
         client,
       }),
     ).rejects.toThrow('Online accounts request failed with HTTP 409');

     const pending = await pendingKeyDeliveryQueue.getAll();
     expect(pending).toHaveLength(0);
   });

   it('polls pending key requests and delivers wrapped keys using fetched recipient public keys', async () => {
     const { publicKey } = await generateKeypair();
     const accountKey = await generateAccountKey();
     const recipientPublicKey = publicKeyToBase64url(publicKey);
     const client = createMockOnlineAccountsClient();

     client.pollPendingKeyRequests = vi.fn(async () => ({
       pendingKeyDeliveries: [
         {
           inviteId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
           recipientUserId: RECIPIENT_USER_ID,
           recipientPublicKey,
         },
       ],
     }));

     client.getRecipientPublicKey = vi.fn(async () => ({ publicKey: recipientPublicKey }));
     const deliverAccountKey = vi.fn<OnlineAccountsClient['deliverAccountKey']>(async () => ({ status: 'ok' }));
     client.deliverAccountKey = deliverAccountKey;

     await processPendingKeyRequests({
       serverAccountId: SERVER_ACCOUNT_ID,
       accountKey,
       epoch: 1,
       client,
     });

     expect(client.getRecipientPublicKey).toHaveBeenCalledWith({ userId: RECIPIENT_USER_ID });
     expect(deliverAccountKey).toHaveBeenCalledWith({
       accountId: SERVER_ACCOUNT_ID,
       userId: RECIPIENT_USER_ID,
       wrappedKey: expect.objectContaining({ alg: 'x25519-xsalsa20-poly1305' }),
       epoch: 1,
     });
   });

   it('does not abort sync when polling pending key requests fails', async () => {
     const accountKey = await generateAccountKey();
     const client = createMockOnlineAccountsClient();

     client.pollPendingKeyRequests = vi.fn(async () => {
       throw new Error('network failure');
     });

     const result = await processPendingKeyRequests({
       serverAccountId: SERVER_ACCOUNT_ID,
       accountKey,
       epoch: 1,
       client,
     });

     expect(result).toEqual([]);
     expect(client.pollPendingKeyRequests).toHaveBeenCalledWith({ accountId: SERVER_ACCOUNT_ID });
   });

   it('throws error for invalid public key format', async () => {
     const accountKey = await generateAccountKey();
     const client = createMockOnlineAccountsClient();

     await expect(
       deliverAccountKeyToRecipient({
         serverAccountId: SERVER_ACCOUNT_ID,
         recipientUserId: RECIPIENT_USER_ID,
         recipientPublicKey: 'invalid-key',
         accountKey,
         epoch: 1,
         client,
       }),
     ).rejects.toThrow('Invalid recipient public key format');
   });
 });

describe('processPendingKeyDeliveries', () => {
   const RECIPIENT_USER_ID = '22222222-2222-4222-8222-222222222222';

   beforeEach(async () => {
     await pendingKeyDeliveryQueue.clear();
   });

   it('delivers pending keys and removes them from queue on success', async () => {
     const { publicKey } = await generateKeypair();
     const accountKey = await generateAccountKey();
     const recipientPublicKey = publicKeyToBase64url(publicKey);
     const wrappedKey = await wrapAccountKey(accountKey, publicKey);

     // Pre-populate queue with a pending delivery
     await pendingKeyDeliveryQueue.enqueue({
       serverAccountId: SERVER_ACCOUNT_ID,
       recipientUserId: RECIPIENT_USER_ID,
       recipientPublicKey,
       wrappedKey,
       epoch: 1,
     });

     const client = createMockOnlineAccountsClient();
     const deliverAccountKey = vi.fn<OnlineAccountsClient['deliverAccountKey']>(async () => ({ status: 'ok' }));
     client.deliverAccountKey = deliverAccountKey;

     await processPendingKeyDeliveries(client);

     expect(deliverAccountKey).toHaveBeenCalledOnce();
     const pending = await pendingKeyDeliveryQueue.getAll();
     expect(pending).toHaveLength(0);
   });

   it('keeps failed deliveries in queue for retry', async () => {
     const { publicKey } = await generateKeypair();
     const accountKey = await generateAccountKey();
     const recipientPublicKey = publicKeyToBase64url(publicKey);
     const wrappedKey = await wrapAccountKey(accountKey, publicKey);

     await pendingKeyDeliveryQueue.enqueue({
       serverAccountId: SERVER_ACCOUNT_ID,
       recipientUserId: RECIPIENT_USER_ID,
       recipientPublicKey,
       wrappedKey,
       epoch: 1,
     });

     const client = createMockOnlineAccountsClient();
     client.deliverAccountKey = vi.fn(async () => {
       throw new Error('Network error');
     });

     await processPendingKeyDeliveries(client);

     const pending = await pendingKeyDeliveryQueue.getAll();
     expect(pending).toHaveLength(1);
   });

   it('keeps 429 rate-limit failures in queue for retry', async () => {
     const { publicKey } = await generateKeypair();
     const accountKey = await generateAccountKey();
     const recipientPublicKey = publicKeyToBase64url(publicKey);
     const wrappedKey = await wrapAccountKey(accountKey, publicKey);

     await pendingKeyDeliveryQueue.enqueue({
       serverAccountId: SERVER_ACCOUNT_ID,
       recipientUserId: RECIPIENT_USER_ID,
       recipientPublicKey,
       wrappedKey,
       epoch: 1,
     });

     const client = createMockOnlineAccountsClient();
     client.deliverAccountKey = vi.fn(async () => {
       throw new Error('HTTP 429 Too Many Requests');
     });

     await processPendingKeyDeliveries(client);

     const pending = await pendingKeyDeliveryQueue.getAll();
     expect(pending).toHaveLength(1);
   });

   it('removes permanently failed deliveries from queue', async () => {
     const { publicKey } = await generateKeypair();
     const accountKey = await generateAccountKey();
     const recipientPublicKey = publicKeyToBase64url(publicKey);
     const wrappedKey = await wrapAccountKey(accountKey, publicKey);

     await pendingKeyDeliveryQueue.enqueue({
       serverAccountId: SERVER_ACCOUNT_ID,
       recipientUserId: RECIPIENT_USER_ID,
       recipientPublicKey,
       wrappedKey,
       epoch: 1,
     });

     const client = createMockOnlineAccountsClient();
     client.deliverAccountKey = vi.fn(async () => {
       throw new Error('HTTP 404 Not Found');
     });

     await processPendingKeyDeliveries(client);

     const pending = await pendingKeyDeliveryQueue.getAll();
     expect(pending).toHaveLength(0);
   });
 });
