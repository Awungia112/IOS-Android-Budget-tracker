import { Transaction, Category, Limit, Template, RecurringItem, SavingsGoal, Account } from './index.js';

export interface ExportData {
  version: string;
  exportDate: string;
  account: Account;
  transactions: Transaction[];
  categories: Category[];
  limits: Limit[];
  templates: Template[];
  recurringItems: RecurringItem[];
  savingsGoals: SavingsGoal[];
}

export interface ImportResult {
  success: boolean;
  imported: {
    transactions: number;
    categories: number;
    limits: number;
    templates: number;
    recurringItems: number;
    savingsGoals: number;
  };
  errors: string[];
}
