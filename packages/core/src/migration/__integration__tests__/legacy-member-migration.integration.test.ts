/**
 * @vitest-environment node
 *
 * Integration tests for LegacyMemberMigrationService.
 *
 * Wires the real LegacyMemberMigrationService + real OnlineAccountsClient
 * against a mock fetch that simulates the server endpoints.
 * Crypto functions (wrapAccountKey, hashEmail, fromBase64url) are mocked
 * to avoid WASM/sodium dependencies.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { LegacyMemberMigrationService } from '../legacy-member-migration';

// Mock crypto functions used by the migration service
vi.mock('../../crypto/account-key', () => ({
  wrapAccountKey: vi.fn().mockResolvedValue({
    v: 1,
    alg: 'x25519-xsalsa20-poly1305',
    ciphertext: 'mocked-ciphertext',
  }),
}));

vi.mock('../../crypto/hashing', () => ({
  hashEmail: vi.fn().mockResolvedValue('a'.repeat(64)),
}));

vi.mock('../../crypto/envelope', () => ({
  fromBase64url: vi.fn().mockResolvedValue(new Uint8Array(32).fill(1)),
}));

// ─── Constants ──────────────────────────────────────────────────────────────

const BASE_URL = 'https://server.example.com';
const SESSION_TOKEN = 'test-session-token';
const SERVER_ACCOUNT_ID = '22222222-2222-4222-8222-222222222222';
const OWNER_USER_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const MEMBER_USER_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const OWNER_EMAIL = 'owner@example.com';
const MEMBER_EMAIL = 'member@example.com';
const UNREGISTERED_EMAIL = 'unregistered@example.com';
const ACCOUNT_KEY = new Uint8Array(32).fill(42);
const EPOCH = 1;
const EMAIL_HASH_PEPPER = 'test-pepper';
const SENDER_NAME = 'Test Sender';
const ACCOUNT_NAME = 'Shared Budget';

// ─── Mock fetch factory ─────────────────────────────────────────────────────

type RouteHandler = (url: URL, init?: RequestInit) => { body: unknown; status?: number };

function createMockFetch(routes: Record<string, RouteHandler>) {
  const calls: Array<{ url: string; method: string; body?: unknown }> = [];

  const mockFetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const urlStr = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
    const url = new URL(urlStr);
    const method = (init?.method ?? 'GET').toUpperCase();
    const routeKey = `${method} ${url.pathname}`;

    let reqBody: unknown;
    if (init?.body && typeof init.body === 'string') {
      try { reqBody = JSON.parse(init.body); } catch { reqBody = init.body; }
    }
    calls.push({ url: urlStr, method, body: reqBody });

    const handler = routes[routeKey];
    if (!handler) {
      throw new Error(`No mock handler for ${routeKey}`);
    }

    const result = handler(url, init);
    const status = result.status ?? 200;
    const bodyStr = JSON.stringify(result.body);
    return {
      ok: status < 300,
      status,
      json: async () => result.body,
      text: async () => bodyStr,
    } as unknown as Response;
  });

  return { fetch: mockFetch as unknown as typeof fetch, calls };
}

// ─── Shared route handlers ──────────────────────────────────────────────────

const OWNER_SHARING_RESPONSE = {
  currentUserId: OWNER_USER_ID,
  members: [{ userId: OWNER_USER_ID, displayEmail: OWNER_EMAIL, role: 'owner', joinedAt: '2024-01-01' }],
  pendingInvites: [],
};

const OWNER_MEMBERS_RESPONSE = {
  members: [{ user_id: OWNER_USER_ID, role: 'owner', joined_at: '2024-01-01', public_key: 'owner-pub-key' }],
};

function sharingRoutes(overrides: Record<string, RouteHandler> = {}) {
  return {
    [`GET /v1/accounts/${SERVER_ACCOUNT_ID}/sharing`]: () => ({ body: OWNER_SHARING_RESPONSE }),
    [`GET /v1/accounts/${SERVER_ACCOUNT_ID}/members`]: () => ({ body: OWNER_MEMBERS_RESPONSE }),
    ...overrides,
  };
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('LegacyMemberMigrationService — Integration', () => {
  let service: LegacyMemberMigrationService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new LegacyMemberMigrationService(EMAIL_HASH_PEPPER);
  });

  it('owner-only: does nothing', async () => {
    const { fetch: mockFetch, calls } = createMockFetch(sharingRoutes());

    const { createOnlineAccountsClient } = await import('../../sync/online-accounts-client');
    const client = createOnlineAccountsClient({ baseUrl: BASE_URL, sessionToken: SESSION_TOKEN, fetchFn: mockFetch });

    const result = await service.migrateMembers({
      serverAccountId: SERVER_ACCOUNT_ID,
      accountKey: ACCOUNT_KEY,
      epoch: EPOCH,
      client,
      ownerEmail: OWNER_EMAIL,
      memberEmails: [OWNER_EMAIL],
      emailHashPepper: EMAIL_HASH_PEPPER,
      senderName: SENDER_NAME,
      accountName: ACCOUNT_NAME,
    });

    expect(result.deliveredKeys).toBe(0);
    expect(result.sentInvites).toBe(0);
    expect(result.skipped).toBe(0);
    expect(result.errors).toHaveLength(0);

    const postCalls = calls.filter(c => c.method === 'POST');
    expect(postCalls).toHaveLength(0);
  });

  it('shared with registered members: delivers wrapped keys', async () => {
    const { fetch: mockFetch, calls } = createMockFetch(sharingRoutes({
      [`GET /v1/accounts/${SERVER_ACCOUNT_ID}/sharing`]: () => ({
        body: {
          currentUserId: OWNER_USER_ID,
          members: [
            { userId: OWNER_USER_ID, displayEmail: OWNER_EMAIL, role: 'owner', joinedAt: '2024-01-01' },
            { userId: MEMBER_USER_ID, displayEmail: MEMBER_EMAIL, role: 'member', joinedAt: '2024-02-01' },
          ],
          pendingInvites: [],
        },
      }),
      [`GET /v1/accounts/${SERVER_ACCOUNT_ID}/members`]: () => ({
        body: {
          members: [
            { user_id: OWNER_USER_ID, role: 'owner', joined_at: '2024-01-01', public_key: 'owner-pub-key' },
            { user_id: MEMBER_USER_ID, role: 'member', joined_at: '2024-02-01', public_key: 'member-pub-key-aaa' },
          ],
        },
      }),
      'GET /v1/nonce': () => ({ body: { nonce: 'test-nonce' } }),
      [`POST /v1/accounts/${SERVER_ACCOUNT_ID}/keys`]: () => ({ body: { status: 'ok' } }),
    }));

    const { createOnlineAccountsClient } = await import('../../sync/online-accounts-client');
    const client = createOnlineAccountsClient({ baseUrl: BASE_URL, sessionToken: SESSION_TOKEN, fetchFn: mockFetch });

    const result = await service.migrateMembers({
      serverAccountId: SERVER_ACCOUNT_ID,
      accountKey: ACCOUNT_KEY,
      epoch: EPOCH,
      client,
      ownerEmail: OWNER_EMAIL,
      memberEmails: [OWNER_EMAIL, MEMBER_EMAIL],
      emailHashPepper: EMAIL_HASH_PEPPER,
      senderName: SENDER_NAME,
      accountName: ACCOUNT_NAME,
    });

    expect(result.deliveredKeys).toBe(1);
    expect(result.sentInvites).toBe(0);
    expect(result.skipped).toBe(0);
    expect(result.errors).toHaveLength(0);

    const keyDeliveryCalls = calls.filter(c =>
      c.method === 'POST' && c.url.includes('/keys'),
    );
    expect(keyDeliveryCalls).toHaveLength(1);
    expect(keyDeliveryCalls[0].body).toMatchObject({
      user_id: MEMBER_USER_ID,
      epoch: EPOCH,
      wrapped_key: expect.objectContaining({ v: 1, alg: 'x25519-xsalsa20-poly1305' }),
    });
  });

  it('shared with unregistered members: sends invites', async () => {
    const { fetch: mockFetch, calls } = createMockFetch(sharingRoutes({
      'GET /v1/nonce': () => ({ body: { nonce: 'test-nonce' } }),
      [`POST /v1/accounts/${SERVER_ACCOUNT_ID}/invites`]: () => ({ body: { status: 'invited' } }),
    }));

    const { createOnlineAccountsClient } = await import('../../sync/online-accounts-client');
    const client = createOnlineAccountsClient({ baseUrl: BASE_URL, sessionToken: SESSION_TOKEN, fetchFn: mockFetch });

    const result = await service.migrateMembers({
      serverAccountId: SERVER_ACCOUNT_ID,
      accountKey: ACCOUNT_KEY,
      epoch: EPOCH,
      client,
      ownerEmail: OWNER_EMAIL,
      memberEmails: [OWNER_EMAIL, UNREGISTERED_EMAIL],
      emailHashPepper: EMAIL_HASH_PEPPER,
      senderName: SENDER_NAME,
      accountName: ACCOUNT_NAME,
    });

    expect(result.deliveredKeys).toBe(0);
    expect(result.sentInvites).toBe(1);
    expect(result.skipped).toBe(0);
    expect(result.errors).toHaveLength(0);

    const inviteCalls = calls.filter(c =>
      c.method === 'POST' && c.url.includes('/invites'),
    );
    expect(inviteCalls).toHaveLength(1);
    expect(inviteCalls[0].body).toMatchObject({
      recipient_email: UNREGISTERED_EMAIL,
      sender_name: SENDER_NAME,
      account_name: ACCOUNT_NAME,
    });
    expect((inviteCalls[0].body as any).recipient_email_hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('mixed scenario: delivers keys + sends invites', async () => {
    const { fetch: mockFetch, calls } = createMockFetch(sharingRoutes({
      [`GET /v1/accounts/${SERVER_ACCOUNT_ID}/sharing`]: () => ({
        body: {
          currentUserId: OWNER_USER_ID,
          members: [
            { userId: OWNER_USER_ID, displayEmail: OWNER_EMAIL, role: 'owner', joinedAt: '2024-01-01' },
            { userId: MEMBER_USER_ID, displayEmail: MEMBER_EMAIL, role: 'member', joinedAt: '2024-02-01' },
          ],
          pendingInvites: [],
        },
      }),
      [`GET /v1/accounts/${SERVER_ACCOUNT_ID}/members`]: () => ({
        body: {
          members: [
            { user_id: OWNER_USER_ID, role: 'owner', joined_at: '2024-01-01', public_key: 'owner-pub-key' },
            { user_id: MEMBER_USER_ID, role: 'member', joined_at: '2024-02-01', public_key: 'member-pub-key-bbb' },
          ],
        },
      }),
      'GET /v1/nonce': () => ({ body: { nonce: 'test-nonce' } }),
      [`POST /v1/accounts/${SERVER_ACCOUNT_ID}/keys`]: () => ({ body: { status: 'ok' } }),
      [`POST /v1/accounts/${SERVER_ACCOUNT_ID}/invites`]: () => ({ body: { status: 'invited' } }),
    }));

    const { createOnlineAccountsClient } = await import('../../sync/online-accounts-client');
    const client = createOnlineAccountsClient({ baseUrl: BASE_URL, sessionToken: SESSION_TOKEN, fetchFn: mockFetch });

    const result = await service.migrateMembers({
      serverAccountId: SERVER_ACCOUNT_ID,
      accountKey: ACCOUNT_KEY,
      epoch: EPOCH,
      client,
      ownerEmail: OWNER_EMAIL,
      memberEmails: [OWNER_EMAIL, MEMBER_EMAIL, UNREGISTERED_EMAIL],
      emailHashPepper: EMAIL_HASH_PEPPER,
      senderName: SENDER_NAME,
      accountName: ACCOUNT_NAME,
    });

    expect(result.deliveredKeys).toBe(1);
    expect(result.sentInvites).toBe(1);
    expect(result.skipped).toBe(0);
    expect(result.errors).toHaveLength(0);
  });

  it('skips already_invited without counting as error', async () => {
    const { fetch: mockFetch } = createMockFetch(sharingRoutes({
      'GET /v1/nonce': () => ({ body: { nonce: 'test-nonce' } }),
      [`POST /v1/accounts/${SERVER_ACCOUNT_ID}/invites`]: () => ({
        body: { error: 'already_invited' },
        status: 409,
      }),
    }));

    const { createOnlineAccountsClient } = await import('../../sync/online-accounts-client');
    const client = createOnlineAccountsClient({ baseUrl: BASE_URL, sessionToken: SESSION_TOKEN, fetchFn: mockFetch });

    const result = await service.migrateMembers({
      serverAccountId: SERVER_ACCOUNT_ID,
      accountKey: ACCOUNT_KEY,
      epoch: EPOCH,
      client,
      ownerEmail: OWNER_EMAIL,
      memberEmails: [OWNER_EMAIL, UNREGISTERED_EMAIL],
      emailHashPepper: EMAIL_HASH_PEPPER,
      senderName: SENDER_NAME,
      accountName: ACCOUNT_NAME,
    });

    expect(result.sentInvites).toBe(0);
    expect(result.skipped).toBe(1);
    expect(result.errors).toHaveLength(0);
  });

  it('collects errors for server failures', async () => {
    const { fetch: mockFetch } = createMockFetch(sharingRoutes({
      'GET /v1/nonce': () => ({ body: { nonce: 'test-nonce' } }),
      [`POST /v1/accounts/${SERVER_ACCOUNT_ID}/invites`]: () => ({
        body: { error: 'rate_limited' },
        status: 429,
      }),
    }));

    const { createOnlineAccountsClient } = await import('../../sync/online-accounts-client');
    const client = createOnlineAccountsClient({ baseUrl: BASE_URL, sessionToken: SESSION_TOKEN, fetchFn: mockFetch });

    const result = await service.migrateMembers({
      serverAccountId: SERVER_ACCOUNT_ID,
      accountKey: ACCOUNT_KEY,
      epoch: EPOCH,
      client,
      ownerEmail: OWNER_EMAIL,
      memberEmails: [OWNER_EMAIL, UNREGISTERED_EMAIL],
      emailHashPepper: EMAIL_HASH_PEPPER,
      senderName: SENDER_NAME,
      accountName: ACCOUNT_NAME,
    });

    expect(result.sentInvites).toBe(0);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toContain('Invite failed');
  });
});
