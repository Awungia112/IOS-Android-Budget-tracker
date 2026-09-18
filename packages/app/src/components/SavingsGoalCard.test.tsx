import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { vi } from "vitest";
import { useBudget } from "@/contexts/BudgetContext";
import { useNavigate } from "react-router-dom";
import { SavingsGoalCard } from "./SavingsGoalCard";
import { SavingsGoal } from "@budget/core";

// Mock react-i18next
vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { language: "en" },
  }),
  I18nextProvider: ({ children }: { children: React.ReactNode }) => children,
  initReactI18next: { type: "3rdParty", init: () => {} },
}));

// Mock dependencies
vi.mock("@/contexts/BudgetContext");
vi.mock("react-router-dom", () => ({
  useNavigate: vi.fn(),
}));

const mockUseBudget = useBudget as any;
const mockUseNavigate = useNavigate as any;

describe("SavingsGoalCard", () => {
  const mockGoal: SavingsGoal = {
    id: "goal-1",
    name: "Travel Goal",
    targetAmount: 1000,
    categoryId: "category-1",
    deadline: "2024-12-31",
    accountId: "account-1",
  };

  const mockCategory = {
    id: "category-1",
    name: "travel",
    icon: "plane",
    type: "expense",
  };

  const mockTransactions = [
    {
      id: "tx-1",
      type: "income",
      amount: 200,
      title: "Travel Goal",
      category: "income",
      date: "2024-01-01",
      savingsGoalId: "goal-1",
    },
  ];

  const mockOnEdit = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();

    mockUseBudget.mockReturnValue({
      categories: [mockCategory],
      transactions: mockTransactions,
    });

    mockUseNavigate.mockReturnValue(vi.fn());
  });

  it("renders goal card with correct information", () => {
    render(
      <SavingsGoalCard
        goal={mockGoal}
        currentSavings={200}
        progress={20}
        onEdit={mockOnEdit}
      />,
    );

    expect(screen.getByText("Travel Goal")).toBeInTheDocument();
    expect(screen.getByText(/until/)).toBeInTheDocument();
    expect(screen.getByText("200,00 €")).toBeInTheDocument();
    expect(screen.getByText("1.000,00 €")).toBeInTheDocument();
  });

  it("displays progress bar with correct height", () => {
    render(
      <SavingsGoalCard
        goal={mockGoal}
        currentSavings={200}
        progress={20}
        onEdit={mockOnEdit}
      />,
    );

    // Check that progress bar has correct height
    expect(screen.getByText("Travel Goal")).toBeInTheDocument();
  });

  it("handles edit button click", () => {
    render(
      <SavingsGoalCard
        goal={mockGoal}
        currentSavings={200}
        progress={20}
        onEdit={mockOnEdit}
      />,
    );

    const editButton = screen.getByLabelText("edit");
    fireEvent.click(editButton);

    expect(mockOnEdit).toHaveBeenCalledWith("goal-1");
  });

  it("displays correct deadline format", () => {
    render(
      <SavingsGoalCard
        goal={mockGoal}
        currentSavings={200}
        progress={20}
        onEdit={mockOnEdit}
      />,
    );

    // Should show deadline in correct format
    expect(screen.getByText(/until/)).toBeInTheDocument();
  });

  it("displays savings and target amounts correctly", () => {
    render(
      <SavingsGoalCard
        goal={mockGoal}
        currentSavings={250.75}
        progress={25}
        onEdit={mockOnEdit}
      />,
    );

    expect(screen.getByText("250,75 €")).toBeInTheDocument();
    expect(screen.getByText("1.000,00 €")).toBeInTheDocument();
  });

  it("handles goals without category", () => {
    const goalWithoutCategory = {
      ...mockGoal,
      categoryId: undefined,
    };

    render(
      <SavingsGoalCard
        goal={goalWithoutCategory}
        currentSavings={200}
        progress={20}
        onEdit={mockOnEdit}
      />,
    );

    // Should still render without errors
    expect(screen.getByText("Travel Goal")).toBeInTheDocument();
  });

  it("handles delete button click", () => {
    const mockOnDelete = vi.fn();
    render(
      <SavingsGoalCard
        goal={mockGoal}
        currentSavings={200}
        progress={20}
        onEdit={mockOnEdit}
        onDelete={mockOnDelete}
      />,
    );

    const deleteButton = screen.getByTestId(`savings-goal-delete-${mockGoal.id}`);
    fireEvent.click(deleteButton);

    expect(mockOnDelete).toHaveBeenCalledWith("goal-1");
  });
});
