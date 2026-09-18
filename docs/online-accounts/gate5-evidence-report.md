# Gate 5 Evidence: Legacy Online-Account Detection

This folder contains manual E2E testing evidence for Gate 5 migration.

## Summary of Test Results

The migration was tested against a local Legacy API Simulator (`scripts/legacy-api-simulator.ts`) using representative datasets.

### 1. Online Account Detection
When migrating an account with a sync history (`last_synced` set) and shared members, the system correctly identifies it as an online-managed account.

**Proof:**
Verified in IndexedDB `accounts` store: the migrated shared account correctly has `needsOnlinePush: true`.

### 2. Migration Completion
The migration flow completes successfully, transitioning the user from the onboarding/migration state to the main application overview.

**Proof:**
Verified in browser storage: `migration_completed: true` and `onboardingComplete: true` are present.

## Reproducibility
To repeat this test:
1. Start simulator: `pnpm tsx scripts/legacy-api-simulator.ts`
2. Connect PWA to `localhost:8080`
3. Use credentials: `online@test.de` / `password`
4. Complete migration and inspect IndexedDB.
