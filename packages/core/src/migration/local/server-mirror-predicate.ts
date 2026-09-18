import type { MigrationAccount } from './local-legacy-types.js';

export function isServerMirroredAccount(account: MigrationAccount): boolean {
  return account.isOnline === true || account.onlineId != null || account.remoteId != null;
}

export function serverAccountKey(account: MigrationAccount): string | undefined {
  return account.onlineId ?? account.remoteId;
}
