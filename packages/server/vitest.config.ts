import { defineConfig } from 'vitest/config';
import { resolve } from 'path';

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html', 'cobertura'],
      reportsDirectory: '../../coverage/server',
    },
  },
  resolve: {
    alias: {
      '@budget/core': resolve(__dirname, '../core/src'),
      '@budget/shared/sync-limits': resolve(__dirname, '../shared/src/sync-limits.ts'),
      '@budget/shared/session-token': resolve(__dirname, '../shared/src/session-token.ts'),
      '@budget/shared': resolve(__dirname, '../shared/src/index.ts'),
    },
  },
});
