import { describe, it, expect, beforeEach, vi } from 'vitest';
import { MigrationService, MigrationError, OnOnlineAccountDetectedCallback } from './migration.service.js';
import { isMigrationInProgress } from './migration-activity.js';
import type {
  ILegacyApiClient,
  ILegacyDataTransformer,
  IMigrationOnlinePushProvider,
  MigrationStep,
  TransformResult,
} from './migration.service.js';
import type { LegacyUserData, LegacyAccount, LegacyAccess } from './legacy-types.js';
import { LegacyApiError } from './legacy-api-client.js';
import type { BudgetService } from '../services/budget.service.js';
import type { OnlineAccountsClient } from '../sync/online-accounts-client.js';
import type { ExportData } from '../types/index.js';
import { db } from '../db/index.js';

// =============================================================================
// MODULE MOCKS
// =============================================================================

// Mock db so verifyRollback doesn't touch real Dexie.
// IMPORTANT: this table list must stay in sync with the Promise.all() inside
// verifyRollback() in migration.service.ts. If a new table is added there but
// not here, its count will be undefined (not 0), allEmpty will be false on
// every run, and the force-wipe branch becomes unreachable in tests.
vi.mock('../db', () => ({
  db: {
    accounts: { count: vi.fn().mockResolvedValue(0), update: vi.fn().mockResolvedValue(undefined) },
    transactions: { count: vi.fn().mockResolvedValue(0) },
    categories: { count: vi.fn().mockResolvedValue(0) },
    limits: { count: vi.fn().mockResolvedValue(0) },
    templates: { count: vi.fn().mockResolvedValue(0) },
    recurringItems: { count: vi.fn().mockResolvedValue(0) },
    savingsGoals: { count: vi.fn().mockResolvedValue(0) },
    accountSyncMetadata: {
      put: vi.fn().mockResolvedValue(undefined),
      get: vi.fn().mockResolvedValue(undefined),
    },
    delete: vi.fn().mockResolvedValue(undefined),
  },
}));

// Mock crypto account-key so online push tests don't need real sodium WASM
vi.mock('../crypto/account-key', () => ({
  generateAccountKey: vi.fn().mockResolvedValue(new Uint8Array(32)),
  wrapAccountKey: vi.fn().mockResolvedValue({ v: 1, alg: 'x25519-xsalsa20-poly1305', ciphertext: 'mocked' }),
  storeAccountKey: vi.fn().mockResolvedValue(undefined),
  loadAccountKey: vi.fn().mockResolvedValue(new Uint8Array(32)),
  deleteAccountKey: vi.fn().mockResolvedValue(undefined),
}));

// Mock sync metadata so provision doesn't need real DB tables
vi.mock('../sync/account-sync-metadata', () => ({
  upsertAccountSyncMetadata: vi.fn().mockResolvedValue({} as any),
  getAccountSyncMetadata: vi.fn().mockResolvedValue(undefined),
  getAccountSyncMetadataByServerId: vi.fn().mockResolvedValue(undefined),
  updateAccountSyncMetadataEpochByServerId: vi.fn().mockResolvedValue(undefined),
  deleteAccountSyncMetadata: vi.fn().mockResolvedValue(undefined),
}));

// Mock attachPendingTemplates so service tests don't need the full stash/DB stack.
// vi.hoisted is required because vi.mock factories are hoisted before const declarations.
const { mockAttachPendingTemplates } = vi.hoisted(() => ({
  mockAttachPendingTemplates: vi.fn(),
}));
vi.mock('./template-attach.js', () => ({
  attachPendingTemplates: (...args: unknown[]) => mockAttachPendingTemplates(...args),
}));

// Mock upload queue so push tests don't need real IndexedDB
vi.mock('../changelog/upload-queue', () => ({
  uploadQueue: {
    enqueue: vi.fn().mockResolvedValue(undefined),
    getAllByAccount: vi.fn().mockResolvedValue([]),
    getAll: vi.fn().mockResolvedValue([]),
    remove: vi.fn().mockResolvedValue(undefined),
    removeMany: vi.fn().mockResolvedValue(undefined),
    count: vi.fn().mockResolvedValue(0),
    clear: vi.fn().mockResolvedValue(undefined),
  },
}));

// =============================================================================
// TEST FIXTURES
// =============================================================================

const ACCOUNT_ID = 'test-account-id';
const EMAIL = 'user@example.com';
const PASSWORD = 'secret';

const mockAccount = {
  id: 1,
  name: 'Personal',
  acronym: 'P',
  color: '#ff8840',
  deleted: false,
};

const mockLegacyData: LegacyUserData = {
  accounts: [mockAccount],
  accesses: [],
  balances: [],
  categories: [],
  recurings: [],
  savingGoals: [],
  limits: [],
};

const mockExportData: ExportData = {
  version: '1.0',
  exportDate: new Date().toISOString(),
  account: { id: ACCOUNT_ID, name: 'Test', initials: 'T' },
  transactions: [{ id: 't1' } as any],
  categories: [{ id: 'c1' } as any, { id: 'c2' } as any],
  limits: [],
  templates: [],
  recurringItems: [{ id: 'r1' } as any],
  savingsGoals: [],
};

// =============================================================================
// MOCKS
// =============================================================================

function makeMocks() {
  const apiClient: ILegacyApiClient = {
    authenticate: vi.fn().mockResolvedValue(undefined),
    fetchUserData: vi.fn().mockResolvedValue(mockLegacyData),
    clearToken: vi.fn(),
  };

  const transformResult: TransformResult = { data: mockExportData, errors: [] };
  const transformer: ILegacyDataTransformer = {
    transform: vi.fn().mockReturnValue(transformResult),
  };

  const budgetService = {
    importData: vi.fn().mockResolvedValue({
      accounts: 1, transactions: 1, categories: 2, limits: 0, templates: 0, recurringItems: 1, savingsGoals: 0,
    }),
    getRecurringItemsByAccountId: vi.fn().mockResolvedValue(mockExportData.recurringItems),
    reconcileRecurring: vi.fn().mockResolvedValue(undefined),
    logCategoriesForMigration: vi.fn().mockResolvedValue(undefined),
    loadKeyForAccount: vi.fn().mockResolvedValue(undefined),
  } as unknown as BudgetService;

  return { apiClient, transformer, budgetService };
}

// =============================================================================
// TESTS
// =============================================================================

describe('MigrationService', () => {
  let apiClient: ILegacyApiClient;
  let transformer: ILegacyDataTransformer;
  let budgetService: BudgetService;
  let service: MigrationService;
  let steps: MigrationStep[];

  beforeEach(() => {
    vi.clearAllMocks();
    // Restore default after clearAllMocks wipes mock implementations
    mockAttachPendingTemplates.mockResolvedValue({ attached: 0, skipped: 0, errors: [] });
    ({ apiClient, transformer, budgetService } = makeMocks());
    service = new MigrationService(apiClient, transformer, budgetService);
    steps = [];
  });

  const onProgress = (step: MigrationStep) => { steps.push(step); };

  // -------------------------------------------------------------------------
  // Happy path
  // -------------------------------------------------------------------------

  it('executes the full flow: authenticate → fetch → transform → import', async () => {
    const result = await service.migrate(EMAIL, PASSWORD, onProgress);

    expect(apiClient.authenticate).toHaveBeenCalledWith(EMAIL, PASSWORD);
    expect(apiClient.fetchUserData).toHaveBeenCalledWith();
    expect(transformer.transform).toHaveBeenCalledOnce();
    expect(budgetService.importData).toHaveBeenCalledWith(mockExportData, ACCOUNT_ID);
    expect(result.success).toBe(true);
    expect(result.errors).toHaveLength(0);
    expect(result.warnings).toHaveLength(0);
    expect(result.pushed).toEqual({ records: 0, accounts: 0 });
  });

  it('reconciles imported recurring definitions so forecast instances are materialized', async () => {
    await service.migrate(EMAIL, PASSWORD, onProgress);

    expect(budgetService.getRecurringItemsByAccountId).toHaveBeenCalledWith(ACCOUNT_ID);
    expect(budgetService.reconcileRecurring).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'r1' }),
      { adoptLegacy: true },
    );
  });

  it('marks the migration as in progress while it imports', async () => {
    let inProgressDuringImport = false;
    vi.mocked(budgetService.importData).mockImplementationOnce(async () => {
      inProgressDuringImport = isMigrationInProgress();
      return {
        accounts: 1, transactions: 1, categories: 2, limits: 0, templates: 0, recurringItems: 1, savingsGoals: 0,
      };
    });

    await service.migrate(EMAIL, PASSWORD, onProgress);

    expect(inProgressDuringImport).toBe(true);
    expect(isMigrationInProgress()).toBe(false);
  });

  it('fires progress callbacks at each step in order', async () => {
    await service.migrate(EMAIL, PASSWORD, onProgress);

    expect(steps.map(s => s.step)).toEqual([
      'AUTHENTICATING',
      'FETCHING',
      'TRANSFORMING',
      'IMPORTING',
      'DETECTING',
      'COMPLETE',
    ]);
  });

  it('reports correct imported counts in MigrationResult', async () => {
    const result = await service.migrate(EMAIL, PASSWORD, onProgress);

    expect(result.imported).toEqual({
      accounts: 1,
      transactions: 1,
      categories: 2,
      limits: 0,
      templates: 0,
      recurringItems: 1,
      savingsGoals: 0,
    });
    expect(result.pushed).toEqual({ records: 0, accounts: 0 });
  });

  it('COMPLETE step carries the MigrationResult', async () => {
    const result = await service.migrate(EMAIL, PASSWORD, onProgress);
    const completeStep = steps.find(s => s.step === 'COMPLETE') as Extract<MigrationStep, { step: 'COMPLETE' }>;

    expect(completeStep).toBeDefined();
    expect(completeStep.result).toEqual(result);
  });

  // -------------------------------------------------------------------------
  // Multi-account
  // -------------------------------------------------------------------------

  it('calls transform + importData once per active account', async () => {
    const twoAccountData: LegacyUserData = {
      ...mockLegacyData,
      accounts: [
        { ...mockAccount, id: 1, name: 'Personal' },
        { ...mockAccount, id: 2, name: 'Business' },
      ],
    };
    vi.mocked(apiClient.fetchUserData).mockResolvedValue(twoAccountData);

    await service.migrate(EMAIL, PASSWORD, onProgress);

    expect(transformer.transform).toHaveBeenCalledTimes(2);
    expect(budgetService.importData).toHaveBeenCalledTimes(2);
  });

  it('skips deleted accounts and does not transform them', async () => {
    const dataWithDeleted: LegacyUserData = {
      ...mockLegacyData,
      accounts: [
        { ...mockAccount, id: 1, name: 'Active', deleted: false },
        { ...mockAccount, id: 2, name: 'Deleted', deleted: true },
      ],
    };
    vi.mocked(apiClient.fetchUserData).mockResolvedValue(dataWithDeleted);

    const result = await service.migrate(EMAIL, PASSWORD, onProgress);

    expect(transformer.transform).toHaveBeenCalledOnce();
    expect(result.success).toBe(true);
  });

  it('accumulates imported counts across all accounts', async () => {
    const twoAccountData: LegacyUserData = {
      ...mockLegacyData,
      accounts: [
        { ...mockAccount, id: 1, name: 'Personal' },
        { ...mockAccount, id: 2, name: 'Business' },
      ],
    };
    vi.mocked(apiClient.fetchUserData).mockResolvedValue(twoAccountData);

    const result = await service.migrate(EMAIL, PASSWORD, onProgress);

    // mockExportData has 1 account + 1 transaction + 2 categories + 1 recurringItem × 2 accounts
    expect(result.imported.accounts).toBe(2);
    expect(result.imported.transactions).toBe(2);
    expect(result.imported.categories).toBe(4);
    expect(result.imported.recurringItems).toBe(2);
  });

  it('returns failure when all accounts are deleted', async () => {
    vi.mocked(apiClient.fetchUserData).mockResolvedValue({
      ...mockLegacyData,
      accounts: [{ ...mockAccount, deleted: true }],
    });

    const result = await service.migrate(EMAIL, PASSWORD, onProgress);

    expect(result.success).toBe(false);
    expect(result.errors.some(e => e.includes('all accounts are deleted'))).toBe(true);
  });

  it('fires migration_error with entityType "accounts" when all accounts are deleted', async () => {
    const analytics = { track: vi.fn() };
    service = new MigrationService(apiClient, transformer, budgetService, analytics);
    vi.mocked(apiClient.fetchUserData).mockResolvedValue({
      ...mockLegacyData,
      accounts: [{ ...mockAccount, deleted: true }],
    });

    await service.migrate(EMAIL, PASSWORD, onProgress);

    expect(analytics.track).toHaveBeenCalledWith('migration_error', expect.objectContaining({
      entityType: 'accounts',
      errorCode: 'UNKNOWN',
    }));
  });

  it('continues migrating remaining accounts when one transform fails', async () => {
    const twoAccountData: LegacyUserData = {
      ...mockLegacyData,
      accounts: [
        { ...mockAccount, id: 1, name: 'Personal' },
        { ...mockAccount, id: 2, name: 'Business' },
      ],
    };
    vi.mocked(apiClient.fetchUserData).mockResolvedValue(twoAccountData);
    vi.mocked(transformer.transform)
      .mockImplementationOnce(() => { throw new Error('Corrupt data'); })
      .mockReturnValueOnce({ data: mockExportData, errors: [] });

    const result = await service.migrate(EMAIL, PASSWORD, onProgress);

    // Second account still imported
    expect(budgetService.importData).toHaveBeenCalledOnce();
    // Error recorded but not fatal for the whole migration
    expect(result.errors.some(e => e.includes('Personal'))).toBe(true);
  });

  // -------------------------------------------------------------------------
  // Authentication failure
  // -------------------------------------------------------------------------

  it('throws and aborts on authentication failure', async () => {
    vi.mocked(apiClient.authenticate).mockRejectedValue(new Error('Invalid credentials'));

    await expect(service.migrate(EMAIL, PASSWORD, onProgress))
      .rejects.toThrow('Migration aborted: Invalid credentials');

    expect(apiClient.fetchUserData).not.toHaveBeenCalled();
    expect(transformer.transform).not.toHaveBeenCalled();
    expect(budgetService.importData).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // Fetch failure
  // -------------------------------------------------------------------------

  it('returns failure result on fetch error without importing', async () => {
    vi.mocked(apiClient.fetchUserData).mockRejectedValue(new Error('Network error'));

    const result = await service.migrate(EMAIL, PASSWORD, onProgress);

    expect(result.success).toBe(false);
    expect(result.errors).toContain('Fetch failed: Network error');
    expect(result.warnings).toHaveLength(0);
    expect(result.imported).toEqual({ accounts: 0, transactions: 0, categories: 0, limits: 0, templates: 0, recurringItems: 0, savingsGoals: 0 });
    expect(budgetService.importData).not.toHaveBeenCalled();
  });

  it('fires COMPLETE callback on fetch failure', async () => {
    vi.mocked(apiClient.fetchUserData).mockRejectedValue(new Error('Network error'));

    await service.migrate(EMAIL, PASSWORD, onProgress);

    expect(steps.at(-1)?.step).toBe('COMPLETE');
  });

  // -------------------------------------------------------------------------
  // Transform failure
  // -------------------------------------------------------------------------

  it('collects transform warnings, continues to import, and reports success=true', async () => {
    vi.mocked(transformer.transform).mockReturnValue({
      data: mockExportData,
      errors: ['entity "tx-bad" missing amount'],
    });

    const result = await service.migrate(EMAIL, PASSWORD, onProgress);

    expect(budgetService.importData).toHaveBeenCalled();
    expect(result.success).toBe(true);
    expect(result.warnings).toContain('entity "tx-bad" missing amount');
    expect(result.errors).toHaveLength(0);
  });

  it('records error and skips account when transformer throws, success=false', async () => {
    vi.mocked(transformer.transform).mockImplementation(() => { throw new Error('Corrupt data'); });

    const result = await service.migrate(EMAIL, PASSWORD, onProgress);

    expect(result.success).toBe(false);
    expect(result.errors.some(e => e.includes('Corrupt data'))).toBe(true);
    expect(budgetService.importData).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // Import failure
  // -------------------------------------------------------------------------

  it('returns failure result on import error and reports already-transformed counts', async () => {
    vi.mocked(budgetService.importData).mockRejectedValue(new Error('DB write failed'));

    const result = await service.migrate(EMAIL, PASSWORD, onProgress);

    expect(result.success).toBe(false);
    expect(result.errors.some(e => e.includes('DB write failed'))).toBe(true);
  });

  // -------------------------------------------------------------------------
  // GDPR: credentials not propagated
  // -------------------------------------------------------------------------

  it('does not pass credentials to transformer or importData', async () => {
    await service.migrate(EMAIL, PASSWORD, onProgress);

    const transformCall = vi.mocked(transformer.transform).mock.calls[0];
    expect(JSON.stringify(transformCall)).not.toContain(PASSWORD);

    const importCall = vi.mocked(budgetService.importData).mock.calls[0];
    expect(JSON.stringify(importCall)).not.toContain(PASSWORD);
  });

  // -------------------------------------------------------------------------
  // GDPR: token always cleared via finally block
  // -------------------------------------------------------------------------

  it('calls clearToken after successful migration', async () => {
    await service.migrate(EMAIL, PASSWORD, onProgress);
    expect(apiClient.clearToken).toHaveBeenCalledOnce();
  });

  it('calls clearToken even when fetch fails', async () => {
    vi.mocked(apiClient.fetchUserData).mockRejectedValue(new Error('Network error'));
    await service.migrate(EMAIL, PASSWORD, onProgress);
    expect(apiClient.clearToken).toHaveBeenCalledOnce();
  });

  it('calls clearToken even when authentication throws', async () => {
    vi.mocked(apiClient.authenticate).mockRejectedValue(new Error('Invalid credentials'));
    await expect(service.migrate(EMAIL, PASSWORD, onProgress)).rejects.toThrow();
    expect(apiClient.clearToken).toHaveBeenCalledOnce();
  });

  it('calls clearToken even when import fails', async () => {
    vi.mocked(budgetService.importData).mockRejectedValue(new Error('DB write failed'));
    await service.migrate(EMAIL, PASSWORD, onProgress);
    expect(apiClient.clearToken).toHaveBeenCalledOnce();
  });

  // -------------------------------------------------------------------------
  // Error code resolution
  // -------------------------------------------------------------------------

  it.each([
    { code: 'ANDROID_FILE_COPY_FAILED' as const, error: new MigrationError('android file copy failed', 'ANDROID_FILE_COPY_FAILED') },
    { code: 'IOS_COREDATA_FILE_NOT_FOUND' as const, error: new MigrationError('coredata not found', 'IOS_COREDATA_FILE_NOT_FOUND') },
    { code: 'REALM_KEY_MISSING' as const, error: new MigrationError('realm key missing', 'REALM_KEY_MISSING') },
    { code: 'INTEGRITY_ERROR' as const, error: new MigrationError('integrity error', 'INTEGRITY_ERROR') },
    { code: 'SCHEMA_MISMATCH' as const, error: new MigrationError('schema mismatch', 'SCHEMA_MISMATCH') },
  ])('sets errorCode "$code" on result when import throws a MigrationError with that code', async ({ code, error }) => {
    vi.mocked(budgetService.importData).mockRejectedValue(error);

    const result = await service.migrate(EMAIL, PASSWORD, onProgress);

    expect(result.success).toBe(false);
    expect(result.errorCode).toBe(code);
  });

  it('sets errorCode NO_ACCOUNT_ACCESS when fetchUserData throws a LegacyApiError with that code', async () => {
    vi.mocked(apiClient.fetchUserData).mockRejectedValue(
      new LegacyApiError('No account access found for authenticated user.', 'NO_ACCOUNT_ACCESS'),
    );

    const result = await service.migrate(EMAIL, PASSWORD, onProgress);

    expect(result.success).toBe(false);
    expect(result.errorCode).toBe('NO_ACCOUNT_ACCESS');
  });

  it('sets errorCode UNKNOWN for unrecognised errors', async () => {
    vi.mocked(budgetService.importData).mockRejectedValue(new Error('something totally unexpected'));

    const result = await service.migrate(EMAIL, PASSWORD, onProgress);

    expect(result.errorCode).toBe('UNKNOWN');
  });

  it.each([
    { msg: 'android file copy error', expected: 'ANDROID_FILE_COPY_FAILED' as const },
    { msg: 'coredata file missing', expected: 'IOS_COREDATA_FILE_NOT_FOUND' as const },
    { msg: 'realm key not found', expected: 'REALM_KEY_MISSING' as const },
    { msg: 'integrity check failed', expected: 'INTEGRITY_ERROR' as const },
    { msg: 'schema version mismatch', expected: 'SCHEMA_MISMATCH' as const },
  ])('resolves errorCode "$expected" from plain Error message containing keyword', async ({ msg, expected }) => {
    vi.mocked(budgetService.importData).mockRejectedValue(new Error(msg));

    const result = await service.migrate(EMAIL, PASSWORD, onProgress);

    expect(result.errorCode).toBe(expected);
  });

  // -------------------------------------------------------------------------
  // verifyRollback: force-wipe branch
  // -------------------------------------------------------------------------

  it('calls db.delete() and fires migration_manual_rollback when tables are non-empty after import failure', async () => {
    vi.mocked(budgetService.importData).mockRejectedValue(new Error('DB write failed'));
    // Simulate partial write — one table still has rows
    vi.mocked(db.transactions.count).mockResolvedValueOnce(3);

    const analytics = { track: vi.fn() };
    service = new MigrationService(apiClient, transformer, budgetService, analytics);

    await service.migrate(EMAIL, PASSWORD, onProgress, 0, 'ios');

    expect(db.delete).toHaveBeenCalledOnce();
    expect(analytics.track).toHaveBeenCalledWith('migration_manual_rollback', { platform: 'ios' });
  });

  it('does not call db.delete() when all tables are empty after import failure', async () => {
    vi.mocked(budgetService.importData).mockRejectedValue(new Error('DB write failed'));
    // All counts remain 0 (default mock) — clean rollback, no force-wipe needed

    await service.migrate(EMAIL, PASSWORD, onProgress);

    expect(db.delete).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // Online push — contract tests
  // -------------------------------------------------------------------------

  it('includes pushed field with zero counts when no pushProvider is given', async () => {
    const result = await service.migrate(EMAIL, PASSWORD, onProgress);

    expect(result).toHaveProperty('pushed');
    expect(result.pushed).toEqual({ records: 0, accounts: 0 });
  });

  it('returns pushed: { records: 0, accounts: 0 } when pushProvider does not flag any account', async () => {
    const provider: IMigrationOnlinePushProvider = {
      client: {} as OnlineAccountsClient,
      userPublicKey: new Uint8Array(32),
      emailHashPepper: 'test-pepper',
      shouldPushAccount: () => false,
    };

    const result = await service.migrate(EMAIL, PASSWORD, onProgress, 0, 'unknown', provider);

    expect(result.pushed).toEqual({ records: 0, accounts: 0 });
  });

  it('accepts pushProvider parameter without side effects when no account is flagged', async () => {
    const provider: IMigrationOnlinePushProvider = {
      client: {} as OnlineAccountsClient,
      userPublicKey: new Uint8Array(32),
      emailHashPepper: 'test-pepper',
      shouldPushAccount: () => false,
    };

    const result = await service.migrate(EMAIL, PASSWORD, onProgress, 0, 'unknown', provider);

    expect(result.success).toBe(true);
    expect(result.pushed).toEqual({ records: 0, accounts: 0 });
  });

  // -------------------------------------------------------------------------
  // detectOnlineAccount post-step
  // -------------------------------------------------------------------------

  describe('detectOnlineAccount', () => {
    it('returns isOnline true when legacy account has last_synced set', () => {
      const legacyAccount: LegacyAccount = {
        id: 1,
        name: 'Test Account',
        acronym: 'TA',
        color: '#ff8840',
        deleted: false,
        last_synced: '2022-11-21T17:37:28.556360Z',
      };

      const accesses: LegacyAccess[] = [];

      const result = service.detectOnlineAccount(legacyAccount, accesses);

      expect(result.isOnline).toBe(true);
      expect(result.isShared).toBe(false);
    });

    it('returns isOnline false when legacy account has last_synced null', () => {
      const legacyAccount: LegacyAccount = {
        id: 1,
        name: 'Test Account',
        acronym: 'TA',
        color: '#ff8840',
        deleted: false,
        last_synced: null,
      };

      const accesses: LegacyAccess[] = [];

      const result = service.detectOnlineAccount(legacyAccount, accesses);

      expect(result.isOnline).toBe(false);
      expect(result.isShared).toBe(false);
    });

    it('returns isOnline false when legacy account has last_synced undefined', () => {
      const legacyAccount: LegacyAccount = {
        id: 1,
        name: 'Test Account',
        acronym: 'TA',
        color: '#ff8840',
        deleted: false,
      };

      const accesses: LegacyAccess[] = [];

      const result = service.detectOnlineAccount(legacyAccount, accesses);

      expect(result.isOnline).toBe(false);
      expect(result.isShared).toBe(false);
    });

    it('returns isShared true when account has member accesses', () => {
      const legacyAccount: LegacyAccount = {
        id: 1,
        name: 'Test Account',
        acronym: 'TA',
        color: '#ff8840',
        deleted: false,
      };

      const accesses: LegacyAccess[] = [
        { id: 1, role: 'owner', account: 1, user: { id: 1, email: 'owner@example.com' } },
        { id: 2, role: 'member', account: 1, user: { id: 2, email: 'member1@example.com' } },
        { id: 3, role: 'member', account: 1, user: { id: 3, email: 'member2@example.com' } },
      ];

      const result = service.detectOnlineAccount(legacyAccount, accesses);

      expect(result.isShared).toBe(true);
      expect(result.memberEmails).toEqual(['member1@example.com', 'member2@example.com']);
    });

    it('returns isShared false when account has no member accesses', () => {
      const legacyAccount: LegacyAccount = {
        id: 1,
        name: 'Test Account',
        acronym: 'TA',
        color: '#ff8840',
        deleted: false,
      };

      const accesses: LegacyAccess[] = [
        { id: 1, role: 'owner', account: 1, user: { id: 1, email: 'owner@example.com' } },
      ];

      const result = service.detectOnlineAccount(legacyAccount, accesses);

      expect(result.isShared).toBe(false);
      expect(result.memberEmails).toBeUndefined();
    });

    it('extracts owner email from owner access when user is an object', () => {
      const legacyAccount: LegacyAccount = {
        id: 1,
        name: 'Test Account',
        acronym: 'TA',
        color: '#ff8840',
        deleted: false,
      };

      const accesses: LegacyAccess[] = [
        { id: 1, role: 'owner', account: 1, user: { id: 1, email: 'owner@example.com' } },
      ];

      const result = service.detectOnlineAccount(legacyAccount, accesses);

      expect(result.ownerEmail).toBe('owner@example.com');
    });

    it('returns undefined owner email when user is a number', () => {
      const legacyAccount: LegacyAccount = {
        id: 1,
        name: 'Test Account',
        acronym: 'TA',
        color: '#ff8840',
        deleted: false,
      };

      const accesses: LegacyAccess[] = [
        { id: 1, role: 'owner', account: 1, user: 1 },
      ];

      const result = service.detectOnlineAccount(legacyAccount, accesses);

      expect(result.ownerEmail).toBeUndefined();
    });

    it('filters accesses by account ID', () => {
      const legacyAccount: LegacyAccount = {
        id: 1,
        name: 'Test Account',
        acronym: 'TA',
        color: '#ff8840',
        deleted: false,
      };

      const accesses: LegacyAccess[] = [
        { id: 1, role: 'owner', account: 1, user: { id: 1, email: 'owner@example.com' } },
        { id: 2, role: 'member', account: 2, user: { id: 2, email: 'other@example.com' } },
      ];

      const result = service.detectOnlineAccount(legacyAccount, accesses);

      expect(result.isShared).toBe(false);
      expect(result.memberEmails).toBeUndefined();
    });

    it('handles mixed user object and number formats in accesses', () => {
      const legacyAccount: LegacyAccount = {
        id: 1,
        name: 'Test Account',
        acronym: 'TA',
        color: '#ff8840',
        deleted: false,
      };

      const accesses: LegacyAccess[] = [
        { id: 1, role: 'owner', account: 1, user: { id: 1, email: 'owner@example.com' } },
        { id: 2, role: 'member', account: 1, user: 2 },
        { id: 3, role: 'member', account: 1, user: { id: 3, email: 'member@example.com' } },
      ];

      const result = service.detectOnlineAccount(legacyAccount, accesses);

      expect(result.isShared).toBe(true);
      expect(result.memberEmails).toEqual(['member@example.com']);
    });

    it('returns complete detection result for online shared account', () => {
      const legacyAccount: LegacyAccount = {
        id: 1,
        name: 'Test Account',
        acronym: 'TA',
        color: '#ff8840',
        deleted: false,
        last_synced: '2022-11-21T17:37:28.556360Z',
      };

      const accesses: LegacyAccess[] = [
        { id: 1, role: 'owner', account: 1, user: { id: 1, email: 'owner@example.com' } },
        { id: 2, role: 'member', account: 1, user: { id: 2, email: 'member@example.com' } },
      ];

      const result = service.detectOnlineAccount(legacyAccount, accesses);

      expect(result).toEqual({
        isOnline: true,
        isShared: true,
        ownerEmail: 'owner@example.com',
        memberEmails: ['member@example.com'],
      });
    });

    it('calls onOnlineAccountDetected callback when account is online', async () => {
      const callback = vi.fn();
      const serviceWithCallback = new MigrationService(
        apiClient,
        transformer,
        budgetService,
        undefined,
        callback,
      );

      vi.mocked(apiClient.authenticate).mockResolvedValue(undefined);
      vi.mocked(apiClient.fetchUserData).mockResolvedValue({
        ...mockLegacyData,
        accounts: [{ ...mockAccount, last_synced: '2022-11-21T17:37:28.556360Z' }],
      });
      vi.mocked(transformer.transform).mockReturnValue({
        data: mockExportData,
        errors: [],
      });
      vi.mocked(budgetService.importData).mockResolvedValue({
        accounts: 1,
        transactions: 1,
        categories: 1,
        limits: 0,
        templates: 0,
        recurringItems: 0,
        savingsGoals: 0,
      });

      await serviceWithCallback.migrate(EMAIL, PASSWORD, onProgress);

      expect(callback).toHaveBeenCalledWith(
        mockExportData.account.id,
        expect.objectContaining({
          isOnline: true,
        }),
      );
    });

    it('does not call onOnlineAccountDetected callback when account is offline', async () => {
      const callback = vi.fn();
      const serviceWithCallback = new MigrationService(
        apiClient,
        transformer,
        budgetService,
        undefined,
        callback,
      );

      vi.mocked(apiClient.authenticate).mockResolvedValue(undefined);
      vi.mocked(apiClient.fetchUserData).mockResolvedValue({
        ...mockLegacyData,
        accounts: [{ ...mockAccount, last_synced: null }],
      });
      vi.mocked(transformer.transform).mockReturnValue({
        data: mockExportData,
        errors: [],
      });
      vi.mocked(budgetService.importData).mockResolvedValue({
        accounts: 1,
        transactions: 1,
        categories: 1,
        limits: 0,
        templates: 0,
        recurringItems: 0,
        savingsGoals: 0,
      });

      await serviceWithCallback.migrate(EMAIL, PASSWORD, onProgress);

      expect(callback).not.toHaveBeenCalled();
    });

    it('calls onOnlineAccountDetected callback when account is shared but not online', async () => {
      const callback = vi.fn();
      const serviceWithCallback = new MigrationService(
        apiClient,
        transformer,
        budgetService,
        undefined,
        callback,
      );

      vi.mocked(apiClient.authenticate).mockResolvedValue(undefined);
      vi.mocked(apiClient.fetchUserData).mockResolvedValue({
        ...mockLegacyData,
        accounts: [{ ...mockAccount, last_synced: null }],
        accesses: [
          { id: 1, role: 'owner', account: mockAccount.id, user: { id: 10, email: 'owner@example.com' } },
          { id: 2, role: 'member', account: mockAccount.id, user: { id: 11, email: 'member@example.com' } },
        ],
      });
      vi.mocked(transformer.transform).mockReturnValue({
        data: mockExportData,
        errors: [],
      });
      vi.mocked(budgetService.importData).mockResolvedValue({
        accounts: 1,
        transactions: 1,
        categories: 1,
        limits: 0,
        templates: 0,
        recurringItems: 0,
        savingsGoals: 0,
      });

      await serviceWithCallback.migrate(EMAIL, PASSWORD, onProgress);

      expect(callback).toHaveBeenCalledWith(
        mockExportData.account.id,
        expect.objectContaining({
          isOnline: false,
          isShared: true,
        }),
      );
    });

    it('continues migration when callback throws an error', async () => {
      const callback = vi.fn().mockRejectedValue(new Error('Callback failed'));
      const serviceWithCallback = new MigrationService(
        apiClient,
        transformer,
        budgetService,
        undefined,
        callback,
      );

      vi.mocked(apiClient.authenticate).mockResolvedValue(undefined);
      vi.mocked(apiClient.fetchUserData).mockResolvedValue({
        ...mockLegacyData,
        accounts: [{ ...mockAccount, last_synced: '2022-11-21T17:37:28.556360Z' }],
      });
      vi.mocked(transformer.transform).mockReturnValue({
        data: mockExportData,
        errors: [],
      });
      vi.mocked(budgetService.importData).mockResolvedValue({
        accounts: 1,
        transactions: 1,
        categories: 1,
        limits: 0,
        templates: 0,
        recurringItems: 0,
        savingsGoals: 0,
      });

      const result = await serviceWithCallback.migrate(EMAIL, PASSWORD, onProgress);

      expect(result.success).toBe(true);
      expect(callback).toHaveBeenCalled();
    });

    it('continues migration when DB update fails', async () => {
      const service = new MigrationService(apiClient, transformer, budgetService);

      vi.mocked(apiClient.authenticate).mockResolvedValue(undefined);
      vi.mocked(apiClient.fetchUserData).mockResolvedValue({
        ...mockLegacyData,
        accounts: [{ ...mockAccount, last_synced: '2022-11-21T17:37:28.556360Z' }],
      });
      vi.mocked(transformer.transform).mockReturnValue({
        data: mockExportData,
        errors: [],
      });
      vi.mocked(budgetService.importData).mockResolvedValue({
        accounts: 1,
        transactions: 1,
        categories: 1,
        limits: 0,
        templates: 0,
        recurringItems: 0,
        savingsGoals: 0,
      });
      vi.mocked(db.accounts.update).mockRejectedValue(new Error('DB update failed'));

      const result = await service.migrate(EMAIL, PASSWORD, onProgress);

      expect(result.success).toBe(true);
    });
  });

  // ---------------------------------------------------------------------------
  // attachPendingTemplates call-site — service-level contract
  // ---------------------------------------------------------------------------

  describe('attachPendingTemplates call-site', () => {
    const SERVER_ACCOUNT_ID = 'server-id-online';

    // Owner access is required for needsPush=true, which is required for
    // provisionAndLoadKey to run and set serverAccountId for the attach block.
    const onlineLegacyData: LegacyUserData = {
      ...mockLegacyData,
      accounts: [{ ...mockAccount, last_synced: '2022-11-21T17:37:28.556360Z' }],
      accesses: [
        { id: 1, role: 'owner', account: mockAccount.id, user: { id: 1, email: EMAIL } },
      ],
    };

    function makePushProvider(serverId = SERVER_ACCOUNT_ID): IMigrationOnlinePushProvider {
      return {
        client: {
          createAccount: vi.fn().mockResolvedValue({ id: serverId, keyEpoch: 1 as const }),
          pushChangeRecords: vi.fn().mockResolvedValue({ results: [] }),
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
        } as OnlineAccountsClient,
        userPublicKey: new Uint8Array(32),
        emailHashPepper: 'test-pepper',
      };
    }

    it('calls attachPendingTemplates with localAccountId + the legacy account id (not the newly created server id)', async () => {
      vi.mocked(apiClient.fetchUserData).mockResolvedValue(onlineLegacyData);

      await service.migrate(EMAIL, PASSWORD, onProgress, 0, 'test', makePushProvider());

      // The stash was written during local migration keyed by the legacy
      // account id (serverAccountKey() = onlineId ?? remoteId), so the attach
      // lookup must use that same id — NOT SERVER_ACCOUNT_ID, which is a
      // brand-new id minted by createAccount() on this session's server and
      // has no relation to the stash key.
      expect(mockAttachPendingTemplates).toHaveBeenCalledWith(ACCOUNT_ID, String(onlineLegacyData.accounts[0].id));
      expect(mockAttachPendingTemplates).not.toHaveBeenCalledWith(ACCOUNT_ID, SERVER_ACCOUNT_ID);
    });

    it('calls attachPendingTemplates even when no pushProvider is supplied (user not logged in)', async () => {
      vi.mocked(apiClient.fetchUserData).mockResolvedValue(onlineLegacyData);

      // No pushProvider argument at all — this must not block template attach.
      // The account still imports locally; attach only needs the local
      // account + legacy id, not a live server session.
      await service.migrate(EMAIL, PASSWORD, onProgress, 0, 'test');

      expect(mockAttachPendingTemplates).toHaveBeenCalledWith(ACCOUNT_ID, String(onlineLegacyData.accounts[0].id));
    });

    it('does not abort migration when attachPendingTemplates throws', async () => {
      mockAttachPendingTemplates.mockRejectedValueOnce(new Error('Stash read failed'));
      vi.mocked(apiClient.fetchUserData).mockResolvedValue(onlineLegacyData);

      const result = await service.migrate(EMAIL, PASSWORD, onProgress, 0, 'test', makePushProvider());

      expect(result.success).toBe(true);
    });
  });
});
