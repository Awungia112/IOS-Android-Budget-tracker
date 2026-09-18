import * as Sentry from '@sentry/capacitor';
import { resolveLocalMigrationVerification, type LocalMigrationVerificationResult } from '@budget/core';

/**
 * Reports a verification anomaly to Sentry. Only enum classification + per-
 * entity counts — no account content, titles, or amounts, consistent with
 * the local-first/E2EE constraint that verification telemetry must not leak
 * plaintext.
 */
function reportAnomaly(result: LocalMigrationVerificationResult): void {
  Sentry.captureMessage('local_migration_verification_anomaly', {
    level: 'warning',
    extra: {
      classification: result.classification,
      accounts: result.accounts.map((account) => ({
        status: account.status,
        entities: account.details.map((detail) => ({
          entity: detail.entity,
          legacyCount: detail.legacyCount,
          lastElementPresent: detail.lastElementPresent,
        })),
      })),
    },
  });
}

/**
 * Runs the Stage-1 skip-detection check once per install (see
 * docs/migration/pre-4.5.0-skip-detection-ticket.md), from the "migration
 * already done" branch in LocalMigrationGate.
 *
 * Returns 'remediate' only when the check conclusively found real legacy
 * accounts that never made it into Dexie — the caller is responsible for
 * resetting the migration flag and letting the normal wizard flow run for
 * real. Otherwise returns 'none' and the gate proceeds as before; a
 * 'partial' outcome (some data already imported) is reported to Sentry in
 * the background but never triggers remediation here — see
 * resolveLocalMigrationVerification's doc comment for why.
 *
 * Never throws — a failure here must not block app launch.
 */
export async function checkForSkippedLocalMigration(): Promise<'none' | 'remediate'> {
  try {
    return await resolveLocalMigrationVerification(reportAnomaly);
  } catch (error) {
    console.warn('[Migration] Verification check failed (non-fatal):', error);
    return 'none';
  }
}
