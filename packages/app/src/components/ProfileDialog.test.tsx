import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import ProfileDialog from "@/components/ProfileDialog";

const mockUpdateAccount = vi.fn().mockResolvedValue(undefined);
const mockDeleteAccount = vi.fn().mockResolvedValue(undefined);

let mockBudgetReturn = {
  currentAccount: { id: "1", name: "Test Account", initials: "TA", profileImage: null },
  updateAccount: mockUpdateAccount,
  deleteAccount: mockDeleteAccount,
  isOfflineMode: true,
};

vi.mock("@/contexts/BudgetContext", () => ({
  useBudget: () => mockBudgetReturn,
}));

vi.mock("@/contexts/AccountContext", () => ({
  useAccount: () => ({ isLoggedIn: false, logout: vi.fn() }),
}));

vi.mock("@/components/MembersList", () => ({
  default: () => <div data-testid="members-list" />,
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => {
      const translations: Record<string, string> = {
        edit_profile: "Edit Profile",
        email: "Email",
        online_mode: "Online Mode",
        delete_account: "Delete Account",
        delete_account_warning: "Are you sure you want to delete this account?",
        cancel: "Cancel",
        save_changes: "Save Changes",
        name: "Name",
        your_name: "Your name",
      };
      // eslint-disable-next-line security/detect-object-injection -- key is validated enum value/safe access pattern
      return translations[key] || key;
    },
    i18n: { language: "en" },
  }),
}));

const renderDialog = (props: Partial<React.ComponentProps<typeof ProfileDialog>> = {}) =>
  render(
    <ProfileDialog
      open
      onOpenChange={vi.fn()}
      onGoOnline={vi.fn()}
      {...props}
    />,
  );

describe("ProfileDialog", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  it("does not show email when the account is offline", () => {
    localStorage.setItem("userEmail", "test@example.com");
    mockBudgetReturn = { ...mockBudgetReturn, isOfflineMode: true };
    renderDialog();
    expect(screen.queryByText("test@example.com")).not.toBeInTheDocument();
  });

  it("shows email when the account is online", () => {
    localStorage.setItem("userEmail", "test@example.com");
    mockBudgetReturn = { ...mockBudgetReturn, isOfflineMode: false };
    renderDialog();
    expect(screen.getByText("test@example.com")).toBeInTheDocument();
  });

  it("triggers go online when toggling the online switch while offline", () => {
    mockBudgetReturn = { ...mockBudgetReturn, isOfflineMode: true };
    const onGoOnline = vi.fn();
    renderDialog({ onGoOnline });
    fireEvent.click(screen.getByTestId("profile-online-switch"));
    expect(onGoOnline).toHaveBeenCalled();
  });

  it("triggers go offline when toggling the online switch off while online", () => {
    mockBudgetReturn = { ...mockBudgetReturn, isOfflineMode: false };
    const onGoOffline = vi.fn();
    renderDialog({ onGoOffline });
    fireEvent.click(screen.getByTestId("profile-online-switch"));
    expect(onGoOffline).toHaveBeenCalled();
  });

  it("deletes the account from the edit profile", () => {
    renderDialog();
    fireEvent.click(screen.getByTestId("delete-account-button"));
    fireEvent.click(screen.getByTestId("confirm-delete-account-button"));
    expect(mockDeleteAccount).toHaveBeenCalledWith("1");
  });
});
