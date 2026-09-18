/**
 * Unit tests for pullUntilSynced and ensureCategories.
 *
 * These are the riskiest functions in the #501 fix: a retry loop against a
 * shared singleton state machine. Tested in isolation with injected deps so
 * no React context or IndexedDB is needed.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { pullUntilSynced, ensureCategories } from './restoreCategories';
import type { EnsureCategoriesDeps, SyncEngineLike, BudgetServiceLike } from './restoreCategories';

// ---------------------------------------------------------------------------
// Factories
// ---------------------------------------------------------------------------

function makeSyncEngine(initialState = 'IDLE'): SyncEngineLike & { _state: string } {
  const engine = {
    _state: initialState,
    getState: vi.fn(() => engine._state as any),
    triggerSync: vi.fn().mockResolvedValue(undefined),
  };
  return engine;
}

/**
 * `seededSomething` mirrors what the real seedDefaultCategories returns: true
 * when defaults were missing and got created, false when the pull already
 * delivered the full set.
 */
function makeBudgetService(seededSomething = true, repairedRows = 0): BudgetServiceLike {
  return {
    seedDefaultCategories: vi.fn().mockResolvedValue(seededSomething),
    repairDefaultCategoryReferences: vi.fn().mockResolvedValue(repairedRows),
  };
}

const noopSleep = vi.fn().mockResolvedValue(undefined);

function makeDeps(
  engine: SyncEngineLike,
  budgetService: BudgetServiceLike,
): EnsureCategoriesDeps {
  return {
    syncEngine: engine,
    triggerSyncParams: (_localAccountId, _role) => ({ client: {} as any, userPublicKey: new Uint8Array(), userPrivateKey: new Uint8Array(), executeCommand: vi.fn() }),
    sleep: noopSleep,
    budgetService,
    maxAttempts: 3,
  };
}

// ---------------------------------------------------------------------------
// pullUntilSynced
// ---------------------------------------------------------------------------

describe('pullUntilSynced', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns true immediately when engine reaches SYNCED on first attempt', async () => {
    const engine = makeSyncEngine('IDLE');
    engine.triggerSync = vi.fn(async () => { engine._state = 'SYNCED'; });

    const result = await pullUntilSynced('acc-1', 'owner', makeDeps(engine, makeBudgetService()));

    expect(result).toBe(true);
    expect(engine.triggerSync).toHaveBeenCalledTimes(1);
  });

  it('retries and returns true when SYNCED on a later attempt', async () => {
    const engine = makeSyncEngine('IDLE');
    let calls = 0;
    engine.triggerSync = vi.fn(async () => {
      calls++;
      if (calls === 2) engine._state = 'SYNCED';
    });

    const result = await pullUntilSynced('acc-1', 'owner', makeDeps(engine, makeBudgetService()));

    expect(result).toBe(true);
    expect(engine.triggerSync).toHaveBeenCalledTimes(2);
  });

  it('returns false after exhausting all attempts without reaching SYNCED', async () => {
    const engine = makeSyncEngine('IDLE'); // stays IDLE

    const result = await pullUntilSynced('acc-1', 'owner', makeDeps(engine, makeBudgetService()));

    expect(result).toBe(false);
    expect(engine.triggerSync).toHaveBeenCalledTimes(3); // maxAttempts=3
  });

  it('waits for a SYNCING engine before each attempt', async () => {
    const engine = makeSyncEngine('SYNCING');
    let sleepCalls = 0;
    const trackingSleep = vi.fn(async () => {
      sleepCalls++;
      // After 3 sleep(250) calls the SYNCING wait exits; engine stays IDLE so
      // the attempt runs, then triggerSync sets SYNCED.
      if (sleepCalls === 3) engine._state = 'IDLE';
    });
    engine.triggerSync = vi.fn(async () => { engine._state = 'SYNCED'; });

    const deps = { ...makeDeps(engine, makeBudgetService()), sleep: trackingSleep };
    const result = await pullUntilSynced('acc-1', 'owner', deps);

    expect(result).toBe(true);
    // At least 3 sleep(250) calls from the SYNCING wait loop
    const waitCalls = (trackingSleep.mock.calls as number[][]).filter((args) => args[0] === 250);
    expect(waitCalls.length).toBeGreaterThanOrEqual(3);
  });

  it('does not accept another account\'s SYNCED as confirmation', async () => {
    // The engine never leaves SYNCING, so our triggerSync is a silent no-op.
    // The SYNCED it flips to belongs to whoever was already syncing — counting
    // rows against it is what produced 72 categories in the first place.
    const engine = makeSyncEngine('SYNCING');
    engine.triggerSync = vi.fn(async () => { engine._state = 'SYNCED'; });

    const deps = { ...makeDeps(engine, makeBudgetService()), maxAttempts: 1 };
    const result = await pullUntilSynced('acc-1', 'owner', deps);

    expect(result).toBe(false);
  });

  it('continues after triggerSync throws, does not propagate the error', async () => {
    const engine = makeSyncEngine('IDLE');
    let calls = 0;
    engine.triggerSync = vi.fn(async () => {
      calls++;
      if (calls === 1) throw new Error('network error');
      engine._state = 'SYNCED';
    });

    const result = await pullUntilSynced('acc-1', 'owner', makeDeps(engine, makeBudgetService()));

    expect(result).toBe(true);
    expect(engine.triggerSync).toHaveBeenCalledTimes(2);
  });

  it('passes localAccountId and role to triggerSync', async () => {
    const engine = makeSyncEngine('IDLE');
    engine.triggerSync = vi.fn(async () => { engine._state = 'SYNCED'; });

    await pullUntilSynced('acc-42', 'member', makeDeps(engine, makeBudgetService()));

    const call = (engine.triggerSync as any).mock.calls[0][0];
    expect(call.localAccountId).toBe('acc-42');
    expect(call.role).toBe('member');
  });

  it('gives up after one attempt when the engine reports OFFLINE', async () => {
    // Retrying cannot succeed until connectivity returns, and each attempt
    // costs up to 5s of SYNCING wait plus its backoff.
    const engine = makeSyncEngine('OFFLINE');

    const result = await pullUntilSynced('acc-1', 'owner', makeDeps(engine, makeBudgetService()));

    expect(result).toBe(false);
    expect(engine.triggerSync).toHaveBeenCalledTimes(1);
  });

  it('returns false when engine stays in ERROR state', async () => {
    const engine = makeSyncEngine('ERROR');
    const result = await pullUntilSynced('acc-1', 'owner', makeDeps(engine, makeBudgetService()));
    expect(result).toBe(false);
    expect(engine.triggerSync).toHaveBeenCalledTimes(3);
  });
});

// ---------------------------------------------------------------------------
// ensureCategories
// ---------------------------------------------------------------------------

describe('ensureCategories', () => {
  beforeEach(() => vi.clearAllMocks());

  it('pulls before deciding anything about categories', async () => {
    // A reused orphan placeholder arrives here with the categories the old
    // buggy restore seeded. It still needs the pull: that is what carries the
    // CREATE_ACCOUNT record with the real account name, and the history.
    const engine = makeSyncEngine('IDLE');
    engine.triggerSync = vi.fn(async () => { engine._state = 'SYNCED'; });
    const service = makeBudgetService(false);

    await ensureCategories('acc-1', 'owner', makeDeps(engine, service));

    expect(engine.triggerSync).toHaveBeenCalledTimes(1);
    const pullCall = (engine.triggerSync as any).mock.invocationCallOrder[0];
    const seedCall = (service.seedDefaultCategories as any).mock.invocationCallOrder[0];
    expect(pullCall).toBeLessThan(seedCall);
  });

  it('tops up the missing defaults after a confirmed pull', async () => {
    // Confirmed means we know what the server holds, so anything still absent
    // exists nowhere and must be created and pushed. Matching by (type, name)
    // happens inside seedDefaultCategories, so an account that came back with
    // only a custom category is repaired rather than left partial.
    const engine = makeSyncEngine('IDLE');
    const service = makeBudgetService(true);
    engine.triggerSync = vi.fn(async () => { engine._state = 'SYNCED'; });

    await ensureCategories('acc-1', 'owner', makeDeps(engine, service));

    expect(service.seedDefaultCategories).toHaveBeenCalledOnce();
    expect(service.seedDefaultCategories).toHaveBeenCalledWith('acc-1', { logCommand: true });
  });

  it('creates nothing when the pull delivered the full default set', async () => {
    const engine = makeSyncEngine('IDLE');
    const service = makeBudgetService(false); // nothing missing
    engine.triggerSync = vi.fn(async () => { engine._state = 'SYNCED'; });

    await ensureCategories('acc-1', 'owner', makeDeps(engine, service));

    // Still consulted — it is the component that knows what is missing — but
    // it reports that it created nothing.
    expect(service.seedDefaultCategories).toHaveBeenCalledOnce();
    await expect((service.seedDefaultCategories as any).mock.results[0].value).resolves.toBe(false);
  });

  it('repairs stale default category references after seeding', async () => {
    // Replayed transactions carry the origin device's stable default ids, which
    // the freshly seeded categories do not use.
    const engine = makeSyncEngine('IDLE');
    engine.triggerSync = vi.fn(async () => { engine._state = 'SYNCED'; });
    const service = makeBudgetService(true, 3);

    await ensureCategories('acc-1', 'owner', makeDeps(engine, service));

    expect(service.repairDefaultCategoryReferences).toHaveBeenCalledWith('acc-1');
    const seedCall = (service.seedDefaultCategories as any).mock.invocationCallOrder[0];
    const repairCall = (service.repairDefaultCategoryReferences as any).mock.invocationCallOrder[0];
    expect(seedCall).toBeLessThan(repairCall);
  });

  it('does not repair when the pull could not be confirmed', async () => {
    const engine = makeSyncEngine('OFFLINE');
    const service = makeBudgetService(true, 3);

    await ensureCategories('acc-1', 'owner', makeDeps(engine, service));

    expect(service.repairDefaultCategoryReferences).not.toHaveBeenCalled();
  });

  it('never seeds as a member, even when the server delivered nothing', async () => {
    // Seeding logs the set and pushes it. On a shared account that would
    // publish a second category set into an account somebody else owns, and
    // the owner pulls it back beside their own — #501, on the owner's device.
    const engine = makeSyncEngine('IDLE');
    engine.triggerSync = vi.fn(async () => { engine._state = 'SYNCED'; });
    const service = makeBudgetService(true, 0);

    await ensureCategories('acc-1', 'member', makeDeps(engine, service));

    expect(engine.triggerSync).toHaveBeenCalled(); // still pulls
    expect(service.seedDefaultCategories).not.toHaveBeenCalled();
  });

  it('still seeds as an owner', async () => {
    const engine = makeSyncEngine('IDLE');
    engine.triggerSync = vi.fn(async () => { engine._state = 'SYNCED'; });
    const service = makeBudgetService(true, 0);

    await ensureCategories('acc-1', 'owner', makeDeps(engine, service));

    expect(service.seedDefaultCategories).toHaveBeenCalledWith('acc-1', { logCommand: true });
  });

  it('does not seed when the pull could not be confirmed', async () => {
    // Zero knowledge of what the server holds. Seeding would mint local-only
    // ids that later transactions reference and push; the post-sync guard in
    // BudgetContext fills the account in once a sync actually succeeds.
    const engine = makeSyncEngine('OFFLINE'); // never SYNCED
    const service = makeBudgetService(true);

    await ensureCategories('acc-1', 'owner', makeDeps(engine, service));

    expect(service.seedDefaultCategories).not.toHaveBeenCalled();
  });

  it('does not seed when the pull errors on every attempt', async () => {
    const engine = makeSyncEngine('IDLE');
    engine.triggerSync = vi.fn().mockRejectedValue(new Error('timeout'));
    const service = makeBudgetService(true);

    await ensureCategories('acc-1', 'owner', makeDeps(engine, service));

    expect(service.seedDefaultCategories).not.toHaveBeenCalled();
  });

  it('passes the correct accountId to seedDefaultCategories', async () => {
    const engine = makeSyncEngine('IDLE');
    engine.triggerSync = vi.fn(async () => { engine._state = 'SYNCED'; });
    const service = makeBudgetService(true);

    await ensureCategories('specific-account-id', undefined, makeDeps(engine, service));

    expect(service.seedDefaultCategories).toHaveBeenCalledWith('specific-account-id', { logCommand: true });
  });
});
