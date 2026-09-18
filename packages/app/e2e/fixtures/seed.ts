import { Page } from '@playwright/test';

/**
 * Get seed data with current date to avoid midnight boundary issues
 *
 * Includes account, categories, transactions, limits, and savings goals
 * for comprehensive E2E testing across all budget tracking features.
 */
export function getSeedData() {
    const currentDate = new Date().toISOString().split('T')[0];
    const executedAt = new Date().toISOString();

    // Compute future deadlines for savings goals
    const threeMonthsFromNow = new Date();
    threeMonthsFromNow.setMonth(threeMonthsFromNow.getMonth() + 3);
    const sixMonthsFromNow = new Date();
    sixMonthsFromNow.setMonth(sixMonthsFromNow.getMonth() + 6);

    return {
        DEFAULT_ACCOUNT: {
            id: 'main-account',
            name: 'Personal',
            initials: 'P',
            profileImage: '',
            email: '',
        },
        DEFAULT_CATEGORIES: [
            { id: 'income-general', name: 'category_general', type: 'income', isDefault: true, accountId: 'main-account', icon: 'cash' },
            { id: 'income-salary', name: 'category_salary', type: 'income', isDefault: true, accountId: 'main-account', icon: 'money' },
            { id: 'expense-general', name: 'category_general', type: 'expense', isDefault: true, accountId: 'main-account', icon: 'cash' },
            { id: 'expense-household', name: 'category_household', type: 'expense', isDefault: true, accountId: 'main-account', icon: 'house' },
            { id: 'expense-entertainment', name: 'category_entertainment', type: 'expense', isDefault: true, accountId: 'main-account', icon: 'entertainment' },
        ],
        DEFAULT_TRANSACTIONS: [
            {
                id: 't1',
                type: 'income',
                amount: 5000,
                category: 'income-salary',
                date: currentDate,
                title: 'Monthly Salary',
                accountId: 'main-account',
                executedAt,
            },
            {
                id: 't2',
                type: 'expense',
                amount: 1200,
                category: 'expense-household',
                date: currentDate,
                title: 'Rent',
                accountId: 'main-account',
                executedAt,
            },
            {
                id: 't3',
                type: 'expense',
                amount: 150.50,
                category: 'expense-general',
                date: currentDate,
                title: 'Groceries',
                accountId: 'main-account',
                executedAt,
            },
            {
                id: 't4',
                type: 'expense',
                amount: 180,
                category: 'expense-entertainment',
                date: currentDate,
                title: 'Concert Tickets',
                accountId: 'main-account',
                executedAt,
            }
        ],
        DEFAULT_LIMITS: [
            {
                id: 'limit-household',
                categoryId: 'expense-household',
                amount: 1500,
                accountId: 'main-account',
            },
            {
                id: 'limit-entertainment',
                categoryId: 'expense-entertainment',
                amount: 200,
                accountId: 'main-account',
            },
        ],
        DEFAULT_SAVINGS_GOALS: [
            {
                id: 'goal-vacation',
                name: 'Vacation Fund',
                targetAmount: 3000,
                deadline: sixMonthsFromNow.toISOString().split('T')[0],
                accountId: 'main-account',
                categoryId: 'expense-entertainment',
            },
            {
                id: 'goal-laptop',
                name: 'New Laptop',
                targetAmount: 1500,
                deadline: threeMonthsFromNow.toISOString().split('T')[0],
                accountId: 'main-account',
                categoryId: 'expense-general',
            },
        ],
        // Savings goal payments — transactions linked to goals via savingsGoalId
        SAVINGS_GOAL_TRANSACTIONS: [
            {
                id: 'sg-t1',
                type: 'expense',
                amount: 500,
                category: 'expense-entertainment',
                date: currentDate,
                title: 'Vacation Savings - March',
                accountId: 'main-account',
                savingsGoalId: 'goal-vacation',
                executedAt,
            },
        ],
    };
}

/**
 * Reset and seed the database via page.evaluate()
 */
export async function seedDatabase(page: Page) {
    // Get fresh seed data with current date
    const seedData = getSeedData();

    await page.evaluate(async (data) => {
        const db = (window as any).db;
        if (!db) {
            throw new Error('Database instance not found on window. Ensure the app is running and has initialized the database.');
        }

        // Ensure DB is open
        if (!db.isOpen()) {
            await db.open();
        }

        // Reset database using a clear-all strategy that handles all tables
        // We use a Promise.all to clear all tables in parallel to be as fast as possible
        await Promise.all(db.tables.map((table: any) => table.clear()));

        // Populate seed data
        await db.accounts.put(data.DEFAULT_ACCOUNT);
        await db.categories.bulkPut(data.DEFAULT_CATEGORIES);
        await db.transactions.bulkPut([...data.DEFAULT_TRANSACTIONS, ...data.SAVINGS_GOAL_TRANSACTIONS]);
        await db.limits.bulkPut(data.DEFAULT_LIMITS);
        await db.savingsGoals.bulkPut(data.DEFAULT_SAVINGS_GOALS);
    }, seedData);
}
