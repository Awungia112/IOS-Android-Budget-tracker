import { test, expect } from '@playwright/test';
import { bypassOnboarding, openBalance } from '../fixtures/auth';

test.describe('Transactions', () => {
    test.beforeEach(async ({ page }) => {
        await bypassOnboarding(page);
    });

    test('should add income transaction and verify it appears in dashboard', async ({ page }) => {
        await page.getByTestId('add-income-button').click();
        const drawer = page.getByRole('dialog');
        await expect(drawer).toBeVisible();

        await drawer.getByTestId('transaction-amount-input').fill('1000');
        await drawer.getByTestId('transaction-note-input').fill('Test Income');
        await drawer.getByTestId('transaction-save-button').click();
        await expect(drawer).not.toBeVisible();

        await openBalance(page);
        await expect(page.getByText('Test Income')).toBeVisible();
    });

    test('should add expense transaction and verify negative amount and color', async ({ page }) => {
        await page.getByTestId('add-expense-button').click();
        const drawer = page.getByRole('dialog');
        await expect(drawer).toBeVisible();

        await drawer.getByTestId('transaction-amount-input').fill('500');
        await drawer.getByTestId('transaction-note-input').fill('Test Expense');
        await drawer.getByTestId('transaction-save-button').click();
        await expect(drawer).not.toBeVisible();
    });

    test('should add multiple transactions to trigger view-all button', async ({ page }) => {
        // Add income
        await page.getByTestId('add-income-button').click();
        let drawer = page.getByRole('dialog');
        await expect(drawer).toBeVisible();
        await drawer.getByTestId('transaction-amount-input').fill('1000');
        await drawer.getByTestId('transaction-note-input').fill('Test Income 1');
        await drawer.getByTestId('transaction-save-button').click();
        await expect(drawer).not.toBeVisible();

        // Add expense 1
        await page.getByTestId('add-expense-button').click();
        drawer = page.getByRole('dialog');
        await expect(drawer).toBeVisible();
        await drawer.getByTestId('transaction-amount-input').fill('500');
        await drawer.getByTestId('transaction-note-input').fill('Test Expense 1');
        await drawer.getByTestId('transaction-save-button').click();
        await expect(drawer).not.toBeVisible();

        // Add expense 2
        await page.getByTestId('add-expense-button').click();
        drawer = page.getByRole('dialog');
        await expect(drawer).toBeVisible();
        await drawer.getByTestId('transaction-amount-input').fill('300');
        await drawer.getByTestId('transaction-note-input').fill('Test Expense 2');
        await drawer.getByTestId('transaction-save-button').click();
        await expect(drawer).not.toBeVisible();

        // Add expense 3
        await page.getByTestId('add-expense-button').click();
        drawer = page.getByRole('dialog');
        await expect(drawer).toBeVisible();
        await drawer.getByTestId('transaction-amount-input').fill('200');
        await drawer.getByTestId('transaction-note-input').fill('Test Expense 3');
        await drawer.getByTestId('transaction-save-button').click();
        await expect(drawer).not.toBeVisible();

        // Add expense 4
        await page.getByTestId('add-expense-button').click();
        drawer = page.getByRole('dialog');
        await expect(drawer).toBeVisible();
        await drawer.getByTestId('transaction-amount-input').fill('100');
        await drawer.getByTestId('transaction-note-input').fill('Test Expense 4');
        await drawer.getByTestId('transaction-save-button').click();
        await expect(drawer).not.toBeVisible();

        // Add expense 5
        await page.getByTestId('add-expense-button').click();
        drawer = page.getByRole('dialog');
        await expect(drawer).toBeVisible();
        await drawer.getByTestId('transaction-amount-input').fill('400');
        await drawer.getByTestId('transaction-note-input').fill('Test Expense 5');
        await drawer.getByTestId('transaction-save-button').click();
        await expect(drawer).not.toBeVisible();

        await openBalance(page);
        await expect(page.getByText('Test Income 1')).toBeVisible();
        await expect(page.getByText('Test Expense 5')).toBeVisible();
    });

    test('should update dashboard balance summary after adding income and expense', async ({ page }) => {
        await page.setViewportSize({ width: 640, height: 812 });
        const balanceHeader = page.getByTestId('total-balance');
        const getBalance = async () => {
            const text = await balanceHeader.textContent();
            const cleanText = text?.replace(/[^-0-9,.]/g, '') || "0";
            const lastComma = cleanText.lastIndexOf(',');
            const lastDot = cleanText.lastIndexOf('.');


            let normalized;
            if (lastComma > lastDot) {
                normalized = cleanText.replace(/\./g, '').replace(',', '.');
            } else {
                normalized = cleanText.replace(/,/g, '');
            }
            return parseFloat(normalized);
        };

        const initialBalance = await getBalance();

        // Add income: 2000
        await page.getByTestId('add-income-button').click();
        const drawer = page.getByRole('dialog');
        await expect(drawer).toBeVisible();
        await drawer.getByTestId('transaction-amount-input').fill('2000');
        await drawer.getByTestId('transaction-save-button').click();
        await expect(drawer).not.toBeVisible();

        // Add expense: 800
        await page.getByTestId('add-expense-button').click();
        const expenseDrawer = page.getByRole('dialog');
        await expect(expenseDrawer).toBeVisible();
        await expenseDrawer.getByTestId('transaction-amount-input').fill('800');
        await expenseDrawer.getByTestId('transaction-note-input').fill('Test Expense');
        await expenseDrawer.getByTestId('transaction-save-button').click();
        await expect(expenseDrawer).not.toBeVisible();

        const finalBalance = await getBalance();
        // Delta should be exactly 1200 (income 2000 - expense 800)
        expect(finalBalance - initialBalance).toBe(1200);
    });

    test('pending (scheduled) expenses are scoped to the selected month', async ({ page }) => {
        await page.setViewportSize({ width: 640, height: 812 });

        // "Mein Budget" card value
        const budgetHeader = page.getByTestId('budget-card-value');
        const getBudget = async () => {
            const text = await budgetHeader.textContent();
            const clean = text?.replace(/[^-0-9,.]/g, '') || "0";
            const lastComma = clean.lastIndexOf(',');
            const lastDot = clean.lastIndexOf('.');
            let normalized;
            if (lastComma > lastDot) {
                normalized = clean.replace(/\./g, '').replace(',', '.');
            } else {
                normalized = clean.replace(/,/g, '');
            }
            return parseFloat(normalized);
        };

        const initialBudget = await getBudget();

        // Add a future-dated (next month) expense of 400
        await page.getByTestId('add-expense-button').click();
        const drawer = page.getByRole('dialog');
        await expect(drawer).toBeVisible();
        await drawer.getByTestId('transaction-amount-input').fill('400');
        await drawer.getByTestId('transaction-note-input').fill('Future Bill');

        // Pick a future day (next month, day 15) via the transaction form date picker
        await drawer.getByTestId('transaction-date-picker-button').click();
        await expect(page.getByTestId('date-picker-dialog')).toBeVisible();
        await page.getByTestId('date-picker-dialog').getByTestId('date-picker-next-month').click();
        await page.getByTestId('date-picker-dialog').getByRole('button', { name: '15' }).click();
        await page.getByTestId('date-picker-dialog').getByRole('button', { name: 'Select' }).click();
        await expect(page.getByTestId('date-picker-dialog')).not.toBeVisible();

        await drawer.getByTestId('transaction-save-button').click();
        await expect(drawer).not.toBeVisible();

        // The expense belongs to the next month, so the current month's budget is unchanged.
        await expect.poll(getBudget).toBe(initialBudget);

        // Navigate the dashboard summary to next month so the pending expense is in scope
        await page.getByTestId('main-date-picker-button').click();
        await expect(page.getByTestId('date-picker-dialog')).toBeVisible();
        await page.getByTestId('date-picker-dialog').getByTestId('date-picker-next-month').click();
        await page.getByTestId('date-picker-dialog').getByRole('button', { name: 'Select' }).click();
        await expect(page.getByTestId('date-picker-dialog')).not.toBeVisible();

        // The future expense is shown in the selected month's pending section.
        await openBalance(page);
        await expect(page.getByText('Future Bill')).toBeVisible();

    });

    test('should edit existing transaction and verify changes', async ({ page }) => {
        await openBalance(page);
        await expect(page.getByText('Groceries')).toBeVisible();

        const transactionItem = page.getByTestId('transaction-item').filter({ hasText: 'Groceries' }).first();
        await transactionItem.click();

        const drawer = page.locator('[role="dialog"]');
        await expect(drawer).toBeVisible();

        await drawer.getByTestId('transaction-amount-input').fill('200');
        await drawer.getByTestId('transaction-note-input').fill('Updated Groceries');
        await drawer.getByTestId('transaction-save-button').click();

        await expect(drawer).not.toBeVisible();
        await expect(page.getByText('Updated Groceries')).toBeVisible();
    });

    test('should delete transaction with confirmation dialog', async ({ page }) => {
        await openBalance(page);
        await expect(page.getByText('Concert Tickets')).toBeVisible();

        const transactionItem = page.getByTestId('transaction-item').filter({ hasText: 'Concert Tickets' }).first();
        await transactionItem.getByTestId('transaction-delete-button').click();

        const confirmDialog = page.locator('[role="alertdialog"]');
        await expect(confirmDialog).toBeVisible();
        await confirmDialog.getByTestId('transaction-delete-confirm-button').click();

        await expect(confirmDialog).not.toBeVisible();
        await expect(page.getByText('Concert Tickets')).not.toBeVisible();
    });

    test('should filter transactions by date', async ({ page }) => {
        await openBalance(page);
        await expect(page.getByText('Monthly Salary')).toBeVisible();

        // Balance filters are applied live from the filter drawer.
        await page.getByTestId('bilanz-filter-button').click();
        await page.locator('input[placeholder]').first().fill('Monthly Salary');
        await page.keyboard.press('Escape');
        await expect(page.getByText('Monthly Salary')).toBeVisible();
        await expect(page.getByText('Groceries')).not.toBeVisible();
    });

    test('should show future transactions in pending section', async ({ page }) => {
        await page.getByTestId('add-income-button').click();
        const drawer = page.getByRole('dialog');
        await expect(drawer).toBeVisible();

        await drawer.getByTestId('transaction-amount-input').fill('3000');
        await drawer.getByTestId('transaction-note-input').fill('Future Bonus');

        // Open the transaction form date picker and select a future date
        await drawer.getByTestId('transaction-date-picker-button').click();
        await expect(page.getByTestId('date-picker-dialog')).toBeVisible();

        // Navigate to next month to pick a future date
        await page.getByTestId('date-picker-dialog').getByTestId('date-picker-next-month').click();

        // Click day 15 in the next month's calendar
        await page.getByTestId('date-picker-dialog').getByRole('button', { name: '15' }).click();

        // Confirm the date selection
        await page.getByTestId('date-picker-dialog').getByRole('button', { name: 'Select' }).click();
        await expect(page.getByTestId('date-picker-dialog')).not.toBeVisible();

        // Save the transaction
        await drawer.getByTestId('transaction-save-button').click();
        await expect(drawer).not.toBeVisible();

        // Navigate the dashboard to next month using the summary date picker
        await page.getByTestId('main-date-picker-button').click();
        await expect(page.getByTestId('date-picker-dialog')).toBeVisible();
        await page.getByTestId('date-picker-dialog').getByTestId('date-picker-next-month').click();
        await page.getByTestId('date-picker-dialog').getByRole('button', { name: 'Select' }).click();
        await expect(page.getByTestId('date-picker-dialog')).not.toBeVisible();

        // Verify it appears in the expandable future section
        await openBalance(page);
        await expect(page.getByText('Future Bonus')).toBeVisible();
    });
});
