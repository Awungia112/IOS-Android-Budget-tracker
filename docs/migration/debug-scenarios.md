# Migration debug scenarios

This app has development/test-only migration scenario overrides so QA can exercise migration states without needing real historic installs or production legacy accounts.

The overrides are enabled only when `import.meta.env.DEV` is true or the app runs on `localhost`. Production builds on real hosts ignore these keys.

## Local/native migration gate

Used by `LocalMigrationGate` and `SyncMigrationWizard`.

### URL override

```text
?localMigrationScenario=fresh_install
?localMigrationScenario=existing_local_user
?localMigrationScenario=migration_error
?localMigrationScenario=already_migrated
```

The URL value is persisted into localStorage so the scenario survives reloads.

### localStorage override

```js
localStorage.setItem('budget-wise-debug-local-migration-scenario', 'fresh_install')
localStorage.setItem('budget-wise-debug-local-migration-scenario', 'existing_local_user')
localStorage.setItem('budget-wise-debug-local-migration-scenario', 'migration_error')
localStorage.setItem('budget-wise-debug-local-migration-scenario', 'already_migrated')
```

### Clear override

```js
localStorage.removeItem('budget-wise-debug-local-migration-scenario')
```

### Expected behavior

| Scenario | Expected behavior |
| --- | --- |
| `fresh_install` | Gate treats native install as empty legacy payload and enters the app silently. |
| `existing_local_user` | Gate shows the sync migration wizard and completes with deterministic sample data. |
| `migration_error` | Gate shows the sync migration wizard error/retry state. |
| `already_migrated` | Gate skips migration and enters the app. |

## Online/legacy account migration

Used by `MigrationBanner` and `/migration`.

### URL override

```text
?onlineMigrationScenario=required
?onlineMigrationScenario=success_single_account
?onlineMigrationScenario=success_multiple_accounts
?onlineMigrationScenario=migration_error
?onlineMigrationScenario=already_migrated
```

The URL value is persisted into localStorage so the scenario survives reloads.

### localStorage override

```js
localStorage.setItem('budget-wise-debug-online-migration-scenario', 'required')
localStorage.setItem('budget-wise-debug-online-migration-scenario', 'success_single_account')
localStorage.setItem('budget-wise-debug-online-migration-scenario', 'success_multiple_accounts')
localStorage.setItem('budget-wise-debug-online-migration-scenario', 'migration_error')
localStorage.setItem('budget-wise-debug-online-migration-scenario', 'already_migrated')
```

### Clear override

```js
localStorage.removeItem('budget-wise-debug-online-migration-scenario')
```

### Expected behavior

| Scenario | Expected behavior |
| --- | --- |
| `required` | Forces the migration banner and shows the `/migration` wizard even if normal flags would suppress it. |
| `success_single_account` | `/migration` completes with deterministic one-account sample data. |
| `success_multiple_accounts` | `/migration` completes with two sample accounts and opens the account picker overlay. |
| `migration_error` | `/migration` shows the wizard error state after credentials are submitted. |
| `already_migrated` | `/migration` shows the already-migrated screen. |

## Notes

- These overrides are for development, QA, screenshots, and automated tests.
- They must not be used as product logic.
- If a scenario appears stuck, clear both debug keys and reload.
