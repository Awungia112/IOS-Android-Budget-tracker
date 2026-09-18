import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import MembersList from "@/components/MembersList";

const mockRemoveMember = vi.fn().mockResolvedValue(undefined);
const mockSetMemberToRemove = vi.fn();
const mockInviteMember = vi.fn().mockResolvedValue(null);

let mockHookReturn = {
  members: [
    { userId: "u1", displayEmail: "owner@example.com", role: "owner", joinedAt: "", publicKey: "k1" },
    { userId: "u2", displayEmail: "member@example.com", role: "member", joinedAt: "", publicKey: "k2" },
  ],
  loading: false,
  currentUserId: "u1",
  isOwner: true,
  memberToRemove: null,
  setMemberToRemove: mockSetMemberToRemove,
  removeMember: mockRemoveMember,
  removing: false,
  inviteMember: mockInviteMember,
  inviting: false,
};

vi.mock("@/hooks/useAccountMembers", () => ({
  useAccountMembers: () => mockHookReturn,
  getMemberInitials: (email: string | null) => (email ? "XX" : "?"),
}));

vi.mock("@/contexts/BudgetContext", () => ({
  useBudget: () => ({
    currentAccount: { id: "1", name: "Test Account", initials: "TA" },
    accounts: [{ id: "1", name: "Test Account", initials: "TA" }],
  }),
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => {
      const translations: Record<string, string> = {
        current_members: "Current Members",
        you: "You",
        anonymous_user: "Anonymous",
        owner: "Owner",
        member: "Member",
        remove_member: "Remove Member",
        remove_member_warning: "Removing them will revoke their access.",
        cancel: "Cancel",
      };
      // eslint-disable-next-line security/detect-object-injection -- key is validated enum value/safe access pattern
      return translations[key] || key;
    },
    i18n: { language: "en" },
  }),
}));

describe("MembersList", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders members with their emails", () => {
    render(<MembersList accountId="1" />);
    // The owner (current user) is shown by account name; other members by email.
    expect(screen.getByText("Test Account")).toBeInTheDocument();
    expect(screen.getByText("member@example.com")).toBeInTheDocument();
    expect(screen.getByText("Current Members")).toBeInTheDocument();
  });

  it("shows a remove button for non-owner members to the owner", () => {
    render(<MembersList accountId="1" />);
    expect(screen.getByTestId("remove-member-u2")).toBeInTheDocument();
  });

  it("does not show a remove button for the owner themselves", () => {
    render(<MembersList accountId="1" />);
    expect(screen.queryByTestId("remove-member-u1")).not.toBeInTheDocument();
  });

  it("confirms and removes a member", () => {
    mockHookReturn = {
      ...mockHookReturn,
      memberToRemove: {
        userId: "u2",
        displayEmail: "member@example.com",
        role: "member",
        joinedAt: "",
        publicKey: "k2",
      },
    };
    render(<MembersList accountId="1" />);
    fireEvent.click(screen.getByTestId("confirm-remove-member-button"));
    expect(mockRemoveMember).toHaveBeenCalled();
  });

  it("invites a co-user from the member list", () => {
    render(<MembersList accountId="1" />);
    fireEvent.click(screen.getByTestId("invite-member-button"));
    fireEvent.change(screen.getByTestId("invite-email-input"), {
      target: { value: "new@example.com" },
    });
    fireEvent.click(screen.getByTestId("send-invite-button"));
    expect(mockInviteMember).toHaveBeenCalledWith(
      "new@example.com",
      expect.any(String),
    );
  });

  it("routes through the online-features prompt when inviting offline", () => {
    const onGoOnline = vi.fn();
    render(
      <MembersList accountId="1" isOfflineMode onGoOnline={onGoOnline} />,
    );
    fireEvent.click(screen.getByTestId("invite-member-button"));
    expect(onGoOnline).toHaveBeenCalled();
    // The inline form should not appear while offline.
    expect(screen.queryByTestId("invite-email-input")).not.toBeInTheDocument();
  });
});
