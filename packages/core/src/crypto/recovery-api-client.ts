/**
 * Recovery server API client.
 *
 * Handles POST /v1/recovery/enroll — uploads the encrypted private key
 * (RecoveryEnvelope) to the recovery server.
 *
 * The client is zero-knowledge: it sends only the email hash and the
 * already-encrypted blob. The server never sees the plaintext private key
 * or the secret code.
 */

import type { RecoveryEnvelope } from './envelope.js';

export interface EnrollRecoveryParams {
  /** Base URL of the recovery server, e.g. 'https://recovery.example.com' */
  recoveryServerUrl: string;
  /** BLAKE2b-256 hex digest of the user's email + pepper. */
  emailHash: string;
  /** The encrypted private key envelope to store. */
  encryptedPrivateKey: RecoveryEnvelope;
  /** Optional request timeout in milliseconds. Defaults to 15 seconds. */
  timeoutMs?: number;
}

export type EnrollRecoveryResult =
  | { success: true }
  | { success: false; reason: 'validation_error'; message: string }
  | { success: false; reason: 'network_error'; cause: Error }
  | { success: false; reason: 'server_error'; status: number }
  | { success: false; reason: 'already_enrolled' };

const EMAIL_HASH_PATTERN = /^[0-9a-f]{64}$/;
const DEFAULT_TIMEOUT_MS = 15_000;

function normalizeRecoveryServerUrl(recoveryServerUrl: string): string | null {
  try {
    const url = new URL(recoveryServerUrl);
    return url.toString().replace(/\/+$/, '');
  } catch {
    return null;
  }
}

/**
 * POSTs the encrypted private key to the recovery server.
 *
 * Returns a typed result rather than throwing so the UI layer can map
 * outcomes to user-facing messages without catching raw errors.
 */
export async function enrollRecovery(
  params: EnrollRecoveryParams,
): Promise<EnrollRecoveryResult> {
  const {
    recoveryServerUrl,
    emailHash,
    encryptedPrivateKey,
    timeoutMs = DEFAULT_TIMEOUT_MS,
  } = params;
  const normalizedUrl = normalizeRecoveryServerUrl(recoveryServerUrl);
  if (!normalizedUrl) {
    return {
      success: false,
      reason: 'validation_error',
      message: 'invalid_recovery_server_url',
    };
  }

  if (!EMAIL_HASH_PATTERN.test(emailHash)) {
    return {
      success: false,
      reason: 'validation_error',
      message: 'invalid_email_hash',
    };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(`${normalizedUrl}/v1/recovery/enroll`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal,
      body: JSON.stringify({
        email_hash: emailHash,
        encrypted_private_key: encryptedPrivateKey,
      }),
    });

    if (response.ok) {
      return { success: true };
    }

    // 409 means the email_hash is already enrolled — the old account's recovery
    // data was not cleaned up (recovery erasure is env-dependent). Return a
    // distinct reason so the caller can wipe the stale entry and retry.
    if (response.status === 409) {
      return { success: false, reason: 'already_enrolled' };
    }

    return { success: false, reason: 'server_error', status: response.status };
  } catch (cause) {
    const error = cause instanceof Error ? cause : new Error(String(cause));
    return { success: false, reason: 'network_error', cause: error };
  } finally {
    clearTimeout(timeout);
  }
}
