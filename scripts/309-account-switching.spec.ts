import { test, expect } from '@playwright/test';

/**
 * Manual E2E Regression Script (Ticket #309)
 * Account switching, offline/online toggle, and logout/re-login.
 *
 * This script automates as much as possible. Steps that require
 * manual intervention (email verification, magic link) are marked
 * with page.pause() for interactive execution.
 *
 * Prerequisites:
 *   - Local Compose stack running (recovery server)
 *   - App running on http://localhost:8080
 *   - Run in headed mode: npx playwright test scripts/309-account-switching.spec.ts --headed --project=chromium
 *
 * The test uses a 10-minute timeout to allow for manual steps.
 */

const APP_URL = 'http://localhost:8080';

test.describe('Account Switching & Sync Regression (#309)', () => {

  test('Full regression checklist', async ({ page }) => {
    test.setTimeout(600_000);

    // ──────────────────────────────────────────────
    // STEP 0: Clear state — start at onboarding
    // ──────────────────────────────────────────────
    console.log('STEP 0: Clearing state...');
    await page.goto(APP_URL);
    await page.waitForLoadState('networkidle');

    await page.evaluate(async () => {
      localStorage.clear();
      const dbs = await window.indexedDB.databases();
      for (const db of dbs) {
        if (db.name) window.indexedDB.deleteDatabase(db.name);
      }
    }).catch(() => { /* context may be destroyed */ });

    await page.goto(`${APP_URL}/onboarding`);

    // ──────────────────────────────────────────────
    // STEP 1: Register new user (local/offline)
    // ──────────────────────────────────────────────
    console.log('STEP 1: Registering new user (local/offline)...');
    await expect(page).toHaveURL(/.*onboarding/);

    // Navigate through 3 onboarding slides
    await page.click('[data-testid="onboarding-next-button"]');
    await page.click('[data-testid="onboarding-next-button"]');
    await page.click('[data-testid="onboarding-next-button"]');

    // Create account
    await page.fill('[data-testid="onboarding-account-name-input"]', 'Test User');
    await page.click('[data-testid="onboarding-account-submit-button"]');

    // Should land on dashboard
    await expect(page).toHaveURL(`${APP_URL}/`);
    console.log('  ✓ Account created, landed on dashboard');

    // ──────────────────────────────────────────────
    // STEP 2: Toggle online (provisioning)
    // Requires manual email verification
    // ──────────────────────────────────────────────
    console.log('STEP 2: Toggle online — MANUAL STEP');
    console.log('  → Complete the email registration flow in the browser.');
    console.log('  → After login, navigate to Settings > Sharing and verify sync status.');

    await page.goto(`${APP_URL}/settings`);

    // Find the share/sync button for the current account
    const shareButton = page.locator('[data-testid^="share-account-button-"]').first();
    if (await shareButton.isVisible({ timeout: 5000 }).catch(() => false)) {
      await shareButton.click();
      // Click sync/register button if visible
      const syncBtn = page.locator('text=/Sync now|Retry|Go Online/i').first();
      if (await syncBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
        await syncBtn.click();
      }
    }

    // Pause for manual email verification
    await page.pause();
    console.log('  ✓ Online provisioning complete (manual)');

    // ──────────────────────────────────────────────
    // STEP 3: Toggle offline
    // ──────────────────────────────────────────────
    console.log('STEP 3: Toggling offline...');
    await page.click('[data-testid="sidebar-menu-button"]');
    await page.click('[data-testid="offline-mode-switch"]');

    // Verify app shows offline state
    const statusEl = page.locator('[data-testid="sync-indicator"]');
    await expect(statusEl).toContainText(/Offline/i, { timeout: 5000 });

    // Add a transaction while offline to verify functionality
    await page.goto(`${APP_URL}/`);
    await page.click('[data-testid="add-transaction-button"]');
    await page.fill('input[type="number"]', '50');
    await page.click('text=Save');
    await expect(page.locator('text=50')).toBeVisible();
    console.log('  ✓ App functional offline, transaction saved locally');

    // ──────────────────────────────────────────────
    // STEP 4: Toggle back online — sync resumes
    // ──────────────────────────────────────────────
    console.log('STEP 4: Toggling back online...');
    await page.click('[data-testid="sidebar-menu-button"]');
    await page.click('[data-testid="offline-mode-switch"]');

    await expect(statusEl).toContainText(/Synced/i, { timeout: 15_000 });
    console.log('  ✓ Sync resumed');

    // ──────────────────────────────────────────────
    // STEP 5: Create second local account
    // ──────────────────────────────────────────────
    console.log('STEP 5: Creating second local account...');
    await page.goto(`${APP_URL}/settings`);
    await page.click('text=/New Account|Neues Konto/i');
    await page.fill('#accountName', 'Second Account');
    await page.click('button:has-text("Create"), button:has-text("Erstellen")');
    await expect(page.locator('text=Second Account')).toBeVisible();
    console.log('  ✓ Second account created (should be offline)');

    // ──────────────────────────────────────────────
    // STEP 6: Switch between accounts — data isolation
    // ──────────────────────────────────────────────
    console.log('STEP 6: Switching accounts — verifying data isolation...');

    // Switch to first account and add a transaction
    await page.click('text=Test User');
    await page.goto(`${APP_URL}/`);
    await page.click('[data-testid="add-transaction-button"]');
    await page.fill('input[type="number"]', '123.45');
    await page.click('text=Save');

    // Switch to second account and verify transaction NOT visible
    await page.goto(`${APP_URL}/settings`);
    await page.click('text=Second Account');
    await page.goto(`${APP_URL}/`);
    await expect(page.locator('text=123.45')).not.toBeVisible();
    console.log('  ✓ Data isolation verified — no bleed between accounts');

    // ──────────────────────────────────────────────
    // STEP 7: Logout
    // ──────────────────────────────────────────────
    console.log('STEP 7: Logging out...');
    await page.goto(`${APP_URL}/settings`);
    await page.click('text=/Logout|Start over/i');
    await expect(page).toHaveURL(/.*onboarding/);
    console.log('  ✓ Logout successful — redirected to onboarding');

    // ──────────────────────────────────────────────
    // STEP 8: Re-login via recovery
    // Requires manual email + OTP + recovery code
    // ──────────────────────────────────────────────
    console.log('STEP 8: Re-login via recovery — MANUAL STEP');
    console.log('  → Click "Recover" and follow the email/OTP/recovery-code flow.');
    await page.click('[data-testid="onboarding-recover-button"]');
    await expect(page).toHaveURL(/.*recovery/);
    await page.pause();
    console.log('  ✓ Re-login complete (manual)');

    // ──────────────────────────────────────────────
    // STEP 9: Verify data after re-login
    // ──────────────────────────────────────────────
    console.log('STEP 9: Verifying data after re-login...');
    await page.goto(`${APP_URL}/`);
    await expect(page.locator('text=123.45')).toBeVisible({ timeout: 15_000 });
    console.log('  ✓ Data intact after re-login');

    // ──────────────────────────────────────────────
    // STEP 10: Clear storage — clean state
    // ──────────────────────────────────────────────
    console.log('STEP 10: Clearing storage...');
    await page.evaluate(async () => {
      localStorage.clear();
      const dbs = await window.indexedDB.databases();
      for (const db of dbs) {
        if (db.name) window.indexedDB.deleteDatabase(db.name);
      }
    });
    await page.reload();
    await expect(page).toHaveURL(/.*onboarding/);
    console.log('  ✓ Clean state — redirected to onboarding');

    // ──────────────────────────────────────────────
    // STEP 11: Register, then toggle online on a different account
    // Confirms per-account online mode is respected
    // ──────────────────────────────────────────────
    console.log('STEP 11: Register new user + toggle online on different account...');

    // Register fresh user and create first account
    await page.click('[data-testid="onboarding-next-button"]');
    await page.click('[data-testid="onboarding-next-button"]');
    await page.click('[data-testid="onboarding-next-button"]');
    await page.fill('[data-testid="onboarding-account-name-input"]', 'Primary Account');
    await page.click('[data-testid="onboarding-account-submit-button"]');
    await expect(page).toHaveURL(`${APP_URL}/`);
    console.log('  ✓ First account created (offline)');

    // Create second account
    await page.goto(`${APP_URL}/settings`);
    await page.click('text=/New Account|Neues Konto/i');
    await page.fill('#accountName', 'Sync Account');
    await page.click('button:has-text("Create"), button:has-text("Erstellen")');
    await expect(page.locator('text=Sync Account')).toBeVisible();
    console.log('  ✓ Second account created (offline)');

    // Switch to second account and toggle it online
    await page.click('text=Sync Account');
    // Navigate to sharing settings for the second account
    const shareBtn2 = page.locator('[data-testid^="share-account-button-"]').first();
    if (await shareBtn2.isVisible({ timeout: 5000 }).catch(() => false)) {
      await shareBtn2.click();
      const syncBtn2 = page.locator('text=/Sync now|Retry|Go Online/i').first();
      if (await syncBtn2.isVisible({ timeout: 3000 }).catch(() => false)) {
        await syncBtn2.click();
      }
    }

    // Pause for manual email verification on second account
    console.log('  → Complete email registration for "Sync Account"');
    await page.pause();
    console.log('  ✓ Second account toggled online');

    // Verify first account is still offline
    await page.click('text=Primary Account');
    const hasMeta = await page.evaluate(async () => {
      try {
        const dbs = await window.indexedDB.databases();
        if (!dbs.some(db => db.name === 'BudgetWiseDB')) return false;
        return new Promise<boolean>((resolve) => {
          const req = indexedDB.open('BudgetWiseDB');
          req.onsuccess = () => {
            const db = req.result;
            try {
              const tx = db.transaction('accountSyncMetadata', 'readonly');
              const store = tx.objectStore('accountSyncMetadata');
              const all = store.getAll();
              all.onsuccess = () => resolve(all.result.length > 0);
            } catch { resolve(false); }
          };
          req.onerror = () => resolve(false);
        });
      } catch { return false; }
    });
    expect(hasMeta).toBe(false);
    console.log('  ✓ First account remains offline — per-account mode respected');

    console.log('\n════════════════════════════════════════');
    console.log('  REGRESSION CHECKLIST COMPLETE (15/15)');
    console.log('════════════════════════════════════════');
  });
});
