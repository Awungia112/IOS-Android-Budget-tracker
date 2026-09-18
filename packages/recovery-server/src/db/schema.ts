import { sql } from 'drizzle-orm';
import { check, integer, jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import type { RecoveryEnvelopeBody } from '../routes/enroll-contract.js';

export const recoveryEntries = pgTable(
  'recovery_entries',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    email_hash: text('email_hash').notNull().unique(),
    /**
     * RecoveryEnvelope stored as JSONB so the `alg` field is queryable,
     * e.g. for future re-encryption jobs.
     */
    encrypted_private_key: jsonb('encrypted_private_key')
      .$type<RecoveryEnvelopeBody>()
      .notNull(),
    /** argon2id hash of the plaintext one-time code; null when no active recovery attempt */
    tmp_code_hash: text('tmp_code_hash'),
    code_expires_at: timestamp('code_expires_at', { withTimezone: true }),
    code_used_at: timestamp('code_used_at', { withTimezone: true }),
    enrolled_at: timestamp('enrolled_at', { withTimezone: true })
      .notNull()
      .default(sql`now()`),
    /** Per-email_hash verify attempt counter for the current 15-min window */
    verify_attempts: integer('verify_attempts').notNull().default(0),
    /** Start of current 15-min rate-limit window for verify */
    verify_window_start: timestamp('verify_window_start', { withTimezone: true }),
    /** Per-email_hash request counter for the current 1-hour window */
    request_count: integer('request_count').notNull().default(0),
    /** Start of current 1-hour rate-limit window for request */
    request_window_start: timestamp('request_window_start', { withTimezone: true }),
  },
  (t) => [
    check(
      'code_expires_at_after_enrolled_at',
      sql`${t.code_expires_at} IS NULL OR ${t.code_expires_at} > ${t.enrolled_at}`,
    ),
    check(
      'tmp_code_hash_is_argon2id',
      sql`${t.tmp_code_hash} IS NULL OR ${t.tmp_code_hash} LIKE '$argon2id$%'`,
    ),
  ],
);
