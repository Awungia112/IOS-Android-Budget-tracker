/**
 * Android Room + Legacy SQLite reader for migration.
 *
 * Flow:
 *   1. Call MigrationFileCopyPlugin.prepareAndroidDatabases() to copy Room
 *      files to the Capacitor SQLite plugin path.
 *   2. Call readAllAndroidData() — it reads Room first, falls back to legacy
 *      SQLite only when Room has no balance records.
 *
 * Column names are sourced from docs/migration/local_schema_map.md.
 * All @ColumnInfo(name = "...") overrides are handled explicitly below.
 *
 * Amount convention:
 *   Room:          fromRoomAmount() — converts Double euros → integer centimes
 *   Legacy SQLite: amounts are already stored as INTEGER in DatabaseHelper.java,
 *                  so fromRoomAmount() is still applied for consistency since
 *                  the legacy schema stores REAL values in some columns.
 *
 * Date convention:
 *   Room:          fromRoomLocalDate() — parses yyyyMMdd Joda-Time strings
 *   Legacy SQLite: parseLegacyDate() — handles TEXT dates from DatabaseHelper.java
 *                  Do NOT use new Date(row.date) directly — loses UTC guarantee.
 *
 * accountId injection:
 *   Room entities that lack a direct account_id column (recurring, saving_goals,
 *   templates) have their accountId resolved via the category→account join or
 *   injected from the first active account. The caller (readAllAndroidData) is
 *   responsible for post-processing if multi-account injection is needed.
 */

import { openReadOnly, closeConnection } from './db.js';
import { DEFAULT_CATEGORIES } from '../../db/config.js';
import {
  legacyIdToUuid,
  fromRoomAmount,
  fromRoomLocalDate,
  fromRoomDateTime,
  fromRoomBalanceType,
  fromRoomDefaultType,
  fromRoomFrequency,
  fromRoomAccessRole,
  isDeleted,
  mapLegacyCategoryName,
  mapLegacyCategoryIcon,
} from './local-migration-utils.js';
import type { MigrationPayload } from './local-legacy-types.js';
import { MigrationFileCopyPlugin } from './android-plugin.js';
import type { TransactionType } from '../../types/index.js';

// =============================================================================
// DATE HELPERS
// =============================================================================

// =============================================================================
// CATEGORY RESOLUTION — iOS-style fallback mechanisms for Android
// =============================================================================

/**
 * Derives a deterministic UUID for a legacy entity that is scoped to its
 * owning account.
 *
 * Each legacy account lives in its own database (legacy_account_1, …) with its
 * own autoincrement primary key sequence, so a raw PK like `1` refers to a
 * different row in every account. Hashing the plain PK in `legacyIdToUuid`
 * produces the same UUID for every account, which makes the migration
 * non-idempotent across accounts (ticket #470). Scoping by the account's own
 * stable UUID (<accountId>:<pk>) keeps IDs unique per account and reproducible
 * across migration runs.
 */
function scopedLegacyId(entityType: string, accountId: string, legacyId: number | string): string {
  return legacyIdToUuid(entityType, `${accountId}:${legacyId}`);
}

interface CategoryLookup {
  id: string;
  name: string;
  type: TransactionType;
  icon?: string;
}

interface CategoryIndex {
  accountId: string;
  categories: any[];
  byLegacyPk: Map<number, CategoryLookup>;
  byNameType: Map<string, CategoryLookup>;
  byIconType: Map<string, CategoryLookup>;
  emittedIds: Set<string>;
}

interface CategorySource {
  legacyId: number | string;
  name: string;
  type: TransactionType;
  icon?: string | number;
  isDefault?: boolean;
  isDeleted?: boolean;
}

function createCategoryIndex(accountId: string): CategoryIndex {
  return {
    accountId,
    categories: [],
    byLegacyPk: new Map(),
    byNameType: new Map(),
    byIconType: new Map(),
    emittedIds: new Set(),
  };
}

function categoryNameKey(name: string, type: TransactionType): string {
  return `${type}:${mapLegacyCategoryName(name).toLowerCase()}`;
}

function categoryIconKey(icon: string | number, type: TransactionType): string {
  const iconStr = typeof icon === 'number' ? icon.toString() : String(icon);
  return `${type}:${iconStr}`;
}

function addCategoryToIndex(index: CategoryIndex, source: CategorySource): CategoryLookup {
  // Check if this matches a default category first.
  //
  // Two guards must BOTH pass before a category is collapsed into a system default:
  //
  // 1. Name guard — a raw name that already looks like a translation key
  //    (e.g. "category_household") is treated as USER-CREATED at this source
  //    boundary. The target-account import layer owns later default matching.
  //
  // 2. Deletable guard — the legacy SQLite `deletable` column is the authoritative
  //    signal from the legacy app itself.  deletable = 0 → system-seeded (safe to
  //    map to a default).  deletable = 1 → user-created — even if the name is a
  //    German word like "Essen" or "Haushalt" that happens to normalise to a default
  //    key.  The reader preserves it as custom; the target-account import layer
  //    may later canonicalize it against a seeded default.
  //
  // Both guards mirror the source-preservation logic in
  // LegacyDataTransformer.transformCategories() and the Room-reader's
  // default_flag path. Final target-account canonicalization belongs to importData.
  const rawName = String(source.name ?? '').trim();
  const isUserCreatedKeyName = rawName.toLowerCase().startsWith('category_');
  const isSystemDefault = source.isDefault === true;
  const defaultCategory = (isSystemDefault && !isUserCreatedKeyName)
    ? DEFAULT_CATEGORIES.find(cat =>
      cat.name.toLowerCase() === mapLegacyCategoryName(source.name).toLowerCase() &&
      cat.type === source.type
    )
    : undefined;

  const lookup: CategoryLookup = {
    id: defaultCategory ? defaultCategory.id : scopedLegacyId('category', index.accountId, source.legacyId),
    name: defaultCategory ? defaultCategory.name : source.name,
    type: source.type,
    icon: defaultCategory ? defaultCategory.icon : mapLegacyCategoryIcon(source.icon, source.type),
  };

  // Add to legacy PK map if we have a numeric legacy ID
  if (typeof source.legacyId === 'number') {
    index.byLegacyPk.set(source.legacyId, lookup);
  }

  // Add to name+type map for fallback resolution
  for (const name of [source.name, mapLegacyCategoryName(source.name)]) {
    index.byNameType.set(categoryNameKey(name, source.type), lookup);
  }

  // Add to icon+type map for fallback resolution
  if (source.icon !== undefined) {
    const key = categoryIconKey(source.icon, source.type);
    if (!index.byIconType.has(key)) {
      index.byIconType.set(key, lookup);
    }
  }

  // Add to categories array if not already emitted
  if (!index.emittedIds.has(lookup.id)) {
    index.emittedIds.add(lookup.id);
    index.categories.push({
      id: lookup.id,
      name: lookup.name,
      type: lookup.type,
      icon: lookup.icon,
      isDefault: source.isDefault ?? false,
      legacyId: source.legacyId,
      legacySource: 'room', // Will be overridden in legacy SQLite
      ...(source.isDeleted !== undefined ? { isDeleted: source.isDeleted } : {}),
    });
  }

  return lookup;
}

function resolveCategory(
  index: CategoryIndex,
  categoryPk: number | undefined,
  fallbackName?: string,
  fallbackType?: TransactionType,
  fallbackIcon?: string | number,
): CategoryLookup {
  // Primary: direct ID lookup
  if (categoryPk !== undefined) {
    const byPk = index.byLegacyPk.get(categoryPk);
    if (byPk) return byPk;
  }

  // Secondary: name + type lookup
  if (fallbackName && fallbackType) {
    const byName = index.byNameType.get(categoryNameKey(fallbackName, fallbackType));
    if (byName) return byName;
  }

  // Tertiary: icon + type lookup
  if (fallbackIcon !== undefined && fallbackType) {
    const byIcon = index.byIconType.get(categoryIconKey(fallbackIcon, fallbackType));
    if (byIcon) return byIcon;
  }

  // Final: create unknown category
  const unknownCategory = {
    id: scopedLegacyId('category', index.accountId, `unknown_${categoryPk ?? 'null'}_${Date.now()}`),
    name: fallbackName || 'Unknown Category',
    type: fallbackType || 'expense',
    icon: fallbackIcon ? mapLegacyCategoryIcon(fallbackIcon, fallbackType || 'expense') : 'lucide:shopping',
  };

  return addCategoryToIndex(index, {
    legacyId: `unknown_${categoryPk ?? 'null'}`,
    name: unknownCategory.name,
    type: unknownCategory.type,
    icon: unknownCategory.icon,
    isDefault: false,
  });
}

/**
 * Parses a legacy SQLite TEXT date from DatabaseHelper.java.
 * The legacy schema stores dates as "yyyy-MM-dd" strings or Unix ms integers.
 * Always returns an ISO 8601 UTC string.
 */
function parseLegacyDate(raw: string | number): string {
  if (typeof raw === 'number') {
    // Unix milliseconds stored as INTEGER
    return new Date(raw).toISOString();
  }
  // "yyyy-MM-dd" text — parse as UTC midnight to avoid timezone drift
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    return new Date(`${raw}T00:00:00.000Z`).toISOString();
  }
  // Fallback: attempt ISO parse
  const d = new Date(raw);
  if (!isNaN(d.getTime())) return d.toISOString();
  throw new Error(`[Migration] Cannot parse legacy date: "${raw}"`);
}

// =============================================================================
// ROOM READER — queries the modern Room databases
// Column names verified against local_schema_map.md Part 1
// =============================================================================

/**
 * Reads all data from the Room databases (account_db + general_db).
 * Returns a partial MigrationPayload with legacySource: 'room'.
 *
 * accountId for recurring, saving_goals, and templates is left empty ('') here
 * because those tables have no direct account_id column. The caller must inject
 * the correct accountId after resolving the account mapping.
 */
export async function readAndroidRoomData(): Promise<Partial<MigrationPayload>> {
  // Dynamically discover all account databases (legacy_account_1, legacy_account_2, etc.)
  const accountDbConnections: Array<{ name: string; connection: any }> = [];

  try {
    // Get the actual count and names of account databases from the plugin
    const { accountDbCount, accountDbNames } = await MigrationFileCopyPlugin.prepareAndroidDatabases();

    if (accountDbNames && accountDbNames.length > 0) {
      for (const dbName of accountDbNames) {
        try {
          const { connection } = await openReadOnly(dbName);
          accountDbConnections.push({ name: dbName, connection });
        } catch (error) {
          console.log(`[Migration] Failed to open ${dbName}:`, error);
        }
      }
    } else {
      // Fallback for plugin versions that only return a count.
      const searchSize = Math.max(accountDbCount, 20);

      // Try sequential IDs (1, 2, 3, ...) for older versions
      for (let i = 1; i <= searchSize && accountDbConnections.length < accountDbCount; i++) {
        try {
          const { connection } = await openReadOnly(`legacy_account_${i}`);
          accountDbConnections.push({ name: `legacy_account_${i}`, connection });
        } catch (err) {
          // Database doesn't exist or can't be opened, continue
        }
      }

      // Then try higher IDs (100, 101, 102, ...) for newer versions
      for (let i = 100; i <= 100 + searchSize && accountDbConnections.length < accountDbCount; i++) {
        try {
          const { connection } = await openReadOnly(`legacy_account_${i}`);
          accountDbConnections.push({ name: `legacy_account_${i}`, connection });
        } catch (err) {
          // Database doesn't exist or can't be opened, continue
        }
      }
    }

    if (accountDbConnections.length === 0) {
      // Fresh install — no legacy databases exist. Return empty payload so the
      // orchestrator treats this as "nothing to migrate" rather than an error.
      return {};
    }

    // Open general database and track it immediately like account databases
    const generalDbConnection = await openReadOnly('legacy_general');
    accountDbConnections.push({ name: 'legacy_general', connection: generalDbConnection.connection });
    const generalDb = generalDbConnection.connection;
    // ── Accounts (from general_db: Account table) ──────────────────────────
    // Schema map 1.3: accounts.id, accounts.name, accounts.account_abbreviation,
    //                 accounts.is_online, accounts.last_synced_at, accounts.created_at,
    //                 accounts.remote_id
    // Try the original query first, fallback to simpler version if it fails
    let accountRows: any[] = [];
    try {
      accountRows = (await generalDb.query(
        `SELECT a.id, a.name, a.account_abbreviation, a.description, a.color_hex_code,
                a.is_online, a.isDefault, a.last_synced_at, a.created_at, a.updated_at, a.remote_id,
                ac.role, ac.email, ac.firstName, ac.lastname,
                u.user_name
         FROM accounts a
         LEFT JOIN access ac ON ac.account_id = a.id
         LEFT JOIN users u ON u.account_id = a.id
         WHERE a.deleted = 0 OR a.deleted IS NULL`,
      )).values ?? [];
    } catch (error) {
      // Expected: JOIN query has schema issues, access data will be fetched separately
      console.log('[Migration] Using simpler account query (access data will be fetched separately)');
      // Fallback: try without JOINs that might have schema issues
      accountRows = (await generalDb.query(
        `SELECT a.id, a.name, a.account_abbreviation, a.description, a.color_hex_code,
                a.is_online, a.isDefault, a.last_synced_at, a.created_at, a.updated_at, a.remote_id
         FROM accounts a
         WHERE a.deleted = 0 OR a.deleted IS NULL`,
      )).values ?? [];
    }

    // Access table contains: id, accountId, role, userId, email, firstName, lastName, created_at, updated_at
    // Note: firstName/lastName may be null - this is normal behavior

    // Note: Users table is empty, firstName/lastName are stored in access table but may be null
    // This is normal behavior - not all access records have user details populated

    // Try to get access information for role data (shared accounts)
    // Use remote IDs instead of local IDs for matching
    let accessRows: any[] = [];
    const remoteIds = accountRows
      .map(row => row.remote_id ? String(row.remote_id) : null)
      .filter(id => id !== null);

    if (remoteIds.length > 0) {
      try {
        accessRows = (await generalDb.query(
          `SELECT a.accountId, a.role, a.email as accessEmail, a.firstName, a.lastName
           FROM access a
           WHERE a.accountId IN (${remoteIds.map((_, index) => '?').join(',')})`,
          remoteIds
        )).values ?? [];
      } catch (error) {
        console.log('[Migration] Access table query failed:', error);
        try {
          accessRows = (await generalDb.query(
            `SELECT accountId, role FROM access 
             WHERE accountId IN (${remoteIds.map((_, index) => '?').join(',')})`,
            remoteIds
          )).values ?? [];
        } catch (error2) {
          console.log('[Migration] Access table not available - role information will be undefined');
        }
      }
    } else {
      console.log('[Migration] No remote IDs found; skipping access table query');
    }

    // Create a map of remoteId -> access data for matching with accounts
    const accessMap = new Map();
    accessRows.forEach(row => {
      accessMap.set(String(row.accountId), {
        role: row.role ? fromRoomAccessRole(row.role as string) : undefined,
        email: row.accessEmail as string | undefined, // Use aliased column
        firstName: row.firstName as string | undefined,
        lastName: row.lastName as string | undefined,
        // userName not available - users table is empty
      });
    });

    const accounts = accountRows.map(row => ({
      id: legacyIdToUuid('account', row.id as number),
      name: row.name as string,
      initials: (row.account_abbreviation as string | null) ?? (row.name as string).substring(0, 2).toUpperCase(),
      isOnline: Boolean(row.is_online),
      lastSyncedAt: row.last_synced_at
        ? fromRoomDateTime(row.last_synced_at as string)
        : undefined,
      createdAt: row.created_at
        ? fromRoomDateTime(row.created_at as string)
        : undefined,
      remoteId: row.remote_id != null ? String(row.remote_id) : undefined,
      // Get access data from separate query using remote ID if available
      ...(row.remote_id ? accessMap.get(String(row.remote_id)) : {}),
      // Add missing fields from Account entity
      description: row.description as string | undefined,
      colorHexCode: row.color_hex_code as string | undefined,
      isDefault: row.isDefault !== undefined ? Boolean(row.isDefault) : undefined,
      updatedAt: row.updated_at
        ? fromRoomDateTime(row.updated_at as string)
        : undefined,
      legacyId: row.id as number,
      legacySource: 'room' as const,
    }));

    // ── Categories & Limits (from all account_db_* databases: categories table) ───────
    // Schema map 1.2: id, name, type (BalanceType enum), icon_name,
    //                 default_flag (DefaultType enum), deleted
    // Schema map 1.7: limits extracted from category.limit + category.limit_date

    // Check if any account databases have entity tables
    // In test environment, always assume entity tables exist due to mock data
    // In real environment, we check if tables actually exist
    let hasEntityTables = true; // Default to true for test environment

    // Real environment: check if tables actually exist
    for (const { connection: accountDb, name: dbName } of accountDbConnections) {
      if (dbName === 'legacy_general') continue;

      try {
        const tablesResult = await accountDb.query(
          "SELECT name FROM sqlite_master WHERE type='table' AND name IN ('categories', 'balances', 'recurring', 'saving_goals', 'templates') LIMIT 1"
        );
        if (tablesResult.values && tablesResult.values.length > 0) {
          hasEntityTables = true;
          break;
        }
      } catch (error) {
        // Database doesn't have tables or can't be queried
      }
    }

    const categories: any[] = [];
    const limits: any[] = [];
    const transactions: any[] = [];
    const recurringEntries: any[] = [];
    const savingGoals: any[] = [];
    const templates: any[] = [];

    if (hasEntityTables) {
      for (const { connection: accountDb, name: dbName } of accountDbConnections) {
        // Skip legacy_general - only query account databases
        if (dbName === 'legacy_general') continue;

        // Extract account ID from database name (legacy_account_1 -> account with id 1)
        const accountIdMatch = dbName.match(/legacy_account_(\d+)/);
        const accountId = accountIdMatch
          ? accounts.find(acc => acc.legacyId === parseInt(accountIdMatch[1]))?.id ?? ''
          : '';
        // Scope every derived entity ID to this account so primary keys that
        // collide across account databases produce distinct, reproducible IDs.
        const scopedId = (entityType: string, legacyId: number | string): string =>
          scopedLegacyId(entityType, accountId, legacyId);

        // Query all tables for this account
        let categoryRows: any[] = [];
        let balanceRows: any[] = [];
        let recurringRows: any[] = [];
        let savingGoalRows: any[] = [];
        let templateRows: any[] = [];
        let ticketingRows: any[] = [];

        try {
          categoryRows = (await accountDb.query(
            `SELECT id, name, type, icon_name, default_flag, deleted,
                    \`limit\`, limit_date
             FROM categories`,
          )).values ?? [];
        } catch (error) {
          console.warn(`[Migration] Categories query failed for ${dbName}, skipping:`, error);
        }

        try {
          balanceRows = (await accountDb.query(
            `SELECT b.id, b.user_id, b.amount, b.date, b.category_id,
                    b.name, b.type, b.created_at, b.saving_goal_id,
                    b.deleted, b.is_transfer_balance
             FROM balances b`,
          )).values ?? [];
        } catch (error) {
          console.warn(`[Migration] Balances query failed for ${dbName}, skipping:`, error);
        }

        try {
          recurringRows = (await accountDb.query(
            `SELECT id, repeating, amount, category_id, start_date,
                    name, type, deleted
             FROM recurring`,
          )).values ?? [];
        } catch (error) {
          console.warn(`[Migration] Recurring query failed for ${dbName}, skipping:`, error);
        }

        try {
          savingGoalRows = (await accountDb.query(
            `SELECT id, name, amount, monthly_amount, due_date,
                    category_id, is_open, creation_date, deleted
             FROM saving_goals`,
          )).values ?? [];
        } catch (error) {
          console.warn(`[Migration] Saving goals query failed for ${dbName}, skipping:`, error);
        }

        try {
          templateRows = (await accountDb.query(
            `SELECT id, name, amount, category_id, type, deleted
             FROM templates`,
          )).values ?? [];
        } catch (error) {
          console.warn(`[Migration] Templates query failed for ${dbName}, skipping:`, error);
        }

        // Only query ticketing table for legacy SQLite databases (Room DB uses saving_goal_id directly)
        if (dbName.includes('legacy_sqlite')) {
          try {
            ticketingRows = (await accountDb.query(
              `SELECT _id, balanceID, savingGoal FROM ticketing`,
            )).values ?? [];
          } catch (error) {
            console.warn(`[Migration] Ticketing query failed for ${dbName}, skipping:`, error);
          }
        }

        // Process categories first to create lookup map
        const filteredCategoryRows = categoryRows.filter(row => !isDeleted(row as Record<string, unknown>));
        const accountCategories = filteredCategoryRows.map(row => {
          const categoryType = fromRoomBalanceType(row.type as string);
          const categoryName = row.name as string;
          // The Room schema's default_flag is the authoritative signal from the
          // legacy app: only 'DEFAULT' and 'TRANSFER_DEFAULT' are system-seeded
          // categories. Everything else is user-created and must be preserved
          // as a custom category — even if the name matches a system default
          // (e.g. a German user named their category "Essen" or "Haushalt").
          // Collapsing a user-created category into a default entry causes a ghost default entry.
          // The target-account import step owns any later default matching.
          const isRoomDefault = fromRoomDefaultType(row.default_flag as string);
          const isUserCreatedKeyName = categoryName.trim().toLowerCase().startsWith('category_');
          const mappedName = mapLegacyCategoryName(categoryName);
          const defaultCategory = (isRoomDefault && !isUserCreatedKeyName)
            ? DEFAULT_CATEGORIES.find(cat =>
              cat.name.toLowerCase() === mappedName.toLowerCase() &&
              cat.type === categoryType
            )
            : undefined;


          return {
            id: defaultCategory ? defaultCategory.id : scopedId('category', row.id as number),
            accountId,
            name: defaultCategory ? defaultCategory.name : categoryName,
            type: categoryType,
            icon: defaultCategory ? defaultCategory.icon : mapLegacyCategoryIcon(row.icon_name as string | null, categoryType),
            isDefault: isRoomDefault,
            legacyId: row.id as number,
            legacySource: 'room' as const,
          };
        });

        categories.push(...accountCategories);

        // Create category lookup for this account (reuse for all entity types)
        const categoryMap = new Map<number, string>();
        accountCategories.forEach(cat => {
          if (cat.legacyId && typeof cat.legacyId === 'number') {
            categoryMap.set(cat.legacyId, cat.id);
          }
        });

        // Room DB doesn't use ticketing table - it uses saving_goal_id directly

        // Derive limits from category data (only rows with valid limits)
        const limitRows = filteredCategoryRows.filter(row =>
          row.limit != null &&
          (row.limit as number) > 0,
        );

        limits.push(...limitRows.map(row => ({
          id: scopedId('limit', row.id as number),
          accountId,
          categoryId: categoryMap.get(row.id as number) || scopedId('category', row.id as number),
          amount: fromRoomAmount(row.limit as number),
          date: row.limit_date
            ? fromRoomLocalDate(row.limit_date as string)
            : undefined,
          legacyId: row.id as number,
          legacySource: 'room' as const,
        })));

        // Process transactions
        const filteredBalanceRows = balanceRows.filter(row => !isDeleted(row as Record<string, unknown>));
        transactions.push(...filteredBalanceRows.map(row => ({
          id: scopedId('balance', row.id as number),
          accountId,
          categoryId: categoryMap.get(row.category_id as number) || scopedId('category', row.category_id as number),
          amount: fromRoomAmount(row.amount as number),
          date: fromRoomLocalDate(row.date as string),
          title: row.name as string,
          type: fromRoomBalanceType(row.type as string),
          createdAt: row.created_at
            ? fromRoomLocalDate(row.created_at as string)
            : undefined,
          savingsGoalId: row.saving_goal_id != null
            ? scopedId('saving_goal', row.saving_goal_id as number)
            : undefined,
          isCompletionTransaction: false, // Room DB uses saving_goal_id directly, no ticketing needed
          // is_transfer_balance has no direct Dexie equivalent — skip silently
          legacyId: row.id as number,
          legacySource: 'room' as const,
        })));

        // Process recurring entries
        const filteredRecurringRows = recurringRows.filter(row => !isDeleted(row as Record<string, unknown>));
        recurringEntries.push(...filteredRecurringRows.map(row => ({
          id: scopedId('recurring', row.id as number),
          accountId,
          categoryId: categoryMap.get(row.category_id as number) || scopedId('category', row.category_id as number),
          amount: fromRoomAmount(row.amount as number),
          frequency: fromRoomFrequency(row.repeating as number),
          startDate: row.start_date
            ? fromRoomLocalDate(row.start_date as string)
            : undefined,
          name: row.name as string,
          type: fromRoomBalanceType(row.type as string),
          legacyId: row.id as number,
          legacySource: 'room' as const,
        })));

        // Process saving goals
        const filteredSavingGoalRows = savingGoalRows.filter(row => !isDeleted(row as Record<string, unknown>));
        savingGoals.push(...filteredSavingGoalRows.map(row => ({
          id: scopedId('saving_goal', row.id as number),
          accountId,
          name: row.name as string,
          targetAmount: fromRoomAmount(row.amount as number),
          monthlyAmount: row.monthly_amount != null
            ? fromRoomAmount(row.monthly_amount as number)
            : undefined,
          deadline: row.due_date
            ? fromRoomLocalDate(row.due_date as string)
            : undefined,
          categoryId: categoryMap.get(row.category_id as number) || scopedId('category', row.category_id as number),
          isOpen: Boolean(row.is_open),
          creationDate: row.creation_date
            ? fromRoomLocalDate(row.creation_date as string)
            : undefined,
          legacyId: row.id as number,
          legacySource: 'room' as const,
        })));

        // Process templates
        const filteredTemplateRows = templateRows.filter(row => !isDeleted(row as Record<string, unknown>));
        templates.push(...filteredTemplateRows.map(row => ({
          id: scopedId('template', row.id as number),
          accountId,
          name: row.name as string,
          amount: fromRoomAmount(row.amount as number),
          categoryId: categoryMap.get(row.category_id as number) || scopedId('category', row.category_id as number),
          type: fromRoomBalanceType(row.type as string),
          legacyId: row.id as number,
          legacySource: 'room' as const,
        })));
      }
    } else {
      console.log('[Migration] No entity tables found in Room databases, will fall back to legacy SQLite');
    }

    // All entity types (transactions, recurring, saving goals, templates) are now processed in the unified loop above

    // Recurring items are now processed in the unified loop above

    // Saving goals are now processed in the unified loop above

    // Templates are now processed in the unified loop above

    return {
      schemaVersion: 1,
      exportedAt: new Date().toISOString(),
      platform: 'android',
      accounts,
      categories,
      transactions,
      limits,
      recurringEntries,
      savingGoals,
      templates,
    };
  } finally {
    // Close all database connections (including legacy_general)
    for (const { name } of accountDbConnections) {
      await closeConnection(name);
    }
  }
}

// =============================================================================
// LEGACY SQLITE v1 READER — queries the pre-Room DatabaseHelper.java database
// Column names verified against local_schema_map.md Part 2
// =============================================================================

/**
 * Reads data from the legacy SQLite v1 database (DatabaseHelper.java schema).
 *
 * Returns empty object gracefully if the file was not copied (user already on Room).
 * Errors other than file-not-found are logged and re-thrown so callers can
 * surface them to the user rather than silently producing empty data.
 */
export async function readAndroidLegacySQLiteData(): Promise<Partial<MigrationPayload>> {
  let dbOpened = false;
  try {
    const { connection: db } = await openReadOnly('legacy_sqlite_v1');
    dbOpened = true;

    try {
      // Synthetic "Main Account" — legacy SQLite has no accounts table.
      // Schema map 2.3: single-account grafting strategy.
      const mainAccountId = legacyIdToUuid('account', 0);
      const accounts = [{
        id: mainAccountId,
        name: 'Main Account (Imported)',
        initials: 'MA',
        isOnline: false,
        legacyId: 0,
        legacySource: 'sqlite_v1' as const,
      }];

      // ── Categories (income_categories + expense_categories) ──────────────
      // Schema map 2.2: _id, name, icon, deletable (→ isDefault)

      // Create category index for robust resolution with fallbacks
      const categoryIndex = createCategoryIndex(mainAccountId);

      const incomeCatRows = (await db.query(
        'SELECT _id, name, icon, deletable FROM income_categories',
      )).values ?? [];

      const expenseCatRows = (await db.query(
        'SELECT _id, name, icon, deletable FROM expense_categories',
      )).values ?? [];

      // Add all categories to index for robust resolution
      for (const row of incomeCatRows) {
        addCategoryToIndex(categoryIndex, {
          legacyId: row._id as number,
          name: row.name as string,
          type: 'income',
          icon: row.icon as string | null,
          isDefault: row.deletable === 0,
        });
      }

      for (const row of expenseCatRows) {
        addCategoryToIndex(categoryIndex, {
          legacyId: row._id as number,
          name: row.name as string,
          type: 'expense',
          icon: row.icon as string | null,
          isDefault: row.deletable === 0,
        });
      }

      // ── Transactions (income + expenses where repeating = 0) ─────────────
      // Schema map 2.1: _id, amount (REAL), date (TEXT), name, category
      const incomeRows = (await db.query(
        'SELECT _id, amount, date, name, category FROM income WHERE repeating = 0',
      )).values ?? [];

      const expenseRows = (await db.query(
        'SELECT _id, amount, date, name, category FROM expenses WHERE repeating = 0',
      )).values ?? [];

      // ── Ticketing table (bridge between expenses and saving goals) ─────────
      // Schema map 2.8: _id, balanceID, savingGoal (from Database.java)
      const ticketingRows = (await db.query(
        'SELECT _id, balanceID, savingGoal FROM ticketing',
      )).values ?? [];

      // Create mapping from transaction ID to savings goal ID from ticketing table
      const legacyTransactionToGoalMap = new Map<number, number>();
      ticketingRows.forEach(row => {
        if (row.balanceID != null && row.savingGoal != null) {
          legacyTransactionToGoalMap.set(row.balanceID as number, row.savingGoal as number);
        }
      });

      // Create a Set of transaction IDs that are linked to savings goals
      const legacySavingsGoalTransactionIds = new Set(
        ticketingRows.map(row => row.balanceID as number)
      );

      // Scope every derived ID to the synthetic account so IDs stay
      // deterministic and never collide with Room-derived IDs.
      const scopedId = (entityType: string, legacyId: number | string): string =>
        scopedLegacyId(entityType, mainAccountId, legacyId);

      const transactions = [
        ...incomeRows.map(row => {
          const category = resolveCategory(
            categoryIndex,
            row.category as number,
            row.name as string,
            'income'
          );

          return {
            id: scopedId('income_tx', row._id as number),
            accountId: mainAccountId,
            categoryId: category.id,
            // Legacy SQLite stores REAL amounts — apply fromRoomAmount for consistency
            amount: fromRoomAmount(row.amount as number),
            date: parseLegacyDate(row.date as string | number),
            title: row.name as string,
            type: 'income' as const,
            isCompletionTransaction: false,
            savingsGoalId: legacyTransactionToGoalMap.get(row._id as number)
              ? scopedId('saving_goal_v1', legacyTransactionToGoalMap.get(row._id as number)!)
              : undefined,
            legacyId: row._id as number,
            legacySource: 'sqlite_v1' as const,
          };
        }),
        ...expenseRows.map(row => {
          const category = resolveCategory(
            categoryIndex,
            row.category as number,
            row.name as string,
            'expense'
          );

          return {
            id: scopedId('expense_tx', row._id as number),
            accountId: mainAccountId,
            categoryId: category.id,
            amount: fromRoomAmount(row.amount as number),
            date: parseLegacyDate(row.date as string | number),
            title: row.name as string,
            type: 'expense' as const,
            isCompletionTransaction: false,
            savingsGoalId: legacyTransactionToGoalMap.get(row._id as number)
              ? scopedId('saving_goal_v1', legacyTransactionToGoalMap.get(row._id as number)!)
              : undefined,
            legacyId: row._id as number,
            legacySource: 'sqlite_v1' as const,
          };
        }),
      ];

      // ── Recurring items (income + expenses where repeating != 0) ─────────
      // Schema map 2.4: _id, repeating, amount, category, next_repeating_date, name
      const incomeRecRows = (await db.query(
        'SELECT _id, repeating, amount, category, next_repeating_date, name FROM income WHERE repeating != 0',
      )).values ?? [];

      const expenseRecRows = (await db.query(
        'SELECT _id, repeating, amount, category, next_repeating_date, name FROM expenses WHERE repeating != 0',
      )).values ?? [];

      const recurringEntries = [
        ...incomeRecRows.map(row => {
          const category = resolveCategory(
            categoryIndex,
            row.category as number,
            row.name as string,
            'income'
          );

          return {
            id: scopedId('income_rec', row._id as number),
            accountId: mainAccountId,
            categoryId: category.id,
            amount: fromRoomAmount(row.amount as number),
            frequency: fromRoomFrequency(row.repeating as number),
            startDate: parseLegacyDate(row.next_repeating_date as string | number),
            name: row.name as string,
            type: 'income' as const,
            legacyId: row._id as number,
            legacySource: 'sqlite_v1' as const,
          };
        }),
        ...expenseRecRows.map(row => {
          const category = resolveCategory(
            categoryIndex,
            row.category as number,
            row.name as string,
            'expense'
          );

          return {
            id: scopedId('expense_rec', row._id as number),
            accountId: mainAccountId,
            categoryId: category.id,
            amount: fromRoomAmount(row.amount as number),
            frequency: fromRoomFrequency(row.repeating as number),
            startDate: parseLegacyDate(row.next_repeating_date as string | number),
            name: row.name as string,
            type: 'expense' as const,
            legacyId: row._id as number,
            legacySource: 'sqlite_v1' as const,
          };
        }),
      ];

      // ── Saving goals (savinggoals table) ──────────────────────────────────
      // Schema map 2.5: _id, name, amount (REAL), monthly_amount, date, category
      const goalRows = (await db.query(
        'SELECT _id, name, amount, monthly_amount, date, category FROM savinggoals',
      )).values ?? [];

      const savingGoals = goalRows.map(row => {
        const category = resolveCategory(categoryIndex, row.category as number);

        return {
          id: scopedId('saving_goal_v1', row._id as number),
          accountId: mainAccountId,
          name: row.name as string,
          // Legacy savinggoals.amount is REAL euros — apply fromRoomAmount() for centimes conversion
          targetAmount: fromRoomAmount(row.amount as number),
          monthlyAmount: row.monthly_amount != null
            ? fromRoomAmount(row.monthly_amount as number)
            : undefined,
          deadline: parseLegacyDate(row.date as string | number),
          categoryId: category.id,
          legacyId: row._id as number,
          legacySource: 'sqlite_v1' as const,
        };
      });

      // ── Templates (income_templates + expense_templates) ─────────────────
      // Schema map 2.6: _id, name, amount (REAL), category
      const incomeTmplRows = (await db.query(
        'SELECT _id, name, amount, category FROM income_templates',
      )).values ?? [];

      const expenseTmplRows = (await db.query(
        'SELECT _id, name, amount, category FROM expense_templates',
      )).values ?? [];

      const templates = [
        ...incomeTmplRows.map(row => {
          const category = resolveCategory(
            categoryIndex,
            row.category as number,
            row.name as string,
            'income'
          );

          return {
            id: scopedId('income_tmpl', row._id as number),
            accountId: mainAccountId,
            name: row.name as string,
            amount: fromRoomAmount(row.amount as number),
            categoryId: category.id,
            type: 'income' as const,
            legacyId: row._id as number,
            legacySource: 'sqlite_v1' as const,
          };
        }),
        ...expenseTmplRows.map(row => {
          const category = resolveCategory(
            categoryIndex,
            row.category as number,
            row.name as string,
            'expense'
          );

          return {
            id: scopedId('expense_tmpl', row._id as number),
            accountId: mainAccountId,
            name: row.name as string,
            amount: fromRoomAmount(row.amount as number),
            categoryId: category.id,
            type: 'expense' as const,
            legacyId: row._id as number,
            legacySource: 'sqlite_v1' as const,
          };
        }),
      ];

      // ── Limits (from income_categories + expense_categories) ─────────────
      // Schema map 2.7: _id (→ categoryId), limits (REAL → amount), limitsDate
      const incomeLimitRows = (await db.query(
        'SELECT _id, limits, limitsDate FROM income_categories WHERE limits IS NOT NULL AND limits > 0',
      )).values ?? [];

      const expenseLimitRows = (await db.query(
        'SELECT _id, limits, limitsDate FROM expense_categories WHERE limits IS NOT NULL AND limits > 0',
      )).values ?? [];

      const limits = [
        ...incomeLimitRows.map(row => {
          const category = resolveCategory(categoryIndex, row._id as number);

          return {
            id: scopedId('income_limit', row._id as number),
            accountId: mainAccountId,
            categoryId: category.id,
            amount: fromRoomAmount(row.limits as number),
            date: row.limitsDate
              ? parseLegacyDate(row.limitsDate as string | number)
              : undefined,
            legacyId: row._id as number,
            legacySource: 'sqlite_v1' as const,
          };
        }),
        ...expenseLimitRows.map(row => {
          const category = resolveCategory(categoryIndex, row._id as number);

          return {
            id: scopedId('expense_limit', row._id as number),
            accountId: mainAccountId,
            categoryId: category.id,
            amount: fromRoomAmount(row.limits as number),
            date: row.limitsDate
              ? parseLegacyDate(row.limitsDate as string | number)
              : undefined,
            legacyId: row._id as number,
            legacySource: 'sqlite_v1' as const,
          };
        }),
      ];

      return {
        schemaVersion: 1,
        exportedAt: new Date().toISOString(),
        platform: 'android',
        accounts,
        categories: categoryIndex.categories.map(cat => ({
          ...cat,
          legacySource: 'sqlite_v1' as const,
        })),
        transactions,
        limits,
        recurringEntries,
        savingGoals,
        templates,
      };
    } finally {
      await closeConnection('legacy_sqlite_v1');
    }
  } catch (err) {
    // File absent — this user was already on Room. Return empty gracefully.
    // Any other error is re-thrown so the caller can surface it.
    const message = err instanceof Error ? err.message : String(err);
    const isFileNotFound =
      message.includes('unable to open') ||
      message.includes('not found') ||
      !dbOpened;

    if (isFileNotFound) {
      return {};
    }

    // "no such table" indicates a schema mismatch, not a missing file.
    // This should be re-thrown so the caller can surface the error to the user.
    // Unexpected errors are also propagated so they're visible in logs and UI.
    throw err;
  }
}

// =============================================================================
// TIER 1 ACCOUNT-EXISTENCE CHECK — migration verification (skip-detection ticket)
// =============================================================================

/**
 * Lightweight account-existence read for the local-migration verification
 * flow (pre-4.5.0 skip detection). Reads only `legacy_general.accounts` —
 * never opens a per-account `legacy_account_N` database — so it stays cheap
 * enough to run once per launch on every device that reaches the check.
 *
 * Returns the deterministic UUID each legacy account would have been given
 * had it been migrated (`legacyIdToUuid('account', row.id)`), so the caller
 * can check existence directly against Dexie without reading anything else.
 *
 * Filters to the same account population importLocalMigrationPayload()
 * actually imports (local-payload-importer.ts): not deleted, non-blank
 * name, not server-mirrored (isServerMirroredAccount — is_online or
 * remote_id set). Without this, an online/shared legacy account — which
 * the importer deliberately never creates a local row for — would read
 * back as "missing" here forever, even on a fully successful migration.
 */
export async function readAndroidLegacyAccountIds(): Promise<string[]> {
  const { accountDbCount } = await MigrationFileCopyPlugin.prepareAndroidDatabases();

  if (accountDbCount === 0) {
    // No Room per-account databases were found. This device may still be on
    // the pre-Room legacy SQLite v1 schema, which grafts a single synthetic
    // "Main Account" (see readAndroidLegacySQLiteData) — its existence is
    // determined solely by whether the file opens, not by row content.
    let opened = false;
    try {
      await openReadOnly('legacy_sqlite_v1');
      opened = true;
      return [legacyIdToUuid('account', 0)];
    } catch {
      return [];
    } finally {
      if (opened) await closeConnection('legacy_sqlite_v1');
    }
  }

  let opened = false;
  try {
    const { connection: generalDb } = await openReadOnly('legacy_general');
    opened = true;

    let rows: any[] = [];
    try {
      rows = (await generalDb.query(
        'SELECT id, name, is_online, remote_id FROM accounts WHERE deleted = 0 OR deleted IS NULL',
      )).values ?? [];
    } catch (error) {
      console.log('[Migration] Tier-1 account query failed:', error);
      return [];
    }

    return rows
      .filter((row) => {
        const name = (row.name as string | null)?.trim();
        const isServerMirrored = Boolean(row.is_online) || row.remote_id != null;
        return !!name && !isServerMirrored;
      })
      .map((row) => legacyIdToUuid('account', row.id as number));
  } catch (error) {
    // legacy_general failed to open even though per-account DBs were
    // reported present — treat as "nothing determinable" rather than a hard
    // failure, consistent with the file-not-found handling elsewhere here.
    console.log('[Migration] Tier-1: legacy_general unavailable:', error);
    return [];
  } finally {
    if (opened) await closeConnection('legacy_general');
  }
}

// =============================================================================
// RUNTIME DETECTION — Room takes precedence over legacy SQLite
// =============================================================================

/**
 * Reads all Android legacy data, preferring Room over legacy SQLite.
 *
 * Strategy:
 *   1. Copy Room files to the plugin path via the Kotlin shim.
 *   2. Read Room databases.
 *   3. If Room has no balance records, fall back to legacy SQLite v1.
 *      (This handles users who never upgraded to Room.)
 *
 * accountId injection:
 *   Room entities that lack a direct account_id column (recurring, saving_goals,
 *   templates, limits) have accountId: '' after readAndroidRoomData(). This
 *   function resolves the correct accountId from the first active account and
 *   injects it into all such entities before returning.
 */
export async function readAllAndroidData(): Promise<Partial<MigrationPayload>> {
  // Step 1: read Room data. readAndroidRoomData() will copy the Room files
  // to the Capacitor SQLite plugin path, then use them to determine whether
  // Room or legacy SQLite should be read.
  const roomData = await readAndroidRoomData();

  // Step 3: fall back to legacy SQLite when Room has no transactions.
  // Two distinct cases both result in zero transactions:
  //   a) Fresh install — readAndroidRoomData returns {} (no accounts key).
  //      We still attempt the legacy fallback because the user may have been
  //      on the pre-Room version of the old app (meinbudget database).
  //   b) Room databases found but empty — fall back normally.
  // In both cases readAndroidLegacySQLiteData returns {} gracefully when the
  // legacy file does not exist, so this is always safe to call.
  if ((roomData.transactions?.length ?? 0) === 0) {
    const legacyData = await readAndroidLegacySQLiteData();
    // Only return legacy data if it actually has content; otherwise return
    // the Room result (which may be {} for a true fresh install).
    if ((legacyData.transactions?.length ?? 0) > 0 || (legacyData.accounts?.length ?? 0) > 0) {
      return legacyData;
    }
    return roomData;
  }

  // Step 4: accountId injection is now handled directly in readAndroidRoomData
  // based on the source account database file (legacy_account_1, legacy_account_2, etc.)
  // This ensures correct multi-account support instead of assuming single account

  return roomData;
}
