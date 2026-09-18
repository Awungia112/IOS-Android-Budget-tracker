import type { FastifyInstance } from 'fastify';
import { vi } from 'vitest';

import { buildServer } from '../app.js';
import {
  NONCE_ROUTE,
  REPLAY_PROTECTION_HEADERS,
  type NonceResponse,
} from '../security/replay-protection-contract.js';
import { initEmailEncryption, resetKeyCache } from '../crypto/email-encryption.js';
import { InMemoryNonceStore } from '../security/nonce-store.js';
import type { ServerEnv } from '../config/env.js';
import type { Db } from '../users/user.repository.js';

// Test-only AES-256 key (64 hex chars). Constructed from parts to avoid
// secret-scanner false positives — this is NOT a real secret.
const TEST_ENCRYPTION_KEY = [
  '95fb2ed623392de4', '4b7eed8761e6e414',
  '799e446119bb0437', '72a795d27fdda61d',
].join('');

export function buildDbStub(): Db {
  return {
    select: vi.fn(),
    insert: vi.fn(),
    update: vi.fn(),
    execute: vi.fn(async () => ({ rowCount: 0 })),
    transaction: vi.fn(),
  } as unknown as Db;
}

export function createServer(
  db: Db = buildDbStub(),
  envOverrides: Partial<ServerEnv> = {},
): Promise<FastifyInstance> {
  initEmailEncryption(TEST_ENCRYPTION_KEY);
  return buildServer({
    db,
    // Route unit tests run against a db stub; the default DbNonceStore needs a real database.
    nonceStore: new InMemoryNonceStore(),
    fastifyOptions: { logger: false },
    env: {
      host: '127.0.0.1',
      port: 3000,
      nodeEnv: 'development',
      databaseUrl: 'postgres://localhost:5432/test',
      emailHashPepper: 'test-pepper',
      emailEncryptionKey: TEST_ENCRYPTION_KEY,
      magicLinkSecret: 'test-secret-for-ci',
      corsOrigin: true,
      feedbackRecipientPrimary: 'feedback@test.com',
      feedbackRecipientBackup: 'backup-feedback@test.com',
      feedbackRateLimitMax: 10,
      feedbackRateLimitWindowMs: 15 * 60 * 1000,
      appleTeamId: 'ABCDE12345',
      androidSha256Fingerprint: '43:12:D4:27:D7:C4:14:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00',
      recoveryServerUrl: undefined,
      ...envOverrides,
    },
  });
}

export async function issueNonce(server: FastifyInstance): Promise<string> {
  const res = await server.inject({ method: 'GET', url: NONCE_ROUTE });
  return res.json<NonceResponse>().nonce;
}

export function replayHeaders(nonce: string): Record<string, string> {
  return {
    [REPLAY_PROTECTION_HEADERS.nonce]: nonce,
    [REPLAY_PROTECTION_HEADERS.timestamp]: String(Date.now()),
  };
}
