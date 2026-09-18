/**
 * MSW handlers for the Recovery Server API endpoints.
 *
 * These intercept the real fetch() calls made by RecoveryEmail and RecoveryOTP
 * when VITE_RECOVERY_SERVER_URL is set (which it is in CI).
 *
 * In CI, VITE_RECOVERY_SERVER_URL is something like
 *   https://recovery.dev.dip.on.adorsys.com
 * so the full request URL is https://recovery.dev.dip.on.adorsys.com/v1/recovery/request
 *
 * MSW v2 requires an exact origin match for string URL predicates.
 * A relative path like '/v1/recovery/request' would resolve to
 * http://127.0.0.1:3000/... (the jsdom origin), which won't match.
 * Using RegExp is the only reliable way to match any origin.
 */

import { http, HttpResponse } from 'msw';

export const MOCK_EMAIL_HASH = 'abc123def456';
export const MOCK_SESSION_TOKEN = 'mock-session-token-for-recovery';

/**
 * Happy-path recovery handlers - email is registered, OTP matches, etc.
 */
export const recoverySuccessHandlers = [
  // POST /v1/recovery/request - email is registered, return email_hash
  http.post(/\/v1\/recovery\/request$/, async () => {
    return HttpResponse.json({
      status: 'ok',
      email_hash: MOCK_EMAIL_HASH,
      registered: true,
    });
  }),

  // POST /v1/recovery/verify - OTP is valid, return mock encrypted_private_key
  http.post(/\/v1\/recovery\/verify$/, async () => {
    return HttpResponse.json({
      status: 'ok',
      encrypted_private_key: {
        iv: 'dGVzdF9pdjEyMzQ1Njc4',
        data: 'dGVzdF9kYXRhX2VuY3J5cHRlZA',
        salt: 'dGVzdF9zYWx0MTIzNDU2',
      },
    });
  }),

  // POST /v1/auth/recover-session — issues a mock session JWT after recovery
  http.post(/\/v1\/auth\/recover-session$/, async () => {
    return HttpResponse.json({
      token: MOCK_SESSION_TOKEN,
      user: {
        email_hash: MOCK_EMAIL_HASH,
        public_key: 'A'.repeat(43),
      },
    });
  }),
];