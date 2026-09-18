/**
 * Post-recovery session + data restore.
 *
 * After `openRecovery()` decrypts the private key and `storePrivateKey()`
 * persists it, the app still has two gaps that prevent the recovered user
 * from using online features:
 *
 *  1. No `session_token` — `AccountContext.isLoggedIn` is false, so
 *     `Layout.handleOnlineModeToggle` and `SharingSettings.handleSyncAndRetry`
 *     route to `/register` for an account that already exists on the server.
 *  2. No replay — `replayRecoveredOnlineAccounts` (core) is exported but never
 *     wired in, so the dashboard opens empty (no accounts, transactions,
 *     categories, balances).
 *
 * This module closes both gaps in a single function:
 *   - derives the X25519 public key from the recovered private key,
 *   - POSTs `/v1/auth/recover-session` to obtain a 7-day session JWT,
 *   - persists the session so `isLoggedIn` / `isOfflineMode` are correct,
 *   - builds an `OnlineAccountsClient` and calls `replayRecoveredOnlineAccounts`
 *     to pull + decrypt + replay every synced account into local DB, merging
 *     into (never wiping) any existing local/unsynced data on the device.
 *
 * Usage: `RecoveryCode.tsx` calls `restoreAfterRecovery()` between
 * `storePrivateKey()` and navigating to `/`.
 */
import {
  BudgetService,
  getPublicKey,
  publicKeyToBase64url,
  replayRecoveredOnlineAccounts,
} from '@budget/core';
import { API_BASE_URL, nativeFetch, createAppOnlineAccountsClient } from '@/lib/api';

export interface RecoveryRestoreProgress {
  /** Number of change records replayed so far for the current account. */
  replayed: number;
  /** Total change records the server holds for the current account. */
  total: number;
}

export interface RecoveryRestoreResult {
  /** The 7-day session JWT issued by /v1/auth/recover-session. */
  sessionToken: string;
  /** Number of remote accounts that were replayed into local DB. */
  accountsRestored: number;
}

export type RecoveryRestoreErrorCode =
  | 'session_failed'
  | 'replay_failed'
  | 'nonce_failed';

export class RecoveryRestoreError extends Error {
  constructor(
    public readonly code: RecoveryRestoreErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'RecoveryRestoreError';
  }
}

/**
 * Restore the online session and replay all recovered account data.
 *
 * Best-effort: if the session succeeds but replay fails, the session is still
 * persisted so the user can manually trigger sync from the dashboard. If the
 * session itself fails (server unreachable, key mismatch), the function throws
 * — the caller should proceed to the dashboard in offline mode so the user
 * still has their recovered private key.
 *
 * @throws {RecoveryRestoreError} when the session cannot be established.
 */
export async function restoreAfterRecovery(input: {
  emailHash: string;
  privateKey: Uint8Array;
  onProgress?: (progress: RecoveryRestoreProgress) => void;
}): Promise<RecoveryRestoreResult> {
  const { emailHash, privateKey, onProgress } = input;

  // BudgetService operates on the singleton Dexie db, so a fresh instance is
  // safe and avoids coupling this lib to BudgetContext internals.
  const budgetService = new BudgetService();

  // ── 1. Derive the public key from the recovered private key ──────────────
  // getPublicKey loads the private key from the store (stored moments ago by
  // RecoveryCode) and derives the X25519 public key via crypto_scalarmult_base.
  const publicKeyBytes = await getPublicKey(emailHash);
  if (!publicKeyBytes) {
    throw new RecoveryRestoreError(
      'session_failed',
      'Failed to derive public key after recovery — private key not found in store',
    );
  }
  const publicKey = publicKeyToBase64url(publicKeyBytes);

  // ── 2. Fetch nonce for replay protection (matches /v1/auth/verify-code) ──
  const nonceResponse = await nativeFetch(`${API_BASE_URL}/v1/nonce`);
  if (!nonceResponse.ok) {
    throw new RecoveryRestoreError(
      'nonce_failed',
      `Failed to fetch nonce for session restore: ${nonceResponse.status}`,
    );
  }
  const { nonce } = (await nonceResponse.json()) as { nonce: string };

  // ── 3. Exchange the recovered identity for a 7-day session JWT ───────────
  const sessionResponse = await nativeFetch(
    `${API_BASE_URL}/v1/auth/recover-session`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-nonce': nonce,
        'x-timestamp': Date.now().toString(),
      },
      body: JSON.stringify({ email_hash: emailHash, public_key: publicKey }),
    },
  );

  if (!sessionResponse.ok) {
    throw new RecoveryRestoreError(
      'session_failed',
      `Recover-session failed: ${sessionResponse.status}`,
    );
  }

  const sessionData = (await sessionResponse.json()) as { token: string };
  const sessionToken = sessionData.token;

  // ── 4. Persist session so isLoggedIn / isOfflineMode are correct ─────────
  // This fixes Blocker 1: without these, BudgetContext.isLoggedIn is false and
  // the online features prompt routes the user to /register.
  localStorage.setItem('session_token', sessionToken);
  // Clear any stale offline preference so BudgetContext starts online.
  localStorage.removeItem('budget-wise-offline-mode');

  // ── 5. Replay all recovered accounts from the server ────────────────────
  // This fixes Blocker 2: pulls every change record for every account the user
  // owns/is a member of, decrypts each with the account key (unwrapped using the
  // recovered private key), and executes the command into local DB.
  const client = createAppOnlineAccountsClient({
    sessionToken,
    baseUrl: API_BASE_URL || window.location.origin,
  });

  // clearLocalData: false — recovery must NOT wipe pre-existing local data.
  // The default (true) clears every core table before replay, which would
  // destroy any offline-only account or prior migration on this device with no
  // way to restore it (that data lives on no server). Merging is safe: replay
  // is keyed by the online account's server-derived IDs and deduped via
  // remoteReplayRecords, so recovered accounts are added alongside — never on
  // top of — existing local/unsynced data.
  const replayResult = await replayRecoveredOnlineAccounts({
    client,
    userPublicKey: publicKeyBytes,
    userPrivateKey: privateKey,
    clearLocalData: false,
    executeCommand: (command) => budgetService.executeCommand(command),
    onProgress: (event) => {
      onProgress?.({ replayed: event.replayed, total: event.total });
    },
  });

  return {
    sessionToken,
    accountsRestored: replayResult.accounts.length,
  };
}
