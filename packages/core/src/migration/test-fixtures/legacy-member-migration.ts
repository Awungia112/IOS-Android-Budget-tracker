import type { AsymmetricEnvelope } from '../../crypto/envelope';

// =============================================================================
// SHARED TEST CONSTANTS
// =============================================================================

export const SERVER_ACCOUNT_ID = '22222222-2222-4222-8222-222222222222';
export const OWNER_USER_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
export const REGISTERED_MEMBER_USER_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

export const OWNER_EMAIL = 'owner@example.com';
export const REGISTERED_MEMBER_EMAIL = 'registered-member@example.com';
export const UNREGISTERED_MEMBER_EMAIL = 'unregistered@example.com';

export const TEST_ACCOUNT_KEY = new Uint8Array(32).fill(42);
export const TEST_EPOCH = 1;
export const TEST_EMAIL_HASH_PEPPER = 'test-pepper';
export const TEST_SENDER_NAME = 'Test Sender';
export const TEST_ACCOUNT_NAME = 'Shared Budget';

export const OWNER_PUBLIC_KEY_BASE64 = 'x'.repeat(43);
export const REGISTERED_MEMBER_PUBLIC_KEY_BASE64 = 'y'.repeat(43);
