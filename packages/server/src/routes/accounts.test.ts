import type { FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { AuthenticatedSession } from '../auth/session.js';
import type { Db } from '../users/user.repository.js';
import {
  buildDbStub,
  createServer,
  issueNonce,
  replayHeaders,
} from '../test/route-test-helpers.js';
import { ACCOUNTS_ROUTES } from './accounts.js';

const mockAuthenticateSession = vi.fn();
const mockCreateAccountWithOwnerKey = vi.fn();
const mockGetAccountKeyForUser = vi.fn();
const mockListAccountsForUser = vi.fn();
const mockRemoveAccountMemberAndUploadWrappedKeys = vi.fn();
const mockPushChangeRecords = vi.fn();
const mockPullChangeRecords = vi.fn();

vi.mock('../auth/session.js', () => ({
  authenticateSession: (...args: unknown[]) => mockAuthenticateSession(...args),
  installSessionRenewal: () => undefined,
}));

vi.mock('../accounts/account.service.js', () => ({
  createAccountWithOwnerKey: (...args: unknown[]) => mockCreateAccountWithOwnerKey(...args),
  getAccountKeyForUser: (...args: unknown[]) => mockGetAccountKeyForUser(...args),
  listAccountsForUser: (...args: unknown[]) => mockListAccountsForUser(...args),
  removeAccountMemberAndUploadWrappedKeys: (...args: unknown[]) => mockRemoveAccountMemberAndUploadWrappedKeys(...args),
}));

vi.mock('../accounts/change-record.service.js', () => ({
  pushChangeRecords: (...args: unknown[]) => mockPushChangeRecords(...args),
  pullChangeRecords: (...args: unknown[]) => mockPullChangeRecords(...args),
}));

vi.stubEnv('MAGIC_LINK_SECRET', 'test-secret-for-ci');

const USER_ID = '22222222-2222-4222-8222-222222222222';
const EMAIL_HASH = 'a'.repeat(64);
const ACCOUNT_ID = '11111111-1111-4111-8111-111111111111';
const MEMBER_TO_REMOVE_ID = '55555555-5555-5555-8555-555555555555';
const CHANGE_UUID_ONE = '33333333-3333-4333-8333-333333333333';
const CHANGE_UUID_TWO = '44444444-4444-4444-8444-444444444444';
const OPAQUE_WRAPPED_KEY = {
  v: 99,
  alg: 'future-envelope',
  ciphertext: 'opaque-to-server',
  nested: { still: 'accepted' },
};
const OPAQUE_ENCRYPTED_PAYLOAD = {
  v: 99,
  alg: 'future-symmetric-envelope',
  ciphertext: 'opaque-to-server',
  nested: { still: 'accepted' },
};

function authorizationHeader(server: FastifyInstance): Record<string, string> {
  return {
    authorization: `Bearer ${server.jwt.sign({ sub: EMAIL_HASH, typ: 'session' })}`,
  };
}

describe('accounts routes', () => {
  let server: FastifyInstance;
  let db: Db;
  const session: AuthenticatedSession = {
    userId: USER_ID,
    emailHash: EMAIL_HASH,
  };

  beforeEach(async () => {
    db = buildDbStub();
    mockAuthenticateSession.mockResolvedValue(session);
    mockCreateAccountWithOwnerKey.mockResolvedValue({
      id: ACCOUNT_ID,
      keyEpoch: 1,
    });
    mockGetAccountKeyForUser.mockResolvedValue({
      status: 'ok',
      accountId: ACCOUNT_ID,
      epoch: 1,
      wrappedKey: OPAQUE_WRAPPED_KEY,
    });
    mockListAccountsForUser.mockResolvedValue([
      {
        id: ACCOUNT_ID,
        keyEpoch: 1,
        role: 'owner',
        recordCount: 2,
        createdAt: new Date('2026-06-01T00:00:00.000Z'),
      },
    ]);
    mockPushChangeRecords.mockResolvedValue({
      status: 'ok',
      results: [
        { changeUuid: CHANGE_UUID_ONE, sequence: 1 },
        { changeUuid: CHANGE_UUID_TWO, sequence: 2 },
      ],
    });
    mockPullChangeRecords.mockResolvedValue({
      status: 'ok',
      records: [
        {
          changeUuid: CHANGE_UUID_ONE,
          sequence: 1,
          encryptedPayload: OPAQUE_ENCRYPTED_PAYLOAD,
        },
      ],
      nextSince: null,
    });
    mockRemoveAccountMemberAndUploadWrappedKeys.mockResolvedValue({
      status: 'ok',
      newEpoch: 2,
    });
    server = await createServer(db);
  });

  afterEach(async () => {
    await server.close();
    vi.clearAllMocks();
  });

  describe('GET /v1/accounts', () => {
    it('rejects missing or invalid session JWT', async () => {
      mockAuthenticateSession.mockResolvedValueOnce(null);

      const res = await server.inject({
        method: 'GET',
        url: ACCOUNTS_ROUTES.accounts,
      });

      expect(res.statusCode).toBe(401);
      expect(res.json()).toMatchObject({ error: 'unauthorized' });
      expect(mockListAccountsForUser).not.toHaveBeenCalled();
    });

    it('returns discoverable accounts for the authenticated user', async () => {
      const res = await server.inject({
        method: 'GET',
        url: ACCOUNTS_ROUTES.accounts,
        headers: authorizationHeader(server),
      });

      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({
        accounts: [
          {
            id: ACCOUNT_ID,
            key_epoch: 1,
            role: 'owner',
            record_count: 2,
            created_at: '2026-06-01T00:00:00.000Z',
          },
        ],
      });
      expect(mockListAccountsForUser).toHaveBeenCalledWith(db, { userId: USER_ID });
    });
  });

  describe('POST /v1/accounts', () => {
    it('rejects missing replay nonce before account creation', async () => {
      const res = await server.inject({
        method: 'POST',
        url: ACCOUNTS_ROUTES.accounts,
        headers: authorizationHeader(server),
        payload: {
          wrapped_key: OPAQUE_WRAPPED_KEY,
          epoch: 1,
        },
      });

      expect(res.statusCode).toBe(401);
      expect(mockAuthenticateSession).not.toHaveBeenCalled();
      expect(mockCreateAccountWithOwnerKey).not.toHaveBeenCalled();
    });

    it('rejects missing or invalid session JWT', async () => {
      mockAuthenticateSession.mockResolvedValueOnce(null);
      const nonce = await issueNonce(server);

      const res = await server.inject({
        method: 'POST',
        url: ACCOUNTS_ROUTES.accounts,
        headers: {
          ...replayHeaders(nonce),
          authorization: 'Bearer invalid',
        },
        payload: {
          wrapped_key: OPAQUE_WRAPPED_KEY,
          epoch: 1,
        },
      });

      expect(res.statusCode).toBe(401);
      expect(res.json()).toMatchObject({ error: 'unauthorized' });
      expect(mockCreateAccountWithOwnerKey).not.toHaveBeenCalled();
    });

    it('creates an account and owner key using the authenticated user', async () => {
      const nonce = await issueNonce(server);

      const res = await server.inject({
        method: 'POST',
        url: ACCOUNTS_ROUTES.accounts,
        headers: {
          ...replayHeaders(nonce),
          ...authorizationHeader(server),
        },
        payload: {
          wrapped_key: OPAQUE_WRAPPED_KEY,
          epoch: 1,
        },
      });

      expect(res.statusCode).toBe(201);
      expect(res.json()).toEqual({
        id: ACCOUNT_ID,
        key_epoch: 1,
      });
      expect(mockCreateAccountWithOwnerKey).toHaveBeenCalledWith(db, {
        userId: USER_ID,
        wrappedKey: OPAQUE_WRAPPED_KEY,
        epoch: 1,
      });
    });

    it('does not inspect wrapped_key envelope internals', async () => {
      const nonce = await issueNonce(server);

      await server.inject({
        method: 'POST',
        url: ACCOUNTS_ROUTES.accounts,
        headers: {
          ...replayHeaders(nonce),
          ...authorizationHeader(server),
        },
        payload: {
          wrapped_key: OPAQUE_WRAPPED_KEY,
          epoch: 1,
        },
      });

      expect(mockCreateAccountWithOwnerKey.mock.calls[0][1].wrappedKey).toEqual(
        OPAQUE_WRAPPED_KEY,
      );
    });
  });

  describe('GET /v1/accounts/:id/keys', () => {
    it('rejects missing or invalid session JWT', async () => {
      mockAuthenticateSession.mockResolvedValueOnce(null);

      const res = await server.inject({
        method: 'GET',
        url: `/v1/accounts/${ACCOUNT_ID}/keys`,
      });

      expect(res.statusCode).toBe(401);
      expect(mockGetAccountKeyForUser).not.toHaveBeenCalled();
    });

    it('returns the authenticated user non-revoked wrapped key', async () => {
      const res = await server.inject({
        method: 'GET',
        url: `/v1/accounts/${ACCOUNT_ID}/keys?epoch=1`,
        headers: authorizationHeader(server),
      });

      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({
        account_id: ACCOUNT_ID,
        epoch: 1,
        wrapped_key: OPAQUE_WRAPPED_KEY,
      });
      expect(mockGetAccountKeyForUser).toHaveBeenCalledWith(db, {
        accountId: ACCOUNT_ID,
        userId: USER_ID,
        epoch: 1,
      });
    });

    it('returns 404 when the account does not exist', async () => {
      mockGetAccountKeyForUser.mockResolvedValueOnce({ status: 'account_not_found' });

      const res = await server.inject({
        method: 'GET',
        url: `/v1/accounts/${ACCOUNT_ID}/keys`,
        headers: authorizationHeader(server),
      });

      expect(res.statusCode).toBe(404);
      expect(res.json()).toMatchObject({ error: 'account_not_found' });
    });

    it('returns 403 when the caller has no non-revoked key row', async () => {
      mockGetAccountKeyForUser.mockResolvedValueOnce({ status: 'forbidden' });

      const res = await server.inject({
        method: 'GET',
        url: `/v1/accounts/${ACCOUNT_ID}/keys`,
        headers: authorizationHeader(server),
      });

      expect(res.statusCode).toBe(403);
      expect(res.json()).toMatchObject({ error: 'forbidden' });
    });
  });

  describe('POST /v1/accounts/:id/members/:userId/keys/batch', () => {
    it('rejects missing or invalid session JWT', async () => {
      mockAuthenticateSession.mockResolvedValueOnce(null);
      const nonce = await issueNonce(server);

      const res = await server.inject({
        method: 'POST',
        url: `/v1/accounts/${ACCOUNT_ID}/members/${MEMBER_TO_REMOVE_ID}/keys/batch`,
        headers: {
          ...replayHeaders(nonce),
          authorization: 'Bearer invalid',
        },
        payload: {
          wrapped_keys: [
            { user_id: USER_ID, wrapped_key: OPAQUE_WRAPPED_KEY },
          ],
        },
      });

      expect(res.statusCode).toBe(401);
      expect(res.json()).toMatchObject({ error: 'unauthorized' });
      expect(mockRemoveAccountMemberAndUploadWrappedKeys).not.toHaveBeenCalled();
    });

    it('removes the member and uploads wrapped keys in a single transactional request', async () => {
      const nonce = await issueNonce(server);

      const res = await server.inject({
        method: 'POST',
        url: `/v1/accounts/${ACCOUNT_ID}/members/${MEMBER_TO_REMOVE_ID}/keys/batch`,
        headers: {
          ...replayHeaders(nonce),
          ...authorizationHeader(server),
        },
        payload: {
          wrapped_keys: [
            { user_id: USER_ID, wrapped_key: OPAQUE_WRAPPED_KEY },
            { user_id: MEMBER_TO_REMOVE_ID, wrapped_key: OPAQUE_WRAPPED_KEY },
          ],
        },
      });

      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({ new_epoch: 2 });
      expect(mockRemoveAccountMemberAndUploadWrappedKeys).toHaveBeenCalledWith(db, {
        accountId: ACCOUNT_ID,
        requestorUserId: USER_ID,
        userIdToRemove: MEMBER_TO_REMOVE_ID,
        wrappedKeys: [
          { userId: USER_ID, wrappedKey: OPAQUE_WRAPPED_KEY },
          { userId: MEMBER_TO_REMOVE_ID, wrappedKey: OPAQUE_WRAPPED_KEY },
        ],
      });
    });

    it('maps non_member to 409 conflict', async () => {
      mockRemoveAccountMemberAndUploadWrappedKeys.mockResolvedValueOnce({
        status: 'non_member',
        userId: MEMBER_TO_REMOVE_ID,
      });
      const nonce = await issueNonce(server);

      const res = await server.inject({
        method: 'POST',
        url: `/v1/accounts/${ACCOUNT_ID}/members/${MEMBER_TO_REMOVE_ID}/keys/batch`,
        headers: {
          ...replayHeaders(nonce),
          ...authorizationHeader(server),
        },
        payload: {
          wrapped_keys: [
            { user_id: USER_ID, wrapped_key: OPAQUE_WRAPPED_KEY },
          ],
        },
      });

      expect(res.statusCode).toBe(409);
      expect(res.json()).toMatchObject({ error: 'non_member' });
    });
  });

  describe('POST /v1/accounts/:id/records', () => {
    it('rejects missing replay nonce before pushing records', async () => {
      const res = await server.inject({
        method: 'POST',
        url: `/v1/accounts/${ACCOUNT_ID}/records`,
        headers: authorizationHeader(server),
        payload: {
          records: [{
            change_uuid: CHANGE_UUID_ONE,
            encrypted_payload: OPAQUE_ENCRYPTED_PAYLOAD,
          }],
        },
      });

      expect(res.statusCode).toBe(401);
      expect(mockAuthenticateSession).not.toHaveBeenCalled();
      expect(mockPushChangeRecords).not.toHaveBeenCalled();
    });

    it('rejects missing or invalid session JWT', async () => {
      mockAuthenticateSession.mockResolvedValueOnce(null);
      const nonce = await issueNonce(server);

      const res = await server.inject({
        method: 'POST',
        url: `/v1/accounts/${ACCOUNT_ID}/records`,
        headers: {
          ...replayHeaders(nonce),
          authorization: 'Bearer invalid',
        },
        payload: {
          records: [{
            change_uuid: CHANGE_UUID_ONE,
            encrypted_payload: OPAQUE_ENCRYPTED_PAYLOAD,
          }],
        },
      });

      expect(res.statusCode).toBe(401);
      expect(res.json()).toMatchObject({ error: 'unauthorized' });
      expect(mockPushChangeRecords).not.toHaveBeenCalled();
    });

    it('pushes opaque encrypted records using the authenticated user', async () => {
      const nonce = await issueNonce(server);

      const res = await server.inject({
        method: 'POST',
        url: `/v1/accounts/${ACCOUNT_ID}/records`,
        headers: {
          ...replayHeaders(nonce),
          ...authorizationHeader(server),
        },
        payload: {
          records: [
            {
              change_uuid: CHANGE_UUID_ONE,
              encrypted_payload: OPAQUE_ENCRYPTED_PAYLOAD,
            },
            {
              change_uuid: CHANGE_UUID_TWO,
              encrypted_payload: OPAQUE_ENCRYPTED_PAYLOAD,
            },
          ],
        },
      });

      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({
        results: [
          { change_uuid: CHANGE_UUID_ONE, sequence: 1 },
          { change_uuid: CHANGE_UUID_TWO, sequence: 2 },
        ],
      });
      expect(mockPushChangeRecords).toHaveBeenCalledWith(db, {
        accountId: ACCOUNT_ID,
        userId: USER_ID,
        records: [
          {
            changeUuid: CHANGE_UUID_ONE,
            encryptedPayload: OPAQUE_ENCRYPTED_PAYLOAD,
          },
          {
            changeUuid: CHANGE_UUID_TWO,
            encryptedPayload: OPAQUE_ENCRYPTED_PAYLOAD,
          },
        ],
      });
    });

    it('does not inspect encrypted_payload envelope internals', async () => {
      const nonce = await issueNonce(server);

      await server.inject({
        method: 'POST',
        url: `/v1/accounts/${ACCOUNT_ID}/records`,
        headers: {
          ...replayHeaders(nonce),
          ...authorizationHeader(server),
        },
        payload: {
          records: [{
            change_uuid: CHANGE_UUID_ONE,
            encrypted_payload: OPAQUE_ENCRYPTED_PAYLOAD,
          }],
        },
      });

      expect(mockPushChangeRecords.mock.calls[0][1].records[0].encryptedPayload).toEqual(
        OPAQUE_ENCRYPTED_PAYLOAD,
      );
    });

    it('maps record push account_not_found to 404', async () => {
      mockPushChangeRecords.mockResolvedValueOnce({ status: 'account_not_found' });
      const nonce = await issueNonce(server);

      const res = await server.inject({
        method: 'POST',
        url: `/v1/accounts/${ACCOUNT_ID}/records`,
        headers: {
          ...replayHeaders(nonce),
          ...authorizationHeader(server),
        },
        payload: {
          records: [{
            change_uuid: CHANGE_UUID_ONE,
            encrypted_payload: OPAQUE_ENCRYPTED_PAYLOAD,
          }],
        },
      });

      expect(res.statusCode).toBe(404);
      expect(res.json()).toMatchObject({ error: 'account_not_found' });
    });

    it('maps record push forbidden to 403', async () => {
      mockPushChangeRecords.mockResolvedValueOnce({ status: 'forbidden' });
      const nonce = await issueNonce(server);

      const res = await server.inject({
        method: 'POST',
        url: `/v1/accounts/${ACCOUNT_ID}/records`,
        headers: {
          ...replayHeaders(nonce),
          ...authorizationHeader(server),
        },
        payload: {
          records: [{
            change_uuid: CHANGE_UUID_ONE,
            encrypted_payload: OPAQUE_ENCRYPTED_PAYLOAD,
          }],
        },
      });

      expect(res.statusCode).toBe(403);
      expect(res.json()).toMatchObject({ error: 'account_key_not_found' });
    });

    it('maps cross-account change UUID conflict to 409', async () => {
      mockPushChangeRecords.mockResolvedValueOnce({ status: 'change_uuid_conflict' });
      const nonce = await issueNonce(server);

      const res = await server.inject({
        method: 'POST',
        url: `/v1/accounts/${ACCOUNT_ID}/records`,
        headers: {
          ...replayHeaders(nonce),
          ...authorizationHeader(server),
        },
        payload: {
          records: [{
            change_uuid: CHANGE_UUID_ONE,
            encrypted_payload: OPAQUE_ENCRYPTED_PAYLOAD,
          }],
        },
      });

      expect(res.statusCode).toBe(409);
      expect(res.json()).toMatchObject({ error: 'change_uuid_conflict' });
    });
  });

  describe('GET /v1/accounts/:id/records', () => {
    it('rejects missing or invalid session JWT', async () => {
      mockAuthenticateSession.mockResolvedValueOnce(null);

      const res = await server.inject({
        method: 'GET',
        url: `/v1/accounts/${ACCOUNT_ID}/records`,
      });

      expect(res.statusCode).toBe(401);
      expect(mockPullChangeRecords).not.toHaveBeenCalled();
    });

    it('pulls opaque encrypted records with a default since cursor', async () => {
      const res = await server.inject({
        method: 'GET',
        url: `/v1/accounts/${ACCOUNT_ID}/records`,
        headers: authorizationHeader(server),
      });

      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({
        records: [{
          change_uuid: CHANGE_UUID_ONE,
          sequence: 1,
          encrypted_payload: OPAQUE_ENCRYPTED_PAYLOAD,
        }],
        next_since: null,
      });
      expect(mockPullChangeRecords).toHaveBeenCalledWith(db, {
        accountId: ACCOUNT_ID,
        userId: USER_ID,
        since: 0,
      });
    });

    it('passes the supplied since cursor to the service', async () => {
      await server.inject({
        method: 'GET',
        url: `/v1/accounts/${ACCOUNT_ID}/records?since=2`,
        headers: authorizationHeader(server),
      });

      expect(mockPullChangeRecords).toHaveBeenCalledWith(db, {
        accountId: ACCOUNT_ID,
        userId: USER_ID,
        since: 2,
      });
    });

    it('maps record pull account_not_found to 404', async () => {
      mockPullChangeRecords.mockResolvedValueOnce({ status: 'account_not_found' });

      const res = await server.inject({
        method: 'GET',
        url: `/v1/accounts/${ACCOUNT_ID}/records`,
        headers: authorizationHeader(server),
      });

      expect(res.statusCode).toBe(404);
      expect(res.json()).toMatchObject({ error: 'account_not_found' });
    });

    it('maps record pull forbidden to 403', async () => {
      mockPullChangeRecords.mockResolvedValueOnce({ status: 'forbidden' });

      const res = await server.inject({
        method: 'GET',
        url: `/v1/accounts/${ACCOUNT_ID}/records`,
        headers: authorizationHeader(server),
      });

      expect(res.statusCode).toBe(403);
      expect(res.json()).toMatchObject({ error: 'account_key_not_found' });
    });
  });
});
