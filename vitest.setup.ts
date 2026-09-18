/**
 * Vitest Global Setup
 *
 * Environment polyfills only. Module mocks (react-i18next, react-router-dom,
 * lucide-react, etc.) belong in individual test files per Vitest best practices.
 */

import '@testing-library/jest-dom/vitest';
import { vi } from 'vitest';
import 'fake-indexeddb/auto';

// Ensure a complete localStorage implementation is available before app modules load.
// Some test environments expose a partial Storage object without methods.
if (typeof globalThis !== 'undefined') {
  const createStorageMock = () => {
    let store: Record<string, string> = {};

    return {
      get length() {
        return Object.keys(store).length;
      },
      clear: vi.fn(() => {
        store = {};
      }),
      getItem: vi.fn((key: string) => (Object.prototype.hasOwnProperty.call(store, key) ? store[key] : null)),
      key: vi.fn((index: number) => Object.keys(store)[index] ?? null),
      removeItem: vi.fn((key: string) => {
        delete store[key];
      }),
      setItem: vi.fn((key: string, value: string) => {
        store[key] = String(value);
      }),
    } as Storage;
  };

  const currentLocalStorage = (globalThis as any).localStorage;
  if (
    !currentLocalStorage ||
    typeof currentLocalStorage.getItem !== 'function' ||
    typeof currentLocalStorage.setItem !== 'function' ||
    typeof currentLocalStorage.removeItem !== 'function' ||
    typeof currentLocalStorage.clear !== 'function'
  ) {
    const storageMock = createStorageMock();
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      writable: true,
      value: storageMock,
    });

    if (typeof window !== 'undefined') {
      Object.defineProperty(window, 'localStorage', {
        configurable: true,
        writable: true,
        value: storageMock,
      });
    }
  }
}

// Initialize i18n to prevent "NO_I18NEXT_INSTANCE" warnings
import './packages/app/src/lib/i18n';

// Define APP_VERSION for tests (this is usually set by vite's define option)
if (typeof globalThis !== 'undefined') {
    (globalThis as any).APP_VERSION = '0.0.1';
}

// Mock window.matchMedia for components that use it
if (typeof window !== 'undefined') {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: vi.fn().mockImplementation(query => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });

  // Mock ResizeObserver for Radix UI components
  global.ResizeObserver = vi.fn().mockImplementation(() => ({
    observe: vi.fn(),
    unobserve: vi.fn(),
    disconnect: vi.fn(),
  }));

  // Mock system dialogs
  window.HTMLDialogElement.prototype.show = vi.fn();
  window.HTMLDialogElement.prototype.showModal = vi.fn();
  window.HTMLDialogElement.prototype.close = vi.fn();
}
