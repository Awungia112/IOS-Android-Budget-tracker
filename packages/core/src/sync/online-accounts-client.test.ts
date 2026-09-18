import { describe, expect, it, vi } from 'vitest';

import type { AsymmetricEnvelope } from '../crypto/index.js';
import { createOnlineAccountsClient, OnlineAccountsError } from './online-accounts-client.js';

const ACCOUNT_ID = '11111111-1111-4111-8111-111111111111';
const WRAPPED_KEY: AsymmetricEnvelope = {
  v: 1,
  alg: 'x25519-xsalsa20-poly1305',
  ciphertext: 'opaque-client-ciphertext',
};

function jsonResponse(
  body: unknown,
  status = 200,
  headers?: Record<string, string>,
): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: vi.fn(async () => JSON.stringify(body)),
    headers: new Headers(headers),
  } as unknown as Response;
}

describe('createOnlineAccountsClient', () => {
  it('lists discoverable accounts with bearer auth and maps response fields', async () => {
    const fetchFn = vi.fn<typeof fetch>().mockResolvedValueOnce(jsonResponse({
      accounts: [
        {
          id: ACCOUNT_ID,
          key_epoch: 2,
          role: 'member',
          record_count: 50,
          created_at: '2026-06-01T00:00:00.000Z',
        },
      ],
    }));
    const client = createOnlineAccountsClient({
      baseUrl: 'https://api.example.test/',
      sessionToken: 'session-token',
      fetchFn,
    });

    await expect(client.listAccounts()).resolves.toEqual({
      accounts: [
        {
          id: ACCOUNT_ID,
          keyEpoch: 2,
          role: 'member',
          recordCount: 50,
          createdAt: '2026-06-01T00:00:00.000Z',
        },
      ],
    });

    expect(fetchFn).toHaveBeenCalledWith('https://api.example.test/v1/accounts', {
      headers: {
        authorization: 'Bearer session-token',
      },
    });
  });

  it('creates an account using a fresh nonce and maps snake_case response fields', async () => {
    const fetchFn = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse({
        nonce: 'nonce-123',
        expires_at: '2026-06-01T00:00:00.000Z',
      }))
      .mockResolvedValueOnce(jsonResponse({
        id: ACCOUNT_ID,
        key_epoch: 1,
      }));
    const client = createOnlineAccountsClient({
      baseUrl: 'https://api.example.test/',
      sessionToken: 'session-token',
      fetchFn,
      now: () => 123_456,
    });

    await expect(
      client.createAccount({
        wrappedKey: WRAPPED_KEY,
        epoch: 1,
      }),
    ).resolves.toEqual({
      id: ACCOUNT_ID,
      keyEpoch: 1,
    });

    expect(fetchFn).toHaveBeenNthCalledWith(1, 'https://api.example.test/v1/nonce');
    expect(fetchFn).toHaveBeenNthCalledWith(2, 'https://api.example.test/v1/accounts', {
      method: 'POST',
      headers: {
        authorization: 'Bearer session-token',
        'content-type': 'application/json',
        'x-nonce': 'nonce-123',
        'x-timestamp': '123456',
      },
      body: JSON.stringify({
        wrapped_key: WRAPPED_KEY,
        epoch: 1,
      }),
    });
  });

  it('fetches the caller account key with bearer auth and maps response fields', async () => {
    const fetchFn = vi.fn<typeof fetch>().mockResolvedValueOnce(jsonResponse({
      account_id: ACCOUNT_ID,
      epoch: 2,
      wrapped_key: WRAPPED_KEY,
    }));
    const client = createOnlineAccountsClient({
      baseUrl: 'https://api.example.test',
      sessionToken: 'session-token',
      fetchFn,
    });

    await expect(
      client.getAccountKey({
        accountId: ACCOUNT_ID,
        epoch: 2,
      }),
    ).resolves.toEqual({
      accountId: ACCOUNT_ID,
      epoch: 2,
      wrappedKey: WRAPPED_KEY,
    });

    expect(fetchFn).toHaveBeenCalledWith(
      `https://api.example.test/v1/accounts/${ACCOUNT_ID}/keys?epoch=2`,
      {
        headers: {
          authorization: 'Bearer session-token',
        },
      },
    );
  });

  it('throws on non-2xx responses', async () => {
    const fetchFn = vi.fn<typeof fetch>().mockResolvedValueOnce(jsonResponse({
      error: 'unauthorized',
    }, 401));
    const client = createOnlineAccountsClient({
      baseUrl: 'https://api.example.test',
      sessionToken: 'session-token',
      fetchFn,
    });

    await expect(
      client.getAccountKey({
        accountId: ACCOUNT_ID,
      }),
    ).rejects.toThrow('Online accounts request failed with HTTP 401');
  });

  // Regression coverage for a prod bug: these DELETE calls carry no real
  // payload, but omitting 'content-type' entirely made some proxies send the
  // request as neither empty-bodied nor a recognised media type, which made
  // Fastify reject it with 415 Unsupported Media Type. Every bodyless
  // DELETE must explicitly declare 'content-type': 'application/json' with
  // body '{}' so the request is unambiguously empty-but-typed.
  describe('bodyless DELETE calls send an explicit application/json body', () => {
    it('removeAccountMember', async () => {
      const fetchFn = vi.fn<typeof fetch>()
        .mockResolvedValueOnce(jsonResponse({ nonce: 'nonce-123', expires_at: '2026-06-01T00:00:00.000Z' }))
        .mockResolvedValueOnce(jsonResponse({ new_epoch: 3 }));
      const client = createOnlineAccountsClient({
        baseUrl: 'https://api.example.test',
        sessionToken: 'session-token',
        fetchFn,
        now: () => 123_456,
      });

      await expect(
        client.removeAccountMember({ accountId: ACCOUNT_ID, userIdToRemove: 'user-1' }),
      ).resolves.toEqual({ newEpoch: 3 });

      expect(fetchFn).toHaveBeenNthCalledWith(
        2,
        `https://api.example.test/v1/accounts/${ACCOUNT_ID}/members/user-1`,
        {
          method: 'DELETE',
          headers: {
            authorization: 'Bearer session-token',
            'content-type': 'application/json',
            'x-nonce': 'nonce-123',
            'x-timestamp': '123456',
          },
          body: '{}',
        },
      );
    });

    it('cancelInvite', async () => {
      const fetchFn = vi.fn<typeof fetch>()
        .mockResolvedValueOnce(jsonResponse({ nonce: 'nonce-123', expires_at: '2026-06-01T00:00:00.000Z' }))
        .mockResolvedValueOnce(jsonResponse({ status: 'ok' }));
      const client = createOnlineAccountsClient({
        baseUrl: 'https://api.example.test',
        sessionToken: 'session-token',
        fetchFn,
        now: () => 123_456,
      });

      await expect(client.cancelInvite(ACCOUNT_ID, 'invite-1')).resolves.toEqual({ status: 'ok' });

      expect(fetchFn).toHaveBeenNthCalledWith(
        2,
        `https://api.example.test/v1/accounts/${ACCOUNT_ID}/invites/invite-1`,
        {
          method: 'DELETE',
          headers: {
            authorization: 'Bearer session-token',
            'content-type': 'application/json',
            'x-nonce': 'nonce-123',
            'x-timestamp': '123456',
          },
          body: '{}',
        },
      );
    });

    it('removeMember', async () => {
      const fetchFn = vi.fn<typeof fetch>()
        .mockResolvedValueOnce(jsonResponse({ nonce: 'nonce-123', expires_at: '2026-06-01T00:00:00.000Z' }))
        .mockResolvedValueOnce(jsonResponse({ status: 'ok' }));
      const client = createOnlineAccountsClient({
        baseUrl: 'https://api.example.test',
        sessionToken: 'session-token',
        fetchFn,
        now: () => 123_456,
      });

      await expect(client.removeMember(ACCOUNT_ID, 'user-1')).resolves.toEqual({ status: 'ok' });

      expect(fetchFn).toHaveBeenNthCalledWith(
        2,
        `https://api.example.test/v1/accounts/${ACCOUNT_ID}/members/user-1`,
        {
          method: 'DELETE',
          headers: {
            authorization: 'Bearer session-token',
            'content-type': 'application/json',
            'x-nonce': 'nonce-123',
            'x-timestamp': '123456',
          },
          body: '{}',
        },
      );
    });

    it('deleteAccount', async () => {
      const fetchFn = vi.fn<typeof fetch>()
        .mockResolvedValueOnce(jsonResponse({ nonce: 'nonce-123', expires_at: '2026-06-01T00:00:00.000Z' }))
        .mockResolvedValueOnce(jsonResponse({ status: 'deleted' }));
      const client = createOnlineAccountsClient({
        baseUrl: 'https://api.example.test',
        sessionToken: 'session-token',
        fetchFn,
        now: () => 123_456,
      });

      await expect(client.deleteAccount()).resolves.toEqual({ status: 'deleted' });

      expect(fetchFn).toHaveBeenNthCalledWith(2, 'https://api.example.test/v1/users/me', {
        method: 'DELETE',
        headers: {
          authorization: 'Bearer session-token',
          'content-type': 'application/json',
          'x-nonce': 'nonce-123',
          'x-timestamp': '123456',
        },
        body: '{}',
      });
    });
  });

  describe('session-token renewal', () => {
    it('surfaces a renewed token from the response header via onTokenRenewed', async () => {
      const fetchFn = vi.fn<typeof fetch>().mockResolvedValueOnce(jsonResponse(
        { accounts: [] },
        200,
        { 'x-auth-token': 'renewed-session-token' },
      ));
      const onTokenRenewed = vi.fn();
      const client = createOnlineAccountsClient({
        baseUrl: 'https://api.example.test',
        sessionToken: 'session-token',
        fetchFn,
        onTokenRenewed,
      });

      await client.listAccounts();

      expect(onTokenRenewed).toHaveBeenCalledWith('renewed-session-token');
    });

    it('does not invoke onTokenRenewed when no renewal header is present', async () => {
      const fetchFn = vi.fn<typeof fetch>().mockResolvedValueOnce(jsonResponse({ accounts: [] }));
      const onTokenRenewed = vi.fn();
      const client = createOnlineAccountsClient({
        baseUrl: 'https://api.example.test',
        sessionToken: 'session-token',
        fetchFn,
        onTokenRenewed,
      });

      await client.listAccounts();

      expect(onTokenRenewed).not.toHaveBeenCalled();
    });

    it('does not invoke onTokenRenewed on an error (e.g. expired token → 401)', async () => {
      const fetchFn = vi.fn<typeof fetch>().mockResolvedValueOnce(jsonResponse(
        { error: 'session_expired' },
        401,
        { 'x-auth-token': 'should-not-be-trusted' },
      ));
      const onTokenRenewed = vi.fn();
      const client = createOnlineAccountsClient({
        baseUrl: 'https://api.example.test',
        sessionToken: 'session-token',
        fetchFn,
        onTokenRenewed,
      });

      await expect(client.listAccounts()).rejects.toBeInstanceOf(OnlineAccountsError);
      expect(onTokenRenewed).not.toHaveBeenCalled();
    });
  });
});
