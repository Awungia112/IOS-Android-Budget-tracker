/**
 * Category Icons - Re-exports from @budget/core
 *
 * This file re-exports icon utilities from the core package.
 * All icon definitions and utilities are centralized in core.
 */

export {
  // Types
  type CategoryIconKey,

  // Utility functions
  getIconPath,
} from '@budget/core';

// Backwards compatibility aliases used in app
import { ALL_ICONS, type CategoryIconKey } from '@budget/core';

/** @deprecated Use ALL_ICONS from @budget/core */
export const allCategoryIcons = ALL_ICONS;

/** @deprecated Use CategoryIconKey from @budget/core */
export type AllIconKey = CategoryIconKey;
