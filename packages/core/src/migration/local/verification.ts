import { Capacitor } from '@capacitor/core';
import { Preferences } from '@capacitor/preferences';
import { db } from '../../db/index.js';
import { fetchLegacyData } from './orchestrator.js';
import { readAndroidLegacyAccountIds } from './android-reader.js';
import { readiOSLegacyAccountIds } from './ios-reader.js';
import type {
  MigrationLimit,
  MigrationPayload,
  MigrationRecurring,
  MigrationSavingGoal,
  MigrationTemplate,
  MigrationTransaction,
} from './local-legacy-types.js';
import type { Limit, RecurringItem, SavingsGoal, Template, Transaction } from '../../types/index.js';

/**
 * Pre-4.5.0 skip-detection ticket, Stage 1: a live, read-only comparison
 * between the legacy source and current Dexie state, run once per install.
 *
 * This module never calls runMigration() or importLocalMigrationPayload() —
 * it only reads. fetchLegacyData() below is the same read used by real
 * migration, but here it feeds a comparison, never an import.
 *
 * What this cannot see: "Cause B" — a per-table read failure during the
 * legacy read (see android-reader.ts's per-entity try/catch around
 * balances/recurring/saving_goals/templates queries) silently truncates the
 * *payload itself* to an empty array before this comparison ever runs. There
 * is no "last legacy element" left to check for an entity type that was
 * silently read as empty, so no Dexie-vs-payload comparison can detect it.
 * That needs its own fix in the readers, not a cleverer comparison here.
 */

// =============================================================================
// ONE-TIME FLAG — separate from MIGRATION_FLAG_KEY (orchestrator.ts). This
// never gates whether migration runs, only whether this read-only
// verification has already been performed once for this install.
// =============================================================================

export const MIGRATION_VERIFICATION_CHECKED_KEY = 'migration_verification_checked';

export async function hasCheckedMigrationVerification(): Promise<boolean> {
  const { value } = await Preferences.get({ key: MIGRATION_VERIFICATION_CHECKED_KEY });
  return value === 'true';
}

export async function markMigrationVerificationChecked(): Promise<void> {
  await Preferences.set({ key: MIGRATION_VERIFICATION_CHECKED_KEY, value: 'true' });
}

// =============================================================================
// TYPES
// =============================================================================

export type LocalMigrationClassification = 'fresh' | 'skipped-unmigrated' | 'migrated' | 'partial';

export type VerifiableEntity = 'transactions' | 'limits' | 'recurringItems' | 'savingsGoals' | 'templates';

export interface EntityVerificationDetail {
  entity: VerifiableEntity;
  /** Non-deleted legacy rows found for this account/entity type. */
  legacyCount: number;
  /**
   * Whether the last legacy element (by original read order) has a
   * content match in Dexie. null when legacyCount is 0 — nothing to check.
   */
  lastElementPresent: boolean | null;
}

export interface AccountVerificationDetail {
  accountId: string;
  /**
   * 'missing'  — this legacy account does not exist in Dexie at all (Tier 1).
   * 'verified' — account exists and every non-empty entity type's last
   *              element was found in Dexie (Tier 2).
   * 'partial'  — account exists but at least one entity type's last element
   *              was not found. Could be an interrupted import or Cause B;
   *              not auto-resolved here, telemetry only.
   */
  status: 'missing' | 'verified' | 'partial';
  details: EntityVerificationDetail[];
}

export interface LocalMigrationVerificationResult {
  classification: LocalMigrationClassification;
  accounts: AccountVerificationDetail[];
}

type NativeVerificationPlatform = 'android' | 'ios';

function isNativeVerificationPlatform(platform: string): platform is NativeVerificationPlatform {
  return platform === 'android' || platform === 'ios';
}

async function readLegacyAccountIds(platform: NativeVerificationPlatform): Promise<string[]> {
  return platform === 'android' ? readAndroidLegacyAccountIds() : readiOSLegacyAccountIds();
}

interface Tier1Result {
  legacyAccountIds: string[];
  presentAccountIds: string[];
}

/**
 * Tier 1 alone: which legacy accounts exist, and which of those already
 * exist in Dexie. Cheap — never opens a per-account legacy database.
 */
async function resolveTier1(platform: NativeVerificationPlatform): Promise<Tier1Result> {
  const legacyAccountIds = await readLegacyAccountIds(platform);
  if (legacyAccountIds.length === 0) {
    return { legacyAccountIds, presentAccountIds: [] };
  }

  const dexieAccounts = await Promise.all(legacyAccountIds.map((id) => db.accounts.get(id)));
  const presentAccountIds = legacyAccountIds.filter((_, i) => dexieAccounts[i] !== undefined);
  return { legacyAccountIds, presentAccountIds };
}

// =============================================================================
// TIER 2 — content-matched last-element check
// =============================================================================

function isLive<T extends { isDeleted?: boolean; accountId: string }>(entity: T, accountId: string): boolean {
  return !entity.isDeleted && entity.accountId === accountId;
}

// =============================================================================
// Content normalization — legacy rows imported long ago may have been read
// by an older version of the platform readers, whose date/whitespace
// handling can differ from what today's readers produce on a live re-read
// (see #464). Comparing raw strings would misclassify those genuinely-
// successful imports as 'partial' forever, since there's no retry that
// would ever re-normalize the frozen Dexie row. Normalizing both sides
// before comparing avoids that false positive without weakening the check.
// Same normalization shape as the #462 duplicate-detection content hash,
// for consistency: trimmed/lowercased title, day-granularity date, amount
// rounded to cents.
// =============================================================================

function normalizeTitle(value: string): string {
  return value.trim().toLowerCase();
}

function normalizeDay(isoDate: string): string {
  return isoDate.slice(0, 10);
}

function normalizeAmount(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

/**
 * Checks whether the last element of a legacy entity array (by original read
 * order) has a match among the corresponding Dexie rows.
 *
 * Matches by id first: a fresh Tier-2 re-read computes each legacy row's id
 * the same deterministic way the original import did (legacyIdToUuid, now
 * account-scoped per #470), so `legacy.id === domain.id` is a direct,
 * unambiguous proof of identity whenever importEntity() didn't have to
 * re-mint a random UUID (budget.service.ts) on a same-account retry
 * collision — ids are unique within a Dexie table by construction, so this
 * can never be ambiguous.
 *
 * Falls back to normalized content matching only when it uniquely
 * identifies a single domain row. In duplicate-affected populations
 * (#457/#465/#462), multiple domain rows can legitimately share one content
 * signature; trusting *any* content match there would report "verified"
 * even when the intended row was never actually imported — an ambiguous
 * content match is treated as no match at all, not as a pass.
 *
 * Checking only the last element is equivalent to a full count for detecting
 * an interrupted import: importData() writes each entity type via a single,
 * strictly sequential for...of loop (no Promise.all, no catch-and-continue),
 * so if the last element made it in, everything before it in that run
 * necessarily did too; if it's missing, everything from the interruption
 * point onward is guaranteed missing.
 */
function lastElementPresent<TLegacy extends { id: string }, TDomain extends { id: string }>(
  legacyItems: TLegacy[],
  domainItems: TDomain[],
  matchesContent: (legacy: TLegacy, domain: TDomain) => boolean,
): boolean | null {
  if (legacyItems.length === 0) return null;
  const last = legacyItems[legacyItems.length - 1];

  if (domainItems.some((domain) => domain.id === last.id)) return true;

  const contentMatches = domainItems.filter((domain) => matchesContent(last, domain));
  return contentMatches.length === 1;
}

async function verifyAccount(payload: MigrationPayload, accountId: string): Promise<AccountVerificationDetail> {
  const legacyTransactions = payload.transactions.filter((t) => isLive(t, accountId));
  const legacyLimits = payload.limits.filter((l) => isLive(l, accountId));
  const legacyRecurring = payload.recurringEntries.filter((r) => isLive(r, accountId));
  const legacySavingGoals = payload.savingGoals.filter((g) => isLive(g, accountId));
  const legacyTemplates = payload.templates.filter((t) => isLive(t, accountId));

  const [domainTransactions, domainLimits, domainRecurring, domainSavingGoals, domainTemplates] = await Promise.all([
    db.transactions.where('accountId').equals(accountId).toArray(),
    db.limits.where('accountId').equals(accountId).toArray(),
    db.recurringItems.where('accountId').equals(accountId).toArray(),
    db.savingsGoals.where('accountId').equals(accountId).toArray(),
    db.templates.where('accountId').equals(accountId).toArray(),
  ]);

  const details: EntityVerificationDetail[] = [
    {
      entity: 'transactions',
      legacyCount: legacyTransactions.length,
      lastElementPresent: lastElementPresent<MigrationTransaction, Transaction>(
        legacyTransactions,
        domainTransactions,
        (legacy, domain) =>
          normalizeDay(domain.date) === normalizeDay(legacy.date) &&
          normalizeAmount(domain.amount) === normalizeAmount(legacy.amount) &&
          normalizeTitle(domain.title) === normalizeTitle(legacy.title),
      ),
    },
    {
      entity: 'limits',
      legacyCount: legacyLimits.length,
      // categoryId is unreliable (remapped on import) and the domain Limit
      // type carries no date/title, so amount is the only stable signal.
      lastElementPresent: lastElementPresent<MigrationLimit, Limit>(
        legacyLimits,
        domainLimits,
        (legacy, domain) => normalizeAmount(domain.amount) === normalizeAmount(legacy.amount),
      ),
    },
    {
      entity: 'recurringItems',
      legacyCount: legacyRecurring.length,
      lastElementPresent: lastElementPresent<MigrationRecurring, RecurringItem>(
        legacyRecurring,
        domainRecurring,
        (legacy, domain) =>
          normalizeTitle(domain.name) === normalizeTitle(legacy.name) &&
          normalizeAmount(domain.amount) === normalizeAmount(legacy.amount) &&
          normalizeDay(domain.startDate) === normalizeDay(legacy.startDate),
      ),
    },
    {
      entity: 'savingsGoals',
      legacyCount: legacySavingGoals.length,
      lastElementPresent: lastElementPresent<MigrationSavingGoal, SavingsGoal>(
        legacySavingGoals,
        domainSavingGoals,
        (legacy, domain) =>
          normalizeTitle(domain.name) === normalizeTitle(legacy.name) &&
          normalizeAmount(domain.targetAmount) === normalizeAmount(legacy.targetAmount),
      ),
    },
    {
      entity: 'templates',
      legacyCount: legacyTemplates.length,
      lastElementPresent: lastElementPresent<MigrationTemplate, Template>(
        legacyTemplates,
        domainTemplates,
        (legacy, domain) =>
          normalizeTitle(domain.name) === normalizeTitle(legacy.name) &&
          normalizeAmount(domain.amount) === normalizeAmount(legacy.amount),
      ),
    },
  ];

  const status = details.every((d) => d.lastElementPresent !== false) ? 'verified' : 'partial';

  return { accountId, status, details };
}

// =============================================================================
// PUBLIC API
// =============================================================================

/**
 * Live Tier 1 + Tier 2 verification of whether the local legacy migration
 * actually ran for this install. Read-only end to end. Safe to call
 * repeatedly; callers that only want it once per install should gate with
 * hasCheckedMigrationVerification()/markMigrationVerificationChecked(), or
 * just use checkLegacyMigrationVerificationOnce() below.
 */
export async function verifyLocalMigrationState(): Promise<LocalMigrationVerificationResult> {
  const platform = Capacitor.getPlatform();

  if (!isNativeVerificationPlatform(platform)) {
    return { classification: 'fresh', accounts: [] };
  }

  const { legacyAccountIds, presentAccountIds } = await resolveTier1(platform);

  if (legacyAccountIds.length === 0) {
    // No legacy account was ever readable on this device — nothing to
    // migrate, ever. Distinct from "skipped-unmigrated", which requires a
    // real legacy account to exist and be absent from Dexie.
    return { classification: 'fresh', accounts: [] };
  }

  if (presentAccountIds.length === 0) {
    // Tier 1 fully resolves this case — no need to open any per-account
    // legacy database to reach a confident classification.
    return {
      classification: 'skipped-unmigrated',
      accounts: legacyAccountIds.map((accountId) => ({ accountId, status: 'missing' as const, details: [] })),
    };
  }

  // Tier 2: at least one legacy account exists in Dexie — re-read the full
  // legacy payload (same platform readers real migration uses) purely to
  // compare against current Dexie state.
  const payload = await fetchLegacyData();

  const missingAccounts: AccountVerificationDetail[] = legacyAccountIds
    .filter((id) => !presentAccountIds.includes(id))
    .map((accountId) => ({ accountId, status: 'missing' as const, details: [] }));

  const checkedAccounts = await Promise.all(presentAccountIds.map((accountId) => verifyAccount(payload, accountId)));

  const accounts = [...checkedAccounts, ...missingAccounts];
  const classification: LocalMigrationClassification = accounts.every((a) => a.status === 'verified')
    ? 'migrated'
    : accounts.every((a) => a.status === 'missing')
      ? 'skipped-unmigrated'
      : 'partial';

  return { classification, accounts };
}

export type LocalMigrationVerificationAction = 'none' | 'remediate';

/**
 * One-time, install-scoped entry point for the app gate (see
 * LocalMigrationGate.tsx / migrationVerification.ts in packages/app).
 *
 * Runs Tier 1 only (cheap — never opens a per-account legacy database).
 * Returns 'remediate' only when Tier 1 conclusively shows real legacy
 * accounts that never made it into Dexie at all — the one case where
 * re-running migration is provably safe, because there is nothing in Dexie
 * a re-import could duplicate. This function only decides; the caller
 * (LocalMigrationGate) is responsible for actually resetting the migration
 * flag and letting the normal wizard/import flow run for real.
 *
 * When some or all legacy accounts already exist (the common case — a
 * genuine successful migration), this never returns 'remediate' — re-import
 * there risks duplicating data via the cross-account-collision new-UUID
 * path in importEntity() (budget.service.ts). Instead it kicks off the
 * fuller Tier 1+2 read (verifyLocalMigrationState) in the background,
 * purely to report a 'partial' outcome through onAnomalyDetected for
 * telemetry — never awaited, never blocking, never auto-remediated.
 *
 * The one-time flag is deliberately NOT marked before returning 'remediate':
 * the caller still has to actually reset the migration flag, and that isn't
 * durable until it happens. If the app is killed in between, the flag must
 * still be unset so the next launch re-runs this (cheap, Tier-1-only)
 * decision — otherwise the one-shot check gets permanently burned with the
 * remediation never having happened, stranding exactly the population this
 * mechanism exists to recover. Every other outcome is genuinely final as
 * soon as it's reached (nothing further for the caller to do), so it's safe
 * to mark checked immediately.
 */
export async function resolveLocalMigrationVerification(
  onAnomalyDetected: (result: LocalMigrationVerificationResult) => void = () => undefined,
): Promise<LocalMigrationVerificationAction> {
  if (await hasCheckedMigrationVerification()) {
    return 'none';
  }

  const platform = Capacitor.getPlatform();
  if (!isNativeVerificationPlatform(platform)) {
    await markMigrationVerificationChecked();
    return 'none';
  }

  const { legacyAccountIds, presentAccountIds } = await resolveTier1(platform);

  if (legacyAccountIds.length === 0) {
    await markMigrationVerificationChecked();
    return 'none'; // fresh — nothing to migrate, ever
  }

  if (presentAccountIds.length === 0) {
    // Not marked checked — see doc comment above.
    return 'remediate';
  }

  await markMigrationVerificationChecked();

  // Some/all accounts already present — re-reads Tier 1 internally (cheap,
  // acceptable duplication) as part of the full Tier 1+2 comparison.
  void verifyLocalMigrationState()
    .then((result) => {
      if (result.classification === 'partial') {
        onAnomalyDetected(result);
      }
    })
    .catch(() => undefined);

  return 'none';
}
