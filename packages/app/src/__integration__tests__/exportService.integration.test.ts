import { describe, it, expect, beforeAll, beforeEach, afterAll, afterEach, vi } from 'vitest';
import { exportData, importData, pickAndImportData } from '@/services/exportService';
import type { ExportData } from '@budget/core';

// ---------------------------------------------------------------------------
// Capacitor mocks
// vi.mock is hoisted so factories must be self-contained.
// We expose a control object via a module-level variable that the factory
// closes over — this is the standard Vitest pattern for mutable mocks.
// ---------------------------------------------------------------------------

let nativePlatform = false;

vi.mock('@capacitor/core', () => ({
  Capacitor: { isNativePlatform: () => nativePlatform },
  // registerPlugin is used by @budget/core's crypto internals (private-key-store-plugin).
  // Returning a no-op stub here prevents the import from crashing in the test environment.
  registerPlugin: vi.fn().mockReturnValue({}),
}));

vi.mock('@capacitor/filesystem', () => ({
  Filesystem: {
    writeFile: vi.fn().mockResolvedValue({ uri: 'file:///cache/budget-wise-export.json' }),
    readFile: vi.fn().mockResolvedValue({ data: '' }),
  },
  Directory: { Cache: 'CACHE' },
  Encoding: { UTF8: 'utf8' },
}));

vi.mock('@capawesome/capacitor-file-picker', () => ({
  FilePicker: {
    pickFiles: vi.fn().mockResolvedValue({ files: [] }),
  },
}));

vi.mock('@capacitor/share', () => ({
  Share: { share: vi.fn().mockResolvedValue(undefined) },
}));

// Import the mocked modules so we can assert on them
import { Filesystem } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
import { FilePicker } from '@capawesome/capacitor-file-picker';

// ---------------------------------------------------------------------------
// File System Access API stub helpers
// ---------------------------------------------------------------------------

const makeSavePickerStub = () => {
  const writable = {
    write: vi.fn().mockResolvedValue(undefined),
    close: vi.fn().mockResolvedValue(undefined),
  };
  const handle = { createWritable: vi.fn().mockResolvedValue(writable) };
  const picker = vi.fn().mockResolvedValue(handle);

  Object.defineProperty(window, 'showSaveFilePicker', {
    value: picker,
    writable: true,
    configurable: true,
  });

  return { picker, handle, writable };
};

const removeSavePickerStub = () => {
  delete (window as Window & { showSaveFilePicker?: unknown }).showSaveFilePicker;
};

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const mockData: ExportData = {
  account: { id: 'account1', name: 'Test Account', initials: 'TA' },
  transactions: [
    { id: '1', amount: 10, category: 'cat1', date: '2023-01-01', title: 'Test', type: 'expense', accountId: 'account1' },
  ],
  categories: [
    { id: 'cat1', name: 'Food', color: '#000', icon: 'food', type: 'expense', isDefault: false, accountId: 'account1' },
  ],
  limits: [],
  templates: [],
  recurringItems: [],
  savingsGoals: [],
  exportDate: '2023-01-01',
  version: '1.0',
};

const emptyData: ExportData = {
  account: { id: 'account1', name: 'Test Account', initials: 'TA' },
  transactions: [],
  categories: [],
  limits: [],
  templates: [],
  recurringItems: [],
  savingsGoals: [],
  exportDate: '2023-01-01',
  version: '1.0',
};

// ---------------------------------------------------------------------------
// Suite
// ---------------------------------------------------------------------------

describe('exportService Integration Tests', () => {
  let originalCreateObjectURL: typeof URL.createObjectURL;
  let originalRevokeObjectURL: typeof URL.revokeObjectURL;
  let clickSpy: ReturnType<typeof vi.spyOn>;

  beforeAll(() => {
    originalCreateObjectURL = URL.createObjectURL;
    originalRevokeObjectURL = URL.revokeObjectURL;
    URL.createObjectURL = vi.fn().mockReturnValue('blob:test-url');
    URL.revokeObjectURL = vi.fn();
    clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
  });

  beforeEach(() => {
    nativePlatform = false;
    makeSavePickerStub();
    URL.createObjectURL = vi.fn().mockReturnValue('blob:test-url');
    URL.revokeObjectURL = vi.fn();
    // Re-apply implementations cleared by vi.clearAllMocks()
    vi.mocked(Filesystem.writeFile).mockResolvedValue({ uri: 'file:///cache/budget-wise-export.json' } as never);
    vi.mocked(Filesystem.readFile).mockResolvedValue({ data: '' } as never);
    vi.mocked(Share.share).mockResolvedValue(undefined);
    vi.mocked(FilePicker.pickFiles).mockResolvedValue({ files: [] });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
    clickSpy.mockImplementation(() => {});
  });

  afterAll(() => {
    URL.createObjectURL = originalCreateObjectURL;
    URL.revokeObjectURL = originalRevokeObjectURL;
    vi.restoreAllMocks();
  });

  // ── Web: File System Access API ──────────────────────────────────────────

  it('Happy path: exportData returns JSON string and uses the save picker', async () => {
    const { writable } = makeSavePickerStub();

    const result = await exportData(mockData);

    expect(clickSpy).not.toHaveBeenCalled();
    expect(writable.write).toHaveBeenCalled();
    expect(writable.close).toHaveBeenCalled();
    expect(result.method).toBe('picker');
    expect(typeof result.json).toBe('string');
    expect(JSON.parse(result.json)).toEqual(mockData);
  });

  it('Empty data: exportData works with empty arrays without crashing', async () => {
    const { writable } = makeSavePickerStub();

    const result = await exportData(emptyData);

    expect(clickSpy).not.toHaveBeenCalled();
    expect(writable.write).toHaveBeenCalled();
    expect(writable.close).toHaveBeenCalled();
    expect(result.method).toBe('picker');
    expect(typeof result.json).toBe('string');
    expect(JSON.parse(result.json)).toEqual(emptyData);
  });

  it('Correct format: exported data can be re-imported via importData', async () => {
    const { json } = await exportData(mockData);
    const file = new File([json], 'test.json', { type: 'application/json' });
    expect(await importData(file)).toEqual(mockData);
  });

  it('AbortError: exportData rejects when user cancels the save picker', async () => {
    Object.defineProperty(window, 'showSaveFilePicker', {
      value: vi.fn().mockRejectedValue(new DOMException('User cancelled', 'AbortError')),
      writable: true,
      configurable: true,
    });

    await expect(exportData(mockData)).rejects.toMatchObject({ name: 'AbortError' });
  });

  it('Web picker: aborts writable and rethrows when write fails', async () => {
    const mockAbort = vi.fn().mockResolvedValue(undefined);
    const mockWrite = vi.fn().mockRejectedValue(new Error('Disk full'));
    const mockClose = vi.fn();
    Object.defineProperty(window, 'showSaveFilePicker', {
      value: vi.fn().mockResolvedValue({
        createWritable: vi.fn().mockResolvedValue({
          write: mockWrite,
          close: mockClose,
          abort: mockAbort,
        }),
      }),
      writable: true,
      configurable: true,
    });

    await expect(exportData(mockData)).rejects.toThrow('Disk full');
    expect(mockAbort).toHaveBeenCalled();
    expect(mockClose).not.toHaveBeenCalled();
  });

  // ── Web: anchor fallback ─────────────────────────────────────────────────

  it('Falls back to anchor download when showSaveFilePicker is not available', async () => {
    removeSavePickerStub();

    vi.useFakeTimers();
    const result = await exportData(mockData);

    expect(clickSpy).toHaveBeenCalled();
    vi.runAllTimers();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:test-url');
    // method is "download" — caller should NOT show a success toast
    expect(result.method).toBe('download');
    expect(typeof result.json).toBe('string');
  });

  // ── Native path (Android / iOS) ──────────────────────────────────────────

  it('Native path: writes file to cache and opens Share.share()', async () => {
    nativePlatform = true;

    const result = await exportData(mockData);

    expect(Filesystem.writeFile).toHaveBeenCalledWith(
      expect.objectContaining({
        data: result.json,
        directory: 'CACHE',
        encoding: 'utf8',
      }),
    );
    expect(Share.share).toHaveBeenCalledWith(
      expect.objectContaining({ url: 'file:///cache/budget-wise-export.json' }),
    );
    expect(clickSpy).not.toHaveBeenCalled();
    expect(result.method).toBe('native');
    expect(typeof result.json).toBe('string');
    expect(JSON.parse(result.json)).toEqual(mockData);
  });

  it('Native path: propagates error when Filesystem.writeFile fails', async () => {
    nativePlatform = true;
    vi.mocked(Filesystem.writeFile).mockRejectedValueOnce(new Error('Disk full'));

    await expect(exportData(mockData)).rejects.toThrow('Disk full');
  });

  it('Native path: propagates error when Share.share fails', async () => {
    nativePlatform = true;
    vi.mocked(Share.share).mockRejectedValueOnce(new Error('Share unavailable'));

    await expect(exportData(mockData)).rejects.toThrow('Share unavailable');
  });

  // ── Import error handling ────────────────────────────────────────────────

  it('importData (web): throws on invalid JSON syntax', async () => {
    const file = new File(['{ invalid_json: '], 'test.json', { type: 'application/json' });
    await expect(importData(file)).rejects.toThrow('Failed to parse import file');
  });

  it('importData (web): throws on missing required fields', async () => {
    const file = new File([JSON.stringify({ version: '1.0' })], 'test.json', { type: 'application/json' });
    await expect(importData(file)).rejects.toThrow('Invalid export file format');
  });

  // ── Import: CSV (legacy format) ──────────────────────────────────────────

  it('importData (web): parses a valid legacy CSV file', async () => {
    const csv = `Datum;Name;Kategorie;Betrag;Kategorie-Limit;Kategorie-Limit-Datum\n2026-07-28;Lohn;Lohn;314,13;0,00;\n2026-07-28;Essen;Essen;-89,74;0,00;\n`;
    const file = new File([csv], '2026-07-28-meinbudget-export.csv', { type: 'text/csv' });
    const result = await importData(file);

    expect(result.transactions).toHaveLength(2);
    const lohn = result.transactions.find((t) => t.title === 'Lohn')!;
    const essen = result.transactions.find((t) => t.title === 'Essen')!;
    expect(lohn.type).toBe('income');
    expect(lohn.amount).toBe(314.13);
    expect(essen.type).toBe('expense');
    expect(essen.amount).toBe(89.74);
  });

  it('importData (web): throws when required CSV headers are missing', async () => {
    // This CSV is syntactically valid but missing the required "amount" and
    // "category" headers — the parser rejects it with a clear header error.
    const file = new File(['date,title,type\n2026-01-01,Test,expense'], 'missing-cols.csv', { type: 'text/csv' });
    await expect(importData(file)).rejects.toThrow(/Invalid CSV file/i);
  });

  it('importData (web): throws for unknown extension when both parsers fail', async () => {
    // A file with no recognised extension that is neither valid JSON nor valid CSV
    const file = new File(['\x00\x01\x02binary garbage'], 'export.bak', { type: 'application/octet-stream' });
    await expect(importData(file)).rejects.toThrow(/unrecognised format/i);
  });

  it('pickAndImportData (native): parses a CSV file picked on device', async () => {
    nativePlatform = true;
    const csv = `Datum;Name;Kategorie;Betrag\n2026-07-28;Gehalt;Gehalt;1500,00\n2026-07-28;Miete;Miete;-700,00\n`;
    const utf8Bytes = new TextEncoder().encode(csv);
    const b64 = btoa(String.fromCharCode(...utf8Bytes));
    vi.mocked(FilePicker.pickFiles).mockResolvedValueOnce({
      files: [{ name: '2026-07-28-meinbudget-export.csv', size: utf8Bytes.length, mimeType: 'text/csv', data: b64, path: undefined, duration: undefined, modifiedAt: undefined, blob: undefined }],
    } as never);

    const result = await pickAndImportData();
    expect(result.transactions).toHaveLength(2);
    expect(result.transactions.find((t) => t.title === 'Gehalt')?.type).toBe('income');
    expect(result.transactions.find((t) => t.title === 'Miete')?.type).toBe('expense');
  });

  // ── Import: native path via FilePicker ──────────────────────────────────

  it('pickAndImportData (native): reads inline base64 data from FilePicker', async () => {
    nativePlatform = true;
    const b64 = btoa(JSON.stringify(mockData));
    vi.mocked(FilePicker.pickFiles).mockResolvedValueOnce({
      files: [{ name: 'test.json', size: 100, mimeType: 'application/json', data: b64, path: undefined, duration: undefined, modifiedAt: undefined, blob: undefined }],
    } as never);

    const result = await pickAndImportData();
    expect(result).toEqual(mockData);
    expect(Filesystem.readFile).not.toHaveBeenCalled();
  });

  it('pickAndImportData (native): correctly decodes UTF-8 non-ASCII characters from base64', async () => {
    nativePlatform = true;
    const nonAsciiData = {
      ...mockData,
      account: { id: 'account1', name: 'Ünlaut Käse 日本語 🎉', initials: 'ÜK' },
    };
    // Proper UTF-8 base64 encoding (matches what FilePicker returns on device)
    const utf8Bytes = new TextEncoder().encode(JSON.stringify(nonAsciiData));
    const b64 = btoa(String.fromCharCode(...utf8Bytes));
    vi.mocked(FilePicker.pickFiles).mockResolvedValueOnce({
      files: [{ name: 'test.json', size: utf8Bytes.length, mimeType: 'application/json', data: b64, path: undefined, duration: undefined, modifiedAt: undefined, blob: undefined }],
    } as never);

    const result = await pickAndImportData();
    expect(result.account.name).toBe('Ünlaut Käse 日本語 🎉');
    expect(result.account.initials).toBe('ÜK');
  });

  it('pickAndImportData (native): falls back to Filesystem.readFile when no inline data', async () => {
    nativePlatform = true;
    vi.mocked(FilePicker.pickFiles).mockResolvedValueOnce({
      files: [{ name: 'test.json', size: 100, mimeType: 'application/json', data: undefined, path: '/data/test.json', duration: undefined, modifiedAt: undefined, blob: undefined }],
    } as never);
    vi.mocked(Filesystem.readFile).mockResolvedValueOnce({ data: JSON.stringify(mockData) } as never);

    const result = await pickAndImportData();
    expect(Filesystem.readFile).toHaveBeenCalledWith(expect.objectContaining({ path: '/data/test.json' }));
    expect(result).toEqual(mockData);
  });

  it('pickAndImportData (native): throws AbortError when no file selected', async () => {
    nativePlatform = true;
    vi.mocked(FilePicker.pickFiles).mockResolvedValueOnce({ files: [] } as never);

    await expect(pickAndImportData()).rejects.toMatchObject({ name: 'AbortError' });
  });
});
