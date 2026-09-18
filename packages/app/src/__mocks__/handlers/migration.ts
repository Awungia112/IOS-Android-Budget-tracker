/**
 * MSW handlers for the legacy "Mein Budget" API endpoints.
 *
 * All requests are intercepted at /legacy-api/* (the dev proxy prefix used
 * by LegacyApiClient when import.meta.env.DEV is true).
 *
 * Fixtures are minimal but structurally valid — enough for the transformer
 * to produce non-zero imported counts without requiring a full dataset.
 */

import { http, HttpResponse } from 'msw';

// ---------------------------------------------------------------------------
// Base URL prefix (matches LEGACY_API_BASE in MigrationPage for DEV)
// ---------------------------------------------------------------------------

const BASE = '/legacy-api';

// ---------------------------------------------------------------------------
// Minimal fixture data
// ---------------------------------------------------------------------------

export const VALID_EMAIL = 'user@example.com';
export const VALID_PASSWORD = 'secret123';
export const AUTH_TOKEN = 'test-bearer-token-abc';

/** One active account */
export const fixtureAccount = {
  id: 1,
  name: 'Main Account',
  description: '',
  acronym: 'MA',
  color: '#4A90E2',
  deleted: false,
};

/** One access record (owner) */
export const fixtureAccess = {
  id: 10,
  role: 'owner',
  account: 1,
  user: { id: 99, email: VALID_EMAIL },
};

/** One expense category (no limit) */
export const fixtureCategory = {
  id: 100,
  name: 'Groceries',
  icon: 'shopping-cart',
  balanceType: 'BT_EXPENSE',
  active: true,
  deletable: true,
  limits: null,
  limitsDate: null,
  deleted: false,
  account: 1,
};

/** One income transaction */
export const fixtureBalance = {
  id: 200,
  name: 'Salary',
  balanceType: 'BT_INCOME',
  date: '2024-01-15T10:00:00Z',
  amount: 3000,
  deleted: false,
  account: 1,
  category: null,
  saving_goal: null,
  recuring: null,
};

/** One recurring item */
export const fixtureRecuring = {
  id: 300,
  name: 'Netflix',
  balanceType: 'BT_EXPENSE',
  startDate: '2024-01-01',
  endDate: null,
  amount: 15,
  repeating: 1,
  deleted: false,
  account: 1,
  category: 100,
};

// ---------------------------------------------------------------------------
// Handler sets
// ---------------------------------------------------------------------------

/**
 * Happy-path handlers — valid credentials, full data set.
 */
export const migrationSuccessHandlers = [
  // POST /user/get-token
  http.post(`${BASE}/user/get-token`, () =>
    HttpResponse.json({ token: AUTH_TOKEN }),
  ),

  // GET /api/access — returns the current user's own access row
  http.get(`${BASE}/api/access`, () =>
    HttpResponse.json([fixtureAccess]),
  ),

  // GET /api/access/account?id=<accountId> — returns all member accesses for an owned account
  http.get(`${BASE}/api/access/account`, () =>
    HttpResponse.json([fixtureAccess]),
  ),

  // GET /api/accounts
  http.get(`${BASE}/api/accounts`, () =>
    HttpResponse.json([fixtureAccount]),
  ),

  // GET /api/balance?account_id=1
  http.get(`${BASE}/api/balance`, () =>
    HttpResponse.json([fixtureBalance]),
  ),

  // GET /api/category?account_id=1
  http.get(`${BASE}/api/category`, () =>
    HttpResponse.json([fixtureCategory]),
  ),

  // GET /api/recuring?account_id=1
  http.get(`${BASE}/api/recuring`, () =>
    HttpResponse.json([fixtureRecuring]),
  ),

  // GET /api/saving-goal?category_id=100 — no goals
  http.get(`${BASE}/api/saving-goal`, () =>
    HttpResponse.json([]),
  ),
];

/**
 * Invalid credentials — POST /user/get-token returns 400.
 */
export const migrationInvalidCredentialsHandlers = [
  http.post(`${BASE}/user/get-token`, () =>
    new HttpResponse(JSON.stringify({ detail: 'Unable to log in with provided credentials.' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    }),
  ),
];

/**
 * Auth succeeds but /api/balance returns 500 (mid-fetch failure).
 */
export const migrationMidFetchFailureHandlers = [
  http.post(`${BASE}/user/get-token`, () =>
    HttpResponse.json({ token: AUTH_TOKEN }),
  ),

  http.get(`${BASE}/api/access`, () =>
    HttpResponse.json([fixtureAccess]),
  ),

  // GET /api/access/account?id=<accountId> — returns all member accesses for an owned account
  http.get(`${BASE}/api/access/account`, () =>
    HttpResponse.json([fixtureAccess]),
  ),

  http.get(`${BASE}/api/accounts`, () =>
    HttpResponse.json([fixtureAccount]),
  ),

  // Fail on balance fetch
  http.get(`${BASE}/api/balance`, () =>
    new HttpResponse(null, { status: 500 }),
  ),

  http.get(`${BASE}/api/category`, () =>
    HttpResponse.json([fixtureCategory]),
  ),

  http.get(`${BASE}/api/recuring`, () =>
    HttpResponse.json([fixtureRecuring]),
  ),

  http.get(`${BASE}/api/saving-goal`, () =>
    HttpResponse.json([]),
  ),
];

/**
 * Auth succeeds but /api/accounts returns malformed JSON (not an array).
 */
export const migrationMalformedPayloadHandlers = [
  http.post(`${BASE}/user/get-token`, () =>
    HttpResponse.json({ token: AUTH_TOKEN }),
  ),

  http.get(`${BASE}/api/access`, () =>
    HttpResponse.json([fixtureAccess]),
  ),

  // GET /api/access/account?id=<accountId> — returns all member accesses for an owned account
  http.get(`${BASE}/api/access/account`, () =>
    HttpResponse.json([fixtureAccess]),
  ),

  // Malformed: returns an object instead of an array
  http.get(`${BASE}/api/accounts`, () =>
    HttpResponse.json({ not: 'an array' }),
  ),

  http.get(`${BASE}/api/balance`, () =>
    HttpResponse.json([fixtureBalance]),
  ),

  http.get(`${BASE}/api/category`, () =>
    HttpResponse.json([fixtureCategory]),
  ),

  http.get(`${BASE}/api/recuring`, () =>
    HttpResponse.json([fixtureRecuring]),
  ),

  http.get(`${BASE}/api/saving-goal`, () =>
    HttpResponse.json([]),
  ),
];
