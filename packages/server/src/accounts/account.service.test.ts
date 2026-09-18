import { describe, expect, it, vi } from 'vitest';

import * as schema from '../db/schema.js';
import type { Db } from '../users/user.repository.js';
import {
  batchUploadWrappedKeys,
  createAccountWithOwnerKey,
  getAccountKeyForUser,
  listAccountsForUser,
  removeAccountMember,
  removeAccountMemberAndUploadWrappedKeys,
} from './account.service.js';

const USER_ID = '22222222-2222-4222-8222-222222222222';
const ACCOUNT_ID = '11111111-1111-4111-8111-111111111111';
const WRAPPED_KEY = {
  v: 99,
  alg: 'future-envelope',
  ciphertext: 'opaque-to-server',
};

function selectChain(rows: unknown[]) {
  const chain = {
    from: vi.fn(() => chain),
    where: vi.fn(() => chain),
    orderBy: vi.fn(() => chain),
    limit: vi.fn(async () => rows),
  };

  return chain;
}

function listAccountsSelectChain(rows: unknown[]) {
  const recordCounts = {
    accountId: 'record_counts.account_id',
    recordCount: 'record_counts.record_count',
  };
  const recordCountsChain = {
    from: vi.fn(() => recordCountsChain),
    groupBy: vi.fn(() => recordCountsChain),
    as: vi.fn(() => recordCounts),
  };
  const accountsChain = {
    from: vi.fn(() => accountsChain),
    innerJoin: vi.fn(() => accountsChain),
    leftJoin: vi.fn(async () => rows),
  };

  return { recordCountsChain, accountsChain };
}

describe('createAccountWithOwnerKey', () => {
  it('inserts account and owner key inside one transaction', async () => {
    const accountReturning = vi.fn(async () => [{ id: ACCOUNT_ID, keyEpoch: 1 }]);
    const accountValues = vi.fn(() => ({ returning: accountReturning }));
    const keyValues = vi.fn(async () => undefined);
    const memberValues = vi.fn(async () => undefined);
    const tx = {
      insert: vi.fn()
        .mockReturnValueOnce({ values: accountValues })
        .mockReturnValueOnce({ values: keyValues })
        .mockReturnValueOnce({ values: memberValues }),
    };
    const db = {
      transaction: vi.fn(async (callback) => callback(tx)),
    } as unknown as Db;

    await expect(
      createAccountWithOwnerKey(db, {
        userId: USER_ID,
        wrappedKey: WRAPPED_KEY,
        epoch: 1,
      }),
    ).resolves.toEqual({
      id: ACCOUNT_ID,
      keyEpoch: 1,
    });

    expect(db.transaction).toHaveBeenCalledOnce();
    expect(tx.insert).toHaveBeenNthCalledWith(1, schema.accounts);
    expect(accountValues).toHaveBeenCalledWith({
      ownerUserId: USER_ID,
      keyEpoch: 1,
    });
    expect(tx.insert).toHaveBeenNthCalledWith(2, schema.accountKeys);
    expect(keyValues).toHaveBeenCalledWith({
      accountId: ACCOUNT_ID,
      userId: USER_ID,
      wrappedKey: WRAPPED_KEY,
      epoch: 1,
    });
    expect(tx.insert).toHaveBeenNthCalledWith(3, schema.accountMembers);
    expect(memberValues).toHaveBeenCalledWith({
      accountId: ACCOUNT_ID,
      userId: USER_ID,
      role: 'owner',
    });
  });

  it('fails before inserting account_keys when account insert returns no row', async () => {
    const accountReturning = vi.fn(async () => []);
    const accountValues = vi.fn(() => ({ returning: accountReturning }));
    const tx = {
      insert: vi.fn().mockReturnValueOnce({ values: accountValues }),
    };
    const db = {
      transaction: vi.fn(async (callback) => callback(tx)),
    } as unknown as Db;

    await expect(
      createAccountWithOwnerKey(db, {
        userId: USER_ID,
        wrappedKey: WRAPPED_KEY,
        epoch: 1,
      }),
    ).rejects.toThrow('account_create_failed');

    expect(tx.insert).toHaveBeenCalledOnce();
  });
});

describe('listAccountsForUser', () => {
  it('maps active account memberships with record counts', async () => {
    const createdAt = new Date('2026-06-01T00:00:00.000Z');
    const { recordCountsChain, accountsChain } = listAccountsSelectChain([{
      id: ACCOUNT_ID,
      keyEpoch: 2,
      role: 'owner',
      recordCount: 50,
      createdAt,
    }]);
    const db = {
      select: vi.fn()
        .mockReturnValueOnce(recordCountsChain)
        .mockReturnValueOnce(accountsChain),
    } as unknown as Db;

    await expect(listAccountsForUser(db, { userId: USER_ID })).resolves.toEqual([{
      id: ACCOUNT_ID,
      keyEpoch: 2,
      role: 'owner',
      recordCount: 50,
      createdAt,
    }]);

    expect(db.select).toHaveBeenCalledTimes(2);
    expect(accountsChain.innerJoin).toHaveBeenCalledTimes(2);
    expect(accountsChain.leftJoin).toHaveBeenCalledOnce();
  });
});

describe('getAccountKeyForUser', () => {
  it('returns account_not_found when the account is missing', async () => {
    const accountSelect = selectChain([]);
    const db = {
      select: vi.fn().mockReturnValueOnce(accountSelect),
    } as unknown as Db;

    await expect(
      getAccountKeyForUser(db, {
        accountId: ACCOUNT_ID,
        userId: USER_ID,
      }),
    ).resolves.toEqual({ status: 'account_not_found' });

    expect(db.select).toHaveBeenCalledOnce();
  });

  it('returns forbidden when the account exists but no user key is visible', async () => {
    const accountSelect = selectChain([{ id: ACCOUNT_ID }]);
    const keySelect = selectChain([]);
    const db = {
      select: vi.fn()
        .mockReturnValueOnce(accountSelect)
        .mockReturnValueOnce(keySelect),
    } as unknown as Db;

    await expect(
      getAccountKeyForUser(db, {
        accountId: ACCOUNT_ID,
        userId: USER_ID,
        epoch: 1,
      }),
    ).resolves.toEqual({ status: 'forbidden' });
  });

  it('returns the authenticated user key row', async () => {
    const accountSelect = selectChain([{ id: ACCOUNT_ID }]);
    const keySelect = selectChain([{
      accountId: ACCOUNT_ID,
      epoch: 1,
      wrappedKey: WRAPPED_KEY,
    }]);
    const db = {
      select: vi.fn()
        .mockReturnValueOnce(accountSelect)
        .mockReturnValueOnce(keySelect),
    } as unknown as Db;

    await expect(
      getAccountKeyForUser(db, {
        accountId: ACCOUNT_ID,
        userId: USER_ID,
        epoch: 1,
      }),
    ).resolves.toEqual({
      status: 'ok',
      accountId: ACCOUNT_ID,
      epoch: 1,
      wrappedKey: WRAPPED_KEY,
    });
  });
});

const OWNER_ID = '33333333-3333-4333-8333-333333333333';
const NON_MEMBER_ID = '44444444-4444-4444-8444-444444444444';

describe('removeAccountMember', () => {
  function makeTx(opts: { removeMemberRole?: string }) {
    const { removeMemberRole = 'member' } = opts;

    const verifyOwnerSelect = {
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      limit: vi.fn(async () => [{ role: 'owner' }]),
    };

    const memberToRemoveSelect = {
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      limit: vi.fn(async () => [{ role: removeMemberRole }]),
    };

    const removedUserSelect = {
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      limit: vi.fn(async () => [{ emailHash: 'removed-user-email-hash' }]),
    };

    const inviteWhere = vi.fn(async () => undefined);
    const inviteSet = vi.fn(() => ({ where: inviteWhere }));

    const revokeWhere = vi.fn(async () => undefined);
    const revokeSet = vi.fn(() => ({ where: revokeWhere }));

    const accountUpdateReturning = vi.fn(async () => [{ keyEpoch: 2 }]);
    const accountUpdateWhere = vi.fn(() => ({ returning: accountUpdateReturning }));
    const accountUpdateSet = vi.fn(() => ({ where: accountUpdateWhere }));

    const update = vi.fn()
      .mockReturnValueOnce({ set: inviteSet })
      .mockReturnValueOnce({ set: revokeSet })
      .mockReturnValueOnce({ set: accountUpdateSet });

    const deleteWhere = vi.fn(async () => undefined);
    const deleteFn = vi.fn(() => ({ where: deleteWhere }));

    const tx = {
      select: vi.fn()
        .mockReturnValueOnce(verifyOwnerSelect)
        .mockReturnValueOnce(memberToRemoveSelect)
        .mockReturnValueOnce(removedUserSelect),
      delete: deleteFn,
      update,
    } as unknown as Db;

    return { tx, inviteSet, inviteWhere };
  }

  it('revokes accepted invites while removing a member', async () => {
    const { tx, inviteSet, inviteWhere } = makeTx({});
    const db = {
      transaction: vi.fn(async (cb) => cb(tx)),
    } as unknown as Db;

    await expect(
      removeAccountMember(db, {
        accountId: ACCOUNT_ID,
        requestorUserId: OWNER_ID,
        userIdToRemove: NON_MEMBER_ID,
      }),
    ).resolves.toEqual({ status: 'ok', newEpoch: 2 });

    expect(tx.delete).toHaveBeenCalledOnce();
    expect(inviteSet).toHaveBeenCalledWith({
      status: 'revoked',
      respondedAt: expect.anything(),
    });
    expect(inviteWhere).toHaveBeenCalledOnce();
  });

  it('does not remove another owner', async () => {
    const { tx } = makeTx({ removeMemberRole: 'owner' });
    const db = {
      transaction: vi.fn(async (cb) => cb(tx)),
    } as unknown as Db;

    await expect(
      removeAccountMember(db, {
        accountId: ACCOUNT_ID,
        requestorUserId: OWNER_ID,
        userIdToRemove: NON_MEMBER_ID,
      }),
    ).resolves.toEqual({ status: 'cannot_remove_owner' });

    expect(tx.delete).not.toHaveBeenCalled();
    expect(tx.update).not.toHaveBeenCalled();
  });
});

describe('batchUploadWrappedKeys', () => {
  /**
   * Builds a minimal transaction mock that passes owner auth, returns
   * the given account epoch, and exposes the current member list.
   */
  function makeTx(opts: {
    ownerRole?: string;
    keyEpoch?: number;
    members?: Array<{ userId: string }>;
    insertResult?: unknown;
  }) {
    const { ownerRole = 'owner', keyEpoch = 2, members = [{ userId: OWNER_ID }], insertResult } = opts;

    const memberSelect = {
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      limit: vi.fn(async () => [{ role: ownerRole }]),
    };

    const accountSelect = {
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      limit: vi.fn(async () => [{ keyEpoch }]),
    };

    // The third select call fetches the full member list (no .limit())
    const memberListSelect = {
      from: vi.fn().mockReturnThis(),
      where: vi.fn(async () => members),
    };

    const onConflictDoUpdate = vi.fn(async () => insertResult ?? undefined);
    const insertValues = vi.fn(() => ({ onConflictDoUpdate }));

    return {
      tx: {
        select: vi.fn()
          .mockReturnValueOnce(memberSelect)   // verifyOwnerAccess
          .mockReturnValueOnce(accountSelect)  // epoch check
          .mockReturnValueOnce(memberListSelect), // member set fetch
        insert: vi.fn(() => ({ values: insertValues })),
      },
      onConflictDoUpdate,
      insertValues,
    };
  }

  it('returns non_member when a userId in wrapped_keys is not in account_members', async () => {
    const { tx } = makeTx({ members: [{ userId: OWNER_ID }] });
    const db = {
      transaction: vi.fn(async (cb) => cb(tx)),
    } as unknown as Db;

    await expect(
      batchUploadWrappedKeys(db, {
        accountId: ACCOUNT_ID,
        requestorUserId: OWNER_ID,
        newEpoch: 2,
        wrappedKeys: [
          { userId: OWNER_ID, wrappedKey: WRAPPED_KEY },
          { userId: NON_MEMBER_ID, wrappedKey: WRAPPED_KEY }, // removed user
        ],
      }),
    ).resolves.toEqual({ status: 'non_member', userId: NON_MEMBER_ID });

    // No insert should have been attempted
    expect(tx.insert).not.toHaveBeenCalled();
  });

  it('returns ok and inserts when all userIds are current members', async () => {
    const { tx, onConflictDoUpdate } = makeTx({
      members: [{ userId: OWNER_ID }],
    });
    const db = {
      transaction: vi.fn(async (cb) => cb(tx)),
    } as unknown as Db;

    await expect(
      batchUploadWrappedKeys(db, {
        accountId: ACCOUNT_ID,
        requestorUserId: OWNER_ID,
        newEpoch: 2,
        wrappedKeys: [{ userId: OWNER_ID, wrappedKey: WRAPPED_KEY }],
      }),
    ).resolves.toEqual({ status: 'ok' });

    expect(onConflictDoUpdate).toHaveBeenCalledOnce();
  });

  it('returns epoch_mismatch when newEpoch does not match the account epoch', async () => {
    const { tx } = makeTx({ keyEpoch: 3 }); // account is at epoch 3, request says 2
    const db = {
      transaction: vi.fn(async (cb) => cb(tx)),
    } as unknown as Db;

    await expect(
      batchUploadWrappedKeys(db, {
        accountId: ACCOUNT_ID,
        requestorUserId: OWNER_ID,
        newEpoch: 2,
        wrappedKeys: [{ userId: OWNER_ID, wrappedKey: WRAPPED_KEY }],
      }),
    ).resolves.toEqual({ status: 'epoch_mismatch' });
  });
});

describe('removeAccountMemberAndUploadWrappedKeys', () => {
  function makeTx(opts: {
    ownerRole?: string;
    keyEpoch?: number;
    members?: Array<{ userId: string }>;
    removeMemberExists?: boolean;
    removeMemberRole?: string;
  }) {
    const {
      ownerRole = 'owner',
      keyEpoch = 2,
      members = [{ userId: OWNER_ID }],
      removeMemberExists = true,
      removeMemberRole = 'member',
    } = opts;

    const verifyOwnerSelect = {
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      limit: vi.fn(async () => [{ role: ownerRole }]),
    };

    const memberToRemoveSelect = {
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      limit: vi.fn(async () => (removeMemberExists ? [{ role: removeMemberRole }] : [])),
    };

    const removedUserSelect = {
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      limit: vi.fn(async () => [{ emailHash: 'removed-user-email-hash' }]),
    };

    const membersSelect = {
      from: vi.fn().mockReturnThis(),
      where: vi.fn(async () => members),
    };

    const inviteWhere = vi.fn(async () => undefined);
    const inviteSet = vi.fn(() => ({ where: inviteWhere }));

    const revokeWhere = vi.fn(async () => undefined);
    const revokeSet = vi.fn(() => ({ where: revokeWhere }));

    const accountUpdateReturning = vi.fn(async () => [{ keyEpoch }]);
    const accountUpdateWhere = vi.fn(() => ({ returning: accountUpdateReturning }));
    const accountUpdateSet = vi.fn(() => ({ where: accountUpdateWhere }));

    const update = vi.fn()
      .mockReturnValueOnce({ set: inviteSet })
      .mockReturnValueOnce({ set: revokeSet })
      .mockReturnValueOnce({ set: accountUpdateSet });

    const deleteWhere = vi.fn(async () => undefined);
    const deleteFn = vi.fn(() => ({ where: deleteWhere }));

    const onConflictDoUpdate = vi.fn(async () => undefined);
    const insertValues = vi.fn(() => ({ onConflictDoUpdate }));
    const insert = vi.fn(() => ({ values: insertValues }));

    const tx = {
      select: vi.fn()
        .mockReturnValueOnce(verifyOwnerSelect)
        .mockReturnValueOnce(memberToRemoveSelect)
        .mockReturnValueOnce(removedUserSelect)
        .mockReturnValueOnce(membersSelect),
      delete: deleteFn,
      update,
      insert,
    } as unknown as Db;

    return { tx, onConflictDoUpdate, inviteSet, inviteWhere };
  }

  it('removes a member and uploads wrapped keys in one transaction', async () => {
    const { tx, onConflictDoUpdate, inviteSet, inviteWhere } = makeTx({ members: [{ userId: OWNER_ID }, { userId: ACCOUNT_ID }] });
    const db = {
      transaction: vi.fn(async (cb) => cb(tx)),
    } as unknown as Db;

    await expect(
      removeAccountMemberAndUploadWrappedKeys(db, {
        accountId: ACCOUNT_ID,
        requestorUserId: OWNER_ID,
        userIdToRemove: NON_MEMBER_ID,
        wrappedKeys: [
          { userId: OWNER_ID, wrappedKey: WRAPPED_KEY },
          { userId: ACCOUNT_ID, wrappedKey: WRAPPED_KEY },
        ],
      }),
    ).resolves.toEqual({ status: 'ok', newEpoch: 2 });

    expect(tx.delete).toHaveBeenCalledOnce();
    expect(inviteSet).toHaveBeenCalledWith({
      status: 'revoked',
      respondedAt: expect.anything(),
    });
    expect(inviteWhere).toHaveBeenCalledOnce();
    expect(onConflictDoUpdate).toHaveBeenCalledTimes(2);
  });

  it('returns non_member when a wrapped key targets a removed user', async () => {
    const { tx } = makeTx({ members: [{ userId: OWNER_ID }] });
    const db = {
      transaction: vi.fn(async (cb) => cb(tx)),
    } as unknown as Db;

    await expect(
      removeAccountMemberAndUploadWrappedKeys(db, {
        accountId: ACCOUNT_ID,
        requestorUserId: OWNER_ID,
        userIdToRemove: NON_MEMBER_ID,
        wrappedKeys: [
          { userId: OWNER_ID, wrappedKey: WRAPPED_KEY },
          { userId: NON_MEMBER_ID, wrappedKey: WRAPPED_KEY },
        ],
      }),
    ).resolves.toEqual({ status: 'non_member', userId: NON_MEMBER_ID });

    expect(tx.insert).not.toHaveBeenCalled();
  });

  it('does not remove another owner while uploading wrapped keys', async () => {
    const { tx } = makeTx({ removeMemberRole: 'owner' });
    const db = {
      transaction: vi.fn(async (cb) => cb(tx)),
    } as unknown as Db;

    await expect(
      removeAccountMemberAndUploadWrappedKeys(db, {
        accountId: ACCOUNT_ID,
        requestorUserId: OWNER_ID,
        userIdToRemove: NON_MEMBER_ID,
        wrappedKeys: [{ userId: OWNER_ID, wrappedKey: WRAPPED_KEY }],
      }),
    ).resolves.toEqual({ status: 'cannot_remove_owner' });

    expect(tx.delete).not.toHaveBeenCalled();
    expect(tx.insert).not.toHaveBeenCalled();
  });
});
