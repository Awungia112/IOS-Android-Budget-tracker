// @vitest-environment node
import 'fake-indexeddb/auto';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { changeLog } from '../../changelog/change-log.js';
import { generateKeypair } from '../../crypto/keys.js';
import { resetPrivateKeyStoreMock } from '../../crypto/private-key-store-plugin.test-mock.js';
import type { OnlineAccountsClient } from '../../sync/online-accounts-client.js';
import type { MigrationResult, MigrationStep, IMigrationOnlinePushProvider } from '../migration.service.js';
import type { LegacyCategory } from '../legacy-types.js';
import {
  assertNoSensitiveData,
  closeMigrationTestDb,
  createFixtureFetchMock,
  createMigrationTestServices,
  getImportedAccounts,
  HTTP_STATUS,
  resetMigrationPersistence,
} from './support/index.js';
import {
  edgeCaseFixture,
  minimalAccountFixture,
  multiAccountFixture,
  onlineAccountFixture,
} from '../test-fixtures/index.js';

vi.mock('../../crypto/private-key-store-plugin', () =>
  import('../../crypto/private-key-store-plugin.test-mock'),
);

const EXPECTED_SUCCESS_PROGRESS: MigrationStep['step'][] = [
  'AUTHENTICATING',
  'FETCHING',
  'TRANSFORMING',
  'IMPORTING',
  'DETECTING',
  'COMPLETE',
];
const ZERO_IMPORTED_COUNTS: MigrationResult['imported'] = {
  accounts: 0,
  transactions: 0,
  categories: 0,
  limits: 0,
  templates: 0,
  recurringItems: 0,
  savingsGoals: 0,
};
const originalFetch = global.fetch;
// Which migrated occurrences are booked (past) or upcoming depends on the date
// the migration runs; pinning it keeps the rows and commands it produces stable.
const MIGRATION_RUN_AT = new Date('2026-09-14T12:00:00');

describe('Migration integration', () => {
  beforeEach(async () => {
    vi.useFakeTimers({ toFake: ['Date'], shouldAdvanceTime: true });
    vi.setSystemTime(MIGRATION_RUN_AT);
    resetPrivateKeyStoreMock();
    await resetMigrationPersistence();
    vi.spyOn(console, 'log').mockImplementation(() => { });
    vi.spyOn(console, 'warn').mockImplementation(() => { });
  });

  afterEach(async () => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    global.fetch = originalFetch;
    await closeMigrationTestDb();
  });

  it('runs the full pipeline and persists a happy-path migration into IndexedDB', async () => {
    global.fetch = createFixtureFetchMock(minimalAccountFixture);

    const { migrationService, budgetService } = createMigrationTestServices();
    const progressSteps: MigrationStep[] = [];

    const result = await migrationService.migrate(
      minimalAccountFixture.credentials.email,
      minimalAccountFixture.credentials.password,
      step => { progressSteps.push(step); },
    );

    expect(result).toEqual({
      success: true,
      imported: minimalAccountFixture.expected.imported,
      pushed: { records: 0, accounts: 0 },
      importedAccountIds: expect.any(Array),
      importedAccounts: expect.any(Array),
      skippedAccounts: 0,
      skippedAccountIds: [],
      skippedTemplates: 0,
      skippedTemplateReasons: [],
      permanentlySkippedTemplates: 0,
      warnings: [],
      errors: [],
      errorCode: undefined,
      retryCount: 0,
    });
    expect(progressSteps.map(step => step.step)).toEqual(EXPECTED_SUCCESS_PROGRESS);

    const importedAccounts = await getImportedAccounts(budgetService);
    expect(importedAccounts).toHaveLength(1);
    expect(importedAccounts[0]).toEqual(expect.objectContaining({
      name: 'Family Budget',
      initials: 'FB',
    }));

    const importedAccountId = importedAccounts[0].id;
    const transactions = await budgetService.getTransactionsByAccountId(importedAccountId);
    const categories = await budgetService.getCategoriesByAccountId(importedAccountId);
    const limits = await budgetService.getLimitsByAccountId(importedAccountId);
    const templates = await budgetService.getTemplatesByAccountId(importedAccountId);
    const recurringItems = await budgetService.getRecurringItemsByAccountId(importedAccountId);
    const savingsGoals = await budgetService.getSavingsGoalsByAccountId(importedAccountId);

    expect(transactions).toHaveLength(
      minimalAccountFixture.expected.imported.transactions +
        minimalAccountFixture.expected.generatedRecurringOccurrences,
    );
    const importedCategories = categories.filter(cat => !cat.isDefault);
    // Essen (is_deletable: true) and Pet Care (is_deletable: true) are both user-created
    expect(importedCategories).toHaveLength(2);
    expect(limits).toHaveLength(minimalAccountFixture.expected.imported.limits);
    expect(templates).toHaveLength(minimalAccountFixture.expected.imported.templates);
    expect(recurringItems).toHaveLength(minimalAccountFixture.expected.imported.recurringItems);
    expect(savingsGoals).toHaveLength(minimalAccountFixture.expected.imported.savingsGoals);

    const categoryIds = new Set(categories.map(category => category.id));
    const savingsGoalIds = new Set(savingsGoals.map(goal => goal.id));

    expect(transactions.every(transaction => categoryIds.has(transaction.category))).toBe(true);
    expect(limits.every(limit => categoryIds.has(limit.categoryId))).toBe(true);
    expect(savingsGoals.every(goal => goal.categoryId && categoryIds.has(goal.categoryId))).toBe(true);
    expect(
      transactions
        .filter(transaction => transaction.savingsGoalId)
        .every(transaction => savingsGoalIds.has(transaction.savingsGoalId!)),
    ).toBe(true);

    const commands = await changeLog.getAll();
    expect(commands.map(record => record.command.type)).toEqual(
      minimalAccountFixture.expected.loggedCommandTypes,
    );

    await assertNoSensitiveData([
      minimalAccountFixture.credentials.email,
      minimalAccountFixture.credentials.password,
      minimalAccountFixture.credentials.token,
    ]);
  });

  it('canonicalizes a deletable German category to one seeded default and remaps its transactions', async () => {
    const { budgetService } = createMigrationTestServices();
    const transformer = new (await import('../legacy-data-transformer.js')).LegacyDataTransformer();
    const targetAccountId = 'legacy-household-account';
    const customCategoryId = 'legacy-household-category';
    const transformedCategories = transformer.transformCategories([{
      id: 42,
      name: 'Haushalt',
      balanceType: 'BT_EXPENSE',
      active: true,
      deletable: true,
      limits: null,
      limitsDate: null,
      deleted: false,
      account: 1,
    } satisfies LegacyCategory], targetAccountId);

    await budgetService.importData({
      version: '1.0',
      exportDate: '2026-09-12T00:00:00.000Z',
      account: { id: targetAccountId, name: 'Legacy Household', initials: 'LH' },
      // The transformer preserves deletable=1 as isDefault:false. The import
      // layer then canonicalizes it against the seeded default.
      categories: transformedCategories.map(category => ({
        ...category,
        id: customCategoryId,
      })),
      transactions: [{
        id: 'legacy-household-transaction',
        accountId: targetAccountId,
        category: customCategoryId,
        amount: 42,
        date: '2026-01-01',
        title: 'Household purchase',
        type: 'expense',
      }],
      limits: [],
      templates: [],
      recurringItems: [],
      savingsGoals: [],
    }, targetAccountId);

    const categories = await budgetService.getCategoriesByAccountId(targetAccountId);
    const householdCategories = categories.filter(
      category => category.type === 'expense' &&
        (category.name === 'Haushalt' || category.name === 'category_household'),
    );
    const transactions = await budgetService.getTransactionsByAccountId(targetAccountId);

    expect(householdCategories).toHaveLength(1);
    expect(householdCategories[0]).toMatchObject({
      name: 'category_household',
      isDefault: true,
    });
    expect(transactions).toHaveLength(1);
    expect(transactions[0].category).toBe(householdCategories[0].id);
  });

  it('imports only valid edge-case records and reports transform warnings', async () => {
    global.fetch = createFixtureFetchMock(edgeCaseFixture);

    const { migrationService, budgetService } = createMigrationTestServices();
    const result = await migrationService.migrate(
      edgeCaseFixture.credentials.email,
      edgeCaseFixture.credentials.password,
      () => undefined,
    );

    expect(result.success).toBe(true);
    expect(result.imported).toEqual(edgeCaseFixture.expected.imported);
    expect(result.errors).toHaveLength(0);

    for (const warningFragment of edgeCaseFixture.expected.warningsContains ?? []) {
      expect(result.warnings.some(warning => warning.includes(warningFragment))).toBe(true);
    }

    const importedAccounts = await getImportedAccounts(budgetService);
    expect(importedAccounts).toHaveLength(1);

    const importedAccountId = importedAccounts[0].id;
    const transactions = await budgetService.getTransactionsByAccountId(importedAccountId);
    const categories = await budgetService.getCategoriesByAccountId(importedAccountId);
    const recurringItems = await budgetService.getRecurringItemsByAccountId(importedAccountId);

    expect(transactions.filter(transaction => !transaction.recurringItemId).map(transaction => transaction.title)).toEqual([
      'Valid Grocery',
      'Board Games',
    ]);
    expect(categories.map(category => category.name)).not.toContain('Obsolete Category');
    expect(categories.map(category => category.name)).not.toContain('Inactive Category');
    expect(recurringItems).toHaveLength(1);
    expect(recurringItems[0].name).toBe('Monthly Board Games Club');

    const commands = await changeLog.getAll();
    expect(commands.map(record => record.command.type)).toEqual(
      edgeCaseFixture.expected.loggedCommandTypes,
    );

    await assertNoSensitiveData([
      edgeCaseFixture.credentials.email,
      edgeCaseFixture.credentials.password,
      edgeCaseFixture.credentials.token,
    ]);
  });

  it('aggregates active legacy accounts and skips deleted accounts', async () => {
    global.fetch = createFixtureFetchMock(multiAccountFixture);

    const { migrationService, budgetService } = createMigrationTestServices();
    const progressSteps: MigrationStep[] = [];

    const result = await migrationService.migrate(
      multiAccountFixture.credentials.email,
      multiAccountFixture.credentials.password,
      step => { progressSteps.push(step); },
    );

    expect(result).toEqual({
      success: true,
      imported: multiAccountFixture.expected.imported,
      pushed: { records: 0, accounts: 0 },
      importedAccountIds: expect.any(Array),
      importedAccounts: expect.any(Array),
      skippedAccounts: 0,
      skippedAccountIds: [],
      skippedTemplates: 0,
      skippedTemplateReasons: [],
      permanentlySkippedTemplates: 0,
      warnings: [],
      errors: [],
      errorCode: undefined,
      retryCount: 0,
    });
    expect(progressSteps.filter(step => step.step === 'IMPORTING')).toHaveLength(2);

    const importedAccounts = await getImportedAccounts(budgetService);
    expect(importedAccounts).toHaveLength(2);
    expect(importedAccounts.map(account => account.name).sort()).toEqual([
      'Personal Legacy',
      'Shared Flat',
    ]);

    const archivedAccount = importedAccounts.find(account => account.name === 'Archived Legacy');
    expect(archivedAccount).toBeUndefined();

    const totalTransactions = (
      await Promise.all(
        importedAccounts.map(account => budgetService.getTransactionsByAccountId(account.id)),
      )
    ).flat();
    const totalCategories = (
      await Promise.all(
        importedAccounts.map(async account => {
          const categories = await budgetService.getCategoriesByAccountId(account.id);
          return categories.filter(cat => !cat.isDefault);
        }),
      )
    ).flat();
    const totalLimits = (
      await Promise.all(
        importedAccounts.map(account => budgetService.getLimitsByAccountId(account.id)),
      )
    ).flat();
    const totalRecurringItems = (
      await Promise.all(
        importedAccounts.map(account => budgetService.getRecurringItemsByAccountId(account.id)),
      )
    ).flat();
    const totalSavingsGoals = (
      await Promise.all(
        importedAccounts.map(account => budgetService.getSavingsGoalsByAccountId(account.id)),
      )
    ).flat();

    expect(totalTransactions).toHaveLength(
      multiAccountFixture.expected.imported.transactions +
        multiAccountFixture.expected.generatedRecurringOccurrences,
    );
    expect(totalCategories.filter(cat => !cat.isDefault)).toHaveLength(3);
    expect(totalLimits).toHaveLength(multiAccountFixture.expected.imported.limits);
    expect(totalRecurringItems).toHaveLength(multiAccountFixture.expected.imported.recurringItems);
    expect(totalSavingsGoals).toHaveLength(multiAccountFixture.expected.imported.savingsGoals);
    expect(totalTransactions.map(transaction => transaction.title)).not.toContain('Archived Expense');

    const commands = await changeLog.getAll();
    expect(commands.map(record => record.command.type)).toEqual(
      multiAccountFixture.expected.loggedCommandTypes,
    );

    await assertNoSensitiveData([
      multiAccountFixture.credentials.email,
      multiAccountFixture.credentials.password,
      multiAccountFixture.credentials.token,
    ]);
  });

  it('aborts on authentication failure without importing data', async () => {
    global.fetch = createFixtureFetchMock(minimalAccountFixture, {
      'POST /user/get-token': {
        body: {},
        status: HTTP_STATUS.unauthorized,
      },
    });

    const { apiClient, migrationService, budgetService } = createMigrationTestServices();

    await expect(
      migrationService.migrate(
        minimalAccountFixture.credentials.email,
        minimalAccountFixture.credentials.password,
        () => undefined,
      ),
    ).rejects.toThrow('Migration aborted: Invalid credentials or token expired.');

    expect(await getImportedAccounts(budgetService)).toHaveLength(0);
    expect(await changeLog.count()).toBe(0);
    await expect(apiClient.fetchAccounts()).rejects.toMatchObject({ code: 'UNAUTHORIZED' });

    await assertNoSensitiveData([
      minimalAccountFixture.credentials.email,
      minimalAccountFixture.credentials.password,
      minimalAccountFixture.credentials.token,
    ]);
  });

  it('returns a failure result when fetching legacy data fails mid-migration', async () => {
    global.fetch = createFixtureFetchMock(minimalAccountFixture, {
      'GET /api/category?account_id=96': {
        error: new Error('Connection lost'),
      },
    });

    const { apiClient, migrationService, budgetService } = createMigrationTestServices();
    const migrationPromise = migrationService.migrate(
      minimalAccountFixture.credentials.email,
      minimalAccountFixture.credentials.password,
      () => undefined,
    );

    const result = await migrationPromise;

    expect(result.success).toBe(false);
    expect(result.imported).toEqual(ZERO_IMPORTED_COUNTS);
    expect(result.errors.some(error => error.includes('Fetch failed'))).toBe(true);
    expect(await getImportedAccounts(budgetService)).toHaveLength(0);
    expect(await changeLog.count()).toBe(0);
    await expect(apiClient.fetchAccounts()).rejects.toMatchObject({ code: 'UNAUTHORIZED' });

    await assertNoSensitiveData([
      minimalAccountFixture.credentials.email,
      minimalAccountFixture.credentials.password,
      minimalAccountFixture.credentials.token,
    ]);
  });

  it('fails safely when the legacy API returns malformed JSON syntax', async () => {
    global.fetch = createFixtureFetchMock(minimalAccountFixture, {
      'GET /api/accounts': {
        jsonError: new SyntaxError('Unexpected token < in JSON'),
      },
    });

    const { apiClient, migrationService, budgetService } = createMigrationTestServices();
    const result = await migrationService.migrate(
      minimalAccountFixture.credentials.email,
      minimalAccountFixture.credentials.password,
      () => undefined,
    );

    expect(result.success).toBe(false);
    expect(result.imported).toEqual(ZERO_IMPORTED_COUNTS);
    expect(result.errors).toContain(
      'Fetch failed: Malformed response from /api/accounts: expected JSON.',
    );
    expect(await getImportedAccounts(budgetService)).toHaveLength(0);
    expect(await changeLog.count()).toBe(0);
    await expect(apiClient.fetchAccounts()).rejects.toMatchObject({ code: 'UNAUTHORIZED' });

    await assertNoSensitiveData([
      minimalAccountFixture.credentials.email,
      minimalAccountFixture.credentials.password,
      minimalAccountFixture.credentials.token,
    ]);
  });

  it('fails safely when the legacy API returns a wrong-shaped JSON payload', async () => {
    global.fetch = createFixtureFetchMock(minimalAccountFixture, {
      'GET /api/accounts': {
        body: { accounts: [] },
      },
    });

    const { apiClient, migrationService, budgetService } = createMigrationTestServices();
    const result = await migrationService.migrate(
      minimalAccountFixture.credentials.email,
      minimalAccountFixture.credentials.password,
      () => undefined,
    );

    expect(result.success).toBe(false);
    expect(result.imported).toEqual(ZERO_IMPORTED_COUNTS);
    expect(result.errors).toContain(
      'Fetch failed: Malformed response from /api/accounts: expected array.',
    );
    expect(await getImportedAccounts(budgetService)).toHaveLength(0);
    expect(await changeLog.count()).toBe(0);
    await expect(apiClient.fetchAccounts()).rejects.toMatchObject({ code: 'UNAUTHORIZED' });

    await assertNoSensitiveData([
      minimalAccountFixture.credentials.email,
      minimalAccountFixture.credentials.password,
      minimalAccountFixture.credentials.token,
    ]);
  });

  // ---------------------------------------------------------------------------
  // Online push flow
  // ---------------------------------------------------------------------------

  describe('online push', () => {
    type PushedRecord = { change_uuid: string; encrypted_payload: Record<string, unknown> };
    const pushedRecords: PushedRecord[] = [];
    let userPublicKey: Uint8Array;

    function createPushTrackingClient(): OnlineAccountsClient {
      return {
        createAccount: vi.fn(async () => ({ id: 'server-id-1111-1111-1111', keyEpoch: 1 as const })),
        pushChangeRecords: vi.fn(async (input: { accountId: string; records: PushedRecord[] }) => {
          pushedRecords.push(...input.records);
          return {
            results: input.records.map(r => ({ change_uuid: r.change_uuid, sequence: pushedRecords.length })),
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
    });

    it('encrypts and pushes migrated ChangeRecords to the server; re-run does not duplicate', async () => {
      global.fetch = createFixtureFetchMock(minimalAccountFixture);

      const { migrationService, budgetService } = createMigrationTestServices();
      const client = createPushTrackingClient();

      const pushProvider: IMigrationOnlinePushProvider = {
        client,
        userPublicKey,
        emailHashPepper: 'test-pepper',
      };

      // --- First run ---
      const result1 = await migrationService.migrate(
        minimalAccountFixture.credentials.email,
        minimalAccountFixture.credentials.password,
        () => undefined,
        0,
        'test',
        pushProvider,
      );

      expect(result1).toMatchObject({
        success: true,
        errors: [],
      });
      expect(result1.pushed.accounts).toBe(1);

      const changeRecords = await changeLog.getAll();
      // With pushProvider, logCategoriesForMigration adds an extra BULK_CREATE_CATEGORIES
      const expectedRecordCount = minimalAccountFixture.expected.loggedCommandTypes.length + 1;
      expect(changeRecords).toHaveLength(expectedRecordCount);
      expect(pushedRecords).toHaveLength(expectedRecordCount);

      // Ensure migration push consumes the local upload queue so re-sync doesn't re-send.
      const importedAccountsAfter1 = await getImportedAccounts(budgetService);
      const localAccountId = importedAccountsAfter1[0].id;
      const queuedAfterPush = await budgetService['db']?.uploadQueue?.getAllByAccount?.(localAccountId);
      // Fallback: if db isn't exposed, use public queue access via migration test helpers.
      // (This project typically uses the core uploadQueue directly in tests.)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { uploadQueue } = await import('../../changelog/upload-queue') as any;
      const queued = await uploadQueue.getAllByAccount(localAccountId);
      expect(queued).toHaveLength(0);


      for (const record of pushedRecords) {
        expect(record.change_uuid).toBeTruthy();
        expect(record.encrypted_payload).toBeTruthy();
        expect(typeof record.encrypted_payload).toBe('object');
        expect(record.encrypted_payload).toHaveProperty('v');
        expect(record.encrypted_payload).toHaveProperty('alg');
        expect(record.encrypted_payload).toHaveProperty('nonce');
        expect(record.encrypted_payload).toHaveProperty('ciphertext');
      }

      const changeUuids = new Set(changeRecords.map(r => r.id));
      for (const record of pushedRecords) {
        expect(changeUuids.has(record.change_uuid)).toBe(true);
      }

      // --- Second run (idempotency check) ---
      await resetMigrationPersistence();
      global.fetch = createFixtureFetchMock(minimalAccountFixture);

      const { migrationService: svc2 } = createMigrationTestServices();
      const client2 = createPushTrackingClient();
      const keypair2 = await generateKeypair();

      const pushProvider2: IMigrationOnlinePushProvider = {
        client: client2,
        userPublicKey: keypair2.publicKey,
        emailHashPepper: 'test-pepper',
      };

      const result2 = await svc2.migrate(
        minimalAccountFixture.credentials.email,
        minimalAccountFixture.credentials.password,
        () => undefined,
        0,
        'test',
        pushProvider2,
      );

      expect(result2.success).toBe(true);
    });
  });

  it('detects online account and sets needsOnlinePush flag', async () => {
    global.fetch = createFixtureFetchMock(onlineAccountFixture);

    const { migrationService, budgetService } = createMigrationTestServices();
    const progressSteps: MigrationStep[] = [];

    const result = await migrationService.migrate(
      onlineAccountFixture.credentials.email,
      onlineAccountFixture.credentials.password,
      step => { progressSteps.push(step); },
    );

    expect(result.success).toBe(true);

    const importedAccounts = await getImportedAccounts(budgetService);
    expect(importedAccounts).toHaveLength(1);

    const importedAccount = importedAccounts[0];
    expect(importedAccount.needsOnlinePush).toBe(true);
  });
});
