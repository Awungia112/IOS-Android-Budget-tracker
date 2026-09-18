/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { renderHook, fireEvent, act } from '@testing-library/react';
import { useSwipeNavigation } from '../hooks/useSwipeNavigation';
import { AllProviders } from '../test-utils/integration-render';
import React from 'react';

describe('useSwipeNavigation Integration', () => {
    beforeEach(() => {
        vi.useFakeTimers();
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    const simulateSwipe = (element: HTMLElement, deltaX: number) => {
        const startX = 200;
        const endX = startX + deltaX;
        
        fireEvent.touchStart(element, { touches: [{ clientX: startX, clientY: 100 }] });
        // Velocity = deltaX / time. Threshold is 0.3 px/ms.
        // For -150px, we need > 500ms to be below 0.3.
        // But the hook also checks absX > 50.
        act(() => {
            vi.advanceTimersByTime(100); 
        });
        fireEvent.touchMove(element, { touches: [{ clientX: startX + deltaX, clientY: 100 }] });
        fireEvent.touchEnd(element, { changedTouches: [{ clientX: endX, clientY: 100 }] });
    };

    it('calls onSlideChange(1) when swiping left from index 0', () => {
        const onSlideChange = vi.fn();
        const { result } = renderHook(() => 
            useSwipeNavigation({ 
                slideCount: 3, 
                slideIndex: 0, 
                onSlideChange 
            }), { wrapper: AllProviders }
        );

        const element = document.createElement('div');
        act(() => {
            result.current.swipeHandlers.ref(element);
        });
        
        simulateSwipe(element, -150); // Swipe left (negative delta)

        expect(onSlideChange).toHaveBeenCalledWith(1);
    });

    it('calls onSlideChange(0) when swiping right from index 1', () => {
        const onSlideChange = vi.fn();
        const { result } = renderHook(() => 
            useSwipeNavigation({ 
                slideCount: 3, 
                slideIndex: 1, 
                onSlideChange 
            }), { wrapper: AllProviders }
        );

        const element = document.createElement('div');
        act(() => {
            result.current.swipeHandlers.ref(element);
        });

        simulateSwipe(element, 150); // Swipe right (positive delta)

        expect(onSlideChange).toHaveBeenCalledWith(0);
    });

    it('calls onSlideChange(2) when swiping left from index 1', () => {
        const onSlideChange = vi.fn();
        const { result } = renderHook(() => 
            useSwipeNavigation({ 
                slideCount: 3, 
                slideIndex: 1, 
                onSlideChange 
            }), { wrapper: AllProviders }
        );

        const element = document.createElement('div');
        act(() => {
            result.current.swipeHandlers.ref(element);
        });

        // Above SWIPE_DELTA_THRESHOLD (50), swipe triggers navigation.
        simulateSwipe(element, -60);

        expect(onSlideChange).toHaveBeenCalledWith(2);
    });

    it('does not call onSlideChange for small swipe (below threshold)', () => {
        const onSlideChange = vi.fn();
        const { result } = renderHook(() => 
            useSwipeNavigation({ 
                slideCount: 3, 
                slideIndex: 1, 
                onSlideChange 
            }), { wrapper: AllProviders }
        );

        const element = document.createElement('div');
        act(() => {
            result.current.swipeHandlers.ref(element);
        });

        // Below SWIPE_DELTA_THRESHOLD (50), swipe should not trigger navigation.
        simulateSwipe(element, -30);

        expect(onSlideChange).not.toHaveBeenCalled();
    });
});
