/**
 * Shared helpers for checking and updating legacy data migration status.
 * Used by MigrationBanner, Settings, Layout, and MigrationPage.
 *
 * Re-render reactivity: components that call useMigrationRequired() will
 * automatically re-render when the migration_completed flag is written —
 * even from a different component — because we dispatch a synthetic
 * "storage" event on the same window after every write.
 *
 * Cross-account rule:
 *   The banner shows only when NO account on the device has ever migrated.
 *   Once any account completes migration the user has learned the flow —
 *   the banner is suppressed for all accounts.
 */

import { useState, useEffect } from 'react';
import { getDebugOnlineMigrationScenario } from '@/lib/debugMigrationScenarios';

// ---------------------------------------------------------------------------
// Keys
// ---------------------------------------------------------------------------

export const migrationCompletedKey = (accountId: string) =>
  `migration_completed_${accountId}`;

export const migrationBannerDismissedKey = (accountId: string) =>
  `migration_banner_dismissed_${accountId}`;

/** Key that stores the ISO timestamp after which the banner should reappear. */
export const migrationSnoozedUntilKey = (accountId: string) =>
  `migration_snoozed_until_${accountId}`;

// ---------------------------------------------------------------------------
// Readers
// ---------------------------------------------------------------------------

export const isMigrationCompleted = (accountId: string) =>
  localStorage.getItem(migrationCompletedKey(accountId)) === 'true';

export const isMigrationBannerDismissed = (accountId: string) =>
  localStorage.getItem(migrationBannerDismissedKey(accountId)) === 'true';

/** Returns true if the user snoozed and the snooze window hasn't expired yet. */
export const isMigrationSnoozed = (accountId: string): boolean => {
  const raw = localStorage.getItem(migrationSnoozedUntilKey(accountId));
  if (!raw) return false;
  return Date.now() < Number(raw);
};

/**
 * Returns true if ANY account on this device has completed migration.
 * Scans localStorage directly for migration_completed_* keys so callers
 * cannot accidentally pass an incomplete account list.
 */
export const hasAnyAccountMigrated = (): boolean => {
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key?.startsWith('migration_completed_') && localStorage.getItem(key) === 'true') {
      return true;
    }
  }
  return false;
};

/**
 * Returns true if ANY account on this device has dismissed the banner.
 * When one account ignores the banner it is suppressed for all accounts —
 * the user has made a deliberate choice to not migrate.
 */
export const hasAnyAccountDismissed = (): boolean => {
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key?.startsWith('migration_banner_dismissed_') && localStorage.getItem(key) === 'true') {
      return true;
    }
  }
  return false;
};

// ---------------------------------------------------------------------------
// Writers (dispatch a synthetic storage event so same-window listeners fire)
// ---------------------------------------------------------------------------

const dispatchStorageChange = (key: string) => {
  window.dispatchEvent(new StorageEvent('storage', { key }));
};

export const markMigrationCompleted = (accountId: string) => {
  localStorage.setItem(migrationCompletedKey(accountId), 'true');
  dispatchStorageChange(migrationCompletedKey(accountId));
};

export const dismissMigrationBanner = (accountId: string) => {
  localStorage.setItem(migrationBannerDismissedKey(accountId), 'true');
  dispatchStorageChange(migrationBannerDismissedKey(accountId));
};

/** Snooze the banner for `days` days (default 7). */
export const snoozeMigrationBanner = (accountId: string, days = 7) => {
  const until = Date.now() + days * 24 * 60 * 60 * 1000;
  localStorage.setItem(migrationSnoozedUntilKey(accountId), String(until));
  dispatchStorageChange(migrationSnoozedUntilKey(accountId));
};

// ---------------------------------------------------------------------------
// Hook — reactive migration status
// ---------------------------------------------------------------------------

/**
 * Returns true when the banner should be shown for the current account.
 *
 * Rules (in order):
 *  1. No current account → treat as “unknown”; still allow banner during bootstrap
 *     (prevents flaky integration tests waiting for BudgetProvider async Dexie init).
 *  2. ANY account on the device has migrated → false (user knows the flow)
 *  3. ANY account on the device has dismissed the banner → false (user chose to ignore)
 *  4. respectSnooze=true and current account is snoozed → false
 *  5. Otherwise → true
 *
 * Automatically re-renders when any migration_completed_* or
 * migration_banner_dismissed_* key changes.
 */
export const useMigrationRequired = (
  accountId: string | undefined,
  { respectSnooze = false } = {},
): boolean => {
  const compute = () => {
    // Dev/test-only override: lets QA force the online migration banner without
    // constructing a real legacy account history on the device.
    if (getDebugOnlineMigrationScenario() === 'required') return true;

    // If we don't know the account id yet, still show the banner unless we can
    // prove the user already migrated or dismissed the banner.
    if (hasAnyAccountMigrated()) return false;
    if (hasAnyAccountDismissed()) return false;

    if (!accountId) return true;

    if (respectSnooze && isMigrationSnoozed(accountId)) return false;
    return true;
  };


  const [required, setRequired] = useState(compute);

  useEffect(() => {
    setRequired(compute());
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accountId]);

  useEffect(() => {
    const handler = (e: StorageEvent) => {
      const isRelevant =
        e.key?.startsWith('migration_completed_') ||
        e.key?.startsWith('migration_banner_dismissed_') ||
        e.key === migrationSnoozedUntilKey(accountId ?? '');
      if (isRelevant) setRequired(compute());
    };
    window.addEventListener('storage', handler);
    return () => window.removeEventListener('storage', handler);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accountId, respectSnooze]);

  return required;
};
