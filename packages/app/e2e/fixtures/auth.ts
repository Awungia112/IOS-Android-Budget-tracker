import { Page, expect } from '@playwright/test';
import { seedDatabase } from './seed';

/**
 * Onboarding bypass helper.
 * Sets localStorage flags, seeds the full E2E dataset, and waits for the app to be ready.
 */
export async function bypassOnboarding(page: Page) {
    // 1. Set localStorage BEFORE first navigation to avoid redirects.
    // Use addInitScript only for flags that must persist across all navigations (onboardingComplete).
    // i18nextLng is intentionally NOT set here so that language-persistence tests can change it
    // and have it survive page reloads without being overwritten on every navigation.
    await page.addInitScript(() => {
        localStorage.setItem('onboardingComplete', 'true');
        // Only set the default language if not already set, so language-persistence tests work correctly.
        if (!localStorage.getItem('i18nextLng')) {
            localStorage.setItem('i18nextLng', 'en');
        }
    });

    // 2. Go to home page - it should NOT redirect now
    await page.goto('/', { waitUntil: 'domcontentloaded' });

    // 3. Wait for database and seed it
    await page.waitForFunction(() => {
        return (window as any).db !== undefined;
    }, { timeout: 30000 });

    await seedDatabase(page);

    // 4. RELOAD to ensure React state in BudgetContext is synced with the newly seeded IndexedDB data
    await page.reload({ waitUntil: 'domcontentloaded' });

    // 5. Ensure we are on the dashboard and ready
    try {
        await expect(page).toHaveURL(/\/$/);
        await page.waitForSelector('[data-testid="balance-header"]', { timeout: 10000 });
    } catch (error) {
        // Fallback: wait for any dashboard content
        await page.waitForSelector('h1, h2, h3', { timeout: 5000 });
    }
}

/** Navigate to the Balance page and expose future transaction groups for assertions. */
export async function openBalance(page: Page) {
    await page.goto('/balance');
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForSelector('[data-testid="balance-back-button"], [data-testid="bilanz-filter-button"]', { timeout: 10000 });

    const futureToggle = page.getByTestId('future-transactions-toggle');
    if (await futureToggle.isVisible()) {
        await futureToggle.click();
    }
}
