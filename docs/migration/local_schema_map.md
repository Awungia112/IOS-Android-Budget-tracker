# Schema Map — Migration Reference
---

## How to read this document

Each table has three columns:

| Column | Meaning |
|--------|---------|
| **Native column** | The exact column name in the on-device SQLite file |
| **Dexie field** | The field name in the `BudgetWiseDB` Dexie schema |
| **TS type** | TypeScript type used in the app  |

`@ColumnInfo` overrides on Android Room entities are the most common source of column-name bugs — these are the rows flagged ⚠️. Fill in the native column by checking the annotation, not the Kotlin property name.

For iOS Core Data, every table is prefixed `Z` and every column is prefixed `Z` (uppercased). `Z_PK` is used as the legacy primary key for deterministic UUID generation and relationship lookup. Hidden system columns `Z_ENT` and `Z_OPT` are not migrated as data fields.

---

## Entity → Dexie table map

| Android entity | iOS Core Data entity | Dexie table | Notes |
|---------------|---------------------|-------------|-------|
| `Balance` | `Accounting` | `transactions` | Core financial record |
| `Category` | `Category` | `categories` | |
| `Account` | *(single-account graft)* | `accounts` | Core Data has no account table; create one imported local account |
| `Recurring` | `RecurringAccounting` | `recurringItems` | |
| `SavingGoal` | `SparTarget` | `savingsGoals` | |
| `Template` | `Shortcut` | `templates` | |
| `Journal` | `Journal` | *(confirm — no direct Dexie table; may map to `transactions` or be a new table)* | ⚠️ Needs decision |
| `User` | `User` | *(confirm — no `users` table in Dexie; may collapse into `accounts`)* | ⚠️ Needs decision |

---

## Part 1 — Android Room entities

> Source files: `Balance.kt`, `Category.kt`, `Journal.kt`, `Recurring.kt`, `SavingGoal.kt`, `Template.kt`, `Account.kt`, `User.kt`
> For each entity: read `@Entity(tableName = "...")` for the table name, and check every `@ColumnInfo(name = "...")` for column overrides.

---

### 1.1 Balance → `transactions`

SQLite table name: `balances`

| Native SQLite column | Dexie field              | TS type          | Room Type     | Notes                                                                                                                          |
|--------------------|--------------------------|------------------|---------------|--------------------------------------------------------------------------------------------------------------------------------|
| `id`               | `id`                     | `string`         | `Long`        | PK                                                                                                                             |
| `user_id`          | `accountId`              | `string`         | `Long`        | We can get the account_id with the user_id but we have to be aware they are not the same                                       |
| `amount`           | `amount`                 | `number`         | `Double`      | Check unit: pence/cents vs decimal                                                                                             |
| `date`             | `date`                   | `string`         | `LocalDate`   | Unix ms timestamp                                                                                                              |
| `category_id`      | `category`               | `string`         | `Long`        | Stores category `id`                                                                                                           |
| `name`             | `title`                  | `string`         | `String`      |                                                                                                                                |
| `type`             | `type`                   | `TransactionType` | `BalanceType` | Need transformation                                                                                                            |
| `created_at`       | `createdAt`              | `string`         | `DateTime`    | Need transformation                                                                                                            |
| `saving_goal_id`    | `savingsGoalId`        | `string`         | `Long`        |                                                                                                                                |
| —                   | `isCompletionTransaction` |                  |               |                                                                                                                                |
| `deleted`           | —                        | —                |               | Filter: skip rows where deleted = 1                                                                                            |
| `recurring_id`      | —                        | —                |               | ⚠️ No Dexie field — decision needed                                                                                            |
| `is_transfer_balance` | —                        | —                |               | ⚠️ No Dexie field — maybe equivalent to `isCompletionTransaction` but we can't be sure in the worst case we should not pick it |
| `updated_at`        | —                        | —                |               | Drop unless type is extended                                                                                                   |


---

### 1.2 Category → `categories`

SQLite table name: `categories`

| Native SQLite column | Dexie field | TS type       | Room Type     | Notes                                                                                                                                                                               |
|----------------------|-------------|---------------|---------------|-------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| `id`                 | `id` | `string`      | `Long`        |                                                                                                                                                                                     |
| `name`               | `name` | `string`      |               | In Dexie v2+ this is a translation key e.g. `category_food`                                                                                                                         |
| `type`               | `type`      | `TransactionType` | `BalanceType` | Need transformation                                                                                                                                                                 |
| `icon_name`          | `icon` | `string \| undefined` | `String`      | For the migration we will maybe try to match those fields by keyword eg if in Room we have icon name that is containing food we will match it to our Dexie icon key `category_food` |
| `default_flag`       | `isDefault` | `boolean`     | `DefaultType` | The corresponding Dexie type is `DefaultType? = null`                                                                                                                               |
| `limit`              |             |       | `Double`      | limit and limit_date: These should be ignored for the categories table and instead used to populate the Limits Dexie table                                                          |
| `limit_date`         |             |               | `LocalDate`   | limit and limit_date: These should be ignored for the categories table and instead used to populate the Limits Dexie table                                                          |
| `deleted`            |             | `boolean`     |               | CRITICAL: If 1, do not migrate row.                                                                                                                                                 |
| `created_at`         |             | `date`        |               | Dropped (Not in Dexie Category type).                                                                                                                                               |
|                      | `accountId` | `string`      |               |                                                                                                                                     |


> ⚠️ For this category entity we should delete the accountId field because of that with one phone with multiple accounts we will have duplicate categories. What we can do is create a list of categories in the account entity it will actually match all native models and will help us avoid duplicates.

---

### 1.3 Account → `accounts`

> ⚠️ Context on Multi-User & Online Functionality
The legacy Android architecture utilizes a complex relationship between User, Account, and Access entities to support multi-user synchronization and shared account permissions.
While the current iteration of this web-migration focuses on a Local-First, Single-User experience, we are adopting a "Convergence Strategy" during mapping:
Data Enrichment: We are collapsing core identity metadata (from User and Access) directly into the Dexie Account record.
Placeholder Schema: Certain fields (like role and ownerEmail) are being migrated now to prevent data loss and to provide a "landing zone" for future multi-user features.
Evolutionary Design: These mappings are subject to revision. By preserving these links via UUID v5 now, we ensure that a future transition to a full Online/Shared state will not require a second, destructive data migration.

SQLite table name: *accounts/users/access*

| Native SQLite column            | Dexie field             | TS type   | Room Type    | Notes                                            |
|---------------------------------|-------------------------|-----------|--------------|--------------------------------------------------|
| `accounts.id`                   | `id`                    | `string`  | `Long`       |                                                  |
| `accounts.name`                 | `name`                  | `string`  | `String`     |                                                  |
| `accounts.account_abbreviation` | `initials`              | `string`  | `String`     |                                                  |
| `access.email`                  | `email`(to add)         | `string`  | `String`     |                                                  |
| `accounts.is_online`            | `isOnline` (to add)     | `boolean` | `Boolean`    |                                                  |
| `accounts.last_synced_at`       | `lastSyncedAt` (to add) | `string`  | `DateTime`   |                                                  |
| `accounts.created_at`           | `createdAt` (to add)    | `string`  | `DateTime`   |                                                  |
| `access.role`                   | `role` (to add)         | `string`  | `AccessRole` | MEMBER/OWNER Need transformation during the migration |
| `access.firstName`              | `firstName` (to add)    | `string`  | `String`     |                                                  |
| `access.lastname`               | `lastName` (to add)     | `string`  | `String`     |                                                  |
| `user.user_name`                | `userName` (to add)     | `string`  | `String`     |                                                  |
| `accounts.remote_id`            | `remoteId`              | `string`  | `Long`       |                                                  |
| `deleted`                       |                         | `boolean` |              | CRITICAL: If 1, do not migrate row.                                 |

> ⚠️ We have many fields to add at the level of our indexeddb entity it is true we are not covering yet some functionnalities linked to those fields but it is good if we can avoid to lose those data during the migration the can be useful later.

---

### 1.4 RecurringItems → `recurring`

SQLite table name: `recurring`

| Native SQLite column | Dexie field | TS type           | Room Type     | Notes |
|----------------------|------|-------------------|---------------|------|
| `id`                 | `id` | `string`          | `Long`        |                |
| `repeating`          | `frequency` | `Frequency`       | `Int`         | Map integer constant to string (e.g., 1 -> 'monthly'). |
| `amount`             | `amount` | `number`          | `Double`      |                |
| `category_id`        | `categoryId` | `string`          | `Long`        | Category id    |
| `start_date`         | `startDate` | `number`          | `LocalDate`   |  |
| `name`               | `name` | `string`          |               |                |
| `type`               | `type` | `TransactionType` | `BalanceType` |  |
| `deleted`            |             | `boolean`             |               | CRITICAL: If 1, do not migrate row. |
|                      | `accountId` | `string`              |               | Inject current activeAccountId during migration. |

---

### 1.5 SavingGoal → `savings`

SQLite table name: `saving_goals`

| Native SQLite column | Dexie field       | TS type   | Room Type   | Notes |
|---------------------|-------------------|-----------|-------------|------|
| `id`                | `id`              | `string`  | `Long`      | |
|                     | `accountId`       | `string`  |             | Inject current activeAccountId during migration.      |
| `name`              | `name`            | `string`  | `String`    | Goal label |
| `amount`            | `targetAmount`    | `number`  | `Double`    | |
| `monthly_amount`    | `monthlyAmount`   | `number`  |             | |
| `due_date`          | `deadline`        | `string`  | `LocalDate` | Convert LocalDate |
| `category_id`       | `categoryId`      | `string`  | `String`    | |
| `is_open`           | `isOpen` (to add) | `boolean` | `Boolean`   |       |
| `creation_date`     | `creationDate`    | `string`  | `LocalDate` |       |
| `deleted`           |                   | `boolean` |             | CRITICAL: If 1, do not migrate row.      |

---

### 1.6 Template → `template`

SQLite table name: `templates`

| Native SQLite column | Dexie field  | TS type | Room Type    | Notes |
|----------------------|--------------|---------|--------------|------|
| `id`                 | `id`         | `string` | `Long`       | |
|                      | `accountId` | `string`              |              | Inject current activeAccountId during migration.      |
| `name`               | `name`       | `string` | `String`     | Display label |
| `amount`             | `amount`     | `number` | `Double`     | |
| `category_id`        | `categoryId` | `string` | `Long`       | Category id |
| `type`               | `type` | `TransactionType` | `BalanceType` | |
| `deleted`            |                 | `boolean` |              | CRITICAL: If 1, do not migrate row.      |

---

### 1.7 Limit → `limit`

SQLite table name: `Not existing we will copy data from category entity`

| Native SQLite column | Dexie field     | TS type | Room Type   | Notes |
|------------------|-----------------|---------|-------------|------|
|                  | `id` (generate) | `string` |        | |
|                  | `accountId`     | `string` |             | Inject current activeAccountId during migration.      |
| `category.limit` | `amount`        | `number` | `Double`    | |
| `category.id`    | `categoryId`    | `string` | `Long`      | Category id |

---

### 1.8 Journal → *(Dexie table TBD)*

> ⚠Journal Entity: NOT MIGRATED. > Reasoning: The legacy audit/action log is incompatible with the new Command-pattern synchronization. All necessary "state" is captured via the primary entities. New activity will be tracked in the Dexie ChangeLog table starting from the migration timestamp.
---

### 1.9 User → *(Dexie table TBD)*

> ⚠️ There is no `users` table in the current Dexie schema. We move most of the fields related to it in account entity

---

### Part 2 — Android legacy SQLite (DatabaseHelper.java)

This mapping accounts for the legacy "single-account" structure where all transactions, categories, and goals exist in a global scope, requiring the "Grafting" strategy (injecting a default accountId) during migration.

#### 2.1 income / expenses → transactions
**SQLite table names:** `income`, `expenses` (where `repeating = 0`)

| Native SQLite column | SQL type | Dexie field | TS type | Notes |
| :--- | :--- | :--- | :--- | :--- |
| `_id` | INTEGER | `id` | string | Legacy ID to string conversion. |
| — | — | `accountId` | string | **Grafting**: Inject default "Main Account" ID. |
| `amount` | REAL | `amount` | number | |
| `date` | TEXT | `date` | number | Parse string to Unix ms timestamp. |
| `name` | TEXT | `title` | string | |
| `category` | INTEGER | `category` | string | Foreign key to `categories.id`. |
| — | — | `type` | string | 'income' or 'expense' based on source table. |
| — | — | `isCompletionTransaction` | boolean | Set to `false` for these tables. |

#### 2.2 income_categories / expense_categories → categories
**SQLite table names:** `income_categories`, `expense_categories`

| Native SQLite column | SQL type | Dexie field | TS type | Notes |
| :--- | :--- | :--- | :--- | :--- |
| `_id` | INTEGER | `id` | string | |
| `name` | TEXT | `name` | string | Translation key (e.g., `Allgemein` -> `category_general`). |
| `icon` | TEXT | `icon` | string | Legacy icon resource string mapping. |
| `deletable` | INTEGER | `isDefault` | boolean | If `deletable === 0`, set `isDefault = true`. |

#### 2.3 (N/A) → accounts
**SQLite table name:** None (Single-user legacy)

| Native SQLite column | SQL type | Dexie field         | TS type | Notes                                |
|:---------------------|:---------|:--------------------|:--------|:-------------------------------------|
| —                    | —        | `id`                | string  | Generate UUID v5 for "Main Account". |
| —                    | —        | `name`              | string  | Set to "Main Account (Imported)".    |
| —                    | —        | `isOnline` (to add) | boolean | `false`.                             |
| —                    | —        | `initials`          | string  | Set defaults ones                    |

#### 2.4 income / expenses (Recurring) → recurringItems
**SQLite table names:** `income`, `expenses` (where `repeating != 0`)

| Native SQLite column | SQL type | Dexie field | TS type | Notes |
| :--- | :--- | :--- | :--- | :--- |
| `_id` | INTEGER | `id` | string | |
| `repeating` | INTEGER | `frequency` | Frequency | Map: 1->'monthly', 3->'quarterly', 6->'bi-annually', 12->'yearly'. |
| `amount` | REAL | `amount` | number | |
| `category` | INTEGER | `categoryId` | string | |
| `next_repeating_date` | TEXT | `startDate` | number | Parse to Unix ms. |
| `name` | TEXT | `name` | string | |
| — | — | `type` | string | 'income' or 'expense' based on source table. |
| — | — | `accountId` | string | **Grafting**: Inject default "Main Account" ID. |

#### 2.5 savinggoals → savings
**SQLite table name:** `savinggoals`

| Native SQLite column | SQL type | Dexie field | TS type | Notes |
|:---------------------| :--- | :--- | :--- | :--- |
| `_id`                | INTEGER | `id` | string | |
| `name`               | TEXT | `name` | string | |
| `amount`             | INTEGER | `targetAmount` | number | |
| `monthly_amount`     | INTEGER | `monthlyAmount` | number | |
| `date`               | TEXT | `deadline` | number | Parse target date string to Unix ms. |
| `category`           | INTEGER | `categoryId` | string | |
| —                    | — | `accountId` | string | **Grafting**: Inject default "Main Account" ID. |

#### 2.6 income_templates / expense_templates → templates
**SQLite table names:** `income_templates`, `expense_templates`

| Native SQLite column | SQL type | Dexie field | TS type | Notes |
| :--- | :--- | :--- | :--- | :--- |
| `_id` | INTEGER | `id` | string | |
| `name` | TEXT | `name` | string | |
| `amount` | REAL | `amount` | number | |
| `category` | INTEGER | `categoryId` | string | |

#### 2.7 income_categories / expense_categories (Limits) → limits
**SQLite table names:** `income_categories`, `expense_categories`

| Native SQLite column | SQL type | Dexie field | TS type | Notes |
| :--- | :--- | :--- | :--- | :--- |
| (Generated) | string | `id` | string | Generate unique ID. |
| `_id` | INTEGER | `categoryId` | string | Link to the category. |
| `limits` | REAL | `amount` | number | |
| `limitsDate` | TEXT | `date` | number | Parse to Unix ms. |

#### 2.8 ticketing → transactions (Savings Links)
**SQLite table name:** `ticketing`
**Relational Logic (Savings Progress):**
In the legacy schema, a saving goal's progress is not a stored value but a runtime aggregation. The `ticketing` table acts as a bridge: `savinggoals._id` <— `ticketing.savingGoal` | `ticketing.balanceID` —> `expenses._id`.
To calculate the total saved for a goal, sum the `amount` of all `ticketing` records where `savingGoal` matches the goal's ID.

| Native SQLite column | SQL type | Dexie field               | TS type | Notes |
| :--- | :--- |:--------------------------| :--- | :--- |
| `balanceID` | INTEGER | `id`                      | string | Matches `expenses._id` if already migrated. |
| `savingGoal` | INTEGER | `savingsGoalId`           | string | Foreign key to `savingsGoals.id`. |
| — | — | `isCompletionTransaction` | boolean | Set to `true` for ticketing records. |
## Part 3 — iOS Core Data

> Source file: `*.xcdatamodeld` — open the `contents` file inside the active `.xcdatamodel` subfolder in any text editor.
> Legacy store location: `Documents/D_in_Plus.sqlite`, with optional `D_in_Plus.sqlite-wal` and `D_in_Plus.sqlite-shm` sidecars.
> **Naming rule:** Entity `Foo` → table `ZFOO`. Attribute `barBaz` → column `ZBARBAZ`.
> **Hidden system columns on every table (not migrated as data fields):** `Z_ENT`, `Z_OPT`.
> **Hidden Core Data metadata tables never queried as entities:** `Z_METADATA`, `Z_PRIMARYKEY`, `Z_MODELCACHE`.
> **Primary key:** `Z_PK` is used only as the legacy ID for deterministic UUID generation and relationship lookup.
> **Dates:** Core Data `Date` values are seconds since `2001-01-01T00:00:00Z`; use `fromCoreDataTimestamp()`.
> During the analysis of the legacy Core Data schema, we identified that the original application follows a single-account pattern. Unlike the modern Dexie implementation, which supports multiple accounts, the Core Data schema treats all transactions as one global ledger.
> The migration therefore uses a grafted account: create one imported local account and assign every Core Data transaction, recurring entry, saving goal, and template to that account. Core Data records keep `legacySource: 'core_data'` for traceability.

---

### 3.1 ZACCOUNTING → `transactions`

Core Data entity: `Accounting`

| Core Data attribute | Z_ SQLite column           | Dexie field     | TS type  | CoreData Type | Notes |
|---------------------|----------------------------|-----------------|----------|---------------|------|
|                     |  | `id` (generate) | `string` |               |                             |
|       |                   | `accountId`     | `string` |               |                             |
| `amount`            | `ZAMOUNT`                  | `amount`        | `number` | `Integer 64`  |                             |
| `date`              | `ZDATE`                    | `date`          | `string` | `Date`        | Core Data 2001 epoch; use `fromCoreDataTimestamp()` |
| `title`             | `ZTITLE`                   | `title`         | `string` | `String`      |                             |
| `category` (Rel)    | `ZCATEGORY`                | `categoryId`    | `string` |               | FK to `ZCATEGORY.Z_PK`       |
| `sparTarget` (Rel)  | `ZSPARTARGET`              | `savingsGoalId` | `string` |               |                             |

---

### 3.2 ZCATEGORY → `category`

Core Data entity: `Category`

| Core Data attribute | Z_ SQLite column    | Dexie field     | TS type               | CoreData Type | Notes                 |
|---------------------|---------------------|-----------------|-----------------------|---------------|-----------------------|
|         |                     | `id` (generate) | `string`              |               |                       |
|         |                     | `accountId`     | `string`              |               | We should delete it   |
| `title`             | `ZTITLE`            | `name`          | `string`              | `String`      |                       |
| `isIncomeCategory`  | `ZISINCOMECATEGORY` | `type`          | `TransactionType`     | `Boolean`     |                       |
| `imageNumber`       | `ZIMAGENUMBER`      | `icon`          | `string \| undefined` | `Integer 16`  | Need mapping          |
| `isStandard`        | `ZISSTANDARD`       | `isDefault`     | `boolean`             |               | Stored as INTEGER 0/1 |

---

### 3.3 ZBUDGET → not migrated

Core Data entity: `Budget`

The legacy Core Data app used `Budget` as a monthly grouping key. It is not a
modern account source and is not migrated as a Dexie entity.

---


### 3.4 ZRECURRINGACCOUNTING → `recurring`

Core Data entity: `RecurringAccounting`

| Core Data attribute  | Z_ SQLite column      | Dexie field              | TS type               | CoreData Type | Notes                                                                           |
|----------------------|-----------------------|--------------------------|-----------------------|---------------|---------------------------------------------------------------------------------|
|                      |                       | `id` (generate)          | `string`              |               |                                                                                 |
|                      |                       | `accountId`              | `string`              |               |                                                                                 |
| `recurrenceInterval` | `ZRECURRENCEINTERVAL` | `frequency`              | `Frequency`           | `Integer 16`  | Optional in older model versions; default to monthly if absent                  |
| `amount`             | `ZAMOUNT`             | `amount`                 | `number`              | `Integer 64`  |                                                                                 |
| `category` (Rel)     | `ZCATEGORY`           | `categoryId`             | `string`              |               |                                                                                 |
| `lastSaved`          | `ZLASTSAVED`          | `startDate`              | `string`              | `Date`        | Core Data 2001 epoch; fallback to day-of-month reconstruction if absent         |
| `title`              | `ZTITLE`              | `name`                   | `string`              | `String`      |                                                                                 |
| `dayOfMonth`         | `ZDAYOFMONTH`         | `dayOfMonth`             | `number`              | `Integer 16`  | Preserved when available                                                        |

> If `ZLASTSAVED` is absent, reconstruct a best-effort `startDate` from
> `ZDAYOFMONTH`.

---

### 3.5 ZSPARTARGET → `savings`

Core Data entity: `SparTarget`

| Core Data attribute | Z_ SQLite column      | Dexie field     | TS type  | CoreData Type | Notes                              |
|---------------------|-----------------------|-----------------|----------|---------------|------------------------------------|
|                     |                       | `id` (generate) | `string` |               |                                    |
|                     |                       | `accountId`     | `string` |               |                                    |
| `title`             | `ZTITLE`              | `name`          | `string` | `String`      |                                    |
| `amount`            | `ZAMOUNT`             | `targetAmount`  | `number` | `Integer 64`  |                                    |
| `monthAmount`       | `ZMONTHAMOUNT`        | `monthlyAmount` | `number` | `Integer 64`  |                                    |
| `date`              | `ZDATE`               | `deadline`      | `string` | `Date`        | Core Data 2001 epoch; use `fromCoreDataTimestamp()` |
| `startDate`         | `ZSTARTDATE`          | `creationDate`  | `string` | `Date`        | Core Data 2001 epoch; use `fromCoreDataTimestamp()` |
| `category` (Rel)    | `ZCATEGORY`           | `categoryId`    | `string` |               |                                    |
|                     |                       | `icon`          | `string`  |               | Can be retrieve using the relation |

---

### 3.6 ZSHORTCUT → `template`

Core Data entity: `Shortcut`

| Core Data attribute | Z_ SQLite column | Dexie field     | TS type           | CoreData Type | Notes                                         |
|--------------------|-----------------|-----------------|-------------------|---------------|-----------------------------------------------|
|  | | `id` (generate) | `string`          |               |                                               |
|  | | `accountId`     | `string`          |               |                                               |
| `title`            | `ZTITLE`                      | `name`          | `string`          | `String`      |                                               |
| `amount`           | `ZAMOUNT`                     | `amount`        | `number`          | `Integer 64`  |                                               |
| `category` (Rel)     | `ZCATEGORY`           | `categoryId`    | `string`          |               |                                               |
|  | | `type`          | `TransactionType` |               | We can retrieve it with the category relation |

---

### 3.7 ZJOURNAL

> ⚠ No journal table

---

### 3.8 ZUSER

> ⚠️ No `users` table in  CoreData

---
### 3.9 ZLIMIT → limit

> ⚠️ No `limit` table in Core Data. Legacy Core Data limits are stored outside
> the SQLite `Z_` tables in `UserDefaults` under `limits`; the iOS migration
> setup helper exports that native payload and the TypeScript reader maps it
> back to migrated expense categories by `categoryTitle`.

---

### 3.10 Raw v1 German Core Data tables

> Source files:
> `D_in_Plus.xcdatamodeld/D_in_Plus.xcdatamodel/contents` and
> `LegacyDatabase/MigrationV1-V2/*.m`.
>
> These tables are only used when the SQLite file still contains the original
> German v1 schema and the migrated `ZCATEGORY` / `ZACCOUNTING` tables are
> absent. The reader keeps this as a separate schema path.

#### ZKATEGORIEN / ZAUSGABEKATEGORIEN → `categories`

| v1 entity | Z_ SQLite column | Dexie field | Notes |
|-----------|------------------|-------------|-------|
| `Kategorien` / `AusgabeKategorien` | `Z_PK` | `legacyId` | Source primary key |
| `title` | `ZTITLE` | `name` | Income from `ZKATEGORIEN`, expense from `ZAUSGABEKATEGORIEN` |
| `bildnummer` | `ZBILDNUMMER` | `icon` | Legacy image-number mapping |
| `standard` | `ZSTANDARD` | `isDefault` | Stored as INTEGER 0/1 |
| `aktiv` | `ZAKTIV` | `isDeleted` | Inactive categories are preserved as deleted |

#### ZBETRAEGE + ZEINNAHME / ZAUSGABE → `transactions`

| v1 entity | Z_ SQLite column | Dexie field | Notes |
|-----------|------------------|-------------|-------|
| `Betraege` | `Z_PK` | `legacyId` | Source primary key |
| `Betraege.wert` | `ZWERT` | `amount` | Already stored as centimes |
| `Betraege.notiz` | `ZNOTIZ` | `title` | Transaction title |
| `Betraege.titel` | `ZTITEL` | `categoryId` lookup | Category title; match title first |
| `Betraege.bildnummer` | `ZBILDNUMMER` | `categoryId` lookup | Fallback category lookup by image number |
| `Betraege.einnahme` relationship | `ZEINNAHME` | `type` / date lookup | Non-null means income; FK to `ZEINNAHME.Z_PK` |
| `Betraege.ausgabe` relationship | `ZAUSGABE` | `type` / date lookup | Non-null means expense; FK to `ZAUSGABE.Z_PK` |
| `Einnahme.datum` / `Ausgabe.datum` | `ZDATUM` | `date` | German `dd.MM.yyyy` day string |
| `Betraege.datum` | `ZDATUM` | `date` fallback | Core Data timestamp fallback if parent day string is unusable |

#### ZWIEDERKEHREND → `recurring`

| v1 entity attribute | Z_ SQLite column | Dexie field | Notes |
|---------------------|------------------|-------------|-------|
| `wert` | `ZWERT` | `amount` | Already stored as centimes |
| `notiz` | `ZNOTIZ` | `name` | Recurring entry name |
| `titel` | `ZTITEL` | `categoryId` lookup | Category title; match title first |
| `bildnummer` | `ZBILDNUMMER` | `categoryId` lookup | Fallback category lookup by image number |
| `istEinnahme` | `ZISTEINNAHME` | `type` | Boolean income flag |
| `wiederkehrendertag` | `ZWIEDERKEHRENDERTAG` | `dayOfMonth` | Invalid values normalize to 1 |
| `zuletztgespeichert` | `ZZULETZTGESPEICHERT` | `startDate` | Core Data timestamp |

#### ZVORLAGEN → `templates`

| v1 entity attribute | Z_ SQLite column | Dexie field | Notes |
|---------------------|------------------|-------------|-------|
| `wert` | `ZWERT` | `amount` | Already stored as centimes |
| `notiz` | `ZNOTIZ` | `name` | Template name |
| `titel` | `ZTITEL` | `categoryId` lookup | Category title; match title first |
| `bildnummer` | `ZBILDNUMMER` | `categoryId` lookup | Fallback category lookup by image number |
| `isteinnahme` | `ZISTEINNAHME` | `type` | Boolean income flag |

> `ZBUDGET` remains ignored. It is an aggregate/grouping table, not an account
> or transaction source.

---

## Part 4 — iOS Realm property map

> Source files: `RealmBalance.swift`, `RealmAccount.swift`
> Read `@Persisted` / `@objc dynamic` property declarations on each class.

### 4.1 RealmBalance → `transaction`

| Realm property    | Dexie field         | TS type           | Room Type          | Notes                                                                                                 |
|-------------------|---------------------|-------------------|--------------------|-------------------------------------------------------------------------------------------------------|
| `id`              | `id`                | `string`          | `UUID().hashValue` | Realm PK — usually `@Persisted(primaryKey: true)`                                                     |
|                   | `legacyId`          | `string`          | `UUID().hashValue` | To store the exact legacyid with no transformation in case we have some problems and we need to debug |
| `amount `         | `amount`            | `number`          | `Int`              |                                                                                                       |
| `date`            | `date`              | `string`          | `Date`             |                                                                                                       |
| `title`           | `title`             | `string`          | `String`           |                                                                                                       |
| `realmCategory`   | `category`          | `string`          | `UUID().hashValue` | Extract the id from the Room Table category                                                           |
| `realmAccounts`   | `accountId`         | `string`          | `UUID().hashValue` | Extract the id from RealmAccount table                                                                |
| `realmSavingGoals` | `savingsGoalId`     | `string`          | `UUID().hashValue` | Extract the id from RealmSavingGoals table                                                            |
| `(Derived)`       | `type`              | `TransactionType` | `String`           | retrieve this value from realmCategory table                                                          |
| `onlineId`        | `onlineId` (to add) | `string`           | `Int`              |                                                                                                       |


---

### 4.2 RealmAccount → `account`

| Realm property | Dexie field         | TS type  | Room Type          | Notes |
|----------------|---------------------|----------|--------------------|-------|
| `id`           | `id`                | `string` | `UUID().hashValue` |          |
|                | `legacyId` (to add) | `string` | `UUID().hashValue` | To store the exact legacyid with no transformation in case we have some problems and we need to debug |
| `name`         | `name`              | `string` | `String`           |          |
| `initials`     | `initials`          | `string` | `String`           |          |
| `role`         | `role` (to add)     | `string` | `String`           |          |
| `onlineId`        | `onlineId` (to add) | `string`           | `Int`              |                                                                                                       |


---

### 4.3 RealmCategory → `category` (schema are totally differents maybe we will have to readapt our dexie Account it lacks some informations here they have a table categories and each categories is having they list of the accounts that are using them but in our case the table categories is having duplicates we can have the same categories third time if we have three accounts were it is used )

| Realm property    | Dexie field         | TS type           | Room Type          | Notes                                                                                                 |
|-------------------|---------------------|-------------------|--------------------|-------------------------------------------------------------------------------------------------------|
| `id`              | `id`                | `string`          | `UUID().hashValue` |                                                                                                       |
|                   | `legacyId` (to add) | `string`          | `UUID().hashValue` | To store the exact legacyid with no transformation in case we have some problems and we need to debug |
| `name`            | `name`              | `string`          | `String`           |                                                                                                       |
| `type`            | `balanceType`       | `TransactionType` | `BalanceType`      |                                                                                                       |
| `icon`            | `icon`              | `string`          | `Int`              |                                                                                                       |
| `categoryDefault` | `isDefault`         | `boolean`         | `CategoryDefault`  |                                                                                                       |
| `realmAccounts`   | `(Derived)`         | `Derived`         |                    | While iterating through RealmAccount objects, check its realmCategories. For each category that has a limit != nil, create a record in the Dexie limits table using that account.id.                                                                            |
| `onlineId`        | `onlineId` (to add) | `string`           | `Int`              |                                                                                                       |


---

### 4.4 RealmSavingGoal → `savings`

| Realm property  | Dexie field         | TS type  | Room Type          | Notes                                                                                                 |
|-----------------|---------------------|----------|--------------------|-------------------------------------------------------------------------------------------------------|
| `id`            | `id`                | `string` | `UUID().hashValue` |                                                                                                       |
|                 | `legacyId` (to add) | `string` | `UUID().hashValue` | To store the exact legacyid with no transformation in case we have some problems and we need to debug |
| `title`         | `name`              | `string` | `String`           |                                                                                                       |
| `amount`        | `targetAmount`      | `number` | `Int`              |                                                                                                       |
| `dueDate`       | `deadline`          | `string` | `Date`             |                                                                                                       |
| `realmCategory` | `categoryId`        | `string` | `UUID().hashValue` | Extract the id from RealmCategory                                                                     |
| ``              | `icon`              | `string` |                    | We can try to retrieve it from the associated categories                                              |
| `monthlyAmount` | `monthlyAmount`     | `number` | `Int`              |                                                                                                       |
| `onlineId`        | `onlineId` (to add) | `string`           | `Int`              |                                                                                                       |

---

### 4.5 RealmReccuringBalance → `reccuring`

| Realm property | Dexie field         | TS type           | Room Type          | Notes                                                                                           |
|-------------|---------------------|-------------------|--------------------|-------------------------------------------------------------------------------------------------|
| `id`        | `id`                | `string`          | `UUID().hashValue` |                                                                                                 |
|             | `legacyId` (to add) | `string`          | `UUID().hashValue` | To store the exact legacyid with no transformation in case we have some problems and we need to debug |
| `title`     | `name`              | `string`          | `String`           |                                                                                                 |
| `amount`    | `amount`            | `number`          | `Int`              |                                                                                                 |
| `date`      | `startDate`         | `string`          | `Date`             |                                                                                                 |
| `realmCategory` | `categoryId`        | `string`          | `UUID().hashValue` | Extract the id from RealmCategory                                                               |
| `interval`  | `frequency`         | `Frequency`       | `Int`              |                                                                                                 |
| `monthlyAmount` | `monthlyAmount`     | `number`          | `Int`              |                                                                                                 |
| `realmAccounts` | `accountId`         |                   |                    | Query all RealmAccount objects, find the one where this item's id appears in its recurring list. Extract that account's UUID v5                                           |
| ``          | `type`              | `TransactionType` |                    | We can retrieve it from category                                                                |
| `onlineId`        | `onlineId` (to add) | `string`           | `Int`              |                                                                                                       |

---

### 4.6 RealmTemplate → `template`

| Realm property | Dexie field         | TS type        | Room Type          | Notes                                                                                           |
|-------------|---------------------|----------------|--------------------|-------------------------------------------------------------------------------------------------|
| `id`        | `id`                | `string`       | `UUID().hashValue` |                                                                                                 |
|             | `legacyId` (to add) | `string`       | `UUID().hashValue` | To store the exact legacyid with no transformation in case we have some problems and we need to debug |
| `title`     | `name`              | `string`       | `String`           |                                                                                                 |
| `amount`    | `amount`            | `number`       | `Int`              |                                                                                                 |
| `realmCategory` | `categoryId`        | `string`       | `UUID().hashValue` | Extract the id from RealmCategory                                                               |
| `realmAccounts` | `accountId`         |                |                    | Query all RealmAccount objects, find the one where this item's id appears in its template list. Extract that account's UUID v5                                           |
| ``          | `type`              | `TransactionType` |                    | We can retrieve it from category                                                                |
| `onlineId`        | `onlineId` (to add) | `string`           | `Int`              |                                                                                                       |

---

### 4.7 RealmCategory (Limit) → `limits` (They don't have a proper limit table but inside RealmCategory they have some optional fields related to limit )

| Realm property   | Dexie field         | TS type  | Room Type          | Notes                                                                                                 |
|------------------|---------------------|----------|--------------------|-------------------------------------------------------------------------------------------------------|
|  | `id`  (generated)   | `string` |  |                                                                                                       |
| `id`        | `categoryId`        | `string` | `UUID().hashValue` |                                                                                                 |
| `name`           | `name`              | `string` | `String`           |                                                                                                       |
| `limit`          | `amount`            | `number` | `Int`              |                                                                                                       |
| `realmAccounts`  | `accountId`         | `string` |                    | While iterating through RealmAccount objects, check its realmCategories. For each category that has a limit != nil, create a record in the Dexie limits table using that account.id.                                                                              |
| `onlineId`        | `onlineId` (to add) | `string` | `Int`              |                                                                                                       |


## Part 5 — Core Data multi-version note

> Open the `.xcdatamodeld` bundle. If multiple `.xcdatamodel` subfolders exist, check `.xccurrentversion` for the active one.

**Number of model versions found:** *4*

**Active version:** *( `Mein_Budget 4.xcdatamodel`)*

**Column changes between versions:**

| Version | Change Type | Affected Entity | Old Column / Entity | New Column / Entity | Technical Note |
|---------|-------------|-----------------|---------------------|---------------------|----------------|
| v1 → v2 | Entity Rename | — | `Betraege` | `Accounting` | Complete rename (German → English). |
| v1 → v2 | Entity Rename | — | `Wiederkehrend` | `RecurringAccounting` | Complete rename (German → English). |
| v1 → v2 | Entity Rename | — | `Vorlagen` | `Shortcut` | Renamed and restructured. |
| v1 → v2 | Entity Merge | — | `AusgabeKategorien` + `Kategorien` | `Category` | Two separate category entities merged into one with `isIncomeCategory` flag. |
| v1 → v2 | Entity Removed | — | `Ausgabe` | — | Expense container entity removed; replaced by `Budget`. |
| v1 → v2 | Entity Removed | — | `Einnahme` | — | Income container entity removed; replaced by `Budget`. |
| v1 → v2 | Property Rename | `Accounting` (ex-`Betraege`) | `wert` | `amount` | Type kept as Integer 64. |
| v1 → v2 | Property Rename | `Accounting` (ex-`Betraege`) | `titel` | `title` | |
| v1 → v2 | Property Removed | `Accounting` (ex-`Betraege`) | `bildnummer` | — | |
| v1 → v2 | Property Removed | `Accounting` (ex-`Betraege`) | `notiz` | — | |
| v1 → v2 | Property Added | `Accounting` | — | `date` | Date, indexed. Replaces `datum`. |
| v1 → v2 | Relationship Added | `Accounting` | — | `budget` | Link to `Budget` entity. |
| v1 → v2 | Relationship Added | `Accounting` | — | `category` | Link to `Category` entity. |
| v1 → v2 | Property Rename | `Budget` | `timestamp` (Date) | `monthSince1970` | Type changed from Date to Integer 64. |
| v1 → v2 | Property Removed | `Budget` | `datum` | — | String date field dropped. |
| v1 → v2 | Property Removed | `Budget` | `summe` | — | Computed totals removed from entity. |
| v1 → v2 | Property Removed | `Budget` | `summeAusgaben` | — | |
| v1 → v2 | Property Removed | `Budget` | `summeEinnahmen` | — | |
| v1 → v2 | Property Added | `Budget` | — | `dateString` | Human-readable date string. |
| v1 → v2 | Property Rename | `Category` (ex-`AusgabeKategorien`) | `aktiv` | `isActive` | Swift naming convention. |
| v1 → v2 | Property Rename | `Category` | `bildnummer` | `imageNumber` | German → English rename. |
| v1 → v2 | Property Rename | `Category` | `standard` | `isStandard` | Swift naming convention. |
| v1 → v2 | Property Added | `Category` | — | `isIncomeCategory` | Distinguishes income vs. expense categories (replaces separate entities). |
| v1 → v2 | Property Added | `Category` | — | `isVisible` | Visibility toggle. |
| v1 → v2 | Property Rename | `RecurringAccounting` (ex-`Wiederkehrend`) | `wert` | `amount` | Type kept as Integer 64. |
| v1 → v2 | Property Rename | `RecurringAccounting` | `titel` | `title` | |
| v1 → v2 | Property Rename | `RecurringAccounting` | `wiederkehrendertag` | `dayOfMonth` | German → English rename. |
| v1 → v2 | Property Rename | `RecurringAccounting` | `zeitpunktSpeicherung` | `lastSaved` | German → English rename. |
| v1 → v2 | Property Removed | `RecurringAccounting` | `istEinnahme` | — | Replaced by `category.isIncomeCategory`. |
| v1 → v2 | Property Removed | `RecurringAccounting` | `notiz` | — | |
| v1 → v2 | Property Removed | `RecurringAccounting` | `bildnummer` | — | |
| v1 → v2 | Property Rename | `Shortcut` (ex-`Vorlagen`) | `wert` | `amount` | Type kept as Integer 64. |
| v1 → v2 | Property Rename | `Shortcut` | `titel` | `title` | |
| v1 → v2 | Property Rename | `Shortcut` | `aktiv` | `isActive` | Swift naming convention. |
| v1 → v2 | Property Removed | `Shortcut` | `bildnummer` | — | |
| v1 → v2 | Property Removed | `Shortcut` | `datum` | — | |
| v1 → v2 | Property Removed | `Shortcut` | `isteinnahme` | — | Replaced by `category.isIncomeCategory`. |
| v1 → v2 | Property Removed | `Shortcut` | `notiz` | — | |
| v2 → v3 | Property Added | `RecurringAccounting` | — | `recurrenceInterval` | Integer 16, default 1. Enables Monthly/Weekly frequency logic. |
| v2 → v3 | Class Rename | `Category` | `representedClassName: Category` | `representedClassName: MBCategory` | Internal Swift class rename only; no schema change. |
| v3 → v4 | New Entity | — | — | `SparTarget` | Savings Goals feature. Fields: `amount`, `date`, `monthAmount`, `startDate`, `title`. |
| v3 → v4 | Relationship Added | `Accounting` | — | `sparTarget` | Optional link between a transaction and a `SparTarget`. |
| v3 → v4 | Relationship Added | `Category` | — | `sparTarget` | Optional link between a category and a `SparTarget`. |

---

## Type Mapping: Core Data / Room / Realm → TypeScript (Dexie)

| Source Type (Core Data / Room / Realm) | SQLite Storage Format | TypeScript Type (Dexie) | Migration Transformation Logic |
|----------------------------------------|-----------------------|-------------------------|--------------------------------|
| `Int` / `Integer 16/32` | `INTEGER` | `number` | Direct mapping. |
| `Long` / `Integer 64` | `INTEGER` | `number` | **CRITICAL:** Always use for currency (cents/pence) to avoid floating-point rounding bugs. Never convert to `float`. |
| `Double` / `Float` | `REAL` | `number` | Use **only** for non-financial ratios (e.g., % growth, exchange rate display). |
| `String` / `TEXT` | `TEXT` | `string` | Apply `.trim()` to sanitize legacy strings from older schema versions. |
| `Boolean` | `INTEGER` | `boolean` | SQLite stores `0`/`1` — explicitly cast: `value === 1`. |
| `Date` (Core Data) | `REAL` seconds since 2001-01-01 | `string` | Use `fromCoreDataTimestamp()` to add the `978307200` second offset and emit an ISO timestamp. |
| `ByteArray` / `BLOB` | `BLOB` | `Uint8Array` | Useful for stored profile pictures or receipt images. Encode to Base64 for IndexedDB if needed. |
| `UUID` | `TEXT` | `string` | Core Data `NSUUID` → lowercase hyphenated string (e.g., `xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx`). |

---

## Enum Mapping: Room (Kotlin) → TypeScript (Dexie)

| Room Entity / Enum (Kotlin) | Dexie / TypeScript Type | Transformation Logic |
|-----------------------------|-------------------------|----------------------|
| `BalanceType.INCOME` | `'income'` | `type === 'INCOME' ? 'income' : 'expense'` |
| `BalanceType.EXPENSE` | `'expense'` | Normalize `UPPER_CASE` Kotlin enum to `lowercase` string literal. |
| `DefaultType.DEFAULT` | `'default'` | Standard category — no special handling required. |
| `DefaultType.TRANSFER_DEFAULT` |  |  |
| `AccessRole.OWNER` | `'owner'` | Full permissions — essential for multi-user / shared budget features. |
| `AccessRole.MEMBER` | `'member'` | Read/write restricted — map to UI permission checks accordingly. |

---
