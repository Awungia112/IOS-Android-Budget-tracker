import {
  createEmptyMigrationResult,
  type MigrationResult,
} from '@budget/core';

export const DEFAULT_LOCAL_MIGRATION_RESULT: MigrationResult = createEmptyMigrationResult({
  imported: {
    accounts: 1,
    transactions: 1,
    categories: 1,
  },
  importedAccountIds: ['account-1'],
});

export function successfulLocalMigrationResult(
  overrides: Partial<MigrationResult> = {},
): MigrationResult {
  return {
    ...DEFAULT_LOCAL_MIGRATION_RESULT,
    ...overrides,
    imported: {
      ...DEFAULT_LOCAL_MIGRATION_RESULT.imported,
      ...overrides.imported,
    },
  };
}
