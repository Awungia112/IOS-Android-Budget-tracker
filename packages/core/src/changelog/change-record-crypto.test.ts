// @vitest-environment node

import 'fake-indexeddb/auto';
import { vi } from 'vitest';

vi.mock('../crypto/private-key-store-plugin', () => import('../crypto/private-key-store-plugin.test-mock'));

/**
 * change-record-crypto tests
 *
 * Covers:
 *  1. Full round-trip: encrypt → decrypt → original record
 *  2. Wrong key throws on decryption
 *  3. Tampered ciphertext throws on decryption
 *  4. UploadQueue persists across simulated restart (clear + re-instantiate)
 *  5. ChangeLog.append() enqueues an encrypted entry when accountKey is provided
 *  6. ChangeLog.append() does NOT enqueue when no accountKey is provided
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { encryptChangeRecord, decryptChangeRecord } from './change-record-crypto.js';
import { UploadQueue } from './upload-queue.js';
import { ChangeLog } from './change-log.js';
import { generateAccountKey } from '../crypto/account-key.js';
import type { ChangeRecord } from '../commands/types.js';
import { COMMAND_TYPES } from '../commands/types.js';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeRecord(overrides: Partial<ChangeRecord> = {}): ChangeRecord {
  return {
    id: 'rec-001',
    accountId: 'acct-001',
    timestamp: '2024-01-01T00:00:00.000Z',
    synced: false,
    command: {
      type: COMMAND_TYPES.CREATE_TRANSACTION,
      timestamp: '2024-01-01T00:00:00.000Z',
      sequence: 1,
      payload: {
        type: 'expense',
        amount: 42,
        category: 'cat-1',
        date: '2024-01-01',
        title: 'Coffee',
      },
    },
    ...overrides,
  };
}

// ─── Round-trip tests ─────────────────────────────────────────────────────────

describe('encryptChangeRecord / decryptChangeRecord', () => {
  let accountKey: Uint8Array;

  beforeEach(async () => {
    accountKey = await generateAccountKey();
  });

  it('round-trips a ChangeRecord without data loss', async () => {
    const original = makeRecord();
    const envelope = await encryptChangeRecord(original, accountKey);
    const recovered = await decryptChangeRecord(envelope, accountKey);

    expect(recovered).toEqual(original);
  });

  it('envelope carries the expected algorithm field', async () => {
    const envelope = await encryptChangeRecord(makeRecord(), accountKey);
    expect(envelope.alg).toBe('xsalsa20-poly1305');
    expect(envelope.v).toBe(1);
  });

  it('throws when decrypting with the wrong key', async () => {
    const wrongKey = await generateAccountKey();
    const envelope = await encryptChangeRecord(makeRecord(), accountKey);

    await expect(decryptChangeRecord(envelope, wrongKey)).rejects.toThrow(
      /decryption failed/i,
    );
  });

  it('throws when the ciphertext is tampered', async () => {
    const envelope = await encryptChangeRecord(makeRecord(), accountKey);
    // Corrupt the last byte of the ciphertext — may produce an invalid base64url
    // string (sodium throws "invalid input") or a bad MAC (throws "decryption failed")
    const last = envelope.ciphertext[envelope.ciphertext.length - 1];
    const tampered = {
      ...envelope,
      ciphertext: envelope.ciphertext.slice(0, -1) + (last === 'A' ? 'B' : 'A'),
    };

    await expect(decryptChangeRecord(tampered, accountKey)).rejects.toThrow();
  });

  it('two encryptions of the same record produce different ciphertexts (random nonce)', async () => {
    const record = makeRecord();
    const env1 = await encryptChangeRecord(record, accountKey);
    const env2 = await encryptChangeRecord(record, accountKey);

    expect(env1.nonce).not.toBe(env2.nonce);
    expect(env1.ciphertext).not.toBe(env2.ciphertext);
  });
});

// ─── UploadQueue persistence tests ───────────────────────────────────────────

describe('UploadQueue', () => {
  let queue: UploadQueue;

  beforeEach(async () => {
    queue = new UploadQueue();
    await queue.clear();
  });

  afterEach(async () => {
    await queue.clear();
  });

  it('enqueues an entry and retrieves it', async () => {
    const accountKey = await generateAccountKey();
    const record = makeRecord();
    const envelope = await encryptChangeRecord(record, accountKey);

    await queue.enqueue({
      change_uuid: record.id,
      encrypted_payload: envelope,
      localAccountId: record.accountId
    });

    const entries = await queue.getAll();
    expect(entries).toHaveLength(1);
    expect(entries[0].change_uuid).toBe(record.id);
    expect(entries[0].encrypted_payload.alg).toBe('xsalsa20-poly1305');
  });

  it('survives a simulated app restart (new instance reads same IndexedDB)', async () => {
    const accountKey = await generateAccountKey();
    const record = makeRecord();
    const envelope = await encryptChangeRecord(record, accountKey);

    // First "session": enqueue
    await queue.enqueue({
      change_uuid: record.id,
      encrypted_payload: envelope,
      localAccountId: record.accountId
    });

    // Simulated restart: new instance, same Dexie db singleton
    const queueAfterRestart = new UploadQueue();
    const entries = await queueAfterRestart.getAll();

    expect(entries).toHaveLength(1);
    expect(entries[0].change_uuid).toBe(record.id);

    // Confirm the payload round-trips correctly after restart
    const recovered = await decryptChangeRecord(entries[0].encrypted_payload, accountKey);
    expect(recovered).toEqual(record);
  });

  it('is idempotent: enqueueing same change_uuid twice keeps one entry', async () => {
    const accountKey = await generateAccountKey();
    const record = makeRecord();
    const envelope = await encryptChangeRecord(record, accountKey);

    await queue.enqueue({
      change_uuid: record.id,
      encrypted_payload: envelope,
      localAccountId: record.accountId
    });
    await queue.enqueue({
      change_uuid: record.id,
      encrypted_payload: envelope,
      localAccountId: record.accountId
    });

    expect(await queue.count()).toBe(1);
  });

  it('removes an entry after upload', async () => {
    const accountKey = await generateAccountKey();
    const record = makeRecord();
    const envelope = await encryptChangeRecord(record, accountKey);

    await queue.enqueue({
      change_uuid: record.id,
      encrypted_payload: envelope,
      localAccountId: record.accountId
    });
    await queue.remove(record.id);
    expect(await queue.count()).toBe(0);
  });

  it('removes multiple entries in a batch', async () => {
    const accountKey = await generateAccountKey();
    const r1 = makeRecord({ id: 'rec-1' });
    const r2 = makeRecord({ id: 'rec-2' });
    const e1 = await encryptChangeRecord(r1, accountKey);
    const e2 = await encryptChangeRecord(r2, accountKey);

    await queue.enqueue({ change_uuid: r1.id, encrypted_payload: e1, localAccountId: r1.accountId });
    await queue.enqueue({ change_uuid: r2.id, encrypted_payload: e2, localAccountId: r2.accountId });
    
    expect(await queue.count()).toBe(2);
    
    await queue.removeMany([r1.id, r2.id]);
    expect(await queue.count()).toBe(0);
  });
});

// ─── ChangeLog integration ────────────────────────────────────────────────────

describe('ChangeLog.append() with encryption', () => {
  let log: ChangeLog;
  let queue: UploadQueue;

  beforeEach(async () => {
    log = new ChangeLog();
    queue = new UploadQueue();
    await log.clear();
    await queue.clear();
  });

  afterEach(async () => {
    await log.clear();
    await queue.clear();
  });

  it('enqueues an encrypted entry when accountKey is provided', async () => {
    const accountKey = await generateAccountKey();

    const record = await log.append(
      {
        type: COMMAND_TYPES.CREATE_TRANSACTION,
        timestamp: '2024-01-01T00:00:00.000Z',
        payload: { type: 'expense', amount: 10, category: 'cat-1', date: '2024-01-01', title: 'Test' },
      },
      'acct-001',
      accountKey,
    );

    const entries = await queue.getAll();
    expect(entries).toHaveLength(1);
    expect(entries[0].change_uuid).toBe(record.id);

    // Confirm the queued entry decrypts back to the original record
    const recovered = await decryptChangeRecord(entries[0].encrypted_payload, accountKey);
    expect(recovered.id).toBe(record.id);
    expect(recovered.command.type).toBe(COMMAND_TYPES.CREATE_TRANSACTION);
  });

  it('does NOT enqueue when no accountKey is provided (backward-compatible)', async () => {
    await log.append(
      {
        type: COMMAND_TYPES.CREATE_TRANSACTION,
        timestamp: '2024-01-01T00:00:00.000Z',
        payload: { type: 'expense', amount: 10, category: 'cat-1', date: '2024-01-01', title: 'Test' },
      },
      'acct-001',
      // no accountKey
    );

    expect(await queue.count()).toBe(0);
  });

  it('each append produces a separately encrypted queue entry', async () => {
    const accountKey = await generateAccountKey();

    const cmd = {
      type: COMMAND_TYPES.CREATE_TRANSACTION,
      timestamp: '2024-01-01T00:00:00.000Z',
      payload: { type: 'expense' as const, amount: 1, category: 'c', date: '2024-01-01', title: 'T' },
    } satisfies import('../commands/types').CommandInput;

    await log.append(cmd, 'acct-001', accountKey);
    await log.append(cmd, 'acct-001', accountKey);

    const entries = await queue.getAll();
    expect(entries).toHaveLength(2);
    // Different records → different nonces
    expect(entries[0].encrypted_payload.nonce).not.toBe(entries[1].encrypted_payload.nonce);
  });
});
