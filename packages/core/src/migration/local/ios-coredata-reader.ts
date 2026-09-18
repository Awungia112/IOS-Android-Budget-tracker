import { closeConnection, openReadOnly } from './db.js';
import {
  fromCoreDataAmount,
  fromCoreDataFrequency,
  fromCoreDataTimestamp,
  fromUnixMs,
  reconstructStartDateFromDayOfMonth,
  tryFromCoreDataLegacyDateString,
} from './local-migration-utils.js';
import { legacyIdToUuid } from '../legacy-id.js';
import {
  mapLegacyCategoryToMigrationCategory,
  normalizeLegacyCategoryName,
  toLegacyTransactionType,
} from '../legacy-category-mapping.js';
import type { CoreDataLegacyLimit } from './ios-migration-setup.js';
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
import type { Frequency, TransactionType } from '../../types/index.js';

const CORE_DATA_DB_NAME = 'legacy_coredata_db';
const CORE_DATA_ACCOUNT_ID = legacyIdToUuid('account', 'core_data:0');
const CORE_DATA_INTERNAL_TABLES = new Set(['Z_METADATA', 'Z_PRIMARYKEY', 'Z_MODELCACHE']);

type Row = Record<string, unknown>;

interface SelectSpec {
  alias: string;
  candidates?: string[];
  required?: boolean;
  defaultSql?: string;
}

interface SelectBuildResult {
  sql: string;
  missingRequired: string[];
}

interface CategoryLookup {
  id: string;
  name: string;
  type: TransactionType;
  icon?: string;
}

interface CategoryIndex {
  categories: MigrationCategory[];
  byLegacyPk: Map<number, CategoryLookup>;
  byTitleType: Map<string, CategoryLookup>;
  byImageType: Map<string, CategoryLookup>;
  emittedIds: Set<string>;
}

interface CategorySource {
  legacyId: number | string;
  idSeed?: number | string;
  legacyPk?: number;
  name: string;
  type: TransactionType;
  icon?: number;
  isDefault?: boolean;
  isDeleted?: boolean;
}

export interface ReadCoreDataEntitiesOptions {
  legacyLimits?: CoreDataLegacyLimit[];
}

interface QueryResult {
  values?: Row[];
}

interface QueryConnection {
  query(statement: string, values?: unknown[]): Promise<QueryResult>;
}

const CATEGORY_SELECT: SelectSpec[] = [
  { alias: 'Z_PK', required: true },
  { alias: 'ZTITLE', candidates: ['ZTITLE', 'ZTITEL'], defaultSql: "''" },
  { alias: 'ZIMAGENUMBER', candidates: ['ZIMAGENUMBER', 'ZBILDNUMMER'], defaultSql: '1' },
  { alias: 'ZISINCOMECATEGORY', candidates: ['ZISINCOMECATEGORY', 'ZISTEINNAHME'], defaultSql: '0' },
  { alias: 'ZISSTANDARD', candidates: ['ZISSTANDARD', 'ZSTANDARD'], defaultSql: '0' },
  { alias: 'ZISVISIBLE', defaultSql: '1' },
];

const SAVING_GOAL_SELECT: SelectSpec[] = [
  { alias: 'Z_PK', required: true },
  { alias: 'ZTITLE', candidates: ['ZTITLE', 'ZTITEL'], defaultSql: "''" },
  { alias: 'ZAMOUNT', required: true },
  { alias: 'ZDATE' },
  { alias: 'ZMONTHAMOUNT' },
  { alias: 'ZSTARTDATE' },
  { alias: 'ZCATEGORY' },
];

const TRANSACTION_SELECT: SelectSpec[] = [
  { alias: 'Z_PK', required: true },
  { alias: 'ZAMOUNT', candidates: ['ZAMOUNT', 'ZWERT'], required: true },
  { alias: 'ZDATE', candidates: ['ZDATE', 'ZDATUM'], required: true },
  { alias: 'ZTITLE', candidates: ['ZTITLE', 'ZNOTIZ', 'ZTITEL'], defaultSql: "''" },
  { alias: 'ZCATEGORY', required: true },
  { alias: 'ZSPARTARGET' },
];

const RECURRING_SELECT: SelectSpec[] = [
  { alias: 'Z_PK', required: true },
  { alias: 'ZAMOUNT', candidates: ['ZAMOUNT', 'ZWERT'], required: true },
  { alias: 'ZDAYOFMONTH', candidates: ['ZDAYOFMONTH', 'ZWIEDERKEHRENDERTAG'], defaultSql: '1' },
  { alias: 'ZLASTSAVED', candidates: ['ZLASTSAVED', 'ZZULETZTGESPEICHERT'] },
  { alias: 'ZRECURRENCEINTERVAL', defaultSql: '1' },
  { alias: 'ZTITLE', candidates: ['ZTITLE', 'ZNOTIZ', 'ZTITEL'], defaultSql: "''" },
  { alias: 'ZCATEGORY', required: true },
];

const TEMPLATE_SELECT: SelectSpec[] = [
  { alias: 'Z_PK', required: true },
  { alias: 'ZAMOUNT', candidates: ['ZAMOUNT', 'ZWERT'], required: true },
  { alias: 'ZTITLE', candidates: ['ZTITLE', 'ZNOTIZ', 'ZTITEL'], defaultSql: "''" },
  { alias: 'ZCATEGORY', required: true },
];

const V1_CATEGORY_SELECT: SelectSpec[] = [
  { alias: 'Z_PK', required: true },
  { alias: 'ZTITLE', defaultSql: "''" },
  { alias: 'ZIMAGENUMBER', candidates: ['ZBILDNUMMER'], defaultSql: '1' },
  { alias: 'ZISSTANDARD', candidates: ['ZSTANDARD'], defaultSql: '0' },
  { alias: 'ZISACTIVE', candidates: ['ZAKTIV'], defaultSql: '1' },
];

const V1_DATE_GROUP_SELECT: SelectSpec[] = [
  { alias: 'Z_PK', required: true },
  { alias: 'ZDATESTRING', candidates: ['ZDATUM'] },
];

const V1_TRANSACTION_SELECT: SelectSpec[] = [
  { alias: 'Z_PK', required: true },
  { alias: 'ZAMOUNT', candidates: ['ZWERT'], required: true },
  { alias: 'ZDATE', candidates: ['ZDATUM'] },
  { alias: 'ZTITLE', candidates: ['ZNOTIZ'], defaultSql: "''" },
  { alias: 'ZCATEGORYTITLE', candidates: ['ZTITEL'], defaultSql: "''" },
  { alias: 'ZIMAGENUMBER', candidates: ['ZBILDNUMMER'], defaultSql: '1' },
  { alias: 'ZAUSGABE' },
  { alias: 'ZEINNAHME' },
];

const V1_RECURRING_SELECT: SelectSpec[] = [
  { alias: 'Z_PK', required: true },
  { alias: 'ZAMOUNT', candidates: ['ZWERT'], required: true },
  { alias: 'ZDAYOFMONTH', candidates: ['ZWIEDERKEHRENDERTAG'], defaultSql: '1' },
  { alias: 'ZLASTSAVED', candidates: ['ZZULETZTGESPEICHERT'] },
  { alias: 'ZTITLE', candidates: ['ZNOTIZ'], defaultSql: "''" },
  { alias: 'ZCATEGORYTITLE', candidates: ['ZTITEL'], defaultSql: "''" },
  { alias: 'ZIMAGENUMBER', candidates: ['ZBILDNUMMER'], defaultSql: '1' },
  { alias: 'ZISINCOME', candidates: ['ZISTEINNAHME'], defaultSql: '0' },
];

const V1_TEMPLATE_SELECT: SelectSpec[] = [
  { alias: 'Z_PK', required: true },
  { alias: 'ZAMOUNT', candidates: ['ZWERT'], required: true },
  { alias: 'ZTITLE', candidates: ['ZNOTIZ'], defaultSql: "''" },
  { alias: 'ZCATEGORYTITLE', candidates: ['ZTITEL'], defaultSql: "''" },
  { alias: 'ZIMAGENUMBER', candidates: ['ZBILDNUMMER'], defaultSql: '1' },
  { alias: 'ZISINCOME', candidates: ['ZISTEINNAHME'], defaultSql: '0' },
];

function quoteIdentifier(identifier: string): string {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(identifier)) {
    throw new Error(`[Migration] Unsafe SQLite identifier: ${identifier}`);
  }
  return `"${identifier}"`;
}

function buildSelect(columns: Set<string>, specs: SelectSpec[]): SelectBuildResult {
  const parts: string[] = [];
  const missingRequired: string[] = [];

  for (const spec of specs) {
    const candidates = spec.candidates ?? [spec.alias];
    const present = candidates.filter((candidate) => columns.has(candidate));

    if (present.length === 0) {
      if (spec.required) missingRequired.push(spec.alias);
      parts.push(`${spec.defaultSql ?? 'NULL'} AS ${quoteIdentifier(spec.alias)}`);
      continue;
    }

    const expression = present.length === 1
      ? quoteIdentifier(present[0])
      : `COALESCE(${present.map(quoteIdentifier).join(', ')})`;

    parts.push(`${expression} AS ${quoteIdentifier(spec.alias)}`);
  }

  return { sql: parts.join(', '), missingRequired };
}

function asNumber(value: unknown): number | undefined {
  if (value === null || value === undefined) return undefined;
  const normalized = typeof value === 'string' ? value.trim() : value;
  if (normalized === '') return undefined;

  const numberValue = Number(normalized);
  return Number.isFinite(numberValue) ? numberValue : undefined;
}

function asString(value: unknown): string | undefined {
  if (value === null || value === undefined) return undefined;
  const stringValue = String(value).trim();
  return stringValue || undefined;
}

function asBoolean(value: unknown): boolean | undefined {
  if (value === null || value === undefined) return undefined;
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value === 1;
  const normalized = String(value).trim().toLowerCase();
  if (normalized === 'true' || normalized === '1') return true;
  if (normalized === 'false' || normalized === '0') return false;
  return undefined;
}

function normalizeDayOfMonth(value: unknown): number {
  const day = asNumber(value);
  return day !== undefined && day >= 1 && day <= 31 ? day : 1;
}

function isMissingDatabaseError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /not found|unable to open|does not exist|is not a database/i.test(message);
}

function warnSkippedRow(entity: string, row: Row, reason: string): void {
  const legacyPk = asString(row.Z_PK) ?? 'unknown';
  console.warn(`[Migration] Skipped Core Data ${entity} row ${legacyPk}: ${reason}`);
}

function warnSkippedTable(tableName: string, missingRequired: string[]): void {
  console.warn(
    `[Migration] Skipped Core Data table ${tableName}: missing required column(s) ${missingRequired.join(', ')}`
  );
}

function hasUserCoreDataTables(tables: Set<string>): boolean {
  const userTables = [...tables].filter((table) =>
    !CORE_DATA_INTERNAL_TABLES.has(table) &&
    !table.startsWith('sqlite_')
  );

  return userTables.length > 0;
}

function hasReadableModernCoreDataSchema(tables: Set<string>): boolean {
  return hasUserCoreDataTables(tables) && tables.has('ZCATEGORY') && tables.has('ZACCOUNTING');
}

function hasReadableV1CoreDataSchema(tables: Set<string>): boolean {
  return hasUserCoreDataTables(tables) && tables.has('ZBETRAEGE');
}

async function readTableNames(connection: QueryConnection): Promise<Set<string>> {
  const result = await connection.query(
    "SELECT name FROM sqlite_master WHERE type = 'table'"
  );

  return new Set(
    (result.values ?? [])
      .map((row) => asString(row.name))
      .filter((name): name is string => !!name)
  );
}

async function readColumns(
  connection: QueryConnection,
  tableName: string,
): Promise<Set<string>> {
  const result = await connection.query(`PRAGMA table_info(${quoteIdentifier(tableName)})`);

  return new Set(
    (result.values ?? [])
      .map((row) => asString(row.name))
      .filter((name): name is string => !!name)
  );
}

async function readRows(
  connection: QueryConnection,
  tables: Set<string>,
  tableName: string,
  specs: SelectSpec[],
): Promise<Row[]> {
  if (!tables.has(tableName) || CORE_DATA_INTERNAL_TABLES.has(tableName)) return [];

  const columns = await readColumns(connection, tableName);
  const { sql, missingRequired } = buildSelect(columns, specs);
  if (missingRequired.length > 0) {
    warnSkippedTable(tableName, missingRequired);
    return [];
  }

  const result = await connection.query(`SELECT ${sql} FROM ${quoteIdentifier(tableName)}`);
  return result.values ?? [];
}

function createCoreDataAccount(): MigrationAccount {
  return {
    id: CORE_DATA_ACCOUNT_ID,
    name: 'Mein Konto',
    initials: 'MK',
    isOnline: false,
    role: 'owner',
    legacyId: 0,
    legacySource: 'core_data',
  };
}

function categoryTitleKey(name: string, type: TransactionType): string {
  return `${type}:${normalizeLegacyCategoryName(name).toLowerCase()}`;
}

function categoryImageKey(imageNumber: number, type: TransactionType): string {
  return `${type}:${imageNumber}`;
}

function createCategoryIndex(): CategoryIndex {
  return {
    categories: [],
    byLegacyPk: new Map(),
    byTitleType: new Map(),
    byImageType: new Map(),
    emittedIds: new Set(),
  };
}

function addCategory(index: CategoryIndex, source: CategorySource): CategoryLookup {
  const mapped = mapLegacyCategoryToMigrationCategory({
    entityType: 'category',
    legacyId: source.idSeed ?? source.legacyId,
    name: source.name,
    type: source.type,
    icon: source.icon,
    isDefault: source.isDefault ?? false,
  });

  const lookup: CategoryLookup = {
    id: mapped.id,
    name: mapped.name,
    type: mapped.type,
    icon: mapped.icon,
  };

  if (source.legacyPk !== undefined) {
    index.byLegacyPk.set(source.legacyPk, lookup);
  }

  for (const name of [source.name, mapped.name]) {
    index.byTitleType.set(categoryTitleKey(name, mapped.type), lookup);
  }

  if (source.icon !== undefined) {
    const key = categoryImageKey(source.icon, mapped.type);
    if (!index.byImageType.has(key)) {
      index.byImageType.set(key, lookup);
    }
  }

  if (!index.emittedIds.has(mapped.id)) {
    index.emittedIds.add(mapped.id);
    index.categories.push({
      id: mapped.id,
      name: mapped.name,
      type: mapped.type,
      icon: mapped.icon,
      isDefault: mapped.isDefault,
      legacyId: source.legacyId,
      legacySource: 'core_data',
      ...(source.isDeleted !== undefined ? { isDeleted: source.isDeleted } : {}),
    });
  }

  return lookup;
}

function resolveCategory(
  index: CategoryIndex,
  source: Omit<CategorySource, 'name'> & { name?: string },
): CategoryLookup {
  const title = source.name?.trim() || 'Unbekannte Kategorie';
  const byTitle = index.byTitleType.get(categoryTitleKey(title, source.type));
  if (byTitle) return byTitle;

  if (source.icon !== undefined) {
    const byImage = index.byImageType.get(categoryImageKey(source.icon, source.type));
    if (byImage) return byImage;
  }

  return addCategory(index, { ...source, name: title });
}

function mapCategoryRows(rows: Row[]): CategoryIndex {
  const index = createCategoryIndex();

  for (const row of rows) {
    const legacyPk = asNumber(row.Z_PK);
    if (legacyPk === undefined) {
      warnSkippedRow('category', row, 'missing Z_PK');
      continue;
    }

    const type = toLegacyTransactionType(row.ZISINCOMECATEGORY);
    const title = asString(row.ZTITLE) ?? 'Unbekannte Kategorie';
    const imageNumber = asNumber(row.ZIMAGENUMBER);
    addCategory(index, {
      legacyId: legacyPk,
      idSeed: `core_data:${legacyPk}`,
      legacyPk,
      name: title,
      type,
      icon: imageNumber,
      isDefault: asBoolean(row.ZISSTANDARD) ?? false,
      isDeleted: asBoolean(row.ZISVISIBLE) === false,
    });
  }

  return index;
}

function mapSavingGoalRows(
  rows: Row[],
  categoriesByLegacyPk: Map<number, CategoryLookup>,
): {
  savingGoals: MigrationSavingGoal[];
  byLegacyPk: Map<number, string>;
} {
  const savingGoals: MigrationSavingGoal[] = [];
  const byLegacyPk = new Map<number, string>();

  for (const row of rows) {
    const legacyPk = asNumber(row.Z_PK);
    const amount = asNumber(row.ZAMOUNT);
    if (legacyPk === undefined) {
      warnSkippedRow('saving goal', row, 'missing Z_PK');
      continue;
    }
    if (amount === undefined) {
      warnSkippedRow('saving goal', row, 'missing ZAMOUNT');
      continue;
    }

    const categoryPk = asNumber(row.ZCATEGORY);
    const category = categoryPk === undefined ? undefined : categoriesByLegacyPk.get(categoryPk);
    if (!category) {
      warnSkippedRow(
        'saving goal',
        row,
        categoryPk === undefined ? 'missing ZCATEGORY' : `unknown ZCATEGORY ${categoryPk}`
      );
      continue;
    }

    const deadlineSeconds = asNumber(row.ZDATE);
    const startSeconds = asNumber(row.ZSTARTDATE);
    const monthAmount = asNumber(row.ZMONTHAMOUNT);
    const id = legacyIdToUuid('saving_goal', `core_data:${legacyPk}`);
    byLegacyPk.set(legacyPk, id);

    savingGoals.push({
      id,
      accountId: CORE_DATA_ACCOUNT_ID,
      name: asString(row.ZTITLE) ?? 'Ersparnis',
      targetAmount: fromCoreDataAmount(amount),
      ...(monthAmount !== undefined ? { monthlyAmount: fromCoreDataAmount(monthAmount) } : {}),
      deadline: deadlineSeconds !== undefined ? fromCoreDataTimestamp(deadlineSeconds) : '',
      categoryId: category.id,
      ...(category.icon ? { icon: category.icon } : {}),
      ...(startSeconds !== undefined ? { creationDate: fromCoreDataTimestamp(startSeconds) } : {}),
      legacyId: legacyPk,
      legacySource: 'core_data',
    });
  }

  return { savingGoals, byLegacyPk };
}

function mapTransactionRows(
  rows: Row[],
  categoriesByLegacyPk: Map<number, CategoryLookup>,
  savingGoalsByLegacyPk: Map<number, string>,
): MigrationTransaction[] {
  const transactions: MigrationTransaction[] = [];

  for (const row of rows) {
    const legacyPk = asNumber(row.Z_PK);
    const amount = asNumber(row.ZAMOUNT);
    const date = asNumber(row.ZDATE);
    const categoryPk = asNumber(row.ZCATEGORY);
    const category = categoryPk === undefined ? undefined : categoriesByLegacyPk.get(categoryPk);
    if (legacyPk === undefined) {
      warnSkippedRow('transaction', row, 'missing Z_PK');
      continue;
    }
    if (amount === undefined) {
      warnSkippedRow('transaction', row, 'missing ZAMOUNT');
      continue;
    }
    if (date === undefined) {
      warnSkippedRow('transaction', row, 'missing ZDATE');
      continue;
    }
    if (!category) {
      warnSkippedRow(
        'transaction',
        row,
        categoryPk === undefined ? 'missing ZCATEGORY' : `unknown ZCATEGORY ${categoryPk}`
      );
      continue;
    }

    const sparTargetPk = asNumber(row.ZSPARTARGET);

    transactions.push({
      id: legacyIdToUuid('transaction', `core_data:${legacyPk}`),
      accountId: CORE_DATA_ACCOUNT_ID,
      categoryId: category.id,
      amount: fromCoreDataAmount(amount),
      date: fromCoreDataTimestamp(date),
      title: asString(row.ZTITLE) ?? category.name,
      type: category.type,
      ...(sparTargetPk !== undefined && savingGoalsByLegacyPk.has(sparTargetPk)
        ? { savingsGoalId: savingGoalsByLegacyPk.get(sparTargetPk) }
        : {}),
      legacyId: legacyPk,
      legacySource: 'core_data',
    });
  }

  return transactions;
}

function mapRecurringRows(
  rows: Row[],
  categoriesByLegacyPk: Map<number, CategoryLookup>,
): MigrationRecurring[] {
  const recurringEntries: MigrationRecurring[] = [];

  for (const row of rows) {
    const legacyPk = asNumber(row.Z_PK);
    const amount = asNumber(row.ZAMOUNT);
    const categoryPk = asNumber(row.ZCATEGORY);
    const category = categoryPk === undefined ? undefined : categoriesByLegacyPk.get(categoryPk);
    if (legacyPk === undefined) {
      warnSkippedRow('recurring entry', row, 'missing Z_PK');
      continue;
    }
    if (amount === undefined) {
      warnSkippedRow('recurring entry', row, 'missing ZAMOUNT');
      continue;
    }
    if (!category) {
      warnSkippedRow(
        'recurring entry',
        row,
        categoryPk === undefined ? 'missing ZCATEGORY' : `unknown ZCATEGORY ${categoryPk}`
      );
      continue;
    }

    const dayOfMonth = normalizeDayOfMonth(row.ZDAYOFMONTH);
    const lastSaved = asNumber(row.ZLASTSAVED);
    const interval = asNumber(row.ZRECURRENCEINTERVAL) ?? 1;
    let frequency: Frequency;
    try {
      frequency = fromCoreDataFrequency(interval);
    } catch {
      frequency = 'monthly';
    }

    recurringEntries.push({
      id: legacyIdToUuid('recurring', `core_data:${legacyPk}`),
      accountId: CORE_DATA_ACCOUNT_ID,
      categoryId: category.id,
      amount: fromCoreDataAmount(amount),
      frequency,
      startDate: lastSaved !== undefined
        ? fromCoreDataTimestamp(lastSaved)
        : reconstructStartDateFromDayOfMonth(dayOfMonth),
      name: asString(row.ZTITLE) ?? category.name,
      type: category.type,
      dayOfMonth,
      legacyId: legacyPk,
      legacySource: 'core_data',
    });
  }

  return recurringEntries;
}

function mapTemplateRows(
  rows: Row[],
  categoriesByLegacyPk: Map<number, CategoryLookup>,
): MigrationTemplate[] {
  const templates: MigrationTemplate[] = [];

  for (const row of rows) {
    const legacyPk = asNumber(row.Z_PK);
    const amount = asNumber(row.ZAMOUNT);
    const categoryPk = asNumber(row.ZCATEGORY);
    const category = categoryPk === undefined ? undefined : categoriesByLegacyPk.get(categoryPk);
    if (legacyPk === undefined) {
      warnSkippedRow('template', row, 'missing Z_PK');
      continue;
    }
    if (amount === undefined) {
      warnSkippedRow('template', row, 'missing ZAMOUNT');
      continue;
    }
    if (!category) {
      warnSkippedRow(
        'template',
        row,
        categoryPk === undefined ? 'missing ZCATEGORY' : `unknown ZCATEGORY ${categoryPk}`
      );
      continue;
    }

    templates.push({
      id: legacyIdToUuid('template', `core_data:${legacyPk}`),
      accountId: CORE_DATA_ACCOUNT_ID,
      name: asString(row.ZTITLE) ?? category.name,
      amount: fromCoreDataAmount(amount),
      categoryId: category.id,
      type: category.type,
      legacyId: legacyPk,
      legacySource: 'core_data',
    });
  }

  return templates;
}

function mapV1CategoryRows(incomeRows: Row[], expenseRows: Row[]): CategoryIndex {
  const index = createCategoryIndex();

  for (const row of incomeRows) {
    const legacyPk = asNumber(row.Z_PK);
    if (legacyPk === undefined) {
      warnSkippedRow('v1 income category', row, 'missing Z_PK');
      continue;
    }

    addCategory(index, {
      legacyId: `core_data:v1:ZKATEGORIEN:${legacyPk}`,
      name: asString(row.ZTITLE) ?? 'Unbekannte Kategorie',
      type: 'income',
      icon: asNumber(row.ZIMAGENUMBER),
      isDefault: asBoolean(row.ZISSTANDARD) ?? false,
      isDeleted: asBoolean(row.ZISACTIVE) === false,
    });
  }

  for (const row of expenseRows) {
    const legacyPk = asNumber(row.Z_PK);
    if (legacyPk === undefined) {
      warnSkippedRow('v1 expense category', row, 'missing Z_PK');
      continue;
    }

    addCategory(index, {
      legacyId: `core_data:v1:ZAUSGABEKATEGORIEN:${legacyPk}`,
      name: asString(row.ZTITLE) ?? 'Unbekannte Kategorie',
      type: 'expense',
      icon: asNumber(row.ZIMAGENUMBER),
      isDefault: asBoolean(row.ZISSTANDARD) ?? false,
      isDeleted: asBoolean(row.ZISACTIVE) === false,
    });
  }

  return index;
}

function mapV1DateRows(rows: Row[]): Map<number, string> {
  const byLegacyPk = new Map<number, string>();

  for (const row of rows) {
    const legacyPk = asNumber(row.Z_PK);
    const dateString = asString(row.ZDATESTRING);
    if (legacyPk !== undefined && dateString) {
      byLegacyPk.set(legacyPk, dateString);
    }
  }

  return byLegacyPk;
}

function resolveV1Category(
  index: CategoryIndex,
  row: Row,
  type: TransactionType,
  entityType: string,
): CategoryLookup {
  const legacyPk = asNumber(row.Z_PK);
  const title = asString(row.ZCATEGORYTITLE);
  const imageNumber = asNumber(row.ZIMAGENUMBER);
  const idSeed = `core_data:v1:${entityType}:${legacyPk ?? `${title ?? 'unknown'}:${imageNumber ?? 'no-icon'}`}`;

  return resolveCategory(index, {
    legacyId: idSeed,
    idSeed,
    name: title,
    type,
    icon: imageNumber,
    isDefault: false,
  });
}

function v1TransactionType(row: Row): TransactionType | undefined {
  if (asNumber(row.ZEINNAHME) !== undefined) return 'income';
  if (asNumber(row.ZAUSGABE) !== undefined) return 'expense';
  return undefined;
}

function v1TransactionDate(
  row: Row,
  incomeDateStrings: Map<number, string>,
  expenseDateStrings: Map<number, string>,
): string | undefined {
  const incomePk = asNumber(row.ZEINNAHME);
  const expensePk = asNumber(row.ZAUSGABE);
  const dateString = incomePk !== undefined
    ? incomeDateStrings.get(incomePk)
    : expensePk !== undefined
      ? expenseDateStrings.get(expensePk)
      : undefined;

  if (dateString) {
    const parsedDate = tryFromCoreDataLegacyDateString(dateString);
    if (parsedDate) return parsedDate;
  }

  const fallbackDate = asNumber(row.ZDATE);
  return fallbackDate !== undefined ? fromCoreDataTimestamp(fallbackDate) : undefined;
}

function mapV1TransactionRows(
  rows: Row[],
  categoryIndex: CategoryIndex,
  incomeDateStrings: Map<number, string>,
  expenseDateStrings: Map<number, string>,
): MigrationTransaction[] {
  const transactions: MigrationTransaction[] = [];

  for (const row of rows) {
    const legacyPk = asNumber(row.Z_PK);
    const amount = asNumber(row.ZAMOUNT);
    const type = v1TransactionType(row);
    const date = v1TransactionDate(row, incomeDateStrings, expenseDateStrings);
    if (legacyPk === undefined) {
      warnSkippedRow('v1 transaction', row, 'missing Z_PK');
      continue;
    }
    if (amount === undefined) {
      warnSkippedRow('v1 transaction', row, 'missing ZAMOUNT');
      continue;
    }
    if (!type) {
      warnSkippedRow('v1 transaction', row, 'missing income/expense parent reference');
      continue;
    }
    if (!date) {
      warnSkippedRow('v1 transaction', row, 'missing date');
      continue;
    }

    const category = resolveV1Category(categoryIndex, row, type, 'ZBETRAEGE');

    transactions.push({
      id: legacyIdToUuid('transaction', `core_data:v1:${legacyPk}`),
      accountId: CORE_DATA_ACCOUNT_ID,
      categoryId: category.id,
      amount: fromCoreDataAmount(amount),
      date,
      title: asString(row.ZTITLE) ?? category.name,
      type,
      legacyId: `v1:${legacyPk}`,
      legacySource: 'core_data',
    });
  }

  return transactions;
}

function mapV1RecurringRows(rows: Row[], categoryIndex: CategoryIndex): MigrationRecurring[] {
  const recurringEntries: MigrationRecurring[] = [];

  for (const row of rows) {
    const legacyPk = asNumber(row.Z_PK);
    const amount = asNumber(row.ZAMOUNT);
    if (legacyPk === undefined) {
      warnSkippedRow('v1 recurring entry', row, 'missing Z_PK');
      continue;
    }
    if (amount === undefined) {
      warnSkippedRow('v1 recurring entry', row, 'missing ZAMOUNT');
      continue;
    }

    const type = toLegacyTransactionType(row.ZISINCOME);
    const category = resolveV1Category(categoryIndex, row, type, 'ZWIEDERKEHREND');
    const dayOfMonth = normalizeDayOfMonth(row.ZDAYOFMONTH);
    const lastSaved = asNumber(row.ZLASTSAVED);

    recurringEntries.push({
      id: legacyIdToUuid('recurring', `core_data:v1:${legacyPk}`),
      accountId: CORE_DATA_ACCOUNT_ID,
      categoryId: category.id,
      amount: fromCoreDataAmount(amount),
      frequency: 'monthly',
      startDate: lastSaved !== undefined
        ? fromCoreDataTimestamp(lastSaved)
        : reconstructStartDateFromDayOfMonth(dayOfMonth),
      name: asString(row.ZTITLE) ?? category.name,
      type,
      dayOfMonth,
      legacyId: `v1:${legacyPk}`,
      legacySource: 'core_data',
    });
  }

  return recurringEntries;
}

function mapV1TemplateRows(rows: Row[], categoryIndex: CategoryIndex): MigrationTemplate[] {
  const templates: MigrationTemplate[] = [];

  for (const row of rows) {
    const legacyPk = asNumber(row.Z_PK);
    const amount = asNumber(row.ZAMOUNT);
    if (legacyPk === undefined) {
      warnSkippedRow('v1 template', row, 'missing Z_PK');
      continue;
    }
    if (amount === undefined) {
      warnSkippedRow('v1 template', row, 'missing ZAMOUNT');
      continue;
    }

    const type = toLegacyTransactionType(row.ZISINCOME);
    const category = resolveV1Category(categoryIndex, row, type, 'ZVORLAGEN');

    templates.push({
      id: legacyIdToUuid('template', `core_data:v1:${legacyPk}`),
      accountId: CORE_DATA_ACCOUNT_ID,
      name: asString(row.ZTITLE) ?? category.name,
      amount: fromCoreDataAmount(amount),
      categoryId: category.id,
      type,
      legacyId: `v1:${legacyPk}`,
      legacySource: 'core_data',
    });
  }

  return templates;
}

function mapCoreDataLimits(
  legacyLimits: CoreDataLegacyLimit[] | undefined,
  categoryIndex: CategoryIndex,
): MigrationLimit[] {
  const limits: MigrationLimit[] = [];
  if (!legacyLimits?.length) return limits;

  for (const [index, limit] of legacyLimits.entries()) {
    const amount = asNumber(limit.amount);
    const categoryTitle = asString(limit.categoryTitle) ?? asString(limit.name);
    if (amount === undefined || amount === 0) {
      console.warn(`[Migration] Skipped Core Data limit ${index}: missing or zero amount`);
      continue;
    }
    if (!categoryTitle) {
      console.warn(`[Migration] Skipped Core Data limit ${index}: missing category title`);
      continue;
    }

    let normalizedAmount: number;
    try {
      normalizedAmount = fromCoreDataAmount(amount);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.warn(`[Migration] Skipped Core Data limit ${index}: ${message}`);
      continue;
    }

    const createdAt = asNumber(limit.createdAt);
    const category = resolveCategory(categoryIndex, {
      legacyId: `core_data:limit-category:${categoryTitle}`,
      idSeed: `core_data:limit-category:${categoryTitle}`,
      name: categoryTitle,
      type: 'expense',
      isDefault: false,
    });
    const legacyId = `core_data:limit:${categoryTitle}:${createdAt ?? 'unknown'}:${index}`;

    limits.push({
      id: legacyIdToUuid('limit', legacyId),
      accountId: CORE_DATA_ACCOUNT_ID,
      categoryId: category.id,
      amount: normalizedAmount,
      ...(createdAt !== undefined ? { date: fromUnixMs(createdAt) } : {}),
      legacyId,
      legacySource: 'core_data',
    });
  }

  return limits;
}

async function readModernCoreDataEntities(
  connection: QueryConnection,
  tables: Set<string>,
  options: ReadCoreDataEntitiesOptions,
): Promise<Partial<MigrationPayload>> {
  const categoryRows = await readRows(connection, tables, 'ZCATEGORY', CATEGORY_SELECT);
  const categoryIndex = mapCategoryRows(categoryRows);

  const savingGoalRows = await readRows(connection, tables, 'ZSPARTARGET', SAVING_GOAL_SELECT);
  const { savingGoals, byLegacyPk: savingGoalsByLegacyPk } = mapSavingGoalRows(
    savingGoalRows,
    categoryIndex.byLegacyPk,
  );

  const transactionRows = await readRows(connection, tables, 'ZACCOUNTING', TRANSACTION_SELECT);
  const recurringRows = await readRows(connection, tables, 'ZRECURRINGACCOUNTING', RECURRING_SELECT);
  const templateRows = await readRows(connection, tables, 'ZSHORTCUT', TEMPLATE_SELECT);
  const limits = mapCoreDataLimits(options.legacyLimits, categoryIndex);

  return {
    accounts: [createCoreDataAccount()],
    categories: categoryIndex.categories,
    transactions: mapTransactionRows(transactionRows, categoryIndex.byLegacyPk, savingGoalsByLegacyPk),
    limits,
    recurringEntries: mapRecurringRows(recurringRows, categoryIndex.byLegacyPk),
    savingGoals,
    templates: mapTemplateRows(templateRows, categoryIndex.byLegacyPk),
  };
}

async function readV1CoreDataEntities(
  connection: QueryConnection,
  tables: Set<string>,
  options: ReadCoreDataEntitiesOptions,
): Promise<Partial<MigrationPayload>> {
  const incomeCategoryRows = await readRows(connection, tables, 'ZKATEGORIEN', V1_CATEGORY_SELECT);
  const expenseCategoryRows = await readRows(connection, tables, 'ZAUSGABEKATEGORIEN', V1_CATEGORY_SELECT);
  const categoryIndex = mapV1CategoryRows(incomeCategoryRows, expenseCategoryRows);

  const incomeDateRows = await readRows(connection, tables, 'ZEINNAHME', V1_DATE_GROUP_SELECT);
  const expenseDateRows = await readRows(connection, tables, 'ZAUSGABE', V1_DATE_GROUP_SELECT);
  const transactionRows = await readRows(connection, tables, 'ZBETRAEGE', V1_TRANSACTION_SELECT);
  const recurringRows = await readRows(connection, tables, 'ZWIEDERKEHREND', V1_RECURRING_SELECT);
  const templateRows = await readRows(connection, tables, 'ZVORLAGEN', V1_TEMPLATE_SELECT);
  const transactions = mapV1TransactionRows(
    transactionRows,
    categoryIndex,
    mapV1DateRows(incomeDateRows),
    mapV1DateRows(expenseDateRows),
  );
  const recurringEntries = mapV1RecurringRows(recurringRows, categoryIndex);
  const templates = mapV1TemplateRows(templateRows, categoryIndex);
  const limits = mapCoreDataLimits(options.legacyLimits, categoryIndex);

  return {
    accounts: [createCoreDataAccount()],
    categories: categoryIndex.categories,
    transactions,
    limits,
    recurringEntries,
    savingGoals: [],
    templates,
  };
}

export async function readCoreDataEntities(
  options: ReadCoreDataEntitiesOptions = {},
): Promise<Partial<MigrationPayload>> {
  let opened = false;

  try {
    const { connection } = await openReadOnly(CORE_DATA_DB_NAME);
    opened = true;

    const tables = await readTableNames(connection);
    if (hasReadableModernCoreDataSchema(tables)) {
      return await readModernCoreDataEntities(connection, tables, options);
    }
    if (hasReadableV1CoreDataSchema(tables)) {
      return await readV1CoreDataEntities(connection, tables, options);
    }
    return {};
  } catch (error) {
    if (isMissingDatabaseError(error)) return {};
    throw error;
  } finally {
    if (opened) {
      await closeConnection(CORE_DATA_DB_NAME);
    }
  }
}

export async function readAlliOSCoreData(): Promise<Partial<MigrationPayload>> {
  const { prepareiOSDatabases } = await import('./ios-migration-setup');
  const setup = await prepareiOSDatabases();
  if (!setup.coreDataPresent) return {};

  return readCoreDataEntities({ legacyLimits: setup.limits });
}

/**
 * Tier-1 presence check for the local-migration verification flow
 * (pre-4.5.0 skip detection). Confirms the Core Data database exists and has
 * a readable schema without reading any entity rows — cheaper than
 * readAlliOSCoreData(), which is used only once real entity comparison
 * (Tier 2) is needed.
 *
 * The Core Data account id is a fixed constant (not derived from row data),
 * so its "existence" is really just "does this device have a readable
 * Core Data legacy database at all".
 */
export async function readCoreDataLegacyAccountId(): Promise<string | undefined> {
  const { prepareiOSDatabases } = await import('./ios-migration-setup');
  const setup = await prepareiOSDatabases();
  if (!setup.coreDataPresent) return undefined;

  let opened = false;
  try {
    const { connection } = await openReadOnly(CORE_DATA_DB_NAME);
    opened = true;

    const tables = await readTableNames(connection);
    if (hasReadableModernCoreDataSchema(tables) || hasReadableV1CoreDataSchema(tables)) {
      return CORE_DATA_ACCOUNT_ID;
    }
    return undefined;
  } catch (error) {
    if (isMissingDatabaseError(error)) return undefined;
    throw error;
  } finally {
    if (opened) await closeConnection(CORE_DATA_DB_NAME);
  }
}
