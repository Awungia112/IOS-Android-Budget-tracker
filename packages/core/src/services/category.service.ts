import { Category, TransactionType } from '../types/index.js';
import {
  CATEGORY_COLORS,
  CATEGORY_NAME_TO_KEY,
  CATEGORY_PRESETS,
  getPresetById,
} from '../constants/category-mappings.js';

/**
 * CategoryService - Static utility methods for category operations
 *
 * Provides color resolution and translation key handling.
 * CRUD operations are handled directly via repositories in BudgetContext.
 */
export class CategoryService {
  // ===========================================================================
  // STATIC COLOR UTILITIES
  // ===========================================================================

  /**
   * Get default color for a category type
   * @public
   */
  static getDefaultColor(type: TransactionType): string {
    return type === 'income' ? CATEGORY_COLORS.green : CATEGORY_COLORS.pink;
  }

  /**
   * Resolve the display color for a category
   * @public
   */
  static resolveColor(category: Category): string {
    // Use custom color if set
    if (category.color) {
      return category.color;
    }

    // Check if it's a preset category (by stable ID)
    const preset = getPresetById(category.id);
    if (preset) {
      return preset.color;
    }

    // Fallback: match by nameKey (handles categories whose ID was replaced with UUID)
    const presetByName = CATEGORY_PRESETS.find((p) => p.nameKey === category.name);
    if (presetByName) {
      return presetByName.color;
    }

    // Fall back to type default
    return CategoryService.getDefaultColor(category.type);
  }

  // ===========================================================================
  // STATIC TRANSLATION UTILITIES
  // ===========================================================================

  /**
   * Check if a name is a translation key
   * @public
   */
  static isTranslationKey(name: string): boolean {
    return name.startsWith('category_');
  }

  /**
   * Get translation key for a legacy name (if exists)
   * @public
   */
  static getLegacyNameKey(name: string): string | null {
    return Object.prototype.hasOwnProperty.call(CATEGORY_NAME_TO_KEY, name) ? CATEGORY_NAME_TO_KEY[name] : null;
  }

  /**
   * Resolve name to translation key
   * Returns the translation key if the name is a legacy name or already a key
   * @public
   */
  static resolveTranslationKey(name: string): string {
    if (CategoryService.isTranslationKey(name)) {
      return name;
    }
    return CategoryService.getLegacyNameKey(name) || name;
  }
}
