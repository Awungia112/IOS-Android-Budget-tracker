/**
 * Integration Test Setup
 *
 * MSW setup for integration tests that need HTTP request mocking.
 * Database/local storage tests (like BudgetContext) don't need MSW.
 */

import { beforeAll, afterEach, afterAll, vi } from 'vitest';
import { server } from './packages/app/src/__mocks__/server'

beforeAll(() => {
  // Stub API_BASE_URL to empty string so MSW can intercept relative paths
  vi.stubEnv('VITE_API_BASE_URL', '')
  vi.stubEnv('VITE_RECOVERY_SERVER_URL', '')
  vi.stubEnv('VITE_EMAIL_HASH_PEPPER', '')
  server.listen({ onUnhandledRequest: 'warn' })

  // Polyfill for Pointer Events API (required by vaul drawer component)
  if (typeof Element !== 'undefined' && !Element.prototype.setPointerCapture) {
    Element.prototype.setPointerCapture = vi.fn();
    Element.prototype.releasePointerCapture = vi.fn();
    Element.prototype.hasPointerCapture = vi.fn(() => false);
  }

  // Polyfill for getComputedStyle to handle transform property safely
  // This prevents vaul from crashing when trying to parse undefined transform values
  if (typeof window !== 'undefined') {
    const originalGetComputedStyle = window.getComputedStyle;
    window.getComputedStyle = function(element: Element, ...args: any[]) {
      const style = originalGetComputedStyle.call(window, element, ...args);
      // Create a proxy that returns empty string for undefined transform properties
      return new Proxy(style, {
        get(target, prop) {
          const value = target[prop as string];
          // Return empty string for transform-related properties to prevent undefined errors
          if (prop === 'transform' || prop === 'webkitTransform' || prop === 'mozTransform') {
            return value || '';
          }
          return value;
        },
      });
    };
  }
})
afterEach(() => server.resetHandlers())
afterAll(() => server.close())

/**
 * Database cleanup between integration tests.
 *
 * Uses the actual Dexie db instance to get the real database name
 * ('BudgetWiseDB') rather than a hardcoded string, so this stays
 * correct if the name ever changes.
 *
 * Runs afterAll (not afterEach) to avoid interfering with fake-indexeddb
 * state within a single test file — each file gets its own in-memory DB
 * via fake-indexeddb/auto, so per-test cleanup is not needed and can
 * cause the next test's BudgetProvider to fail initialization.
 */
afterAll(async () => {
  let dbName = 'BudgetWiseDB';
  try {
    const { db } = await import('@budget/core');
    dbName = db.name;
    if (db.isOpen()) {
      db.close();
    }
  } catch {
    // Ignore — db may not be initialised in all test contexts
  }

  await new Promise<void>((resolve, reject) => {
    const request = indexedDB.deleteDatabase(dbName);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
    request.onblocked = () => resolve(); // proceed even if blocked
  });
});