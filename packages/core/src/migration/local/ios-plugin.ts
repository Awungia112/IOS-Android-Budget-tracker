import { registerPlugin } from '@capacitor/core';

// Raw shapes coming off the Capacitor bridge — property names match
// the Swift serialisation in MigrationSetupPlugin.serialize()

export interface CoreDataLegacyLimit {
  name: string;
  amount: number;       // integer centimes from legacy UserDefaults
  createdAt: number;
  categoryTitle: string;
}

export interface PrepareiOSDatabasesResult {
  coreDataPresent: boolean;
  copied: boolean;
  limits: CoreDataLegacyLimit[];
  error?: string;
  limitsError?: string;
}

export interface RealmRawAccount {
  legacyId: number | string;
  name: string;
  initials: string;
  /** Category IDs owned by this account — used for proper §4.7 limit derivation.
   * May be absent if an older plugin version (without this field) is loaded. */
  categoryLegacyIds?: Array<number | string>;
  role?: string;
  onlineId?: number | string;
  legacySource: 'realm';
}

export interface RealmRawBalance {
  legacyId: number | string;
  amount: number;       // integer centimes
  date: number;         // Unix ms
  title: string;
  categoryLegacyId?: number | string;
  accountLegacyId?: number | string;
  savingGoalLegacyId?: number | string;
  onlineId?: number | string;
  legacySource: 'realm';
}

export interface RealmRawCategory {
  legacyId: number | string;
  name: string;
  balanceType?: string; // "income" | "expense" from Swift; older payloads may use legacy enum strings
  icon?: number;        // Int from Swift (1–17 expense, 1–5 income) — mapLegacyCategoryIcon() maps this
  isDefault: boolean;
  limit?: number;       // integer centimes; optional — nil means no limit (§4.7)
  onlineId?: number | string;
  legacySource: 'realm';
}

export interface RealmRawSavingGoal {
  legacyId: number | string;
  name: string;
  targetAmount: number; // integer centimes
  deadline: number;     // Unix ms
  accountLegacyId?: number | string;
  categoryLegacyId?: number | string;
  monthlyAmount?: number; // integer centimes
  onlineId?: number | string;
  legacySource: 'realm';
}

export interface RealmRawRecurring {
  legacyId: number | string;
  name: string;
  amount: number;       // integer centimes
  startDate: number;    // Unix ms
  interval: number;     // maps to Frequency via fromRoomFrequency()
  accountLegacyId?: number | string; // resolved from owning RealmAccount list (§4.5)
  categoryLegacyId?: number | string;
  monthlyAmount?: number;
  onlineId?: number | string;
  legacySource: 'realm';
}

export interface RealmRawTemplate {
  legacyId: number | string;
  name: string;
  amount: number;       // integer centimes
  accountLegacyId?: number | string; // resolved from owning RealmAccount list (§4.6)
  categoryLegacyId?: number | string;
  onlineId?: number | string;
  legacySource: 'realm';
}

/**
 * Note: limits are not serialised by the Swift layer.
 * They are derived from categories with a non-null `limit` field on the
 * TypeScript side. See §4.7 in local_schema_map.md and the limits block
 * in ios-realm-reader.ts.
 */
export interface RealmDataResult {
  accounts: RealmRawAccount[];
  balances: RealmRawBalance[];
  categories: RealmRawCategory[];
  savingGoals: RealmRawSavingGoal[];
  recurringBalances: RealmRawRecurring[];
  templates: RealmRawTemplate[];
}

export interface MigrationSetupPluginDefinition {
  prepareiOSDatabases(): Promise<PrepareiOSDatabasesResult>;
  readRealmData(): Promise<RealmDataResult>;
}

export const MigrationSetupPlugin =
  registerPlugin<MigrationSetupPluginDefinition>('MigrationSetupPlugin');
