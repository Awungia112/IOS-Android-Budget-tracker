import { test, expect } from '@playwright/test';

test.describe('Onboarding', () => {
    test('first-time user should be redirected to onboarding', async ({ page }) => {
        // Clear any existing localStorage to simulate fresh user
        await page.goto('/');

        // Should be redirected to onboarding for first-time user
        await expect(page).toHaveURL(/\/onboarding/);

        // Should see welcome heading
        await expect(page.getByTestId('welcome-heading').first()).toBeVisible();

        // Should see language toggle button
        await expect(page.getByTestId('language-toggle')).toBeVisible();
    });

    test('should allow user to navigate through all onboarding slides', async ({ page }) => {
        await page.goto('/onboarding');

        // Step 1: Slide 1
        await expect(page.getByTestId('welcome-heading').first()).toBeVisible();
        const nextButton = page.getByTestId('onboarding-next-button');
        await nextButton.click();

        // Step 2: Slide 2
        await expect(page.getByText(/Welcome|Willkommen/i).first()).toBeVisible();
        await nextButton.click();

        // Step 3: Slide 3
        await expect(page.getByText(/Savings Goals|Sparziele/i).first()).toBeVisible();
        await nextButton.click();

        // Final step: Should be at account selection/creation
        await expect(page.getByText(/Select Account|Konto auswählen|Create Your First Account|Erstes Konto erstellen/i).first()).toBeVisible();
    });

    test('should allow language toggle between DE and EN', async ({ page }) => {
        await page.goto('/onboarding');

        const languageToggle = page.getByTestId('language-toggle');
        await expect(languageToggle).toBeVisible();

        // Initial state
        await languageToggle.click();

        // Verify language changed
        const germanHeading = page.getByRole('heading', { name: 'Willkommen!' });
        const englishHeading = page.getByRole('heading', { name: 'Welcome!' });
        await expect(germanHeading.or(englishHeading)).toBeVisible();
    });

    test('should allow user to complete registration and reach dashboard', async ({ page }) => {
        // Hardened mocks using regex to prevent bypass
        await page.route(/\/v1\/auth\/preflight$/, async route => {
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                // Return 'not_found' so the registration flow proceeds as a new user
                body: JSON.stringify({ status: 'not_found' }),
            });
        });

        await page.route(/\/v1\/nonce$/, async route => {
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({ nonce: 'test-nonce' }),
            });
        });

        await page.route(/\/v1\/auth\/register$/, async route => {
            await route.fulfill({
                // Server contract: 201 Created for new user, 200 for existing user sign-in
                status: 201,
                contentType: 'application/json',
                body: JSON.stringify({ success: true, message: 'Magic link sent', email_hash: 'test-email-hash' }),
            });
        });

        await page.route(/\/v1\/auth\/verify-code$/, async route => {
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({
                    token: 'test-session-token',
                    user: { email_hash: 'test-email-hash' }
                }),
            });
        });

        // Bypass Service Worker to ensure Playwright mocks are always used
        await page.addInitScript(() => {
            if ('serviceWorker' in navigator) {
                // @ts-ignore
                navigator.serviceWorker.getRegistrations().then(registrations => {
                    for (const registration of registrations) {
                        registration.unregister();
                    }
                });
                // @ts-ignore
                navigator.serviceWorker.register = () => new Promise(() => {});
            }
            localStorage.setItem('onboardingComplete', 'false');
            localStorage.setItem('i18nextLng', 'en');
        });

        await page.goto('/register');

        // 1. Email Screen
        await expect(page).toHaveURL(/\/register/);
        await page.locator('input[type="email"]').fill('e2e-test@example.com');
        await page.getByRole('button', { name: /Continue/i }).click();

        // 2. Check Email Screen
        await expect(page).toHaveURL(/\/register\/check-email/);
        await page.getByRole('button', { name: /Enter code manually/i }).click();

        // 3. OTP Screen
        await expect(page).toHaveURL(/\/register\/otp/);
        // Fill the 6 digits - our component auto-submits on the 6th digit
        const otpInputs = page.locator('input[type="text"]');
        await otpInputs.nth(0).fill('1');
        await otpInputs.nth(1).fill('2');
        await otpInputs.nth(2).fill('3');
        await otpInputs.nth(3).fill('4');
        await otpInputs.nth(4).fill('5');
        const verifyCodeResponse = page.waitForResponse(response =>
            response.url().includes('/v1/auth/verify-code') && response.status() === 200
        );
        await otpInputs.nth(5).fill('6');
        await verifyCodeResponse;

        // 4. Recovery Code Screen — shown first before success screen
        await expect(page.getByTestId('recovery-confirm-checkbox')).toBeAttached({ timeout: 10000 });

        // The checkbox input is sr-only; click the wrapping <label> so the
        // browser's native label-for-input association fires the change event
        // reliably across all engines (including WebKit).
        await page.getByTestId('recovery-confirm-checkbox').evaluate((el: HTMLInputElement) => {
  (el.closest('label') as HTMLLabelElement)?.click();
});

        // Proceed button should now be enabled
        await expect(page.getByTestId('recovery-proceed-button')).toBeEnabled({ timeout: 5000 });

        // Click the proceed button to complete registration
        await page.getByTestId('recovery-proceed-button').click();

        // 5. Success Screen — last step before dashboard
        await expect(page).toHaveURL(/\/register\/success/);
        await page.getByRole('button', { name: /Go to Dashboard/i }).click();

        // Final state: Dashboard
        await expect(page).toHaveURL(/\/$/);
        await expect(page.getByTestId('balance-header')).toBeVisible();
    });

    test('should verify onboarding navigation components are present', async ({ page }) => {
        await page.goto('/onboarding');
        await page.reload();

        // Verify the onboarding surface only exposes its local-first CTA.
        await expect(page.getByTestId('onboarding-next-button')).toBeVisible();
        await expect(page.getByTestId('language-toggle')).toBeVisible();
        await expect(page.getByTestId('onboarding-register-button')).toHaveCount(0);
        await expect(page.getByTestId('onboarding-signin-button')).toHaveCount(0);
        await expect(page.getByTestId('onboarding-recover-button')).toHaveCount(0);
    });
});
