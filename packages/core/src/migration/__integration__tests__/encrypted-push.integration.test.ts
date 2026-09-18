// @vitest-environment node
/**
 * Gate 6 — Legacy encrypted push migration E2E test (core side)
 *
 * Verifies the full round-trip: migration → encrypt ChangeRecords → push to
 * mock server → decrypt back → original data matches.
 *
 * This test proves that:
 * 1. When a pushProvider is supplied, MigrationService provisions an account
 *    key, wraps it for the user's public key, and stores it locally.
 * 2. Every ChangeRecord produced during importData() is encrypted with the
 *    account key into a SymmetricEnvelope (v=1, alg=xsalsa20-poly1305).
 * 3. The SymmetricEnvelope can be decrypted back to the original ChangeRecord.
 * 4. The upload queue is drained after a successful push.
 * 5. Re-running migration produces a fresh account and does not duplicate
 *    records on the mock server.
 */
import 'fake-indexeddb/auto';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { changeLog } from '../../changelog/change-log.js';
import { encryptChangeRecord, decryptChangeRecord } from '../../changelog/change-record-crypto.js';
import { generateAccountKey, loadAccountKey } from '../../crypto/account-key.js';
import { seal, open, unwrapKey, type SymmetricEnvelope } from '../../crypto/envelope.js';
import { generateKeypair } from '../../crypto/keys.js';
import { resetPrivateKeyStoreMock } from '../../crypto/private-key-store-plugin.test-mock.js';
import type { OnlineAccountsClient } from '../../sync/online-accounts-client.js';
import type { MigrationResult, MigrationStep, IMigrationOnlinePushProvider } from '../migration.service.js';
import { uploadQueue } from '../../changelog/upload-queue.js';
import { COMMAND_TYPES } from '../../commands/types.js';
import {
  assertNoSensitiveData,
  closeMigrationTestDb,
  createFixtureFetchMock,
  createMigrationTestServices,
  getImportedAccounts,
  HTTP_STATUS,
  resetMigrationPersistence,
} from './support/index.js';
import { minimalAccountFixture } from '../test-fixtures/index.js';

vi.mock('../../crypto/private-key-store-plugin', () =>
  import('../../crypto/private-key-store-plugin.test-mock'),
);

const originalFetch = global.fetch;

describe('Gate 6 — encrypted push migration E2E (core)', () => {
  beforeEach(async () => {
    resetPrivateKeyStoreMock();
    await resetMigrationPersistence();
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(async () => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    global.fetch = originalFetch;
    await closeMigrationTestDb();
  });

  // ---------------------------------------------------------------------------
  // Round-trip: seal → open → decryptChangeRecord
  // ---------------------------------------------------------------------------

  describe('SymmetricEnvelope round-trip', () => {
    it('encrypts a ChangeRecord with seal() and decrypts it back with open()', async () => {
      const accountKey = await generateAccountKey();

      const originalRecord = {
        id: 'test-uuid-001',
        command: {
          type: 'CREATE_TRANSACTION' as const,
          timestamp: new Date().toISOString(),
          sequence: 1,
          accountId: 'acc-001',
          payload: { title: 'Grocery Run', amount: 45.2 },
        },
        timestamp: new Date().toISOString(),
        accountId: 'acc-001',
        synced: false,
      };

      const plaintext = new TextEncoder().encode(JSON.stringify(originalRecord));
      const envelope = await seal(plaintext, accountKey);

      // Verify envelope structure
      expect(envelope.v).toBe(1);
      expect(envelope.alg).toBe('xsalsa20-poly1305');
      expect(typeof envelope.nonce).toBe('string');
      expect(envelope.nonce.length).toBeGreaterThan(0);
      expect(typeof envelope.ciphertext).toBe('string');
      expect(envelope.ciphertext.length).toBeGreaterThan(0);

      // Decrypt and verify
      const decrypted = await open(envelope, accountKey);
      const decoded = JSON.parse(new TextDecoder().decode(decrypted));
      expect(decoded).toEqual(originalRecord);
    });

    it('rejects decryption with the wrong key', async () => {
      const correctKey = await generateAccountKey();
      const wrongKey = await generateAccountKey();

      const plaintext = new TextEncoder().encode('sensitive data');
      const envelope = await seal(plaintext, correctKey);

      await expect(open(envelope, wrongKey)).rejects.toThrow(
        'Decryption failed: authentication tag mismatch',
      );
    });
  });

  // ---------------------------------------------------------------------------
  // encryptChangeRecord / decryptChangeRecord round-trip
  // ---------------------------------------------------------------------------

  describe('ChangeRecord crypto round-trip', () => {
    it('encrypts and decrypts a ChangeRecord preserving all fields', async () => {
      const accountKey = await generateAccountKey();

      const originalRecord = {
        id: 'test-uuid-002',
        command: {
          type: 'CREATE_CATEGORY' as const,
          timestamp: new Date().toISOString(),
          sequence: 2,
          accountId: 'acc-002',
          payload: { name: 'Essen', type: 'expense' as const, icon: 'kategorie_ausgaben_3' },
        },
        timestamp: new Date().toISOString(),
        accountId: 'acc-002',
        synced: false,
      };

      const envelope = await encryptChangeRecord(originalRecord, accountKey);

      expect(envelope.v).toBe(1);
      expect(envelope.alg).toBe('xsalsa20-poly1305');
      expect(typeof envelope.nonce).toBe('string');
      expect(typeof envelope.ciphertext).toBe('string');

      const decrypted = await decryptChangeRecord(envelope, accountKey);
      expect(decrypted).toEqual(originalRecord);
    });

    it('produces different nonces for the same plaintext (semantic security)', async () => {
      const accountKey = await generateAccountKey();

      const record = {
        id: 'test-uuid-003',
        command: {
          type: 'CREATE_TRANSACTION' as const,
          timestamp: new Date().toISOString(),
          sequence: 3,
          accountId: 'acc-003',
          payload: { title: 'Same data', amount: 10, type: 'expense' as const, category: 'Food', date: '2024-01-01' },
        },
        timestamp: new Date().toISOString(),
        accountId: 'acc-003',
        synced: false,
      };

      const envelope1 = await encryptChangeRecord(record, accountKey);
      const envelope2 = await encryptChangeRecord(record, accountKey);

      // Nonces must differ (XSalsa20 generates random 24-byte nonces)
      expect(envelope1.nonce).not.toBe(envelope2.nonce);
      // Ciphertexts must differ (different nonce → different ciphertext)
      expect(envelope1.ciphertext).not.toBe(envelope2.ciphertext);

      // Both must still decrypt to the same original
      const decrypted1 = await decryptChangeRecord(envelope1, accountKey);
      const decrypted2 = await decryptChangeRecord(envelope2, accountKey);
      expect(decrypted1).toEqual(record);
      expect(decrypted2).toEqual(record);
    });
  });

  // ---------------------------------------------------------------------------
  // Full migration with encrypted push: round-trip verification
  // ---------------------------------------------------------------------------

  describe('migration with encrypted push — round-trip verification', () => {
    type PushedRecord = { change_uuid: string; encrypted_payload: Record<string, unknown> };
    const pushedRecords: PushedRecord[] = [];
    let userPublicKey: Uint8Array;
    let userPrivateKey: Uint8Array;

    function createPushTrackingClient(): OnlineAccountsClient {
      return {
        createAccount: vi.fn(async () => ({ id: 'server-id-2222-2222-2222', keyEpoch: 1 as const })),
        pushChangeRecords: vi.fn(async (input: { accountId: string; records: PushedRecord[] }) => {
          pushedRecords.push(...input.records);
          return {
            results: input.records.map((r, i) => ({
              change_uuid: r.change_uuid,
              sequence: pushedRecords.length - input.records.length + i + 1,
            })),
          };
        }),
        listAccounts: vi.fn(),
        getAccountKey: vi.fn(),
        pullChangeRecords: vi.fn(),
        pollPendingKeyRequests: vi.fn(),
        getRecipientPublicKey: vi.fn(),
        deliverAccountKey: vi.fn(),
        getAccountMembers: vi.fn(),
        removeAccountMember: vi.fn(),
        removeAccountMemberAndUploadWrappedKeys: vi.fn(),
        batchUploadWrappedKeys: vi.fn(),
        getSharingInfo: vi.fn(),
        inviteMember: vi.fn(),
        cancelInvite: vi.fn(),
        removeMember: vi.fn(),
        listPendingInvitesForMe: vi.fn(),
        acceptInvite: vi.fn(),
        declineInvite: vi.fn(),
        updateDisplayEmail: vi.fn().mockResolvedValue(undefined),
        deleteAccount: vi.fn(),
        deleteRecoveryData: vi.fn(),
      };
    }

    beforeEach(async () => {
      pushedRecords.length = 0;
      const keypair = await generateKeypair();
      userPublicKey = keypair.publicKey;
      userPrivateKey = keypair.privateKey;
    });

    it('encrypts ChangeRecords during migration and decrypts them back to the original data', async () => {
      global.fetch = createFixtureFetchMock(minimalAccountFixture);

      const { migrationService, budgetService } = createMigrationTestServices();
      const client = createPushTrackingClient();

      const pushProvider: IMigrationOnlinePushProvider = {
        client,
        userPublicKey,
        emailHashPepper: 'test-pepper',
      };

      const result = await migrationService.migrate(
        minimalAccountFixture.credentials.email,
        minimalAccountFixture.credentials.password,
        () => undefined,
        0,
        'test',
        pushProvider,
      );

      expect(result).toMatchObject({ success: true, errors: [] });
      expect(result.pushed.accounts).toBe(1);

      const changeRecords = await changeLog.getAll();
      // With pushProvider, logCategoriesForMigration adds an extra BULK_CREATE_CATEGORIES
      const expectedRecordCount = minimalAccountFixture.expected.loggedCommandTypes.length + 1;
      expect(changeRecords).toHaveLength(expectedRecordCount);
      expect(pushedRecords).toHaveLength(expectedRecordCount);

      // Retrieve the account key that was stored during provisioning
      const importedAccounts = await getImportedAccounts(budgetService);
      expect(importedAccounts).toHaveLength(1);
      const localAccountId = importedAccounts[0].id;

      // The server account ID was returned by our mock createAccount
      const serverAccountId = 'server-id-2222-2222-2222';
      const accountKey = await loadAccountKey(serverAccountId);
      expect(accountKey).not.toBeNull();
      expect(accountKey!.length).toBe(32);

      // Verify every pushed record is a valid SymmetricEnvelope
      for (const record of pushedRecords) {
        expect(record.change_uuid).toBeTruthy();
        expect(record.encrypted_payload).toBeTruthy();
        expect(typeof record.encrypted_payload).toBe('object');
        expect(record.encrypted_payload).toHaveProperty('v');
        expect(record.encrypted_payload).toHaveProperty('alg');
        expect(record.encrypted_payload).toHaveProperty('nonce');
        expect(record.encrypted_payload).toHaveProperty('ciphertext');
        expect(record.encrypted_payload.v).toBe(1);
        expect(record.encrypted_payload.alg).toBe('xsalsa20-poly1305');
      }

      // Decrypt every pushed envelope back and verify it matches a ChangeRecord
      const changeRecordIds = new Set(changeRecords.map(r => r.id));

      for (const record of pushedRecords) {
        expect(changeRecordIds.has(record.change_uuid)).toBe(true);

        const envelope = record.encrypted_payload as unknown as SymmetricEnvelope;
        const decrypted = await decryptChangeRecord(envelope, accountKey!);

        // Find the matching original ChangeRecord
        const originalRecord = changeRecords.find(r => r.id === record.change_uuid);
        expect(originalRecord).toBeDefined();

        // Verify the decrypted record matches the original
        expect(decrypted.id).toBe(originalRecord!.id);
        expect(decrypted.command.type).toBe(originalRecord!.command.type);
        expect(decrypted.accountId).toBe(originalRecord!.accountId);
        // Records are encrypted before markManySynced runs, so decrypted.synced is
        // always false at encryption time even though the DB record becomes true after push.
        expect(decrypted.synced).toBe(false);
      }

      // Verify upload queue is drained after push
      const queued = await uploadQueue.getAllByAccount(localAccountId);
      expect(queued).toHaveLength(0);

      // Verify no sensitive data leaked into storage
      await assertNoSensitiveData([
        minimalAccountFixture.credentials.email,
        minimalAccountFixture.credentials.password,
        minimalAccountFixture.credentials.token,
      ]);
    });

    it('wraps the account key so the server-stored key can be unwrapped by the user', async () => {
      global.fetch = createFixtureFetchMock(minimalAccountFixture);

      const { migrationService } = createMigrationTestServices();
      const client = createPushTrackingClient();

      const pushProvider: IMigrationOnlinePushProvider = {
        client,
        userPublicKey,
        emailHashPepper: 'test-pepper',
      };

      await migrationService.migrate(
        minimalAccountFixture.credentials.email,
        minimalAccountFixture.credentials.password,
        () => undefined,
        0,
        'test',
        pushProvider,
      );

      // The createAccount mock was called with a wrapped key
      expect(client.createAccount).toHaveBeenCalledOnce();
      const createCall = vi.mocked(client.createAccount).mock.calls[0][0];

      // Verify the wrapped key is a valid AsymmetricEnvelope
      expect(createCall.wrappedKey).toBeDefined();
      expect(createCall.wrappedKey.v).toBe(1);
      expect(createCall.wrappedKey.alg).toBe('x25519-xsalsa20-poly1305');
      expect(typeof createCall.wrappedKey.ciphertext).toBe('string');
      expect(createCall.wrappedKey.ciphertext.length).toBeGreaterThan(0);

      // Unwrap the key using the user's private key and verify it matches the stored key
      const unwrappedKey = await unwrapKey(
        createCall.wrappedKey,
        userPublicKey,
        userPrivateKey,
      );
      expect(unwrappedKey.length).toBe(32);

      // Verify the unwrapped key matches the key stored in the PrivateKeyStore
      const serverAccountId = 'server-id-2222-2222-2222';
      const storedKey = await loadAccountKey(serverAccountId);
      expect(storedKey).not.toBeNull();
      expect(unwrappedKey).toEqual(storedKey);
    });

    it('pushes all command types through the encrypted pipeline without data loss', async () => {
      global.fetch = createFixtureFetchMock(minimalAccountFixture);

      const { migrationService } = createMigrationTestServices();
      const client = createPushTrackingClient();

      const pushProvider: IMigrationOnlinePushProvider = {
        client,
        userPublicKey,
        emailHashPepper: 'test-pepper',
      };

      await migrationService.migrate(
        minimalAccountFixture.credentials.email,
        minimalAccountFixture.credentials.password,
        () => undefined,
        0,
        'test',
        pushProvider,
      );

      const changeRecords = await changeLog.getAll();
      const serverAccountId = 'server-id-2222-2222-2222';
      const accountKey = await loadAccountKey(serverAccountId);
      expect(accountKey).not.toBeNull();

      // Decrypt all pushed records
      const decryptedRecords = await Promise.all(
        pushedRecords.map(async (record) => {
          const envelope = record.encrypted_payload as unknown as SymmetricEnvelope;
          return decryptChangeRecord(envelope, accountKey!);
        }),
      );

      // Verify command types match expected (sort both — push order is non-deterministic
      // when enqueued_at timestamps collide in fast test execution)
      const decryptedTypes = decryptedRecords.map(r => r.command.type).sort();
      // With pushProvider, logCategoriesForMigration adds an extra BULK_CREATE_CATEGORIES
      const expectedTypes = [...minimalAccountFixture.expected.loggedCommandTypes, COMMAND_TYPES.BULK_CREATE_CATEGORIES].sort();
      expect(decryptedTypes).toEqual(expectedTypes);

      // Verify all change_uuids are unique
      const uuids = pushedRecords.map(r => r.change_uuid);
      expect(new Set(uuids).size).toBe(uuids.length);

      // Verify all change_uuids match the original ChangeRecord IDs
      const originalIds = new Set(changeRecords.map(r => r.id));
      for (const uuid of uuids) {
        expect(originalIds.has(uuid)).toBe(true);
      }
    });

    it('does not duplicate pushed records when migration is re-run', async () => {
      global.fetch = createFixtureFetchMock(minimalAccountFixture);

      const { migrationService, budgetService } = createMigrationTestServices();
      const client = createPushTrackingClient();

      const pushProvider: IMigrationOnlinePushProvider = {
        client,
        userPublicKey,
        emailHashPepper: 'test-pepper',
      };

      // ── First migration run ──────────────────────────────────────────────
      const result1 = await migrationService.migrate(
        minimalAccountFixture.credentials.email,
        minimalAccountFixture.credentials.password,
        () => undefined,
        0,
        'test',
        pushProvider,
      );

      expect(result1).toMatchObject({ success: true, errors: [] });
      expect(result1.pushed.accounts).toBe(1);
      // With pushProvider, logCategoriesForMigration adds an extra BULK_CREATE_CATEGORIES
      const expectedRecordCount = minimalAccountFixture.expected.loggedCommandTypes.length + 1;
      expect(result1.pushed.records).toBe(expectedRecordCount);
      const firstRunUuids = pushedRecords.map(r => r.change_uuid);
      expect(firstRunUuids).toHaveLength(expectedRecordCount);
      expect(new Set(firstRunUuids).size).toBe(expectedRecordCount);

      // ── Second migration run (same services, same client, no reset) ─────
      const result2 = await migrationService.migrate(
        minimalAccountFixture.credentials.email,
        minimalAccountFixture.credentials.password,
        () => undefined,
        0,
        'test',
        pushProvider,
      );

      // All entities already exist on re-run, so importData skips everything.
      // However, logCategoriesForMigration is still called and logs the default
      // categories as a BULK_CREATE_CATEGORIES record for the online push.
      expect(result2).toMatchObject({ success: true, errors: [] });
      expect(result2.pushed.records).toBe(1);

      // Total pushed records increased by 1 (the BULK_CREATE_CATEGORIES from logCategoriesForMigration)
      expect(pushedRecords).toHaveLength(expectedRecordCount + 1);

      // Verify no duplicate change_uuids across the entire interaction
      const allUuids = pushedRecords.map(r => r.change_uuid);
      expect(new Set(allUuids).size).toBe(allUuids.length);
    });
  });
});
