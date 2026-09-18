/**
 * @vitest-environment jsdom
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import type { Transaction, Category } from "@budget/core";

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
        save: "Save",
        update: "Update",
        cancel: "Cancel",
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
const createCategory = (overrides: Partial<Category> = {}): Category => ({
  id: "expense-food",
  accountId: "account-1",
  name: "category_food",
  type: "expense",
  color: "#E33B80",
  isDefault: false,
  ...overrides,
});

const createTransaction = (
  overrides: Partial<Transaction> = {},
): Transaction => ({
  id: `transaction-${Date.now()}-${Math.random()}`, // nosemgrep: nodejs_scan.javascript-crypto-rule-node_insecure_random_generator -- test fixture ID, no security context
  accountId: "account-1",
  title: "Test Transaction",
  amount: 100,
  category: "expense-food",
  type: "expense",
  date: "2025-01-15T10:00:00Z",
  ...overrides,
});

// Mock useBudget hook data
const mockData = {
  categories: [] as Category[],
  currentAccount: { id: "account-1", name: "Test Account", initials: "TA" },
};

// Mock BudgetContext
vi.mock("@/contexts/BudgetContext", () => ({
  useBudget: () => ({
    get categories() {
      return mockData.categories;
    },
    get currentAccount() {
      return mockData.currentAccount;
    },
    addTransaction: vi.fn(),
    updateTransaction: vi.fn(),
  }),
}));

// Import TransactionForm after mocking
import TransactionForm from "./TransactionForm";

describe("TransactionForm Component", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockData.categories = [];
  });

  afterEach(() => {
    cleanup();
  });

  describe("Basic Rendering", () => {
    it("renders form for expense transaction", () => {
      const foodCategory = createCategory();
      mockData.categories = [foodCategory];

      render(
        <TransactionForm type="expense" onSave={vi.fn()} onCancel={vi.fn()} />,
      );

      expect(screen.getByRole("button", { name: "Save" })).toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: "Cancel" }),
      ).toBeInTheDocument();
    });

    it("renders form for income transaction", () => {
      render(
        <TransactionForm type="income" onSave={vi.fn()} onCancel={vi.fn()} />,
      );

      expect(screen.getByRole("button", { name: "Save" })).toBeInTheDocument();
    });

    it("renders form with pre-filled data for editing", () => {
      const editTransaction = createTransaction({
        title: "Netflix Subscription",
        amount: 19.99,
      });
      const foodCategory = createCategory();
      mockData.categories = [foodCategory];

      render(
        <TransactionForm
          type="expense"
          onSave={vi.fn()}
          onCancel={vi.fn()}
          editTransaction={editTransaction}
        />,
      );

      expect(
        screen.getByDisplayValue("Netflix Subscription"),
      ).toBeInTheDocument();
      expect(screen.getByDisplayValue("19.99")).toBeInTheDocument();
    });
  });

  describe("Form Interaction", () => {
    it("calls onCancel when cancel button is clicked", () => {
      const mockOnCancel = vi.fn();

      render(
        <TransactionForm
          type="expense"
          onSave={vi.fn()}
          onCancel={mockOnCancel}
        />,
      );

      const cancelButton = screen.getByRole("button", { name: "Cancel" });
      fireEvent.click(cancelButton);

      expect(mockOnCancel).toHaveBeenCalled();
    });

    it("renders amount input field", () => {
      const foodCategory = createCategory();
      mockData.categories = [foodCategory];

      render(
        <TransactionForm type="expense" onSave={vi.fn()} onCancel={vi.fn()} />,
      );

      const amountInput = screen.getByLabelText(/^Amount \(€\)$/);
      expect(amountInput).toBeInTheDocument();
      expect(amountInput).toHaveAttribute("type", "number");
    });

    it("renders title input field", () => {
      const foodCategory = createCategory();
      mockData.categories = [foodCategory];

      render(
        <TransactionForm type="expense" onSave={vi.fn()} onCancel={vi.fn()} />,
      );

      const titleInput = screen.getByPlaceholderText("Enter title (optional)");
      expect(titleInput).toBeInTheDocument();
      expect(titleInput).toHaveAttribute("type", "text");
    });
  });

  describe("Accessibility", () => {
    it("has proper button roles", () => {
      render(
        <TransactionForm type="expense" onSave={vi.fn()} onCancel={vi.fn()} />,
      );

      expect(screen.getByRole("button", { name: "Save" })).toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: "Cancel" }),
      ).toBeInTheDocument();
    });

    it("renders form with proper structure", () => {
      const foodCategory = createCategory();
      mockData.categories = [foodCategory];

      render(
        <TransactionForm type="expense" onSave={vi.fn()} onCancel={vi.fn()} />,
      );

      // Check that form elements are present
      expect(screen.getByPlaceholderText("Enter title (optional)")).toBeInTheDocument();
    });
  });
});
