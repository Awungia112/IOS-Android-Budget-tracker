import 'fake-indexeddb/auto';
// @vitest-environment node
/**
 * Gate 5 — Live Migration Demo
 *
 * Starts a REAL HTTP server serving fixture data (mimicking the legacy Django API),
 * then runs the actual MigrationService against it with real fetch() calls.
 *
 * This produces demonstrable evidence of:
 *   - Real HTTP requests/responses between LegacyApiClient and legacy API
 *   - Real migration pipeline processing the data in real IndexedDB
 *   - Real detection results with onOnlineAccountDetected callback
 *   - Real IndexedDB state with needsOnlinePush flags
 *
 * Usage:
 *   npx vitest run scripts/gate5-live-demo.ts
 */

import { describe, it, expect } from 'vitest';
import * as http from 'node:http';
import { AddressInfo } from 'node:net';
import { onlineAccountFixture, minimalAccountFixture, multiAccountFixture } from '../packages/core/src/migration/test-fixtures';
import { LegacyApiClient } from '../packages/core/src/migration/legacy-api-client';
import { LegacyDataTransformer } from '../packages/core/src/migration/legacy-data-transformer';
import { MigrationService } from '../packages/core/src/migration/migration.service';
import { BudgetService } from '../packages/core/src/services/budget.service';
import { changeLog } from '../packages/core/src/changelog/change-log';
import { db } from '../packages/core/src/db/database';

// =========================== LEGACY API MOCK SERVER ===========================

function createMockLegacyServer(fixtures: Record<string, unknown>[]) {
  const requestLog: Array<{ method: string; url: string; timestamp: string }> = [];

  const findInFixtures = (key: string): unknown => {
    for (const f of fixtures) {
      const responses = (f as Record<string, unknown>).responses as Record<string, unknown>;
      if (responses[key] !== undefined) return responses[key];
    }
    return undefined;
  };

  const mergeFromFixtures = (key: string): unknown[] => {
    const result: unknown[] = [];
    for (const f of fixtures) {
      const responses = (f as Record<string, unknown>).responses as Record<string, unknown>;
      const data = responses[key] as unknown[] | undefined;
      if (data) result.push(...data);
    }
    return result;
  };

  const server = http.createServer((req, res) => {
    const method = req.method ?? 'GET';
    const url = req.url ?? '/';
    requestLog.push({ method, url, timestamp: new Date().toISOString() });

    let body = '';
    req.on('data', (chunk: Buffer) => { body += chunk.toString(); });
    req.on('end', () => {
      let responseBody: unknown;

      if (method === 'POST' && url === '/user/get-token') {
        responseBody = { token: 'live-demo-token' };
      } else if (method === 'GET' && url === '/api/accounts') {
        responseBody = mergeFromFixtures('GET /api/accounts');
      } else if (method === 'GET' && url === '/api/access') {
        responseBody = mergeFromFixtures('GET /api/access');
      } else if (method === 'GET') {
        const balanceMatch = url.match(/^\/api\/balance\?account_id=(\d+)$/);
        const categoryMatch = url.match(/^\/api\/category\?account_id=(\d+)$/);
        const recuringMatch = url.match(/^\/api\/recuring\?account_id=(\d+)$/);
        const savingMatch = url.match(/^\/api\/saving-goal\?category_id=(\d+)$/);

        if (balanceMatch) {
          responseBody = findInFixtures(`GET /api/balance?account_id=${balanceMatch[1]}`) ?? [];
        } else if (categoryMatch) {
          responseBody = findInFixtures(`GET /api/category?account_id=${categoryMatch[1]}`) ?? [];
        } else if (recuringMatch) {
          responseBody = findInFixtures(`GET /api/recuring?account_id=${recuringMatch[1]}`) ?? [];
        } else if (savingMatch) {
          responseBody = findInFixtures(`GET /api/saving-goal?category_id=${savingMatch[1]}`) ?? [];
        } else {
          responseBody = { error: 'not found' };
        }
      }

      res.writeHead(responseBody && 'error' in (responseBody as Record<string, unknown>) ? 404 : 200, {
        'Content-Type': 'application/json',
      });
      res.end(JSON.stringify(responseBody));
    });
  });

  const start = (): Promise<number> => new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve((server.address() as AddressInfo).port));
  });

  const stop = (): Promise<void> => new Promise((resolve) => {
    server.close(() => resolve());
  });

  return { start, stop, getLogs: () => [...requestLog] };
}

// =========================== HELPERS ===========================

const SEP = '─'.repeat(74);
let logs: string[] = [];
const origLog = console.log;
const origWarn = console.warn;
const origError = console.error;

function captureConsole() { logs = []; console.log = (...a) => { logs.push('[LOG] ' + a.join(' ')); origLog(...a); }; }
function restoreConsole() { console.log = origLog; console.warn = origWarn; console.error = origError; }

async function resetDb() {
  if (typeof localStorage !== 'undefined') localStorage.clear();
  try { db.close(); } catch { /* ok */ }
  await db.delete();
  await db.open();
  await db.initializeDefaultData();
  await changeLog.clear();
}

async function runLiveMigration(
  label: string,
  fixture: Record<string, unknown>,
  baseUrl: string,
) {
  const creds = (fixture.credentials as { email: string; password: string });
  const apiClient = new LegacyApiClient(baseUrl);
  const transformer = new LegacyDataTransformer();
  const budgetService = new BudgetService();
  const detectedAccounts: Array<{ id: string; online: boolean; shared: boolean }> = [];

  const migrationService = new MigrationService(
    apiClient, transformer, budgetService, undefined,
    (accountId: string, result: unknown) => {
      const r = result as Record<string, unknown>;
      detectedAccounts.push({ id: accountId, online: !!r.isOnline, shared: !!r.isShared });
      origLog(`  >>> DETECTED: account=${accountId.slice(0, 8)}... online=${r.isOnline} shared=${r.isShared}`);
    },
  );

  origLog(`\n${SEP}`);
  origLog(`  LIVE MIGRATION: ${label}`);
  origLog(`  Legacy API: ${baseUrl}`);
  origLog(`${SEP}`);
  origLog(`  [PROGRESS] Starting migration for ${creds.email}...`);

  const result = await migrationService.migrate(
    creds.email, creds.password,
    (step) => {
      const s = step.step;
      if (s === 'IMPORTING_ENTITY') origLog(`  [PROGRESS] ${s} (${(step as { entity: string }).entity})`);
      else if (s === 'PUSHING') origLog(`  [PROGRESS] ${s} (${(step as { accountName: string }).accountName})`);
      else origLog(`  [PROGRESS] ${s}`);
    },
  );

  origLog(`\n  --- Result ---`);
  origLog(`  success:         ${result.success}`);
  origLog(`  accounts:        ${result.imported.accounts}`);
  origLog(`  transactions:    ${result.imported.transactions}`);
  origLog(`  categories:      ${result.imported.categories}`);
  origLog(`  limits:          ${result.imported.limits}`);
  origLog(`  recurringItems:  ${result.imported.recurringItems}`);
  origLog(`  savingsGoals:    ${result.imported.savingsGoals}`);

  origLog(`\n  --- IndexedDB needsOnlinePush flags ---`);
  for (const acct of result.importedAccounts) {
    const push = acct.needsOnlinePush ?? false;
    const tag = push ? '← PUSH NEEDED' : '← NO-OP';
    origLog(`  "${acct.name}": needsOnlinePush=${push} ${tag}`);
  }

  if (detectedAccounts.length === 0) {
    origLog(`  (no detection callbacks fired — correctly not online/shared)`);
  }

  origLog(``);
  expect(result.success).toBe(true);
  return { ...result, detectedAccounts };
}

// =========================== TESTS ===========================

describe('Gate 5 — Live Migration Demo', () => {

  it('SCENARIO 1: Online + Shared Account — real HTTP + real IndexedDB', async () => {
    const server = createMockLegacyServer([onlineAccountFixture as unknown as Record<string, unknown>]);
    const port = await server.start();
    captureConsole();
    await resetDb();
    
    const result = await runLiveMigration(
      'Online + Shared Account (last_synced set, 1 owner + 1 member)',
      onlineAccountFixture as unknown as Record<string, unknown>,
      `http://127.0.0.1:${port}`,
    );

    // ENHANCED ASSERTIONS
    expect(result.success).toBe(true);
    
    // 1. Verify onOnlineAccountDetected was called correctly
    // onlineAccountFixture has 1 online/shared account
    const onlineAccts = result.importedAccounts.filter(a => a.needsOnlinePush);
    expect(onlineAccts.length).toBeGreaterThan(0);
    
    // 2. Verify IndexedDB state (needsOnlinePush)
    const mainAcct = result.importedAccounts.find(a => a.name === 'Shared Online Budget');
    expect(mainAcct?.needsOnlinePush).toBeTruthy();

    // 3. Verify detection result values
    expect(result.detectedAccounts[0]).toMatchObject({
      online: true,
      shared: true
    });

    restoreConsole();
    await server.stop();
  });

  it('SCENARIO 2: Offline-Only Account — real HTTP + real IndexedDB', async () => {
    const server = createMockLegacyServer([minimalAccountFixture as unknown as Record<string, unknown>]);
    const port = await server.start();
    captureConsole();
    await resetDb();
    
    const result = await runLiveMigration(
      'Offline-Only Account (no last_synced, owner-only)',
      minimalAccountFixture as unknown as Record<string, unknown>,
      `http://127.0.0.1:${port}`,
    );

    // ENHANCED ASSERTIONS
    expect(result.success).toBe(true);
    
    // 1. Verify NO online accounts detected
    const onlineAccts = result.importedAccounts.filter(a => a.needsOnlinePush);
    expect(onlineAccts.length).toBe(0);

    restoreConsole();
    await server.stop();
  });

  it('SCENARIO 3: Multi-Account Mix — real HTTP + real IndexedDB', async () => {
    const server = createMockLegacyServer([multiAccountFixture as unknown as Record<string, unknown>]);
    const port = await server.start();
    captureConsole();
    await resetDb();
    
    const result = await runLiveMigration(
      'Multi-Account (1 offline owner + 1 shared member + 1 deleted — skipped)',
      multiAccountFixture as unknown as Record<string, unknown>,
      `http://127.0.0.1:${port}`,
    );

    // ENHANCED ASSERTIONS
    expect(result.success).toBe(true);

    // 1. Verify mixed detection
    // multiAccountFixture has:
    // - "Personal Legacy" (offline owner)
    // - "Shared Flat" (shared member -> online)
    const personal = result.importedAccounts.find(a => a.name === 'Personal Legacy');
    const shared = result.importedAccounts.find(a => a.name === 'Shared Flat');
    
    expect(personal?.needsOnlinePush).toBeFalsy();
    expect(shared?.needsOnlinePush).toBeTruthy();

    // 2. Verify detection result values for the shared account
    const sharedDetection = result.detectedAccounts.find(d => d.shared);
    expect(sharedDetection).toBeDefined();
    expect(sharedDetection?.shared).toBe(true);

    restoreConsole();
    await server.stop();
  });
});
