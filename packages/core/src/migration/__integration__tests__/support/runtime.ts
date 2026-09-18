import { expect } from 'vitest';
import { changeLog } from '../../../changelog/change-log.js';
import { DEFAULT_ACCOUNT_ID } from '../../../db/config.js';
import { db } from '../../../db/database.js';
import { BudgetService } from '../../../services/budget.service.js';
import { LegacyApiClient } from '../../legacy-api-client.js';
import { LegacyDataTransformer } from '../../legacy-data-transformer.js';
import { MigrationService } from '../../migration.service.js';
import { LEGACY_TEST_BASE_URL } from './http.js';

export async function closeMigrationTestDb(): Promise<void> {
  try {
    db.close();
  } catch {
    // Ignore cleanup failures in tests
  }
}

export async function resetMigrationPersistence(): Promise<void> {
  if (typeof localStorage !== 'undefined') localStorage.clear();
  if (typeof sessionStorage !== 'undefined') sessionStorage.clear();

  await closeMigrationTestDb();
  await db.delete();
  await db.open();
  await db.initializeDefaultData();
  await changeLog.clear();
}

export function createMigrationTestServices() {
  const apiClient = new LegacyApiClient(LEGACY_TEST_BASE_URL);
  const transformer = new LegacyDataTransformer();
  const budgetService = new BudgetService();
  const migrationService = new MigrationService(apiClient, transformer, budgetService);

  return {
    apiClient,
    budgetService,
    migrationService,
  };
}

export async function getImportedAccounts(service: BudgetService) {
  const accounts = await service.getAccounts();
  return accounts.filter(account => account.id !== DEFAULT_ACCOUNT_ID);
}

async function getIndexedDbSnapshot(): Promise<string> {
  const snapshot = await Promise.all(
    db.tables.map(async table => [table.name, await table.toArray()] as const),
  );

  return JSON.stringify(Object.fromEntries(snapshot));
}

function getStorageSnapshot(storage: Storage): string {
  return JSON.stringify(
    Array.from({ length: storage.length }, (_, index) => {
      const key = storage.key(index);
      return [key, key ? storage.getItem(key) : null];
    }),
  );
}

export async function assertNoSensitiveData(values: string[]): Promise<void> {
  const localStorageSnapshot = typeof localStorage !== 'undefined' ? getStorageSnapshot(localStorage) : '{}';
  const sessionStorageSnapshot = typeof sessionStorage !== 'undefined' ? getStorageSnapshot(sessionStorage) : '{}';
  const indexedDbSnapshot = await getIndexedDbSnapshot();
  const changeLogSnapshot = JSON.stringify(await changeLog.getAll());

  for (const value of values) {
    expect(localStorageSnapshot).not.toContain(value);
    expect(sessionStorageSnapshot).not.toContain(value);
    expect(indexedDbSnapshot).not.toContain(value);
    expect(changeLogSnapshot).not.toContain(value);
  }
}
