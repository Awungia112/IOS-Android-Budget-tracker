import type { BudgetService } from '../../services/budget.service.js';
import type { MigrationResult } from '../migration.service.js';
import { createImportedCounts } from '../migration-result.js';

type ImportCounts = MigrationResult['imported'];
type MockedFunction<TArgs extends unknown[], TResult> = ((...args: TArgs) => TResult) & {
  mock: { calls: TArgs[] };
  mockRejectedValue(error: unknown): MockedFunction<TArgs, TResult>;
  mockResolvedValue(value: Awaited<TResult>): MockedFunction<TArgs, TResult>;
};

type MockFactory = <TArgs extends unknown[], TResult>(
  implementation: (...args: TArgs) => TResult,
) => MockedFunction<TArgs, TResult>;

type BudgetServiceMockOptions = {
  counts?: Partial<ImportCounts>;
  onImport?: () => void;
};

type MockedBudgetService = Pick<
  BudgetService,
  'initializeDatabase' | 'importData' | 'deleteAccount' | 'getRecurringItemsByAccountId' | 'reconcileRecurring'
> & {
  initializeDatabase: MockedFunction<
    Parameters<BudgetService['initializeDatabase']>,
    ReturnType<BudgetService['initializeDatabase']>
  >;
  importData: MockedFunction<
    Parameters<BudgetService['importData']>,
    ReturnType<BudgetService['importData']>
  >;
  deleteAccount: MockedFunction<
    Parameters<BudgetService['deleteAccount']>,
    ReturnType<BudgetService['deleteAccount']>
  >;
  getRecurringItemsByAccountId: MockedFunction<
    Parameters<BudgetService['getRecurringItemsByAccountId']>,
    ReturnType<BudgetService['getRecurringItemsByAccountId']>
  >;
  reconcileRecurring: MockedFunction<
    Parameters<BudgetService['reconcileRecurring']>,
    ReturnType<BudgetService['reconcileRecurring']>
  >;
};

export const DEFAULT_IMPORTED_COUNTS: ImportCounts = createImportedCounts({
  accounts: 1,
  transactions: 1,
  categories: 1,
});

export function importedCounts(overrides: Partial<ImportCounts> = {}): ImportCounts {
  return {
    ...DEFAULT_IMPORTED_COUNTS,
    ...overrides,
  };
}

export function makeBudgetServiceMock(
  mockFn: MockFactory,
  options: BudgetServiceMockOptions = {},
): MockedBudgetService {
  return {
    initializeDatabase: mockFn(async () => undefined),
    importData: mockFn(async (..._args: Parameters<BudgetService['importData']>) => {
      options.onImport?.();
      return importedCounts(options.counts);
    }),
    deleteAccount: mockFn(async (_accountId: string) => undefined),
    getRecurringItemsByAccountId: mockFn(async (_accountId: string) => []),
    reconcileRecurring: mockFn(async (_item: Parameters<BudgetService['reconcileRecurring']>[0]) => undefined),
  };
}
