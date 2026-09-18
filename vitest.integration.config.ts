/// <reference types="vitest" />
import { defineConfig } from 'vite'
import { resolve } from 'path'

export default defineConfig({
    test: {
    globals: true,
    // Integration suites share the MSW server and fake IndexedDB singleton.
    // Running files concurrently lets one suite reset those globals while
    // another suite is still exercising them.
    fileParallelism: false,
    environment: 'jsdom',
    environmentMatchGlobs: [
      ['packages/core/src/migration/**', 'node'],
    ],
        reporters: ['default', 'junit'],
        setupFiles: ['./vitest.setup.ts', './vitest.integration.setup.ts'],
        testTimeout: 60000,
        hookTimeout: 30000,
        include: [
            'packages/app/src/__integration__tests__/**/*.integration.test.{js,ts,jsx,tsx}',
            'packages/core/src/**/__integration__tests__/**/*.integration.test.{js,ts,jsx,tsx}',
        ],
        outputFile: {
            junit: 'coverage/integration/junit.xml'
        },
        coverage: {
            provider: 'v8',
            reporter: ['text', 'json', 'html', 'cobertura'],
            reportsDirectory: 'coverage/integration',
            clean: true,
            include: ['packages/app/src/**', 'packages/core/src/**'],
            exclude: [
                'node_modules/', 
                'dist/', 
                '**/dist/**',
                '**/*.d.ts',
                '**/*.config.{js,ts}', 
                '**/test-setup.{js,ts}',
                '**/types/**',  // Exclude all type definition files
                '**/constants/**', // Exclude constant files
                'packages/app/e2e/**',
                'android/**',
                'ios/**',
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
