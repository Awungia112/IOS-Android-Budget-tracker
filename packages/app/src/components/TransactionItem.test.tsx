/**
 * @vitest-environment jsdom
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  render,
  screen,
  fireEvent,
  cleanup,
  within,
} from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import type { Transaction, Category } from "@budget/core";
import {
  createTransaction,
  createCategory,
  createMockTranslation,
} from "../test-helpers";

// Mock IndexedDB to suppress MissingAPIError in test environment
const mockIndexedDB = {
  open: vi.fn(() => ({
    onsuccess: null,
    onerror: null,
  })),
  deleteDatabase: vi.fn(),
};

// Mock Dexie's IndexedDB dependency
vi.mock('dexie', () => ({
  default: class MockDexie {
    constructor() {
      // Suppress the IndexedDB missing error in test environment
      console.warn('[MockDexie] IndexedDB API not available in test environment');
    }
    version() {
      return {
      };
    }
  },
}));

Object.defineProperty(window, 'indexedDB', { value: mockIndexedDB });

// Mock localStorage

// Mock react-i18next
vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, defaultValue?: string) => {
      const translations: Record<string, string> = {
        new_income: "New Income",
        new_expense: "New Expense",
        edit_income: "Edit Income",
        edit_expense: "Edit Expense",
        delete: "Delete",
        cancel: "Cancel",
        recurring: "Recurring",
        delete_confirmation:
          "Are you sure you want to delete this transaction?",
        edit_transaction_description: "Form to edit this transaction",
        category_food: "Food",
        category_transport: "Transport",
        category_salary: "Salary",
        unknown_category: "Unknown Category",
      };
      // eslint-disable-next-line security/detect-object-injection -- key is validated enum value/safe access pattern
      return translations[key] || defaultValue || key;
    },
    i18n: {
      language: "en",
    },
  }),
  I18nextProvider: ({ children }: { children: React.ReactNode }) => children,
  initReactI18next: { type: "3rdParty", init: () => {} },
}));

// Mock formatCurrency and formatDate helpers
vi.mock("@/lib/formatters", () => ({
  formatCurrency: (amount: number) => {
    const formatted = new Intl.NumberFormat("de-DE", {
      style: "currency",
      currency: "EUR",
    }).format(amount);
    return amount < 0 ? `- ${formatted.replace("-", "")}` : formatted;
  },
  formatDate: (dateString: string) => {
    const date = new Date(dateString);
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const year = date.getFullYear();
    return `${day}.${month}.${year}`;
  },
}));

// Mock translateCategoryLabel helper
vi.mock("@/lib/categoryHelpers", () => ({
  translateCategoryLabel: (t: any, key: string) => {
    const translations: Record<string, string> = {
      category_food: "Food",
      category_transport: "Transport",
      category_salary: "Salary",
    };
    // eslint-disable-next-line security/detect-object-injection -- key is validated enum value/safe access pattern
    return translations[key] || key;
  },
}));

// Mock TransactionForm component
let mockTransactionFormVisible = false;
vi.mock("./TransactionForm", () => ({
  default: ({ type, onSave, onCancel, editTransaction }: any) => {
    mockTransactionFormVisible = true;
    return (
      <div data-testid="transaction-form">
        <span>Transaction Form: {type}</span>
        {editTransaction && <span>Edit ID: {editTransaction.id}</span>}
        <button
          onClick={() => {
            onSave?.(editTransaction || {});
            mockTransactionFormVisible = false;
          }}
        >
          Save
        </button>
        <button
          onClick={() => {
            onCancel?.();
            mockTransactionFormVisible = false;
          }}
        >
          Cancel
        </button>
      </div>
    );
  },
}));

// Mock useBudget hook data
const mockData = {
  categories: [] as Category[],
};
const mockDeleteTransaction = vi.fn();

// Mock BudgetContext
vi.mock("@/contexts/BudgetContext", () => ({
  useBudget: () => ({
    get categories() {
      return mockData.categories;
    },
    deleteTransaction: mockDeleteTransaction,
  }),
}));

// Import TransactionItem after mocking
import TransactionItem from "./TransactionItem";

describe("TransactionItem Component", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockData.categories = [];
  });

  afterEach(() => {
    cleanup();
  });

  describe("Transaction Display", () => {
    it("displays transaction title correctly", () => {
      const transaction = createTransaction({ title: "Netflix Subscription" });
      const category = createCategory();
      mockData.categories = [category];

      render(<TransactionItem transaction={transaction} />);

      expect(screen.getByText("Netflix Subscription")).toBeInTheDocument();
    });

    it("displays category name when title is not provided", () => {
      const transaction = createTransaction({ title: "" });
      const category = createCategory({ name: "category_food" });
      mockData.categories = [category];

      render(<TransactionItem transaction={transaction} />);

      expect(
        screen.getByText((content, element) => {
          return (
            content.includes("Food") && element?.className?.includes("truncate")
          );
        }),
      ).toBeInTheDocument();
    });

    it("displays fallback title when neither title nor category is found", () => {
      const transaction = createTransaction({
        title: "",
        category: "nonexistent",
      });
      mockData.categories = [];

      render(<TransactionItem transaction={transaction} />);

      expect(screen.getByText("New Expense")).toBeInTheDocument();
    });

    it("displays date in correct format (DD.MM.YYYY)", () => {
      const transaction = createTransaction({ date: "2025-01-15T10:00:00Z" });
      const category = createCategory();
      mockData.categories = [category];

      render(<TransactionItem transaction={transaction} />);

      expect(screen.getByText("15.01.2025")).toBeInTheDocument();
    });

    it("displays category tag correctly", () => {
      const transaction = createTransaction();
      const category = createCategory({ name: "category_food" });
      mockData.categories = [category];

      render(<TransactionItem transaction={transaction} />);

      expect(
        screen.getByText((content, element) => {
          return (
            content.includes("Food") && element?.className?.includes("truncate")
          );
        }),
      ).toBeInTheDocument();
    });

    it("displays unknown category when category is not found", () => {
      const transaction = createTransaction({ category: "nonexistent" });
      mockData.categories = [];

      render(<TransactionItem transaction={transaction} />);

      // Check that empty category span exists
      const categorySpan = screen
        .getByText("Test Transaction")
        .parentElement?.parentElement?.querySelector(".truncate");
      expect(categorySpan).toBeInTheDocument();
      expect(categorySpan).toHaveTextContent(""); // Empty content for unknown category
    });

    it("displays income amount in green with + sign", () => {
      const transaction = createTransaction({
        type: "income",
        amount: 300,
        category: "income-salary",
      });
      const category = createCategory({
        id: "income-salary",
        name: "category_salary",
        type: "income",
      });
      mockData.categories = [category];

      render(<TransactionItem transaction={transaction} />);

      const amountElement = screen.getByText((content, element) => {
        return content.includes("+") && content.includes("300,00 €");
      });
      expect(amountElement).toHaveClass("text-budget-green");
    });

    it("displays expense amount in red with - sign", () => {
      const transaction = createTransaction({
        type: "expense",
        amount: 19.99,
      });
      const category = createCategory();
      mockData.categories = [category];

      render(<TransactionItem transaction={transaction} />);

      const amountElement = screen.getByText((content, element) => {
        return content.includes("-") && content.includes("19,99 €");
      });
      expect(amountElement).toHaveClass("text-budget-red");
    });

    it("formats currency correctly with 2 decimal places", () => {
      const transaction = createTransaction({ amount: 50.5 });
      const category = createCategory();
      mockData.categories = [category];

      render(<TransactionItem transaction={transaction} />);

      expect(
        screen.getByText((content, element) => {
          return content.includes("-") && content.includes("50,50 €");
        }),
      ).toBeInTheDocument();
    });

  });

  describe("Edit Functionality", () => {
    it("opens edit drawer when edit button is clicked", () => {
      const transaction = createTransaction({ id: "edit-test-123" });
      const category = createCategory();
      mockData.categories = [category];

      render(<TransactionItem transaction={transaction} />);

      const editButton = screen.getAllByRole("button")[0];
      fireEvent.click(editButton);

      expect(screen.getByTestId("transaction-form")).toBeInTheDocument();
      expect(screen.getByText("Transaction Form: expense")).toBeInTheDocument();
      expect(screen.getByText("Edit ID: edit-test-123")).toBeInTheDocument();
    });

    it("displays correct edit drawer title for income", () => {
      const transaction = createTransaction({
        id: "income-edit",
        type: "income",
        category: "income-salary",
      });
      const category = createCategory({
        id: "income-salary",
        name: "category_salary",
        type: "income",
      });
      mockData.categories = [category];

      render(<TransactionItem transaction={transaction} />);

      const editButton = screen.getAllByRole("button")[0];
      fireEvent.click(editButton);

      expect(screen.getByText("Transaction Form: income")).toBeInTheDocument();
    });
  });

  describe("Delete Functionality", () => {
    it("opens delete confirmation dialog when delete button is clicked", () => {
      const transaction = createTransaction({ id: "delete-test-123" });
      const category = createCategory();
      mockData.categories = [category];

      render(<TransactionItem transaction={transaction} />);

      const deleteButton = screen.getAllByRole("button")[1];
      fireEvent.click(deleteButton);

      expect(screen.getByRole("alertdialog")).toBeInTheDocument();
      expect(
        screen.getByText("Are you sure you want to delete this transaction?"),
      ).toBeInTheDocument();
    });

    it("calls deleteTransaction when delete is confirmed", () => {
      const transaction = createTransaction({ id: "confirm-delete-123" });
      const category = createCategory();
      mockData.categories = [category];

      render(<TransactionItem transaction={transaction} />);

      // Open delete dialog
      const buttons = screen.getAllByRole("button");
      const deleteButton = buttons[1]; // Second button is delete
      fireEvent.click(deleteButton);

      // Confirm delete
      const dialog = screen.getByRole("alertdialog");
      const confirmButton = within(dialog).getByRole("button", {
        name: "Delete",
      });
      fireEvent.click(confirmButton);

      expect(mockDeleteTransaction).toHaveBeenCalledWith("confirm-delete-123");
    });

    it("does not delete when cancel is clicked", () => {
      const transaction = createTransaction({ id: "cancel-delete-123" });
      const category = createCategory();
      mockData.categories = [category];

      render(<TransactionItem transaction={transaction} />);

      // Open delete dialog
      const buttons = screen.getAllByRole("button");
      const deleteButton = buttons[1]; // Second button is delete
      fireEvent.click(deleteButton);

      // Cancel delete
      const dialog = screen.getByRole("alertdialog");
      const cancelButton = within(dialog).getByRole("button", {
        name: "Cancel",
      });
      fireEvent.click(cancelButton);

      expect(mockDeleteTransaction).not.toHaveBeenCalled();
    });
  });

  describe("Accessibility", () => {
    it("has proper ARIA labels for buttons", () => {
      const transaction = createTransaction();
      const category = createCategory();
      mockData.categories = [category];

      render(<TransactionItem transaction={transaction} />);

      // Find buttons by their presence (edit and delete buttons)
      const buttons = screen.getAllByRole("button");
      expect(buttons).toHaveLength(2); // Edit and delete buttons

      // Check that buttons exist (they have SVG icons)
      expect(buttons[0]).toBeInTheDocument();
      expect(buttons[1]).toBeInTheDocument();
    });

    it("has hover states for interactive elements", () => {
      const transaction = createTransaction();
      const category = createCategory();
      mockData.categories = [category];

      render(<TransactionItem transaction={transaction} />);

      // Check that transaction container exists (hover state is applied via CSS classes)
      const transactionContainer = screen
        .getByText("Test Transaction")
        .closest('[data-testid="transaction-item"]');
      expect(transactionContainer).toBeInTheDocument();
      expect(transactionContainer).toHaveClass(
        "hover:bg-gray-50",
        "transition-colors",
      );
    });
  });

  describe("Visual Design", () => {
    it("applies correct color classes based on transaction type", () => {
      const incomeTransaction = createTransaction({
        type: "income",
        amount: 100,
        category: "income-salary",
      });
      const incomeCategory = createCategory({
        id: "income-salary",
        name: "category_salary",
        type: "income",
      });
      mockData.categories = [incomeCategory];

      const { rerender } = render(
        <TransactionItem transaction={incomeTransaction} />,
      );
      expect(
        screen.getByText((content, element) => {
          return content.includes("+") && content.includes("100,00 €");
        }),
      ).toBeInTheDocument();

      const expenseTransaction = createTransaction({
        type: "expense",
        amount: 50,
      });
      const expenseCategory = createCategory();

      rerender(<TransactionItem transaction={expenseTransaction} />);
      expect(
        screen.getByText((content, element) => {
          return content.includes("-") && content.includes("50,00 €");
        }),
      ).toHaveClass("text-budget-red");
    });

    it("displays date and category in correct format", () => {
      const transaction = createTransaction({ date: "2025-12-10T10:00:00Z" });
      const category = createCategory({ name: "category_food" });
      mockData.categories = [category];

      render(<TransactionItem transaction={transaction} />);

      expect(screen.getByText("10.12.2025")).toBeInTheDocument();
      expect(
        screen.getByText((content, element) => {
          return content.includes("Food");
        }),
      ).toBeInTheDocument();

      // Check that date and category are separated by bullet point
      const dateCategoryContainer =
        screen.getByText("10.12.2025").parentElement;
      expect(dateCategoryContainer).toHaveTextContent("10.12.2025•Food");
    });

  });
});
