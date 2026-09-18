import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { flushPendingChangesOnLogout } from './flush-on-logout.js';
import { syncEngine } from './sync-engine.js';
import { db } from '../db/index.js';
import { uploadQueue } from '../changelog/upload-queue.js';
import type { OnlineAccountsClient } from './online-accounts-client.js';

vi.mock('./sync-engine.js', () => ({
  syncEngine: {
    triggerSync: vi.fn(),
    getState: vi.fn(),
    getLastError: vi.fn(),
  },
}));

vi.mock('../changelog/upload-queue.js', () => ({
  uploadQueue: {
    getAllByAccount: vi.fn(),
  },
}));

// Helper to create a complete mock client
function createMockClient(): OnlineAccountsClient {
  return {
    listAccounts: vi.fn(),
    createAccount: vi.fn(),
    getAccountKey: vi.fn(),
    pushChangeRecords: vi.fn(),
    pullChangeRecords: vi.fn(),
    deleteAccount: vi.fn(),
    pollPendingKeyRequests: vi.fn(),
    getRecipientPublicKey: vi.fn(),
    deliverAccountKey: vi.fn(),
    getAccountMembers: vi.fn(),
    removeAccountMember: vi.fn(),
    removeAccountMemberAndUploadWrappedKeys: vi.fn(),
    batchUploadWrappedKeys: vi.fn(),
    getSharingInfo: vi.fn(),
    inviteMember: vi.fn(),
    cancelInvite: vi.fn(),
    removeMember: vi.fn(),
    updateDisplayEmail: vi.fn(),
    listPendingInvitesForMe: vi.fn(),
    acceptInvite: vi.fn(),
    declineInvite: vi.fn(),
    deleteRecoveryData: vi.fn(),
  } as unknown as OnlineAccountsClient;
}

describe('flushPendingChangesOnLogout', () => {
  let mockClient: OnlineAccountsClient;

  beforeEach(async () => {
    mockClient = createMockClient();
    vi.clearAllMocks();
    await db.accountSyncMetadata.clear();
  });

  afterEach(async () => {
    await db.accountSyncMetadata.clear();
  });

  it('should skip flush when no online accounts exist', async () => {
    await flushPendingChangesOnLogout({
      client: mockClient,
      timeoutMs: 1000,
    });

    expect(syncEngine.triggerSync).not.toHaveBeenCalled();
  });

  it('should flush all online accounts', async () => {
    // Setup: create two online accounts
    const now = new Date().toISOString();
    await db.accountSyncMetadata.bulkAdd([
      {
        localAccountId: 'local-1',
        serverAccountId: 'server-1',
        keyEpoch: 1,
        lastSyncSequence: 10,
        role: 'owner',
        createdAt: now,
        updatedAt: now,
      },
      {
        localAccountId: 'local-2',
        serverAccountId: 'server-2',
        keyEpoch: 1,
        lastSyncSequence: 20,
        role: 'member',
        createdAt: now,
        updatedAt: now,
      },
    ]);

    (syncEngine.triggerSync as any).mockResolvedValue(undefined);
    (syncEngine.getState as any).mockReturnValue('SYNCED');
    (uploadQueue.getAllByAccount as any).mockResolvedValue([]);

    await flushPendingChangesOnLogout({
      client: mockClient,
      timeoutMs: 1000,
    });

    expect(syncEngine.triggerSync).toHaveBeenCalledTimes(2);
    expect(syncEngine.triggerSync).toHaveBeenCalledWith(
      expect.objectContaining({
        client: mockClient,
        localAccountId: 'local-1',
        role: 'owner',
      })
    );
    expect(syncEngine.triggerSync).toHaveBeenCalledWith(
      expect.objectContaining({
        client: mockClient,
        localAccountId: 'local-2',
        role: 'member',
      })
    );
  });

  it('should timeout slow sync attempts', async () => {
    const now = new Date().toISOString();
    await db.accountSyncMetadata.add({
      localAccountId: 'local-1',
      serverAccountId: 'server-1',
      keyEpoch: 1,
      lastSyncSequence: 10,
      role: 'owner',
      createdAt: now,
      updatedAt: now,
    });

    // Make sync hang indefinitely
    (syncEngine.triggerSync as any).mockImplementation(
      () => new Promise(() => {}) // never resolves
    );

    const start = Date.now();
    await flushPendingChangesOnLogout({
      client: mockClient,
      timeoutMs: 100,
    });
    const duration = Date.now() - start;

    // Should timeout around 100ms, not hang indefinitely
    expect(duration).toBeLessThan(200);
    expect(syncEngine.triggerSync).toHaveBeenCalledTimes(1);
  });

  it('should continue flushing other accounts if one fails', async () => {
    const now = new Date().toISOString();
    await db.accountSyncMetadata.bulkAdd([
      {
        localAccountId: 'local-1',
        serverAccountId: 'server-1',
        keyEpoch: 1,
        lastSyncSequence: 10,
        role: 'owner',
        createdAt: now,
        updatedAt: now,
      },
      {
        localAccountId: 'local-2',
        serverAccountId: 'server-2',
        keyEpoch: 1,
        lastSyncSequence: 20,
        role: 'owner',
        createdAt: now,
        updatedAt: now,
      },
    ]);

    (syncEngine.triggerSync as any)
      .mockRejectedValueOnce(new Error('Network failure'))
      .mockResolvedValueOnce(undefined);
    (syncEngine.getState as any).mockReturnValue('SYNCED');
    (uploadQueue.getAllByAccount as any).mockResolvedValue([]);

    await flushPendingChangesOnLogout({
      client: mockClient,
      timeoutMs: 1000,
    });

    // Both accounts should be attempted despite the first one failing
    expect(syncEngine.triggerSync).toHaveBeenCalledTimes(2);
  });

  it('should pass user keys to sync engine when provided', async () => {
    const now = new Date().toISOString();
    await db.accountSyncMetadata.add({
      localAccountId: 'local-1',
      serverAccountId: 'server-1',
      keyEpoch: 1,
      lastSyncSequence: 10,
      role: 'owner',
      createdAt: now,
      updatedAt: now,
    });

    const userPublicKey = new Uint8Array([1, 2, 3]);
    const userPrivateKey = new Uint8Array([4, 5, 6]);

    (syncEngine.triggerSync as any).mockResolvedValue(undefined);
    (syncEngine.getState as any).mockReturnValue('SYNCED');
    (uploadQueue.getAllByAccount as any).mockResolvedValue([]);

    await flushPendingChangesOnLogout({
      client: mockClient,
      userPublicKey,
      userPrivateKey,
      timeoutMs: 1000,
    });

    expect(syncEngine.triggerSync).toHaveBeenCalledWith(
      expect.objectContaining({
        userPublicKey,
        userPrivateKey,
      })
    );
  });

  it('should handle offline scenario gracefully', async () => {
    const now = new Date().toISOString();
    await db.accountSyncMetadata.add({
      localAccountId: 'local-1',
      serverAccountId: 'server-1',
      keyEpoch: 1,
      lastSyncSequence: 10,
      role: 'owner',
      createdAt: now,
      updatedAt: now,
    });

    // Simulate network offline (TypeError is what fetch throws when offline)
    (syncEngine.triggerSync as any).mockRejectedValue(new TypeError('Failed to fetch'));

    // Should not throw, just log and continue
    await expect(
      flushPendingChangesOnLogout({
        client: mockClient,
        timeoutMs: 1000,
      })
    ).resolves.toBeUndefined();

    expect(syncEngine.triggerSync).toHaveBeenCalledTimes(1);
  });

  it('should detect ERROR state after sync and warn', async () => {
    const now = new Date().toISOString();
    await db.accountSyncMetadata.add({
      localAccountId: 'local-1',
      serverAccountId: 'server-1',
      keyEpoch: 1,
      lastSyncSequence: 10,
      role: 'owner',
      createdAt: now,
      updatedAt: now,
    });

    // Sync completes without throwing, but ends in ERROR state
    (syncEngine.triggerSync as any).mockResolvedValue(undefined);
    (syncEngine.getState as any).mockReturnValue('ERROR');
    (syncEngine.getLastError as any).mockReturnValue('Account key missing');

    await flushPendingChangesOnLogout({
      client: mockClient,
      timeoutMs: 1000,
    });

    expect(syncEngine.triggerSync).toHaveBeenCalledTimes(1);
    expect(syncEngine.getState).toHaveBeenCalled();
    expect(syncEngine.getLastError).toHaveBeenCalled();
    // Should not check upload queue when sync failed
    expect(uploadQueue.getAllByAccount).not.toHaveBeenCalled();
  });

  it('should detect OFFLINE state after sync and warn', async () => {
    const now = new Date().toISOString();
    await db.accountSyncMetadata.add({
      localAccountId: 'local-1',
      serverAccountId: 'server-1',
      keyEpoch: 1,
      lastSyncSequence: 10,
      role: 'owner',
      createdAt: now,
      updatedAt: now,
    });

    // Sync completes without throwing, but ends in OFFLINE state
    (syncEngine.triggerSync as any).mockResolvedValue(undefined);
    (syncEngine.getState as any).mockReturnValue('OFFLINE');

    await flushPendingChangesOnLogout({
      client: mockClient,
      timeoutMs: 1000,
    });

    expect(syncEngine.triggerSync).toHaveBeenCalledTimes(1);
    expect(syncEngine.getState).toHaveBeenCalled();
    // Should not check upload queue when sync ended in OFFLINE
    expect(uploadQueue.getAllByAccount).not.toHaveBeenCalled();
  });

  it('should warn when records remain in queue after successful sync', async () => {
    const now = new Date().toISOString();
    await db.accountSyncMetadata.add({
      localAccountId: 'local-1',
      serverAccountId: 'server-1',
      keyEpoch: 1,
      lastSyncSequence: 10,
      role: 'owner',
      createdAt: now,
      updatedAt: now,
    });

    (syncEngine.triggerSync as any).mockResolvedValue(undefined);
    (syncEngine.getState as any).mockReturnValue('SYNCED');
    
    // Simulate records remaining in queue after sync
    (uploadQueue.getAllByAccount as any).mockResolvedValue([
      {
        change_uuid: 'uuid-1',
        encrypted_payload: {},
        enqueued_at: now,
        localAccountId: 'local-1',
      },
      {
        change_uuid: 'uuid-2',
        encrypted_payload: {},
        enqueued_at: now,
        localAccountId: 'local-1',
      },
    ]);

    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    await flushPendingChangesOnLogout({
      client: mockClient,
      timeoutMs: 1000,
    });

    expect(syncEngine.triggerSync).toHaveBeenCalledTimes(1);
    expect(uploadQueue.getAllByAccount).toHaveBeenCalledWith('local-1');
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('2 record(s) remain in queue')
    );

    warnSpy.mockRestore();
  });

  it('should log success only when queue is empty after SYNCED state', async () => {
    const now = new Date().toISOString();
    await db.accountSyncMetadata.add({
      localAccountId: 'local-1',
      serverAccountId: 'server-1',
      keyEpoch: 1,
      lastSyncSequence: 10,
      role: 'owner',
      createdAt: now,
      updatedAt: now,
    });

    (syncEngine.triggerSync as any).mockResolvedValue(undefined);
    (syncEngine.getState as any).mockReturnValue('SYNCED');
    (uploadQueue.getAllByAccount as any).mockResolvedValue([]);

    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    await flushPendingChangesOnLogout({
      client: mockClient,
      timeoutMs: 1000,
    });

    expect(uploadQueue.getAllByAccount).toHaveBeenCalledWith('local-1');
    expect(logSpy).toHaveBeenCalledWith(
      expect.stringContaining('Successfully synced account local-1')
    );

    logSpy.mockRestore();
  });
});
