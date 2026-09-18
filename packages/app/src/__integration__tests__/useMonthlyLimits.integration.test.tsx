/**
 * @vitest-environment jsdom
 */
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { useMonthlyLimits } from '../hooks/useMonthlyLimits';
import { AllProviders } from '../test-utils/integration-render';
import { useBudget } from '../contexts/BudgetContext';

describe('useMonthlyLimits Integration', () => {
    beforeEach(async () => {
        localStorage.clear();
        const { result } = renderHook(() => useBudget(), { wrapper: AllProviders });
        await waitFor(() => expect(result.current.isLoading).toBe(false));
        await act(async () => {
            await result.current.resetApp();
        });
    });

    it('returns empty state when no limits exist', async () => {
        const { result } = renderHook(() => {
            const budget = useBudget();
            const monthly = useMonthlyLimits(budget.limits, budget.transactions);
            return { ...monthly, ...budget };
        }, {
            wrapper: AllProviders,
        });

        await waitFor(() => expect(result.current.isLoading).toBe(false));

        await waitFor(() => {
            expect(result.current.limitsWithSpending).toHaveLength(0);
        });
    });

    it('correctly derives spending and progress from real context data', async () => {
        const { result } = renderHook(() => {
            const budget = useBudget();
            const monthly = useMonthlyLimits(budget.limits, budget.transactions);
            return { ...monthly, ...budget };
        }, {
            wrapper: AllProviders,
        });

        await waitFor(() => expect(result.current.isLoading).toBe(false));

        await act(async () => {
            await result.current.addLimit({
                categoryId: 'expense-food',
                amount: 1000
            });
            await result.current.addTransaction({
                type: 'expense',
                amount: 250,
                category: 'expense-food',
                date: new Date().toISOString().split('T')[0],
                title: 'Grocery'
            });
        });

        await waitFor(() => {
            const foodLimit = result.current.limitsWithSpending.find(l => l.categoryId === 'expense-food');
            expect(foodLimit).toBeDefined();
            expect(foodLimit?.spending).toBe(250);
            expect(foodLimit?.progress).toBe(25);
            expect(foodLimit?.isExceeded).toBe(false);
        });
    });

    it('updates reactively when a new transaction is added', async () => {
        const { result } = renderHook(() => {
            const budget = useBudget();
            const monthly = useMonthlyLimits(budget.limits, budget.transactions);
            return { ...monthly, ...budget };
        }, {
            wrapper: AllProviders,
        });

        await waitFor(() => expect(result.current.isLoading).toBe(false));

        await act(async () => {
            await result.current.addLimit({
                categoryId: 'expense-food',
                amount: 100
            });
        });

        await waitFor(() => {
            const foodLimit = result.current.limitsWithSpending.find(l => l.categoryId === 'expense-food');
            expect(foodLimit?.spending).toBe(0);
        });

        await act(async () => {
            await result.current.addTransaction({
                type: 'expense',
                amount: 150,
                category: 'expense-food',
                date: new Date().toISOString().split('T')[0],
                title: 'Expensive Meal'
            });
        });

        await waitFor(() => {
            const foodLimit = result.current.limitsWithSpending.find(l => l.categoryId === 'expense-food');
            expect(foodLimit?.spending).toBe(150);
            expect(foodLimit?.isExceeded).toBe(true);
        });
    });

    it('correctly calculates across multiple seeded limits', async () => {
        const { result } = renderHook(() => {
            const budget = useBudget();
            const monthly = useMonthlyLimits(budget.limits, budget.transactions);
            return { ...monthly, ...budget };
        }, {
            wrapper: AllProviders,
        });

        await waitFor(() => expect(result.current.isLoading).toBe(false));

        await act(async () => {
            await result.current.addLimit({ categoryId: 'cat-1', amount: 100 });
            await result.current.addLimit({ categoryId: 'cat-2', amount: 200 });
            
            await result.current.addTransaction({
                type: 'expense', amount: 50, category: 'cat-1', 
                date: new Date().toISOString().split('T')[0], title: 'T1'
            });
            await result.current.addTransaction({
                type: 'expense', amount: 250, category: 'cat-2', 
                date: new Date().toISOString().split('T')[0], title: 'T2'
            });
        });

        await waitFor(() => {
            expect(result.current.limitsWithSpending).toHaveLength(2);
            const l1 = result.current.limitsWithSpending.find(l => l.categoryId === 'cat-1');
            const l2 = result.current.limitsWithSpending.find(l => l.categoryId === 'cat-2');
            
            expect(l1?.isExceeded).toBe(false);
            expect(l2?.isExceeded).toBe(true);
        });
    });
});
