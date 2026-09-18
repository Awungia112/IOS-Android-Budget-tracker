/**
 * One-time device-local cleanup for the MR #501 duplicate-category bug.
 *
 * Affected devices have 72 default categories (each name twice) after a
 * logout → sign-in cycle. The loser set is identified exactly: the IDs in
 * the local BULK_CREATE_CATEGORIES changelog record are the locally-seeded
 * duplicates; categories with the same (type, name) but a different ID are
 * the server-authoritative keepers. All references are reassigned before
 * losers are soft-archived.
 *
 * The existing duplicate-migration-remediation cannot handle this case — it
 * requires two changelog clusters, inverts keeper/loser polarity for this
 * scenario, and never reassigns references.
 */

import { changeLog } from '../changelog/change-log.js';
import { db } from '../db/index.js';
import type { Category, Transaction, Limit, Template, RecurringItem, SavingsGoal } from '../types/index.js';
import { Preferences } from '@capacitor/preferences';

export const RESTORE_DUPLICATE_REMEDIATION_DONE_FLAG_KEY =
  'restore_duplicate_category_remediation_done';

const LOG = '[RestoreDuplicateRemediation]';

// ─── Done-flag helpers ────────────────────────────────────────────────────────

export async function isRestoreDuplicateRemediationDone(): Promise<boolean> {
  const { value } = await Preferences.get({
    key: RESTORE_DUPLICATE_REMEDIATION_DONE_FLAG_KEY,
  });
  return value === 'true';
}

export async function markRestoreDuplicateRemediationDone(): Promise<void> {
  await Preferences.set({
    key: RESTORE_DUPLICATE_REMEDIATION_DONE_FLAG_KEY,
    value: 'true',
  });
}

// ─── Result types ─────────────────────────────────────────────────────────────

export interface RestoreDuplicateRemediationAccountResult {
  accountId: string;
  /** true when at least one loser was archived */
  repaired: boolean;
  /** number of loser categories archived */
  losersArchived: number;
  /** number of entity references reassigned across all tables */
  referencesReassigned: number;
  /** number of loser/keeper pairs that failed (DB error) — done-flag withheld when > 0 */
  pairsFailed: number;
  /** error message when the entire account failed (exception during remediation) */
  error?: string;
}

export interface RestoreDuplicateRemediationResult {
  accountsScanned: number;
  accountsRepaired: number;
  totalLosersArchived: number;
  totalReferencesReassigned: number;
  /** true when every pair across every account succeeded — caller should only set done-flag when true */
  fullySuccessful: boolean;
  accountResults: RestoreDuplicateRemediationAccountResult[];
}

// ─── Per-account entity snapshot (loaded once per account) ───────────────────

interface AccountSnapshot {
  transactions: Transaction[];
  limits: Limit[];
  templates: Template[];
  recurringItems: RecurringItem[];
  savingsGoals: SavingsGoal[];
}

async function loadAccountSnapshot(accountId: string): Promise<AccountSnapshot> {
  const [transactions, limits, templates, recurringItems, savingsGoals] =
    await Promise.all([
      db.transactions.where('accountId').equals(accountId).toArray(),
      db.limits.where('accountId').equals(accountId).toArray(),
      db.templates.where('accountId').equals(accountId).toArray(),
      db.recurringItems.where('accountId').equals(accountId).toArray(),
      db.savingsGoals.where('accountId').equals(accountId).toArray(),
    ]);

  return { transactions, limits, templates, recurringItems, savingsGoals };
}

// ─── Core implementation ──────────────────────────────────────────────────────

/**
 * Run the restore-duplicate category remediation for all accounts.
 *
 * Returns a result object whose `fullySuccessful` flag indicates whether the
 * caller should persist the done-flag. The caller (BudgetContext) is responsible
 * for calling `markRestoreDuplicateRemediationDone()` only when `fullySuccessful`
 * is true, so that partial runs are retried on the next launch.
 *
 * @param getAccounts - injectable getter so tests can supply their own account list
 */
export async function runRestoreDuplicateCategoryRemediation(
  getAccounts: () => Promise<Array<{ id: string }>>,
): Promise<RestoreDuplicateRemediationResult> {
  const result: RestoreDuplicateRemediationResult = {
    accountsScanned: 0,
    accountsRepaired: 0,
    totalLosersArchived: 0,
    totalReferencesReassigned: 0,
    fullySuccessful: true,
    accountResults: [],
  };

  const accounts = await getAccounts();
  console.log(LOG, 'Scanning', accounts.length, 'account(s)');

  for (const account of accounts) {
    try {
      const accountResult = await remediateAccount(account.id);
      result.accountsScanned++;
      result.accountResults.push(accountResult);

      if (accountResult.repaired) {
        result.accountsRepaired++;
        result.totalLosersArchived += accountResult.losersArchived;
        result.totalReferencesReassigned += accountResult.referencesReassigned;
      }

      if (accountResult.pairsFailed > 0) {
        result.fullySuccessful = false;
      }
    } catch (err) {
      // Wrap per-account so an exception from changeLog.getByAccountId or the
      // categories query doesn't abort the entire sweep. Log the error and mark
      // this account as failed, then continue with the next account.
      const errorMessage = err instanceof Error ? err.message : String(err);
      console.warn(LOG, 'Exception while remediating account', account.id, err);
      result.accountsScanned++;
      result.accountResults.push({
        accountId: account.id,
        repaired: false,
        losersArchived: 0,
        referencesReassigned: 0,
        pairsFailed: 1, // Treat the exception as a failed pair
        error: errorMessage,
      });
      result.fullySuccessful = false;
    }
  }

  console.log(
    LOG,
    'Complete:',
    result.accountsScanned, 'scanned,',
    result.accountsRepaired, 'repaired,',
    result.totalLosersArchived, 'losers archived,',
    result.totalReferencesReassigned, 'references reassigned,',
    result.fullySuccessful ? 'fully successful' : 'PARTIAL — will retry on next launch',
  );

  return result;
}

// ─── Per-account logic ────────────────────────────────────────────────────────

async function remediateAccount(
  accountId: string,
): Promise<RestoreDuplicateRemediationAccountResult> {
  const noop: RestoreDuplicateRemediationAccountResult = {
    accountId,
    repaired: false,
    losersArchived: 0,
    referencesReassigned: 0,
    pairsFailed: 0,
  };

  // Step 1: find the local BULK_CREATE_CATEGORIES record.
  const changeRecords = await changeLog.getByAccountId(accountId);
  const bulkCreateRecord = changeRecords.find(
    (r) => r.command.type === 'BULK_CREATE_CATEGORIES',
  );

  if (!bulkCreateRecord) {
    console.log(LOG, accountId, '— no BULK_CREATE_CATEGORIES record, skipping');
    return noop;
  }

  const payloadCategories = (bulkCreateRecord.command.payload as { categories: Category[] }).categories;

  // Safety guard: the ticket premise is "the only local record is the 36 defaults",
  // but BULK_CREATE_CATEGORIES has four emit sites (budget.service.ts:135, 320, 497, 809).
  // bulkCreateCategories() at :486 is a user-facing API that can mint isDefault: false
  // categories. Only treat the payload IDs as losers if every entry is a default category.
  const allDefault = payloadCategories.every((c) => c.isDefault);
  if (!allDefault) {
    console.log(
      LOG, accountId,
      '— BULK_CREATE record contains non-default categories, skipping (not the MR #501 bug)',
    );
    return noop;
  }

  const loserIds = new Set<string>(payloadCategories.map((c) => c.id));

  console.log(LOG, accountId, '— loser set size:', loserIds.size);

  // Step 2: load all active categories for the account.
  const allCategories = await db.categories
    .where('accountId')
    .equals(accountId)
    .toArray();

  const activeCategories = allCategories.filter((c) => !c.archivedAt);

  // Build a map of (type+name) → keeper for fast lookup.
  // A keeper is a default category whose ID is NOT in the loser set.
  const keeperByTypeAndName = new Map<string, Category>();
  for (const cat of activeCategories) {
    if (!loserIds.has(cat.id) && cat.isDefault) {
      keeperByTypeAndName.set(`${cat.type}|${cat.name}`, cat);
    }
  }

  // Step 3: pair each loser with its keeper.
  // Losers with no keeper (user-renamed one copy) are skipped individually.
  const pairs: Array<{ loser: Category; keeper: Category }> = [];

  for (const cat of activeCategories) {
    if (!loserIds.has(cat.id)) continue;

    const keeper = keeperByTypeAndName.get(`${cat.type}|${cat.name}`);

    if (!keeper) {
      console.log(
        LOG, accountId,
        '— no keeper for loser', cat.id, '(name:', cat.name, ') — skipping this pair',
      );
      continue; // skip this pair, repair the rest
    }

    pairs.push({ loser: cat, keeper });
  }

  if (pairs.length === 0) {
    console.log(LOG, accountId, '— no pairable losers found, skipping');
    return noop;
  }

  console.log(LOG, accountId, '— found', pairs.length, 'loser/keeper pairs, starting repair');

  // Load all referencing tables once for this account (fixes #6 — was 36× per pair).
  const snapshot = await loadAccountSnapshot(accountId);

  let totalReferences = 0;
  let totalArchived = 0;
  let totalFailed = 0;

  for (const { loser, keeper } of pairs) {
    const { reassigned, success } = await reassignAndArchive(loser, keeper, snapshot);
    totalReferences += reassigned;
    if (success) {
      totalArchived++;
    } else {
      totalFailed++;
    }
  }

  console.log(
    LOG, accountId,
    '— repaired:', totalArchived, 'losers archived,',
    totalReferences, 'references reassigned,',
    totalFailed > 0 ? `${totalFailed} pairs FAILED` : 'all pairs succeeded',
  );

  return {
    accountId,
    repaired: totalArchived > 0,
    losersArchived: totalArchived,
    referencesReassigned: totalReferences,
    pairsFailed: totalFailed,
  };
}

// ─── Reassign references then archive loser (atomic per pair) ─────────────────

async function reassignAndArchive(
  loser: Category,
  keeper: Category,
  snapshot: AccountSnapshot,
): Promise<{ reassigned: number; success: boolean }> {
  // Identify all rows to update before opening the transaction.
  // Transactions: match by ID *or* by name (savings-payment transactions store
  // category?.name instead of the ID — same as deleteCategory in BudgetContext).
  // The name-match MUST be scoped by transaction type: two default categories
  // share the same bare name (e.g. 'category_general' exists as both income
  // and expense). Without the type guard, the income loser's name match would
  // also catch expense transactions (or vice-versa), corrupting them.
  // Mirror the pattern used by deleteCategory in BudgetContext.tsx.
  const affectedTx = snapshot.transactions.filter(
    (t: Transaction) =>
      t.category === loser.id ||
      (t.category === loser.name && t.type === loser.type),
  );

  const affectedTemplates = snapshot.templates.filter(
    (t: Template) => t.categoryId === loser.id,
  );

  const affectedRecurring = snapshot.recurringItems.filter(
    (r: RecurringItem) => r.categoryId === loser.id,
  );

  const affectedGoals = snapshot.savingsGoals.filter(
    (g: SavingsGoal) => g.categoryId === loser.id,
  );

  // Limits: check if keeper already has one (#2 fix — avoid duplicate limit cards).
  const affectedLimits = snapshot.limits.filter((l: Limit) => l.categoryId === loser.id);
  const keeperAlreadyHasLimit = snapshot.limits.some(
    (l: Limit) => l.categoryId === keeper.id,
  );

  let reassigned = 0;

  try {
    await db.transaction(
      'rw',
      [
        db.transactions,
        db.limits,
        db.templates,
        db.recurringItems,
        db.savingsGoals,
        db.categories,
      ],
      async () => {
        // Transactions
        for (const tx of affectedTx) {
          await db.transactions.update(tx.id, { category: keeper.id });
          reassigned++;
        }

        // Limits
        if (affectedLimits.length > 0) {
          if (keeperAlreadyHasLimit) {
            // Keeper already has a limit — archive the loser's limits instead of
            // duplicating them. This matches deleteCategory's behaviour.
            for (const limit of affectedLimits) {
              await db.limits.update(limit.id, {
                archivedAt: new Date().toISOString(),
              });
            }
          } else {
            // Reassign the first limit to the keeper, archive any additional ones.
            for (let i = 0; i < affectedLimits.length; i++) {
              if (i === 0) {
                await db.limits.update(affectedLimits[i].id, { categoryId: keeper.id });
                reassigned++;
              } else {
                await db.limits.update(affectedLimits[i].id, {
                  archivedAt: new Date().toISOString(),
                });
              }
            }
          }
        }

        // Templates
        for (const tmpl of affectedTemplates) {
          await db.templates.update(tmpl.id, { categoryId: keeper.id });
          reassigned++;
        }

        // RecurringItems
        for (const item of affectedRecurring) {
          await db.recurringItems.update(item.id, { categoryId: keeper.id });
          reassigned++;
        }

        // SavingsGoals
        for (const goal of affectedGoals) {
          await db.savingsGoals.update(goal.id, { categoryId: keeper.id });
          reassigned++;
        }

        // Soft-archive the loser. Archived categories remain in IndexedDB indefinitely
        // (hidden from UI by repository-level !item.archivedAt filters).
        // Hard-delete via purgeArchivedOlderThan() is only available in dev mode.
        await db.categories.update(loser.id, { archivedAt: new Date().toISOString() });
      },
    );

    console.log(
      LOG,
      'Archived loser', loser.id, '→ keeper', keeper.id,
      '(', loser.name, loser.type, '),',
      reassigned, 'references reassigned',
    );

    return { reassigned, success: true };
  } catch (err) {
    console.warn(LOG, 'Failed to reassign/archive loser', loser.id, err);
    return { reassigned: 0, success: false };
  }
}
