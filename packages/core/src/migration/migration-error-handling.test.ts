import { describe, it, expect, beforeEach, vi } from 'vitest';
import { MigrationService, MigrationError } from './migration.service.js';
import type {
  ILegacyApiClient,
  ILegacyDataTransformer,
  IMigrationAnalytics,
  MigrationStep,
  TransformResult,
} from './migration.service.js';
import type { LegacyUserData } from './legacy-types.js';
import type { BudgetService } from '../services/budget.service.js';
import type { ExportData } from '../types/index.js';

// =============================================================================
// DB MOCK — prevent real Dexie from being instantiated
// =============================================================================

vi.mock('../db', () => ({
  db: {
    accounts: { count: vi.fn().mockResolvedValue(0) },
    transactions: { count: vi.fn().mockResolvedValue(0) },
    categories: { count: vi.fn().mockResolvedValue(0) },
    limits: { count: vi.fn().mockResolvedValue(0) },
    templates: { count: vi.fn().mockResolvedValue(0) },
    recurringItems: { count: vi.fn().mockResolvedValue(0) },
    savingsGoals: { count: vi.fn().mockResolvedValue(0) },
    delete: vi.fn().mockResolvedValue(undefined),
  },
}));

// =============================================================================
// FIXTURES
// =============================================================================

const EMAIL = 'user@example.com';
const PASSWORD = 'secret';
const ACCOUNT_ID = 'test-account-id';

const mockAccount = { id: 1, name: 'Personal', acronym: 'P', color: '#ff8840', deleted: false };

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
  transactions: [],
  categories: [],
  limits: [],
  templates: [],
  recurringItems: [],
  savingsGoals: [],
};

// =============================================================================
// HELPERS
// =============================================================================

function makeMocks(analyticsOverride?: Partial<IMigrationAnalytics>) {
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
      accounts: 1, transactions: 0, categories: 0, limits: 0,
      templates: 0, recurringItems: 0, savingsGoals: 0,
    }),
  } as unknown as BudgetService;

  const analytics: IMigrationAnalytics = {
    track: vi.fn(),
    ...analyticsOverride,
  };

  return { apiClient, transformer, budgetService, analytics };
}

const onProgress = (step: MigrationStep) => { void step; };

// =============================================================================
// ERROR CODE MAPPING
// =============================================================================

describe('MigrationService — error codes', () => {
  it('resolves ANDROID_FILE_COPY_FAILED from a MigrationError', async () => {
    const { apiClient, transformer, budgetService, analytics } = makeMocks();
    vi.mocked(budgetService.importData).mockRejectedValue(
      new MigrationError('copy failed', 'ANDROID_FILE_COPY_FAILED', 'transactions'),
    );

    const service = new MigrationService(apiClient, transformer, budgetService, analytics);
    const result = await service.migrate(EMAIL, PASSWORD, onProgress);

    expect(result.success).toBe(false);
    expect(result.errorCode).toBe('ANDROID_FILE_COPY_FAILED');
  });

  it('resolves IOS_COREDATA_FILE_NOT_FOUND from a MigrationError', async () => {
    const { apiClient, transformer, budgetService, analytics } = makeMocks();
    vi.mocked(budgetService.importData).mockRejectedValue(
      new MigrationError('file not found', 'IOS_COREDATA_FILE_NOT_FOUND'),
    );

    const service = new MigrationService(apiClient, transformer, budgetService, analytics);
    const result = await service.migrate(EMAIL, PASSWORD, onProgress);

    expect(result.errorCode).toBe('IOS_COREDATA_FILE_NOT_FOUND');
  });

  it('resolves REALM_KEY_MISSING from a MigrationError', async () => {
    const { apiClient, transformer, budgetService, analytics } = makeMocks();
    vi.mocked(budgetService.importData).mockRejectedValue(
      new MigrationError('realm key missing', 'REALM_KEY_MISSING'),
    );

    const service = new MigrationService(apiClient, transformer, budgetService, analytics);
    const result = await service.migrate(EMAIL, PASSWORD, onProgress);

    expect(result.errorCode).toBe('REALM_KEY_MISSING');
  });

  it('resolves INTEGRITY_ERROR from a MigrationError', async () => {
    const { apiClient, transformer, budgetService, analytics } = makeMocks();
    vi.mocked(transformer.transform).mockImplementation(() => {
      throw new MigrationError('integrity check failed', 'INTEGRITY_ERROR');
    });

    const service = new MigrationService(apiClient, transformer, budgetService, analytics);
    const result = await service.migrate(EMAIL, PASSWORD, onProgress);

    expect(result.errorCode).toBe('INTEGRITY_ERROR');
  });

  it('resolves SCHEMA_MISMATCH from a MigrationError', async () => {
    const { apiClient, transformer, budgetService, analytics } = makeMocks();
    vi.mocked(transformer.transform).mockImplementation(() => {
      throw new MigrationError('schema version mismatch', 'SCHEMA_MISMATCH');
    });

    const service = new MigrationService(apiClient, transformer, budgetService, analytics);
    const result = await service.migrate(EMAIL, PASSWORD, onProgress);

    expect(result.errorCode).toBe('SCHEMA_MISMATCH');
  });

  it('resolves UNKNOWN for unrecognised errors', async () => {
    const { apiClient, transformer, budgetService, analytics } = makeMocks();
    vi.mocked(budgetService.importData).mockRejectedValue(new Error('something random'));

    const service = new MigrationService(apiClient, transformer, budgetService, analytics);
    const result = await service.migrate(EMAIL, PASSWORD, onProgress);

    expect(result.errorCode).toBe('UNKNOWN');
  });

  it('infers ANDROID_FILE_COPY_FAILED from error message heuristic', async () => {
    const { apiClient, transformer, budgetService, analytics } = makeMocks();
    vi.mocked(budgetService.importData).mockRejectedValue(
      new Error('android file copy error'),
    );

    const service = new MigrationService(apiClient, transformer, budgetService, analytics);
    const result = await service.migrate(EMAIL, PASSWORD, onProgress);

    expect(result.errorCode).toBe('ANDROID_FILE_COPY_FAILED');
  });

  it('infers REALM_KEY_MISSING from error message heuristic', async () => {
    const { apiClient, transformer, budgetService, analytics } = makeMocks();
    vi.mocked(budgetService.importData).mockRejectedValue(
      new Error('realm key not found'),
    );

    const service = new MigrationService(apiClient, transformer, budgetService, analytics);
    const result = await service.migrate(EMAIL, PASSWORD, onProgress);

    expect(result.errorCode).toBe('REALM_KEY_MISSING');
  });
});

// =============================================================================
// ANALYTICS
// =============================================================================

describe('MigrationService — analytics', () => {
  it('fires migration_error with platform, entityType, errorCode, retryCount on import failure', async () => {
    const { apiClient, transformer, budgetService, analytics } = makeMocks();
    vi.mocked(budgetService.importData).mockRejectedValue(
      new MigrationError('copy failed', 'ANDROID_FILE_COPY_FAILED', 'transactions'),
    );

    const service = new MigrationService(apiClient, transformer, budgetService, analytics);
    await service.migrate(EMAIL, PASSWORD, onProgress, 2);

    expect(analytics.track).toHaveBeenCalledWith('migration_error', expect.objectContaining({
      errorCode: 'ANDROID_FILE_COPY_FAILED',
      retryCount: 2,
    }));
  });

  it('fires migration_error on transform failure', async () => {
    const { apiClient, transformer, budgetService, analytics } = makeMocks();
    vi.mocked(transformer.transform).mockImplementation(() => {
      throw new MigrationError('schema mismatch', 'SCHEMA_MISMATCH');
    });

    const service = new MigrationService(apiClient, transformer, budgetService, analytics);
    await service.migrate(EMAIL, PASSWORD, onProgress);

    expect(analytics.track).toHaveBeenCalledWith('migration_error', expect.objectContaining({
      errorCode: 'SCHEMA_MISMATCH',
    }));
  });

  it('fires migration_error on fetch failure', async () => {
    const { apiClient, transformer, budgetService, analytics } = makeMocks();
    vi.mocked(apiClient.fetchUserData).mockRejectedValue(new Error('network error'));

    const service = new MigrationService(apiClient, transformer, budgetService, analytics);
    await service.migrate(EMAIL, PASSWORD, onProgress);

    expect(analytics.track).toHaveBeenCalledWith('migration_error', expect.objectContaining({
      entityType: 'fetch',
    }));
  });

  it('does not fire analytics on success', async () => {
    const { apiClient, transformer, budgetService, analytics } = makeMocks();

    const service = new MigrationService(apiClient, transformer, budgetService, analytics);
    const result = await service.migrate(EMAIL, PASSWORD, onProgress);

    expect(result.success).toBe(true);
    expect(analytics.track).not.toHaveBeenCalled();
  });
});

// =============================================================================
// ROLLBACK VERIFICATION
// =============================================================================

describe('MigrationService — rollback verification', () => {
  it('does not call db.delete() when all tables are empty after failure', async () => {
    const { db } = await import('../db');
    const { apiClient, transformer, budgetService, analytics } = makeMocks();
    vi.mocked(budgetService.importData).mockRejectedValue(new Error('import failed'));

    const service = new MigrationService(apiClient, transformer, budgetService, analytics);
    await service.migrate(EMAIL, PASSWORD, onProgress);

    expect(db.delete).not.toHaveBeenCalled();
    expect(analytics.track).not.toHaveBeenCalledWith('migration_manual_rollback', expect.anything());
  });

  it('calls db.delete() and fires migration_manual_rollback when tables are non-empty after failure', async () => {
    const { db } = await import('../db');
    // Simulate partial write — transactions table has rows
    vi.mocked(db.transactions.count).mockResolvedValueOnce(5);

    const { apiClient, transformer, budgetService, analytics } = makeMocks();
    vi.mocked(budgetService.importData).mockRejectedValue(new Error('import failed'));

    const service = new MigrationService(apiClient, transformer, budgetService, analytics);
    await service.migrate(EMAIL, PASSWORD, onProgress);

    expect(db.delete).toHaveBeenCalledOnce();
    expect(analytics.track).toHaveBeenCalledWith('migration_manual_rollback', expect.objectContaining({
      platform: expect.any(String),
    }));
  });
});

// =============================================================================
// RETRY COUNT
// =============================================================================

describe('MigrationService — retryCount', () => {
  it('carries retryCount=0 on first attempt', async () => {
    const { apiClient, transformer, budgetService, analytics } = makeMocks();
    vi.mocked(budgetService.importData).mockRejectedValue(new Error('fail'));

    const service = new MigrationService(apiClient, transformer, budgetService, analytics);
    const result = await service.migrate(EMAIL, PASSWORD, onProgress, 0);

    expect(result.retryCount).toBe(0);
  });

  it('carries retryCount=3 when passed', async () => {
    const { apiClient, transformer, budgetService, analytics } = makeMocks();
    vi.mocked(budgetService.importData).mockRejectedValue(new Error('fail'));

    const service = new MigrationService(apiClient, transformer, budgetService, analytics);
    const result = await service.migrate(EMAIL, PASSWORD, onProgress, 3);

    expect(result.retryCount).toBe(3);
  });

  it('carries retryCount on success', async () => {
    const { apiClient, transformer, budgetService, analytics } = makeMocks();

    const service = new MigrationService(apiClient, transformer, budgetService, analytics);
    const result = await service.migrate(EMAIL, PASSWORD, onProgress, 1);

    expect(result.success).toBe(true);
    expect(result.retryCount).toBe(1);
  });
});
