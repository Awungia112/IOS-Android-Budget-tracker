import { and, eq, isNull, isNotNull } from 'drizzle-orm';
import * as schema from '../db/schema.js';
import type { Db } from '../db/client.js';
import { verifyCode } from './magic-link.service.js';

/**
 * Checks if a validated user with the given email_hash exists in the database.
 * Used by the preflight endpoint — no side effects.
 *
 * Intentionally ignores unvalidated rows (validatedAt IS NULL): a user who
 * started registration but never completed OTP verification has no recovery
 * envelope and no private key on any device. Treating them as "not found"
 * lets upsertRegistration overwrite the stale row on retry, which is exactly
 * what upsertRegistration's setWhere: isNull(validatedAt) already permits.
 */
export async function checkEmailExists(db: Db, emailHash: string): Promise<boolean> {
  const row = await db
    .select({ emailHash: schema.users.emailHash })
    .from(schema.users)
    .where(and(eq(schema.users.emailHash, emailHash), isNotNull(schema.users.validatedAt)))
    .limit(1)
    .then((rows) => rows[0]);

  return row !== undefined;
}

export type UpsertRegistrationResult =
  | { status: 'ok' }
  | { status: 'already_validated'; publicKey: string }
  | { status: 'email_not_found' };

/**
 * Atomically upserts a user registration row.
 *
 * - intent = 'signin': only returns email_not_found or already_validated;
 *   never creates a new row.
 * - intent = 'register' (or undefined): creates or updates a user row.
 *
 * Uses INSERT ... ON CONFLICT DO UPDATE to eliminate the TOCTOU race between
 * concurrent registrations for the same email_hash.
 */
export async function upsertRegistration(
  db: Db,
  emailHash: string,
  publicKey: string,
  codeHash: string,
  expiresAt: Date,
  intent?: 'signin' | 'register',
): Promise<UpsertRegistrationResult> {
  // For sign-in intent, only proceed if the email is already registered.
  if (intent === 'signin') {
    const existing = await db
      .select({ validatedAt: schema.users.validatedAt, publicKey: schema.users.publicKey })
      .from(schema.users)
      .where(eq(schema.users.emailHash, emailHash))
      .limit(1)
      .then((rows) => rows[0]);

    if (!existing) {
      return { status: 'email_not_found' };
    }

    if (existing.validatedAt) {
      return { status: 'already_validated', publicKey: existing.publicKey };
    }
  }

  const upserted = await db
    .insert(schema.users)
    .values({
      emailHash,
      publicKey,
      validatedAt: null,
      magicLinkUsedAt: null,
      registrationCodeHash: codeHash,
      registrationCodeExpiresAt: expiresAt,
    })
    .onConflictDoUpdate({
      target: schema.users.emailHash,
      set: {
        publicKey,
        magicLinkUsedAt: null,
        registrationCodeHash: codeHash,
        registrationCodeExpiresAt: expiresAt,
      },
      setWhere: isNull(schema.users.validatedAt),
    })
    .returning({ validatedAt: schema.users.validatedAt, publicKey: schema.users.publicKey });

  const row = upserted[0];
  if (row?.validatedAt) {
    return { status: 'already_validated', publicKey: row.publicKey };
  }

  if (!row) {
    // If not returning a row, the setWhere condition probably failed.
    // We select to confirm the user exists and return already_validated.
    const existing = await db
      .select({ validatedAt: schema.users.validatedAt, publicKey: schema.users.publicKey })
      .from(schema.users)
      .where(eq(schema.users.emailHash, emailHash))
      .limit(1)
      .then((rows) => rows[0]);

    if (existing) {
      return { status: 'already_validated', publicKey: existing.publicKey };
    }
    // Unreachable: INSERT ... ON CONFLICT on a PK column either inserts or
    // finds the conflicting row. If neither happened, the universe is broken.
    throw new Error('Unexpected: user not found after upsert conflict on email_hash');
  }

  return { status: 'ok' };
}

/**
 * Updates the registration code for an already-validated user (sign-in flow).
 * Only touches the code fields — never overwrites publicKey, validatedAt, etc.
 */
export async function updateRegistrationCode(
  db: Db,
  emailHash: string,
  codeHash: string,
  expiresAt: Date,
): Promise<void> {
  await db
    .update(schema.users)
    .set({
      registrationCodeHash: codeHash,
      registrationCodeExpiresAt: expiresAt,
    })
    .where(eq(schema.users.emailHash, emailHash));
}

export type ValidateTokenResult =
  | { status: 'ok'; emailHash: string }
  | { status: 'user_not_found' }
  | { status: 'token_invalid_for_current_key' }
  | { status: 'token_already_used' };

/**
 * Validates a magic-link token against the database WITHOUT consuming it.
 * Used by GET /v1/auth/verify — safe for email scanners to hit because
 * it makes no writes and returns no session material.
 */
export async function validateMagicLinkToken(
  db: Db,
  emailHash: string,
  tokenPublicKey: string,
): Promise<ValidateTokenResult> {
  const user = await db
    .select()
    .from(schema.users)
    .where(eq(schema.users.emailHash, emailHash))
    .limit(1)
    .then((rows) => rows[0]);

  if (!user) return { status: 'user_not_found' };
  if (user.publicKey !== tokenPublicKey) return { status: 'token_invalid_for_current_key' };
  if (user.magicLinkUsedAt) return { status: 'token_already_used' };

  return { status: 'ok', emailHash };
}

export type ConsumeTokenResult =
  | { status: 'ok'; emailHash: string }
  | { status: 'user_not_found' }
  | { status: 'token_invalid_for_current_key' }
  | { status: 'token_already_used' };

/**
 * Verifies a magic-link token against the database AND consumes it.
 * Used by POST /v1/auth/verify — the deliberate app-initiated call
 * that marks the token used and returns a session JWT.
 */
export async function consumeMagicLink(
  db: Db,
  emailHash: string,
  tokenPublicKey: string,
): Promise<ConsumeTokenResult> {
  const user = await db
    .select()
    .from(schema.users)
    .where(eq(schema.users.emailHash, emailHash))
    .limit(1)
    .then((rows) => rows[0]);

  if (!user) {
    return { status: 'user_not_found' };
  }

  if (user.publicKey !== tokenPublicKey) {
    return { status: 'token_invalid_for_current_key' };
  }

  const now = new Date();
  const result = await db
    .update(schema.users)
    .set({
      magicLinkUsedAt: now,
      ...(user.validatedAt ? {} : { validatedAt: now }),
    })
    .where(
      and(
        eq(schema.users.emailHash, emailHash),
        eq(schema.users.publicKey, tokenPublicKey),
        isNull(schema.users.magicLinkUsedAt),
      ),
    );

  if ((result.rowCount ?? 0) === 0) {
    const check = await db
      .select()
      .from(schema.users)
      .where(eq(schema.users.emailHash, emailHash))
      .limit(1)
      .then((rows) => rows[0]);

    if (check && check.publicKey !== tokenPublicKey) {
      return { status: 'token_invalid_for_current_key' };
    }
    return { status: 'token_already_used' };
  }

  return { status: 'ok', emailHash };
}

export type VerifyCodeResult =
  | { status: 'ok'; emailHash: string; publicKey: string }
  | { status: 'user_not_found' }
  | { status: 'invalid_code' }
  | { status: 'code_expired' };

/**
 * Verifies a 6-digit registration code against the database.
 * If valid and not expired, marks the user as validated.
 *
 * Uses atomic UPDATE with WHERE clause on registrationCodeHash to prevent
 * race conditions where the same code could be used multiple times.
 */
export async function verifyRegistrationCode(
  db: Db,
  emailHash: string,
  code: string,
): Promise<VerifyCodeResult> {
  // First, get the user and verify the code
  const user = await db
    .select()
    .from(schema.users)
    .where(eq(schema.users.emailHash, emailHash))
    .limit(1)
    .then((rows) => rows[0]);

  if (!user) return { status: 'user_not_found' };

  // Use argon2.verify() for constant-time comparison against the stored Argon2id hash
  const isValid = user.registrationCodeHash
    ? await verifyCode(code, user.registrationCodeHash)
    : false;

  if (!isValid) {
    return { status: 'invalid_code' };
  }

  const now = new Date();
  if (user.registrationCodeExpiresAt && user.registrationCodeExpiresAt < now) {
    return { status: 'code_expired' };
  }

  // Atomic UPDATE: only succeeds if registrationCodeHash is still set (not consumed)
  // This prevents race conditions where concurrent requests both verify the same code
  const result = await db
    .update(schema.users)
    .set({
      validatedAt: now,
      registrationCodeHash: null,
      registrationCodeExpiresAt: null,
    })
    .where(
      and(
        eq(schema.users.emailHash, emailHash),
        isNotNull(schema.users.registrationCodeHash),
      ),
    )
    .returning({ emailHash: schema.users.emailHash });

  // If no rows returned, the code was already consumed by another request
  if (result.length === 0) {
    return { status: 'code_expired' };
  }

  return { status: 'ok', emailHash, publicKey: user.publicKey };
}

export type RecoverSessionResult =
  | { status: 'ok'; emailHash: string }
  | { status: 'user_not_found' }
  | { status: 'token_invalid_for_current_key' };

/**
 * Issues a session for a recovered account.
 *
 * After a user recovers their private key via the recovery flow, the client
 * derives the public key and calls POST /v1/auth/recover-session. This function
 * verifies that:
 *   - The user exists
 *   - The user has been validated (completed registration)
 *   - The recovered public key matches the one stored at registration
 *
 * On success, the caller signs a 7-day session JWT — identical to the one
 * issued by POST /v1/auth/verify. This lets the recovered user go online and
 * replay their synced data without re-registering.
 *
 * Unvalidated users return 'user_not_found' (not 'token_invalid_for_current_key')
 * to avoid leaking enrollment status — matching the enumeration protection
 * used by the magic-link verify endpoints.
 */
export async function recoverSession(
  db: Db,
  emailHash: string,
  publicKey: string,
): Promise<RecoverSessionResult> {
  const user = await db
    .select()
    .from(schema.users)
    .where(eq(schema.users.emailHash, emailHash))
    .limit(1)
    .then((rows) => rows[0]);

  // Don't distinguish "not found" from "not validated" — both return
  // user_not_found to prevent account enumeration.
  if (!user) return { status: 'user_not_found' };
  if (!user.validatedAt) return { status: 'user_not_found' };

  if (user.publicKey !== publicKey) {
    return { status: 'token_invalid_for_current_key' };
  }

  return { status: 'ok', emailHash };
}
