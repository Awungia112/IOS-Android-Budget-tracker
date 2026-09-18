/**
 * @vitest-environment jsdom
 */
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { AllProviders } from '../test-utils/integration-render';
import { useBudget } from '../contexts/BudgetContext';
import { useLimitValidation } from '../hooks/useLimitValidation';


const useLimitValidationFromContext = () => {
    const { validateLimitForm } = useLimitValidation();
    const budget = useBudget();
    
    return {
        validateLimitForm: (categoryId: string, amount: string, excludeLimitId?: string) => 
            validateLimitForm(categoryId, amount, budget.limits, excludeLimitId)
    };
};

describe('useLimitValidation Integration', () => {
    beforeEach(async () => {
        localStorage.clear();
        const { result } = renderHook(() => useBudget(), { wrapper: AllProviders });
        await waitFor(() => expect(result.current.isLoading).toBe(false));
        await act(async () => {
            await result.current.resetApp();
        });
    });

    it('validates duplicate limits reactively when context updates', async () => {
        const { result } = renderHook(() => {
            const validation = useLimitValidation();
            const budget = useBudget();
            return { validation, budget };
        }, {
            wrapper: AllProviders,
        });

        await waitFor(() => expect(result.current.budget.isLoading).toBe(false));

        // initially no error for 'expense-food'
        expect(result.current.validation.validateLimitForm('expense-food', '100', result.current.budget.limits)).toEqual([]);

        // Add a limit through budget context
        await act(async () => {
            await result.current.budget.addLimit({
                categoryId: 'expense-food',
                amount: 500
            });
        });

        // After adding to context, the validation hook should now see the duplicate
        await waitFor(() => {
            const errors = result.current.validation.validateLimitForm('expense-food', '100', result.current.budget.limits);
            expect(errors.length).toBeGreaterThan(0);
            expect(errors[0].field).toBe('categoryId');
        });
    });

    it('returns a safe default state when no limits exist', async () => {
        const { result } = renderHook(() => useLimitValidationFromContext(), {
            wrapper: AllProviders,
        });

        const errors = result.current.validateLimitForm('expense-food', '100');
        expect(errors).toEqual([]);
    });

    it('validates invalid amounts', async () => {
        const { result } = renderHook(() => useLimitValidationFromContext(), {
            wrapper: AllProviders,
        });

        const errors = result.current.validateLimitForm('expense-food', '-50');
        expect(errors.some(e => e.field === 'amount')).toBe(true);
    });
});
