import Dexie, { type Table } from 'dexie';
import { legacyIdToUuid } from './local-migration-utils.js';
import type {
  Account,
  Category,
  Frequency,
  Limit,
  RecurringItem,
  SavingsGoal,
  Template,
  Transaction,
  TransactionType,
} from '../../types/index.js';
import type {
  MigrationAccount,
  MigrationCategory,
  MigrationLimit,
  MigrationPayload,
  MigrationRecurring,
  MigrationSavingGoal,
  MigrationTemplate,
  MigrationTransaction,
} from './local-legacy-types.js';

type MigrationImportTableMap = {
  accounts: Table<Account, string>;
  categories: Table<Category, string>;
  transactions: Table<Transaction, string>;
  limits: Table<Limit, string>;
  recurringItems: Table<RecurringItem, string>;
  savingsGoals: Table<SavingsGoal, string>;
  templates: Table<Template, string>;
};

type MigrationImportTableName = keyof MigrationImportTableMap;

function getTable<T extends MigrationImportTableName>(db: Dexie, table: T): MigrationImportTableMap[T] {
  // Access table property with proper Record type to reduce type-safety bypass scope
  const tableRecord = db as unknown as Record<MigrationImportTableName, Table<unknown, string>>;
  return tableRecord[table] as MigrationImportTableMap[T];
}

function toTransactionType(value: unknown): TransactionType {
  return value === 'income' ? 'income' : 'expense';
}

const BASE_FREQUENCIES = new Set<Frequency>(['daily', 'weekly', 'monthly']);
const INTERVAL_FREQUENCY_PATTERN = /^every_([1-9]\d*)_(days|weeks|months)$/;

function toFrequency(value: unknown): Frequency {
  if (typeof value === 'string') {
    const normalized = value.trim();
    if (BASE_FREQUENCIES.has(normalized as Frequency)) {
      return normalized as Frequency;
    }

    const match = INTERVAL_FREQUENCY_PATTERN.exec(normalized);
    if (match) {
      const interval = Number(match[1]);
      if (Number.isSafeInteger(interval)) {
        return normalized as Frequency;
      }
    }
  }

  return 'monthly';
}

function accountInitials(account: MigrationAccount): string {
  const explicit = account.initials?.trim();
  if (explicit) return explicit;

  const name = account.name.trim();
  return name.substring(0, 2).toUpperCase() || 'AC';
}

function toAccount(account: MigrationAccount): Account {
  return {
    id: account.id,
    name: account.name.trim() || 'Imported Account',
    initials: accountInitials(account),
  };
}

function categoryAccountId(category: MigrationCategory): string | undefined {
  return (category as MigrationCategory & { accountId?: string }).accountId;
}

function isForAccount<T extends { accountId: string; isDeleted?: boolean }>(
  entity: T,
  accountId: string,
): boolean {
  return !entity.isDeleted && entity.accountId === accountId;
}

function categoriesForAccount(
  payload: MigrationPayload,
  accountId: string,
  isSingleAccount: boolean,
): Category[] {
  const referencedCategoryIds = new Set<string>();

  for (const transaction of payload.transactions) {
    if (isForAccount(transaction, accountId)) referencedCategoryIds.add(transaction.categoryId);
  }

  for (const limit of payload.limits) {
    if (isForAccount(limit, accountId)) referencedCategoryIds.add(limit.categoryId);
  }

  for (const recurring of payload.recurringEntries) {
    if (isForAccount(recurring, accountId)) referencedCategoryIds.add(recurring.categoryId);
  }

  for (const goal of payload.savingGoals) {
    if (isForAccount(goal, accountId)) referencedCategoryIds.add(goal.categoryId);
  }

  for (const template of payload.templates) {
    if (isForAccount(template, accountId)) referencedCategoryIds.add(template.categoryId);
  }

  return payload.categories
    .filter((category) => {
      if (category.isDeleted) return false;

      const scopedAccountId = categoryAccountId(category);
      if (scopedAccountId) return scopedAccountId === accountId;

      return isSingleAccount || referencedCategoryIds.has(category.id) || category.isDefault === true;
    })
    .map((category) => ({
      id: category.id,
      name: category.name,
      type: toTransactionType(category.type),
      isDefault: category.isDefault === true,
      accountId,
      ...(category.icon ? { icon: category.icon } : {}),
    }));
}

function accountCategoryKey(accountId: string, categoryId: string): string {
  return `${accountId}|${categoryId}`;
}

function buildScopedCategories(
  accounts: Account[],
  payload: MigrationPayload,
  isSingleAccount: boolean,
): { categories: Category[]; categoryIdMap: Map<string, string> } {
  const categoriesByAccount = accounts.map((account) => categoriesForAccount(payload, account.id, isSingleAccount));
  const countByCategoryId = new Map<string, number>();

  for (const categories of categoriesByAccount) {
    for (const category of categories) {
      countByCategoryId.set(category.id, (countByCategoryId.get(category.id) ?? 0) + 1);
    }
  }

  const categoryIdMap = new Map<string, string>();
  const scopedCategories: Category[] = [];

  accounts.forEach((account, index) => {
    for (const category of categoriesByAccount[index]) {
      const key = accountCategoryKey(account.id, category.id);
      const scopedId = countByCategoryId.get(category.id)! > 1
        ? legacyIdToUuid('category', `${account.id}:${category.id}`)
        : category.id;

      categoryIdMap.set(key, scopedId);
      scopedCategories.push({ ...category, id: scopedId });
    }
  });

  return { categories: scopedCategories, categoryIdMap };
}

function remapCategoryId(accountId: string, categoryId: string, categoryIdMap: Map<string, string>): string {
  return categoryIdMap.get(accountCategoryKey(accountId, categoryId)) ?? categoryId;
}

function toTransaction(transaction: MigrationTransaction, categoryIdMap: Map<string, string>): Transaction {
  return {
    id: transaction.id,
    accountId: transaction.accountId,
    category: remapCategoryId(transaction.accountId, transaction.categoryId, categoryIdMap),
    amount: transaction.amount,
    date: transaction.date,
    title: transaction.title,
    type: toTransactionType(transaction.type),
    ...(transaction.createdAt ? { createdAt: transaction.createdAt } : {}),
    ...(transaction.savingsGoalId ? { savingsGoalId: transaction.savingsGoalId } : {}),
    ...(transaction.isCompletionTransaction !== undefined
      ? { isCompletionTransaction: transaction.isCompletionTransaction }
      : {}),
  };
}

function toLimit(limit: MigrationLimit, categoryIdMap: Map<string, string>): Limit {
  return {
    id: limit.id,
    accountId: limit.accountId,
    categoryId: remapCategoryId(limit.accountId, limit.categoryId, categoryIdMap),
    amount: limit.amount,
  };
}

function toRecurringItem(recurring: MigrationRecurring, categoryIdMap: Map<string, string>): RecurringItem {
  return {
    id: recurring.id,
    accountId: recurring.accountId,
    categoryId: remapCategoryId(recurring.accountId, recurring.categoryId, categoryIdMap),
    amount: recurring.amount,
    frequency: toFrequency(recurring.frequency),
    startDate: recurring.startDate,
    name: recurring.name,
    type: toTransactionType(recurring.type),
  };
}

function toSavingsGoal(goal: MigrationSavingGoal, categoryIdMap: Map<string, string>, exportedAt: string): SavingsGoal {
  return {
    id: goal.id,
    accountId: goal.accountId,
    name: goal.name,
    targetAmount: goal.targetAmount,
    deadline: goal.deadline || (goal as MigrationSavingGoal & { creationDate?: string }).creationDate || exportedAt,
    categoryId: remapCategoryId(goal.accountId, goal.categoryId, categoryIdMap),
    ...(goal.icon ? { icon: goal.icon } : {}),
    ...(goal.monthlyAmount !== undefined ? { monthlyAmount: goal.monthlyAmount } : {}),
  };
}

function toTemplate(template: MigrationTemplate, categoryIdMap: Map<string, string>): Template {
  return {
    id: template.id,
    accountId: template.accountId,
    name: template.name,
    amount: template.amount,
    categoryId: remapCategoryId(template.accountId, template.categoryId, categoryIdMap),
    type: toTransactionType(template.type),
  };
}

export class MigrationIntegrityError extends Error {
  constructor(public entityType: string, public expected: number, public actual: number | string | undefined) {
    super(`Integrity check failed for ${entityType}: expected ${expected}, got ${actual}`);
    Object.setPrototypeOf(this, MigrationIntegrityError.prototype);
  }
}

function validatePayload(payload: MigrationPayload): void {
  const expectedArrays: Array<keyof MigrationPayload> = [
    'accounts',
    'categories',
    'transactions',
    'limits',
    'recurringEntries',
    'savingGoals',
    'templates',
  ];

  for (const key of expectedArrays) {
    if (!Array.isArray(payload[key])) {
      throw new Error(`Invalid migration payload: ${String(key)} must be an array`);
    }
  }
}

export async function importToIndexedDB(
  db: Dexie,
  payload: MigrationPayload,
  onProgress: (entity: string, current: number, total: number) => void
): Promise<void> {
  validatePayload(payload);

  const accounts = payload.accounts.filter((account) => !account.isDeleted && account.name.trim() !== '').map(toAccount);
  const importedAccountIds = new Set(accounts.map((account) => account.id));
  const isSingleAccount = accounts.length <= 1;

  const { categories, categoryIdMap } = buildScopedCategories(accounts, payload, isSingleAccount);
  const transactions = payload.transactions
    .filter((transaction) => !transaction.isDeleted && importedAccountIds.has(transaction.accountId))
    .map((transaction) => toTransaction(transaction, categoryIdMap));
  const limits = payload.limits
    .filter((limit) => !limit.isDeleted && importedAccountIds.has(limit.accountId))
    .map((limit) => toLimit(limit, categoryIdMap));
  const recurringItems = payload.recurringEntries
    .filter((recurring) => !recurring.isDeleted && importedAccountIds.has(recurring.accountId))
    .map((recurring) => toRecurringItem(recurring, categoryIdMap));
  const savingsGoals = payload.savingGoals
    .filter((goal) => !goal.isDeleted && importedAccountIds.has(goal.accountId))
    .map((goal) => toSavingsGoal(goal, categoryIdMap, payload.exportedAt));
  const templates = payload.templates
    .filter((template) => !template.isDeleted && importedAccountIds.has(template.accountId))
    .map((template) => toTemplate(template, categoryIdMap));

  const importOrder = [
    { key: 'accounts', table: 'accounts', records: accounts },
    { key: 'categories', table: 'categories', records: categories },
    { key: 'transactions', table: 'transactions', records: transactions },
    { key: 'limits', table: 'limits', records: limits },
    { key: 'recurringEntries', table: 'recurringItems', records: recurringItems },
    { key: 'savingGoals', table: 'savingsGoals', records: savingsGoals },
    { key: 'templates', table: 'templates', records: templates },
  ] as const;

  await db.transaction(
    'rw',
    importOrder.map(({ table }) => getTable(db, table)),
    async () => {
      for (const { table, records } of importOrder) {
        if (records.length === 0) {
          continue;
        }

        onProgress(table, 0, records.length);

        const tableRef = getTable(db, table) as Table<unknown, string>;
        try {
          await tableRef.bulkPut(records as readonly unknown[]);
        } catch (error) {
          throw new Error(`Failed to import ${table}: ${error instanceof Error ? error.message : String(error)}`);
        }

        await validateImportedRecords(tableRef, records, table);
        onProgress(table, records.length, records.length);
      }

      await spotValidate(db, transactions);
    }
  );
}

async function validateImportedRecords(
  tableRef: Table<unknown, string>,
  records: readonly { id: string }[],
  entityType: string,
): Promise<void> {
  const ids = records.map((record) => record.id);
  const stored = await tableRef.bulkGet(ids);

  const missingIds = ids.filter((_, index) => stored[index] === undefined);
  if (missingIds.length > 0) {
    throw new MigrationIntegrityError(entityType, records.length, `${missingIds.length} missing`);
  }
}

async function spotValidate(db: Dexie, transactions: Transaction[]): Promise<void> {
  if (transactions.length === 0) {
    return;
  }

  const sampleSize = Math.min(transactions.length, 5);
  const sample = transactions.slice(0, sampleSize);

  for (const record of sample) {
    const stored = await getTable(db, 'transactions').get(record.id);

    if (!stored) {
      throw new MigrationIntegrityError('transactions:spot', record.amount, `missing ${record.id}`);
    }

    if (stored.amount !== record.amount) {
      throw new MigrationIntegrityError('transactions:spot', record.amount, stored.amount);
    }
  }
}
