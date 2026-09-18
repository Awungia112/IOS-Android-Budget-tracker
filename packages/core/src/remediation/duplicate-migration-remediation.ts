import { changeLog } from '../changelog/change-log.js';
import type { ChangeRecord, CommandType, Command } from '../commands/types.js';
import type { Transaction, Category, Limit, RecurringItem, SavingsGoal, Template } from '../types/index.js';
import { Preferences } from '@capacitor/preferences';

export const REMEDIATION_DONE_FLAG_KEY = 'remediation_done';

// Bug window: the duplicate-import retrigger was introduced by commits
// 73e8a45c / 02a798af on 2026-07-29. Any cluster whose *earliest* command
// predates that date cannot be migration-bug-caused by definition, so we
// exclude it from consideration outright. This protects pre-bug manual
// imports/restores from being swept up.
const BUG_WINDOW_START = '2026-07-29T00:00:00.000Z';

// 60-second cluster gap threshold (Phase 1 default, telemetry-validated).
//
// In-burst ceiling: importEntity() is a plain sequential for...of — one
// repository write + one changelog append per entity. Even on a slow
// low-end device under thermal throttling, consecutive entities within a
// single import call land milliseconds to low-single-digit-seconds apart.
//
// Cross-run floor: the retrigger only fires from shouldCheckForLegacySkip()
// on the *next cold start* — a full process teardown-and-relaunch that
// cannot physically happen in under a few seconds. The real-world confirmed
// case showed a gap of several hours.
//
// 60 seconds sits ~1-2 orders of magnitude above the worst plausible
// in-burst gap and ~2 orders of magnitude below even an adversarial
// cross-run gap. The risk is deliberately asymmetric: threshold too low
// risks splitting one legitimate import into two false clusters (data-loss
// risk), threshold too high just risks a missed detection (safe — nothing
// gets touched, fixable by lowering later).
const CLUSTER_GAP_MS = 60_000;

// Hard cap on total records processed per account to prevent runaway work
// on corrupted or unexpectedly large changelogs.
const MAX_RECORDS_PER_ACCOUNT = 50_000;

// Hard cap on clusters evaluated per account.
const MAX_CLUSTERS_PER_ACCOUNT = 200;

// Sample within-cluster gaps at most this many per cluster to bound memory
// without losing the distribution shape needed for threshold validation.
const MAX_WITHIN_CLUSTER_GAP_SAMPLES = 500;

const CREATE_COMMAND_TYPES: readonly CommandType[] = [
  'CREATE_TRANSACTION',
  'CREATE_CATEGORY',
  'CREATE_LIMIT',
  'CREATE_RECURRING',
  'CREATE_SAVINGS_GOAL',
  'CREATE_TEMPLATE',
  'BULK_CREATE_CATEGORIES',
];

function isCreateCommand(type: CommandType): boolean {
  return CREATE_COMMAND_TYPES.includes(type);
}

function normalizeTitle(title: string): string {
  return title.trim().toLowerCase();
}

/**
 * Deterministic, non-cryptographic hash (DJB2 variant).
 *
 * Collision risk is acceptable for this use-case: we only need to avoid
 * accidental collisions within one user's own dataset, not resist an
 * attacker. A 32-bit integer has ~1 / 2^32 collision probability per pair,
 * which is negligible for the typical changelog sizes in a personal budget
 * app (thousands, not billions, of entities).
 */
function hashString(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return hash;
}

interface HashedEntity {
  /** Hash of the entity's deterministic id (natural-key signal from #470). */
  idHash: number;
  /** Hash of the entity's content fingerprint (fallback for pre-#470 duplicates). */
  contentHash: number;
  entityType: CommandType;
  entityId: string;
  sequence: number;
  timestamp: string;
}

function contentHash(command: Command): HashedEntity[] {
  const results: HashedEntity[] = [];

  switch (command.type) {
    case 'CREATE_TRANSACTION': {
      const tx = command.payload as Transaction;
      const day = tx.date.slice(0, 10);
      const contentFingerprint = `${tx.type}|${tx.amount}|${day}|${normalizeTitle(tx.title)}`;
      results.push({
        idHash: hashString(tx.id),
        contentHash: hashString(contentFingerprint),
        entityType: command.type,
        entityId: tx.id,
        sequence: command.sequence,
        timestamp: command.timestamp,
      });
      break;
    }
    case 'CREATE_CATEGORY': {
      const cat = command.payload as Category;
      const contentFingerprint = `${cat.type}|${normalizeTitle(cat.name)}`;
      results.push({
        idHash: hashString(cat.id),
        contentHash: hashString(contentFingerprint),
        entityType: command.type,
        entityId: cat.id,
        sequence: command.sequence,
        timestamp: command.timestamp,
      });
      break;
    }
    case 'CREATE_LIMIT': {
      const limit = command.payload as Limit;
      const contentFingerprint = `${limit.amount}|${limit.categoryId}`;
      results.push({
        idHash: hashString(limit.id),
        contentHash: hashString(contentFingerprint),
        entityType: command.type,
        entityId: limit.id,
        sequence: command.sequence,
        timestamp: command.timestamp,
      });
      break;
    }
    case 'CREATE_RECURRING': {
      const rec = command.payload as RecurringItem;
      const contentFingerprint = `${rec.amount}|${rec.categoryId}|${rec.name}|${rec.startDate}|${rec.frequency}`;
      results.push({
        idHash: hashString(rec.id),
        contentHash: hashString(contentFingerprint),
        entityType: command.type,
        entityId: rec.id,
        sequence: command.sequence,
        timestamp: command.timestamp,
      });
      break;
    }
    case 'CREATE_SAVINGS_GOAL': {
      const goal = command.payload as SavingsGoal;
      const contentFingerprint = `${goal.name}|${goal.targetAmount}|${goal.categoryId ?? ''}|${goal.deadline}`;
      results.push({
        idHash: hashString(goal.id),
        contentHash: hashString(contentFingerprint),
        entityType: command.type,
        entityId: goal.id,
        sequence: command.sequence,
        timestamp: command.timestamp,
      });
      break;
    }
    case 'CREATE_TEMPLATE': {
      const tmpl = command.payload as Template;
      const contentFingerprint = `${tmpl.amount}|${tmpl.categoryId}|${tmpl.name}`;
      results.push({
        idHash: hashString(tmpl.id),
        contentHash: hashString(contentFingerprint),
        entityType: command.type,
        entityId: tmpl.id,
        sequence: command.sequence,
        timestamp: command.timestamp,
      });
      break;
    }
    case 'BULK_CREATE_CATEGORIES': {
      const categories = (command.payload as { categories: Category[] }).categories;
      for (const cat of categories) {
        const contentFingerprint = `${cat.type}|${normalizeTitle(cat.name)}`;
        results.push({
          idHash: hashString(cat.id),
          contentHash: hashString(contentFingerprint),
          entityType: 'CREATE_CATEGORY',
          entityId: cat.id,
          sequence: command.sequence,
          timestamp: command.timestamp,
        });
      }
      break;
    }
    default:
      break;
  }

  return results;
}

interface Cluster {
  records: ChangeRecord[];
  startTimestamp: string;
  endTimestamp: string;
  startSequence: number;
  endSequence: number;
}

function clusterRecords(records: ChangeRecord[]): Cluster[] {
  const filtered = records.filter((r) => isCreateCommand(r.command.type));

  if (filtered.length === 0) return [];

  const clusters: Cluster[] = [];
  let current: Cluster = {
    records: [filtered[0]],
    startTimestamp: filtered[0].timestamp,
    endTimestamp: filtered[0].timestamp,
    startSequence: filtered[0].command.sequence,
    endSequence: filtered[0].command.sequence,
  };

  for (let i = 1; i < filtered.length; i++) {
    const prev = filtered[i - 1];
    const curr = filtered[i];
    const prevTime = new Date(prev.timestamp).getTime();
    const currTime = new Date(curr.timestamp).getTime();
    const gap = currTime - prevTime;

    if (gap > CLUSTER_GAP_MS) {
      clusters.push(current);
      current = {
        records: [curr],
        startTimestamp: curr.timestamp,
        endTimestamp: curr.timestamp,
        startSequence: curr.command.sequence,
        endSequence: curr.command.sequence,
      };
    } else {
      current.records.push(curr);
      current.endTimestamp = curr.timestamp;
      current.endSequence = curr.command.sequence;
    }
  }

  clusters.push(current);
  return clusters;
}

export interface DuplicateMatch {
  accountId: string;
  entityType: string;
  entityId: string;
  hash: number;
  duplicateSequence: number;
  originalSequence: number;
}

export interface RemediationResult {
  accountsAnalyzed: number;
  accountsWithClusters: number;
  totalClusters: number;
  totalDuplicateHashes: number;
  duplicateMatches: DuplicateMatch[];
  gapDistribution: {
    withinClusters: number[];
    betweenClusters: number[];
  };
  wasCapped: boolean;
}

export async function runDuplicateMigrationRemediation(
  getAccounts: () => Promise<Array<{ id: string }>>,
): Promise<RemediationResult> {
  console.log('[Remediation Phase 1] Starting duplicate detection');
  
  const result: RemediationResult = {
    accountsAnalyzed: 0,
    accountsWithClusters: 0,
    totalClusters: 0,
    totalDuplicateHashes: 0,
    duplicateMatches: [],
    gapDistribution: {
      withinClusters: [],
      betweenClusters: [],
    },
    wasCapped: false,
  };

  const accounts = await getAccounts();
  console.log('[Remediation Phase 1] Found', accounts.length, 'accounts to analyze');

  for (const account of accounts) {
    const records = await changeLog.getByAccountId(account.id);
    if (records.length === 0) continue;

    console.log('[Remediation Phase 1] Account', account.id, ':', records.length, 'changelog records');
    result.accountsAnalyzed++;

    const safeRecords = records.length > MAX_RECORDS_PER_ACCOUNT
      ? records.slice(0, MAX_RECORDS_PER_ACCOUNT)
      : records;

    if (safeRecords.length !== records.length) {
      console.warn('[Remediation Phase 1] Account', account.id, 'capped at', MAX_RECORDS_PER_ACCOUNT, 'records');
      result.wasCapped = true;
    }

    const clusters = clusterRecords(safeRecords);
    const postBugClusters = clusters.filter(
      (c) => c.startTimestamp >= BUG_WINDOW_START,
    );
    const preBugClusters = clusters.filter(
      (c) => c.startTimestamp < BUG_WINDOW_START,
    );

    console.log('[Remediation Phase 1] Account', account.id, ':', clusters.length, 'total clusters,', postBugClusters.length, 'post-bug clusters,', preBugClusters.length, 'pre-bug clusters');

    if (postBugClusters.length <= 1) {
      console.log('[Remediation Phase 1] Account', account.id, ': skipping (need 2+ post-bug clusters)');
      continue;
    }

    result.accountsWithClusters++;
    result.totalClusters += Math.min(postBugClusters.length, MAX_CLUSTERS_PER_ACCOUNT);

    const clustersToEvaluate = postBugClusters
      .sort((a, b) => a.startSequence - b.startSequence)
      .slice(0, MAX_CLUSTERS_PER_ACCOUNT);

    if (clustersToEvaluate.length !== postBugClusters.length) {
      console.warn('[Remediation Phase 1] Account', account.id, 'clusters capped at', MAX_CLUSTERS_PER_ACCOUNT);
      result.wasCapped = true;
    }

    console.log('[Remediation Phase 1] Account', account.id, ': evaluating', clustersToEvaluate.length, 'clusters for duplicates');
    console.log('[Remediation Phase 1] Account', account.id, ': cluster details:', clustersToEvaluate.map(c => ({
      startSeq: c.startSequence,
      endSeq: c.endSequence,
      recordCount: c.records.length,
      startTimestamp: c.startTimestamp,
      endTimestamp: c.endTimestamp
    })));

    const seenContentHashes = new Set<number>();
    const contentToOriginalSequence = new Map<number, number>();

    // Seed the seen sets with the last pre-bug cluster (if it exists)
    // This handles the manual-restore scenario where a row was imported before the bug window,
    // then the migration re-imports identical rows after the bug window.
    // Without this, the pre-window original would be invisible and post-window duplicates
    // would be incorrectly treated as originals.
    if (preBugClusters.length > 0) {
      const lastPreBugCluster = preBugClusters.sort((a, b) => b.startSequence - a.startSequence)[0];
      console.log('[Remediation Phase 1] Account', account.id, ': seeding with last pre-bug cluster (seq', lastPreBugCluster.startSequence, '-', lastPreBugCluster.endSequence, ')');
      
      for (const record of lastPreBugCluster.records) {
        const hashes = contentHash(record.command);
        for (const hashedEntity of hashes) {
          seenContentHashes.add(hashedEntity.contentHash);
          contentToOriginalSequence.set(hashedEntity.contentHash, record.command.sequence);
        }
      }
    }

    for (let ci = 0; ci < clustersToEvaluate.length; ci++) {
      const cluster = clustersToEvaluate[ci];

      if (ci > 0) {
        const prev = clustersToEvaluate[ci - 1];
        const gap = new Date(cluster.startTimestamp).getTime() - new Date(prev.endTimestamp).getTime();
        result.gapDistribution.betweenClusters.push(gap);
      }

       for (const record of cluster.records) {
         const hashes = contentHash(record.command);

         for (const hashedEntity of hashes) {
           // An entity is a duplicate if, in a later cluster, its content fingerprint
           // matches something already seen in an earlier cluster. We do NOT check
           // idHash because two ChangeLog records with the same entityId can only
           // represent one physical row (due to Dexie uniqueness and importEntity
           // existence check). Matching by idHash would incorrectly archive the
           // user's only copy of that row.
           const isDuplicate = ci > 0 && seenContentHashes.has(hashedEntity.contentHash);

           if (isDuplicate) {
            result.totalDuplicateHashes++;
            const originalSeq = contentToOriginalSequence.get(hashedEntity.contentHash) ?? -1;
            console.log('[Remediation Phase 1] Duplicate found:', hashedEntity.entityType, 'id:', hashedEntity.entityId, 'seq:', hashedEntity.sequence, 'original seq:', originalSeq);
             result.duplicateMatches.push({
               accountId: account.id,
               entityType: hashedEntity.entityType,
               entityId: hashedEntity.entityId,
               hash: hashedEntity.contentHash,
               duplicateSequence: hashedEntity.sequence,
               originalSequence: originalSeq,
             });
           } else {
             if (!seenContentHashes.has(hashedEntity.contentHash)) {
              seenContentHashes.add(hashedEntity.contentHash);
              contentToOriginalSequence.set(hashedEntity.contentHash, hashedEntity.sequence);
            }
            console.log('[Remediation Phase 1] Original:', hashedEntity.entityType, 'id:', hashedEntity.entityId, 'seq:', hashedEntity.sequence);
           }
         }
       }

      const sampleSize = Math.min(
        cluster.records.length - 1,
        MAX_WITHIN_CLUSTER_GAP_SAMPLES,
      );
      for (let ri = 1; ri <= sampleSize; ri++) {
        const prev = cluster.records[ri - 1];
        const curr = cluster.records[ri];
        const gap = new Date(curr.timestamp).getTime() - new Date(prev.timestamp).getTime();
        result.gapDistribution.withinClusters.push(gap);
      }
    }

    console.log('[Remediation Phase 1] Account', account.id, ': found', result.duplicateMatches.filter(m => m.accountId === account.id).length, 'duplicate matches');
  }

  console.log('[Remediation Phase 1] Complete:', result.accountsAnalyzed, 'accounts,', result.accountsWithClusters, 'with clusters,', result.totalDuplicateHashes, 'duplicate hashes');
  return result;
}

export async function isRemediationDone(): Promise<boolean> {
  const { value } = await Preferences.get({ key: REMEDIATION_DONE_FLAG_KEY });
  return value === 'true';
}

export async function markRemediationDone(): Promise<void> {
  await Preferences.set({ key: REMEDIATION_DONE_FLAG_KEY, value: 'true' });
}

const REMEDIATION_IN_PROGRESS_FLAG_KEY = 'remediation_in_progress';
const REMEDIATION_IN_PROGRESS_TIMESTAMP_KEY = 'remediation_in_progress_timestamp';
const REMEDIATION_IN_PROGRESS_TIMEOUT_MS = 60 * 60 * 1000; // 1 hour

export async function isRemediationInProgress(): Promise<boolean> {
  const { value } = await Preferences.get({ key: REMEDIATION_IN_PROGRESS_FLAG_KEY });
  if (value !== 'true') return false;

  // Check if the flag is stale (older than timeout)
  const { value: timestampStr } = await Preferences.get({ key: REMEDIATION_IN_PROGRESS_TIMESTAMP_KEY });
  if (!timestampStr) return false;

  const timestamp = parseInt(timestampStr, 10);
  if (isNaN(timestamp)) return false;

  const age = Date.now() - timestamp;
  if (age > REMEDIATION_IN_PROGRESS_TIMEOUT_MS) {
    console.log('[Remediation] In-progress flag is stale (age:', age, 'ms), clearing and allowing retry');
    await clearRemediationInProgress();
    return false;
  }

  return true;
}

export async function markRemediationInProgress(): Promise<void> {
  await Preferences.set({ key: REMEDIATION_IN_PROGRESS_FLAG_KEY, value: 'true' });
  await Preferences.set({ key: REMEDIATION_IN_PROGRESS_TIMESTAMP_KEY, value: Date.now().toString() });
}

export async function clearRemediationInProgress(): Promise<void> {
  await Preferences.remove({ key: REMEDIATION_IN_PROGRESS_FLAG_KEY });
  await Preferences.remove({ key: REMEDIATION_IN_PROGRESS_TIMESTAMP_KEY });
}

// Phase 2: detect-and-act helpers
import { db } from '../db/index.js';
import { COMMAND_TYPES } from '../commands/types.js';
// changeLog already imported at top

const ARCHIVE_GRACE_DAYS = 30;

function entityTableForType(entityType: string) {
  switch (entityType) {
    case 'CREATE_TRANSACTION': return db.transactions;
    case 'CREATE_CATEGORY': return db.categories;
    case 'CREATE_LIMIT': return db.limits;
    case 'CREATE_RECURRING': return db.recurringItems;
    case 'CREATE_SAVINGS_GOAL': return db.savingsGoals;
    case 'CREATE_TEMPLATE': return db.templates;
    default: return null;
  }
}

/**
 * Apply Phase 2 actions: soft-archive flagged duplicate rows and log UPDATE commands.
 * Returns the number of rows archived.
 */
export async function runDuplicateMigrationRemediationAndAct(
  getAccounts: () => Promise<Array<{ id: string }>>,
): Promise<{ archived: number; result: RemediationResult }> {
  console.log('[Remediation Phase 2] Starting detect-and-act remediation');
  
  const result = await runDuplicateMigrationRemediation(getAccounts);

  console.log('[Remediation Phase 2] Detection complete:', result.totalDuplicateHashes, 'duplicate hashes found');

  if (result.totalDuplicateHashes === 0) {
    if (result.wasCapped) {
      console.log('[Remediation Phase 2] No duplicates found but scan was capped, NOT marking as done for future re-evaluation');
      return { archived: 0, result };
    }
    console.log('[Remediation Phase 2] No duplicates found, marking as done');
    await markRemediationDone();
    return { archived: 0, result };
  }

  console.log('[Remediation Phase 2] Starting archival of', result.duplicateMatches.length, 'duplicate entities');
  let archivedCount = 0;

  // Iterate matches and archive each duplicate entity
  for (const match of result.duplicateMatches) {
    const table = entityTableForType(match.entityType);
    if (!table) {
      console.warn('[Remediation Phase 2] No table found for entity type', match.entityType);
      continue;
    }

    try {
      const existing = await table.get(match.entityId);
      if (!existing) {
        console.warn('[Remediation Phase 2] Entity not found', match.entityId);
        continue;
      }

      // Skip if already archived
      if ((existing as any).archivedAt) {
        console.log('[Remediation Phase 2] Entity already archived', match.entityId);
        continue;
      }

      const archivedAt = new Date().toISOString();
      const updated = { ...existing, archivedAt } as any;

      // Use Dexie transaction to ensure atomicity of archival
      await db.transaction('rw', table, async () => {
        await table.put(updated as any);
      });

      archivedCount++;
      console.log('[Remediation Phase 2] Archived duplicate entity:', match.entityId, 'type:', match.entityType, 'seq:', match.duplicateSequence, 'original seq:', match.originalSequence);
    } catch (err) {
      console.warn('[Remediation Phase 2] Failed to archive entity', match.entityId, err);
    }
  }

  console.log('[Remediation Phase 2] Archival complete:', archivedCount, 'entities archived');
  
  // Only mark remediation done if the scan was not capped
  // If capped, we want to re-evaluate in a future rollout to catch duplicates past the scan window
  if (!result.wasCapped) {
    await markRemediationDone();
  } else {
    console.log('[Remediation Phase 2] Scan was capped, NOT marking as done for future re-evaluation');
  }

  return { archived: archivedCount, result };
}

/**
 * Hard-delete archived rows older than the grace period.
 * This is a device-local cleanup operation only - it does NOT emit DELETE commands
 * to the ChangeLog or sync to other devices. Archived rows are already hidden from
 * the UI by the archivedAt filter, and emitting DELETE commands would cause data loss
 * on other devices that may still be displaying the original row.
 *
 * Returns the number of rows deleted.
 */
export async function purgeArchivedOlderThan(days = ARCHIVE_GRACE_DAYS): Promise<number> {
  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
  let deleted = 0;

  const tables = [
    db.transactions,
    db.categories,
    db.limits,
    db.recurringItems,
    db.savingsGoals,
    db.templates,
  ];

  for (const table of tables) {
    // Some Dexie schemas may not index `archivedAt`. Fall back to scanning all
    // rows and filtering in-memory to avoid schema migration here.
    const allRows = await table.toArray();
    const rows = allRows.filter((r: any) => r.archivedAt && new Date(r.archivedAt).getTime() < cutoff);
    for (const row of rows) {
      try {
        await table.delete((row as any).id);
        deleted++;
      } catch (err) {
        console.warn('[Remediation] Failed to hard-delete archived row', (row as any).id, err);
      }
    }
  }

  return deleted;
}
