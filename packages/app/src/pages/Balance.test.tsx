/**
 * @vitest-environment jsdom
 */

import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { MemoryRouter } from "react-router-dom";
import type { Transaction, Category } from "@budget/core";
import { groupTransactionsByMonth } from "./Balance";

// Mock react-i18next
vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, fallback?: string) => {
      const translations: Record<string, string> = {
        bilanz: "Balance",
        filter_transactions: "Filter Transactions",
        no_transactions_found: "No transactions found.",
        future_transactions_header: "Upcoming transactions",
        reset_filters: "Reset Filters",
        save: "Save",
        monthly_sum: "Sum {{month}} {{year}}",
        income: "Income",
        expenses: "Expenses",
        new_income: "New Income",
        new_expense: "New Expense",
        edit_income: "Edit Income",
        edit_expense: "Edit Expense",
        no_time_period: "No Time Period",
        last_30_days: "Last 30 Days",
        last_90_days: "Last 90 Days",
        last_180_days: "Last 180 Days",
        custom_period: "Custom",
        all_categories: "All Categories",
        all_income: "All Income",
        all_expenses: "All Expenses",
        amount_from: "Amount from",
        amount_to: "Amount to",
        time_period: "Time Period",
        income_categories: "Income Categories",
        expense_categories: "Expense Categories",
        category_food: "Food",
        category_salary: "Salary",
        month_january: "January",
        month_february: "February",
        month_march: "March",
        loading: "Loading...",
        overview: "Overview",
      };
      // eslint-disable-next-line security/detect-object-injection -- test mock
      return translations[key] || fallback || key;
    },
    i18n: { language: "en" },
  }),
  I18nextProvider: ({ children }: { children: React.ReactNode }) => children,
  initReactI18next: { type: "3rdParty", init: () => {} },
}));

// Mutable mock data
const mockData = {
  transactions: [] as Transaction[],
  categories: [] as Category[],
};

// Mock BudgetContext
vi.mock("@/contexts/BudgetContext", () => ({
  useBudget: () => ({
    get transactions() { return mockData.transactions; },
    get categories() { return mockData.categories; },
    accounts: [{ id: "account-1", name: "Test" }],
    currentAccount: { id: "account-1", name: "Test" },
    switchAccount: vi.fn(),
    addTransaction: vi.fn(),
    updateTransaction: vi.fn(),
    deleteTransaction: vi.fn(),
    isLoading: false,
    isOfflineMode: false,
    setIsOfflineMode: vi.fn(),
    exportAccountData: vi.fn(),
    importAccountData: vi.fn(),
    missedNotifications: [],
    dismissMissedNotifications: vi.fn(),
  }),
}));

// Mock AccountContext
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

// Mock category-icons
vi.mock("@/lib/category-icons", () => ({
  getIconPath: () => undefined,
}));

// Mock categoryHelpers
vi.mock("@/lib/categoryHelpers", () => ({
  translateCategoryLabel: (_t: unknown, key: string) => key,
  getCategoryColor: () => "#8B5CF6",
  normalizeCategoryKey: (name: string) => name,
}));

// Mock formatters
vi.mock("@/lib/formatters", () => ({
  formatCurrency: (amount: number) => `${amount.toFixed(2)} €`,
  formatDate: (date: string) => date,
  getMonthName: (month: number) => {
    const names = ["January", "February", "March", "April", "May", "June",
      "July", "August", "September", "October", "November", "December"];
    // eslint-disable-next-line security/detect-object-injection -- test mock with bounded index
    return names[month] || "Unknown";
  },
}));

// Mock DatePickerDialog
vi.mock("@/components/DatePickerDialog", () => ({
  DatePickerDialog: ({ onConfirm, onOpenChange, open }: any) => {
    if (!open) return null;
    return (
      <div data-testid="mock-datepicker">
        <button 
          data-testid="mock-datepicker-confirm-march-start" 
          onClick={() => { onConfirm(2026, 2, 1); onOpenChange(false); }}
        >
          Set March 1st
        </button>
        <button 
          data-testid="mock-datepicker-confirm-march-end" 
          onClick={() => { onConfirm(2026, 2, 31); onOpenChange(false); }}
        >
          Set March 31st
        </button>
      </div>
    );
  },
}));

// Mock TransactionForm
vi.mock("@/components/TransactionForm", () => ({
  default: () => <div data-testid="transaction-form">Transaction Form</div>,
}));

import Balance from "./Balance";

const createTx = (overrides: Partial<Transaction> = {}): Transaction => ({
  id: `tx-${Math.random()}`, // nosemgrep: nodejs_scan.javascript-crypto-rule-node_insecure_random_generator -- test fixture
  accountId: "account-1",
  title: "Test",
  amount: 100,
  category: "expense-food",
  type: "expense",
  date: "2026-03-15",
  ...overrides,
});

const TestWrapper = ({ children }: { children: React.ReactNode }) => (
  <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
    {children}
  </MemoryRouter>
);

describe("Balance Page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockData.transactions = [];
    mockData.categories = [];
  });

  afterEach(() => {
    cleanup();
  });

  describe("Page Rendering", () => {
    it("includes future persisted recurring instances in the three-month forecast window", () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2026-09-08T12:00:00"));
      mockData.transactions = [
        createTx({
          title: "October recurring expense",
          date: "2026-10-08",
          recurringItemId: "recurring-1",
        }),
      ];

      render(<TestWrapper><Balance /></TestWrapper>);

      fireEvent.click(screen.getByTestId("future-transactions-toggle"));
      expect(screen.getByText("October recurring expense")).toBeInTheDocument();
      vi.useRealTimers();
    });

    it("does not label a same-day recurring transaction as pending", () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2026-09-08T12:00:00"));
      mockData.transactions = [
        createTx({
          title: "Today recurring expense",
          date: "2026-09-08T00:00:00.000Z",
          recurringItemId: "recurring-today",
          isRecurring: true,
        }),
      ];

      render(<TestWrapper><Balance /></TestWrapper>);

      const transaction = screen.getByTestId("transaction-item");
      expect(transaction).not.toHaveTextContent("Recurring");
      expect(transaction).not.toHaveTextContent("Pending");
      vi.useRealTimers();
    });

    it("renders the page title", () => {
      render(<TestWrapper><Balance /></TestWrapper>);
      expect(screen.getByText("Balance")).toBeInTheDocument();
    });

    it("renders the filter button", () => {
      render(<TestWrapper><Balance /></TestWrapper>);
      expect(screen.getByTestId("bilanz-filter-button")).toBeInTheDocument();
    });

    it("shows empty state when no transactions", () => {
      render(<TestWrapper><Balance /></TestWrapper>);
      expect(screen.getByText("No transactions found.")).toBeInTheDocument();
    });

    it("renders past transactions grouped by month", () => {
      mockData.transactions = [
        createTx({ title: "Groceries", amount: 50, date: "2026-03-10" }),
        createTx({ title: "Salary", amount: 3000, type: "income", date: "2026-03-01" }),
      ];

      render(<TestWrapper><Balance /></TestWrapper>);
      expect(screen.getByText("Groceries")).toBeInTheDocument();
      expect(screen.getByText("Salary")).toBeInTheDocument();
    });
  });

  describe("Transaction Display", () => {
    it("shows green color for income and red for expense", () => {
      mockData.transactions = [
        createTx({ title: "Income Tx", amount: 500, type: "income", date: "2026-03-10" }),
        createTx({ title: "Expense Tx", amount: 100, type: "expense", date: "2026-03-10" }),
      ];

      render(<TestWrapper><Balance /></TestWrapper>);

      const incomeAmount = screen.getByText("500.00 €");
      expect(incomeAmount.className).toContain("text-budget-green");

      const expenseAmount = screen.getByText("-100.00 €");
      expect(expenseAmount.className).toContain("text-budget-red");
    });
  });

  describe("Future Transactions", () => {
    it("does not show future section when no future transactions", () => {
      mockData.transactions = [
        createTx({ date: "2026-03-10" }),
      ];

      render(<TestWrapper><Balance /></TestWrapper>);
      expect(screen.queryByTestId("future-transactions-toggle")).not.toBeInTheDocument();
    });

    it("shows future toggle when future transactions exist", () => {
      const futureDate = new Date();
      futureDate.setMonth(futureDate.getMonth() + 1);
      const futureDateStr = futureDate.toISOString().split("T")[0];

      mockData.transactions = [
        createTx({ title: "Future Payment", date: futureDateStr }),
      ];

      render(<TestWrapper><Balance /></TestWrapper>);
      expect(screen.getByTestId("future-transactions-toggle")).toBeInTheDocument();
    });

    it("expands future section on toggle click", () => {
      const futureDate = new Date();
      futureDate.setMonth(futureDate.getMonth() + 1);
      const futureDateStr = futureDate.toISOString().split("T")[0];

      mockData.transactions = [
        createTx({ title: "Future Payment", date: futureDateStr }),
      ];

      render(<TestWrapper><Balance /></TestWrapper>);
      fireEvent.click(screen.getByTestId("future-transactions-toggle"));
      expect(screen.getByText("Future Payment")).toBeInTheDocument();
    });

    it("does not split current month into past and future sections", () => {
      // Create transactions for the current month: some in the past, some in the future
      const today = new Date();
      const currentYear = today.getFullYear();
      const currentMonth = String(today.getMonth() + 1).padStart(2, "0");
      
      mockData.transactions = [
        createTx({ title: "Past Transaction", date: `${currentYear}-${currentMonth}-05` }),
        createTx({ title: "Future Transaction", date: `${currentYear}-${currentMonth}-25` }),
      ];

      render(<TestWrapper><Balance /></TestWrapper>);
      
      // Both transactions should be visible immediately (without expanding future section)
      // because the current month is always displayed in the main section
      expect(screen.getByText("Past Transaction")).toBeInTheDocument();
      expect(screen.getByText("Future Transaction")).toBeInTheDocument();
      
    });

    it("displays current month transactions by default without needing to expand", () => {
      const today = new Date();
      const currentYear = today.getFullYear();
      const currentMonth = String(today.getMonth() + 1).padStart(2, "0");
      
      mockData.transactions = [
        createTx({ title: "Current Month Transaction", date: `${currentYear}-${currentMonth}-15` }),
      ];

      render(<TestWrapper><Balance /></TestWrapper>);
      
      // Transaction should be visible immediately
      expect(screen.getByText("Current Month Transaction")).toBeInTheDocument();
      
      // Should not show "no transactions found"
      expect(screen.queryByText("No transactions found.")).not.toBeInTheDocument();
    });

    it("does not show duplicate transactions when recurring item creates actual transaction", () => {
      const today = new Date();
      const todayStr = today.toISOString().split("T")[0];
      
      // Simulate a recurring item and its auto-created transaction
      mockData.transactions = [
        createTx({ 
          title: "Monthly Rent", 
          amount: 1000, 
          category: "expense-housing",
          type: "expense",
          date: todayStr 
        }),
      ];

      render(<TestWrapper><Balance /></TestWrapper>);
      
      // Should only show one "Monthly Rent" transaction, not two
      const rentTransactions = screen.getAllByText("Monthly Rent");
      expect(rentTransactions).toHaveLength(1);
    });
  });

  describe("Filter Drawer", () => {
    it("opens filter drawer when filter button clicked", () => {
      render(<TestWrapper><Balance /></TestWrapper>);
      fireEvent.click(screen.getByTestId("bilanz-filter-button"));
      expect(screen.getByText("Reset Filters")).toBeInTheDocument();
    });
  });

  describe("Filtering Logic", () => {
    it("filters transactions by custom date range and excludes future transactions", () => {
      // Mock today as 2026-04-20
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2026-04-20"));

      mockData.transactions = [
        createTx({ title: "March Tx", date: "2026-03-15" }),
        createTx({ title: "April Tx", date: "2026-04-10" }),
        createTx({ title: "Future Tx", date: "2026-04-25" }),
      ];

      render(<TestWrapper><Balance /></TestWrapper>);

      // Initially March and April should be visible (April is current month)
      // Future is hidden in collapsible section (but exists in DOM if expanded)
      expect(screen.getByText("March Tx")).toBeInTheDocument();
      expect(screen.getByText("April Tx")).toBeInTheDocument();

      // Open filter
      fireEvent.click(screen.getByTestId("bilanz-filter-button"));

      // Open Time Period dropdown
      fireEvent.click(screen.getByText("No Time Period"));

      // Select Custom
      fireEvent.click(screen.getByText("Custom"));

      // Find the dateFrom button (defaults to 30 days ago: 2026-03-21)
      fireEvent.click(screen.getByText("2026-03-21")); 
      
      // The Mock DatePickerDialog should appear. Click "Set March 1st"
      fireEvent.click(screen.getByTestId("mock-datepicker-confirm-march-start"));

      // Find the dateTo button (defaults to three months after today: 2026-07-20)
      fireEvent.click(screen.getByText("2026-07-20"));
      
      // Click "Set March 31st"
      fireEvent.click(screen.getByTestId("mock-datepicker-confirm-march-end"));

      // Click "Save" in the filter drawer
      fireEvent.click(screen.getByText("Save"));

      // After filtering for March:
      // March Tx should be visible
      // April Tx should NOT be visible
      // Future Tx should NOT be visible
      expect(screen.getByText("March Tx")).toBeInTheDocument();
      expect(screen.queryByText("April Tx")).not.toBeInTheDocument();
      expect(screen.queryByText("Future Tx")).not.toBeInTheDocument();

      vi.useRealTimers();
    });

    it("hides 'No transactions found' when only future transactions are present", () => {
      // Mock today as 2026-04-20
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2026-04-20"));

      // Only future transactions (June 2026 relative to April 2026)
      mockData.transactions = [
        createTx({ title: "Future Tx", date: "2026-06-15" }),
      ];

      render(<TestWrapper><Balance /></TestWrapper>);

      // Should show the "Upcoming transactions" header
      expect(screen.getByText("Upcoming transactions")).toBeInTheDocument();
      
      // Should NOT show "No transactions found."
      expect(screen.queryByText("No transactions found.")).not.toBeInTheDocument();

      vi.useRealTimers();
    });
  });
});

describe("groupTransactionsByMonth", () => {
  it("returns empty array for empty input", () => {
    expect(groupTransactionsByMonth([])).toEqual([]);
  });

  it("groups transactions by YYYY-MM key", () => {
    const txs: Transaction[] = [
      createTx({ date: "2026-03-15" }),
      createTx({ date: "2026-03-20" }),
      createTx({ date: "2026-02-10" }),
    ];

    const groups = groupTransactionsByMonth(txs);
    expect(groups).toHaveLength(2);
    expect(groups[0].key).toBe("2026-03");
    expect(groups[1].key).toBe("2026-02");
  });

  it("sorts groups in reverse chronological order", () => {
    const txs: Transaction[] = [
      createTx({ date: "2026-01-15" }),
      createTx({ date: "2026-03-15" }),
      createTx({ date: "2026-02-15" }),
    ];

    const groups = groupTransactionsByMonth(txs);
    expect(groups.map((g) => g.key)).toEqual(["2026-03", "2026-02", "2026-01"]);
  });

  it("calculates income, expenses, and net per group", () => {
    const txs: Transaction[] = [
      createTx({ amount: 3000, type: "income", date: "2026-03-01" }),
      createTx({ amount: 500, type: "expense", date: "2026-03-10" }),
      createTx({ amount: 200, type: "expense", date: "2026-03-15" }),
    ];

    const groups = groupTransactionsByMonth(txs);
    expect(groups[0].income).toBe(3000);
    expect(groups[0].expenses).toBe(700);
    expect(groups[0].net).toBe(2300);
  });

  it("sorts transactions within a group by date descending", () => {
    const txs: Transaction[] = [
      createTx({ title: "First", date: "2026-03-01" }),
      createTx({ title: "Last", date: "2026-03-20" }),
      createTx({ title: "Middle", date: "2026-03-10" }),
    ];

    const groups = groupTransactionsByMonth(txs);
    const titles = groups[0].transactions.map((tx) => tx.title);
    expect(titles).toEqual(["Last", "Middle", "First"]);
  });

  it("sorts same-day transactions by createdAt descending so newest entries appear on top", () => {
    const txs: Transaction[] = [
      createTx({ title: "Older", date: "2026-03-10", createdAt: "2026-03-10T08:00:00Z" }),
      createTx({ title: "Newest", date: "2026-03-10", createdAt: "2026-03-10T12:00:00Z" }),
      createTx({ title: "Oldest", date: "2026-03-10", createdAt: "2026-03-10T06:00:00Z" }),
    ];

    const groups = groupTransactionsByMonth(txs);
    const titles = groups[0].transactions.map((tx) => tx.title);
    expect(titles).toEqual(["Newest", "Older", "Oldest"]);
  });

  it("treats transactions without createdAt as the oldest when sorting same-day entries", () => {
    const txs: Transaction[] = [
      createTx({ title: "Imported (no createdAt)", date: "2026-03-10" }),
      createTx({ title: "Newly added", date: "2026-03-10", createdAt: "2026-03-10T12:00:00Z" }),
      createTx({ title: "Earlier", date: "2026-03-10", createdAt: "2026-03-10T08:00:00Z" }),
    ];

    const groups = groupTransactionsByMonth(txs);
    const titles = groups[0].transactions.map((tx) => tx.title);
    // The entry without a createdAt timestamp lands at the bottom (oldest),
    // so the order is deterministic rather than dependent on random UUIDs.
    expect(titles).toEqual(["Newly added", "Earlier", "Imported (no createdAt)"]);
  });

  it("sets month as 0-based index", () => {
    const txs: Transaction[] = [
      createTx({ date: "2026-03-15" }),
    ];

    const groups = groupTransactionsByMonth(txs);
    expect(groups[0].month).toBe(2); // March = index 2
    expect(groups[0].year).toBe(2026);
  });
});
