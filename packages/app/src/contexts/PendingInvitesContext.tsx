import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  ReactNode,
} from 'react';
import { OnlineAccountsError, type PendingInviteForRecipient } from '@budget/core';
import { useAccount } from './AccountContext';
import { API_BASE_URL, createAppOnlineAccountsClient } from '@/lib/api';

export interface PendingInvite extends PendingInviteForRecipient {
  // Extended with any UI-specific fields if needed
}

/**
 * Account IDs for invites that have been accepted but are still waiting
 * for the owner to deliver the key. Persisted in sessionStorage so they
 * survive page refreshes.
 */
const PENDING_KEY_DELIVERY_KEY = 'pending_key_delivery_accounts';

function loadPendingKeyDeliveryAccounts(): Set<string> {
  try {
    const raw = sessionStorage.getItem(PENDING_KEY_DELIVERY_KEY);
    if (!raw) return new Set();
    return new Set(JSON.parse(raw) as string[]);
  } catch {
    return new Set();
  }
}

function savePendingKeyDeliveryAccounts(accounts: Set<string>) {
  try {
    sessionStorage.setItem(PENDING_KEY_DELIVERY_KEY, JSON.stringify([...accounts]));
  } catch {
    // Ignore storage errors
  }
}

interface PendingInvitesContextType {
  pendingInvites: PendingInvite[];
  /** Account IDs for accepted invites still waiting for the owner to deliver the key. */
  pendingKeyDeliveryAccountIds: Set<string>;
  isLoading: boolean;
  error: string | null;
  fetchPendingInvites: () => Promise<void>;
  acceptInvite: (inviteId: string, accountId: string) => Promise<{ success: boolean; error?: string }>;
  declineInvite: (inviteId: string) => Promise<{ success: boolean; error?: string }>;
  pendingCount: number;
  acceptingInviteId: string | null;
  decliningInviteId: string | null;
  /** Remove an account ID from the pending key delivery set after provisioning succeeds. */
  removePendingKeyDeliveryAccount: (accountId: string) => void;
}

const PendingInvitesContext = createContext<PendingInvitesContextType | undefined>(undefined);

export const PendingInvitesProvider = ({ children }: { children: ReactNode }) => {
  const { isAuthenticated } = useAccount();
  const [pendingInvites, setPendingInvites] = useState<PendingInvite[]>([]);
  const [pendingKeyDeliveryAccountIds, setPendingKeyDeliveryAccountIds] = useState<Set<string>>(loadPendingKeyDeliveryAccounts);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [acceptingInviteId, setAcceptingInviteId] = useState<string | null>(null);
  const [decliningInviteId, setDecliningInviteId] = useState<string | null>(null);

  const getClient = useCallback(
    () =>
      createAppOnlineAccountsClient({
        sessionToken: localStorage.getItem('session_token') || '',
        baseUrl: API_BASE_URL || window.location.origin,
      }),
    [],
  );

  const fetchPendingInvites = useCallback(async () => {
    if (!isAuthenticated) {
      setPendingInvites([]);
      return;
    }

    // Register the user's own display email on the server so they appear
    // by name in other users' sharing settings. Fire-and-forget on first load.
    const userEmail = localStorage.getItem('userEmail');
    if (userEmail) {
      getClient().updateDisplayEmail(userEmail).catch(() => {
        // Non-critical — ignore failures
      });
    }

    try {
      setIsLoading(true);
      setError(null);
      const result = await getClient().listPendingInvitesForMe();
      setPendingInvites(result.invites as PendingInvite[]);
    } catch (err) {
      if (err instanceof OnlineAccountsError && err.status === 401) {
        // 401 is expected when the session token is expired or has been
        // cleared (e.g., after logout but before React state catches up).
        setPendingInvites([]);
        return;
      }
      console.error('Failed to fetch pending invites:', err);
      setError('Failed to load pending invites');
      setPendingInvites([]);
    } finally {
      setIsLoading(false);
    }
  }, [isAuthenticated, getClient]);

  // Fetch on mount and whenever authentication state changes
  useEffect(() => {
    fetchPendingInvites();
  }, [fetchPendingInvites]);

  // Poll every 30 seconds so invites sent while the recipient is already
  // logged in are picked up without requiring a page reload.
  useEffect(() => {
    if (!isAuthenticated) return;
    const interval = setInterval(fetchPendingInvites, 30_000);
    return () => clearInterval(interval);
  }, [isAuthenticated, fetchPendingInvites]);

  const addPendingKeyDeliveryAccount = useCallback((accountId: string) => {
    setPendingKeyDeliveryAccountIds((prev) => {
      const next = new Set(prev);
      next.add(accountId);
      savePendingKeyDeliveryAccounts(next);
      return next;
    });
  }, []);

  const removePendingKeyDeliveryAccount = useCallback((accountId: string) => {
    setPendingKeyDeliveryAccountIds((prev) => {
      const next = new Set(prev);
      next.delete(accountId);
      savePendingKeyDeliveryAccounts(next);
      return next;
    });
  }, []);

  const acceptInvite = useCallback(async (inviteId: string, accountId: string): Promise<{ success: boolean; error?: string }> => {
    setAcceptingInviteId(inviteId);
    setError(null);
    try {
      await getClient().acceptInvite(inviteId);

      // Track the account ID so we can show "waiting for key delivery" across refreshes.
      addPendingKeyDeliveryAccount(accountId);

      setPendingInvites((prev) => {
        const next = prev.filter((inv) => inv.id !== inviteId);
        if (next.length === 0) {
          try { sessionStorage.removeItem('invites_drawer_auto_opened'); } catch { /* ignore */ }
        }
        return next;
      });
      return { success: true };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to accept invite';
      setError(errorMessage);
      throw err; // re-throw so the dialog's catch can set UI error state
    } finally {
      setAcceptingInviteId(null);
    }
  }, [getClient, addPendingKeyDeliveryAccount]);

  const declineInvite = useCallback(async (inviteId: string): Promise<{ success: boolean; error?: string }> => {
    setDecliningInviteId(inviteId);
    setError(null);
    try {
      await getClient().declineInvite(inviteId);
      setPendingInvites((prev) => {
        const next = prev.filter((inv) => inv.id !== inviteId);
        if (next.length === 0) {
          try { sessionStorage.removeItem('invites_drawer_auto_opened'); } catch { /* ignore */ }
        }
        return next;
      });
      return { success: true };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to decline invite';
      setError(errorMessage);
      throw err; // re-throw so the dialog's catch can set UI error state
    } finally {
      setDecliningInviteId(null);
    }
  }, [getClient]);

  const pendingCount = pendingInvites.length;

  return (
    <PendingInvitesContext.Provider
      value={{
        pendingInvites,
        pendingKeyDeliveryAccountIds,
        isLoading,
        error,
        fetchPendingInvites,
        acceptInvite,
        declineInvite,
        pendingCount,
        acceptingInviteId,
        decliningInviteId,
        removePendingKeyDeliveryAccount,
      }}
    >
      {children}
    </PendingInvitesContext.Provider>
  );
};

export const usePendingInvites = () => {
  const context = useContext(PendingInvitesContext);
  if (context === undefined) {
    throw new Error('usePendingInvites must be used within a PendingInvitesProvider');
  }
  return context;
};