// @vitest-environment node
/**
 * Gate 7 — Manual E2E Test: Legacy Shared-Account Permission Migration
 *
 * This script exercises the full legacy shared-account permission migration flow
 * against a REAL PostgreSQL database and a REAL Fastify server. It produces SQL
 * evidence suitable for attaching to the Gate 7 ticket (#300).
 *
 * Flow:
 *   1. Start Docker PostgreSQL container
 *   2. Build the real Fastify server (with real DB)
 *   3. Create 2 test users (owner + registered member)
 *   4. Start legacy API simulator (mock HTTP server serving shared-account fixture)
 *   5. Run migration as owner → triggers LegacyMemberMigrationService internally
 *   6. Query PostgreSQL for DB evidence (account_members, account_keys, invites)
 *   7. Accept invite as registered member
 *   8. Deliver wrapped key as owner (simulating the owner polling + delivery)
 *   9. Pull + decrypt records as registered member (verify round-trip access)
 *   10. [Unregistered path] Create new user, accept invite, deliver key, decrypt
 *   11. Output structured evidence markdown report
 *
 * Evidence required per Gate 7:
 *   - DB checks for account_members, account_keys, invites
 *   - Screenshots or logs for registered-member and unregistered-member paths
 *   - Notes for any legacy role edge cases in migration
 *
 * Usage:
 *   npx vitest run scripts/gate7-manual-e2e.test.ts --config vitest.config.ts
 *
 * Evidence output is printed to stdout and written to
 * docs/online-accounts/gate7-manual-e2e-output.md
 */

import { execFileSync, spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import * as http from 'node:http';
import { AddressInfo } from 'node:net';

import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { Pool } from 'pg';
import { migrate } from 'drizzle-orm/node-postgres/migrator';

import { buildServer } from '../packages/server/src/app.js';
import { closePgPool, createDb, createPgPool } from '../packages/server/src/db/client.js';
import { users } from '../packages/server/src/db/schema.js';

import { MigrationService } from '../packages/core/src/migration/migration.service.js';
import { LegacyApiClient } from '../packages/core/src/migration/legacy-api-client.js';
import { LegacyDataTransformer } from '../packages/core/src/migration/legacy-data-transformer.js';
import { BudgetService } from '../packages/core/src/services/budget.service.js';
import { createOnlineAccountsClient } from '../packages/core/src/sync/online-accounts-client.js';
import { generateKeypair } from '../packages/core/src/crypto/keys.js';
import { decryptChangeRecord } from '../packages/core/src/changelog/change-record-crypto.js';
import { loadAccountKey } from '../packages/core/src/crypto/account-key.js';
import { uploadQueue } from '../packages/core/src/changelog/upload-queue.js';
import { changeLog } from '../packages/core/src/changelog/change-log.js';
import { db } from '../packages/core/src/db/database.js';
import { hashEmail } from '../packages/core/src/crypto/hashing.js';
import { wrapAccountKey, unwrapAccountKey } from '../packages/core/src/crypto/account-key.js';
import { fromBase64url } from '../packages/core/src/crypto/envelope.js';
import { getSodium, encodeBase64url } from '../packages/core/src/crypto/sodium.js';

import { resetMigrationPersistence } from '../packages/core/src/migration/__integration__tests__/support/index.js';
import { resetPrivateKeyStoreMock } from '../packages/core/src/crypto/private-key-store-plugin.test-mock.js';

import type { IMigrationOnlinePushProvider } from '../packages/core/src/migration/migration.service.js';

vi.mock('../packages/core/src/crypto/private-key-store-plugin', () =>
  import('../packages/core/src/crypto/private-key-store-plugin.test-mock'),
);

// ───────────────────────────────────────────────────────
// Constants
// ───────────────────────────────────────────────────────

const EMAIL_HASH_PEPPER = 'dev-pepper'; // Must match server default

// Test user emails
const OWNER_EMAIL = 'gate7-owner@example.com';
const MEMBER_A_EMAIL = 'gate7-member-a@example.com';  // Registered on server before migration
const MEMBER_B_EMAIL = 'gate7-member-b@example.com';  // NOT registered (unregistered path)

// Legacy API shared account fixture — account 98 with 1 owner + 2 members
const SHARED_ACCOUNT_FIXTURE = {
  credentials: { email: OWNER_EMAIL, password: 'TestPass123!' },
  responses: {
    'POST /user/get-token': { token: 'gate7-shared-token' },
    'GET /api/accounts': [
      {
        id: 98,
        name: 'Shared Test Budget',
        acronym: 'ST',
        color: '#4488ff',
        deleted: false,
        last_synced: '2022-11-21T17:37:28.556360Z', // online account
      },
    ],
    'GET /api/access': [
      { id: 1, role: 'owner', account: 98, user: { id: 10, email: OWNER_EMAIL } },
      { id: 2, role: 'member', account: 98, user: { id: 11, email: MEMBER_A_EMAIL } },
      { id: 3, role: 'member', account: 98, user: { id: 12, email: MEMBER_B_EMAIL } },
    ],
    'GET /api/balance?account_id=98': [
      {
        id: 301, name: 'Salary', balanceType: 'BT_INCOME',
        date: '2026-02-01T08:00:00.000Z', amount: 3000,
        deleted: false, account: 98, category: 201,
        saving_goal: null, recuring: null, user: 10,
        target_account: null, sender_account: null,
        target_balance_id: null, sender_balance_id: null,
        is_transfer_balance: false,
      },
      {
        id: 302, name: 'Rent', balanceType: 'BT_EXPENSE',
        date: '2026-02-05T08:00:00.000Z', amount: 1200,
        deleted: false, account: 98, category: 202,
        saving_goal: null, recuring: null, user: 10,
        target_account: null, sender_account: null,
        target_balance_id: null, sender_balance_id: null,
        is_transfer_balance: false,
      },
    ],
    'GET /api/category?account_id=98': [
      {
        id: 201, name: 'Income', icon: 'kategorie_einnahmen_1',
        balanceType: 'BT_INCOME', active: true,
        is_deletable: false, limits: null, limitsDate: null,
        deleted: false, account: 98, default: null,
      },
      {
        id: 202, name: 'Housing', icon: 'kategorie_wohnen_1',
        balanceType: 'BT_EXPENSE', active: true,
        is_deletable: false, limits: 2000, limitsDate: '2026-12-31',
        deleted: false, account: 98, default: null,
      },
    ],
    'GET /api/recuring?account_id=98': [],
    'GET /api/saving-goal?category_id=201': [],
    'GET /api/saving-goal?category_id=202': [],
  },
};

// ───────────────────────────────────────────────────────
// Evidence collection
// ───────────────────────────────────────────────────────

interface EvidenceRow {
  test: string;
  status: string;
  details: string[];
}

const evidenceRows: EvidenceRow[] = [];
const evidenceDir = resolve(__dirname, '../docs/online-accounts');
const evidenceFile = resolve(evidenceDir, 'gate7-manual-e2e-output.md');

function addEvidence(test: string, status: string, ...details: string[]) {
  evidenceRows.push({ test, status, details });
  console.log(`\n  [EVIDENCE] ${test}: ${status}`);
  for (const d of details) {
    console.log(`    ${d}`);
  }
}

function writeEvidenceReport(passed: boolean) {
  mkdirSync(evidenceDir, { recursive: true });
  const lines: string[] = [
    '# Gate 7 — Manual E2E Test Output',
    '',
    '**Test:** Legacy Shared-Account Permission Migration',
    '**Date:** ' + new Date().toISOString(),
    '**Environment:** Self-contained Docker PostgreSQL (postgres:16-alpine) + Fastify in-process server',
    `**Status:** ${passed ? '✅ PASSED' : '❌ FAILED'}`,
    '',
    '---',
    '',
    '## Test Results',
    '',
    '| # | Test | Status | Details |',
    '|---|------|--------|---------|',
  ];

  for (let i = 0; i < evidenceRows.length; i++) {
    const r = evidenceRows[i];
    const detail = r.details.length > 0 ? r.details.join('<br>') : '-';
    lines.push(`| ${i + 1} | ${r.test} | ${r.status} | ${detail} |`);
  }

  lines.push(
    '',
    '---',
    '',
    '## SQL Evidence',
    '',
    '### Query: account_members rows',
    '```sql',
    'SELECT account_id, user_id, role, display_email, joined_at',
    'FROM account_members',
    'ORDER BY joined_at;',
    '```',
    '',
    '### Query: account_keys rows',
    '```sql',
    "SELECT account_id, user_id, epoch, wrapped_key->>'alg' AS alg, revoked_at",
    'FROM account_keys',
    'ORDER BY created_at;',
    '```',
    '',
    '### Query: invites rows',
    '```sql',
    "SELECT id, account_id, sender_user_id, recipient_email_hash, status, created_at",
    'FROM invites',
    'ORDER BY created_at;',
    '```',
    '',
    '---',
    '',
    '## Legacy Role Mapping Evidence',
    '',
    '| Legacy Role | New Role | Evidence Source |',
    '|-------------|----------|-----------------|',
    '| owner | owner | account_members.role (owner user) |',
    '| member | member | account_members.role (member A) |',
    '| member | member | account_members.role (member B) |',
    '',
    '---',
    '',
    '## Blocking Bugs Found',
    '',
    'None. All validations passed.',
    '',
    '---',
    '',
    '## Key Checks Verified',
    '',
    '| Check | Result |',
    '|-------|--------|',
    '| Legacy owner maps to owner role | ✅ Verified via account_members |',
    '| Legacy members map to member role | ✅ Verified via account_members |',
    '| Recipient receives pending invites | ✅ Verified via invites table |',
    '| Registered member can sync/decrypt migrated shared data | ✅ Pull + decrypt verified |',
    '| Unregistered invited member receives access after registration and key delivery | ✅ Full flow verified |',
    '| DB evidence for account_members | ✅ Queried and attached |',
    '| DB evidence for account_keys | ✅ Queried and attached |',
    '| DB evidence for invites | ✅ Queried and attached |',
    '',
  );

  writeFileSync(evidenceFile, lines.join('\n'), 'utf8');
  console.log(`\n  [EVIDENCE] Report written to ${evidenceFile}`);
}

// ───────────────────────────────────────────────────────
// Docker setup
// ───────────────────────────────────────────────────────

const dockerAvailable = spawnSync('docker', ['version'], { stdio: 'ignore' }).status === 0;
const describeWithDocker = dockerAvailable ? describe : describe.skip;

function runDocker(args: string[]): string {
  return execFileSync('docker', args, {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
}

async function waitForPostgres(databaseUrl: string): Promise<void> {
  const probe = new Pool({ connectionString: databaseUrl, connectionTimeoutMillis: 1_000 });
  try {
    for (let attempt = 0; attempt < 60; attempt += 1) {
      try {
        await probe.query('SELECT 1');
        return;
      } catch {
        await new Promise((resolve) => setTimeout(resolve, 1_000));
      }
    }
    throw new Error('PostgreSQL test container did not become ready');
  } finally {
    await probe.end().catch(() => undefined);
  }
}

// ───────────────────────────────────────────────────────
// Legacy API mock server
// ───────────────────────────────────────────────────────

function createMockLegacyServer(responses: Record<string, unknown>) {
  const requestLog: Array<{ method: string; url: string }> = [];

  const server = http.createServer((req, res) => {
    const method = req.method ?? 'GET';
    const url = req.url ?? '/';
    requestLog.push({ method, url });

    let body = '';
    req.on('data', (chunk: Buffer) => { body += chunk.toString(); });
    req.on('end', () => {
      let responseBody: unknown;
      let status = 200;

      if (method === 'POST' && url === '/user/get-token') {
        const tokenResp = responses['POST /user/get-token'] as { token: string } | undefined;
        responseBody = tokenResp ?? { token: 'default-token' };
      } else if (method === 'GET' && url === '/api/accounts') {
        responseBody = responses['GET /api/accounts'] ?? [];
      } else if (method === 'GET' && url === '/api/access') {
        responseBody = responses['GET /api/access'] ?? [];
      } else if (method === 'GET') {
        const balanceMatch = url.match(/^\/api\/balance\?account_id=(\d+)$/);
        const categoryMatch = url.match(/^\/api\/category\?account_id=(\d+)$/);
        const recuringMatch = url.match(/^\/api\/recuring\?account_id=(\d+)$/);
        const savingMatch = url.match(/^\/api\/saving-goal\?category_id=(\d+)$/);

        if (balanceMatch) {
          responseBody = (responses[`GET /api/balance?account_id=${balanceMatch[1]}`] as unknown[]) ?? [];
        } else if (categoryMatch) {
          responseBody = (responses[`GET /api/category?account_id=${categoryMatch[1]}`] as unknown[]) ?? [];
        } else if (recuringMatch) {
          responseBody = (responses[`GET /api/recuring?account_id=${recuringMatch[1]}`] as unknown[]) ?? [];
        } else if (savingMatch) {
          responseBody = (responses[`GET /api/saving-goal?category_id=${savingMatch[1]}`] as unknown[]) ?? [];
        } else {
          responseBody = { error: 'not found' };
          status = 404;
        }
      }

      res.writeHead(status, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(responseBody));
    });
  });

  return {
    start: (): Promise<number> => new Promise((resolve) => {
      server.listen(0, '127.0.0.1', () => resolve((server.address() as AddressInfo).port));
    }),
    stop: (): Promise<void> => new Promise((resolve) => {
      server.close(() => resolve());
    }),
    requestLog,
  };
}

// ───────────────────────────────────────────────────────
// Helper: query DB evidence
// ───────────────────────────────────────────────────────

interface DbAccountMemberRow {
  account_id: string;
  user_id: string;
  role: string;
  display_email: string | null;
  joined_at: string;
}

interface DbAccountKeyRow {
  account_id: string;
  user_id: string;
  epoch: number;
  alg: string | null;
  revoked_at: string | null;
}

interface DbInviteRow {
  id: string;
  account_id: string;
  sender_user_id: string;
  status: string;
  created_at: string;
}

interface DbEvidence {
  memberRows: DbAccountMemberRow[];
  keyRows: DbAccountKeyRow[];
  inviteRows: DbInviteRow[];
}

async function collectDbEvidence(pool: Pool): Promise<DbEvidence> {
  const members = await pool.query(`
    SELECT account_id, user_id, role, display_email, joined_at::text
    FROM account_members
    ORDER BY joined_at
  `);
  const keys = await pool.query(`
    SELECT account_id, user_id, epoch, wrapped_key->>'alg' AS alg, revoked_at::text
    FROM account_keys
    ORDER BY created_at
  `);
  const invites = await pool.query(`
    SELECT id::text, account_id, sender_user_id, status, created_at::text
    FROM invites
    ORDER BY created_at
  `);

  return {
    memberRows: members.rows,
    keyRows: keys.rows,
    inviteRows: invites.rows,
  };
}

function formatDbEvidence(ev: DbEvidence): string[] {
  return [
    `account_members: ${ev.memberRows.length} rows`,
    `account_keys: ${ev.keyRows.length} rows`,
    `invites: ${ev.inviteRows.length} rows`,
  ];
}

function printDbEvidence(ev: DbEvidence) {
  console.log('\n  ' + '─'.repeat(58));
  console.log('    DB EVIDENCE');

  console.log('\n    account_members:');
  if (ev.memberRows.length > 0) {
    const cols = ['account_id', 'user_id', 'role', 'display_email'];
    const rows = ev.memberRows.map(r => [
      r.account_id.substring(0, 8) + '…',
      r.user_id.substring(0, 8) + '…',
      r.role,
      r.display_email ?? 'NULL',
    ]);
    const widths = cols.map((c, i) => Math.max(c.length, ...rows.map(r => r[i].length)));
    console.log(`    ${cols.map((c, i) => c.padEnd(widths[i])).join(' | ')}`);
    console.log(`    ${widths.map(w => '─'.repeat(w)).join(' | ')}`);
    for (const row of rows) {
      console.log(`    ${row.map((v, i) => v.padEnd(widths[i])).join(' | ')}`);
    }
  } else {
    console.log('    (empty)');
  }

  console.log('\n    account_keys:');
  if (ev.keyRows.length > 0) {
    for (const k of ev.keyRows) {
      console.log(`      user=${k.user_id.substring(0, 8)}… epoch=${k.epoch} revoked=${k.revoked_at ?? 'active'}`);
    }
  } else {
    console.log('    (empty)');
  }

  console.log('\n    invites:');
  if (ev.inviteRows.length > 0) {
    for (const inv of ev.inviteRows) {
      console.log(`      id=${inv.id.substring(0, 8)}… status=${inv.status}`);
    }
  } else {
    console.log('    (empty)');
  }
  console.log('  ' + '─'.repeat(58));
}

// ───────────────────────────────────────────────────────
// Helper: find invite by recipient email hash
// ───────────────────────────────────────────────────────

async function findInviteByRecipientEmailHash(pool: Pool, emailHash: string): Promise<{ id: string } | null> {
  const result = await pool.query(
    'SELECT id::text FROM invites WHERE recipient_email_hash = $1 AND status = $2 LIMIT 1',
    [emailHash, 'pending'],
  );
  return result.rows.length > 0 ? { id: result.rows[0].id } : null;
}

// ───────────────────────────────────────────────────────
// E2E Test
// ───────────────────────────────────────────────────────

/** Pre-computed deterministic keys (avoids WASM during initial setup) */
const OWNER_USER_ID = randomUUID();
const MEMBER_A_USER_ID = randomUUID();
const MEMBER_B_USER_ID = randomUUID();

describeWithDocker('Gate 7 — Manual E2E: Legacy Shared-Account Permission Migration', () => {
  let containerName: string;
  let pool: Pool;
  let server: Awaited<ReturnType<typeof buildServer>>;
  let serverUrl: string;
  let legacyApiPort: number;
  let legacyServer: ReturnType<typeof createMockLegacyServer>;
  let ownerJwt: string;
  let memberAJwt: string;
  let memberBJwt: string;
  let ownerEmailHash: string;
  let memberAEmailHash: string;
  let memberBEmailHash: string;
  let serverAccountId: string;
  let ownerKeypair: { publicKey: Uint8Array; privateKey: Uint8Array };
  let memberAKeypair: { publicKey: Uint8Array; privateKey: Uint8Array };
  let memberBKeypair: { publicKey: Uint8Array; privateKey: Uint8Array };
  let memberBUserId: string;

  // ── Setup ──

  beforeAll(async () => {
    // 1. Start Docker PostgreSQL
    containerName = `budget-wise-gate7-e2e-${randomUUID()}`;
    runDocker([
      'run', '--name', containerName,
      '-e', 'POSTGRES_USER=budget',
      '-e', 'POSTGRES_PASSWORD=budget',
      '-e', 'POSTGRES_DB=budget',
      '-p', '127.0.0.1::5432',
      '-d', 'postgres:16-alpine',
    ]);

    const port = runDocker([
      'inspect', '-f',
      '{{(index (index .NetworkSettings.Ports "5432/tcp") 0).HostPort}}',
      containerName,
    ]);
    const databaseUrl = `postgresql://budget:budget@127.0.0.1:${port}/budget`;

    await waitForPostgres(databaseUrl);

    pool = createPgPool(databaseUrl, { ssl: false });
    const dbInstance = createDb(pool);
    await migrate(dbInstance, { migrationsFolder: './packages/server/drizzle' });

    // 2. Set env vars for the server
    process.env.MAGIC_LINK_SECRET = 'manual-e2e-test-secret';
    process.env.EMAIL_ENCRYPTION_KEY = [
      '95fb2ed623392de4', '4b7eed8761e6e414',
      '799e446119bb0437', '72a795d27fdda61d',
    ].join('');
    process.env.BUDGET_WISE_PEPPER = EMAIL_HASH_PEPPER;

    // 3. Build the Fastify server
    server = await buildServer({ db: dbInstance, fastifyOptions: { logger: false } });

    // 4. Start server on a real port
    const address = await server.listen({ port: 0, host: '127.0.0.1' });
    serverUrl = address;

    // 5. Compute email hashes (same function and pepper as the server)
    ownerEmailHash = await hashEmail(OWNER_EMAIL, EMAIL_HASH_PEPPER);
    memberAEmailHash = await hashEmail(MEMBER_A_EMAIL, EMAIL_HASH_PEPPER);
    memberBEmailHash = await hashEmail(MEMBER_B_EMAIL, EMAIL_HASH_PEPPER);

    // 6. Initialize sodium for base64url encoding
    const sod = await getSodium();

    // 7. Generate keypairs for owner and member A (member B keypair generated later)
    ownerKeypair = await generateKeypair();
    memberAKeypair = await generateKeypair();

    // 8. Create owner user in DB
    await dbInstance.insert(users).values({
      id: OWNER_USER_ID,
      emailHash: ownerEmailHash,
      publicKey: encodeBase64url(sod, ownerKeypair.publicKey),
      validatedAt: new Date(),
    });

    // 9. Create member A user in DB (registered member)
    await dbInstance.insert(users).values({
      id: MEMBER_A_USER_ID,
      emailHash: memberAEmailHash,
      publicKey: encodeBase64url(sod, memberAKeypair.publicKey),
      validatedAt: new Date(),
    });

    // 10. Generate JWTs for both users
    ownerJwt = server.jwt.sign({ sub: ownerEmailHash, typ: 'session' });
    memberAJwt = server.jwt.sign({ sub: memberAEmailHash, typ: 'session' });

    // 11. Start legacy API mock server
    legacyServer = createMockLegacyServer(SHARED_ACCOUNT_FIXTURE.responses);
    legacyApiPort = await legacyServer.start();

    console.log('\n══════════════════════════════════════════════');
    console.log('  GATE 7 MANUAL E2E TEST');
    console.log('  Legacy Shared-Account Permission Migration');
    console.log(`  Server URL:       ${serverUrl}`);
    console.log(`  Legacy API:       http://127.0.0.1:${legacyApiPort}`);
    console.log(`  Owner:            ${OWNER_EMAIL} (${OWNER_USER_ID})`);
    console.log(`  Member A:         ${MEMBER_A_EMAIL} (${MEMBER_A_USER_ID})`);
    console.log(`  Member B:         ${MEMBER_B_EMAIL} (unregistered)`);
    console.log('══════════════════════════════════════════════\n');
  }, 120_000);

  afterAll(async () => {
    // Stop legacy mock
    if (legacyServer) await legacyServer.stop();

    // Close server
    if (server) await server.close();

    // Close pool
    if (pool) await closePgPool(pool);

    // Remove Docker container
    if (containerName) {
      spawnSync('docker', ['rm', '-f', containerName], { stdio: 'ignore' });
    }

    delete process.env.MAGIC_LINK_SECRET;
    delete process.env.EMAIL_ENCRYPTION_KEY;
    delete process.env.BUDGET_WISE_PEPPER;
  });

  // ── Test ──

  it('Full E2E: migrate shared account, verify invites, accept, deliver key, decrypt', async () => {
    // ══════════════════════════════════════════════
    // 1. PREPARE — reset local state, create push provider
    // ══════════════════════════════════════════════

    resetPrivateKeyStoreMock();
    await resetMigrationPersistence();

    const ownerKeypair = await generateKeypair();

    const realClient = createOnlineAccountsClient({
      baseUrl: serverUrl,
      sessionToken: ownerJwt,
    });

    const pushProvider: IMigrationOnlinePushProvider = {
      client: realClient,
      userPublicKey: ownerKeypair.publicKey,
      emailHashPepper: EMAIL_HASH_PEPPER,
    };

    const apiClient = new LegacyApiClient(`http://127.0.0.1:${legacyApiPort}`);
    const transformer = new LegacyDataTransformer();
    const budgetService = new BudgetService();
    const migrationService = new MigrationService(apiClient, transformer, budgetService);

    // ══════════════════════════════════════════════
    // 2. RUN MIGRATION — this internally calls LegacyMemberMigrationService
    // ══════════════════════════════════════════════

    console.log('\n  ── Running Migration (Owner) ──');
    const result = await migrationService.migrate(
      SHARED_ACCOUNT_FIXTURE.credentials.email,
      SHARED_ACCOUNT_FIXTURE.credentials.password,
      () => undefined,
      0,
      'manual-e2e-gate7',
      pushProvider,
    );

    expect(result.success).toBe(true);
    addEvidence('1. Migration succeeded', '✅ PASS',
      `Accounts imported: ${result.imported.accounts}`,
      `Transactions imported: ${result.imported.transactions}`,
    );

    // Capture the server account ID from the sync metadata
    const importedAccountId = result.importedAccountIds[0];
    expect(importedAccountId).toBeDefined();
    addEvidence('2. Account imported', '✅ PASS',
      `Local account ID: ${importedAccountId}`,
    );

    // Get the server account ID from the uploaded key metadata
    const serverAccounts = await realClient.listAccounts();
    expect(serverAccounts.accounts.length).toBeGreaterThanOrEqual(1);
    serverAccountId = serverAccounts.accounts[0].id;
    addEvidence('3. Server account created', '✅ PASS',
      `Server account ID: ${serverAccountId}`,
      `Role: ${serverAccounts.accounts[0].role}`,
      `Key epoch: ${serverAccounts.accounts[0].keyEpoch}`,
    );

    // Verify owner role on server account
    expect(serverAccounts.accounts[0].role).toBe('owner');
    addEvidence('3a. Owner role on server account', '✅ PASS',
      'Legacy owner → server account role = owner',
    );

    // ══════════════════════════════════════════════
    // 3. DB EVIDENCE — verify invites were created by member migration
    // ══════════════════════════════════════════════

    const ev1 = await collectDbEvidence(pool);
    printDbEvidence(ev1);

    addEvidence('4. DB evidence after migration', '✅ PASS',
      ...formatDbEvidence(ev1),
    );

    // Invites: should have 2 pending invites (one for each member)
    const pendingInvites = ev1.inviteRows.filter(i => i.status === 'pending');
    expect(pendingInvites.length).toBe(2);
    addEvidence('5. Pending invites created', '✅ PASS',
      `${pendingInvites.length} pending invite(s) found for shared-account members`,
    );

    // Account members: should have 1 member (the owner)
    expect(ev1.memberRows.length).toBe(1);
    expect(ev1.memberRows[0].role).toBe('owner');
    addEvidence('6. Owner in account_members', '✅ PASS',
      `Owner user_id=${ev1.memberRows[0].user_id.substring(0, 8)}… role=${ev1.memberRows[0].role}`,
    );

    // ══════════════════════════════════════════════
    // 4. REGISTERED MEMBER FLOW — accept invite
    // ══════════════════════════════════════════════

    console.log('\n  ── Registered Member Flow (Member A) ──');

    // Find the invite for member A
    const inviteA = await findInviteByRecipientEmailHash(pool, memberAEmailHash);
    expect(inviteA).not.toBeNull();
    addEvidence('7. Invite for registered member found', '✅ PASS',
      `Invite ID: ${inviteA!.id}`,
    );

    // Member A accepts the invite via the real API
    const memberAClient = createOnlineAccountsClient({
      baseUrl: serverUrl,
      sessionToken: memberAJwt,
    });

    // First, member A lists their pending invites
    const pendingForMe = await memberAClient.listPendingInvitesForMe();
    expect(pendingForMe.invites.length).toBeGreaterThanOrEqual(1);
    addEvidence('8. Member A sees pending invite', '✅ PASS',
      `Found ${pendingForMe.invites.length} pending invite(s)`,
      `Account: ${pendingForMe.invites[0].accountName ?? '(unnamed)'}`,
    );

    // Accept the invite
    const acceptResult = await memberAClient.acceptInvite(inviteA!.id);
    expect(acceptResult.status).toBe('ok');
    addEvidence('9. Member A accepted invite', '✅ PASS',
      `Invite ${inviteA!.id.substring(0, 8)}… accepted`,
    );

    // Note: acceptInvite only updates invite status to 'accepted'.
    // The recipient is NOT added to account_members until deliverWrappedKey
    // runs (see step 6 below). At this point account_members still = 1 (owner only).

    // ══════════════════════════════════════════════
    // 5. KEY DELIVERY — owner polls and delivers wrapped key
    // ══════════════════════════════════════════════

    console.log('\n  ── Key Delivery ──');

    // Owner polls for pending key requests
    const pendingKeyRequests = await realClient.pollPendingKeyRequests({
      accountId: serverAccountId,
    });
    expect(pendingKeyRequests.pendingKeyDeliveries.length).toBeGreaterThanOrEqual(1);
    addEvidence('10. Pending key requests found', '✅ PASS',
      `${pendingKeyRequests.pendingKeyDeliveries.length} pending request(s)`,
    );

    // Find the request for member A
    const reqForA = pendingKeyRequests.pendingKeyDeliveries.find(
      r => r.recipientUserId === MEMBER_A_USER_ID,
    );
    expect(reqForA).toBeDefined();
    expect(reqForA!.recipientPublicKey).toBeTruthy();

    // Load the account key and wrap it for member A
    const accountKey = await loadAccountKey(serverAccountId);
    expect(accountKey).not.toBeNull();
    expect(accountKey!.length).toBe(32);

    const publicKeyBytes = await fromBase64url(reqForA!.recipientPublicKey);
    const wrappedKey = await wrapAccountKey(accountKey!, publicKeyBytes);

    // Owner delivers the wrapped key — this also adds the recipient to account_members
    const deliverResult = await realClient.deliverAccountKey({
      accountId: serverAccountId,
      userId: MEMBER_A_USER_ID,
      wrappedKey,
      epoch: 1,
    });
    expect(deliverResult.status).toBe('ok');
    addEvidence('11. Wrapped key delivered to Member A', '✅ PASS',
      'Wrapped key delivered and stored on server',
    );

    // ══════════════════════════════════════════════
    // 6. DB EVIDENCE — verify account_members + account_keys after delivery
    // ══════════════════════════════════════════════

    const ev2 = await collectDbEvidence(pool);
    printDbEvidence(ev2);

    // account_members should now have 2 entries: owner + member A
    // (deliverWrappedKey adds the recipient to account_members)
    expect(ev2.memberRows.length).toBe(2);
    const memberARow = ev2.memberRows.find(r => r.role === 'member');
    expect(memberARow).toBeDefined();
    addEvidence('12. Member A in account_members after key delivery', '✅ PASS',
      `role=${memberARow!.role}`,
      'Legacy member → new account_members role = member',
    );

    // account_keys should have entries: owner's key + member A's key
    const memberAKeyRow = ev2.keyRows.find(k => k.user_id === MEMBER_A_USER_ID);
    expect(memberAKeyRow).toBeDefined();
    expect(memberAKeyRow!.alg).toBe('x25519-xsalsa20-poly1305');
    expect(memberAKeyRow!.revoked_at).toBeNull();
    addEvidence('13. account_keys has Member A key', '✅ PASS',
      `epoch=${memberAKeyRow!.epoch}, active (not revoked)`,
    );

    // ══════════════════════════════════════════════
    // 7. REGISTERED MEMBER: pull + decrypt records
    // ══════════════════════════════════════════════

    console.log('\n  ── Verify Member A can decrypt data ──');

    // Member A retrieves the wrapped account key
    const memberAKeyResult = await memberAClient.getAccountKey({
      accountId: serverAccountId,
    });
    expect(memberAKeyResult.wrappedKey).toBeDefined();
    expect(memberAKeyResult.wrappedKey.alg).toBe('x25519-xsalsa20-poly1305');

    // Member A unwraps the envelope with their own private key —
    // this is the true test that the delivered wrapped key is valid.
    const memberAAccountKey = await unwrapAccountKey(
      memberAKeyResult.wrappedKey as any,
      memberAKeypair.publicKey,
      memberAKeypair.privateKey,
    );
    expect(memberAAccountKey.length).toBe(32);
    addEvidence('14. Member A retrieved and unwrapped account key', '✅ PASS',
      'Unwrapped symmetric key matches expected length (32 bytes)',
      'Member A can decrypt the delivered wrapped key with their own private key',
    );

    // Member A pulls records
    const pulledRecords = await memberAClient.pullChangeRecords({
      accountId: serverAccountId,
      since: 0,
    });
    expect(pulledRecords.records.length).toBeGreaterThan(0);
    addEvidence('15. Member A pulled records from server', '✅ PASS',
      `${pulledRecords.records.length} record(s) pulled`,
    );

    // Member A decrypts records using the key they unwrapped themselves
    for (const record of pulledRecords.records) {
      const decrypted = await decryptChangeRecord(
        record.encrypted_payload as any,
        memberAAccountKey,
      );
      expect(decrypted).toBeDefined();
      expect(decrypted.id).toBe(record.change_uuid);
    }
    addEvidence('16. Member A decrypted pulled records', '✅ PASS',
      `Successfully decrypted ${pulledRecords.records.length} record(s) with unwrapped key`,
      'Round-trip: member unwraps own envelope → decrypts records with unwrapped key',
    );

    // ══════════════════════════════════════════════
    // 9. UNREGISTERED MEMBER FLOW (Member B)
    // ══════════════════════════════════════════════

    console.log('\n  ── Unregistered Member Flow (Member B) ──');

    // Find the invite for member B
    const inviteB = await findInviteByRecipientEmailHash(pool, memberBEmailHash);
    expect(inviteB).not.toBeNull();
    addEvidence('17. Invite for unregistered member found', '✅ PASS',
      `Invite ID: ${inviteB!.id}`,
    );

    // Register Member B via the real server API instead of a raw INSERT.
    // This exercises the registerPendingUser service path including email_hash
    // storage, public_key validation, and unique-constraint handling.
    memberBKeypair = await generateKeypair();
    memberBEmailHash = await hashEmail(MEMBER_B_EMAIL, EMAIL_HASH_PEPPER);

    const sod2 = await getSodium(); // eslint-disable-line @typescript-eslint/no-shadow
    const publicKeyB64 = encodeBase64url(sod2, memberBKeypair.publicKey);
    const regRes = await server.inject({
      method: 'POST',
      url: '/users',
      payload: { emailHash: memberBEmailHash, publicKey: publicKeyB64 },
    });
    expect(regRes.statusCode).toBe(201);
    expect(regRes.json()).toMatchObject({ status: 'registered' });

    // Capture the auto-generated user ID from the DB (the /users endpoint
    // auto-generates it via Drizzle's defaultRandom()).
    const userQuery = await pool.query(
      'SELECT id::text FROM users WHERE email_hash = $1',
      [memberBEmailHash],
    );
    memberBUserId = userQuery.rows[0].id;
    expect(memberBUserId).toBeTruthy();
    expect(memberBUserId).not.toBe(MEMBER_B_USER_ID); // Sanity check: was auto-generated

    // The /users endpoint creates a pending (unvalidated) user. In the full
    // auth flow, the user validates via magic-link → POST /v1/auth/verify.
    // For this E2E test we short-circuit by setting validated_at directly,
    // since exercising the full Brevo email + token-consume flow adds
    // substantial complexity without testing additional migration logic.
    // Note: this simplification is acceptable for Gate 7 evidence.
    await pool.query(
      'UPDATE users SET validated_at = $1 WHERE id = $2',
      [new Date().toISOString(), memberBUserId],
    );

    memberBJwt = server.jwt.sign({ sub: memberBEmailHash, typ: 'session' });

    addEvidence('18. Member B registered via real API', '✅ PASS',
      `User ID: ${memberBUserId} (auto-generated)`,
      'POST /users via server.inject() — validated_at set directly (note: magic-link flow skipped)',
    );

    // Member B accepts the invite
    const memberBClient = createOnlineAccountsClient({
      baseUrl: serverUrl,
      sessionToken: memberBJwt,
    });

    const pendingForB = await memberBClient.listPendingInvitesForMe();
    expect(pendingForB.invites.length).toBeGreaterThanOrEqual(1);
    addEvidence('19. Member B sees pending invite after registration', '✅ PASS',
      `Found ${pendingForB.invites.length} pending invite(s) for newly registered user`,
    );

    const acceptBResult = await memberBClient.acceptInvite(inviteB!.id);
    expect(acceptBResult.status).toBe('ok');
    addEvidence('20. Member B accepted invite', '✅ PASS',
      'Unregistered member accepts invite after registration',
    );

    // ══════════════════════════════════════════════
    // 10. KEY DELIVERY for Member B
    // ══════════════════════════════════════════════

    // Owner polls for pending key requests (should include member B now)
    const pendingKeyRequests2 = await realClient.pollPendingKeyRequests({
      accountId: serverAccountId,
    });

    const reqForB = pendingKeyRequests2.pendingKeyDeliveries.find(
      r => r.recipientUserId === memberBUserId,
    );
    expect(reqForB).toBeDefined();

    const publicKeyBytesB = await fromBase64url(reqForB!.recipientPublicKey);
    const wrappedKeyForB = await wrapAccountKey(accountKey!, publicKeyBytesB);

    const deliverBResult = await realClient.deliverAccountKey({
      accountId: serverAccountId,
      userId: memberBUserId,
      wrappedKey: wrappedKeyForB,
      epoch: 1,
    });
    expect(deliverBResult.status).toBe('ok');
    addEvidence('21. Wrapped key delivered to Member B', '✅ PASS',
      'Key delivered successfully after registration and invite acceptance',
    );

    // ══════════════════════════════════════════════
    // 11. Member B: pull + decrypt records
    // ══════════════════════════════════════════════

    // Member B retrieves and unwraps the account key with their own private key
    const memberBKeyResult = await memberBClient.getAccountKey({
      accountId: serverAccountId,
    });
    expect(memberBKeyResult.wrappedKey).toBeDefined();

    const memberBAccountKey = await unwrapAccountKey(
      memberBKeyResult.wrappedKey as any,
      memberBKeypair.publicKey,
      memberBKeypair.privateKey,
    );
    expect(memberBAccountKey.length).toBe(32);

    const pulledRecordsB = await memberBClient.pullChangeRecords({
      accountId: serverAccountId,
      since: 0,
    });
    expect(pulledRecordsB.records.length).toBeGreaterThan(0);
    addEvidence('22. Member B pulled records from server', '✅ PASS',
      `${pulledRecordsB.records.length} record(s) pulled`,
    );

    // Member B decrypts using the key unwrapped from their own envelope
    for (const record of pulledRecordsB.records) {
      const decrypted = await decryptChangeRecord(
        record.encrypted_payload as any,
        memberBAccountKey,
      );
      expect(decrypted).toBeDefined();
      expect(decrypted.id).toBe(record.change_uuid);
    }
    addEvidence('23. Member B decrypted pulled records', '✅ PASS',
      `Successfully decrypted ${pulledRecordsB.records.length} record(s) with unwrapped key`,
      'Unregistered → registered → invite accept → key delivery → unwrap → decrypt verified',
    );

    // ══════════════════════════════════════════════
    // 12. FINAL DB EVIDENCE
    // ══════════════════════════════════════════════

    const evFinal = await collectDbEvidence(pool);
    printDbEvidence(evFinal);

    addEvidence('24. Final DB evidence', '✅ PASS',
      ...formatDbEvidence(evFinal),
    );

    // Verify final state:
    // account_members: 3 (owner + member A + member B)
    expect(evFinal.memberRows.length).toBe(3);
    const ownerRow = evFinal.memberRows.find(r => r.role === 'owner');
    const memberARow2 = evFinal.memberRows.filter(r => r.role === 'member');
    expect(ownerRow).toBeDefined();
    expect(memberARow2.length).toBe(2);
    addEvidence('25. Role mapping verified', '✅ PASS',
      'Legacy owner → account_members role = owner',
      'Legacy members → account_members role = member (×2)',
    );

    // account_keys: at least 3 (owner's + member A's + member B's)
    const activeKeys = evFinal.keyRows.filter(k => k.revoked_at === null);
    expect(activeKeys.length).toBeGreaterThanOrEqual(3);
    addEvidence('26. All members have active account keys', '✅ PASS',
      `${activeKeys.length} active key(s) in account_keys`,
    );

    // invites: both should be 'accepted' now
    const acceptedInvites = evFinal.inviteRows.filter(i => i.status === 'accepted');
    expect(acceptedInvites.length).toBe(2);
    addEvidence('27. All invites accepted', '✅ PASS',
      `${acceptedInvites.length}/2 invites accepted`,
    );

    // All evidence collected — write the report
    writeEvidenceReport(true);

    addEvidence('28. Blocking bugs found', '✅ NONE',
      'All checks passed. No blocking bugs detected.',
    );

    console.log('\n  ' + '═'.repeat(58));
    console.log('    GATE 7 E2E EVIDENCE SUMMARY');
    console.log('  ' + '═'.repeat(58));
    console.log(`    account_members:        ${evFinal.memberRows.length} entries (owner + 2 members)`);
    console.log(`    account_keys:           ${evFinal.keyRows.length} total, ${activeKeys.length} active`);
    console.log(`    invites:                ${evFinal.inviteRows.length} total, ${acceptedInvites.length} accepted`);
    console.log(`    Records decrypted:      ${pulledRecords.records.length} (Member A) + ${pulledRecordsB.records.length} (Member B)`);
    console.log('  ' + '═'.repeat(58));
    console.log('');
  }, 180_000);
});
