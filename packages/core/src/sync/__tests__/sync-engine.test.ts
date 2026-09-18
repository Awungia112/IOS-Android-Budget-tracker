// @vitest-environment node

import 'fake-indexeddb/auto';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { SyncEngine } from '../sync-engine.js';
import {
  getAccountSyncMetadata,
  upsertAccountSyncMetadata,
} from '../account-sync-metadata.js';
import type { OnlineAccountsClient } from '../online-accounts-client.js';

describe('SyncEngine', () => {
  it('should initialize with IDLE state', () => {
    const engine = new SyncEngine();
    expect(engine.getState()).toBe('IDLE');
  });

  it('should transition between states', () => {
    const engine = new SyncEngine();
    engine.setState('SYNCING');
    expect(engine.getState()).toBe('SYNCING');

    engine.setState('SYNCED');
    expect(engine.getState()).toBe('SYNCED');
  });

  it('should track progress', () => {
    const engine = new SyncEngine();
    engine.updateProgress(5, 10, 'Restoring records');

    expect(engine.getState()).toBe('SYNCING');
    const progress = engine.getProgress();
    expect(progress?.current).toBe(5);
    expect(progress?.total).toBe(10);
    expect(progress?.message).toBe('Restoring records');
  });

  it('should notify subscribers', () => {
    const engine = new SyncEngine();
    const listener = vi.fn();

    engine.subscribe(listener);
    // Initial call on subscribe
    expect(listener).toHaveBeenCalledWith('IDLE', undefined, undefined);

    engine.setState('SYNCING');
    expect(listener).toHaveBeenCalledWith('SYNCING', undefined, undefined);
  });

  it('should handle errors', () => {
    const engine = new SyncEngine();
    const errorMsg = 'Network timeout';

    engine.setState('ERROR', undefined, errorMsg);
    expect(engine.getState()).toBe('ERROR');
    expect(engine.getLastError()).toBe(errorMsg);
    expect(engine.getLastErrorStatus()).toBeUndefined();
  });

  it('retains the HTTP status for OnlineAccountsError failures', () => {
    const engine = new SyncEngine();

    engine.setState('ERROR', undefined, 'Online accounts request failed with HTTP 401', 401);
    expect(engine.getLastError()).toBe('Online accounts request failed with HTTP 401');
    expect(engine.getLastErrorStatus()).toBe(401);

    engine.reset();
    expect(engine.getLastError()).toBeUndefined();
    expect(engine.getLastErrorStatus()).toBeUndefined();
  });

  it('should support sync stages', () => {
    const engine = new SyncEngine();
    engine.updateProgress(10, 100, undefined, 'PUSH');

    const progress = engine.getProgress();
    expect(progress?.stage).toBe('PUSH');
    expect(progress?.total).toBe(100);
  });

  describe('triggerSync with keypair and epoch rotation', () => {
    let engine: SyncEngine;

    beforeEach(async () => {
      engine = new SyncEngine();
      // Set up test database metadata
      const localAccountId = 'test-local-account';
      const serverAccountId = '11111111-1111-4111-8111-111111111111';
      
      await upsertAccountSyncMetadata({
        localAccountId,
        serverAccountId,
        keyEpoch: 1, // Start with epoch 1
        lastSyncSequence: 0,
      });
    });

    afterEach(() => {
      vi.clearAllMocks();
    });

    function createMockClient(): OnlineAccountsClient {
      return {
        listAccounts: vi.fn(async () => ({ accounts: [] })),
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

    it('should skip epoch rotation when keypair is not supplied', async () => {
      const mockClient = createMockClient();
      const localAccountId = 'test-local-account';
      const executeCommand = vi.fn().mockResolvedValue(undefined);

      mockClient.pullChangeRecords = vi.fn().mockResolvedValue({
        records: [],
        next_since: null,
      });
      mockClient.pushChangeRecords = vi.fn().mockResolvedValue({
        results: [],
      });
      mockClient.getAccountMembers = vi.fn().mockResolvedValue({ members: [] });

      // Call triggerSync WITHOUT keypair (no userPublicKey, no userPrivateKey)
      await engine.triggerSync({
        client: mockClient,
        localAccountId,
        executeCommand,
        // No userPublicKey or userPrivateKey
      });

      // Verify getAccountKey was NOT called (epoch rotation skipped)
      expect((mockClient.getAccountKey as any).mock.calls).toHaveLength(0);
    });

    it('should invoke getAccountKey when keypair is supplied (triggering epoch rotation path)', async () => {
      const mockClient = createMockClient();
      const localAccountId = 'test-local-account';
      const executeCommand = vi.fn().mockResolvedValue(undefined);

      // Keypair (32 bytes for X25519)
      const userPublicKey = new Uint8Array(32).fill(1);
      const userPrivateKey = new Uint8Array(32).fill(2);

      // Setup mocks to indicate same remote epoch (no rotation needed)
      // This avoids the need to fully mock fetchUnwrapAndStoreAccountKey
      mockClient.getAccountKey = vi.fn().mockResolvedValue({
        epoch: 1, // Same as local epoch - no rotation
        wrappedKey: {
          v: 1,
          alg: 'x25519-xsalsa20-poly1305',
          ciphertext: 'mock-encrypted-key',
          nonce: 'mock-nonce',
        },
      });

      mockClient.pullChangeRecords = vi.fn().mockResolvedValue({
        records: [],
        next_since: null,
      });
      mockClient.pushChangeRecords = vi.fn().mockResolvedValue({
        results: [],
      });
      mockClient.getAccountMembers = vi.fn().mockResolvedValue({ members: [] });

      // Call triggerSync WITH keypair
      await engine.triggerSync({
        client: mockClient,
        localAccountId,
        executeCommand,
        userPublicKey,
        userPrivateKey,
      });

      // Verify getAccountKey WAS called - this proves the epoch rotation path is triggered
      expect((mockClient.getAccountKey as any).mock.calls.length).toBeGreaterThan(0);
      
      // Verify the call was made with the correct serverAccountId
      const callArgs = (mockClient.getAccountKey as any).mock.calls[0][0];
      expect(callArgs.accountId).toBe('11111111-1111-4111-8111-111111111111');
    });
  });

  describe('triggerSync without metadata', () => {
    let engine: SyncEngine;

    beforeEach(() => {
      engine = new SyncEngine();
    });

    function createMockClient(): OnlineAccountsClient {
      return {
        listAccounts: vi.fn(async () => ({ accounts: [] })),
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

    it('should set state to OFFLINE when no account sync metadata exists', async () => {
      const mockClient = createMockClient();
      const localAccountId = 'local-without-metadata';
      const executeCommand = vi.fn().mockResolvedValue(undefined);

      await engine.triggerSync({
        client: mockClient,
        localAccountId,
        executeCommand,
      });

      expect(engine.getState()).toBe('OFFLINE');
    });
  });
});
