/**
 * Test helpers and factories for budget app tests
 */

import { vi } from "vitest";
import type { Transaction, Category, Account } from "@budget/core";

// Counter for unique transaction IDs in tests
let transactionCounter = 0;

// Data factories
export const createTransaction = (
  overrides: Partial<Transaction> = {},
): Transaction => ({
  id: `transaction-${++transactionCounter}-${Math.random()}`, // nosemgrep: nodejs_scan.javascript-crypto-rule-node_insecure_random_generator -- test fixture ID, no security context
  accountId: "account-1",
  title: "Test Transaction",
  amount: 100,
  category: "expense-food",
  type: "expense",
  date: "2025-01-15", // Use YYYY-MM-DD format for consistent testing
  ...overrides,
});

export const createCategory = (
  overrides: Partial<Category> = {},
): Category => ({
  id: "expense-food",
  accountId: "account-1",
  name: "category_food",
  type: "expense",
  color: "#E33B80",
  isDefault: false,
  ...overrides,
});

export const createAccount = (overrides: Partial<Account> = {}): Account => ({
  id: "account-1",
  name: "Test Account",
  initials: "TA",
  ...overrides,
});

// Common translation mock
export const createMockTranslation = () => {
  const translations: Record<string, string> = {
    my_balance: "Meine Bilanz",
    income: "Einnahmen",
    expenses: "Ausgaben",
    total: "Summe",
    my_budget: "Mein Budget",
    transactions: "Transaktionen",
    pending_transactions: "Pending Transactions",
    no_transactions_for_date: "Keine Transaktionen für diesen Zeitraum",
    add_first_transaction: "Fügen Sie Ihre erste Transaktion hinzu",
    add_income: "Einnahme",
    add_expense: "Ausgabe",
    new_income: "New Income",
    new_expense: "New Expense",
    edit_income: "Edit Income",
    edit_expense: "Edit Expense",
    delete: "Delete",
    cancel: "Cancel",
    delete_confirmation: "Are you sure you want to delete this transaction?",
    edit_transaction_description: "Form to edit this transaction",
    add_income_description: "Form to add a new income transaction",
    add_expense_description: "Form to add a new expense transaction",
    overview: "Overview",
  };

  // eslint-disable-next-line security/detect-object-injection -- key is validated enum value/safe access pattern
  return (key: string) => translations[key] || key;
};

// Mock data setup
export const createMockData = () => {
  const account = createAccount();
  return {
    transactions: [] as Transaction[],
    categories: [] as Category[],
    currentAccount: account,
    accounts: [account],
    recurringItems: [] as any[], // Add recurringItems to match useBudget hook
  };
};

// Common mock components
export const mockComponents = {
  TransactionForm: ({ type, onSave, onCancel }: any) => (
    <div data-testid="transaction-form">
      <span>Transaction Form: {type}</span>
      <button onClick={onSave}>Save</button>
      <button onClick={onCancel}>Cancel</button>
    </div>
  ),

  TransactionItem: ({ transaction }: any) => (
    <div data-testid="transaction-item">
      <span>{transaction.title}</span>
      <span>{transaction.amount}</span>
    </div>
  ),

  PendingTransactionItem: ({ transaction }: any) => (
    <div data-testid="pending-transaction-item">
      <span>{transaction.title}</span>
      <span>{transaction.amount}</span>
    </div>
  ),

  CategoryAvatar: ({ category }: any) => (
    <div data-testid="category-avatar">{category?.name || "Unknown"}</div>
  ),

  ConnectivityStatus: () => <div data-testid="connectivity-status">Online</div>,

  DatePickerDialog: ({ open, onOpenChange }: any) =>
    open ? (
      <div data-testid="date-picker-dialog">
        <button onClick={() => onOpenChange(false)}>Close</button>
      </div>
    ) : null,

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
};

// Test utilities
export const setupTestDate = (date: string = "2025-01-15") => {
  vi.setSystemTime(new Date(date));
};

export const cleanupTestDate = () => {
  vi.useRealTimers();
};


export const resetMockData = (mockData: ReturnType<typeof createMockData>) => {
  mockData.transactions = [];
  mockData.categories = [];
};
