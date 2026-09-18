import { describe, it, expect } from 'vitest';
import type {
  CommandType,
  Command,
  ChangeRecord,
  CreateAccountCommand,
  UpdateAccountCommand,
  DeleteAccountCommand,
  CreateTransactionCommand,
  UpdateTransactionCommand,
  DeleteTransactionCommand,
  CreateCategoryCommand,
  UpdateCategoryCommand,
  BulkCreateCategoriesCommand,
  DeleteCategoryCommand,
  CreateLimitCommand,
  UpdateLimitCommand,
  DeleteLimitCommand,
  CreateTemplateCommand,
  UpdateTemplateCommand,
  DeleteTemplateCommand,
  CreateRecurringCommand,
  UpdateRecurringCommand,
  DeleteRecurringCommand,
  CreateSavingsGoalCommand,
  UpdateSavingsGoalCommand,
  DeleteSavingsGoalCommand,
  ImportDataCommand,
  ResetDatabaseCommand,
} from './types.js';
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
  ExportData,
} from '../types/index.js';

// ---------------------------------------------------------------------------
// Test fixtures — minimal valid objects per entity type
// ---------------------------------------------------------------------------

const TEST_TIMESTAMP = '2024-01-15T10:00:00Z';
const TEST_SEQUENCE = 1;

const createAccountPayload: CreateAccount = {
  name: 'Test Account',
  initials: 'TA',
};

const accountPayload: Account = {
  id: 'acc-1',
  name: 'Test Account',
  initials: 'TA',
};

const createTransactionPayload: CreateTransaction = {
  type: 'expense',
  amount: 42.5,
  category: 'cat-food',
  date: '2024-01-15',
  title: 'Lunch',
};

const transactionPayload: Transaction = {
  id: 'txn-1',
  accountId: 'acc-1',
  type: 'expense',
  amount: 42.5,
  category: 'cat-food',
  date: '2024-01-15',
  title: 'Lunch',
};

const createCategoryPayload: CreateCategory = {
  name: 'Food',
  type: 'expense',
};

const categoryPayload: Category = {
  id: 'cat-1',
  name: 'Food',
  type: 'expense',
  isDefault: false,
  accountId: 'acc-1',
};

const createLimitPayload: CreateLimit = {
  categoryId: 'cat-1',
  amount: 500,
};

const limitPayload: Limit = {
  id: 'lim-1',
  categoryId: 'cat-1',
  amount: 500,
  accountId: 'acc-1',
};

const createTemplatePayload: CreateTemplate = {
  name: 'Rent',
  amount: 1000,
  categoryId: 'cat-1',
  type: 'expense',
};

const templatePayload: Template = {
  id: 'tpl-1',
  name: 'Rent',
  amount: 1000,
  categoryId: 'cat-1',
  type: 'expense',
  accountId: 'acc-1',
};

const createRecurringPayload: CreateRecurringItem = {
  name: 'Rent',
  amount: 1000,
  categoryId: 'cat-1',
  type: 'expense',
  frequency: 'monthly',
  startDate: '2024-01-01',
};

const recurringPayload: RecurringItem = {
  id: 'rec-1',
  name: 'Rent',
  amount: 1000,
  categoryId: 'cat-1',
  type: 'expense',
  frequency: 'monthly',
  startDate: '2024-01-01',
  accountId: 'acc-1',
};

const createSavingsGoalPayload: CreateSavingsGoal = {
  name: 'Vacation',
  targetAmount: 5000,
  deadline: '2025-06-01',
};

const savingsGoalPayload: SavingsGoal = {
  id: 'sg-1',
  name: 'Vacation',
  targetAmount: 5000,
  deadline: '2025-06-01',
  accountId: 'acc-1',
};

const exportDataPayload: ExportData = {
  version: '1.0',
  exportDate: '2024-01-01',
  account: accountPayload,
  transactions: [],
  categories: [],
  limits: [],
  templates: [],
  recurringItems: [],
  savingsGoals: [],
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Command Types', () => {
  describe('CommandType', () => {
    it('has exactly 24 unique members', () => {
      const allTypes: CommandType[] = [
        'CREATE_ACCOUNT',
        'UPDATE_ACCOUNT',
        'DELETE_ACCOUNT',
        'CREATE_TRANSACTION',
        'UPDATE_TRANSACTION',
        'DELETE_TRANSACTION',
        'CREATE_CATEGORY',
        'UPDATE_CATEGORY',
        'BULK_CREATE_CATEGORIES',
        'DELETE_CATEGORY',
        'CREATE_LIMIT',
        'UPDATE_LIMIT',
        'DELETE_LIMIT',
        'CREATE_TEMPLATE',
        'UPDATE_TEMPLATE',
        'DELETE_TEMPLATE',
        'CREATE_RECURRING',
        'UPDATE_RECURRING',
        'DELETE_RECURRING',
        'CREATE_SAVINGS_GOAL',
        'UPDATE_SAVINGS_GOAL',
        'DELETE_SAVINGS_GOAL',
        'IMPORT_DATA',
        'RESET_DATABASE',
      ];

      expect(allTypes).toHaveLength(24);
      expect(new Set(allTypes).size).toBe(24);
    });
  });

  // -------------------------------------------------------------------------
  // Account commands
  // -------------------------------------------------------------------------

  describe('Account commands', () => {
    it('CreateAccountCommand accepts CreateAccount payload', () => {
      const cmd: CreateAccountCommand = {
        type: 'CREATE_ACCOUNT',
        payload: createAccountPayload,
        timestamp: TEST_TIMESTAMP,
        sequence: TEST_SEQUENCE,
      };
      expect(cmd.type).toBe('CREATE_ACCOUNT');
      expect(cmd.payload.name).toBe('Test Account');
    });

    it('UpdateAccountCommand accepts full Account payload', () => {
      const cmd: UpdateAccountCommand = {
        type: 'UPDATE_ACCOUNT',
        payload: accountPayload,
      };
      expect(cmd.type).toBe('UPDATE_ACCOUNT');
      expect(cmd.payload.id).toBe('acc-1');
    });

    it('DeleteAccountCommand accepts { id } payload', () => {
      const cmd: DeleteAccountCommand = {
        type: 'DELETE_ACCOUNT',
        payload: { id: 'acc-1' },
      };
      expect(cmd.type).toBe('DELETE_ACCOUNT');
      expect(cmd.payload.id).toBe('acc-1');
    });
  });

  // -------------------------------------------------------------------------
  // Transaction commands
  // -------------------------------------------------------------------------

  describe('Transaction commands', () => {
    it('CreateTransactionCommand accepts CreateTransaction payload', () => {
      const cmd: CreateTransactionCommand = {
        type: 'CREATE_TRANSACTION',
        payload: createTransactionPayload,
      };
      expect(cmd.type).toBe('CREATE_TRANSACTION');
      expect(cmd.payload.amount).toBe(42.5);
    });

    it('UpdateTransactionCommand accepts full Transaction payload', () => {
      const cmd: UpdateTransactionCommand = {
        type: 'UPDATE_TRANSACTION',
        payload: transactionPayload,
      };
      expect(cmd.type).toBe('UPDATE_TRANSACTION');
      expect(cmd.payload.id).toBe('txn-1');
    });

    it('DeleteTransactionCommand accepts { id } payload', () => {
      const cmd: DeleteTransactionCommand = {
        type: 'DELETE_TRANSACTION',
        payload: { id: 'txn-1' },
      };
      expect(cmd.type).toBe('DELETE_TRANSACTION');
      expect(cmd.payload.id).toBe('txn-1');
    });
  });

  // -------------------------------------------------------------------------
  // Category commands
  // -------------------------------------------------------------------------

  describe('Category commands', () => {
    it('CreateCategoryCommand accepts CreateCategory payload', () => {
      const cmd: CreateCategoryCommand = {
        type: 'CREATE_CATEGORY',
        payload: createCategoryPayload,
      };
      expect(cmd.type).toBe('CREATE_CATEGORY');
      expect(cmd.payload.name).toBe('Food');
    });

    it('BulkCreateCategoriesCommand accepts { categories: Category[] }', () => {
      const cmd: BulkCreateCategoriesCommand = {
        type: 'BULK_CREATE_CATEGORIES',
        payload: { categories: [categoryPayload] },
      };
      expect(cmd.type).toBe('BULK_CREATE_CATEGORIES');
      expect(cmd.payload.categories).toHaveLength(1);
    });

    it('DeleteCategoryCommand accepts { id } payload', () => {
      const cmd: DeleteCategoryCommand = {
        type: 'DELETE_CATEGORY',
        payload: { id: 'cat-1' },
      };
      expect(cmd.type).toBe('DELETE_CATEGORY');
      expect(cmd.payload.id).toBe('cat-1');
    });

    it('UpdateCategoryCommand accepts full Category payload', () => {
      const cmd: UpdateCategoryCommand = {
        type: 'UPDATE_CATEGORY',
        payload: categoryPayload,
      };
      expect(cmd.type).toBe('UPDATE_CATEGORY');
      expect(cmd.payload.id).toBe('cat-1');
    });
  });

  // -------------------------------------------------------------------------
  // Limit commands
  // -------------------------------------------------------------------------

  describe('Limit commands', () => {
    it('CreateLimitCommand accepts CreateLimit payload', () => {
      const cmd: CreateLimitCommand = {
        type: 'CREATE_LIMIT',
        payload: createLimitPayload,
      };
      expect(cmd.type).toBe('CREATE_LIMIT');
      expect(cmd.payload.amount).toBe(500);
    });

    it('UpdateLimitCommand accepts full Limit payload', () => {
      const cmd: UpdateLimitCommand = {
        type: 'UPDATE_LIMIT',
        payload: limitPayload,
      };
      expect(cmd.type).toBe('UPDATE_LIMIT');
      expect(cmd.payload.id).toBe('lim-1');
    });

    it('DeleteLimitCommand accepts { id } payload', () => {
      const cmd: DeleteLimitCommand = {
        type: 'DELETE_LIMIT',
        payload: { id: 'lim-1' },
      };
      expect(cmd.type).toBe('DELETE_LIMIT');
      expect(cmd.payload.id).toBe('lim-1');
    });
  });

  // -------------------------------------------------------------------------
  // Template commands
  // -------------------------------------------------------------------------

  describe('Template commands', () => {
    it('CreateTemplateCommand accepts CreateTemplate payload', () => {
      const cmd: CreateTemplateCommand = {
        type: 'CREATE_TEMPLATE',
        payload: createTemplatePayload,
      };
      expect(cmd.type).toBe('CREATE_TEMPLATE');
      expect(cmd.payload.name).toBe('Rent');
    });

    it('UpdateTemplateCommand accepts full Template payload', () => {
      const cmd: UpdateTemplateCommand = {
        type: 'UPDATE_TEMPLATE',
        payload: templatePayload,
      };
      expect(cmd.type).toBe('UPDATE_TEMPLATE');
      expect(cmd.payload.id).toBe('tpl-1');
    });

    it('DeleteTemplateCommand accepts { id } payload', () => {
      const cmd: DeleteTemplateCommand = {
        type: 'DELETE_TEMPLATE',
        payload: { id: 'tpl-1' },
      };
      expect(cmd.type).toBe('DELETE_TEMPLATE');
      expect(cmd.payload.id).toBe('tpl-1');
    });
  });

  // -------------------------------------------------------------------------
  // RecurringItem commands
  // -------------------------------------------------------------------------

  describe('RecurringItem commands', () => {
    it('CreateRecurringCommand accepts CreateRecurringItem payload', () => {
      const cmd: CreateRecurringCommand = {
        type: 'CREATE_RECURRING',
        payload: createRecurringPayload,
      };
      expect(cmd.type).toBe('CREATE_RECURRING');
      expect(cmd.payload.frequency).toBe('monthly');
    });

    it('UpdateRecurringCommand accepts full RecurringItem payload', () => {
      const cmd: UpdateRecurringCommand = {
        type: 'UPDATE_RECURRING',
        payload: recurringPayload,
      };
      expect(cmd.type).toBe('UPDATE_RECURRING');
      expect(cmd.payload.id).toBe('rec-1');
    });

    it('DeleteRecurringCommand accepts { id } payload', () => {
      const cmd: DeleteRecurringCommand = {
        type: 'DELETE_RECURRING',
        payload: { id: 'rec-1' },
      };
      expect(cmd.type).toBe('DELETE_RECURRING');
      expect(cmd.payload.id).toBe('rec-1');
    });
  });

  // -------------------------------------------------------------------------
  // SavingsGoal commands
  // -------------------------------------------------------------------------

  describe('SavingsGoal commands', () => {
    it('CreateSavingsGoalCommand accepts CreateSavingsGoal payload', () => {
      const cmd: CreateSavingsGoalCommand = {
        type: 'CREATE_SAVINGS_GOAL',
        payload: createSavingsGoalPayload,
      };
      expect(cmd.type).toBe('CREATE_SAVINGS_GOAL');
      expect(cmd.payload.targetAmount).toBe(5000);
    });

    it('UpdateSavingsGoalCommand accepts full SavingsGoal payload', () => {
      const cmd: UpdateSavingsGoalCommand = {
        type: 'UPDATE_SAVINGS_GOAL',
        payload: savingsGoalPayload,
      };
      expect(cmd.type).toBe('UPDATE_SAVINGS_GOAL');
      expect(cmd.payload.id).toBe('sg-1');
    });

    it('DeleteSavingsGoalCommand accepts { id } payload', () => {
      const cmd: DeleteSavingsGoalCommand = {
        type: 'DELETE_SAVINGS_GOAL',
        payload: { id: 'sg-1' },
      };
      expect(cmd.type).toBe('DELETE_SAVINGS_GOAL');
      expect(cmd.payload.id).toBe('sg-1');
    });
  });

  // -------------------------------------------------------------------------
  // Special commands
  // -------------------------------------------------------------------------

  describe('Special commands', () => {
    it('ImportDataCommand accepts ExportData payload', () => {
      const cmd: ImportDataCommand = {
        type: 'IMPORT_DATA',
        payload: exportDataPayload,
      };
      expect(cmd.type).toBe('IMPORT_DATA');
      expect(cmd.payload.version).toBe('1.0');
    });

    it('ResetDatabaseCommand accepts empty object payload', () => {
      const cmd: ResetDatabaseCommand = {
        type: 'RESET_DATABASE',
        payload: {},
      };
      expect(cmd.type).toBe('RESET_DATABASE');
      expect(cmd.payload).toEqual({});
    });
  });

  // -------------------------------------------------------------------------
  // Command discriminated union
  // -------------------------------------------------------------------------

  describe('Command discriminated union', () => {
    /**
     * Exhaustive switch — compiles only if every Command variant is handled.
     * The `default: never` branch ensures a compile error if a variant is missed.
     */
    function describeCommand(cmd: Command): string {
      switch (cmd.type) {
        case 'CREATE_ACCOUNT': return `create account ${cmd.payload.name}`;
        case 'UPDATE_ACCOUNT': return `update account ${cmd.payload.id}`;
        case 'DELETE_ACCOUNT': return `delete account ${cmd.payload.id}`;
        case 'CREATE_TRANSACTION': return `create transaction ${cmd.payload.title}`;
        case 'UPDATE_TRANSACTION': return `update transaction ${cmd.payload.id}`;
        case 'DELETE_TRANSACTION': return `delete transaction ${cmd.payload.id}`;
        case 'CREATE_CATEGORY': return `create category ${cmd.payload.name}`;
        case 'UPDATE_CATEGORY': return `update category ${cmd.payload.id}`;
        case 'BULK_CREATE_CATEGORIES': return `bulk create ${cmd.payload.categories.length} categories`;
        case 'DELETE_CATEGORY': return `delete category ${cmd.payload.id}`;
        case 'CREATE_LIMIT': return `create limit ${cmd.payload.amount}`;
        case 'UPDATE_LIMIT': return `update limit ${cmd.payload.id}`;
        case 'DELETE_LIMIT': return `delete limit ${cmd.payload.id}`;
        case 'CREATE_TEMPLATE': return `create template ${cmd.payload.name}`;
        case 'UPDATE_TEMPLATE': return `update template ${cmd.payload.id}`;
        case 'DELETE_TEMPLATE': return `delete template ${cmd.payload.id}`;
        case 'CREATE_RECURRING': return `create recurring ${cmd.payload.name}`;
        case 'UPDATE_RECURRING': return `update recurring ${cmd.payload.id}`;
        case 'DELETE_RECURRING': return `delete recurring ${cmd.payload.id}`;
        case 'CREATE_SAVINGS_GOAL': return `create savings goal ${cmd.payload.name}`;
        case 'UPDATE_SAVINGS_GOAL': return `update savings goal ${cmd.payload.id}`;
        case 'DELETE_SAVINGS_GOAL': return `delete savings goal ${cmd.payload.id}`;
        case 'IMPORT_DATA': return `import data v${cmd.payload.version}`;
        case 'RESET_DATABASE': return 'reset database';
        default: {
          const _exhaustive: never = cmd;
          return _exhaustive;
        }
      }
    }

    it('narrows to correct payload type via switch on type', () => {
      const cmd: Command = {
        type: 'CREATE_TRANSACTION',
        payload: createTransactionPayload,
        timestamp: '2024-01-01T00:00:00.000Z',
        sequence: 1
      };
      expect(describeCommand(cmd)).toBe('create transaction Lunch');
    });

    it('handles all 24 command types exhaustively', () => {
      const commands: Command[] = [
        { type: 'CREATE_ACCOUNT', payload: createAccountPayload, timestamp: '2024-01-01T00:00:00.000Z', sequence: 1 },
        { type: 'UPDATE_ACCOUNT', payload: accountPayload, timestamp: '2024-01-01T00:00:00.000Z', sequence: 2 },
        { type: 'DELETE_ACCOUNT', payload: { id: '1' }, timestamp: '2024-01-01T00:00:00.000Z', sequence: 3 },
        { type: 'CREATE_TRANSACTION', payload: createTransactionPayload, timestamp: '2024-01-01T00:00:00.000Z', sequence: 4 },
        { type: 'UPDATE_TRANSACTION', payload: transactionPayload, timestamp: '2024-01-01T00:00:00.000Z', sequence: 5 },
        { type: 'DELETE_TRANSACTION', payload: { id: '1' }, timestamp: '2024-01-01T00:00:00.000Z', sequence: 6 },
        { type: 'CREATE_CATEGORY', payload: createCategoryPayload, timestamp: '2024-01-01T00:00:00.000Z', sequence: 7 },
        { type: 'UPDATE_CATEGORY', payload: categoryPayload, timestamp: '2024-01-01T00:00:00.000Z', sequence: 8 },
        { type: 'BULK_CREATE_CATEGORIES', payload: { categories: [categoryPayload] }, timestamp: '2024-01-01T00:00:00.000Z', sequence: 9 },
        { type: 'DELETE_CATEGORY', payload: { id: '1' }, timestamp: '2024-01-01T00:00:00.000Z', sequence: 10 },
        { type: 'CREATE_LIMIT', payload: createLimitPayload, timestamp: '2024-01-01T00:00:00.000Z', sequence: 11 },
        { type: 'UPDATE_LIMIT', payload: limitPayload, timestamp: '2024-01-01T00:00:00.000Z', sequence: 12 },
        { type: 'DELETE_LIMIT', payload: { id: '1' }, timestamp: '2024-01-01T00:00:00.000Z', sequence: 13 },
        { type: 'CREATE_TEMPLATE', payload: createTemplatePayload, timestamp: '2024-01-01T00:00:00.000Z', sequence: 14 },
        { type: 'UPDATE_TEMPLATE', payload: templatePayload, timestamp: '2024-01-01T00:00:00.000Z', sequence: 15 },
        { type: 'DELETE_TEMPLATE', payload: { id: '1' }, timestamp: '2024-01-01T00:00:00.000Z', sequence: 16 },
        { type: 'CREATE_RECURRING', payload: createRecurringPayload, timestamp: '2024-01-01T00:00:00.000Z', sequence: 17 },
        { type: 'UPDATE_RECURRING', payload: recurringPayload, timestamp: '2024-01-01T00:00:00.000Z', sequence: 18 },
        { type: 'DELETE_RECURRING', payload: { id: '1' }, timestamp: '2024-01-01T00:00:00.000Z', sequence: 19 },
        { type: 'CREATE_SAVINGS_GOAL', payload: createSavingsGoalPayload, timestamp: '2024-01-01T00:00:00.000Z', sequence: 20 },
        { type: 'UPDATE_SAVINGS_GOAL', payload: savingsGoalPayload, timestamp: '2024-01-01T00:00:00.000Z', sequence: 21 },
        { type: 'DELETE_SAVINGS_GOAL', payload: { id: '1' }, timestamp: '2024-01-01T00:00:00.000Z', sequence: 22 },
        { type: 'IMPORT_DATA', payload: exportDataPayload, timestamp: '2024-01-01T00:00:00.000Z', sequence: 23 },
        { type: 'RESET_DATABASE', payload: {}, timestamp: '2024-01-01T00:00:00.000Z', sequence: 24 },
      ];

      expect(commands).toHaveLength(24);

      // Every command must produce a non-empty description (proves narrowing works)
      for (const cmd of commands) {
        expect(describeCommand(cmd)).toBeTruthy();
      }
    });
  });

  // -------------------------------------------------------------------------
  // ChangeRecord
  // -------------------------------------------------------------------------

  describe('ChangeRecord', () => {
    it('accepts a valid ChangeRecord with any Command variant', () => {
      const record: ChangeRecord = {
        id: 'cr-1',
        command: { type: 'CREATE_ACCOUNT', payload: createAccountPayload, timestamp: '2024-01-15T10:30:00Z', sequence: 1 },
        timestamp: '2024-01-15T10:30:00Z',
        accountId: 'acc-1',
        synced: false,
      };
      expect(record.id).toBe('cr-1');
      expect(record.command.type).toBe('CREATE_ACCOUNT');
      expect(record.synced).toBe(false);
    });

    it('accepts ChangeRecord with different Command variants', () => {
      const deleteRecord: ChangeRecord = {
        id: 'cr-2',
        command: { type: 'DELETE_TRANSACTION', payload: { id: 'txn-1' }, timestamp: '2024-01-15T11:00:00Z', sequence: 2 },
        timestamp: '2024-01-15T11:00:00Z',
        accountId: 'acc-1',
        synced: true,
      };
      expect(deleteRecord.command.type).toBe('DELETE_TRANSACTION');
      expect(deleteRecord.synced).toBe(true);

      const resetRecord: ChangeRecord = {
        id: 'cr-3',
        command: { type: 'RESET_DATABASE', payload: {}, timestamp: '2024-01-15T12:00:00Z', sequence: 3 },
        timestamp: '2024-01-15T12:00:00Z',
        accountId: 'acc-1',
        synced: false,
      };
      expect(resetRecord.command.type).toBe('RESET_DATABASE');
    });
  });

});
