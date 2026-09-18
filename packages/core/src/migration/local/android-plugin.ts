import { registerPlugin } from '@capacitor/core';

/**
 * TypeScript interface for the MigrationFileCopyPlugin Capacitor plugin.
 *
 * The plugin is implemented in Kotlin (MigrationFileCopyPlugin.kt) and
 * copies Room database files to the path expected by @capacitor-community/sqlite
 * so the JS layer can open and query them via openReadOnly().
 */
export interface MigrationFileCopyPluginInterface {
  /**
   * Copies all known Room databases to the Capacitor SQLite plugin path.
   * Must be called before any openReadOnly() call targeting legacy_* databases.
   * Safe to call multiple times — files are overwritten idempotently.
   * 
   * @returns Promise resolving to an object containing the count and names of copied account databases
   */
  prepareAndroidDatabases(): Promise<{ accountDbCount: number; accountDbNames: string[] }>;
}

export const MigrationFileCopyPlugin =
  registerPlugin<MigrationFileCopyPluginInterface>('MigrationFileCopy');
