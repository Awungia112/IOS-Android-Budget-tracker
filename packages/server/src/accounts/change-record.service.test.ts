import { describe, expect, it, vi } from 'vitest';

import * as schema from '../db/schema.js';
import type { Db } from '../users/user.repository.js';
import {
  CHANGE_RECORD_PULL_PAGE_SIZE,
  pullChangeRecords,
  pushChangeRecords,
} from './change-record.service.js';

const USER_ID = '22222222-2222-4222-8222-222222222222';
const ACCOUNT_ID = '11111111-1111-4111-8111-111111111111';
const OTHER_ACCOUNT_ID = '99999999-9999-4999-8999-999999999999';
const CHANGE_UUID_ONE = '33333333-3333-4333-8333-333333333333';
const CHANGE_UUID_TWO = '44444444-4444-4444-8444-444444444444';
const OPAQUE_ENCRYPTED_PAYLOAD = {
  v: 99,
  alg: 'future-symmetric-envelope',
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

function insertChain() {
  const chain = {
    values: vi.fn(() => chain),
    onConflictDoNothing: vi.fn(async () => undefined),
  };

  return chain;
}

function pushDb(input: {
  accountRows?: unknown[];
  keyRows?: unknown[];
  existingRows?: unknown[];
  currentAccountRows?: unknown[];
  conflictingRows?: unknown[];
}) {
  const insert = insertChain();
  const tx = {
    select: vi.fn()
      .mockReturnValueOnce(selectChain(input.accountRows ?? [{ id: ACCOUNT_ID }]))
      .mockReturnValueOnce(selectChain(input.keyRows ?? [{ accountId: ACCOUNT_ID }]))
      .mockReturnValueOnce(selectChain(input.existingRows ?? []))
      .mockReturnValueOnce(selectChain(input.currentAccountRows ?? []))
      .mockReturnValueOnce(selectChain(input.conflictingRows ?? [])),
    insert: vi.fn(() => insert),
  };
  const db = {
    transaction: vi.fn(async (callback) => callback(tx)),
  } as unknown as Db;

  return { db, tx, insert };
}

function pullDb(input: {
  accountRows?: unknown[];
  keyRows?: unknown[];
  records?: unknown[];
}) {
  const db = {
    select: vi.fn()
      .mockReturnValueOnce(selectChain(input.accountRows ?? [{ id: ACCOUNT_ID }]))
      .mockReturnValueOnce(selectChain(input.keyRows ?? [{ accountId: ACCOUNT_ID }]))
      .mockReturnValueOnce(selectChain(input.records ?? [])),
  } as unknown as Db;

  return db;
}

describe('pushChangeRecords', () => {
  it('authorizes an empty batch before returning ok', async () => {
    const { db, tx } = pushDb({});

    await expect(
      pushChangeRecords(db, {
        accountId: ACCOUNT_ID,
        userId: USER_ID,
        records: [],
      }),
    ).resolves.toEqual({ status: 'ok', results: [] });

    expect(tx.insert).not.toHaveBeenCalled();
  });

  it('returns forbidden for an empty batch when the caller lacks account access', async () => {
    const { db, tx } = pushDb({ keyRows: [] });

    await expect(
      pushChangeRecords(db, {
        accountId: ACCOUNT_ID,
        userId: USER_ID,
        records: [],
      }),
    ).resolves.toEqual({ status: 'forbidden' });

    expect(tx.insert).not.toHaveBeenCalled();
  });

  it('inserts encrypted records idempotently and returns assigned sequences', async () => {
    const { db, tx, insert } = pushDb({
      currentAccountRows: [
        { changeUuid: CHANGE_UUID_ONE, sequence: 1 },
        { changeUuid: CHANGE_UUID_TWO, sequence: 2 },
      ],
    });

    await expect(
      pushChangeRecords(db, {
        accountId: ACCOUNT_ID,
        userId: USER_ID,
        records: [
          {
            changeUuid: CHANGE_UUID_ONE,
            encryptedPayload: OPAQUE_ENCRYPTED_PAYLOAD,
          },
          {
            changeUuid: CHANGE_UUID_TWO,
            encryptedPayload: OPAQUE_ENCRYPTED_PAYLOAD,
          },
        ],
      }),
    ).resolves.toEqual({
      status: 'ok',
      results: [
        { changeUuid: CHANGE_UUID_ONE, sequence: 1 },
        { changeUuid: CHANGE_UUID_TWO, sequence: 2 },
      ],
    });

    expect(db.transaction).toHaveBeenCalledOnce();
    expect(tx.insert).toHaveBeenCalledWith(schema.changeRecords);
    expect(insert.values).toHaveBeenCalledWith([
      {
        accountId: ACCOUNT_ID,
        changeUuid: CHANGE_UUID_ONE,
        encryptedPayload: OPAQUE_ENCRYPTED_PAYLOAD,
      },
      {
        accountId: ACCOUNT_ID,
        changeUuid: CHANGE_UUID_TWO,
        encryptedPayload: OPAQUE_ENCRYPTED_PAYLOAD,
      },
    ]);
    expect(insert.onConflictDoNothing).toHaveBeenCalledWith({
      target: schema.changeRecords.changeUuid,
    });
  });

  it('deduplicates duplicate change UUIDs in one request and returns the existing sequence', async () => {
    const { db, insert } = pushDb({
      currentAccountRows: [{ changeUuid: CHANGE_UUID_ONE, sequence: 7 }],
    });

    await expect(
      pushChangeRecords(db, {
        accountId: ACCOUNT_ID,
        userId: USER_ID,
        records: [
          {
            changeUuid: CHANGE_UUID_ONE,
            encryptedPayload: OPAQUE_ENCRYPTED_PAYLOAD,
          },
          {
            changeUuid: CHANGE_UUID_ONE,
            encryptedPayload: { future: 'ignored duplicate payload' },
          },
        ],
      }),
    ).resolves.toEqual({
      status: 'ok',
      results: [{ changeUuid: CHANGE_UUID_ONE, sequence: 7 }],
    });

    expect(insert.values).toHaveBeenCalledWith([
      {
        accountId: ACCOUNT_ID,
        changeUuid: CHANGE_UUID_ONE,
        encryptedPayload: OPAQUE_ENCRYPTED_PAYLOAD,
      },
    ]);
  });

  it('returns change_uuid_conflict before inserting when a UUID belongs to another account', async () => {
    const { db, tx } = pushDb({
      existingRows: [{ changeUuid: CHANGE_UUID_ONE, accountId: OTHER_ACCOUNT_ID }],
    });

    await expect(
      pushChangeRecords(db, {
        accountId: ACCOUNT_ID,
        userId: USER_ID,
        records: [{
          changeUuid: CHANGE_UUID_ONE,
          encryptedPayload: OPAQUE_ENCRYPTED_PAYLOAD,
        }],
      }),
    ).resolves.toEqual({ status: 'change_uuid_conflict' });

    expect(tx.insert).not.toHaveBeenCalled();
  });

  it('does not partially insert a mixed batch when one UUID belongs to another account', async () => {
    const { db, tx } = pushDb({
      existingRows: [{ changeUuid: CHANGE_UUID_TWO, accountId: OTHER_ACCOUNT_ID }],
    });

    await expect(
      pushChangeRecords(db, {
        accountId: ACCOUNT_ID,
        userId: USER_ID,
        records: [
          {
            changeUuid: CHANGE_UUID_ONE,
            encryptedPayload: OPAQUE_ENCRYPTED_PAYLOAD,
          },
          {
            changeUuid: CHANGE_UUID_TWO,
            encryptedPayload: OPAQUE_ENCRYPTED_PAYLOAD,
          },
        ],
      }),
    ).resolves.toEqual({ status: 'change_uuid_conflict' });

    expect(tx.insert).not.toHaveBeenCalled();
  });

  it('throws missing UUID context when insert does not create or find any row', async () => {
    const { db } = pushDb({
      currentAccountRows: [],
      conflictingRows: [],
    });

    await expect(
      pushChangeRecords(db, {
        accountId: ACCOUNT_ID,
        userId: USER_ID,
        records: [{
          changeUuid: CHANGE_UUID_ONE,
          encryptedPayload: OPAQUE_ENCRYPTED_PAYLOAD,
        }],
      }),
    ).rejects.toThrow(`missing change UUIDs ${CHANGE_UUID_ONE}`);
  });

  it('returns account_not_found before inserting records', async () => {
    const { db, tx } = pushDb({ accountRows: [] });

    await expect(
      pushChangeRecords(db, {
        accountId: ACCOUNT_ID,
        userId: USER_ID,
        records: [{
          changeUuid: CHANGE_UUID_ONE,
          encryptedPayload: OPAQUE_ENCRYPTED_PAYLOAD,
        }],
      }),
    ).resolves.toEqual({ status: 'account_not_found' });

    expect(tx.insert).not.toHaveBeenCalled();
  });

  it('returns forbidden when the caller has no non-revoked account key', async () => {
    const { db, tx } = pushDb({ keyRows: [] });

    await expect(
      pushChangeRecords(db, {
        accountId: ACCOUNT_ID,
        userId: USER_ID,
        records: [{
          changeUuid: CHANGE_UUID_ONE,
          encryptedPayload: OPAQUE_ENCRYPTED_PAYLOAD,
        }],
      }),
    ).resolves.toEqual({ status: 'forbidden' });

    expect(tx.insert).not.toHaveBeenCalled();
  });
});

describe('pullChangeRecords', () => {
  it('returns account_not_found when the account is missing', async () => {
    const db = pullDb({ accountRows: [] });

    await expect(
      pullChangeRecords(db, {
        accountId: ACCOUNT_ID,
        userId: USER_ID,
        since: 0,
      }),
    ).resolves.toEqual({ status: 'account_not_found' });
  });

  it('returns forbidden when the caller has no non-revoked account key', async () => {
    const db = pullDb({ keyRows: [] });

    await expect(
      pullChangeRecords(db, {
        accountId: ACCOUNT_ID,
        userId: USER_ID,
        since: 0,
      }),
    ).resolves.toEqual({ status: 'forbidden' });
  });

  it('returns records after the cursor ordered by sequence', async () => {
    const db = pullDb({
      records: [
        {
          changeUuid: CHANGE_UUID_TWO,
          sequence: 3,
          encryptedPayload: OPAQUE_ENCRYPTED_PAYLOAD,
        },
      ],
    });

    await expect(
      pullChangeRecords(db, {
        accountId: ACCOUNT_ID,
        userId: USER_ID,
        since: 2,
      }),
    ).resolves.toEqual({
      status: 'ok',
      records: [{
        changeUuid: CHANGE_UUID_TWO,
        sequence: 3,
        encryptedPayload: OPAQUE_ENCRYPTED_PAYLOAD,
      }],
      nextSince: null,
    });
  });

  it('returns at most one page and nextSince when more records exist', async () => {
    const rows = Array.from({ length: CHANGE_RECORD_PULL_PAGE_SIZE + 1 }, (_, index) => ({
      changeUuid: `33333333-3333-4333-8333-${String(index + 1).padStart(12, '0')}`,
      sequence: index + 1,
      encryptedPayload: OPAQUE_ENCRYPTED_PAYLOAD,
    }));
    const db = pullDb({ records: rows });

    const result = await pullChangeRecords(db, {
      accountId: ACCOUNT_ID,
      userId: USER_ID,
      since: 0,
    });

    expect(result.status).toBe('ok');
    if (result.status !== 'ok') return;

    expect(result.records).toHaveLength(CHANGE_RECORD_PULL_PAGE_SIZE);
    expect(result.records.at(-1)?.sequence).toBe(CHANGE_RECORD_PULL_PAGE_SIZE);
    expect(result.nextSince).toBe(CHANGE_RECORD_PULL_PAGE_SIZE);
  });
});
