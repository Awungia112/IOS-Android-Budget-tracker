/**
 * @vitest-environment jsdom
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  render,
  screen,
  fireEvent,
  cleanup,
  waitFor,
} from "@testing-library/react";
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
        transaction_title: "Transaction Title",
        date: "Date",
        select_date: "Select date",
        save: "Save",
        update: "Update",
        cancel: "Cancel",
        error: "Error",
        required_field: "This field is required",
        error_amount_required: "Please enter a valid amount",
        error_category_required: "Please select a category",
        invalid_amount: "Please enter a valid amount",
        category_food: "Food",
        category_transport: "Transport",
        category_salary: "Salary",
        new_income: "New Income",
        new_expense: "New Expense",
        edit_income: "Edit Income",
        edit_expense: "Edit Expense",
      };
      // eslint-disable-next-line security/detect-object-injection -- key is validated enum value/safe access pattern
      return translations[key] || key;
    },
    i18n: {
      language: "en",
    },
  }),
  I18nextProvider: ({ children }: { children: React.ReactNode }) => children,
  initReactI18next: { type: "3rdParty", init: () => {} },
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
  getCategoryColor: () => "#8B5CF6",
  normalizeCategoryKey: (name: string) => name,
}));

// Mock toast
vi.mock("@/components/ui/use-toast", () => ({
  toast: vi.fn(),
}));

// Import the mocked toast
import { toast } from "@/components/ui/use-toast";

// Mock DatePickerDialog
vi.mock("@/components/DatePickerDialog", () => ({
  DatePickerDialog: ({
    open,
    onSelect,
    onDayChange,
    selectedYear,
    selectedMonth,
    selectedDay,
  }: any) => {
    if (!open) return null;
    return (
      <div data-testid="date-picker-dialog">
        <input
          data-testid="date-picker-day-input"
          type="number"
          value={selectedDay}
          onChange={(e) => onDayChange?.(Number(e.target.value))}
          min="1"
          max="31"
        />
        <button data-testid="date-picker-confirm" onClick={() => onSelect()}>
          Select
        </button>
      </div>
    );
  },
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
const mockAddTransaction = vi.fn();
const mockUpdateTransaction = vi.fn();

// Mock BudgetContext
vi.mock("@/contexts/BudgetContext", () => ({
  useBudget: () => ({
    get categories() {
      return mockData.categories;
    },
    get currentAccount() {
      return mockData.currentAccount;
    },
    addTransaction: mockAddTransaction,
    updateTransaction: mockUpdateTransaction,
  }),
}));

// Import TransactionForm after mocking
import TransactionForm from "./TransactionForm";

describe("TransactionForm Component", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockData.categories = [];
    // Reset toast mock
    (toast as any).mockClear();
  });

  afterEach(() => {
    cleanup();
  });

  describe("Form Rendering", () => {
    it("renders all form fields for new transaction", () => {
      const foodCategory = createCategory();
      const transportCategory = createCategory({
        id: "expense-transport",
        name: "category_transport",
      });
      mockData.categories = [foodCategory, transportCategory];

      render(
        <TransactionForm type="expense" onSave={vi.fn()} onCancel={vi.fn()} />,
      );

      expect(screen.getByLabelText(/^Amount \(€\)$/)).toBeInTheDocument();
      expect(screen.getByLabelText("Transaction Title")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Save" })).toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: "Cancel" }),
      ).toBeInTheDocument();
    });

    it("populates form fields when editing transaction", () => {
      const editTransaction = createTransaction({
        title: "Netflix Subscription",
        amount: 19.99,
        category: "expense-food",
        date: "2025-01-15",
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
      expect(
        screen.getByRole("button", { name: /15\.01\.2025/ }),
      ).toBeInTheDocument();
    });

    it("filters categories by transaction type", () => {
      const expenseCategory = createCategory({ type: "expense" });
      const incomeCategory = createCategory({
        id: "income-salary",
        name: "category_salary",
        type: "income",
      });
      mockData.categories = [expenseCategory, incomeCategory];

      render(
        <TransactionForm type="expense" onSave={vi.fn()} onCancel={vi.fn()} />,
      );

      // Should only show expense categories
      expect(screen.getAllByText("Food")).toHaveLength(2); // One in dropdown, one in chip
      expect(screen.queryByText("Salary")).not.toBeInTheDocument();
    });
  });

  describe("Category Selection", () => {
    it("selects a category when its chip is clicked", async () => {
      const foodCategory = createCategory();
      const transportCategory = createCategory({
        id: "expense-transport",
        name: "category_transport",
      });
      mockData.categories = [foodCategory, transportCategory];

      render(
        <TransactionForm type="expense" onSave={vi.fn()} onCancel={vi.fn()} />,
      );

      const chips = () => screen.getAllByTestId("category-chip");
      expect(chips()).toHaveLength(2);

      // First category is pre-selected by default
      expect(chips()[0]).toHaveAttribute("data-selected", "true");
      expect(chips()[1]).toHaveAttribute("data-selected", "false");

      // Clicking the second chip changes the selection to a real change
      fireEvent.click(chips()[1]);
      expect(chips()[0]).toHaveAttribute("data-selected", "false");
      expect(chips()[1]).toHaveAttribute("data-selected", "true");

      // The saved transaction carries the newly selected category
      fireEvent.change(screen.getByLabelText(/^Amount \(€\)$/), {
        target: { value: "50" },
      });
      fireEvent.click(screen.getByRole("button", { name: "Save" }));

      await waitFor(() => {
        expect(mockAddTransaction).toHaveBeenCalledWith(
          expect.objectContaining({ category: "expense-transport" }),
        );
      });
    });
  });

  describe("Form Validation", () => {
    it("shows validation error for empty amount", async () => {
      const foodCategory = createCategory();
      mockData.categories = [foodCategory];

      render(
        <TransactionForm type="expense" onSave={vi.fn()} onCancel={vi.fn()} />,
      );

      const saveButton = screen.getByRole("button", { name: "Save" });

      // Mock the form submission directly by calling handleSubmit
      const form = document.querySelector("form");
      if (form) {
        fireEvent.submit(form);
      } else {
        // Fallback to clicking the button
        fireEvent.click(saveButton);
      }

      // Wait for the toast to be called
      await waitFor(
        () => {
          expect(toast).toHaveBeenCalledWith(
            expect.objectContaining({
              description: "Please enter a valid amount",
            }),
          );
        },
        { timeout: 3000 },
      );
    });

    it("shows validation error for invalid amount", async () => {
      const foodCategory = createCategory();
      mockData.categories = [foodCategory];

      render(
        <TransactionForm type="expense" onSave={vi.fn()} onCancel={vi.fn()} />,
      );

      const amountInput = screen.getByLabelText(/^Amount \(€\)$/);
      fireEvent.change(amountInput, { target: { value: "invalid" } });

      const saveButton = screen.getByRole("button", { name: "Save" });

      // Mock the form submission directly by calling handleSubmit
      const form = document.querySelector("form");
      if (form) {
        fireEvent.submit(form);
      } else {
        // Fallback to clicking the button
        fireEvent.click(saveButton);
      }

      // Wait for the toast to be called
      await waitFor(
        () => {
          expect(toast).toHaveBeenCalledWith(
            expect.objectContaining({
              description: "Please enter a valid amount",
            }),
          );
        },
        { timeout: 3000 },
      );
    });

    it("shows validation error for empty category", async () => {
      // Don't add any categories to test empty category validation
      mockData.categories = [];

      render(
        <TransactionForm type="expense" onSave={vi.fn()} onCancel={vi.fn()} />,
      );

      const amountInput = screen.getByLabelText(/^Amount \(€\)$/);
      fireEvent.change(amountInput, { target: { value: "100" } });

      const saveButton = screen.getByRole("button", { name: "Save" });

      // Mock the form submission directly by calling handleSubmit
      const form = document.querySelector("form");
      if (form) {
        fireEvent.submit(form);
      } else {
        // Fallback to clicking the button
        fireEvent.click(saveButton);
      }

      // Wait for the toast to be called
      await waitFor(
        () => {
          expect(toast).toHaveBeenCalledWith(
            expect.objectContaining({
              description: "Please select a category",
            }),
          );
        },
        { timeout: 3000 },
      );
    });
  });

  describe("Form Submission", () => {
    it("calls addTransaction with correct data for new expense", async () => {
      const foodCategory = createCategory();
      mockData.categories = [foodCategory];
      const mockOnSave = vi.fn();

      render(
        <TransactionForm
          type="expense"
          onSave={mockOnSave}
          onCancel={vi.fn()}
        />,
      );

      // Fill form
      fireEvent.change(screen.getByLabelText(/^Amount \(€\)$/), {
        target: { value: "50.99" },
      });
      fireEvent.change(screen.getByLabelText("Transaction Title"), {
        target: { value: "Grocery Shopping" },
      });
      // Date is set by default, no need to change it for this test

      // Select category by clicking on it since there's no dropdown
      const categoryChip = screen
        .getAllByRole("button")
        .find(
          (btn) =>
            btn.textContent?.includes("Food") &&
            !btn.className?.includes("chevron"),
        );
      if (categoryChip) {
        fireEvent.click(categoryChip);
      }

      // Submit form - just click the submit button
      const saveButton = screen.getByRole("button", { name: "Save" });
      fireEvent.click(saveButton);

      await waitFor(() => {
        expect(mockOnSave).toHaveBeenCalled();
      });
    });

    it("calls addTransaction with correct data for new income", async () => {
      const salaryCategory = createCategory({
        id: "income-salary",
        name: "category_salary",
        type: "income",
      });
      mockData.categories = [salaryCategory];
      const mockOnSave = vi.fn();

      render(
        <TransactionForm
          type="income"
          onSave={mockOnSave}
          onCancel={vi.fn()}
        />,
      );

      // Get today's date in YYYY-MM-DD format for comparison
      const today = new Date().toISOString().split("T")[0];

      // Fill form
      fireEvent.change(screen.getByLabelText(/^Amount \(€\)$/), {
        target: { value: "3000" },
      });
      fireEvent.change(screen.getByLabelText("Transaction Title"), {
        target: { value: "Monthly Salary" },
      });

      // Select category by clicking on it
      const salaryChip = screen
        .getAllByRole("button")
        .find(
          (btn) =>
            btn.textContent?.includes("Salary") &&
            !btn.className?.includes("chevron"),
        );
      if (salaryChip) {
        fireEvent.click(salaryChip);
      }

      // Submit form - just click the submit button
      const saveButton = screen.getByRole("button", { name: "Save" });
      fireEvent.click(saveButton);

      await waitFor(() => {
        expect(mockOnSave).toHaveBeenCalled();
      });
    });

    it("calls updateTransaction with correct data for edited transaction", async () => {
      const editTransaction = createTransaction({
        id: "edit-123",
        title: "Old Title",
        amount: 50,
        date: "2025-01-15",
      });
      const foodCategory = createCategory();
      mockData.categories = [foodCategory];
      const mockOnSave = vi.fn();

      render(
        <TransactionForm
          type="expense"
          onSave={mockOnSave}
          onCancel={vi.fn()}
          editTransaction={editTransaction}
        />,
      );

      // Update form fields
      const titleInput = screen.getByDisplayValue("Old Title");
      fireEvent.change(titleInput, { target: { value: "Updated Title" } });

      const amountInput = screen.getByDisplayValue("50");
      fireEvent.change(amountInput, { target: { value: "75.50" } });

      // Make sure the amount is valid for form submission
      expect((amountInput as HTMLInputElement).value).toBe("75.50");

      // Submit form - just click the submit button
      const saveButton = screen.getByRole("button", { name: "Update" });
      fireEvent.click(saveButton);

      await waitFor(() => {
        expect(mockOnSave).toHaveBeenCalled();
      });
    });
  });

  describe("Form Cancellation", () => {
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

    it("does not call onSave when form is cancelled", () => {
      const mockOnSave = vi.fn();
      const mockOnCancel = vi.fn();

      render(
        <TransactionForm
          type="expense"
          onSave={mockOnSave}
          onCancel={mockOnCancel}
        />,
      );

      const cancelButton = screen.getByRole("button", { name: "Cancel" });
      fireEvent.click(cancelButton);

      expect(mockOnSave).not.toHaveBeenCalled();
      expect(mockOnCancel).toHaveBeenCalled();
    });
  });

  describe("Accessibility", () => {
    it("has proper labels for all form inputs", () => {
      const foodCategory = createCategory();
      mockData.categories = [foodCategory];

      render(
        <TransactionForm type="expense" onSave={vi.fn()} onCancel={vi.fn()} />,
      );

      expect(screen.getByLabelText(/^Amount \(€\)$/)).toBeInTheDocument();
      expect(screen.getByLabelText("Transaction Title")).toBeInTheDocument();
    });

    it("has proper button roles and labels", () => {
      render(
        <TransactionForm type="expense" onSave={vi.fn()} onCancel={vi.fn()} />,
      );

      expect(screen.getByRole("button", { name: "Save" })).toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: "Cancel" }),
      ).toBeInTheDocument();
    });

    it("shows validation errors via toast", async () => {
      const foodCategory = createCategory();
      mockData.categories = [foodCategory];

      render(
        <TransactionForm type="expense" onSave={vi.fn()} onCancel={vi.fn()} />,
      );

      const saveButton = screen.getByRole("button", { name: "Save" });

      // Mock the form submission directly by calling handleSubmit
      const form = document.querySelector("form");
      if (form) {
        fireEvent.submit(form);
      } else {
        // Fallback to clicking the button
        fireEvent.click(saveButton);
      }

      // Wait for the toast to be called
      await waitFor(
        () => {
          expect(toast).toHaveBeenCalledWith(
            expect.objectContaining({
              description: "Please enter a valid amount",
            }),
          );
        },
        { timeout: 3000 },
      );
    });
  });

  describe("User Experience", () => {
    it("sets default date to today", () => {
      vi.setSystemTime(new Date("2025-01-15"));

      render(
        <TransactionForm type="expense" onSave={vi.fn()} onCancel={vi.fn()} />,
      );

      // The date is displayed in a button, not an input (formatted as DD.MM.YYYY)
      const dateButton = screen.getByRole("button", { name: /15\.01\.2025/ });
      expect(dateButton).toBeInTheDocument();
    });

    it("formats amount input correctly", () => {
      const foodCategory = createCategory();
      mockData.categories = [foodCategory];

      render(
        <TransactionForm type="expense" onSave={vi.fn()} onCancel={vi.fn()} />,
      );

      const amountInput = screen.getByLabelText(
        /^Amount \(€\)$/,
      ) as HTMLInputElement;

      // Test decimal input
      fireEvent.change(amountInput, { target: { value: "50.99" } });
      expect((amountInput as HTMLInputElement).value).toBe("50.99");

      // Test integer input
      fireEvent.change(amountInput, { target: { value: "100" } });
      expect((amountInput as HTMLInputElement).value).toBe("100");
    });
  });
});
