export interface MigrationAccount {
  id: string;           // new UUID (generated deterministically)
  name: string;
  initials?: string;
  email?: string;
  isOnline?: boolean;
  lastSyncedAt?: string;
  createdAt?: string;
  role?: string;
  firstName?: string;
  lastName?: string;
  userName?: string;
  remoteId?: string;
  onlineId?: string;
  legacyId: number | string;     // original integer PK — kept for cross-referencing
  legacySource: 'room' | 'sqlite_v1' | 'core_data' | 'realm';
  isDeleted?: boolean;
}

export interface MigrationTransaction {
  id: string;
  accountId: string;    // UUID — references MigrationAccount.id
  categoryId: string;   // UUID — references MigrationCategory.id
  amount: number;       // decimal euros, e.g. 12.34
  date: string;         // ISO 8601 UTC string — "2024-03-15T10:30:00Z"
  title: string;
  note?: string;
  type?: string;
  createdAt?: string;
  savingsGoalId?: string;
  isCompletionTransaction?: boolean;
  onlineId?: string;
  legacyId: number | string;
  legacySource: 'room' | 'sqlite_v1' | 'core_data' | 'realm';
  isDeleted?: boolean;
}

export interface MigrationCategory {
  id: string;
  name: string;
  type?: string;
  icon?: string;
  isDefault?: boolean;
  onlineId?: string;
  legacyId: number | string;
  legacySource: 'room' | 'sqlite_v1' | 'core_data' | 'realm';
  isDeleted?: boolean;
}

export interface MigrationLimit {
  id: string;
  accountId: string;
  amount: number;       // decimal euros, e.g. 12.34
  categoryId: string;
  date?: string;
  onlineId?: string;
  /**
   * For Room/Core Data/SQLite this is the numeric PK of the limit row.
   * For Realm there is no dedicated limit table — the value is a composite
   * string "categoryLegacyId:accountLegacyId" (see ios-realm-reader.ts §4.7).
   */
  legacyId: number | string;
  legacySource: 'room' | 'sqlite_v1' | 'core_data' | 'realm';
  isDeleted?: boolean;
}

export interface MigrationRecurring {
  id: string;
  accountId: string;
  categoryId: string;
  amount: number;       // decimal euros, e.g. 12.34
  frequency: string | number;
  startDate: string;
  name: string;
  type?: string;
  dayOfMonth?: string | number;
  onlineId?: string;
  legacyId: number | string;
  legacySource: 'room' | 'sqlite_v1' | 'core_data' | 'realm';
  isDeleted?: boolean;
}

export interface MigrationSavingGoal {
  id: string;
  accountId: string;
  name: string;
  targetAmount: number; // decimal euros, e.g. 12.34
  monthlyAmount?: number; // decimal euros, e.g. 12.34
  deadline: string;
  categoryId: string;
  isOpen?: boolean;
  creationDate?: string;
  icon?: string;
  onlineId?: string;
  legacyId: number | string;
  legacySource: 'room' | 'sqlite_v1' | 'core_data' | 'realm';
  isDeleted?: boolean;
}

export interface MigrationTemplate {
  id: string;
  accountId: string;
  name: string;
  amount: number;       // decimal euros, e.g. 12.34
  categoryId: string;
  type?: string;
  onlineId?: string;
  legacyId: number | string;
  legacySource: 'room' | 'sqlite_v1' | 'core_data' | 'realm';
  isDeleted?: boolean;
}

export interface MigrationPayload {
  schemaVersion: 1;
  exportedAt: string;   // ISO timestamp of when the export ran
  platform: 'android' | 'ios';
  accounts: MigrationAccount[];
  categories: MigrationCategory[];
  transactions: MigrationTransaction[];
  limits: MigrationLimit[];
  recurringEntries: MigrationRecurring[];
  savingGoals: MigrationSavingGoal[];
  templates: MigrationTemplate[];
}
