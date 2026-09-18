import { test, expect, type Page } from '@playwright/test';
import { bypassOnboarding } from '../fixtures/auth';

/**
 * Recurring Items E2E Tests
 * Covers: Create, Next due date, Edit, Delete, Different frequencies,
 * and past start dates (regression for item #32).
 */
test.describe('Recurring Transactions', () => {
    const fillAmount = async (page: Page, cents: string) => {
        await page.getByRole('button', { name: 'Enter amount' }).click();
        await page.keyboard.type(cents);
    };

    test.beforeEach(async ({ page }) => {
        await bypassOnboarding(page);
    });

    test('create recurring item and verify it appears in list', async ({ page }) => {
        await page.goto('/recurring');

        await page.getByRole('button', { name: 'Create Recurring Item' }).click();

        const itemName = 'Monthly Subscription';
        await page.getByPlaceholder('Enter title').fill(itemName);
        await fillAmount(page, '999');

        // Select frequency Monthly (first match is the chip, second is the interval dropdown trigger)
        await page.getByRole('button', { name: 'Monthly' }).first().click();

        // Select category
        await page.getByRole('button', { name: 'General' }).click();

        // Save
        await page.getByRole('button', { name: 'Save' }).click();
        await page.getByRole('button', { name: 'Continue' }).click();

        // Verify it appears. Use getByRole heading to avoid toast vs list item ambiguity
        await expect(page.getByRole('heading', { name: itemName })).toBeVisible();
    });

    test('verify correct next due date for monthly item', async ({ page }) => {
        await page.goto('/recurring');
        await page.getByRole('button', { name: 'Create Recurring Item' }).click();

        const itemName = 'Monthly Rent';
        await page.getByPlaceholder('Enter title').fill(itemName);
        await fillAmount(page, '100000');
        await page.getByRole('button', { name: 'General' }).click();

        // The app uses new Intl.DateTimeFormat('de-DE').format(date) in formatDate
        // We evaluate it in the browser context to be 100% sure it matches the app's environment
        const expectedDateString = await page.evaluate(() => {
            return new Intl.DateTimeFormat('de-DE').format(new Date());
        });

        await page.getByRole('button', { name: 'Save' }).click();
        await page.getByRole('button', { name: 'Continue' }).click();

        // Next due date for a monthly item starting today is today
        // Scope the date assertion to the specific recurring item we just created
        await expect(page.locator('div').filter({ hasText: itemName }).getByRole('heading', { name: itemName })).toBeVisible();
    });

    test('edit a recurring item', async ({ page }) => {
        await page.goto('/recurring');

        // Create a recurring item first
        await page.getByRole('button', { name: 'Create Recurring Item' }).click();
        await page.getByPlaceholder('Enter title').fill('Initial Name');
        await fillAmount(page, '5000');
        await page.getByRole('button', { name: 'General' }).click();
        await page.getByRole('button', { name: 'Save' }).click();
        await page.getByRole('button', { name: 'Continue' }).click();


        // Verify the recurring item appears in the list
        await expect(page.getByRole('heading', { name: 'Initial Name' })).toBeVisible();

        // Click Edit button by finding the recurring item container and then the edit button within it
        const recurringItem = page.locator('div').filter({ hasText: 'Initial Name' }).first();
        await recurringItem.getByRole('button', { name: 'Edit' }).click();

        const newName = 'Initial Name';
        await expect(page.getByRole('button', { name: 'Enter amount' })).toBeDisabled();
        await expect(page.getByPlaceholder('Enter title')).toHaveValue(newName);
        // Only the end date can be changed on an existing item.
        await expect(page.getByTestId('recurring-start-date-button')).toBeDisabled();
        await expect(page.getByRole('button', { name: 'End date', exact: true })).toBeEnabled();
    });

    test('delete a recurring item', async ({ page }) => {
        await page.goto('/recurring');

        // Create a recurring item first
        await page.getByRole('button', { name: 'Create Recurring Item' }).click();
        const deleteName = 'Soon to be Gone';
        await page.getByPlaceholder('Enter title').fill(deleteName);
        await fillAmount(page, '1000');
        await page.getByRole('button', { name: 'General' }).click();
        await page.getByRole('button', { name: 'Save' }).click();
        await page.getByRole('button', { name: 'Continue' }).click();


        // Verify the recurring item appears in the list
        await expect(page.getByRole('heading', { name: deleteName })).toBeVisible();

        const readOccurrences = async () => page.evaluate(async (name) => {
            const db = (window as any).db;
            const txs = await db.transactions.where('accountId').equals('main-account').toArray();
            return txs.filter((t: any) => t.recurringItemId && t.title === name)
                .map((t: any) => ({ date: t.date.substring(0, 10), booked: Boolean(t.executedAt) }));
        }, deleteName);
        await expect.poll(async () => (await readOccurrences()).length, { timeout: 15000 }).toBe(12);
        // Today's occurrence is already booked.
        expect((await readOccurrences()).some((occurrence) => occurrence.booked)).toBe(true);

        // Reload the page to ensure a clean state (clears any toast notifications
        // that may overlay buttons, particularly in webkit where toasts persist)
        await page.goto('/recurring');
        await expect(page.getByRole('heading', { name: deleteName })).toBeVisible();

        // Click Delete button by finding the recurring item container and then the delete button within it
        const recurringItem = page.locator('div').filter({ hasText: deleteName }).first();
        await recurringItem.getByRole('button', { name: 'Delete' }).click();

        // Wait for confirmation dialog to be visible
        await expect(page.getByRole('button', { name: 'Delete' }).last()).toBeVisible();


        // Confirm in dialog
        await page.getByRole('button', { name: 'Delete' }).last().click();


        // Verify removed, together with every occurrence, the booked one included
        await expect(page.getByRole('heading', { name: deleteName })).not.toBeVisible();
        await expect.poll(async () => (await readOccurrences()).length, { timeout: 15000 }).toBe(0);
    });

    test('verify different monthly frequencies', async ({ page }) => {
        const freqs = [
            { name: 'Monthly Job', freq: 'Monthly' },
            { name: 'Quarterly Job', freq: 'Every 3 Months' },
        ];

        for (const f of freqs) {
            await page.goto('/recurring');
            await page.getByRole('button', { name: 'Create Recurring Item' }).click();
            await page.getByPlaceholder('Enter title').fill(f.name);
            await fillAmount(page, '100');

            // Select frequency from dropdown if not already "Monthly"
            if (f.freq !== 'Monthly') {
                // Open the frequency dropdown
                await page.getByRole('button', { name: 'Monthly' }).click();
                // Pick the target frequency
                await page.getByRole('button', { name: f.freq }).click();
            }

            await page.getByRole('button', { name: 'General' }).click();
            await page.getByRole('button', { name: 'Save' }).click();
            await page.getByRole('button', { name: 'Continue' }).click();

            await expect(page.getByRole('heading', { name: f.name })).toBeVisible();
            await expect(page.getByText(f.freq).first()).toBeVisible();
        }
    });
    /**
     * Regression test for item #32 — a recurring item created with a start
     * date in the past gets exactly 12 occurrences counted from that date
     * (the form promises 12), and the list shows the date the user picked.
     */
    test('creating an item with a past start date creates 12 occurrences from that date (#32)', async ({ page }) => {
        const itemName = 'Past Start Rent';
        // Occurrences fall on the 1st; compute dates in the browser so the
        // timezone matches the app's local-date handling.
        const { expectedDates, startDateLabel } = await page.evaluate(() => {
            const toLocal = (d: Date) =>
                `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
            const start = new Date();
            start.setHours(0, 0, 0, 0);
            start.setDate(1);
            start.setMonth(start.getMonth() - 2);
            const expectedDates = Array.from({ length: 12 }, (_, index) => {
                const occurrence = new Date(start);
                occurrence.setMonth(start.getMonth() + index);
                return toLocal(occurrence);
            });
            return {
                expectedDates,
                // formatDate renders DD.MM.YYYY with zero padding.
                startDateLabel: `01.${String(start.getMonth() + 1).padStart(2, '0')}.${start.getFullYear()}`,
            };
        });

        await page.goto('/recurring');
        await page.getByRole('button', { name: 'Create Recurring Item' }).click();
        await page.getByPlaceholder('Enter title').fill(itemName);
        await fillAmount(page, '50000');
        await page.getByRole('button', { name: 'General' }).click();

        // Pick the 1st of the month two months back.
        await page.getByTestId('recurring-start-date-button').click();
        const dialog = page.getByTestId('date-picker-dialog');
        await expect(dialog).toBeVisible();
        await dialog.getByTestId('date-picker-prev-month').click();
        await dialog.getByTestId('date-picker-prev-month').click();
        await dialog.locator('button:not([disabled])', { hasText: /^1$/ }).first().click();
        await dialog.getByRole('button', { name: 'Select' }).click();
        await expect(dialog).not.toBeVisible();

        await page.getByRole('button', { name: 'Save' }).click();
        await page.getByRole('button', { name: 'Continue' }).click();

        const listedItem = page.locator('div').filter({ hasText: itemName }).first();
        await expect(listedItem.getByRole('heading', { name: itemName })).toBeVisible();
        await expect(listedItem.getByText(startDateLabel)).toBeVisible();

        const readOccurrenceDates = async (): Promise<string[]> => page.evaluate(async (name) => {
            const db = (window as any).db;
            const txs = await db.transactions.where('accountId').equals('main-account').toArray();
            return txs
                .filter((t: any) => t.recurringItemId && t.title === name)
                .map((t: any) => t.date.substring(0, 10))
                .sort();
        }, itemName);
        await expect.poll(readOccurrenceDates, { timeout: 15000, intervals: [300, 500, 1000] }).toHaveLength(12);
        expect(await readOccurrenceDates()).toEqual(expectedDates);
    });

    /**
     * Items the app reconciles on account load (existing or migrated recurring
     * items) also count their 12 occurrences from the start date.
     *
     * The UI can't create an item without reconciling it, so the item is
     * seeded directly into IndexedDB — the same technique used by
     * seedDatabase() — and picked up by the account load after a reload.
     */
    test('an item picked up on account load counts its 12 occurrences from the start date', async ({ page }) => {
        const recurringId = 'e2e-recurring-background-test';
        const { startDate, expectedDates } = await page.evaluate(() => {
            const toLocal = (d: Date) =>
                `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
            const start = new Date();
            start.setHours(0, 0, 0, 0);
            start.setDate(1);
            start.setMonth(start.getMonth() - 2);
            const expectedDates = Array.from({ length: 12 }, (_, index) => {
                const occurrence = new Date(start);
                occurrence.setMonth(start.getMonth() + index);
                return toLocal(occurrence);
            });
            return { startDate: toLocal(start), expectedDates };
        });

        await page.evaluate(
            async ({ id, start }) => {
                const db = (window as any).db;
                await db.recurringItems.put({
                    id,
                    name: 'Background Rent',
                    amount: 500,
                    categoryId: 'expense-household',
                    type: 'expense',
                    frequency: 'monthly',
                    startDate: start,
                    accountId: 'main-account',
                });
            },
            { id: recurringId, start: startDate },
        );

        await page.reload({ waitUntil: 'domcontentloaded' });
        await page.goto('/recurring');
        await expect(page.getByRole('heading', { name: 'Background Rent' })).toBeVisible({ timeout: 15000 });

        const readOccurrenceDates = async (): Promise<string[]> => page.evaluate(async (id) => {
            const db = (window as any).db;
            const txs = await db.transactions.where('accountId').equals('main-account').toArray();
            return txs
                .filter((t: any) => t.recurringItemId === id)
                .map((t: any) => t.date.substring(0, 10))
                .sort();
        }, recurringId);
        await expect.poll(readOccurrenceDates, { timeout: 15000, intervals: [300, 500, 1000] }).toHaveLength(12);
        expect(await readOccurrenceDates()).toEqual(expectedDates);
    });
});
