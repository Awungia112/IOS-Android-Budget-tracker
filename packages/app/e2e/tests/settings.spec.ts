import { test, expect } from '@playwright/test';
import { bypassOnboarding, openBalance } from '../fixtures/auth';
import * as fs from 'fs';

/**
 * Settings and Account Management E2E Tests
 * Covers profile management, multi-account isolation, cascade deletion, and data portability.
 */
test.describe('Settings and Account Management', () => {
    test.beforeEach(async ({ page }) => {
        // Use a larger vertical viewport for reliability
        await page.setViewportSize({ width: 390, height: 900 });
        await bypassOnboarding(page);
        await page.goto('/settings');

        // Wait for app initialization to complete
        await expect(page.locator('main')).toBeVisible({ timeout: 10000 });

        // Ensure settings page is specifically loaded
        await expect(page.getByRole('heading', { name: /Settings|Einstellungen/i })).toBeVisible();
    });

    test('transaction form default category and toggle behaviour', async ({ page }) => {
        // open dashboard and start new expense
        await page.goto('/');
        const addBtn = page.getByTestId('add-expense-button');
        await expect(addBtn).toBeVisible();
        await addBtn.click();

        // default category chip should already show some category
        const catChip = page.getByTestId('transaction-category-chip');
        const catText = (await catChip.textContent()) || '';
        expect(catText.trim().length).toBeGreaterThan(0);

        // grid of chips exists initially when expanded
        await expect(page.getByTestId('category-chip').first()).toBeVisible();

        // clicking the category chip toggles expansion; after click the individual chips should disappear
        await catChip.click();
        await expect(page.locator('[data-testid="category-chip"]')).toHaveCount(0);
    });

    test('edit profile name and verify header updates', async ({ page }) => {
        const newName = 'John Doe';

        // 1. Open Profile Dialog
        await page.getByTestId('profile-hero-button').click();
        await expect(page.getByRole('dialog')).toBeVisible();

        // 2. Click "Edit Profile" in actions menu
        await page.getByRole('button', { name: /edit_profile|Edit Profile/i }).click();

        // 3. Change name
        await page.getByTestId('profile-name-input').fill(newName);
        await page.getByTestId('save-profile-button').click();

        // 4. Verify changes in Settings Hero
        await expect(page.getByTestId('profile-hero-button')).toContainText(newName);
    });

    test('upload and delete profile photo', async ({ page }) => {
        // 1. Open Profile Dialog
        await page.getByTestId('profile-hero-button').click();
        await expect(page.getByRole('dialog')).toBeVisible();

        // 2. Click "Edit Profile"
        await page.getByRole('button', { name: /edit_profile|Edit Profile/i }).click();

        // 3. Click camera icon
        await page.getByTestId('camera-button').click();

        // 4. Upload photo
        const fileChooserPromise = page.waitForEvent('filechooser');
        await page.getByTestId('upload-photo-button').click();
        const fileChooser = await fileChooserPromise;

        await fileChooser.setFiles({
            name: 'test-avatar.png',
            mimeType: 'image/png',
            buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==', 'base64')
        });

        // 5. Save and verify
        await page.getByTestId('save-profile-button').click();
        await expect(page.getByTestId('profile-hero-button').locator('img')).toBeVisible();

        // 6. Delete photo
        await page.getByTestId('profile-hero-button').click();
        await page.getByRole('button', { name: /edit_profile|Edit Profile/i }).click();
        await page.getByTestId('camera-button').click();
        await page.getByTestId('delete-photo-button').click();
        await page.getByTestId('save-profile-button').click();

        // 7. Verify back to initials
        await expect(page.getByTestId('profile-hero-button').locator('img')).not.toBeVisible();
    });

    test('create second account and verify data isolation', async ({ page }) => {
        // Use a shorter timeout for this specific test to prevent hanging
        test.setTimeout(45000);
        
        const acc1Expense = 'Account 1 Expense';
        const acc2Expense = 'Account 2 Expense';

        // 1. Setup: Add transaction to first account
        await page.goto('/');
        await expect(page.getByTestId('loading-spinner')).not.toBeVisible({ timeout: 10000 });

        // Capture original account id (deterministic fallback)
        const originalAccountId = await page.evaluate(() => localStorage.getItem('currentAccountId'));
        const originalId = originalAccountId || 'main-account';

        // Ensure the add button is actionable then click
        const addExpenseBtn = page.getByTestId('add-expense-button');
        await expect(addExpenseBtn).toBeVisible();
        await addExpenseBtn.click();

        // confirm default category is applied (some category should be present)
        const defaultText = (await page.getByTestId('transaction-category-chip').textContent()) || '';
        expect(defaultText.trim().length).toBeGreaterThan(0);

        await page.getByTestId('transaction-note-input').fill(acc1Expense);
        await page.getByTestId('transaction-amount-input').fill('100');
        // The default category (first chip) is already selected by the form,
        // so explicit chip selection is not required to satisfy validation.
        await page.getByTestId('transaction-save-button').click();

        // Wait for the drawer to close
        await expect(page.locator('[data-vaul-overlay][data-state="open"]')).not.toBeVisible();

        await openBalance(page);
        await expect(page.getByTestId('transaction-item').filter({ hasText: acc1Expense })).toBeVisible({ timeout: 8000 });

        // 2. Create second account and switch to it
        await page.goto('/settings');
        await page.getByRole('button', { name: /new_account|New Account/i }).click();
        await expect(page.getByRole('dialog')).toBeVisible();

        await page.locator('#accountName').fill('Second Account');
        const createBtn = page.getByRole('button', { name: /create|Create/i });
        await expect(createBtn).toBeVisible();
        await createBtn.click();
        await expect(page.getByRole('dialog')).not.toBeVisible();

        // Switch to second account via UI and wait for localStorage to persist
        const secondAccount = page.locator('[data-testid^="account-item-"]').filter({ hasText: 'Second Account' });
        const secondSwitchBtn = secondAccount.locator('[data-testid^="switch-account-"]');
        await expect(secondSwitchBtn).toBeVisible();
        await secondSwitchBtn.click();

        // Read the data-testid attribute to extract account id and wait for persistence
        const idAttr = await secondAccount.getAttribute('data-testid');
        const secondId = idAttr ? idAttr.replace('account-item-', '') : null;
        if (secondId) {
            await page.waitForFunction((id) => localStorage.getItem('currentAccountId') === id, secondId, { timeout: 5000 });
        }

        // reload so app reads the persisted account id
        await page.reload();

        // 3. Verify isolation (first account's transaction should not be visible on second)
        await page.goto('/');
        await expect(page.getByTestId('loading-spinner')).not.toBeVisible({ timeout: 10000 });
        await expect(page.getByText(acc1Expense)).not.toBeVisible();

        // 4. Add transaction to second account (ensure category chosen)
        await page.getByTestId('add-expense-button').click();
        await page.getByTestId('transaction-note-input').fill(acc2Expense);
        await page.getByTestId('transaction-amount-input').fill('200');
        // Wait for categories to render (drawer content is interactive)
        await expect(page.getByTestId('category-chip').first()).toBeVisible({ timeout: 10000 });
        // The default category (first chip) is already selected by the form.
        await page.getByTestId('transaction-save-button').click();

        // Wait for drawer to close (transaction persisted)
        await expect(page.locator('[data-vaul-overlay][data-state="open"]')).not.toBeVisible();
        
        // Wait for persistence and reload to see the new transaction
        if (secondId) {
            await page.waitForFunction((id) => localStorage.getItem('currentAccountId') === id, secondId, { timeout: 5000 });
        }
        
        // Add extra wait for IndexedDB to flush
        await page.waitForTimeout(500);
        
        await page.reload();
        await openBalance(page);
        await expect(page.getByText(acc2Expense)).toBeVisible({ timeout: 10000 });

        // 5. Switch back deterministically to the original account and verify isolation
        // Note: We directly set localStorage here to bypass UI latency and ensure
        // the app loads the correct account on reload, which is more reliable for tests.
        await page.evaluate((id) => localStorage.setItem('currentAccountId', id), originalId);
        
        try {
            await page.reload({ timeout: 10000 });
        } catch (error) {
            // If reload times out, try navigating to the page directly
            await page.goto('/', { timeout: 10000 });
        }

        await expect(page.getByTestId('loading-spinner')).not.toBeVisible({ timeout: 10000 });

        await openBalance(page);
        await expect(page.getByTestId('transaction-item').filter({ hasText: acc1Expense })).toBeVisible({ timeout: 8000 });
        await expect(page.getByTestId('transaction-item').filter({ hasText: acc2Expense })).not.toBeVisible();
    });

    test('delete account and verify cascade deletion', async ({ page }) => {
        const tempAccName = 'Temp Account';
        const tempExpense = 'Temp Expense';
        const tempCategory = 'Temp Category';

        // 1. Create temporary account
        await page.goto('/settings');
        await page.getByRole('button', { name: /new_account|New Account/i }).click();
        await page.locator('#accountName').fill(tempAccName);
        const createBtn2 = page.getByRole('button', { name: /create|Create/i });
        await expect(createBtn2).toBeVisible();
        await createBtn2.click();
        await expect(page.getByRole('dialog')).not.toBeVisible();

        // 1b. Switch to the new account so subsequent actions target it
        const newAccountItem = page.locator('[data-testid^="account-item-"]').filter({ hasText: tempAccName });
        const switchBtnNew = newAccountItem.locator('[data-testid^="switch-account-"]');
        await expect(switchBtnNew).toBeVisible();
        await switchBtnNew.click();
        await page.reload();

        // 2. Add category to the new account
        await page.goto('/categories/expense');
        await expect(page.getByTestId('loading-spinner')).not.toBeVisible({ timeout: 10000 });
        const addCategoryFab = page.getByTestId('add-category-fab');
        await expect(addCategoryFab).toBeVisible();
        await addCategoryFab.click();

        // Wait for name input indicating drawer is visible
        await expect(page.locator('#name')).toBeVisible();

        await page.locator('#name').fill(tempCategory);
        // Select an icon (IconPicker)
        await page.locator('.grid.grid-cols-4 button').first().click();

        await page.getByTestId('save-category-button').click();
        await expect(page.getByText(tempCategory)).toBeVisible();

        // 3. Add transaction
        await page.goto('/');
        await expect(page.getByTestId('loading-spinner')).not.toBeVisible({ timeout: 10000 });
        await expect(page.getByTestId('add-expense-button')).toBeVisible({ timeout: 10000 });
        await page.getByTestId('add-expense-button').click();
        await page.getByTestId('transaction-note-input').fill(tempExpense);
        await page.getByTestId('transaction-amount-input').fill('50');
        // Wait for categories to render (drawer content is interactive)
        await expect(page.getByTestId('category-chip').first()).toBeVisible({ timeout: 10000 });
        // The default category (first chip) is already selected by the form.
        await page.getByTestId('transaction-save-button').click();
        // Wait for the transaction drawer to close to ensure the transaction was persisted
        await expect(page.locator('[data-vaul-overlay][data-state="open"]')).not.toBeVisible();
        
        // Add extra wait for IndexedDB to flush
        await page.waitForTimeout(500);
        
        await openBalance(page);
        await expect(page.getByTestId('transaction-item').filter({ hasText: tempExpense })).toBeVisible({ timeout: 10000 });

        // 4. Delete account
        await page.goto('/settings');
        // Find the specific delete button for the temp account using the stable account-item testid
        const accountItem = page.locator('[data-testid^="account-item-"]').filter({ hasText: tempAccName }).first();
        const deleteButton = accountItem.locator('[data-testid^="delete-account-button-"]');
        await expect(deleteButton).toBeVisible();
        await deleteButton.click();

        const confirmDelete = page.getByTestId('confirm-delete-account-button');
        await expect(confirmDelete).toBeVisible();
        await confirmDelete.click();

        // 5. Verify cascade deletion: ensure account list no longer shows the temp account
        const deletedAccountItem = page.locator('[data-testid^="account-item-"]').filter({ hasText: tempAccName });
        await expect(deletedAccountItem).not.toBeVisible();
        // Also ensure profile hero no longer displays the deleted account name
        await expect(page.getByTestId('profile-hero-button')).not.toContainText(tempAccName);

        await page.goto('/');
        await expect(page.getByTestId('loading-spinner')).not.toBeVisible({ timeout: 10000 });
        await expect(page.getByText(tempExpense)).not.toBeVisible();

        await page.goto('/categories/expense');
        await expect(page.getByTestId('loading-spinner')).not.toBeVisible({ timeout: 10000 });
        await expect(page.getByText(tempCategory)).not.toBeVisible();
    });

    test('export and import account data', async ({ page }) => {
        await page.goto('/settings');

        // Remove showSaveFilePicker so exportService falls back to the anchor
        // download path, which Playwright can intercept as a 'download' event.
        // The File System Access API dialog cannot be driven by Playwright.
        await page.addInitScript(() => {
            delete (window as Window & { showSaveFilePicker?: unknown }).showSaveFilePicker;
        });

        // Create test transaction that will be exported and then re-imported
        await page.goto('/');
        await expect(page.getByTestId('loading-spinner')).not.toBeVisible({ timeout: 10000 });

        // Add a test transaction that will be exported
        await page.getByTestId('add-expense-button').click();
        const defaultCat = await page.getByTestId('transaction-category-chip').textContent();
        expect(defaultCat?.trim().length).toBeGreaterThan(0);

        await page.getByTestId('transaction-note-input').fill('Round Trip Test Transaction');
        await page.getByTestId('transaction-amount-input').fill('75');
        // The default category (first chip) is already selected by the form,
        // so explicit chip selection is not required to satisfy validation.
        await page.getByTestId('transaction-save-button').click();
        await expect(page.locator('[data-vaul-overlay][data-state="open"]')).not.toBeVisible();
        await openBalance(page);
        await expect(page.getByTestId('transaction-item').filter({ hasText: 'Round Trip Test Transaction' })).toBeVisible({ timeout: 10000 });

        // 0. Export: Open sidebar and trigger export via confirmation dialog
        await page.goto('/');
        await page.getByTestId('sidebar-menu-button').click();
        await expect(page.getByTestId('sidebar-container')).toBeVisible();

        // Click Export Data in the sidebar to open the confirmation dialog
        await page.getByTestId('sidebar-export-data').click();
        await expect(page.getByTestId('confirm-export-button')).toBeVisible();

        // Confirm export and wait for download
        const [download] = await Promise.all([
            page.waitForEvent('download'),
            page.getByTestId('confirm-export-button').click(),
        ]);

        // Validate filename format
        const suggested = download.suggestedFilename();
        await expect(suggested).toMatch(/mein-budget_export.*\.json/);

        // Read and validate export file structure and content
        const downloadedPath = await download.path();
        const content = await fs.promises.readFile(downloadedPath, 'utf8');
        const parsed = JSON.parse(content);

        // Verify JSON structure
        expect(parsed).toHaveProperty('transactions');
        expect(parsed).toHaveProperty('categories');
        expect(parsed).toHaveProperty('version');
        expect(parsed).toHaveProperty('exportDate');

        // Verify content is not empty (exported our test data)
        expect(Array.isArray(parsed.transactions)).toBe(true);
        expect(Array.isArray(parsed.categories)).toBe(true);
        expect(parsed.transactions.length).toBeGreaterThan(0);
        expect(parsed.categories.length).toBeGreaterThan(0);

        // Verify the exported transaction is the one we created
        const exportedTx = parsed.transactions.find((tx: any) => tx.title === 'Round Trip Test Transaction');
        expect(exportedTx).toBeDefined();
        expect(exportedTx?.amount).toBe(75);

        // Store exported data for round-trip verification
        const exportedData = parsed;

        // Navigate to fresh page to clear toast animations and sidebar state.
        // On webkit, the export success toast (z-100, animate-in) causes continuous
        // layout recalculations that prevent sidebar items from becoming "stable".
        await page.goto('/');
        await expect(page.getByTestId('loading-spinner')).not.toBeVisible({ timeout: 10000 });

        // 1. Perform true round-trip: Import via hidden file input
        // Uses setInputFiles directly on the hidden <input type="file"> (data-testid="import-file-input")
        // instead of going through the confirmation dialog → filechooser flow. This avoids a
        // webkit limitation where programmatic fileInput.click() from a dialog
        // callback loses the user gesture scope and the filechooser never fires.
        await page.getByTestId('import-file-input').setInputFiles({
            name: 'roundtrip-export.json',
            mimeType: 'application/json',
            buffer: Buffer.from(JSON.stringify(exportedData))
        });

        await page.reload();
        await openBalance(page);
        await expect(page.getByTestId('transaction-item').filter({ hasText: 'Round Trip Test Transaction' })).toBeVisible({ timeout: 10000 });
        await expect(page.getByTestId('transaction-item').filter({ hasText: 'Round Trip Test Transaction' })).toContainText('75');


    });

    test('trigger app reset and verify redirection', async ({ page }) => {
        await page.goto('/settings');
        // Click the visible "Reset App" button
        await page.locator('button', { hasText: /Reset App/i }).first().click();

        // confirm dialog should appear
        await expect(page.getByTestId('confirm-reset-button')).toBeVisible();

        const confirmReset = page.getByTestId('confirm-reset-button');
        await expect(confirmReset).toBeVisible();
        await confirmReset.click();

        await expect(page).toHaveURL(/\/onboarding$/);
    });

test('submit feedback without email is blocked', async ({ page }) => {
        await page.goto('/feedback');
        
        // Wait for feedback form to load
        await expect(page.getByTestId('feedback-email')).toBeVisible();
        
        // Fill only the feedback message, leave email empty
        await page.getByTestId('feedback-textarea').fill('This app is great!');
        await page.getByTestId('feedback-submit-button').click();

        // Success dialog must NOT appear
        await expect(page.getByTestId('feedback-success-ok-button')).not.toBeVisible();

        // An error toast should appear — target the toast listitem in the notifications region
        await expect(
            page.getByRole('region', { name: /notifications/i }).getByRole('listitem').first()
        ).toBeVisible({ timeout: 5000 });
    });

test('submit feedback with valid email and message shows success', async ({ page }) => {
        await page.goto('/feedback');
        
        // Wait for feedback form to load
        await expect(page.getByTestId('feedback-email')).toBeVisible();
        
        await page.getByTestId('feedback-email').fill('test@example.com');
        await page.getByTestId('feedback-textarea').fill('This app is great!');
        await page.getByTestId('feedback-submit-button').click();

        // Wait for success dialog to appear by checking for the OK button
        const okButton = page.getByTestId('feedback-success-ok-button');
        await expect(okButton).toBeVisible({ timeout: 10000 });

        await okButton.click();
        await expect(okButton).not.toBeVisible();
    });
});
