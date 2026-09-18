/**
 * @vitest-environment jsdom
 *
 * Integration tests — TemplateForm
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
import TemplateForm from '@/pages/TemplateForm';
import Templates from '@/pages/Templates';
import { BudgetService, db } from '@budget/core';

// ---------------------------------------------------------------------------
// i18n mock — force English so assertions are language-independent
// (German is now the app default; see SyncMigrationWizard.test.tsx for the
// same pattern). `t`/`i18n` must stay referentially stable across renders —
// unlike the real react-i18next, a freshly-created object every render would
// break useCallback/useEffect deps keyed on `t` (e.g. BudgetContext) and
// cause a render loop.
// ---------------------------------------------------------------------------
import enTranslations from '@/i18n/locales/en.json';

const mockT = (key: string, options?: Record<string, unknown>) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const template = (enTranslations as any)[key];
    if (typeof template !== 'string') return key;
    if (!options) return template;
    return Object.entries(options).reduce(
        (acc, [optKey, optValue]) => acc.replaceAll(`{{${optKey}}}`, String(optValue)),
        template,
    );
};
const mockI18n = { language: 'en', changeLanguage: vi.fn() };

vi.mock('react-i18next', () => ({
    useTranslation: () => ({ t: mockT, i18n: mockI18n }),
    initReactI18next: { type: '3rdParty', init: vi.fn() },
}));

// ── helpers ────────────────────────────────────────────────────────────
const waitForFormReady = () =>
    waitFor(() => {
        // TemplateForm save button uses aria-label="Save"
        expect(screen.getByRole('button', { name: /save/i })).toBeInTheDocument();
    }, { timeout: 5000 });

/**
 * Select the first category chip visible in the grid.
 */
const selectFirstCategory = async (user: ReturnType<typeof userEvent.setup>) => {
    await waitFor(() => {
        const catButtons = screen.getAllByRole('button').filter(
            btn => btn.getAttribute('aria-pressed') !== null
        );
        expect(catButtons.length).toBeGreaterThan(0);
    });

    const catButtons = screen.getAllByRole('button').filter(
        btn => btn.getAttribute('aria-pressed') !== null
    );
    await user.click(catButtons[0]);
};

// ── suite ──────────────────────────────────────────────────────────────
describe('TemplateForm — integration', () => {
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

    // ─── Save template (happy path) ──────────────────────────────────
    it('saves a new template: fills name, amount, selects category, submits', async () => {
        const user = userEvent.setup();

        renderIntegration(<TemplateForm />, {
            initialEntries: ['/templates/new'],
        });

        await waitForFormReady();

        // Enter name input
        const nameInput = screen.getByRole('textbox');
        await user.type(nameInput, 'Monthly Rent');

        // Enter amount input
        const amountInput = screen.getByRole('spinbutton');
        await user.type(amountInput, '800');

        // Select a category
        await selectFirstCategory(user);

        // Spy on BudgetService createTemplate
        const createSpy = vi.spyOn(BudgetService.prototype, 'createTemplate');

        // Submit
        await user.click(screen.getByRole('button', { name: /save/i }));

        // Verify success
        await waitFor(() => {
            // Check that createTemplate was called with correct data
            expect(createSpy).toHaveBeenCalledWith(expect.objectContaining({
                name: 'Monthly Rent',
                amount: 800,
            }), expect.any(String)); // accountId is the second parameter

            // Check for success toast
            expect(screen.getByText(/template.*added.*successfully/i)).toBeInTheDocument();
        }, { timeout: 10000 });
    });

    // ─── Validation block ────────────────────────────────────────────
    it('blocks submission and shows error when name or amount is empty', async () => {
        const user = userEvent.setup();

        renderIntegration(<TemplateForm />, {
            initialEntries: ['/templates/new'],
        });

        await waitForFormReady();

        // Submit with empty fields
        await user.click(screen.getByRole('button', { name: /save/i }));

        // Validation should produce inline errors
        await waitFor(() => {
            expect(screen.getByText('Name is required')).toBeInTheDocument();
        }, { 
            timeout: 20000,
            interval: 500
        });
    });


    // ─── Duplicate validation ────────────────────────────────────────
    it('shows duplicate error when adding template with same name+amount+category+type', async () => {
        const user = userEvent.setup();

        // beforeEach already opens the db; BudgetProvider seeds default data on mount.
        const categories = await db.categories.toArray();
        const expenseCat = categories.find(c => c.type === 'expense');
        expect(expenseCat).toBeTruthy();

        // Insert an existing template
        await db.templates.add({
            id: 'template-dup',
            accountId: expenseCat!.accountId,
            name: 'Grocery Run',
            amount: 100,
            categoryId: expenseCat!.id,
            type: 'expense',
        });

        renderIntegration(<TemplateForm />, {
            initialEntries: ['/templates/new'],
        });

        await waitForFormReady();

        // Fill name input to match existing template
        const nameInput = screen.getByRole('textbox');
        await user.type(nameInput, 'Grocery Run');

        const amountInput = screen.getByRole('spinbutton');
        await user.type(amountInput, '100');

        // Select the same category (first expense category = the one used above)
        await selectFirstCategory(user);

        // Submit — should trigger duplicate detection in BudgetContext.addTemplate
        await user.click(screen.getByRole('button', { name: /save/i }));

        // The context fires a destructive toast with the duplicate message.
        await waitFor(() => {
            expect(screen.getByText(/already.*exists/i)).toBeInTheDocument();
        }, { timeout: 10000 });
    });

    // ─── Edit mode ───────────────────────────────────────────────────
    it('pre-fills form in edit mode and submits updated template', async () => {
        const user = userEvent.setup();

        // beforeEach already opens the db; BudgetProvider seeds default data on mount.
        const categories = await db.categories.toArray();
        const expenseCat = categories.find(c => c.type === 'expense');
        expect(expenseCat).toBeTruthy();

        const templateId = 'template-edit';
        await db.templates.add({
            id: templateId,
            accountId: expenseCat!.accountId,
            name: 'Old Template',
            amount: 200,
            categoryId: expenseCat!.id,
            type: 'expense',
        });

        renderIntegration(<TemplateForm />, {
            initialEntries: [`/templates/edit/${templateId}`],
            routePath: '/templates/edit/:templateId',
        });

        await waitForFormReady();

        // Verify pre-fill
        await waitFor(() => {
            expect(screen.getByDisplayValue('Old Template')).toBeInTheDocument();
            expect(screen.getByDisplayValue('200')).toBeInTheDocument();
        });

        // Update name
        const nameInput = screen.getByDisplayValue('Old Template');
        await user.clear(nameInput);
        await user.type(nameInput, 'Updated Template');

        // Spy on BudgetService updateTemplate
        const updateSpy = vi.spyOn(BudgetService.prototype, 'updateTemplate');

        // Submit
        await user.click(screen.getByRole('button', { name: /save/i }));

        // Verify success
        await waitFor(() => {
            expect(updateSpy).toHaveBeenCalledWith(expect.objectContaining({
                id: templateId,
                name: 'Updated Template',
            }));

            expect(screen.getByText(/template.*updated.*successfully/i)).toBeInTheDocument();
        }, { timeout: 10000 });
    });

    // ─── Dexie failure ───────────────────────────────────────────────
    it('shows error feedback on Dexie write failure and retains form values', async () => {
        const user = userEvent.setup();

        const createSpy = vi.spyOn(BudgetService.prototype, 'createTemplate')
            .mockRejectedValue(new Error('Dexie write failed'));

        renderIntegration(<TemplateForm />, {
            initialEntries: ['/templates/new'],
        });

        await waitForFormReady();

        const nameInput = screen.getByRole('textbox');
        await user.type(nameInput, 'Failing Template');

        const amountInput = screen.getByRole('spinbutton');
        await user.type(amountInput, '123');

        await selectFirstCategory(user);

        await user.click(screen.getByRole('button', { name: /save/i }));

        await waitFor(() => {
            expect(screen.getByText(/failed.*(add|save).*template/i)).toBeInTheDocument();
        }, { timeout: 10000 });

        // Form should retain entered values
        expect(nameInput).toHaveValue('Failing Template');
        expect(amountInput).toHaveValue(123);

        createSpy.mockRestore();
    });

    // ─── Apply template ──────────────────────────────────────────────
    it('applying a template creates a transaction pre-populated with template fields', async () => {
        const user = userEvent.setup();

        const categories = await db.categories.toArray();
        const expenseCat = categories.find(c => c.type === 'expense');
        expect(expenseCat).toBeTruthy();

        const templateId = 'template-apply';
        await db.templates.add({
            id: templateId,
            accountId: expenseCat!.accountId,
            name: 'Monthly Rent',
            amount: 750,
            categoryId: expenseCat!.id,
            type: 'expense',
        });

        const createSpy = vi.spyOn(BudgetService.prototype, 'createTransaction');

        renderIntegration(<Templates />, {
            initialEntries: ['/templates'],
        });

        // Wait for the template card to appear
        await waitFor(() => {
            expect(screen.getByText('Monthly Rent')).toBeInTheDocument();
        }, { timeout: 5000 });

        // Click the Apply (arrow) button
        await user.click(screen.getByRole('button', { name: /apply/i }));

        // Verify the transaction was created with the template's fields
        await waitFor(() => {
            expect(createSpy).toHaveBeenCalledWith(expect.objectContaining({
                amount: 750,
                category: expenseCat!.id,
                title: 'Monthly Rent',
                type: 'expense',
            }), expect.any(String)); // accountId is the second parameter
            expect(screen.getByText(/template.*applied/i)).toBeInTheDocument();
        }, { timeout: 10000 });
    });

    // ─── Delete removes item reactively ──────────────────────────────
    it('deletes a template and it disappears from the list without reload', async () => {
        const user = userEvent.setup();

        // beforeEach already opens the db; BudgetProvider seeds default data on mount.
        const categories = await db.categories.toArray();
        const expenseCat = categories.find(c => c.type === 'expense');
        expect(expenseCat).toBeTruthy();

        const templateId = 'template-delete';
        await db.templates.add({
            id: templateId,
            accountId: expenseCat!.accountId,
            name: 'Template To Delete',
            amount: 50,
            categoryId: expenseCat!.id,
            type: 'expense',
        });

        // Spy before render so the full component lifecycle is covered
        const deleteSpy = vi.spyOn(BudgetService.prototype, 'deleteTemplate');

        renderIntegration(<Templates />, {
            initialEntries: ['/templates'],
        });

        // Wait for the template to appear in the list
        await waitFor(() => {
            expect(screen.getByText('Template To Delete')).toBeInTheDocument();
        }, { timeout: 5000 });

        await user.click(screen.getByRole('button', { name: /delete/i }));

        // Confirm in the alert dialog
        const confirmButtons = screen.getAllByRole('button', { name: /delete/i });
        // The dialog confirm button is the last one rendered
        await user.click(confirmButtons[confirmButtons.length - 1]);

        // Verify the item is gone from the DOM — reactive state, no reload
        await waitFor(() => {
            expect(screen.queryByText('Template To Delete')).not.toBeInTheDocument();
        }, { timeout: 10000 });

        expect(deleteSpy).toHaveBeenCalledWith(templateId, 'main-account');
    });

    // ─── Cancel ──────────────────────────────────────────────────────
    it('navigates back on cancel without making any writes', async () => {
        const user = userEvent.setup();

        // Spy before render so the full component lifecycle is covered
        const spy = vi.spyOn(BudgetService.prototype, 'createTemplate');

        renderIntegration(<TemplateForm />, {
            initialEntries: ['/templates/new'],
        });

        await waitForFormReady();

        // Click cancel button (aria-label="Cancel")
        await user.click(screen.getByRole('button', { name: /cancel/i }));

        expect(spy).not.toHaveBeenCalled();
        spy.mockRestore();
    });

});


