import type { TransactionType } from './transaction.js';

export interface Template {
  id: string;
  name: string;
  amount: number;
  categoryId: string;
  type: TransactionType;
  accountId: string;
  archivedAt?: string;
}

export type CreateTemplate = Omit<Template, 'id' | 'accountId'>;
