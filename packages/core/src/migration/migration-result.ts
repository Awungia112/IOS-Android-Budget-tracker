import type { MigrationResult, MigrationErrorCode } from './migration.service.js';

export type ImportedCounts = MigrationResult['imported'];

type MigrationResultOverrides = Omit<Partial<MigrationResult>, 'imported' | 'pushed'> & {
  imported?: Partial<ImportedCounts>;
  pushed?: Partial<PushedCounts>;
};

export function createImportedCounts(overrides: Partial<ImportedCounts> = {}): ImportedCounts {
  return {
    accounts: 0,
    transactions: 0,
    categories: 0,
    limits: 0,
    templates: 0,
    recurringItems: 0,
    savingsGoals: 0,
    ...overrides,
  };
}

export function createPushedCounts(overrides: Partial<PushedCounts> = {}): PushedCounts {
  return {
    records: 0,
    accounts: 0,
    ...overrides,
  };
}

export interface PushedCounts {
  /** Number of ChangeRecords successfully pushed to the server */
  records: number;
  /** Number of accounts that had records pushed */
  accounts: number;
}

export function createEmptyMigrationResult(
  overrides: MigrationResultOverrides = {},
): MigrationResult {
  return {
    success: overrides.success ?? true,
    imported: createImportedCounts(overrides.imported),
    pushed: createPushedCounts(overrides.pushed),
    importedAccountIds: overrides.importedAccountIds ?? [],
    importedAccounts: overrides.importedAccounts ?? [],
    skippedAccounts: overrides.skippedAccounts ?? 0,
    skippedAccountIds: overrides.skippedAccountIds ?? [],
    skippedTemplates: overrides.skippedTemplates ?? 0,
    permanentlySkippedTemplates: overrides.permanentlySkippedTemplates ?? 0,
    skippedTemplateReasons: overrides.skippedTemplateReasons ?? [],
    warnings: overrides.warnings ?? [],
    errors: overrides.errors ?? [],
    errorCode: overrides.errorCode,
    retryCount: overrides.retryCount ?? 0,
  };
}
