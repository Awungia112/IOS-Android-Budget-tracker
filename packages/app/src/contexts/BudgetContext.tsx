import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  useMemo,
  useRef,
  ReactNode,
} from "react";
import {
  Account,
  Transaction,
  Category,
  Limit,
  Template,
  RecurringItem,
  SavingsGoal,
  DEFAULT_ACCOUNT_ID,
  budgetService,
  syncEngine,
  loadPrivateKey,
  loadAccountKey,
  provisionAccountKeyForFirstSync,
  fetchUnwrapAndStoreAccountKey,
  upsertAccountSyncMetadata,
  getAccountSyncMetadata,
  getAccountSyncMetadataByServerId,
  deleteAccountSyncMetadata,
  processPendingKeyRequests,
  processPendingKeyDeliveries,
  restoreAccountFromServer,
  generateUUID,
  OnlineAccountSummary,
  OnlineAccountsError,
  deleteAccountKey,
  isMigrationInProgress,
  withExclusiveDatabaseOperation,
} from "@budget/core";
import { useAccount } from "./AccountContext";
import { usePendingInvites } from "./PendingInvitesContext";
import { toast } from "@/components/ui/use-toast";
import type { ExportData } from "@budget/core";
import {
  exportData,
  importData,
  pickAndImportData,
} from "@/services/exportService";
import { Capacitor } from "@capacitor/core";
import * as Sentry from "@sentry/capacitor";
import {
  normalizeCategoryKey,
  translateCategoryLabel,
} from "@/lib/categoryHelpers";
import { useTranslation } from "react-i18next";
import { toLocalDateString, formatCurrency } from "@/lib/formatters";
import {
  getStoredCurrentAccountId,
  setStoredCurrentAccountId,
  clearStoredCurrentAccountId,
} from "@/lib/accountStorage";
import { reportRemediationStats } from "@/lib/monitoring";
import { ensureCategories } from "@/lib/restoreCategories";
import { createRemoteCommandReplayer } from "@/lib/remoteCommandReplay";
import {
  runDuplicateMigrationRemediation,
  runDuplicateMigrationRemediationAndAct,
  purgeArchivedOlderThan,
  isRemediationDone,
  markRemediationDone,
  isRemediationInProgress,
  markRemediationInProgress,
  clearRemediationInProgress,
  runRestoreDuplicateCategoryRemediation,
  isRestoreDuplicateRemediationDone,
  markRestoreDuplicateRemediationDone,
} from '@budget/core';
import {
  API_BASE_URL,
  extractPublicKeyFromToken,
  parseJwtPayload,
  createAppOnlineAccountsClient,
} from "@/lib/api";
import {
  savePendingNotifications,
  getPendingNotificationsForAccount,
  clearPendingNotificationsForAccount,
  type PendingNotification,
} from "@/lib/pendingNotifications";

// Export the singleton for tests to stub behaviors.
export { budgetService as __test_budgetService };

export interface BudgetContextType {
  // Accounts
  currentAccount: Account | null;
  accounts: Account[];
  switchAccount: (accountId: string) => void;
  addAccount: (name: string) => Promise<Account | null>;
  deleteAccount: (accountId: string) => Promise<void>;
  updateAccount: (account: Account) => Promise<void>;
  /** Compute the balance (income - expense) for every account, keyed by account id. */
  getAccountBalances: () => Promise<Record<string, number>>;

  // Transactions
  transactions: Transaction[];
  addTransaction: (
    transaction: Omit<Transaction, "id" | "accountId">,
    options?: { silent?: boolean },
  ) => Promise<void>;
  updateTransaction: (transaction: Transaction) => Promise<void>;
  deleteTransaction: (id: string) => Promise<void>;

  // Categories
  categories: Category[];
  addCategory: (
    category: Omit<Category, "id" | "accountId" | "isDefault">,
  ) => Promise<void>;
  deleteCategory: (id: string) => Promise<void>;
  updateCategory: (
    id: string,
    updates: Partial<Omit<Category, "id" | "accountId" | "isDefault">>,
  ) => Promise<void>;

  // Limits
  limits: Limit[];
  addLimit: (limit: Omit<Limit, "id" | "accountId">) => Promise<void>;
  updateLimit: (limit: Limit) => Promise<void>;
  deleteLimit: (id: string) => Promise<void>;

  // Templates
  templates: Template[];
  addTemplate: (template: Omit<Template, "id" | "accountId">) => Promise<void>;
  updateTemplate: (template: Template) => Promise<void>;
  deleteTemplate: (id: string) => Promise<void>;
  applyTemplate: (templateId: string) => Promise<void>;

  // Recurring Items
  recurringItems: RecurringItem[];
  addRecurringItem: (
    item: Omit<RecurringItem, "id" | "accountId">,
    options?: { silent?: boolean },
  ) => Promise<string | undefined>;
  updateRecurringItem: (item: RecurringItem) => Promise<void>;
  deleteRecurringItem: (id: string) => Promise<void>;

  // Savings Goals
  savingsGoals: SavingsGoal[];
  addSavingsGoal: (
    goal: Omit<SavingsGoal, "id" | "accountId">,
  ) => Promise<void>;
  updateSavingsGoal: (goal: SavingsGoal, showToast?: boolean) => Promise<void>;
  deleteSavingsGoal: (id: string) => Promise<void>;

  // App Functions
  resetApp: () => Promise<void>;
  isLoading: boolean;
  triggerSync: () => Promise<void>;
  /** Poll for key delivery after accepting a shared account invite, then provision locally. */
  provisionSharedAccount: (
    serverAccountId: string,
    accountName: string,
  ) => Promise<{ success: boolean }>;

  /**
   * Re-read all accounts and the current account's data from the local DB
   * into React state. Used after out-of-band DB writes (e.g. recovery replay)
   * that bypass BudgetContext's CRUD methods, so the UI reflects the new data
   * without requiring a page refresh.
   */
  refreshFromDb: () => Promise<void>;

  // Export/Import
  exportAccountData: () => Promise<void>;
  importAccountData: (file?: File) => Promise<void>;

  // Settings
  isOfflineMode: boolean;
  setIsOfflineMode: (offline: boolean) => void;
  /** Explicit user action: go offline and persist the choice across reloads and account switches. */
  goOffline: () => void;
  goOnline: () => Promise<void>;
  /**
   * Request an automatic transition to online mode.
   * Call this after a successful registration or sign-in to ensure the app
   * transitions online even if the pending_go_online localStorage flag was
   * set before the relevant BudgetContext effects last ran.
   */
  requestGoOnline: () => void;
  /**
   * Trigger an immediate restore of online accounts from the server.
   * Call this after a sign-in flow where isLoggedIn was already true
   * (e.g. user signed in from the sidebar while a local account was active),
   * so the normal false→true transition on isLoggedIn won't fire.
   * NOTE: This is idempotent and safe to call multiple times - it will only
   * execute once per session due to the sessionStorage guard in restoreOnlineAccounts.
   */
  requestRestoreOnlineAccounts: () => void;
  isNetworkOnline: boolean;

  // Account Deletion
  deleteOnlineAccount: () => Promise<void>;

  // Pending Transactions
  executePendingTransactionsNow: () => Promise<void>;

  // Executed-while-away notifications
  missedNotifications: PendingNotification[];
  dismissMissedNotifications: () => void;
}

export const BudgetContext = createContext<BudgetContextType | undefined>(
  undefined,
);

// Sort categories: user-created (isDefault=false) first, then default categories
const categorySort = (a: Category, b: Category): number => {
  // User-created categories first, default categories below
  if (a.isDefault !== b.isDefault) return a.isDefault ? 1 : -1;
  return a.name.localeCompare(b.name);
};

export const BudgetProvider = ({ children }: { children: ReactNode }) => {
  const { t } = useTranslation();
  const [currentAccount, setCurrentAccountState] = useState<Account | null>(
    null,
  );
  // Live mirror of currentAccount for async closures (same pattern as
  // isOfflineModeRef). restoreOnlineAccounts has an empty deps array so its
  // closure always captures the initial null; reading currentAccountRef.current
  // at call time returns the true current value regardless of when the
  // callback was created.
  const currentAccountRef = useRef<Account | null>(null);
  const setCurrentAccount = useCallback((account: Account | null) => {
    currentAccountRef.current = account;
    setCurrentAccountState(account);
  }, []);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [limits, setLimits] = useState<Limit[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [recurringItems, setRecurringItems] = useState<RecurringItem[]>([]);
  const [savingsGoals, setSavingsGoals] = useState<SavingsGoal[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isOfflineMode, setIsOfflineModeState] = useState<boolean>(() => {
    // Respect explicit offline preference even when session token exists.
    // This prevents overriding a user's deliberate offline choice on remount.
    const stored = localStorage.getItem("budget-wise-offline-mode");
    if (stored !== null) return stored === "true";
    // No stored preference — auto-detect based on session token.
    if (localStorage.getItem("session_token")) return false;
    return true;
  });
  // Live mirror of isOfflineMode for async closures. Callbacks created before
  // an account switch (e.g. a triggerSync instance) capture the isOfflineMode
  // of their render; by the time they run, syncOnlineState may have resolved a
  // different mode for the new account. Guards must read this ref, never the
  // captured state, so a stale closure can't sync an explicitly-offline account.
  const isOfflineModeRef = useRef(isOfflineMode);
  const setIsOfflineMode = useCallback((offline: boolean) => {
    isOfflineModeRef.current = offline;
    setIsOfflineModeState(offline);
  }, []);

  // Notifications for transactions executed while the user was away
  const [missedNotifications, setMissedNotifications] = useState<
    PendingNotification[]
  >([]);

  // Boot-time sweep: drop stale preserved account names regardless of whether
  // the user ever signs back in. This satisfies the "never signs back in on a
  // shared device" privacy requirement — the TTL check inside
  // restoreOnlineAccounts only fires on sign-in and would never run otherwise.
  useEffect(() => {
    const ts = Number(
      localStorage.getItem("preservedAccountNamesTimestamp") || "0",
    );
    if (ts !== 0 && Date.now() - ts > 24 * 60 * 60 * 1000) {
      localStorage.removeItem("preservedAccountNames");
      localStorage.removeItem("preservedAccountNamesTimestamp");
      localStorage.removeItem("preservedAllAccountNames");
    }
  }, []);

  // One-time duplicate-migration-bug remediation sweep.
  // Phase 1 (detect-only): Runs silently on first launch after accounts are available,
  // logs aggregate stats to Sentry for threshold validation, then marks itself done.
  // Phase 2 (detect-and-act): After Phase 1 telemetry validates the approach,
  // automatically archives duplicate rows and shows a post-hoc toast notice.
  const remediationRanRef = useRef(false);
  // Shared lock to serialize both remediation effects (migration-duplicate and restore-duplicate).
  // Both effects mount in the same commit with identical deps and would interleave at the
  // first await, causing concurrent writes to the same tables when Phase 2 is enabled.
  // The Preferences-based isRemediationInProgress flag is check-then-set across await points
  // and cannot prevent the race. This ref provides synchronous mutual exclusion.
  const remediationLockRef = useRef(false);

  useEffect(() => {
    if (remediationRanRef.current) return;
    if (!accounts || accounts.length === 0) return;

    remediationRanRef.current = true;

    void (async () => {
      let ownsLock = false;
      try {
        const done = await isRemediationDone();
        if (done) return;

        // Synchronous lock acquisition — prevents restore-duplicate effect from interleaving.
        // Check and take the lock in the SAME synchronous step, before any await.
        if (remediationLockRef.current) {
          console.log('[Remediation] Another remediation is already running, skipping');
          return;
        }
        remediationLockRef.current = true;
        ownsLock = true;

        // Check the persisted flag AFTER taking the lock: if it's set while we hold the ref,
        // the flag is stale (left over from an interrupted run in a previous process).
        const inProgress = await isRemediationInProgress();
        if (inProgress) {
          console.log('[Remediation] Previous run was interrupted, skipping to prevent re-attempt');
          return;
        }

        await markRemediationInProgress();

        // Phase 2: detect-and-act (gated by app version or feature flag)
        // This should only run after Phase 1 telemetry has validated the 60s threshold.
        // For now, we gate this behind an environment variable to allow staged rollout.
        const shouldRunPhase2 = import.meta.env.VITE_ENABLE_REMEDIATION_PHASE2 === 'true';

          if (shouldRunPhase2) {
            const res = await withExclusiveDatabaseOperation(() =>
              runDuplicateMigrationRemediationAndAct(() => budgetService.getAccounts()),
            );

            // Log Phase 2 results for monitoring
            Sentry.captureMessage('remediation_phase2_complete', {
              extra: {
                archived: res.archived,
                accountsAnalyzed: res.result.accountsAnalyzed,
                totalDuplicateHashes: res.result.totalDuplicateHashes,
              },
            });

            // Reload current account data to reflect archived duplicates
            if (currentAccount) {
              await loadAccountData(currentAccount.id);
            }
          } else {
          // Phase 1: detect-only
          const result = await withExclusiveDatabaseOperation(() =>
            runDuplicateMigrationRemediation(() => budgetService.getAccounts()),
          );

          reportRemediationStats({
            accountsAnalyzed: result.accountsAnalyzed,
            accountsWithClusters: result.accountsWithClusters,
            totalClusters: result.totalClusters,
            totalDuplicateHashes: result.totalDuplicateHashes,
            withinClusterGaps: result.gapDistribution.withinClusters,
            betweenClusterGaps: result.gapDistribution.betweenClusters,
            wasCapped: result.wasCapped,
          });
        }

        await markRemediationDone();
        await clearRemediationInProgress();
      } catch (error) {
        await clearRemediationInProgress();
        Sentry.captureException(error, {
          tags: { phase: 'remediation', stage: import.meta.env.VITE_ENABLE_REMEDIATION_PHASE2 === 'true' ? 'phase2_sweep' : 'phase1_sweep' },
        });
      } finally {
        if (ownsLock) {
          remediationLockRef.current = false;
        }
      }
    })();
  }, [accounts, currentAccount]);

  // Restore-duplicate category remediation (MR #501 retroactive cleanup).
  // Serialized against the migration-duplicate remediation via remediationLockRef.
  const restoreRemediationRanRef = useRef(false);
  // Nonce to trigger a retry when deferring due to lock contention.
  const [restoreRemediationRetryNonce, setRestoreRemediationRetryNonce] = useState(0);

  useEffect(() => {
    if (restoreRemediationRanRef.current) return;
    if (!accounts || accounts.length === 0) return;

    restoreRemediationRanRef.current = true;

    void (async () => {
      let acquired = false;
      let ownsLock = false;
      try {
        const done = await isRestoreDuplicateRemediationDone();
        if (done) return;

        // Synchronous lock acquisition — prevents migration-duplicate effect from interleaving.
        // Check and take the lock in the SAME synchronous step, before any await.
        if (remediationLockRef.current) {
          console.log('[RestoreRemediation] Another remediation is already running, deferring');
          // Reset the ref and schedule a retry via nonce increment.
          restoreRemediationRanRef.current = false;
          // Defer the retry to let the other effect complete (avoid tight retry loop).
          setTimeout(() => setRestoreRemediationRetryNonce(n => n + 1), 100);
          return;
        }
        remediationLockRef.current = true;
        ownsLock = true;

        // Check the persisted flag AFTER taking the lock: if it's set while we hold the ref,
        // the flag is stale (left over from an interrupted run in a previous process).
        // Don't poll on that — just return, as the migration effect does.
        const inProgress = await isRemediationInProgress();
        if (inProgress) {
          console.log('[RestoreRemediation] Stale remediation_in_progress flag detected (interrupted run), skipping to prevent polling');
          return;
        }

        await markRemediationInProgress();
        acquired = true;

        try {
          const res = await withExclusiveDatabaseOperation(() =>
            runRestoreDuplicateCategoryRemediation(() => budgetService.getAccounts()),
          );

          // Only mark done when every pair succeeded — partial runs retry on next launch (#1 fix).
          if (res.fullySuccessful) {
            await markRestoreDuplicateRemediationDone();
          } else {
            console.warn('[RestoreRemediation] Partial failure — will retry on next launch');
          }

          // Report to Sentry when repairs were made OR when there was a partial failure.
          // Devices that throw on every launch need telemetry.
          if (res.accountsRepaired > 0 || !res.fullySuccessful) {
            const failedAccounts = res.accountResults.filter(a => a.pairsFailed > 0 || a.error);
            Sentry.captureMessage('restore_duplicate_category_remediation_complete', {
              level: res.fullySuccessful ? 'info' : 'warning',
              extra: {
                accountsRepaired: res.accountsRepaired,
                totalLosersArchived: res.totalLosersArchived,
                totalReferencesReassigned: res.totalReferencesReassigned,
                fullySuccessful: res.fullySuccessful,
                failedAccounts: failedAccounts.map(a => ({
                  accountId: a.accountId,
                  pairsFailed: a.pairsFailed,
                  error: a.error,
                })),
              },
            });
          }

          if (res.accountsRepaired > 0) {
            // Reload to surface the cleaned-up category list
            if (currentAccount) {
              await loadAccountData(currentAccount.id);
            }
          }
        } finally {
          if (acquired) {
            await clearRemediationInProgress();
          }
        }
      } catch (error) {
        if (acquired) {
          await clearRemediationInProgress();
        }
        Sentry.captureException(error, {
          tags: { phase: 'remediation', stage: 'restore_duplicate_categories' },
        });
      } finally {
        if (ownsLock) {
          remediationLockRef.current = false;
        }
      }
    })();
  }, [accounts, currentAccount, restoreRemediationRetryNonce]);

  // Dev-only helper: run Phase 2 (detect-and-act) from console for testing
  useEffect(() => {
    if (!import.meta.env.DEV) return;
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore - add test helper on window
    window.__runRemediationPhase2 = async () => {
      try {
        const res = await runDuplicateMigrationRemediationAndAct(() => budgetService.getAccounts());
        // Log to console for inspection (silent fix — no user-facing toast)
        // eslint-disable-next-line no-console
        console.info('[Remediation Phase2] result', res);

        // Reload current account data to reflect archived duplicates
        if (currentAccount) {
          await loadAccountData(currentAccount.id);
        }

        return res;
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error('Phase2 remediation failed', err);
        throw err;
      }
    };
    // @ts-ignore
    window.__purgeArchived = async (days = 30) => {
      try {
        const deleted = await purgeArchivedOlderThan(days);
        toast({ title: `Purged ${deleted} archived rows` });
        // eslint-disable-next-line no-console
        console.info('[Remediation purge] deleted', deleted);

        // Reload current account data to reflect purged archived rows
        if (currentAccount) {
          await loadAccountData(currentAccount.id);
        }

        return deleted;
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error('Purge failed', err);
        throw err;
      }
    };
    // @ts-ignore
    window.__runRestoreDuplicateRemediation = async () => {
      try {
        const res = await runRestoreDuplicateCategoryRemediation(() => budgetService.getAccounts());
        // eslint-disable-next-line no-console
        console.info('[RestoreDuplicateRemediation] result', res);
        if (res.accountsRepaired > 0 && currentAccount) {
          await loadAccountData(currentAccount.id);
        }
        return res;
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error('Restore-duplicate remediation failed', err);
        throw err;
      }
    };
    return () => {
      // @ts-ignore
      delete window.__runRemediationPhase2;
      // @ts-ignore
      delete window.__purgeArchived;
      // @ts-ignore
      delete window.__runRestoreDuplicateRemediation;
    };
  }, [currentAccount]);

  // Nonce incremented by requestGoOnline() to re-trigger the pending_go_online effect
  // when the localStorage flag is set after the effect's deps have already stabilised.
  const [goOnlineNonce, setGoOnlineNonce] = useState(0);

  // Guard to ensure the legacy createdAt migration runs only once per mount
  const migrationRanRef = useRef(false);

  // Account, day and item ids of the last startup reconciliation, so the
  // several account loads during startup don't repeat it.
  const recurringReconcileKeyRef = useRef<string | null>(null);
  const provisioningSharedAccountsRef = useRef<
    Map<string, Promise<{ success: boolean }>>
  >(new Map());
  const suppressNextAccountDataLoadRef = useRef(false);

  // Network state - tracks device connectivity
  const [isNetworkOnline, setIsNetworkOnline] = useState<boolean>(
    typeof navigator !== "undefined" ? navigator.onLine : true,
  );

  // Listen to network connectivity changes
  useEffect(() => {
    const handleOnline = () => setIsNetworkOnline(true);
    const handleOffline = () => setIsNetworkOnline(false);

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  const { isAuthenticated: isLoggedIn, resetOnboarding } = useAccount();
  const { pendingKeyDeliveryAccountIds, removePendingKeyDeliveryAccount } =
    usePendingInvites();

  // After login, restore accounts that were previously online but were deleted
  // from the local database on logout. Fetches server-side accounts and creates
  // local Account + accountSyncMetadata + account key for each.
  // Uses a sessionStorage flag so it runs at most once per browser session,
  // preventing duplicate account creation on every page refresh.
  // NOTE: Uses currentAccountRef to read current account at call time, avoiding
  // stale closure issues. Only 't' is in deps since it's used for toast messages.
  const restoreOnlineAccounts = useCallback(async () => {
    // Guard: only run once per session. Page refreshes keep sessionStorage but
    // reset the React component tree (prevIsLoggedInRef → false), which would
    // otherwise re-trigger this on every reload.
    if (sessionStorage.getItem("restoreOnlineAccountsDone")) {
      return;
    }
    const token = localStorage.getItem("session_token");
    if (!token) {
      console.warn("[restore] No session_token — skipping restore");
      return;
    }
    // Guard is set only after confirming a token exists. Setting it before the
    // token check would burn the once-per-session slot for local-only users
    // (e.g. completing onboarding without signing in), so a subsequent sign-in
    // in the same browser session would silently skip restore.
    sessionStorage.setItem("restoreOnlineAccountsDone", "1");

    const userId = localStorage.getItem("userId");
    if (!userId) {
      console.warn("[restore] No userId — skipping restore");
      return;
    }

    const userPublicKey = extractPublicKeyFromToken(token);
    if (!userPublicKey) {
      console.warn(
        "[restore] Could not extract public key from session token — skipping restore",
      );
      return;
    }

    const userPrivateKey = await loadPrivateKey(userId).catch(() => null);
    if (!userPrivateKey) {
      console.info(
        "[restore] Private key not found — skipping online account restore",
      );
      return;
    }

    const client = createAppOnlineAccountsClient({
      sessionToken: token,
      baseUrl: API_BASE_URL || window.location.origin,
    });

    let serverAccounts: OnlineAccountSummary[];
    try {
      const result = await client.listAccounts();
      serverAccounts = result.accounts;
    } catch (err) {
      console.warn("[restore] listAccounts failed", err);
      return;
    }

    if (serverAccounts.length === 0) {
      console.info("[restore] No server accounts found — nothing to restore");
      return;
    }

    // Read preserved account names from localStorage (saved by AccountContext.logout()).
    // Discard if older than 24 hours to avoid plaintext names lingering on shared devices.
    const preservedNames: Record<string, { name: string; initials: string }> =
      (() => {
        try {
          const ts = Number(
            localStorage.getItem("preservedAccountNamesTimestamp") || "0",
          );
          const age = Date.now() - ts;
          if (ts === 0 || age > 24 * 60 * 60 * 1000) {
            localStorage.removeItem("preservedAccountNames");
            localStorage.removeItem("preservedAccountNamesTimestamp");
            return {};
          }
          return JSON.parse(
            localStorage.getItem("preservedAccountNames") || "{}",
          );
        } catch {
          return {};
        }
      })();

    let restored = 0;
    // Load all local accounts once so we can match orphaned placeholders.
    const allLocalAccounts = await budgetService.getAccounts();
    // Build a set of localAccountIds that are already linked to a server account.
    const linkedLocalIds = new Set(
      (
        await Promise.all(
          allLocalAccounts.map((a) => getAccountSyncMetadata(a.id)),
        )
      )
        .filter(Boolean)
        .map((m) => m!.localAccountId),
    );

    for (const serverAccount of serverAccounts) {
      let localAccountId: string | undefined;
      let wasOrphanReused = false;
      try {
        // Skip accounts already linked locally
        const existing = await getAccountSyncMetadataByServerId(
          serverAccount.id,
        );
        if (existing) continue;

        const preserved = preservedNames[serverAccount.id.toLowerCase()];

        // Check for an orphaned placeholder account left by a previous broken
        // restore (metadata was deleted by sync engine on a transient 404).
        // Match by the placeholder name pattern to avoid creating yet another duplicate.
        const placeholderName = `Account (${serverAccount.id.slice(0, 8)})`;
        const orphan = allLocalAccounts.find(
          (a) => !linkedLocalIds.has(a.id) && a.name === placeholderName,
        );

        wasOrphanReused = !!orphan;
        if (orphan) {
          localAccountId = orphan.id;
        } else {
          // A surviving local account may already hold the preserved name
          // (#484 rejects duplicate account names). Fall back to the
          // placeholder in that case — the CREATE_ACCOUNT replay below applies
          // the real name once the changelog has been pulled.
          const nameTaken =
            !!preserved &&
            allLocalAccounts.some((a) => a.name === preserved.name);
          if (nameTaken) {
            console.warn(
              "[restore] Preserved name already in use for",
              serverAccount.id,
              "— falling back to placeholder",
            );
          }
          const created = await budgetService.createAccount(
            {
              name: !preserved || nameTaken ? placeholderName : preserved.name,
              initials: !preserved || nameTaken ? "ON" : preserved.initials,
            },
            // skipCategories: the account's own BULK_CREATE_CATEGORIES record
            // is pulled from the server below and applied by id. Seeding a
            // competing set here is what produced 72 categories (#501).
            true,
          );
          localAccountId = created.id;
          // Keep the local snapshot current so the name check above and the
          // orphan match are accurate for the remaining server accounts.
          allLocalAccounts.push(created);
        }

        // If we found an orphan and have a preserved name, update its name now.
        if (orphan && preserved) {
          await budgetService.updateAccount({
            ...orphan,
            name: preserved.name,
            initials: preserved.initials,
          });
        }

        // Mark this localAccountId as linked so subsequent iterations don't reuse it.
        linkedLocalIds.add(localAccountId);

        console.log(
          "[restore] Restoring account",
          serverAccount.id,
          "— orphan reused:",
          wasOrphanReused,
          "preserved name available:",
          !!preserved,
        );

        await restoreAccountFromServer({
          serverAccountId: serverAccount.id,
          localAccountId,
          userPublicKey,
          userPrivateKey,
          client,
          role: serverAccount.role,
        });

        // Pull and replay the changelog immediately so the CREATE_ACCOUNT
        // command (which carries the real account name) and the account's
        // BULK_CREATE_CATEGORIES record are applied before we surface this
        // account in the UI — a reused orphan needs this as much as a freshly
        // created one. ensureCategories retries until the pull is confirmed
        // and only then seeds defaults, if the server had no category record.
        const sleep = (ms: number) =>
          new Promise((resolve) => setTimeout(resolve, ms));
        await ensureCategories(localAccountId, serverAccount.role, {
          syncEngine,
          triggerSyncParams: (lid, role) => ({
            client,
            userPublicKey,
            userPrivateKey,
            role,
            executeCommand: createRemoteCommandReplayer(lid, budgetService),
          }),
          sleep,
          budgetService,
        });

        restored++;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        if (
          message.toLowerCase().includes("authentication tag") ||
          message.toLowerCase().includes("decryption failed")
        ) {
          // The local private key doesn't match the public key used to wrap this
          // account key on the server. This typically means the device keystore
          // has a stale or overwritten private key. The user must recover their
          // account to re-establish the correct key pair.
          console.error(
            "[restore] Key mismatch for account",
            serverAccount.id,
            "— device private key does not match server-side wrapped key. User needs Account Recovery.",
          );
          toast({
            title: t("error"),
            description: t("restore_key_mismatch_use_recovery"),
            variant: "destructive",
          });
          // Clean up the placeholder account we just created — it can't be linked.
          if (!wasOrphanReused && localAccountId) {
            try {
              await budgetService.deleteAccount(localAccountId);
            } catch {
              /* ignore */
            }
          }
        } else {
          console.warn(
            "[restore] Failed to restore account",
            serverAccount.id,
            err,
          );
          toast({
            title: t("error"),
            description: t("restore_account_failed"),
            variant: "destructive",
          });
        }
      }
    }

    localStorage.removeItem("preservedAccountNames");
    localStorage.removeItem("preservedAccountNamesTimestamp");
    localStorage.removeItem("preservedAllAccountNames");

    if (restored > 0) {
      const loadedAccounts = await budgetService.getAccounts();
      setAccounts(loadedAccounts);

      // Build the set of account IDs that were just restored from the server
      // so we can tell whether the current selection is a local-only account.
      const restoredLocalIds = new Set(
        (
          await Promise.all(
            serverAccounts.map((sa) =>
              getAccountSyncMetadataByServerId(sa.id).then((m) =>
                m ? m.localAccountId : null,
              ),
            ),
          )
        ).filter(Boolean) as string[],
      );

      // Select the first restored online account when:
      //   a) nothing is selected (fresh login / after logout), OR
      //   b) the current selection is a local-only account (e.g. the default
      //      account that was active when the user clicked "Sign in" from the
      //      sidebar). In case (b) we switch automatically so the user lands
      //      on their synced data instead of an empty local account.
      // NOTE: We compute the choice outside the state updater to avoid side effects
      // inside the updater function, which must be pure for React StrictMode compatibility.
      const isLocalOnlySelection =
        !currentAccountRef.current ||
        !restoredLocalIds.has(currentAccountRef.current.id);

      if (!isLocalOnlySelection) {
        // already on an online account — keep it
        return;
      }

      const storedId = getStoredCurrentAccountId();
      const chosen =
        (storedId && restoredLocalIds.has(storedId)
          ? loadedAccounts.find((a) => a.id === storedId)
          : undefined) ||
        loadedAccounts.find((a) => restoredLocalIds.has(a.id)) ||
        loadedAccounts.find((a) => a.id !== DEFAULT_ACCOUNT_ID) ||
        loadedAccounts[0] ||
        null;
      if (chosen) {
        setStoredCurrentAccountId(chosen.id);
        setCurrentAccount(chosen);
        // Notify the user that we switched to their synced account
        toast({
          title: t("account_switched"),
          description: t("account_switched_to_synced"),
          variant: "default",
        });
      }
    }
  }, [t]);

  // When the user logs in, clear any stored offline preference so that
  // syncOnlineState can auto-detect online mode based on sync metadata.
  // This ensures returning users with online accounts are automatically
  // brought online after login, rather than stuck in a stale offline state.
  // Initialize to false so the first render with isLoggedIn===true triggers cleanup
  // (handles the case where BudgetProvider remounts after registration with
  // isLoggedIn already true from localStorage).
  const prevIsLoggedInRef = useRef(false);
  useEffect(() => {
    // Cancellation guard: isLoggedIn can flip back to true (fast re-login or
    // registration right after logout) while the logout refresh below is still
    // awaiting IndexedDB. The cleanup marks this run as cancelled so the stale
    // continuation cannot clobber the new session's state (see ticket #380).
    let cancelled = false;
    if (isLoggedIn && !prevIsLoggedInRef.current) {
      localStorage.removeItem("budget-wise-offline-mode");
      // NOTE: budget-wise-offline-explicit is intentionally NOT cleared here.
      // prevIsLoggedInRef starts as false, so every remount while already
      // logged-in (e.g. a browser reload) triggers this block — clearing the
      // explicit key would silently discard the user's deliberate offline choice.
      // The explicit key is only cleared by the user explicitly going back online
      // (goOnline()) or on an actual fresh login / registration flow.
      // Restore online accounts from the server that were deleted on logout.
      restoreOnlineAccounts().catch(console.warn);
    } else if (!isLoggedIn && prevIsLoggedInRef.current) {
      // Accounts were already deleted from IndexedDB by AccountContext.logout().
      // Fully refresh the in-memory state: the account list, the currently
      // selected account, and every per-account data array. Without this, the
      // previous session's online account and its transactions/categories/etc.
      // remain in React state and are re-displayed after a subsequent
      // registration until the app is manually reloaded (see ticket #380).
      //
      // On ANY failure (getAccounts() rejecting because IndexedDB is
      // transiently blocked right after the bulk delete, or loadAccountData()
      // failing internally) we fall back to clearing everything. Showing an
      // empty list on a rare DB error is strictly better than showing deleted
      // accounts, which is exactly the bug we're fixing. The isLoggedIn
      // transition is single-shot, so there is no automatic retry — the clear
      // is the safe terminal state.
      const clearAllInMemoryState = () => {
        setAccounts([]);
        clearStoredCurrentAccountId();
        setCurrentAccount(null);
        clearAccountData();
        setMissedNotifications([]);
      };

      void (async () => {
        try {
          const loadedAccounts = await budgetService.getAccounts();
          if (cancelled) return;
          setAccounts(loadedAccounts);

          // Reset the selected account to one that still exists. Prefer the
          // persisted id only if it survived logout; otherwise fall back to the
          // default account, then the first available. This prevents a deleted
          // online account from remaining as currentAccount.
          const storedId = getStoredCurrentAccountId();
          const chosen =
            (storedId
              ? loadedAccounts.find((a) => a.id === storedId)
              : undefined) ||
            loadedAccounts.find((a) => a.id === DEFAULT_ACCOUNT_ID) ||
            loadedAccounts[0] ||
            null;

          if (chosen) {
            await refreshFromDb({ clearOnFailure: true, isCancelled: () => cancelled });
          } else {
            clearAllInMemoryState();
          }
        } catch (err) {
          if (cancelled) return;
          console.warn("Failed to refresh in-memory state after logout:", err);
          // Fall back to a clean slate so no stale/deleted account can resurface.
          clearAllInMemoryState();
        }
      })();
    }
    prevIsLoggedInRef.current = isLoggedIn;
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoggedIn]);

  // Persist offline mode
  useEffect(() => {
    localStorage.setItem("budget-wise-offline-mode", isOfflineMode.toString());

    // Notify Service Worker about the offline mode change
    if ("serviceWorker" in navigator && navigator.serviceWorker) {
      navigator.serviceWorker.ready
        .then((reg) => {
          reg.active?.postMessage({
            type: "SET_OFFLINE_MODE",
            offline: isOfflineMode,
          });
        })
        .catch((error) => {
          console.warn(
            "[SW] Could not send offline mode to service worker:",
            error,
          );
        });
    }
  }, [isOfflineMode]);

  // Persist account names to localStorage so they survive logout+login.
  // AccountContext.logout() deletes online accounts (including their names),
  // and restoreOnlineAccounts() needs the original names when re-creating
  // accounts from server data. This runs whenever the account list changes.
  useEffect(() => {
    if (!accounts || accounts.length === 0) return;
    const backup: Record<string, { name: string; initials: string }> = {};
    for (const a of accounts) {
      backup[a.id.toLowerCase()] = { name: a.name, initials: a.initials };
    }
    localStorage.setItem("preservedAllAccountNames", JSON.stringify(backup));
    console.log(
      "[BudgetContext] Saved preservedAllAccountNames:",
      Object.keys(backup).length,
      "accounts",
    );
  }, [accounts]);

  const clearAccountData = useCallback(() => {
    setTransactions([]);
    setCategories([]);
    setLimits([]);
    setTemplates([]);
    setRecurringItems([]);
    setSavingsGoals([]);
  }, []);

  const clearInMemoryBudgetState = useCallback(() => {
    setAccounts([]);
    clearStoredCurrentAccountId();
    setCurrentAccount(null);
    clearAccountData();
    setMissedNotifications([]);
  }, [clearAccountData]);
  // Define callbacks before useEffects that depend on them
  const loadAccounts = useCallback(
    async (options?: {
      selectCurrentAccount?: boolean;
      isCancelled?: () => boolean;
    }): Promise<Account[]> => {
      try {
        const loadedAccounts = await budgetService.getAccounts();
        if (options?.isCancelled?.()) return loadedAccounts;
        setAccounts(loadedAccounts);

        // Select the default account if available, but prefer the last-used one from localStorage
        if (
          options?.selectCurrentAccount !== false &&
          loadedAccounts.length > 0
        ) {
          let chosenAccount: Account | undefined;

          // try stored id first
          const storedId = getStoredCurrentAccountId();
          if (storedId) {
            chosenAccount = loadedAccounts.find((acc) => acc.id === storedId);
          }

          // fall back to default / first account
          if (!chosenAccount) {
            chosenAccount =
              loadedAccounts.find((acc) => acc.id === DEFAULT_ACCOUNT_ID) ||
              loadedAccounts[0];
          }

          setCurrentAccount(chosenAccount);
        }

        return loadedAccounts;
      } catch (error) {
        console.error("Failed to load accounts:", error);
        toast({
          title: t("error"),
          description: t("failed_to_load_accounts"),
          variant: "destructive",
        });
        return [];
      }
    },
    [t],
  );

  const loadAccountData = useCallback(
    async (
      accountId: string,
      options?: { clearOnFailure?: boolean; isCancelled?: () => boolean },
    ): Promise<boolean> => {
      try {
        const [
          loadedTransactions,
          accountCategories,
          accountLimits,
          accountTemplates,
          accountRecurringItems,
          accountSavingsGoals,
        ] = await Promise.all([
          budgetService.getTransactionsByAccountId(accountId),
          budgetService.getCategoriesByAccountId(accountId),
          budgetService.getLimitsByAccountId(accountId),
          budgetService.getTemplatesByAccountId(accountId),
          budgetService.getRecurringItemsByAccountId(accountId),
          budgetService.getSavingsGoalsByAccountId(accountId),
        ]);
        // Re-read below when reconciliation writes occurrences.
        let accountTransactions = loadedTransactions;

        const recurringList = Array.isArray(accountRecurringItems)
          ? accountRecurringItems
          : [];
        const reconcileKey = `${accountId}:${toLocalDateString(new Date())}:${recurringList
          .map((item) => item.id)
          .sort()
          .join(',')}`;

        // A running migration reconciles the recurring items it imports itself.
        if (
          recurringList.length > 0 &&
          !isMigrationInProgress() &&
          recurringReconcileKeyRef.current !== reconcileKey
        ) {
          // Claim the key before awaiting so overlapping account loads cannot
          // all schedule the same reconciliation work.
          recurringReconcileKeyRef.current = reconcileKey;
          const results = await Promise.allSettled(
            recurringList.map((item) => budgetService.reconcileRecurring(item)),
          );
          if (results.some((result) => result.status === "fulfilled" && result.value)) {
            accountTransactions = await budgetService.getTransactionsByAccountId(accountId);
          }

          // Reconciliation only adds generated occurrences, so a failure must
          // never stop the account's existing data from loading. Release the
          // key so the next load retries.
          const failures = results.filter(
            (result): result is PromiseRejectedResult => result.status === "rejected",
          );
          if (failures.length > 0) {
            if (recurringReconcileKeyRef.current === reconcileKey) {
              recurringReconcileKeyRef.current = null;
            }
            for (const failure of failures) {
              console.error("Failed to reconcile recurring item:", failure.reason);
              Sentry.captureException(failure.reason, {
                tags: { phase: "recurring_reconcile" },
              });
            }
          }
        }

        const reconciledTransactions = accountTransactions;

        let visibleCategories = Array.isArray(accountCategories)
          ? accountCategories
          : [];

        if (
          visibleCategories.length === 0 &&
          accountId !== DEFAULT_ACCOUNT_ID
        ) {
          const metadata = await getAccountSyncMetadata(accountId);
          if (metadata) {
            const fallbackCategories =
              await budgetService.getCategoriesByAccountId(DEFAULT_ACCOUNT_ID);
            visibleCategories = fallbackCategories.map((category) => ({
              ...category,
              accountId,
            }));
          }
        }

        // A cancelled caller (e.g. a logout refresh overtaken by a fast
        // re-login) must not overwrite state loaded for the new session.
        if (options?.isCancelled?.()) return false;

        // Set state directly - no filtering needed, service layer did it.
        // Use fallbacks in case the service returns undefined.
        setTransactions(
          Array.isArray(reconciledTransactions)
            ? reconciledTransactions
            : Array.isArray(accountTransactions)
              ? accountTransactions
              : [],
        );
        setCategories([...visibleCategories].sort(categorySort));
        setLimits(Array.isArray(accountLimits) ? accountLimits : []);
        setTemplates(Array.isArray(accountTemplates) ? accountTemplates : []);
        setRecurringItems(
          Array.isArray(accountRecurringItems) ? accountRecurringItems : [],
        );
        setSavingsGoals(
          Array.isArray(accountSavingsGoals) ? accountSavingsGoals : [],
        );

        // Expose categories for E2E testing
        if (typeof window !== "undefined") {
          (window as any).testCategories = visibleCategories;
        }

        return true;
      } catch (error) {
        console.error("Failed to load account data:", error);
        if (options?.isCancelled?.()) return false;
        if (options?.clearOnFailure) {
          clearInMemoryBudgetState();
        } else {
          toast({
            title: t("error"),
            description: t("failed_to_load_account_data"),
            variant: "destructive",
          });
        }
        return false;
      }
    },
    [clearInMemoryBudgetState, t],
  );

  /**
   * Re-read all accounts and the current account's data from the local DB
   * into React state. Used after out-of-band DB writes (e.g. recovery replay)
   * that bypass BudgetContext's CRUD methods, so the UI reflects the new data
   * without requiring a page refresh.
   */
  const refreshFromDb = useCallback(
    async (options?: { clearOnFailure?: boolean; isCancelled?: () => boolean }) => {
      const loadedAccounts = await loadAccounts({
        selectCurrentAccount: false,
        isCancelled: options?.isCancelled,
      });
      // Bail before mutating anything: a cancelled refresh (logout overtaken by
      // a fast re-login) must not clear data, reset the sync engine, or re-pick
      // the current account for a session it no longer belongs to.
      if (options?.isCancelled?.()) return;
      const storedId = getStoredCurrentAccountId();
      const chosenAccount =
        (storedId
          ? loadedAccounts.find((acc) => acc.id === storedId)
          : undefined) ||
        loadedAccounts.find((acc) => acc.id === DEFAULT_ACCOUNT_ID) ||
        loadedAccounts[0] ||
        null;

      clearAccountData();
      syncEngine.reset();

      if (chosenAccount) {
        suppressNextAccountDataLoadRef.current = true;
        setCurrentAccount(chosenAccount);
        setStoredCurrentAccountId(chosenAccount.id);
        await loadAccountData(chosenAccount.id, options);
        return;
      }

      setCurrentAccount(null);
      clearStoredCurrentAccountId();
      clearInMemoryBudgetState();
    },
    [clearAccountData, clearInMemoryBudgetState, loadAccounts, loadAccountData],
  );

  const triggerSync = useCallback(async () => {
    // Read the ref, not the captured state: this instance may have been
    // created before the current account's mode was resolved.
    if (isOfflineModeRef.current || !isNetworkOnline) {
      return;
    }
    if (!isLoggedIn) {
      return;
    }
    if (!currentAccount) {
      return;
    }

    const token = localStorage.getItem("session_token");
    if (!token) {
      return;
    }

    const client = createAppOnlineAccountsClient({
      sessionToken: token,
      baseUrl: API_BASE_URL || window.location.origin,
    });

    try {
      // Attempt to supply keypair to the sync engine so it can detect
      // epoch rotations and fetch/unwrap new account keys when needed.
      let userPublicKey: Uint8Array | undefined;
      let userPrivateKey: Uint8Array | undefined;

      const extractedKey = extractPublicKeyFromToken(token);
      if (extractedKey) {
        userPublicKey = extractedKey;
      }

      // Load private key from native keystore if available (Onboarding stores
      // it under the `userId` localStorage key).
      const userId = localStorage.getItem("userId");
      if (userId) {
        try {
          const priv = await loadPrivateKey(userId);
          if (priv) userPrivateKey = priv;
        } catch (err) {
          // ignore keystore load errors — sync will continue without keys
        }
      }

      // Check whether the account had sync metadata before this sync cycle
      // so we can detect if it was removed during sync.
      const hadMetadata = !!(await getAccountSyncMetadata(currentAccount.id));

      // triggerSync() bails synchronously when the engine is already SYNCING
      // (e.g. restoreOnlineAccounts pulling another account). Read the state
      // with no await in between so we know whether the run below is ours.
      const syncRanForUs = syncEngine.getState() !== "SYNCING";

      await syncEngine.triggerSync({
        client,
        localAccountId: currentAccount.id,
        executeCommand: createRemoteCommandReplayer(
          currentAccount.id,
          budgetService,
        ),
        userPublicKey,
        userPrivateKey,
      });

      // Detect if the user was removed from a shared account (sync engine
      // deletes the metadata on 403 Forbidden). Show a notification and
      // refresh the account list so the removed account reappears as local.
      const currentMetadata = await getAccountSyncMetadata(currentAccount.id);
      const hasMetadata = !!currentMetadata;
      if (hadMetadata && !hasMetadata) {
        toast({
          title: t("account_removed"),
          description:
            t("account_removed_desc") ||
            "You have been removed from this shared account. The account will now be available as a local copy.",
          variant: "destructive",
        });
        await loadAccounts();
      }

      // #501 safety net: defaults still missing after a *confirmed* sync exist
      // nowhere — the server never received a BULK_CREATE_CATEGORIES record for
      // this account (provisioned before the enqueue fix). Create them and log
      // the command so the set reaches the server instead of staying local to
      // this device. This is also what fills in a restore whose initial pull
      // could not be confirmed, which ensureCategories deliberately leaves
      // alone rather than seeding blind.
      //
      // Safe against a paginated pull: records replay in ascending sequence and
      // BULK_CREATE_CATEGORIES is written at account creation, so it is always
      // on the first page. seedDefaultCategories is a cheap read when nothing
      // is missing, which is the normal case on every sync.
      // Owners only: seeding logs the set and pushes it, so doing this on a
      // member's device would publish a second category set into an account
      // somebody else owns and hand the owner 72 categories. The owner's own
      // device is the one that publishes.
      if (
        hasMetadata &&
        currentMetadata?.role !== "member" &&
        syncRanForUs &&
        syncEngine.getState() === "SYNCED"
      ) {
        const seeded = await budgetService.seedDefaultCategories(
          currentAccount.id,
          { logCommand: true },
        );
        if (seeded) {
          console.warn(
            "[sync] Default categories were missing after a confirmed sync — seeded them",
            currentAccount.id,
          );
        }
        // Rows replayed from the server can reference the stable default
        // category ids the install-time populate used, which this device's
        // restored categories no longer carry.
        const repaired = await budgetService.repairDefaultCategoryReferences(
          currentAccount.id,
        );
        if (repaired > 0) {
          console.warn(
            "[sync] Re-pointed",
            repaired,
            "row(s) at the restored categories for",
            currentAccount.id,
          );
        }
      }

      await loadAccountData(currentAccount.id);
    } catch (error) {
      console.error("Trigger sync failed:", error);
    }
  }, [
    isNetworkOnline,
    isLoggedIn,
    currentAccount,
    loadAccountData,
    loadAccounts,
    t,
  ]);

  /**
   * Owner-side: deliver wrapped account keys to accepted invitees.
   *
   * On each foreground event, online event, and every 60 seconds while the app
   * is visible and authenticated, poll for pending key requests on all accounts
   * the user owns, and flush any locally-queued key deliveries from prior
   * transient failures.
   */
  const deliverPendingKeys = useCallback(async () => {
    if (!isLoggedIn || !isNetworkOnline) return;

    const token = localStorage.getItem("session_token");
    if (!token) return;

    const userId = localStorage.getItem("userId");
    const userPrivateKey = userId
      ? await loadPrivateKey(userId).catch(() => null)
      : null;
    if (!userPrivateKey) return;

    const client = createAppOnlineAccountsClient({
      sessionToken: token,
      baseUrl: API_BASE_URL || window.location.origin,
    });

    // Flush any previously-enqueued key deliveries that failed due to network issues.
    try {
      const deliveryResults = await processPendingKeyDeliveries(client);
      for (const result of deliveryResults) {
        if (result.success) {
          toast({
            title: t("access_granted"),
            description: t("access_granted_description"),
          });
        }
      }
    } catch (err) {
      console.warn("Failed to flush pending key deliveries:", err);
    }

    // For each account the user owns, check if any invitees need key delivery.
    try {
      const { accounts: serverAccounts } = await client.listAccounts();

      // Clean up stale pending key delivery entries after the account is both
      // accessible on the server and linked locally. Server visibility alone is
      // not enough; the recipient still needs local provisioning.
      try {
        const accessibleIds = new Set(serverAccounts.map((a) => a.id));
        const raw = sessionStorage.getItem("pending_key_delivery_accounts");
        if (raw) {
          const pending: string[] = JSON.parse(raw);
          const staleIds: string[] = [];
          for (const id of pending) {
            if (!accessibleIds.has(id)) continue;
            if (await getAccountSyncMetadataByServerId(id)) {
              staleIds.push(id);
            }
          }
          for (const id of staleIds) {
            removePendingKeyDeliveryAccount(id);
          }
        }
      } catch {
        /* ignore storage errors */
      }

      for (const serverAccount of serverAccounts) {
        if (serverAccount.role !== "owner") continue;

        const accountKey = await loadAccountKey(serverAccount.id);
        if (!accountKey) continue;

        try {
          const results = await processPendingKeyRequests({
            serverAccountId: serverAccount.id,
            accountKey,
            epoch: serverAccount.keyEpoch,
            client,
          });
          const successCount = results.filter((r) => r.success).length;
          if (successCount > 0) {
            toast({
              title: t("access_granted"),
              description:
                successCount === 1
                  ? t("access_granted_description")
                  : t("access_granted_description_plural", {
                      count: successCount,
                    }),
            });
          }
        } catch (err) {
          console.warn(
            "Key delivery polling failed for account",
            serverAccount.id,
            err,
          );
        }
      }
    } catch (err) {
      console.warn("Failed to list accounts for key delivery:", err);
    }
  }, [isLoggedIn, isNetworkOnline, t, removePendingKeyDeliveryAccount]);

  // Foreground + periodic key delivery trigger
  useEffect(() => {
    if (!isLoggedIn) return;

    // Run immediately when the hook mounts (app start or auth change)
    void deliverPendingKeys();

    // Periodic: every 60 seconds while authenticated
    const interval = setInterval(deliverPendingKeys, 60_000);

    // Foreground: run when user returns to the app
    const handleVisibility = () => {
      if (document.visibilityState === "visible") {
        void deliverPendingKeys();
      }
    };
    document.addEventListener("visibilitychange", handleVisibility);

    // Online: run when network connectivity is restored
    const handleOnline = () => {
      void deliverPendingKeys();
    };
    window.addEventListener("online", handleOnline);

    return () => {
      clearInterval(interval);
      document.removeEventListener("visibilitychange", handleVisibility);
      window.removeEventListener("online", handleOnline);
    };
  }, [isLoggedIn, deliverPendingKeys]);

  /**
   * After a recipient accepts an invite, the owner must deliver the wrapped account key.
   * This function polls listAccounts until the shared account appears (key delivered),
   * then provisions it locally so it shows up in the account switcher.
   */
  const provisionSharedAccount = useCallback(
    async (
      serverAccountId: string,
      accountName: string,
    ): Promise<{ success: boolean }> => {
      const existingProvisioning =
        provisioningSharedAccountsRef.current.get(serverAccountId);
      if (existingProvisioning) {
        return existingProvisioning;
      }

      const provisioning = (async (): Promise<{ success: boolean }> => {
        const existingMetadata =
          await getAccountSyncMetadataByServerId(serverAccountId);
        if (existingMetadata) {
          removePendingKeyDeliveryAccount(serverAccountId);
          await loadAccounts();
          return { success: true };
        }

        const token = localStorage.getItem("session_token");
        if (!token) return { success: false };

        const userPublicKey = extractPublicKeyFromToken(token);
        if (!userPublicKey) return { success: false };

        const userId = localStorage.getItem("userId");
        const userPrivateKey = userId
          ? await loadPrivateKey(userId).catch(() => null)
          : null;
        if (!userPrivateKey) return { success: false };

        const client = createAppOnlineAccountsClient({
          sessionToken: token,
          baseUrl: API_BASE_URL || window.location.origin,
        });

        // Poll until the account key is available (owner delivers it on their next sync)
        const maxAttempts = 90; // 3 minutes at 2s intervals
        for (let i = 0; i < maxAttempts; i++) {
          try {
            const { accounts: serverAccounts } = await client.listAccounts();
            const found = serverAccounts.find((a) => a.id === serverAccountId);
            if (found) {
              const existingMetadataAfterPoll =
                await getAccountSyncMetadataByServerId(serverAccountId);
              if (existingMetadataAfterPoll) {
                removePendingKeyDeliveryAccount(serverAccountId);
                await loadAccounts();
                return { success: true };
              }

              // Key is available — fetch, unwrap and store locally
              await fetchUnwrapAndStoreAccountKey({
                serverAccountId,
                userPublicKey,
                userPrivateKey,
                client,
                epoch: found.keyEpoch,
              });

              // Create a local account linked to the server account.
              // Do NOT seed default categories — they will be pulled from the
              // server via sync (the owner's BULK_CREATE_CATEGORIES record).
              // Clear any stale account key from a previously provisioned account
              // so the createAccount commands stay local (no encrypt / no enqueue).
              budgetService.clearAccountKey();

              // Create a local account linked to the server account
              const initials = accountName
                .trim()
                .split(/\s+/)
                .map((w) => w[0])
                .join("")
                .toUpperCase()
                .substring(0, 2);
              const newAccount = await budgetService.createAccount(
                { name: accountName, initials },
                true,
              );

              await upsertAccountSyncMetadata({
                localAccountId: newAccount.id,
                serverAccountId,
                keyEpoch: found.keyEpoch,
                role: "member",
              });

              await budgetService.loadKeyForAccount(serverAccountId);
              await loadAccountData(newAccount.id);

              // Remove this account from the pending key delivery set since
              // provisioning succeeded — the key was delivered by the owner.
              removePendingKeyDeliveryAccount(serverAccountId);

              // Pull all existing change records for the shared account immediately.
              // Wait briefly for any in-flight sync to finish before starting ours.
              await new Promise((resolve) => setTimeout(resolve, 500));
              try {
                syncEngine.reset(); // Clear any error/synced state from the singleton
                await syncEngine.triggerSync({
                  client,
                  localAccountId: newAccount.id,
                  executeCommand: createRemoteCommandReplayer(
                    newAccount.id,
                    budgetService,
                  ),
                  userPublicKey,
                  userPrivateKey,
                });
                await loadAccountData(newAccount.id);
              } catch (syncErr) {
                console.error(
                  "Initial sync after invite accept failed:",
                  syncErr,
                );
              }

              // The pull applies the owner's account name, so read the row
              // back rather than surfacing the name it was created with.
              const provisionedAccount =
                (await budgetService.getAccountById(newAccount.id)) ??
                newAccount;

              // IMPORTANT: set the new account as current ONLY after the sync completes.
              // If set before, React effects fire during the sync (via async gaps),
              // causing a concurrent effect-triggered sync that interferes with this one.
              setAccounts((prev) => [...prev, provisionedAccount]);
              setCurrentAccount(provisionedAccount);
              setStoredCurrentAccountId(provisionedAccount.id);
              setIsOfflineMode(false);

              return { success: true };
            }
          } catch (err: any) {
            // Auth errors (401/403) should not be retried — abort immediately.
            // Network errors and 404s (account not yet visible) are expected during polling.
            const status = err?.status ?? err?.body?.status;
            if (status === 401 || status === 403) {
              console.error(
                "Auth error during provision polling — aborting:",
                err,
              );
              return { success: false };
            }
            // Other errors (network, 404, 500) — keep polling
          }
          await new Promise((resolve) => setTimeout(resolve, 2000));
        }

        return { success: false };
      })();

      provisioningSharedAccountsRef.current.set(serverAccountId, provisioning);
      try {
        return await provisioning;
      } finally {
        provisioningSharedAccountsRef.current.delete(serverAccountId);
      }
    },
    [loadAccountData, loadAccounts, removePendingKeyDeliveryAccount],
  );

  /**
   * Periodically check whether accounts accepted on this client are ready to be
   * provisioned locally. This handles the case where a recipient accepted an
   * invite, dismissed the dialog before the owner delivered the key, and later
   * the key arrives.
   */
  const syncNewSharedAccounts = useCallback(async () => {
    if (!isLoggedIn || !isNetworkOnline) return;

    const token = localStorage.getItem("session_token");
    if (!token) return;

    const userId = localStorage.getItem("userId");
    const userPrivateKey = userId
      ? await loadPrivateKey(userId).catch(() => null)
      : null;
    const userPublicKey = extractPublicKeyFromToken(token);
    if (!userPublicKey || !userPrivateKey) return;

    const client = createAppOnlineAccountsClient({
      sessionToken: token,
      baseUrl: API_BASE_URL || window.location.origin,
    });

    // Get server accounts and provision only the ones this client accepted and
    // is still waiting to link locally.
    try {
      const { accounts: serverAccounts } = await client.listAccounts();

      for (const serverAccount of serverAccounts) {
        // Only member accounts can be newly-provisioned shared accounts.
        // Owner accounts are created locally by provisionAccountKeyForFirstSync.
        if (serverAccount.role !== "member") continue;
        if (!pendingKeyDeliveryAccountIds.has(serverAccount.id)) continue;

        const existingMetadata = await getAccountSyncMetadataByServerId(
          serverAccount.id,
        );
        if (existingMetadata) continue;

        // This shared account is on the server but not provisioned locally.
        // Provision it now. The server doesn't return the account name in the
        // listAccounts response, so we use a generic name. The actual name will
        // be updated from the owner's change records during the first sync.
        try {
          await provisionSharedAccount(serverAccount.id, "Shared Account");
        } catch (err) {
          // provisionSharedAccount already logs errors.
          // If it fails, we'll retry on the next cycle.
        }
      }
    } catch (err) {
      console.warn("Failed to check for new shared accounts:", err);
    }
  }, [
    isLoggedIn,
    isNetworkOnline,
    pendingKeyDeliveryAccountIds,
    provisionSharedAccount,
  ]);

  // Periodically check for shared accounts that exist on the server
  // but haven't been provisioned locally yet (e.g., invite was accepted,
  // dialog dismissed, key delivered later by the owner).
  useEffect(() => {
    if (!isLoggedIn || !isNetworkOnline) return;

    // Run on mount and when authentication/network state changes.
    // The 60-second interval in the deliverPendingKeys effect also covers
    // periodic checks, but we add a dedicated one here for reliability.
    void syncNewSharedAccounts();

    const interval = setInterval(syncNewSharedAccounts, 60_000);
    return () => clearInterval(interval);
  }, [isLoggedIn, isNetworkOnline, syncNewSharedAccounts]);

  // Determine offline/online mode based on the current account's persisted
  // preference, falling back to sync-metadata auto-detection only when no
  // explicit choice has ever been made for the account.
  //
  // Rules:
  //  - If the user explicitly toggled online/offline for this account
  //    (budget-wise-offline-explicit-{id} = "true"|"false"), always honour it.
  //    Nothing except the user's own action (goOnline/goOffline) may change it.
  //  - If no explicit preference exists AND the account has sync metadata,
  //    default to online (first-time auto-detect).
  //  - If no explicit preference exists AND the account has no sync metadata
  //    (local-only), force offline — there is nothing to sync.
  //  - No token / not logged in → offline.
  useEffect(() => {
    if (!currentAccount) return;
    const effectAccountId = currentAccount.id;
    // Real staleness guard: React runs this cleanup when the deps change
    // (account switch, login change), so a still-running async pass can
    // detect it has been superseded. Comparing the closed-over
    // currentAccount.id against effectAccountId does NOT work — both come
    // from the same render and are always equal.
    let cancelled = false;

    const syncOnlineState = async () => {
      const token = localStorage.getItem("session_token");
      if (!token || !isLoggedIn) {
        if (!isOfflineModeRef.current) setIsOfflineMode(true);
        return;
      }

      // Check for an explicit per-account preference first.
      const explicitValue = localStorage.getItem(
        `budget-wise-offline-explicit-${effectAccountId}`,
      );
      if (explicitValue !== null) {
        // User has expressed a preference — honour it unconditionally.
        const shouldBeOffline = explicitValue === "true";
        if (isOfflineModeRef.current !== shouldBeOffline)
          setIsOfflineMode(shouldBeOffline);
        // Still load the key even if offline, so it's available when the user goes back online.
        const metadata = await getAccountSyncMetadata(effectAccountId);
        if (cancelled) return;
        if (metadata)
          await budgetService.loadKeyForAccount(metadata.serverAccountId);
        if (cancelled) return;
        // Sync here, after this account's mode is resolved — a separate
        // account-switch effect captures the PREVIOUS account's mode and
        // would sync an explicitly-offline account when arriving from an
        // online one (or skip the first sync when arriving from an offline one).
        if (!shouldBeOffline) void triggerSync();
        return;
      }

      // No explicit preference — auto-detect from sync metadata.
      const metadata = await getAccountSyncMetadata(effectAccountId);
      if (cancelled) return;

      if (metadata) {
        // Account has sync metadata and no explicit preference: default to online.
        if (isOfflineModeRef.current) setIsOfflineMode(false);
        await budgetService.loadKeyForAccount(metadata.serverAccountId);
        if (cancelled) return;
        void triggerSync();
      } else {
        // No sync metadata — this account was never provisioned online.
        if (!isOfflineModeRef.current) setIsOfflineMode(true);
      }
    };

    void syncOnlineState();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentAccount?.id, isLoggedIn]);

  /**
   * Publish an account's local-only state (its own row and the categories the
   * install wrote directly into IndexedDB) to the ChangeLog as it goes online.
   *
   * Rekeying the install defaults changes their local ids, so the in-memory
   * category list has to be reloaded or the pickers keep rendering ids that no
   * longer exist. Never throws: failing to publish must not block going
   * online — the next goOnline() retries, and the post-sync guard in
   * triggerSync() still fills in missing defaults.
   */
  const publishLocalOnlyAccountState = useCallback(
    async (accountId: string) => {
      try {
        const logged = await budgetService.ensureAccountStateLogged(accountId);
        if (logged.accountLogged || logged.categoriesLogged > 0) {
          console.warn(
            "[online] Published local-only state for account",
            accountId,
            logged,
          );
          await loadAccountData(accountId);
        }
      } catch (err) {
        console.warn(
          "Failed to publish local-only account state, will retry on next go-online:",
          err,
        );
      }
    },
    [loadAccountData],
  );

  // Toggle an account online. If the account has no sync metadata yet,
  // this provisions it on the server (matching legacy app behavior:
  // user explicitly chooses to go online).
  const goOnline = useCallback(async () => {
    if (!currentAccount || !isLoggedIn) return;

    const token = localStorage.getItem("session_token");
    if (!token) return;

    const metadata = await getAccountSyncMetadata(currentAccount.id);
    if (metadata) {
      // Record the explicit online preference for this account.
      localStorage.removeItem("budget-wise-offline-mode");
      localStorage.setItem(
        `budget-wise-offline-explicit-${currentAccount.id}`,
        "false",
      );
      setIsOfflineMode(false);
      await budgetService.loadKeyForAccount(metadata.serverAccountId);
      // An account provisioned before this fix published neither its own
      // CREATE_ACCOUNT nor the categories the install wrote straight into
      // IndexedDB, and nothing else ever will. Publish them now — logCommand
      // encrypts and enqueues them because the key is loaded above.
      // Members never publish a category set: it would land in an account
      // somebody else owns and hand the owner a second one (#501).
      if (metadata.role !== "member") {
        await publishLocalOnlyAccountState(currentAccount.id);
      }
      return;
    }

    try {
      const userPublicKey = extractPublicKeyFromToken(token);
      if (!userPublicKey) return;

      const client = createAppOnlineAccountsClient({
        sessionToken: token,
        baseUrl: API_BASE_URL || window.location.origin,
      });

      const result = await provisionAccountKeyForFirstSync({
        localAccountId: currentAccount.id,
        userPublicKey,
        client,
      });

      await budgetService.loadKeyForAccount(result.serverAccountId);
      // Log the commands this account never produced — the install-time
      // account row and categories — so there is something for the enqueue
      // below to push. The user provisioned this account, so they own it.
      await publishLocalOnlyAccountState(currentAccount.id);
      // Retroactively encrypt and enqueue ChangeLog records that were logged
      // before the account key was loaded (e.g. CREATE_ACCOUNT,
      // BULK_CREATE_CATEGORIES) so the next sync pushes them to the server.
      // If this fails we still go online — the records will be re-processed
      // on the next manual sync or account recovery.
      try {
        await budgetService.enqueueUnsyncedRecords(currentAccount.id);
      } catch (err) {
        console.warn(
          "Failed to enqueue unsynced records, will retry on next sync:",
          err,
        );
      }
      // Record the explicit online preference for this account.
      localStorage.removeItem("budget-wise-offline-mode");
      localStorage.setItem(
        `budget-wise-offline-explicit-${currentAccount.id}`,
        "false",
      );
      setIsOfflineMode(false);
    } catch (error) {
      console.error("Failed to go online:", error);
    }
  }, [currentAccount, isLoggedIn, setIsOfflineMode, publishLocalOnlyAccountState]);

  /**
   * Explicit user action: go offline and persist the choice so that
   * syncOnlineState does not override it on reload or account switch.
   * The flag is scoped to the current account so other accounts are unaffected.
   * This is the only path that writes the per-account explicit flag.
   * Use this instead of calling setIsOfflineMode(true) directly from the UI.
   */
  const goOffline = useCallback(() => {
    if (currentAccount) {
      localStorage.setItem(
        `budget-wise-offline-explicit-${currentAccount.id}`,
        "true",
      );
    }
    setIsOfflineMode(true);
  }, [currentAccount]);

  // ── Account Deletion ─────────────────────────────────────────────────────────
  // Deletes the user's online account and all associated server-side data.
  const deleteOnlineAccount = useCallback(async () => {
    // Check if we're online
    if (typeof navigator !== "undefined" && !navigator.onLine) {
      toast({
        title: t("error"),
        description: t("delete_online_account_offline"),
        variant: "destructive",
      });
      throw new Error("offline");
    }

    if (!isLoggedIn) {
      toast({
        title: t("error"),
        description: t("delete_online_account_not_logged_in"),
        variant: "destructive",
      });
      throw new Error("not_logged_in");
    }

    const token = localStorage.getItem("session_token");
    if (!token) {
      toast({
        title: t("error"),
        description: t("delete_online_account_not_logged_in"),
        variant: "destructive",
      });
      throw new Error("no_session_token");
    }

    // Extract email_hash from the JWT payload so we can call the recovery server
    const payload = parseJwtPayload(token);
    const emailHash = typeof payload?.sub === "string" ? payload.sub : null;
    const recoveryBaseUrl = import.meta.env.VITE_RECOVERY_SERVER_URL || "";

    // Reject expired tokens early so a 401 from the server can be reliably
    // interpreted as "already deleted" rather than "session timed out".
    if (
      payload &&
      typeof payload.exp === "number" &&
      Date.now() / 1000 >= payload.exp
    ) {
      toast({
        title: t("error"),
        description: t("delete_online_account_session_expired"),
        variant: "destructive",
      });
      throw new Error("session_expired");
    }

    const client = createAppOnlineAccountsClient({
      sessionToken: token,
      baseUrl: API_BASE_URL || window.location.origin,
      ...(recoveryBaseUrl ? { recoveryBaseUrl } : {}),
    });

    // Step 1: Delete the user account from the main server
    try {
      await client.deleteAccount();
    } catch (err) {
      // Wedge scenario: the server committed the deletion (user row is gone) but
      // the HTTP response was lost (timeout, network drop). On retry, the server
      // returns 401 because authenticateSession can't find the user in the DB.
      // Since the user's goal (deletion) is already achieved, treat a 401 during
      // the delete flow as "already deleted" and proceed with local cleanup.
      if (err instanceof OnlineAccountsError && err.status === 401) {
        // Server-side deletion already happened — proceed with local cleanup.
        // The user will see a success toast at the end of this function.
      } else {
        // Real error (500, network failure, etc.) — propagate to the caller
        // (Settings.tsx), which will show the error toast.
        throw err;
      }
    }

    // Step 2: Delete recovery data (email_hash, encrypted private key).
    // The main server deletion already completed, so a failure here is
    // non-fatal — but we must surface it to the user because the email_hash
    // is the one piece of directly identifying information that falls under
    // GDPR Art. 17 (right to erasure). The i18n key instructs the user to
    // contact support so recovery data can be cleaned up manually.
    if (!emailHash) {
      toast({
        title: t("warning"),
        description: t("delete_online_account_recovery_failed"),
        variant: "destructive",
      });
    } else if (!recoveryBaseUrl) {
      console.warn(
        "[deleteOnlineAccount] VITE_RECOVERY_SERVER_URL is not set — recovery data will NOT be deleted from the recovery server. " +
          "Set this env var to the recovery-server base URL to enable recovery data cleanup on account deletion.",
      );
      toast({
        title: t("warning"),
        description: t("delete_online_account_recovery_failed"),
        variant: "destructive",
      });
    } else {
      try {
        await client.deleteRecoveryData(emailHash);
      } catch (err) {
        console.warn("Failed to delete recovery data:", err);
        toast({
          title: t("warning"),
          description: t("delete_online_account_recovery_failed"),
          variant: "destructive",
        });
      }
    }

    // Step 3: Delete only online-synced accounts from local storage.
    // Local-only accounts (no sync metadata) are preserved so the app
    // remains usable after account deletion.
    // 3a. Capture server account keys BEFORE deletion (need serverAccountId)
    const summaries = await budgetService.getOnlineAccountSummaries();

    // 3b. Delete all online-synced accounts atomically in one Dexie transaction.
    //     This handles all account child data + sync metadata cleanup.
    const deletedAccountIds = await budgetService.deleteAllOnlineAccounts();

    // 3c. Clean up the symmetric encryption keys for the deleted server accounts.
    for (const s of summaries) {
      try {
        await deleteAccountKey(s.serverAccountId);
      } catch (err) {
        console.warn(
          `Failed to delete account key for ${s.serverAccountId}:`,
          err,
        );
      }
    }

    // Update React state — remove deleted accounts, pick a new current account if needed
    setAccounts((prev) => {
      const remaining = prev.filter((a) => !deletedAccountIds.includes(a.id));
      if (currentAccount?.id && deletedAccountIds.includes(currentAccount.id)) {
        if (remaining.length > 0) {
          setCurrentAccount(remaining[0]);
          setStoredCurrentAccountId(remaining[0].id);
        } else {
          setCurrentAccount(null);
        }
      }
      return remaining;
    });

    // If all accounts were deleted, clear the data state too
    if (deletedAccountIds.length === accounts.length) {
      setTransactions([]);
      setCategories([]);
      setLimits([]);
      setTemplates([]);
      setRecurringItems([]);
      setSavingsGoals([]);
    }

    // Clear session-related localStorage items (keep local app state intact)
    localStorage.removeItem("session_token");
    localStorage.removeItem("userId");
    localStorage.removeItem("onboardingComplete");
    localStorage.removeItem("budget-wise-offline-mode");
    localStorage.removeItem("pending_go_online");
    localStorage.removeItem("pending_go_online_nonce");

    toast({
      title: t("success"),
      description: t("delete_online_account_success"),
      variant: "success",
    });

    // Navigate back to onboarding and reset auth state
    resetOnboarding();
    // accounts and currentAccount are used in the for loop and state update
    // respectively, so they must be in deps to avoid stale closures.
  }, [isLoggedIn, t, resetOnboarding, accounts, currentAccount]);

  // Auto-transition to online mode after registration.
  // When the user clicks "Yes, register" from the online features prompt
  // (or toggles online while opted-out), we set a `pending_go_online` flag
  // before navigating to /register. After registration completes, the app
  // calls requestGoOnline() which increments goOnlineNonce, re-triggering
  // this effect even though currentAccount and isLoggedIn haven't changed.
  const requestGoOnline = useCallback(() => {
    localStorage.setItem("pending_go_online", "true");
    setGoOnlineNonce((n) => n + 1);
  }, []);

  // Explicit restore trigger for sign-in flows where isAuthenticated was
  // already true (e.g. user signs in from the sidebar while a local account
  // is active). In that case the normal false→true transition on isLoggedIn
  // never fires, so restoreOnlineAccounts() must be called directly.
  // NOTE: This does NOT clear the sessionStorage flag to avoid race conditions
  // with the automatic restore path (which watches isLoggedIn). If the automatic
  // restore already ran, this becomes a no-op due to the flag guard.
  const requestRestoreOnlineAccounts = useCallback(() => {
    restoreOnlineAccounts().catch(console.warn);
  }, [restoreOnlineAccounts]);

  useEffect(() => {
    if (!currentAccount || !isLoggedIn) return;

    const pendingGoOnline = localStorage.getItem("pending_go_online");
    if (!pendingGoOnline) return;

    const token = localStorage.getItem("session_token");
    if (!token) return;

    // Clear the flag first to prevent re-triggering
    localStorage.removeItem("pending_go_online");
    // Also clear the stored offline preference so goOnline() can transition
    // the user to online mode without syncOnlineState overriding it.
    localStorage.removeItem("budget-wise-offline-mode");

    void goOnline();
    // goOnlineNonce is intentionally included: it re-triggers this effect when
    // requestGoOnline() is called after the other deps have already stabilised
    // (e.g. returning from registration/sign-in with isLoggedIn already true).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentAccount, isLoggedIn, goOnline, goOnlineNonce]);

  // Trigger sync when going back online
  useEffect(() => {
    if (!isOfflineMode) {
      if (syncEngine.getState() === "OFFLINE") {
        syncEngine.reset();
      }
      void triggerSync();
    } else {
      syncEngine.setState("OFFLINE");
    }
  }, [isOfflineMode, triggerSync]);

  // React to device network connectivity — set engine OFFLINE when
  // network drops, and reset+retry when it comes back (unless user
  // has explicitly chosen offline mode).
  useEffect(() => {
    if (!isNetworkOnline) {
      syncEngine.setState("OFFLINE");
    } else if (!isOfflineMode) {
      if (syncEngine.getState() === "OFFLINE") {
        syncEngine.reset();
      }
      void triggerSync();
    }
  }, [isNetworkOnline, isOfflineMode, triggerSync]);

  // Trigger sync on app startup when account is ready.
  // Note: triggerSync reads isOfflineModeRef (not captured state), so it is
  // safe to call here without risking stale offline-mode state.
  useEffect(() => {
    if (!isOfflineMode && isLoggedIn && currentAccount) {
      void triggerSync();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentAccount?.id]);

  // Load the account key for accounts that already have sync metadata.
  // Accounts are local-only by default — the user toggles them online
  // in account settings, which triggers provisioning. Matching legacy behavior.
  // Only loads the key when the user is already online; does NOT force online.
  useEffect(() => {
    if (!isLoggedIn || !currentAccount || isOfflineMode) return;

    const loadKeyIfNeeded = async () => {
      const token = localStorage.getItem("session_token");
      if (!token) return;

      const metadata = await getAccountSyncMetadata(currentAccount.id);
      if (metadata) {
        await budgetService.loadKeyForAccount(metadata.serverAccountId);
      }
    };

    void loadKeyIfNeeded();
  }, [isLoggedIn, currentAccount, isOfflineMode, setIsOfflineMode]);

  // Sync when the app returns to the foreground and periodically while active
  useEffect(() => {
    if (isOfflineMode || !isLoggedIn || !currentAccount) return;

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        void triggerSync();
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () =>
      document.removeEventListener("visibilitychange", handleVisibilityChange);
  }, [isOfflineMode, isLoggedIn, currentAccount, triggerSync]);

  useEffect(() => {
    if (isOfflineMode || !isLoggedIn || !currentAccount) return;

    const interval = setInterval(() => {
      void triggerSync();
    }, 60_000);

    return () => clearInterval(interval);
  }, [isOfflineMode, isLoggedIn, currentAccount, triggerSync]);

  const addTransaction = useCallback(
    async (transactionData: Omit<Transaction, "id" | "accountId">, options?: { silent?: boolean }) => {
      if (!currentAccount) return;

      // Use BudgetService to create transaction (enforces API boundary)
      // BudgetService handles pending transaction logic internally
      try {
        const transaction = await budgetService.createTransaction(
          transactionData,
          currentAccount.id,
        );

        setTransactions((prev) => [...prev, transaction]);

        // Trigger sync after local change
        triggerSync();

        if (!options?.silent) {
          toast({
            title: t("success"),
            description: t("transaction_added_successfully"),
            variant: "success",
          });
        }

        // Check if this expense pushed spending past a budget limit
        if (transaction.type === "expense") {
          const matchingLimit = limits.find(
            (l) => l.categoryId === transaction.category,
          );
          if (matchingLimit) {
            // Calculate current month date range
            const now = new Date();
            const firstDay = toLocalDateString(
              new Date(now.getFullYear(), now.getMonth(), 1),
            );
            const lastDay = toLocalDateString(
              new Date(now.getFullYear(), now.getMonth() + 1, 0),
            );

            // Sum existing spending for this category in the current month (before this transaction)
            const previousSpending = transactions
              .filter(
                (t) =>
                  t.type === "expense" &&
                  t.category === transaction.category &&
                  t.date.substring(0, 10) >= firstDay &&
                  t.date.substring(0, 10) <= lastDay,
              )
              .reduce((sum, t) => sum + t.amount, 0);

            const newSpending = previousSpending + transaction.amount;

            // Only notify on the crossing moment: was under limit, now over
            if (
              previousSpending <= matchingLimit.amount &&
              newSpending > matchingLimit.amount
            ) {
              const category = categories.find(
                (c) => c.id === transaction.category,
              );
              const categoryName = category
                ? translateCategoryLabel(t, category.name)
                : transaction.category;

              toast({
                title: t("budget_limit_exceeded"),
                description: t("budget_limit_exceeded_description", {
                  category: categoryName,
                  spent: formatCurrency(newSpending),
                  limit: formatCurrency(matchingLimit.amount),
                }),
                variant: "destructive",
              });
            }
          }
        }
      } catch (error) {
        console.error("Failed to create transaction:", error);
        toast({
          title: t("error"),
          description: t("failed_to_add_transaction"),
          variant: "destructive",
        });
        throw error;
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [currentAccount, t, transactions, limits, categories],
  );

  /**
   * Execute pending transactions that have reached their scheduled date.
   */
  const executePendingTransactions = useCallback(async () => {
    try {
      if (
        !currentAccount ||
        !Array.isArray(transactions) ||
        transactions.length === 0
      )
        return;

      const now = new Date();

      const readyTransactions = transactions.filter((transaction) => {
        if (transaction.executedAt) return false;

        // Execute if date has arrived and not yet executed
        const today = new Date(now);
        today.setHours(0, 0, 0, 0);
        const todayString = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;

        return !transaction.executedAt && transaction.date.substring(0, 10) <= todayString;
      });

      if (readyTransactions.length > 0) {
        const executedAt = new Date().toISOString();

        for (const transaction of readyTransactions) {
          await budgetService.updateTransaction({ ...transaction, executedAt });
        }

        // Persist notifications so the user sees them on next app open
        const notifications: PendingNotification[] = readyTransactions.map(
          (tx) => ({
            id: tx.id,
            accountId: currentAccount.id,
            title: tx.title,
            category: tx.category,
            amount: tx.amount,
            type: tx.type,
            executedAt,
          }),
        );
        savePendingNotifications(notifications);
        setMissedNotifications(
          getPendingNotificationsForAccount(currentAccount.id),
        );

        toast({
          title: t("transactions_executed"),
          description: t("transactions_executed_description", {
            count: readyTransactions.length,
          }),
          variant: "success",
        });

        console.log(
          `${readyTransactions.length} pending transaction(s) executed successfully`,
        );

        await loadAccountData(currentAccount.id);
      }
    } catch (error) {
      console.error("Error executing pending transactions:", error);
      toast({
        title: t("error"),
        description: t("failed_to_update_transaction"),
        variant: "destructive",
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentAccount, transactions, t]);

  /**
   * Manually execute pending transactions on demand
   * Useful for testing or if user wants to force execution
   */
  const executePendingTransactionsNow = useCallback(async () => {
    await executePendingTransactions();
  }, [executePendingTransactions]);

  // Initialize DB and load data
  useEffect(() => {
    const initialize = async () => {
      try {
        // Open Dexie database and initialize defaults
        await budgetService.initializeDatabase();

        // Use loadAccounts() which respects persisted current account selection.
        await loadAccounts();

        // Determine which account we should load data for. Prefer persisted id,
        // otherwise fall back to default or first account.
        let chosenId = getStoredCurrentAccountId();
        if (!chosenId) {
          const loadedAccounts = await budgetService.getAccounts();
          chosenId =
            loadedAccounts.find((acc) => acc.id === DEFAULT_ACCOUNT_ID)?.id ||
            loadedAccounts[0]?.id ||
            null;
        }

        if (chosenId) {
          await loadAccountData(chosenId);
          // Ensure currentAccount state aligns with chosenId
          const acc = await budgetService.getAccountById(chosenId);
          if (acc) setCurrentAccount(acc);
        }
      } catch (error) {
        console.error("Failed to initialize database:", error);
        toast({
          title: t("error"),
          description: t("failed_to_initialize_app"),
          variant: "destructive",
        });
      } finally {
        setIsLoading(false);
      }
    };

    void initialize();
  }, [loadAccounts, loadAccountData, t]);

  // Load account data whenever the current account changes
  useEffect(() => {
    if (currentAccount) {
      if (suppressNextAccountDataLoadRef.current) {
        suppressNextAccountDataLoadRef.current = false;
        return;
      }

      void loadAccountData(currentAccount.id);
    }
  }, [currentAccount, loadAccountData]);

  // Migrate existing pending transactions (one-time migration)
  useEffect(() => {
    if (
      currentAccount &&
      Array.isArray(transactions) &&
      transactions.length > 0
    ) {
      if (migrationRanRef.current) return;
      migrationRanRef.current = true;

      // Cancellation guard: if this component unmounts (e.g. account switch,
      // logout, or test cleanup) while the migration below is still awaiting
      // updateTransaction/loadAccountData, the stale continuation must not act
      // on a closed-over `transactions`/`currentAccount` that no longer matches
      // current state — same convention as the isLoggedIn effect above.
      let cancelled = false;

      const migratePendingTransactions = async () => {
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        // Find pending transactions without createdAt field that have past dates
        const todayString = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
        const legacyPendingTransactions = transactions.filter(
          (tx) => tx && !tx.executedAt && !tx.createdAt && (tx.date?.substring(0, 10) ?? '') <= todayString,
        );

        if (legacyPendingTransactions.length > 0) {
          console.log(
            `Migrating ${legacyPendingTransactions.length} legacy pending transactions`,
          );

          // Set createdAt to now for all existing pending transactions
          for (const tx of legacyPendingTransactions) {
            if (cancelled) return;
            const updated = { ...tx, createdAt: new Date().toISOString() };
            await budgetService.updateTransaction(updated);
          }

          if (cancelled) return;
          // Reload data to get updated transactions
          await loadAccountData(currentAccount.id);
        }
      };

      void migratePendingTransactions();

      return () => {
        cancelled = true;
      };
    }
  }, [currentAccount, transactions, loadAccountData]);

  // Execute pending transactions when they're ready
  useEffect(() => {
    if (
      currentAccount &&
      Array.isArray(transactions) &&
      transactions.length > 0
    ) {
      void executePendingTransactions();
    }
  }, [currentAccount, transactions, executePendingTransactions]);

  // Load persisted notifications for transactions executed while the user was away.
  // Always update state (even to empty) so switching accounts clears stale notifications.
  useEffect(() => {
    if (isLoading || !currentAccount) return;

    const missed = getPendingNotificationsForAccount(currentAccount.id);
    setMissedNotifications(missed);
  }, [isLoading, currentAccount]);

  const dismissMissedNotifications = useCallback(() => {
    if (!currentAccount) return;
    clearPendingNotificationsForAccount(currentAccount.id);
    setMissedNotifications([]);
  }, [currentAccount]);

  // Account functions
  const switchAccount = useCallback(
    (accountId: string) => {
      const account = accounts.find((a) => a.id === accountId);
      if (account) {
        setCurrentAccount(account);
        setStoredCurrentAccountId(accountId);
        // Clear any stale sync error from a different account's failed sync.
        syncEngine.reset();
      }
    },
    [accounts],
  );

  const addAccount = useCallback(
    async (name: string): Promise<Account | null> => {
      if (!name.trim()) {
        toast({
          title: t("error"),
          description: t("account_name_required"),
          variant: "destructive",
        });
        return null;
      }

      const initials = name
        .trim()
        .split(/\s+/)
        .map((word) => word[0])
        .join("")
        .toUpperCase()
        .substring(0, 2);

      try {
        const newAccount = await budgetService.createAccount({
          name,
          initials,
        });

        setAccounts((prev) => [...prev, newAccount]);
        setCurrentAccount(newAccount);
        setStoredCurrentAccountId(newAccount.id);
        await loadAccountData(newAccount.id);

        // Do NOT auto-provision new accounts as synced.
        // Only the initially-registered account gets provisioned;
        // accounts created in Settings are local-only by default.

        toast({
          title: t("account_created"),
          description: t("account_created_description", { name }),
          variant: "success",
        });
        return newAccount;
      } catch (error) {
        console.error("Failed to create account:", error);
        
        // Check if it's a duplicate name error
        const errorMessage = error instanceof Error ? error.message : String(error);
        if (errorMessage.includes("already exists")) {
          toast({
            title: t("error"),
            description: t("account_name_already_exists", { name: name.trim() }),
            variant: "destructive",
          });
        } else {
          toast({
            title: t("error"),
            description: t("failed_to_create_account"),
            variant: "destructive",
          });
        }
        throw error;
      }
    },
    [t, loadAccountData],
  );

  const deleteAccount = useCallback(
    async (accountId: string) => {
      if (accounts.length <= 1) {
        toast({
          title: t("error"),
          description: t("cannot_delete_last_account"),
          variant: "destructive",
        });
        return;
      }

      try {
        const metadata = await getAccountSyncMetadata(accountId);
        if (metadata) {
          await deleteAccountSyncMetadata(accountId);
        }

        await budgetService.deleteAccount(accountId);
        setAccounts((prev) => {
          const remaining = prev.filter((a) => a.id !== accountId);
          if (currentAccount?.id === accountId && remaining.length > 0) {
            setCurrentAccount(remaining[0]);
            // Persist selection change
            setStoredCurrentAccountId(remaining[0].id);
          }
          return remaining;
        });

        toast({
          title: t("success"),
          description: t("account_deleted"),
          variant: "success",
        });
      } catch (error) {
        console.error("Failed to delete account:", error);
        toast({
          title: t("error"),
          description: t("failed_to_delete_account"),
          variant: "destructive",
        });
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [currentAccount, t],
  );

  const updateAccount = useCallback(
    async (account: Account) => {
      try {
        await budgetService.updateAccount(account);
        setAccounts((prev) =>
          prev.map((a) => (a.id === account.id ? account : a)),
        );
        if (currentAccount?.id === account.id) {
          setCurrentAccount(account);
        }
        toast({
          title: t("profile_updated"),
          description: t("profile_updated_description"),
          variant: "success",
        });
      } catch (error) {
        console.error("Failed to update account:", error);
        
        // Check if it's a duplicate name error
        const errorMessage = error instanceof Error ? error.message : String(error);
        if (errorMessage.includes("already exists")) {
          toast({
            title: t("error"),
            description: t("account_name_already_exists", { name: account.name.trim() }),
            variant: "destructive",
          });
        } else {
          toast({
            title: t("error"),
            description: t("profile_update_failed"),
            variant: "destructive",
          });
        }
      }
    },
    [currentAccount, t],
  );

  /**
   * Compute the balance (income - expense) for every account by reading each
   * account's transactions from the local DB. Used by the account switcher to
   * show balances for all accounts regardless of the currently selected one.
   */
  const getAccountBalances = useCallback(async (): Promise<Record<string, number>> => {
    const balances: Record<string, number> = {};
    const accountList = accounts.length > 0 ? accounts : await budgetService.getAccounts();
    await Promise.all(
      accountList.map(async (account) => {
        const accountTransactions = await budgetService.getTransactionsByAccountId(account.id);
        const balance = (accountTransactions ?? []).reduce((sum, transaction) => {
          const delta =
            transaction.type === "income" ? transaction.amount : -transaction.amount;
          return sum + delta;
        }, 0);
        balances[account.id] = balance;
      }),
    );
    return balances;
  }, [accounts]);

  // Transaction functions
  const updateTransaction = useCallback(
    async (transaction: Transaction) => {
      try {
        // Use BudgetService to update transaction (enforces API boundary)
        await budgetService.updateTransaction(transaction);
        setTransactions((prev) =>
          prev.map((t) => (t.id === transaction.id ? transaction : t)),
        );
        toast({
          title: t("success"),
          description: t("transaction_updated_successfully"),
          variant: "success",
        });
      } catch (error) {
        console.error("Failed to update transaction:", error);
        toast({
          title: t("error"),
          description: t("failed_to_update_transaction"),
          variant: "destructive",
        });
        throw error;
      }
    },
    [t], // triggerSync intentionally omitted to avoid infinite re-renders
  );

  const deleteTransaction = useCallback(
    async (id: string) => {
      if (!currentAccount) return;
      try {
        await budgetService.deleteTransaction(id, currentAccount.id);
        setTransactions((prev) => prev.filter((t) => t.id !== id));

        // Trigger sync after delete
        void triggerSync();

        toast({
          title: t("success"),
          description: t("transaction_deleted_successfully"),
          variant: "success",
        });
      } catch (error) {
        console.error("Failed to delete transaction:", error);
        toast({
          title: t("error"),
          description: t("failed_to_delete_transaction"),
          variant: "destructive",
        });
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [currentAccount, t], // triggerSync intentionally omitted
  );

  // Category functions
  const addCategory = useCallback(
    async (categoryData: Omit<Category, "id" | "accountId" | "isDefault">) => {
      if (!currentAccount) return;

      // Check for duplicate category (same normalized name and type)
      const isDuplicate = categories.some(
        (c) =>
          normalizeCategoryKey(c.name) ===
            normalizeCategoryKey(categoryData.name) &&
          c.type === categoryData.type,
      );

      if (isDuplicate) {
        toast({
          title: t("error"),
          description: t("category_already_exists"),
          variant: "destructive",
        });
        return;
      }

      try {
        const category = await budgetService.createCategory(
          categoryData,
          currentAccount.id,
        );
        setCategories((prev) => [...prev, category].sort(categorySort));
        
        // Trigger sync after local change (Layer 2 fix for silent data loss bug)
        void triggerSync();
        
        toast({
          title: t("success"),
          description: t("category_added_successfully"),
          variant: "success",
        });
      } catch (error) {
        console.error("Failed to add category:", error);
        toast({
          title: t("error"),
          description: t("failed_to_add_category"),
          variant: "destructive",
        });
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [currentAccount, categories, t], // triggerSync intentionally omitted to avoid infinite re-renders
  );

  const updateCategory = useCallback(
    async (
      id: string,
      updates: Partial<Pick<Category, "name" | "icon" | "color" | "hidden">>,
    ) => {
      if (!currentAccount) return;

      // Check for duplicate name when renaming (same normalized name + same type)
      if (updates.name) {
        const existing = categories.find((c) => c.id === id);
        const isDuplicate = categories.some(
          (c) =>
            c.id !== id &&
            normalizeCategoryKey(c.name) ===
              normalizeCategoryKey(updates.name!) &&
            c.type === (existing?.type ?? ""),
        );

        if (isDuplicate) {
          toast({
            title: t("error"),
            description: t("category_already_exists"),
            variant: "destructive",
          });
          return;
        }
      }

      try {
        const updated = await budgetService.updateCategory(
          id,
          updates,
          currentAccount.id,
        );
        setCategories((prev) =>
          prev.map((c) => (c.id === id ? updated : c)).sort(categorySort),
        );
        
        // Trigger sync after local change (Layer 2 fix for silent data loss bug)
        void triggerSync();
        
        // Use a contextual toast: when toggling visibility, show a specific message
        const toastDescription =
          "hidden" in updates
            ? t(updates.hidden ? "category_hidden_successfully" : "category_shown_successfully")
            : t("category_updated_successfully");
        toast({
          title: t("success"),
          description: toastDescription,
          variant: "success",
        });
      } catch (error) {
        console.error("Failed to update category:", error);
        toast({
          title: t("error"),
          description: t("failed_to_update_category"),
          variant: "destructive",
        });
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [currentAccount, categories, t], // triggerSync intentionally omitted to avoid infinite re-renders
  );

  const deleteCategory = useCallback(
    async (id: string) => {
      if (!currentAccount) return;

      const category = categories.find((c) => c.id === id);

      // Guard: Check if category exists and has accountId
      if (!category) {
        console.error("Category not found:", id);
        return;
      }

      if (!category.accountId) {
        console.error("Category missing accountId:", id);
        toast({
          title: t("error"),
          description: t("failed_to_delete_category"),
          variant: "destructive",
        });
        return;
      }

      if (category.isDefault) {
        toast({
          title: t("error"),
          description: t("cannot_delete_default_categories"),
          variant: "destructive",
        });
        return;
      }

      try {
        // Before deleting, reassign all transactions referencing this category
        // to the "General" category of the same type.
        //  1. Try by stable preset ID (e.g. 'income-general' / 'expense-general')
        //     — works for the default/main account where seed IDs are presets.
        //  2. Fall back to by name + type — needed for non-default accounts
        //     where createAccount() generates UUIDs for all category IDs.
        //     Renaming isDefault categories is blocked, so name stays stable.
        const generalPresetId = `${category.type}-general`;
        let generalCategory = categories.find((c) => c.id === generalPresetId);
        if (!generalCategory) {
          generalCategory = categories.find(
            (c) => c.name === "category_general" && c.type === category.type,
          );
        }

        if (!generalCategory) {
          toast({
            title: t("error"),
            description: t("cannot_delete_general_category_not_found"),
            variant: "destructive",
          });
          return;
        }

        // Match both by ID (standard transactions) and by name (savings-payment
        // transactions from MakeSavingsPayment.tsx store category?.name there,
        // not the ID — see the ID-vs-name inconsistency noted in the review).
        const matchesCategory = (t: Transaction) =>
          t.category === id || t.category === category.name;

        const affectedTransactions = transactions.filter(matchesCategory);

        for (const transaction of affectedTransactions) {
          await budgetService.updateTransaction({
            ...transaction,
            category: generalCategory.id,
          });
        }

        // Also update local state for transactions
        if (affectedTransactions.length > 0) {
          setTransactions((prev) =>
            prev.map((t) =>
              matchesCategory(t) ? { ...t, category: generalCategory.id } : t,
            ),
          );
        }

        // Reassign savings goals that reference this category to the General category
        // so the goal card keeps its icon/color and MakeSavingsPayment doesn't
        // produce broken transactions with category === "expense" (a string literal).
        const affectedGoals = savingsGoals.filter((g) => g.categoryId === id);

        for (const goal of affectedGoals) {
          await budgetService.updateSavingsGoal({
            ...goal,
            categoryId: generalCategory.id,
          });
        }

        if (affectedGoals.length > 0) {
          setSavingsGoals((prev) =>
            prev.map((g) =>
              g.categoryId === id
                ? { ...g, categoryId: generalCategory.id }
                : g,
            ),
          );
        }

        // Reassign recurring items that reference this category to the General
        // category so reconciliation doesn't keep generating occurrences with
        // the dangling categoryId.
        const affectedRecurringItems = recurringItems.filter(
          (r) => r.categoryId === id,
        );

        for (const item of affectedRecurringItems) {
          await budgetService.updateRecurring({
            ...item,
            categoryId: generalCategory.id,
          });
        }

        if (affectedRecurringItems.length > 0) {
          setRecurringItems((prev) =>
            prev.map((r) =>
              r.categoryId === id
                ? { ...r, categoryId: generalCategory.id }
                : r,
            ),
          );
        }

        // Reassign templates that reference this category to the General category
        // so applyTemplate doesn't keep producing orphaned transactions with a
        // dangling categoryId on every "use template" click.
        const affectedTemplates = templates.filter((t) => t.categoryId === id);

        for (const template of affectedTemplates) {
          await budgetService.updateTemplate({
            ...template,
            categoryId: generalCategory.id,
          });
        }

        if (affectedTemplates.length > 0) {
          setTemplates((prev) =>
            prev.map((t) =>
              t.categoryId === id
                ? { ...t, categoryId: generalCategory.id }
                : t,
            ),
          );
        }

        // Handle limits that reference this category. Since only one limit per
        // category is allowed (enforced by useLimitValidation), we try to
        // reassign to the General category first, but delete instead if a
        // General limit already exists to avoid a duplicate collision.
        const affectedLimits = limits.filter((l) => l.categoryId === id);

        const deletedLimitIds: string[] = [];
        const reassignedLimitData: Array<{ id: string; categoryId: string }> =
          [];

        for (const limit of affectedLimits) {
          const hasGeneralLimit = limits.some(
            (l) => l.id !== limit.id && l.categoryId === generalCategory.id,
          );

          if (hasGeneralLimit) {
            await budgetService.deleteLimit(limit.id, limit.accountId);
            deletedLimitIds.push(limit.id);
          } else {
            await budgetService.updateLimit({
              ...limit,
              categoryId: generalCategory.id,
            });
            reassignedLimitData.push({
              id: limit.id,
              categoryId: generalCategory.id,
            });
          }
        }

        if (deletedLimitIds.length > 0 || reassignedLimitData.length > 0) {
          setLimits((prev) => {
            let updated = prev.filter((l) => !deletedLimitIds.includes(l.id));
            updated = updated.map((l) => {
              const match = reassignedLimitData.find((r) => r.id === l.id);
              return match ? { ...l, categoryId: match.categoryId } : l;
            });
            return updated;
          });
        }

        await budgetService.deleteCategory(id, category.accountId);
        setCategories((prev) => prev.filter((c) => c.id !== id));
        
        // Trigger sync after local change (Layer 2 fix for silent data loss bug)
        void triggerSync();
        
        toast({
          title: t("success"),
          description: t("category_deleted_successfully"),
          variant: "success",
        });
      } catch (error) {
        console.error("Failed to delete category:", error);
        toast({
          title: t("error"),
          description: t("failed_to_delete_category"),
          variant: "destructive",
        });
      }
    },
    [
      currentAccount,
      categories,
      transactions,
      savingsGoals,
      recurringItems,
      templates,
      limits,
      t,
    ],
  );

  // Limit functions
  const addLimit = useCallback(
    async (limitData: Omit<Limit, "id" | "accountId">) => {
      if (!currentAccount) return;

      try {
        const limit = await budgetService.createLimit(
          limitData,
          currentAccount.id,
        );
        setLimits((prev) => [...prev, limit]);
        
        // Trigger sync after local change (Layer 2 fix for silent data loss bug)
        void triggerSync();
        
        toast({
          title: t("success"),
          description: t("limit_added_successfully"),
          variant: "success",
        });
      } catch (error) {
        console.error("Failed to add limit:", error);
        toast({
          title: t("error"),
          description: t("failed_to_add_limit"),
          variant: "destructive",
        });
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [currentAccount, t], // triggerSync intentionally omitted to avoid infinite re-renders
  );

  const updateLimit = useCallback(
    async (limit: Limit) => {
      try {
        await budgetService.updateLimit(limit);
        setLimits((prev) => prev.map((l) => (l.id === limit.id ? limit : l)));
        
        // Trigger sync after local change (Layer 2 fix for silent data loss bug)
        void triggerSync();
        
        toast({
          title: t("success"),
          description: t("limit_updated_successfully"),
          variant: "success",
        });
      } catch (error) {
        console.error("Failed to update limit:", error);
        toast({
          title: t("error"),
          description: t("failed_to_update_limit"),
          variant: "destructive",
        });
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [t], // triggerSync intentionally omitted to avoid infinite re-renders
  );

  const deleteLimit = useCallback(
    async (id: string) => {
      if (!currentAccount) return;
      try {
        await budgetService.deleteLimit(id, currentAccount.id);
        setLimits((prev) => prev.filter((l) => l.id !== id));
        
        // Trigger sync after local change (Layer 2 fix for silent data loss bug)
        void triggerSync();
        
        toast({
          title: t("success"),
          description: t("limit_deleted_successfully"),
          variant: "success",
        });
      } catch (error) {
        console.error("Failed to delete limit:", error);
        toast({
          title: t("error"),
          description: t("failed_to_delete_limit"),
          variant: "destructive",
        });
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [currentAccount, t], // triggerSync intentionally omitted to avoid infinite re-renders
  );

  // Template functions
  const addTemplate = useCallback(
    async (templateData: Omit<Template, "id" | "accountId">) => {
      if (!currentAccount) return;

      const isDuplicate = templates.some(
        (existing) =>
          existing.name.toLowerCase().trim() ===
            templateData.name.toLowerCase().trim() &&
          existing.amount === templateData.amount &&
          existing.categoryId === templateData.categoryId &&
          existing.type === templateData.type,
      );

      if (isDuplicate) {
        toast({
          title: t("error"),
          description: t("template_duplicate"),
          variant: "destructive",
        });
        return;
      }

      try {
        const template = await budgetService.createTemplate(
          templateData,
          currentAccount.id,
        );
        setTemplates((prev) => [...prev, template]);
        
        // Trigger sync after local change (Layer 2 fix for silent data loss bug)
        void triggerSync();
        
        toast({
          title: t("success"),
          description: t("template_added"),
          variant: "success",
        });
      } catch (error) {
        console.error("Failed to add template:", error);
        toast({
          title: t("error"),
          description: t("template_add_failed"),
          variant: "destructive",
        });
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [currentAccount, templates, t], // triggerSync intentionally omitted to avoid infinite re-renders
  );

  const updateTemplate = useCallback(
    async (template: Template) => {
      try {
        await budgetService.updateTemplate(template);
        setTemplates((prev) =>
          prev.map((t) => (t.id === template.id ? template : t)),
        );
        
        // Trigger sync after local change (Layer 2 fix for silent data loss bug)
        void triggerSync();
        
        toast({
          title: t("success"),
          description: t("template_updated"),
          variant: "success",
        });
      } catch (error) {
        console.error("Failed to update template:", error);
        toast({
          title: t("error"),
          description: t("template_update_failed"),
          variant: "destructive",
        });
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [t], // triggerSync intentionally omitted to avoid infinite re-renders
  );

  const deleteTemplate = useCallback(
    async (id: string) => {
      if (!currentAccount) return;
      try {
        await budgetService.deleteTemplate(id, currentAccount.id);
        setTemplates((prev) => prev.filter((t) => t.id !== id));
        
        // Trigger sync after local change (Layer 2 fix for silent data loss bug)
        void triggerSync();
        
        toast({
          title: t("success"),
          description: t("template_deleted"),
          variant: "success",
        });
      } catch (error) {
        console.error("Failed to delete template:", error);
        toast({
          title: t("error"),
          description: t("template_delete_failed"),
          variant: "destructive",
        });
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [currentAccount, t], // triggerSync intentionally omitted to avoid infinite re-renders
  );

  const applyTemplate = useCallback(
    async (templateId: string) => {
      const template = templates.find((t) => t.id === templateId);
      if (!template) {
        toast({
          title: t("error"),
          description: t("template_not_found"),
          variant: "destructive",
        });
        return;
      }

      try {
        await addTransaction({
          type: template.type,
          amount: template.amount,
          category: template.categoryId,
          date: toLocalDateString(),
          title: template.name,
        });
        toast({
          title: t("success"),
          description: t("template_applied"),
          variant: "success",
        });
      } catch (error) {
        console.error("Failed to apply template:", error);
        toast({
          title: t("error"),
          description: t("template_apply_failed"),
          variant: "destructive",
        });
      }
    },
    [templates, addTransaction, t],
  );

  // Recurring Item functions
  const addRecurringItem = useCallback(
    async (
      itemData: Omit<RecurringItem, "id" | "accountId">,
      options?: { silent?: boolean },
    ) => {
      if (!currentAccount) return;

      const isDuplicate = recurringItems.some(
        (existing) =>
          existing.name.toLowerCase().trim() ===
            itemData.name.toLowerCase().trim() &&
          existing.frequency === itemData.frequency &&
          existing.amount === itemData.amount,
      );

      if (isDuplicate) {
        toast({
          title: t("error"),
          description: t("recurring_item_duplicate"),
          variant: "destructive",
        });
        return;
      }

      try {
        const recurringItem = await budgetService.createRecurring(
          itemData,
          currentAccount.id,
        );
        setRecurringItems((prev) => [...prev, recurringItem]);
        await loadAccountData(currentAccount.id);
        // Trigger sync after local change (Layer 2 fix for silent data loss bug)
        void triggerSync();
        if (!options?.silent) {
          toast({
            title: t("success"),
            description: t("recurring_item_added"),
            variant: "success",
          });
        }
        return recurringItem.id;
      } catch (error) {
        console.error("Failed to add recurring item:", error);
        toast({
          title: t("error"),
          description: t("recurring_item_add_failed"),
          variant: "destructive",
        });
      }
    },
    // triggerSync is intentionally omitted to avoid infinite re-renders.
    [currentAccount, recurringItems, t, loadAccountData],
  );

  const updateRecurringItem = useCallback(
    async (item: RecurringItem) => {
      try {
        await budgetService.updateRecurring(item);
        setRecurringItems((prev) =>
          prev.map((r) => (r.id === item.id ? item : r)),
        );
        await loadAccountData(item.accountId);
        // Trigger sync after local change (Layer 2 fix for silent data loss bug)
        void triggerSync();
        toast({
          title: t("success"),
          description: t("recurring_item_updated"),
          variant: "success",
        });
      } catch (error) {
        console.error("Failed to update recurring item:", error);
        toast({
          title: t("error"),
          description: t("recurring_item_update_failed"),
          variant: "destructive",
        });
      }
    },
    // triggerSync is intentionally omitted to avoid infinite re-renders.
    [t, loadAccountData],
  );

  const deleteRecurringItem = useCallback(
    async (id: string) => {
      if (!currentAccount) return;
      try {
        await budgetService.deleteRecurring(id, currentAccount.id);
        setRecurringItems((prev) => prev.filter((r) => r.id !== id));
        await loadAccountData(currentAccount.id);
        // Trigger sync after local change (Layer 2 fix for silent data loss bug)
        void triggerSync();
        toast({
          title: t("success"),
          description: t("recurring_item_deleted"),
          variant: "success",
        });
      } catch (error) {
        console.error("Failed to delete recurring item:", error);
        toast({
          title: t("error"),
          description: t("recurring_item_delete_failed"),
          variant: "destructive",
        });
      }
    },
    // triggerSync is intentionally omitted to avoid infinite re-renders.
    [currentAccount, t, loadAccountData],
  );

  // Savings Goal functions
  const addSavingsGoal = useCallback(
    async (goalData: Omit<SavingsGoal, "id" | "accountId">) => {
      if (!currentAccount) return;

      try {
        const savingsGoal = await budgetService.createSavingsGoal(
          goalData,
          currentAccount.id,
        );
        setSavingsGoals((prev) => [...prev, savingsGoal]);
        
        // Trigger sync after local change (Layer 2 fix for silent data loss bug)
        void triggerSync();
        
        toast({
          title: t("success"),
          description: t("savings_goal_added_successfully"),
          variant: "success",
        });
      } catch (error) {
        console.error("Failed to create savings goal:", error);
        toast({
          title: t("error"),
          description: t("failed_to_create_savings_goal"),
          variant: "destructive",
        });
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [currentAccount, t], // triggerSync intentionally omitted to avoid infinite re-renders
  );

  const updateSavingsGoal = useCallback(
    async (goal: SavingsGoal, showToast: boolean = true) => {
      try {
        await budgetService.updateSavingsGoal(goal);
        setSavingsGoals((prev) =>
          prev.map((g) => (g.id === goal.id ? goal : g)),
        );
        
        // Trigger sync after local change (Layer 2 fix for silent data loss bug)
        void triggerSync();
        
        if (showToast) {
          toast({
            title: t("success"),
            description: t("savings_goal_updated_successfully"),
            variant: "success",
          });
        }
      } catch (error) {
        console.error("Failed to update savings goal:", error);
        toast({
          title: t("error"),
          description: t("failed_to_update_savings_goal"),
          variant: "destructive",
        });
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [t], // triggerSync intentionally omitted to avoid infinite re-renders
  );

  const deleteSavingsGoal = useCallback(
    async (id: string) => {
      if (!currentAccount) return;
      try {
        await budgetService.deleteSavingsGoal(id, currentAccount.id);
        setSavingsGoals((prev) => prev.filter((g) => g.id !== id));
        
        // Trigger sync after local change (Layer 2 fix for silent data loss bug)
        void triggerSync();
        
        toast({
          title: t("success"),
          description: t("savings_goal_deleted_successfully"),
          variant: "success",
        });
      } catch (error) {
        console.error("Failed to delete savings goal:", error);
        toast({
          title: t("error"),
          description: t("failed_to_delete_savings_goal"),
          variant: "destructive",
        });
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [currentAccount, t], // triggerSync intentionally omitted to avoid infinite re-renders
  );

  // App reset function
  const resetApp = useCallback(async () => {
    try {
      await budgetService.resetDatabase();

      // Clear all state
      setCurrentAccount(null);
      setAccounts([]);
      setTransactions([]);
      setCategories([]);
      setLimits([]);
      setTemplates([]);
      setRecurringItems([]);
      setSavingsGoals([]);

      // Reload accounts to get the default account
      await loadAccounts();

      toast({
        title: t("success"),
        description: t("app_reset_successfully"),
        variant: "success",
      });
    } catch (error) {
      console.error("Failed to reset app:", error);
      toast({
        title: t("error"),
        description: t("failed_to_reset_app"),
        variant: "destructive",
      });
    }
  }, [loadAccounts, t]);

  const exportAccountData = useCallback(async () => {
    if (!currentAccount) {
      toast({
        title: t("error"),
        description: t("no_account_selected"),
        variant: "destructive",
      });
      return;
    }

    const data: ExportData = {
      account: currentAccount,
      transactions,
      categories,
      limits,
      templates,
      recurringItems,
      savingsGoals,
      exportDate: new Date().toISOString(),
      version: "1.0.0",
    };

    try {
      const { method } = await exportData(data);
      // Only show success toast when the user explicitly confirmed the save:
      // - "native"   → Share sheet was opened (user interacted with it)
      // - "picker"   → File System Access API: user clicked Save
      // - "download" → browser anchor fallback: file was queued for download
      //                automatically, no user confirmation available, so we
      //                skip the toast to avoid false positives.
      if (method !== "download") {
        toast({
          title: t("success"),
          description: t("data_exported_successfully"),
          variant: "success",
        });
      }
    } catch (error) {
      // Web File System Access API throws AbortError when the user cancels
      // the save picker — suppress toast silently in that case.
      if (error instanceof DOMException && error.name === "AbortError") {
        return;
      }
      console.error("Failed to export data:", error);
      toast({
        title: t("error"),
        description: t("failed_to_export_data"),
        variant: "destructive",
      });
    }
  }, [
    currentAccount,
    transactions,
    categories,
    limits,
    templates,
    recurringItems,
    savingsGoals,
    t,
  ]);

  const importAccountData = useCallback(
    async (file?: File) => {
      if (!currentAccount) {
        toast({
          title: t("error"),
          description: t("no_account_selected"),
          variant: "destructive",
        });
        return;
      }

      try {
        // On native, bypass the <input type="file"> entirely and use the
        // Capacitor file picker so the activity result is handled reliably.
        const data = Capacitor.isNativePlatform()
          ? await pickAndImportData()
          : await importData(file!);

        // Use BudgetService importData — handles deduplication, category ID remapping,
        // ChangeLog logging, and collision resolution for all entity types
        const coreExportData: ExportData = { ...data, account: currentAccount };
        await budgetService.importData(coreExportData, currentAccount.id);

        // Reload account data
        await loadAccountData(currentAccount.id);

        toast({
          title: t("success"),
          description: t("data_imported_successfully"),
          variant: "success",
        });
      } catch (error) {
        // User cancelled the native file picker — suppress toast silently
        if (error instanceof DOMException && error.name === "AbortError") {
          return;
        }
        console.error("Failed to import data:", error);
        toast({
          title: t("error"),
          description: t("failed_to_import_data"),
          variant: "destructive",
        });
      }
    },
    [currentAccount, loadAccountData, t],
  );

  const value = useMemo(
    () => ({
      currentAccount,
      accounts,
      switchAccount,
      addAccount,
      deleteAccount,
      updateAccount,
      getAccountBalances,
      transactions,
      addTransaction,
      updateTransaction,
      deleteTransaction,
      categories,
      addCategory,
      updateCategory,
      deleteCategory,
      limits,
      addLimit,
      updateLimit,
      deleteLimit,
      templates,
      addTemplate,
      updateTemplate,
      deleteTemplate,
      applyTemplate,
      recurringItems,
      addRecurringItem,
      updateRecurringItem,
      deleteRecurringItem,
      savingsGoals,
      addSavingsGoal,
      updateSavingsGoal,
      deleteSavingsGoal,
      resetApp,
      isLoading,
      exportAccountData,
      importAccountData,
      isOfflineMode,
      setIsOfflineMode,
      goOffline,
      goOnline,
      requestGoOnline,
      requestRestoreOnlineAccounts,
      isNetworkOnline,
      deleteOnlineAccount,
      executePendingTransactionsNow,
      missedNotifications,
      dismissMissedNotifications,
      triggerSync,
      provisionSharedAccount,
      refreshFromDb,
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      currentAccount,
      accounts,
      switchAccount,
      addAccount,
      deleteAccount,
      updateAccount,
      getAccountBalances,
      transactions,
      addTransaction,
      updateTransaction,
      deleteTransaction,
      categories,
      addCategory,
      updateCategory,
      deleteCategory,
      limits,
      addLimit,
      updateLimit,
      deleteLimit,
      templates,
      addTemplate,
      updateTemplate,
      deleteTemplate,
      applyTemplate,
      recurringItems,
      addRecurringItem,
      updateRecurringItem,
      deleteRecurringItem,
      savingsGoals,
      addSavingsGoal,
      updateSavingsGoal,
      deleteSavingsGoal,
      resetApp,
      isLoading,
      exportAccountData,
      importAccountData,
      isOfflineMode,
      setIsOfflineMode,
      goOffline,
      goOnline,
      requestGoOnline,
      requestRestoreOnlineAccounts,
      isNetworkOnline,
      deleteOnlineAccount,
      executePendingTransactionsNow,
      missedNotifications,
      dismissMissedNotifications,
    ], // triggerSync intentionally omitted to avoid infinite re-renders
  );

  return (
    <BudgetContext.Provider value={value}>{children}</BudgetContext.Provider>
  );
};

export const useBudget = (): BudgetContextType => {
  const context = useContext(BudgetContext);
  if (context === undefined) {
    throw new Error("useBudget must be used within a BudgetProvider");
  }
  return context;
};
