/** @vitest-environment jsdom */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';

// ─── Module mocks ─────────────────────────────────────────────────────────────

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, opts?: Record<string, string>) => {
      if (opts?.email) return `${key}:${opts.email}`;
      return key;
    },
    i18n: { language: 'en', changeLanguage: vi.fn() },
  }),
}));

const mockNavigate = vi.fn();
vi.mock('react-router-dom', () => ({
  useParams: () => ({ accountId: 'local-account-id' }),
  useNavigate: () => mockNavigate,
}));

const mockGetAccountSyncMetadata = vi.fn();
vi.mock('@budget/core', () => ({
  getAccountSyncMetadata: (...args: unknown[]) => mockGetAccountSyncMetadata(...args),
}));

const mockUseBudget = vi.fn();
vi.mock('@/contexts/BudgetContext', () => ({
  useBudget: () => mockUseBudget(),
}));

const mockUseAccount = vi.fn();
vi.mock('@/contexts/AccountContext', () => ({
  useAccount: () => mockUseAccount(),
}));

vi.mock('@/components/Layout', () => ({
  default: ({ children }: { children: React.ReactNode }) => <div data-testid="layout">{children}</div>,
}));

vi.mock('@/components/ui/Spinner', () => ({
  default: () => <div data-testid="spinner" />,
}));

const mockToast = vi.fn();
vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({ toast: mockToast }),
}));

// The member-management logic now lives in the shared useAccountMembers hook,
// so we mock it here and assert on its functions.
const mockUseAccountMembers = vi.fn();
vi.mock('@/hooks/useAccountMembers', () => ({
  useAccountMembers: (...args: unknown[]) => mockUseAccountMembers(...args),
  getMemberInitials: (email: string | null) => (email ? 'XX' : '?'),
}));

// ─── Helpers ──────────────────────────────────────────────────────────────────

const SERVER_ACCOUNT_ID = 'server-account-uuid';
const LOCAL_ACCOUNT_ID = 'local-account-id';
const OWNER_USER_ID = 'owner-user-id';
const MEMBER_USER_ID = 'member-user-id';
const INVITE_ID = 'invite-uuid';

const mockInviteMember = vi.fn();
const mockRemoveMember = vi.fn();
const mockCancelInvite = vi.fn();

// Stateful mock so the remove confirmation dialog opens when the trash icon
// is clicked (mirrors the hook's internal memberToRemove state).
let currentMemberToRemove: unknown = null;
const mockSetMemberToRemove = vi.fn((member: unknown) => {
  currentMemberToRemove = member;
});

const OWNER_MEMBER = {
  userId: OWNER_USER_ID,
  displayEmail: 'owner@example.com',
  role: 'owner' as const,
  joinedAt: '2026-01-01T00:00:00Z',
  publicKey: 'owner-pk-b64',
};
const MEMBER_MEMBER = {
  userId: MEMBER_USER_ID,
  displayEmail: 'member@example.com',
  role: 'member' as const,
  joinedAt: '2026-02-01T00:00:00Z',
  publicKey: 'member-pk-b64',
};

function buildDefaultHookState(overrides: Record<string, unknown> = {}) {
  currentMemberToRemove = null;
  mockUseAccountMembers.mockImplementation(() => ({
    members: [OWNER_MEMBER, MEMBER_MEMBER],
    pendingInvites: [],
    loading: false,
    currentUserId: OWNER_USER_ID,
    isOwner: true,
    memberToRemove: currentMemberToRemove,
    setMemberToRemove: mockSetMemberToRemove,
    removeMember: mockRemoveMember,
    removing: false,
    inviteMember: mockInviteMember,
    inviting: false,
    cancelInvite: mockCancelInvite,
    cancellingInvite: false,
    ...overrides,
  }));
}

function buildDefaultState() {
  mockUseBudget.mockReturnValue({
    currentAccount: { id: LOCAL_ACCOUNT_ID, name: 'My Budget' },
    accounts: [{ id: LOCAL_ACCOUNT_ID, name: 'My Budget' }],
    isNetworkOnline: true,
    triggerSync: vi.fn(),
    goOnline: vi.fn(),
    requestGoOnline: vi.fn(),
    requestRestoreOnlineAccounts: vi.fn(),
    isOfflineMode: false,
  });
  mockUseAccount.mockReturnValue({ isLoggedIn: true });
  mockGetAccountSyncMetadata.mockResolvedValue({ serverAccountId: SERVER_ACCOUNT_ID });
  buildDefaultHookState();
}

async function renderAndWait() {
  const { default: SharingSettings } = await import('./SharingSettings');
  const utils = render(<SharingSettings />);
  // Wait for the async loading to settle
  await waitFor(() => expect(screen.queryByTestId('spinner')).not.toBeInTheDocument());
  return { screen, ...utils };
}

async function renderAndWaitWithSync() {
  const utils = await renderAndWait();
  await waitFor(() => expect(screen.queryByText('account_not_synced')).not.toBeInTheDocument());
  return { screen, ...utils };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  localStorage.setItem('session_token', 'test-session');
  localStorage.setItem('userId', OWNER_USER_ID);
});

afterEach(() => {
  vi.resetModules();
});

describe('SharingSettings', () => {
  describe('offline state', () => {
    it('shows offline message when network is unavailable', async () => {
      mockUseBudget.mockReturnValue({
        currentAccount: null,
        accounts: [],
        isNetworkOnline: false,
        triggerSync: vi.fn(),
      });
      mockUseAccount.mockReturnValue({});
      mockGetAccountSyncMetadata.mockResolvedValue({ serverAccountId: SERVER_ACCOUNT_ID });
      buildDefaultHookState();

      const { default: SharingSettings } = await import('./SharingSettings');
      render(<SharingSettings />);

      expect(screen.getByText('connectivity_network_offline')).toBeInTheDocument();
    });

    it('navigates back when back button is clicked in offline state', async () => {
      mockUseBudget.mockReturnValue({
        currentAccount: null,
        accounts: [],
        isNetworkOnline: false,
        triggerSync: vi.fn(),
      });
      mockUseAccount.mockReturnValue({});
      mockGetAccountSyncMetadata.mockResolvedValue(null);
      buildDefaultHookState();

      const { default: SharingSettings } = await import('./SharingSettings');
      render(<SharingSettings />);

      fireEvent.click(screen.getByText('back'));
      expect(mockNavigate).toHaveBeenCalledWith(-1);
    });
  });

  describe('not synced state', () => {
    it('shows not-synced gate when account has no server metadata', async () => {
      mockUseBudget.mockReturnValue({
        currentAccount: { id: LOCAL_ACCOUNT_ID, name: 'My Budget' },
        accounts: [{ id: LOCAL_ACCOUNT_ID, name: 'My Budget' }],
        isNetworkOnline: true,
        triggerSync: vi.fn(),
        goOnline: vi.fn(),
        isOfflineMode: false,
      });
      mockUseAccount.mockReturnValue({ isLoggedIn: true });
      mockGetAccountSyncMetadata.mockResolvedValue(null);
      buildDefaultHookState();

      const { default: SharingSettings } = await import('./SharingSettings');
      render(<SharingSettings />);

      await waitFor(() =>
        expect(screen.getByText('account_not_synced')).toBeInTheDocument(),
      );
    });

    it('shows not-synced gate when isOfflineMode is true even if sync metadata exists', async () => {
      mockUseBudget.mockReturnValue({
        currentAccount: { id: LOCAL_ACCOUNT_ID, name: 'My Budget' },
        accounts: [{ id: LOCAL_ACCOUNT_ID, name: 'My Budget' }],
        isNetworkOnline: true,
        triggerSync: vi.fn(),
        goOnline: vi.fn(),
        isOfflineMode: true,
      });
      mockUseAccount.mockReturnValue({ isLoggedIn: true });
      mockGetAccountSyncMetadata.mockResolvedValue({ serverAccountId: SERVER_ACCOUNT_ID });
      buildDefaultHookState();

      const { default: SharingSettings } = await import('./SharingSettings');
      render(<SharingSettings />);

      await waitFor(() =>
        expect(screen.getByText('account_not_synced')).toBeInTheDocument(),
      );
      expect(screen.queryByText('current_members')).not.toBeInTheDocument();
    });

    it('lifts the gate reactively when isOfflineMode switches from true to false', async () => {
      mockUseBudget.mockReturnValue({
        currentAccount: { id: LOCAL_ACCOUNT_ID, name: 'My Budget' },
        accounts: [{ id: LOCAL_ACCOUNT_ID, name: 'My Budget' }],
        isNetworkOnline: true,
        triggerSync: vi.fn(),
        goOnline: vi.fn(),
        isOfflineMode: true,
      });
      mockUseAccount.mockReturnValue({ isLoggedIn: true });
      mockGetAccountSyncMetadata.mockResolvedValue({ serverAccountId: SERVER_ACCOUNT_ID });
      buildDefaultHookState({ members: [OWNER_MEMBER] });

      const { default: SharingSettings } = await import('./SharingSettings');
      const { rerender } = render(<SharingSettings />);

      await waitFor(() =>
        expect(screen.getByText('account_not_synced')).toBeInTheDocument(),
      );

      mockUseBudget.mockReturnValue({
        currentAccount: { id: LOCAL_ACCOUNT_ID, name: 'My Budget' },
        accounts: [{ id: LOCAL_ACCOUNT_ID, name: 'My Budget' }],
        isNetworkOnline: true,
        triggerSync: vi.fn(),
        goOnline: vi.fn(),
        isOfflineMode: false,
      });
      rerender(<SharingSettings />);

      await waitFor(() =>
        expect(screen.queryByText('account_not_synced')).not.toBeInTheDocument(),
      );
      await waitFor(() =>
        expect(screen.getByText('current_members')).toBeInTheDocument(),
      );
    });

    it('shows the gate reactively when isOfflineMode switches from false to true', async () => {
      buildDefaultState();

      const { default: SharingSettings } = await import('./SharingSettings');
      const { rerender } = render(<SharingSettings />);

      await waitFor(() =>
        expect(screen.getByText('current_members')).toBeInTheDocument(),
      );

      mockUseBudget.mockReturnValue({
        currentAccount: { id: LOCAL_ACCOUNT_ID, name: 'My Budget' },
        accounts: [{ id: LOCAL_ACCOUNT_ID, name: 'My Budget' }],
        isNetworkOnline: true,
        triggerSync: vi.fn(),
        goOnline: vi.fn(),
        isOfflineMode: true,
      });
      rerender(<SharingSettings />);

      await waitFor(() =>
        expect(screen.getByText('account_not_synced')).toBeInTheDocument(),
      );
      expect(screen.queryByText('current_members')).not.toBeInTheDocument();
    });
  });

  describe('loading sharing info', () => {
    it('renders the invite form and member list after loading', async () => {
      buildDefaultState();
      await renderAndWaitWithSync();

      expect(screen.getByText('invite_someone')).toBeInTheDocument();
      expect(screen.getByText('My Budget')).toBeInTheDocument();
      expect(screen.getByText('member@example.com')).toBeInTheDocument();
    });

    it('shows "YOU" badge on the current user', async () => {
      buildDefaultState();
      await renderAndWaitWithSync();

      expect(screen.getByText('you')).toBeInTheDocument();
    });

    it('shows owner badge with ShieldCheck icon on owner row', async () => {
      buildDefaultState();
      await renderAndWaitWithSync();

      const ownerLabels = screen.getAllByText('owner');
      expect(ownerLabels.length).toBeGreaterThan(0);
    });
  });

  describe('invite member', () => {
    it('sends an invite when valid email is submitted', async () => {
      buildDefaultState();
      mockInviteMember.mockResolvedValue(null);

      await renderAndWaitWithSync();

      fireEvent.click(screen.getByText('invite_someone'));

      const emailInput = screen.getByPlaceholderText('enter_email');
      fireEvent.change(emailInput, { target: { value: 'new@example.com' } });
      fireEvent.submit(emailInput.closest('form')!);

      await waitFor(() =>
        expect(mockInviteMember).toHaveBeenCalledWith(
          'new@example.com',
          'My Budget',
        ),
      );
    });

    it('shows error when trying to invite an existing member', async () => {
      buildDefaultState();
      mockInviteMember.mockResolvedValue('already_member_error');

      await renderAndWaitWithSync();

      fireEvent.click(screen.getByText('invite_someone'));

      const emailInput = screen.getByPlaceholderText('enter_email');
      fireEvent.change(emailInput, { target: { value: 'member@example.com' } });
      fireEvent.submit(emailInput.closest('form')!);

      await waitFor(() =>
        expect(screen.getByText('already_member_error')).toBeInTheDocument(),
      );
    });

    it('shows API error message on already_invited response', async () => {
      buildDefaultState();
      mockInviteMember.mockResolvedValue('duplicate_invite_error');

      await renderAndWaitWithSync();

      fireEvent.click(screen.getByText('invite_someone'));

      const emailInput = screen.getByPlaceholderText('enter_email');
      fireEvent.change(emailInput, { target: { value: 'someone@example.com' } });
      fireEvent.submit(emailInput.closest('form')!);

      await waitFor(() =>
        expect(screen.getByText('duplicate_invite_error')).toBeInTheDocument(),
      );
    });

    it('shows generic error on unexpected invite failure', async () => {
      buildDefaultState();
      mockInviteMember.mockResolvedValue('failed_to_invite');

      await renderAndWaitWithSync();

      fireEvent.click(screen.getByText('invite_someone'));

      const emailInput = screen.getByPlaceholderText('enter_email');
      fireEvent.change(emailInput, { target: { value: 'someone@example.com' } });
      fireEvent.submit(emailInput.closest('form')!);

      await waitFor(() =>
        expect(screen.getByText('failed_to_invite')).toBeInTheDocument(),
      );
    });

    it('invite button is hidden for non-owner', async () => {
      buildDefaultState();
      buildDefaultHookState({ isOwner: false, currentUserId: MEMBER_USER_ID });

      await renderAndWaitWithSync();

      expect(screen.queryByText('invite_someone')).not.toBeInTheDocument();
    });
  });

  describe('pending invites', () => {
    it('renders pending invites section when invites exist', async () => {
      buildDefaultState();
      buildDefaultHookState({
        pendingInvites: [
          { id: INVITE_ID, recipientEmail: 'invited@example.com', status: 'pending', createdAt: '' },
        ],
      });

      await renderAndWaitWithSync();

      expect(screen.getByText('pending_invites')).toBeInTheDocument();
      expect(screen.getByText('invited@example.com')).toBeInTheDocument();
    });

    it('cancels a pending invite via confirmation dialog', async () => {
      buildDefaultState();
      buildDefaultHookState({
        pendingInvites: [
          { id: INVITE_ID, recipientEmail: 'invited@example.com', status: 'pending', createdAt: '' },
        ],
      });
      mockCancelInvite.mockResolvedValue(undefined);

      await renderAndWaitWithSync();

      fireEvent.click(screen.getByTestId(`cancel-invite-${INVITE_ID}`));

      await waitFor(() =>
        expect(screen.getByText('cancel_invite_title')).toBeInTheDocument(),
      );

      fireEvent.click(screen.getByText('cancel_invite'));

      await waitFor(() =>
        expect(mockCancelInvite).toHaveBeenCalledWith(INVITE_ID),
      );
    });
  });

  describe('remove member', () => {
    it('opens remove confirmation dialog when trash icon is clicked', async () => {
      buildDefaultState();
      const { default: SharingSettings } = await import('./SharingSettings');
      const { rerender } = render(<SharingSettings />);
      await waitFor(() =>
        expect(screen.getByText('current_members')).toBeInTheDocument(),
      );

      fireEvent.click(screen.getByTestId(`remove-member-${MEMBER_USER_ID}`));
      expect(mockSetMemberToRemove).toHaveBeenCalledWith(MEMBER_MEMBER);

      rerender(<SharingSettings />);
      await waitFor(() =>
        expect(screen.getByText('remove_member_title')).toBeInTheDocument(),
      );
    });

    it('calls removeMember on confirm', async () => {
      buildDefaultState();
      const { default: SharingSettings } = await import('./SharingSettings');
      const { rerender } = render(<SharingSettings />);
      await waitFor(() =>
        expect(screen.getByText('current_members')).toBeInTheDocument(),
      );

      fireEvent.click(screen.getByTestId(`remove-member-${MEMBER_USER_ID}`));
      rerender(<SharingSettings />);
      await waitFor(() =>
        expect(screen.getByText('remove_member_title')).toBeInTheDocument(),
      );

      fireEvent.click(screen.getByText('remove'));

      await waitFor(() => expect(mockRemoveMember).toHaveBeenCalled());
    });
  });

  describe('error handling', () => {
    it('falls back to not-synced gate when getAccountSyncMetadata rejects', async () => {
      mockUseBudget.mockReturnValue({
        currentAccount: { id: LOCAL_ACCOUNT_ID, name: 'My Budget' },
        accounts: [{ id: LOCAL_ACCOUNT_ID, name: 'My Budget' }],
        isNetworkOnline: true,
        triggerSync: vi.fn(),
        goOnline: vi.fn(),
        isOfflineMode: false,
      });
      mockUseAccount.mockReturnValue({ isLoggedIn: true });
      mockGetAccountSyncMetadata.mockRejectedValue(new Error('IndexedDB unavailable'));
      buildDefaultHookState();

      const { default: SharingSettings } = await import('./SharingSettings');
      render(<SharingSettings />);

      await waitFor(() =>
        expect(screen.getByText('account_not_synced')).toBeInTheDocument(),
      );
    });
  });
});
