import { test, expect } from '@playwright/test';

/**
 * Manual E2E — Per-account online mode (Ticket #309)
 * Register, then toggle online on a different account.
 * Confirms per-account online mode is respected.
 *
 * Prerequisites:
 *   - Local Compose stack running
 *   - App running on http://localhost:8080
 *   - Run: npx playwright test scripts/309-per-account-online.spec.ts --headed --project=chromium
 */

const APP_URL = 'http://localhost:8080';

test('Step 15: Register + toggle online on different account', async ({ page }) => {
  test.setTimeout(300_000);

  // ── Clear state ──
  console.log('Clearing state...');
  await page.goto(APP_URL);
  await page.waitForLoadState('networkidle');
  await page.evaluate(async () => {
    localStorage.clear();
    const dbs = await window.indexedDB.databases();
    for (const db of dbs) {
      if (db.name) window.indexedDB.deleteDatabase(db.name);
    }
  }).catch(() => {});
  await page.goto(`${APP_URL}/onboarding`);

  // ── Register fresh user ──
  console.log('Registering new user...');
  await page.click('[data-testid="onboarding-next-button"]');
  await page.click('[data-testid="onboarding-next-button"]');
  await page.click('[data-testid="onboarding-next-button"]');
  await page.fill('[data-testid="onboarding-account-name-input"]', 'Primary Account');
  await page.click('[data-testid="onboarding-account-submit-button"]');
  await expect(page).toHaveURL(`${APP_URL}/`);
  console.log('  ✓ First account created (offline)');

  // ── Create second account ──
  console.log('Creating second account...');
  await page.goto(`${APP_URL}/settings`);
  await page.click('text=/New Account|Neues Konto/i');
  await page.fill('#accountName', 'Sync Account');
  await page.click('button:has-text("Create"), button:has-text("Erstellen")');
  await expect(page.locator('text=Sync Account')).toBeVisible();
  console.log('  ✓ Second account created (offline)');

  // ── Switch to second account and toggle online ──
  console.log('Switching to Sync Account...');
  await page.click('text=Sync Account');

  const shareBtn = page.locator('[data-testid^="share-account-button-"]').first();
  if (await shareBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
    await shareBtn.click();
    const syncBtn = page.locator('text=/Sync now|Retry|Go Online/i').first();
    if (await syncBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await syncBtn.click();
    }
  }

  // Pause for manual email verification
  console.log('  → Complete email registration for "Sync Account" in the browser');
  await page.pause();
  console.log('  ✓ Sync Account toggled online');

  // ── Verify first account is still offline ──
  console.log('Verifying Primary Account is still offline...');
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
  console.log('  ✓ Primary Account remains offline — per-account mode respected');

  console.log('\n════════════════════════════════════════');
  console.log('  STEP 15: PASS');
  console.log('════════════════════════════════════════');
});
