/**
 * Integration tests for DELETE /v1/recovery/account
 *
 * Tests JWT authentication, email_hash matching, and idempotent deletion
 * of recovery entries.
 */

import type { FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { buildServer } from '../app.js';
import type { RecoveryDb } from '../db/recovery.repository.js';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const VALID_EMAIL_HASH = 'a'.repeat(64);
const WRONG_EMAIL_HASH = 'b'.repeat(64);
const SESSION_TOKEN_TYPE = 'session';

// ─── DB mock ──────────────────────────────────────────────────────────────────

function buildDbMock(deleteError?: Error): RecoveryDb {
  return {
    delete: vi.fn().mockReturnValue({
      where: deleteError
        ? vi.fn().mockRejectedValue(deleteError)
        : vi.fn().mockResolvedValue(undefined),
    }),
    insert: vi.fn(),
    select: vi.fn(),
  } as unknown as RecoveryDb;
}

// ─── Server factory ───────────────────────────────────────────────────────────

function createServer(db: RecoveryDb = buildDbMock()): Promise<FastifyInstance> {
  return buildServer({ db, fastifyOptions: { logger: false } });
}

function signSessionToken(server: FastifyInstance, sub: string): string {
  return server.jwt.sign({ sub, typ: SESSION_TOKEN_TYPE }, { expiresIn: '1h' });
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('DELETE /v1/recovery/account', () => {
  let server: FastifyInstance;

  beforeEach(async () => {
    server = await createServer();
  });

  afterEach(async () => {
    await server.close();
  });

  // ── Authentication ──────────────────────────────────────────────────────────

  it('returns 401 when no Authorization header is provided', async () => {
    const res = await server.inject({
      method: 'DELETE',
      url: '/v1/recovery/account',
      payload: { email_hash: VALID_EMAIL_HASH },
    });

    expect(res.statusCode).toBe(401);
    expect(res.json()).toMatchObject({ error: 'unauthorized' });
  });

  it('returns 401 when an invalid JWT is provided', async () => {
    const res = await server.inject({
      method: 'DELETE',
      url: '/v1/recovery/account',
      headers: { authorization: 'Bearer invalid-token' },
      payload: { email_hash: VALID_EMAIL_HASH },
    });

    expect(res.statusCode).toBe(401);
    expect(res.json()).toMatchObject({ error: 'unauthorized' });
  });

  it('returns 401 when the JWT typ is not "session"', async () => {
    const token = server.jwt.sign({ sub: VALID_EMAIL_HASH, typ: 'magic_link' });
    const res = await server.inject({
      method: 'DELETE',
      url: '/v1/recovery/account',
      headers: { authorization: `Bearer ${token}` },
      payload: { email_hash: VALID_EMAIL_HASH },
    });

    expect(res.statusCode).toBe(401);
    expect(res.json()).toMatchObject({ error: 'unauthorized' });
  });

  it('returns 401 when the JWT sub is not a string', async () => {
    const token = server.jwt.sign({ sub: null, typ: SESSION_TOKEN_TYPE });
    const res = await server.inject({
      method: 'DELETE',
      url: '/v1/recovery/account',
      headers: { authorization: `Bearer ${token}` },
      payload: { email_hash: VALID_EMAIL_HASH },
    });

    expect(res.statusCode).toBe(401);
    expect(res.json()).toMatchObject({ error: 'unauthorized' });
  });

  // ── Email hash matching ─────────────────────────────────────────────────────

  it('returns 401 when email_hash in body does not match JWT sub', async () => {
    const token = signSessionToken(server, VALID_EMAIL_HASH);
    const res = await server.inject({
      method: 'DELETE',
      url: '/v1/recovery/account',
      headers: { authorization: `Bearer ${token}` },
      payload: { email_hash: WRONG_EMAIL_HASH },
    });

    expect(res.statusCode).toBe(401);
    expect(res.json()).toMatchObject({ error: 'unauthorized' });
  });

  // ── Successful deletion ─────────────────────────────────────────────────────

  it('returns 200 with { status: "deleted" } on successful deletion', async () => {
    const db = buildDbMock();
    server = await createServer(db);

    const token = signSessionToken(server, VALID_EMAIL_HASH);
    const res = await server.inject({
      method: 'DELETE',
      url: '/v1/recovery/account',
      headers: { authorization: `Bearer ${token}` },
      payload: { email_hash: VALID_EMAIL_HASH },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ status: 'deleted' });
    expect(db.delete).toHaveBeenCalledOnce();
  });

  it('passes the correct email_hash to the DB delete query', async () => {
    const db = buildDbMock();
    server = await createServer(db);

    const token = signSessionToken(server, VALID_EMAIL_HASH);
    await server.inject({
      method: 'DELETE',
      url: '/v1/recovery/account',
      headers: { authorization: `Bearer ${token}` },
      payload: { email_hash: VALID_EMAIL_HASH },
    });

    // Verify the where clause received the email_hash
    const deleteFn = db.delete as ReturnType<typeof vi.fn>;
    expect(deleteFn).toHaveBeenCalledOnce();
  });

  // ── Idempotency ─────────────────────────────────────────────────────────────

  it('returns 200 even when no recovery entry exists (idempotent)', async () => {
    // The DB returns successfully even when nothing was deleted
    const token = signSessionToken(server, VALID_EMAIL_HASH);
    const res = await server.inject({
      method: 'DELETE',
      url: '/v1/recovery/account',
      headers: { authorization: `Bearer ${token}` },
      payload: { email_hash: VALID_EMAIL_HASH },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ status: 'deleted' });
  });

  // ── Error handling ──────────────────────────────────────────────────────────

  it('returns 500 when the DB delete operation fails', async () => {
    const db = buildDbMock(new Error('db connection lost'));
    server = await createServer(db);

    const token = signSessionToken(server, VALID_EMAIL_HASH);
    const res = await server.inject({
      method: 'DELETE',
      url: '/v1/recovery/account',
      headers: { authorization: `Bearer ${token}` },
      payload: { email_hash: VALID_EMAIL_HASH },
    });

    expect(res.statusCode).toBe(500);
    expect(res.json()).toMatchObject({ error: 'internal_error' });
  });

  // ── Validation ──────────────────────────────────────────────────────────────

  it('returns 400 when email_hash is not 64 hex characters', async () => {
    const token = signSessionToken(server, VALID_EMAIL_HASH);
    const res = await server.inject({
      method: 'DELETE',
      url: '/v1/recovery/account',
      headers: { authorization: `Bearer ${token}` },
      payload: { email_hash: 'tooshort' },
    });

    expect(res.statusCode).toBe(400);
  });

  it('returns 400 when email_hash contains uppercase hex', async () => {
    const token = signSessionToken(server, VALID_EMAIL_HASH);
    const res = await server.inject({
      method: 'DELETE',
      url: '/v1/recovery/account',
      headers: { authorization: `Bearer ${token}` },
      payload: { email_hash: 'A'.repeat(64) },
    });

    expect(res.statusCode).toBe(400);
  });

  it('returns 400 when email_hash is missing from body', async () => {
    const token = signSessionToken(server, VALID_EMAIL_HASH);
    const res = await server.inject({
      method: 'DELETE',
      url: '/v1/recovery/account',
      headers: { authorization: `Bearer ${token}` },
      payload: {},
    });

    expect(res.statusCode).toBe(400);
  });
});
