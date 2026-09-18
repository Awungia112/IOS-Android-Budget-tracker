/** @vitest-environment jsdom */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import React from 'react';
import type { PendingInvite } from '@/contexts/PendingInvitesContext';

// ─── Module mocks ─────────────────────────────────────────────────────────────

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, opts?: Record<string, any>) => {
      if (opts?.count !== undefined) return `${key}_${opts.count}`;
      return key;
    },
    i18n: { language: 'en', changeLanguage: vi.fn() },
  }),
}));

vi.mock('@/components/ui/Spinner', () => ({
  default: ({ size }: { size?: number }) => <div data-testid="spinner" />,
}));

// ─── Test data ─────────────────────────────────────────────────────────────────

import { PendingInvitesDrawer } from './PendingInvitesDrawer';

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
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('PendingInvitesDrawer', () => {
  const defaultProps = {
    open: true,
    onClose: vi.fn(),
    pendingInvites: [] as PendingInvite[],
    isLoading: false,
    onSelectInvite: vi.fn(),
  };

  describe('when loading', () => {
    it('shows a spinner while loading', () => {
      render(<PendingInvitesDrawer {...defaultProps} isLoading={true} />);

      expect(screen.getByTestId('spinner')).toBeInTheDocument();
    });
  });

  describe('when no invites', () => {
    it('shows empty state message', () => {
      render(<PendingInvitesDrawer {...defaultProps} pendingInvites={[]} />);

      expect(screen.getByText('no_pending_invites')).toBeInTheDocument();
    });
  });

  describe('with pending invites', () => {
    it('renders invite rows with inviter name and account name', () => {
      render(<PendingInvitesDrawer {...defaultProps} pendingInvites={SAMPLE_INVITES} />);

      // First invite shows name
      expect(screen.getByText('Alice Owner')).toBeInTheDocument();
      expect(screen.getByText('Household Budget')).toBeInTheDocument();

      // Second invite shows email (since name is null)
      expect(screen.getByText('bob@example.com')).toBeInTheDocument();
      // Second invite shows "unnamed_account" since accountName is null
      expect(screen.getByText('unnamed_account')).toBeInTheDocument();
    });

    it('renders invite initials in avatar', () => {
      render(<PendingInvitesDrawer {...defaultProps} pendingInvites={SAMPLE_INVITES} />);

      // Alice Owner → "AO"
      expect(screen.getByText('AO')).toBeInTheDocument();
      // bob@example.com → "BO"
      expect(screen.getByText('BO')).toBeInTheDocument();
    });

    it('calls onSelectInvite when an invite row is clicked', () => {
      const onSelectInvite = vi.fn();
      render(
        <PendingInvitesDrawer
          {...defaultProps}
          pendingInvites={SAMPLE_INVITES}
          onSelectInvite={onSelectInvite}
        />,
      );

      // Click on the first invite row
      const firstInviteRow = screen.getByText('Alice Owner').closest('button');
      expect(firstInviteRow).toBeTruthy();
      fireEvent.click(firstInviteRow!);

      expect(onSelectInvite).toHaveBeenCalledWith(SAMPLE_INVITES[0]);
    });

    it('shows the invite count in the description for multiple invites', () => {
      render(<PendingInvitesDrawer {...defaultProps} pendingInvites={SAMPLE_INVITES} />);

      // With 2 invites, should use the "other" plural form
      // The mock returns "pending_invites_description_other_2" for t("pending_invites_description_other", { count: 2 })
      expect(screen.getByText('pending_invites_description_other_2')).toBeInTheDocument();
    });

    it('shows singular description for single invite', () => {
      render(
        <PendingInvitesDrawer
          {...defaultProps}
          pendingInvites={[SAMPLE_INVITES[0]]}
        />,
      );

      // The mock returns "pending_invites_description_one_1" for t("pending_invites_description_one", { count: 1 })
      expect(screen.getByText('pending_invites_description_one_1')).toBeInTheDocument();
    });
  });

  describe('drawer open/close', () => {
    it('renders the drawer title when open', () => {
      render(<PendingInvitesDrawer {...defaultProps} open={true} />);

      expect(screen.getByText('pending_invites')).toBeInTheDocument();
    });

    it('calls onClose when close button is clicked', () => {
      const onClose = vi.fn();
      render(
        <PendingInvitesDrawer {...defaultProps} open={true} onClose={onClose} />,
      );

      const closeButton = screen.getByText('close');
      fireEvent.click(closeButton);

      expect(onClose).toHaveBeenCalled();
    });
  });

  describe('invite with null name and null email', () => {
    it('shows "unknown_inviter" fallback', () => {
      const inviteWithNulls: PendingInvite = {
        id: 'invite-3',
        accountId: 'account-3',
        senderUserId: 'user-unknown',
        inviterName: null,
        inviterEmail: null,
        accountName: 'Some Account',
        createdAt: '2026-06-18T12:00:00.000Z',
      };

      render(
        <PendingInvitesDrawer
          {...defaultProps}
          pendingInvites={[inviteWithNulls]}
        />,
      );

      expect(screen.getByText('unknown_inviter')).toBeInTheDocument();
    });
  });
});