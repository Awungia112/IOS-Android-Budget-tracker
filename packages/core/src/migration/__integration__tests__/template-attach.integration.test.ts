// @vitest-environment node
/**
 * Integration test — attachPendingTemplates (TICKET-5)
 *
 * Verifies the full round-trip that TICKET-5 enables:
 *
 *   local migration stashes template → attachPendingTemplates reads stash
 *   → creates template in Dexie → logs CREATE_TEMPLATE to ChangeLog
 *   → clears stash entry
 *
 * Uses:
 *   - Real Dexie (fake-indexeddb) with a real BudgetService
 *   - Real attachPendingTemplates (no mocks on the function under test)
 *   - Capacitor Preferences mocked in-memory (same pattern as template-stash.test.ts)
 *   - Real ChangeLog to verify the push pipeline would pick the template up
 */

import 'fake-indexeddb/auto';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { changeLog } from '../../changelog/change-log.js';
import { db } from '../../db/database.js';
import { BudgetService } from '../../services/budget.service.js';
import { TemplateRepository } from '../../repositories/template.repository.js';
import { resetPrivateKeyStoreMock } from '../../crypto/private-key-store-plugin.test-mock.js';
import { COMMAND_TYPES } from '../../commands/types.js';
import { attachPendingTemplates } from '../template-attach.js';
import { putStashedTemplates, getStashedTemplates } from '../local/template-stash.js';
import type { ExportData } from '../../types/index.js';

// =============================================================================
// MOCK — @capacitor/preferences (in-memory store, same pattern as stash tests)
// =============================================================================

const prefsStore = vi.hoisted(() => new Map<string, string>());

vi.mock('@capacitor/preferences', () => ({
  Preferences: {
    get: vi.fn(async ({ key }: { key: string }) => ({ value: prefsStore.get(key) ?? null })),
    set: vi.fn(async ({ key, value }: { key: string; value: string }) => { prefsStore.set(key, value); }),
    remove: vi.fn(async ({ key }: { key: string }) => { prefsStore.delete(key); }),
  },
}));

vi.mock('../../crypto/private-key-store-plugin', () =>
  import('../../crypto/private-key-store-plugin.test-mock'),
);

// =============================================================================
// HELPERS
// =============================================================================

const SERVER_ACCOUNT_ID = 'srv-online-1';

/** Minimal ExportData to seed Dexie with one account and matching categories.
 *
 * Category names must match what normalizeLegacyCategoryName() returns for the
 * stash entries below:
 *   - 'Essen'  → normalizeLegacyCategoryName('Essen') = 'category_food'
 *   - 'Salary' → normalizeLegacyCategoryName('Salary') = 'Salary' (passthrough, no mapping)
 *
 * So we seed one default category with name 'category_food' and one custom
 * category with name 'Salary' to match the two stash entries used in tests.
 */
function makeExportData(localAccountId: string): ExportData {
  return {
    version: '1',
    exportDate: new Date().toISOString(),
    account: { id: localAccountId, name: 'Test Account', initials: 'TA' },
    categories: [
      {
        id: 'cat-food',
        accountId: localAccountId,
        name: 'category_food',   // normalised from 'Essen' via LEGACY_CATEGORY_NAME_OVERRIDES
        type: 'expense',
        isDefault: true,
      },
      {
        id: 'cat-salary',
        accountId: localAccountId,
        name: 'Salary',          // passthrough — no mapping, stored as-is
        type: 'income',
        isDefault: false,
      },
    ],
    transactions: [],
    limits: [],
    recurringItems: [],
    savingsGoals: [],
    templates: [],
  };
}

// =============================================================================
// SUITE
// =============================================================================

describe('attachPendingTemplates — integration', () => {
  let budgetService: BudgetService;
  let localAccountId: string;

  beforeEach(async () => {
    resetPrivateKeyStoreMock();
    prefsStore.clear();

    vi.spyOn(console, 'warn').mockImplementation(() => {});

    // Reset Dexie
    db.close();
    await db.delete();
    await db.open();
    await db.initializeDefaultData();
    await changeLog.clear();

    budgetService = new BudgetService();

    // Seed: import a local account with two categories so category resolution works
    const exportData = makeExportData('local-account-1');
    localAccountId = exportData.account.id;
    await budgetService.importData(exportData, localAccountId);
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    try { db.close(); } catch { /* ignore */ }
  });

  // ---------------------------------------------------------------------------
  // 1. Happy path — templates are created and stash is cleared
  // ---------------------------------------------------------------------------

  it('creates templates in Dexie and clears the stash on a clean run', async () => {
    // Simulate TICKET-4: stash written during local migration
    await putStashedTemplates(SERVER_ACCOUNT_ID, [
      { name: 'Lunch', amount: 8.5, type: 'expense', categoryName: 'Essen', categoryType: 'expense' },
      { name: 'Monthly Pay', amount: 2000, type: 'income', categoryName: 'Salary', categoryType: 'income' },
    ]);

    const result = await attachPendingTemplates(localAccountId, SERVER_ACCOUNT_ID);

    // Both templates attached
    expect(result.attached).toBe(2);
    expect(result.skipped).toBe(0);
    expect(result.errors).toHaveLength(0);

    // Templates are in Dexie
    const templates = await budgetService.getTemplatesByAccountId(localAccountId);
    const names = templates.map(t => t.name);
    expect(names).toContain('Lunch');
    expect(names).toContain('Monthly Pay');

    // Stash entry is cleared
    const remaining = await getStashedTemplates(SERVER_ACCOUNT_ID);
    expect(remaining).toHaveLength(0);
  });

  // ---------------------------------------------------------------------------
  // 2. ChangeLog — CREATE_TEMPLATE command is appended
  // ---------------------------------------------------------------------------

  it('appends a CREATE_TEMPLATE command to the ChangeLog for each attached template', async () => {
    await putStashedTemplates(SERVER_ACCOUNT_ID, [
      { name: 'Lunch', amount: 8.5, type: 'expense', categoryName: 'Essen', categoryType: 'expense' },
    ]);

    await attachPendingTemplates(localAccountId, SERVER_ACCOUNT_ID);

    const records = await changeLog.getAll();
    const templateCommands = records.filter(r => r.command.type === COMMAND_TYPES.CREATE_TEMPLATE);
    expect(templateCommands).toHaveLength(1);
    expect((templateCommands[0].command as any).payload.name).toBe('Lunch');
  });

  // ---------------------------------------------------------------------------
  // 3. No stash entry — no-op
  // ---------------------------------------------------------------------------

  it('is a no-op when no stash entry exists for the server account', async () => {
    const result = await attachPendingTemplates(localAccountId, SERVER_ACCOUNT_ID);

    expect(result.attached).toBe(0);
    expect(result.errors).toHaveLength(0);

    const templates = await budgetService.getTemplatesByAccountId(localAccountId);
    expect(templates).toHaveLength(0);
  });

  // ---------------------------------------------------------------------------
  // 4. Idempotency — re-entry attaches each template exactly once
  // ---------------------------------------------------------------------------

  it('does not create duplicate templates on re-entry (idempotent)', async () => {
    await putStashedTemplates(SERVER_ACCOUNT_ID, [
      { name: 'Lunch', amount: 8.5, type: 'expense', categoryName: 'Essen', categoryType: 'expense' },
    ]);

    // First run — attaches and clears stash
    const first = await attachPendingTemplates(localAccountId, SERVER_ACCOUNT_ID);
    expect(first.attached).toBe(1);

    // Re-seed the stash to simulate re-entry (stash was cleared, but imagine
    // the stash was NOT cleared due to a partial failure on a prior run)
    await putStashedTemplates(SERVER_ACCOUNT_ID, [
      { name: 'Lunch', amount: 8.5, type: 'expense', categoryName: 'Essen', categoryType: 'expense' },
    ]);

    // Second run — template already exists, should skip
    const second = await attachPendingTemplates(localAccountId, SERVER_ACCOUNT_ID);
    expect(second.attached).toBe(0);
    expect(second.skipped).toBe(1);

    // Still only one template in Dexie
    const templates = await budgetService.getTemplatesByAccountId(localAccountId);
    expect(templates.filter(t => t.name === 'Lunch')).toHaveLength(1);
  });

  // ---------------------------------------------------------------------------
  // 5. Permanent skip (unresolvable category) — stash is still cleared
  //
  // An unresolvable category is terminal: the category will never appear in a
  // later session. The result goes into permanentSkips (not errors) so the
  // stash entry is still deleted, preventing it from leaking across every
  // subsequent online migration run.
  // ---------------------------------------------------------------------------

  it('clears the stash even when some templates have an unresolvable category (permanent skip)', async () => {
    await putStashedTemplates(SERVER_ACCOUNT_ID, [
      { name: 'Good', amount: 5, type: 'expense', categoryName: 'Essen', categoryType: 'expense' },
      { name: 'Unknown', amount: 10, type: 'income', categoryName: 'UnknownCategory', categoryType: 'income' },
    ]);

    const result = await attachPendingTemplates(localAccountId, SERVER_ACCOUNT_ID);

    expect(result.attached).toBe(1);
    // Permanent skip is recorded in permanentSkips, NOT in errors
    expect(result.permanentSkips.length).toBeGreaterThan(0);
    expect(result.errors).toHaveLength(0);

    // Stash IS cleared — permanent skips are terminal, not retryable
    const remaining = await getStashedTemplates(SERVER_ACCOUNT_ID);
    expect(remaining).toHaveLength(0);
  });

  // ---------------------------------------------------------------------------
  // 6. Unrelated stash entries are preserved
  // ---------------------------------------------------------------------------

  it('does not touch stash entries for other server accounts', async () => {
    const OTHER_SERVER_ID = 'srv-other-99';
    await putStashedTemplates(SERVER_ACCOUNT_ID, [
      { name: 'Lunch', amount: 8.5, type: 'expense', categoryName: 'Essen', categoryType: 'expense' },
    ]);
    await putStashedTemplates(OTHER_SERVER_ID, [
      { name: 'Other', amount: 20, type: 'expense', categoryName: 'Essen', categoryType: 'expense' },
    ]);

    await attachPendingTemplates(localAccountId, SERVER_ACCOUNT_ID);

    // Other account's stash entry must still be present
    const otherRemaining = await getStashedTemplates(OTHER_SERVER_ID);
    expect(otherRemaining).toHaveLength(1);
    expect(otherRemaining[0].name).toBe('Other');
  });

  // ---------------------------------------------------------------------------
  // 7. User templates created after migration are not overwritten
  // ---------------------------------------------------------------------------

  it('does not overwrite a template the user created after local migration', async () => {
    // User manually created a template with the same name+amount+type before
    // the online migration ran — it should be treated as the "already exists" case.
    // We need to look up the real category ID from Dexie (importData generates new UUIDs
    // for categories — it does not preserve the IDs from ExportData).
    const categories = await budgetService.getCategoriesByAccountId(localAccountId);
    const foodCat = categories.find(c => c.name === 'category_food' && c.type === 'expense');
    expect(foodCat).toBeDefined();

    const templateRepo = new TemplateRepository();
    await templateRepo.create({
      id: 'user-created-id',
      accountId: localAccountId,
      name: 'Lunch',
      amount: 8.5,
      type: 'expense',
      categoryId: foodCat!.id,  // use the real generated UUID
    });

    await putStashedTemplates(SERVER_ACCOUNT_ID, [
      { name: 'Lunch', amount: 8.5, type: 'expense', categoryName: 'Essen', categoryType: 'expense' },
    ]);

    const result = await attachPendingTemplates(localAccountId, SERVER_ACCOUNT_ID);

    expect(result.attached).toBe(0);
    expect(result.skipped).toBe(1);

    // Still exactly one template — the user's original
    const templates = await budgetService.getTemplatesByAccountId(localAccountId);
    expect(templates.filter(t => t.name === 'Lunch')).toHaveLength(1);
    expect(templates.find(t => t.name === 'Lunch')?.id).toBe('user-created-id');
  });
});
