/**
 * enrollWithRetryOnConflict
 *
 * Wraps enrollRecovery with a single delete-then-retry cycle for the 409
 * "already_enrolled" case — i.e. when a user deletes their account and
 * re-registers with the same e-mail, the old recovery entry still occupies
 * the email_hash on the recovery server.
 *
 * Flow:
 *   1. Attempt enrollRecovery (POST /v1/recovery/enroll).
 *   2. On success → return true.
 *   3. On already_enrolled (409):
 *      a. Read the session JWT from localStorage.
 *      b. DELETE /v1/recovery/account (authenticated) to wipe the stale entry.
 *      c. If the DELETE fails (no token, non-2xx, network error) → return false.
 *         A 401 here means the JWT is invalid — do NOT retry blindly.
 *      d. Retry enrollRecovery exactly once.
 *      e. If the retry 409s again (should not happen, but guards against races)
 *         → return false rather than looping.
 *   4. On any other failure → return false.
 *
 * Returns true only when enrollment ultimately succeeds.
 */

import { enrollRecovery } from '@budget/core';
import type { RecoveryEnvelope } from '@budget/core';

export interface EnrollWithRetryParams {
  recoveryServerUrl: string;
  emailHash: string;
  encryptedPrivateKey: RecoveryEnvelope;
}

export async function enrollWithRetryOnConflict(
  params: EnrollWithRetryParams,
): Promise<boolean> {
  const { recoveryServerUrl, emailHash, encryptedPrivateKey } = params;

  // Step 1: first attempt
  const first = await enrollRecovery({ recoveryServerUrl, emailHash, encryptedPrivateKey });

  if (first.success) return true;

  // Any failure other than a stale entry is terminal — surface as false.
  // first.success is false here (narrowed by the early return above),
  // but TypeScript's control-flow narrowing on union members requires
  // accessing reason through a typed failure reference.
  const firstFailure = first as Exclude<typeof first, { success: true }>;
  if (firstFailure.reason !== 'already_enrolled') return false;

  // Step 3a: need the session JWT to call the authenticated DELETE endpoint.
  const sessionToken = localStorage.getItem('session_token');
  if (!sessionToken) {
    console.warn('[recovery-enroll] already_enrolled but no session_token — cannot wipe stale entry');
    return false;
  }

  // Step 3b: DELETE /v1/recovery/account (authenticated)
  let deleteOk = false;
  try {
    const normalizedBase = recoveryServerUrl.replace(/\/+$/, '');
    const deleteResp = await fetch(`${normalizedBase}/v1/recovery/account`, {
      method: 'DELETE',
      headers: {
        Authorization: `Bearer ${sessionToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ email_hash: emailHash }),
    });

    if (!deleteResp.ok) {
      // 401 = JWT invalid/expired, 4xx/5xx = server-side problem.
      // Do NOT retry enrollment in any of these cases.
      console.warn(
        `[recovery-enroll] DELETE /v1/recovery/account returned ${deleteResp.status} — aborting enrollment`,
      );
      return false;
    }

    deleteOk = true;
  } catch (err) {
    // Network error reaching the recovery server
    console.warn('[recovery-enroll] DELETE /v1/recovery/account threw:', err);
    return false;
  }

  if (!deleteOk) return false;

  // Step 3d: retry enrollment exactly once
  const retry = await enrollRecovery({ recoveryServerUrl, emailHash, encryptedPrivateKey });

  if (retry.success) return true;

  // Step 3e: second 409 or any other error after a successful delete —
  // surface as failure rather than looping.
  const retryFailure = retry as Exclude<typeof retry, { success: true }>;
  if (retryFailure.reason === 'already_enrolled') {
    console.error('[recovery-enroll] still already_enrolled after successful DELETE — aborting');
  }

  return false;
}
