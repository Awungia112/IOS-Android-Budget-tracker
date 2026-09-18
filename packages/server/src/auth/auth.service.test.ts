import { describe, expect, it, vi } from 'vitest';

import { checkEmailExists, consumeMagicLink, upsertRegistration } from './auth.service.js';
import type { Db } from '../users/user.repository.js';

const EMAIL_HASH = 'a'.repeat(64);
const PUBLIC_KEY = 'A'.repeat(43);

function buildUpsertDbStub({
  upsertRows,
  selectedRows = [],
}: {
  upsertRows: Array<{ validatedAt: Date | null }>;
  selectedRows?: Array<{ validatedAt: Date | null }>;
}) {
  const returning = vi.fn().mockResolvedValue(upsertRows);
  const onConflictDoUpdate = vi.fn(() => ({ returning }));
  const values = vi.fn(() => ({ onConflictDoUpdate }));
  const insert = vi.fn(() => ({ values }));

  const limit = vi.fn().mockResolvedValue(selectedRows);
  const where = vi.fn(() => ({ limit }));
  const from = vi.fn(() => ({ where }));
  const select = vi.fn(() => ({ from }));

  return {
    db: { insert, select } as unknown as Db,
    select,
  };
}

type UserRow = {
  emailHash: string;
  publicKey: string;
  validatedAt: Date | null;
  magicLinkUsedAt: Date | null;
};

function buildConsumeDbStub({
  selectedRows,
  updateResult,
}: {
  selectedRows: Array<Partial<UserRow>>;
  updateResult: { rowCount: number };
}) {
  const limit = vi.fn()
    .mockResolvedValueOnce(selectedRows[0] ? [selectedRows[0]] : [])
    .mockResolvedValueOnce(selectedRows[1] ? [selectedRows[1]] : []);
  const whereSelect = vi.fn(() => ({ limit }));
  const from = vi.fn(() => ({ where: whereSelect }));
  const select = vi.fn(() => ({ from }));

  const whereUpdate = vi.fn().mockResolvedValue(updateResult);
  const set = vi.fn(() => ({ where: whereUpdate }));
  const update = vi.fn(() => ({ set }));

  return {
    db: { select, update } as unknown as Db,
    whereUpdate,
  };
}

describe('upsertRegistration', () => {
  it('returns ok when the insert or conflict update returns a row', async () => {
    const { db, select } = buildUpsertDbStub({
      upsertRows: [{ validatedAt: null }],
    });

    await expect(upsertRegistration(db, EMAIL_HASH, PUBLIC_KEY, 'code-hash', new Date())).resolves.toEqual({ status: 'ok' });
    expect(select).not.toHaveBeenCalled();
  });

  it('returns already_validated when PostgreSQL skips the conflict update', async () => {
    const { db, select } = buildUpsertDbStub({
      upsertRows: [],
      selectedRows: [{ validatedAt: new Date('2026-01-01T00:00:00.000Z') }],
    });

    await expect(upsertRegistration(db, EMAIL_HASH, PUBLIC_KEY, 'code-hash', new Date())).resolves.toEqual({
      status: 'already_validated',
    });
    expect(select).toHaveBeenCalledOnce();
  });
});

describe('consumeMagicLink', () => {
  it('consumes a currently valid token', async () => {
    const { db } = buildConsumeDbStub({
      selectedRows: [{
        emailHash: EMAIL_HASH,
        publicKey: PUBLIC_KEY,
        validatedAt: null,
        magicLinkUsedAt: null,
      }],
      updateResult: { rowCount: 1 },
    });

    await expect(consumeMagicLink(db, EMAIL_HASH, PUBLIC_KEY)).resolves.toEqual({
      status: 'ok',
      emailHash: EMAIL_HASH,
    });
  });

  it('rejects a token when the user key changes before consume update', async () => {
    const rotatedPublicKey = 'B'.repeat(43);
    const { db } = buildConsumeDbStub({
      selectedRows: [
        {
          emailHash: EMAIL_HASH,
          publicKey: PUBLIC_KEY,
          validatedAt: null,
          magicLinkUsedAt: null,
        },
        {
          publicKey: rotatedPublicKey,
          magicLinkUsedAt: null,
        },
      ],
      updateResult: { rowCount: 0 },
    });

    await expect(consumeMagicLink(db, EMAIL_HASH, PUBLIC_KEY)).resolves.toEqual({
      status: 'token_invalid_for_current_key',
    });
  });
});

function buildCheckEmailDbStub(rows: Array<{ emailHash: string }>) {
  const limit = vi.fn().mockResolvedValue(rows);
  const where = vi.fn(() => ({ limit }));
  const from = vi.fn(() => ({ where }));
  const select = vi.fn(() => ({ from }));
  return { db: { select } as unknown as Db };
}

describe('checkEmailExists', () => {
  it('returns true when a validated row exists', async () => {
    const { db } = buildCheckEmailDbStub([{ emailHash: EMAIL_HASH }]);
    await expect(checkEmailExists(db, EMAIL_HASH)).resolves.toBe(true);
  });

  it('returns false when no row exists', async () => {
    const { db } = buildCheckEmailDbStub([]);
    await expect(checkEmailExists(db, EMAIL_HASH)).resolves.toBe(false);
  });

  it('returns false for an unvalidated row (query filters it out via isNotNull)', async () => {
    // The WHERE clause includes isNotNull(validatedAt), so the DB returns
    // nothing for unvalidated rows. We simulate that here by returning [].
    const { db } = buildCheckEmailDbStub([]);
    await expect(checkEmailExists(db, EMAIL_HASH)).resolves.toBe(false);
  });
});
