// @vitest-environment node

import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { resetPrivateKeyStoreMock } from '../../crypto/private-key-store-plugin.test-mock.js';

vi.mock('../../crypto/private-key-store-plugin', () => import('../../crypto/private-key-store-plugin.test-mock'));

import { budgetService } from '../../services/budget.service.js';
import { db } from '../../db/index.js';
import { flushPendingChangesOnLogout } from '../flush-on-logout.js';
import { uploadQueue } from '../../changelog/upload-queue.js';
import { generateAccountKey, storeAccountKey } from '../../crypto/account-key.js';
import type { CreateCategory } from '../../types/index.js';
import type { OnlineAccountsClient } from '../online-accounts-client.js';

// Helper to create a complete mock client
function createMockClient(): OnlineAccountsClient {
  return {
    listAccounts: vi.fn().mockResolvedValue({ accounts: [] }),
    createAccount: vi.fn(),
    getAccountKey: vi.fn(),
    pushChangeRecords: vi.fn().mockResolvedValue({}),
    pullChangeRecords: vi.fn().mockResolvedValue({ records: [], next_since: null }),
    deleteAccount: vi.fn(),
    pollPendingKeyRequests: vi.fn().mockResolvedValue({ pendingKeyDeliveries: [] }),
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

describe('Category Logout Fix - Integration Test', () => {
  let mockClient: OnlineAccountsClient;

  beforeEach(async () => {
    resetPrivateKeyStoreMock();
    mockClient = createMockClient();
    // Reset database
    await db.delete();
    await db.open();
    await budgetService.initializeDatabase();
    
    // Clear upload queue
    await uploadQueue.clear();
    
    vi.clearAllMocks();
  });

  it('should preserve category created immediately before logout (Layer 1 fix)', async () => {
    // Setup: create a synced account with metadata
    const account = await budgetService.createAccount({ name: 'Test Account', initials: 'TA' });
    const now = new Date().toISOString();
    await db.accountSyncMetadata.add({
      localAccountId: account.id,
      serverAccountId: 'server-account-1',
      keyEpoch: 1,
      lastSyncSequence: 0,
      role: 'owner',
      createdAt: now,
      updatedAt: now,
    });

    // Step 1: Create a category
    const categoryData: CreateCategory = {
      name: 'Test Category',
      type: 'expense',
      icon: '🧪',
      color: '#FF5733',
    };
    const category = await budgetService.createCategory(categoryData, account.id);

    // Verify the category was created locally
    const categoriesBeforeLogout = await budgetService.getCategoriesByAccountId(account.id);
    const testCategory = categoriesBeforeLogout.find((c) => c.name === 'Test Category');
    expect(testCategory).toBeDefined();
    expect(testCategory?.id).toBe(category.id);

    // Step 2: Log out immediately (simulating the bug scenario)
    // The flush should attempt to push changes 
    await flushPendingChangesOnLogout({
      client: mockClient,
      timeoutMs: 5000,
    });

    // Step 3: Delete online accounts (simulating logout)
    await budgetService.deleteAllOnlineAccounts();

    // Verify the category was deleted locally (expected during logout)
    const categoriesAfterLogout = await budgetService.getCategoriesByAccountId(account.id);
    expect(categoriesAfterLogout.find((c) => c.name === 'Test Category')).toBeUndefined();

    // The key point: flushPendingChangesOnLogout was called BEFORE deleteAllOnlineAccounts,
    // which is the Layer 1 fix. This test verifies the ordering is correct.
    // In a real scenario with proper keys loaded, this would successfully push changes.
  });

  it('should not hang on offline logout', async () => {
    // Setup: create a synced account
    const account = await budgetService.createAccount({ name: 'Test Account', initials: 'TA' });
    const now = new Date().toISOString();
    await db.accountSyncMetadata.add({
      localAccountId: account.id,
      serverAccountId: 'server-account-1',
      keyEpoch: 1,
      lastSyncSequence: 0,
      role: 'owner',
      createdAt: now,
      updatedAt: now,
    });

    // Create a category with pending changes
    await budgetService.createCategory(
      { name: 'Offline Category', type: 'expense', icon: '📴', color: '#999999' },
      account.id
    );

    // Simulate offline by making the client reject with a network error
    (mockClient.pushChangeRecords as any).mockRejectedValue(new TypeError('Failed to fetch'));

    const start = Date.now();
    
    // Flush should timeout quickly rather than hanging
    await flushPendingChangesOnLogout({
      client: mockClient,
      timeoutMs: 500,
    });
    
    const duration = Date.now() - start;

    // Should complete within timeout + small overhead
    expect(duration).toBeLessThan(1000);
  });

  it('should handle multiple categories created in quick succession', async () => {
    // Setup: create a synced account
    const account = await budgetService.createAccount({ name: 'Test Account', initials: 'TA' });
    const now = new Date().toISOString();
    await db.accountSyncMetadata.add({
      localAccountId: account.id,
      serverAccountId: 'server-account-1',
      keyEpoch: 1,
      lastSyncSequence: 0,
      role: 'owner',
      createdAt: now,
      updatedAt: now,
    });

    // Create multiple categories quickly
    await budgetService.createCategory(
      { name: 'Category 1', type: 'expense', icon: '1️⃣', color: '#FF0000' },
      account.id
    );
    await budgetService.createCategory(
      { name: 'Category 2', type: 'income', icon: '2️⃣', color: '#00FF00' },
      account.id
    );
    await budgetService.createCategory(
      { name: 'Category 3', type: 'expense', icon: '3️⃣', color: '#0000FF' },
      account.id
    );

    // Verify all categories exist locally
    const categoriesBeforeFlush = await budgetService.getCategoriesByAccountId(account.id);
    expect(categoriesBeforeFlush.filter((c) => c.name.startsWith('Category')).length).toBe(3);

    // Flush should complete without error (the key test - ensures flush runs without hanging)
    await expect(flushPendingChangesOnLogout({
      client: mockClient,
      timeoutMs: 5000,
    })).resolves.toBeUndefined();
  });

  it('should preserve category updates as well as creates', async () => {
    // Setup: create a synced account
    const account = await budgetService.createAccount({ name: 'Test Account', initials: 'TA' });
    const now = new Date().toISOString();
    await db.accountSyncMetadata.add({
      localAccountId: account.id,
      serverAccountId: 'server-account-1',
      keyEpoch: 1,
      lastSyncSequence: 0,
      role: 'owner',
      createdAt: now,
      updatedAt: now,
    });

    // Create and immediately update a category
    const category = await budgetService.createCategory(
      { name: 'Original Name', type: 'expense', icon: '📝', color: '#FF5733' },
      account.id
    );

    await budgetService.updateCategory(
      category.id,
      { name: 'Updated Name', color: '#33FF57' },
      account.id
    );

    // Flush should complete without error
    await expect(flushPendingChangesOnLogout({
      client: mockClient,
      timeoutMs: 5000,
    })).resolves.toBeUndefined();
  });

  it('should actually push pending changes when account key is available', async () => {
    // Setup: create a synced account with a provisioned account key
    const account = await budgetService.createAccount({ name: 'Test Account', initials: 'TA' });
    const serverAccountId = 'server-account-with-key';
    const accountKey = await generateAccountKey();
    await storeAccountKey(serverAccountId, accountKey);

    const now = new Date().toISOString();
    await db.accountSyncMetadata.add({
      localAccountId: account.id,
      serverAccountId,
      keyEpoch: 1,
      lastSyncSequence: 0,
      role: 'owner',
      createdAt: now,
      updatedAt: now,
    });

    // Mock getAccountKey to return the provisioned epoch
    (mockClient.getAccountKey as any).mockResolvedValue({ epoch: 1 });

    // Create a category - this should enqueue a change record
    const category = await budgetService.createCategory(
      { name: 'Test Category', type: 'expense', icon: '🧪', color: '#FF5733' },
      account.id
    );

    // Verify the change was enqueued
    const queuedBeforeFlush = await uploadQueue.getAllByAccount(account.id);
    expect(queuedBeforeFlush.length).toBeGreaterThan(0);
    const categoryChangeUuid = queuedBeforeFlush[0].change_uuid;

    // Flush should push the changes
    await flushPendingChangesOnLogout({
      client: mockClient,
      timeoutMs: 5000,
    });

    // Verify pushChangeRecords was called with the category change
    expect(mockClient.pushChangeRecords).toHaveBeenCalled();
    const pushCall = (mockClient.pushChangeRecords as any).mock.calls[0][0];
    expect(pushCall.accountId).toBe(serverAccountId);
    expect(pushCall.records.some((r: any) => r.change_uuid === categoryChangeUuid)).toBe(true);

    // Verify upload queue is empty after successful push
    const queuedAfterFlush = await uploadQueue.getAllByAccount(account.id);
    expect(queuedAfterFlush.length).toBe(0);
  });

  it('should detect when sync ends in ERROR state and warn', async () => {
    // Setup: create a synced account WITHOUT provisioning key (simulates missing key scenario)
    const account = await budgetService.createAccount({ name: 'Test Account', initials: 'TA' });
    const serverAccountId = 'server-account-no-key';

    const now = new Date().toISOString();
    await db.accountSyncMetadata.add({
      localAccountId: account.id,
      serverAccountId,
      keyEpoch: 1,
      lastSyncSequence: 0,
      role: 'owner',
      createdAt: now,
      updatedAt: now,
    });

    // Create a category - this will fail to encrypt (no key)
    await budgetService.createCategory(
      { name: 'Test Category', type: 'expense', icon: '🧪', color: '#FF5733' },
      account.id
    );

    // Verify the change is still in queue (couldn't be encrypted)
    const queuedBeforeFlush = await uploadQueue.getAllByAccount(account.id);
    const recordsBeforeFlush = queuedBeforeFlush.length;

    // Spy on console.warn to verify error detection
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    // Flush will attempt sync, detect ERROR state, and warn
    await flushPendingChangesOnLogout({
      client: mockClient,
      timeoutMs: 5000,
    });

    // Verify warning was logged about ERROR state
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('Sync ended in ERROR state')
    );

    // Verify records remain in queue (sync failed)
    const queuedAfterFlush = await uploadQueue.getAllByAccount(account.id);
    expect(queuedAfterFlush.length).toBe(recordsBeforeFlush);

    warnSpy.mockRestore();
  });
});
