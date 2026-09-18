/**
 * CSV parser for legacy "MeinBudget" exports.
 *
 * The legacy app exports a flat CSV with one row per transaction.
 * All data needed to reconstruct the ExportData shape lives in that
 * single file — categories are derived from the category column,
 * and a synthetic account is created from the filename or a default name.
 *
 * Expected header (case-insensitive, order-independent):
 *   date, title, amount, type, category
 *
 * Optional columns that are used when present:
 *   account, note
 *
 * Amount convention:
 *   The legacy app stores amounts as decimal strings, e.g. "12,34" (German
 *   locale) or "12.34".  Negative values indicate expenses regardless of the
 *   `type` column.  We store amounts as positive integers in centimes to match
 *   the rest of the codebase.
 *
 * Date convention:
 *   Accepts ISO 8601 ("2026-04-30"), German ("30.04.2026"), and US ("04/30/2026")
 *   formats.  All dates are normalised to ISO 8601 UTC midnight strings.
 */

import type { ExportData } from '../../types/index.js';
import type { Account, Category, Transaction, TransactionType } from '../../types/index.js';
import { v4 as uuidv4 } from 'uuid';

// ---------------------------------------------------------------------------
// Public surface
// ---------------------------------------------------------------------------

export class CsvParseError extends Error {
  constructor(
    message: string,
    public readonly line?: number,
  ) {
    super(message);
    this.name = 'CsvParseError';
  }
}

/**
 * Parse a legacy CSV export string and return an `ExportData` payload
 * compatible with `budgetService.importData()`.
 *
 * NOTE — account ID remapping: the returned `account.id` is a freshly
 * generated UUID used internally to cross-reference all transactions and
 * categories within this payload. The caller (BudgetContext.importAccountData)
 * immediately replaces `account` with the current active account and passes a
 * `targetAccountId` to `budgetService.importData()`, which remaps all foreign
 * keys accordingly. The synthesised UUID does not need to be stable across
 * calls.
 *
 * @param text Raw CSV text (UTF-8)
 */
export function parseLegacyCsv(text: string): ExportData {
  if (!text || !text.trim()) {
    throw new CsvParseError('CSV file is empty');
  }

  const lines = splitLines(text);
  if (lines.length < 2) {
    throw new CsvParseError('CSV file has no data rows (only a header or is empty)');
  }

  const [headerLine, ...dataLines] = lines;

  // Auto-detect delimiter from the header line.
  // If the header contains a semicolon, use semicolon as the delimiter for the
  // entire file — this is the German locale convention where commas are used as
  // decimal separators inside values (e.g. "12,50").
  const delimiter = headerLine.includes(';') ? ';' : ',';

  const headers = parseCsvRow(headerLine, delimiter).map((h) => normaliseHeader(h));

  validateRequiredHeaders(headers);

  const colIndex = buildColumnIndex(headers);

  // Build a synthetic account — the legacy CSV is always single-account.
  // "Imported Account" is intentionally generic; the user can rename it after import.
  const accountId = uuidv4();
  const account: Account = {
    id: accountId,
    name: 'Imported Account',
    initials: 'IM',
  };

  // Maps category name → Category so we emit each category only once.
  const categoryMap = new Map<string, Category>();

  const transactions: Transaction[] = [];

  for (let i = 0; i < dataLines.length; i++) {
    const raw = dataLines[i].trim();
    if (!raw) continue; // skip blank lines

    const lineNumber = i + 2; // 1-based, account for header
    const cols = parseCsvRow(raw, delimiter);

    const rawDate = getCol(cols, colIndex, 'date');
    const rawTitle = getCol(cols, colIndex, 'title');
    const rawAmount = getCol(cols, colIndex, 'amount');
    const rawType = getCol(cols, colIndex, 'type');
    const rawCategory = getCol(cols, colIndex, 'category');

    if (!rawDate || !rawAmount) {
      throw new CsvParseError(
        `Row ${lineNumber}: required fields "date" and "amount" must not be empty`,
        lineNumber,
      );
    }

    const date = parseDate(rawDate, lineNumber);
    const { amount, type: derivedType } = parseAmount(rawAmount, rawType, lineNumber);
    const categoryName = rawCategory?.trim() || 'Other';

    // Resolve or create category
    const categoryKey = `${derivedType}:${categoryName.toLowerCase()}`;
    if (!categoryMap.has(categoryKey)) {
      categoryMap.set(categoryKey, {
        id: uuidv4(),
        name: categoryName,
        type: derivedType,
        isDefault: false,
        accountId,
      });
    }
    const category = categoryMap.get(categoryKey)!;

    transactions.push({
      id: uuidv4(),
      accountId,
      category: category.id,
      amount,
      date,
      title: rawTitle?.trim() || categoryName,
      type: derivedType,
    });
  }

  if (transactions.length === 0) {
    throw new CsvParseError('CSV file contains no valid transaction rows');
  }

  return {
    version: 'csv-legacy-v1',
    exportDate: new Date().toISOString(),
    account,
    categories: Array.from(categoryMap.values()),
    transactions,
    limits: [],
    templates: [],
    recurringItems: [],
    savingsGoals: [],
  };
}

// ---------------------------------------------------------------------------
// Header validation
// ---------------------------------------------------------------------------

const REQUIRED_HEADERS = ['date', 'amount', 'category'] as const;

/**
 * Map of German (and other localised) column names → canonical English names.
 * Headers are normalised to lowercase before lookup.
 */
const HEADER_ALIASES: Record<string, string> = {
  // German
  datum: 'date',
  betrag: 'amount',
  kategorie: 'category',
  titel: 'title',
  typ: 'type',
  notiz: 'note',
  // Spanish
  fecha: 'date',
  importe: 'amount',
  categoria: 'category',
  titulo: 'title',
  tipo: 'type',
};

function normaliseHeader(h: string): string {
  const lower = h.toLowerCase().trim();
  return HEADER_ALIASES[lower] ?? lower;
}

function validateRequiredHeaders(headers: string[]): void {
  const missing = REQUIRED_HEADERS.filter((h) => !headers.includes(h));
  if (missing.length > 0) {
    throw new CsvParseError(
      `CSV is missing required column(s): ${missing.join(', ')}. ` +
        `Found headers: ${headers.join(', ')}`,
    );
  }
}

// ---------------------------------------------------------------------------
// Column index helpers
// ---------------------------------------------------------------------------

type ColumnIndex = Record<string, number>;

function buildColumnIndex(headers: string[]): ColumnIndex {
  const index: ColumnIndex = {};
  for (let i = 0; i < headers.length; i++) {
    // Input headers are already normalised by the caller (parseLegacyCsv maps
    // each header through normaliseHeader before calling this function), so no
    // further normalisation is needed here.
    index[headers[i]] = i;
  }
  return index;
}

function getCol(
  cols: string[],
  index: ColumnIndex,
  name: string,
): string | undefined {
  const i = index[name];
  if (i === undefined) return undefined;
  return cols[i]?.trim() ?? undefined;
}

// ---------------------------------------------------------------------------
// Amount parsing
// ---------------------------------------------------------------------------

/**
 * Parse a legacy amount string into a positive integer amount (centimes)
 * and derive the transaction type.
 *
 * Rules:
 * - Replace comma decimal separators with periods (German locale)
 * - Strip currency symbols and whitespace
 * - A leading minus → expense, regardless of `type` column
 * - If `type` column is present and equals "income" (case-insensitive) and
 *   the amount has no sign → income
 * - Otherwise default to "expense"
 */
function parseAmount(
  raw: string,
  rawType: string | undefined,
  lineNumber: number,
): { amount: number; type: TransactionType } {
  // Normalise: replace comma decimal separator, strip currency symbols
  const normalised = raw
    .replace(/,/g, '.')        // German decimal comma → period
    .replace(/[^0-9.\-]/g, '') // strip non-numeric except period and minus
    .trim();

  const value = parseFloat(normalised);

  if (!Number.isFinite(value)) {
    throw new CsvParseError(
      `Row ${lineNumber}: cannot parse amount "${raw}" — expected a numeric value`,
      lineNumber,
    );
  }

  // Derive type from the sign of the amount and, optionally, an explicit type column.
  //
  // The legacy MeinBudget ExportTask.java convention (verified from source):
  //   BT_INCOME amounts are written as-is (positive)
  //   BT_EXPENSE amounts are multiplied by -1 (negative)
  //
  // Priority order:
  //   1. Negative value  → always expense (sign is authoritative)
  //   2. Explicit "type" column present and equals "expense" → expense
  //   3. Explicit "type" column present and equals "income"  → income
  //   4. No type column, positive value → income (legacy sign convention)
  let type: TransactionType;
  if (value < 0) {
    type = 'expense';
  } else if (rawType !== undefined) {
    // Explicit type column present — respect it
    type = rawType.toLowerCase().trim() === 'income' ? 'income' : 'expense';
  } else {
    // No type column: positive value means income (legacy sign-encoded CSV)
    type = 'income';
  }

  // Store as decimal euros, rounded to 2 decimal places to avoid IEEE 754 noise.
  // The app's data layer stores amounts as decimal euros (e.g. 314.11 = €314.11),
  // matching the convention used by fromRoomAmount() in local-migration-utils.ts.
  const amount = Math.round((Math.abs(value) + Number.EPSILON) * 100) / 100;

  if (amount === 0) {
    // Intentional throw rather than skip: a zero-amount row in a real export
    // indicates corrupt or manually edited data. Halting with a clear error is
    // preferable to silently importing a broken record that would distort totals.
    throw new CsvParseError(
      `Row ${lineNumber}: amount "${raw}" resolves to zero — zero-value transactions are not supported`,
      lineNumber,
    );
  }

  return { amount, type };
}

// ---------------------------------------------------------------------------
// Date parsing
// ---------------------------------------------------------------------------

/**
 * Parse a date string from the legacy CSV.
 *
 * Accepted formats:
 *   - ISO 8601:       2026-04-30, 2026-04-30T10:11:00Z
 *   - German:         30.04.2026
 *   - US slash:       04/30/2026
 *
 * Returns an ISO 8601 UTC midnight string, e.g. "2026-04-30T00:00:00.000Z".
 */
function parseDate(raw: string, lineNumber: number): string {
  const s = raw.trim();

  // ISO 8601 (YYYY-MM-DD)
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) {
    const d = new Date(`${s.substring(0, 10)}T00:00:00.000Z`);
    if (!isNaN(d.getTime())) return d.toISOString();
  }

  // German (DD.MM.YYYY)
  const germanMatch = /^(\d{2})\.(\d{2})\.(\d{4})$/.exec(s);
  if (germanMatch) {
    const [, dd, mm, yyyy] = germanMatch;
    const d = new Date(`${yyyy}-${mm}-${dd}T00:00:00.000Z`);
    if (!isNaN(d.getTime())) return d.toISOString();
  }

  // US slash (MM/DD/YYYY)
  const usMatch = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(s);
  if (usMatch) {
    const [, mm, dd, yyyy] = usMatch;
    const d = new Date(`${yyyy}-${mm}-${dd}T00:00:00.000Z`);
    if (!isNaN(d.getTime())) return d.toISOString();
  }

  throw new CsvParseError(
    `Row ${lineNumber}: cannot parse date "${raw}" — expected YYYY-MM-DD, DD.MM.YYYY, or MM/DD/YYYY`,
    lineNumber,
  );
}

// ---------------------------------------------------------------------------
// Account name derivation — removed (was dead code)
// The account is always named "Imported Account"; see parseLegacyCsv comment.
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// CSV row tokeniser — handles quoted fields and escaped quotes ("" → ")
// ---------------------------------------------------------------------------

function parseCsvRow(line: string, delimiter: ',' | ';' = ','): string[] {
  const fields: string[] = [];
  let i = 0;
  const len = line.length;

  // The loop bound is `i <= len` (not `i < len`) so that a line ending exactly
  // on a delimiter (e.g. "a,b,c,") correctly produces a trailing empty field:
  // when i === len the loop body immediately pushes '' and breaks.
  while (i <= len) {
    if (i === len) {
      fields.push('');
      break;
    }

    if (line[i] === '"') {
      // Quoted field
      let value = '';
      i++; // skip opening quote
      while (i < len) {
        if (line[i] === '"') {
          if (line[i + 1] === '"') {
            // Escaped quote ("") → literal "
            value += '"';
            i += 2;
          } else {
            // Closing quote
            i++;
            break;
          }
        } else {
          value += line[i];
          i++;
        }
      }
      fields.push(value);
      // Skip the delimiter after the closing quote
      if (i < len && line[i] === delimiter) i++;
    } else {
      // Unquoted field — read until delimiter or end
      const start = i;
      while (i < len && line[i] !== delimiter) i++;
      fields.push(line.slice(start, i));
      if (i < len) i++; // skip delimiter
      else break;
    }
  }

  return fields;
}

// ---------------------------------------------------------------------------
// Line splitter — handles \r\n, \n, \r
// ---------------------------------------------------------------------------

function splitLines(text: string): string[] {
  const lines = text.split(/\r\n|\r|\n/);

  // Strip all trailing blank lines so a file ending with multiple newlines
  // (\r\n\r\n, etc.) doesn't produce spurious empty entries.
  let end = lines.length;
  while (end > 0 && lines[end - 1].trim() === '') end--;

  return lines.slice(0, end);
}
