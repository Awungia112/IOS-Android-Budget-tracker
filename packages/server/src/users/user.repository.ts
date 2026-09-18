import type { createDb } from '../db/client.js';
import { eq } from 'drizzle-orm';
import { users } from '../db/schema.js';
import { isPublicKeyFormat } from './user-contract.js';

export type Db = ReturnType<typeof createDb>;

export interface PendingUserData {
  emailHash: string;
  publicKey: string;
}

/**
 * Inserts a new unvalidated user row.
 * Throws a PostgreSQL unique_violation error (code 23505) if the email
 * hash already exists — callers are responsible for handling that case.
 */
export async function createPendingUser(db: Db, data: PendingUserData): Promise<void> {
  await db.insert(users).values(data);
}

export type GetRecipientPublicKeyResult =
  | { status: 'ok'; publicKey: string }
  | { status: 'not_found' };

export async function getRecipientPublicKey(
  db: Db,
  userId: string,
): Promise<GetRecipientPublicKeyResult> {
  const [user] = await db
    .select({ publicKey: users.publicKey })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  if (!user) {
    return { status: 'not_found' };
  }

  if (!isPublicKeyFormat(user.publicKey)) {
    throw new Error('Invalid recipient public key format');
  }

  return { status: 'ok', publicKey: user.publicKey };
}
