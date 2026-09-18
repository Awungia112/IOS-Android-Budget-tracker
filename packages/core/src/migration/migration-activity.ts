/**
 * Tracks whether a legacy data migration is currently writing to this device.
 *
 * Account loads use this to hold back work that would race the import, such
 * as recurring reconciliation, until the migration has finished. The migration
 * reconciles the recurring items it imports itself.
 */

let activeMigrations = 0;
let databaseOperationTail = Promise.resolve();

export function isMigrationInProgress(): boolean {
  return activeMigrations > 0;
}

/** Serialize application workflows that mutate the shared local database. */
export async function withExclusiveDatabaseOperation<T>(run: () => Promise<T>): Promise<T> {
  const previous = databaseOperationTail;
  let release!: () => void;
  databaseOperationTail = new Promise<void>((resolve) => {
    release = resolve;
  });

  await previous;
  try {
    return await run();
  } finally {
    release();
  }
}

export async function withMigrationInProgress<T>(run: () => Promise<T>): Promise<T> {
  activeMigrations += 1;
  try {
    return await run();
  } finally {
    activeMigrations -= 1;
  }
}
