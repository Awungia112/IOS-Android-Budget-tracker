import type { TransactionType } from './transaction.js';

type DailyFreq   = 'daily'   | `every_${number}_days`;
type WeeklyFreq  = 'weekly'  | `every_${number}_weeks`;
type MonthlyFreq = 'monthly' | `every_${number}_months`;

export type Frequency = DailyFreq | WeeklyFreq | MonthlyFreq;

export interface RecurringItem {
  id: string;
  name: string;
  amount: number;
  categoryId: string;
  type: TransactionType;
  frequency: Frequency;
  startDate: string;
  endDate?: string | null;
  accountId: string;
  archivedAt?: string;
}

export type CreateRecurringItem = Omit<RecurringItem, 'id' | 'accountId'>;
