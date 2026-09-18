import { test, expect } from '@playwright/test';
import { bypassOnboarding } from '../fixtures/auth';

test.describe('Smoke Test', () => {
    test('verify app loads and shows onboarding for new users', async ({ page }) => {
        await page.goto('/');

        // Should be redirected to /onboarding if not completed
        await expect(page).toHaveURL(/\/onboarding/);

        // Check for some onboarding content (using data-testid for stability)
        await expect(page.getByTestId('welcome-heading').first()).toBeVisible();
    });

    test('verify dashboard renders after onboarding bypass', async ({ page }) => {
        await bypassOnboarding(page);
        await page.setViewportSize({ width: 640, height: 812 });
        await page.goto('/');

        // Should be on dashboard (Index page)
        await expect(page).toHaveURL(/\/$/);

        // Check for dashboard elements (using data-testid for stability)
        await expect(page.getByTestId('balance-header')).toBeVisible();

        // Verify seeded data is visible (Total Balance, Income, Expenses)
        // We use { exact: false } and .first() to be resilient against multiple matches (e.g. summary box vs transaction list)
        await expect(page.getByText('5.000,00', { exact: false }).or(page.getByText('5,000.00', { exact: false })).first()).toBeVisible();
        await expect(page.getByText('2.030,50', { exact: false }).or(page.getByText('2,030.50', { exact: false })).first()).toBeVisible();
        await expect(page.getByText('2.969,50', { exact: false }).or(page.getByText('2,969.50', { exact: false })).first()).toBeVisible();

        // EXTRA CHECK: Ensure the DesktopOverlay is NOT visible (confirming mobile viewport is working)
        await expect(page.locator('text=Open on your mobile device')).not.toBeVisible();
    });
});
