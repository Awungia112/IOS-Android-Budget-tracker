import type { Db, PendingUserData } from './user.repository.js';
import { createPendingUser } from './user.repository.js';

export type { PendingUserData };

export type RegistrationResult =
  | { success: true }
  | { success: false; reason: 'duplicate' }
  | { success: false; reason: 'error'; cause: unknown };

/**
 * PostgreSQL unique_violation error code.
 * Drizzle wraps the pg DatabaseError in a DrizzleQueryError, so the code
 * lives on error.cause.code rather than error.code directly.
 */
const PG_UNIQUE_VIOLATION = '23505';

export function isUniqueViolation(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const err = error as any;
  
  // Directly on error (Native PG error or custom test error)
  if (err.code === PG_UNIQUE_VIOLATION) return true;
  
  // On cause (Drizzle-wrapped error)
  if (err.cause && typeof err.cause === 'object' && err.cause.code === PG_UNIQUE_VIOLATION) {
    return true;
  }
  
  return false;
}

/**
 * Registers a new pending user.
 *
 * Returns a typed result rather than throwing so the HTTP layer can map
 * outcomes to status codes without catching raw database errors.
 */
export async function registerPendingUser(
  db: Db,
  data: PendingUserData,
): Promise<RegistrationResult> {
  try {
    await createPendingUser(db, data);
    return { success: true };
  } catch (error) {
    if (isUniqueViolation(error)) {
      return { success: false, reason: 'duplicate' };
    }
    return { success: false, reason: 'error', cause: error };
  }
}
