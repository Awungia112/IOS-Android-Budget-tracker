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

const mockProvisionSharedAccount = vi.fn().mockResolvedValue({ success: true });

vi.mock('@/contexts/BudgetContext', () => ({
  useBudget: () => ({
    provisionSharedAccount: mockProvisionSharedAccount,
  }),
}));

const mockRemovePendingKeyDeliveryAccount = vi.fn();

vi.mock('@/contexts/PendingInvitesContext', () => ({
  usePendingInvites: () => ({
    removePendingKeyDeliveryAccount: mockRemovePendingKeyDeliveryAccount,
  }),
}));

vi.mock('@/components/ui/Spinner', () => ({
  default: ({ size }: { size?: number }) => <div data-testid="spinner" />,
}));

// ─── Test data ─────────────────────────────────────────────────────────────────

import { InviteDetailDialog } from './InviteDetailDialog';
import { OnlineAccountsError } from '@budget/core';

const SAMPLE_INVITE: PendingInvite = {
  id: 'invite-1',
  accountId: 'account-1',
  senderUserId: 'user-alice',
  inviterName: 'Alice Owner',
  inviterEmail: 'alice@example.com',
  accountName: 'Household Budget',
  createdAt: '2026-06-20T10:00:00.000Z',
};

beforeEach(() => {
  vi.clearAllMocks();
  mockProvisionSharedAccount.mockResolvedValue({ success: true });
  mockRemovePendingKeyDeliveryAccount.mockClear();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('InviteDetailDialog', () => {
  const defaultProps = {
    open: true,
    onOpenChange: vi.fn(),
    invite: SAMPLE_INVITE as PendingInvite | null,
    onAccept: vi.fn().mockResolvedValue({ success: true }),
    onDecline: vi.fn().mockResolvedValue({ success: true }),
    acceptingInviteId: null as string | null,
    decliningInviteId: null as string | null,
  };

  describe('when invite is null', () => {
    it('renders nothing', () => {
      const { container } = render(
        <InviteDetailDialog {...defaultProps} invite={null} />,
      );
      expect(container.innerHTML).toBe('');
    });
  });

  describe('with a valid invite', () => {
    it('shows invite details: inviter name, email, account name, and date', () => {
      render(<InviteDetailDialog {...defaultProps} />);

      expect(screen.getByText('Alice Owner')).toBeInTheDocument();
      expect(screen.getByText('alice@example.com')).toBeInTheDocument();
      expect(screen.getByText('Household Budget')).toBeInTheDocument();
      expect(screen.getByText('invite_details')).toBeInTheDocument();
    });

    it('shows inviter initials in avatar', () => {
      render(<InviteDetailDialog {...defaultProps} />);

      // Alice Owner → "AO"
      expect(screen.getByText('AO')).toBeInTheDocument();
    });

    it('shows "unknown_inviter" when name and email are null', () => {
      const inviteWithNulls: PendingInvite = {
        ...SAMPLE_INVITE,
        inviterName: null,
        inviterEmail: null,
      };

      render(<InviteDetailDialog {...defaultProps} invite={inviteWithNulls} />);

      expect(screen.getByText('unknown_inviter')).toBeInTheDocument();
    });

    it('shows "unnamed_account" when accountName is null', () => {
      const inviteWithNullAccount: PendingInvite = {
        ...SAMPLE_INVITE,
        accountName: null,
      };

      render(<InviteDetailDialog {...defaultProps} invite={inviteWithNullAccount} />);

      expect(screen.getByText('unnamed_account')).toBeInTheDocument();
    });

    it('shows accept, decline, and cancel buttons in initial state', () => {
      render(<InviteDetailDialog {...defaultProps} />);

      expect(screen.getByText('accept')).toBeInTheDocument();
      expect(screen.getByText('decline')).toBeInTheDocument();
      expect(screen.getByText('cancel')).toBeInTheDocument();
    });
  });

  describe('accept flow', () => {
    it('calls onAccept and provisionSharedAccount when accept is clicked', async () => {
      const onAccept = vi.fn().mockResolvedValue({ success: true });

      render(
        <InviteDetailDialog
          {...defaultProps}
          onAccept={onAccept}
        />,
      );

      const acceptButton = screen.getByText('accept');
      fireEvent.click(acceptButton);

      await waitFor(() => {
        expect(onAccept).toHaveBeenCalledWith('invite-1', 'account-1');
      });

      // provisionSharedAccount should be called after accept
      await waitFor(() => {
        expect(mockProvisionSharedAccount).toHaveBeenCalledWith(
          'account-1',
          'Household Budget',
        );
      });
    });

    it('shows spinner on accept button while accepting', () => {
      render(
        <InviteDetailDialog
          {...defaultProps}
          acceptingInviteId="invite-1"
        />,
      );

      // The accept button should show a spinner
      const spinners = screen.getAllByTestId('spinner');
      expect(spinners.length).toBeGreaterThanOrEqual(1);
    });

    it('shows success state after accept succeeds', async () => {
      const onAccept = vi.fn().mockResolvedValue({ success: true });

      render(
        <InviteDetailDialog
          {...defaultProps}
          onAccept={onAccept}
        />,
      );

      const acceptButton = screen.getByText('accept');
      fireEvent.click(acceptButton);

      await waitFor(() => {
        expect(screen.getByText('invite_accepted')).toBeInTheDocument();
        expect(screen.getByText('invite_accepted_description')).toBeInTheDocument();
      });
    });

    it('shows error state when accept fails', async () => {
      const onAccept = vi.fn().mockRejectedValue(new Error('Accept failed'));

      render(
        <InviteDetailDialog
          {...defaultProps}
          onAccept={onAccept}
        />,
      );

      const acceptButton = screen.getByText('accept');
      fireEvent.click(acceptButton);

      await waitFor(() => {
        expect(screen.getByText('failed_to_accept_invite')).toBeInTheDocument();
      });
    });

    it('shows the session-expired message when accepting fails with 401', async () => {
      const onAccept = vi
        .fn()
        .mockRejectedValue(new OnlineAccountsError(401, undefined));

      render(
        <InviteDetailDialog
          {...defaultProps}
          onAccept={onAccept}
        />,
      );

      const acceptButton = screen.getByText('accept');
      fireEvent.click(acceptButton);

      await waitFor(() => {
        expect(screen.getByText('session_expired_sign_in_again')).toBeInTheDocument();
      });
    });

    it('disables all buttons while processing accept', () => {
      render(
        <InviteDetailDialog
          {...defaultProps}
          acceptingInviteId="invite-1"
        />,
      );

      // All buttons in initial state should be disabled
      const buttons = screen.getAllByRole('button');
      buttons.forEach((button) => {
        expect(button).toBeDisabled();
      });
    });
  });

  describe('decline flow', () => {
    it('calls onDecline when decline is clicked', async () => {
      const onDecline = vi.fn().mockResolvedValue({ success: true });

      render(
        <InviteDetailDialog
          {...defaultProps}
          onDecline={onDecline}
        />,
      );

      const declineButton = screen.getByText('decline');
      fireEvent.click(declineButton);

      await waitFor(() => {
        expect(onDecline).toHaveBeenCalledWith('invite-1');
      });
    });

    it('shows spinner on decline button while declining', () => {
      render(
        <InviteDetailDialog
          {...defaultProps}
          decliningInviteId="invite-1"
        />,
      );

      const spinners = screen.getAllByTestId('spinner');
      expect(spinners.length).toBeGreaterThanOrEqual(1);
    });

    it('shows error state when decline fails', async () => {
      const onDecline = vi.fn().mockRejectedValue(new Error('Decline failed'));

      render(
        <InviteDetailDialog
          {...defaultProps}
          onDecline={onDecline}
        />,
      );

      const declineButton = screen.getByText('decline');
      fireEvent.click(declineButton);

      await waitFor(() => {
        expect(screen.getByText('failed_to_decline_invite')).toBeInTheDocument();
      });
    });

    it('shows the session-expired message when declining fails with 401', async () => {
      const onDecline = vi
        .fn()
        .mockRejectedValue(new OnlineAccountsError(401, undefined));

      render(
        <InviteDetailDialog
          {...defaultProps}
          onDecline={onDecline}
        />,
      );

      const declineButton = screen.getByText('decline');
      fireEvent.click(declineButton);

      await waitFor(() => {
        expect(screen.getByText('session_expired_sign_in_again')).toBeInTheDocument();
      });
    });

    it('closes dialog after successful decline', async () => {
      const onDecline = vi.fn().mockResolvedValue({ success: true });
      const onOpenChange = vi.fn();

      render(
        <InviteDetailDialog
          {...defaultProps}
          onDecline={onDecline}
          onOpenChange={onOpenChange}
        />,
      );

      const declineButton = screen.getByText('decline');
      fireEvent.click(declineButton);

      await waitFor(() => {
        expect(onOpenChange).toHaveBeenCalledWith(false);
      });
    });
  });

  describe('cancel button', () => {
    it('closes the dialog when cancel is clicked', () => {
      const onOpenChange = vi.fn();

      render(
        <InviteDetailDialog
          {...defaultProps}
          onOpenChange={onOpenChange}
        />,
      );

      const cancelButton = screen.getByText('cancel');
      fireEvent.click(cancelButton);

      expect(onOpenChange).toHaveBeenCalledWith(false);
    });
  });

  describe('dialog state reset', () => {
    it('resets acceptance state when dialog is closed and reopened', async () => {
      const onAccept = vi.fn().mockResolvedValue({ success: true });
      const { rerender } = render(
        <InviteDetailDialog
          {...defaultProps}
          onAccept={onAccept}
        />,
      );

      // Accept the invite
      const acceptButton = screen.getByText('accept');
      fireEvent.click(acceptButton);

      await waitFor(() => {
        expect(screen.getByText('invite_accepted')).toBeInTheDocument();
      });

      // Close the dialog
      rerender(
        <InviteDetailDialog
          {...defaultProps}
          open={false}
          onAccept={onAccept}
        />,
      );

      // Reopen the dialog
      rerender(
        <InviteDetailDialog
          {...defaultProps}
          open={true}
          onAccept={onAccept}
        />,
      );

      // Should be back to initial state with accept/decline buttons
      await waitFor(() => {
        expect(screen.getByText('accept')).toBeInTheDocument();
        expect(screen.getByText('decline')).toBeInTheDocument();
      });
    });
  });
});