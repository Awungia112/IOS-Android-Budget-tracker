import { CATEGORY_NAME_TO_KEY } from '../constants/category-mappings.js';
import { DEFAULT_CATEGORIES } from '../db/config.js';
import type { Category, TransactionType } from '../types/index.js';
import { legacyIdToUuid } from './legacy-id.js';

export interface LegacyCategoryInput {
  entityType?: string;
  legacyId: number | string;
  name: string | undefined | null;
  type: unknown;
  icon?: number | string | undefined | null;
  isDefault?: boolean;
}

export interface MappedLegacyCategory {
  id: string;
  name: string;
  type: TransactionType;
  icon: string;
  isDefault: boolean;
}

const LEGACY_CATEGORY_NAME_OVERRIDES: Record<string, string> = {
  Essen: 'category_food',
  Einkaufen: 'category_shopping',
  // Legacy "Schatz" is a distinct heart/partner category; keep it custom.
  Schatz: 'Schatz',
  Auto: 'category_travel',
  Umbuchung: 'category_transfer',
};

const LEGACY_CATEGORY_NAME_TO_KEY: Record<string, string> = {
  ...CATEGORY_NAME_TO_KEY,
  ...LEGACY_CATEGORY_NAME_OVERRIDES,
};

const LEGACY_ICON_MAP: Record<TransactionType, Record<string, string>> = {
  expense: {
    kategorie_ausgaben_1: 'cash',
    kategorie_ausgaben_2: 'house',
    kategorie_ausgaben_3: 'lucide:food',
    kategorie_ausgaben_4: 'lucide:shopping',
    kategorie_ausgaben_5: 'lucide:book',
    kategorie_ausgaben_6: 'present',
    kategorie_ausgaben_7: 'lucide:briefcase',
    kategorie_ausgaben_8: 'lucide:wifi',
    kategorie_ausgaben_9: 'lucide:heart',
    kategorie_ausgaben_10: 'lucide:scissors',
    kategorie_ausgaben_11: 'lucide:star',
    kategorie_ausgaben_12: 'handy',
    kategorie_ausgaben_13: 'lucide:smile',
    kategorie_ausgaben_14: 'lucide:bus',
    kategorie_ausgaben_15: 'lucide:plane',
    kategorie_ausgaben_16: 'lucide:car',
    kategorie_ausgaben_17: 'pig',
  },
  income: {
    kategorie_einnahmen_1: 'cash',
    kategorie_einnahmen_2: 'money',
    kategorie_einnahmen_3: 'pig',
    kategorie_einnahmen_4: 'present',
    kategorie_einnahmen_5: 'lucide:briefcase',
  },
};

const LEGACY_ICON_PREFIX: Record<TransactionType, string> = {
  expense: 'kategorie_ausgaben',
  income: 'kategorie_einnahmen',
};

const FALLBACK_ICON: Record<TransactionType, string> = {
  expense: 'lucide:shopping',
  income: 'cash',
};

export function toLegacyTransactionType(raw: unknown): TransactionType {
  if (typeof raw === 'boolean') return raw ? 'income' : 'expense';
  if (typeof raw === 'number') return raw === 1 ? 'income' : 'expense';

  const normalized = String(raw).trim().toLowerCase();
  if (normalized === 'income' || normalized === 'bt_income') return 'income';
  if (normalized === 'expense' || normalized === 'bt_expense') return 'expense';
  return 'expense';
}

export function normalizeLegacyCategoryName(name: string | undefined | null): string {
  const trimmed = (name ?? '').trim();
  if (!trimmed) return 'category_general';

  const direct = LEGACY_CATEGORY_NAME_TO_KEY[trimmed];
  if (direct) return direct;

  const caseInsensitive = Object.entries(LEGACY_CATEGORY_NAME_TO_KEY)
    .find(([legacyName]) => legacyName.toLowerCase() === trimmed.toLowerCase());

  return caseInsensitive?.[1] ?? trimmed;
}

export function legacyCategoryIconKey(
  rawIcon: number | string | undefined | null,
  rawType: unknown,
): string {
  const type = toLegacyTransactionType(rawType);
  if (rawIcon === undefined || rawIcon === null || rawIcon === '') return FALLBACK_ICON[type];

  const iconName = typeof rawIcon === 'number'
    ? `${LEGACY_ICON_PREFIX[type]}_${rawIcon}`
    : String(rawIcon).trim();

  return LEGACY_ICON_MAP[type][iconName] ?? FALLBACK_ICON[type];
}

export function findDefaultCategoryForLegacy(
  name: string | undefined | null,
  rawType: unknown,
): Readonly<Category> | undefined {
  const type = toLegacyTransactionType(rawType);
  const trimmed = (name ?? '').trim();

  // A name that already looks like a translation key (e.g. "category_household")
  // is treated as user-created at this source-mapping boundary. The target
  // account's import step is responsible for any later default matching.
  if (trimmed.toLowerCase().startsWith('category_')) {
    return undefined;
  }

  const normalizedName = normalizeLegacyCategoryName(name);

  return DEFAULT_CATEGORIES.find((category) =>
    category.type === type &&
    category.name.toLowerCase() === normalizedName.toLowerCase()
  );
}

export function mapLegacyCategoryToMigrationCategory(input: LegacyCategoryInput): MappedLegacyCategory {
  const type = toLegacyTransactionType(input.type);

  // Only attempt to match against system defaults when the legacy app's own
  // signal (ZISSTANDARD for iOS, deletable for Android SQLite) marks this as
  // a system-seeded category (isDefault === true). User-created categories
  // must remain custom in the mapped migration payload, even if their name
  // normalises to a default key. The target-account import layer may later
  // canonicalize that payload against an existing seeded default.
  const matchedDefault = (input.isDefault === true)
    ? findDefaultCategoryForLegacy(input.name, type)
    : undefined;

  if (matchedDefault) {
    return {
      id: matchedDefault.id,
      name: matchedDefault.name,
      type: matchedDefault.type,
      icon: matchedDefault.icon ?? legacyCategoryIconKey(input.icon, type),
      isDefault: true,
    };
  }

  return {
    id: legacyIdToUuid(input.entityType ?? 'category', input.legacyId),
    name: (input.name ?? '').trim() || 'Unbekannte Kategorie',
    type,
    icon: legacyCategoryIconKey(input.icon, type),
    isDefault: false,
  };
}
