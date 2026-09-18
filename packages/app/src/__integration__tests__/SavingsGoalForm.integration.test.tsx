/**
 * @vitest-environment jsdom
 *
 * Integration tests — SavingsGoalForm
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
import SavingsGoalForm from '@/pages/SavingsGoalForm';
import { BudgetService, db } from '@budget/core';

// ── helpers ────────────────────────────────────────────────────────────
const waitForFormReady = () =>
    waitFor(() => {
        expect(screen.getByTestId('savings-goal-form-save')).toBeInTheDocument();
    }, { timeout: 10000 });

/**
 * Select the first expense category chip.
 * This also auto-sets the goal name to the category label.
 */
const selectFirstCategory = async (user: ReturnType<typeof userEvent.setup>) => {
    await waitFor(() => {
        const buttons = screen.getAllByRole('button').filter(
            btn => btn.getAttribute('data-testid')?.startsWith('savings-goal-category-')
        );
        expect(buttons.length).toBeGreaterThan(0);
    }, { timeout: 10000 });

    const categoryButtons = screen.getAllByRole('button').filter(
        btn => btn.getAttribute('data-testid')?.startsWith('savings-goal-category-')
    );
    await user.click(categoryButtons[0]);
};

// ── suite ──────────────────────────────────────────────────────────────
describe('SavingsGoalForm — integration', () => {
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
    it('creates a new savings goal: selects category, enters target, saves', async () => {
        const user = userEvent.setup();

        // Spy before render so the full component lifecycle is covered
        const createSpy = vi.spyOn(BudgetService.prototype, 'createSavingsGoal');

        renderIntegration(<SavingsGoalForm />, {
            initialEntries: ['/savings-goals/new'],
        });

        await waitForFormReady();

        // Select a category
        await selectFirstCategory(user);

        // Enter goal name
        const nameInput = screen.getByTestId('savings-goal-form-name');
        await user.type(nameInput, 'Emergency Fund');

        // Enter target amount
        const amountInput = screen.getByTestId('savings-goal-form-amount');
        await user.type(amountInput, '1000');

        // Submit
        await user.click(screen.getByTestId('savings-goal-form-save'));

        // Verify success
        await waitFor(() => {
            // Check that createSavingsGoal was called with correct data
            expect(createSpy).toHaveBeenCalledWith(expect.objectContaining({
                targetAmount: 1000,
            }), expect.any(String)); // accountId is the second parameter

            // Check for success toast
            expect(screen.getByText(/savings.*goal.*added.*successfully|Sparziel erfolgreich hinzugefügt/i)).toBeInTheDocument();
        }, { timeout: 15000 });
    });

    // ─── Validation — missing target amount ──────────────────────────
    it('shows validation error when submitting without target amount', async () => {
        const user = userEvent.setup();

        renderIntegration(<SavingsGoalForm />, {
            initialEntries: ['/savings-goals/new'],
        });

        await waitForFormReady();

        // Select a category so the name field gets populated
        await selectFirstCategory(user);
        await user.click(screen.getByTestId('savings-goal-form-save'));

        // Validation should produce inline errors
        await waitFor(() => {
            expect(screen.getByText(/all.*fields.*required|Alle Felder sind erforderlich/i)).toBeInTheDocument();
        }, { timeout: 10000 });
    });

    it.todo('shows validation error when existing savings goal has a past deadline', () => {
      // DatePickerDialog disablePastDates=true prevents testing past dates directly.
      // Form useEffect overrides past DB deadline with compute future date anyway.
      // Full coverage requires: 1) mock DatePicker to allow past selection, or 2) unit test validation hook directly.
      // Current test falsely passes by validating computed future date instead.
    });

    // ─── Edit mode ───────────────────────────────────────────────────
    it('pre-fills form in edit mode and submits updated goal', async () => {
        const user = userEvent.setup();

        // beforeEach already opens the db; BudgetProvider seeds default data on mount.
        const categories = await db.categories.toArray();
        const expenseCat = categories.find(c => c.type === 'expense');
        expect(expenseCat).toBeTruthy();

        const goalId = 'test-goal-edit';
        const futureDate = new Date();
        futureDate.setFullYear(futureDate.getFullYear() + 1);
        const deadlineString = futureDate.toISOString().split('T')[0];

        await db.savingsGoals.add({
            id: goalId,
            accountId: expenseCat!.accountId,
            name: 'Test Goal',
            targetAmount: 2000,
            deadline: deadlineString,
            categoryId: expenseCat!.id,
        });

        renderIntegration(<SavingsGoalForm />, {
            initialEntries: [`/savings-goals/edit/${goalId}`],
            routePath: '/savings-goals/edit/:goalId',
        });

        await waitForFormReady();

        // Verify amount pre-fill
        await waitFor(() => {
            const amountInput = screen.getByTestId('savings-goal-form-amount');
            expect(amountInput).toHaveValue(2000);
        });

        // Update target amount
        const amountInput = screen.getByTestId('savings-goal-form-amount');
        await user.clear(amountInput);
        await user.type(amountInput, '2500');

        // Spy on BudgetService updateSavingsGoal
        const updateSpy = vi.spyOn(BudgetService.prototype, 'updateSavingsGoal');

        // Submit
        await user.click(screen.getByTestId('savings-goal-form-save'));

        // Verify success
        await waitFor(() => {
            // Check that update was called with the new target amount
            expect(updateSpy).toHaveBeenCalledWith(expect.objectContaining({
                id: goalId,
                targetAmount: 2500,
            }));

            // Optional: check for success toast
            expect(screen.getByText(/savings.*goal.*updated.*successfully|Sparziel erfolgreich aktualisiert/i)).toBeInTheDocument();
        }, { timeout: 10000 });
    });
});
