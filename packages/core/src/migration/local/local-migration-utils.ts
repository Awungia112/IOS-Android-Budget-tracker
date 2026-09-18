import type { Frequency, TransactionType } from '../../types/index.js';
export { legacyIdToUuid } from '../legacy-id.js';
export {
  findDefaultCategoryForLegacy,
  legacyCategoryIconKey,
  mapLegacyCategoryToMigrationCategory,
  normalizeLegacyCategoryName,
  toLegacyTransactionType,
} from '../legacy-category-mapping.js';

export function fromRoomAmount(value: number): number {
  // Room stores amounts as Double euros (e.g. 12.50).
  // Budget Wise stores amounts as decimal euros — return as-is, rounded to
  // 2 decimal places to avoid IEEE 754 floating-point noise.
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function fromLegacyCentimes(value: number, source: string): number {
  if (!Number.isInteger(value)) throw new Error(`${source} must be an integer (centimes): ${value}`);
  return value / 100;
}

export function fromCoreDataAmount(value: number): number {
  return fromLegacyCentimes(value, 'Core Data amount');
}

export function fromRealmAmount(value: number): number {
  return fromLegacyCentimes(value, 'Realm amount');
}


/**
 * Parses a Joda-Time date string stored by Room's TypeConverter.
 * Handles both basicDate (yyyyMMdd) and basicDateTime (yyyyMMddTHHmmss.SSSZ) formats.
 * 
 * Examples:
 *   "20240315" → "2024-03-15T00:00:00.000Z" (basicDate)
 *   "20260511T125044.257+0100" → "2025-05-11T11:50:44.257Z" (basicDateTime, offset)
 *   "20250317T075646.022Z" → "2025-03-17T07:56:46.022Z" (basicDateTime, UTC)
 *
 * Used for: Balance.date, Recurring.start_date, SavingGoal.due_date,
 *           SavingGoal.creation_date, Category.limit_date
 */
export function fromRoomLocalDate(raw: string): string {
  // Handle basicDateTime format: yyyyMMddTHHmmss.SSS followed by either a
  // numeric offset (+0000/-0500) or the literal "Z" — Joda-Time's
  // basicDateTime() formatter prints "Z" instead of "+0000" when the stored
  // offset happens to be UTC.
  if (/^\d{8}T\d{6}\.\d{3}(Z|[+-]\d{4})$/.test(raw)) {
    return fromRoomDateTime(raw);
  }
  
  // Handle basicDate format: yyyyMMdd
  if (/^\d{8}$/.test(raw)) {
    const year = raw.slice(0, 4);
    const month = raw.slice(4, 6);
    const day = raw.slice(6, 8);
    // Construct as UTC midnight to avoid timezone drift
    return new Date(`${year}-${month}-${day}T00:00:00.000Z`).toISOString();
  }
  
  throw new Error(`[Migration] Invalid Room date format: "${raw}" — expected yyyyMMdd or yyyyMMddTHHmmss.SSSZ`);
}

/**
 * Parses a Joda-Time basicDateTime string (yyyyMMdd'T'HHmmss.SSSZ) stored by Room's TypeConverter.
 * Example input: "20240315T103045.000+0000" → "2024-03-15T10:30:45.000Z"
 *
 * Used for: Balance.created_at, Balance.updated_at, Account.created_at,
 *           Account.last_synced_at
 */
export function fromRoomDateTime(raw: string): string {
  if (!/^\d{8}T\d{6}\.\d{3}(Z|[+-]\d{4})$/.test(raw)) {
    throw new Error(`[Migration] Invalid basicDateTime format: "${raw}" — expected yyyyMMdd'T'HHmmss.SSSZ`);
  }
  // Reinsert the dashes and colons that basicDateTime strips out
  const date = raw.slice(0, 8);   // "20240315"
  const time = raw.slice(9, 15);  // "103045"
  const millis = raw.slice(15, 19); // ".000"
  const tz = raw.slice(19); // "Z", or "+0000"/"-0500"
  // Joda-Time prints the literal "Z" instead of "+0000" when the offset is UTC.
  const tzIso = tz === 'Z' ? 'Z' : `${tz.slice(0, 1)}${tz.slice(1, 3)}:${tz.slice(3, 5)}`;

  const iso = `${date.slice(0, 4)}-${date.slice(4, 6)}-${date.slice(6, 8)}`
    + `T${time.slice(0, 2)}:${time.slice(2, 4)}:${time.slice(4, 6)}`
    + `${millis}${tzIso}`;

  return new Date(iso).toISOString(); // normalises to UTC "Z" suffix
}

/**
 * Converts a Unix millisecond timestamp to ISO 8601 UTC string.
 * Use ONLY for iOS Realm dates serialised by the Swift plugin.
 * Do NOT use for Android Room — use fromRoomLocalDate() or fromRoomDateTime().
 */
export function fromUnixMs(ms: number): string {
  return new Date(ms).toISOString();
}

export function fromCoreDataLegacyDateString(raw: string): string {
  const value = raw.trim();
  const match = value.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
  if (!match) {
    throw new Error(`[Migration] Invalid Core Data v1 date: "${raw}" — expected dd.MM.yyyy`);
  }

  const day = Number(match[1]);
  const month = Number(match[2]);
  const year = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));

  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    throw new Error(`[Migration] Invalid Core Data v1 date: "${raw}"`);
  }

  return date.toISOString();
}

export function tryFromCoreDataLegacyDateString(raw: string): string | undefined {
  try {
    return fromCoreDataLegacyDateString(raw);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(`[Migration] Skipped malformed Core Data v1 date "${raw}": ${message}`);
    return undefined;
  }
}

export function isDeleted(row: Record<string, unknown>): boolean {
  return row['deleted'] === 1 || row['deleted'] === true;
}

export function toTransactionType(raw: unknown): TransactionType {
  if (typeof raw === 'boolean') return raw ? 'income' : 'expense';
  if (typeof raw === 'number') return raw === 1 ? 'income' : 'expense';
  if (typeof raw === 'string') {
    const normalized = raw.trim().toLowerCase();
    if (normalized === 'income') return 'income';
    if (normalized === 'expense') return 'expense';
    if (normalized === 'bt_income') return 'income';
    if (normalized === 'bt_expense') return 'expense';
  }
  return 'expense'; // Default fallback
}

// Android Room/ Legacy SQLite: repeating Int constants
export function fromRoomFrequency(raw: number): Frequency {
  const map: Record<number, Frequency> = {
    1: 'monthly',
    3: 'every_3_months',
    6: 'every_6_months',
    12: 'every_12_months',
    30: 'every_30_months',
  };
  
  // Check for exact matches first
  const result = map[raw];
  if (result) return result;
  
  // Handle any positive integer as a valid monthly interval
  if (Number.isInteger(raw) && raw > 0 && raw <= 60) {
    return raw === 1 ? 'monthly' : (`every_${raw}_months` as Frequency);
  }
  
  throw new Error(`[Migration] Unknown Room frequency: ${raw} — must be 1-60 months`);
}

// iOS Realm: RealmRecurringBalance.interval — "the recurrence interval in months"
// (RecurringBalance.swift protocol comment, confirmed in legacy iOS source).
// Semantics are identical to Android Room's repeating field, so the same
// integer→Frequency mapping applies: 1→monthly, 3→every_3_months, etc.
export function fromRealmInterval(raw: number): Frequency {
  return fromRoomFrequency(raw);
}

// Legacy SQLite v1: same mapping per DatabaseHelper.java
export function fromLegacyFrequency(raw: number): Frequency {
  return fromRoomFrequency(raw);
}

// iOS Core Data: recurrenceInterval stores a month interval. Older rows may
// contain values outside the Android Room constants, so preserve valid positive
// intervals instead of rejecting them.
export function fromCoreDataFrequency(raw: number): Frequency {
  if (!Number.isInteger(raw) || raw <= 0) {
    throw new Error(`[Migration] Unknown Core Data frequency: ${raw}`);
  }
  return raw === 1 ? 'monthly' : (`every_${raw}_months` as Frequency);
}


/**
 * Reconstructs a best-effort startDate for Core Data RecurringAccounting records
 * which only store dayOfMonth, not a full date.
 * Strategy: use the 1st occurrence of that day in the current month at migration time.
 * This is an approximation — flag these records with legacySource: 'core_data'
 * so the user can correct them if needed.
 */
export function reconstructStartDateFromDayOfMonth(dayOfMonth: number): string {
  const now = new Date();
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth();
  // Clamp to valid days in the month (e.g. day 31 in February → last day).
  // Use Date.UTC throughout to avoid local-timezone drift: new Date(year, month+1, 0)
  // constructs midnight LOCAL time, whose .getUTCDate() can be one day behind in
  // UTC+ zones (e.g. March 31 00:00 UTC+5:30 → March 30 18:30 UTC → day 30).
  const maxDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const day = Math.min(dayOfMonth, maxDay);
  return new Date(Date.UTC(year, month, day)).toISOString();
}

/**
 * Calendar date (YYYY-MM-DD) of a legacy date, as the user saw it.
 *
 * Readers hand over ISO strings in UTC. Date-only values are encoded as UTC
 * midnight and keep their date. Real timestamps (Unix ms, Core Data seconds,
 * Room date-times) are converted to the local calendar day: the legacy app
 * ran on this device, so an entry saved at local midnight in Germany stays on
 * its day instead of falling back to the previous UTC day.
 */
export function toLocalCalendarDate(value: string): string {
  const calendarDate = value.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(calendarDate)) return value;
  if (value.length === 10) return value;
  const time = value.slice(10);
  if (time === 'T00:00:00Z' || time === 'T00:00:00.000Z') return calendarDate;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export function fromCoreDataTimestamp(secs: number): string {
  // Core Data epoch offset = 978307200 seconds
  return new Date((secs + 978307200) * 1000).toISOString();
}

// ---------------------------------------------------------------------------
// Kotlin enum → TypeScript literal converters
// ---------------------------------------------------------------------------

/**
 * Kotlin BalanceType enum → TransactionType
 * Room stores the enum name as a TEXT column: "INCOME" | "EXPENSE".
 * Maps directly to the Dexie TransactionType union.
 */
export function fromRoomBalanceType(raw: string): TransactionType {
  if (raw === 'INCOME') return 'income';
  if (raw === 'EXPENSE') return 'expense';
  throw new Error(`[Migration] Unknown BalanceType: "${raw}"`);
}

/**
 * Kotlin DefaultType enum → Dexie Category.isDefault boolean
 * DEFAULT          → true   (standard built-in category)
 * TRANSFER_DEFAULT → true   (internal transfer category — still a default)
 * Any other value  → false  (user-created category)
 */
export function fromRoomDefaultType(raw: string): boolean {
  // Only 'DEFAULT' and 'TRANSFER_DEFAULT' should be treated as default categories
  return raw === 'DEFAULT' || raw === 'TRANSFER_DEFAULT';
}

/**
 * Kotlin AccessRole enum → access role string
 * OWNER  → 'owner'   (full permissions)
 * MEMBER → 'member'  (read/write restricted)
 */
export type AccessRole = 'owner' | 'member';

export function fromRoomAccessRole(raw: string): AccessRole {
  if (raw === 'OWNER') return 'owner';
  if (raw === 'MEMBER') return 'member';
  throw new Error(`[Migration] Unknown AccessRole: "${raw}"`);
}

// =============================================================================
// Category name + icon mapping — all local datasources
// =============================================================================

/**
 * Maps a legacy category name (German or English) to a Budget Wise translation
 * key (e.g. "category_food"). Works for all four local datasources:
 * Room, Legacy SQLite v1, Core Data, and Realm.
 *
 * Source: Database.java initialCategoriesIncome/Expense arrays (Android legacy
 * SQLite), Room initial seed data, and iOS LegacyStrings.
 * Falls back to the trimmed raw name when no match is found (custom category).
 */
export function mapLegacyCategoryName(rawName: string): string {
  const trimmed = rawName.trim();

  // Direct lookup (case-sensitive — covers the vast majority of cases)
  const direct = LEGACY_CATEGORY_NAME_MAP[trimmed];
  if (direct) return direct;

  // Case-insensitive fallback
  const lower = trimmed.toLowerCase();
  for (const [key, value] of Object.entries(LEGACY_CATEGORY_NAME_MAP)) {
    if (key.toLowerCase() === lower) return value;
  }

  return trimmed; // custom category — keep as-is
}

/**
 * Maps a legacy icon value to a Budget Wise icon key.
 *
 * Datasource-specific input formats:
 *
 * - Room (`icon_name` TEXT column): string like "kategorie_ausgaben_3"
 * - Legacy SQLite v1 (`icon` TEXT column): same string format as Room
 * - Core Data (`imageNumber` Integer 16): integer 1–17 (expense) or 1–5 (income)
 * - Realm (`icon` Int @Persisted): same integer as Core Data
 *   (BackendCategory.iconName converts it to "kategorie_ausgaben_N" before
 *   sending to the backend — we replicate that logic here)
 *
 * All four formats ultimately resolve to the same drawable-name lookup table.
 * Unmapped values fall back to type defaults.
 */
export function mapLegacyCategoryIcon(
  rawIcon: string | number | null | undefined,
  type: TransactionType,
): string {
  const fallback = type === 'expense' ? 'lucide:shopping' : 'cash';

  if (rawIcon == null) return fallback;

  // Integer icon (Realm / Core Data imageNumber) → drawable name string
  let drawableName: string;
  if (typeof rawIcon === 'number') {
    if (rawIcon <= 0 || rawIcon > 50) return fallback;
    drawableName =
      type === 'income'
        ? `kategorie_einnahmen_${rawIcon}`
        : `kategorie_ausgaben_${rawIcon}`;
  } else {
    drawableName = rawIcon.trim();
  }

  const map = type === 'income' ? INCOME_ICON_MAP : EXPENSE_ICON_MAP;
  return map[drawableName] ?? fallback;
}

// ---------------------------------------------------------------------------
// Internal lookup tables
// ---------------------------------------------------------------------------

/**
 * German and English legacy category names → Budget Wise translation keys.
 *
 * Sources:
 * - Android Database.java initialCategoriesIncome / initialCategoriesExpense
 * - Android Room initial seed (same names)
 * - iOS LegacyStrings.swift / MBCategory names
 * - Online migration LEGACY_NAME_MAP (legacy-data-transformer.ts)
 */
const LEGACY_CATEGORY_NAME_MAP: Record<string, string> = {
  // ── Income (German) ──────────────────────────────────────────────────────
  'Allgemein':      'category_general',
  'Lohn':           'category_salary',
  'Gehalt':         'category_salary',
  'Taschengeld':    'category_allowance',
  'Geschenk':       'category_gift',
  'Ferienjob':      'category_holiday_job',
  'Umbuchung':      'category_transfer',
  'Nachhilfe':      'category_tutoring',
  'Online-Verkauf': 'category_selling_online',
  'Babysitten':     'category_babysitting',
  'Stipendium':     'category_scholarship',
  'Cashback':       'category_cashback',

  // ── Income (English) ─────────────────────────────────────────────────────
  'General':        'category_general',
  'Salary':         'category_salary',
  'Allowance':      'category_allowance',
  'Pocket Money':   'category_allowance',
  'Gift':           'category_gift',
  'Holiday Job':    'category_holiday_job',
  'Transfer':       'category_transfer',
  'Tutoring':       'category_tutoring',
  'Selling Online': 'category_selling_online',
  'Babysitting':    'category_babysitting',
  'Scholarship':    'category_scholarship',

  // ── Expense (German) ─────────────────────────────────────────────────────
  'Haushalt':       'category_household',
  'Wohnen':         'category_housing',
  'Essen':          'category_food',
  'Lebensmittel':   'category_food',
  'Einkaufen':      'category_shopping',
  'Bücher':         'category_books',
  'Büro':           'category_office',
  'Internet':       'category_internet',
  'Kleidung':       'category_clothing',
  'Hobby':          'category_hobby',
  'Handy':          'category_mobile',
  'Ausgehen':       'category_going_out',
  'Bus':            'category_bus',
  'Urlaub':         'category_vacation',
  'Auto':           'category_travel',   // "Auto" → closest is travel/car
  'Sparen':         'category_savings',
  'Schatz':         'category_hobby',    // "Darling/Partner" — closest match
  'Unterhaltung':   'category_entertainment',
  'Party':          'category_party',
  'Freizeit':       'category_leisure',
  'Reisen':         'category_travel',
  'Sonstiges':      'category_general',
  'Nebenkosten':    'category_utilities',
  'Transport':      'category_bus',
  'Abonnements':    'category_subscriptions',
  'Körperpflege':   'category_personal_care',
  'Gesundheit':     'category_health',
  'Bildung':        'category_education',
  'Sport':          'category_sports',

  // ── Expense (English) ────────────────────────────────────────────────────
  'Household':      'category_household',
  'Housing':        'category_housing',
  'Food':           'category_food',
  'Shopping':       'category_shopping',
  'Books':          'category_books',
  'Office':         'category_office',
  'Clothing':       'category_clothing',
  'Mobile':         'category_mobile',
  'Going Out':      'category_going_out',
  'Vacation':       'category_vacation',
  'Savings':        'category_savings',
  'Entertainment':  'category_entertainment',
  'Leisure':        'category_leisure',
  'Travel':         'category_travel',
  'Miscellaneous':  'category_general',
  'Utilities':      'category_utilities',
  'Subscriptions':  'category_subscriptions',
  'Personal Care':  'category_personal_care',
  'Health':         'category_health',
  'Education':      'category_education',
  'Sports':         'category_sports',
};

/**
 * Android drawable name → Budget Wise icon key (expense categories).
 * Source: Database.java initialCategoriesExpense + icon-mapping.md
 * Integers 1–17 map to "kategorie_ausgaben_N" via mapLegacyCategoryIcon().
 * Integer 18 is the transfer category icon (used internally, no Dexie mapping).
 */
const EXPENSE_ICON_MAP: Record<string, string> = {
  'kategorie_ausgaben_1':  'cash',             // Allgemein (General)
  'kategorie_ausgaben_2':  'house',            // Haushalt (Household)
  'kategorie_ausgaben_3':  'lucide:food',      // Essen (Food)
  'kategorie_ausgaben_4':  'lucide:shopping',  // Einkaufen (Shopping)
  'kategorie_ausgaben_5':  'lucide:book',      // Bücher (Books)
  'kategorie_ausgaben_6':  'present',          // Geschenk (Gift)
  'kategorie_ausgaben_7':  'lucide:briefcase', // Büro (Office)
  'kategorie_ausgaben_8':  'lucide:wifi',      // Internet
  'kategorie_ausgaben_9':  'lucide:heart',     // Schatz (Darling/Partner)
  'kategorie_ausgaben_10': 'lucide:scissors',  // Kleidung (Clothing)
  'kategorie_ausgaben_11': 'lucide:star',      // Hobby
  'kategorie_ausgaben_12': 'handy',            // Handy (Mobile)
  'kategorie_ausgaben_13': 'lucide:smile',     // Ausgehen (Going Out)
  'kategorie_ausgaben_14': 'lucide:bus',       // Bus (Transport)
  'kategorie_ausgaben_15': 'lucide:plane',     // Urlaub (Vacation)
  'kategorie_ausgaben_16': 'lucide:car',       // Auto (Car)
  'kategorie_ausgaben_17': 'pig',              // Sparen (Savings)
  // 18 = transfer category — no Dexie mapping, falls through to default
};

/**
 * Android drawable name → Budget Wise icon key (income categories).
 * Source: Database.java initialCategoriesIncome + icon-mapping.md
 * Integer 2 is the transfer income icon (used internally).
 */
const INCOME_ICON_MAP: Record<string, string> = {
  'kategorie_einnahmen_1': 'cash',             // Allgemein (General)
  'kategorie_einnahmen_2': 'money',            // Lohn (Salary)
  'kategorie_einnahmen_3': 'pig',              // Taschengeld (Allowance)
  'kategorie_einnahmen_4': 'present',          // Geschenk (Gift)
  'kategorie_einnahmen_5': 'lucide:briefcase', // Ferienjob (Holiday Job)
};
