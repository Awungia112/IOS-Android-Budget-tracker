import React from "react";
import {
  render,
  screen,
  fireEvent,
  waitFor,
  within,
} from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { BrowserRouter, MemoryRouter } from "react-router-dom";
import Layout from "@/components/Layout";
import { BudgetProvider } from "@/contexts/BudgetContext";
import { AccountProvider } from "@/contexts/AccountContext";

// Mock the hooks
const mockNavigate = vi.fn();
const mockLogout = vi.fn().mockResolvedValue(undefined);
const mockSwitchAccount = vi.fn();
const mockExportAccountData = vi.fn();
const mockImportAccountData = vi.fn();

let mockAccountReturn = {
  logout: mockLogout,
  isLoggedIn: false,
};

let mockBudgetReturn = {
  currentAccount: {
    id: "1",
    name: "Test Account",
    initials: "TA",
    profileImage: null,
  },
  accounts: [{ id: "1", name: "Test Account", initials: "TA" }],
  transactions: [],
  switchAccount: mockSwitchAccount,
  addAccount: vi.fn().mockResolvedValue(null),
  getAccountBalances: vi.fn().mockResolvedValue({ "1": 100 }),
  isLoading: false,
  isOfflineMode: false,
  setIsOfflineMode: vi.fn(),
  goOffline: vi.fn(),
  goOnline: vi.fn(),
  requestGoOnline: vi.fn(),
  requestRestoreOnlineAccounts: vi.fn(),
  exportAccountData: mockExportAccountData,
  importAccountData: mockImportAccountData,
  missedNotifications: [],
  dismissMissedNotifications: vi.fn(),
};

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual("react-router-dom");
  return {
    ...actual,
    useNavigate: () => mockNavigate,
    useLocation: () => ({ pathname: "/" }),
  };
});

vi.mock("@/contexts/AccountContext", () => ({
  AccountProvider: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  useAccount: () => mockAccountReturn,
}));

vi.mock("@/contexts/BudgetContext", () => ({
  BudgetProvider: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  useBudget: () => mockBudgetReturn,
}));

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
}));vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => {
      const translations: Record<string, string> = {
        overview: "Overview",
        income_categories: "Income Categories",
        expense_categories: "Expense Categories",
        templates: "Templates",
        settings: "Settings",
        limits: "Limits",
        offline_mode: "Offline Mode",
        online_mode: "Online Mode",
        onboarding_register: "Register",
        onboarding_login: "Sign in",
        account_functions: "Account Functions",
        enable_online_mode: "Enable online mode",
        disable_online_mode: "Disable online mode",
        online_features_prompt_title: "What are online features?",
        online_features_prompt_body: "With the Mein Budget online features, you have the following options:",
        online_features_prompt_feature_sync: "Log in and synchronize across multiple devices",
        online_features_prompt_feature_sharing: "Invite and manage co-users",
        online_features_prompt_account_required: "To do this, you need a Mein Budget account. Would you like to create one?",
        online_features_prompt_register: "Yes, register",
        online_features_prompt_confirm: "Okay, I understand",
        online_features_prompt_cancel: "Cancel",
        online_features_prompt_dont_show_again: "Do not show again",
        go_offline_confirm_title: "Switch to Offline Mode?",
        go_offline_confirm_body: "You're about to switch to offline mode. While offline, syncing across devices and sharing with co-users will be paused until you switch back online.",
        go_offline_confirm_data_note: "All your data remains safely stored on this device.",
        go_offline_confirm_cancel: "Stay Online",
        go_offline_confirm_proceed: "Switch to Offline",
        dark_mode: "Dark Mode",
        light_mode: "Light Mode",
        logout: "Logout",
        about_us: "About Us",
        imprint: "Imprint",
        privacy: "Privacy Policy",
        savings_goals: "Savings Goals",
        statistics: "Statistics",
        recurring_items: "Recurring Items",
        export_data: "Export Data",
        export_data_description: "Export your transactions, categories, and settings to a file.",
        import_data: "Import Data",
        import_data_description: "Import previously exported data from another device.",
        switch_account: "Switch Account",
        switch_account_title: "Select an account to switch to",
        profile_actions: "Profile Actions",
        edit_profile: "Edit Profile",
        current_account: "Current",
        account: "Account",
        balance: "Balance",
        new_account: "New Account",
        back: "Back",
        cancel: "Cancel",
        select: "Select",
        general_overview: "General Overview",
        overview_sum: "Sum",
        creating: "Creating...",
        account_name_placeholder: "Enter account name",
        create: "Create",
      };
      // eslint-disable-next-line security/detect-object-injection -- key is validated enum value/safe access pattern
      return translations[key] || key;
    },
    i18n: { language: "en" },
  }),
}));

// Mock window.matchMedia
Object.defineProperty(window, "matchMedia", {
  writable: true,
  value: vi.fn().mockImplementation((query) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(), // deprecated
    removeListener: vi.fn(), // deprecated
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
});

// Mock window.open
const mockOpen = vi.fn();
window.open = mockOpen;

const renderLayout = () => {
    return render(
        <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
            <Layout>
                <div>Test Content</div>
            </Layout>
        </MemoryRouter>
    );
};

describe("Layout Component - Sidebar Menu", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    mockAccountReturn = {
      logout: mockLogout,
      isLoggedIn: false,
    };
    mockBudgetReturn = {
      currentAccount: {
        id: "1",
        name: "Test Account",
        initials: "TA",
        profileImage: null,
      },
      accounts: [{ id: "1", name: "Test Account", initials: "TA" }],
      transactions: [],
      switchAccount: mockSwitchAccount,
      addAccount: vi.fn().mockResolvedValue(null),
      getAccountBalances: vi.fn().mockResolvedValue({ "1": 100 }),
      isLoading: false,
      isOfflineMode: false,
      setIsOfflineMode: vi.fn(),
      goOffline: vi.fn(),
      goOnline: vi.fn(),
      requestGoOnline: vi.fn(),
      requestRestoreOnlineAccounts: vi.fn(),
      exportAccountData: mockExportAccountData,
      importAccountData: mockImportAccountData,
      missedNotifications: [],
      dismissMissedNotifications: vi.fn(),
    };
    localStorage.clear();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("initially does not show the sidebar", () => {
    renderLayout();
    // Sidebar overlay should be hidden (opacity-0)
    const overlay = document.querySelector(".sidebar-overlay");
    expect(overlay).toHaveClass("opacity-0");
    expect(overlay).toHaveClass("pointer-events-none");
  });

  it("opens sidebar when hamburger menu is clicked", () => {
    renderLayout();
    const hamburgerBtn = screen.getByTestId("sidebar-menu-button");
    expect(hamburgerBtn).not.toBeNull();
    fireEvent.click(hamburgerBtn!);

    // Sidebar should be visible
    const overlay = document.querySelector(".sidebar-overlay");
    expect(overlay).toHaveClass("opacity-100");
    expect(overlay).not.toHaveClass("pointer-events-none");

    // Check for sidebar content
    const sidebar = document.querySelector(".sidebar-container") as HTMLElement;
    expect(within(sidebar).getByText("Overview")).toBeInTheDocument();
  });

  it("closes sidebar when X button is clicked", () => {
    renderLayout();
    // Open sidebar first
    const hamburgerBtn = screen.getByTestId("sidebar-menu-button");
    expect(hamburgerBtn).not.toBeNull();
    fireEvent.click(hamburgerBtn!);

    // Click X button using aria-label
    const xButton = screen.getByLabelText("Close sidebar");
    expect(xButton).not.toBeNull();
    fireEvent.click(xButton);

    const overlay = document.querySelector(".sidebar-overlay");
    expect(overlay).toHaveClass("opacity-0");
  });

  it("opens the legacy-style account carousel from the header avatar", async () => {
    mockBudgetReturn = {
      ...mockBudgetReturn,
      accounts: [
        { id: "1", name: "Test Account", initials: "TA" },
        { id: "2", name: "Savings Account", initials: "SA" },
      ],
      currentAccount: { id: "1", name: "Test Account", initials: "TA", profileImage: null },
      transactions: [
        { id: "t1", accountId: "1", title: "Income", amount: 100, type: "income", date: "2025-01-10", category: "cat-1" },
        { id: "t2", accountId: "2", title: "Expense", amount: 20, type: "expense", date: "2025-01-10", category: "cat-2" },
      ],
    };

    renderLayout();
    fireEvent.click(screen.getByRole("button", { name: /Test Account/i }));

    expect(screen.getByTestId("account-switcher")).toBeInTheDocument();
    expect(screen.getAllByText("Savings Account").length).toBeGreaterThan(0);
    expect(screen.getByText("General Overview")).toBeInTheDocument();
    expect(screen.getByTestId("select-account-2")).toBeInTheDocument();
    expect(screen.getByTestId("create-new-account")).toBeInTheDocument();
  });

  it("switches account in a single step from the account carousel", async () => {
    mockBudgetReturn = {
      ...mockBudgetReturn,
      accounts: [
        { id: "1", name: "Test Account", initials: "TA" },
        { id: "2", name: "Savings Account", initials: "SA" },
      ],
      currentAccount: { id: "1", name: "Test Account", initials: "TA", profileImage: null },
      transactions: [],
    };

    renderLayout();
    fireEvent.click(screen.getByRole("button", { name: /Test Account/i }));
    fireEvent.click(screen.getByTestId("select-account-2"));

    expect(mockSwitchAccount).toHaveBeenCalledWith("2");
  });

  it("renders all menu items with correct text", () => {
    renderLayout();
    const hamburgerBtn = screen.getByTestId("sidebar-menu-button");
    expect(hamburgerBtn).not.toBeNull();
    fireEvent.click(hamburgerBtn!);

    const sidebar = document.querySelector(".sidebar-container") as HTMLElement;

    expect(within(sidebar).getByText("Overview")).toBeInTheDocument();
    expect(within(sidebar).getByText("Income Categories")).toBeInTheDocument();
    expect(within(sidebar).getByText("Expense Categories")).toBeInTheDocument();
    expect(within(sidebar).getByText("Templates")).toBeInTheDocument();
    expect(within(sidebar).getByText("Recurring Items")).toBeInTheDocument();
    expect(within(sidebar).getByText("Settings")).toBeInTheDocument();
    expect(within(sidebar).getByText("Limits")).toBeInTheDocument();
  });

  it("shows the account button in the sidebar and navigates to /account", () => {
    renderLayout();
    fireEvent.click(screen.getByTestId("sidebar-menu-button"));

    const accountButton = screen.getByTestId("sidebar-account-button");
    expect(accountButton).toHaveTextContent("Account Functions");
    expect(accountButton).toHaveClass("h-[54px]");

    fireEvent.click(accountButton);

    expect(mockNavigate).toHaveBeenCalledWith("/account");
  });

  it("shows the account button even when logged in", () => {
    mockAccountReturn = { ...mockAccountReturn, isLoggedIn: true };
    renderLayout();
    fireEvent.click(screen.getByTestId("sidebar-menu-button"));

    expect(screen.getByTestId("sidebar-account-button")).toBeInTheDocument();
  });

  it("renders menu items with correct styling", () => {
    renderLayout();
    const hamburgerBtn = screen.getByTestId("sidebar-menu-button");
    expect(hamburgerBtn).not.toBeNull();
    fireEvent.click(hamburgerBtn!);

    const sidebar = document.querySelector(".sidebar-container") as HTMLElement;
    const overviewLink = within(sidebar).getByText("Overview").closest("a");

    expect(overviewLink).not.toBeNull();
    expect(overviewLink).toHaveClass("rounded-[7px]");
    expect(overviewLink).toHaveClass("h-[54px]");
  });

  it("does NOT render Savings Goals or Statistics in sidebar (intentionally removed)", () => {
    renderLayout();
    const hamburgerBtn = screen.getByTestId("sidebar-menu-button");
    expect(hamburgerBtn).not.toBeNull();
    fireEvent.click(hamburgerBtn!);

    const sidebar = document.querySelector(".sidebar-container") as HTMLElement;

    // These items were intentionally removed from sidebar navigation
    expect(
      within(sidebar).queryByText("Savings Goals"),
    ).not.toBeInTheDocument();
    expect(within(sidebar).queryByText("Statistics")).not.toBeInTheDocument();
  });

  it("renders chevron icons in menu items", () => {
    renderLayout();
    const hamburgerBtn = screen.getByTestId("sidebar-menu-button");
    expect(hamburgerBtn).not.toBeNull();
    fireEvent.click(hamburgerBtn!);

    const sidebar = document.querySelector(".sidebar-container") as HTMLElement;
    // ChevronRight icons render as mocked icon divs in tests
    const iconDivs = sidebar.querySelectorAll('[data-testid^="icon-"]');
    expect(iconDivs.length).toBeGreaterThan(0);
  });

    it('online mode switch is always interactive regardless of login status', () => {
        mockBudgetReturn = {
          ...mockBudgetReturn,
          isOfflineMode: true,
        };

        renderLayout();
        const hamburgerBtn = screen.getByTestId('sidebar-menu-button');
        expect(hamburgerBtn).not.toBeNull();
        fireEvent.click(hamburgerBtn!);

        const onlineSwitch = screen.getByRole('button', { name: 'Enable online mode' });
        expect(onlineSwitch).toBeInTheDocument();

        // The switch is always interactive — no aria-disabled
        expect(onlineSwitch).toHaveAttribute('tabIndex', '0');
    });

    it('shows the first-time online features prompt when toggling online if not opted out', () => {
      mockAccountReturn = {
        ...mockAccountReturn,
        isLoggedIn: false,
      };
      mockBudgetReturn = {
        ...mockBudgetReturn,
        isOfflineMode: true,
      };

      renderLayout();
      const hamburgerBtn = screen.getByTestId('sidebar-menu-button');
      expect(hamburgerBtn).not.toBeNull();
      fireEvent.click(hamburgerBtn!);

      const toggleButton = screen.getByRole('button', { name: 'Enable online mode' });
      expect(toggleButton).toBeInTheDocument();
      fireEvent.click(toggleButton);

      expect(screen.getByRole('heading', { name: 'What are online features?' })).toBeInTheDocument();
      // Non-logged-in users should not see the opt-out checkbox
      expect(screen.queryByText('Do not show again')).not.toBeInTheDocument();
    });

    it('skips the prompt and turns online mode on when the user opted-out of the prompt and has a session token', () => {
      mockAccountReturn = {
        ...mockAccountReturn,
        isLoggedIn: true,
      };
      mockBudgetReturn = {
        ...mockBudgetReturn,
        isOfflineMode: true,
      };
      localStorage.setItem('session_token', 'test-token');
      localStorage.setItem('online_prompt_opt_out', 'true');

      renderLayout();
      const hamburgerBtn = screen.getByTestId('sidebar-menu-button');
      expect(hamburgerBtn).not.toBeNull();
      fireEvent.click(hamburgerBtn!);

      const toggleButton = screen.getByRole('button', { name: 'Enable online mode' });
      fireEvent.click(toggleButton);

      expect(mockBudgetReturn.goOnline).toHaveBeenCalled();
      expect(screen.queryByText('What are online features?')).not.toBeInTheDocument();
    });

    it('shows the online features prompt for logged-in user when toggling online for the first time', () => {
      mockAccountReturn = {
        ...mockAccountReturn,
        isLoggedIn: true,
      };
      mockBudgetReturn = {
        ...mockBudgetReturn,
        isOfflineMode: true,
      };
      localStorage.setItem('session_token', 'test-token');

      renderLayout();
      const hamburgerBtn = screen.getByTestId('sidebar-menu-button');
      expect(hamburgerBtn).not.toBeNull();
      fireEvent.click(hamburgerBtn!);

      const toggleButton = screen.getByRole('button', { name: 'Enable online mode' });
      fireEvent.click(toggleButton);

      // Prompt should appear for logged-in user who hasn't opted out
      expect(screen.getByRole('heading', { name: 'What are online features?' })).toBeInTheDocument();
      expect(screen.getByText('Do not show again')).toBeInTheDocument();
    });

  it('shows the online features prompt for unregistered user when toggling online', () => {
      // No session token, not logged in
      mockAccountReturn = {
        ...mockAccountReturn,
        isLoggedIn: false,
      };
      mockBudgetReturn = {
        ...mockBudgetReturn,
        isOfflineMode: true,
      };
      // Ensure no session token
      localStorage.removeItem('session_token');

      renderLayout();
      const hamburgerBtn = screen.getByTestId('sidebar-menu-button');
      expect(hamburgerBtn).not.toBeNull();
      fireEvent.click(hamburgerBtn!);

      const toggleButton = screen.getByRole('button', { name: 'Enable online mode' });
      expect(toggleButton).toBeInTheDocument();
      fireEvent.click(toggleButton);

      // Prompt should appear for unregistered user
      expect(screen.getByRole('heading', { name: 'What are online features?' })).toBeInTheDocument();
      // Non-logged-in users should not see the opt-out checkbox
      expect(screen.queryByText('Do not show again')).not.toBeInTheDocument();
    });

    it('navigates to /register for unregistered opted-out user when toggling online', () => {
      mockAccountReturn = {
        ...mockAccountReturn,
        isLoggedIn: false,
      };
      mockBudgetReturn = {
        ...mockBudgetReturn,
        isOfflineMode: true,
      };
      // No session token but opted out of prompt
      localStorage.removeItem('session_token');
      localStorage.setItem('online_prompt_opt_out', 'true');

      renderLayout();
      const hamburgerBtn = screen.getByTestId('sidebar-menu-button');
      expect(hamburgerBtn).not.toBeNull();
      fireEvent.click(hamburgerBtn!);

      const toggleButton = screen.getByRole('button', { name: 'Enable online mode' });
      fireEvent.click(toggleButton);

      // Should navigate directly to register, no prompt
      expect(mockNavigate).toHaveBeenCalledWith('/register');
      expect(screen.queryByText('What are online features?')).not.toBeInTheDocument();
    });

    it('shows confirmation dialog when toggling offline while online', () => {
      mockAccountReturn = {
        ...mockAccountReturn,
        isLoggedIn: true,
      };
      mockBudgetReturn = {
        ...mockBudgetReturn,
        isOfflineMode: false, // currently online
      };
      localStorage.setItem('session_token', 'test-token');

      renderLayout();
      const hamburgerBtn = screen.getByTestId('sidebar-menu-button');
      expect(hamburgerBtn).not.toBeNull();
      fireEvent.click(hamburgerBtn!);

      const toggleButton = screen.getByRole('button', { name: 'Disable online mode' });
      fireEvent.click(toggleButton);

      // Confirmation dialog should appear
      expect(screen.getByRole('heading', { name: 'Switch to Offline Mode?' })).toBeInTheDocument();
      expect(screen.getByText(/All your data remains safely stored/)).toBeInTheDocument();
      expect(screen.getByText('Stay Online')).toBeInTheDocument();
      expect(screen.getByText('Switch to Offline')).toBeInTheDocument();
    });

    it('goes offline when confirming the offline dialog', () => {
      mockAccountReturn = {
        ...mockAccountReturn,
        isLoggedIn: true,
      };
      mockBudgetReturn = {
        ...mockBudgetReturn,
        isOfflineMode: false, // currently online
      };
      localStorage.setItem('session_token', 'test-token');

      renderLayout();
      const hamburgerBtn = screen.getByTestId('sidebar-menu-button');
      expect(hamburgerBtn).not.toBeNull();
      fireEvent.click(hamburgerBtn!);

      const toggleButton = screen.getByRole('button', { name: 'Disable online mode' });
      fireEvent.click(toggleButton);

      // Click "Switch to Offline"
      const confirmButton = screen.getByText('Switch to Offline');
      fireEvent.click(confirmButton);

      expect(mockBudgetReturn.goOffline).toHaveBeenCalled();
    });

    it('stays online when cancelling the offline dialog', () => {
      mockAccountReturn = {
        ...mockAccountReturn,
        isLoggedIn: true,
      };
      mockBudgetReturn = {
        ...mockBudgetReturn,
        isOfflineMode: false, // currently online
      };
      localStorage.setItem('session_token', 'test-token');

      renderLayout();
      const hamburgerBtn = screen.getByTestId('sidebar-menu-button');
      expect(hamburgerBtn).not.toBeNull();
      fireEvent.click(hamburgerBtn!);

      const toggleButton = screen.getByRole('button', { name: 'Disable online mode' });
      fireEvent.click(toggleButton);

      // Click "Stay Online"
      const cancelButton = screen.getByText('Stay Online');
      fireEvent.click(cancelButton);

      // goOffline should NOT have been called
      expect(mockBudgetReturn.goOffline).not.toHaveBeenCalled();
    });

  it("toggles dark mode switch", () => {
    renderLayout();
    const hamburgerBtn = screen.getByTestId("sidebar-menu-button");
    expect(hamburgerBtn).not.toBeNull();
    fireEvent.click(hamburgerBtn!);

    const darkModeSwitch = screen.getByLabelText("Toggle dark mode");
    expect(darkModeSwitch).toBeInTheDocument();

    fireEvent.click(darkModeSwitch);

    // Should verify localStorage update
    expect(localStorage.getItem("darkMode")).not.toBeNull();
  });

  it("renders Deutschland im Plus section correctly", () => {
    renderLayout();
    const hamburgerBtn = screen.getByTestId("sidebar-menu-button");
    expect(hamburgerBtn).not.toBeNull();
    fireEvent.click(hamburgerBtn!);

    expect(screen.getByText("Deutschland im Plus")).toBeInTheDocument();
    expect(screen.getByAltText("Deutschland Logo")).toHaveClass(
      "h-[39px] w-[39px]",
    );

    // Test link properties
    const link = screen.getByText("Deutschland im Plus").closest("a");
    expect(link).not.toBeNull();
    expect(link).toHaveAttribute("href", "https://www.deutschland-im-plus.de/");
    expect(link).toHaveAttribute("target", "_blank");
  });

  it("renders logout button and handles click", async () => {
    renderLayout();
    const hamburgerBtn = screen.getByTestId("sidebar-menu-button");
    expect(hamburgerBtn).not.toBeNull();
    fireEvent.click(hamburgerBtn!);

    const logoutBtn = screen.getByText("Logout").closest("button");
    expect(logoutBtn).not.toBeNull();
    // Use real timers for the async logout check to avoid timeout issues with fake timers
    vi.useRealTimers();

    fireEvent.click(logoutBtn!);

    // Wait for the logout call
    await waitFor(
      () => {
        expect(mockLogout).toHaveBeenCalled();
      },
      { timeout: 3000 },
    );
  });

  it("renders footer links correctly", () => {
    renderLayout();
    const hamburgerBtn = screen.getByTestId("sidebar-menu-button");
    expect(hamburgerBtn).not.toBeNull();
    fireEvent.click(hamburgerBtn!);

    const aboutLink = screen.getByText("About Us");
    expect(aboutLink.closest("a")).toHaveAttribute("href", "/about");

    const imprintLink = screen.getByText("Imprint");
    expect(imprintLink.closest("a")).toHaveAttribute("href", "/impressum");

    const privacyLink = screen.getByText("Privacy Policy");
    expect(privacyLink.closest("a")).toHaveAttribute("href", "/datenschutz");
  });

  it("renders About Us, Imprint, and Privacy as sidebar menu items", () => {
    renderLayout();
    const hamburgerBtn = screen.getByTestId("sidebar-menu-button");
    expect(hamburgerBtn).not.toBeNull();
    fireEvent.click(hamburgerBtn!);

    const aboutLink = screen.getByText("About Us").closest("a");
    expect(aboutLink).toHaveClass("justify-between");

    const imprintLink = screen.getByText("Imprint").closest("a");
    expect(imprintLink).toHaveClass("justify-between");

    const privacyLink = screen.getByText("Privacy Policy").closest("a");
    expect(privacyLink).toHaveClass("justify-between");
  });

  it("has correct horizontal padding", () => {
    renderLayout();
    const hamburgerBtn = screen.getByTestId("sidebar-menu-button");
    expect(hamburgerBtn).not.toBeNull();
    fireEvent.click(hamburgerBtn!);

    const sidebar = document.querySelector(".sidebar-container") as HTMLElement;
    // Find the container with px-[30px]
    const menuItemsContainer = within(sidebar)
      .getByText("Overview")
      .closest("div")?.parentElement;
    expect(menuItemsContainer).not.toBeNull();
    expect(menuItemsContainer).toHaveClass("px-[30px]");
  });

  it("renders Export Data and Import Data items in sidebar", () => {
    renderLayout();
    const hamburgerBtn = screen.getByTestId("sidebar-menu-button");
    fireEvent.click(hamburgerBtn!);

    const sidebar = document.querySelector(".sidebar-container") as HTMLElement;
    expect(within(sidebar).getByText("Export Data")).toBeInTheDocument();
    expect(within(sidebar).getByText("Import Data")).toBeInTheDocument();
  });

  it("shows export confirmation dialog and calls exportAccountData on confirm", () => {
    renderLayout();
    const hamburgerBtn = screen.getByTestId("sidebar-menu-button");
    fireEvent.click(hamburgerBtn!);

    const exportBtn = screen.getByTestId("sidebar-export-data");
    fireEvent.click(exportBtn);

    // Dialog should be visible
    expect(screen.getByText("Export your transactions, categories, and settings to a file.")).toBeInTheDocument();

    // Confirm export
    const confirmBtn = screen.getByTestId("confirm-export-button");
    fireEvent.click(confirmBtn);

    expect(mockExportAccountData).toHaveBeenCalled();
  });

  it("shows import confirmation dialog when Import Data is clicked", () => {
    renderLayout();
    const hamburgerBtn = screen.getByTestId("sidebar-menu-button");
    fireEvent.click(hamburgerBtn!);

    const importBtn = screen.getByTestId("sidebar-import-data");
    fireEvent.click(importBtn);

    // Dialog should be visible
    expect(screen.getByText("Import previously exported data from another device.")).toBeInTheDocument();
    expect(screen.getByTestId("confirm-import-button")).toBeInTheDocument();
  });

  it("can cancel export dialog without triggering export", () => {
    renderLayout();
    const hamburgerBtn = screen.getByTestId("sidebar-menu-button");
    fireEvent.click(hamburgerBtn!);

    const exportBtn = screen.getByTestId("sidebar-export-data");
    fireEvent.click(exportBtn);

    // Cancel
    const cancelBtn = screen.getByText("Cancel");
    fireEvent.click(cancelBtn);

    expect(mockExportAccountData).not.toHaveBeenCalled();
  });
});
