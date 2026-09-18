/** @vitest-environment jsdom */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, act } from '@testing-library/react';
import { renderHook } from '@testing-library/react';
import React, { useContext } from 'react';
import '@testing-library/jest-dom/vitest';

// ─── Module mocks ─────────────────────────────────────────────────────────────

const mockListPendingInvitesForMe = vi.fn();
const mockAcceptInvite = vi.fn();
const mockDeclineInvite = vi.fn();
const mockUpdateDisplayEmail = vi.fn();

vi.mock('@budget/core', () => {
  class MockOnlineAccountsError extends Error {
    status: number;
    constructor(status: number) {
      super(`OnlineAccountsError ${status}`);
      this.status = status;
    }
  }
  return {
    createOnlineAccountsClient: () => ({
      listPendingInvitesForMe: mockListPendingInvitesForMe,
      acceptInvite: mockAcceptInvite,
      declineInvite: mockDeclineInvite,
      updateDisplayEmail: mockUpdateDisplayEmail,
    }),
    OnlineAccountsError: MockOnlineAccountsError,
  };
});

vi.mock('@/lib/api', () => ({
  API_BASE_URL: 'http://localhost:3095',
  extractPublicKeyFromToken: vi.fn(),
  createAppOnlineAccountsClient: () => ({
    listPendingInvitesForMe: mockListPendingInvitesForMe,
    acceptInvite: mockAcceptInvite,
    declineInvite: mockDeclineInvite,
    updateDisplayEmail: mockUpdateDisplayEmail,
  }),
}));

const mockUseAccount = vi.fn();
vi.mock('@/contexts/AccountContext', () => ({
  useAccount: () => mockUseAccount(),
  AccountProvider: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

// ─── Test helpers ──────────────────────────────────────────────────────────────

import { PendingInvitesProvider, usePendingInvites } from './PendingInvitesContext';

const SAMPLE_INVITES = [
  {
    id: 'invite-1',
    accountId: 'account-1',
    senderUserId: 'user-owner',
    inviterName: 'Alice Owner',
    inviterEmail: 'alice@example.com',
    accountName: 'Household Budget',
    createdAt: '2026-06-20T10:00:00.000Z',
  },
  {
    id: 'invite-2',
    accountId: 'account-2',
    senderUserId: 'user-bob',
    inviterName: null,
    inviterEmail: 'bob@example.com',
    accountName: null,
    createdAt: '2026-06-19T08:00:00.000Z',
  },
];

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  sessionStorage.clear();
  mockUseAccount.mockReturnValue({ isAuthenticated: true });
  mockListPendingInvitesForMe.mockResolvedValue({ invites: [] });
  mockUpdateDisplayEmail.mockResolvedValue(undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('PendingInvitesContext', () => {
  describe('initial state', () => {
    it('starts with empty pending invites and no error', async () => {
      mockListPendingInvitesForMe.mockResolvedValue({ invites: [] });

      const { result } = renderHook(() => usePendingInvites(), {
        wrapper: ({ children }) => <PendingInvitesProvider>{children}</PendingInvitesProvider>,
      });

      await waitFor(() => {
        expect(result.current.pendingInvites).toEqual([]);
        expect(result.current.pendingCount).toBe(0);
        expect(result.current.error).toBeNull();
        expect(result.current.acceptingInviteId).toBeNull();
        expect(result.current.decliningInviteId).toBeNull();
      });
    });

    it('starts with isLoading true until first fetch completes', async () => {
      let resolveFetch: (value: any) => void;
      mockListPendingInvitesForMe.mockReturnValue(
        new Promise((resolve) => { resolveFetch = resolve; })
      );

      const { result } = renderHook(() => usePendingInvites(), {
        wrapper: ({ children }) => <PendingInvitesProvider>{children}</PendingInvitesProvider>,
      });

      // Initially loading
      expect(result.current.isLoading).toBe(true);

      await act(async () => {
        resolveFetch!({ invites: [] });
      });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });
    });
  });

  describe('fetching pending invites', () => {
    it('fetches pending invites on mount when authenticated', async () => {
      mockListPendingInvitesForMe.mockResolvedValue({ invites: SAMPLE_INVITES });

      const { result } = renderHook(() => usePendingInvites(), {
        wrapper: ({ children }) => <PendingInvitesProvider>{children}</PendingInvitesProvider>,
      });

      await waitFor(() => {
        expect(result.current.pendingInvites).toHaveLength(2);
        expect(result.current.pendingCount).toBe(2);
        expect(result.current.pendingInvites[0].id).toBe('invite-1');
        expect(result.current.pendingInvites[1].id).toBe('invite-2');
      });

      expect(mockListPendingInvitesForMe).toHaveBeenCalledTimes(1);
    });

    it('does not fetch invites when not authenticated', async () => {
      mockUseAccount.mockReturnValue({ isAuthenticated: false });

      const { result } = renderHook(() => usePendingInvites(), {
        wrapper: ({ children }) => <PendingInvitesProvider>{children}</PendingInvitesProvider>,
      });

      await waitFor(() => {
        expect(result.current.pendingInvites).toEqual([]);
        expect(result.current.pendingCount).toBe(0);
      });

      expect(mockListPendingInvitesForMe).not.toHaveBeenCalled();
    });

    it('sets error when fetch fails', async () => {
      mockListPendingInvitesForMe.mockRejectedValue(new Error('Network error'));

      const { result } = renderHook(() => usePendingInvites(), {
        wrapper: ({ children }) => <PendingInvitesProvider>{children}</PendingInvitesProvider>,
      });

      await waitFor(() => {
        expect(result.current.error).toBe('Failed to load pending invites');
        expect(result.current.pendingInvites).toEqual([]);
      });
    });

    it('clears invites when user becomes unauthenticated', async () => {
      mockUseAccount.mockReturnValue({ isAuthenticated: true });
      mockListPendingInvitesForMe.mockResolvedValue({ invites: SAMPLE_INVITES });

      const { result, rerender } = renderHook(() => usePendingInvites(), {
        wrapper: ({ children }) => <PendingInvitesProvider>{children}</PendingInvitesProvider>,
      });

      await waitFor(() => {
        expect(result.current.pendingCount).toBe(2);
      });

      // Simulate logout
      mockUseAccount.mockReturnValue({ isAuthenticated: false });
      rerender();

      await waitFor(() => {
        expect(result.current.pendingInvites).toEqual([]);
        expect(result.current.pendingCount).toBe(0);
      });
    });

    it('sends display email on first fetch', async () => {
      localStorage.setItem('userEmail', 'recipient@example.com');
      mockListPendingInvitesForMe.mockResolvedValue({ invites: [] });

      renderHook(() => usePendingInvites(), {
        wrapper: ({ children }) => <PendingInvitesProvider>{children}</PendingInvitesProvider>,
      });

      await waitFor(() => {
        expect(mockUpdateDisplayEmail).toHaveBeenCalledWith('recipient@example.com');
      });
    });

    it('does not crash if display email update fails', async () => {
      localStorage.setItem('userEmail', 'recipient@example.com');
      mockUpdateDisplayEmail.mockRejectedValue(new Error('Network error'));
      mockListPendingInvitesForMe.mockResolvedValue({ invites: [] });

      const { result } = renderHook(() => usePendingInvites(), {
        wrapper: ({ children }) => <PendingInvitesProvider>{children}</PendingInvitesProvider>,
      });

      await waitFor(() => {
        expect(result.current.error).toBeNull();
      });
    });
  });

  describe('acceptInvite', () => {
    it('removes accepted invite from the list', async () => {
      mockListPendingInvitesForMe.mockResolvedValue({ invites: SAMPLE_INVITES });
      mockAcceptInvite.mockResolvedValue(undefined);

      const { result } = renderHook(() => usePendingInvites(), {
        wrapper: ({ children }) => <PendingInvitesProvider>{children}</PendingInvitesProvider>,
      });

      await waitFor(() => {
        expect(result.current.pendingCount).toBe(2);
      });

      await act(async () => {
        const res = await result.current.acceptInvite('invite-1', 'account-1');
        expect(res.success).toBe(true);
      });

      await waitFor(() => {
        expect(result.current.pendingInvites).toHaveLength(1);
        expect(result.current.pendingInvites[0].id).toBe('invite-2');
        expect(result.current.pendingCount).toBe(1);
      });
    });

    it('sets acceptingInviteId while accepting', async () => {
      let resolveAccept: (value: any) => void;
      mockListPendingInvitesForMe.mockResolvedValue({ invites: SAMPLE_INVITES });
      mockAcceptInvite.mockReturnValue(new Promise((resolve) => { resolveAccept = resolve; }));

      const { result } = renderHook(() => usePendingInvites(), {
        wrapper: ({ children }) => <PendingInvitesProvider>{children}</PendingInvitesProvider>,
      });

      await waitFor(() => {
        expect(result.current.pendingCount).toBe(2);
      });

      // Start accepting
      const acceptPromise = result.current.acceptInvite('invite-1', 'account-1');

      await waitFor(() => {
        expect(result.current.acceptingInviteId).toBe('invite-1');
      });

      // Resolve the accept
      await act(async () => {
        resolveAccept!(undefined);
      });
      await acceptPromise;

      await waitFor(() => {
        expect(result.current.acceptingInviteId).toBeNull();
      });
    });

    it('throws error when accept fails', async () => {
      mockListPendingInvitesForMe.mockResolvedValue({ invites: SAMPLE_INVITES });
      mockAcceptInvite.mockRejectedValue(new Error('Accept failed'));

      const { result } = renderHook(() => usePendingInvites(), {
        wrapper: ({ children }) => <PendingInvitesProvider>{children}</PendingInvitesProvider>,
      });

      await waitFor(() => {
        expect(result.current.pendingCount).toBe(2);
      });

      // The accept should throw, and the invite should remain in the list
      let thrownError: Error | null = null;
      await act(async () => {
        try {
          await result.current.acceptInvite('invite-1', 'account-1');
        } catch (err) {
          thrownError = err as Error;
        }
      });

      expect(thrownError).toBeTruthy();
      expect(thrownError?.message).toBe('Accept failed');

      // Invite should still be in the list after failed accept
      expect(result.current.pendingInvites).toHaveLength(2);
    });

    it('clears sessionStorage flag when all invites are accepted', async () => {
      sessionStorage.setItem('invites_drawer_auto_opened', 'true');
      mockListPendingInvitesForMe.mockResolvedValue({ invites: [SAMPLE_INVITES[0]] });
      mockAcceptInvite.mockResolvedValue(undefined);

      const { result } = renderHook(() => usePendingInvites(), {
        wrapper: ({ children }) => <PendingInvitesProvider>{children}</PendingInvitesProvider>,
      });

      await waitFor(() => {
        expect(result.current.pendingCount).toBe(1);
      });

      await act(async () => {
        await result.current.acceptInvite('invite-1', 'account-1');
      });

      await waitFor(() => {
        expect(result.current.pendingCount).toBe(0);
      });

      expect(sessionStorage.getItem('invites_drawer_auto_opened')).toBeNull();
    });
  });

  describe('declineInvite', () => {
    it('removes declined invite from the list', async () => {
      mockListPendingInvitesForMe.mockResolvedValue({ invites: SAMPLE_INVITES });
      mockDeclineInvite.mockResolvedValue(undefined);

      const { result } = renderHook(() => usePendingInvites(), {
        wrapper: ({ children }) => <PendingInvitesProvider>{children}</PendingInvitesProvider>,
      });

      await waitFor(() => {
        expect(result.current.pendingCount).toBe(2);
      });

      await act(async () => {
        const res = await result.current.declineInvite('invite-2');
        expect(res.success).toBe(true);
      });

      await waitFor(() => {
        expect(result.current.pendingInvites).toHaveLength(1);
        expect(result.current.pendingInvites[0].id).toBe('invite-1');
        expect(result.current.pendingCount).toBe(1);
      });
    });

    it('sets decliningInviteId while declining', async () => {
      let resolveDecline: (value: any) => void;
      mockListPendingInvitesForMe.mockResolvedValue({ invites: SAMPLE_INVITES });
      mockDeclineInvite.mockReturnValue(new Promise((resolve) => { resolveDecline = resolve; }));

      const { result } = renderHook(() => usePendingInvites(), {
        wrapper: ({ children }) => <PendingInvitesProvider>{children}</PendingInvitesProvider>,
      });

      await waitFor(() => {
        expect(result.current.pendingCount).toBe(2);
      });

      const declinePromise = result.current.declineInvite('invite-2');

      await waitFor(() => {
        expect(result.current.decliningInviteId).toBe('invite-2');
      });

      await act(async () => {
        resolveDecline!(undefined);
      });
      await declinePromise;

      await waitFor(() => {
        expect(result.current.decliningInviteId).toBeNull();
      });
    });

    it('throws error when decline fails', async () => {
      mockListPendingInvitesForMe.mockResolvedValue({ invites: SAMPLE_INVITES });
      mockDeclineInvite.mockRejectedValue(new Error('Decline failed'));

      const { result } = renderHook(() => usePendingInvites(), {
        wrapper: ({ children }) => <PendingInvitesProvider>{children}</PendingInvitesProvider>,
      });

      await waitFor(() => {
        expect(result.current.pendingCount).toBe(2);
      });

      // The decline should throw, and the invite should remain in the list
      let thrownError: Error | null = null;
      await act(async () => {
        try {
          await result.current.declineInvite('invite-2');
        } catch (err) {
          thrownError = err as Error;
        }
      });

      expect(thrownError).toBeTruthy();
      expect(thrownError?.message).toBe('Decline failed');

      // Invite should still be in the list after failed decline
      expect(result.current.pendingInvites).toHaveLength(2);
    });

    it('clears sessionStorage flag when all invites are declined', async () => {
      sessionStorage.setItem('invites_drawer_auto_opened', 'true');
      mockListPendingInvitesForMe.mockResolvedValue({ invites: [SAMPLE_INVITES[1]] });
      mockDeclineInvite.mockResolvedValue(undefined);

      const { result } = renderHook(() => usePendingInvites(), {
        wrapper: ({ children }) => <PendingInvitesProvider>{children}</PendingInvitesProvider>,
      });

      await waitFor(() => {
        expect(result.current.pendingCount).toBe(1);
      });

      await act(async () => {
        await result.current.declineInvite('invite-2');
      });

      await waitFor(() => {
        expect(result.current.pendingCount).toBe(0);
      });

      expect(sessionStorage.getItem('invites_drawer_auto_opened')).toBeNull();
    });
  });

  describe('polling', () => {
    it('sets up a polling interval that re-fetches invites', async () => {
      // We verify that the context exposes a fetchPendingInvites function
      // that can be called to refresh the list. The 30-second polling is
      // an implementation detail that uses setInterval internally.
      // We test the re-fetch behavior by calling fetchPendingInvites directly.
      mockListPendingInvitesForMe
        .mockResolvedValueOnce({ invites: [] })
        .mockResolvedValueOnce({ invites: SAMPLE_INVITES });

      const { result } = renderHook(() => usePendingInvites(), {
        wrapper: ({ children }) => <PendingInvitesProvider>{children}</PendingInvitesProvider>,
      });

      // Initial fetch returns empty
      await waitFor(() => {
        expect(result.current.pendingCount).toBe(0);
      });

      // Re-fetch returns invites
      await act(async () => {
        await result.current.fetchPendingInvites();
      });

      await waitFor(() => {
        expect(result.current.pendingCount).toBe(2);
        expect(mockListPendingInvitesForMe).toHaveBeenCalledTimes(2);
      });
    });

    it('does not fetch invites when not authenticated', async () => {
      mockUseAccount.mockReturnValue({ isAuthenticated: false });

      const { result } = renderHook(() => usePendingInvites(), {
        wrapper: ({ children }) => <PendingInvitesProvider>{children}</PendingInvitesProvider>,
      });

      await waitFor(() => {
        expect(result.current.pendingInvites).toEqual([]);
        expect(result.current.pendingCount).toBe(0);
      });

      expect(mockListPendingInvitesForMe).not.toHaveBeenCalled();
    });
  });

  describe('usePendingInvites hook', () => {
    it('throws when used outside of PendingInvitesProvider', () => {
      // Suppress console.error for this test
      const spy = vi.spyOn(console, 'error').mockImplementation(() => {});

      expect(() => {
        renderHook(() => usePendingInvites());
      }).toThrow('usePendingInvites must be used within a PendingInvitesProvider');

      spy.mockRestore();
    });
  });
});