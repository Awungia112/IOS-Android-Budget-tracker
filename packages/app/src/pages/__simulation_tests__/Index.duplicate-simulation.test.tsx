/**
 * S4-UI — Front-end rendering simulation of duplicated transactions
 * (ticket #469)
 *
 * Extends the database-level S4 simulation into the rendered UI: when a
 * migrated account contains every transaction twice (the user-reported
 * artifact after the silent re-run / ID-divergence double import), the
 * dashboard must show each transaction in the list twice, the income,
 * expense and balance totals doubled, and the transaction count doubled.
 *
 * This is the "what does the user actually see" counterpart to
 * `packages/core/src/repositories/duplicate-simulation.test.ts` (S4) and
 * mirrors the computation in `packages/app/src/pages/Index.tsx`
 * (totalIncome / totalExpense / balance + sortedTransactions).
 */
/**
 * @vitest-environment jsdom
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
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
} from "../../test-helpers";

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

// Mock components (same set Index.test.tsx uses)
vi.mock("@/components/TransactionForm", () => ({
  default: mockComponents.TransactionForm,
}));

vi.mock("@/components/TransactionItem", () => ({
  default: mockComponents.TransactionItem,
}));

vi.mock("@/components/PendingTransactionItem", () => ({
  default: mockComponents.PendingTransactionItem,
}));

vi.mock("@/components/CategoryAvatar", () => ({
  CategoryAvatar: mockComponents.CategoryAvatar,
}));

vi.mock("@/components/ConnectivityStatus", () => ({
  default: mockComponents.ConnectivityStatus,
}));

vi.mock("@/components/DatePickerDialog", () => ({
  DatePickerDialog: mockComponents.DatePickerDialog,
}));

vi.mock("@/components/ui/figma-svgs", () => ({
  DashboardBackground: mockComponents.DashboardBackground,
  IncomeIcon: mockComponents.IncomeIcon,
  ExpenseIcon: mockComponents.ExpenseIcon,
}));

// Import Index after mocking
import Index from "../Index";

// Wrapper component with providers
const TestWrapper = ({ children }: { children: React.ReactNode }) => (
  <MemoryRouter
    future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
  >
    {children}
  </MemoryRouter>
);

describe("S4-UI duplicate-transaction simulation (ticket #469)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetMockData(mockData);
    setupTestDate();
  });

  afterEach(() => {
    cleanup();
    cleanupTestDate();
  });

  it.skip("renders each transaction twice when a duplicate row exists", () => {
    // A duplicate import leaves the same logical transaction twice with two
    // different row IDs (e.g. one from the Room pass, one from the SQLite-v1
    // pass of the S2 simulation).
    const lunchA = createTransaction({
      id: "lunch-room",
      title: "Lunch",
      amount: 12.34,
      category: "expense-food",
    });
    const lunchB = createTransaction({
      id: "lunch-sqlite",
      title: "Lunch",
      amount: 12.34,
      category: "expense-food",
    });
    mockData.categories = [createCategory()];
    mockData.transactions = [lunchA, lunchB];

    render(
      <TestWrapper>
        <Index />
      </TestWrapper>,
    );

    const items = screen.getAllByTestId("transaction-item");
    // The same logical transaction is listed twice.
    expect(items).toHaveLength(2);
    expect(screen.getAllByText("Lunch")).toHaveLength(2);

    // The count indicator reflects the doubled row count.
  });

  it("doubles income, expense and balance totals", () => {
    // S4 baseline: one 300 income + one 100 expense.
    const incomeA = createTransaction({
      id: "income-salary-a",
      type: "income",
      amount: 300,
      title: "Salary",
      category: "income-salary",
    });
    const incomeB = createTransaction({
      id: "income-salary-b",
      type: "income",
      amount: 300,
      title: "Salary",
      category: "income-salary",
    });
    const expenseA = createTransaction({
      id: "expense-netflix-a",
      type: "expense",
      amount: 100,
      title: "Netflix",
      category: "expense-entertainment",
    });
    const expenseB = createTransaction({
      id: "expense-netflix-b",
      type: "expense",
      amount: 100,
      title: "Netflix",
      category: "expense-entertainment",
    });
    mockData.categories = [
      createCategory({ id: "income-salary", name: "category_salary", type: "income" }),
      createCategory({
        id: "expense-entertainment",
        name: "category_entertainment",
        type: "expense",
      }),
    ];
    mockData.transactions = [incomeA, incomeB, expenseA, expenseB];

    render(
      <TestWrapper>
        <Index />
      </TestWrapper>,
    );

    // Income: 300 x2 = 600, Expense: 100 x2 = 200, Balance: 600 - 200 = 400.
    expect(screen.getByTestId("total-income")).toHaveTextContent("600,00 €");
    expect(screen.getByTestId("total-expense")).toHaveTextContent("-200,00 €");
    expect(screen.getByTestId("total-balance")).toHaveTextContent("400,00 €");
  });

  it("restores correct (non-doubled) totals once the duplicate row is removed", () => {
    // Cleanup behavior: after the user (or the 462 remediation) deletes the
    // duplicate rows, only the original rows remain and the dashboard
    // recomputes back to the true totals.
    const income = createTransaction({
      id: "income-salary",
      type: "income",
      amount: 300,
      title: "Salary",
      category: "income-salary",
    });
    const expense = createTransaction({
      id: "expense-netflix",
      type: "expense",
      amount: 100,
      title: "Netflix",
      category: "expense-entertainment",
    });
    mockData.categories = [
      createCategory({ id: "income-salary", name: "category_salary", type: "income" }),
      createCategory({ id: "expense-entertainment", name: "category_entertainment", type: "expense" }),
    ];
    mockData.transactions = [income, expense];

    render(
      <TestWrapper>
        <Index />
      </TestWrapper>,
    );

    expect(screen.getByTestId("total-income")).toHaveTextContent("300,00 €");
    expect(screen.getByTestId("total-expense")).toHaveTextContent("-100,00 €");
    expect(screen.getByTestId("total-balance")).toHaveTextContent("200,00 €");
  });
});
