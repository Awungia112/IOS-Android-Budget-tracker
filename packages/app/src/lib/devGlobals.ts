import { db, resetMigrationFlag, syncEngine } from '@budget/core';

interface DevGlobalTarget {
  db?: unknown;
  __resetMigration?: () => Promise<void>;
  syncEngine?: unknown;
}

export function installDevGlobals(target: DevGlobalTarget = window): void {
  target.db = db;
  target.__resetMigration = resetMigrationFlag;
  target.syncEngine = syncEngine;
}
