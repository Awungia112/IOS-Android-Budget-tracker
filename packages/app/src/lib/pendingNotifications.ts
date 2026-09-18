/**
 * Persistent notification queue for executed pending transactions.
 *
 * Notifications are stored in localStorage so the user sees them
 * even after closing and reopening the app.
 */

const STORAGE_KEY = "budget-wise-pending-notifications";

export interface PendingNotification {
  id: string;
  accountId: string;
  title: string;
  category: string;
  amount: number;
  type: "income" | "expense";
  executedAt: string;
}

export function savePendingNotifications(notifications: PendingNotification[]): void {
  try {
    const existing = getPendingNotifications();
    // Deduplicate by transaction id
    const existingIds = new Set(existing.map((n) => n.id));
    const toAdd = notifications.filter((n) => !existingIds.has(n.id));
    if (toAdd.length === 0) return;
    localStorage.setItem(STORAGE_KEY, JSON.stringify([...existing, ...toAdd]));
  } catch (e) {
    console.warn("Failed to persist notifications to localStorage:", e);
  }
}

export function getPendingNotifications(): PendingNotification[] {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored ? (JSON.parse(stored) as PendingNotification[]) : [];
  } catch {
    return [];
  }
}

export function getPendingNotificationsForAccount(accountId: string): PendingNotification[] {
  const all = getPendingNotifications();

  // Drop legacy notifications (no accountId) — we cannot determine which account
  // they belong to, so keeping them risks showing them to the wrong account.
  // Any notifications created after this change will always have an accountId.
  const hasLegacy = all.some((n) => !n.accountId);
  if (hasLegacy) {
    const withAccountId = all.filter((n) => !!n.accountId);
    try {
      if (withAccountId.length === 0) {
        localStorage.removeItem(STORAGE_KEY);
      } else {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(withAccountId));
      }
    } catch (e) {
      console.warn("Failed to clean up legacy notifications:", e);
    }
    return withAccountId.filter((n) => n.accountId === accountId);
  }

  return all.filter((n) => n.accountId === accountId);
}

/**
 * Clears notifications for the given account, including legacy notifications
 * (no accountId) since they are treated as belonging to the current account.
 * Notifications for other accounts are preserved.
 */
export function clearPendingNotificationsForAccount(accountId: string): void {
  try {
    const remaining = getPendingNotifications().filter(
      (n) => n.accountId && n.accountId !== accountId,
    );
    if (remaining.length === 0) {
      localStorage.removeItem(STORAGE_KEY);
    } else {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(remaining));
    }
  } catch (e) {
    console.warn("Failed to clear notifications from localStorage:", e);
  }
}

export function clearPendingNotifications(): void {
  localStorage.removeItem(STORAGE_KEY);
}
