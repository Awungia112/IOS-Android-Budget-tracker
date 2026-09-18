/**
 * Helpers for ensuring a restored online account ends up with categories.
 *
 * Extracted from BudgetContext.tsx so the retry + seed logic is unit-testable
 * without mounting the full React context. All external dependencies are
 * injected so tests can mock them directly.
 */

import type { SyncState, TriggerSyncParams } from '@budget/core';

export interface SyncEngineLike {
  getState(): SyncState;
  triggerSync(params: TriggerSyncParams): Promise<void>;
}

export interface BudgetServiceLike {
  /** Creates any default categories the account is missing. Returns true when it created some. */
  seedDefaultCategories(
    accountId: string,
    options?: { logCommand?: boolean },
  ): Promise<boolean>;
  /** Re-points rows that reference a stable default category id. Returns the row count. */
  repairDefaultCategoryReferences(accountId: string): Promise<number>;
}

export interface PullUntilSyncedDeps {
  syncEngine: SyncEngineLike;
  /**
   * Returns the base params (client, keys, executeCommand) for a given account.
   * localAccountId and role are injected separately so each account gets its own
   * replay handler while the rest of the params are shared across attempts.
   */
  triggerSyncParams: (
    localAccountId: string,
    role: 'owner' | 'member' | undefined,
  ) => Omit<TriggerSyncParams, 'localAccountId' | 'role'>;
  sleep: (ms: number) => Promise<void> | Promise<unknown>;
  maxAttempts?: number;
}

/**
 * Attempt to pull an account's changelog until the shared sync engine reaches
 * SYNCED. Returns true only when *this account's* pull is confirmed to have
 * run and succeeded.
 *
 * triggerSync() is a silent no-op while the engine is SYNCING for another
 * account, and returns without applying anything on OFFLINE or ERROR. Counting
 * rows after a pull that never ran is not a reliable "server has no categories"
 * signal — seeding against it is what originally produced 72 categories.
 */
export async function pullUntilSynced(
  localAccountId: string,
  role: 'owner' | 'member' | undefined,
  deps: PullUntilSyncedDeps,
): Promise<boolean> {
  const { syncEngine, triggerSyncParams, sleep, maxAttempts = 4 } = deps;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    // Wait for any concurrent sync on another account to finish first.
    for (let waited = 0; waited < 20 && syncEngine.getState() === 'SYNCING'; waited++) {
      await sleep(250);
    }

    const params = {
      ...triggerSyncParams(localAccountId, role),
      localAccountId,
      role,
    };
    // triggerSync() bails synchronously when the engine is already SYNCING, so
    // this read — with no await between it and the call — decides whether the
    // run that follows is ours. Without it, a SYNCED left behind by another
    // account's background sync reads as confirmation of a pull that never ran.
    const ranForUs = syncEngine.getState() !== 'SYNCING';
    try {
      await syncEngine.triggerSync(params);
    } catch (err) {
      console.warn('[restore] triggerSync threw during pull', err);
    }

    if (ranForUs && syncEngine.getState() === 'SYNCED') return true;
    // OFFLINE is only reported after a failed network call. Backing off and
    // retrying cannot succeed until connectivity returns, and each attempt
    // costs up to 5s of SYNCING wait plus its backoff.
    if (syncEngine.getState() === 'OFFLINE') return false;

    await sleep(400 * (attempt + 1));
  }
  return false;
}

export interface EnsureCategoriesDeps extends PullUntilSyncedDeps {
  budgetService: BudgetServiceLike;
}

/**
 * Pull a restored account's changelog and make sure it ends up with the full
 * set of default categories.
 *
 * The pull is unconditional: it carries the CREATE_ACCOUNT record with the
 * account's real name plus the rest of the account history, which a reused
 * orphan placeholder needs just as much as a freshly created account does.
 * Only the *seeding* decision depends on what the pull delivered.
 *
 * Normal path: the server's BULK_CREATE_CATEGORIES record arrives via the pull
 * and is applied by id, so nothing is missing and nothing is seeded.
 *
 * Confirmed pull, defaults missing: the server holds no category record for
 * them (it pre-dates the enqueue fix). Create the missing ones and log the
 * command so they reach the server rather than staying local to this device.
 * This is matched per (type, name), so an account that came back with only a
 * custom category is repaired instead of being left with a partial set.
 *
 * Unconfirmed pull: we do not know what the server holds, and seeding would
 * mint local-only ids that later transactions reference and push, leaving
 * other devices with dangling category references. The account is left as-is
 * and filled in by the post-sync guard in BudgetContext.triggerSync() as soon
 * as a sync succeeds.
 */
export async function ensureCategories(
  localAccountId: string,
  role: 'owner' | 'member' | undefined,
  deps: EnsureCategoriesDeps,
): Promise<void> {
  const { budgetService } = deps;

  const pullCompleted = await pullUntilSynced(localAccountId, role, deps);

  if (!pullCompleted) {
    console.warn(
      '[restore] Could not confirm the pull for account',
      localAccountId,
      '— leaving categories to the next successful sync.',
    );
    return;
  }

  // Members never seed. The set would be logged and pushed into an account
  // somebody else owns, and the owner — whose own categories are local-only,
  // which is why the server had none to deliver — would pull it back as a
  // second set beside their existing one. That is #501 all over again, on the
  // owner's device. An account's category set is the owner's to publish.
  if (role === 'member') {
    console.warn(
      '[restore] No default categories delivered for shared account',
      localAccountId,
      '— not seeding as a member; the owner publishes the set.',
    );
    return;
  }

  const seeded = await budgetService.seedDefaultCategories(localAccountId, {
    logCommand: true,
  });
  if (seeded) {
    console.warn(
      '[restore] Server did not deliver the full default category set for account',
      localAccountId,
      '— seeded the missing defaults.',
    );
  }

  // Replayed rows can still point at the stable default ids the install-time
  // populate used ('expense-books', …), which no category carries any more.
  const repaired = await budgetService.repairDefaultCategoryReferences(localAccountId);
  if (repaired > 0) {
    console.warn(
      '[restore] Re-pointed',
      repaired,
      'row(s) at the restored categories for account',
      localAccountId,
    );
  }
}
