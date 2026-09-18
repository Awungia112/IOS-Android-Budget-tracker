import type { ExportData } from "@budget/core";
import { parseLegacyCsv, CsvParseError } from "@budget/core";
import { Capacitor } from "@capacitor/core";
import { Encoding, Filesystem, Directory } from "@capacitor/filesystem";
import { Share } from "@capacitor/share";
import { FilePicker } from "@capawesome/capacitor-file-picker";

const EXPORT_FILENAME_PREFIX = "mein-budget_export";

const buildFilename = (): string =>
  `${EXPORT_FILENAME_PREFIX}_${new Date().toISOString().split("T")[0]}.json`;

/**
 * Serialises export data and opens the platform's share/save dialog.
 *
 * Returns an object describing which path was taken:
 * - "native"   — Capacitor Share sheet opened (Android/iOS)
 * - "picker"   — File System Access API: user confirmed the save dialog
 * - "download" — anchor fallback: browser triggered a download automatically
 *
 * Throws on filesystem/share errors and on AbortError (user cancelled the
 * web save picker) so the caller can respond appropriately.
 */
export type ExportResult = {
  json: string;
  method: "native" | "picker" | "download";
};

export const exportData = async (data: ExportData): Promise<ExportResult> => {
  const json = JSON.stringify(data, null, 2);
  const filename = buildFilename();

  if (Capacitor.isNativePlatform()) {
    await exportNative(json, filename);
    return { json, method: "native" };
  }

  const method = await exportWeb(json, filename);
  return { json, method };
};

// ---------------------------------------------------------------------------
// Native path – Android & iOS
// ---------------------------------------------------------------------------

const exportNative = async (content: string, filename: string): Promise<void> => {
  // Errors from writeFile or Share.share propagate to the caller so the
  // BudgetContext can surface a toast.
  const result = await Filesystem.writeFile({
    path: filename,
    data: content,
    directory: Directory.Cache,
    encoding: Encoding.UTF8,
  });

  // Share.share resolves when the sheet closes (user picked a destination or
  // dismissed it). It does NOT throw on user dismissal, so no AbortError
  // suppression is needed in the caller for the native path.
  await Share.share({
    title: filename,
    url: result.uri,
    dialogTitle: filename,
  });
};

// ---------------------------------------------------------------------------
// Web / PWA path
// ---------------------------------------------------------------------------

const exportWeb = async (content: string, filename: string): Promise<"picker" | "download"> => {
  const blob = new Blob([content], { type: "application/json" });

  // File System Access API — awaited so the success toast fires only after
  // the user confirms. Throws AbortError on cancel.
  if (typeof window !== "undefined" && "showSaveFilePicker" in window) {
    const handle = await (
      window as Window & {
        showSaveFilePicker: (opts: unknown) => Promise<FileSystemFileHandle>;
      }
    ).showSaveFilePicker({
      suggestedName: filename,
      types: [
        {
          description: "JSON file",
          accept: { "application/json": [".json"] },
        },
      ],
    });
    const writable = await handle.createWritable();
    try {
      await writable.write(blob);
      await writable.close();
    } catch (err) {
      // Abort the stream so the file handle is released and no partial file
      // is left on disk. Re-throw so the caller can show an error toast.
      await writable.abort();
      throw err;
    }
    return "picker";
  }

  // Fallback: plain anchor download. The browser triggers the save
  // immediately — there is no user confirmation signal available, so the
  // caller should not show a success toast for this path.
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => URL.revokeObjectURL(url), 100);
  return "download";
};

// ---------------------------------------------------------------------------
// Import
// ---------------------------------------------------------------------------

/**
 * On native (Android/iOS) the WebView's <input type="file"> onChange does not
 * reliably fire after the OS file picker closes the activity. We bypass it
 * entirely by using @capawesome/capacitor-file-picker, which goes through
 * Capacitor's proper activity result channel, then reading the file content
 * via Filesystem.readFile.
 *
 * On web, the standard FileReader API is used as before.
 *
 * Returns the parsed ExportData, or throws on parse/validation errors or if
 * the user cancels the picker.
 */
export const pickAndImportData = async (): Promise<ExportData> => {
  if (Capacitor.isNativePlatform()) {
    return pickAndImportNative();
  }
  // On web the caller still uses the hidden <input type="file"> path — this
  // function is only called on native.
  throw new Error("pickAndImportData called on web — use importData(file) instead");
};

const pickAndImportNative = async (): Promise<ExportData> => {
  const result = await FilePicker.pickFiles({
    // Accept both the current JSON format and the legacy CSV format.
    // Some Android versions ignore the MIME type list and show all files —
    // that is acceptable; parseAndValidateByFilename() will validate the
    // content regardless.
    types: ["application/json", "text/csv", "text/comma-separated-values"],
    readData: true,           // asks the plugin to return base64 data directly
    limit: 1,
  });

  const picked = result.files[0];
  if (!picked) throw new DOMException("No file selected", "AbortError");

  // Prefer base64 data returned inline by the plugin (most reliable).
  // atob() is browser/WebView-only — this function is only called from the
  // Capacitor native context (Android/iOS WebView), so it is always available.
  if (picked.data) {
    // atob() produces a Latin-1 binary string — decode as UTF-8 via TextDecoder
    // so non-ASCII characters (accents, CJK, emoji, etc.) are preserved correctly.
    const bytes = Uint8Array.from(atob(picked.data), (c) => c.charCodeAt(0));
    const text = new TextDecoder().decode(bytes);
    return parseAndValidateByFilename(text, picked.name ?? '');
  }

  // Fall back to reading via path URI if inline data wasn't provided
  if (picked.path) {
    const fileResult = await Filesystem.readFile({
      path: picked.path,
      encoding: Encoding.UTF8,
    });
    const text = typeof fileResult.data === "string"
      ? fileResult.data
      : await (fileResult.data as Blob).text();
    return parseAndValidateByFilename(text, picked.name ?? '');
  }

  throw new Error("Failed to read import file: no data or path returned");
};

/**
 * Parse and validate a File object on web. Used by the hidden
 * <input type="file"> path in Layout.tsx.
 *
 * Supports both the current JSON format and the legacy CSV format — the file
 * extension is used to choose the correct parser.
 */
export const importData = async (file: File): Promise<ExportData> => {
  return importDataWeb(file);
};

const importDataWeb = (file: File): Promise<ExportData> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = () => {
      const text = reader.result as string;
      try {
        resolve(parseAndValidateByFilename(text, file.name));
      } catch (err) {
        reject(err);
      }
    };

    reader.onerror = () => {
      reject(new Error("Failed to read import file"));
    };

    reader.readAsText(file);
  });
};

// ---------------------------------------------------------------------------
// Format detection & routing
// ---------------------------------------------------------------------------

/**
 * Detect the file format by filename extension and route to the correct parser.
 *
 * - `.csv`  → legacy CSV parser  (produces ExportData directly)
 * - `.json` → existing JSON validator
 * - unknown → attempt JSON first, fall back to CSV; if both fail, throw a
 *             single user-friendly error rather than surfacing a raw CsvParseError
 */
function parseAndValidateByFilename(text: string, filename: string): ExportData {
  const lower = filename.toLowerCase().trim();

  if (lower.endsWith('.csv')) {
    return parseAndValidateCsv(text);
  }

  if (lower.endsWith('.json')) {
    return parseAndValidate(text);
  }

  // Unknown extension — try JSON first, then CSV.
  // If both parsers fail, surface a single clear message rather than letting
  // a raw CsvParseError bubble up from the CSV fallback.
  try {
    return parseAndValidate(text);
  } catch {
    try {
      return parseAndValidateCsv(text);
    } catch {
      throw new Error('Failed to parse import file: unrecognised format');
    }
  }
}

/**
 * Parse and validate a legacy CSV export.
 * Re-wraps CsvParseError with a user-friendly message prefix.
 */
function parseAndValidateCsv(text: string): ExportData {
  try {
    return parseLegacyCsv(text);
  } catch (err) {
    if (err instanceof CsvParseError) {
      throw new Error(`Invalid CSV file: ${err.message}`);
    }
    throw err;
  }
}

const parseAndValidate = (text: string): ExportData => {
  let data: ExportData;

  try {
    data = JSON.parse(text) as ExportData;
  } catch {
    throw new Error("Failed to parse import file");
  }

  if (!data || typeof data !== "object") {
    throw new Error("Invalid export file format");
  }

  if (
    !Array.isArray(data.transactions) ||
    !Array.isArray(data.categories) ||
    !Array.isArray(data.limits) ||
    !Array.isArray(data.templates) ||
    !Array.isArray(data.recurringItems) ||
    !Array.isArray(data.savingsGoals)
  ) {
    throw new Error("Invalid export file format");
  }

  return data;
};
