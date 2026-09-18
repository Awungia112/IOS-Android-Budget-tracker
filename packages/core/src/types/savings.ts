export interface SavingsGoal {
  id: string;
  name: string;
  targetAmount: number;
  deadline: string; // '' sentinel value when dueDate is absent (matches legacy transformer)
  accountId: string;
  categoryId?: string;
  icon?: string;
  iconColor?: string;
  frequency?: string;
  monthlyAmount?: number;
  archivedAt?: string;
}

export type CreateSavingsGoal = Omit<SavingsGoal, 'id' | 'accountId'>;
