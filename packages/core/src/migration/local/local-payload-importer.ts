import type { BudgetService } from '../../services/budget.service.js';
import type {
  Account,
  Category,
  ExportData,
  Frequency,
  Limit,
  RecurringItem,
  SavingsGoal,
  Template,
  Transaction,
  TransactionType,
} from '../../types/index.js';
import type { MigrationResult } from '../migration.service.js';
import { createEmptyMigrationResult, createImportedCounts } from '../migration-result.js';
import { toLocalCalendarDate } from './local-migration-utils.js';
import type {
  MigrationAccount,
  MigrationCategory,
  MigrationPayload,
} from './local-legacy-types.js';

type ImportCounts = MigrationResult['imported'];
type BudgetServiceImporter = Pick<
  BudgetService,
  'importData' | 'getRecurringItemsByAccountId' | 'reconcileRecurring'
>;

function addCounts(target: ImportCounts, source: ImportCounts): void {
  target.accounts += source.accounts;
  target.transactions += source.transactions;
  target.categories += source.categories;
  target.limits += source.limits;
  target.templates += source.templates;
  target.recurringItems += source.recurringItems;
  target.savingsGoals += source.savingsGoals;
}

function isEmptyPayload(payload: MigrationPayload): boolean {
  return (
    payload.accounts.length === 0 &&
    payload.categories.length === 0 &&
    payload.transactions.length === 0 &&
    payload.limits.length === 0 &&
    payload.recurringEntries.length === 0 &&
    payload.savingGoals.length === 0 &&
    payload.templates.length === 0
  );
}

function hasMigratableEntities(payload: MigrationPayload): boolean {
  return (
    payload.categories.length > 0 ||
    payload.transactions.length > 0 ||
    payload.limits.length > 0 ||
    payload.recurringEntries.length > 0 ||
    payload.savingGoals.length > 0 ||
    payload.templates.length > 0
  );
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

function categoryAccountId(category: MigrationCategory): string | undefined {
  return (category as MigrationCategory & { accountId?: string }).accountId;
}

function isForAccount<T extends { accountId: string; isDeleted?: boolean }>(
  entity: T,
  accountId: string,
): boolean {
  return !entity.isDeleted && entity.accountId === accountId;
}

function collectReferencedCategoryIds(payload: MigrationPayload, accountId: string): Set<string> {
  const ids = new Set<string>();

  for (const transaction of payload.transactions) {
    if (isForAccount(transaction, accountId)) ids.add(transaction.categoryId);
  }

  for (const limit of payload.limits) {
    if (isForAccount(limit, accountId)) ids.add(limit.categoryId);
  }

  for (const recurring of payload.recurringEntries) {
    if (isForAccount(recurring, accountId)) ids.add(recurring.categoryId);
  }

  for (const goal of payload.savingGoals) {
    if (isForAccount(goal, accountId)) ids.add(goal.categoryId);
  }

  for (const template of payload.templates) {
    if (isForAccount(template, accountId)) ids.add(template.categoryId);
  }

  return ids;
}

function categoriesForAccount(
  payload: MigrationPayload,
  accountId: string,
  isSingleAccount: boolean,
): Category[] {
  const referencedCategoryIds = collectReferencedCategoryIds(payload, accountId);

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

function exportDataForAccount(
  payload: MigrationPayload,
  account: MigrationAccount,
  isSingleAccount: boolean,
): ExportData {
  const accountId = account.id;

  return {
    version: String(payload.schemaVersion),
    exportDate: payload.exportedAt,
    account: toAccount(account),
    categories: categoriesForAccount(payload, accountId, isSingleAccount),
    transactions: payload.transactions
      .filter((transaction) => isForAccount(transaction, accountId))
      .map((transaction): Transaction => ({
        id: transaction.id,
        accountId,
        category: transaction.categoryId,
        amount: transaction.amount,
        date: toLocalCalendarDate(transaction.date),
        title: transaction.title,
        type: toTransactionType(transaction.type),
        ...(transaction.createdAt ? { createdAt: transaction.createdAt } : {}),
        ...(transaction.savingsGoalId ? { savingsGoalId: transaction.savingsGoalId } : {}),
        ...(transaction.isCompletionTransaction !== undefined
          ? { isCompletionTransaction: transaction.isCompletionTransaction }
          : {}),
      })),
    limits: payload.limits
      .filter((limit) => isForAccount(limit, accountId))
      .map((limit): Limit => ({
        id: limit.id,
        accountId,
        categoryId: limit.categoryId,
        amount: limit.amount,
      })),
    recurringItems: payload.recurringEntries
      .filter((recurring) => isForAccount(recurring, accountId))
      .map((recurring): RecurringItem => ({
        id: recurring.id,
        accountId,
        categoryId: recurring.categoryId,
        amount: recurring.amount,
        frequency: toFrequency(recurring.frequency),
        startDate: toLocalCalendarDate(recurring.startDate),
        name: recurring.name,
        type: toTransactionType(recurring.type),
      })),
    savingsGoals: payload.savingGoals
      .filter((goal) => isForAccount(goal, accountId))
      .map((goal): SavingsGoal => ({
        id: goal.id,
        accountId,
        name: goal.name,
        targetAmount: goal.targetAmount,
        deadline: toLocalCalendarDate(goal.deadline || goal.creationDate || payload.exportedAt),
        categoryId: goal.categoryId,
        ...(goal.icon ? { icon: goal.icon } : {}),
        ...(goal.monthlyAmount !== undefined ? { monthlyAmount: goal.monthlyAmount } : {}),
      })),
    templates: payload.templates
      .filter((template) => isForAccount(template, accountId))
      .map((template): Template => ({
        id: template.id,
        accountId,
        name: template.name,
        amount: template.amount,
        categoryId: template.categoryId,
        type: toTransactionType(template.type),
      })),
  };
}

function filterPayloadForLocalAccounts(
  payload: MigrationPayload,
  localAccountIds: Set<string>,
): MigrationPayload {
  const hasLocalAccounts = localAccountIds.size > 0;

  return {
    ...payload,
    accounts: payload.accounts.filter(
      (account) => !account.isDeleted && localAccountIds.has(account.id),
    ),
    categories: payload.categories.filter((category) => {
      if (category.isDeleted) return false;
      const scopedAccountId = categoryAccountId(category);
      if (scopedAccountId) return localAccountIds.has(scopedAccountId);
      return hasLocalAccounts;
    }),
    transactions: payload.transactions.filter(
      (transaction) => !transaction.isDeleted && localAccountIds.has(transaction.accountId),
    ),
    limits: payload.limits.filter(
      (limit) => !limit.isDeleted && localAccountIds.has(limit.accountId),
    ),
    recurringEntries: payload.recurringEntries.filter(
      (recurring) => !recurring.isDeleted && localAccountIds.has(recurring.accountId),
    ),
    savingGoals: payload.savingGoals.filter(
      (goal) => !goal.isDeleted && localAccountIds.has(goal.accountId),
    ),
    templates: payload.templates.filter(
      (template) => !template.isDeleted && localAccountIds.has(template.accountId),
    ),
  };
}

export async function importLocalMigrationPayload(
  payload: MigrationPayload,
  budgetService: BudgetServiceImporter,
): Promise<MigrationResult> {
  if (isEmptyPayload(payload)) {
    return createEmptyMigrationResult();
  }

  if (payload.accounts.length === 0 && hasMigratableEntities(payload)) {
    throw new Error('Local migration payload contains entities but no account');
  }

  // Online (server-mirrored) accounts are imported from the on-device copy
  // exactly like offline ones. The legacy cloud mirror is no longer the source
  // of truth for them, so there is nothing to defer to the online migration.
  const localAccounts = payload.accounts.filter(
    (account) => !account.isDeleted && account.name.trim() !== '',
  );
  const blankNameAccounts = payload.accounts.filter(
    (account) => !account.isDeleted && account.name.trim() === '',
  );
  const skippedAccountIds = blankNameAccounts.map((account) => account.id);
  const localAccountIds = new Set(localAccounts.map((account) => account.id));

  const filteredPayload = filterPayloadForLocalAccounts(payload, localAccountIds);

  if (isEmptyPayload(filteredPayload)) {
    return createEmptyMigrationResult({
      skippedAccounts: blankNameAccounts.length,
      skippedAccountIds,
    });
  }

  const imported = createImportedCounts();
  const importedAccountIds: string[] = [];
  const importedAccounts: MigrationResult['importedAccounts'] = [];

  const isSingleAccount = payload.accounts.length <= 1;

  for (const account of localAccounts) {
    const exportData = exportDataForAccount(filteredPayload, account, isSingleAccount);
    const counts = await budgetService.importData(exportData, account.id);

    // Local Android/iOS migration inserts recurring definitions after the
    // normal account-load reconciliation cycle. Materialize their forecast
    // instances explicitly, just like the remote migration path does.
    const recurringItems = await budgetService.getRecurringItemsByAccountId(account.id);
    await Promise.all(recurringItems.map((item) => budgetService.reconcileRecurring(item, { adoptLegacy: true })));

    addCounts(imported, counts);
    importedAccountIds.push(account.id);
    importedAccounts.push({
      id: account.id,
      name: exportData.account.name,
      initials: exportData.account.initials,
      counts: {
        transactions: counts.transactions,
        categories: counts.categories,
        limits: counts.limits,
        templates: counts.templates,
        recurringItems: counts.recurringItems,
        savingsGoals: counts.savingsGoals,
      },
    });
  }

  return createEmptyMigrationResult({
    imported,
    importedAccountIds,
    importedAccounts,
    skippedAccounts: blankNameAccounts.length,
    skippedAccountIds,
  });
}
