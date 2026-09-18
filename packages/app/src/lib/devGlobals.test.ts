import { describe, expect, it } from 'vitest';
import { db, resetMigrationFlag } from '@budget/core';
import { installDevGlobals } from './devGlobals';

describe('installDevGlobals', () => {
  it('exposes the db and migration reset helper', () => {
    const target: Window = {} as Window;

    installDevGlobals(target);

    expect(target.db).toBe(db);
    expect(target.__resetMigration).toBe(resetMigrationFlag);
  });
});

