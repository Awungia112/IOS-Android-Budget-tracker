import { describe, expect, it } from 'vitest';
import type { MigrationAccount } from './local-legacy-types.js';
import {
  isServerMirroredAccount,
  serverAccountKey,
} from './server-mirror-predicate.js';

function makeAccount(overrides: Partial<MigrationAccount> = {}): MigrationAccount {
  return {
    id: 'account-1',
    name: 'Account',
    legacyId: 1,
    legacySource: 'realm',
    ...overrides,
  };
}

describe('server mirror account helpers', () => {
  it('returns true for a Realm account with an online link and no explicit isOnline flag', () => {
    const account = makeAccount({
      legacySource: 'realm',
      onlineId: '100',
    });

    expect(isServerMirroredAccount(account)).toBe(true);
    expect(serverAccountKey(account)).toBe('100');
  });

  it('returns true for a Room account with isOnline set to true', () => {
    const account = makeAccount({
      legacySource: 'room',
      isOnline: true,
    });

    expect(isServerMirroredAccount(account)).toBe(true);
    expect(serverAccountKey(account)).toBeUndefined();
  });

  it('returns false for the synthetic Core Data account', () => {
    const account = makeAccount({
      id: 'core-data-account',
      legacyId: 0,
      legacySource: 'core_data',
      isOnline: false,
    });

    expect(isServerMirroredAccount(account)).toBe(false);
    expect(serverAccountKey(account)).toBeUndefined();
  });

  it('returns false for a local-only Realm account without online metadata', () => {
    const account = makeAccount({
      legacySource: 'realm',
      isOnline: false,
    });

    expect(isServerMirroredAccount(account)).toBe(false);
    expect(serverAccountKey(account)).toBeUndefined();
  });
});
