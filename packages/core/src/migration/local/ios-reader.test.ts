import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mergeByLegacyId, readAlliOSData } from './ios-reader.js';
import type { RealmMigrationPayload } from './ios-realm-reader.js';

const mocks = vi.hoisted(() => ({
  readAlliOSCoreData: vi.fn(),
  readRealmData: vi.fn(),
}));

vi.mock('./ios-coredata-reader', () => ({
  readAlliOSCoreData: mocks.readAlliOSCoreData,
}));

vi.mock('./ios-realm-reader', () => ({
  readRealmData: mocks.readRealmData,
}));

function emptyRealmMigrationPayload(): RealmMigrationPayload {
  return {
    accounts: [],
    transactions: [],
    categories: [],
    savingGoals: [],
    recurringEntries: [],
    templates: [],
    limits: [],
  };
}

function emptyCoreDataMigrationPayload(): Partial<RealmMigrationPayload> {
  return emptyRealmMigrationPayload();
}

describe('iOS local reader', () => {
  beforeEach(() => {
    mocks.readAlliOSCoreData.mockReset();
    mocks.readRealmData.mockReset();
    mocks.readAlliOSCoreData.mockResolvedValue(emptyCoreDataMigrationPayload());
    mocks.readRealmData.mockResolvedValue(emptyRealmMigrationPayload());
  });

  it('merges by legacyId with Realm records taking precedence', () => {
    const result = mergeByLegacyId(
      [
        { id: 'core-1', legacyId: 1, legacySource: 'core_data' as const },
        { id: 'core-2', legacyId: 2, legacySource: 'core_data' as const },
      ],
      [
        { id: 'realm-1', legacyId: 1, legacySource: 'realm' as const },
      ],
    );

    expect(result).toEqual([
      { id: 'realm-1', legacyId: 1, legacySource: 'realm' },
      { id: 'core-2', legacyId: 2, legacySource: 'core_data' },
    ]);
  });

  it('treats numeric and string legacy IDs as the same duplicate key', () => {
    const result = mergeByLegacyId(
      [{ id: 'core-1', legacyId: 1 }],
      [{ id: 'realm-1', legacyId: '1' }],
    );

    expect(result).toEqual([{ id: 'realm-1', legacyId: '1' }]);
  });

  it('combines Core Data and Realm readers with Realm precedence', async () => {
    const coreDataPayload = {
      ...emptyCoreDataMigrationPayload(),
      accounts: [
        {
          id: 'core-account-1',
          name: 'Core Data duplicate',
          legacyId: 1,
          legacySource: 'core_data' as const,
        },
        {
          id: 'core-account-2',
          name: 'Core Data only',
          legacyId: 2,
          legacySource: 'core_data' as const,
        },
      ],
    };
    const realmPayload = {
      ...emptyRealmMigrationPayload(),
      accounts: [{
        id: 'account-1',
        name: 'Main',
        legacyId: 1,
        legacySource: 'realm' as const,
      }],
    };
    mocks.readAlliOSCoreData.mockResolvedValue(coreDataPayload);
    mocks.readRealmData.mockResolvedValue(realmPayload);

    const result = await readAlliOSData();

    expect(mocks.readAlliOSCoreData).toHaveBeenCalledOnce();
    expect(mocks.readRealmData).toHaveBeenCalledOnce();
    expect(result.accounts).toEqual([
      realmPayload.accounts[0],
      coreDataPayload.accounts[1],
    ]);
  });
});
