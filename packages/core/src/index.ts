/**
 * @budget/core
 *
 * Core data layer for Budget Wise PWA.
 * Contains types, database operations, repositories, and services.
 *
 * This package is framework-agnostic and can be used in any JavaScript/TypeScript environment.
 */

// Database layer exports
export * from './db/index.js';

// Default data exports
export { DEFAULT_CATEGORIES } from './db/config.js';

// Type exports
export * from './types/index.js';

// Command type exports
// Command types for write operations (discriminated union with strong typing)
export * from './commands/index.js';

// Changelog exports
export * from './changelog/index.js';

// Online sync exports
export * from './sync/index.js';
export { syncEngine, SyncEngine, SYNC_STATES } from './sync/sync-engine.js';
export type { SyncState, SyncProgress, SyncEngineListener } from './sync/sync-engine.js';

// Repository exports - REMOVED
// Repositories are internal to @budget/core and not exposed to the app layer
// Use BudgetService for all database operations (read and write)

// Service exports
// RECOMMENDED: Use BudgetService for all database operations (read and write)
export * from './services/index.js';

// Migration exports
export * from './migration/index.js';

// Remediation exports
export * from './remediation/index.js';

// Crypto exports
export * from './crypto/index.js';

// Utility functions exports
export * from './utils/index.js';

// Constants exports
export * from './constants/index.js';

// Crypto exports (envelope, hashing, keys, recovery) — already re-exported above via './crypto/index.js'
// Placeholder export - additional features will be added in subsequent tickets
export const CORE_VERSION = '0.0.1';
