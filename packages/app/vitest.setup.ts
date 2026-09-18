/**
 * Vitest Setup for packages/app
 *
 * Configures testing environment for React components and hooks.
 */

import { vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import 'fake-indexeddb/auto';

// Mock window.matchMedia for components that use it
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

// Provide a default mock for useMigrationDrawer so unit tests that render
// Layout (or any component using the hook) don't need to wrap with
// MigrationDrawerProvider. Integration tests use the real provider via
// renderIntegration / integration-render.tsx.
