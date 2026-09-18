import { test, expect } from '@playwright/test';
import { bypassOnboarding } from '../fixtures/auth';

test.describe('Navigation', () => {
    test.beforeEach(async ({ page }) => {
        await bypassOnboarding(page);
    });

    test('should open sidebar menu', async ({ page }) => {
        // Open sidebar using hamburger menu
        await page.getByTestId('sidebar-menu-button').click();

        // Verify sidebar is open
        await expect(page.getByTestId('sidebar-container')).toBeVisible();
        await expect(page.getByTestId('sidebar-link-income-categories')).toBeVisible();
    });

    test('should navigate to correct pages via sidebar links', async ({ page }) => {
        // Open sidebar
        await page.getByTestId('sidebar-menu-button').click();
        await expect(page.getByTestId('sidebar-container')).toBeVisible();

        // Navigate to Categories
        await page.getByTestId('sidebar-link-income-categories').click();
        await expect(page).toHaveURL(/\/categories\/income/);
        await expect(page.getByRole('heading', { name: 'Income Categories', exact: true })).toBeVisible();

        // Navigate to Settings
        await page.getByTestId('sidebar-menu-button').click();
        await expect(page.getByTestId('sidebar-container')).toBeVisible();
        await page.getByTestId('sidebar-link-settings').click();
        await expect(page).toHaveURL(/\/settings/);
        await expect(page.getByRole('heading', { name: 'Settings', exact: true })).toBeVisible();
    });

    test('should navigate correctly via bottom navigation', async ({ page }) => {
        // Navigate to Savings Goals via bottom nav
        await page.getByTestId('bottom-nav-savings').click();
        await expect(page).toHaveURL(/\/savings-goals/);
        await expect(page.getByTestId('savings-goals-heading')).toBeVisible();

        // Navigate to Limits via bottom nav
        await page.getByTestId('bottom-nav-limits').click();
        await expect(page).toHaveURL(/\/limits/);
        await expect(page.getByTestId('limits-heading')).toBeVisible();

        // Navigate to Statistics via bottom nav
        await page.getByTestId('bottom-nav-statistics').click();
        await expect(page).toHaveURL(/\/statistics/);
        await expect(page.getByTestId('statistics-heading')).toBeVisible();

        // Navigate back to Dashboard
        await page.getByTestId('bottom-nav-overview').click();
        await expect(page).toHaveURL(/\/$/);

        // Verify dashboard content
        await expect(page.getByTestId('balance-header')).toBeVisible();
    });

    test('should logout from sidebar and redirect to onboarding', async ({ page }) => {
        // Open sidebar
        await page.getByTestId('sidebar-menu-button').click();

        // Click logout button - wait for visibility
        await expect(page.getByTestId('sidebar-logout-button')).toBeVisible();
        await page.getByTestId('sidebar-logout-button').click();

        // Should be redirected to onboarding
        await expect(page).toHaveURL(/\/onboarding/);

        // Verify onboarding slide content
        await expect(page.getByTestId('welcome-heading').first()).toBeVisible();
    });

    test('should handle navigation between different sections smoothly', async ({ page }) => {
        // Complex navigation sequence
        await page.getByTestId('bottom-nav-savings').click();
        await expect(page).toHaveURL(/\/savings-goals/);

        await page.getByTestId('bottom-nav-limits').click();
        await expect(page).toHaveURL(/\/limits/);

        await page.getByTestId('bottom-nav-overview').click();
        await expect(page).toHaveURL(/\/$/);

        // Open sidebar and go to settings
        await page.getByTestId('sidebar-menu-button').click();
        await page.getByTestId('sidebar-link-settings').click();
        await expect(page).toHaveURL(/\/settings/);
    });
});
