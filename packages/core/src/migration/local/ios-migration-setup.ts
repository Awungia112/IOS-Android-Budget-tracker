import { Capacitor } from '@capacitor/core';
import { MigrationSetupPlugin } from './ios-plugin.js';
import type { PrepareiOSDatabasesResult } from './ios-plugin.js';

export type {
  CoreDataLegacyLimit,
  PrepareiOSDatabasesResult,
} from './ios-plugin.js';

export async function prepareiOSDatabases(): Promise<PrepareiOSDatabasesResult> {
  if (Capacitor.getPlatform() !== 'ios') {
    return { coreDataPresent: false, copied: false, limits: [] };
  }

  return MigrationSetupPlugin.prepareiOSDatabases();
}
