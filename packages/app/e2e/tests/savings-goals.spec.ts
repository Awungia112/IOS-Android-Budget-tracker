import { test, expect } from '@playwright/test';
import { bypassOnboarding } from '../fixtures/auth';

test.describe('Savings Goals', () => {
    test.beforeEach(async ({ page }) => {
        await bypassOnboarding(page);
        await page.goto('/savings-goals');
    });

    test('list renders with seeded goals', async ({ page }) => {
        await expect(page.getByTestId('savings-goals-heading')).toBeVisible();

        await expect(page.getByTestId('savings-goal-card-goal-vacation')).toBeVisible();
        await expect(page.getByTestId('savings-goal-card-goal-laptop')).toBeVisible();

        // Vacation goal has a 500 savings transaction, so its progress bar has height > 0
        await expect(page.getByTestId('savings-goal-progress-goal-vacation')).toBeVisible();
        // Laptop goal has no linked transactions, so its progress bar has 0% height (hidden)
        await expect(page.getByTestId('savings-goal-progress-goal-laptop')).toBeAttached();
    });

    test('create a new goal via form page', async ({ page }) => {
        await page.getByTestId('savings-goals-add-button').click();
        await expect(page).toHaveURL(/\/savings-goals\/add/);

        // Fill the target amount
        await page.getByTestId('savings-goal-form-amount').fill('5000');

        // Fill the goal name
        await page.getByTestId('savings-goal-form-name').fill('Household Goal');

        // Select a category (expense-household)
        await page.getByTestId('savings-goal-category-expense-household').click();

        // Save
        await page.getByTestId('savings-goal-form-save').click();

        // Should redirect to the savings goals list
        await expect(page).toHaveURL(/\/savings-goals$/);

        // A new goal card should appear (the household category name translated)
        const newCards = page.locator('[data-testid^="savings-goal-card-"]');
        // We had 2 seeded goals, now should have 3
        await expect(newCards).toHaveCount(3);
    });

    test('edit an existing goal', async ({ page }) => {
        // Click edit on the vacation goal
        await page.getByTestId('savings-goal-edit-goal-vacation').click();
        await expect(page).toHaveURL(/\/savings-goals\/edit\/goal-vacation/);

        // Clear and update the target amount
        await page.getByTestId('savings-goal-form-amount').clear();
        await page.getByTestId('savings-goal-form-amount').fill('4000');
        await page.getByTestId('savings-goal-form-save').click();

        // Should redirect to the savings goals list
        await expect(page).toHaveURL(/\/savings-goals$/);

        // Verify the updated amount appears on the vacation goal card
        const vacationCard = page.getByTestId('savings-goal-card-goal-vacation');
        await expect(
            vacationCard.getByText('4.000,00', { exact: false })
                .or(vacationCard.getByText('4,000.00', { exact: false }))
        ).toBeVisible();
    });

    test('delete a goal from detail page', async ({ page }) => {
        // Navigate to the laptop goal detail page
        await page.getByTestId('savings-goal-card-goal-laptop').click();
        await expect(page).toHaveURL(/\/savings-goals\/goal-laptop/);

        // Click delete and confirm
        await page.getByTestId('savings-goal-detail-delete').click();
        await page.getByTestId('savings-goal-detail-delete-confirm').click();

        // Should redirect to the savings goals list
        await expect(page).toHaveURL(/\/savings-goals$/);

        // The laptop goal should be completely removed from the DOM
        await expect(page.getByTestId('savings-goal-card-goal-laptop')).toHaveCount(0);

        // The vacation goal should remain unaffected
        await expect(page.getByTestId('savings-goal-card-goal-vacation')).toBeVisible();
    });

    test('progress reflects actual savings from transactions', async ({ page }) => {
        // --- Step 1: Verify progress on the list page ---
        // The vacation goal has targetAmount=3000 and a seeded 500 savings transaction.
        const vacationCard = page.getByTestId('savings-goal-card-goal-vacation');
        await expect(vacationCard).toBeVisible();

        // Verify saved amount (500) derived from the seeded transaction
        await expect(
            vacationCard.getByText('500,00', { exact: false })
                .or(vacationCard.getByText('500.00', { exact: false }))
        ).toBeVisible();

        // Verify target amount (3,000)
        await expect(
            vacationCard.getByText('3.000,00', { exact: false })
                .or(vacationCard.getByText('3,000.00', { exact: false }))
        ).toBeVisible();

        // The vacation progress bar should have non-zero height (500/3000 ≈ 16.7%)
        const vacationProgress = page.getByTestId('savings-goal-progress-goal-vacation');
        await expect(vacationProgress).toBeVisible();
        const vacationBox = await vacationProgress.boundingBox();
        expect(vacationBox).not.toBeNull();
        expect(vacationBox!.height).toBeGreaterThan(0);

        // The laptop goal has NO savings transactions — its progress should be zero
        const laptopProgress = page.getByTestId('savings-goal-progress-goal-laptop');
        await expect(laptopProgress).toBeAttached();
        const laptopBox = await laptopProgress.boundingBox();
        // Laptop progress bar should have zero or negligible height compared to vacation
        if (laptopBox && vacationBox) {
            expect(vacationBox.height).toBeGreaterThan(laptopBox.height);
        }

        // --- Step 2: Navigate to vacation goal detail and verify transaction-derived data ---
        await vacationCard.click();
        await expect(page).toHaveURL(/\/savings-goals\/goal-vacation/);

        // Saved amount on detail page should match the seeded 500 transaction total
        const savedAmount = page.getByTestId('savings-goal-detail-saved');
        await expect(
            savedAmount.getByText('500,00', { exact: false })
                .or(savedAmount.getByText('500.00', { exact: false }))
        ).toBeVisible();

        // Payments info should show 1 payment made (from the single seeded transaction)
        const paymentsInfo = page.getByTestId('savings-goal-detail-payments');
        await expect(paymentsInfo).toBeVisible();
        await expect(paymentsInfo).toContainText('1');
        await expect(paymentsInfo).toContainText(/payments made|Zahlungen/i);

        // The seeded payment should appear in the payment timeline
        // (detail page shows date and amount per entry)
        const timelineEntry = page.locator('[class*="border-dashed"]').filter({ hasText: /500/ });
        await expect(timelineEntry.first()).toBeVisible();
    });
});
