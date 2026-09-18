/**
 * BudgetService - Facade for all database operations
 *
 * Provides a unified API for both read and write operations.
 * Write operations are wrapped with repository calls and logged to the ChangeLog.
 * Each write method:
 * 1. Builds the entity (generates UUID, sets accountId)
 * 2. Persists the change via repository
 * 3. Logs the command to ChangeLog via execute()
 * 4. Returns the created/updated entity
 *
 * Read operations provide direct access to repository queries without logging.
 */

import { generateUUID } from '../utils/uuid.js';
import { changeLog, encryptChangeRecord, uploadQueue } from '../changelog/index.js';
import { db, DEFAULT_CATEGORIES, DEFAULT_ACCOUNT_ID } from '../db/index.js';
import { loadAccountKey } from '../crypto/account-key.js';
import { getAccountSyncMetadata } from '../sync/account-sync-metadata.js';
import { AccountRepository } from '../repositories/account.repository.js';
import { TransactionRepository } from '../repositories/transaction.repository.js';
import { CategoryRepository } from '../repositories/category.repository.js';
import { LimitRepository } from '../repositories/limit.repository.js';
import { TemplateRepository } from '../repositories/template.repository.js';
import { RecurringRepository } from '../repositories/recurring.repository.js';
import { SavingsRepository } from '../repositories/savings.repository.js';
import type {
  Account,
  CreateAccount,
  Transaction,
  CreateTransaction,
  Category,
  CreateCategory,
  Limit,
  CreateLimit,
  Template,
  CreateTemplate,
  RecurringItem,
  CreateRecurringItem,
  SavingsGoal,
  CreateSavingsGoal,
  ExportData
} from '../types/index.js';
import {
  RECURRING_BATCH_SIZE,
  generateRecurringOccurrenceDates,
  generateScheduleDatesThrough,
} from './recurring-occurrence.service.js';
import { COMMAND_TYPES, type Command, type CommandInput } from '../commands/types.js';
import { getPresetById } from "../constants/index.js";
import { CATEGORY_NAME_TO_KEY } from '../constants/category-mappings.js';

const normalizeTransactionDate = (date: string): string => date.substring(0, 10);

const localDateString = (date: Date): string =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

interface ReconcileRecurringOptions {
  /** Link matching unlinked transactions imported from the legacy apps. */
  adoptLegacy?: boolean;
  /**
   * The previous end date when it moved later: every missing occurrence after
   * it through the new end date is added, past ones booked.
   */
  extendAfter?: string;
}

/**
 * Whether `id` is one of the ids DEFAULT_CATEGORIES hard-codes
 * ('expense-books', 'income-gift', …). Every install writes those same ids for
 * its own default account, so they are the only category ids that can collide
 * across devices.
 *
 * Resolved lazily rather than at module scope so that importing this module
 * does not depend on DEFAULT_CATEGORIES being present — tests partially mock
 * '../db' and only some of them supply it.
 */
let stableDefaultCategoryIds: ReadonlySet<string> | undefined;
function isStableDefaultCategoryId(id: string): boolean {
  stableDefaultCategoryIds ??= new Set(DEFAULT_CATEGORIES.map((category) => category.id));
  return stableDefaultCategoryIds.has(id);
}

/** Commands whose payload identifies a category through `id` rather than a reference field. */
const CATEGORY_TARGETED_COMMANDS: ReadonlySet<string> = new Set<string>([
  COMMAND_TYPES.CREATE_CATEGORY,
  COMMAND_TYPES.UPDATE_CATEGORY,
  COMMAND_TYPES.DELETE_CATEGORY,
]);

/**
 * Rewrite the category ids a not-yet-uploaded command references.
 *
 * Transactions hold the reference as `category`, limits/templates/recurring
 * items/savings goals as `categoryId`, and the category commands address the
 * row through `id`.
 *
 * @returns the rewritten command, or undefined when it referenced nothing in
 *          `remap` and must be left untouched.
 */
function rewriteCategoryReferences(
  command: Command,
  remap: ReadonlyMap<string, string>,
): Command | undefined {
  const payload = (command as { payload?: Record<string, unknown> }).payload;
  if (!payload || typeof payload !== 'object') return undefined;

  // The category commands address the row through `id`.
  if (CATEGORY_TARGETED_COMMANDS.has(command.type)) {
    const id = typeof payload.id === 'string' ? remap.get(payload.id) : undefined;
    return id ? ({ ...command, payload: { ...payload, id } } as Command) : undefined;
  }

  // Everything else holds a reference: `category` on transactions,
  // `categoryId` on limits, templates, recurring items and savings goals.
  const category = typeof payload.category === 'string' ? remap.get(payload.category) : undefined;
  const categoryId = typeof payload.categoryId === 'string' ? remap.get(payload.categoryId) : undefined;
  if (!category && !categoryId) return undefined;

  const rewritten = { ...payload };
  if (category) rewritten.category = category;
  if (categoryId) rewritten.categoryId = categoryId;
  return { ...command, payload: rewritten } as Command;
}

export class BudgetService {
  private recurringReconcileLocks = new Map<string, Promise<boolean>>();
  private accountRepo: AccountRepository;
  private transactionRepo: TransactionRepository;
  private categoryRepo: CategoryRepository;
  private limitRepo: LimitRepository;
  private templateRepo: TemplateRepository;
  private recurringRepo: RecurringRepository;
  private savingsRepo: SavingsRepository;
  /**
   * Cached 32-byte symmetric keys by server account ID.
   *
   * Writes are always resolved through local account sync metadata before
   * encryption. A single "active" key is not safe in a multi-account app:
   * account switching or background work can otherwise encrypt account B's
   * ChangeRecords with account A's key.
   */
  private accountKeysByServerId = new Map<string, Uint8Array>();

  constructor() {
    this.accountRepo = new AccountRepository();
    this.transactionRepo = new TransactionRepository();
    this.categoryRepo = new CategoryRepository();
    this.limitRepo = new LimitRepository();
    this.templateRepo = new TemplateRepository();
    this.recurringRepo = new RecurringRepository();
    this.savingsRepo = new SavingsRepository();
  }

  /**
   * Load the symmetric account key from secure storage so that subsequent
   * write operations encrypt their ChangeRecords before queuing.
   * Call this once after the user's sync session is established.
   *
   * @param serverAccountId — the server-side account UUID used as the keychain key
   */
  async loadKeyForAccount(serverAccountId: string): Promise<void> {
    const accountKey = await loadAccountKey(serverAccountId);
    if (accountKey) {
      this.accountKeysByServerId.set(serverAccountId, accountKey);
    } else {
      this.accountKeysByServerId.delete(serverAccountId);
    }
  }

  /**
   * Encrypt and enqueue all unsynced ChangeLog records for the given account.
   * Call this after loadKeyForAccount() so that commands logged before the key
   * was available (e.g. CREATE_ACCOUNT, BULK_CREATE_CATEGORIES) get pushed to
   * the server on the next sync cycle.
   *
   * Idempotent: records already in the upload queue are silently skipped (put
   * semantics).
   */
  async enqueueUnsyncedRecords(accountId: string): Promise<void> {
    const accountKey = await this.resolveAccountKeyForLocalAccount(accountId);
    if (!accountKey) return;

    const unsynced = await changeLog.getUnsyncedByAccountId(accountId);
    for (const record of unsynced) {
      try {
        const envelope = await encryptChangeRecord(record, accountKey);
        await uploadQueue.enqueue({
          change_uuid: record.id,
          encrypted_payload: envelope,
          localAccountId: accountId,
        });
      } catch (err) {
        console.warn(
          `[BudgetService] Failed to enqueue unsynced record ${record.id}:`,
          err,
        );
      }
    }
  }

  /**
   * Logs all categories for the given account as a BULK_CREATE_CATEGORIES command.
   *
   * Used by the migration service to ensure default categories (which importData
   * creates via bulkCreate without logCommand on retry runs) are present in the
   * ChangeLog so they are encrypted and pushed during migration. Safe to call
   * multiple times: the server accepts duplicate change_uuids idempotently and
   * the member's sync engine applies them via upsert.
   */
  async logCategoriesForMigration(accountId: string): Promise<void> {
    const categories = await this.categoryRepo.getByAccountId(accountId);
    if (categories.length === 0) return;
    await this.logCommand({
      type: COMMAND_TYPES.BULK_CREATE_CATEGORIES,
      timestamp: new Date().toISOString(),
      payload: { categories },
    }, accountId);
  }

  /**
   * Clear the currently loaded account key so subsequent write operations
   * log their ChangeRecords as plaintext without encrypting or queuing them
   * for upload. Call this before creating a local account for a shared account
   * to avoid encrypting local setup commands with a stale key.
   */
  clearAccountKey(): void {
    this.accountKeysByServerId.clear();
  }

  /**
   * Log a command to the ChangeLog for audit trail.
   * If the local account is linked to an online account and its key is available,
   * the record is encrypted with that account's own key before queuing.
   * Repository operations must be performed before calling this method.
   */
  private async logCommand(command: CommandInput, accountId: string): Promise<void> {
    const accountKey = await this.resolveAccountKeyForLocalAccount(accountId);
    await changeLog.append(command, accountId, accountKey);
  }

  private async resolveAccountKeyForLocalAccount(localAccountId: string): Promise<Uint8Array | undefined> {
    const metadata = await getAccountSyncMetadata(localAccountId);
    if (!metadata) return undefined;

    const cached = this.accountKeysByServerId.get(metadata.serverAccountId);
    if (cached) return cached;

    try {
      const accountKey = await loadAccountKey(metadata.serverAccountId);
      if (!accountKey) {
        console.warn('[BudgetService] Online account key missing; ChangeRecord will stay local until key is restored', {
          localAccountId,
          serverAccountId: metadata.serverAccountId,
        });
        return undefined;
      }

      this.accountKeysByServerId.set(metadata.serverAccountId, accountKey);
      return accountKey;
    } catch (error) {
      console.warn('[BudgetService] Failed to load account key; ChangeRecord will stay local until key is restored', {
        localAccountId,
        serverAccountId: metadata.serverAccountId,
        error,
      });
      return undefined;
    }
  }

  // ────────────────────────────────────────────────────────────────────────────
  // Read Operations
  // ────────────────────────────────────────────────────────────────────────────
  //
  // Design Note: Read operations are thin passthroughs to repositories.
  //
  // Rationale:
  // - Reads do NOT generate commands (no audit trail needed)
  // - No validation required (data already validated on write)
  // - No transformation needed (repositories return domain types)
  // - Keeps read path fast and simple
  //
  // Future Considerations:
  // - Caching layer could be added here if performance becomes an issue
  // - Error normalization could be added for consistent error handling
  // - Query result pagination could be added for large datasets
  //
  // ────────────────────────────────────────────────────────────────────────────

  /**
   * Initialize database - opens connection and ensures default data exists
   *
   * This is a database lifecycle operation that should be called once at app startup.
   * Note: This is a lifecycle operation, not a domain read operation.
   */
  async initializeDatabase(): Promise<void> {
    await db.open();
    await db.initializeDefaultData();
  }

  /**
   * Get all accounts
   */
  async getAccounts(): Promise<Account[]> {
    return this.accountRepo.getAll();
  }

  /**
   * Get account by ID
   */
  async getAccountById(id: string): Promise<Account | undefined> {
    return this.accountRepo.getById(id);
  }

  /**
   * Get all transactions for a specific account
   */
  async getTransactionsByAccountId(accountId: string): Promise<Transaction[]> {
    return this.transactionRepo.getByAccountId(accountId);
  }

  /**
   * Get all categories for a specific account
   */
  async getCategoriesByAccountId(accountId: string): Promise<Category[]> {
    return this.categoryRepo.getByAccountId(accountId);
  }

  /**
   * Top an account up to the full set of default categories.
   *
   * Intended for restored accounts whose BULK_CREATE_CATEGORIES record never
   * reached the server (pre-dates the enqueue fix). Do NOT call this in the
   * normal account-creation flow — pass skipCategories=false to createAccount()
   * instead so the command is logged to the changelog.
   *
   * Only call this once a sync has *confirmed* what the server holds. With
   * `logCommand`, the seeded set is appended to the changelog and uploaded, so
   * seeding against an unconfirmed pull would push a competing set to the
   * server. Without it, the seeded ids stay local to this device while
   * transactions referencing them do get uploaded, leaving other devices with
   * dangling category references.
   *
   * Matching is by (type, name), so defaults the server already delivered are
   * left alone and only genuinely missing ones are created — an account that
   * came back with a partial set is repaired rather than skipped. Hidden
   * categories still count as present (hiding sets `hidden`, not `archivedAt`),
   * so a hidden default is never resurrected.
   *
   * The read and the write share one Dexie transaction, so two concurrent
   * callers cannot both decide the same default is missing and create it twice.
   *
   * @returns true when this call created categories, false when there was
   *          nothing missing.
   */
  async seedDefaultCategories(
    accountId: string,
    options: { logCommand?: boolean } = {},
  ): Promise<boolean> {
    // Read-only pre-check: this runs after every sync of the current account,
    // and the overwhelmingly common answer is "nothing missing". Opening a
    // read-write transaction for that would be wasted contention.
    if (this.missingDefaultCategories(await this.categoryRepo.getByAccountId(accountId)).length === 0) {
      return false;
    }

    const created = await db.transaction('rw', db.categories, async () => {
      // Recomputed inside the transaction: the pre-check above is only an
      // optimisation and may be stale by the time we get the lock.
      const missing = this.missingDefaultCategories(
        await this.categoryRepo.getByAccountId(accountId),
      );
      if (missing.length === 0) return [];

      const toCreate = missing.map((category) => ({
        ...category,
        id: generateUUID(),
        accountId,
        color: getPresetById(category.id)?.color,
      })) as Category[];
      await this.categoryRepo.bulkCreate(toCreate);
      return toCreate;
    });

    if (created.length === 0) return false;

    if (options.logCommand) {
      // Logged outside the transaction on purpose: changeLog.append() awaits
      // encryption, and a non-Dexie await inside a transaction lets it commit
      // early. The rows are already durable at this point.
      await this.logCommand({
        type: COMMAND_TYPES.BULK_CREATE_CATEGORIES,
        timestamp: new Date().toISOString(),
        payload: { categories: created }
      }, accountId);
    }

    return true;
  }

  /**
   * Re-point this account's rows at its own categories after a restore.
   *
   * The install-time populate writes DEFAULT_CATEGORIES under their stable ids
   * ('expense-books', 'income-gift', …), so anything the user recorded on the
   * default account before it went online references those ids. Those category
   * rows are local-only — they never entered the ChangeLog — so a restore
   * replays the transactions but not the categories, and seedDefaultCategories
   * recreates the defaults under fresh uuids. The result is a transaction (or
   * limit, template, recurring item, savings goal) pointing at an id that no
   * longer exists, which the UI renders as having no category.
   *
   * Re-creating the defaults under their stable ids instead would fix the
   * reference but is not safe: the categories table is keyed globally, and a
   * BULK_CREATE_CATEGORIES carrying 'expense-books' would bulkPut over another
   * device's own install-default row and move it to the restored account.
   *
   * So the ids stay unique and the references are rewritten here instead,
   * matching each stale default id to this account's category with the same
   * (type, name). Deliberately not logged to the ChangeLog: the id it maps to
   * is local to this device, and pushing it would hand other devices a
   * reference they cannot resolve. Every device repairs itself the same way.
   *
   * @returns the number of rows re-pointed.
   */
  async repairDefaultCategoryReferences(accountId: string): Promise<number> {
    const categories = await this.categoryRepo.getByAccountId(accountId);
    if (categories.length === 0) return 0;

    const byTypeName = new Map(categories.map((c) => [`${c.type}::${c.name}`, c.id]));
    const liveIds = new Set(categories.map((c) => c.id));

    // Stale default id -> this account's equivalent category.
    const remap = new Map<string, string>();
    for (const preset of DEFAULT_CATEGORIES) {
      if (liveIds.has(preset.id)) continue; // that id is this account's own row
      const replacement = byTypeName.get(`${preset.type}::${preset.name}`);
      if (replacement) remap.set(preset.id, replacement);
    }
    if (remap.size === 0) return 0;

    return db.transaction(
      'rw',
      [db.transactions, db.limits, db.templates, db.recurringItems, db.savingsGoals],
      async () => {
        let repaired = 0;

        const transactions = await db.transactions.where('accountId').equals(accountId).toArray();
        for (const row of transactions) {
          const next = remap.get(row.category);
          if (!next) continue;
          await db.transactions.put({ ...row, category: next });
          repaired++;
        }

        for (const table of [db.limits, db.templates, db.recurringItems, db.savingsGoals]) {
          const rows = await (table as typeof db.limits).where('accountId').equals(accountId).toArray();
          for (const row of rows as Array<{ id: string; categoryId?: string }>) {
            if (!row.categoryId) continue;
            const next = remap.get(row.categoryId);
            if (!next) continue;
            await (table as typeof db.limits).put({ ...row, categoryId: next } as never);
            repaired++;
          }
        }

        return repaired;
      },
    );
  }

  /**
   * Publish the state an account holds but never logged, so that going online
   * pushes it to the server.
   *
   * Categories reach IndexedDB by four paths that log no command at all — the
   * `populate` hook on a fresh install, `resetDatabase()`,
   * `initializeDefaultData()` and the v3 schema upgrade — and the install
   * default account row is written the same way. Nothing logs them afterwards,
   * so an account carrying only that state publishes nothing when it goes
   * online: a member of the shared account receives no categories, replayed
   * rows point at category ids the server never saw, and a restore has no
   * CREATE_ACCOUNT to recover the account's real name from and falls back to
   * `Account (…)`.
   *
   * enqueueUnsyncedRecords() cannot cover this — it encrypts and uploads
   * records that are already in the ChangeLog, and such an account has none.
   *
   * Idempotent: only what is absent from the ChangeLog is logged, so calling
   * this on every goOnline() is a no-op once the account has published.
   *
   * Owners only. Publishing a category set into an account somebody else owns
   * hands the owner a second, duplicated set (#501), so the caller must check
   * the account's role before calling this.
   *
   * @returns what this call added to the ChangeLog.
   */
  async ensureAccountStateLogged(accountId: string): Promise<{
    accountLogged: boolean;
    categoriesLogged: number;
  }> {
    const account = await this.accountRepo.getById(accountId);
    if (!account) return { accountLogged: false, categoriesLogged: 0 };

    const records = await changeLog.getByAccountId(accountId);

    let accountLogged = false;
    if (!records.some((record) => record.command.type === COMMAND_TYPES.CREATE_ACCOUNT)) {
      await this.logCommand({
        type: COMMAND_TYPES.CREATE_ACCOUNT,
        timestamp: new Date().toISOString(),
        payload: account,
      }, accountId);
      accountLogged = true;
    }

    // Category ids the ChangeLog already carries. UPDATE_CATEGORY deliberately
    // does not count: it edits a row whose creation may never have been logged,
    // which is the very gap this method closes.
    const published = new Set<string>();
    for (const { command } of records) {
      if (command.type === COMMAND_TYPES.BULK_CREATE_CATEGORIES) {
        for (const category of command.payload?.categories ?? []) {
          if (category?.id) published.add(category.id);
        }
      } else if (command.type === COMMAND_TYPES.CREATE_CATEGORY) {
        const id = (command.payload as { id?: string })?.id;
        if (id) published.add(id);
      }
    }

    const unpublished = (await this.categoryRepo.getByAccountId(accountId)).filter(
      (category) => !published.has(category.id),
    );
    if (unpublished.length === 0) return { accountLogged, categoriesLogged: 0 };

    const toPublish = await this.rekeyStableDefaultCategoryIds(accountId, unpublished);

    // Logged outside the rekey transaction on purpose: changeLog.append()
    // awaits encryption, and a non-Dexie await inside a Dexie transaction lets
    // it commit early. The rows are already durable at this point.
    await this.logCommand({
      type: COMMAND_TYPES.BULK_CREATE_CATEGORIES,
      timestamp: new Date().toISOString(),
      payload: { categories: toPublish },
    }, accountId);

    return { accountLogged, categoriesLogged: toPublish.length };
  }

  /**
   * Give this account's copies of the install defaults fresh uuids before they
   * are published, and re-point everything that referenced the old ones.
   *
   * DEFAULT_CATEGORIES carry stable ids and the categories table is keyed
   * globally, so a published BULK_CREATE_CATEGORIES carrying 'expense-books'
   * would bulkPut over another device's own install-default row and move it to
   * the restored account — corrupting a device that did nothing but restore.
   * Ids that are already random (the v3 upgrade mints uuids) are left alone;
   * they cannot collide.
   *
   * Local rows are re-pointed inside the same Dexie transaction as the id swap,
   * so the account is never observable with a dangling reference. Unsynced
   * ChangeLog records are re-pointed too: they have not left the device yet,
   * and uploading them against the old ids would hand every other device a
   * reference it cannot resolve.
   *
   * @returns the categories to publish, carrying the rekeyed ids.
   */
  private async rekeyStableDefaultCategoryIds(
    accountId: string,
    categories: Category[],
  ): Promise<Category[]> {
    const remap = new Map<string, string>();
    const replacements: Category[] = [];
    const rekeyed = categories.map((category) => {
      if (!isStableDefaultCategoryId(category.id)) return category;
      const replacement = { ...category, id: generateUUID() };
      remap.set(category.id, replacement.id);
      replacements.push(replacement);
      return replacement;
    });
    if (remap.size === 0) return rekeyed;

    await db.transaction(
      'rw',
      [
        db.categories,
        db.transactions,
        db.limits,
        db.templates,
        db.recurringItems,
        db.savingsGoals,
        db.changeRecords,
      ],
      async () => {
        await db.categories.bulkDelete([...remap.keys()]);
        await db.categories.bulkPut(replacements);

        const transactions = await db.transactions.where('accountId').equals(accountId).toArray();
        for (const row of transactions) {
          const next = remap.get(row.category);
          if (next) await db.transactions.put({ ...row, category: next });
        }

        for (const table of [db.limits, db.templates, db.recurringItems, db.savingsGoals]) {
          const rows = await (table as typeof db.limits).where('accountId').equals(accountId).toArray();
          for (const row of rows as Array<{ id: string; categoryId?: string }>) {
            if (!row.categoryId) continue;
            const next = remap.get(row.categoryId);
            if (next) await (table as typeof db.limits).put({ ...row, categoryId: next } as never);
          }
        }

        const pending = await db.changeRecords.where('accountId').equals(accountId).toArray();
        for (const record of pending) {
          if (record.synced) continue;
          const command = rewriteCategoryReferences(record.command, remap);
          if (command) await db.changeRecords.put({ ...record, command });
        }
      },
    );

    return rekeyed;
  }

  /** Defaults not present in `existing`, matched by (type, name). */
  private missingDefaultCategories(existing: Category[]): readonly Readonly<Category>[] {
    const present = new Set(existing.map((c) => `${c.type}::${c.name}`));
    return DEFAULT_CATEGORIES.filter(
      (category) => !present.has(`${category.type}::${category.name}`),
    );
  }

  /**
   * Get all limits for a specific account
   */
  async getLimitsByAccountId(accountId: string): Promise<Limit[]> {
    return this.limitRepo.getByAccountId(accountId);
  }

  /**
   * Get all templates for a specific account
   */
  async getTemplatesByAccountId(accountId: string): Promise<Template[]> {
    return this.templateRepo.getByAccountId(accountId);
  }

  /**
   * Get all recurring items for a specific account
   */
  async getRecurringItemsByAccountId(accountId: string): Promise<RecurringItem[]> {
    return this.recurringRepo.getByAccountId(accountId);
  }

  /**
   * Get all savings goals for a specific account
   */
  async getSavingsGoalsByAccountId(accountId: string): Promise<SavingsGoal[]> {
    return this.savingsRepo.getByAccountId(accountId);
  }

  /**
   * Create a new account with default categories.
   * Rolls back account creation if category initialization fails.
   *
   * When skipCategories is true (used by provisionSharedAccount for recipients
   * of a shared account), default categories are not created locally because
   * they will be pulled from the server via sync.
   *
   * Note: Rollback uses global sequence numbers and may have race conditions
   * if multiple operations run concurrently. Risk is low in practice due to
   * single-threaded UI and fast operations.
   */
  async createAccount(data: CreateAccount, skipCategories?: boolean): Promise<Account> {
    // Validate name uniqueness (case-insensitive, trimmed)
    const hasDuplicate = await this.accountRepo.hasDuplicateName(data.name);
    if (hasDuplicate) {
      throw new Error(`An account named '${data.name.trim()}' already exists.`);
    }

    const account: Account = {
      ...data,
      id: generateUUID()
    };

    // Track the sequence before we start logging commands for rollback purposes
    const sequenceBeforeOperation = await changeLog.getLastSequence();

    try {
      await this.accountRepo.create(account);

      await this.logCommand({
        type: COMMAND_TYPES.CREATE_ACCOUNT,
        timestamp: new Date().toISOString(),
        payload: account
      }, account.id);

      if (!skipCategories) {
        // Initialize default categories for the new account
        const categoriesWithIds = DEFAULT_CATEGORIES.map((category) => ({
          ...category,
          id: generateUUID(),
          accountId: account.id,
          color: getPresetById(category.id)?.color,
        }));

        await this.categoryRepo.bulkCreate(categoriesWithIds as Category[]);

        // Log bulk category creation with a single command
        await this.logCommand({
          type: COMMAND_TYPES.BULK_CREATE_CATEGORIES,
          timestamp: new Date().toISOString(),
          payload: { categories: categoriesWithIds as Category[] }
        }, account.id);
      }

      return account;
    } catch (error) {
      // Rollback: Delete the account and remove all logged commands
      try {
        await this.accountRepo.delete(account.id);
      } catch (deleteError) {
        console.error('Failed to rollback account creation:', deleteError);
      }

      // Rollback all commands logged during this operation
      await changeLog.rollbackAfter(sequenceBeforeOperation);

      // Re-throw the original error
      throw error;
    }
  }

  /**
   * Update an existing account
   */
  async updateAccount(account: Account): Promise<Account> {
    // Validate name uniqueness (case-insensitive, trimmed), excluding the current account
    const hasDuplicate = await this.accountRepo.hasDuplicateName(account.name, account.id);
    if (hasDuplicate) {
      throw new Error(`An account named '${account.name.trim()}' already exists.`);
    }

    await this.accountRepo.update(account);

    await this.logCommand({
      type: COMMAND_TYPES.UPDATE_ACCOUNT,
      timestamp: new Date().toISOString(),
      payload: account
    }, account.id);

    return account;
  }

  /**
   * Apply the name and initials carried by a replayed CREATE_ACCOUNT to this
   * device's own copy of the account.
   *
   * Not logged, like executeCommand(): the values came from the server. Logged,
   * they would be pushed back as an UPDATE_ACCOUNT at the end of the account's
   * stream, after any rename made since the account was created, and every
   * device replaying that record would revert to the original name.
   *
   * Returns false without writing when the account does not exist here or
   * another local account already holds the name (#484).
   */
  async applyRemoteAccountName(
    accountId: string,
    details: { name?: string; initials?: string },
  ): Promise<boolean> {
    const account = await this.accountRepo.getById(accountId);
    if (!account) return false;

    const name = details.name ?? account.name;
    if (await this.accountRepo.hasDuplicateName(name, accountId)) return false;

    await this.accountRepo.update({
      ...account,
      name,
      initials: details.initials ?? account.initials,
    });
    return true;
  }

  /**
   * Delete an account and all associated data
   */
  async deleteAccount(accountId: string): Promise<void> {
    await this.accountRepo.deleteAccountWithCascade(accountId);

    await this.logCommand({
      type: COMMAND_TYPES.DELETE_ACCOUNT,
      timestamp: new Date().toISOString(),
      payload: { id: accountId }
    }, accountId);
  }

  /**
   * Delete all online (synced) accounts on logout.
   * Local-only accounts are preserved.
   * Returns the IDs of deleted accounts.
   */
  async deleteAllOnlineAccounts(): Promise<string[]> {
    return this.accountRepo.deleteAllOnlineAccounts();
  }

  async getOnlineAccountSummaries(): Promise<Array<{ localAccountId: string; name: string; initials: string; serverAccountId: string }>> {
    return this.accountRepo.getOnlineAccountSummaries();
  }

  /**
   * Create a new transaction
   *
   * Automatically sets executedAt for past/present transactions.
   * Future-dated transactions are marked as pending (no executedAt).
   */
  async createTransaction(data: CreateTransaction, accountId: string): Promise<Transaction> {
    // Use string comparison to avoid timezone issues completely
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayString = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

    const transaction: Transaction = {
      ...data,
      date: normalizeTransactionDate(data.date),
      id: generateUUID(),
      accountId,
      createdAt: new Date().toISOString(),
      // Set executedAt for past/present transactions (they're not pending)
      executedAt: normalizeTransactionDate(data.date) <= todayString ? new Date().toISOString() : undefined,
    };

    await this.transactionRepo.create(transaction);

    await this.logCommand({
      type: COMMAND_TYPES.CREATE_TRANSACTION,
      timestamp: new Date().toISOString(),
      payload: transaction
    }, accountId);

    return transaction;
  }

  /**
   * Update an existing transaction
   *
   * Re-evaluates executedAt based on the transaction date:
   * - If date is past/present and executedAt is missing, set it now
   * - If date is future, clear executedAt (mark as pending)
   */
  async updateTransaction(transaction: Transaction): Promise<Transaction> {
    // Use string comparison to avoid timezone issues completely
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayString = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

    // Re-evaluate executedAt based on new date
    const transactionWithCorrectExecutedAt: Transaction = {
      ...transaction,
      date: normalizeTransactionDate(transaction.date),
      executedAt: normalizeTransactionDate(transaction.date) <= todayString
        ? (transaction.executedAt ?? new Date().toISOString())
        : undefined,
    };

    await this.transactionRepo.update(transactionWithCorrectExecutedAt);

    await this.logCommand({
      type: COMMAND_TYPES.UPDATE_TRANSACTION,
      timestamp: new Date().toISOString(),
      payload: transactionWithCorrectExecutedAt
    }, transactionWithCorrectExecutedAt.accountId);

    return transactionWithCorrectExecutedAt;
  }

  /**
   * Delete a transaction
   */
  async deleteTransaction(id: string, accountId: string): Promise<void> {
      const transaction = await this.transactionRepo.getById(id);
      const archivedTransaction = transaction?.recurringOccurrenceDate
        ? { ...transaction, archivedAt: new Date().toISOString() }
        : undefined;
      if (archivedTransaction) {
        await this.transactionRepo.update(archivedTransaction);
      } else {
        await this.transactionRepo.delete(id);
      }

      await this.logCommand({
        type: COMMAND_TYPES.DELETE_TRANSACTION,
        timestamp: new Date().toISOString(),
        payload: archivedTransaction ? { id, transaction: archivedTransaction } : { id }
      }, accountId);
    }

  /**
   * Create a new category
   */
  async createCategory(data: CreateCategory, accountId: string): Promise<Category> {
    const category: Category = {
      ...data,
      id: generateUUID(),
      accountId,
      isDefault: false
    };

    await this.categoryRepo.create(category);

    await this.logCommand({
      type: COMMAND_TYPES.CREATE_CATEGORY,
      timestamp: new Date().toISOString(),
      payload: category
    }, accountId);

    return category;
  }

  /**
   * Bulk create multiple categories
   */
  async bulkCreateCategories(data: CreateCategory[], accountId: string): Promise<Category[]> {
    const categories: Category[] = data.map(cat => ({
      ...cat,
      id: generateUUID(),
      accountId,
      isDefault: false
    }));

    await this.categoryRepo.bulkCreate(categories);

    await this.logCommand({
      type: COMMAND_TYPES.BULK_CREATE_CATEGORIES,
      timestamp: new Date().toISOString(),
      payload: { categories }
    }, accountId);

    return categories;
  }

  /**
   * Update an existing category
   */
  async updateCategory(id: string, updates: Partial<Pick<Category, 'name' | 'icon' | 'color' | 'hidden'>>, accountId: string): Promise<Category> {
    const existing = await this.categoryRepo.getById(id);
    if (!existing) {
      throw new Error(`Category not found: ${id}`);
    }

    // Default categories only allow the hidden flag to be toggled — name, icon, and color remain locked
    if (existing.isDefault) {
      const isOnlyHiddenUpdate = Object.keys(updates).every((k) => k === 'hidden');
      if (!isOnlyHiddenUpdate) {
        throw new Error(`Cannot update default category: ${id}`);
      }
    }

    const updated: Category = {
      ...existing,
      ...updates,
      id: existing.id,
      accountId: existing.accountId,
      isDefault: existing.isDefault
    };

    await this.categoryRepo.update(updated);

    await this.logCommand({
      type: COMMAND_TYPES.UPDATE_CATEGORY,
      timestamp: new Date().toISOString(),
      payload: updated
    }, accountId);

    return updated;
  }

  /**
   * Delete a category
   */
  async deleteCategory(id: string, accountId: string): Promise<void> {
      await this.categoryRepo.delete(id);

      await this.logCommand({
        type: COMMAND_TYPES.DELETE_CATEGORY,
        timestamp: new Date().toISOString(),
        payload: { id }
      }, accountId);
    }

  /**
   * Create a new limit
   */
  async createLimit(data: CreateLimit, accountId: string): Promise<Limit> {
    const limit: Limit = {
      ...data,
      id: generateUUID(),
      accountId
    };

    await this.limitRepo.create(limit);

    await this.logCommand({
      type: COMMAND_TYPES.CREATE_LIMIT,
      timestamp: new Date().toISOString(),
      payload: limit
    }, accountId);

    return limit;
  }

  /**
   * Update an existing limit
   */
  async updateLimit(limit: Limit): Promise<Limit> {
    await this.limitRepo.update(limit);

    await this.logCommand({
      type: COMMAND_TYPES.UPDATE_LIMIT,
      timestamp: new Date().toISOString(),
      payload: limit
    }, limit.accountId);

    return limit;
  }

  /**
   * Delete a limit
   */
  async deleteLimit(id: string, accountId: string): Promise<void> {
      await this.limitRepo.delete(id);

      await this.logCommand({
        type: COMMAND_TYPES.DELETE_LIMIT,
        timestamp: new Date().toISOString(),
        payload: { id }
      }, accountId);
    }

  /**
   * Create a new template
   */
  async createTemplate(data: CreateTemplate, accountId: string): Promise<Template> {
    const template: Template = {
      ...data,
      id: generateUUID(),
      accountId
    };

    await this.templateRepo.create(template);

    await this.logCommand({
      type: COMMAND_TYPES.CREATE_TEMPLATE,
      timestamp: new Date().toISOString(),
      payload: template
    }, accountId);

    return template;
  }

  /**
   * Update an existing template
   */
  async updateTemplate(template: Template): Promise<Template> {
    await this.templateRepo.update(template);

    await this.logCommand({
      type: COMMAND_TYPES.UPDATE_TEMPLATE,
      timestamp: new Date().toISOString(),
      payload: template
    }, template.accountId);

    return template;
  }

  /**
   * Delete a template
   */
  async deleteTemplate(id: string, accountId: string): Promise<void> {
      await this.templateRepo.delete(id);

      await this.logCommand({
        type: COMMAND_TYPES.DELETE_TEMPLATE,
        timestamp: new Date().toISOString(),
        payload: { id }
      }, accountId);
    }

  /**
   * Create a new recurring item
   */
  async createRecurring(data: CreateRecurringItem, accountId: string): Promise<RecurringItem> {
    if (data.endDate && data.endDate < data.startDate) {
      throw new Error('End date cannot be earlier than start date');
    }
    const recurring: RecurringItem = {
      ...data,
      id: generateUUID(),
      accountId
    };

    await this.recurringRepo.create(recurring);
    await this.logCommand({
      type: COMMAND_TYPES.CREATE_RECURRING,
      timestamp: new Date().toISOString(),
      payload: recurring
    }, accountId);
    await this.reconcileRecurring(recurring);

    return recurring;
  }

  /**
   * Update an existing recurring item
   */
  async updateRecurring(item: RecurringItem): Promise<RecurringItem> {
    if (item.endDate && item.endDate < item.startDate) {
      throw new Error('End date cannot be earlier than start date');
    }
    const previousEndDate = (await this.recurringRepo.getById(item.id))?.endDate?.substring(0, 10);
    await this.recurringRepo.update(item);
    await this.logCommand({
      type: COMMAND_TYPES.UPDATE_RECURRING,
      timestamp: new Date().toISOString(),
      payload: item
    }, item.accountId);
    // A cleared end date falls back to the regular batch rule; a later one
    // fills in the occurrences between the two end dates.
    const movedLater = Boolean(previousEndDate && item.endDate && item.endDate.substring(0, 10) > previousEndDate);
    await this.reconcileRecurring(item, movedLater ? { extendAfter: previousEndDate } : undefined);

    return item;
  }

  /**
   * Ensure a recurring definition's occurrences exist.
   * @returns whether any transaction was created, updated or removed.
   */
  async reconcileRecurring(
    item: RecurringItem,
    options?: ReconcileRecurringOptions,
  ): Promise<boolean> {
    const previous = this.recurringReconcileLocks.get(item.id) ?? Promise.resolve();
    const current = previous
      .catch(() => undefined)
      .then(() => this.reconcileRecurringTransactions(item, options));
    this.recurringReconcileLocks.set(item.id, current);
    try {
      return await current;
    } finally {
      if (this.recurringReconcileLocks.get(item.id) === current) {
        this.recurringReconcileLocks.delete(item.id);
      }
    }
  }

  /**
   * Delete a recurring item and every transaction linked to it: booked,
   * upcoming and skipped occurrences, and entries the user linked to it.
   */
  async deleteRecurring(id: string, accountId: string): Promise<void> {
    const timestamp = new Date().toISOString();
    const removedIds = await this.linkedTransactionIds(id, accountId);

    // Each removed occurrence is logged explicitly so devices that apply
    // DELETE_RECURRING without cascading still converge.
    const accountKey = await this.resolveAccountKeyForLocalAccount(accountId);
    const prepared = await changeLog.prepareMany([
      ...removedIds.map(transactionId => ({
        command: { type: COMMAND_TYPES.DELETE_TRANSACTION, timestamp, payload: { id: transactionId } },
        accountId,
        accountKey,
      })),
      {
        command: {
          type: COMMAND_TYPES.DELETE_RECURRING,
          timestamp,
          payload: { id, accountId },
        },
        accountId,
        accountKey,
      },
    ]);

    // The deletes and their commands commit together, so a failed delete is
    // never announced to other devices.
    await db.transaction(
      'rw',
      db.transactions,
      db.recurringItems,
      db.changeRecords,
      db.uploadQueue,
      async () => {
        await this.transactionRepo.bulkDelete(removedIds);
        await this.recurringRepo.delete(id);
        await changeLog.persistPrepared(prepared);
      },
    );
  }

  /** Apply a DELETE_RECURRING pulled from another device. */
  private async deleteRecurringData(id: string, accountId?: string): Promise<void> {
    const resolvedAccountId = accountId ?? (await this.recurringRepo.getById(id))?.accountId;
    if (resolvedAccountId) {
      await this.transactionRepo.bulkDelete(await this.linkedTransactionIds(id, resolvedAccountId));
    }
    await this.recurringRepo.delete(id);
  }

  private async linkedTransactionIds(recurringItemId: string, accountId: string): Promise<string[]> {
    return (await this.transactionRepo.getByAccountIdIncludingArchived(accountId))
      .filter(transaction => transaction.recurringItemId === recurringItemId)
      .map(transaction => transaction.id);
  }

  /**
   * Occurrences are created in batches of 12:
   * - The first batch is counted from the start date; already-past ones are
   *   booked. A start date more than 12 occurrences back still yields 12.
   * - The next 12 are added from the next due date once a batch has run out:
   *   nothing is upcoming any more and the last occurrence was generated
   *   before it fell due (or the item has history from before batches).
   *   Missed occurrences between batches are not backfilled.
   * - Existing occurrences on the schedule are kept; generated upcoming ones
   *   that fall off it are removed, and so is every occurrence, booked or
   *   not, dated after the end date.
   * - Moving the end date later adds every occurrence between the old and the
   *   new end date (`extendAfter`); past ones are booked.
   */
  private async reconcileRecurringTransactions(
    item: RecurringItem,
    options: ReconcileRecurringOptions = {},
  ): Promise<boolean> {
    const todayString = localDateString(new Date());
    const timestamp = new Date().toISOString();
    const accountTransactions = await this.transactionRepo.getByAccountIdIncludingArchived(item.accountId);
    const existing = accountTransactions.filter(transaction => transaction.recurringItemId === item.id);
    const occurrenceDate = (transaction: Transaction) =>
      transaction.recurringOccurrenceDate ?? transaction.date.substring(0, 10);
    const existingByOccurrence = new Map(existing.map(transaction => [occurrenceDate(transaction), transaction]));

    const existingDates = existing.map(occurrenceDate).sort();
    // No Array.prototype.at: Android System WebView before Chrome 92 lacks it.
    const latestExisting = existingDates[existingDates.length - 1];
    const onSchedule = new Set(generateScheduleDatesThrough(
      item,
      latestExisting && latestExisting > todayString ? latestExisting : todayString,
    ));
    const keptDates = existingDates.filter(date => onSchedule.has(date));
    // Count the first batch from the start date, or from the item's earliest
    // existing occurrence when that is later (history the legacy app or an
    // older version booked), so no occurrence is invented before it.
    const earliestExisting = existingDates[0];
    const firstBatch = generateRecurringOccurrenceDates(
      item,
      RECURRING_BATCH_SIZE,
      earliestExisting && earliestExisting > item.startDate.substring(0, 10) ? earliestExisting : undefined,
    );
    const hasUpcoming = [...keptDates, ...firstBatch].some(date => date > todayString);
    const latestGenerated = existing
      .filter(transaction => transaction.recurringOccurrenceDate)
      .reduce<Transaction | undefined>((latest, transaction) =>
        !latest || transaction.recurringOccurrenceDate! > latest.recurringOccurrenceDate!
          ? transaction
          : latest,
      undefined);
    // A batch that was already in the past when it was created (an old start
    // date) is complete at 12; only one that ran out over time continues.
    const batchRanOut = !hasUpcoming && (
      existing.some(transaction => !transaction.recurringOccurrenceDate) ||
      Boolean(latestGenerated?.createdAt &&
        localDateString(new Date(latestGenerated.createdAt)) < latestGenerated.recurringOccurrenceDate!)
    );
    const nextBatch = batchRanOut
      ? generateRecurringOccurrenceDates(item, RECURRING_BATCH_SIZE, todayString)
      : [];
    const endDate = item.endDate?.substring(0, 10);
    const extendAfter = options.extendAfter;
    const extension = extendAfter && endDate
      ? generateScheduleDatesThrough(item, endDate).filter(date => date > extendAfter)
      : [];
    const scheduleDates = [...new Set([...keptDates, ...firstBatch, ...nextBatch, ...extension])].sort();
    const dateSet = new Set(scheduleDates);
    const activeByDate = new Map<string, Transaction[]>();
    for (const transaction of accountTransactions) {
      if (transaction.archivedAt) continue;
      const date = transaction.date.substring(0, 10);
      const sameDay = activeByDate.get(date);
      if (sameDay) sameDay.push(transaction);
      else activeByDate.set(date, [transaction]);
    }
    const matchesItem = (transaction: Transaction) =>
      transaction.type === item.type &&
      transaction.category === item.categoryId &&
      (transaction.title ?? '').trim().toLowerCase() === item.name.trim().toLowerCase();

    // Every write is collected first and applied below together with its
    // change record, so a failure can't leave rows that never sync.
    const deletedIds: string[] = [];
    const upserts: Transaction[] = [];
    const commands: CommandInput[] = [];
    const deleteTransaction = (id: string) => {
      deletedIds.push(id);
      commands.push({ type: COMMAND_TYPES.DELETE_TRANSACTION, timestamp, payload: { id } });
    };

    // Older versions could persist the occurrence without its recurring link.
    // Adopt an exact legacy match, or remove it when the linked occurrence
    // already exists, so one scheduled occurrence always maps to one record.
    for (const date of scheduleDates) {
      const linked = existingByOccurrence.get(date);
      const legacyMatches = options.adoptLegacy
        ? (activeByDate.get(date) ?? []).filter(transaction =>
          !transaction.recurringItemId &&
          transaction.amount === item.amount &&
          matchesItem(transaction),
        )
        : [];

      if (linked) {
        legacyMatches.forEach(transaction => deleteTransaction(transaction.id));
      } else if (legacyMatches.length > 0) {
        const [legacy, ...duplicates] = legacyMatches;
        const adopted = {
          ...legacy,
          isRecurring: true,
          recurringItemId: item.id,
          recurringOccurrenceDate: date,
          executedAt: date <= todayString
            ? (legacy.executedAt ?? timestamp)
            : undefined,
        };
        upserts.push(adopted);
        commands.push({ type: COMMAND_TYPES.UPDATE_TRANSACTION, timestamp, payload: adopted });
        duplicates.forEach(transaction => deleteTransaction(transaction.id));
        existingByOccurrence.set(date, adopted);
      }
    }

    // Upcoming generated instances outside the current schedule, and anything
    // after the end date, are removed. Explicit user deletions remain archived
    // and are included in existingByOccurrence, so they are not recreated.
    existing
      .filter(transaction => !transaction.archivedAt && (
        (endDate !== undefined && occurrenceDate(transaction) > endDate) ||
        (transaction.recurringOccurrenceDate &&
          transaction.recurringOccurrenceDate >= todayString &&
          !dateSet.has(transaction.recurringOccurrenceDate))
      ))
      .forEach(transaction => deleteTransaction(transaction.id));

    // An entry the user booked for this item on the same day, such as a manual
    // override with a different amount, stands in for the occurrence.
    const coveredByUserEntry = (date: string) => (activeByDate.get(date) ?? []).some(transaction =>
      !transaction.recurringItemId && matchesItem(transaction),
    );
    const missing: Transaction[] = scheduleDates
      .filter(date => !existingByOccurrence.has(date) && !coveredByUserEntry(date))
      .map(date => ({
        id: `${item.id}:${date}`,
        accountId: item.accountId,
        type: item.type,
        amount: item.amount,
        category: item.categoryId,
        title: item.name,
        date,
        createdAt: timestamp,
        isRecurring: true,
        recurringItemId: item.id,
        recurringOccurrenceDate: date,
        executedAt: date <= todayString ? timestamp : undefined,
      }));
    upserts.push(...missing);
    missing.forEach(transaction => {
      commands.push({ type: COMMAND_TYPES.CREATE_TRANSACTION, timestamp, payload: transaction });
    });

    if (commands.length === 0) return false;

    // Encrypt before opening the transaction: IndexedDB commits a transaction
    // as soon as it awaits anything that isn't a Dexie operation.
    const accountKey = await this.resolveAccountKeyForLocalAccount(item.accountId);
    const prepared = await changeLog.prepareMany(
      commands.map(command => ({ command, accountId: item.accountId, accountKey })),
    );
    await db.transaction('rw', db.transactions, db.changeRecords, db.uploadQueue, async () => {
      await this.transactionRepo.bulkDelete(deletedIds);
      await this.transactionRepo.bulkUpsert(upserts);
      await changeLog.persistPrepared(prepared);
    });
    return true;
  }

  /**
   * Create a new savings goal
   */
  async createSavingsGoal(data: CreateSavingsGoal, accountId: string): Promise<SavingsGoal> {
    const goal: SavingsGoal = {
      ...data,
      id: generateUUID(),
      accountId
    };

    await this.savingsRepo.create(goal);

    await this.logCommand({
      type: COMMAND_TYPES.CREATE_SAVINGS_GOAL,
      timestamp: new Date().toISOString(),
      payload: goal
    }, accountId);

    return goal;
  }

  /**
   * Update an existing savings goal
   */
  async updateSavingsGoal(goal: SavingsGoal): Promise<SavingsGoal> {
    await this.savingsRepo.update(goal);

    await this.logCommand({
      type: COMMAND_TYPES.UPDATE_SAVINGS_GOAL,
      timestamp: new Date().toISOString(),
      payload: goal
    }, goal.accountId);

    return goal;
  }

  /**
   * Delete a savings goal
   */
  async deleteSavingsGoal(id: string, accountId: string): Promise<void> {
      await this.savingsRepo.delete(id);

      await this.logCommand({
        type: COMMAND_TYPES.DELETE_SAVINGS_GOAL,
        timestamp: new Date().toISOString(),
        payload: { id }
      }, accountId);
    }

  /**
   * Import data from export
   */
  async importData(data: ExportData, targetAccountId: string): Promise<{
    accounts: number;
    transactions: number;
    categories: number;
    limits: number;
    templates: number;
    recurringItems: number;
    savingsGoals: number;
  }> {
    const counts = { accounts: 0, transactions: 0, categories: 0, limits: 0, templates: 0, recurringItems: 0, savingsGoals: 0 };
    const categoryIdMap = new Map<string, string>();
    // Import account only if it doesn't exist (create new account)
    // If importing into existing account, preserve its metadata (name, initials)
    let isNewAccount = false;

    if (data.account) {
      const existingAccount = await this.accountRepo.getById(targetAccountId);

      if (!existingAccount) {
        // Create new account with target ID
        isNewAccount = true;
        const accountToSave = {
          ...data.account,
          id: targetAccountId
        };

        await this.accountRepo.create(accountToSave);

        await this.logCommand({
          type: COMMAND_TYPES.CREATE_ACCOUNT,
          timestamp: new Date().toISOString(),
          payload: accountToSave
        }, targetAccountId);

        // Seed default categories for the new account — same as createAccount().
        // This ensures default categories exist in the DB before the category
        // import loop below, allowing name-based deduplication.
        const defaultCategoriesWithIds = DEFAULT_CATEGORIES.map((category) => {
          const newId = generateUUID();
          // Map the stable default ID to the newly generated local UUID
          categoryIdMap.set(category.id, newId);
          return {
            ...category,
            id: newId,
            accountId: targetAccountId,
            color: getPresetById(category.id)?.color,
          };
        });


        await this.categoryRepo.bulkCreate(defaultCategoriesWithIds as Category[]);

        // Log the default categories so they reach members via sync pull.
        // createAccount() does the same via BULK_CREATE_CATEGORIES; without
        // this call the categories live only in Dexie and are never pushed.
        await this.logCommand({
          type: COMMAND_TYPES.BULK_CREATE_CATEGORIES,
          timestamp: new Date().toISOString(),
          payload: { categories: defaultCategoriesWithIds },
        }, targetAccountId);

        counts.accounts++;
      }
      // If account exists, don't update it - preserve existing account metadata
    }

    const existingTargetCategories = await this.categoryRepo.getByAccountId(targetAccountId);

    // Pre-populate map with existing default categories in the target account.
    // This ensures that entities referencing stable IDs (like 'expense-food')
    // are correctly remapped to the local IDs in this account.
    for (const existing of existingTargetCategories) {
      if (!existing.isDefault) continue;
      const defaultMatch = DEFAULT_CATEGORIES.find(
        (d) => d.name === existing.name && d.type === existing.type
      );
      if (defaultMatch) {
        categoryIdMap.set(defaultMatch.id, existing.id);
      }
    }

    if (data.categories?.length) {
      for (const category of data.categories) {
        // Check if category already exists globally by ID
        const existingById = await this.categoryRepo.getById(category.id);

        if (existingById && existingById.accountId === targetAccountId) {
          // Case 1 (Same ID & Account): If a category with the same ID already exists
          // in the target account, update the map but do NOT increment the counter.
          categoryIdMap.set(category.id, category.id);
          continue;
        }

        const isStableDefaultId = DEFAULT_CATEGORIES.some((d) => d.id === category.id);
        const effectiveIsDefault = isStableDefaultId || Boolean(category.isDefault);
        const incomingCanonicalKey: string | undefined = !effectiveIsDefault
          ? CATEGORY_NAME_TO_KEY[category.name.trim()] ?? undefined
          : undefined;

        // 2. Match by name and type in the target account (deduplication scenario)
        // This is crucial for default categories which might have different IDs
        // (e.g. random UUID vs stable ID like "expense-food") or slight name variations.
        const matchedByName = existingTargetCategories.find((c) => {
          if (c.type !== category.type) return false;

          const n1 = c.name.toLowerCase().trim();
          const n2 = category.name.toLowerCase().trim();

          if (n1 === n2) return Boolean(c.isDefault) === effectiveIsDefault;

          if (incomingCanonicalKey && c.isDefault && !c.hidden && n1 === incomingCanonicalKey.toLowerCase()) {
            return true;
          }

          if (!c.isDefault || !effectiveIsDefault) return false;

          // Match keys to simple names (e.g., "category_food" to "food")
          const clean1 = n1.startsWith('category_') ? n1.replace('category_', '') : n1;
          const clean2 = n2.startsWith('category_') ? n2.replace('category_', '') : n2;
          return clean1 === clean2;
        });

        if (matchedByName) {
          categoryIdMap.set(category.id, matchedByName.id);

          // Case 2 (Name Matching): Increment only if the link is being established for the first time.
          // On repeated migrations, categories already mapped to defaults or deduplicated
          // will hit this block. We only count them on the first migration (isNewAccount).
          if (isNewAccount) {
            counts.categories++;
          }

          continue;
        }

        // 3. Create new category (either new ID or ID collision with another account)
        const isCollision = !!existingById;
        const newCategoryId = isCollision ? generateUUID() : category.id;

        const categoryToCreate = {
          ...category,
          id: newCategoryId,
          accountId: targetAccountId,
          isDefault: effectiveIsDefault ? true : (isNewAccount ? category.isDefault : false)
        };

        await this.categoryRepo.create(categoryToCreate);
        await this.logCommand({
          type: COMMAND_TYPES.CREATE_CATEGORY,
          timestamp: new Date().toISOString(),
          payload: categoryToCreate
        }, targetAccountId);

        categoryIdMap.set(category.id, newCategoryId);
        counts.categories++;

        // Add to existingTargetCategories to avoid duplicates within the same import
        existingTargetCategories.push(categoryToCreate as Category);
      }
    }

    // Helper interface for entities that may have category references
    interface EntityWithOptionalCategory {
      id: string;
      accountId: string;
      categoryId?: string;
      category?: string;
    }

    // Helper function to handle entity deduplication
    //
    // FOREIGN KEY REMAPPING SCOPE:
    // This helper only remaps 'categoryId' and 'category' fields (via remapCategoryId flag).
    // Other foreign key references (e.g. savingsGoalId on transactions, categoryId on
    // savings goals) are handled by the caller passing pre-remapped entities, or are
    // already resolved by the transformer before importData is called.
    //
    // Cross-account collision (entity ID exists for a different account): a new UUID is
    // generated for the entity. This is safe for the current entity types because:
    // - Transactions reference categories (remapped above) and savingsGoals (resolved by transformer)
    // - Limits reference categories (remapped above)
    // - RecurringItems reference categories (remapped above)
    // - SavingsGoals reference categories (remapped above)
    // - Templates reference categories (remapped above)
    // If new entity types with additional foreign keys are added in future, this helper
    // must be extended to remap those references too.
    const importEntity = async <T extends { id: string; accountId: string }>(
      entity: T,
      repo: { getById: (id: string) => Promise<T | undefined>; create: (entity: T) => Promise<any> },
      commandType: (typeof COMMAND_TYPES)[keyof typeof COMMAND_TYPES],
      remapCategoryId?: boolean
    ): Promise<boolean> => {
      // Check if entity already exists
      const existing = await repo.getById(entity.id);

      // Skip if exists in target account (same-account restore)
      if (existing && existing.accountId === targetAccountId) {
        return false; // Skipped
      }

      // Build base entity with new ID if collision, otherwise preserve
      let entityToCreate: T = {
        ...entity,
        id: existing ? generateUUID() : entity.id,
        accountId: targetAccountId
      };

      // Remap category references if needed using type narrowing
      if (remapCategoryId) {
        const entityWithCategory = entity as T & Partial<EntityWithOptionalCategory>;

        if ('categoryId' in entityWithCategory && typeof entityWithCategory.categoryId === 'string') {
          const remappedCategoryId = categoryIdMap.get(entityWithCategory.categoryId) || entityWithCategory.categoryId;
          entityToCreate = {
            ...entityToCreate,
            categoryId: remappedCategoryId
          } as T;
        }

        if ('category' in entityWithCategory && typeof entityWithCategory.category === 'string') {
          const remappedCategory = categoryIdMap.get(entityWithCategory.category) || entityWithCategory.category;
          entityToCreate = {
            ...entityToCreate,
            category: remappedCategory
          } as T;
        }
      }

      await repo.create(entityToCreate);

      // Type assertion needed because CommandInput is a discriminated union
      // and TypeScript can't infer that payload T matches the commandType
      await this.logCommand({
        type: commandType,
        timestamp: new Date().toISOString(),
        payload: entityToCreate
      } as CommandInput, targetAccountId);

      return true; // Created
    };

    // Import transactions - preserve IDs but handle collisions
    // Remap category IDs for cross-account imports
    if (data.transactions?.length) {
      // Compute today string once for executedAt evaluation
      const importToday = new Date();
      importToday.setHours(0, 0, 0, 0);
      const importTodayString = `${importToday.getFullYear()}-${String(importToday.getMonth() + 1).padStart(2, '0')}-${String(importToday.getDate()).padStart(2, '0')}`;

      for (const transaction of data.transactions) {
        // Ensure ID exists and set executedAt for past/present transactions
        // (matching createTransaction() behavior — prevents imported past
        // transactions from being treated as "pending")
        const txDate = transaction.date?.substring(0, 10) ?? '';
        const txWithId = {
          ...transaction,
          id: transaction.id || generateUUID(),
          date: txDate,
          executedAt: transaction.executedAt ?? (txDate <= importTodayString ? new Date().toISOString() : undefined),
        };
        const created = await importEntity(
          txWithId as Transaction,
          this.transactionRepo,
          COMMAND_TYPES.CREATE_TRANSACTION,
          true // Remap category
        );
        if (created) counts.transactions++;
      }
    }

    if (data.limits?.length) {
      for (const limit of data.limits) {
        const created = await importEntity(
          limit as Limit,
          this.limitRepo,
          COMMAND_TYPES.CREATE_LIMIT,
          true
        );
        if (created) counts.limits++;
      }
    }

    // Import templates - check for duplicates before creating
    if (data.templates?.length) {
      for (const template of data.templates) {
        const created = await importEntity(
          template as Template,
          this.templateRepo,
          COMMAND_TYPES.CREATE_TEMPLATE,
          true // Remap categoryId
        );
        if (created) counts.templates++;
      }
    }

    // Import recurring items - check for duplicates before creating
    if (data.recurringItems?.length) {
      for (const item of data.recurringItems) {
        const created = await importEntity(
          item as RecurringItem,
          this.recurringRepo,
          COMMAND_TYPES.CREATE_RECURRING,
          true
        );
        if (created) counts.recurringItems++;
      }
    }

    // Import savings goals - check for duplicates before creating
    if (data.savingsGoals?.length) {
      for (const goal of data.savingsGoals) {
        const created = await importEntity(
          goal as SavingsGoal,
          this.savingsRepo,
          COMMAND_TYPES.CREATE_SAVINGS_GOAL,
          true
        );
        if (created) counts.savingsGoals++;
      }
    }

    // Note: No IMPORT_DATA command is logged since all individual entity
    // creations are already logged above. This prevents duplicate logging
    // and ensures UUIDs are captured correctly for sync replay.
    return counts;
  }

  /**
   * Reset database - deletes all data and repopulates defaults
   *
   * Note: This is a DB admin operation that arguably doesn't belong on BudgetService
   * (it's not a typical write operation). However, it's included here for consistency
   * with the Task 3 spec and to ensure the operation is logged to the ChangeLog.
   *
   * The underlying db.resetDatabase() skips the changeRecords table (Task 2 requirement),
   * so the RESET_DATABASE command logged below is preserved for audit trail.
   *
   * @throws Error if reset fails
   */
  /**
   * Reset the entire database (admin operation)
   *
   * Note: This is a database lifecycle operation, not a domain write operation.
   * It's the only BudgetService method that doesn't operate on a specific entity.
   *
   * Architectural consideration: This could be extracted to a separate
   * DatabaseAdmin class, but it's kept here for now to ensure all database
   * mutations go through a single command-logging interface.
   */
  /**
   * Execute a command from a remote sync event.
   *
   * This method bypasses logCommand to prevent sync loops.
   */
  async executeCommand(command: any): Promise<void> {
    const { type, payload } = command;

    switch (type) {
      case COMMAND_TYPES.CREATE_ACCOUNT:
        await this.accountRepo.update(payload);
        break;
      case COMMAND_TYPES.UPDATE_ACCOUNT:
        await this.accountRepo.update(payload);
        break;
      case COMMAND_TYPES.DELETE_ACCOUNT:
        await this.accountRepo.delete(payload.id);
        break;
      case COMMAND_TYPES.CREATE_TRANSACTION:
        await this.transactionRepo.update(payload);
        break;
      case COMMAND_TYPES.UPDATE_TRANSACTION:
        await this.transactionRepo.update(payload);
        break;
      case COMMAND_TYPES.DELETE_TRANSACTION:
        if (payload.transaction?.recurringOccurrenceDate) {
          await this.transactionRepo.update(payload.transaction);
        } else {
          await this.transactionRepo.delete(payload.id);
        }
        break;
      case COMMAND_TYPES.CREATE_CATEGORY:
        await this.categoryRepo.update(payload);
        break;
      case COMMAND_TYPES.DELETE_CATEGORY:
        await this.categoryRepo.delete(payload.id);
        break;
      case COMMAND_TYPES.UPDATE_CATEGORY:
        await this.categoryRepo.update(payload);
        break;
      case COMMAND_TYPES.CREATE_LIMIT:
        await this.limitRepo.update(payload);
        break;
      case COMMAND_TYPES.UPDATE_LIMIT:
        await this.limitRepo.update(payload);
        break;
      case COMMAND_TYPES.DELETE_LIMIT:
        await this.limitRepo.delete(payload.id);
        break;
      case COMMAND_TYPES.BULK_CREATE_CATEGORIES:
        await this.categoryRepo.bulkUpsert(payload.categories);
        break;
      case COMMAND_TYPES.CREATE_TEMPLATE:
        await this.templateRepo.update(payload);
        break;
      case COMMAND_TYPES.UPDATE_TEMPLATE:
        await this.templateRepo.update(payload);
        break;
      case COMMAND_TYPES.DELETE_TEMPLATE:
        await this.templateRepo.delete(payload.id);
        break;
      case COMMAND_TYPES.CREATE_RECURRING:
        await this.recurringRepo.update(payload);
        break;
      case COMMAND_TYPES.UPDATE_RECURRING:
        await this.recurringRepo.update(payload);
        break;
      case COMMAND_TYPES.DELETE_RECURRING:
        await this.deleteRecurringData(payload.id, payload.accountId);
        break;
      case COMMAND_TYPES.CREATE_SAVINGS_GOAL:
        await this.savingsRepo.update(payload);
        break;
      case COMMAND_TYPES.UPDATE_SAVINGS_GOAL:
        await this.savingsRepo.update(payload);
        break;
      case COMMAND_TYPES.DELETE_SAVINGS_GOAL:
        await this.savingsRepo.delete(payload.id);
        break;
      default:
        console.warn(`[BudgetService] Unknown command type: ${type}`);
    }
  }

  async resetDatabase(): Promise<void> {
    await db.resetDatabase();

    // Log the reset command AFTER the operation completes
    // This command is preserved because db.resetDatabase() skips changeRecords table
    await this.logCommand({
      type: COMMAND_TYPES.RESET_DATABASE,
      timestamp: new Date().toISOString(),
      payload: {}
    }, DEFAULT_ACCOUNT_ID);
  }
}

// Singleton instance used across the app layer
export const budgetService = new BudgetService();
