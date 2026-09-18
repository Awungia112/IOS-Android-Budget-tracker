import { describe, expect, it } from 'vitest';
import {
  isMigrationInProgress,
  withExclusiveDatabaseOperation,
  withMigrationInProgress,
} from './migration-activity.js';

describe('migration activity', () => {
  it('is only in progress while a migration runs', async () => {
    expect(isMigrationInProgress()).toBe(false);

    let duringRun = false;
    await withMigrationInProgress(async () => {
      duringRun = isMigrationInProgress();
    });

    expect(duringRun).toBe(true);
    expect(isMigrationInProgress()).toBe(false);
  });

  it('ends when the migration fails', async () => {
    await expect(
      withMigrationInProgress(async () => {
        throw new Error('import failed');
      }),
    ).rejects.toThrow('import failed');

    expect(isMigrationInProgress()).toBe(false);
  });

  it('stays in progress until overlapping migrations have all finished', async () => {
    let finishFirst!: () => void;
    const first = withMigrationInProgress(
      () => new Promise<void>((resolve) => { finishFirst = resolve; }),
    );

    await withMigrationInProgress(async () => undefined);
    expect(isMigrationInProgress()).toBe(true);

    finishFirst();
    await first;
    expect(isMigrationInProgress()).toBe(false);
  });

  it('serializes database-mutating workflows', async () => {
    let releaseFirst!: () => void;
    let firstRunning = false;
    let secondStarted = false;

    const first = withExclusiveDatabaseOperation(async () => {
      firstRunning = true;
      await new Promise<void>((resolve) => { releaseFirst = resolve; });
      firstRunning = false;
    });

    const second = withExclusiveDatabaseOperation(async () => {
      secondStarted = true;
      expect(firstRunning).toBe(false);
    });

    await Promise.resolve();
    expect(secondStarted).toBe(false);

    releaseFirst();
    await Promise.all([first, second]);
    expect(secondStarted).toBe(true);
  });
});
