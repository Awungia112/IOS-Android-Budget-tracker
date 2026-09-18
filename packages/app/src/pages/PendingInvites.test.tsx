/** @vitest-environment jsdom */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import React from 'react';
import type { PendingInvite } from '@/contexts/PendingInvitesContext';

// ─── Module mocks ─────────────────────────────────────────────────────────────

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { language: 'en', changeLanguage: vi.fn() },
  }),
}));

vi.mock('react-router-dom', () => ({
  useNavigate: () => vi.fn(),
}));

vi.mock('@/components/Layout', () => ({
  default: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="layout">{children}</div>
  ),
}));

vi.mock('@/contexts/PendingInvitesContext', () => ({
  usePendingInvites: () => mockUsePendingInvites(),
}));

vi.mock('@/contexts/BudgetContext', () => ({
  useBudget: () => ({
    provisionSharedAccount: vi.fn().mockResolvedValue({ success: true }),
    refreshFromDb: vi.fn().mockResolvedValue(undefined),
  }),
}));

vi.mock('@/components/ui/Spinner', () => ({
  default: ({ size }: { size?: number }) => <div data-testid="spinner" />,
}));

// ─── Test data ─────────────────────────────────────────────────────────────────

const mockUsePendingInvites = vi.fn();

const SAMPLE_INVITES: PendingInvite[] = [
  {
    id: 'invite-1',
    accountId: 'account-1',
    senderUserId: 'user-alice',
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
  mockUsePendingInvites.mockReturnValue({
    pendingInvites: [],
    isLoading: false,
    acceptInvite: vi.fn().mockResolvedValue({ success: true }),
    declineInvite: vi.fn().mockResolvedValue({ success: true }),
    acceptingInviteId: null,
    decliningInviteId: null,
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('PendingInvites page', () => {
  describe('loading state', () => {
    it('shows a spinner while loading', async () => {
      mockUsePendingInvites.mockReturnValue({
        pendingInvites: [],
        isLoading: true,
        acceptInvite: vi.fn(),
        declineInvite: vi.fn(),
        acceptingInviteId: null,
        decliningInviteId: null,
      });

      const { default: PendingInvites } = await import('./PendingInvites');
      render(<PendingInvites />);

      expect(screen.getByTestId('spinner')).toBeInTheDocument();
    });
  });

  describe('empty state', () => {
    it('shows empty state message when no pending invites', async () => {
      mockUsePendingInvites.mockReturnValue({
        pendingInvites: [],
        isLoading: false,
        acceptInvite: vi.fn(),
        declineInvite: vi.fn(),
        acceptingInviteId: null,
        decliningInviteId: null,
      });

      const { default: PendingInvites } = await import('./PendingInvites');
      render(<PendingInvites />);

      expect(screen.getByText('no_pending_invites')).toBeInTheDocument();
    });
  });

  describe('with pending invites', () => {
    it('renders invite cards with inviter name and account name', async () => {
      mockUsePendingInvites.mockReturnValue({
        pendingInvites: SAMPLE_INVITES,
        isLoading: false,
        acceptInvite: vi.fn(),
        declineInvite: vi.fn(),
        acceptingInviteId: null,
        decliningInviteId: null,
      });

      const { default: PendingInvites } = await import('./PendingInvites');
      render(<PendingInvites />);

      // First invite
      expect(screen.getByText('Alice Owner')).toBeInTheDocument();
      expect(screen.getByText('Household Budget')).toBeInTheDocument();

      // Second invite (email fallback since name is null)
      expect(screen.getByText('bob@example.com')).toBeInTheDocument();
      expect(screen.getByText('unnamed_account')).toBeInTheDocument();
    });

    it('renders invite initials in avatar', async () => {
      mockUsePendingInvites.mockReturnValue({
        pendingInvites: SAMPLE_INVITES,
        isLoading: false,
        acceptInvite: vi.fn(),
        declineInvite: vi.fn(),
        acceptingInviteId: null,
        decliningInviteId: null,
      });

      const { default: PendingInvites } = await import('./PendingInvites');
      render(<PendingInvites />);

      // Alice Owner → "AO"
      expect(screen.getByText('AO')).toBeInTheDocument();
      // bob@example.com → "BO"
      expect(screen.getByText('BO')).toBeInTheDocument();
    });

    it('renders "new" badge on each invite', async () => {
      mockUsePendingInvites.mockReturnValue({
        pendingInvites: SAMPLE_INVITES,
        isLoading: false,
        acceptInvite: vi.fn(),
        declineInvite: vi.fn(),
        acceptingInviteId: null,
        decliningInviteId: null,
      });

      const { default: PendingInvites } = await import('./PendingInvites');
      render(<PendingInvites />);

      const newBadges = screen.getAllByText('new');
      expect(newBadges).toHaveLength(2);
    });

    it('opens invite detail dialog when an invite card is clicked', async () => {
      mockUsePendingInvites.mockReturnValue({
        pendingInvites: [SAMPLE_INVITES[0]],
        isLoading: false,
        acceptInvite: vi.fn().mockResolvedValue({ success: true }),
        declineInvite: vi.fn().mockResolvedValue({ success: true }),
        acceptingInviteId: null,
        decliningInviteId: null,
      });

      const { default: PendingInvites } = await import('./PendingInvites');
      render(<PendingInvites />);

      // Click on the invite card
      const inviteCard = screen.getByTestId('pending-invite-invite-1');
      fireEvent.click(inviteCard);

      // The invite detail dialog should open
      await waitFor(() => {
        expect(screen.getByText('invite_details')).toBeInTheDocument();
      });
    });

    it('shows "unknown_inviter" when name and email are null', async () => {
      const inviteWithNulls: PendingInvite = {
        id: 'invite-3',
        accountId: 'account-3',
        senderUserId: 'user-unknown',
        inviterName: null,
        inviterEmail: null,
        accountName: 'Some Account',
        createdAt: '2026-06-18T12:00:00.000Z',
      };

      mockUsePendingInvites.mockReturnValue({
        pendingInvites: [inviteWithNulls],
        isLoading: false,
        acceptInvite: vi.fn(),
        declineInvite: vi.fn(),
        acceptingInviteId: null,
        decliningInviteId: null,
      });

      const { default: PendingInvites } = await import('./PendingInvites');
      render(<PendingInvites />);

      expect(screen.getByText('unknown_inviter')).toBeInTheDocument();
    });
  });

  describe('page header', () => {
    it('renders the page title', async () => {
      mockUsePendingInvites.mockReturnValue({
        pendingInvites: [],
        isLoading: false,
        acceptInvite: vi.fn(),
        declineInvite: vi.fn(),
        acceptingInviteId: null,
        decliningInviteId: null,
      });

      const { default: PendingInvites } = await import('./PendingInvites');
      render(<PendingInvites />);

      expect(screen.getByText('pending_invites')).toBeInTheDocument();
    });
  });
});