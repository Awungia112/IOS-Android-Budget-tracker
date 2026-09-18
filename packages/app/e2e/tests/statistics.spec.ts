import { test, expect } from '@playwright/test';
import { bypassOnboarding } from '../fixtures/auth';

test.describe('Statistics', () => {
    test.beforeEach(async ({ page }) => {
        await bypassOnboarding(page);
    });

    test('page renders with correct totals', async ({ page }) => {
        await page.goto('/statistics');

        await expect(page.getByTestId('statistics-heading')).toBeVisible();

        // Balance tab is the default — savings rate (balance) is shown in the donut centre
        const savingsRate = page.getByTestId('statistics-savings-rate');
        await expect(savingsRate).toBeVisible();

        // Navigate to History tab for income/expense totals
        await page.getByRole('button', { name: /history/i }).click();

        // Income: 5,000.00 (single salary transaction)
        const totalIncome = page.getByTestId('statistics-total-income');
        await expect(totalIncome).toBeVisible();
        await expect(
            totalIncome.getByText('5.000,00', { exact: false })
                .or(totalIncome.getByText('5,000.00', { exact: false }))
        ).toBeVisible();

        // Expenses: 1,200 + 150.50 + 180 + 500 (savings goal payment) = 2,030.50
        const totalExpenses = page.getByTestId('statistics-total-expenses');
        await expect(totalExpenses).toBeVisible();
        await expect(
            totalExpenses.getByText('2.030,50', { exact: false })
                .or(totalExpenses.getByText('2,030.50', { exact: false }))
        ).toBeVisible();
    });

    test('top categories display with income and expense entries', async ({ page }) => {
        await page.goto('/statistics');
        await expect(page.getByTestId('statistics-heading')).toBeVisible();

        // Top categories are on the History tab
        await page.getByRole('button', { name: /history/i }).click();

        const topCategories = page.getByTestId('statistics-top-categories');
        await expect(topCategories).toBeVisible();

        // Seed data has 3 expense categories and 1 income category with transactions,
        // so we expect at least 2 category icons (1 top income + 1 top expense).
        await expect(topCategories.locator('img').nth(1)).toBeVisible();
    });

    test('bar chart renders with data for current month', async ({ page }) => {
        await page.goto('/statistics');
        await expect(page.getByTestId('statistics-heading')).toBeVisible();

        // Chart is on the History tab
        await page.getByRole('button', { name: /history/i }).click();

        await expect(page.getByTestId('statistics-chart')).toBeVisible();

        // The current month's bar should render with meaningful height since seed data uses today's date
        const currentMonth = new Date().getMonth();
        const bar = page.getByTestId(`statistics-chart-bar-${currentMonth}`);
        await expect(bar).toBeVisible();

        const box = await bar.boundingBox();
        expect(box).not.toBeNull();
        expect(box!.height).toBeGreaterThan(0);
    });

    test('date picker changes displayed month', async ({ page }) => {
        await page.goto('/statistics');

        // Switch Balance tab to monthly mode so the date display shows month + year
        await page.getByTestId('balance-period-monthly').click();

        const dateDisplay = page.getByTestId('statistics-date-display');
        await expect(dateDisplay).not.toHaveText('');
        const initialDateText = await dateDisplay.textContent();
        expect(initialDateText).toBeTruthy();

        // Open the date picker dialog
        await page.getByTestId('statistics-date-picker').click();
        const dialog = page.getByTestId('date-picker-dialog');
        await expect(dialog).toBeVisible();

        // Navigate to the previous month using the prev-month button (left arrow in the dialog header)
        const prevMonthButton = dialog.locator('button').first();
        await expect(prevMonthButton).toBeVisible();
        await prevMonthButton.click();

        await dialog.getByRole('button', { name: 'Select' }).click();

        // The dialog should close
        await expect(dialog).not.toBeVisible();

        // The date display text should have changed to the previous month
        await expect(dateDisplay).not.toHaveText(initialDateText!);
    });
});
