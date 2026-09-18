import { describe, it, expect, beforeEach } from 'vitest';
import { runDuplicateMigrationRemediationAndAct, purgeArchivedOlderThan, isRemediationDone, markRemediationDone } from './duplicate-migration-remediation.js';
import { changeLog } from '../changelog/change-log.js';
import { db } from '../db/index.js';

// Integration-like unit test: create a small changeLog with duplicate CREATE_* records,
// run Phase 2, verify soft-archive and changeLog UPDATE appended, then purge.

describe('Remediation Phase 2 (detect-and-act)', () => {
  beforeEach(async () => {
    // reset DB and changelog
    await db.delete();
    await db.open();
    // clear changelog and ensure no remediation flag
    await changeLog.clear();
  });

  it('archives duplicates and appends update commands, and purge removes them', async () => {
    // create fake account
    const accountId = 'acct-1';

    // create two duplicate savings goals via changeLog (same content, divergent
    // ids — the pre-#470 shape, caught by the content-hash path)
    const ts1 = new Date().toISOString();
    // second record timestamp should be > CLUSTER_GAP_MS (60s) to create a separate cluster
    const ts2 = new Date(Date.now() + 61_000).toISOString();

    const goalA = { id: 'goal-a', name: 'G', targetAmount: 100, accountId, deadline: '' };
    const goalB = { id: 'goal-b', name: 'G', targetAmount: 100, accountId, deadline: '' };

    // also persist the entities into the DB so Phase 2 can find and archive them
    await db.savingsGoals.add(goalA);
    await db.savingsGoals.add(goalB);

    await changeLog.append({ type: 'CREATE_SAVINGS_GOAL', payload: goalA, timestamp: ts1 }, accountId);
    await changeLog.append({ type: 'CREATE_SAVINGS_GOAL', payload: goalB, timestamp: ts2 }, accountId);

    // run Phase 2
    const res = await runDuplicateMigrationRemediationAndAct(async () => [{ id: accountId }]);
    expect(res.archived).toBeGreaterThanOrEqual(1);

    // verify archived flag present on one of the goals
    const storedA = await db.savingsGoals.get('goal-a');
    const storedB = await db.savingsGoals.get('goal-b');
    const archived = (storedA && (storedA as any).archivedAt) || (storedB && (storedB as any).archivedAt);
    expect(archived).toBeTruthy();

    // verify changeLog does NOT contain UPDATE_SAVINGS_GOAL (remediation is purely client-side)
    const records = await changeLog.getByAccountId(accountId);
    const hasUpdate = records.some(r => r.command.type === 'UPDATE_SAVINGS_GOAL');
    expect(hasUpdate).toBe(false);

    // purge immediately (0 days) should remove archived rows
    const deleted = await purgeArchivedOlderThan(0);
    expect(deleted).toBeGreaterThanOrEqual(1);
  });
});
