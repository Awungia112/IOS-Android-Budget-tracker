/**
 * @vitest-environment jsdom
 *
 * Integration tests — LimitForm
 *
 * Full pipeline: user input → validation → context action → Dexie write → UI feedback
 *
 * Uses real BudgetProvider (fake-indexeddb) — NO vi.mock() on context, hooks, or services.
 */

import 'fake-indexeddb/auto';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { screen, waitFor, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom/vitest';
import { renderIntegration } from '@/test-utils/integration-render';
import LimitForm from '@/pages/LimitForm';
import { BudgetService, db } from '@budget/core';

// ── helpers ────────────────────────────────────────────────────────────
/**
 * Wait until the BudgetProvider has finished async init and the form
 * renders its save button (aria-label="Save").
 */
const waitForFormReady = () =>
    waitFor(() => {
        expect(screen.getByTestId('limit-form-save')).toBeInTheDocument();
    }, { timeout: 5000 });

/**
 * Helper to select the first visible expense category chip.
 * After BudgetProvider initializes default data the grid should contain
 * category buttons with aria-label matching translated names.
 */
const selectFirstCategory = async (user: ReturnType<typeof userEvent.setup>) => {
    // The category grid renders buttons with data-testid="limit-category-<id>"
    // Wait for at least one to appear
    await waitFor(() => {
        const buttons = screen.getAllByRole('button').filter(
            btn => btn.getAttribute('data-testid')?.startsWith('limit-category-')
        );
        expect(buttons.length).toBeGreaterThan(0);
    });

    const categoryButtons = screen.getAllByRole('button').filter(
        btn => btn.getAttribute('data-testid')?.startsWith('limit-category-')
    );
    await user.click(categoryButtons[0]);
};

// ── suite ──────────────────────────────────────────────────────────────
describe('LimitForm — integration', () => {
    beforeEach(async () => {
        localStorage.clear();
        try {
            await db.close();
            await db.delete();
            await db.open();
            await db.initializeDefaultData();
        } catch (e) {
            console.error('Setup failed', e);
        }
    });

    afterEach(async () => {
        cleanup();
        vi.restoreAllMocks();
        try {
            await db.close();
        } catch { /* ignore */ }
    });

    // ─── Create happy path ───────────────────────────────────────────
    it('creates a new limit: selects category, enters amount, saves', async () => {
        const user = userEvent.setup();

        renderIntegration(<LimitForm />, {
            initialEntries: ['/limits/new'],
        });

        await waitForFormReady();

        // Select a category
        await selectFirstCategory(user);

        // Enter amount
        const amountInput = screen.getByTestId('limit-form-amount');
        await user.type(amountInput, '500');

        // Spy on BudgetService createLimit
        const createSpy = vi.spyOn(BudgetService.prototype, 'createLimit');

        // Submit
        await user.click(screen.getByTestId('limit-form-save'));

        // Verify success
        await waitFor(() => {
            // Check that the underlying createLimit was called with correct values
            // Category ID should be from one of the default categories
            expect(createSpy).toHaveBeenCalledWith(expect.objectContaining({
                amount: 500,
                // categoryId is set by selectFirstCategory
            }), expect.any(String)); // accountId is the second parameter

            // Check for success toast
            expect(screen.getByText(/limit.*added.*successfully|Limit erfolgreich hinzugefügt/i)).toBeInTheDocument();
        }, { timeout: 10000 });

        // Explicitly restore the mock to prevent interference with other tests
        createSpy.mockRestore();
    });

    // ─── Validation — missing fields ─────────────────────────────────
    it('shows validation errors when submitting without category or amount', async () => {
        const user = userEvent.setup();

        renderIntegration(<LimitForm />, {
            initialEntries: ['/limits/new'],
        });

        await waitForFormReady();

        // Submit with nothing filled
        await user.click(screen.getByTestId('limit-form-save'));

        // useLimitValidation should produce inline error messages
        await waitFor(() => {
            // We expect "All fields are required." message(s) to appear
            expect(screen.getAllByText(/all.*fields.*required|Alle Felder sind erforderlich/i).length).toBeGreaterThan(0);
        }, { timeout: 10000 });
    });

    // ─── Edit mode ───────────────────────────────────────────────────
    it('pre-fills form in edit mode and submits updated limit', async () => {
        const user = userEvent.setup();

        // beforeEach already opens the db; BudgetProvider seeds default data on mount.
        // Just read the categories that will be present after mount.
        const categories = await db.categories.toArray();
        const expenseCat = categories.find(c => c.type === 'expense');
        expect(expenseCat).toBeTruthy();

        // Insert a limit
        const limitId = 'test-limit-edit';
        await db.limits.add({
            id: limitId,
            accountId: expenseCat!.accountId,
            categoryId: expenseCat!.id,
            amount: 300,
        });

        renderIntegration(<LimitForm />, {
            initialEntries: [`/limits/edit/${limitId}`],
            routePath: '/limits/edit/:limitId',
        });

        await waitForFormReady();

        // Verify pre-fill: the amount input should have 300
        await waitFor(() => {
            const amountInput = screen.getByTestId('limit-form-amount');
            expect(amountInput).toHaveValue(300);
        });

        // Update amount
        const amountInput = screen.getByTestId('limit-form-amount');
        await user.clear(amountInput);
        await user.type(amountInput, '750');

        // Spy on BudgetService updateLimit
        const updateSpy = vi.spyOn(BudgetService.prototype, 'updateLimit');

        // Submit
        await user.click(screen.getByTestId('limit-form-save'));

        // Verify update was called and success toast
        await waitFor(() => {
            expect(updateSpy).toHaveBeenCalledWith(expect.objectContaining({
                id: limitId,
                amount: 750,
            }));
            const errorToasts = screen.queryAllByText(/failed/i);
            expect(errorToasts).toHaveLength(0);
        }, { timeout: 10000 });

        // Explicitly restore the mock to prevent interference with other tests
        updateSpy.mockRestore();
    });

    // ─── Dexie failure ───────────────────────────────────────────────
    it('shows error feedback on Dexie write failure and retains form values', async () => {
        const user = userEvent.setup();

        // Spy on the BudgetService instance's createLimit method
        const createSpy = vi.spyOn(BudgetService.prototype, 'createLimit')
            .mockRejectedValue(new Error('Dexie write failed'));

        renderIntegration(<LimitForm />, {
            initialEntries: ['/limits/new'],
        });

        await waitForFormReady();

        // Select a category
        await selectFirstCategory(user);

        // Enter amount
        const amountInput = screen.getByTestId('limit-form-amount');
        await user.type(amountInput, '999');

        // Submit — should hit the spy and fail
        await user.click(screen.getByTestId('limit-form-save'));

        // Verify that the error toast appeared
        await waitFor(() => {
            expect(screen.getByText(/failed.*(add|save).*limit|Limit konnte nicht hinzugefügt werden/i)).toBeInTheDocument();
        });

        // Form should retain the entered value
        expect(amountInput).toHaveValue(999);

        // Explicitly restore the mock to prevent interference with other tests
        createSpy.mockRestore();
    });

    // ─── Cancel ──────────────────────────────────────────────────────
    it('navigates back on cancel without making any writes', async () => {
        const user = userEvent.setup();

        // Spy before render so the full component lifecycle is covered
        const spy = vi.spyOn(BudgetService.prototype, 'createLimit');

        renderIntegration(<LimitForm />, {
            initialEntries: ['/limits/new'],
        });

        await waitForFormReady();

        await user.click(screen.getByTestId('limit-form-cancel'));

        // Verify create was never called
        expect(spy).not.toHaveBeenCalled();

        // Explicitly restore the mock to prevent interference with other tests
        spy.mockRestore();
    });
});
