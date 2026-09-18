import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import type * as schema from './schema.js';

/** Typed Drizzle database instance for the recovery server. */
export type RecoveryDb = NodePgDatabase<typeof schema>;
