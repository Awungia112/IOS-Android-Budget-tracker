import { describe, expect, it } from 'vitest';

import { readServerEnv } from './env.js';

// Test-only AES-256 key (64 hex chars), not a real secret.
const TEST_ENCRYPTION_KEY = 'ab'.repeat(32);

function baseEnv(overrides: NodeJS.ProcessEnv = {}): NodeJS.ProcessEnv {
  return {
    DATABASE_URL: 'postgres://localhost:5432/test',
    EMAIL_ENCRYPTION_KEY: TEST_ENCRYPTION_KEY,
    ...overrides,
  };
}

describe('readServerEnv — store-review account', () => {
  it('leaves the review account unset by default', () => {
    const env = readServerEnv(baseEnv());
    expect(env.reviewAccountEmail).toBeUndefined();
    expect(env.reviewAccountCode).toBeUndefined();
  });

  it('reads both variables and normalizes the email', () => {
    const env = readServerEnv(baseEnv({
      REVIEW_ACCOUNT_EMAIL: '  StoreReview@Example.com ',
      REVIEW_ACCOUNT_CODE: '424242',
    }));
    expect(env.reviewAccountEmail).toBe('storereview@example.com');
    expect(env.reviewAccountCode).toBe('424242');
  });

  it('throws when only the email is set', () => {
    expect(() => readServerEnv(baseEnv({ REVIEW_ACCOUNT_EMAIL: 'storereview@example.com' })))
      .toThrow('REVIEW_ACCOUNT_EMAIL and REVIEW_ACCOUNT_CODE must be set together');
  });

  it('throws when only the code is set', () => {
    expect(() => readServerEnv(baseEnv({ REVIEW_ACCOUNT_CODE: '424242' })))
      .toThrow('REVIEW_ACCOUNT_EMAIL and REVIEW_ACCOUNT_CODE must be set together');
  });

  it('throws when the code is not exactly 6 digits', () => {
    expect(() => readServerEnv(baseEnv({
      REVIEW_ACCOUNT_EMAIL: 'storereview@example.com',
      REVIEW_ACCOUNT_CODE: '1234',
    }))).toThrow('REVIEW_ACCOUNT_CODE must be exactly 6 digits');
  });
});
