import { defineConfig, devices } from '@playwright/test';

/** 
 * See https://playwright.dev/docs/test-configuration.
 */
export default defineConfig({
    testDir: './e2e/tests',
    /* Maximum time one test can run for. */
    timeout: process.env.CI ? 60 * 1000 : 30 * 1000,
    expect: {
        timeout: 5000
    },
    /* Run tests in files in parallel */
    fullyParallel: true,
    /* Fail the build on CI if you accidentally left test.only in the source code. */
    forbidOnly: !!process.env.CI,
    /* Retry on CI only */
    retries: process.env.CI ? 2 : 0,
    /* Opt out of parallel tests on CI. */
    workers: process.env.CI ? 2 : undefined,
    /* Reporter to use. See https://playwright.dev/docs/test-reporters */
    reporter: 'html',
    /* Shared settings for all the projects below. See https://playwright.dev/docs/api/class-testoptions. */
    use: {
        /* Base URL to use in actions like `await page.goto('/')`. */
        baseURL: 'http://localhost:8080',

        /* Collect trace when retrying the failed test. See https://playwright.dev/docs/trace-viewer */
        trace: 'on-first-retry',
    },

    /* Configure projects for major browsers */
    projects: [
        {
            name: 'chromium',
            use: {
                // Mobile viewport emulation (375x812 is iPhone X dimensions)
                viewport: { width: 375, height: 812 },
                deviceScaleFactor: 3,
                hasTouch: true,
                isMobile: true,
                // Note: No userAgent spoofing - let Chromium use its mobile UA
                // This ensures proper mobile emulation without misleading UA-based logic
                // Uses Playwright's bundled Chromium in all environments for consistency
            },
        },
        {
            name: 'webkit',
            use: {
                ...devices['iPhone X'],
                viewport: { width: 375, height: 812 },
            },
        },
    ],

    /* Run your local dev server before starting the tests */
    webServer: {
        command: 'pnpm run preview',
        url: 'http://localhost:8080',
        reuseExistingServer: !process.env.CI,
        timeout: 120 * 1000,
        env: {
            NODE_ENV: 'test',
        },
    },
});
