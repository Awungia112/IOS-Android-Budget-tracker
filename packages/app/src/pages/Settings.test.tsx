import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach } from "vitest";
import Settings from "../pages/Settings";
import { useBudget } from "@/contexts/BudgetContext";
import { useAccount } from "@/contexts/AccountContext";
import { useFeedbackForm } from "@/services/feedbackService";
import { useNavigate } from "react-router-dom";
import type { BudgetContextType } from "@/contexts/BudgetContext";
import type { AccountContextType } from "@/contexts/AccountContext";

// Mock dependencies
const mockToast = vi.hoisted(() => vi.fn());
vi.mock("@/hooks/use-toast", () => ({
  toast: mockToast,
}));

vi.mock("@/contexts/BudgetContext");
vi.mock("@/contexts/AccountContext");
vi.mock("@/services/feedbackService");
vi.mock("@/contexts/PendingInvitesContext", () => ({
  usePendingInvites: () => ({
    pendingInvites: [],
    isLoading: false,
    error: null,
    fetchPendingInvites: vi.fn(),
    acceptInvite: vi.fn(),
    declineInvite: vi.fn(),
    pendingCount: 0,
    acceptingInviteId: null,
    decliningInviteId: null,
  }),
  PendingInvitesProvider: ({ children }: { children: React.ReactNode }) => children,
}));
vi.mock("@/components/Layout", () => ({
  default: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
}));
vi.mock("@budget/core", () => ({
  budgetService: {},
  syncEngine: {},
  createOnlineAccountsClient: vi.fn(),
  loadPrivateKey: vi.fn(),
  loadAccountKey: vi.fn(),
  provisionAccountKeyForFirstSync: vi.fn(),
  fetchUnwrapAndStoreAccountKey: vi.fn(),
  upsertAccountSyncMetadata: vi.fn(),
  getAccountSyncMetadata: vi.fn(),
  getAccountSyncMetadataByServerId: vi.fn(),
  deleteAccountSyncMetadata: vi.fn(),
  processPendingKeyRequests: vi.fn(),
  processPendingKeyDeliveries: vi.fn(),
  restoreAccountFromServer: vi.fn(),
  generateUUID: vi.fn(),
  DEFAULT_ACCOUNT_ID: "default",
  uploadQueue: { count: vi.fn().mockResolvedValue(0) },
}));

vi.mock("lucide-react", async () => {
  const actual = await vi.importActual("lucide-react");
  return {
    ...actual,
    // All icons will be available from the actual module
  };
});

const mockNavigate = vi.fn();
vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual("react-router-dom");
  return {
    ...(actual as any),
    useNavigate: () => mockNavigate,
  };
});

// Mock i18next
vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: {
      changeLanguage: () => Promise.resolve(),
      language: "en",
    },
  }),
  I18nextProvider: ({ children }: { children: React.ReactNode }) => children,
  initReactI18next: { type: "3rdParty", init: () => {} },
}));

describe("Settings Page", () => {
  const mockResetApp = vi.fn();
  const mockAddAccount = vi.fn();
  const mockDeleteAccount = vi.fn();
  const mockExportAccountData = vi.fn();
  const mockImportAccountData = vi.fn();
  const mockSwitchAccount = vi.fn();
  const mockLogout = vi.fn();
  const mockDeleteOnlineAccount = vi.fn().mockResolvedValue(undefined);
  const mockSubmitFeedback = vi.fn();

  const mockCurrentAccount = {
    id: "1",
    name: "Main Account",
    initials: "MA",
  };

  const mockAccounts = [
    mockCurrentAccount,
    { id: "2", name: "Work Account", initials: "WA" },
  ];

  let user: ReturnType<typeof userEvent.setup>;

  beforeEach(() => {
    vi.clearAllMocks();
    user = userEvent.setup();
    vi.mocked(useBudget).mockReturnValue({
      resetApp: mockResetApp,
      addAccount: mockAddAccount,
      accounts: mockAccounts,
      deleteAccount: mockDeleteAccount,
      exportAccountData: mockExportAccountData,
      importAccountData: mockImportAccountData,
      switchAccount: mockSwitchAccount,
      currentAccount: mockCurrentAccount,
      getAccountBalances: vi.fn().mockResolvedValue({}),
      isNetworkOnline: true,
      isOfflineMode: false,
      setIsOfflineMode: vi.fn(),
      goOffline: vi.fn(),
      goOnline: vi.fn(),
      requestGoOnline: vi.fn(),
      requestRestoreOnlineAccounts: vi.fn(),
      // Add other required properties from BudgetContextType
      transactions: [],
      addTransaction: vi.fn(),
      updateTransaction: vi.fn(),
      deleteTransaction: vi.fn(),
      categories: [],
      addCategory: vi.fn(),
      deleteCategory: vi.fn(),
      updateCategory: vi.fn(),
      limits: [],
      addLimit: vi.fn(),
      updateLimit: vi.fn(),
      deleteLimit: vi.fn(),
      templates: [],
      addTemplate: vi.fn(),
      updateTemplate: vi.fn(),
      deleteTemplate: vi.fn(),
      applyTemplate: vi.fn(),
      recurringItems: [],
      addRecurringItem: vi.fn(),
      updateRecurringItem: vi.fn(),
      deleteRecurringItem: vi.fn(),
      savingsGoals: [],
      addSavingsGoal: vi.fn(),
      updateSavingsGoal: vi.fn(),
      deleteSavingsGoal: vi.fn(),
      updateAccount: vi.fn(),
      executePendingTransactionsNow: vi.fn(),
      missedNotifications: [],
      dismissMissedNotifications: vi.fn(),
      isLoading: false,
      triggerSync: vi.fn(),
      provisionSharedAccount: vi.fn().mockResolvedValue({ success: true }),
      refreshFromDb: vi.fn().mockResolvedValue(undefined),
      deleteOnlineAccount: mockDeleteOnlineAccount,
    } as BudgetContextType);
    vi.mocked(useAccount).mockReturnValue({
      logout: mockLogout,
      isAuthenticated: true,
      setIsAuthenticated: vi.fn(),
      isLoggedIn: true,
      setIsLoggedIn: vi.fn(),
      resetOnboarding: vi.fn(),
    } as AccountContextType);
    vi.mocked(useFeedbackForm).mockReturnValue({
      submitFeedback: mockSubmitFeedback,
      state: { submitting: false },
    });
  });

  it("renders initial state correctly", () => {
    render(<Settings />);
    expect(screen.getAllByText("Main Account").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Work Account").length).toBeGreaterThan(0);
  });

  it("handles account switching", async () => {
    render(<Settings />);
    const workAccountBtn = screen.getAllByText("Work Account")[0];
    await user.click(workAccountBtn);
    expect(mockSwitchAccount).toHaveBeenCalledWith("2");
  });

  it("handles adding a new account", async () => {
    render(<Settings />);
    await user.click(screen.getByText("new_account"));

    const input = screen.getByPlaceholderText("account_name_placeholder");
    await user.type(input, "New Test Account");

    await user.click(screen.getByText("create"));
    expect(mockAddAccount).toHaveBeenCalledWith("New Test Account");
  }, 20000);

  it("handles account deletion", async () => {
    render(<Settings />);

    // Find the delete button for 'Work Account' using aria-label
    const deleteBtn = screen.getByLabelText("Delete Work Account");
    await user.click(deleteBtn);

    expect(screen.getAllByText("delete_account").length).toBeGreaterThan(0);
    await user.click(screen.getByText("delete"));
    expect(mockDeleteAccount).toHaveBeenCalledWith("2");
  });
  it("handles app reset", async () => {
    render(<Settings />);
    await user.click(screen.getByText("reset_app"));

    expect(screen.getAllByText("reset_warning").length).toBeGreaterThan(0);
    await user.click(screen.getByText("reset"));

    await waitFor(
      () => {
        expect(mockResetApp).toHaveBeenCalled();
      },
      { timeout: 3000 },
    );
  });

  it("handles logout", async () => {
    render(<Settings />);
    await user.click(screen.getByText("logout"));

    await waitFor(() => {
      expect(screen.getByTestId("confirm-logout-button")).toBeInTheDocument();
    });

    await user.click(screen.getByTestId("confirm-logout-button"));

    await waitFor(
      () => {
        expect(mockLogout).toHaveBeenCalled();
      },
      { timeout: 3000 },
    );
  });

  it("shows delete online account button when logged in", () => {
    render(<Settings />);
    expect(screen.getByText("delete_online_account")).toBeInTheDocument();
  });

  it("shows delete online account confirmation dialog on click", async () => {
    render(<Settings />);
    await user.click(screen.getByText("delete_online_account"));

    expect(screen.getByText("delete_online_account_warning")).toBeInTheDocument();
    expect(screen.getByText("delete_online_account_implications")).toBeInTheDocument();
  });

  it("calls deleteOnlineAccount on confirm", async () => {
    render(<Settings />);
    await user.click(screen.getByText("delete_online_account"));

    await user.click(screen.getByTestId("confirm-delete-online-account-button"));
    expect(mockDeleteOnlineAccount).toHaveBeenCalled();
  });

  it("shows loading state while deleting in the confirmation dialog", async () => {
    // Make deleteOnlineAccount return a promise that doesn't resolve immediately
    // so we can observe the loading state
    let resolvePromise!: () => void;
    mockDeleteOnlineAccount.mockImplementation(
      () => new Promise<void>((resolve) => { resolvePromise = resolve; }),
    );

    render(<Settings />);
    await user.click(screen.getByText("delete_online_account"));

    await user.click(screen.getByTestId("confirm-delete-online-account-button"));

    // Loading state should appear after clicking confirm (async state update)
    await waitFor(() => {
      expect(screen.getByText("delete_online_account_loading")).toBeInTheDocument();
    });

    // Confirm button should be disabled during deletion
    expect(screen.getByTestId("confirm-delete-online-account-button")).toBeDisabled();

    // Resolve the deletion
    resolvePromise();
    await waitFor(() => {
      expect(screen.queryByText("delete_online_account_loading")).not.toBeInTheDocument();
    });
  });

  it("shows error toast when deleteOnlineAccount rejects", async () => {
    mockDeleteOnlineAccount.mockRejectedValue(new Error("Server error"));

    render(<Settings />);
    await user.click(screen.getByText("delete_online_account"));

    await user.click(screen.getByTestId("confirm-delete-online-account-button"));

    await waitFor(() => {
      expect(mockToast).toHaveBeenCalledWith({
        title: "error",
        description: "delete_online_account_failed",
        variant: "destructive",
      });
    });
  });

  it("hides delete online account button when not logged in", () => {
    vi.mocked(useAccount).mockReturnValue({
      logout: mockLogout,
      isAuthenticated: false,
      setIsAuthenticated: vi.fn(),
      isLoggedIn: false,
      setIsLoggedIn: vi.fn(),
      resetOnboarding: vi.fn(),
    } as AccountContextType);

    render(<Settings />);
    expect(screen.queryByText("delete_online_account")).not.toBeInTheDocument();
  });

  it("navigates to legal pages", async () => {
    render(<Settings />);
    await user.click(screen.getByText("imprint"));
    expect(mockNavigate).toHaveBeenCalledWith("/impressum", {
      state: { from: "/settings" },
    });

    await user.click(screen.getByText("privacy"));
    expect(mockNavigate).toHaveBeenCalledWith("/datenschutz", {
      state: { from: "/settings" },
    });

    await user.click(screen.getByText("about"));
    expect(mockNavigate).toHaveBeenCalledWith("/about", {
      state: { from: "/settings" },
    });
  });
});
