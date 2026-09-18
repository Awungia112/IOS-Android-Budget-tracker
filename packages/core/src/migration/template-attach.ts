/**
 * Template Attach — Attach stashed templates during online migration (TICKET-5)
 *
 * Reads templates that were stashed during local migration for skipped online
 * accounts, resolves their category references against the local DB, creates
 * them, and clears the stash entry.
 *
 * Call site: migration.service.ts — after importData(), before pushQueueForAccount().
 */

import { v5 as uuidv5 } from 'uuid';
import type { Template, TransactionType } from '../types/index.js';
import type { StashedTemplate } from './local/template-stash.js';
import { getStashedTemplates, deleteStashedTemplates } from './local/template-stash.js';
import { TemplateRepository } from '../repositories/template.repository.js';
import { CategoryRepository } from '../repositories/category.repository.js';
import { changeLog } from '../changelog/change-log.js';
import { loadAccountKey } from '../crypto/account-key.js';
import { getAccountSyncMetadata } from '../sync/account-sync-metadata.js';
import { findDefaultCategoryForLegacy } from './legacy-category-mapping.js';
import { COMMAND_TYPES } from '../commands/types.js';
import type { Category, Template as TemplateType } from '../types/index.js';

// Stable namespace UUID for deterministic template IDs (UUIDv5).
// Must never change — altering it would generate new IDs for existing templates.
const TEMPLATE_ID_NAMESPACE = '6ba7b810-9dad-11d1-80b4-00c04fd430c8'; // UUID v5 URL namespace

const templateRepo = new TemplateRepository();
const categoryRepo = new CategoryRepository();

export interface AttachResult {
  attached: number;
  skipped: number;
  /**
   * Transient failures only (creation throw, changelog throw, stash I/O).
   * A non-empty array prevents stash deletion so the run can be retried.
   */
  errors: string[];
  /**
   * Permanent skips (unresolvable category, already-exists).
   * These are terminal — the stash entry is still cleared even when this
   * array is non-empty, so they never pin the entry across sessions.
   */
  permanentSkips: string[];
}

/**
 * Derive a deterministic, collision-free template ID from its stable identity.
 *
 * Using UUIDv5 (SHA-1 namespace hash) over the concatenated key fields means
 * re-attaching the same logical template always yields the same UUID, so
 * partial-failure re-runs cannot create duplicates even without a DB lookup.
 */
function deriveTemplateId(
  legacyAccountKey: string,
  name: string,
  categoryId: string,
  type: TransactionType,
  amount: number,
): string {
  const key = `${legacyAccountKey}:${name}:${categoryId}:${type}:${amount}`;
  return uuidv5(key, TEMPLATE_ID_NAMESPACE);
}

/**
 * Resolve the account key for a local account so ChangeLog records are encrypted.
 */
async function resolveAccountKey(
  localAccountId: string,
): Promise<Uint8Array | undefined> {
  const metadata = await getAccountSyncMetadata(localAccountId);
  if (!metadata) return undefined;

  try {
    const key = await loadAccountKey(metadata.serverAccountId);
    return key ?? undefined;
  } catch {
    return undefined;
  }
}

/**
 * Build an in-memory category lookup map for the given account.
 * Key: `normalizedName:type`  →  Value: category id
 */
async function buildCategoryMap(
  localAccountId: string,
): Promise<Map<string, string>> {
  const categories = await categoryRepo.getByAccountId(localAccountId);
  const map = new Map<string, string>();
  for (const cat of categories) {
    map.set(`${cat.name}:${cat.type}`, cat.id);
  }
  return map;
}

/**
 * Build the existing-template id set and identity set from a single DB read.
 * Returns both so callers avoid querying the same account templates twice.
 *
 * - idSet: deterministic IDs (for fast O(1) duplicate detection on new-style entries)
 * - identitySet: composite `name:amount:type:categoryId` keys (fallback for
 *   templates created before deterministic IDs were introduced)
 */
async function buildExistingTemplateSets(
  localAccountId: string,
): Promise<{ idSet: Set<string>; identitySet: Set<string> }> {
  const existing = await templateRepo.getByAccountId(localAccountId);
  const idSet = new Set<string>();
  const identitySet = new Set<string>();
  for (const t of existing) {
    idSet.add(t.id);
    identitySet.add(`${t.name}:${t.amount}:${t.type}:${t.categoryId}`);
  }
  return { idSet, identitySet };
}

/**
 * Attach stashed templates for a given account during online migration.
 *
 * - Reads stashed templates keyed by the legacy account id (the same key
 *   local migration used via serverAccountKey() — account.onlineId ??
 *   account.remoteId — NOT the id of the account newly created on this
 *   session's server, which has no relation to that key).
 * - Resolves each template's category against a pre-built in-memory map (O(1)).
 * - Derives a deterministic UUID per template so re-attach is idempotent.
 * - Skips templates with unresolvable categories (permanent skip — logged in
 *   result.permanentSkips, does NOT block stash deletion).
 * - Skips templates that already exist (idempotent on re-entry).
 * - Logs CREATE_TEMPLATE commands so the push pipeline picks them up.
 * - Clears the stash entry when there are no transient failures, even if some
 *   templates were permanently skipped.
 * - Never throws — errors are logged in the returned result.
 */
export async function attachPendingTemplates(
  localAccountId: string,
  legacyAccountKey: string,
): Promise<AttachResult> {
  const result: AttachResult = { attached: 0, skipped: 0, errors: [], permanentSkips: [] };

  let stashedTemplates: StashedTemplate[];
  try {
    stashedTemplates = await getStashedTemplates(legacyAccountKey);
  } catch (err) {
    result.errors.push(
      `Failed to read stash: ${err instanceof Error ? err.message : 'Unknown error'}`,
    );
    return result;
  }

  if (stashedTemplates.length === 0) {
    return result;
  }

  const accountKey = await resolveAccountKey(localAccountId);

  // --- hoist DB reads out of the loop (fixes N+1) ---
  let categoryMap: Map<string, string>;
  let existingIds: Set<string>;
  let existingIdentities: Set<string>;
  try {
    const [catMap, templateSets] = await Promise.all([
      buildCategoryMap(localAccountId),
      buildExistingTemplateSets(localAccountId),
    ]);
    categoryMap = catMap;
    existingIds = templateSets.idSet;
    existingIdentities = templateSets.identitySet;
  } catch (err) {
    result.errors.push(
      `Failed to load account data: ${err instanceof Error ? err.message : 'Unknown error'}`,
    );
    return result;
  }

  for (const stashed of stashedTemplates) {
    try {
      // Mirror transformCategories()'s own resolution exactly: a legacy
      // category only gets mapped to a Budget Wise default when a default of
      // the SAME type+normalized-name exists (e.g. there is no expense-typed
      // "category_transfer" default — only income — so an expense "Umbuchung"
      // stays a raw custom category named "Umbuchung", never normalized).
      // Looking up by the normalized name unconditionally (as before) missed
      // exactly that case. Fall back to the raw stashed name when no default matches.
      const matchedDefault = findDefaultCategoryForLegacy(stashed.categoryName, stashed.categoryType);
      const lookupKey = matchedDefault
        ? `${matchedDefault.name}:${matchedDefault.type}`
        : `${stashed.categoryName}:${stashed.categoryType}`;
      const categoryId = categoryMap.get(lookupKey) ?? null;

      if (!categoryId) {
        // Permanent skip — category will never appear; do not block stash deletion.
        result.permanentSkips.push(
          `Template "${stashed.name}" skipped: category "${stashed.categoryName}" (${stashed.categoryType}) not found`,
        );
        result.skipped++;
        continue;
      }

      const deterministicId = deriveTemplateId(
        legacyAccountKey,
        stashed.name,
        categoryId,
        stashed.type,
        stashed.amount,
      );

      // Check by deterministic id first, then fall back to identity match for
      // templates that were created before deterministic ids were introduced.
      const identityKey = `${stashed.name}:${stashed.amount}:${stashed.type}:${categoryId}`;
      if (existingIds.has(deterministicId) || existingIdentities.has(identityKey)) {
        result.skipped++;
        continue;
      }

      const template: Template = {
        id: deterministicId,
        name: stashed.name,
        amount: stashed.amount,
        categoryId,
        type: stashed.type,
        accountId: localAccountId,
      };

      await templateRepo.create(template);

      await changeLog.append(
        {
          type: COMMAND_TYPES.CREATE_TEMPLATE,
          timestamp: new Date().toISOString(),
          payload: template,
        },
        localAccountId,
        accountKey,
      );

      // Keep the in-memory sets consistent so subsequent entries in the same
      // batch cannot produce duplicates.
      existingIds.add(deterministicId);
      existingIdentities.add(identityKey);

      result.attached++;
    } catch (err) {
      // Transient failure — will block stash deletion so the run can be retried.
      result.errors.push(
        `Failed to attach template "${stashed.name}": ${err instanceof Error ? err.message : 'Unknown error'}`,
      );
    }
  }

  // Clear stash when there are no transient failures.
  // Permanent skips (result.permanentSkips) are terminal and must not pin the entry.
  if (result.errors.length === 0) {
    try {
      await deleteStashedTemplates(legacyAccountKey);
    } catch (err) {
      result.errors.push(
        `Failed to clear stash: ${err instanceof Error ? err.message : 'Unknown error'}`,
      );
    }
  }

  return result;
}
