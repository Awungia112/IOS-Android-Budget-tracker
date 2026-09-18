import { describe, it, expect } from 'vitest';
import { parseLegacyCsv, CsvParseError } from './csv-parser.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const MINIMAL_CSV = `date,title,amount,type,category
2026-04-30,Groceries,-12.50,expense,Food
2026-04-15,Salary,1500.00,income,Salary
`;

const GERMAN_CSV = `Datum;Titel;Betrag;Typ;Kategorie
30.04.2026;Lebensmittel;-12,50;expense;Essen
15.04.2026;Gehalt;1500,00;income;Gehalt
`;

const US_DATE_CSV = `date,title,amount,type,category
04/30/2026,Groceries,-12.50,expense,Food
`;

const QUOTED_CSV = `date,title,amount,type,category
2026-04-30,"Coffee, shop",3.50,expense,Drinks
`;

const MISSING_AMOUNT_CSV = `date,title,amount,type,category
2026-04-30,Groceries,,expense,Food
`;

const EMPTY_CSV = ``;

const HEADER_ONLY_CSV = `date,title,amount,type,category
`;

const MISSING_REQUIRED_HEADER_CSV = `date,title,type,category
2026-04-30,Groceries,expense,Food
`;

// ---------------------------------------------------------------------------
// Happy path
// ---------------------------------------------------------------------------

describe('parseLegacyCsv — happy path', () => {
  it('parses a basic comma-separated CSV correctly', () => {
    const result = parseLegacyCsv(MINIMAL_CSV);

    expect(result.transactions).toHaveLength(2);
    expect(result.account.name).toBe('Imported Account');
    expect(result.limits).toHaveLength(0);
    expect(result.templates).toHaveLength(0);
    expect(result.recurringItems).toHaveLength(0);
    expect(result.savingsGoals).toHaveLength(0);
  });

  it('parses amounts as positive decimal euros', () => {
    const result = parseLegacyCsv(MINIMAL_CSV);
    const grocery = result.transactions.find((t) => t.title === 'Groceries')!;
    const salary = result.transactions.find((t) => t.title === 'Salary')!;

    expect(grocery.amount).toBe(12.5);
    expect(salary.amount).toBe(1500);
  });

  it('correctly derives type from negative amount', () => {
    const result = parseLegacyCsv(MINIMAL_CSV);
    const grocery = result.transactions.find((t) => t.title === 'Groceries')!;
    expect(grocery.type).toBe('expense');
  });

  it('correctly derives type from income column', () => {
    const result = parseLegacyCsv(MINIMAL_CSV);
    const salary = result.transactions.find((t) => t.title === 'Salary')!;
    expect(salary.type).toBe('income');
  });

  it('derives income from positive amount when no type column is present (legacy sign convention)', () => {
    // Use the German/sign-only CSV — positive = income, negative = expense.
    // This matches the ExportTask.java convention: BT_EXPENSE amounts are
    // written with a leading minus; BT_INCOME amounts are written as-is.
    const germanNoType = `Datum;Name;Kategorie;Betrag
2026-07-28;Lohn;Lohn;314,13
2026-07-28;Essen;Essen;-746,22
`;
    const result = parseLegacyCsv(germanNoType);
    const lohn = result.transactions.find((t) => t.title === 'Lohn')!;
    const essen = result.transactions.find((t) => t.title === 'Essen')!;

    expect(lohn.type).toBe('income');   // positive → income
    expect(essen.type).toBe('expense'); // negative → expense
  });

  it('parses ISO dates to UTC midnight strings', () => {
    const result = parseLegacyCsv(MINIMAL_CSV);
    const grocery = result.transactions.find((t) => t.title === 'Groceries')!;
    expect(grocery.date).toBe('2026-04-30T00:00:00.000Z');
  });

  it('parses German locale CSV (semicolon delimiter, comma decimals, DD.MM.YYYY)', () => {
    const result = parseLegacyCsv(GERMAN_CSV);

    expect(result.transactions).toHaveLength(2);

    const grocery = result.transactions.find((t) => t.title === 'Lebensmittel')!;
    expect(grocery.amount).toBe(12.5);
    expect(grocery.type).toBe('expense');
    expect(grocery.date).toBe('2026-04-30T00:00:00.000Z');
  });

  it('parses US date format MM/DD/YYYY', () => {
    const result = parseLegacyCsv(US_DATE_CSV);
    const grocery = result.transactions[0];
    expect(grocery.date).toBe('2026-04-30T00:00:00.000Z');
  });

  it('handles quoted fields with embedded commas', () => {
    const result = parseLegacyCsv(QUOTED_CSV);
    expect(result.transactions[0].title).toBe('Coffee, shop');
  });

  it('deduplicates categories across rows', () => {
    const csv = `date,title,amount,type,category
2026-01-01,A,-10,expense,Food
2026-01-02,B,-5,expense,Food
2026-01-03,C,-3,expense,Food
`;
    const result = parseLegacyCsv(csv);
    expect(result.categories).toHaveLength(1);
    expect(result.categories[0].name).toBe('Food');
  });

  it('creates separate categories for same name but different types', () => {
    const csv = `date,title,amount,type,category
2026-01-01,A,-10,expense,Other
2026-01-02,B,10,income,Other
`;
    const result = parseLegacyCsv(csv);
    expect(result.categories).toHaveLength(2);
    const types = result.categories.map((c) => c.type).sort();
    expect(types).toEqual(['expense', 'income']);
  });

  it('assigns the same accountId to all transactions and categories', () => {
    const result = parseLegacyCsv(MINIMAL_CSV);
    const accountId = result.account.id;

    for (const t of result.transactions) {
      expect(t.accountId).toBe(accountId);
    }
    for (const c of result.categories) {
      expect(c.accountId).toBe(accountId);
    }
  });

  it('links each transaction to a category id that exists in categories', () => {
    const result = parseLegacyCsv(MINIMAL_CSV);
    const categoryIds = new Set(result.categories.map((c) => c.id));
    for (const t of result.transactions) {
      expect(categoryIds.has(t.category)).toBe(true);
    }
  });

  it('falls back to category name as title when title column is missing', () => {
    const csv = `date,amount,type,category
2026-01-01,-10,expense,Food
`;
    const result = parseLegacyCsv(csv);
    expect(result.transactions[0].title).toBe('Food');
  });

  it('uses "Other" as category when category column is empty', () => {
    const csv = `date,title,amount,type,category
2026-01-01,Test,-10,expense,
`;
    const result = parseLegacyCsv(csv);
    expect(result.categories[0].name).toBe('Other');
  });

  it('skips blank lines between rows', () => {
    const csv = `date,title,amount,type,category
2026-01-01,A,-10,expense,Food

2026-01-02,B,-5,expense,Food
`;
    const result = parseLegacyCsv(csv);
    expect(result.transactions).toHaveLength(2);
  });

  it('returns version "csv-legacy-v1"', () => {
    const result = parseLegacyCsv(MINIMAL_CSV);
    expect(result.version).toBe('csv-legacy-v1');
  });

  it('correctly classifies income and expense for the real legacy export format', () => {
    // The legacy ExportTask writes positive amounts for income, negative for expense.
    // There is no "type" column — sign is the only signal.
    const legacyCsv = `Datum;Name;Kategorie;Betrag;Kategorie-Limit;Kategorie-Limit-Datum
2026-07-28;Lohn;Lohn;314,13;0,00;
2026-07-28;Taschengeld;Taschengeld;444,24;0,00;
2026-07-28;Essen;Essen;-746,22;0,00;
2026-07-28;Kleidung;Kleidung;-786,43;0,00;
`;
    const result = parseLegacyCsv(legacyCsv);

    const income = result.transactions.filter((t) => t.type === 'income');
    const expense = result.transactions.filter((t) => t.type === 'expense');

    expect(income).toHaveLength(2);
    expect(expense).toHaveLength(2);
    expect(income.find((t) => t.title === 'Lohn')?.amount).toBe(314.13);
    expect(expense.find((t) => t.title === 'Essen')?.amount).toBe(746.22);
  });
});

// ---------------------------------------------------------------------------
// Missing columns
// ---------------------------------------------------------------------------

describe('parseLegacyCsv — missing columns', () => {
  it('throws CsvParseError when required header "amount" is missing', () => {
    expect(() => parseLegacyCsv(MISSING_REQUIRED_HEADER_CSV)).toThrow(CsvParseError);
    expect(() => parseLegacyCsv(MISSING_REQUIRED_HEADER_CSV)).toThrow(/amount/i);
  });

  it('throws CsvParseError when amount cell is empty', () => {
    expect(() => parseLegacyCsv(MISSING_AMOUNT_CSV)).toThrow(CsvParseError);
  });
});

// ---------------------------------------------------------------------------
// Malformed rows
// ---------------------------------------------------------------------------

describe('parseLegacyCsv — malformed rows', () => {
  it('throws CsvParseError for empty file', () => {
    expect(() => parseLegacyCsv(EMPTY_CSV)).toThrow(CsvParseError);
    expect(() => parseLegacyCsv(EMPTY_CSV)).toThrow(/empty/i);
  });

  it('throws CsvParseError for header-only file', () => {
    expect(() => parseLegacyCsv(HEADER_ONLY_CSV)).toThrow(CsvParseError);
    expect(() => parseLegacyCsv(HEADER_ONLY_CSV)).toThrow(/no data rows/i);
  });

  it('throws CsvParseError for unparseable date', () => {
    const csv = `date,title,amount,type,category
not-a-date,Test,-10,expense,Food
`;
    expect(() => parseLegacyCsv(csv)).toThrow(CsvParseError);
    expect(() => parseLegacyCsv(csv)).toThrow(/date/i);
  });

  it('throws CsvParseError for non-numeric amount', () => {
    const csv = `date,title,amount,type,category
2026-01-01,Test,abc,expense,Food
`;
    expect(() => parseLegacyCsv(csv)).toThrow(CsvParseError);
    expect(() => parseLegacyCsv(csv)).toThrow(/amount/i);
  });

  it('throws CsvParseError for zero amount', () => {
    const csv = `date,title,amount,type,category
2026-01-01,Test,0.00,expense,Food
`;
    expect(() => parseLegacyCsv(csv)).toThrow(CsvParseError);
  });

  it('error includes line number', () => {
    const csv = `date,title,amount,type,category
2026-01-01,Test,abc,expense,Food
`;
    try {
      parseLegacyCsv(csv);
      expect.fail('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(CsvParseError);
      expect((err as CsvParseError).line).toBe(2);
    }
  });

  it('throws CsvParseError with helpful message when CSV file is completely empty', () => {
    expect(() => parseLegacyCsv('   ')).toThrow(/empty/i);
  });
});
