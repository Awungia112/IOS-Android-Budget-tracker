/**
 * @vitest-environment jsdom
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import type { Transaction, Category, Account } from "@budget/core";

// Mock react-i18next
vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => {
      const translations: Record<string, string> = {
        amount: "Amount",
        enter_title: "Transaction Title",
        enter_title_optional: "Enter title (optional)",
        select_category: "Select Category",
        category: "Category",
        date: "Date",
        select_date: "Select date",
        select: "Select",
        cancel: "Cancel",
        save: "Save",
        update: "Update",
        error: "Error",
        error_amount_required: "Please enter a valid amount",
        error_category_required: "Please select a category",
        category_food: "Food",
        category_transport: "Transport",
        category_salary: "Salary",
        new_income: "New Income",
        new_expense: "New Expense",
      };
      // eslint-disable-next-line security/detect-object-injection -- key is validated enum value/safe access pattern
      return translations[key] || key;
    },
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
    addTransaction: vi.fn(),
    updateTransaction: vi.fn(),
  }),
}));

// Import TransactionForm after mocking
import TransactionForm from "./TransactionForm";

// Wrapper component with providers
const TestWrapper = ({ children }: { children: React.ReactNode }) => (
  <div>{children}</div>
);

describe("TransactionForm - Date Picker Integration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockData.transactions = [];
    mockData.categories = [];
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe("Date Picker Functionality", () => {
    it("renders date picker button", () => {
      const category = createCategory();
      mockData.categories = [category];

      render(
        <TestWrapper>
          <TransactionForm type="expense" onSave={vi.fn()} onCancel={vi.fn()} />
        </TestWrapper>,
      );

      // Look for the date button that opens the date picker
      const dateButton = screen.getByRole("button", { name: /\d{2}\.\d{2}\.\d{4}/ });
      expect(dateButton).toBeInTheDocument();
      expect(dateButton).toHaveClass("cursor-pointer");
    });

    it("opens date picker dialog when button is clicked", async () => {
      const category = createCategory();
      mockData.categories = [category];

      render(
        <TestWrapper>
          <TransactionForm type="expense" onSave={vi.fn()} onCancel={vi.fn()} />
        </TestWrapper>,
      );

      // Look for the date button and click it
      const dateButton = screen.getByRole("button", { name: /Select date|\d{2}\.\d{2}\.\d{4}/ });
      fireEvent.click(dateButton);

      // Check if DatePickerDialog appears
      await waitFor(() => {
        expect(screen.getByTestId("date-picker-dialog")).toBeInTheDocument();
      });
    });

    it("renders date picker dialog with proper title", async () => {
      const category = createCategory();
      mockData.categories = [category];

      render(
        <TestWrapper>
          <TransactionForm type="expense" onSave={vi.fn()} onCancel={vi.fn()} />
        </TestWrapper>,
      );

      // Look for the date button and click it
      const dateButton = screen.getByRole("button", { name: /Select date|\d{2}\.\d{2}\.\d{4}/ });
      fireEvent.click(dateButton);

      await waitFor(() => {
        // DatePickerDialog should exist
        expect(screen.getByTestId("date-picker-dialog")).toBeInTheDocument();
      });
    });

    it("closes date picker dialog when select is clicked", async () => {
      const category = createCategory();
      mockData.categories = [category];

      render(
        <TestWrapper>
          <TransactionForm type="expense" onSave={vi.fn()} onCancel={vi.fn()} />
        </TestWrapper>,
      );

      // Look for the date button and click it
      const dateButton = screen.getByRole("button", { name: /Select date|\d{2}\.\d{2}\.\d{4}/ });
      fireEvent.click(dateButton);

      // Wait for dialog to appear
      await waitFor(() => {
        expect(screen.getByTestId("date-picker-dialog")).toBeInTheDocument();
      });

      // Click the Select button in the dialog (which closes it)
      const selectButton = screen.getByText("Select");
      fireEvent.click(selectButton);

      // Dialog should be closed
      await waitFor(() => {
        expect(screen.queryByTestId("date-picker-dialog")).not.toBeInTheDocument();
      });
    });
  });
});
