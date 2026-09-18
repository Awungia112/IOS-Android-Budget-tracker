import { test, expect } from '@playwright/test';
import { bypassOnboarding } from '../fixtures/auth';

test.describe('Limits', () => {
    test.beforeEach(async ({ page }) => {
        await bypassOnboarding(page);
        await page.goto('/limits');
    });

    test('list page renders with seeded limits', async ({ page }) => {
        await expect(page.getByTestId('limits-heading')).toBeVisible();
        await expect(page.getByTestId('limit-card-limit-household')).toBeVisible();
        await expect(page.getByTestId('limit-card-limit-entertainment')).toBeVisible();
        await expect(page.getByTestId('limits-add-button')).toBeVisible();
    });

    test('create a new limit', async ({ page }) => {
        await page.getByTestId('limits-add-button').click();
        await expect(page).toHaveURL(/\/limits\/add/);

        await page.getByTestId('limit-form-amount').fill('500');
        await page.getByTestId('limit-category-expense-general').click();
        await page.getByTestId('limit-form-save').click();

        await expect(page).toHaveURL(/\/limits$/);

        // The new General limit card should exist — scope assertion to it
        // to avoid false-positively matching "1.500,00" from the household limit
        const newLimitCard = page.locator('[data-testid^="limit-card-"]').filter({ hasText: /general/i });
        await expect(newLimitCard).toBeVisible();
        await expect(
            newLimitCard.getByText('500,00', { exact: false })
                .or(newLimitCard.getByText('500.00', { exact: false }))
        ).toBeVisible();
    });

    test('edit an existing limit', async ({ page }) => {
        await page.getByTestId('limit-edit-limit-household').click();
        await expect(page).toHaveURL(/\/limits\/edit\/limit-household/);

        await page.getByTestId('limit-form-amount').clear();
        await page.getByTestId('limit-form-amount').fill('2000');
        await page.getByTestId('limit-form-save').click();

        await expect(page).toHaveURL(/\/limits$/);

        // Verify the household limit card shows the updated amount
        const householdCard = page.getByTestId('limit-card-limit-household');
        await expect(
            householdCard.getByText('2.000,00', { exact: false })
                .or(householdCard.getByText('2,000.00', { exact: false }))
        ).toBeVisible();
    });

    test('view limit detail with spending derived from transactions', async ({ page }) => {
        await page.getByTestId('limit-card-limit-household').click();
        await expect(page).toHaveURL(/\/limits\/limit-household/);

        await expect(page.getByTestId('limit-detail-name')).toBeVisible();

        // Verify spending is derived from seeded transactions (1,200 rent expense in household category)
        const spendingEl = page.getByTestId('limit-detail-spending');
        await expect(
            spendingEl.getByText('1.200,00', { exact: false })
                .or(spendingEl.getByText('1,200.00', { exact: false }))
        ).toBeVisible();

        // Verify the limit amount (1,500) is displayed
        const amountEl = page.getByTestId('limit-detail-amount');
        await expect(
            amountEl.getByText('1.500,00', { exact: false })
                .or(amountEl.getByText('1,500.00', { exact: false }))
        ).toBeVisible();
    });

    test('delete a limit from detail page', async ({ page }) => {
        await page.goto('/limits/limit-entertainment');

        await expect(page.getByTestId('limit-detail-name')).toBeVisible();

        await page.getByTestId('limit-detail-delete').click();
        await page.getByTestId('limit-detail-delete-confirm').click();

        await expect(page).toHaveURL(/\/limits$/);
        await expect(page.getByTestId('limit-card-limit-entertainment')).toHaveCount(0);
    });

    test('date picker changes the displayed month for limits', async ({ page }) => {
        // The limits page should show a date picker
        const datePicker = page.getByTestId('limits-date-picker');
        await expect(datePicker).toBeVisible();

        // Verify the current month shows spending derived from seeded transactions.
        // Household has a 1,200 rent expense; entertainment has a 180 concert expense.
        const householdSpending = page.getByTestId('limit-card-spending-limit-household');
        await expect(
            householdSpending.getByText('1.200,00', { exact: false })
                .or(householdSpending.getByText('1,200.00', { exact: false }))
        ).toBeVisible();

        // Entertainment has 180 (concert) + 500 (savings goal payment) = 680 total
        const entertainmentSpending = page.getByTestId('limit-card-spending-limit-entertainment');
        await expect(
            entertainmentSpending.getByText('680,00', { exact: false })
                .or(entertainmentSpending.getByText('680.00', { exact: false }))
        ).toBeVisible();

        // Note the current date text
        const dateText = await datePicker.textContent();
        expect(dateText).toBeTruthy();

        // Open the date picker and select the previous month
        await datePicker.click();
        const dialog = page.getByTestId('date-picker-dialog');
        await expect(dialog).toBeVisible();

        // Navigate to the previous month
        const prevMonthButton = dialog.locator('button').first();
        await prevMonthButton.click();
        await dialog.getByRole('button', { name: 'Select' }).click();

        // Dialog should close
        await expect(dialog).not.toBeVisible();

        // The date text should have changed
        const updatedDateText = await datePicker.textContent();
        expect(updatedDateText).not.toBe(dateText);

        // In the previous month there are no seeded transactions,
        // so spending should reset to 0 for both limits.
        const householdCard = page.getByTestId('limit-card-limit-household');
        await expect(householdCard).toBeVisible();

        // Verify household spending shows 0 (not 1,200 from the current month).
        // The spending container shows "spending / limit", so use .first() to target the spending span.
        const updatedHouseholdSpending = page.getByTestId('limit-card-spending-limit-household');
        await expect(
            updatedHouseholdSpending.locator('span').first()
        ).toHaveText(/^0[,.]00/);

        // Verify entertainment spending also shows 0 (not 680 from the current month)
        const updatedEntertainmentSpending = page.getByTestId('limit-card-spending-limit-entertainment');
        await expect(
            updatedEntertainmentSpending.locator('span').first()
        ).toHaveText(/^0[,.]00/);
    });
});
