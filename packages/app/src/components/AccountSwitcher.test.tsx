import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import AccountSwitcher from "@/components/AccountSwitcher";

const mockSwitchAccount = vi.fn();
const mockAddAccount = vi.fn().mockResolvedValue(null);
const mockGetAccountBalances = vi
  .fn()
  .mockResolvedValue({ "1": 100, "2": -20 });

const mockBudgetReturn = {
  currentAccount: { id: "1", name: "Test Account", initials: "TA", profileImage: null },
  accounts: [
    { id: "1", name: "Test Account", initials: "TA" },
    { id: "2", name: "Savings Account", initials: "SA" },
  ],
  switchAccount: mockSwitchAccount,
  addAccount: mockAddAccount,
  getAccountBalances: mockGetAccountBalances,
};

vi.mock("@/contexts/BudgetContext", () => ({
  useBudget: () => mockBudgetReturn,
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => {
      const translations: Record<string, string> = {
        switch_account: "Switch Account",
        select: "Select",
        current_account: "Current",
        settings: "Settings",
        new_account: "New Account",
        create: "Create",
        cancel: "Cancel",
        general_overview: "General Overview",
        overview_sum: "Sum",
        creating: "Creating...",
        account_name_placeholder: "Enter account name",
        no_accounts: "No accounts yet",
        create_first_account: "Create your first account",
      };
      // eslint-disable-next-line security/detect-object-injection -- key is validated enum value/safe access pattern
      return translations[key] || key;
    },
    i18n: { language: "en" },
  }),
}));

const renderSwitcher = (open = true) =>
  render(
    <AccountSwitcher open={open} onOpenChange={vi.fn()} onEditAccount={vi.fn()} />,
  );

describe("AccountSwitcher", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders nothing when closed", () => {
    renderSwitcher(false);
    expect(screen.queryByTestId("account-switcher")).not.toBeInTheDocument();
  });

  it("shows an empty state and the add-account card when there are no accounts", () => {
    const originalAccounts = mockBudgetReturn.accounts;
    mockBudgetReturn.accounts = [];
    renderSwitcher();
    expect(screen.getByText("No accounts yet")).toBeInTheDocument();
    expect(screen.getByText("Create your first account")).toBeInTheDocument();
    expect(screen.getByTestId("create-new-account")).toBeInTheDocument();
    mockBudgetReturn.accounts = originalAccounts;
  });

  it("renders account cards and the balance summary", () => {
    renderSwitcher();
    expect(screen.getByTestId("account-switcher")).toBeInTheDocument();
    expect(screen.getAllByText("Savings Account").length).toBeGreaterThan(0);
    expect(screen.getByText("General Overview")).toBeInTheDocument();
    expect(screen.getByTestId("select-account-2")).toBeInTheDocument();
    expect(screen.getByTestId("create-new-account")).toBeInTheDocument();
  });

  it("switches account in a single step", () => {
    const onOpenChange = vi.fn();
    render(
      <AccountSwitcher open onOpenChange={onOpenChange} onEditAccount={vi.fn()} />,
    );
    fireEvent.click(screen.getByTestId("select-account-2"));
    expect(mockSwitchAccount).toHaveBeenCalledWith("2");
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("creates a new account from the carousel", async () => {
    renderSwitcher();
    fireEvent.click(screen.getByTestId("create-new-account"));
    fireEvent.change(screen.getByTestId("new-account-name-input"), {
      target: { value: "New Savings" },
    });
    fireEvent.click(screen.getByTestId("confirm-create-account"));
    expect(mockAddAccount).toHaveBeenCalledWith("New Savings");
  });

  it("calls onEditAccount when tapping settings on an account", () => {
    const onEditAccount = vi.fn();
    render(
      <AccountSwitcher open onOpenChange={vi.fn()} onEditAccount={onEditAccount} />,
    );
    fireEvent.click(screen.getByTestId("settings-account-2"));
    expect(onEditAccount).toHaveBeenCalledWith(
      expect.objectContaining({ id: "2" }),
    );
  });

  it("scrolls the carousel to the current account on open", () => {
    const scrollIntoView = vi.fn();
    HTMLElement.prototype.scrollIntoView = scrollIntoView;
    renderSwitcher();
    expect(scrollIntoView).toHaveBeenCalled();
  });

  it("closes when clicking outside the cards (on the overlay)", () => {
    const onOpenChange = vi.fn();
    render(
      <AccountSwitcher open onOpenChange={onOpenChange} onEditAccount={vi.fn()} />,
    );
    fireEvent.click(screen.getByTestId("account-switcher"));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("does not close when clicking on an account card", () => {
    const onOpenChange = vi.fn();
    render(
      <AccountSwitcher open onOpenChange={onOpenChange} onEditAccount={vi.fn()} />,
    );
    fireEvent.click(screen.getByTestId("account-card-1"));
    expect(onOpenChange).not.toHaveBeenCalled();
  });
});
