/// <reference types="vitest" />
import { defineConfig } from 'vite'
import { resolve } from 'path'

const INTEGRATION_EXCLUDES = [
  '**/*.integration.test.*',
  '**/__integration__tests__/**',
]

export default defineConfig({
  test: {
    globals: true,
    environment: 'jsdom',
    environmentMatchGlobs: [
      // Crypto tests run in Node — no DOM needed, avoids WASM/localStorage issues
      ['packages/core/src/crypto/**', 'node'],
      // Server tests run in Node — argon2 native bindings don't work in jsdom
      ['packages/server/src/**', 'node'],
      // Recovery-server tests run in Node
      ['packages/recovery-server/src/**', 'node'],
    ],
    setupFiles: ['./vitest.setup.ts'],
    testTimeout: 60000, // Increase default test timeout to 60 seconds
    include: [
      'packages/core/src/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}',
      'packages/app/src/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}',
      'packages/server/src/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}',
      'scripts/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}'
    ],
    exclude: [
      '**/node_modules/**',
      '**/dist/**',
      '**/.{idea,git,cache,output,temp}/**',
      '**/{karma,rollup,webpack,vite,vitest,ava,babel,nyc,cypress,tsup,build}.config.*',
      'scripts/**/*.spec.ts',
      'scripts/gate*-manual-e2e.test.ts',
      ...INTEGRATION_EXCLUDES,
    ],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html', 'cobertura'],
      reportsDirectory: 'coverage/app',
      exclude: [
        'node_modules/',
        'coverage/',
        'dist/',
        '**/*.d.ts',
        '**/*.config.{js,ts}',
        '**/test-setup.{js,ts}',
        ...INTEGRATION_EXCLUDES,
        '**/types/**',  // Exclude all type definition files
        '**/constants/**', // Exclude constant files
      ],
    },
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, './packages/app/src'),
      '@budget/core': resolve(__dirname, './packages/core/src'),
      '@budget/shared/sync-limits': resolve(__dirname, './packages/shared/src/sync-limits.ts'),
      '@budget/shared/session-token': resolve(__dirname, './packages/shared/src/session-token.ts'),
      '@budget/shared': resolve(__dirname, './packages/shared/src/index.ts'),
    },
  },
})
