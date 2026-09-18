/**
 * Category Mappings & Presets
 * Single source of truth for all category-related constants.
 * Used by core (migrations, validation) and app (UI, translations).
 */

import type { TransactionType } from '../types/transaction.js';

// =============================================================================
// ICON DEFINITIONS
// =============================================================================

/**
 * Base path for category icons (relative to public folder)
 */
export const ICON_BASE_PATH = '/categories/custom-category-icons';
export const USER_ICON_BASE_PATH = '/categories/user-category-icons';

/**
 * Available preset icons (from Figma design)
 */
export const PRESET_ICONS = {
  cash: `${ICON_BASE_PATH}/cash.svg`,
  money: `${ICON_BASE_PATH}/money.svg`,
  pig: `${ICON_BASE_PATH}/pig.svg`,
  present: `${ICON_BASE_PATH}/present.svg`,
  tool: `${ICON_BASE_PATH}/tool.svg`,
  house: `${ICON_BASE_PATH}/house.svg`,
  entertainment: `${ICON_BASE_PATH}/entertainment.svg`,
  party: `${ICON_BASE_PATH}/party.svg`,
  handy: `${ICON_BASE_PATH}/handy.svg`,
} as const;

/**
 * User-selectable icons for custom categories
 */
export const USER_SELECTABLE_ICONS = {
  landscape: `${USER_ICON_BASE_PATH}/Landscape-Pastel.svg`,
  pineapple: `${USER_ICON_BASE_PATH}/Pineapple.svg`,
  spaFlower: `${USER_ICON_BASE_PATH}/Spa-Flower.svg`,
} as const;

/**
 * All available icons combined
 */
export const ALL_ICONS = {
  ...PRESET_ICONS,
  ...USER_SELECTABLE_ICONS,
} as const;

// Type definitions for icons
export type PresetIconKey = keyof typeof PRESET_ICONS;
export type UserIconKey = keyof typeof USER_SELECTABLE_ICONS;
export type CategoryIconKey = keyof typeof ALL_ICONS;

/**
 * List of icon keys for iteration
 */
export const PRESET_ICON_KEYS = Object.keys(PRESET_ICONS) as PresetIconKey[];
export const USER_ICON_KEYS = Object.keys(USER_SELECTABLE_ICONS) as UserIconKey[];
export const ALL_ICON_KEYS = Object.keys(ALL_ICONS) as CategoryIconKey[];

// =============================================================================
// CATEGORY COLORS (from Figma design)
// =============================================================================

export const CATEGORY_COLORS = {
  green: '#1DB155',      // Income
  pink: '#E33B80',       // Expense
  orange: '#CE7D62',
  purple: '#452FA8',
  blue: '#2E9DDC',
  magenta: '#C82EDC',
  teal: '#3FCB72',
} as const;

export type CategoryColor = typeof CATEGORY_COLORS[keyof typeof CATEGORY_COLORS];

// =============================================================================
// CATEGORY PRESETS
// =============================================================================

/**
 * Category preset definition
 * Bundles translation key, icon, and suggested color
 */
export interface CategoryPreset {
  id: string;
  nameKey: string;
  icon?: PresetIconKey;
  color: string;
  type: TransactionType;
}

/**
 * Default category presets (matching DEFAULT_CATEGORIES in config.ts)
 */
export const CATEGORY_PRESETS: CategoryPreset[] = [
  // Income presets
  { id: 'income-general', nameKey: 'category_general', icon: 'cash', color: '#059669', type: 'income' },
  { id: 'income-salary', nameKey: 'category_salary', icon: 'money', color: '#059669', type: 'income' },
  { id: 'income-allowance', nameKey: 'category_allowance', icon: 'pig', color: '#84CC16', type: 'income' },
  { id: 'income-gift', nameKey: 'category_gift', icon: 'present', color: '#F472B6', type: 'income' },

  // Expense presets
  { id: 'expense-general', nameKey: 'category_general', icon: 'cash', color: CATEGORY_COLORS.pink, type: 'expense' },
  { id: 'expense-household', nameKey: 'category_household', icon: 'house', color: CATEGORY_COLORS.orange, type: 'expense' },
  { id: 'expense-entertainment', nameKey: 'category_entertainment', icon: 'entertainment', color: CATEGORY_COLORS.purple, type: 'expense' },
  { id: 'expense-party', nameKey: 'category_party', icon: 'party', color: CATEGORY_COLORS.magenta, type: 'expense' },
  { id: 'expense-mobile', nameKey: 'category_mobile', icon: 'handy', color: CATEGORY_COLORS.blue, type: 'expense' },
  { id: 'expense-savings', nameKey: 'category_savings', icon: 'pig', color: CATEGORY_COLORS.teal, type: 'expense' },

  // New income presets (no SVG icon - uses Lucide fallback)
  { id: 'income-holiday_job', nameKey: 'category_holiday_job', color: '#059669', type: 'income' },
  { id: 'income-transfer', nameKey: 'category_transfer', color: '#6366F1', type: 'income' },

  // New expense presets (no SVG icon - uses Lucide fallback)
  { id: 'expense-food', nameKey: 'category_food', color: '#06B6D4', type: 'expense' },
  { id: 'expense-shopping', nameKey: 'category_shopping', color: '#EC4899', type: 'expense' },
  { id: 'expense-books', nameKey: 'category_books', color: '#8B5CF6', type: 'expense' },
  { id: 'expense-gift', nameKey: 'category_gift', color: '#F472B6', type: 'expense' },
  { id: 'expense-office', nameKey: 'category_office', color: '#64748B', type: 'expense' },
  { id: 'expense-internet', nameKey: 'category_internet', color: '#0EA5E9', type: 'expense' },
  { id: 'expense-clothing', nameKey: 'category_clothing', color: '#EC4899', type: 'expense' },
  { id: 'expense-hobby', nameKey: 'category_hobby', color: '#A855F7', type: 'expense' },
  { id: 'expense-going_out', nameKey: 'category_going_out', color: '#A78BFA', type: 'expense' },
  { id: 'expense-bus', nameKey: 'category_bus', color: '#F59E0B', type: 'expense' },
  { id: 'expense-leisure', nameKey: 'category_leisure', color: '#10B981', type: 'expense' },
  { id: 'expense-travel', nameKey: 'category_travel', color: '#14B8A6', type: 'expense' },
  { id: 'expense-vacation', nameKey: 'category_vacation', color: '#14B8A6', type: 'expense' },
  { id: 'expense-utilities', nameKey: 'category_utilities', color: '#FBBF24', type: 'expense' },

  // Youth-focused income presets
  { id: 'income-tutoring', nameKey: 'category_tutoring', color: '#059669', type: 'income' },
  { id: 'income-selling_online', nameKey: 'category_selling_online', color: '#F59E0B', type: 'income' },
  { id: 'income-babysitting', nameKey: 'category_babysitting', color: '#EC4899', type: 'income' },
  { id: 'income-scholarship', nameKey: 'category_scholarship', color: '#3B82F6', type: 'income' },
  { id: 'income-cashback', nameKey: 'category_cashback', color: '#10B981', type: 'income' },

  // Youth-focused expense presets
  { id: 'expense-subscriptions', nameKey: 'category_subscriptions', color: '#6366F1', type: 'expense' },
  { id: 'expense-personal_care', nameKey: 'category_personal_care', color: '#F472B6', type: 'expense' },
  { id: 'expense-health', nameKey: 'category_health', color: '#EF4444', type: 'expense' },
  { id: 'expense-education', nameKey: 'category_education', color: '#3B82F6', type: 'expense' },
  { id: 'expense-sports', nameKey: 'category_sports', color: '#10B981', type: 'expense' },
];

/**
 * Get presets by type
 */
export function getPresetsByType(type: TransactionType): CategoryPreset[] {
  return CATEGORY_PRESETS.filter(preset => preset.type === type);
}

/**
 * Get preset by ID
 */
export function getPresetById(id: string): CategoryPreset | undefined {
  return CATEGORY_PRESETS.find(preset => preset.id === id);
}

// =============================================================================
// MIGRATION MAPPINGS (for backwards compatibility)
// =============================================================================

/**
 * Maps category IDs to their default icons.
 * Used for migrating existing categories that don't have icons.
 */
export const CATEGORY_ID_TO_ICON: Record<string, PresetIconKey> = {
  // Income categories
  'income-general': 'cash',
  'income-salary': 'money',
  'income-allowance': 'pig',
  'income-gift': 'present',

  // Expense categories - current IDs
  'expense-general': 'cash',
  'expense-household': 'house',
  'expense-housing': 'house',
  'expense-entertainment': 'entertainment',
  'expense-party': 'party',
  'expense-mobile': 'handy',
  'expense-savings': 'pig',

  // Expense categories - legacy IDs (for migration)
  'expense-office': 'tool',
  'expense-internet': 'handy',
  'expense-treasure': 'pig',
  'expense-clothing': 'present',
  'expense-hobby': 'entertainment',
  'expense-goingout': 'party',
  'expense-bus': 'tool',
  'expense-vacation': 'party',
  'expense-food': 'cash',
  'expense-transport': 'tool',
  'expense-leisure': 'entertainment',
  'expense-utilities': 'house',
  'expense-travel': 'party',
  'expense-misc': 'cash',
};

/**
 * Maps legacy hardcoded category names to translation keys.
 * Supports both German and English legacy names.
 */
export const CATEGORY_NAME_TO_KEY: Record<string, string> = {
  // German legacy names
  'Allgemein': 'category_general',
  'Lohn': 'category_salary',
  'Taschengeld': 'category_allowance',
  'Geschenk': 'category_gift',
  'Haushalt': 'category_household',
  'Wohnen': 'category_housing',
  'Unterhaltung': 'category_entertainment',
  'Party': 'category_party',
  'Handy': 'category_mobile',
  'Sparen': 'category_savings',
  'Kleidung': 'category_clothing',
  'Ausgehen': 'category_going_out',
  'Einkaufen': 'category_shopping',
  'Lebensmittel': 'category_food',
  'Freizeit': 'category_leisure',
  'Reisen': 'category_travel',
  'Sonstiges': 'category_miscellaneous',
  'Büro': 'category_office',
  'Urlaub': 'category_vacation',
  'Nebenkosten': 'category_utilities',
  'Schatz': 'category_savings',
  'Bus': 'category_bus',
  'Hobby': 'category_hobby',
  'Internet': 'category_internet',
  'Transport': 'category_transport',

  'Ferienjob': 'category_holiday_job',
  'Umbuchung': 'category_transfer',
  'Bücher': 'category_books',
  'Nachhilfe': 'category_tutoring',
  'Online-Verkauf': 'category_selling_online',
  'Babysitten': 'category_babysitting',
  'Stipendium': 'category_scholarship',
  'Cashback': 'category_cashback',
  'Abonnements': 'category_subscriptions',
  'Körperpflege': 'category_personal_care',
  'Gesundheit': 'category_health',
  'Bildung': 'category_education',
  'Sport': 'category_sports',

  // English legacy names
  'General': 'category_general',
  'Salary': 'category_salary',
  'Pocket Money': 'category_allowance',
  'Allowance': 'category_allowance',
  'Gift': 'category_gift',
  'Household': 'category_household',
  'Housing': 'category_housing',
  'Entertainment': 'category_entertainment',
  'Mobile': 'category_mobile',
  'Savings': 'category_savings',
  'Clothing': 'category_clothing',
  'Shopping': 'category_shopping',
  'Holiday Job': 'category_holiday_job',
  'Transfer': 'category_transfer',
  'Books': 'category_books',
  'Tutoring': 'category_tutoring',
  'Selling Online': 'category_selling_online',
  'Babysitting': 'category_babysitting',
  'Scholarship': 'category_scholarship',
  'Subscriptions': 'category_subscriptions',
  'Personal Care': 'category_personal_care',
  'Health': 'category_health',
  'Education': 'category_education',
  'Sports': 'category_sports',
  'Going Out': 'category_going_out',
  'Food': 'category_food',
  'Leisure': 'category_leisure',
  'Travel': 'category_travel',
  'Miscellaneous': 'category_miscellaneous',
  'Office': 'category_office',
  'Vacation': 'category_vacation',
  'Utilities': 'category_utilities',
};

// =============================================================================
// ICON UTILITIES
// =============================================================================

/**
 * Get icon path by key
 */
export function getIconPath(key: string | undefined): string | undefined {
  if (!key) return undefined;
  return ALL_ICONS[key as CategoryIconKey];
}

/**
 * Check if a string is a valid icon key
 */
export function isValidIconKey(key: string): key is CategoryIconKey {
  return key in ALL_ICONS;
}

/**
 * Check if a string is a valid preset icon key
 */
export function isPresetIconKey(key: string): key is PresetIconKey {
  return key in PRESET_ICONS;
}
