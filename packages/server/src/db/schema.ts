import {
  bigserial,
  check,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import type {
  AsymmetricEnvelope,
  SymmetricEnvelope,
} from '@budget/core/crypto/envelope';

export const INVITE_STATUSES = ['pending', 'accepted', 'declined', 'revoked'] as const;
export type InviteStatus = (typeof INVITE_STATUSES)[number];

export const ACCOUNT_MEMBER_ROLES = ['owner', 'member'] as const;
export type AccountMemberRole = (typeof ACCOUNT_MEMBER_ROLES)[number];

function idColumn() {
  return uuid().primaryKey().defaultRandom();
}

function createdAtColumn() {
  return timestamp({ withTimezone: true })
    .notNull()
    .defaultNow();
}

function timestampColumn() {
  return timestamp({ withTimezone: true });
}

/**
 * Email hashing contract:
 *
 * The raw email is never persisted — only a BLAKE2b-256 hex digest is stored.
 * The client hashes the email before sending it to this server:
 *
 *   client_hash = BLAKE2b-256(lowercase(email) + EMAIL_HASH_PEPPER)
 *
 * EMAIL_HASH_PEPPER is a secret shared out-of-band with the trusted client.
 * The server stores and compares the hash only — it never sees the plaintext
 * email or the pepper.
 */
export const users = pgTable('users', {
  id: idColumn(),
  emailHash: text('email_hash').notNull().unique(),
  publicKey: text('public_key').notNull(),
  validatedAt: timestampColumn(),
  magicLinkUsedAt: timestampColumn(),
  registrationCodeHash: text('registration_code_hash'),
  registrationCodeExpiresAt: timestamp('registration_code_expires_at', { withTimezone: true }),
  createdAt: createdAtColumn(),
}, (table) => [
  check('email_hash_length_check', sql`length(${table.emailHash}) = 64`),
  check('public_key_length_check', sql`length(${table.publicKey}) = 43`),
  // Partial index — only covers unvalidated rows, keeping the index small
  // and the hourly cleanup scan cheap (index-only scan where possible).
  index('users_created_at_unvalidated_idx')
    .on(table.createdAt)
    .where(sql`${table.validatedAt} IS NULL`),
]);

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

export const accounts = pgTable('accounts', {
  id: idColumn(),
  ownerUserId: uuid('owner_user_id')
    .notNull()
    .references(() => users.id),
  keyEpoch: integer('key_epoch').notNull().default(1),
  createdAt: createdAtColumn(),
}, (table) => [
  check('accounts_key_epoch_check', sql`${table.keyEpoch} >= 1`),
  index('accounts_owner_user_id_idx').on(table.ownerUserId),
]);

export const accountKeys = pgTable('account_keys', {
  accountId: uuid('account_id')
    .notNull()
    .references(() => accounts.id, { onDelete: 'cascade' }),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id),
  wrappedKey: jsonb('wrapped_key').$type<AsymmetricEnvelope>().notNull(),
  epoch: integer().notNull(),
  createdAt: createdAtColumn(),
  revokedAt: timestampColumn(),
}, (table) => [
  primaryKey({
    name: 'account_keys_pkey',
    columns: [table.accountId, table.userId, table.epoch],
  }),
  check('account_keys_epoch_check', sql`${table.epoch} >= 1`),
  index('account_keys_user_account_idx').on(table.userId, table.accountId),
]);

export const invites = pgTable('invites', {
  id: idColumn(),
  senderUserId: uuid()
    .notNull()
    .references(() => users.id),
  recipientEmail: text(), // Display email, encrypted at rest (see crypto/email-encryption.ts)
  recipientEmailHash: text().notNull(),
  accountId: uuid()
    .notNull()
    .references(() => accounts.id, { onDelete: 'cascade' }),
  status: text().$type<InviteStatus>().notNull().default('pending'),
  // Denormalised display fields — set at invite creation, never updated
  senderName: text('sender_name'),
  accountName: text('account_name'),
  createdAt: createdAtColumn(),
  respondedAt: timestampColumn(),
}, (table) => [
  check(
    'invites_status_check',
    sql`${table.status} IN ('pending', 'accepted', 'declined', 'revoked')`,
  ),
  check('invites_recipient_email_hash_length_check', sql`length(${table.recipientEmailHash}) = 64`),
  index('invites_pending_by_recipient_idx')
    .on(table.recipientEmailHash)
    .where(sql`${table.status} = 'pending'`),
]);

export const accountMembers = pgTable('account_members', {
  accountId: uuid()
    .notNull()
    .references(() => accounts.id, { onDelete: 'cascade' }),
  userId: uuid()
    .notNull()
    .references(() => users.id),
  displayEmail: text(), // To show in the UI
  role: text().$type<AccountMemberRole>().notNull(),
  joinedAt: createdAtColumn(),
}, (table) => [
  primaryKey({
    name: 'account_members_pkey',
    columns: [table.accountId, table.userId],
  }),
  check('account_members_role_check', sql`${table.role} IN ('owner', 'member')`),
]);

/**
 * Single-use replay-protection nonces, shared across all server replicas.
 *
 * A row is inserted when GET /v1/nonce issues a nonce and deleted when the
 * nonce is consumed by a mutation (atomic DELETE ... RETURNING), so rows
 * normally live for seconds. Abandoned rows expire after NONCE_TTL_MS and
 * are removed by the periodic sweep in DbNonceStore.
 */
export const nonces = pgTable('nonces', {
  nonce: text().primaryKey(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
});

export const changeRecords = pgTable('change_records', {
  id: idColumn(),
  accountId: uuid('account_id')
    .notNull()
    .references(() => accounts.id, { onDelete: 'cascade' }),
  sequence: bigserial({ mode: 'number' }).notNull(),
  encryptedPayload: jsonb('encrypted_payload')
    .$type<SymmetricEnvelope>()
    .notNull(),
  changeUuid: uuid('change_uuid')
    .notNull()
    .unique('change_records_change_uuid_key'),
  createdAt: createdAtColumn(),
}, (table) => [
  unique('change_records_account_sequence_key').on(table.accountId, table.sequence),
]);

export type Account = typeof accounts.$inferSelect;
export type InsertAccount = typeof accounts.$inferInsert;
export type AccountKey = typeof accountKeys.$inferSelect;
export type InsertAccountKey = typeof accountKeys.$inferInsert;
export type Invite = typeof invites.$inferSelect;
export type InsertInvite = typeof invites.$inferInsert;
export type AccountMember = typeof accountMembers.$inferSelect;
export type InsertAccountMember = typeof accountMembers.$inferInsert;
export type ChangeRecord = typeof changeRecords.$inferSelect;
export type InsertChangeRecord = typeof changeRecords.$inferInsert;
