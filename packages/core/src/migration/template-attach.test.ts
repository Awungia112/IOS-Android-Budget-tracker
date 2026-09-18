import { describe, it, expect, vi, beforeEach } from 'vitest';
import { attachPendingTemplates, type AttachResult } from './template-attach.js';
import type { StashedTemplate } from './local/template-stash.js';
import type { Template, Category } from '../types/index.js';

// =============================================================================
// MODULE MOCKS
// =============================================================================

const mockGetStashedTemplates = vi.fn();
const mockDeleteStashedTemplates = vi.fn();

vi.mock('./local/template-stash.js', () => ({
  getStashedTemplates: (...args: unknown[]) => mockGetStashedTemplates(...args),
  deleteStashedTemplates: (...args: unknown[]) => mockDeleteStashedTemplates(...args),
}));

const mockCategoryGetByAccountId = vi.fn().mockResolvedValue([]);
const mockTemplateGetByAccountId = vi.fn().mockResolvedValue([]);
const mockTemplateCreate = vi.fn().mockResolvedValue(undefined);

vi.mock('../repositories/category.repository.js', () => ({
  CategoryRepository: vi.fn().mockImplementation(() => ({
    getByAccountId: (...args: unknown[]) => mockCategoryGetByAccountId(...args),
  })),
}));

vi.mock('../repositories/template.repository.js', () => ({
  TemplateRepository: vi.fn().mockImplementation(() => ({
    getByAccountId: (...args: unknown[]) => mockTemplateGetByAccountId(...args),
    create: (...args: unknown[]) => mockTemplateCreate(...args),
  })),
}));

const mockChangeLogAppend = vi.fn().mockResolvedValue(undefined);

vi.mock('../changelog/change-log.js', () => ({
  changeLog: {
    append: (...args: unknown[]) => mockChangeLogAppend(...args),
  },
}));

vi.mock('../crypto/account-key.js', () => ({
  loadAccountKey: vi.fn().mockResolvedValue(new Uint8Array(32)),
}));

vi.mock('../sync/account-sync-metadata.js', () => ({
  getAccountSyncMetadata: vi.fn().mockResolvedValue({
    localAccountId: 'local-1',
    serverAccountId: 'server-1',
    keyEpoch: 1,
  }),
}));

vi.mock('./legacy-category-mapping.js', () => ({
  findDefaultCategoryForLegacy: vi.fn((name: string, type: string) => {
    const map: Record<string, { name: string; type: string }> = {
      Essen: { name: 'category_food', type: 'expense' },
      Gehalt: { name: 'category_salary', type: 'income' },
    };
    const match = map[name];
    if (match && match.type === type) {
      return { id: `default-${match.name}`, name: match.name, type: match.type, isDefault: true };
    }
    return undefined;
  }),
}));

vi.mock('../commands/types.js', () => ({
  COMMAND_TYPES: { CREATE_TEMPLATE: 'CREATE_TEMPLATE' },
}));

// =============================================================================
// FIXTURES
// =============================================================================

const LOCAL_ACCOUNT_ID = 'local-account-1';
const SERVER_ACCOUNT_ID = 'server-account-1';

const FOOD_CATEGORY: Category = {
  id: 'cat-food',
  name: 'category_food',
  type: 'expense',
  isDefault: true,
  accountId: LOCAL_ACCOUNT_ID,
};

const SALARY_CATEGORY: Category = {
  id: 'cat-salary',
  name: 'category_salary',
  type: 'income',
  isDefault: true,
  accountId: LOCAL_ACCOUNT_ID,
};

const STASHED_TEMPLATES: StashedTemplate[] = [
  { name: 'Lunch', amount: 8.5, type: 'expense', categoryName: 'Essen', categoryType: 'expense' },
  { name: 'Monthly Pay', amount: 2000, type: 'income', categoryName: 'Gehalt', categoryType: 'income' },
];

// =============================================================================
// TESTS
// =============================================================================

describe('attachPendingTemplates', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetStashedTemplates.mockResolvedValue([]);
    mockDeleteStashedTemplates.mockResolvedValue(undefined);
    mockCategoryGetByAccountId.mockResolvedValue([]);
    mockTemplateGetByAccountId.mockResolvedValue([]);
    mockTemplateCreate.mockResolvedValue(undefined);
    mockChangeLogAppend.mockResolvedValue(undefined);
  });

  it('returns zero counts when no stash entry exists', async () => {
    mockGetStashedTemplates.mockResolvedValue([]);

    const result = await attachPendingTemplates(LOCAL_ACCOUNT_ID, SERVER_ACCOUNT_ID);

    expect(result).toEqual({ attached: 0, skipped: 0, errors: [], permanentSkips: [] });
    expect(mockTemplateCreate).not.toHaveBeenCalled();
    expect(mockDeleteStashedTemplates).not.toHaveBeenCalled();
  });

  it('attaches templates and clears stash on success', async () => {
    mockGetStashedTemplates.mockResolvedValue(STASHED_TEMPLATES);
    mockCategoryGetByAccountId.mockResolvedValue([FOOD_CATEGORY, SALARY_CATEGORY]);

    const result = await attachPendingTemplates(LOCAL_ACCOUNT_ID, SERVER_ACCOUNT_ID);

    expect(result.attached).toBe(2);
    expect(result.errors).toHaveLength(0);
    expect(result.permanentSkips).toHaveLength(0);
    expect(mockTemplateCreate).toHaveBeenCalledTimes(2);
    expect(mockChangeLogAppend).toHaveBeenCalledTimes(2);
    expect(mockDeleteStashedTemplates).toHaveBeenCalledWith(SERVER_ACCOUNT_ID);
  });

  it('derives deterministic template IDs (same inputs → same UUID)', async () => {
    mockGetStashedTemplates.mockResolvedValue([STASHED_TEMPLATES[0]]);
    mockCategoryGetByAccountId.mockResolvedValue([FOOD_CATEGORY]);

    await attachPendingTemplates(LOCAL_ACCOUNT_ID, SERVER_ACCOUNT_ID);
    const firstCall = mockTemplateCreate.mock.calls[0][0] as Template;

    // Run again with a fresh mock state — id must be the same
    vi.clearAllMocks();
    mockGetStashedTemplates.mockResolvedValue([STASHED_TEMPLATES[0]]);
    mockCategoryGetByAccountId.mockResolvedValue([FOOD_CATEGORY]);
    mockTemplateGetByAccountId.mockResolvedValue([]);
    mockDeleteStashedTemplates.mockResolvedValue(undefined);
    mockChangeLogAppend.mockResolvedValue(undefined);
    mockTemplateCreate.mockResolvedValue(undefined);

    await attachPendingTemplates(LOCAL_ACCOUNT_ID, SERVER_ACCOUNT_ID);
    const secondCall = mockTemplateCreate.mock.calls[0][0] as Template;

    expect(firstCall.id).toBe(secondCall.id);
    // And it must not be random — not match the "generated-uuid" placeholder
    expect(firstCall.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
  });

  // -------------------------------------------------------------------------
  // Permanent skip: unresolvable category
  //
  // A missing category is terminal — the category will never appear in a
  // later session. This is recorded in permanentSkips (not errors) so it
  // does NOT block stash deletion.
  // -------------------------------------------------------------------------

  it('records unresolvable category in permanentSkips, not errors', async () => {
    const stashedWithUnknown: StashedTemplate[] = [
      { name: 'Mystery', amount: 10, type: 'expense', categoryName: 'UnknownCat', categoryType: 'expense' },
    ];
    mockGetStashedTemplates.mockResolvedValue(stashedWithUnknown);
    mockCategoryGetByAccountId.mockResolvedValue([FOOD_CATEGORY]);

    const result = await attachPendingTemplates(LOCAL_ACCOUNT_ID, SERVER_ACCOUNT_ID);

    expect(result.attached).toBe(0);
    expect(result.skipped).toBe(1);
    expect(result.errors).toHaveLength(0);
    expect(result.permanentSkips).toHaveLength(1);
    expect(result.permanentSkips[0]).toContain('category "UnknownCat"');
    expect(mockTemplateCreate).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // Category name has a default mapping, but not for this type — must fall
  // back to the raw legacy name, matching transformCategories()'s own
  // fallback (e.g. "Umbuchung" only maps to a default for income, never
  // expense — an expense "Umbuchung" stays a raw custom category).
  // -------------------------------------------------------------------------

  it('falls back to the raw category name when the normalized default exists only for a different type', async () => {
    const RAW_TRANSFER_CATEGORY: Category = {
      id: 'cat-transfer-raw',
      name: 'Umbuchung',
      type: 'expense',
      isDefault: false,
      accountId: LOCAL_ACCOUNT_ID,
    };
    const stashed: StashedTemplate[] = [
      { name: 'Rent transfer', amount: 500, type: 'expense', categoryName: 'Umbuchung', categoryType: 'expense' },
    ];
    mockGetStashedTemplates.mockResolvedValue(stashed);
    mockCategoryGetByAccountId.mockResolvedValue([RAW_TRANSFER_CATEGORY]);

    const result = await attachPendingTemplates(LOCAL_ACCOUNT_ID, SERVER_ACCOUNT_ID);

    expect(result.attached).toBe(1);
    expect(result.permanentSkips).toHaveLength(0);
    expect(mockTemplateCreate).toHaveBeenCalledWith(
      expect.objectContaining({ categoryId: 'cat-transfer-raw' }),
    );
  });

  it('clears stash even when some categories are unresolvable (permanent skip is terminal)', async () => {
    // One resolvable template + one permanently unresolvable category.
    // The stash must still be cleared because the unresolvable entry will
    // never succeed — retrying it forever would leak the stash entry.
    const mixed: StashedTemplate[] = [
      { name: 'Good', amount: 5, type: 'expense', categoryName: 'Essen', categoryType: 'expense' },
      { name: 'Bad', amount: 10, type: 'income', categoryName: 'MissingCat', categoryType: 'income' },
    ];
    mockGetStashedTemplates.mockResolvedValue(mixed);
    mockCategoryGetByAccountId.mockResolvedValue([FOOD_CATEGORY]);

    const result = await attachPendingTemplates(LOCAL_ACCOUNT_ID, SERVER_ACCOUNT_ID);

    expect(result.attached).toBe(1);
    expect(result.permanentSkips).toHaveLength(1);
    expect(result.errors).toHaveLength(0);
    // No transient errors → stash is cleared
    expect(mockDeleteStashedTemplates).toHaveBeenCalledWith(SERVER_ACCOUNT_ID);
  });

  // -------------------------------------------------------------------------
  // Transient failure: creation / changelog throw
  //
  // These may succeed on retry, so the stash must NOT be deleted.
  // -------------------------------------------------------------------------

  it('does NOT clear stash when a transient creation error occurs', async () => {
    mockGetStashedTemplates.mockResolvedValue(STASHED_TEMPLATES);
    mockCategoryGetByAccountId.mockResolvedValue([FOOD_CATEGORY, SALARY_CATEGORY]);
    mockTemplateCreate.mockRejectedValueOnce(new Error('Constraint error'));

    const result = await attachPendingTemplates(LOCAL_ACCOUNT_ID, SERVER_ACCOUNT_ID);

    expect(result.errors).toHaveLength(1);
    expect(mockDeleteStashedTemplates).not.toHaveBeenCalled();
  });

  it('skips templates that already exist (idempotent)', async () => {
    const existingTemplate: Template = {
      id: 'existing-1',
      name: 'Lunch',
      amount: 8.5,
      categoryId: 'cat-food',
      type: 'expense',
      accountId: LOCAL_ACCOUNT_ID,
    };
    mockGetStashedTemplates.mockResolvedValue([
      { name: 'Lunch', amount: 8.5, type: 'expense', categoryName: 'Essen', categoryType: 'expense' },
    ]);
    mockCategoryGetByAccountId.mockResolvedValue([FOOD_CATEGORY]);
    mockTemplateGetByAccountId.mockResolvedValue([existingTemplate]);

    const result = await attachPendingTemplates(LOCAL_ACCOUNT_ID, SERVER_ACCOUNT_ID);

    expect(result.attached).toBe(0);
    expect(result.skipped).toBe(1);
    expect(result.errors).toHaveLength(0);
    expect(mockTemplateCreate).not.toHaveBeenCalled();
    // Already-exists is also a permanent skip — stash is still cleared
    expect(mockDeleteStashedTemplates).toHaveBeenCalledWith(SERVER_ACCOUNT_ID);
  });

  it('clears stash only when all templates succeed (no transient errors)', async () => {
    mockGetStashedTemplates.mockResolvedValue(STASHED_TEMPLATES);
    mockCategoryGetByAccountId.mockResolvedValue([FOOD_CATEGORY, SALARY_CATEGORY]);

    await attachPendingTemplates(LOCAL_ACCOUNT_ID, SERVER_ACCOUNT_ID);

    expect(mockDeleteStashedTemplates).toHaveBeenCalledWith(SERVER_ACCOUNT_ID);
  });

  it('queries categories and templates once before the loop (no N+1)', async () => {
    mockGetStashedTemplates.mockResolvedValue(STASHED_TEMPLATES);
    mockCategoryGetByAccountId.mockResolvedValue([FOOD_CATEGORY, SALARY_CATEGORY]);

    await attachPendingTemplates(LOCAL_ACCOUNT_ID, SERVER_ACCOUNT_ID);

    // Two stashed templates → DB should still only be read once for categories
    // and once (or twice for the two identity sets) for templates, not per-template.
    expect(mockCategoryGetByAccountId).toHaveBeenCalledTimes(1);
    // Template repo is queried twice: once for id-set, once for identity-set
    expect(mockTemplateGetByAccountId.mock.calls.length).toBeLessThanOrEqual(2);
  });

  it('logs errors from stash read without throwing', async () => {
    mockGetStashedTemplates.mockRejectedValue(new Error('DB read failed'));

    const result = await attachPendingTemplates(LOCAL_ACCOUNT_ID, SERVER_ACCOUNT_ID);

    expect(result.attached).toBe(0);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toContain('DB read failed');
  });

  it('logs errors from individual template creation without throwing', async () => {
    mockGetStashedTemplates.mockResolvedValue(STASHED_TEMPLATES);
    mockCategoryGetByAccountId.mockResolvedValue([FOOD_CATEGORY, SALARY_CATEGORY]);
    mockTemplateCreate.mockRejectedValueOnce(new Error('Constraint error'));

    const result = await attachPendingTemplates(LOCAL_ACCOUNT_ID, SERVER_ACCOUNT_ID);

    expect(result.attached).toBe(1);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toContain('Constraint error');
  });

  it('does not produce duplicate templates on partial-failure re-run', async () => {
    // Simulate a re-run where the first template was already created (partial success).
    // The deterministic ID means the second call should detect the duplicate via the id set.
    mockGetStashedTemplates.mockResolvedValue([STASHED_TEMPLATES[0]]);
    mockCategoryGetByAccountId.mockResolvedValue([FOOD_CATEGORY]);

    // First run — create succeeds
    await attachPendingTemplates(LOCAL_ACCOUNT_ID, SERVER_ACCOUNT_ID);
    const createdTemplate = mockTemplateCreate.mock.calls[0][0] as Template;

    // Second run — template repo now returns the previously created template
    vi.clearAllMocks();
    mockGetStashedTemplates.mockResolvedValue([STASHED_TEMPLATES[0]]);
    mockCategoryGetByAccountId.mockResolvedValue([FOOD_CATEGORY]);
    mockTemplateGetByAccountId.mockResolvedValue([createdTemplate]);
    mockDeleteStashedTemplates.mockResolvedValue(undefined);
    mockChangeLogAppend.mockResolvedValue(undefined);
    mockTemplateCreate.mockResolvedValue(undefined);

    const result = await attachPendingTemplates(LOCAL_ACCOUNT_ID, SERVER_ACCOUNT_ID);

    expect(result.skipped).toBe(1);
    expect(mockTemplateCreate).not.toHaveBeenCalled();
  });
});
