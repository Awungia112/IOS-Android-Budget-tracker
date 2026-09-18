import { describe, expect, it, vi } from 'vitest';

import * as schema from '../db/schema.js';
import type { Db } from '../users/user.repository.js';
import { deliverWrappedKey } from './invite.service.js';

const ACCOUNT_ID = '11111111-1111-4111-8111-111111111111';
const OWNER_ID = '22222222-2222-4222-8222-222222222222';
const RECIPIENT_ID = '33333333-3333-4333-8333-333333333333';
const WRAPPED_KEY = {
  v: 99,
  alg: 'future-envelope',
  ciphertext: 'opaque-to-server',
};

describe('deliverWrappedKey', () => {
  it('stores the delivered key at the current epoch instead of reactivating old revoked keys', async () => {
    const ownerMembershipSelect = {
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      limit: vi.fn(async () => [{ role: 'owner' }]),
    };
    const recipientUserSelect = {
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      limit: vi.fn(async () => [{ emailHash: 'recipient-email-hash' }]),
    };
    const inviteSelect = {
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      limit: vi.fn(async () => [{ id: 'invite-id' }]),
    };
    const activeKeySelect = {
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      limit: vi.fn(async () => []),
    };
    const recipientOwnerSelect = {
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      limit: vi.fn(async () => []),
    };
    const inviteRowSelect = {
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      limit: vi.fn(async () => [{ recipientEmail: 'encrypted-recipient-email' }]),
    };

    const accountKeyOnConflictDoUpdate = vi.fn(async () => undefined);
    const accountKeyValues = vi.fn(() => ({ onConflictDoUpdate: accountKeyOnConflictDoUpdate }));
    const memberOnConflictDoUpdate = vi.fn(async () => undefined);
    const memberValues = vi.fn(() => ({ onConflictDoUpdate: memberOnConflictDoUpdate }));

    const tx = {
      select: vi.fn()
        .mockReturnValueOnce(ownerMembershipSelect)
        .mockReturnValueOnce(recipientUserSelect)
        .mockReturnValueOnce(inviteSelect)
        .mockReturnValueOnce(activeKeySelect)
        .mockReturnValueOnce(recipientOwnerSelect)
        .mockReturnValueOnce(inviteRowSelect),
      insert: vi.fn()
        .mockReturnValueOnce({ values: accountKeyValues })
        .mockReturnValueOnce({ values: memberValues }),
    };
    const db = {
      transaction: vi.fn(async (callback) => callback(tx)),
    } as unknown as Db;

    await expect(
      deliverWrappedKey(db, {
        accountId: ACCOUNT_ID,
        ownerUserId: OWNER_ID,
        recipientUserId: RECIPIENT_ID,
        wrappedKey: WRAPPED_KEY,
        epoch: 2,
      }),
    ).resolves.toEqual({ status: 'ok' });

    expect(tx.insert).toHaveBeenNthCalledWith(1, schema.accountKeys);
    expect(accountKeyValues).toHaveBeenCalledWith({
      accountId: ACCOUNT_ID,
      userId: RECIPIENT_ID,
      wrappedKey: WRAPPED_KEY,
      epoch: 2,
    });
    expect(accountKeyOnConflictDoUpdate).toHaveBeenCalledWith({
      target: [schema.accountKeys.accountId, schema.accountKeys.userId, schema.accountKeys.epoch],
      set: {
        wrappedKey: WRAPPED_KEY,
        revokedAt: null,
      },
    });
  });
});
