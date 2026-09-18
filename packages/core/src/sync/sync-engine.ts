import { uploadQueue } from '../changelog/upload-queue.js';
import { SYNC_BATCH_SIZE } from '@budget/shared/sync-limits';
import {
  loadAccountKey,
  open as decryptEnvelope,
  SymmetricEnvelope,
} from '../crypto/index.js';
import {
  fetchUnwrapAndStoreAccountKey,
  processPendingKeyDeliveries,
  processPendingKeyRequests,
} from './account-key-lifecycle.js';
import { getAccountSyncMetadata, upsertAccountSyncMetadata, deleteAccountSyncMetadata } from './account-sync-metadata.js';
import type { OnlineAccountsClient } from './online-accounts-client.js';
import { OnlineAccountsError } from './online-accounts-client.js';

function getErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === 'string' && error.trim()) return error;
  return 'An unknown sync error occurred';
}

/**
 * SyncState - The possible states of the synchronization process
 */
export type SyncState = 'IDLE' | 'SYNCING' | 'SYNCED' | 'ERROR' | 'OFFLINE';

/**
 * Centralized sync state constants.
 * Use these instead of raw string literals to match the contract pattern
 * established by COMMAND_TYPES and to make state values refactor-safe.
 */
export const SYNC_STATES = {
  IDLE: 'IDLE',
  SYNCING: 'SYNCING',
  SYNCED: 'SYNCED',
  ERROR: 'ERROR',
  OFFLINE: 'OFFLINE',
} as const satisfies Record<string, SyncState>;

/**
 * SyncProgress - Detailed progress information for the syncing state
 */
export type SyncStage = 'PUSH' | 'PULL' | 'REPLAY';

export interface SyncProgress {
  current: number;
  total: number;
  message?: string;
  stage?: SyncStage;
}

/**
 * SyncEngineEvents - Map of events emitted by the SyncEngine
 */
export type SyncEngineListener = (state: SyncState, progress?: SyncProgress, error?: string) => void;

export interface TriggerSyncParams {
  client: OnlineAccountsClient;
  localAccountId: string;
  executeCommand: (command: any) => Promise<void>;
  userPublicKey?: Uint8Array;
  userPrivateKey?: Uint8Array;
  /** Account role. When 'member', key delivery polling is skipped since only owners can deliver keys. */
  role?: 'owner' | 'member';
  /** When true, only push local changes without pulling or advancing the cursor. Used during logout. */
  pushOnly?: boolean;
}

/**
 * SyncEngine - Orchestrates the synchronization lifecycle.
 *
 * Provides a foundation for tracking sync status independently of the backend implementation.
 * Driven by events to update the UI (SyncIndicator).
 */
export class SyncEngine {
  private state: SyncState = SYNC_STATES.IDLE;
  private progress?: SyncProgress;
  private lastError?: string;
  private lastErrorStatus?: number;
  private listeners: Set<SyncEngineListener> = new Set();

  /**
   * Get the current state of the sync engine
   */
  getState(): SyncState {
    return this.state;
  }

  /**
   * Get the current progress of the sync operation
   */
  getProgress(): SyncProgress | undefined {
    return this.progress;
  }

  /**
   * Get the last error encountered during sync
   */
  getLastError(): string | undefined {
    return this.lastError;
  }

  /**
   * Get the HTTP status of the last sync error, when it was an
   * OnlineAccountsError. Consumers use this to distinguish an expired
   * session (401) from other failures.
   */
  getLastErrorStatus(): number | undefined {
    return this.lastErrorStatus;
  }

  /**
   * Transition the engine to a new state
   */
  setState(state: SyncState, progress?: SyncProgress, error?: string, errorStatus?: number): void {
    this.state = state;
    this.progress = progress;
    this.lastError = error;
    this.lastErrorStatus = errorStatus;
    this.notify();
  }

  /**
   * Update the progress within the SYNCING state
   */
  updateProgress(current: number, total: number, message?: string, stage?: SyncStage): void {
    if (this.state !== SYNC_STATES.SYNCING) {
      this.state = SYNC_STATES.SYNCING;
    }
    this.progress = { current, total, message, stage };
    this.notify();
  }

  /**
   * Subscribe to state and progress changes
   */
  subscribe(listener: SyncEngineListener): () => void {
    this.listeners.add(listener);
    // Initial notification for the new subscriber
    listener(this.state, this.progress, this.lastError);
    return () => this.listeners.delete(listener);
  }

  /**
   * Notify all subscribers of a change
   */
  private notify(): void {
    this.listeners.forEach(listener => listener(this.state, this.progress, this.lastError));
  }

  /**
   * Reset the engine to IDLE state
   */
  reset(): void {
    this.state = SYNC_STATES.IDLE;
    this.progress = undefined;
    this.lastError = undefined;
    this.lastErrorStatus = undefined;
    this.notify();
  }

  /**
   * Orchestrate a full sync cycle:
   * 1. Push all locally queued encrypted change records to the server.
   * 2. Pull new remote change records and replay them locally.
   * 3. Update the sync cursor (lastSyncSequence) on success.
   */
  async triggerSync(params: TriggerSyncParams): Promise<void> {
    if (this.state === SYNC_STATES.SYNCING) return;

    const { client, localAccountId, executeCommand, userPublicKey, userPrivateKey } = params;

    this.setState(SYNC_STATES.SYNCING, { current: 0, total: 100, message: 'Starting sync…' });

    try {
      if (this.getState() === SYNC_STATES.OFFLINE) return;
      let metadata = await getAccountSyncMetadata(localAccountId);
      if (this.getState() === SYNC_STATES.OFFLINE) return;

      if (!metadata) {
        // No server account linked yet — nothing to sync
        this.setState(SYNC_STATES.OFFLINE);
        this.scheduleReset();
        return;
      }
      const { serverAccountId, lastSyncSequence, keyEpoch: localEpoch } = metadata;

      // --- Step 1: Check for epoch increment and fetch new key if needed ---
      if (userPublicKey && userPrivateKey) {
        let accountKeyResponse;
        try {
          accountKeyResponse = await client.getAccountKey({ accountId: serverAccountId });
        } catch (err: any) {
          if (err instanceof OnlineAccountsError && err.status === 404) {
            // getAccountKey returned 404. Verify the account is truly gone via
            // listAccounts before deleting metadata — a transient 404 on the
            // key endpoint must not permanently unlink the account.
            let accountStillExists = false;
            try {
              const { accounts } = await client.listAccounts();
              accountStillExists = accounts.some(a => a.id === serverAccountId);
            } catch {
              // listAccounts also failed — treat as transient, keep metadata.
              accountStillExists = true;
            }
            if (!accountStillExists) {
              await deleteAccountSyncMetadata(localAccountId);
            }
            this.setState(SYNC_STATES.SYNCED);
            this.scheduleReset();
            return;
          }
          throw err;
        }
        const remoteEpoch = accountKeyResponse.epoch;

        if (localEpoch !== undefined && remoteEpoch > localEpoch) {
          this.updateProgress(5, 100, 'Rotating encryption key…');
          await fetchUnwrapAndStoreAccountKey({
            serverAccountId,
            userPublicKey,
            userPrivateKey,
            client,
            epoch: remoteEpoch,
          });
          // Update metadata with new epoch
          await upsertAccountSyncMetadata({
            localAccountId,
            serverAccountId,
            keyEpoch: remoteEpoch,
            lastSyncSequence,
          });
          // Re-fetch metadata to ensure we have the updated epoch for the rest of the sync
          const updatedMetadata = await getAccountSyncMetadata(localAccountId);
          if (!updatedMetadata) {
            this.setState(SYNC_STATES.ERROR, undefined, 'Metadata lost after epoch rotation');
            return;
          }
          metadata = updatedMetadata;
        }
      }

      const accountKey = await loadAccountKey(serverAccountId);
      if (!accountKey) {
        console.error('[SyncEngine] Local account key missing for sync', {
          localAccountId,
          serverAccountId,
          keyEpoch: metadata.keyEpoch,
        });
        this.setState(SYNC_STATES.ERROR, undefined, 'Local account key missing for sync');
        return;
      }

      if (this.getState() === SYNC_STATES.OFFLINE) return;
      await processPendingKeyDeliveries(client);

      // Only owners can deliver keys to new members. Skip the polling for
      // member accounts — it would just produce 403 errors on the server.
      const role = params.role ?? metadata.role;
      if (role !== 'member') {
        await processPendingKeyRequests({
          serverAccountId,
          accountKey,
          epoch: metadata.keyEpoch,
          client,
        });
      }

      // --- Step 2: Push local pending change records (batched) ---
      if (this.getState() === SYNC_STATES.OFFLINE) return;
      this.updateProgress(10, 100, undefined, 'PUSH');
      const pending = await uploadQueue.getAllByAccount(localAccountId);
      if (this.getState() === SYNC_STATES.OFFLINE) return;

      // Collect UUIDs we are pushing so we can skip them during replay (Step 4).
      // We must NOT advance the pull cursor from push sequences — doing so risks
      // skipping records that other devices pushed between our old cursor and our
      // newly-assigned push sequences (server contract: sequence > since).
      const pushedUuids = new Set(pending.map(e => e.change_uuid));
      if (pending.length > 0) {
        // Push in batches to avoid exceeding server body limits.
        // See @budget/shared/sync-limits for the coupled constants.
        const batchSize = SYNC_BATCH_SIZE;
        for (let i = 0; i < pending.length; i += batchSize) {
          if (this.getState() === SYNC_STATES.OFFLINE) return;
          const batch = pending.slice(i, i + batchSize);
          this.updateProgress(
            10 + Math.round((i / pending.length) * 30),
            100,
            undefined,
            'PUSH',
          );
          await client.pushChangeRecords({
            accountId: serverAccountId,
            records: batch.map(entry => ({
              change_uuid: entry.change_uuid,
              encrypted_payload: entry.encrypted_payload as unknown as Record<string, unknown>,
            })),
          });
        }
      }

      // --- Step 3: Pull remote changes since last cursor (skip if pushOnly) ---
      // pushOnly mode is used during logout to avoid pulling changes that won't be
      // replayed, which would advance the cursor and lose those remote changes forever.
      if (!params.pushOnly) {
        // Always pull from the original lastSyncSequence so we never skip
        // records that other devices pushed before our own push completed.
        if (this.getState() === SYNC_STATES.OFFLINE) return;
        this.updateProgress(50, 100, undefined, 'PULL');
        const pullResult = await client.pullChangeRecords({
          accountId: serverAccountId,
          since: lastSyncSequence ?? 0,
        });
        if (this.getState() === SYNC_STATES.OFFLINE) return;

        // --- Step 4: Replay pulled records locally ---
        const records = pullResult.records;
        if (records.length > 0) {
          const accountKey = await loadAccountKey(serverAccountId);
          if (!accountKey) {
            throw new Error('Account key not found, cannot decrypt remote changes');
          }

          const decoder = new TextDecoder();
          for (let i = 0; i < records.length; i++) {
            if (this.getState() === SYNC_STATES.OFFLINE) return;
            this.updateProgress(i + 1, records.length, undefined, 'REPLAY');

            const record = records[i];

            // Skip records we originated locally — they are already applied.
            if (!pushedUuids.has(record.change_uuid)) {
              try {
                const envelope = record.encrypted_payload as unknown as SymmetricEnvelope;
                const plaintextBytes = await decryptEnvelope(envelope, accountKey);
                const changeRecord = JSON.parse(decoder.decode(plaintextBytes));
                await executeCommand(changeRecord.command);
              } catch (error) {
                const message = getErrorMessage(error);
                console.error('[SyncEngine] Failed to replay remote change record', {
                  localAccountId,
                  serverAccountId,
                  sequence: record.sequence,
                  changeUuid: record.change_uuid,
                  error,
                });
                const replayError = new Error(`Failed to replay remote change ${record.sequence}: ${message}`);
                (replayError as Error & { cause?: unknown }).cause = error;
                throw replayError;
              }
            }

            // Advance cursor incrementally so a mid-replay failure doesn't re-run
            // already-processed records on the next retry.
            await upsertAccountSyncMetadata({
              localAccountId,
              serverAccountId,
              keyEpoch: metadata.keyEpoch,
              lastSyncSequence: record.sequence,
            });
          }
        }

        // --- Step 5: Persist the final sync cursor ---
        if (pullResult.next_since !== null) {
          await upsertAccountSyncMetadata({
            localAccountId,
            serverAccountId,
            keyEpoch: metadata.keyEpoch,
            lastSyncSequence: pullResult.next_since ?? lastSyncSequence,
          });
        }
      }
      
      // --- Step 6: Clear successfully pushed records from the queue ---
      if (pending.length > 0) {
        await uploadQueue.removeMany(pending.map(e => e.change_uuid));
      }

      if (this.getState() === SYNC_STATES.OFFLINE) return;
      this.setState(SYNC_STATES.SYNCED);
      this.scheduleReset();

    } catch (error: any) {
      if (this.state === SYNC_STATES.OFFLINE) return;
      if (error instanceof OnlineAccountsError && error.status === 404 && localAccountId) {
        // Server account was deleted. Verify via listAccounts before deleting
        // metadata — a transient 404 must not permanently unlink the account.
        let accountStillExists = false;
        try {
          const currentMetadata = await getAccountSyncMetadata(localAccountId);
          if (currentMetadata) {
            const { accounts } = await client.listAccounts();
            accountStillExists = accounts.some(a => a.id === currentMetadata.serverAccountId);
          }
        } catch {
          accountStillExists = true;
        }
        if (!accountStillExists) {
          await deleteAccountSyncMetadata(localAccountId);
        }
        this.setState(SYNC_STATES.SYNCED);
        this.scheduleReset();
        return;
      }
      if (error instanceof OnlineAccountsError && error.status === 403 && localAccountId) {
        // User has been removed from the shared account (keys revoked).
        // Clear sync metadata so the account reverts to local-only mode
        // and stops retrying failed sync attempts.
        await deleteAccountSyncMetadata(localAccountId);
        this.setState(SYNC_STATES.SYNCED);
        this.scheduleReset();
        return;
      }
      // Network errors (fetch throws TypeError when offline) — show OFFLINE, not ERROR
      if (error instanceof TypeError) {
        this.setState(SYNC_STATES.OFFLINE);
        return;
      }
      const message = getErrorMessage(error);
      console.error('[SyncEngine] Sync failed', {
        localAccountId,
        stage: this.progress?.stage,
        error,
      });
      this.setState(
        SYNC_STATES.ERROR,
        undefined,
        message,
        error instanceof OnlineAccountsError ? error.status : undefined,
      );
    }
  }

  private scheduleReset(): void {
    setTimeout(() => {
      if (this.state === SYNC_STATES.SYNCED) {
        this.reset();
      }
    }, 3000);
  }
}

/**
 * Singleton SyncEngine instance for the core package
 */
export const syncEngine = new SyncEngine();
