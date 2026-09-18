/**
 * @vitest-environment jsdom
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup, waitFor, within } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { MemoryRouter } from "react-router-dom";
import {
  createTransaction,
  createCategory,
  createAccount,
  createMockTranslation,
  createMockData,
  mockComponents,
  setupTestDate,
  cleanupTestDate,
  resetMockData,
} from "../test-helpers";

// Mock react-i18next
vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: createMockTranslation(),
    i18n: {
      language: "en",
    },
  }),
  I18nextProvider: ({ children }: { children: React.ReactNode }) => children,
  initReactI18next: { type: "3rdParty", init: () => {} },
}));

// Mock useBudget hook data
const mockData = createMockData();

// Mock BudgetContext
vi.mock("@/contexts/BudgetContext", () => ({
  BudgetContext: { Provider: ({ children }: { children: React.ReactNode }) => children },
  useBudget: () => ({
    get transactions() {
      return mockData.transactions;
    },
    get categories() {
      return mockData.categories;
    },
    get currentAccount() {
      return mockData.currentAccount;
    },
    get accounts() {
      return mockData.accounts;
    },
    get recurringItems() {
      return mockData.recurringItems;
    },
    // Layout component requirements
    switchAccount: vi.fn(),
    isLoading: false,
    isOfflineMode: false,
    setIsOfflineMode: vi.fn(),
    missedNotifications: [],
    dismissMissedNotifications: vi.fn(),
  }),
}));

// Mock AccountContext (required by Layout)
vi.mock("@/contexts/AccountContext", () => ({
  AccountContext: { Provider: ({ children }: { children: React.ReactNode }) => children },
  useAccount: () => ({
    logout: vi.fn(),
    isAuthenticated: true,
    setIsAuthenticated: vi.fn(),
    resetOnboarding: vi.fn(),
  }),
}));

vi.mock('@/contexts/PendingInvitesContext', () => ({
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

// Mock TransactionForm component
vi.mock("@/components/TransactionForm", () => ({
  default: mockComponents.TransactionForm,
}));

// Mock TransactionItem component
vi.mock("@/components/TransactionItem", () => ({
  default: mockComponents.TransactionItem,
}));

// Mock PendingTransactionItem component
vi.mock("@/components/PendingTransactionItem", () => ({
  default: mockComponents.PendingTransactionItem,
}));

// Mock CategoryAvatar component
vi.mock("@/components/CategoryAvatar", () => ({
  CategoryAvatar: mockComponents.CategoryAvatar,
}));

// Mock ConnectivityStatus component
vi.mock("@/components/ConnectivityStatus", () => ({
  default: mockComponents.ConnectivityStatus,
}));

// Mock DatePickerDialog component
vi.mock("@/components/DatePickerDialog", () => ({
  DatePickerDialog: mockComponents.DatePickerDialog,
}));

// Mock Figma SVGs
vi.mock("@/components/ui/figma-svgs", () => ({
  DashboardBackground: mockComponents.DashboardBackground,
  IncomeIcon: mockComponents.IncomeIcon,
  ExpenseIcon: mockComponents.ExpenseIcon,
}));

// Import Index after mocking
import Index from "./Index";
import { renderWithMockedProviders } from "@/test-utils/render";
import userEvent from "@testing-library/user-event";

// Wrapper component with providers
const TestWrapper = ({ children }: { children: React.ReactNode }) => (
  <MemoryRouter
    future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
  >
    {children}
  </MemoryRouter>
);

describe("Index Page (Dashboard)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetMockData(mockData);
    setupTestDate();
  });

  afterEach(() => {
    cleanup();
    cleanupTestDate();
  });

  describe("Summary Section (Meine Bilanz)", () => {
    it("displays summary card with correct title", () => {
      renderWithMockedProviders(<Index />);

      expect(
        screen.getByRole("heading", { name: "sum" }),
      ).toBeInTheDocument();
    });

    it("displays income in green color with correct formatting", () => {
      const incomeTransaction = createTransaction({
        id: "income-1",
        type: "income",
        amount: 300,
        title: "Salary",
        category: "income-salary",
      });
      const incomeCategory = createCategory({
        id: "income-salary",
        name: "category_salary",
        type: "income",
      });

      mockData.transactions = [incomeTransaction];
      mockData.categories = [incomeCategory];

      renderWithMockedProviders(<Index />);

      const incomeElement = screen.getByText("Einnahmen").nextElementSibling;
      expect(incomeElement).toHaveClass("text-budget-green");
      expect(incomeElement).toHaveTextContent("300,00 €");
    });

    it("displays expenses in red color with correct formatting", () => {
      const expenseTransaction = createTransaction({
        id: "expense-1",
        type: "expense",
        amount: 19.99,
        title: "Netflix",
      });
      const expenseCategory = createCategory();

      mockData.transactions = [expenseTransaction];
      mockData.categories = [expenseCategory];

      renderWithMockedProviders(<Index />);

      const expenseElement = screen.getByText("Ausgaben").nextElementSibling;
      expect(expenseElement).toHaveClass("text-budget-red");
      expect(expenseElement).toHaveTextContent("-19,99 €");
    });

    it("calculates and displays balance correctly", () => {
      const incomeTransaction = createTransaction({
        id: "income-1",
        type: "income",
        amount: 300,
        title: "Salary",
        category: "income-salary",
      });
      const expenseTransaction = createTransaction({
        id: "expense-1",
        type: "expense",
        amount: 19.99,
        title: "Netflix",
      });
      const incomeCategory = createCategory({
        id: "income-salary",
        name: "category_salary",
        type: "income",
      });
      const expenseCategory = createCategory();

      mockData.transactions = [incomeTransaction, expenseTransaction];
      mockData.categories = [incomeCategory, expenseCategory];

      renderWithMockedProviders(<Index />);

      const balanceElement = screen.getByTestId("total-balance");
      expect(balanceElement).toHaveTextContent("280,01 €");
      expect(balanceElement).toHaveStyle("color: #1DB155"); // Positive balance
    });

    it("displays negative balance in red", () => {
      const expenseTransaction = createTransaction({
        id: "expense-1",
        type: "expense",
        amount: 200,
        title: "Rent",
      });
      const expenseCategory = createCategory();

      mockData.transactions = [expenseTransaction];
      mockData.categories = [expenseCategory];

      renderWithMockedProviders(<Index />);

      const balanceElement = screen.getByTestId("total-balance");
      expect(balanceElement).toHaveTextContent("-200,00 €");
      expect(balanceElement).toHaveStyle("color: #E33B80"); // Negative balance
    });

    it("displays budget limit calculated from all account transactions", () => {
      // Setup date to 2025-01-15 (see setupTestDate in beforeEach)
      const incomeCategory = createCategory({ type: "income" });
      const expenseCategory = createCategory({ type: "expense" });

      mockData.categories = [incomeCategory, expenseCategory];
      mockData.transactions = [
        // Confirmed transactions
        createTransaction({
          type: "income",
          amount: 1000,
          date: "2025-01-10",
          category: incomeCategory.id,
        }),
        createTransaction({
          type: "expense",
          amount: 300,
          date: "2025-01-12",
          category: expenseCategory.id,
        }),
        // Pending (future, same month) transactions should be included in cumulative budget
        createTransaction({
          type: "income",
          amount: 500,
          date: "2025-01-20",
          category: incomeCategory.id,
        }),
        createTransaction({
          type: "expense",
          amount: 200,
          date: "2025-01-25",
          category: expenseCategory.id,
        }),
      ];

      renderWithMockedProviders(<Index />);

      // My Budget includes pending transactions:
      // (1000 - 300) confirmed + (500 - 200) pending = 1000
      const budgetElement = screen.getByText("Mein Budget").nextElementSibling;
      expect(budgetElement).toHaveTextContent(/1\.000,00/);
    });
  });

  describe("Budget - selected-month scope", () => {
    it("calculates carry over from executed transactions before the selected month", () => {
      mockData.transactions = [
        createTransaction({ id: "previous-income", type: "income", amount: 1000, date: "2024-12-20" }),
        createTransaction({ id: "current-expense", type: "expense", amount: 300, date: "2025-01-10" }),
      ];

      renderWithMockedProviders(<Index />);

      expect(screen.getByText("carry_over").nextElementSibling).toHaveTextContent("1.000,00");
      expect(screen.getByTestId("total-balance")).toHaveTextContent("-300,00");
    });

    it("does not include pending transactions from a different month in My Budget", () => {
      // Setup date to 2025-01-15 (see setupTestDate in beforeEach)
      const incomeCategory = createCategory({ type: "income" });
      const expenseCategory = createCategory({ type: "expense" });

      mockData.categories = [incomeCategory, expenseCategory];
      mockData.transactions = [
        // Confirmed transaction in the selected month
        createTransaction({
          type: "income",
          amount: 1000,
          date: "2025-01-10",
          category: incomeCategory.id,
        }),
        // Pending expense two months out is outside the selected month.
        createTransaction({
          type: "expense",
          amount: 400,
          date: "2025-03-05",
          category: expenseCategory.id,
        }),
      ];

      renderWithMockedProviders(<Index />);

      // January contains only the confirmed income, so the budget is 1000.
      const budgetElement = screen.getByText("Mein Budget").nextElementSibling;
      expect(budgetElement).toHaveTextContent(/1\.000,00/);
    });
  });

  describe("Action Buttons Section", () => {
    it("displays add income button with correct styling", () => {
      renderWithMockedProviders(<Index />);

      expect(screen.getByText("Einnahme")).toBeInTheDocument();
      expect(screen.getByTestId("surface-icon")).toBeInTheDocument();
    });

    it("displays add expense button with correct styling", () => {
      renderWithMockedProviders(<Index />);

      expect(screen.getByText("Ausgabe")).toBeInTheDocument();
      expect(screen.getByTestId("minus-icon")).toBeInTheDocument();
    });

    it("displays background image with correct styling", () => {
      renderWithMockedProviders(<Index />);

      const backgroundElement = screen.getByTestId("background-image");
      expect(backgroundElement).toHaveClass(
        "absolute",
        "inset-0",
        "w-full",
        "h-full",
        "pointer-events-none",
      );
    });

    it("opens income drawer when add income button is clicked", () => {
      renderWithMockedProviders(<Index />);

      const incomeButton = screen.getByText("Einnahme").closest("div");
      fireEvent.click(incomeButton!);

      expect(screen.getByTestId("transaction-form")).toBeInTheDocument();
      expect(screen.getByText("Transaction Form: income")).toBeInTheDocument();
    });

    it("opens expense drawer when add expense button is clicked", () => {
      renderWithMockedProviders(<Index />);

      const expenseButton = screen.getByText("Ausgabe").closest("div");
      fireEvent.click(expenseButton!);

      expect(screen.getByTestId("transaction-form")).toBeInTheDocument();
      expect(screen.getByText("Transaction Form: expense")).toBeInTheDocument();
    });

    it("has proper container styling matching other components", () => {
      renderWithMockedProviders(<Index />);

      // Check that the action buttons container has the same styling as other cards
      const actionContainer =
        screen.getByTestId("background-image").parentElement;
      expect(actionContainer).toHaveClass("rounded-lg");
      expect(actionContainer).toHaveStyle({
        borderRadius: "6px",
        boxShadow: "1px 1px 7px rgba(73.03, 95.55, 143, 0.12)",
      });
    });
  });

  describe("Accessibility", () => {
    it("maintains proper heading hierarchy", () => {
      renderWithMockedProviders(<Index />);

      // Main headings should be present
      expect(
        screen.getByRole("heading", { name: "sum" }),
      ).toBeInTheDocument();
    });
  });
});
