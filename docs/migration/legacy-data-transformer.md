# Legacy Data Migration

This module handles the migration of data from the legacy "Mein Budget" Django API to Budget Wise.

## Architecture

The migration flow consists of three main components:

1. **LegacyApiClient** - Authenticates and fetches all user data (all accounts) from the legacy API
2. **LegacyDataTransformer** - Transforms one account's legacy data to Budget Wise format per call
3. **MigrationService** - Orchestrates the full migration: iterates over all active accounts, calling transform + import once per account

## Multi-Account Support

The legacy API supports multiple accounts per user (owned accounts + shared accounts via Access records). The migration handles this correctly:

- `LegacyApiClient.fetchUserData()` fetches data for **all** accounts in one call
- `MigrationService.migrate()` splits the data by account and calls `transform()` + `importData()` **once per active account**
- Deleted accounts are silently skipped
- If one account fails to transform or import, the error is recorded and migration continues with the remaining accounts
- Final `MigrationResult.imported` counts are accumulated across all accounts

## LegacyDataTransformer

The `LegacyDataTransformer` class transforms one account's legacy data into Budget Wise domain types. It is single-account per call by design — `MigrationService` is responsible for iteration.

### Usage

```typescript
// Direct usage (single account) — normally called by MigrationService
import { LegacyDataTransformer } from '@budget/core/migration';
import type { LegacyUserData } from '@budget/core/migration';

const transformer = new LegacyDataTransformer();
const result = transformer.transform(legacyData); // legacyData.accounts must contain exactly one account

if (result.errors.length > 0) {
  console.warn('Transformation warnings:', result.errors);
}

const exportData = result.data;
```

### Features

- **Deterministic UUIDs**: Uses UUIDv5 seeded from `entityType:accountId:legacyId` — same input always produces the same UUID, making migration safely re-runnable without duplicating data
- **Multi-account safe**: Entities are filtered by account ID before transformation, preventing cross-account data bleed
- **Date Conversion**: Transforms ISO datetime strings to YYYY-MM-DD format
- **Category Matching**: Matches legacy German category names to Budget Wise defaults via `legacy-category-mapping`, preventing duplicate categories after migration
- **Icon Mapping**: Maps legacy Android drawable names to Budget Wise icon keys via `legacy-category-mapping`
- **Type Conversion**: Maps `BT_EXPENSE`/`BT_INCOME` to `expense`/`income` via shared legacy category helpers
- **Frequency Conversion**: Converts legacy repeating intervals (months) to Budget Wise frequency format
- **Transfer Detection**: Skips transfer transactions (not supported in Budget Wise); handles optional fields correctly with `!= null`
- **Savings Goal Account Resolution**: Resolves savings goal account via category when `account` field is absent (API quirk)
- **Validation**: Collects non-fatal errors without aborting; includes default category IDs in referential integrity checks
- **Deleted/Inactive Filtering**: Skips deleted and inactive entities

### Transformation Details

#### Entities Transformed

1. **Account** - Legacy Account → Budget Wise Account
2. **Categories** - Legacy Category → Budget Wise Category (matched to defaults or created as custom)
3. **Transactions** - Legacy Balance → Budget Wise Transaction
4. **Limits** - Extracted from `Category.limits` → Budget Wise Limit
5. **Templates** - Not available via legacy API (empty array)
6. **Recurring Items** - Legacy Recuring → Budget Wise RecurringItem
7. **Savings Goals** - Legacy SavingGoal → Budget Wise SavingsGoal

#### Key Mappings

- **Balance Type**: `BT_EXPENSE` → `expense`, `BT_INCOME` → `income`
- **Dates**: `2022-09-09T13:49:51.141000Z` → `2022-09-09` (display); ISO kept for `createdAt` (audit)
- **Frequency**: `repeating: 1` → `monthly`, `repeating: 3` → `every_3_months`
- **Category Names**: German API names normalized via `legacy-category-mapping` before matching defaults (e.g. `Essen` → `category_food`)
- **Icons**: Legacy Android drawables → `CategoryKey` values (see `docs/migration/icon-mapping.md`)
- **IDs**: Deterministic UUIDv5 from `entityType:accountId:legacyId`

#### Category Matching Strategy

Legacy categories are matched to Budget Wise defaults in this order:

1. Normalize the legacy German name via `legacy-category-mapping` (e.g. `Essen` → `category_food`)
2. Find a `DEFAULT_CATEGORIES` entry with matching `name` + `type`
3. If matched: reuse the default category ID — no new category created, no duplicate
4. If unmatched: generate a new deterministic UUID and create a custom category

### Testing

94 tests covering:
- Individual entity transformers
- German name normalization via `legacy-category-mapping`
- Default category matching (matched → reused ID, unmatched → new UUID)
- Deterministic UUID generation (same input → same output across runs)
- Transfer detection with optional/undefined fields
- Savings goal account resolution via category
- Referential integrity validation (including default category IDs)
- Multi-account data isolation
- All deleted/inactive/orphaned entity edge cases

Run tests:
```bash
pnpm test migration
```

### Integration with MigrationService

The transformer implements `ILegacyDataTransformer`:

```typescript
interface ILegacyDataTransformer {
  transform(data: LegacyUserData): TransformResult;
}
```

`MigrationService` calls it once per active account, passing a per-account slice of `LegacyUserData`.

## Documentation

- `docs/legacy-api-schema-mapping.md` — Complete field-level mapping and API endpoint reference
- `docs/migration/icon-mapping.md` — Legacy drawable → CategoryKey mapping table
