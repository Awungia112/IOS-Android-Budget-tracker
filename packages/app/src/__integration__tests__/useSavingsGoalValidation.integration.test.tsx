/**
 * @vitest-environment jsdom
 */
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { useSavingsGoalValidation } from '../hooks/useSavingsGoalValidation';
import { AllProviders } from '../test-utils/integration-render';
import { useBudget } from '../contexts/BudgetContext';

describe('useSavingsGoalValidation Integration', () => {
    beforeEach(async () => {
        localStorage.clear();
        const { result } = renderHook(() => useBudget(), { wrapper: AllProviders });
        await waitFor(() => expect(result.current.isLoading).toBe(false));
        await act(async () => {
            await result.current.resetApp();
        });
    });

    it('validates duplicate goals reactively when context updates', async () => {
        const { result } = renderHook(() => {
            const validation = useSavingsGoalValidation();
            const budget = useBudget();
            return { ...validation, ...budget };
        }, {
            wrapper: AllProviders,
        });

        await waitFor(() => expect(result.current.isLoading).toBe(false));

        // valid initially
        const errors = result.current.validateSavingsGoalForm(
            'Vacation', '500', '2100-12-31', 'cat-1', 'Goals', '50'
        );
        expect(errors).toEqual([]);

        await act(async () => {
            await result.current.addSavingsGoal({
                name: 'Vacation',
                targetAmount: 1000,
                deadline: '2100-12-31'
            });
        });

        // After adding to context, the hook should see the duplicate name
        await waitFor(() => {
             const validationErrors = result.current.validateSavingsGoalForm(
                'Vacation', '500', '2100-12-31', 'cat-1', 'Goals', '50',
                result.current.savingsGoals, result.current.transactions
            );
            expect(validationErrors.some(e => e.field === 'name')).toBe(true);
        });
    });

    it('checks for invalid amount', () => {
        const { result } = renderHook(() => useSavingsGoalValidation(), {
            wrapper: AllProviders,
        });

        const errors = result.current.validateSavingsGoalForm(
            'Goal', 'abc', '2100-12-31', 'cat-1', 'Category', '50'
        );
        expect(errors.some(e => e.field === 'targetAmount')).toBe(true);
    });

    it('validates that deadline cannot be in the past', () => {
        const { result } = renderHook(() => useSavingsGoalValidation(), {
            wrapper: AllProviders,
        });

        const pastDate = '2000-01-01';
        const errors = result.current.validateSavingsGoalForm(
            'Goal', '100', pastDate, 'cat-1', 'Category', '10'
        );
        expect(errors.some(e => e.field === 'deadline')).toBe(true);
    });
});
