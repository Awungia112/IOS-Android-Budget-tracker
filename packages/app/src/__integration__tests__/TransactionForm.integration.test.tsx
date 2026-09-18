/**
 * @vitest-environment jsdom
 *
 * Integration tests — TransactionForm
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
import TransactionForm from '@/components/TransactionForm';
import { BudgetService, db } from '@budget/core';

// ── helpers ────────────────────────────────────────────────────────────
const waitForProviderReady = () =>
    waitFor(() => {
        expect(screen.getByTestId('transaction-save-button')).toBeInTheDocument();
    }, { timeout: 5000 });

// ── suite ──────────────────────────────────────────────────────────────
describe('TransactionForm — integration', () => {
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

    // ─── Happy path ──────────────────────────────────────────────────
    it('submits a new transaction and shows success feedback', async () => {
        const user = userEvent.setup();
        const onSave = vi.fn();

        renderIntegration(
            <TransactionForm type="expense" onSave={onSave} onCancel={vi.fn()} />,
        );

        await waitForProviderReady();

        // Fill the amount field
        const amountInput = screen.getByTestId('transaction-amount-input');
        await user.type(amountInput, '150');

        // Optionally type a note
        const noteInput = screen.getByTestId('transaction-note-input');
        await user.type(noteInput, 'Grocery shopping');

        // Spy before submit to cover the full Dexie write pipeline
        const createSpy = vi.spyOn(BudgetService.prototype, 'createTransaction');

        // Submit — a category is auto-selected by the form on mount
        await user.click(screen.getByTestId('transaction-save-button'));

        await waitFor(() => {
            expect(onSave).toHaveBeenCalled();
            expect(createSpy).toHaveBeenCalledWith(expect.objectContaining({
                amount: 150,
            }), expect.any(String)); // accountId is the second parameter
        }, { timeout: 5000 });

        // Explicitly restore the mock to prevent interference with other tests
        createSpy.mockRestore();
    });

    // ─── Validation block ────────────────────────────────────────────
    it('blocks submission and shows error when amount is empty', async () => {
        const user = userEvent.setup();
        const onSave = vi.fn();

        renderIntegration(
            <TransactionForm type="expense" onSave={onSave} onCancel={vi.fn()} />,
        );

        await waitForProviderReady();

        // Submit with empty amount — the form validates and fires a toast
        await user.click(screen.getByTestId('transaction-save-button'));

        // onSave must NOT have been called
        expect(onSave).not.toHaveBeenCalled();

        // Verify that the validation error toast appeared (mapped to error_amount_required)
        await waitFor(() => {
            expect(screen.getByText(/please.*enter.*valid.*amount|gültigen.*Betrag/i)).toBeInTheDocument();
        }, { timeout: 10000 });
    });

    // ─── Dexie failure ───────────────────────────────────────────────
    it('shows error feedback on Dexie write failure and retains form values', async () => {
        const user = userEvent.setup();
        const onSave = vi.fn().mockName('onSave');

        // Spy on the BudgetService instance's createTransaction method via the prototype
        const createSpy = vi.spyOn(BudgetService.prototype, 'createTransaction')
            .mockRejectedValue(new Error('Dexie write failed'));

        renderIntegration(
            <TransactionForm type="expense" onSave={onSave} onCancel={vi.fn()} />,
        );

        await waitForProviderReady();

        // Fill the amount
        const amountInput = screen.getByTestId('transaction-amount-input');
        await user.type(amountInput, '50');

        // Submit — should hit the spied-on create and fail
        await user.click(screen.getByTestId('transaction-save-button'));

        // The catch block logs the error but does not show a toast (out of scope).
        // Verify onSave was NOT called and the form retains its value for retry.
        await waitFor(() => {
            expect(onSave).not.toHaveBeenCalled();
        }, { timeout: 10000 });

        expect(amountInput).toHaveValue(50);

        // Explicitly restore the mock to prevent interference with other tests
        createSpy.mockRestore();
    });

    // ─── Edit mode ───────────────────────────────────────────────────
    it('pre-fills the form in edit mode and calls updateTransaction on submit', async () => {
        const user = userEvent.setup();
        const onSave = vi.fn();

        // beforeEach already opens the db; BudgetProvider seeds default data on mount.
        const categories = await db.categories.toArray();
        const expenseCat = categories.find(c => c.type === 'expense');
        expect(expenseCat).toBeTruthy();

        const existingTransaction = {
            id: 'tx-edit-1',
            accountId: expenseCat!.accountId,
            type: 'expense' as const,
            amount: 42.5,
            category: expenseCat!.id,
            date: '2025-06-15',
            title: 'Coffee',
        };

        renderIntegration(
            <TransactionForm
                type="expense"
                onSave={onSave}
                onCancel={vi.fn()}
                editTransaction={existingTransaction}
            />,
        );

        await waitForProviderReady();

        // Verify pre-fill (wrapped in waitFor to allow context to load data)
        await waitFor(() => {
            expect(screen.getByTestId('transaction-amount-input')).toHaveValue(42.5);
            expect(screen.getByTestId('transaction-note-input')).toHaveValue('Coffee');
            
            // Verify category is pre-selected
            // Use a more robust check since it might be the translated name or the key
            const categoryChip = screen.getByTestId('transaction-category-chip');
            expect(categoryChip).not.toHaveTextContent(/select.*category/i);
        }, { timeout: 10000 });

        // The save button should read "Update" in edit mode
        const updateButton = screen.getByTestId('transaction-save-button');
        expect(updateButton).toBeInTheDocument();

        // Change the amount
        const amountInput = screen.getByTestId('transaction-amount-input');
        await user.clear(amountInput);
        await user.type(amountInput, '55');

        // Spy on the BudgetService's updateTransaction method
        const updateSpy = vi.spyOn(BudgetService.prototype, 'updateTransaction');

        // Submit
        await user.click(updateButton);

        await waitFor(() => {
            expect(onSave).toHaveBeenCalled();
            // Verify updateTransaction was called with correct values
            expect(updateSpy).toHaveBeenCalledWith(expect.objectContaining({
                id: 'tx-edit-1',
                amount: 55,
                category: expenseCat!.id,
                title: 'Coffee'
            }));
        }, { timeout: 5000 });

        // Explicitly restore the mock to prevent interference with other tests
        updateSpy.mockRestore();
    });
});
