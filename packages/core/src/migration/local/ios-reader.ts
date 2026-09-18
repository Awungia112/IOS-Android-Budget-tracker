import { readAlliOSCoreData, readCoreDataLegacyAccountId } from './ios-coredata-reader.js';
import { readRealmData, readRealmLegacyAccountIds } from './ios-realm-reader.js';
import type {
  MigrationAccount,
  MigrationTransaction,
  MigrationCategory,
  MigrationSavingGoal,
  MigrationRecurring,
  MigrationTemplate,
  MigrationLimit,
  MigrationPayload,
} from './local-legacy-types.js';

// ---------------------------------------------------------------------------
// Merge helper — Realm records take precedence over Core Data when both
// contain a record with the same legacyId.
// ---------------------------------------------------------------------------
export function mergeByLegacyId<T extends { legacyId: number | string }>(
  coreDataArr: T[],
  realmArr: T[],
): T[] {
  const realmIds = new Set(realmArr.map((r) => String(r.legacyId)));
  return [...realmArr, ...coreDataArr.filter((r) => !realmIds.has(String(r.legacyId)))];
}

// ---------------------------------------------------------------------------
// Public entry point
// ---------------------------------------------------------------------------
export async function readAlliOSData(): Promise<Partial<MigrationPayload>> {
  const [coreDataResult, realmResult] = await Promise.all([
    readAlliOSCoreData(),
    readRealmData(),
  ]);

  return {
    accounts: mergeByLegacyId<MigrationAccount>(
      coreDataResult.accounts ?? [],
      realmResult.accounts,
    ),
    transactions: mergeByLegacyId<MigrationTransaction>(
      coreDataResult.transactions ?? [],
      realmResult.transactions,
    ),
    categories: mergeByLegacyId<MigrationCategory>(
      coreDataResult.categories ?? [],
      realmResult.categories,
    ),
    savingGoals: mergeByLegacyId<MigrationSavingGoal>(
      coreDataResult.savingGoals ?? [],
      realmResult.savingGoals,
    ),
    recurringEntries: mergeByLegacyId<MigrationRecurring>(
      coreDataResult.recurringEntries ?? [],
      realmResult.recurringEntries,
    ),
    templates: mergeByLegacyId<MigrationTemplate>(
      coreDataResult.templates ?? [],
      realmResult.templates,
    ),
    limits: mergeByLegacyId<MigrationLimit>(
      coreDataResult.limits ?? [],
      realmResult.limits,
    ),
  };
}

/**
 * Tier-1 account-existence read for the local-migration verification flow
 * (pre-4.5.0 skip detection). Cheaper than readAlliOSData(): Core Data's
 * check confirms schema presence without reading entity rows, and Realm has
 * no cheaper API than its single native readRealmData() call (see
 * readRealmLegacyAccountIds).
 */
export async function readiOSLegacyAccountIds(): Promise<string[]> {
  const [coreDataAccountId, realmAccountIds] = await Promise.all([
    readCoreDataLegacyAccountId(),
    readRealmLegacyAccountIds(),
  ]);

  const ids = new Set(realmAccountIds);
  if (coreDataAccountId) ids.add(coreDataAccountId);
  return [...ids];
}
