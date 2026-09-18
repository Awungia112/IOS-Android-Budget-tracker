import type { Category } from '../types/category.js';

// Database configuration constants

export const DEFAULT_ACCOUNT_ID = 'main-account';

export const DEFAULT_CATEGORIES: readonly Readonly<Category>[] = [
  // Income categories - using translation keys, matching Figma design icons
  { id: 'income-general', name: 'category_general', type: 'income', isDefault: true, accountId: DEFAULT_ACCOUNT_ID, icon: 'cash' },
  { id: 'income-salary', name: 'category_salary', type: 'income', isDefault: true, accountId: DEFAULT_ACCOUNT_ID, icon: 'money' },
  { id: 'income-allowance', name: 'category_allowance', type: 'income', isDefault: true, accountId: DEFAULT_ACCOUNT_ID, icon: 'pig' },
  { id: 'income-gift', name: 'category_gift', type: 'income', isDefault: true, accountId: DEFAULT_ACCOUNT_ID, icon: 'present' },
  { id: 'income-holiday_job', name: 'category_holiday_job', type: 'income', isDefault: true, accountId: DEFAULT_ACCOUNT_ID, icon: 'lucide:briefcase' },
  { id: 'income-transfer', name: 'category_transfer', type: 'income', isDefault: true, accountId: DEFAULT_ACCOUNT_ID, icon: 'lucide:arrow-right-left' },
  { id: 'income-tutoring', name: 'category_tutoring', type: 'income', isDefault: true, accountId: DEFAULT_ACCOUNT_ID, icon: 'lucide:graduation-cap' },
  { id: 'income-selling_online', name: 'category_selling_online', type: 'income', isDefault: true, accountId: DEFAULT_ACCOUNT_ID, icon: 'lucide:shopping-cart' },
  { id: 'income-babysitting', name: 'category_babysitting', type: 'income', isDefault: true, accountId: DEFAULT_ACCOUNT_ID, icon: 'lucide:heart' },
  { id: 'income-scholarship', name: 'category_scholarship', type: 'income', isDefault: true, accountId: DEFAULT_ACCOUNT_ID, icon: 'lucide:award' },
  { id: 'income-cashback', name: 'category_cashback', type: 'income', isDefault: true, accountId: DEFAULT_ACCOUNT_ID, icon: 'lucide:percent' },

  // Expense categories - using translation keys, matching Figma design icons
  { id: 'expense-general', name: 'category_general', type: 'expense', isDefault: true, accountId: DEFAULT_ACCOUNT_ID, icon: 'cash' },
  { id: 'expense-household', name: 'category_household', type: 'expense', isDefault: true, accountId: DEFAULT_ACCOUNT_ID, icon: 'house' },
  { id: 'expense-entertainment', name: 'category_entertainment', type: 'expense', isDefault: true, accountId: DEFAULT_ACCOUNT_ID, icon: 'entertainment' },
  { id: 'expense-party', name: 'category_party', type: 'expense', isDefault: true, accountId: DEFAULT_ACCOUNT_ID, icon: 'party' },
  { id: 'expense-mobile', name: 'category_mobile', type: 'expense', isDefault: true, accountId: DEFAULT_ACCOUNT_ID, icon: 'handy' },
  { id: 'expense-savings', name: 'category_savings', type: 'expense', isDefault: true, accountId: DEFAULT_ACCOUNT_ID, icon: 'pig' },
  { id: 'expense-food', name: 'category_food', type: 'expense', isDefault: true, accountId: DEFAULT_ACCOUNT_ID, icon: 'lucide:food' },
  { id: 'expense-shopping', name: 'category_shopping', type: 'expense', isDefault: true, accountId: DEFAULT_ACCOUNT_ID, icon: 'lucide:shopping' },
  { id: 'expense-books', name: 'category_books', type: 'expense', isDefault: true, accountId: DEFAULT_ACCOUNT_ID, icon: 'lucide:book' },
  { id: 'expense-gift', name: 'category_gift', type: 'expense', isDefault: true, accountId: DEFAULT_ACCOUNT_ID, icon: 'present' },
  { id: 'expense-office', name: 'category_office', type: 'expense', isDefault: true, accountId: DEFAULT_ACCOUNT_ID, icon: 'lucide:briefcase' },
  { id: 'expense-internet', name: 'category_internet', type: 'expense', isDefault: true, accountId: DEFAULT_ACCOUNT_ID, icon: 'lucide:wifi' },
  { id: 'expense-clothing', name: 'category_clothing', type: 'expense', isDefault: true, accountId: DEFAULT_ACCOUNT_ID, icon: 'lucide:scissors' },
  { id: 'expense-hobby', name: 'category_hobby', type: 'expense', isDefault: true, accountId: DEFAULT_ACCOUNT_ID, icon: 'lucide:star' },
  { id: 'expense-going_out', name: 'category_going_out', type: 'expense', isDefault: true, accountId: DEFAULT_ACCOUNT_ID, icon: 'lucide:smile' },
  { id: 'expense-bus', name: 'category_bus', type: 'expense', isDefault: true, accountId: DEFAULT_ACCOUNT_ID, icon: 'lucide:bus' },
  { id: 'expense-leisure', name: 'category_leisure', type: 'expense', isDefault: true, accountId: DEFAULT_ACCOUNT_ID, icon: 'lucide:coffee' },
  { id: 'expense-travel', name: 'category_travel', type: 'expense', isDefault: true, accountId: DEFAULT_ACCOUNT_ID, icon: 'lucide:map' },
  { id: 'expense-vacation', name: 'category_vacation', type: 'expense', isDefault: true, accountId: DEFAULT_ACCOUNT_ID, icon: 'lucide:plane' },
  { id: 'expense-utilities', name: 'category_utilities', type: 'expense', isDefault: true, accountId: DEFAULT_ACCOUNT_ID, icon: 'lucide:zap' },
  { id: 'expense-subscriptions', name: 'category_subscriptions', type: 'expense', isDefault: true, accountId: DEFAULT_ACCOUNT_ID, icon: 'lucide:credit-card' },
  { id: 'expense-personal_care', name: 'category_personal_care', type: 'expense', isDefault: true, accountId: DEFAULT_ACCOUNT_ID, icon: 'lucide:heart' },
  { id: 'expense-health', name: 'category_health', type: 'expense', isDefault: true, accountId: DEFAULT_ACCOUNT_ID, icon: 'lucide:activity' },
  { id: 'expense-education', name: 'category_education', type: 'expense', isDefault: true, accountId: DEFAULT_ACCOUNT_ID, icon: 'lucide:graduation-cap' },
  { id: 'expense-sports', name: 'category_sports', type: 'expense', isDefault: true, accountId: DEFAULT_ACCOUNT_ID, icon: 'lucide:trophy' },
];

export const DEFAULT_ACCOUNT = {
  id: DEFAULT_ACCOUNT_ID,
  name: 'Personal',
  initials: 'P',
  profileImage: '',
  email: '',
} as const;
