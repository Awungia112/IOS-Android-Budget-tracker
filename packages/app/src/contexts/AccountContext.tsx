import { createContext, useContext, useState, ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { budgetService, flushPendingChangesOnLogout, loadPrivateKey } from '@budget/core';
import { API_BASE_URL, extractPublicKeyFromToken, createAppOnlineAccountsClient } from '@/lib/api';
import { getHasSession } from '@/lib/accountStorage';

export interface AccountContextType {
  isAuthenticated: boolean;
  setIsAuthenticated: (value: boolean) => void;
  isLoggedIn: boolean;
  setIsLoggedIn: (value: boolean) => void;
  logout: () => Promise<void>;
  resetOnboarding: () => void;
}

export const AccountContext = createContext<AccountContextType | undefined>(undefined);

export const AccountProvider = ({ children }: { children: ReactNode }) => {
  // If a session token exists (user previously logged in), treat as authenticated
  // even if onboardingComplete/isLoggedIn were cleared by a prior logout.
  const hasSession = getHasSession();
  const [isAuthenticated, setIsAuthenticated] = useState(() => {
    if (hasSession) return true;
    return localStorage.getItem('onboardingComplete') === 'true';
  });
  const [isLoggedIn, setIsLoggedIn] = useState(() => {
    return hasSession;
  });
  const navigate = useNavigate();

  const logout = async () => {
    // Backup account names before deletion — the server doesn't store names,
    // so we preserve them in localStorage to restore on next sign-in.
    try {
      const summaries = await budgetService.getOnlineAccountSummaries();
      const backup: Record<string, { name: string; initials: string }> = {};
      for (const s of summaries) {
        backup[s.serverAccountId.toLowerCase()] = { name: s.name, initials: s.initials };
      }
      localStorage.setItem('preservedAccountNames', JSON.stringify(backup));
      localStorage.setItem('preservedAccountNamesTimestamp', String(Date.now()));
      console.log('[logout] Backed up names for', Object.keys(backup).length, 'online account(s)');
    } catch (err) {
      console.warn('Failed to backup account names on logout:', err);
    }

    // Flush pending changes before deleting local data to prevent data loss
    // (Layer 1 fix for silent data loss bug).
    // Bound by a timeout so an offline logout doesn't hang indefinitely.
    try {
      const token = localStorage.getItem('session_token');
      if (token) {
        const client = createAppOnlineAccountsClient({
          sessionToken: token,
          baseUrl: API_BASE_URL || window.location.origin,
        });

        // Extract user keys for sync
        let userPublicKey: Uint8Array | undefined;
        let userPrivateKey: Uint8Array | undefined;

        try {
          const extractedKey = extractPublicKeyFromToken(token);
          if (extractedKey) userPublicKey = extractedKey;

          const userId = localStorage.getItem('userId');
          if (userId) {
            const priv = await loadPrivateKey(userId);
            if (priv) userPrivateKey = priv;
          }
        } catch (err) {
          console.warn('[logout] Failed to load user keys for flush:', err);
        }

        await flushPendingChangesOnLogout({
          client,
          userPublicKey,
          userPrivateKey,
          timeoutMs: 5000,
        });
      }
    } catch (err) {
      console.warn('Failed to flush pending changes on logout:', err);
    }

    // Delete online accounts FIRST, before any state changes or navigation,
    // so the DB is clean before the UI re-renders.
    try {
      await budgetService.deleteAllOnlineAccounts();
    } catch (err) {
      console.warn('Failed to delete online accounts on logout:', err);
    }
    localStorage.removeItem('session_token');
    localStorage.removeItem('userEmail');
    localStorage.removeItem('emailHash');
    localStorage.removeItem('userId');
    localStorage.setItem('budget-wise-offline-mode', 'true');
    sessionStorage.removeItem('restoreOnlineAccountsDone');
    setIsAuthenticated(false);
    setIsLoggedIn(false);
    navigate('/onboarding');
  };

  const resetOnboarding = () => {
    localStorage.removeItem('onboardingComplete');
    setIsAuthenticated(false);
    setIsLoggedIn(false);
    navigate('/onboarding');
  };

  return (
    <AccountContext.Provider value={{ 
      isAuthenticated, 
      setIsAuthenticated, 
      isLoggedIn, 
      setIsLoggedIn, 
      logout, 
      resetOnboarding 
    }}>
      {children}
    </AccountContext.Provider>
  );
};

export const useAccount = () => {
  const context = useContext(AccountContext);
  if (context === undefined) {
    throw new Error('useAccount must be used within an AccountProvider');
  }
  return context;
};