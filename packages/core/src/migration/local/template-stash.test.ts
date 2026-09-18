import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  TEMPLATE_STASH_KEY,
  deleteStashedTemplates,
  getStashedTemplates,
  hasAnyStashedTemplates,
  putStashedTemplates,
  type StashedTemplate,
} from './template-stash.js';

// =============================================================================
// MOCK — @capacitor/preferences (same pattern as orchestrator.test.ts)
// =============================================================================

const mocks = vi.hoisted(() => {
  const store = new Map<string, string>();
  return {
    store,
    get: vi.fn(async ({ key }: { key: string }) => ({ value: store.get(key) ?? null })),
    set: vi.fn(async ({ key, value }: { key: string; value: string }) => { store.set(key, value); }),
    remove: vi.fn(async ({ key }: { key: string }) => { store.delete(key); }),
  };
});

vi.mock('@capacitor/preferences', () => ({
  Preferences: {
    get: mocks.get,
    set: mocks.set,
    remove: mocks.remove,
  },
}));

// =============================================================================
// HELPERS
// =============================================================================

const makeTemplate = (overrides: Partial<StashedTemplate> = {}): StashedTemplate => ({
  name: 'Groceries',
  amount: 50,
  type: 'expense',
  categoryName: 'category_food',
  categoryType: 'expense',
  ...overrides,
});

// =============================================================================
// SETUP
// =============================================================================

beforeEach(() => {
  mocks.store.clear();
  mocks.get.mockClear();
  mocks.set.mockClear();
  mocks.remove.mockClear();
});

// =============================================================================
// write
// =============================================================================

describe('putStashedTemplates', () => {
  it('writes an entry keyed by server account key', async () => {
    await putStashedTemplates('srv-1', [makeTemplate()]);

    expect(mocks.set).toHaveBeenCalledWith({
      key: TEMPLATE_STASH_KEY,
      value: expect.stringContaining('"srv-1"'),
    });

    const raw = mocks.store.get(TEMPLATE_STASH_KEY)!;
    expect(JSON.parse(raw)['srv-1']).toHaveLength(1);
    expect(JSON.parse(raw)['srv-1'][0].name).toBe('Groceries');
  });

  it('overwrites an existing entry for the same key (idempotent)', async () => {
    await putStashedTemplates('srv-1', [makeTemplate({ name: 'First' }), makeTemplate({ name: 'Second' })]);
    await putStashedTemplates('srv-1', [makeTemplate({ name: 'Only' })]);

    const stored = await getStashedTemplates('srv-1');
    expect(stored).toHaveLength(1);
    expect(stored[0].name).toBe('Only');
  });

  it('keeps entries for other keys when overwriting one', async () => {
    await putStashedTemplates('key-a', [makeTemplate({ name: 'A' })]);
    await putStashedTemplates('key-b', [makeTemplate({ name: 'B' })]);
    await putStashedTemplates('key-a', [makeTemplate({ name: 'A-updated' })]);

    expect((await getStashedTemplates('key-a'))[0].name).toBe('A-updated');
    expect((await getStashedTemplates('key-b'))[0].name).toBe('B');
  });

  it('stores all StashedTemplate fields faithfully', async () => {
    const template: StashedTemplate = {
      name: 'Rent',
      amount: 850.5,
      type: 'expense',
      categoryName: 'category_housing',
      categoryType: 'expense',
    };
    await putStashedTemplates('srv-1', [template]);

    const [stored] = await getStashedTemplates('srv-1');
    expect(stored).toEqual(template);
  });

  it('does not write a phantom entry when templates list is empty', async () => {
    await putStashedTemplates('srv-1', []);

    expect(mocks.set).not.toHaveBeenCalled();
    expect(await hasAnyStashedTemplates()).toBe(false);
  });

  it('propagates Preferences write errors so the caller can react', async () => {
    mocks.set.mockRejectedValueOnce(new Error('Storage unavailable'));

    await expect(putStashedTemplates('srv-1', [makeTemplate()])).rejects.toThrow('Storage unavailable');
  });
});

// =============================================================================
// read
// =============================================================================

describe('getStashedTemplates', () => {
  it('returns the stored templates for a known key', async () => {
    await putStashedTemplates('srv-1', [makeTemplate({ name: 'T1' }), makeTemplate({ name: 'T2' })]);

    const result = await getStashedTemplates('srv-1');
    expect(result).toHaveLength(2);
    expect(result.map(t => t.name)).toEqual(['T1', 'T2']);
  });

  it('returns an empty array for an unknown key', async () => {
    expect(await getStashedTemplates('non-existent')).toEqual([]);
  });

  it('returns an empty array when the stash is empty', async () => {
    expect(await getStashedTemplates('any-key')).toEqual([]);
  });

  it('returns an empty array when Preferences contains invalid JSON', async () => {
    mocks.store.set(TEMPLATE_STASH_KEY, 'not-valid-json{{{');
    expect(await getStashedTemplates('any-key')).toEqual([]);
  });

  it('returns an empty array when Preferences value is a JSON array (wrong shape)', async () => {
    mocks.store.set(TEMPLATE_STASH_KEY, JSON.stringify([]));
    expect(await getStashedTemplates('any-key')).toEqual([]);
  });

  it('returns an empty array when the per-key value is not an array', async () => {
    mocks.store.set(TEMPLATE_STASH_KEY, JSON.stringify({ 'srv-1': 'oops', 'srv-2': 5 }));
    expect(await getStashedTemplates('srv-1')).toEqual([]);
    expect(await getStashedTemplates('srv-2')).toEqual([]);
  });
});

// =============================================================================
// delete
// =============================================================================

describe('deleteStashedTemplates', () => {
  it('removes the entry for the given key', async () => {
    await putStashedTemplates('srv-1', [makeTemplate()]);
    await deleteStashedTemplates('srv-1');
    expect(await getStashedTemplates('srv-1')).toEqual([]);
  });

  it('leaves other keys untouched', async () => {
    await putStashedTemplates('srv-1', [makeTemplate({ name: 'Keep me' })]);
    await putStashedTemplates('srv-2', [makeTemplate({ name: 'Delete me' })]);
    await deleteStashedTemplates('srv-2');

    expect(await getStashedTemplates('srv-1')).toHaveLength(1);
    expect(await getStashedTemplates('srv-2')).toEqual([]);
  });

  it('is a no-op when the key does not exist', async () => {
    await expect(deleteStashedTemplates('ghost-key')).resolves.toBeUndefined();
  });

  it('leaves an empty object in the store after the last entry is deleted', async () => {
    await putStashedTemplates('only-key', [makeTemplate()]);
    await deleteStashedTemplates('only-key');

    const raw = mocks.store.get(TEMPLATE_STASH_KEY);
    expect(raw).not.toBeNull();
    expect(JSON.parse(raw!)).toEqual({});
  });
});

// =============================================================================
// overwrite idempotency — wizard retry scenario
// =============================================================================

describe('retry idempotency', () => {
  it('a second write leaves exactly one stash entry per account', async () => {
    const templates = [makeTemplate({ name: 'T1' }), makeTemplate({ name: 'T2' })];

    await putStashedTemplates('srv-online-1', templates);
    await putStashedTemplates('srv-online-1', templates); // retry

    const raw = JSON.parse(mocks.store.get(TEMPLATE_STASH_KEY)!);
    expect(Object.keys(raw)).toEqual(['srv-online-1']);
    expect(raw['srv-online-1']).toHaveLength(2);
  });
});

// =============================================================================
// hasAnyStashedTemplates
// =============================================================================

describe('hasAnyStashedTemplates', () => {
  it('returns false when the stash is empty', async () => {
    expect(await hasAnyStashedTemplates()).toBe(false);
  });

  it('returns true after at least one entry is written', async () => {
    await putStashedTemplates('srv-1', [makeTemplate()]);
    expect(await hasAnyStashedTemplates()).toBe(true);
  });

  it('returns false after all entries are deleted', async () => {
    await putStashedTemplates('srv-1', [makeTemplate()]);
    await deleteStashedTemplates('srv-1');
    expect(await hasAnyStashedTemplates()).toBe(false);
  });
});
