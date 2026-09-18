/**
 * LegacyApiClient - Typed HTTP client for the legacy "Mein Budget" Django API.
 *
 * Endpoint contract verified against:
 *   postman/Mein Budget.postman_collection.json
 *   postman/test-contract.cjs
 *
 * Flow:
 *   1. authenticate(email, password)  → stores Bearer token in memory
 *   2. fetchAccesses()                → resolves account IDs owned by the user
 *   3. fetchAllForAccount(accountId)  → fetches balances, categories, recurings
 *   4. fetchSavingGoalsForCategories  → per-category fetch (API quirk)
 *   5. fetchUserData()                → orchestrates 2–4, returns LegacyUserData
 *   6. clearToken()                   → wipes token from memory after migration
 *
 * GDPR Compliance:
 *   - Bearer token is stored in memory only (never persisted to any store)
 *   - Credentials are never stored or logged
 *
 * CORS:
 *   - If direct browser access is blocked, configure a reverse proxy that
 *     forwards /legacy-api/* to the Django base URL and set baseUrl accordingly.
 */

import type {
  LegacyAuthResponse,
  LegacyUserDetails,
  LegacyAccount,
  LegacyAccess,
  LegacyBalance,
  LegacyTransaction,
  LegacyCategory,
  LegacyRecuring,
  LegacySavingGoal,
  LegacyUserData,
} from './legacy-types.js';
import { Capacitor, CapacitorHttp } from '@capacitor/core';

// =============================================================================
// ERROR TYPES
// =============================================================================

export type LegacyApiErrorCode =
  | 'INVALID_CREDENTIALS'
  | 'NETWORK_FAILURE'
  | 'MALFORMED_RESPONSE'
  | 'UNAUTHORIZED'
  | 'NOT_FOUND'
  | 'NO_ACCOUNT_ACCESS'
  | 'SERVER_ERROR';

export class LegacyApiError extends Error {
  constructor(
    message: string,
    public readonly code: LegacyApiErrorCode,
    public readonly statusCode?: number,
  ) {
    super(message);
    this.name = 'LegacyApiError';
  }
}

export interface LegacyApiHttpResponse {
  ok: boolean;
  status: number;
  json(): Promise<unknown>;
}

export interface LegacyApiHttpTransport {
  request(url: string, options: RequestInit): Promise<LegacyApiHttpResponse>;
}

const fetchTransport: LegacyApiHttpTransport = {
  request: async (url, options) => fetch(url, options),
};

const capacitorHttpTransport: LegacyApiHttpTransport = {
  request: async (url, options) => {
    const headers = options.headers as Record<string, string> | undefined;
    const data = normalizeCapacitorHttpBody(options.body, headers);
    const response = await CapacitorHttp.request({
      url,
      method: options.method ?? 'GET',
      headers,
      ...(data !== undefined ? { data } : {}),
      responseType: 'json',
    });

    return {
      ok: response.status >= 200 && response.status < 300,
      status: response.status,
      json: async () => {
        if (typeof response.data === 'string') {
          return JSON.parse(response.data);
        }
        return response.data;
      },
    };
  },
};

function normalizeCapacitorHttpBody(
  body: BodyInit | null | undefined,
  headers: Record<string, string> | undefined,
): unknown {
  if (body === null || body === undefined) return undefined;
  if (typeof body !== 'string') return body;

  const contentType = Object.entries(headers ?? {}).find(
    ([key]) => key.toLowerCase() === 'content-type',
  )?.[1];

  if (contentType?.toLowerCase().includes('application/json')) {
    try {
      return JSON.parse(body);
    } catch {
      throw new LegacyApiError(
        `Failed to parse JSON body: ${body.length > 200 ? body.slice(0, 200) + '…' : body}`,
        'MALFORMED_RESPONSE',
      );
    }
  }

  return body;
}

function createDefaultTransport(): LegacyApiHttpTransport {
  return Capacitor.isNativePlatform() ? capacitorHttpTransport : fetchTransport;
}

// =============================================================================
// CLIENT
// =============================================================================

export class LegacyApiClient {
  private token: string | null = null;

  constructor(
    private readonly baseUrl: string,
    private readonly transport: LegacyApiHttpTransport = createDefaultTransport(),
  ) {}

  // ---------------------------------------------------------------------------
  // Authentication
  // ---------------------------------------------------------------------------

  /**
   * POST /user/get-token
   * Authenticates and stores the Bearer token in memory only.
   */
  async authenticate(email: string, password: string): Promise<void> {
    const response = await this.request<LegacyAuthResponse>('/user/get-token', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
      skipAuth: true,
    });
    if (typeof response.token !== 'string' || response.token.length === 0) {
      throw new LegacyApiError(
        'Malformed response from /user/get-token: missing token.',
        'MALFORMED_RESPONSE',
      );
    }
    this.token = response.token;
  }

  /** Clears the in-memory token. Call after migration completes. */
  clearToken(): void {
    this.token = null;
  }

  // ---------------------------------------------------------------------------
  // User & Account
  // ---------------------------------------------------------------------------

  /** GET /user/details */
  async fetchUserDetails(): Promise<LegacyUserDetails> {
    return this.request<LegacyUserDetails>('/user/details');
  }

  /** GET /api/accounts — all accounts the user owns or has access to */
  async fetchAccounts(): Promise<LegacyAccount[]> {
    return this.requestArray<LegacyAccount>('/api/accounts');
  }

  /**
   * GET /api/access
   * Returns access records; each record's `account` field is the numeric account ID.
   * NOTE: Only returns the current user's own access rows — does NOT include other
   * members' rows for accounts the user owns. Use fetchAccessesForAccount() for that.
   */
  async fetchAccesses(): Promise<LegacyAccess[]> {
    return this.requestArray<LegacyAccess>('/api/access');
  }

  /**
   * GET /api/access/account?id=<accountId>
   * Returns ALL access records for a specific account (owner + all members).
   * Required to detect shared accounts — the bare /api/access endpoint only
   * returns the authenticated user's own row, not other members' rows.
   */
  async fetchAccessesForAccount(accountId: number): Promise<LegacyAccess[]> {
    return this.requestArray<LegacyAccess>(`/api/access/account?id=${accountId}`);
  }

  // ---------------------------------------------------------------------------
  // Account-scoped entity fetchers
  // ---------------------------------------------------------------------------

  /** GET /api/balance?account_id=X */
  async fetchBalances(accountId: number): Promise<LegacyBalance[]> {
    return this.requestArray<LegacyBalance>(`/api/balance?account_id=${accountId}`);
  }

  /** GET /api/category?account_id=X */
  async fetchCategories(accountId: number): Promise<LegacyCategory[]> {
    return this.requestArray<LegacyCategory>(`/api/category?account_id=${accountId}`);
  }

  /** GET /api/recuring?account_id=X */
  async fetchRecurings(accountId: number): Promise<LegacyRecuring[]> {
    return this.requestArray<LegacyRecuring>(`/api/recuring?account_id=${accountId}`);
  }

  /**
   * GET /api/saving-goal?category_id=X
   * The legacy API scopes saving goals by category, not account.
   * Pass all category IDs to collect all goals for an account.
   */
  async fetchSavingGoalsForCategory(categoryId: number): Promise<LegacySavingGoal[]> {
    return this.requestArray<LegacySavingGoal>(`/api/saving-goal?category_id=${categoryId}`);
  }

  // ---------------------------------------------------------------------------
  // Ticket-spec convenience methods (require fetchUserData() to be called first,
  // or call authenticate() then use these after resolving an accountId)
  // ---------------------------------------------------------------------------

  /**
   * Fetches transactions (balances) for the owner account.
   * Convenience wrapper matching the ticket interface:
   *   fetchTransactions(): Promise<LegacyTransaction[]>
   */
  async fetchTransactions(accountId: number): Promise<LegacyTransaction[]> {
    return this.fetchBalances(accountId);
  }

  /**
   * Fetches the owner account profile via /api/access + /api/accounts.
   * Convenience wrapper matching the ticket interface:
   *   fetchAccount(): Promise<LegacyAccount>
   */
  async fetchAccount(): Promise<LegacyAccount> {
    const [accesses, accounts] = await Promise.all([
      this.fetchAccesses(),
      this.fetchAccounts(),
    ]);
    const ownedAccess = accesses.find(a => a.role === 'owner') ?? accesses[0];
    const account = accounts.find(a => a.id === ownedAccess?.account);
    if (!account) {
      throw new LegacyApiError('No account found for authenticated user.', 'NOT_FOUND');
    }
    return account;
  }

  // ---------------------------------------------------------------------------
  // Aggregated fetch
  // ---------------------------------------------------------------------------

  /**
   * Fetches all user data needed for migration across ALL accounts.
   *
   * Strategy:
   *   1. Resolve all account IDs the user owns via /api/access
   *   2. For each owned account, fetch balances, categories, recurings in parallel
   *   3. Fetch saving goals per category across all accounts (API quirk: scoped by category_id)
   *   4. Flatten all results into a single LegacyUserData aggregate
   *
   * Requires authenticate() to have been called first.
   */
  async fetchUserData(): Promise<LegacyUserData> {
    // 1. Resolve all confirmed accounts the user has access to (owner + member).
    // GET /api/access only returns the current user's own row per account. For
    // owned accounts we need to also fetch the full member list via the separate
    // /api/access/account?id=<id> endpoint so that shared-account detection
    // (isShared, memberEmails) works correctly during migration.
    const [ownAccesses, accounts] = await Promise.all([
      this.fetchAccesses(),
      this.fetchAccounts(),
    ]);

    // For each owned account, fetch all member accesses and merge them in.
    const ownedAccountIds = ownAccesses
      .filter(a => a.role === 'owner')
      .map(a => a.account);

    const memberAccessArrays = await Promise.all(
      ownedAccountIds.map(id =>
        this.fetchAccessesForAccount(id).catch(() => [] as LegacyAccess[]),
      ),
    );

    // Deduplicate by access ID — the owner's own row already appears in ownAccesses.
    const seenIds = new Set(ownAccesses.map(a => a.id));
    const extraAccesses = memberAccessArrays
      .flat()
      .filter(a => !seenIds.has(a.id));

    const accesses = [...ownAccesses, ...extraAccesses];

    // Include ALL confirmed accesses — both owned and shared member accounts
    const accountIds = [...new Set(accesses.map(a => a.account))];

    // NO_ACCOUNT_ACCESS (not NOT_FOUND, which means HTTP 404 elsewhere in this
    // client): the user authenticated but has zero access rows — nothing to migrate.
    if (accountIds.length === 0) {
      throw new LegacyApiError(
        'No account access found for authenticated user.',
        'NO_ACCOUNT_ACCESS',
      );
    }

    // 2. Fetch all account-scoped entities in parallel across all accounts
    const perAccountResults = await Promise.all(
      accountIds.map(async (accountId) => {
        const [balances, categories, recurings] = await Promise.all([
          this.fetchBalances(accountId),
          this.fetchCategories(accountId),
          this.fetchRecurings(accountId),
        ]);
        return { balances, categories, recurings };
      }),
    );

    const balances = perAccountResults.flatMap(r => r.balances);
    const categories = perAccountResults.flatMap(r => r.categories);
    const recurings = perAccountResults.flatMap(r => r.recurings);

    // 3. Fetch saving goals per category across all accounts
    // (API requires category_id, not account_id — this is a legacy API quirk)
    // Deduplicate category IDs first to avoid redundant requests when multiple
    // accounts share the same category IDs.
    const uniqueCategoryIds = [...new Set(categories.map(c => c.id))];
    const savingGoalArrays = await Promise.all(
      uniqueCategoryIds.map(id => this.fetchSavingGoalsForCategory(id)),
    );
    const savingGoals = savingGoalArrays.flat();

    // 4. Extract limits from categories — there is no /api/limit endpoint.
    // A limit exists on a category when LegacyCategory.limits !== null.
    const limits = categories
      .filter(c => c.limits !== null && c.limits !== undefined)
      .map(c => ({
        categoryId: c.id,
        categoryName: c.name,
        balanceType: c.balanceType,
        amount: c.limits as number,
        limitsDate: c.limitsDate as string,
        accountId: c.account,
      }));

    return { accounts, accesses, balances, categories, recurings, savingGoals, limits };
  }

  // ---------------------------------------------------------------------------
  // Internal request helper
  // ---------------------------------------------------------------------------

  /**
   * Makes an HTTP request with automatic retry and exponential backoff for
   * transient network failures.
   *
   * Retry policy:
   *   - Max 3 attempts (1 initial + 2 retries)
   *   - Only retries on NETWORK_FAILURE (fetch throws) — never on 4xx/5xx
   *   - Backoff: 500ms, 1000ms (doubles each attempt, no jitter needed for migration)
   *
   * Non-retryable errors (thrown immediately on first occurrence):
   *   - INVALID_CREDENTIALS (400/401/403)
   *   - NOT_FOUND (404)
   *   - SERVER_ERROR (5xx)
   *   - MALFORMED_RESPONSE
   *   - UNAUTHORIZED (no token)
   */
  private async request<T>(
    path: string,
    options: RequestInit & { skipAuth?: boolean } = {},
  ): Promise<T> {
    const { skipAuth, ...fetchOptions } = options;

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(fetchOptions.headers as Record<string, string>),
    };

    if (!skipAuth) {
      if (!this.token) {
        throw new LegacyApiError(
          'Not authenticated. Call authenticate() first.',
          'UNAUTHORIZED',
        );
      }
      headers['Authorization'] = `Bearer ${this.token}`;
    }

    const MAX_ATTEMPTS = 3;
    const BASE_DELAY_MS = 500;
    let lastNetworkError: LegacyApiError | undefined;

    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      let response: LegacyApiHttpResponse;

      try {
        response = await this.transport.request(`${this.baseUrl}${path}`, { ...fetchOptions, headers });
      } catch (err) {
        lastNetworkError = new LegacyApiError(
          `Network failure on attempt ${attempt}/${MAX_ATTEMPTS}: ${err instanceof Error ? err.message : 'unknown error'}.`,
          'NETWORK_FAILURE',
        );

        if (attempt < MAX_ATTEMPTS) {
          await delay(BASE_DELAY_MS * attempt);
          continue;
        }

        throw new LegacyApiError(
          `Network failure after ${MAX_ATTEMPTS} attempts: ${err instanceof Error ? err.message : 'unknown error'}. Check connectivity and retry.`,
          'NETWORK_FAILURE',
        );
      }

      // 400/404 on /user/get-token = bad email/password (Django behaviour, verified)
      // 401/403 on authenticated endpoints = token missing, expired, or revoked
      if (response.status === 400 || response.status === 401 || response.status === 403) {
        throw new LegacyApiError(
          'Invalid credentials or token expired.',
          'INVALID_CREDENTIALS',
          response.status,
        );
      }

      if (response.status === 404) {
        throw new LegacyApiError(`Endpoint not found: ${path}`, 'NOT_FOUND', 404);
      }

      if (!response.ok) {
        throw new LegacyApiError(
          `Server error ${response.status} on ${path}`,
          'SERVER_ERROR',
          response.status,
        );
      }

      let data: unknown;
      try {
        data = await response.json();
      } catch {
        throw new LegacyApiError(
          `Malformed response from ${path}: expected JSON.`,
          'MALFORMED_RESPONSE',
          response.status,
        );
      }

      if (data === null || data === undefined) {
        throw new LegacyApiError(
          `Malformed response from ${path}: received null or undefined.`,
          'MALFORMED_RESPONSE',
          response.status,
        );
      }

      return data as T;
    }

    // Unreachable — loop always returns or throws, but satisfies TypeScript
    throw lastNetworkError!;
  }

  private async requestArray<T>(
    path: string,
    options: RequestInit & { skipAuth?: boolean } = {},
  ): Promise<T[]> {
    const data = await this.request<unknown>(path, options);
    if (!Array.isArray(data)) {
      throw new LegacyApiError(
        `Malformed response from ${path}: expected array.`,
        'MALFORMED_RESPONSE',
      );
    }

    return data as T[];
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
