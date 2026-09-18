export type TransactionType = 'income' | 'expense';

export interface Transaction {
  id: string;
  type: TransactionType;
  amount: number;
  category: string;
  date: string;
  title: string;
  accountId: string;
  archivedAt?: string; // ISO timestamp when the row was soft-archived
  createdAt?: string; // Optional timestamp for proper ordering
  savingsGoalId?: string; // Optional: links income to a savings goal
  isCompletionTransaction?: boolean; // Optional: marks if this is a savings goal completion transaction
  executedAt?: string; // Optional: timestamp when a pending transaction was executed
  isRecurring?: boolean; // Optional: marks if this transaction is part of a recurring series
  recurringItemId?: string; // Optional stable link to the recurring definition
  recurringOccurrenceDate?: string; // Original scheduled date for generated occurrences
}

export type CreateTransaction = Omit<Transaction, 'id' | 'accountId'>;
