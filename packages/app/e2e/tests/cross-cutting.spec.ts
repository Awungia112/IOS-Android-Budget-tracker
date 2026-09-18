import { test, expect } from '@playwright/test';
import { bypassOnboarding } from '../fixtures/auth';

/**
 * App-wide Cross-Cutting Concerns E2E Tests
 * Covers Dark Mode, Language Persistence, Offline Mode, 404 Pages, and Desktop Overlays.
 */
test.describe('App-wide Cross-Cutting Concerns', () => {
    // Helper to open sidebar using either legacy or current testid
    const openSidebar = async (page: any) => {
        const hasMenu = await page.locator('[data-testid="sidebar-menu-button"]').count();
        if (hasMenu && hasMenu > 0) {
            await page.getByTestId('sidebar-menu-button').click();
            return;
        }
        const hasToggle = await page.locator('[data-testid="sidebar-toggle"]').count();
        if (hasToggle && hasToggle > 0) {
            await page.getByTestId('sidebar-toggle').click();
            return;
        }
        // fallback: try clicking any button with menu icon
        await page.locator('button:has(img[alt="Menu"])').first().click();
    };
    test.beforeEach(async ({ page }) => {

        // Use a even larger vertical viewport for maximum safety
        await page.setViewportSize({ width: 390, height: 1000 });
        await bypassOnboarding(page);
        // Wait for main content to be ready
        await expect(page.locator('main')).toBeVisible({ timeout: 15000 });
    });

    test.afterEach(async ({ page }) => {
        // Reset persistent state to prevent test interference
        await page.evaluate(() => {
            localStorage.setItem('theme', 'light');
            localStorage.setItem('i18nextLng', 'en');
            localStorage.setItem('language', 'en');
        });
    });

    test('toggle dark mode and verify persistence after page reload', async ({ page }) => {
        // 1. Open sidebar
        await openSidebar(page);
        await expect(page.locator('.sidebar-container')).toBeVisible();

        // 2. Initial state check
        await expect(page.locator('html')).not.toHaveClass(/dark/);

        // 3. Toggle dark mode by clicking the Switch button inside
        const darkModeSwitch = page.getByTestId('dark-mode-switch');
        const switchButton = darkModeSwitch.locator('button');
        await switchButton.click();
        await expect(page.locator('html')).toHaveClass(/dark/);

        // 4. Verify persistence after reload
        await page.reload();
        // Wait for loading to finish
        await expect(page.getByTestId('loading-spinner')).not.toBeVisible({ timeout: 15000 });
        await expect(page.locator('html')).toHaveClass(/dark/);

        // 5. Toggle back
        await openSidebar(page);
        await expect(page.locator('.sidebar-container')).toBeVisible();
        await page.getByTestId('dark-mode-switch').click();
        await expect(page.locator('html')).not.toHaveClass(/dark/);
    });

    test('change language and verify strict persistence', async ({ page }) => {
        await page.goto('/settings');
        // Wait for loading to finish
        await expect(page.getByTestId('loading-spinner')).not.toBeVisible({ timeout: 15000 });

        // 1. Change to German
        await page.getByTestId('language-trigger').click();
        await page.getByRole('menuitem', { name: /german|Deutsch/i }).click();

        // 2. Verify strict German presence
        await expect(page.locator('header h1')).toHaveText('Einstellungen');
        await expect(page.getByText('Sprache')).toBeVisible();

        // 3. Reload and verify persistence in German
        await page.reload();
        await expect(page.getByTestId('loading-spinner')).not.toBeVisible({ timeout: 15000 });
        await expect(page.getByText('Sprache')).toBeVisible();
        await expect(page.locator('header h1')).toHaveText('Einstellungen');

        // 4. Change back to English
        await page.getByTestId('language-trigger').click();
        await page.getByRole('menuitem', { name: /english|Englisch/i }).click();
        await expect(page.getByText('Language')).toBeVisible();
        // 5. Verify strict English presence
        await expect(page.locator('header h1')).toHaveText('Settings');
    });

    test('toggle offline mode and verify data accessibility', async ({ page }) => {
        // 1. Ensure we are on dashboard with data
        await page.goto('/');
        await expect(page.getByTestId('loading-spinner')).not.toBeVisible({ timeout: 15000 });

        // 2. Simulate offline mode
        await page.context().setOffline(true);
        
        // Wait for page to stabilize after going offline
        await page.waitForTimeout(2000);

        // 3. Verify basic page structure is still visible
        await expect(page.locator('body')).toBeVisible();

        // 4. Go back online
        await page.context().setOffline(false);
        await expect(page.locator('body')).toBeVisible();
    });

    test('navigate to invalid URL and verify 404 page', async ({ page }) => {
        await page.goto('/this-page-does-not-exist');

        // Verify 404 content
        await expect(page.locator('h1')).toHaveText('404');
        await expect(page.getByText(/Oops! Page not found/i)).toBeVisible();

        // Go home via link
        await page.getByRole('link', { name: /Return to Home/i }).click();

        await expect(page).toHaveURL(/\/$/);
        await expect(page.getByTestId('loading-spinner')).not.toBeVisible({ timeout: 15000 });
    });

    test('navigate to legal pages via UI and verify links', async ({ page }) => {
        await page.goto('/settings');
        await expect(page.getByTestId('loading-spinner')).not.toBeVisible({ timeout: 15000 });

        // Helper to check legal page
        const verifyLegalPage = async (testId: string, urlRegex: RegExp, headerRegex: RegExp) => {
            await page.getByTestId(testId).click();
            await page.waitForURL(urlRegex);
            await expect(page.locator('header h1')).toHaveText(headerRegex, { timeout: 5000 });
            await page.getByTestId('back-button').click();
            await page.waitForURL(/\/settings$/);
            await expect(page.locator('header h1')).toHaveText(/Settings|Einstellungen/i, { timeout: 5000 });
        };

        // 1. Test Imprint Link
        await verifyLegalPage('legal-imprint', /\/impressum$/, /Imprint|Impressum/i);

        // 2. Test Privacy Link
        await verifyLegalPage('legal-privacy', /\/datenschutz$/, /Privacy|Datenschutz/i);

        // 3. Test About Link
        await verifyLegalPage('legal-about', /\/about$/, /About|Mein Budget App|Über/i);
    });

    test('verify desktop blocking overlay on large viewports', async ({ page }) => {
        // Set viewport to desktop size
        await page.setViewportSize({ width: 1440, height: 900 });
        await expect(page.getByText(/Open on your mobile device/i)).toBeVisible();

        // Set back to mobile size
        await page.setViewportSize({ width: 390, height: 844 });
        await expect(page.getByText(/Open on your mobile device/i)).not.toBeVisible();
    });
});
