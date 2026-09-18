/**
 * @vitest-environment jsdom
 * Tests for service worker utilities
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { setOfflineState, loadOfflineState, generateOfflineHTML } from './swUtils';

// Mock console.error to avoid noise in tests
vi.spyOn(console, 'error').mockImplementation(() => undefined);

describe('swUtils - Offline State Functions', () => {
    let mockCaches: {
        open: ReturnType<typeof vi.fn>;
    };
    let mockCache: {
        put: ReturnType<typeof vi.fn>;
        match: ReturnType<typeof vi.fn>;
    };

    beforeEach(() => {
        vi.clearAllMocks();
        
        // Create fresh mocks for each test
        mockCache = {
            put: vi.fn(),
            match: vi.fn(),
        };
        
        mockCaches = {
            open: vi.fn().mockResolvedValue(mockCache),
        };
        
        // Mock global caches object
        vi.stubGlobal('caches', mockCaches);
    });

    afterEach(() => {
        vi.unstubAllGlobals();
    });

    describe('setOfflineState', () => {
        it('should save offline state to cache', async () => {
            mockCache.put.mockResolvedValue(undefined);

            await setOfflineState(true);

            expect(mockCaches.open).toHaveBeenCalledWith('offline-state');
            expect(mockCache.put).toHaveBeenCalledWith(
                'forceOffline',
                expect.objectContaining({
                    status: 200,
                })
            );
        });

        it('should handle cache errors gracefully', async () => {
            mockCaches.open.mockRejectedValue(new Error('Cache error'));

            // Should not throw
            await expect(setOfflineState(true)).resolves.not.toThrow();
        });

        it('should save false offline state to cache', async () => {
            mockCache.put.mockResolvedValue(undefined);

            await setOfflineState(false);

            expect(mockCaches.open).toHaveBeenCalledWith('offline-state');
            expect(mockCache.put).toHaveBeenCalledWith(
                'forceOffline',
                expect.any(Object)
            );
        });
    });

    describe('loadOfflineState', () => {
        it('should return true when offline state is true', async () => {
            mockCache.match.mockResolvedValue({
                json: async () => ({ offline: true }),
            });

            const result = await loadOfflineState();

            expect(result).toBe(true);
        });

        it('should return false when offline state is false', async () => {
            mockCache.match.mockResolvedValue({
                json: async () => ({ offline: false }),
            });

            const result = await loadOfflineState();

            expect(result).toBe(false);
        });

        it('should return false when no cached state exists', async () => {
            mockCache.match.mockResolvedValue(undefined);

            const result = await loadOfflineState();

            expect(result).toBe(false);
        });

        it('should handle cache errors gracefully and return false', async () => {
            mockCaches.open.mockRejectedValue(new Error('Cache error'));

            const result = await loadOfflineState();

            expect(result).toBe(false);
        });

        it('should handle JSON parse errors gracefully', async () => {
            mockCache.match.mockResolvedValue({
                json: async () => {
                    throw new Error('JSON parse error');
                },
            });

            const result = await loadOfflineState();

            expect(result).toBe(false);
        });
    });

    describe('generateOfflineHTML', () => {
        it('should return a Response object', () => {
            const response = generateOfflineHTML();
            
            expect(response).toBeInstanceOf(Response);
        });

        it('should have correct content-type header', () => {
            const response = generateOfflineHTML();
            expect(response.headers.get('Content-Type')).toBe('text/html');
        });

        it('should contain offline message', async () => {
            const response = generateOfflineHTML();
            const text = await response.text();
            
            expect(text).toContain("You're Offline");
            expect(text).toContain('Retry');
        });

        it('should contain styled HTML', async () => {
            const response = generateOfflineHTML();
            const text = await response.text();
            
            expect(text).toContain('<!DOCTYPE html>');
            expect(text).toContain('<style>');
            expect(text).toContain('Budget Wise');
        });
    });
});

