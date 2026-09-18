import { test, expect } from '@playwright/test';
import { bypassOnboarding } from '../fixtures/auth';

test.describe('Category Management', () => {
    test.beforeEach(async ({ page }) => {
        await bypassOnboarding(page);
    });

    test('should allow user to navigate to categories from dashboard', async ({ page }) => {
        await page.goto('/');

        // Open sidebar
        await page.getByTestId('sidebar-menu-button').click();

        // Click categories link
        await page.getByTestId('sidebar-link-income-categories').click();

        // Verify we are on categories page
        await expect(page).toHaveURL(/\/categories\/income/);
        await expect(page.getByRole('heading', { name: 'Income Categories' })).toBeVisible();
    });

    test('add a new custom category and verify it appears in grid', async ({ page }) => {
        await page.goto('/categories/expense');
        await expect(page).toHaveURL(/\/categories\/expense/);

        // Wait for grid to be visible
        await expect(page.getByTestId('category-grid')).toBeVisible({ timeout: 10000 });

        const customCategory = 'Vacation Fund ' + Date.now();
        await page.getByTestId('add-category-fab').click();

        // Fill form
        await page.getByTestId('category-name-input').fill(customCategory);

        // Choose icon - use SPA flower
        await page.getByAltText('spaFlower').click();

        // Save
        await page.getByTestId('save-category-button').click();

        // Verify it appears in grid
        await expect(page.getByText(customCategory)).toBeVisible();
    });

    test('verify default categories do not show a delete button', async ({ page }) => {
        await page.goto('/categories/expense');
        await expect(page).toHaveURL(/\/categories\/expense/);

        // Wait for grid to be visible
        await expect(page.getByTestId('category-grid')).toBeVisible({ timeout: 10000 });

        // Default categories should not have a delete button
        // Check "Housing" which is a known default category
        await expect(page.getByTestId('delete-category-housing')).not.toBeVisible();
    });

    test('delete a custom category via confirmation dialog', async ({ page }) => {
        await page.goto('/categories/expense');

        // 1. Create a custom category first
        const deleteMe = 'Temp ' + (Date.now() % 1000000);
        const deleteMeSlug = deleteMe.toLowerCase().replace(/\s+/g, '-');

        await page.getByTestId('add-category-fab').click();
        await page.getByTestId('category-name-input').fill(deleteMe);
        await page.getByAltText('pineapple').click();
        await page.getByTestId('save-category-button').click();

        // Wait for drawer to close
        await expect(page.locator('[role="dialog"]')).not.toBeVisible();

        // 2. Verify it was created
        await expect(page.getByText(deleteMe)).toBeVisible();

        // 3. Click delete button on new category chip
        const deleteBtn = page.getByTestId(`delete-category-${deleteMeSlug}`);
        await expect(deleteBtn).toBeVisible();
        await deleteBtn.click();

        // 4. Confirm in dialog
        const confirmBtn = page.getByTestId('confirm-delete-category-button');
        await expect(confirmBtn).toBeVisible();
        await confirmBtn.click();

        // Wait for dialog to close
        await expect(page.locator('[role="alertdialog"]')).not.toBeVisible();

        // 5. Verify removed from grid
        await expect(page.getByText(deleteMe)).not.toBeVisible();
    });

    test('add custom category and verify it is available in transaction selection', async ({ page }) => {
        // 1. Create custom category
        await page.goto('/categories/expense');

        const selectionTest = 'Secret Fund ' + Date.now();
        await page.getByTestId('add-category-fab').click();

        await page.getByTestId('category-name-input').fill(selectionTest);
        await page.getByAltText('spaFlower').click();
        await page.getByTestId('save-category-button').click();
        await expect(page.getByTestId('category-chip').filter({ hasText: selectionTest })).toBeVisible({ timeout: 10000 });

        // 2. Go to dashboard and verify category exists
        await page.goto('/');
        await expect(page.getByTestId('loading-spinner')).not.toBeVisible({ timeout: 15000 });

        // Open add transaction drawer
        await page.getByTestId('add-expense-button').click();

        // Search for category in selection
        // CategoryChip uses label as alt text if icon exists
        await expect(page.getByTestId('category-chip').filter({ hasText: selectionTest })).toBeVisible();
    });
});
