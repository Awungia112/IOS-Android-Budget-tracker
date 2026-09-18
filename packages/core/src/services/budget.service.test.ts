/**
 * BudgetService Unit Tests
 *
 * Tests all write operations with mocked repositories and ChangeLog.
 * 
 * KNOWN LIMITATION: Tests access private repository fields using type casting
 * (e.g., `(service as any).categoryRepo`) to mock failure scenarios. This is
 * fragile - renaming a private property breaks tests silently.
 * 
 * RECOMMENDED IMPROVEMENT: Use constructor injection for repositories:
 * ```typescript
 * constructor(
 *   private accountRepo = new AccountRepository(),
 *   private transactionRepo = new TransactionRepository(),
 *   // ... etc
 * ) {}
 * ```
 * This would allow proper dependency injection in tests without type casting.
 * However, this refactor is deferred as it's outside the scope of Task 3.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { BudgetService } from './budget.service.js';
import { changeLog } from '../changelog/index.js';
import { COMMAND_TYPES } from '../commands/types.js';
import type {
  Account,
  CreateAccount,
  Transaction,
  CreateTransaction,
  Category,
  CreateCategory,
  Limit,
  CreateLimit,
  Template,
  CreateTemplate,
  RecurringItem,
  CreateRecurringItem,
  SavingsGoal,
  CreateSavingsGoal,
  ExportData
} from '../types/index.js';

// Mock individual repository files (barrel file was removed)
vi.mock('../repositories/account.repository', () => ({
  AccountRepository: vi.fn().mockImplementation(() => ({
    create: vi.fn().mockResolvedValue(undefined),
    update: vi.fn().mockResolvedValue(undefined),
    delete: vi.fn().mockResolvedValue(undefined),
    deleteAccountWithCascade: vi.fn().mockResolvedValue(undefined),
    getById: vi.fn().mockResolvedValue(undefined),
    getAll: vi.fn().mockResolvedValue([]),
    hasDuplicateName: vi.fn().mockResolvedValue(false)
  }))
}));

vi.mock('../repositories/transaction.repository', () => ({
  TransactionRepository: vi.fn().mockImplementation(() => ({
    create: vi.fn().mockResolvedValue(undefined),
    update: vi.fn().mockResolvedValue(undefined),
    delete: vi.fn().mockResolvedValue(undefined),
    bulkCreate: vi.fn().mockResolvedValue(undefined),
    bulkUpsert: vi.fn().mockResolvedValue(undefined),
    bulkDelete: vi.fn().mockResolvedValue(undefined),
    getById: vi.fn().mockResolvedValue(undefined),
    getByAccountId: vi.fn().mockResolvedValue([]),
    getByAccountIdIncludingArchived: vi.fn().mockResolvedValue([])
  }))
}));

vi.mock('../repositories/category.repository', () => ({
  CategoryRepository: vi.fn().mockImplementation(() => ({
    create: vi.fn().mockResolvedValue(undefined),
    bulkCreate: vi.fn().mockResolvedValue(undefined),
    update: vi.fn().mockResolvedValue(undefined),
    delete: vi.fn().mockResolvedValue(undefined),
    getById: vi.fn().mockResolvedValue(undefined),
    getByAccountId: vi.fn().mockResolvedValue([])
  }))
}));

vi.mock('../repositories/limit.repository', () => ({
  LimitRepository: vi.fn().mockImplementation(() => ({
    create: vi.fn().mockResolvedValue(undefined),
    update: vi.fn().mockResolvedValue(undefined),
    delete: vi.fn().mockResolvedValue(undefined),
    bulkCreate: vi.fn().mockResolvedValue(undefined),
    getById: vi.fn().mockResolvedValue(undefined),
    getByAccountId: vi.fn().mockResolvedValue([])
  }))
}));

vi.mock('../repositories/template.repository', () => ({
  TemplateRepository: vi.fn().mockImplementation(() => ({
    create: vi.fn().mockResolvedValue(undefined),
    update: vi.fn().mockResolvedValue(undefined),
    delete: vi.fn().mockResolvedValue(undefined),
    bulkCreate: vi.fn().mockResolvedValue(undefined),
    getById: vi.fn().mockResolvedValue(undefined),
    getByAccountId: vi.fn().mockResolvedValue([])
  }))
}));

vi.mock('../repositories/recurring.repository', () => ({
  RecurringRepository: vi.fn().mockImplementation(() => ({
    create: vi.fn().mockResolvedValue(undefined),
    update: vi.fn().mockResolvedValue(undefined),
    delete: vi.fn().mockResolvedValue(undefined),
    bulkCreate: vi.fn().mockResolvedValue(undefined),
    getById: vi.fn().mockResolvedValue(undefined),
    getByAccountId: vi.fn().mockResolvedValue([])
  }))
}));

vi.mock('../repositories/savings.repository', () => ({
  SavingsRepository: vi.fn().mockImplementation(() => ({
    create: vi.fn().mockResolvedValue(undefined),
    update: vi.fn().mockResolvedValue(undefined),
    delete: vi.fn().mockResolvedValue(undefined),
    bulkCreate: vi.fn().mockResolvedValue(undefined),
    getById: vi.fn().mockResolvedValue(undefined),
    getByAccountId: vi.fn().mockResolvedValue([])
  }))
}));

// Mock database
vi.mock('../db', () => ({
  db: {
    accountSyncMetadata: {
      get: vi.fn().mockResolvedValue(undefined)
    },
    resetDatabase: vi.fn().mockResolvedValue(undefined),
    // Repositories are mocked, so a transaction only needs to run its body.
    transaction: vi.fn(async (...args: unknown[]) => (args[args.length - 1] as () => Promise<unknown>)()),
  },
  DEFAULT_CATEGORIES: [
    { name: 'category_salary', type: 'income', isDefault: true },
    { name: 'category_food', type: 'expense', isDefault: true }
  ],
  DEFAULT_ACCOUNT_ID: 'default-account-id'
}));

// Mock UUID generator
vi.mock('../utils/uuid', () => ({
  generateUUID: vi.fn(() => 'test-uuid-' + Math.random().toString(36).substring(7))
}));

describe.sequential('BudgetService', () => {
  let service: BudgetService;

  beforeEach(async () => {
    // Clear the changeLog before each test - this resets nextSequence to 1
    await changeLog.clear();
    
    // Create new service instance
    service = new BudgetService();
  });

  afterEach(async () => {
    // Clean up after each test
    await changeLog.clear();
  });

  describe('Account Operations', () => {
    it('should create an account', async () => {
      const data: CreateAccount = {
        name: 'Test Account',
        initials: 'TA'
      };

      const result = await service.createAccount(data);

      expect(result).toMatchObject(data);
      expect(result.id).toBeDefined();
      
      // Should log CREATE_ACCOUNT + BULK_CREATE_CATEGORIES commands (2 total)
      expect(await changeLog.count()).toBe(2);
      
      const commands = await changeLog.getAll();
      expect(commands[0].command.type).toBe(COMMAND_TYPES.CREATE_ACCOUNT);
      expect(commands[0].command.payload).toEqual(result);
      expect(commands[1].command.type).toBe(COMMAND_TYPES.BULK_CREATE_CATEGORIES);
    });

    it('should rollback account creation if category creation fails', async () => {
      const data: CreateAccount = {
        name: 'Test Account',
        initials: 'TA'
      };

      // Mock category bulkCreate to fail
      const categoryRepo = (service as any).categoryRepo;
      const accountRepo = (service as any).accountRepo;
      
      categoryRepo.bulkCreate = vi.fn().mockRejectedValue(new Error('Database quota exceeded'));
      const deleteSpy = vi.spyOn(accountRepo, 'delete');

      // Attempt to create account
      await expect(service.createAccount(data)).rejects.toThrow('Database quota exceeded');

      // Verify account was rolled back
      expect(deleteSpy).toHaveBeenCalledTimes(1);
      
      // Verify no commands were logged (all rolled back)
      expect(await changeLog.count()).toBe(0);
    });

    it('should rollback changelog even if account deletion fails during rollback', async () => {
      const data: CreateAccount = {
        name: 'Test Account',
        initials: 'TA'
      };

      // Mock both category creation and account deletion to fail
      const categoryRepo = (service as any).categoryRepo;
      const accountRepo = (service as any).accountRepo;
      
      categoryRepo.bulkCreate = vi.fn().mockRejectedValue(new Error('Category creation failed'));
      accountRepo.delete = vi.fn().mockRejectedValue(new Error('Delete failed'));

      // Attempt to create account
      await expect(service.createAccount(data)).rejects.toThrow('Category creation failed');

      // Verify changelog was still rolled back even though delete failed
      expect(await changeLog.count()).toBe(0);
    });

    it('should update an account', async () => {
      const account: Account = {
        id: 'account-1',
        name: 'Updated Account',
        initials: 'UA'
      };

      const result = await service.updateAccount(account);

      expect(result).toEqual(account);
      expect(await changeLog.count()).toBe(1);
      
      const commands = await changeLog.getAll();
      expect(commands[0].command.type).toBe(COMMAND_TYPES.UPDATE_ACCOUNT);
      expect(commands[0].command.payload).toEqual(account);
    });

    it('should delete an account', async () => {
      const accountId = 'account-1';

      await service.deleteAccount(accountId);

      expect(await changeLog.count()).toBe(1);
      
      const commands = await changeLog.getAll();
      expect(commands[0].command.type).toBe(COMMAND_TYPES.DELETE_ACCOUNT);
      expect(commands[0].command.payload).toEqual({ id: accountId });
    });

    describe('Duplicate Account Name Validation', () => {
      it('should prevent creating an account with an existing name (exact match)', async () => {
        const accountRepo = (service as any).accountRepo;
        accountRepo.hasDuplicateName = vi.fn().mockResolvedValue(true);

        const data: CreateAccount = {
          name: 'Checking',
          initials: 'CH'
        };

        await expect(service.createAccount(data)).rejects.toThrow(
          "An account named 'Checking' already exists."
        );

        expect(accountRepo.hasDuplicateName).toHaveBeenCalledWith('Checking');
        expect(await changeLog.count()).toBe(0);
      });

      it('should prevent creating an account with an existing name (case-insensitive)', async () => {
        const accountRepo = (service as any).accountRepo;
        accountRepo.hasDuplicateName = vi.fn().mockResolvedValue(true);

        const data: CreateAccount = {
          name: 'CHECKING',
          initials: 'CH'
        };

        await expect(service.createAccount(data)).rejects.toThrow(
          "An account named 'CHECKING' already exists."
        );

        expect(accountRepo.hasDuplicateName).toHaveBeenCalledWith('CHECKING');
        expect(await changeLog.count()).toBe(0);
      });

      it('should allow creating an account with a unique name', async () => {
        const accountRepo = (service as any).accountRepo;
        accountRepo.hasDuplicateName = vi.fn().mockResolvedValue(false);

        const data: CreateAccount = {
          name: 'New Account',
          initials: 'NA'
        };

        const result = await service.createAccount(data);

        expect(result).toMatchObject(data);
        expect(accountRepo.hasDuplicateName).toHaveBeenCalledWith('New Account');
      });

      it('should prevent renaming an account to an existing name', async () => {
        const accountRepo = (service as any).accountRepo;
        accountRepo.hasDuplicateName = vi.fn().mockResolvedValue(true);

        const account: Account = {
          id: 'account-1',
          name: 'Checking',
          initials: 'CH'
        };

        await expect(service.updateAccount(account)).rejects.toThrow(
          "An account named 'Checking' already exists."
        );

        expect(accountRepo.hasDuplicateName).toHaveBeenCalledWith('Checking', 'account-1');
        expect(await changeLog.count()).toBe(0);
      });

      it('should allow renaming an account to its own name (no-op edit)', async () => {
        const accountRepo = (service as any).accountRepo;
        // Mock returns false because hasDuplicateName excludes the account being updated
        accountRepo.hasDuplicateName = vi.fn().mockResolvedValue(false);

        const account: Account = {
          id: 'account-1',
          name: 'Checking',
          initials: 'CH'
        };

        const result = await service.updateAccount(account);

        expect(result).toEqual(account);
        expect(accountRepo.hasDuplicateName).toHaveBeenCalledWith('Checking', 'account-1');
        expect(await changeLog.count()).toBe(1);
      });

      it('should allow renaming an account to a unique name', async () => {
        const accountRepo = (service as any).accountRepo;
        accountRepo.hasDuplicateName = vi.fn().mockResolvedValue(false);

        const account: Account = {
          id: 'account-1',
          name: 'Savings Updated',
          initials: 'SU'
        };

        const result = await service.updateAccount(account);

        expect(result).toEqual(account);
        expect(accountRepo.hasDuplicateName).toHaveBeenCalledWith('Savings Updated', 'account-1');
        expect(await changeLog.count()).toBe(1);
      });
    });
  });

  describe('Transaction Operations', () => {
    it('should create a transaction', async () => {
      const data: CreateTransaction = {
        type: 'expense',
        amount: 100,
        category: 'food',
        date: '2024-01-01',
        title: 'Groceries'
      };
      const accountId = 'account-1';

      const result = await service.createTransaction(data, accountId);

      expect(result).toMatchObject(data);
      expect(result.id).toBeDefined();
      expect(result.accountId).toBe(accountId);
      expect(result.createdAt).toBeDefined();
      expect(await changeLog.count()).toBe(1);
      
      const commands = await changeLog.getAll();
      expect(commands[0].command.type).toBe(COMMAND_TYPES.CREATE_TRANSACTION);
    });

    it('should persist transaction dates as calendar dates without a time component', async () => {
      const result = await service.createTransaction({
        type: 'expense',
        amount: 100,
        category: 'food',
        date: '2024-01-01T23:30:00.000Z',
        title: 'Calendar date',
      }, 'account-1');

      expect(result.date).toBe('2024-01-01');
    });

    it('should update a transaction', async () => {
      const transaction: Transaction = {
        id: 'tx-1',
        type: 'expense',
        amount: 150,
        category: 'food',
        date: '2024-01-01',
        title: 'Updated Groceries',
        accountId: 'account-1'
      };

      const result = await service.updateTransaction(transaction);

      // Should add executedAt for past transactions
      expect(result).toMatchObject({
        ...transaction,
        executedAt: expect.any(String)
      });
      expect(await changeLog.count()).toBe(1);
      
      const commands = await changeLog.getAll();
      expect(commands[0].command.type).toBe(COMMAND_TYPES.UPDATE_TRANSACTION);
    });

    it('should normalize transaction dates when updating', async () => {
      const result = await service.updateTransaction({
        id: 'tx-date-normalization',
        type: 'expense',
        amount: 150,
        category: 'food',
        date: '2024-01-01T23:30:00.000Z',
        title: 'Updated date',
        accountId: 'account-1',
      });

      expect(result.date).toBe('2024-01-01');
    });

    it('should delete a transaction', async () => {
      const id = 'tx-1';
      const accountId = 'account-1';

      await service.deleteTransaction(id, accountId);

      expect(await changeLog.count()).toBe(1);
      
      const commands = await changeLog.getAll();
      expect(commands[0].command.type).toBe(COMMAND_TYPES.DELETE_TRANSACTION);
      expect(commands[0].command.payload).toEqual({ id });
    });

    it('should set executedAt for past transactions on create', async () => {
      const pastDate = '2024-01-01';
      const transactionData: CreateTransaction = {
        type: 'expense',
        amount: 100,
        category: 'food',
        date: pastDate,
        title: 'Past Transaction'
      };

      const result = await service.createTransaction(transactionData, 'account-1');

      expect(result.executedAt).toBeDefined();
      expect(result.executedAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    });

    it('should not set executedAt for future transactions on create', async () => {
      const futureDate = '2099-12-31';
      const transactionData: CreateTransaction = {
        type: 'expense',
        amount: 100,
        category: 'food',
        date: futureDate,
        title: 'Future Transaction'
      };

      const result = await service.createTransaction(transactionData, 'account-1');

      expect(result.executedAt).toBeUndefined();
    });

    it('should set executedAt when updating transaction date from future to past', async () => {
      const transaction: Transaction = {
        id: 'tx-1',
        type: 'expense',
        amount: 100,
        category: 'food',
        date: '2024-01-01', // Past date
        title: 'Transaction',
        accountId: 'account-1'
        // No executedAt initially
      };

      const result = await service.updateTransaction(transaction);

      expect(result.executedAt).toBeDefined();
    });

    it('should clear executedAt when updating transaction date from past to future', async () => {
      const transaction: Transaction = {
        id: 'tx-1',
        type: 'expense',
        amount: 100,
        category: 'food',
        date: '2099-12-31', // Future date
        title: 'Transaction',
        accountId: 'account-1',
        executedAt: '2024-01-01T00:00:00.000Z' // Had executedAt
      };

      const result = await service.updateTransaction(transaction);

      expect(result.executedAt).toBeUndefined();
    });

    it('should preserve existing executedAt when updating past transaction', async () => {
      const originalExecutedAt = '2024-01-01T10:00:00.000Z';
      const transaction: Transaction = {
        id: 'tx-1',
        type: 'expense',
        amount: 100,
        category: 'food',
        date: '2024-01-01',
        title: 'Transaction',
        accountId: 'account-1',
        executedAt: originalExecutedAt
      };

      const result = await service.updateTransaction(transaction);

      expect(result.executedAt).toBe(originalExecutedAt);
    });
  });

  describe('Category Operations', () => {
    it('should create a category', async () => {
      const data: CreateCategory = {
        name: 'Test Category',
        type: 'expense',
        icon: 'test-icon'
      };
      const accountId = 'account-1';

      const result = await service.createCategory(data, accountId);

      expect(result).toMatchObject(data);
      expect(result.id).toBeDefined();
      expect(result.accountId).toBe(accountId);
      expect(result.isDefault).toBe(false);
      expect(await changeLog.count()).toBe(1);
      
      const commands = await changeLog.getAll();
      expect(commands[0].command.type).toBe(COMMAND_TYPES.CREATE_CATEGORY);
    });

    it('should bulk create categories', async () => {
      const data: CreateCategory[] = [
        { name: 'Category 1', type: 'expense', icon: 'icon1' },
        { name: 'Category 2', type: 'income', icon: 'icon2' }
      ];
      const accountId = 'account-1';

      const result = await service.bulkCreateCategories(data, accountId);

      expect(result).toHaveLength(2);
      expect(result[0].accountId).toBe(accountId);
      expect(result[1].accountId).toBe(accountId);
      expect(await changeLog.count()).toBe(1);
      
      const commands = await changeLog.getAll();
      expect(commands[0].command.type).toBe(COMMAND_TYPES.BULK_CREATE_CATEGORIES);
    });

    it('should delete a category', async () => {
      const id = 'cat-1';
      const accountId = 'account-1';

      await service.deleteCategory(id, accountId);

      expect(await changeLog.count()).toBe(1);
      
      const commands = await changeLog.getAll();
      expect(commands[0].command.type).toBe(COMMAND_TYPES.DELETE_CATEGORY);
      expect(commands[0].command.payload).toEqual({ id });
    });

    it('should update a category', async () => {
      const id = 'cat-1';
      const accountId = 'account-1';
      const existingCategory: Category = {
        id,
        name: 'Old Name',
        type: 'expense',
        isDefault: false,
        accountId,
        icon: 'old-icon',
        color: '#000000'
      };

      // Mock getById to return the existing category
      (service as any).categoryRepo.getById.mockResolvedValue(existingCategory);

      const updates = { name: 'New Name', icon: 'new-icon', color: '#FF0000' };
      const result = await service.updateCategory(id, updates, accountId);

      expect(result.name).toBe('New Name');
      expect(result.icon).toBe('new-icon');
      expect(result.color).toBe('#FF0000');
      expect(result.id).toBe(id);
      expect(result.accountId).toBe(accountId);
      expect(result.isDefault).toBe(false);
      expect(result.type).toBe('expense');

      // Verify the update was called with merged data
      expect((service as any).categoryRepo.update).toHaveBeenCalledWith(
        expect.objectContaining({
          id,
          name: 'New Name',
          icon: 'new-icon',
          color: '#FF0000',
          accountId,
          isDefault: false
        })
      );

      // Verify command was logged
      expect(await changeLog.count()).toBe(1);
      const commands = await changeLog.getAll();
      expect(commands[0].command.type).toBe(COMMAND_TYPES.UPDATE_CATEGORY);
    });

    it('should throw when updating a non-existent category', async () => {
      const id = 'non-existent';
      const accountId = 'account-1';

      // Mock getById to return undefined
      (service as any).categoryRepo.getById.mockResolvedValue(undefined);

      await expect(service.updateCategory(id, { name: 'New Name' }, accountId))
        .rejects.toThrow(`Category not found: ${id}`);
    });

    it('should throw when updating a default category', async () => {
      const id = 'cat-default';
      const accountId = 'account-1';
      const existingCategory: Category = {
        id,
        name: 'category_general',
        type: 'expense',
        isDefault: true,
        accountId,
        icon: 'cash',
        color: '#EC4899'
      };

      // Mock getById to return a default category
      (service as any).categoryRepo.getById.mockResolvedValue(existingCategory);

      await expect(service.updateCategory(id, { name: 'Renamed' }, accountId))
        .rejects.toThrow(`Cannot update default category: ${id}`);
    });

    it('should allow toggling hidden on a default category', async () => {
      const id = 'cat-default';
      const accountId = 'account-1';
      const existingCategory: Category = {
        id,
        name: 'category_general',
        type: 'expense',
        isDefault: true,
        accountId,
        icon: 'cash',
      };

      (service as any).categoryRepo.getById.mockResolvedValue(existingCategory);
      (service as any).categoryRepo.update.mockResolvedValue(undefined);

      const result = await service.updateCategory(id, { hidden: true }, accountId);
      expect(result.hidden).toBe(true);
      // name/icon/color must remain unchanged
      expect(result.name).toBe('category_general');
    });

    it('should still reject non-hidden updates on a default category', async () => {
      const id = 'cat-default';
      const accountId = 'account-1';
      const existingCategory: Category = {
        id,
        name: 'category_general',
        type: 'expense',
        isDefault: true,
        accountId,
        icon: 'cash',
      };

      (service as any).categoryRepo.getById.mockResolvedValue(existingCategory);

      await expect(service.updateCategory(id, { hidden: true, name: 'Renamed' }, accountId))
        .rejects.toThrow(`Cannot update default category: ${id}`);
    });
  });

  describe('Limit Operations', () => {
    it('should create a limit', async () => {
      const data: CreateLimit = {
        categoryId: 'cat-1',
        amount: 500
      };
      const accountId = 'account-1';

      const result = await service.createLimit(data, accountId);

      expect(result).toMatchObject(data);
      expect(result.id).toBeDefined();
      expect(result.accountId).toBe(accountId);
      expect(await changeLog.count()).toBe(1);
      
      const commands = await changeLog.getAll();
      expect(commands[0].command.type).toBe(COMMAND_TYPES.CREATE_LIMIT);
    });

    it('should update a limit', async () => {
      const limit: Limit = {
        id: 'limit-1',
        categoryId: 'cat-1',
        amount: 600,
        accountId: 'account-1'
      };

      const result = await service.updateLimit(limit);

      expect(result).toEqual(limit);
      expect(await changeLog.count()).toBe(1);
      
      const commands = await changeLog.getAll();
      expect(commands[0].command.type).toBe(COMMAND_TYPES.UPDATE_LIMIT);
    });

    it('should delete a limit', async () => {
      const id = 'limit-1';
      const accountId = 'account-1';

      await service.deleteLimit(id, accountId);

      expect(await changeLog.count()).toBe(1);
      
      const commands = await changeLog.getAll();
      expect(commands[0].command.type).toBe(COMMAND_TYPES.DELETE_LIMIT);
      expect(commands[0].command.payload).toEqual({ id });
    });
  });

  describe('Template Operations', () => {
    it('should create a template', async () => {
      const data: CreateTemplate = {
        name: 'Test Template',
        amount: 100,
        categoryId: 'cat-1',
        type: 'expense'
      };
      const accountId = 'account-1';

      const result = await service.createTemplate(data, accountId);

      expect(result).toMatchObject(data);
      expect(result.id).toBeDefined();
      expect(result.accountId).toBe(accountId);
      expect(await changeLog.count()).toBe(1);
      
      const commands = await changeLog.getAll();
      expect(commands[0].command.type).toBe(COMMAND_TYPES.CREATE_TEMPLATE);
    });

    it('should update a template', async () => {
      const template: Template = {
        id: 'template-1',
        name: 'Updated Template',
        amount: 150,
        categoryId: 'cat-1',
        type: 'expense',
        accountId: 'account-1'
      };

      const result = await service.updateTemplate(template);

      expect(result).toEqual(template);
      expect(await changeLog.count()).toBe(1);
      
      const commands = await changeLog.getAll();
      expect(commands[0].command.type).toBe(COMMAND_TYPES.UPDATE_TEMPLATE);
    });

    it('should delete a template', async () => {
      const id = 'template-1';
      const accountId = 'account-1';

      await service.deleteTemplate(id, accountId);

      expect(await changeLog.count()).toBe(1);
      
      const commands = await changeLog.getAll();
      expect(commands[0].command.type).toBe(COMMAND_TYPES.DELETE_TEMPLATE);
      expect(commands[0].command.payload).toEqual({ id });
    });
  });

  describe('Recurring Operations', () => {
    const localDate = (date: Date) =>
      `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    // Items starting today have no missed occurrences to backfill, so the
    // number of generated rows and commands stays fixed.
    const today = () => localDate(new Date());

    it('should create a recurring item', async () => {
      const data: CreateRecurringItem = {
        name: 'Test Recurring',
        amount: 100,
        categoryId: 'cat-1',
        type: 'expense',
        frequency: 'monthly',
        startDate: today()
      };
      const accountId = 'account-1';

      const result = await service.createRecurring(data, accountId);

      expect(result).toMatchObject(data);
      expect(result.id).toBeDefined();
      expect(result.accountId).toBe(accountId);
      expect(await changeLog.count()).toBe(13);
      
      const commands = await changeLog.getAll();
      expect(commands[0].command.type).toBe(COMMAND_TYPES.CREATE_RECURRING);
    });

    it('should persist twelve linked forecast instances when a recurring item is created', async () => {
      const transactionRepo = (service as any).transactionRepo;
      const data: CreateRecurringItem = {
        name: 'Monthly Rent',
        amount: 900,
        categoryId: 'cat-1',
        type: 'expense',
        frequency: 'monthly',
        startDate: today(),
      };

      await service.createRecurring(data, 'account-1');

      expect(transactionRepo.bulkUpsert).toHaveBeenCalledTimes(1);
      const instances: Transaction[] = transactionRepo.bulkUpsert.mock.calls[0][0];
      expect(instances).toHaveLength(12);
      expect(instances[0]).toMatchObject({
        recurringItemId: expect.any(String),
        isRecurring: true,
        date: today(),
      });
      expect(new Set(instances.map((tx) => tx.id)).size).toBe(12);
    });

    it('rejects a recurring item whose end date precedes its start date', async () => {
      await expect(service.createRecurring({
        name: 'Invalid',
        amount: 10,
        categoryId: 'cat-1',
        type: 'expense',
        frequency: 'monthly',
        startDate: '2024-05-01',
        endDate: '2024-04-30',
      }, 'account-1')).rejects.toThrow('End date cannot be earlier than start date');
    });

    it('preserves a future occurrence edited as an individual transaction', async () => {
      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + 1);
      const scheduledDate = futureDate.toISOString().slice(0, 10);
      const transactionRepo = (service as any).transactionRepo;
      transactionRepo.getByAccountIdIncludingArchived.mockResolvedValueOnce([{
        id: `recurring-1:${scheduledDate}`,
        accountId: 'account-1',
        recurringItemId: 'recurring-1',
        recurringOccurrenceDate: scheduledDate,
        date: scheduledDate,
        title: 'Edited title',
        amount: 75,
        type: 'expense',
      }]);

      await service.reconcileRecurring({
        id: 'recurring-1',
        accountId: 'account-1',
        name: 'Original title',
        amount: 50,
        categoryId: 'cat-1',
        type: 'expense',
        frequency: 'monthly',
        startDate: scheduledDate,
      });

      const deletedIds = transactionRepo.bulkDelete.mock.calls.flatMap(([ids]: [string[]]) => ids);
      const upsertedDates = transactionRepo.bulkUpsert.mock.calls
        .flatMap(([rows]: [Transaction[]]) => rows)
        .map((transaction: Transaction) => transaction.date);
      expect(deletedIds).not.toContain(`recurring-1:${scheduledDate}`);
      expect(upsertedDates).not.toContain(scheduledDate);
    });

    it('continues reconciliation after a previous run fails', async () => {
      const reconcile = vi
        .spyOn(service as any, 'reconcileRecurringTransactions')
        .mockRejectedValueOnce(new Error('temporary failure'))
        .mockResolvedValueOnce(true);
      const item = {
        id: 'recurring-retry',
        accountId: 'account-1',
        name: 'Retry item',
        amount: 10,
        categoryId: 'cat-1',
        type: 'expense',
        frequency: 'monthly',
        startDate: '2026-01-01',
      } as RecurringItem;

      await expect(service.reconcileRecurring(item)).rejects.toThrow('temporary failure');
      await expect(service.reconcileRecurring(item)).resolves.toBe(true);
      expect(reconcile).toHaveBeenCalledTimes(2);
    });

    it('should update a recurring item', async () => {
      const item: RecurringItem = {
        id: 'recurring-1',
        name: 'Updated Recurring',
        amount: 150,
        categoryId: 'cat-1',
        type: 'expense',
        frequency: 'weekly',
        startDate: today(),
        accountId: 'account-1'
      };

      const result = await service.updateRecurring(item);

      expect(result).toEqual(item);
      expect(await changeLog.count()).toBe(13);
      
      const commands = await changeLog.getAll();
      expect(commands[0].command.type).toBe(COMMAND_TYPES.UPDATE_RECURRING);
    });

    it('should delete a recurring item', async () => {
      const id = 'recurring-1';
      const accountId = 'account-1';

      await service.deleteRecurring(id, accountId);

      expect(await changeLog.count()).toBe(1);
      
      const commands = await changeLog.getAll();
      expect(commands[0].command.type).toBe(COMMAND_TYPES.DELETE_RECURRING);
      expect(commands[0].command.payload).toEqual({ id, accountId });
    });

    it('removes every linked transaction when a recurring item is deleted', async () => {
      const transactionRepo = (service as any).transactionRepo;
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      const upcoming = localDate(tomorrow);
      transactionRepo.getByAccountIdIncludingArchived.mockResolvedValueOnce([
        { id: 'upcoming', accountId: 'account-1', recurringItemId: 'recurring-1', recurringOccurrenceDate: upcoming, date: upcoming },
        { id: 'booked', accountId: 'account-1', recurringItemId: 'recurring-1', recurringOccurrenceDate: '2026-01-01', date: '2026-01-01' },
        { id: 'skipped', accountId: 'account-1', recurringItemId: 'recurring-1', recurringOccurrenceDate: '2026-02-01', date: '2026-02-01', archivedAt: '2026-02-02T00:00:00.000Z' },
        { id: 'entered-by-user', accountId: 'account-1', recurringItemId: 'recurring-1', date: upcoming },
        { id: 'unrelated', accountId: 'account-1', title: 'Similar', date: upcoming },
      ]);

      await service.deleteRecurring('recurring-1', 'account-1');

      expect(transactionRepo.bulkDelete).toHaveBeenCalledWith(['upcoming', 'booked', 'skipped', 'entered-by-user']);
      const commands = await changeLog.getAll();
      expect(commands.map((record) => record.command.type)).toEqual([
        COMMAND_TYPES.DELETE_TRANSACTION,
        COMMAND_TYPES.DELETE_TRANSACTION,
        COMMAND_TYPES.DELETE_TRANSACTION,
        COMMAND_TYPES.DELETE_TRANSACTION,
        COMMAND_TYPES.DELETE_RECURRING,
      ]);
    });

    it('does not log the delete when the cascade fails', async () => {
      const recurringRepo = (service as any).recurringRepo;
      recurringRepo.delete.mockRejectedValueOnce(new Error('delete failed'));

      await expect(service.deleteRecurring('recurring-1', 'account-1')).rejects.toThrow('delete failed');

      expect(await changeLog.count()).toBe(0);
    });
  });

  describe('Savings Goal Operations', () => {
    it('should create a savings goal', async () => {
      const data: CreateSavingsGoal = {
        name: 'Test Goal',
        targetAmount: 1000,
        deadline: '2024-12-31'
      };
      const accountId = 'account-1';

      const result = await service.createSavingsGoal(data, accountId);

      expect(result).toMatchObject(data);
      expect(result.id).toBeDefined();
      expect(result.accountId).toBe(accountId);
      expect(await changeLog.count()).toBe(1);
      
      const commands = await changeLog.getAll();
      expect(commands[0].command.type).toBe(COMMAND_TYPES.CREATE_SAVINGS_GOAL);
    });

    it('should update a savings goal', async () => {
      const goal: SavingsGoal = {
        id: 'goal-1',
        name: 'Updated Goal',
        targetAmount: 1500,
        deadline: '2024-12-31',
        accountId: 'account-1'
      };

      const result = await service.updateSavingsGoal(goal);

      expect(result).toEqual(goal);
      expect(await changeLog.count()).toBe(1);
      
      const commands = await changeLog.getAll();
      expect(commands[0].command.type).toBe(COMMAND_TYPES.UPDATE_SAVINGS_GOAL);
    });

    it('should delete a savings goal', async () => {
      const id = 'goal-1';
      const accountId = 'account-1';

      await service.deleteSavingsGoal(id, accountId);

      expect(await changeLog.count()).toBe(1);
      
      const commands = await changeLog.getAll();
      expect(commands[0].command.type).toBe(COMMAND_TYPES.DELETE_SAVINGS_GOAL);
      expect(commands[0].command.payload).toEqual({ id });
    });
  });

  describe('Import and Reset Operations', () => {
    it('should import data', async () => {
      const targetAccountId = 'target-account-1';
      const data: ExportData = {
        version: '1.0.0',
        exportDate: '2024-01-01',
        account: {
          id: 'account-1',
          name: 'Test Account',
          initials: 'TA'
        },
        transactions: [],
        categories: [],
        limits: [],
        templates: [],
        recurringItems: [],
        savingsGoals: []
      };

      // Mock getById to return undefined (account doesn't exist)
      const accountRepo = (service as any).accountRepo;
      accountRepo.getById = vi.fn().mockResolvedValue(undefined);

      await service.importData(data, targetAccountId);

      // Should log CREATE_ACCOUNT + BULK_CREATE_CATEGORIES (default categories)
      expect(await changeLog.count()).toBe(2);

      const commands = await changeLog.getAll();
      expect(commands[0].command.type).toBe(COMMAND_TYPES.CREATE_ACCOUNT);
      expect(commands[0].command.payload).toEqual(expect.objectContaining({
        id: targetAccountId,
        name: 'Test Account',
        initials: 'TA'
      }));
      expect(commands[1].command.type).toBe(COMMAND_TYPES.BULK_CREATE_CATEGORIES);
    });

    it('should create new account when importing into non-existent account', async () => {
      const targetAccountId = 'new-account-123';
      const data: ExportData = {
        version: '1.0.0',
        exportDate: '2024-01-01',
        account: {
          id: 'old-account-456',
          name: 'Imported Account',
          initials: 'IA'
        },
        transactions: [],
        categories: [],
        limits: [],
        templates: [],
        recurringItems: [],
        savingsGoals: []
      };

      // Mock getById to return undefined (account doesn't exist)
      const accountRepo = (service as any).accountRepo;
      accountRepo.getById = vi.fn().mockResolvedValue(undefined);

      await service.importData(data, targetAccountId);

      // Verify create was called, not update
      expect(accountRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          id: targetAccountId,
          name: 'Imported Account',
          initials: 'IA'
        })
      );
      expect(accountRepo.update).not.toHaveBeenCalled();
    });

    it('should not update existing account metadata when importing into existing account', async () => {
      const targetAccountId = 'existing-account-789';
      const existingAccount = {
        id: targetAccountId,
        name: 'My Business Account',
        initials: 'BA'
      };
      const data: ExportData = {
        version: '1.0.0',
        exportDate: '2024-01-01',
        account: {
          id: 'source-account-456',
          name: 'Old Personal Account',
          initials: 'PA'
        },
        transactions: [],
        categories: [],
        limits: [],
        templates: [],
        recurringItems: [],
        savingsGoals: []
      };

      // Mock getById to return existing account
      const accountRepo = (service as any).accountRepo;
      accountRepo.getById = vi.fn().mockResolvedValue(existingAccount);

      await service.importData(data, targetAccountId);

      // Verify account was NOT updated (preserve existing account metadata)
      expect(accountRepo.update).not.toHaveBeenCalled();
      expect(accountRepo.create).not.toHaveBeenCalled();
      
      // No account command should be logged
      expect(await changeLog.count()).toBe(0);
    });

    it('should remap accountId when importing data', async () => {
      const targetAccountId = 'new-account-123';
      const data: ExportData = {
        version: '1.0.0',
        exportDate: '2024-01-01',
        account: {
          id: 'old-account-456',
          name: 'Old Account',
          initials: 'OA'
        },
        transactions: [
          { id: 'tx-1', type: 'expense', amount: 100, category: 'cat-1', date: '2024-01-01', title: 'Test', accountId: 'old-account-456' }
        ],
        categories: [
          { id: 'cat-1', name: 'Food', type: 'expense', isDefault: false, accountId: 'old-account-456' }
        ],
        limits: [
          { id: 'limit-1', categoryId: 'cat-1', amount: 500, accountId: 'old-account-456' }
        ],
        templates: [
          { id: 'tpl-1', name: 'Template', amount: 50, categoryId: 'cat-1', type: 'expense', accountId: 'old-account-456' }
        ],
        recurringItems: [
          { id: 'rec-1', name: 'Recurring', amount: 100, categoryId: 'cat-1', type: 'expense', frequency: 'monthly', startDate: '2024-01-01', accountId: 'old-account-456' }
        ],
        savingsGoals: [
          { id: 'goal-1', name: 'Goal', targetAmount: 1000, deadline: '2024-12-31', accountId: 'old-account-456' }
        ]
      };

      // Mock getById to return undefined (account doesn't exist)
      const accountRepo = (service as any).accountRepo;
      accountRepo.getById = vi.fn().mockResolvedValue(undefined);

      await service.importData(data, targetAccountId);

      // Verify account was remapped to target ID
      expect(accountRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ 
          id: targetAccountId,
          name: 'Old Account',
          initials: 'OA'
        })
      );

      // Verify categories were imported with target account ID
      const categoryRepo = (service as any).categoryRepo;
      expect(categoryRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ 
          id: 'cat-1',
          accountId: targetAccountId 
        })
      );

      // Verify transactions were imported with target account ID
      const transactionRepo = (service as any).transactionRepo;
      expect(transactionRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ 
          id: 'tx-1',
          accountId: targetAccountId 
        })
      );

      // Verify limits/templates/recurring/goals were created with new IDs
      const limitRepo = (service as any).limitRepo;
      const templateRepo = (service as any).templateRepo;
      const recurringRepo = (service as any).recurringRepo;
      const savingsRepo = (service as any).savingsRepo;

      expect(limitRepo.create).toHaveBeenCalled();
      expect(templateRepo.create).toHaveBeenCalled();
      expect(recurringRepo.create).toHaveBeenCalled();
      expect(savingsRepo.create).toHaveBeenCalled();

      // Verify all commands were logged individually
      // 1 account + 1 bulk_categories (defaults) + 1 category + 1 transaction + 1 limit + 1 template + 1 recurring + 1 goal = 8
      expect(await changeLog.count()).toBe(8);

      const commands = await changeLog.getAll();
      expect(commands[0].command.type).toBe(COMMAND_TYPES.CREATE_ACCOUNT);
      expect(commands[1].command.type).toBe(COMMAND_TYPES.BULK_CREATE_CATEGORIES);
      expect(commands[2].command.type).toBe(COMMAND_TYPES.CREATE_CATEGORY);
      expect(commands[3].command.type).toBe(COMMAND_TYPES.CREATE_TRANSACTION);
      expect(commands[4].command.type).toBe(COMMAND_TYPES.CREATE_LIMIT);
      expect(commands[5].command.type).toBe(COMMAND_TYPES.CREATE_TEMPLATE);
      expect(commands[6].command.type).toBe(COMMAND_TYPES.CREATE_RECURRING);
      expect(commands[7].command.type).toBe(COMMAND_TYPES.CREATE_SAVINGS_GOAL);
    });

    it('should handle entity deduplication during import', async () => {
      const targetAccountId = 'account-1';
      
      const data: ExportData = {
        version: '1.0.0',
        exportDate: '2024-01-01',
        transactions: [
          // Transaction without ID - will be generated
          { type: 'expense', amount: 100, category: 'cat-1', date: '2024-01-01', title: 'Test', accountId: 'old-account' } as any
        ],
        categories: [],
        limits: [],
        templates: [],
        recurringItems: [],
        savingsGoals: [],
        account: undefined
      };

      // Clear changelog
      changeLog.clear();

      // Mock getById to return undefined (entities don't exist)
      const accountRepo = (service as any).accountRepo;
      accountRepo.getById = vi.fn().mockResolvedValue(undefined);
      
      const transactionRepo = (service as any).transactionRepo;
      transactionRepo.getById = vi.fn().mockResolvedValue(undefined);

      await service.importData(data, targetAccountId);

      // Verify transaction was created once (no collision)
      expect(transactionRepo.create).toHaveBeenCalledTimes(1);
      
      // Verify transaction has correct accountId and category
      const call = transactionRepo.create.mock.calls[0][0];
      expect(call.accountId).toBe(targetAccountId);
      expect(call.category).toBe('cat-1');
      expect(call.id).toBeDefined();
    });

    it('should reset database', async () => {
      await service.resetDatabase();

      expect(await changeLog.count()).toBe(1);
      
      const commands = await changeLog.getAll();
      expect(commands[0].command.type).toBe(COMMAND_TYPES.RESET_DATABASE);
      expect(commands[0].command.payload).toEqual({});
    });
  });

  describe('Command Logging', () => {
    it('should log all commands with timestamps', async () => {
      const accountData: CreateAccount = {
        name: 'Test',
        initials: 'T'
      };

      await service.createAccount(accountData);

      const commands = await changeLog.getAll();
      // createAccount logs 2 commands (1 account + 1 bulk categories)
      expect(commands).toHaveLength(2);
      
      // Verify all commands have valid timestamps
      for (const record of commands) {
        expect(record.command.timestamp).toBeDefined();
        expect(new Date(record.command.timestamp).getTime()).toBeGreaterThan(0);
      }
    });

    it('should maintain command order', async () => {
      const accountData: CreateAccount = { name: 'Test', initials: 'T' };
      const account = await service.createAccount(accountData);
      await service.updateAccount(account);
      await service.deleteAccount(account.id);

      const commands = await changeLog.getAll();
      // createAccount logs 2 commands (1 account + 1 bulk categories)
      // updateAccount logs 1 command
      // deleteAccount logs 1 command
      // Total: 4 commands
      expect(commands).toHaveLength(4);
      expect(commands[0].command.type).toBe(COMMAND_TYPES.CREATE_ACCOUNT);
      expect(commands[1].command.type).toBe(COMMAND_TYPES.BULK_CREATE_CATEGORIES);
      expect(commands[2].command.type).toBe(COMMAND_TYPES.UPDATE_ACCOUNT);
      expect(commands[3].command.type).toBe(COMMAND_TYPES.DELETE_ACCOUNT);
    });
  });

  describe('Read Operations', () => {
    it('should get all accounts', async () => {
      const mockAccounts: Account[] = [
        { id: 'acc-1', name: 'Account 1', initials: 'A1' },
        { id: 'acc-2', name: 'Account 2', initials: 'A2' }
      ];

      // Mock the repository method
      vi.spyOn((service as any).accountRepo, 'getAll').mockResolvedValue(mockAccounts);

      const result = await service.getAccounts();

      expect(result).toEqual(mockAccounts);
      expect((service as any).accountRepo.getAll).toHaveBeenCalledOnce();
    });

    it('should get account by ID', async () => {
      const mockAccount: Account = { id: 'acc-1', name: 'Account 1', initials: 'A1' };

      vi.spyOn((service as any).accountRepo, 'getById').mockResolvedValue(mockAccount);

      const result = await service.getAccountById('acc-1');

      expect(result).toEqual(mockAccount);
      expect((service as any).accountRepo.getById).toHaveBeenCalledWith('acc-1');
    });

    it('should get transactions by account ID', async () => {
      const mockTransactions: Transaction[] = [
        { 
          id: 'tx-1', 
          accountId: 'acc-1', 
          amount: 100, 
          date: '2024-01-01', 
          title: 'Test Transaction', 
          type: 'expense',
          category: 'cat-1',
          createdAt: '2024-01-01T00:00:00Z'
        }
      ];

      vi.spyOn((service as any).transactionRepo, 'getByAccountId').mockResolvedValue(mockTransactions);

      const result = await service.getTransactionsByAccountId('acc-1');

      expect(result).toEqual(mockTransactions);
      expect((service as any).transactionRepo.getByAccountId).toHaveBeenCalledWith('acc-1');
    });

    it('should get categories by account ID', async () => {
      const mockCategories: Category[] = [
        { id: 'cat-1', accountId: 'acc-1', name: 'Food', type: 'expense', isDefault: false }
      ];

      vi.spyOn((service as any).categoryRepo, 'getByAccountId').mockResolvedValue(mockCategories);

      const result = await service.getCategoriesByAccountId('acc-1');

      expect(result).toEqual(mockCategories);
      expect((service as any).categoryRepo.getByAccountId).toHaveBeenCalledWith('acc-1');
    });

    it('should get limits by account ID', async () => {
      const mockLimits: Limit[] = [
        { id: 'lim-1', accountId: 'acc-1', categoryId: 'cat-1', amount: 500 }
      ];

      vi.spyOn((service as any).limitRepo, 'getByAccountId').mockResolvedValue(mockLimits);

      const result = await service.getLimitsByAccountId('acc-1');

      expect(result).toEqual(mockLimits);
      expect((service as any).limitRepo.getByAccountId).toHaveBeenCalledWith('acc-1');
    });

    it('should get templates by account ID', async () => {
      const mockTemplates: Template[] = [
        { id: 'tpl-1', accountId: 'acc-1', name: 'Salary', amount: 3000, type: 'income', categoryId: 'cat-1' }
      ];

      vi.spyOn((service as any).templateRepo, 'getByAccountId').mockResolvedValue(mockTemplates);

      const result = await service.getTemplatesByAccountId('acc-1');

      expect(result).toEqual(mockTemplates);
      expect((service as any).templateRepo.getByAccountId).toHaveBeenCalledWith('acc-1');
    });

    it('should get recurring items by account ID', async () => {
      const mockRecurring: RecurringItem[] = [
        { 
          id: 'rec-1', 
          accountId: 'acc-1', 
          name: 'Rent', 
          amount: 1000, 
          type: 'expense', 
          categoryId: 'cat-1',
          frequency: 'monthly',
          startDate: '2024-01-01'
        }
      ];

      vi.spyOn((service as any).recurringRepo, 'getByAccountId').mockResolvedValue(mockRecurring);

      const result = await service.getRecurringItemsByAccountId('acc-1');

      expect(result).toEqual(mockRecurring);
      expect((service as any).recurringRepo.getByAccountId).toHaveBeenCalledWith('acc-1');
    });

    it('should get savings goals by account ID', async () => {
      const mockGoals: SavingsGoal[] = [
        { 
          id: 'goal-1', 
          accountId: 'acc-1', 
          name: 'Vacation', 
          targetAmount: 5000,
          deadline: '2024-12-31'
        }
      ];

      vi.spyOn((service as any).savingsRepo, 'getByAccountId').mockResolvedValue(mockGoals);

      const result = await service.getSavingsGoalsByAccountId('acc-1');

      expect(result).toEqual(mockGoals);
      expect((service as any).savingsRepo.getByAccountId).toHaveBeenCalledWith('acc-1');
    });

    it('should not log commands for read operations', async () => {
      // Mock all read operations
      vi.spyOn((service as any).accountRepo, 'getAll').mockResolvedValue([]);
      vi.spyOn((service as any).transactionRepo, 'getByAccountId').mockResolvedValue([]);
      vi.spyOn((service as any).categoryRepo, 'getByAccountId').mockResolvedValue([]);

      // Perform read operations
      await service.getAccounts();
      await service.getTransactionsByAccountId('acc-1');
      await service.getCategoriesByAccountId('acc-1');

      // Verify no commands were logged
      expect(await changeLog.count()).toBe(0);
    });
  });

  describe('Import executedAt handling', () => {
    it('should set executedAt for past-dated imported transactions', async () => {
      const targetAccountId = 'account-1';
      const data: ExportData = {
        version: '1.0',
        exportDate: '2024-01-01',
        account: { id: 'account-1', name: 'Test', initials: 'T' },
        transactions: [
          {
            id: 'tx-past',
            type: 'expense',
            amount: 50,
            category: 'cat-1',
            date: '2020-06-15', // well in the past
            title: 'Past migrated transaction',
            accountId: 'old-account',
          },
        ],
        categories: [],
        limits: [],
        templates: [],
        recurringItems: [],
        savingsGoals: [],
      };

      const accountRepo = (service as any).accountRepo;
      const transactionRepo = (service as any).transactionRepo;
      accountRepo.getById = vi.fn().mockResolvedValue({ id: targetAccountId });
      transactionRepo.getById = vi.fn().mockResolvedValue(undefined);

      await service.importData(data, targetAccountId);

      expect(transactionRepo.create).toHaveBeenCalledTimes(1);
      const created = transactionRepo.create.mock.calls[0][0];
      expect(created.executedAt).toBeDefined();
      expect(created.executedAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    });

    it('should not set executedAt for future-dated imported transactions', async () => {
      const targetAccountId = 'account-1';
      const data: ExportData = {
        version: '1.0',
        exportDate: '2024-01-01',
        account: { id: 'account-1', name: 'Test', initials: 'T' },
        transactions: [
          {
            id: 'tx-future',
            type: 'expense',
            amount: 50,
            category: 'cat-1',
            date: '2099-12-31', // far in the future
            title: 'Future scheduled transaction',
            accountId: 'old-account',
          },
        ],
        categories: [],
        limits: [],
        templates: [],
        recurringItems: [],
        savingsGoals: [],
      };

      const accountRepo = (service as any).accountRepo;
      const transactionRepo = (service as any).transactionRepo;
      accountRepo.getById = vi.fn().mockResolvedValue({ id: targetAccountId });
      transactionRepo.getById = vi.fn().mockResolvedValue(undefined);

      await service.importData(data, targetAccountId);

      expect(transactionRepo.create).toHaveBeenCalledTimes(1);
      const created = transactionRepo.create.mock.calls[0][0];
      expect(created.executedAt).toBeUndefined();
    });

    it('should preserve existing executedAt on imported transactions', async () => {
      const targetAccountId = 'account-1';
      const originalExecutedAt = '2023-05-10T12:00:00.000Z';
      const data: ExportData = {
        version: '1.0',
        exportDate: '2024-01-01',
        account: { id: 'account-1', name: 'Test', initials: 'T' },
        transactions: [
          {
            id: 'tx-existing',
            type: 'expense',
            amount: 50,
            category: 'cat-1',
            date: '2023-05-10',
            title: 'Already executed',
            accountId: 'old-account',
            executedAt: originalExecutedAt,
          },
        ],
        categories: [],
        limits: [],
        templates: [],
        recurringItems: [],
        savingsGoals: [],
      };

      const accountRepo = (service as any).accountRepo;
      const transactionRepo = (service as any).transactionRepo;
      accountRepo.getById = vi.fn().mockResolvedValue({ id: targetAccountId });
      transactionRepo.getById = vi.fn().mockResolvedValue(undefined);

      await service.importData(data, targetAccountId);

      expect(transactionRepo.create).toHaveBeenCalledTimes(1);
      const created = transactionRepo.create.mock.calls[0][0];
      expect(created.executedAt).toBe(originalExecutedAt);
    });

    it('should set executedAt on past recurring transactions during import', async () => {
      const targetAccountId = 'account-1';
      const data: ExportData = {
        version: '1.0',
        exportDate: '2024-01-01',
        account: { id: 'account-1', name: 'Test', initials: 'T' },
        transactions: [
          {
            id: 'tx-recurring-past',
            type: 'expense',
            amount: 9.99,
            category: 'cat-1',
            date: '2026-05-09', // past date (recurring occurrence)
            title: 'Netflix',
            accountId: 'old-account',
            isRecurring: true,
          },
        ],
        categories: [],
        limits: [],
        templates: [],
        recurringItems: [],
        savingsGoals: [],
      };

      const accountRepo = (service as any).accountRepo;
      const transactionRepo = (service as any).transactionRepo;
      accountRepo.getById = vi.fn().mockResolvedValue({ id: targetAccountId });
      transactionRepo.getById = vi.fn().mockResolvedValue(undefined);

      await service.importData(data, targetAccountId);

      const created = transactionRepo.create.mock.calls[0][0];
      // Past recurring transactions must have executedAt so they don't appear as "upcoming"
      expect(created.executedAt).toBeDefined();
      expect(created.isRecurring).toBe(true);
    });
  });

  describe('Import Deduplication', () => {
    it('should not duplicate categories when multiple payload categories map to the same name', async () => {
      const targetAccountId = 'account-1';
      const data = {
        version: '1.0',
        account: { id: 'account-1', name: 'Test', initials: 'T' },
        categories: [
          { id: 'cat-1', name: 'Food', type: 'expense', isDefault: false, accountId: 'old-account' },
          { id: 'cat-2', name: 'Food', type: 'expense', isDefault: false, accountId: 'old-account' }
        ],
        transactions: [], limits: [], templates: [], recurringItems: [], savingsGoals: []
      };

      const accountRepo = (service as any).accountRepo;
      const categoryRepo = (service as any).categoryRepo;
      
      accountRepo.getById = vi.fn().mockResolvedValue({ id: targetAccountId });
      categoryRepo.getById = vi.fn().mockResolvedValue(undefined);
      categoryRepo.getByAccountId = vi.fn().mockResolvedValue([]);
      
      await service.importData(data as any, targetAccountId);

      expect(categoryRepo.create).toHaveBeenCalledTimes(1);
    });

    it('should import categories whose names start with "category_" without collapsing them', async () => {
      const targetAccountId = 'account-1';
      const data = {
        version: '1.0',
        account: { id: 'source-acc', name: 'Src', initials: 'S' },
        categories: [
          { id: 'cat-1', name: 'category_household', type: 'expense', isDefault: false, accountId: 'old-account' }
        ],
        transactions: [], limits: [], templates: [], recurringItems: [], savingsGoals: []
      } as any;

      const accountRepo = (service as any).accountRepo;
      const categoryRepo = (service as any).categoryRepo;

      // Account exists
      accountRepo.getById = vi.fn().mockResolvedValue({ id: targetAccountId });
      // No existing categories for this account
      categoryRepo.getByAccountId = vi.fn().mockResolvedValue([]);
      categoryRepo.getById = vi.fn().mockResolvedValue(undefined);

      await service.importData(data, targetAccountId);

      // The category should be created (not collapsed or silently skipped)
      expect(categoryRepo.create).toHaveBeenCalledTimes(1);
      const createdArg = categoryRepo.create.mock.calls[0][0];
      expect(createdArg.name).toBe('category_household');
      expect(createdArg.accountId).toBe(targetAccountId);
    });

    it('merges an incoming German-named user category into its matching seeded default (Geschenk → expense-gift)', async () => {
      // Regression for the "Geschenk" duplicate: a user created a custom
      // expense "Geschenk" in the legacy app (isDefault:false, UUID id).
      // importData seeds expense-gift (category_gift) for the new account,
      // then the German name must be recognised via CATEGORY_NAME_TO_KEY and
      // deduplicated into that default — not created as a second category.
      // Transactions referencing the custom UUID must remap to the default.
      const targetAccountId = 'account-1';
      const customGeschenkId = 'uuid-geschenk-custom';
      const seededGiftLocalId = 'uuid-expense-gift-seeded';

      const seededDefault = {
        id: seededGiftLocalId,
        name: 'category_gift',
        type: 'expense',
        isDefault: true,
        accountId: targetAccountId,
      };

      const data = {
        version: '1.0',
        account: { id: 'source-acc', name: 'Src', initials: 'S' },
        categories: [
          // User-created Geschenk — German name, UUID id, isDefault:false
          { id: customGeschenkId, name: 'Geschenk', type: 'expense', isDefault: false, accountId: 'source-acc' },
        ],
        transactions: [
          { id: 'tx-1', accountId: 'source-acc', category: customGeschenkId, amount: 20, date: '2026-01-01', title: 'Birthday present', type: 'expense' },
        ],
        limits: [], templates: [], recurringItems: [], savingsGoals: [],
      } as any;

      const accountRepo = (service as any).accountRepo;
      const categoryRepo = (service as any).categoryRepo;
      const transactionRepo = (service as any).transactionRepo;

      accountRepo.getById = vi.fn().mockResolvedValue({ id: targetAccountId });
      // Seeded default already exists in the target account
      categoryRepo.getByAccountId = vi.fn().mockResolvedValue([seededDefault]);
      categoryRepo.getById = vi.fn().mockResolvedValue(undefined);
      transactionRepo.getById = vi.fn().mockResolvedValue(undefined);

      await service.importData(data, targetAccountId);

      // Must NOT create a second category — Geschenk should merge into category_gift
      expect(categoryRepo.create).not.toHaveBeenCalled();

      // The transaction must reference the seeded default, not the custom UUID
      expect(transactionRepo.create).toHaveBeenCalledTimes(1);
      const tx = transactionRepo.create.mock.calls[0][0];
      expect(tx.category).toBe(seededGiftLocalId);
      expect(tx.category).not.toBe(customGeschenkId);
    });

    it('does not merge German-named user category into a hidden default', async () => {
      // Regression: German-name merge should respect hidden flag.
      // A user-created "Lebensmittel" should NOT merge into a hidden default
      // even if the names match via CATEGORY_NAME_TO_KEY.
      const targetAccountId = 'account-1';
      const customLebensmittelId = 'uuid-lebensmittel-custom';
      const hiddenDefaultId = 'uuid-food-hidden';

      const hiddenDefault = {
        id: hiddenDefaultId,
        name: 'category_food',
        type: 'expense',
        isDefault: true,
        hidden: true,
        accountId: targetAccountId,
      };

      const data = {
        version: '1.0',
        account: { id: 'source-acc', name: 'Src', initials: 'S' },
        categories: [
          // User-created Lebensmittel — German name, UUID id, isDefault:false
          { id: customLebensmittelId, name: 'Lebensmittel', type: 'expense', isDefault: false, accountId: 'source-acc' },
        ],
        transactions: [
          { id: 'tx-1', accountId: 'source-acc', category: customLebensmittelId, amount: 15, date: '2026-01-01', title: 'Groceries', type: 'expense' },
        ],
        limits: [], templates: [], recurringItems: [], savingsGoals: [],
      } as any;

      const accountRepo = (service as any).accountRepo;
      const categoryRepo = (service as any).categoryRepo;
      const transactionRepo = (service as any).transactionRepo;

      accountRepo.getById = vi.fn().mockResolvedValue({ id: targetAccountId });
      // Hidden default exists in the target account
      categoryRepo.getByAccountId = vi.fn().mockResolvedValue([hiddenDefault]);
      categoryRepo.getById = vi.fn().mockResolvedValue(undefined);
      transactionRepo.getById = vi.fn().mockResolvedValue(undefined);

      await service.importData(data, targetAccountId);

      // Should create a new category since the matching default is hidden
      expect(categoryRepo.create).toHaveBeenCalledTimes(1);
      const createdCategory = categoryRepo.create.mock.calls[0][0];
      expect(createdCategory.name).toBe('Lebensmittel');
      expect(createdCategory.id).toBe(customLebensmittelId);

      // The transaction should reference the custom category, not the hidden default
      expect(transactionRepo.create).toHaveBeenCalledTimes(1);
      const tx = transactionRepo.create.mock.calls[0][0];
      expect(tx.category).toBe(customLebensmittelId);
      expect(tx.category).not.toBe(hiddenDefaultId);
    });

    it('deduplicates an incoming default against the seeded default in the target account', async () => {
      // Regression for the pre-populate loop guard: the existing target account
      // already has a seeded default category_household (isDefault:true).
      // An incoming category with the same stable ID must be deduplicated — no
      // second row created, no create call made.
      const targetAccountId = 'account-1';
      const existingDefault = {
        id: 'expense-household',
        name: 'category_household',
        type: 'expense',
        isDefault: true,
        accountId: targetAccountId,
      };

      const data = {
        version: '1.0',
        account: { id: 'source-acc', name: 'Src', initials: 'S' },
        categories: [
          { id: 'expense-household', name: 'category_household', type: 'expense', isDefault: true, accountId: 'source-acc' },
        ],
        transactions: [], limits: [], templates: [], recurringItems: [], savingsGoals: [],
      } as any;

      const accountRepo = (service as any).accountRepo;
      const categoryRepo = (service as any).categoryRepo;

      accountRepo.getById = vi.fn().mockResolvedValue({ id: targetAccountId });
      categoryRepo.getByAccountId = vi.fn().mockResolvedValue([existingDefault]);
      // Same ID already exists in the target account
      categoryRepo.getById = vi.fn().mockResolvedValue({ ...existingDefault });

      await service.importData(data, targetAccountId);

      // Already exists by ID — must not create a duplicate row
      expect(categoryRepo.create).not.toHaveBeenCalled();
    });

    it('does not route the default stable ID to a user-created category with the same name', async () => {
      // The pre-populate loop must only map stable default IDs against categories
      // where isDefault:true. If the target account holds both a user-created
      // category_household (isDefault:false, UUID id) and the seeded default
      // (isDefault:true, id='expense-household'), an incoming backup that
      // references 'expense-household' must resolve to the DEFAULT, not to the
      // user-created entry that happens to share the name.
      const targetAccountId = 'account-1';
      const userCustomId = 'uuid-user-household';
      const userCreated = {
        id: userCustomId,
        name: 'category_household',
        type: 'expense',
        isDefault: false,
        accountId: targetAccountId,
      };
      const seededDefault = {
        id: 'expense-household',
        name: 'category_household',
        type: 'expense',
        isDefault: true,
        accountId: targetAccountId,
      };

      const data = {
        version: '1.0',
        account: { id: 'source-acc', name: 'Src', initials: 'S' },
        categories: [
          // Incoming default references the stable ID
          { id: 'expense-household', name: 'category_household', type: 'expense', isDefault: true, accountId: 'source-acc' },
        ],
        transactions: [
          { id: 'tx-1', accountId: 'source-acc', category: 'expense-household', amount: 50, date: '2026-01-01', title: 'Rent', type: 'expense' },
        ],
        limits: [], templates: [], recurringItems: [], savingsGoals: [],
      } as any;

      const accountRepo = (service as any).accountRepo;
      const categoryRepo = (service as any).categoryRepo;
      const transactionRepo = (service as any).transactionRepo;

      accountRepo.getById = vi.fn().mockResolvedValue({ id: targetAccountId });
      // Both the user-created and the seeded default exist in the target account
      categoryRepo.getByAccountId = vi.fn().mockResolvedValue([userCreated, seededDefault]);
      // The incoming category's ID matches the seeded default
      categoryRepo.getById = vi.fn().mockImplementation((id: string) => {
        if (id === 'expense-household') return Promise.resolve(seededDefault);
        return Promise.resolve(undefined);
      });
      transactionRepo.getById = vi.fn().mockResolvedValue(undefined);

      await service.importData(data, targetAccountId);

      // The transaction must be linked to the seeded DEFAULT, not the user-created one
      expect(transactionRepo.create).toHaveBeenCalledTimes(1);
      const tx = transactionRepo.create.mock.calls[0][0];
      expect(tx.category).toBe('expense-household');
      expect(tx.category).not.toBe(userCustomId);
    });
  });
});
