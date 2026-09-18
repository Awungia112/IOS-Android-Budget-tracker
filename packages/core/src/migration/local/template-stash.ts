/**
 * Template Stash — persisted storage for templates belonging to online accounts
 * that were imported during local migration but whose server-side records have
 * not yet been created (the online migration runs in a later session).
 *
 * Key design decisions:
 * - Backed by Capacitor Preferences (same store as the migration_performed flag
 *   in orchestrator.ts). On iOS/Android this maps to UserDefaults/SharedPreferences
 *   and has the same durability guarantee as the flag — the stash cannot be evicted
 *   by OS storage pressure while the flag survives, so the silent-loss scenario
 *   (flag = done, stash = empty) cannot occur.
 * - Keyed by server account key (onlineId / remoteId), NOT by local UUID.
 *   The online pipeline receives a server account ID and never produces the
 *   local UUID, so local UUIDs are useless as lookup keys here.
 * - Stores raw legacy-shaped data (name, amount, type, plus source category
 *   name + type) so the online migration can create templates without the
 *   local DB being present or populated.
 * - Write semantics are put/overwrite per key — retry and crash-replay are
 *   the only re-run paths, so appending would accumulate duplicates.
 */

import { Preferences } from '@capacitor/preferences';
import type { TransactionType } from '../../types/index.js';

// =============================================================================
// TYPES
// =============================================================================

/**
 * A single stashed template — raw legacy shape, category resolved by name+type
 * rather than by UUID (UUIDs are local-only; the online pipeline uses server IDs).
 */
export interface StashedTemplate {
  /** Template name, e.g. "Groceries" */
  name: string;
  /** Amount in decimal euros, e.g. 12.34 */
  amount: number;
  /** Transaction type */
  type: TransactionType;
  /** Category name (translation key or custom) needed by TICKET-4 to resolve
   *  the category on the server side */
  categoryName: string;
  /** Category type — needed alongside categoryName to disambiguate when a
   *  custom category name collides across income/expense */
  categoryType: TransactionType;
}

/**
 * The full stash map, keyed by server account key (onlineId / remoteId).
 * Value is always an array — one entry per template for that account.
 */
export type TemplateStash = Record<string, StashedTemplate[]>;

// =============================================================================
// STORAGE KEY
// =============================================================================

export const TEMPLATE_STASH_KEY = 'migration_template_stash';

// =============================================================================
// INTERNAL HELPERS
// =============================================================================

/**
 * Reads the stash from Preferences.
 *
 * Intentionally defensive — any parse or read error degrades to an empty
 * object. Corrupt or missing storage is recoverable: the online migration
 * simply has no stash to consume. A bad read must never abort the caller.
 */
async function readStash(): Promise<TemplateStash> {
  try {
    const { value } = await Preferences.get({ key: TEMPLATE_STASH_KEY });
    if (!value) return {};
    const parsed = JSON.parse(value);
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return {};
    return parsed as TemplateStash;
  } catch {
    return {};
  }
}

/**
 * Writes the stash to Preferences.
 *
 * Intentionally non-swallowing — errors propagate to the caller. A failed
 * write means the stash was NOT persisted; silently ignoring it would let
 * the migration complete while templates are silently lost. The caller
 * (putStashedTemplates) is expected to let the error surface so the
 * migration orchestrator can treat it as a non-fatal warning or retry.
 */
async function writeStash(stash: TemplateStash): Promise<void> {
  await Preferences.set({ key: TEMPLATE_STASH_KEY, value: JSON.stringify(stash) });
}

// =============================================================================
// PUBLIC API
// =============================================================================

/**
 * Writes (overwrites) the template list for a single server account key.
 * Idempotent — calling this twice with the same key leaves exactly one entry.
 * No-op when templates is empty (avoids phantom keys).
 *
 * @param serverAccountKey - The onlineId / remoteId of the legacy account
 * @param templates - Templates to stash for that account
 * @throws if the underlying Preferences write fails (e.g. storage unavailable).
 *   The caller should treat this as a non-fatal migration warning so the user
 *   can be informed that templates for this account were not stashed.
 */
export async function putStashedTemplates(
  serverAccountKey: string,
  templates: StashedTemplate[],
): Promise<void> {
  if (templates.length === 0) return;
  const stash = await readStash();
  stash[serverAccountKey] = templates;
  await writeStash(stash);
}

/**
 * Returns the stashed templates for a server account key, or an empty array
 * if no entry exists.
 *
 * @param serverAccountKey - The onlineId / remoteId of the legacy account
 */
export async function getStashedTemplates(serverAccountKey: string): Promise<StashedTemplate[]> {
  const stash = await readStash();
  const value = stash[serverAccountKey];
  return Array.isArray(value) ? value : [];
}

/**
 * Removes the stash entry for a single server account key.
 * Called by TICKET-5 once the online migration has consumed the templates.
 *
 * @param serverAccountKey - The onlineId / remoteId of the legacy account
 */
export async function deleteStashedTemplates(serverAccountKey: string): Promise<void> {
  const stash = await readStash();
  delete stash[serverAccountKey];
  await writeStash(stash);
}

/**
 * Returns true if there is at least one stashed template entry.
 * Useful for the online migration banner / gate to know whether any work remains.
 */
export async function hasAnyStashedTemplates(): Promise<boolean> {
  const stash = await readStash();
  return Object.keys(stash).length > 0;
}
