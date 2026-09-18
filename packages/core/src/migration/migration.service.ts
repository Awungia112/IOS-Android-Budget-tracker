/**
 * MigrationService - Orchestrates the full legacy data migration flow.
 *
 * Flow: authenticate → fetch → transform (per account) → import (per account)
 *
 * Multi-account support:
 * - The legacy API supports multiple accounts per user (owned + shared via Access).
 * - fetchUserData() returns all accounts and their data in a single LegacyUserData.
 * - This service splits the data by account and calls transform() + importData()
 *   once per active (non-deleted) account.
 * - Deleted accounts are skipped silently.
 *
 * GDPR Compliance:
 * - Credentials are passed as parameters and never stored
 * - Bearer token is held in memory only and discarded after migration
 * - No legacy API URLs or tokens are written to IndexedDB, localStorage, or ChangeLog
 * - ChangeLog entries contain only transformed Budget Wise data, never legacy credentials
 */

import type { BudgetService } from '../services/budget.service.js';
import type { ExportData } from '../types/index.js';
import type { LegacyUserData, LegacyAccount, LegacyAccess } from './legacy-types.js';
import { LegacyApiError } from './legacy-api-client.js';
import { db } from '../db/index.js';
import { createEmptyMigrationResult, createImportedCounts, createPushedCounts, type PushedCounts } from './migration-result.js';
import { uploadQueue } from '../changelog/upload-queue.js';
import { changeLog } from '../changelog/change-log.js';
import type { OnlineAccountsClient } from '../sync/online-accounts-client.js';
import { generateAccountKey, storeAccountKey, wrapAccountKey, loadAccountKey } from '../crypto/account-key.js';
import { upsertAccountSyncMetadata } from '../sync/account-sync-metadata.js';
import { LegacyMemberMigrationService } from './legacy-member-migration.js';
import { attachPendingTemplates } from './template-attach.js';
import { withExclusiveDatabaseOperation, withMigrationInProgress } from './migration-activity.js';

// =============================================================================
// INTERFACES FOR DEPENDENCIES (implemented in Tasks 1 & 2)
// =============================================================================

export interface ILegacyApiClient {
  authenticate(email: string, password: string): Promise<void>;
  fetchUserData(): Promise<LegacyUserData>;
  clearToken(): void;
}

export interface ILegacyDataTransformer {
  transform(data: LegacyUserData): TransformResult;
}

export type { LegacyUserData };

// =============================================================================
// ONLINE ACCOUNT DETECTION
// =============================================================================

/**
 * Result of detecting whether a legacy account was online or shared.
 *
 * Legacy API fields used:
 * - LegacyAccount.last_synced (string | null): if not null, account was synced online
 * - LegacyAccess.role ('owner' | 'member'): indicates sharing
 * - LegacyAccess.user (number | { id: number; email: string; ... }): provides email when it's an object
 */
export interface OnlineAccountDetectionResult {
  isOnline: boolean;
  isShared: boolean;
  ownerEmail?: string;
  memberEmails?: string[];
}

// =============================================================================
// TRANSFORM RESULT
// =============================================================================

export interface TransformResult {
  data: ExportData;
  /**
   * Non-fatal errors from the transform step — e.g. skipped transfer
   * transactions, unmappable category icons, or missing optional fields.
   * The `data` payload is still complete and safe to import.
   * Fatal errors (corrupt input, missing required fields) cause the
   * transformer to throw instead of populating this array.
   */
  errors: string[];
}

// =============================================================================
// ANALYTICS
// =============================================================================

/**
 * Minimal analytics interface — implemented by the app layer (e.g. PostHog, Mixpanel).
 * Defaults to a no-op so the core package has no analytics dependency.
 */
export interface IMigrationAnalytics {
  track(event: string, properties?: Record<string, unknown>): void;
}

const noopAnalytics: IMigrationAnalytics = { track: () => undefined };

/**
 * Callback triggered when a migrated account was detected as online.
 * The app layer can use this to trigger a sync/push operation.
 */
export interface OnOnlineAccountDetectedCallback {
  (accountId: string, detectionResult: OnlineAccountDetectionResult): Promise<void> | void;
}

// =============================================================================
// ONLINE PUSH PROVIDER
// =============================================================================

/**
 * Optional provider for pushing migrated ChangeRecords to an online server.
 * When configured, the migration service will:
 * 1. Generate an account key and upload the wrapped key to the server
 * 2. Encrypt each imported ChangeRecord via seal() into a SymmetricEnvelope
 * 3. Push via POST /v1/accounts/:id/records with change_uuid for idempotency
 *
 * The app layer implements this interface and passes it to migrate().
 */
export interface IMigrationOnlinePushProvider {
  /** Online accounts client for communicating with the new server */
  client: OnlineAccountsClient;
  /** User's own public key for wrapping account keys */
  userPublicKey: Uint8Array;
  /** Pepper used for BLAKE2b-256 email hashing (shared secret with server) */
  emailHashPepper: string;
  /**
   * Optional predicate to determine if a legacy account should be pushed.
   * If omitted, all accounts are pushed when the provider is present.
   */
  shouldPushAccount?: (legacyAccountId: number) => boolean;
  /**
   * BCP-47 language tag (e.g. 'de', 'en') used to localise invite emails sent
   * during member migration. Defaults to 'en' when omitted.
   */
  language?: string;
}

// =============================================================================
// MIGRATION ERROR CODES
// =============================================================================

/**
 * Structured error codes for migration failures.
 * Each code maps to a specific user-facing message in the UI layer.
 */
export type MigrationErrorCode =
  | 'ANDROID_FILE_COPY_FAILED'
  | 'IOS_COREDATA_FILE_NOT_FOUND'
  | 'REALM_KEY_MISSING'
  | 'INTEGRITY_ERROR'
  | 'SCHEMA_MISMATCH'
  | 'NO_ACCOUNT_ACCESS'
  | 'UNKNOWN';

export class MigrationError extends Error {
  constructor(
    message: string,
    public readonly code: MigrationErrorCode,
    public readonly entityType?: string,
  ) {
    super(message);
    this.name = 'MigrationError';
  }
}

// =============================================================================
// MIGRATION TYPES
// =============================================================================

export type MigrationStepName =
  | 'AUTHENTICATING'
  | 'FETCHING'
  | 'TRANSFORMING'
  | 'IMPORTING'
  | 'IMPORTING_ENTITY'
  | 'PUSHING'
  | 'DETECTING'
  | 'COMPLETE';

export type MigrationStep =
  | { step: 'AUTHENTICATING' }
  | { step: 'FETCHING'; entity: string }
  | { step: 'TRANSFORMING' }
  | { step: 'IMPORTING' }
  | { step: 'IMPORTING_ENTITY'; entity: string; current: number; total: number }
  | { step: 'PUSHING'; accountName: string; current: number; total: number }
  | { step: 'DETECTING' }
  | { step: 'COMPLETE'; result: MigrationResult };

export type MigrationResult = {
  success: boolean;
  imported: {
    accounts: number;
    transactions: number;
    categories: number;
    limits: number;
    templates: number;
    recurringItems: number;
    savingsGoals: number;
  };
  /** Counts of records pushed to the online server during migration. */
  pushed: PushedCounts;
  /** Imported account IDs, in order — first entry is the primary account to switch to. */
  importedAccountIds: string[];
  /** Imported accounts with names and per-account counts for the account picker. */
  importedAccounts: {
    id: string;
    name: string;
    initials: string;
    needsOnlinePush?: boolean;
    counts: {
      transactions: number;
      categories: number;
      limits: number;
      templates: number;
      recurringItems: number;
      savingsGoals: number;
    };
  }[];
  skippedAccounts: number;
  skippedAccountIds: string[];
  /**
   * Number of templates skipped during attach (transient + permanent combined).
   * See skippedTemplateReasons for per-template details.
   */
  skippedTemplates: number;
  /**
   * Per-template reason strings for every skipped or permanently-dropped template.
   * Populated from AttachResult.permanentSkips so the UI / audit log can surface them.
   */
  skippedTemplateReasons: string[];
  /**
   * Number of templates permanently dropped (e.g. unresolvable category).
   * A subset of skippedTemplates — these will never succeed on retry.
   */
  permanentlySkippedTemplates: number;
  warnings: string[];
  errors: string[];
  /** Structured error code for the first fatal error, if any. */
  errorCode?: MigrationErrorCode;
  /** How many times the user has retried this migration session. */
  retryCount: number;
};

// =============================================================================
// MIGRATION SERVICE
// =============================================================================

export class MigrationService {
  constructor(
    private apiClient: ILegacyApiClient,
    private transformer: ILegacyDataTransformer,
    private budgetService: BudgetService,
    private analytics: IMigrationAnalytics = noopAnalytics,
    private onOnlineAccountDetected?: OnOnlineAccountDetectedCallback,
  ) { }

  /**
   * Extracts email from a LegacyAccess user field if it's an object with an email property.
   *
   * @param user - The user field from LegacyAccess (can be a number or an object)
   * @returns The email if available, undefined otherwise
   */
  private extractEmail(user: LegacyAccess['user']): string | undefined {
    return typeof user === 'object' && user.email ? user.email : undefined;
  }

  /**
   * Detects whether a legacy account was online or shared.
   *
   * This is a post-step called after migration to determine if the migrated
   * account needs to be pushed to the online server.
   *
   * @param legacyAccount - The legacy account data
   * @param accesses - All access records for the user (to detect sharing)
   * @returns Detection result with online/shared status and email information
   */
  detectOnlineAccount(
    legacyAccount: LegacyAccount,
    accesses: LegacyAccess[],
  ): OnlineAccountDetectionResult {
    // Detect online status: account was synced if last_synced is not null or undefined
    const isOnline = legacyAccount.last_synced != null;

    // Filter accesses for this specific account
    const accountAccesses = accesses.filter(a => a.account === legacyAccount.id);

    // Detect sharing: account is shared if there are member accesses
    const memberAccesses = accountAccesses.filter(a => a.role === 'member');
    const isShared = memberAccesses.length > 0;

    // Extract owner email from the owner access
    const ownerAccess = accountAccesses.find(a => a.role === 'owner');
    const ownerEmail = ownerAccess ? this.extractEmail(ownerAccess.user) : undefined;

    // Extract member emails from member accesses
    const memberEmails: string[] = [];
    for (const access of memberAccesses) {
      const email = this.extractEmail(access.user);
      if (email) {
        memberEmails.push(email);
      }
    }

    return {
      isOnline,
      isShared,
      ownerEmail,
      memberEmails: memberEmails.length > 0 ? memberEmails : undefined,
    };
  }

  /**
   * Verifies that all Dexie tables are empty after a failed import.
   * If any rows remain (partial write), force-wipes the DB and fires
   * a `migration_manual_rollback` analytics event.
   */
  private async verifyRollback(platform: string): Promise<void> {
    const counts = await Promise.all([
      db.accounts.count(),
      db.transactions.count(),
      db.categories.count(),
      db.limits.count(),
      db.templates.count(),
      db.recurringItems.count(),
      db.savingsGoals.count(),
    ]);

    const allEmpty = counts.every(c => c === 0);
    if (!allEmpty) {
      await db.delete();
      this.analytics.track('migration_manual_rollback', { platform });
    }
  }

  /**
   * Extracts a structured MigrationErrorCode from an unknown thrown value.
   */
  private resolveErrorCode(err: unknown): MigrationErrorCode {
    if (err instanceof MigrationError) return err.code;
    if (err instanceof LegacyApiError && err.code === 'NO_ACCOUNT_ACCESS') {
      return 'NO_ACCOUNT_ACCESS';
    }
    const msg = err instanceof Error ? err.message.toLowerCase() : '';
    if (msg.includes('android') && msg.includes('file')) return 'ANDROID_FILE_COPY_FAILED';
    if (msg.includes('coredata') || msg.includes('core_data')) return 'IOS_COREDATA_FILE_NOT_FOUND';
    if (msg.includes('realm') && msg.includes('key')) return 'REALM_KEY_MISSING';
    if (msg.includes('integrity')) return 'INTEGRITY_ERROR';
    if (msg.includes('schema') || msg.includes('version')) return 'SCHEMA_MISMATCH';
    return 'UNKNOWN';
  }

  /**
   * Provisions an account key for online push: generates, wraps with the user's
   * public key, uploads to the server, stores locally, and records sync metadata.
   * Then loads the key onto the BudgetService so subsequent importData calls
   * encrypt their ChangeRecords.
   */
  private async provisionAndLoadKey(
    localAccountId: string,
    accountName: string,
    pushProvider: IMigrationOnlinePushProvider,
  ): Promise<{ serverAccountId: string }> {
    const accountKey = await generateAccountKey();
    const wrappedKey = await wrapAccountKey(accountKey, pushProvider.userPublicKey);
    const created = await pushProvider.client.createAccount({
      wrappedKey,
      epoch: 1,
    });

    await storeAccountKey(created.id, accountKey);
    await upsertAccountSyncMetadata({
      localAccountId,
      serverAccountId: created.id,
      keyEpoch: created.keyEpoch,
    });

    await this.budgetService.loadKeyForAccount(created.id);

    return { serverAccountId: created.id };
  }

  /**
   * Pushes all pending upload queue entries for the given account to the server.
   * Returns the number of records successfully pushed.
   */
  private async pushQueueForAccount(
    localAccountId: string,
    client: OnlineAccountsClient,
    serverAccountId: string,
  ): Promise<number> {
    const entries = await uploadQueue.getAllByAccount(localAccountId);
    if (entries.length === 0) return 0;

    const result = await client.pushChangeRecords({
      accountId: serverAccountId,
      records: entries.map(e => ({
        change_uuid: e.change_uuid,
        encrypted_payload: e.encrypted_payload as unknown as Record<string, unknown>,
      })),
    });

    // Remove pushed entries from the upload queue and mark the corresponding
    // ChangeLog records as synced. Without the markManySynced call, the
    // SyncEngine would re-encrypt and re-push the same records on the next
    // sync trigger, causing 409 conflicts from the server.
    const pushedUuids = result.results.map(r => r.change_uuid);
    if (pushedUuids.length > 0) {
      await uploadQueue.removeMany(pushedUuids);
      await changeLog.markManySynced(pushedUuids);
    }

    return result.results.length;
  }

  /**
   * Determines whether a legacy account should be pushed to the online server.
   */
  private shouldPushAccount(
    legacyAccountId: number,
    pushProvider?: IMigrationOnlinePushProvider,
  ): boolean {
    if (!pushProvider) return false;
    if (!pushProvider.shouldPushAccount) return true;
    return pushProvider.shouldPushAccount(legacyAccountId);
  }

  async migrate(
    email: string,
    password: string,
    onProgress: (step: MigrationStep) => Promise<void> | void,
    retryCount = 0,
    platform = 'unknown',
    pushProvider?: IMigrationOnlinePushProvider,
  ): Promise<MigrationResult> {
    return withExclusiveDatabaseOperation(() =>
      withMigrationInProgress(() =>
        this.runMigration(email, password, onProgress, retryCount, platform, pushProvider),
      ),
    );
  }

  private async runMigration(
    email: string,
    password: string,
    onProgress: (step: MigrationStep) => Promise<void> | void,
    retryCount: number,
    platform: string,
    pushProvider?: IMigrationOnlinePushProvider,
  ): Promise<MigrationResult> {
    const fatalErrors: string[] = [];
    const warnings: string[] = [];
    let firstErrorCode: MigrationErrorCode | undefined;

    try {
      // Step 1: Authenticate
      await onProgress({ step: 'AUTHENTICATING' });
      try {
        await this.apiClient.authenticate(email, password);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Authentication failed';
        throw new Error(`Migration aborted: ${message}`);
      }

      // Step 2: Fetch legacy data
      await onProgress({ step: 'FETCHING', entity: 'transactions' });
      let legacyData: LegacyUserData;
      try {
        legacyData = await this.apiClient.fetchUserData();
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to fetch legacy data';
        fatalErrors.push(`Fetch failed: ${message}`);
        firstErrorCode = this.resolveErrorCode(err);
        this.analytics.track('migration_error', {
          platform,
          entityType: 'fetch',
          errorCode: firstErrorCode,
          retryCount,
        });
        const result = createEmptyMigrationResult({
          success: false,
          warnings,
          errors: fatalErrors,
          errorCode: firstErrorCode,
          retryCount,
        });
        await onProgress({ step: 'COMPLETE', result });
        return result;
      }

      // Step 3 & 4: Transform + Import — once per active account
      await onProgress({ step: 'TRANSFORMING' });
      const activeAccounts = legacyData.accounts.filter(a => !a.deleted);

      if (activeAccounts.length === 0) {
        fatalErrors.push('No active accounts found in legacy data — all accounts are deleted');
        firstErrorCode = 'UNKNOWN';
        this.analytics.track('migration_error', {
          platform,
          entityType: 'accounts',
          errorCode: firstErrorCode,
          retryCount,
        });
        const result = createEmptyMigrationResult({
          success: false,
          warnings,
          errors: fatalErrors,
          errorCode: firstErrorCode,
          retryCount,
        });
        await onProgress({ step: 'COMPLETE', result });
        return result;
      }

      const totals = createImportedCounts();
      const pushedTotals = createPushedCounts();
      let totalSkippedTemplates = 0;
      let totalPermanentlySkippedTemplates = 0;
      const allSkippedTemplateReasons: string[] = [];
      const importedAccountIds: string[] = [];
      const importedAccounts: MigrationResult['importedAccounts'] = [];
      let onlineAccountIndex = 0;
      const onlineAccountCount = activeAccounts.filter(
        a =>
          this.shouldPushAccount(a.id, pushProvider) &&
          legacyData.accesses.some(
            acc =>
              acc.account === a.id &&
              acc.role === 'owner' &&
              typeof acc.user === 'object' &&
              acc.user.email != null &&
              acc.user.email.toLowerCase() === email.toLowerCase(),
          ),
      ).length;

      for (const legacyAccount of activeAccounts) {
        // Build a per-account slice of LegacyUserData so the transformer
        // only sees entities belonging to this account.
        const accountData: LegacyUserData = {
          ...legacyData,
          accounts: [legacyAccount],
        };

        let transformResult: TransformResult;
        try {
          transformResult = this.transformer.transform(accountData);
          if (transformResult.errors.length > 0) {
            warnings.push(...transformResult.errors);
          }
        } catch (err) {
          const message = err instanceof Error ? err.message : 'Transform failed';
          fatalErrors.push(`Transform error for account "${legacyAccount.name}": ${message}`);
          const code = this.resolveErrorCode(err);
          if (!firstErrorCode) firstErrorCode = code;
          this.analytics.track('migration_error', {
            platform,
            entityType: 'transform',
            errorCode: code,
            retryCount,
          });
          continue; // skip this account, try the rest
        }

        // For online accounts, provision key before import so records get encrypted.
        // Only push if the migrating user is the legacy owner — a member-only user
        // must not create a duplicate server account; they will receive an invite
        // from the owner's migration instead.
        const accountAccesses = legacyData.accesses.filter(a => a.account === legacyAccount.id);

        const isUserLegacyOwner = accountAccesses.some(
          a =>
            a.role === 'owner' &&
            typeof a.user === 'object' &&
            a.user.email != null &&
            a.user.email.toLowerCase() === email.toLowerCase(),
        );
        const needsPush = isUserLegacyOwner && this.shouldPushAccount(legacyAccount.id, pushProvider);

        // During online migration, a shared account where the migrating user is
        // only a member (not the owner) must NOT be imported locally. Creating a
        // local copy here would create a phantom offline account that has the same
        // data as the owner's server account — the user would never notice the
        // pending invite they're supposed to accept. Skip the account entirely so
        // the user is forced through the invite flow instead.
        const isSharedMemberOnlyAccount =
          pushProvider &&
          !isUserLegacyOwner &&
          accountAccesses.some(a => a.role === 'member');

        if (isSharedMemberOnlyAccount) {
          warnings.push(
            `Shared account "${legacyAccount.name}" was skipped: you are a member, not the owner. ` +
              `Accept the invite from the account owner after they complete their migration.`,
          );
          continue;
        }

        let serverAccountId: string | undefined;

        if (needsPush && pushProvider) {
          try {
            const result = await this.provisionAndLoadKey(
              transformResult.data.account.id,
              legacyAccount.name,
              pushProvider,
            );
            serverAccountId = result.serverAccountId;
          } catch (err) {
            const message = err instanceof Error ? err.message : 'Key provisioning failed';
            fatalErrors.push(`Provisioning error for account "${legacyAccount.name}": ${message}`);
            const code = this.resolveErrorCode(err);
            if (!firstErrorCode) firstErrorCode = code;
            this.analytics.track('migration_error', {
              platform,
              entityType: 'key_provision',
              errorCode: code,
              retryCount,
            });
            continue;
          }
        }

        await onProgress({ step: 'IMPORTING' });
        let importedCounts: MigrationResult['imported'];
        try {
          importedCounts = await this.budgetService.importData(transformResult.data, transformResult.data.account.id);

          // Migration inserts recurring definitions after the account's normal
          // load/reconciliation cycle may already have run. Materialize their
          // forecast instances explicitly so imported recurring items behave
          // the same as newly created recurring items.
          if (typeof this.budgetService.reconcileRecurring === 'function') {
            const importedRecurringItems =
              await this.budgetService.getRecurringItemsByAccountId(transformResult.data.account.id);
            await Promise.all(
              importedRecurringItems.map((item) => this.budgetService.reconcileRecurring(item, { adoptLegacy: true })),
            );
          }
        } catch (err) {
          const message = err instanceof Error ? err.message : 'Import failed';
          fatalErrors.push(`Import error for account "${legacyAccount.name}": ${message}`);
          const code = this.resolveErrorCode(err);
          if (!firstErrorCode) firstErrorCode = code;
          this.analytics.track('migration_error', {
            platform,
            entityType: 'import',
            errorCode: code,
            retryCount,
          });
          continue;
        }

        // Attach stashed templates from local migration (TICKET-5).
        // Keyed by the legacy account id — the local migration stashed
        // templates under serverAccountKey() (account.onlineId ?? account.remoteId),
        // which is the legacy server's numeric account id, available here
        // regardless of login state.
        //
        // Deliberately NOT gated on serverAccountId/pushProvider: this feature
        // must work whether or not the user is currently logged into a Budget
        // Wise online account. attachPendingTemplates only needs the local
        // account (to create the template + look up its categories) — it logs
        // the CREATE_TEMPLATE command via changeLog.append(), which already
        // degrades gracefully to an unencrypted, not-yet-enqueued record when
        // no account key is available yet (resolveAccountKey() returns
        // undefined when there's no accountSyncMetadata). That record is
        // swept up and pushed later by enqueueUnsyncedRecords() whenever the
        // user does log in — the same deferred-push path every other
        // imported entity already relies on.
        try {
          const attachResult = await attachPendingTemplates(
            transformResult.data.account.id,
            String(legacyAccount.id),
          );
          importedCounts.templates += attachResult.attached;
          totalSkippedTemplates += attachResult.skipped;
          totalPermanentlySkippedTemplates += attachResult.permanentSkips.length;
          allSkippedTemplateReasons.push(...attachResult.permanentSkips);
        } catch (err) {
          // Attach failure is non-fatal — logged, retryable on next run
          console.warn(
            `Template attach failed for "${legacyAccount.name}":`,
            err instanceof Error ? err.message : err,
          );
        }

        // For online accounts, push the queue after import
        if (needsPush && pushProvider && serverAccountId) {
          onlineAccountIndex++;
          await onProgress({
            step: 'PUSHING',
            accountName: legacyAccount.name,
            current: onlineAccountIndex,
            total: onlineAccountCount,
          });

          try {
            // Ensure all Dexie categories are in the ChangeLog before pushing.
            // importData seeds default categories via bulkCreate without logCommand,
            // so on any run (first or retry) those categories are missing from the
            // ChangeLog. Without this call, members never receive them via sync pull
            // and transactions referencing default category UUIDs show "unknown".
            await this.budgetService.logCategoriesForMigration(transformResult.data.account.id);

            // Pick up ChangeLog records that were logged without a key on a
            // previous migration run (when no push provider was available).
            // On a first run this is a no-op because importData already
            // encrypted records inline; on a retry it ensures older records
            // that were never queued are encrypted and flushed before push.
            await this.budgetService.enqueueUnsyncedRecords(transformResult.data.account.id);

            const pushedCount = await this.pushQueueForAccount(
              transformResult.data.account.id,
              pushProvider.client,
              serverAccountId,
            );
            pushedTotals.records += pushedCount;
            pushedTotals.accounts += pushedCount > 0 ? 1 : 0;
          } catch (err) {
            const message = err instanceof Error ? err.message : 'Push failed';
            warnings.push(`Push warning for account "${legacyAccount.name}": ${message}`);
            this.analytics.track('migration_push_error', {
              platform,
              entityType: 'push',
              retryCount,
            });
          }
        }

        // Accumulate actual created counts (not transformed counts) across all accounts
        for (const key of Object.keys(totals) as (keyof typeof totals)[]) {
          totals[key] += importedCounts[key];
        }

        await onProgress({ step: 'DETECTING' });
        const detectionResult = this.detectOnlineAccount(legacyAccount, legacyData.accesses);
        if (detectionResult.isOnline || detectionResult.isShared) {
          // Set needs-online-push flag on migrated account
          try {
            await db.accounts.update(transformResult.data.account.id, { needsOnlinePush: true });
          } catch (error) {
            // Log warning but don't fail migration - the flag is a nice-to-have, not critical
            console.warn(`Failed to set needsOnlinePush flag for account ${transformResult.data.account.id}:`, error);
          }

          // Trigger callback to let app layer handle the actual push
          if (this.onOnlineAccountDetected) {
            try {
              await this.onOnlineAccountDetected(transformResult.data.account.id, detectionResult);
            } catch (error) {
              // Log error but don't fail migration - the callback is for side-effects, not critical path
              console.warn(`Online account detection callback failed for account ${transformResult.data.account.id}:`, error);
            }
          }

          // Migrate legacy shared-account members into new account_members model
          if (detectionResult.isShared && serverAccountId && pushProvider) {
            try {
              const accountKey = await loadAccountKey(serverAccountId);
              if (accountKey && detectionResult.ownerEmail && detectionResult.memberEmails) {
                const memberMigrationService = new LegacyMemberMigrationService(pushProvider.emailHashPepper);
                const memberResult = await memberMigrationService.migrateMembers({
                  serverAccountId,
                  accountKey,
                  epoch: 1, // initial epoch after account creation
                  client: pushProvider.client,
                  ownerEmail: detectionResult.ownerEmail,
                  memberEmails: detectionResult.memberEmails,
                  emailHashPepper: pushProvider.emailHashPepper,
                  senderName: legacyAccount.name,
                  accountName: legacyAccount.name,
                  language: pushProvider.language,
                });

                if (memberResult.deliveredKeys > 0) {
                  warnings.push(`Member migration: delivered ${memberResult.deliveredKeys} key(s) for account "${legacyAccount.name}"`);
                }
                if (memberResult.sentInvites > 0) {
                  warnings.push(`Member migration: sent ${memberResult.sentInvites} invite(s) for account "${legacyAccount.name}"`);
                }
                for (const error of memberResult.errors) {
                  warnings.push(`Member migration: ${error}`);
                }
              } else {
              }
            } catch (error) {
              warnings.push(`Member migration failed for account "${legacyAccount.name}": ${error instanceof Error ? error.message : 'Unknown error'}`);
            }
          }
        }

        importedAccountIds.push(transformResult.data.account.id);
        importedAccounts.push({
          id: transformResult.data.account.id,
          name: transformResult.data.account.name,
          initials: transformResult.data.account.initials ?? transformResult.data.account.name.substring(0, 2).toUpperCase(),
          needsOnlinePush: detectionResult.isOnline || detectionResult.isShared,
          counts: {
            transactions: importedCounts.transactions,
            categories: importedCounts.categories,
            limits: importedCounts.limits,
            templates: importedCounts.templates,
            recurringItems: importedCounts.recurringItems,
            savingsGoals: importedCounts.savingsGoals,
          },
        });
      }

      // If any account failed, wipe the entire DB so retry starts clean.
      // This covers partial multi-account runs where earlier accounts already
      // committed data — all Dexie tables must be 0 before retry is offered.
      if (fatalErrors.length > 0) {
        await this.verifyRollback(platform);
      }

      const success = fatalErrors.length === 0;
      const result: MigrationResult = {
        success,
        imported: totals,
        pushed: pushedTotals,
        importedAccountIds,
        importedAccounts,
        skippedAccounts: 0,
        skippedAccountIds: [],
        skippedTemplates: totalSkippedTemplates,
        permanentlySkippedTemplates: totalPermanentlySkippedTemplates,
        skippedTemplateReasons: allSkippedTemplateReasons,
        warnings,
        errors: fatalErrors,
        errorCode: firstErrorCode,
        retryCount,
      };

      await onProgress({ step: 'COMPLETE', result });
      return result;
    } finally {
      // GDPR: always discard the Bearer token from memory after migration,
      // regardless of success or failure.
      this.apiClient.clearToken();
    }
  }
}
