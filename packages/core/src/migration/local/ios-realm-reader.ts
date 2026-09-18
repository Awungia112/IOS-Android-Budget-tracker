import { MigrationSetupPlugin } from './ios-plugin.js';
import {
  legacyIdToUuid,
  fromUnixMs,
  fromRealmAmount,
  toTransactionType,
  fromRealmInterval,
  mapLegacyCategoryName,
  mapLegacyCategoryIcon,
} from './local-migration-utils.js';
import type {
  MigrationAccount,
  MigrationTransaction,
  MigrationCategory,
  MigrationSavingGoal,
  MigrationRecurring,
  MigrationTemplate,
  MigrationLimit,
} from './local-legacy-types.js';
import type { TransactionType } from '../../types/index.js';
import type { RealmRawCategory } from './ios-plugin.js';

export interface RealmMigrationPayload {
  accounts: MigrationAccount[];
  transactions: MigrationTransaction[];
  categories: MigrationCategory[];
  savingGoals: MigrationSavingGoal[];
  recurringEntries: MigrationRecurring[];
  templates: MigrationTemplate[];
  limits: MigrationLimit[];
}

function optionalString(value: number | string | undefined): string | undefined {
  return value == null ? undefined : String(value);
}

const INCOME_CATEGORY_KEYS = new Set([
  'category_general',
  'category_salary',
  'category_allowance',
  'category_gift',
  'category_holiday_job',
  'category_transfer',
  'category_tutoring',
  'category_selling_online',
  'category_babysitting',
  'category_scholarship',
  'category_cashback',
]);

const EXPENSE_CATEGORY_KEYS = new Set([
  'category_household',
  'category_housing',
  'category_food',
  'category_shopping',
  'category_books',
  'category_office',
  'category_internet',
  'category_clothing',
  'category_hobby',
  'category_mobile',
  'category_going_out',
  'category_bus',
  'category_vacation',
  'category_savings',
  'category_entertainment',
  'category_party',
  'category_leisure',
  'category_travel',
  'category_utilities',
  'category_subscriptions',
  'category_personal_care',
  'category_health',
  'category_education',
  'category_sports',
]);

function inferCategoryTypeFromName(name: string): TransactionType | undefined {
  const mappedName = mapLegacyCategoryName(name);
  if (INCOME_CATEGORY_KEYS.has(mappedName)) return 'income';
  if (EXPENSE_CATEGORY_KEYS.has(mappedName)) return 'expense';
  return undefined;
}

function resolveCategoryType(
  category: RealmRawCategory | undefined,
  context: string,
  categoryLegacyId?: number | string,
): TransactionType {
  if (category?.balanceType) return toTransactionType(category.balanceType);

  if (category) {
    const inferredType = inferCategoryTypeFromName(category.name);
    if (inferredType) {
      console.warn(
        `[Migration] ${context} category "${category.name}" (${category.legacyId}) has no balanceType — inferred '${inferredType}' from category name.`,
      );
      return inferredType;
    }
  }

  console.warn(
    `[Migration] ${context} could not resolve Realm category type`
    + (categoryLegacyId == null ? '' : ` for category ${categoryLegacyId}`)
    + " — defaulting to 'expense'. Icon/type may be incorrect.",
  );
  return 'expense';
}

export async function readRealmData(): Promise<RealmMigrationPayload> {
  const raw = await MigrationSetupPlugin.readRealmData();

  // ── Accounts ──────────────────────────────────────────────────────────────
  const accounts: MigrationAccount[] = raw.accounts.map((obj) => ({
    id: legacyIdToUuid('account', obj.legacyId),
    name: obj.name.trim(),
    initials: obj.initials?.trim() || undefined, // Swift default is "" — map to undefined so UI gets no-initials rather than empty string
    role: obj.role,
    onlineId: optionalString(obj.onlineId),
    legacyId: obj.legacyId,
    legacySource: 'realm' as const,
  }));

  // ── Categories ────────────────────────────────────────────────────────────
  const categories: MigrationCategory[] = raw.categories.map((obj) => {
    // Resolve type once — used for both the category field and icon lookup.
    // The current Swift bridge always serializes balanceType from the non-null
    // legacy enum. The fallback exists only for stale/older native payloads.
    const type = resolveCategoryType(obj, 'RealmCategory');

    return {
      id: legacyIdToUuid('category', obj.legacyId),
      name: mapLegacyCategoryName(obj.name),
      type,
      icon: mapLegacyCategoryIcon(obj.icon, type),
      isDefault: obj.isDefault,
      onlineId: optionalString(obj.onlineId),
      legacyId: obj.legacyId,
      legacySource: 'realm' as const,
    };
  });

  // Build a fast category lookup for type derivation
  const categoryById = new Map(raw.categories.map((c) => [String(c.legacyId), c]));

  // ── Transactions (balances) ───────────────────────────────────────────────
  const transactions: MigrationTransaction[] = raw.balances.map((obj) => {
    const linkedCat = obj.categoryLegacyId == null ? undefined : categoryById.get(String(obj.categoryLegacyId));
    const type = resolveCategoryType(linkedCat, `RealmBalance ${obj.legacyId}`, obj.categoryLegacyId);

    return {
      id: legacyIdToUuid('transaction', obj.legacyId),
      accountId: obj.accountLegacyId
        ? legacyIdToUuid('account', obj.accountLegacyId)
        : legacyIdToUuid('account', '__realm_default__'),
      categoryId: obj.categoryLegacyId
        ? legacyIdToUuid('category', obj.categoryLegacyId)
        : legacyIdToUuid('category', '__unknown__'),
      amount: fromRealmAmount(obj.amount),
      date: fromUnixMs(obj.date),
      title: obj.title.trim(),
      type,
      savingsGoalId: obj.savingGoalLegacyId
        ? legacyIdToUuid('savingGoal', obj.savingGoalLegacyId)
        : undefined,
      onlineId: optionalString(obj.onlineId),
      legacyId: obj.legacyId,
      legacySource: 'realm' as const,
    };
  });

  // ── Saving goals ──────────────────────────────────────────────────────────
  const savingGoals: MigrationSavingGoal[] = raw.savingGoals.map((obj) => {
    const linkedCat = obj.categoryLegacyId == null ? undefined : categoryById.get(String(obj.categoryLegacyId));
    const type = resolveCategoryType(linkedCat, `RealmSavingGoal ${obj.legacyId}`, obj.categoryLegacyId);

    return {
      id: legacyIdToUuid('savingGoal', obj.legacyId),
      accountId: obj.accountLegacyId
        ? legacyIdToUuid('account', obj.accountLegacyId)
        : legacyIdToUuid('account', '__realm_default__'),
      name: obj.name.trim(),
      targetAmount: fromRealmAmount(obj.targetAmount),
      monthlyAmount: obj.monthlyAmount === undefined ? undefined : fromRealmAmount(obj.monthlyAmount),
      deadline: fromUnixMs(obj.deadline),
      categoryId: obj.categoryLegacyId
        ? legacyIdToUuid('category', obj.categoryLegacyId)
        : legacyIdToUuid('category', '__unknown__'),
      icon: mapLegacyCategoryIcon(linkedCat?.icon, type),
      onlineId: optionalString(obj.onlineId),
      legacyId: obj.legacyId,
      legacySource: 'realm' as const,
    };
  });

  // ── Recurring entries ─────────────────────────────────────────────────────
  // accountLegacyId is resolved in Swift by walking RealmAccount.realmRecurringBalances (§4.5)
  const recurringEntries: MigrationRecurring[] = raw.recurringBalances.map((obj) => {
    const linkedCat = obj.categoryLegacyId == null ? undefined : categoryById.get(String(obj.categoryLegacyId));
    const type = resolveCategoryType(linkedCat, `RealmRecurringBalance ${obj.legacyId}`, obj.categoryLegacyId);

    return {
      id: legacyIdToUuid('recurring', obj.legacyId),
      accountId: obj.accountLegacyId
        ? legacyIdToUuid('account', obj.accountLegacyId)
        : legacyIdToUuid('account', '__realm_default__'),
      categoryId: obj.categoryLegacyId
        ? legacyIdToUuid('category', obj.categoryLegacyId)
        : legacyIdToUuid('category', '__unknown__'),
      amount: fromRealmAmount(obj.amount),
      frequency: fromRealmInterval(obj.interval),
      startDate: fromUnixMs(obj.startDate),
      name: obj.name.trim(),
      type,
      onlineId: optionalString(obj.onlineId),
      legacyId: obj.legacyId,
      legacySource: 'realm' as const,
    };
  });

  // ── Templates ─────────────────────────────────────────────────────────────
  // accountLegacyId is resolved in Swift by walking RealmAccount.realmTemplates (§4.6)
  const templates: MigrationTemplate[] = raw.templates.map((obj) => {
    const linkedCat = obj.categoryLegacyId == null ? undefined : categoryById.get(String(obj.categoryLegacyId));
    const type = resolveCategoryType(linkedCat, `RealmTemplate ${obj.legacyId}`, obj.categoryLegacyId);

    return {
      id: legacyIdToUuid('template', obj.legacyId),
      accountId: obj.accountLegacyId
        ? legacyIdToUuid('account', obj.accountLegacyId)
        : legacyIdToUuid('account', '__realm_default__'),
      name: obj.name.trim(),
      amount: fromRealmAmount(obj.amount),
      categoryId: obj.categoryLegacyId
        ? legacyIdToUuid('category', obj.categoryLegacyId)
        : legacyIdToUuid('category', '__unknown__'),
      type,
      onlineId: optionalString(obj.onlineId),
      legacyId: obj.legacyId,
      legacySource: 'realm' as const,
    };
  });

  // ── Limits (§4.7) ─────────────────────────────────────────────────────────
  // Per schema map §4.7: "While iterating through RealmAccount objects, check
  // its realmCategories. For each category that has a limit != nil, create a
  // record in the Dexie limits table using that account.id."
  //
  // The Swift layer now serialises account.categoryLegacyIds, so we can do the
  // exact walk described in the schema map instead of approximating via
  // transaction cross-references.
  const categoryLimitById = new Map(
    raw.categories
      .filter((c) => c.limit != null)
      .map((c) => [c.legacyId, c.limit!]),
  );

  const limits: MigrationLimit[] = [];
  for (const account of raw.accounts) {
    for (const categoryLegacyId of account.categoryLegacyIds ?? []) {
      const limitAmount = categoryLimitById.get(categoryLegacyId);
      if (limitAmount == null) continue;

      // compositeId is "categoryLegacyId:accountLegacyId" — a string, not a plain
      // UUID or integer. This is intentional: Realm has no dedicated limit table so
      // there is no single numeric PK. The colon-separated format is unique because
      // legacyIdToUuid prefixes it with the entity type ("limit:…"), preventing
      // collisions with other migration paths.
      const compositeId = `${categoryLegacyId}:${account.legacyId}`;
      limits.push({
        id: legacyIdToUuid('limit', compositeId),
        accountId: legacyIdToUuid('account', account.legacyId),
        categoryId: legacyIdToUuid('category', categoryLegacyId),
        amount: fromRealmAmount(limitAmount),
        legacyId: compositeId, // string — see comment above
        legacySource: 'realm' as const,
      });
    }
  }

  return {
    accounts,
    transactions,
    categories,
    savingGoals,
    recurringEntries,
    templates,
    limits,
  };
}

/**
 * Tier-1 account-existence read for the local-migration verification flow
 * (pre-4.5.0 skip detection). Realm has no separate per-account file to
 * avoid opening — MigrationSetupPlugin.readRealmData() is a single native
 * call that already returns everything — so this is just the accounts slice
 * of that same call, kept separate so callers doing a Tier-1-only check
 * don't need to know about the rest of the Realm payload shape.
 *
 * Filters to the same account population importLocalMigrationPayload()
 * actually imports (local-payload-importer.ts): non-blank name, not
 * server-mirrored (isServerMirroredAccount — onlineId set). Without this,
 * an online/shared legacy account — which the importer deliberately never
 * creates a local row for — would read back as "missing" here forever,
 * even on a fully successful migration.
 */
export async function readRealmLegacyAccountIds(): Promise<string[]> {
  const raw = await MigrationSetupPlugin.readRealmData();
  return raw.accounts
    .filter((obj) => obj.name?.trim() && optionalString(obj.onlineId) == null)
    .map((obj) => legacyIdToUuid('account', obj.legacyId));
}
