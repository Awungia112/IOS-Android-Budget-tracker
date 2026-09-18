/**
 * Flush utility for logout operations.
 * 
 * Provides a function to flush pending changes before logout to prevent silent data loss.
 * This is part of the Layer 1 fix for the category disappearance bug.
 */

import { syncEngine } from './sync-engine.js';
import type { OnlineAccountsClient } from './online-accounts-client.js';
import { db } from '../db/index.js';
import { uploadQueue } from '../changelog/upload-queue.js';

export interface FlushOnLogoutOptions {
  client: OnlineAccountsClient;
  userPublicKey?: Uint8Array;
  userPrivateKey?: Uint8Array;
  timeoutMs?: number;
}

/**
 * Flush all pending changes for online accounts before logout.
 * 
 * This function:
 * 1. Identifies all online accounts (those with sync metadata)
 * 2. Attempts to sync each account's pending changes to the server
 * 3. Races each sync against a timeout to avoid hanging on offline logout
 * 4. Logs errors but continues to the next account on failure
 * 
 * @param options - Configuration options including client and timeout
 * @returns Promise that resolves when all flush attempts complete
 */
export async function flushPendingChangesOnLogout(
  options: FlushOnLogoutOptions
): Promise<void> {
  const { client, userPublicKey, userPrivateKey, timeoutMs = 5000 } = options;

  // Get all accounts with sync metadata (online accounts)
  const allMetadata = await db.accountSyncMetadata.toArray();
  
  if (allMetadata.length === 0) {
    console.log('[flushPendingChangesOnLogout] No online accounts — skipping flush');
    return;
  }

  console.log(`[flushPendingChangesOnLogout] Flushing ${allMetadata.length} online account(s)`);

  // Sync each account sequentially to avoid the singleton SYNCING guard defeating concurrent fan-out.
  // The sync engine's guard (sync-engine.ts:168) makes only the first triggerSync execute;
  // the remaining N-1 return immediately as no-ops. A sequential loop ensures all accounts
  // are actually synced before their data is wiped by deleteAllOnlineAccounts().
  for (const metadata of allMetadata) {
    try {
      const syncPromise = syncEngine.triggerSync({
        client,
        localAccountId: metadata.localAccountId,
        executeCommand: async () => {
          // pushOnly mode skips pull/replay, so executeCommand is never called.
          // This stub satisfies the interface.
        },
        userPublicKey,
        userPrivateKey,
        role: metadata.role,
        pushOnly: true, // Only push local changes without pulling or advancing cursor
      });

      // Race the sync against the timeout, clearing the timer when sync completes
      let timeoutId: NodeJS.Timeout | number;
      const timeoutPromise = new Promise<void>((_, reject) => {
        timeoutId = setTimeout(() => reject(new Error('Sync timeout')), timeoutMs);
      });

      try {
        await Promise.race([syncPromise, timeoutPromise]);
      } finally {
        clearTimeout(timeoutId);
      }

      // Check sync engine state after triggerSync to detect silent failures.
      // The sync engine returns silently with ERROR or OFFLINE states without throwing.
      const finalState = syncEngine.getState();
      if (finalState === 'ERROR' || finalState === 'OFFLINE') {
        const error = syncEngine.getLastError() || 'Unknown error';
        console.warn(
          `[flushPendingChangesOnLogout] Sync ended in ${finalState} state for account ${metadata.localAccountId}: ${error}`
        );
        continue; // Don't verify queue for failed syncs
      }

      // Verify upload queue is empty for this account to confirm successful flush.
      // A flush that pushed zero records looks healthy but may leave records behind.
      const remainingRecords = await uploadQueue.getAllByAccount(metadata.localAccountId);
      if (remainingRecords.length > 0) {
        console.warn(
          `[flushPendingChangesOnLogout] ${remainingRecords.length} record(s) remain in queue for account ${metadata.localAccountId} after sync`
        );
      } else {
        console.log(`[flushPendingChangesOnLogout] Successfully synced account ${metadata.localAccountId}`);
      }
    } catch (err) {
      // Log but don't throw — we want to attempt all accounts even if one fails.
      // Common failures: network offline, server error, timeout.
      const message = err instanceof Error ? err.message : String(err);
      console.warn(
        `[flushPendingChangesOnLogout] Failed to sync account ${metadata.localAccountId}: ${message}`
      );
    }
  }

  console.log('[flushPendingChangesOnLogout] Flush complete');
}
