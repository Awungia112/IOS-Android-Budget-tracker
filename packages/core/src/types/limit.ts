export interface Limit {
  id: string;
  categoryId: string;
  amount: number;
  accountId: string;
  archivedAt?: string;
}

export type CreateLimit = Omit<Limit, 'id' | 'accountId'>;
