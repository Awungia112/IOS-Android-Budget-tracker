import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { LegacyApiClient, LegacyApiError } from './legacy-api-client.js';

const BASE_URL = 'https://legacy.example.com';
const EMAIL = 'test@test.de';
const PASSWORD = '12345';
const TOKEN = 'test-bearer-token-fixture';
const ACCOUNT_ID = 96;
const CATEGORY_ID = 1;

function mockFetch(status: number, body: unknown, ok = status >= 200 && status < 300) {
  return vi.fn().mockResolvedValue({ ok, status, json: vi.fn().mockResolvedValue(body) });
}
function mockFetchReject(error: Error) {
  return vi.fn().mockRejectedValue(error);
}

const authFixture = { token: TOKEN };
const accountsFixture = [{ id: ACCOUNT_ID, name: 'Kto NAA E.8', acronym: 'E8', color: '#ff8840', deleted: false }];
const accessesFixture = [{ id: 1, role: 'owner', account: ACCOUNT_ID, user: { id: 9, email: EMAIL } }];
const userDetailsFixture = { id: 9, username: '280556cc', first_name: '', last_name: '', email: EMAIL, date_joined: '2022-07-26T12:12:02.213146Z' };
const balancesFixture = [{ id: 1, name: 'TestBalance', balanceType: 'BT_EXPENSE', date: '2022-09-09', amount: 45.5, deleted: false, account: ACCOUNT_ID, category: CATEGORY_ID, saving_goal: null, recuring: null, user: 9, target_account: null, sender_account: null, target_balance_id: null, sender_balance_id: null, is_transfer_balance: false }];
const categoriesFixture = [{ id: CATEGORY_ID, name: 'TestCategory', icon: '//icon', balanceType: 'BT_INCOME', active: true, is_deletable: true, limits: 123.45, limitsDate: '2023-12-10', deleted: false, account: ACCOUNT_ID, default: null }];
const recuringsFixture = [{ id: 3, name: 'RecuringTask 3', balanceType: 'BT_EXPENSE', startDate: '2022-09-09', endDate: '2022-09-18', nextRepeatingDate: null, amount: 99.96, repeating: 1, deleted: false, category: CATEGORY_ID, account: ACCOUNT_ID }];
const savingGoalsFixture = [{ id: 2, name: 'MeinSavingGoal', created_at: '2022-10-12', dueDate: '2022-12-31', amount: 80, monthly_amount: 20, isopen: true, deleted: false, category: CATEGORY_ID, account: ACCOUNT_ID }];

describe('LegacyApiClient', () => {
  let client: LegacyApiClient;
  beforeEach(() => { client = new LegacyApiClient(BASE_URL); });
  afterEach(() => { vi.restoreAllMocks(); });

  describe('authenticate', () => {
    it('posts credentials to /user/get-token', async () => {
      global.fetch = mockFetch(200, authFixture);
      await client.authenticate(EMAIL, PASSWORD);
      expect(fetch).toHaveBeenCalledWith(`${BASE_URL}/user/get-token`, expect.objectContaining({ method: 'POST', body: JSON.stringify({ email: EMAIL, password: PASSWORD }) }));
    });
    it('does not attach Authorization header on the auth request', async () => {
      global.fetch = mockFetch(200, authFixture);
      await client.authenticate(EMAIL, PASSWORD);
      const callHeaders = (fetch as ReturnType<typeof vi.fn>).mock.calls[0][1].headers;
      expect(callHeaders).not.toHaveProperty('Authorization');
    });
    it('throws INVALID_CREDENTIALS on 401', async () => {
      global.fetch = mockFetch(401, {}, false);
      await expect(client.authenticate(EMAIL, PASSWORD)).rejects.toMatchObject({ code: 'INVALID_CREDENTIALS', statusCode: 401 });
    });
    it('throws INVALID_CREDENTIALS on 403', async () => {
      global.fetch = mockFetch(403, {}, false);
      await expect(client.authenticate(EMAIL, PASSWORD)).rejects.toMatchObject({ code: 'INVALID_CREDENTIALS', statusCode: 403 });
    });
    it('throws NETWORK_FAILURE when fetch rejects (retries exhausted)', async () => {
      vi.useFakeTimers();
      global.fetch = mockFetchReject(new Error('Failed to fetch'));
      const promise = client.authenticate(EMAIL, PASSWORD).catch(e => e);
      await vi.runAllTimersAsync();
      expect(await promise).toMatchObject({ code: 'NETWORK_FAILURE' });
      vi.useRealTimers();
    });
    it('throws MALFORMED_RESPONSE when response is not valid JSON', async () => {
      global.fetch = vi.fn().mockResolvedValue({ ok: true, status: 200, json: vi.fn().mockRejectedValue(new SyntaxError('Unexpected token')) });
      await expect(client.authenticate(EMAIL, PASSWORD)).rejects.toMatchObject({ code: 'MALFORMED_RESPONSE' });
    });
    it('throws MALFORMED_RESPONSE when auth response has no token', async () => {
      global.fetch = mockFetch(200, {});
      await expect(client.authenticate(EMAIL, PASSWORD)).rejects.toMatchObject({
        code: 'MALFORMED_RESPONSE',
        message: 'Malformed response from /user/get-token: missing token.',
      });
    });
    it('throws SERVER_ERROR on 500', async () => {
      global.fetch = mockFetch(500, {}, false);
      await expect(client.authenticate(EMAIL, PASSWORD)).rejects.toMatchObject({ code: 'SERVER_ERROR', statusCode: 500 });
    });
  });

  describe('authenticated requests', () => {
    beforeEach(async () => { global.fetch = mockFetch(200, authFixture); await client.authenticate(EMAIL, PASSWORD); });
    it('attaches Bearer token to subsequent requests', async () => {
      global.fetch = mockFetch(200, userDetailsFixture);
      await client.fetchUserDetails();
      expect(fetch).toHaveBeenCalledWith(`${BASE_URL}/user/details`, expect.objectContaining({ headers: expect.objectContaining({ Authorization: `Bearer ${TOKEN}` }) }));
    });
    it('throws UNAUTHORIZED when called without authenticating', async () => {
      const unauthClient = new LegacyApiClient(BASE_URL);
      await expect(unauthClient.fetchAccesses()).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
    });
  });

  describe('fetchUserDetails', () => {
    beforeEach(async () => { global.fetch = mockFetch(200, authFixture); await client.authenticate(EMAIL, PASSWORD); });
    it('returns typed user details from /user/details', async () => {
      global.fetch = mockFetch(200, userDetailsFixture);
      expect(await client.fetchUserDetails()).toEqual(userDetailsFixture);
    });
  });

  describe('fetchAccounts', () => {
    beforeEach(async () => { global.fetch = mockFetch(200, authFixture); await client.authenticate(EMAIL, PASSWORD); });
    it('returns typed accounts array from /api/accounts', async () => {
      global.fetch = mockFetch(200, accountsFixture);
      expect(await client.fetchAccounts()).toEqual(accountsFixture);
    });
    it('throws MALFORMED_RESPONSE when /api/accounts returns a non-array payload', async () => {
      global.fetch = mockFetch(200, { accounts: accountsFixture });
      await expect(client.fetchAccounts()).rejects.toMatchObject({
        code: 'MALFORMED_RESPONSE',
        message: 'Malformed response from /api/accounts: expected array.',
      });
    });
  });

  describe('fetchAccesses', () => {
    beforeEach(async () => { global.fetch = mockFetch(200, authFixture); await client.authenticate(EMAIL, PASSWORD); });
    it('returns access records with numeric account IDs from /api/access', async () => {
      global.fetch = mockFetch(200, accessesFixture);
      const result = await client.fetchAccesses();
      expect(result).toEqual(accessesFixture);
      expect(result[0].account).toBe(ACCOUNT_ID);
    });
  });

  describe('fetchBalances', () => {
    beforeEach(async () => { global.fetch = mockFetch(200, authFixture); await client.authenticate(EMAIL, PASSWORD); });
    it('calls /api/balance?account_id=X and returns typed balances', async () => {
      global.fetch = mockFetch(200, balancesFixture);
      const result = await client.fetchBalances(ACCOUNT_ID);
      expect(fetch).toHaveBeenCalledWith(`${BASE_URL}/api/balance?account_id=${ACCOUNT_ID}`, expect.anything());
      expect(result).toEqual(balancesFixture);
    });
    it('throws NETWORK_FAILURE on network error (retries exhausted)', async () => {
      vi.useFakeTimers();
      global.fetch = mockFetchReject(new Error('Network error'));
      const promise = client.fetchBalances(ACCOUNT_ID).catch(e => e);
      await vi.runAllTimersAsync();
      expect(await promise).toMatchObject({ code: 'NETWORK_FAILURE' });
      vi.useRealTimers();
    });
  });

  describe('retry behaviour', () => {
    beforeEach(async () => { global.fetch = mockFetch(200, authFixture); await client.authenticate(EMAIL, PASSWORD); });

    it('succeeds on the second attempt after a transient network failure', async () => {
      vi.useFakeTimers();
      let callCount = 0;
      global.fetch = vi.fn().mockImplementation(() => {
        callCount++;
        if (callCount === 1) return Promise.reject(new Error('transient'));
        return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(balancesFixture) });
      });
      const promise = client.fetchBalances(ACCOUNT_ID);
      await vi.runAllTimersAsync();
      expect(await promise).toEqual(balancesFixture);
      expect(callCount).toBe(2);
      vi.useRealTimers();
    });

    it('retries up to 3 attempts then throws NETWORK_FAILURE', async () => {
      vi.useFakeTimers();
      global.fetch = mockFetchReject(new Error('persistent failure'));
      const promise = client.fetchBalances(ACCOUNT_ID).catch(e => e);
      await vi.runAllTimersAsync();
      const err = await promise;
      expect(err).toMatchObject({ code: 'NETWORK_FAILURE' });
      expect(fetch).toHaveBeenCalledTimes(3);
      vi.useRealTimers();
    });

    it('does not retry on INVALID_CREDENTIALS (400)', async () => {
      global.fetch = mockFetch(400, {}, false);
      await expect(client.fetchBalances(ACCOUNT_ID)).rejects.toMatchObject({ code: 'INVALID_CREDENTIALS' });
      expect(fetch).toHaveBeenCalledTimes(1);
    });

    it('does not retry on SERVER_ERROR (500)', async () => {
      global.fetch = mockFetch(500, {}, false);
      await expect(client.fetchBalances(ACCOUNT_ID)).rejects.toMatchObject({ code: 'SERVER_ERROR' });
      expect(fetch).toHaveBeenCalledTimes(1);
    });
  });

  describe('fetchCategories', () => {
    beforeEach(async () => { global.fetch = mockFetch(200, authFixture); await client.authenticate(EMAIL, PASSWORD); });
    it('calls /api/category?account_id=X and returns typed categories', async () => {
      global.fetch = mockFetch(200, categoriesFixture);
      const result = await client.fetchCategories(ACCOUNT_ID);
      expect(fetch).toHaveBeenCalledWith(`${BASE_URL}/api/category?account_id=${ACCOUNT_ID}`, expect.anything());
      expect(result).toEqual(categoriesFixture);
    });
  });

  describe('fetchRecurings', () => {
    beforeEach(async () => { global.fetch = mockFetch(200, authFixture); await client.authenticate(EMAIL, PASSWORD); });
    it('calls /api/recuring?account_id=X and returns typed recurings', async () => {
      global.fetch = mockFetch(200, recuringsFixture);
      const result = await client.fetchRecurings(ACCOUNT_ID);
      expect(fetch).toHaveBeenCalledWith(`${BASE_URL}/api/recuring?account_id=${ACCOUNT_ID}`, expect.anything());
      expect(result).toEqual(recuringsFixture);
    });
  });

  describe('fetchSavingGoalsForCategory', () => {
    beforeEach(async () => { global.fetch = mockFetch(200, authFixture); await client.authenticate(EMAIL, PASSWORD); });
    it('calls /api/saving-goal?category_id=X (not account_id)', async () => {
      global.fetch = mockFetch(200, savingGoalsFixture);
      const result = await client.fetchSavingGoalsForCategory(CATEGORY_ID);
      expect(fetch).toHaveBeenCalledWith(`${BASE_URL}/api/saving-goal?category_id=${CATEGORY_ID}`, expect.anything());
      expect(result).toEqual(savingGoalsFixture);
    });
  });

  describe('fetchUserData', () => {
    function buildFetchMock() {
      const map: Record<string, unknown> = {
        '/user/get-token': authFixture,
        '/api/accounts': accountsFixture,
        '/api/access': accessesFixture,
        [`/api/balance?account_id=${ACCOUNT_ID}`]: balancesFixture,
        [`/api/category?account_id=${ACCOUNT_ID}`]: categoriesFixture,
        [`/api/recuring?account_id=${ACCOUNT_ID}`]: recuringsFixture,
        [`/api/saving-goal?category_id=${CATEGORY_ID}`]: savingGoalsFixture,
      };
      return vi.fn().mockImplementation((url: string) =>
        Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(map[url.replace(BASE_URL, '')] ?? []) }),
      );
    }

    it('orchestrates all fetches and returns aggregated LegacyUserData', async () => {
      global.fetch = buildFetchMock();
      await client.authenticate(EMAIL, PASSWORD);
      const result = await client.fetchUserData();
      expect(result.accounts).toEqual(accountsFixture);
      expect(result.accesses).toEqual(accessesFixture);
      expect(result.balances).toEqual(balancesFixture);
      expect(result.categories).toEqual(categoriesFixture);
      expect(result.recurings).toEqual(recuringsFixture);
      expect(result.savingGoals).toEqual(savingGoalsFixture);
      // limits extracted from categories where limits !== null
      expect(result.limits).toEqual([{
        categoryId: CATEGORY_ID,
        categoryName: 'TestCategory',
        balanceType: 'BT_INCOME',
        amount: 123.45,
        limitsDate: '2023-12-10',
        accountId: ACCOUNT_ID,
      }]);
    });

    it('extracts limits from categories with limits !== null, ignores null limits', async () => {
      const categoriesWithMixedLimits = [
        { id: 1, name: 'Food', icon: '//icon', balanceType: 'BT_EXPENSE', active: true, is_deletable: true, limits: 300.0, limitsDate: '2026-12-31', deleted: false, account: ACCOUNT_ID, default: null },
        { id: 2, name: 'Transport', icon: '//icon', balanceType: 'BT_EXPENSE', active: true, is_deletable: true, limits: null, limitsDate: null, deleted: false, account: ACCOUNT_ID, default: null },
        { id: 3, name: 'Salary', icon: '//icon', balanceType: 'BT_INCOME', active: true, is_deletable: true, limits: 5000.0, limitsDate: '2026-06-30', deleted: false, account: ACCOUNT_ID, default: null },
      ];
      const map: Record<string, unknown> = {
        '/user/get-token': authFixture,
        '/api/accounts': accountsFixture,
        '/api/access': accessesFixture,
        [`/api/balance?account_id=${ACCOUNT_ID}`]: balancesFixture,
        [`/api/category?account_id=${ACCOUNT_ID}`]: categoriesWithMixedLimits,
        [`/api/recuring?account_id=${ACCOUNT_ID}`]: recuringsFixture,
        '/api/saving-goal?category_id=1': [],
        '/api/saving-goal?category_id=2': [],
        '/api/saving-goal?category_id=3': [],
      };
      global.fetch = vi.fn().mockImplementation((url: string) =>
        Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(map[url.replace(BASE_URL, '')] ?? []) }),
      );
      await client.authenticate(EMAIL, PASSWORD);
      const result = await client.fetchUserData();

      // Only categories with limits !== null should produce a LegacyLimit
      expect(result.limits).toHaveLength(2);
      expect(result.limits[0]).toMatchObject({ categoryId: 1, amount: 300.0, limitsDate: '2026-12-31' });
      expect(result.limits[1]).toMatchObject({ categoryId: 3, amount: 5000.0, limitsDate: '2026-06-30' });
    });

    it('fetches data for both owned and confirmed member (shared) accounts', async () => {
      // Simulates a user who owns one account and is a confirmed member of another.
      // GET /api/access already filters unconfirmed invitations server-side,
      // so both records here represent confirmed access.
      const SHARED_ACCOUNT_ID = 10;
      const SHARED_CATEGORY_ID = 99;
      const sharedBalances = [{ id: 50, name: 'Shared Balance', balanceType: 'BT_EXPENSE', date: '2026-04-01', amount: 200.0, deleted: false, account: SHARED_ACCOUNT_ID, category: SHARED_CATEGORY_ID, saving_goal: null, recuring: null, user: 5, target_account: null, sender_account: null, target_balance_id: null, sender_balance_id: null, is_transfer_balance: false }];
      const sharedCategories = [{ id: SHARED_CATEGORY_ID, name: 'Shared Cat', icon: '//icon', balanceType: 'BT_EXPENSE', active: true, is_deletable: true, limits: null, limitsDate: null, deleted: false, account: SHARED_ACCOUNT_ID, default: null }];

      const mixedAccess = [
        { id: 1, role: 'owner', account: ACCOUNT_ID, user: 9 },
        { id: 2, role: 'member', account: SHARED_ACCOUNT_ID, user: 9 }, // confirmed member
      ];
      const map: Record<string, unknown> = {
        '/user/get-token': authFixture,
        '/api/access': mixedAccess,
        '/api/accounts': accountsFixture,
        [`/api/balance?account_id=${ACCOUNT_ID}`]: balancesFixture,
        [`/api/category?account_id=${ACCOUNT_ID}`]: categoriesFixture,
        [`/api/recuring?account_id=${ACCOUNT_ID}`]: recuringsFixture,
        [`/api/balance?account_id=${SHARED_ACCOUNT_ID}`]: sharedBalances,
        [`/api/category?account_id=${SHARED_ACCOUNT_ID}`]: sharedCategories,
        [`/api/recuring?account_id=${SHARED_ACCOUNT_ID}`]: [],
        [`/api/saving-goal?category_id=${CATEGORY_ID}`]: savingGoalsFixture,
        [`/api/saving-goal?category_id=${SHARED_CATEGORY_ID}`]: [],
      };
      global.fetch = vi.fn().mockImplementation((url: string) =>
        Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(map[url.replace(BASE_URL, '')] ?? []) }),
      );
      await client.authenticate(EMAIL, PASSWORD);
      const result = await client.fetchUserData();

      // Both owned and shared account data should be present
      expect(result.balances).toEqual(expect.arrayContaining([...balancesFixture, ...sharedBalances]));
      expect(result.categories).toEqual(expect.arrayContaining([...categoriesFixture, ...sharedCategories]));
    });

    it('throws NO_ACCOUNT_ACCESS when user has no account access', async () => {
      global.fetch = vi.fn().mockImplementation((url: string) => {
        const path = url.replace(BASE_URL, '');
        const body = path === '/user/get-token' ? authFixture : [];
        return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(body) });
      });
      await client.authenticate(EMAIL, PASSWORD);
      await expect(client.fetchUserData()).rejects.toMatchObject({ code: 'NO_ACCOUNT_ACCESS' });
    });

    it('deduplicates category IDs before fetching saving goals', async () => {
      // Two accounts share the same category ID — saving-goal should only be fetched once
      const sharedCategoryId = CATEGORY_ID;
      const twoAccesses = [
        { id: 1, role: 'owner', account: ACCOUNT_ID, user: 9 },
        { id: 2, role: 'owner', account: 200, user: 9 },
      ];
      const categoriesForBoth = [
        { id: sharedCategoryId, name: 'Shared', icon: '//icon', balanceType: 'BT_INCOME', active: true, is_deletable: true, limits: null, limitsDate: null, deleted: false, account: ACCOUNT_ID, default: null },
      ];
      const map: Record<string, unknown> = {
        '/user/get-token': authFixture,
        '/api/access': twoAccesses,
        '/api/accounts': accountsFixture,
        [`/api/balance?account_id=${ACCOUNT_ID}`]: balancesFixture,
        [`/api/category?account_id=${ACCOUNT_ID}`]: categoriesForBoth,
        [`/api/recuring?account_id=${ACCOUNT_ID}`]: recuringsFixture,
        '/api/balance?account_id=200': [],
        '/api/category?account_id=200': categoriesForBoth, // same category ID
        '/api/recuring?account_id=200': [],
        [`/api/saving-goal?category_id=${sharedCategoryId}`]: savingGoalsFixture,
      };
      global.fetch = vi.fn().mockImplementation((url: string) =>
        Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(map[url.replace(BASE_URL, '')] ?? []) }),
      );
      await client.authenticate(EMAIL, PASSWORD);
      await client.fetchUserData();

      const savingGoalCalls = (fetch as ReturnType<typeof vi.fn>).mock.calls
        .map((c: unknown[]) => (c[0] as string).replace(BASE_URL, ''))
        .filter((p: string) => p.startsWith('/api/saving-goal'));

      // Despite two accounts sharing the same category ID, only one saving-goal request
      expect(savingGoalCalls).toHaveLength(1);
      expect(savingGoalCalls[0]).toBe(`/api/saving-goal?category_id=${sharedCategoryId}`);
    });
  });

  describe('clearToken', () => {
    it('clears the in-memory token so subsequent requests throw UNAUTHORIZED', async () => {
      global.fetch = mockFetch(200, authFixture);
      await client.authenticate(EMAIL, PASSWORD);
      client.clearToken();
      await expect(client.fetchAccounts()).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
    });
  });

  describe('LegacyApiError', () => {
    it('is an instance of Error with name LegacyApiError', () => {
      const err = new LegacyApiError('test', 'NETWORK_FAILURE');
      expect(err).toBeInstanceOf(Error);
      expect(err.name).toBe('LegacyApiError');
    });
    it('exposes code and optional statusCode', () => {
      const err = new LegacyApiError('test', 'SERVER_ERROR', 500);
      expect(err.code).toBe('SERVER_ERROR');
      expect(err.statusCode).toBe(500);
    });
  });
});
