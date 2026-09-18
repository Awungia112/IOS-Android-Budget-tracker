import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { buildServer } from '../app.js';
import type { FastifyInstance } from 'fastify';

describe('GET /health', () => {
  let server: FastifyInstance;

  beforeAll(async () => {
    server = await buildServer({ fastifyOptions: { logger: false } });
    await server.ready();
  });

  afterAll(async () => {
    await server.close();
  });

  it('returns 200 with status ok and service recovery', async () => {
    const response = await server.inject({ method: 'GET', url: '/health' });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: 'ok', service: 'recovery' });
  });
});

// ─── Startup-path wiring tests ────────────────────────────────────────────────
//
// Covers the P1 finding: POST /v1/recovery/enroll must be registered when a
// real DB is passed to buildServer(), and must NOT be registered (404) when
// no DB is provided (health-only mode).

import { vi } from 'vitest';
import type { RecoveryDb } from '../db/recovery.repository.js';

function buildDbMock(): RecoveryDb {
  return {
    insert: vi.fn().mockReturnValue({
      values: vi.fn().mockReturnValue({
        onConflictDoUpdate: vi.fn().mockResolvedValue(undefined),
      }),
    }),
  } as unknown as RecoveryDb;
}

describe('buildServer — enroll route wiring', () => {
  it('registers POST /v1/recovery/enroll when db is provided', async () => {
    const server = await buildServer({ db: buildDbMock(), fastifyOptions: { logger: false } });

    try {
      // A valid-shape payload — route is registered, so we get schema validation (400)
      // rather than "route not found" (404).
      const res = await server.inject({
        method: 'POST',
        url: '/v1/recovery/enroll',
        payload: {},
      });

      expect(res.statusCode).toBe(400);
    } finally {
      await server.close();
    }
  });

  it('does NOT register POST /v1/recovery/enroll when no db is provided (health-only mode)', async () => {
    const server = await buildServer({ fastifyOptions: { logger: false } });

    try {
      const res = await server.inject({
        method: 'POST',
        url: '/v1/recovery/enroll',
        payload: {},
      });

      expect(res.statusCode).toBe(404);
    } finally {
      await server.close();
    }
  });
});
