import { test, expect, type Page } from '@playwright/test';
import { bypassOnboarding, openBalance } from '../fixtures/auth';

/**
 * Helper function to wait for any visible toasts to disappear
 * This ensures toasts don't block interactive elements before performing actions
 */
async function waitForToastsToDisappear(page: Page) {
    // Wait for any open toast to close (toast has data-state="open" when visible)
    // We wait for the toast viewport to not have any open toasts
    await page.waitForFunction(() => {
        const viewport = document.querySelector('[data-radix-toast-viewport]');
        if (!viewport) return true;
        const openToasts = viewport.querySelectorAll('[data-state="open"]');
        return openToasts.length === 0;
    }, { timeout: 5000 }).catch(() => {
        // If wait fails (no toast viewport or timeout), continue - toast may have already disappeared
    });
}

/**
 * Templates E2E Tests
 * Covers: Create, Apply, Edit, Delete.
 */
test.describe('Transaction Templates', () => {
    test.beforeEach(async ({ page }) => {
        await bypassOnboarding(page);
    });

    test('create a new template and verify it appears in the list', async ({ page }) => {
        await page.goto('/templates');

        // Click "Create Template" button (empty state)
        await page.getByRole('button', { name: 'Create Template' }).click();

        const templateName = 'Lunch Template';
        await page.getByPlaceholder('Enter title').fill(templateName);
        await page.getByPlaceholder('Enter amount').fill('15.50');

        // Select a category: "General" (Allgemein) is a safe default
        // The buttons use aria-label with translated label
        await page.getByRole('button', { name: 'General' }).click();

        // Click Save (in the header)
        await page.getByRole('button', { name: 'Save' }).click();

        // Verify it appears in the list
        await expect(page.getByText(templateName)).toBeVisible();
        await expect(page.getByText('15,50').or(page.getByText('15.50'))).toBeVisible();
    });

    test('apply a template and verify transaction on dashboard', async ({ page }) => {
        await page.goto('/templates');
        
        // Create a template first
        await page.getByRole('button', { name: 'Create Template' }).click();

        const templateName = 'ApplyMe';
        await page.getByPlaceholder('Enter title').fill(templateName);
        await page.getByPlaceholder('Enter amount').fill('25');
        await page.getByRole('button', { name: 'General' }).click();
        await page.getByRole('button', { name: 'Save' }).click();

        // Verify template appears in list before applying
        await expect(page.getByText(templateName)).toBeVisible();

        // Apply (Arrow icon button)
        await page.getByRole('button', { name: 'Apply' }).click();

        // Wait for toast to disappear after apply
        await waitForToastsToDisappear(page);

        await openBalance(page);
        await expect(page.getByTestId('transaction-item').filter({ hasText: templateName })).toBeVisible({ timeout: 5000 });
        const templateTransaction = page.getByTestId('transaction-item').filter({ hasText: templateName });
        await expect(
            templateTransaction.getByText('-25,00 €', { exact: true })
                .or(templateTransaction.getByText('-25.00 €', { exact: true }))
        ).toBeVisible();
    });

    test('edit an existing template', async ({ page }) => {
        await page.goto('/templates');
        
        // Create a template first
        await page.getByRole('button', { name: 'Create Template' }).click();
        await page.getByPlaceholder('Enter title').fill('Old Template');
        await page.getByPlaceholder('Enter amount').fill('10');
        await page.getByRole('button', { name: 'General' }).click();
        await page.getByRole('button', { name: 'Save' }).click();

        // Verify template appears
        await expect(page.getByText('Old Template')).toBeVisible();

        // Click Edit (Pencil icon button)
        await page.getByRole('button', { name: 'Edit' }).click();

        const newName = 'New Template Name';
        await page.getByPlaceholder('Enter title').fill(newName);
        await page.getByRole('button', { name: 'Save' }).click();

        // Verify updated name is visible
        await expect(page.getByText(newName)).toBeVisible();
    });

    test('delete a template', async ({ page }) => {
        await page.goto('/templates');
        
        // Create a template first
        await page.getByRole('button', { name: 'Create Template' }).click();
        const deleteName = 'Delete Me Temp';
        await page.getByPlaceholder('Enter title').fill(deleteName);
        await page.getByPlaceholder('Enter amount').fill('5');
        await page.getByRole('button', { name: 'General' }).click();
        await page.getByRole('button', { name: 'Save' }).click();

        // Verify template appears before deleting
        await expect(page.getByText(deleteName)).toBeVisible();

        // Click Delete (Trash icon button)
        await page.getByRole('button', { name: 'Delete' }).click();

        // Confirmation dialog button
        await page.getByRole('button', { name: 'Delete' }).last().click();

        // Wait for toast to disappear after delete
        await waitForToastsToDisappear(page);

        // Verify template is removed
        await expect(page.getByText(deleteName)).not.toBeVisible();
    });
});
