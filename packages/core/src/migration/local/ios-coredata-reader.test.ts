import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  type Row = Record<string, unknown>;
  const state: {
    openError?: Error;
    tables: string[];
    columns: Record<string, string[]>;
    rows: Record<string, Row[]>;
  } = {
    tables: [],
    columns: {},
    rows: {},
  };

  function splitProjectionList(value: string): string[] {
    const parts: string[] = [];
    let depth = 0;
    let quote: '"' | "'" | undefined;
    let start = 0;

    for (let index = 0; index < value.length; index += 1) {
      const char = value[index];

      if (quote) {
        if (char === quote) {
          if (quote === "'" && value[index + 1] === "'") {
            index += 1;
            continue;
          }
          quote = undefined;
        }
        continue;
      }

      if (char === '"' || char === "'") {
        quote = char;
      } else if (char === '(') {
        depth += 1;
      } else if (char === ')') {
        depth -= 1;
      } else if (char === ',' && depth === 0) {
        parts.push(value.slice(start, index).trim());
        start = index + 1;
      }
    }

    parts.push(value.slice(start).trim());
    return parts.filter(Boolean);
  }

  function evaluateProjectionExpression(expression: string, row: Row): unknown {
    const trimmed = expression.trim();
    const coalesceMatch = trimmed.match(/^COALESCE\((.*)\)$/s);
    if (coalesceMatch) {
      for (const part of splitProjectionList(coalesceMatch[1])) {
        const value = evaluateProjectionExpression(part, row);
        if (value !== null && value !== undefined) return value;
      }
      return null;
    }

    if (trimmed.toUpperCase() === 'NULL') return null;
    if (isSqlNumericLiteral(trimmed)) return Number(trimmed);

    const stringMatch = trimmed.match(/^'(.*)'$/s);
    if (stringMatch) return stringMatch[1].replace(/''/g, "'");

    const columnMatch = trimmed.match(/^"([^"]+)"$/);
    if (columnMatch) return row[columnMatch[1]];

    return undefined;
  }

  function isSqlNumericLiteral(value: string): boolean {
    if (value.length === 0) return false;

    let index = value[0] === '-' ? 1 : 0;
    if (index === value.length) return false;

    let hasDigit = false;
    let hasDecimalPoint = false;

    for (; index < value.length; index += 1) {
      const char = value[index];
      if (char >= '0' && char <= '9') {
        hasDigit = true;
        continue;
      }
      if (char === '.' && !hasDecimalPoint) {
        hasDecimalPoint = true;
        continue;
      }
      return false;
    }

    return hasDigit;
  }

  function projectSelectedRows(statement: string, rows: Row[]): Row[] {
    const selectMatch = statement.match(/^SELECT\s+(.+)\s+FROM\s+"[^"]+"$/s);
    if (!selectMatch) return rows;

    const selectSql = selectMatch[1];
    return rows.map((row) => {
      const projected: Row = {};

      for (const part of splitProjectionList(selectSql)) {
        const aliasMatch = part.match(/^(.*)\s+AS\s+"([^"]+)"$/s);
        if (!aliasMatch) continue;

        projected[aliasMatch[2]] = evaluateProjectionExpression(aliasMatch[1], row);
      }

      return projected;
    });
  }

  const connection = {
    query: vi.fn(async (statement: string) => {
      if (statement === "SELECT name FROM sqlite_master WHERE type = 'table'") {
        return { values: state.tables.map((name) => ({ name })) };
      }

      const pragmaMatch = statement.match(/^PRAGMA table_info\("([^"]+)"\)$/);
      if (pragmaMatch) {
        const table = pragmaMatch[1];
        return { values: (state.columns[table] ?? []).map((name) => ({ name })) };
      }

      const tableMatch = statement.match(/FROM "([^"]+)"/);
      if (tableMatch) {
        return { values: projectSelectedRows(statement, state.rows[tableMatch[1]] ?? []) };
      }

      return { values: [] };
    }),
  };

  return {
    state,
    connection,
    openReadOnly: vi.fn(async () => {
      if (state.openError) throw state.openError;
      return { connection };
    }),
    closeConnection: vi.fn(async () => undefined),
    prepareiOSDatabases: vi.fn(async () => ({ coreDataPresent: true, copied: false, limits: [] })),
  };
});

vi.mock('./db', () => ({
  openReadOnly: mocks.openReadOnly,
  closeConnection: mocks.closeConnection,
}));

vi.mock('./ios-migration-setup', () => ({
  prepareiOSDatabases: mocks.prepareiOSDatabases,
}));

import { readAlliOSCoreData, readCoreDataEntities } from './ios-coredata-reader.js';

function seedFixture(options?: { includeSparTarget?: boolean; includeRecurrenceInterval?: boolean }) {
  const includeSparTarget = options?.includeSparTarget ?? true;
  const includeRecurrenceInterval = options?.includeRecurrenceInterval ?? true;

  mocks.state.openError = undefined;
  mocks.state.tables = [
    'Z_METADATA',
    'Z_PRIMARYKEY',
    'Z_MODELCACHE',
    'ZCATEGORY',
    'ZACCOUNTING',
    'ZRECURRINGACCOUNTING',
    'ZSHORTCUT',
    ...(includeSparTarget ? ['ZSPARTARGET'] : []),
  ];
  mocks.state.columns = {
    ZCATEGORY: ['Z_PK', 'ZTITLE', 'ZIMAGENUMBER', 'ZISINCOMECATEGORY', 'ZISSTANDARD', 'ZISVISIBLE'],
    ZACCOUNTING: [
      'Z_PK',
      'ZAMOUNT',
      'ZDATE',
      'ZTITLE',
      'ZCATEGORY',
      ...(includeSparTarget ? ['ZSPARTARGET'] : []),
    ],
    ZRECURRINGACCOUNTING: [
      'Z_PK',
      'ZAMOUNT',
      'ZDAYOFMONTH',
      'ZLASTSAVED',
      ...(includeRecurrenceInterval ? ['ZRECURRENCEINTERVAL'] : []),
      'ZTITLE',
      'ZCATEGORY',
    ],
    ZSHORTCUT: ['Z_PK', 'ZAMOUNT', 'ZTITLE', 'ZCATEGORY'],
    ...(includeSparTarget
      ? { ZSPARTARGET: ['Z_PK', 'ZTITLE', 'ZAMOUNT', 'ZDATE', 'ZMONTHAMOUNT', 'ZSTARTDATE', 'ZCATEGORY'] }
      : {}),
  };
  mocks.state.rows = {
    ZCATEGORY: [
      {
        Z_PK: 10,
        ZTITLE: 'Essen',
        ZIMAGENUMBER: 3,
        ZISINCOMECATEGORY: 0,
        ZISSTANDARD: 1,
        ZISVISIBLE: 1,
      },
      {
        Z_PK: 11,
        ZTITLE: 'Side Project',
        ZIMAGENUMBER: 5,
        ZISINCOMECATEGORY: 1,
        ZISSTANDARD: 0,
        ZISVISIBLE: 1,
      },
    ],
    ZACCOUNTING: [
      {
        Z_PK: 20,
        ZAMOUNT: 1234,
        ZDATE: 0,
        ZTITLE: 'Lunch',
        ZCATEGORY: 10,
        ...(includeSparTarget ? { ZSPARTARGET: 30 } : {}),
      },
    ],
    ZRECURRINGACCOUNTING: [
      {
        Z_PK: 40,
        ZAMOUNT: 200,
        ZDAYOFMONTH: 15,
        ZLASTSAVED: 0,
        ...(includeRecurrenceInterval ? { ZRECURRENCEINTERVAL: 2 } : {}),
        ZTITLE: 'Every two months',
        ZCATEGORY: 11,
      },
    ],
    ZSHORTCUT: [
      {
        Z_PK: 50,
        ZAMOUNT: 750,
        ZTITLE: 'Template',
        ZCATEGORY: 10,
      },
    ],
    ...(includeSparTarget
      ? {
          ZSPARTARGET: [
            {
              Z_PK: 30,
              ZTITLE: 'Bike',
              ZAMOUNT: 10000,
              ZDATE: 86400,
              ZMONTHAMOUNT: 500,
              ZSTARTDATE: 0,
              ZCATEGORY: 10,
            },
          ],
        }
      : {}),
  };
}

function seedRenamedColumnFixture() {
  mocks.state.openError = undefined;
  mocks.state.tables = [
    'Z_METADATA',
    'Z_PRIMARYKEY',
    'Z_MODELCACHE',
    'ZCATEGORY',
    'ZACCOUNTING',
    'ZRECURRINGACCOUNTING',
    'ZSHORTCUT',
  ];
  mocks.state.columns = {
    ZCATEGORY: ['Z_PK', 'ZTITEL', 'ZBILDNUMMER', 'ZISTEINNAHME', 'ZSTANDARD'],
    ZACCOUNTING: ['Z_PK', 'ZWERT', 'ZDATUM', 'ZNOTIZ', 'ZCATEGORY'],
    ZRECURRINGACCOUNTING: [
      'Z_PK',
      'ZWERT',
      'ZWIEDERKEHRENDERTAG',
      'ZZULETZTGESPEICHERT',
      'ZNOTIZ',
      'ZCATEGORY',
    ],
    ZSHORTCUT: ['Z_PK', 'ZWERT', 'ZNOTIZ', 'ZCATEGORY'],
  };
  mocks.state.rows = {
    ZCATEGORY: [
      {
        Z_PK: 10,
        ZTITEL: 'Essen',
        ZBILDNUMMER: 3,
        ZISTEINNAHME: 0,
        ZSTANDARD: 1,
      },
    ],
    ZACCOUNTING: [
      {
        Z_PK: 20,
        ZWERT: 444,
        ZDATUM: 0,
        ZNOTIZ: 'Alias Lunch',
        ZCATEGORY: 10,
      },
    ],
    ZRECURRINGACCOUNTING: [
      {
        Z_PK: 40,
        ZWERT: 200,
        ZWIEDERKEHRENDERTAG: 15,
        ZZULETZTGESPEICHERT: 0,
        ZNOTIZ: 'Alias recurring',
        ZCATEGORY: 10,
      },
    ],
    ZSHORTCUT: [
      {
        Z_PK: 50,
        ZWERT: 750,
        ZNOTIZ: 'Alias template',
        ZCATEGORY: 10,
      },
    ],
  };
}

function seedV1Fixture() {
  mocks.state.openError = undefined;
  mocks.state.tables = [
    'Z_METADATA',
    'Z_PRIMARYKEY',
    'Z_MODELCACHE',
    'ZKATEGORIEN',
    'ZAUSGABEKATEGORIEN',
    'ZEINNAHME',
    'ZAUSGABE',
    'ZBETRAEGE',
    'ZWIEDERKEHREND',
    'ZVORLAGEN',
  ];
  mocks.state.columns = {
    ZKATEGORIEN: ['Z_PK', 'ZTITLE', 'ZBILDNUMMER', 'ZSTANDARD', 'ZAKTIV'],
    ZAUSGABEKATEGORIEN: ['Z_PK', 'ZTITLE', 'ZBILDNUMMER', 'ZSTANDARD', 'ZAKTIV'],
    ZEINNAHME: ['Z_PK', 'ZDATUM'],
    ZAUSGABE: ['Z_PK', 'ZDATUM'],
    ZBETRAEGE: ['Z_PK', 'ZWERT', 'ZDATUM', 'ZNOTIZ', 'ZTITEL', 'ZBILDNUMMER', 'ZAUSGABE', 'ZEINNAHME'],
    ZWIEDERKEHREND: [
      'Z_PK',
      'ZWERT',
      'ZWIEDERKEHRENDERTAG',
      'ZZULETZTGESPEICHERT',
      'ZNOTIZ',
      'ZTITEL',
      'ZBILDNUMMER',
      'ZISTEINNAHME',
    ],
    ZVORLAGEN: ['Z_PK', 'ZWERT', 'ZNOTIZ', 'ZTITEL', 'ZBILDNUMMER', 'ZISTEINNAHME'],
  };
  mocks.state.rows = {
    ZKATEGORIEN: [
      {
        Z_PK: 1,
        ZTITLE: 'Lohn',
        ZBILDNUMMER: 2,
        ZSTANDARD: 1,
        ZAKTIV: 1,
      },
    ],
    ZAUSGABEKATEGORIEN: [
      {
        Z_PK: 2,
        ZTITLE: 'Essen',
        ZBILDNUMMER: 3,
        ZSTANDARD: 1,
        ZAKTIV: 1,
      },
    ],
    ZEINNAHME: [
      {
        Z_PK: 100,
        ZDATUM: '02.01.2014',
      },
    ],
    ZAUSGABE: [
      {
        Z_PK: 101,
        ZDATUM: '03.01.2014',
      },
    ],
    ZBETRAEGE: [
      {
        Z_PK: 200,
        ZWERT: 500000,
        ZNOTIZ: 'Salary',
        ZTITEL: 'Lohn',
        ZBILDNUMMER: 2,
        ZEINNAHME: 100,
      },
      {
        Z_PK: 201,
        ZWERT: 1234,
        ZNOTIZ: 'Lunch',
        ZTITEL: 'Essen',
        ZBILDNUMMER: 3,
        ZAUSGABE: 101,
      },
    ],
    ZWIEDERKEHREND: [
      {
        Z_PK: 300,
        ZWERT: 990,
        ZWIEDERKEHRENDERTAG: 5,
        ZZULETZTGESPEICHERT: 0,
        ZNOTIZ: 'Monthly lunch',
        ZTITEL: 'Essen',
        ZBILDNUMMER: 3,
        ZISTEINNAHME: 0,
      },
    ],
    ZVORLAGEN: [
      {
        Z_PK: 400,
        ZWERT: 750,
        ZNOTIZ: 'Quick lunch',
        ZTITEL: 'Essen',
        ZBILDNUMMER: 3,
        ZISTEINNAHME: 0,
      },
    ],
  };
}

describe('readCoreDataEntities', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.prepareiOSDatabases.mockResolvedValue({ coreDataPresent: true, copied: false, limits: [] });
    seedFixture();
  });

  it('maps active Core Data v4 Z_ tables into a local migration payload', async () => {
    const payload = await readCoreDataEntities();

    expect(payload.accounts?.[0]).toMatchObject({
      name: 'Mein Konto',
      initials: 'MK',
      legacyId: 0,
      legacySource: 'core_data',
    });

    expect(payload.categories).toEqual([
      expect.objectContaining({
        id: 'expense-food',
        name: 'category_food',
        type: 'expense',
        icon: 'lucide:food',
        isDefault: true,
        legacySource: 'core_data',
      }),
      expect.objectContaining({
        name: 'Side Project',
        type: 'income',
        icon: 'lucide:briefcase',
        isDefault: false,
        legacySource: 'core_data',
      }),
    ]);

    expect(payload.savingGoals?.[0]).toMatchObject({
      name: 'Bike',
      targetAmount: 100,
      monthlyAmount: 5,
      deadline: '2001-01-02T00:00:00.000Z',
      categoryId: 'expense-food',
      legacySource: 'core_data',
    });

    expect(payload.transactions?.[0]).toMatchObject({
      amount: 12.34,
      date: '2001-01-01T00:00:00.000Z',
      title: 'Lunch',
      categoryId: 'expense-food',
      type: 'expense',
      savingsGoalId: payload.savingGoals?.[0].id,
      legacySource: 'core_data',
    });

    expect(payload.recurringEntries?.[0]).toMatchObject({
      amount: 2,
      frequency: 'every_2_months',
      startDate: '2001-01-01T00:00:00.000Z',
      type: 'income',
      dayOfMonth: 15,
      legacySource: 'core_data',
    });

    expect(payload.templates?.[0]).toMatchObject({
      name: 'Template',
      amount: 7.5,
      categoryId: 'expense-food',
      type: 'expense',
      legacySource: 'core_data',
    });
  });

  it('handles v2/v3 schemas with missing optional tables and columns', async () => {
    seedFixture({ includeSparTarget: false, includeRecurrenceInterval: false });

    const payload = await readCoreDataEntities();
    const statements = mocks.connection.query.mock.calls.map(([statement]) => statement);
    const transactionSelect = statements.find((statement) => /FROM "ZACCOUNTING"/.test(statement));
    const recurringSelect = statements.find((statement) => /FROM "ZRECURRINGACCOUNTING"/.test(statement));

    expect(payload.savingGoals).toEqual([]);
    expect(payload.transactions?.[0].savingsGoalId).toBeUndefined();
    expect(payload.recurringEntries?.[0].frequency).toBe('monthly');
    expect(transactionSelect).toContain('NULL AS "ZSPARTARGET"');
    expect(recurringSelect).toContain('1 AS "ZRECURRENCEINTERVAL"');
  });

  it('maps native UserDefaults limits to matching and custom categories', async () => {
    const payload = await readCoreDataEntities({
      legacyLimits: [
        {
          name: 'Essen',
          categoryTitle: 'Essen',
          amount: 30000,
          createdAt: Date.UTC(2024, 2, 31),
        },
        {
          name: 'Board Games',
          categoryTitle: 'Board Games',
          amount: 1200,
          createdAt: Date.UTC(2024, 3, 1),
        },
      ],
    });

    expect(payload.limits).toEqual([
      expect.objectContaining({
        categoryId: 'expense-food',
        amount: 300,
        date: '2024-03-31T00:00:00.000Z',
        legacySource: 'core_data',
      }),
      expect.objectContaining({
        amount: 12,
        date: '2024-04-01T00:00:00.000Z',
        legacySource: 'core_data',
      }),
    ]);
    expect(payload.categories).toEqual(expect.arrayContaining([
      expect.objectContaining({
        name: 'Board Games',
        type: 'expense',
        isDefault: false,
        legacySource: 'core_data',
      }),
    ]));
    expect(payload.limits?.[1].categoryId).toBe(
      payload.categories?.find((category) => category.name === 'Board Games')?.id
    );
  });

  it('projects renamed Core Data columns into the canonical migration aliases', async () => {
    seedRenamedColumnFixture();

    const payload = await readCoreDataEntities();

    expect(payload.categories?.[0]).toMatchObject({
      id: 'expense-food',
      name: 'category_food',
      type: 'expense',
      icon: 'lucide:food',
      isDefault: true,
    });
    expect(payload.transactions?.[0]).toMatchObject({
      amount: 4.44,
      date: '2001-01-01T00:00:00.000Z',
      title: 'Alias Lunch',
      categoryId: 'expense-food',
      type: 'expense',
    });
    expect(payload.recurringEntries?.[0]).toMatchObject({
      amount: 2,
      name: 'Alias recurring',
      dayOfMonth: 15,
      frequency: 'monthly',
    });
    expect(payload.templates?.[0]).toMatchObject({
      name: 'Alias template',
      amount: 7.5,
      categoryId: 'expense-food',
    });
  });

  it('does not invent a saving goal deadline when the Core Data date column is absent', async () => {
    mocks.state.columns.ZSPARTARGET = [
      'Z_PK',
      'ZTITLE',
      'ZAMOUNT',
      'ZMONTHAMOUNT',
      'ZSTARTDATE',
      'ZCATEGORY',
    ];
    mocks.state.rows.ZSPARTARGET = [
      {
        Z_PK: 30,
        ZTITLE: 'Bike',
        ZAMOUNT: 10000,
        ZMONTHAMOUNT: 500,
        ZSTARTDATE: 0,
        ZCATEGORY: 10,
      },
    ];

    const payload = await readCoreDataEntities();

    expect(payload.savingGoals?.[0]).toMatchObject({
      name: 'Bike',
      deadline: '',
      creationDate: '2001-01-01T00:00:00.000Z',
    });
  });

  it('normalizes invalid recurring days before reconstructing missing start dates', async () => {
    mocks.state.rows.ZRECURRINGACCOUNTING = [
      {
        Z_PK: 40,
        ZAMOUNT: 200,
        ZDAYOFMONTH: 0,
        ZRECURRENCEINTERVAL: 1,
        ZTITLE: 'Bad day',
        ZCATEGORY: 11,
      },
    ];

    const payload = await readCoreDataEntities();

    expect(payload.recurringEntries?.[0]).toMatchObject({
      name: 'Bad day',
      dayOfMonth: 1,
    });
  });

  it('does not query Core Data internal metadata tables', async () => {
    await readCoreDataEntities();

    const statements = mocks.connection.query.mock.calls.map(([statement]) => statement);
    expect(statements).not.toContain('PRAGMA table_info("Z_METADATA")');
    expect(statements).not.toContain('PRAGMA table_info("Z_PRIMARYKEY")');
    expect(statements).not.toContain('PRAGMA table_info("Z_MODELCACHE")');
    expect(statements.some((statement) => /FROM "Z_METADATA"/.test(statement))).toBe(false);
  });

  it('returns an empty object when the Core Data database is absent', async () => {
    mocks.state.openError = new Error('unable to open database file');

    await expect(readCoreDataEntities()).resolves.toEqual({});
    expect(mocks.closeConnection).not.toHaveBeenCalled();
  });

  it('does not hide opened-database schema errors as absent files', async () => {
    mocks.state.openError = new Error('no such table: ZACCOUNTING');

    await expect(readCoreDataEntities()).rejects.toThrow('no such table: ZACCOUNTING');
    expect(mocks.closeConnection).not.toHaveBeenCalled();
  });

  it('warns when malformed Core Data rows are skipped', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    mocks.state.rows.ZACCOUNTING = [
      {
        Z_PK: 20,
        ZAMOUNT: 1234,
        ZDATE: 0,
        ZCATEGORY: 999,
      },
    ];

    const payload = await readCoreDataEntities();

    expect(payload.transactions).toEqual([]);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('Skipped Core Data transaction row 20'));
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('unknown ZCATEGORY 999'));

    warn.mockRestore();
  });

  it('maps raw v1 German Core Data tables using legacy title and image category resolution', async () => {
    seedV1Fixture();

    const payload = await readCoreDataEntities({
      legacyLimits: [
        {
          name: 'Essen',
          categoryTitle: 'Essen',
          amount: 45000,
          createdAt: Date.UTC(2014, 0, 1),
        },
      ],
    });

    expect(payload.categories).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: 'income-salary',
        name: 'category_salary',
        type: 'income',
        legacySource: 'core_data',
      }),
      expect.objectContaining({
        id: 'expense-food',
        name: 'category_food',
        type: 'expense',
        legacySource: 'core_data',
      }),
    ]));
    expect(payload.transactions).toEqual([
      expect.objectContaining({
        title: 'Salary',
        amount: 5000,
        type: 'income',
        categoryId: 'income-salary',
        date: '2014-01-02T00:00:00.000Z',
        legacySource: 'core_data',
      }),
      expect.objectContaining({
        title: 'Lunch',
        amount: 12.34,
        type: 'expense',
        categoryId: 'expense-food',
        date: '2014-01-03T00:00:00.000Z',
        legacySource: 'core_data',
      }),
    ]);
    expect(payload.recurringEntries?.[0]).toMatchObject({
      name: 'Monthly lunch',
      amount: 9.9,
      frequency: 'monthly',
      startDate: '2001-01-01T00:00:00.000Z',
      categoryId: 'expense-food',
      dayOfMonth: 5,
      legacySource: 'core_data',
    });
    expect(payload.templates?.[0]).toMatchObject({
      name: 'Quick lunch',
      amount: 7.5,
      categoryId: 'expense-food',
      legacySource: 'core_data',
    });
    expect(payload.savingGoals).toEqual([]);
    expect(payload.limits?.[0]).toMatchObject({
      categoryId: 'expense-food',
      amount: 450,
      legacySource: 'core_data',
    });
  });

  it('warns on malformed v1 date strings and falls back to row timestamps', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    seedV1Fixture();
    mocks.state.rows.ZEINNAHME = [{ Z_PK: 100, ZDATUM: '31.02.2014' }];
    mocks.state.rows.ZBETRAEGE = [
      {
        Z_PK: 200,
        ZWERT: 500000,
        ZDATUM: 0,
        ZNOTIZ: 'Salary',
        ZTITEL: 'Lohn',
        ZBILDNUMMER: 2,
        ZEINNAHME: 100,
      },
    ];

    const payload = await readCoreDataEntities();

    expect(payload.transactions?.[0]).toMatchObject({
      title: 'Salary',
      date: '2001-01-01T00:00:00.000Z',
    });
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('Skipped malformed Core Data v1 date'));

    warn.mockRestore();
  });

  it('prefers v2-v4 tables when modern and raw v1 Core Data tables both exist', async () => {
    mocks.state.tables.push('ZBETRAEGE');
    mocks.state.columns.ZBETRAEGE = ['Z_PK', 'ZWERT', 'ZNOTIZ'];
    mocks.state.rows.ZBETRAEGE = [{ Z_PK: 999, ZWERT: 999, ZNOTIZ: 'Old row' }];

    const payload = await readCoreDataEntities();

    expect(payload.transactions).toHaveLength(1);
    expect(payload.transactions?.[0]).toMatchObject({ title: 'Lunch' });
  });

  it('calls the native iOS setup before reading Core Data through the high-level entrypoint', async () => {
    mocks.prepareiOSDatabases.mockResolvedValue({
      coreDataPresent: true,
      copied: false,
      limits: [
        {
          name: 'Essen',
          categoryTitle: 'Essen',
          amount: 30000,
          createdAt: Date.UTC(2024, 2, 31),
        },
      ],
    });

    const payload = await readAlliOSCoreData();

    expect(mocks.prepareiOSDatabases).toHaveBeenCalledTimes(1);
    expect(payload.limits?.[0]).toMatchObject({
      categoryId: 'expense-food',
      amount: 300,
    });
  });

  it('skips the high-level Core Data reader when the native setup reports no database', async () => {
    mocks.prepareiOSDatabases.mockResolvedValue({
      coreDataPresent: false,
      copied: false,
      limits: [],
    });

    await expect(readAlliOSCoreData()).resolves.toEqual({});
    expect(mocks.openReadOnly).not.toHaveBeenCalled();
  });
});
