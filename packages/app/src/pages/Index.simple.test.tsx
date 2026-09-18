/**
 * @vitest-environment jsdom
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { MemoryRouter } from "react-router-dom";
import type { Transaction, Category, Account } from "@budget/core";

// Mock react-i18next
vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => key, // Return the key as-is for testing
    i18n: { language: "en" },
  }),
  I18nextProvider: ({ children }: { children: React.ReactNode }) => children,
  initReactI18next: { type: "3rdParty", init: () => {} },
}));

// Mock data factories
const createTransaction = (
  overrides: Partial<Transaction> = {},
): Transaction => ({
  id: `transaction-${Date.now()}-${Math.random()}`, // nosemgrep: nodejs_scan.javascript-crypto-rule-node_insecure_random_generator -- test fixture ID, no security context
  accountId: "account-1",
  title: "Test Transaction",
  amount: 100,
  category: "expense-food",
  type: "expense",
  date: new Date().toISOString(),
  ...overrides,
});

const createCategory = (overrides: Partial<Category> = {}): Category => ({
  id: "expense-food",
  accountId: "account-1",
  name: "category_food",
  type: "expense",
  color: "#E33B80",
  isDefault: false,
  ...overrides,
});

const createAccount = (overrides: Partial<Account> = {}): Account => ({
  id: "account-1",
  name: "Test Account",
  initials: "TA",
  ...overrides,
});

// Mock useBudget hook data
const mockData = {
  transactions: [] as Transaction[],
  categories: [] as Category[],
  currentAccount: createAccount(),
  accounts: [createAccount()],
  recurringItems: [] as any[],
};

// Mock BudgetContext
vi.mock("@/contexts/BudgetContext", () => ({
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
  default: ({ type, onSave, onCancel }: any) => (
    <div data-testid="transaction-form">
      <span>Transaction Form: {type}</span>
      <button onClick={onSave}>Save</button>
      <button onClick={onCancel}>Cancel</button>
    </div>
  ),
}));

// Mock TransactionItem component
vi.mock("@/components/TransactionItem", () => ({
  default: ({ transaction }: any) => (
    <div data-testid="transaction-item">
      <span>{transaction.title}</span>
      <span>{transaction.amount}</span>
    </div>
  ),
}));

// Mock CategoryAvatar component
vi.mock("@/components/CategoryAvatar", () => ({
  CategoryAvatar: ({ category }: any) => (
    <div data-testid="category-avatar">{category?.name || "Unknown"}</div>
  ),
}));

// Mock ConnectivityStatus component
vi.mock("@/components/ConnectivityStatus", () => ({
  default: () => <div data-testid="connectivity-status">Online</div>,
}));

// Mock DatePickerDialog component
vi.mock("@/components/DatePickerDialog", () => ({
  DatePickerDialog: ({ open, onOpenChange }: any) =>
    open ? (
      <div data-testid="date-picker-dialog">
        <button onClick={() => onOpenChange(false)}>Close</button>
      </div>
    ) : null,
}));

// Mock Figma SVGs
vi.mock("@/components/ui/figma-svgs", () => ({
  DashboardBackground: ({ className }: any) => (
    <svg data-testid="background-image" className={className}>
      <path d="M0 0 L100 100" stroke="white" />
    </svg>
  ),
  IncomeIcon: ({ width, height }: any) => (
    <svg data-testid="surface-icon" width={width} height={height}>
      <circle cx="30" cy="30" r="25" fill="#3FCB72" />
    </svg>
  ),
  ExpenseIcon: ({ width, height }: any) => (
    <svg data-testid="minus-icon" width={width} height={height}>
      <circle cx="30" cy="30" r="25" fill="#E33B80" />
    </svg>
  ),
}));

// Import Index after mocking
import Index from "./Index";

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
    mockData.transactions = [];
    mockData.categories = [];
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  describe("Summary Section", () => {
    it("renders summary card", () => {
      render(
        <TestWrapper>
          <Index />
        </TestWrapper>,
      );

      expect(screen.getByTestId("balance-header")).toBeInTheDocument();
    });

    it("displays income with correct styling", () => {
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

      render(
        <TestWrapper>
          <Index />
        </TestWrapper>,
      );

      const incomeElement = screen.getByText("income").nextElementSibling;
      expect(incomeElement).toHaveClass("text-budget-green");
      expect(incomeElement).toHaveTextContent("300,00 €");
    });

    it("displays expenses with correct styling", () => {
      const expenseTransaction = createTransaction({
        id: "expense-1",
        type: "expense",
        amount: 19.99,
        title: "Netflix",
      });
      const expenseCategory = createCategory();

      mockData.transactions = [expenseTransaction];
      mockData.categories = [expenseCategory];

      render(
        <TestWrapper>
          <Index />
        </TestWrapper>,
      );

      const expenseElement = screen.getByText("expenses").nextElementSibling;
      expect(expenseElement).toHaveClass("text-budget-red");
      expect(expenseElement).toHaveTextContent("-19,99 €");
    });

    it("calculates balance correctly", () => {
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

      render(
        <TestWrapper>
          <Index />
        </TestWrapper>,
      );

      const balanceElement = screen.getByTestId("total-balance");
      expect(balanceElement).toHaveTextContent("280,01 €");
      expect(balanceElement).toHaveStyle("color: #1DB155");
    });

    it("displays budget limit", () => {
      render(
        <TestWrapper>
          <Index />
        </TestWrapper>,
      );

      const budgetElement = screen.getByText("my_budget").nextElementSibling;
      // Budget shows 0 when there are no transactions
      expect(budgetElement).toHaveTextContent("0,00 €");
    });
  });

  describe("Action Buttons Section", () => {
    it("renders action buttons", () => {
      render(
        <TestWrapper>
          <Index />
        </TestWrapper>,
      );

      expect(screen.getByText("add_income")).toBeInTheDocument();
      expect(screen.getByText("add_expense")).toBeInTheDocument();
      expect(screen.getByTestId("surface-icon")).toBeInTheDocument();
      expect(screen.getByTestId("minus-icon")).toBeInTheDocument();
    });

    it("renders background image", () => {
      render(
        <TestWrapper>
          <Index />
        </TestWrapper>,
      );

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
      render(
        <TestWrapper>
          <Index />
        </TestWrapper>,
      );

      const incomeButton = screen.getByText("add_income").closest("div");
      fireEvent.click(incomeButton!);

      expect(screen.getByTestId("transaction-form")).toBeInTheDocument();
      expect(screen.getByText("Transaction Form: income")).toBeInTheDocument();
    });

    it("opens expense drawer when add expense button is clicked", () => {
      render(
        <TestWrapper>
          <Index />
        </TestWrapper>,
      );

      const expenseButton = screen.getByText("add_expense").closest("div");
      fireEvent.click(expenseButton!);

      expect(screen.getByTestId("transaction-form")).toBeInTheDocument();
      expect(screen.getByText("Transaction Form: expense")).toBeInTheDocument();
    });
  });

  describe("Layout and Styling", () => {
    it("has proper container styling", () => {
      render(
        <TestWrapper>
          <Index />
        </TestWrapper>,
      );

      const actionContainer =
        screen.getByTestId("background-image").parentElement;
      expect(actionContainer).toHaveClass("rounded-lg");
      expect(actionContainer).toHaveStyle({
        borderRadius: "6px",
        boxShadow: "1px 1px 7px rgba(73.03, 95.55, 143, 0.12)",
      });
    });
  });
});
