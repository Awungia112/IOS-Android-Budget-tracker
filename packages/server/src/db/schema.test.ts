import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { sql, getTableColumns, getTableName } from 'drizzle-orm';
import { PgDialect } from 'drizzle-orm/pg-core';
import { describe, expect, it } from 'vitest';

import {
  accountMembers,
  accountKeys,
  accounts,
  changeRecords,
  invites,
  users,
} from './schema.js';

const dialect = new PgDialect({ casing: 'snake_case' });

// Resolve migration files relative to this test file, not the CWD.
// schema.test.ts lives at packages/server/src/db/schema.test.ts
// Three '..' from the file path reaches packages/server/ where drizzle/ lives.
const serverRoot = resolve(fileURLToPath(import.meta.url), '..', '..', '..');

function migrationPath(filename: string): string {
  return resolve(serverRoot, 'drizzle', filename);
}

function render(query: ReturnType<typeof sql>): string {
  return dialect.sqlToQuery(query).sql;
}

describe('online account sync schema', () => {
  it('declares the expected server-side sync tables and TypeScript fields', () => {
    expect(getTableName(accounts)).toBe('accounts');
    expect(Object.keys(getTableColumns(accounts))).toEqual([
      'id',
      'ownerUserId',
      'keyEpoch',
      'createdAt',
    ]);

    expect(getTableName(accountKeys)).toBe('account_keys');
    expect(Object.keys(getTableColumns(accountKeys))).toEqual([
      'accountId',
      'userId',
      'wrappedKey',
      'epoch',
      'createdAt',
      'revokedAt',
    ]);

    expect(getTableName(changeRecords)).toBe('change_records');
    expect(Object.keys(getTableColumns(changeRecords))).toEqual([
      'id',
      'accountId',
      'sequence',
      'encryptedPayload',
      'changeUuid',
      'createdAt',
    ]);

    expect(getTableName(invites)).toBe('invites');
    expect(Object.keys(getTableColumns(invites))).toEqual([
      'id',
      'senderUserId',
      'recipientEmail',
      'recipientEmailHash',
      'accountId',
      'status',
      'senderName',
      'accountName',
      'createdAt',
      'respondedAt',
    ]);

    expect(getTableName(accountMembers)).toBe('account_members');
    expect(Object.keys(getTableColumns(accountMembers))).toEqual([
      'accountId',
      'userId',
      'displayEmail',
      'role',
      'joinedAt',
    ]);
  });

  it('renders camelCase schema fields as snake_case PostgreSQL identifiers', () => {
    const query = render(sql`
      select
        ${users.emailHash},
        ${accounts.ownerUserId},
        ${accounts.keyEpoch},
        ${accountKeys.wrappedKey},
        ${accountKeys.revokedAt},
        ${changeRecords.encryptedPayload},
        ${changeRecords.changeUuid},
        ${invites.senderUserId},
        ${invites.recipientEmailHash},
        ${invites.respondedAt},
        ${accountMembers.joinedAt}
      from ${accounts}
    `);

    expect(query).toContain('"users"."email_hash"');
    expect(query).toContain('"accounts"."owner_user_id"');
    expect(query).toContain('"accounts"."key_epoch"');
    expect(query).toContain('"account_keys"."wrapped_key"');
    expect(query).toContain('"account_keys"."revoked_at"');
    expect(query).toContain('"change_records"."encrypted_payload"');
    expect(query).toContain('"change_records"."change_uuid"');
    expect(query).toContain('"invites"."sender_user_id"');
    expect(query).toContain('"invites"."recipient_email_hash"');
    expect(query).toContain('"invites"."responded_at"');
    expect(query).toContain('"account_members"."joined_at"');
    expect(query).toContain('from "accounts"');
  });

  it('keeps the committed SQL migration aligned with the sync schema contract', () => {
    const migration = readFileSync(
      migrationPath('0000_initial_schema.sql'),
      'utf8',
    );

    expect(migration).toContain('CREATE TABLE IF NOT EXISTS "accounts"');
    expect(migration).toContain('"owner_user_id" uuid NOT NULL');
    expect(migration).toContain('"key_epoch" integer DEFAULT 1 NOT NULL');
    expect(migration).toContain('CREATE TABLE IF NOT EXISTS "account_keys"');
    expect(migration).toContain('"wrapped_key" jsonb NOT NULL');
    expect(migration).toContain('"revoked_at" timestamp with time zone');
    expect(migration).toContain(
      'CONSTRAINT "account_keys_pkey" PRIMARY KEY("account_id","user_id","epoch")',
    );
    expect(migration).toContain('CREATE TABLE IF NOT EXISTS "change_records"');
    expect(migration).toContain('"encrypted_payload" jsonb NOT NULL');
    expect(migration).toContain(
      'CONSTRAINT "change_records_account_sequence_key" UNIQUE("account_id","sequence")',
    );
  });

  it('keeps the committed SQL migration aligned with the shared-account schema contract', () => {
    const migration = readFileSync(
      migrationPath('0000_initial_schema.sql'),
      'utf8',
    );

    expect(migration).toContain('CREATE TABLE IF NOT EXISTS "invites"');
    expect(migration).toContain('"sender_user_id" uuid NOT NULL');
    expect(migration).toContain(
      '"account_id" uuid NOT NULL',
    );
    expect(migration).toContain(
      `CONSTRAINT "invites_status_check" CHECK ("invites"."status" IN ('pending', 'accepted', 'declined', 'revoked'))`,
    );
    expect(migration).toContain('CREATE INDEX "invites_pending_by_recipient_idx"');
    expect(migration).toContain(`"invites"."status" = 'pending'`);
    expect(migration).toContain('CREATE TABLE IF NOT EXISTS "account_members"');
    expect(migration).toContain(
      'CONSTRAINT "account_members_pkey" PRIMARY KEY("account_id","user_id")',
    );
    expect(migration).toContain(
      `CONSTRAINT "account_members_role_check" CHECK ("account_members"."role" IN ('owner', 'member'))`,
    );
  });

  it('keeps the committed SQL migration for duplicate-invite protection aligned with schema contract', () => {
    const migration = readFileSync(
      migrationPath('0000_initial_schema.sql'),
      'utf8',
    );

    expect(migration).toContain('CREATE UNIQUE INDEX "invites_pending_account_recipient_unique_idx"');
    expect(migration).toContain('"account_id","recipient_email_hash"');
    expect(migration).toContain(`"invites"."status" = 'pending'`);
  });
});
