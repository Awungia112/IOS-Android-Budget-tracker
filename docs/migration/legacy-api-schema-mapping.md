# Legacy Django API Schema Mapping


**Purpose:** Map the legacy Django API to Budget Wise domain model for data migration

**Sources:**
- Postman collection analysis (saved example responses)
- Django models.py analysis (database schema)
- Backend code analysis (views, serializers, URLs)
- Android app code analysis (recurring logic, icon system)

**Status:** Code analysis complete. Ready for database queries and visual icon mapping.

---

## Summary

This document provides a comprehensive mapping between the legacy "Mein Budget" Django API and the Budget Wise PWA domain model. It serves as the technical specification for implementing data migration from the legacy system.

### Key Findings

| Area | Finding | Impact |
|------|---------|--------|
| **Balance vs Transaction** | Legacy uses "Balance" entity for transactions | All transaction operations use `/api/balance` endpoints |
| **Recurring Frequency** | `repeating` = months (not days) | Budget Wise supports all legacy frequencies via `every_N_months` |
| **Icons** | 100 numbered Android drawables | Requires semantic mapping to Lucide icons |
| **Templates** | Exist in DB but no API | Cannot migrate via API |
| **Transfers** | Two linked Balance records | Budget Wise doesn't support transfers |
| **Endpoints** | 45 REST endpoints documented | All user-accessible endpoints covered (excludes admin/internal) |

### Migration Readiness

| Component | Status | Blocker |
|-----------|--------|---------|
| Transactions |  Ready | None |
| Categories | Ready | Icon mapping recommended |
| Accounts |  Ready | Multi-account decision needed |
| Limits |  Ready | None |
| Templates |  Blocked | No API access |
| Recurring Items |  Partial | Non-monthly frequency decision needed |
| Savings Goals |  Ready | None |



---

## Table of Contents

1. [Authentication Flow](#authentication-flow)
2. [API Endpoints Overview](#api-endpoints-overview)
3. [Entity Mappings](#entity-mappings)
   - [Balance (Transactions)](#balance-transactions)
   - [Categories](#categories)
   - [Accounts](#accounts)
   - [Limits](#limits)
   - [Templates](#templates)
   - [Recurring Items](#recurring-items)
   - [Savings Goals](#savings-goals)
4. [Gap Analysis](#gap-analysis)
5. [Data Format Conversions](#data-format-conversions)

---

## Authentication Flow

### Step 1: User Registration
**Endpoint:** `POST /user/register`

**Request:**
```json
{
  "email": "user@example.com",
  "password": "password123",
  "first_name": "John",
  "last_name": "Doe"
}
```

**Response:** `201 Created`
```json
{
  "id": 1,
  "email": "user@example.com",
  "first_name": "John",
  "last_name": "Doe"
}
```

### Step 2: Get Authentication Token
**Endpoint:** `POST /user/get-token`

**Request:**
```json
{
  "email": "user@example.com",
  "password": "password123"
}
```

**Response:** `200 OK`
```json
{
  "token": "daa2a964f2b126022896705b3dc4aa180222aeab"
}
```

**Usage:** Include token in all subsequent requests:
```
Authorization: Bearer {token}
```

### Step 3: Delete User (Optional)
**Endpoint:** `DELETE /user/delete`  
**Auth:** Required (Bearer token)  
**Response:** `200 OK` (empty body)

### Password Reset Flow
1. **Request Reset:** `POST /user/request-password`
   ```json
   {
     "email": "user@example.com"
   }
   ```

2. **Reset Password:** `POST /user/password-reset`
   ```json
   {
     "email": "user@example.com",
     "token": "bd2tye-285ec6118a79c5e4a7d9361625a4e733",
     "password": "newpassword"
   }
   ```

---

## API Endpoints Overview

### User Management
| Method | Endpoint | Auth | Purpose |
|--------|----------|------|---------|
| POST | `/user/register` | No | Create new user |
| POST | `/user/get-token` | No | Get auth token |
| DELETE | `/user/delete` | Yes | Delete user account |
| POST | `/user/request-password` | No | Request password reset |
| POST | `/user/password-reset` | No | Reset password with token |

### Access Management
| Method | Endpoint | Auth | Purpose |
|--------|----------|------|---------|
| POST | `/api/access` | Yes | Add user access to account |
| GET | `/api/access` | Yes | Get my accesses (owner) |
| GET | `/api/access/account?id={id}` | Yes | Get accesses for account |
| DELETE | `/api/access?id={id}&version={version}` | Yes | Remove access |

### Account Management
| Method | Endpoint | Auth | Purpose |
|--------|----------|------|---------|
| POST | `/api/accounts` | Yes | Create account |
| PUT | `/api/accounts` | Yes | Update account |
| DELETE | `/api/accounts?id={id}` | Yes | Delete account |
| GET | `/api/accounts` | Yes | Get all accounts for user |
| GET | `/api/accounts?id={id}` | Yes | Get specific account |

### Balance (Transactions)
| Method | Endpoint | Auth | Purpose |
|--------|----------|------|---------|
| GET | `/api/balance?account_id={id}` | Yes | Get balances for account |
| POST | `/api/balance` | Yes | Create balance |
| PUT | `/api/balance` | Yes | Update balance |
| PATCH | `/api/balance` | Yes | Partial update balance |
| DELETE | `/api/balance?id={id}&version={version}` | Yes | Delete balance |
| POST | `/api/initialBalances` | Yes | Bulk create initial balances |

### Categories
| Method | Endpoint | Auth | Purpose |
|--------|----------|------|---------|
| GET | `/api/category?account_id={id}` | Yes | Get categories for account |
| POST | `/api/category` | Yes | Create category |
| PUT | `/api/category` | Yes | Update category |
| PUT | `/api/category/limit?id={id}&version={version}` | Yes | Delete category limit |
| DELETE | `/api/category?id={id}&version={version}` | Yes | Delete category |

### Limits
Limits are embedded in categories (see Categories section)

### Recurring Items
| Method | Endpoint | Auth | Purpose |
|--------|----------|------|---------|
| GET | `/api/recuring?account_id={id}` | Yes | Get recurring items |
| POST | `/api/recuring` | Yes | Create recurring item |
| PUT | `/api/recuring` | Yes | Update recurring item |
| DELETE | `/api/recuring?id={id}&version={version}` | Yes | Delete recurring item |

### Savings Goals
| Method | Endpoint | Auth | Purpose |
|--------|----------|------|---------|
| GET | `/api/saving-goal?category_id={id}` | Yes | Get savings goals for category |
| POST | `/api/saving-goal` | Yes | Create savings goal |
| PUT | `/api/saving-goal` | Yes | Update savings goal |
| DELETE | `/api/saving-goal?id={id}&version={version}` | Yes | Delete savings goal |

### Sync
| Method | Endpoint | Auth | Purpose |
|--------|----------|------|---------|
| GET | `/api/sync/all-for-user` | Yes | Get all data for user |
| GET | `/api/sync/all-for-user?account_id={id}` | Yes | Get all data for specific account |

### Notifications
| Method | Endpoint | Auth | Purpose |
|--------|----------|------|---------|
| GET | `/api/notifications` | Yes | List user notifications |
| PUT | `/api/notifications/{id}/read` | Yes | Mark notification as read |
| PUT | `/api/notifications/{id}/archive` | Yes | Mark notification as archived |

### Feedback (No Auth Required)
| Method | Endpoint | Auth | Purpose |
|--------|----------|------|---------|
| GET | `/api/feedback/survey-template` | Optional | Get current survey |
| POST | `/api/feedback/survey-template` | Yes | Create survey (admin) |
| POST | `/api/feedback/survey-answer` | Optional | Submit survey response |
| GET | `/api/feedback/survey-report` | No | Get survey report |
| POST | `/api/feedback/rating` | No | Submit app rating |
| GET | `/api/feedback/rating-report` | No | Get rating report |
| POST | `/api/feedback/feedback-send` | No | Send feedback email |

---

## Entity Mappings

### Balance (Transactions)

**Legacy Name:** `Balance`  
**Budget Wise Name:** `Transaction`

**IMPORTANT:** The legacy system uses "Balance" as the transaction entity. There are NO separate `/api/transactions` endpoints - all transaction operations use `/api/balance` endpoints.

#### GET /api/balance?account_id={id}

**Response Example:**
```json
[
  {
    "id": 1,
    "name": "TestBalance",
    "balanceType": "BT_EXPENSE",
    "date": "2022-09-09T13:49:51.141000Z",
    "amount": 45.5,
    "deleted": false,
    "account": 1,
    "category": 1,
    "saving_goal": null,
    "recuring": null,
    "user": 9,
    "target_account": null,
    "sender_account": null
  }
]
```

#### POST /api/balance

**Request Example:**
```json
{
  "account": 67,
  "name": "Balance5 / a:10 c:1",
  "balanceType": "BT_EXPENSE",
  "date": "2022-09-09",
  "amount": 45.50,
  "category": 1
}
```

**Response:** `201 Created`
```json
{
  "id": 1,
  "name": "TestBalance",
  "balanceType": "BT_EXPENSE",
  "date": "2022-09-09T13:49:51.141000Z",
  "amount": 45.5,
  "deleted": false,
  "account": 57,
  "category": 1,
  "saving_goal": null,
  "recuring": null,
  "user": 9,
  "target_account": null,
  "sender_account": null
}
```

#### PUT /api/balance

**Request Example:**
```json
{
  "id": 58436,
  "account": 96,
  "name": "Noch eine Balance-3",
  "balanceType": "BT_EXPENSE",
  "date": "2022-09-09",
  "amount": 22.20,
  "category": 1
}
```

**Response:** `200 OK` (returns updated balance object)

#### PATCH /api/balance

**Purpose:** Partial update of balance fields (similar to PUT but allows updating only specific fields)

**Request Example:**
```json
{
  "id": 58436,
  "amount": 25.00
}
```

**Response:** `200 OK` (returns updated balance object)

#### DELETE /api/balance?id={id}&version={version}

**Response:** `200 OK` (empty body)

#### POST /api/initialBalances (Bulk Create)

**Request Example:**
```json
[
  {
    "account": 67,
    "name": "Initial TestBalance1",
    "balanceType": "BT_EXPENSE",
    "date": "2022-11-18",
    "amount": 45.50,
    "category": 1
  },
  {
    "account": 67,
    "name": "Initial TestBalance2",
    "balanceType": "BT_EXPENSE",
    "date": "2022-08-09",
    "amount": 45.50,
    "category": 1
  }
]
```

**Response:** `201 Created` (empty body)

#### Field Mapping Table

| Legacy Field | Type | Budget Wise Field | Notes |
|--------------|------|-------------------|-------|
| `id` | integer | `id` | Convert to string |
| `name` | string | `title` | Direct mapping |
| `balanceType` | enum string | `type` | **Conversion:** `BT_EXPENSE` → `'expense'`, `BT_INCOME` → `'income'` |
| `date` | ISO datetime string | `date` | **Format conversion:** `2022-09-09T13:49:51.141000Z` → `2022-09-09` |
| `amount` | number | `amount` | Direct mapping |
| `account` | integer | `accountId` | Convert to string |
| `category` | integer | `category` | Convert to string (category ID) |
| `saving_goal` | integer \| null | `savingsGoalId` | Convert to string if not null |
| `recuring` | integer \| null | `isRecurring` | **Conversion:** If not null → `true`, else omit or `false` |
| `deleted` | boolean | N/A | **Filter:** Exclude deleted items during import |
| `user` | integer | N/A | Not stored in Budget Wise (single-user app) |
| `target_account` | integer \| null | N/A | **Gap:** Transfer target not supported - see Gap Analysis |
| `sender_account` | integer \| null | N/A | **Gap:** Transfer sender not supported - see Gap Analysis |
| `target_balance_id` | integer \| null | N/A | **Gap:** Linked transfer balance ID not supported |
| `sender_balance_id` | integer \| null | N/A | **Gap:** Linked transfer balance ID not supported |
| `is_transfer_balance` | boolean | N/A | **Gap:** Transfer flag not supported - skip these transactions |
| N/A | N/A | `createdAt` | **Default:** Use current timestamp or `date` |
| N/A | N/A | `executedAt` | **Default:** Omit (not pending) |
| N/A | N/A | `isCompletionTransaction` | **Default:** `false` or omit |
| `deleted` | boolean | N/A | **Filter:** Exclude deleted items during import |
| `user` | integer | N/A | Not stored in Budget Wise (single-user app) |
| `target_account` | integer \| null | N/A | **Gap:** Transfer target not supported yet |
| `sender_account` | integer \| null | N/A | **Gap:** Transfer sender not supported yet |
| N/A | N/A | `createdAt` | **Default:** Use current timestamp or `date` |
| N/A | N/A | `executedAt` | **Default:** Omit (not pending) |
| N/A | N/A | `isCompletionTransaction` | **Default:** `false` or omit |

---

### Categories

**Legacy Name:** `Category`  
**Budget Wise Name:** `Category`

#### GET /api/category?account_id={id}

**Response Example:**
```json
[
  {
    "id": 1,
    "name": "TestCategory",
    "icon": "//iconpath",
    "balanceType": "BT_INCOME",
    "active": true,
    "deletable": true,
    "limits": 123.45,
    "limitsDate": "2023-12-10T13:49:51.141Z",
    "deleted": false,
    "account": 1
  }
]
```

#### POST /api/category

**Request Example:**
```json
{
  "name": "Category 3 für Account 10",
  "icon": "//iconpath",
  "balanceType": "BT_INCOME",
  "active": false,
  "is_deletable": true,
  "limits": null,
  "limitsDate": "2022-12-25",
  "account": 10,
  "version": "{{latest_version}}"
}
```

**Response:** `201 Created`
```json
{
  "id": 1,
  "name": "TestCategory",
  "icon": "//iconpath",
  "balanceType": "BT_INCOME",
  "active": true,
  "deletable": true,
  "limits": 123.45,
  "limitsDate": "2023-12-10T13:49:51.141Z",
  "deleted": false,
  "account": 1
}
```

#### PUT /api/category

**Request Example:**
```json
{
  "id": 8,
  "name": "Test-Category3",
  "icon": "//iconpath",
  "account": 10,
  "balanceType": "BT_INCOME",
  "limits": 5000.00,
  "limitsDate": "2022-11-30",
  "active": true,
  "is_deletable": false,
  "default": "DEFAULT_TRANSFER",
  "version": "{{latest_version}}"
}
```

**Response:** `200 OK`
```json
{
  "id": 8,
  "name": "Test-Category3",
  "icon": "//iconpath",
  "balanceType": "BT_INCOME",
  "active": true,
  "deletable": false,
  "limits": 5000.00,
  "limitsDate": "2022-11-30T00:00:00.000Z",
  "deleted": false,
  "account": 10,
  "default": "DEFAULT_TRANSFER"
}
```

#### PUT /api/category/limit?id={id}&version={version}

**Purpose:** Deletes the limit for a category (sets `limits` and `limitsDate` to null)

**Response:** `200 OK`
```json
{
  "id": 8,
  "name": "Test-Category3",
  "icon": "//iconpath",
  "balanceType": "BT_INCOME",
  "active": true,
  "deletable": false,
  "limits": null,
  "limitsDate": null,
  "deleted": false,
  "account": 10
}
```

#### DELETE /api/category?id={id}&version={version}

**Response:** `200 OK` (empty body)

#### Field Mapping Table

| Legacy Field | Type | Budget Wise Field | Notes |
|--------------|------|-------------------|-------|
| `id` | integer | `id` | Convert to string |
| `name` | string | `name` | Direct mapping (may be translation key or custom) |
| `icon` | string | `icon` | **Conversion needed:** Legacy uses paths like `//iconpath`, Budget Wise uses icon keys like `'cash'`, `'pig'` |
| `balanceType` | enum string | `type` | **Conversion:** `BT_EXPENSE` → `'expense'`, `BT_INCOME` → `'income'` |
| `active` | boolean | N/A | **Gap:** Budget Wise doesn't have active/inactive categories |
| `deletable` | boolean | `isDefault` | **Conversion:** `deletable: false` → `isDefault: true` |
| `limits` | number \| null | **Separate Limit entity** | Create separate `Limit` record if not null |
| `limitsDate` | ISO datetime \| null | N/A | **Gap:** Budget Wise limits don't have dates |
| `deleted` | boolean | N/A | **Filter:** Exclude deleted items during import |
| `account` | integer | `accountId` | Convert to string |
| `default` | enum string \| undefined | N/A | **Gap:** Values like `DEFAULT_TRANSFER` not supported |
| N/A | N/A | `color` | **Default:** Assign from preset or default color |

---

### Accounts

**Legacy Name:** `Account`  
**Budget Wise Name:** `Account`

#### GET /api/accounts

**Response Example:**
```json
[
  {
    "id": 11,
    "name": "Kto NAA E.8",
    "description": "Extra Konto zum wieder löschen",
    "acronym": "E8",
    "color": "#ff8840",
    "created_at": "2022-11-21T17:37:28.556360Z",
    "last_change": "2022-11-21T17:37:28.556451Z",
    "deleted": false,
    "last_synced": null,
    "version": "1fbebc5a-c877-4d95-9146-6a23172ac74b",
    "user": 3
  }
]
```

#### POST /api/accounts

**Request Example:**
```json
{
  "name": "Kto NAA E.A",
  "description": "Extra Konto zum wieder löschen",
  "acronym": "EA",
  "color": "#ff8840"
}
```

**Response:** `201 Created`
```json
{
  "id": 11,
  "name": "Kto NAA E.A",
  "description": "Extra Konto zum wieder löschen",
  "acronym": "EA",
  "color": "#ff8840",
  "created_at": "2022-11-21T17:37:28.556360Z",
  "last_change": "2022-11-21T17:37:28.556451Z",
  "deleted": false,
  "last_synced": null,
  "version": "1fbebc5a-c877-4d95-9146-6a23172ac74b",
  "user": 3
}
```

#### PUT /api/accounts

**Request Example:**
```json
{
  "id": 8,
  "name": "Kto NAA E-5",
  "description": "Extra Konto zum wieder löschen",
  "acronym": "e5",
  "color": "#ff8840"
}
```

**Response:** `200 OK`
```json
{
  "id": 8,
  "name": "Kto NAA E-5",
  "description": "Extra Konto zum wieder löschen",
  "acronym": "e5",
  "color": "#ff8840",
  "created_at": "2022-11-21T17:37:28.556360Z",
  "last_change": "2022-11-21T18:45:12.123456Z",
  "deleted": false,
  "last_synced": null,
  "version": "new-uuid-after-update",
  "user": 3
}
```

#### DELETE /api/accounts?id={id}

**Response:** `200 OK` (empty body)

#### Field Mapping Table

| Legacy Field | Type | Budget Wise Field | Notes |
|--------------|------|-------------------|-------|
| `id` | integer | `id` | Convert to string |
| `name` | string | `name` | Direct mapping |
| `acronym` | string | `initials` | Direct mapping |
| `description` | string | N/A | **Gap:** Budget Wise doesn't store account descriptions |
| `color` | string (hex) | N/A | **Gap:** Budget Wise doesn't store account colors |
| `created_at` | ISO datetime | N/A | Not stored |
| `last_change` | ISO datetime | N/A | Not stored |
| `deleted` | boolean | N/A | **Filter:** Exclude deleted items during import |
| `last_synced` | ISO datetime \| null | N/A | Not applicable (local-first) |
| `version` | UUID string | N/A | Not applicable (different sync mechanism) |
| `user` | integer | N/A | Not stored (single-user app) |
| N/A | N/A | `profileImage` | **Default:** Omit or use default |

---

### Limits

**Legacy Storage:** Embedded in Category entity  
**Budget Wise Storage:** Separate `Limit` entity

#### Legacy Category with Limit

```json
{
  "id": 1,
  "name": "TestCategory",
  "limits": 123.45,
  "limitsDate": "2023-12-10T13:49:51.141Z",
  "account": 1
}
```

#### Budget Wise Limit Entity

```typescript
{
  id: "limit-1",
  categoryId: "1",
  amount: 123.45,
  accountId: "1"
}
```

#### Field Mapping Table

| Legacy Field | Type | Budget Wise Field | Notes |
|--------------|------|-------------------|-------|
| `category.id` | integer | `categoryId` | Convert to string |
| `category.limits` | number \| null | `amount` | Only create Limit if not null |
| `category.limitsDate` | ISO datetime \| null | N/A | **Gap:** Budget Wise limits are monthly, no specific date |
| `category.account` | integer | `accountId` | Convert to string |
| N/A | N/A | `id` | **Generate:** Create new UUID for limit |

**Migration Strategy:**
- For each category with `limits !== null`, create a separate `Limit` record
- Ignore `limitsDate` (Budget Wise limits apply to current month)
- Use `PUT /api/category/limit` to delete limits (sets to null)

---

### Templates

**Legacy Name:** `Template`  
**Budget Wise Name:** `Template`

**CRITICAL FINDING:** Templates exist in the legacy Django models and database but are NOT exposed via API endpoints.

#### Legacy Django Model

```python
class Template(models.Model):
    name = models.CharField(blank=False, null=False, max_length=255)
    balanceType = models.CharField(choices=BALANCE_TYPE_CHOICES, blank=False, null=False, max_length=255)
    amount = models.FloatField(blank=False, null=False)
    category = models.ForeignKey(Category, blank=False, null=False, on_delete=models.CASCADE)
    deleted = models.BooleanField(default=False)
```

#### API Endpoints

**NONE FOUND** - Templates are not exposed via REST API.

**Evidence:**
- No template endpoints in `mbbackend/urls.py`
- No template API views in `mbbackend/api/` folder
- Sync API (`/api/sync/all-for-user`) has TODO comment for templates but doesn't return them
- Templates only accessible via Django admin interface

#### Field Mapping Table

| Legacy Field | Type | Budget Wise Field | Notes |
|--------------|------|-------------------|-------|
| `id` | integer | `id` | Convert to string |
| `name` | string | `name` | Direct mapping |
| `balanceType` | enum string | `type` | **Conversion:** `BT_EXPENSE` → `'expense'`, `BT_INCOME` → `'income'` |
| `amount` | float | `amount` | Direct mapping |
| `category` | integer (FK) | `categoryId` | Convert to string |
| `deleted` | boolean | N/A | **Filter:** Exclude deleted items during import |
| N/A | N/A | `accountId` | **Derive:** From category's account |



---

### Recurring Items

**Legacy Name:** `Recuring` (note: typo in API)  
**Budget Wise Name:** `RecurringItem`

#### GET /api/recuring?account_id={id}

**Response Example:**
```json
[
  {
    "id": 3,
    "account": 10,
    "name": "Gehalt-4",
    "balanceType": "BT_INCOME",
    "startDate": "2022-11-01",
    "endDate": "2024-11-01",
    "amount": 24.25,
    "repeating": 1,
    "category": 1
  }
]
```

#### POST /api/recuring

**Request Example:**
```json
{
  "account": 10,
  "name": "Gehalt-4",
  "balanceType": "BT_INCOME",
  "startDate": "2022-11-01",
  "endDate": "2024-11-01",
  "amount": 24.25,
  "repeating": 1,
  "category": 1,
  "version": "{{latest_version}}"
}
```

**Response:** `201 Created`

#### PUT /api/recuring

**Request Example:**
```json
{
  "id": 6,
  "account": 10,
  "name": "RecuringTask 4 (updated)",
  "balanceType": "BT_EXPENSE",
  "startDate": "2022-09-09",
  "endDate": "2022-09-18",
  "amount": 99.96,
  "repeating": 1,
  "category": 1,
  "version": "{{latest_version}}"
}
```

#### DELETE /api/recuring?id={id}&version={version}

**Response:** `200 OK` (empty body)

#### Field Mapping Table

| Legacy Field | Type | Budget Wise Field | Notes |
|--------------|------|-------------------|-------|
| `id` | integer | `id` | Convert to string |
| `name` | string | `name` | Direct mapping |
| `balanceType` | enum string | `type` | **Conversion:** `BT_EXPENSE` → `'expense'`, `BT_INCOME` → `'income'` |
| `startDate` | date string | `startDate` | Date part kept (format: `YYYY-MM-DD`) |
| `endDate` | date string \| null | `endDate` | Date part kept; `null` for open-ended items |
| `amount` | number | `amount` | Direct mapping |
| `repeating` | integer | `frequency` | **Conversion needed:** See frequency mapping below |
| `category` | integer | `categoryId` | Convert to string |
| `account` | integer | `accountId` | Convert to string |
| N/A | N/A | `frequency` | **Conversion:** Map from `repeating` integer |

#### Frequency Conversion

Legacy `repeating` field represents **number of MONTHS** between occurrences.

**Android App Evidence:**
- Field named `mRepeatingInterval` in `RecurringWrapper.java`
- Database migration shows conversion from old codes to months:
  - 2 → 3 (quarterly)
  - 3 → 6 (semi-annually)
  - 4 → 12 (annually)

**Conversion Table:**

| Legacy `repeating` | Meaning | Budget Wise `frequency` | Notes |
|--------------------|---------|-------------------------|-------|
| `1` | Every 1 month | `'monthly'` | Direct mapping |
| `2` | Every 2 months | `'every_2_months'` | Supported (custom interval) |
| `3` | Every 3 months | `'every_3_months'` | Supported (quarterly) |
| `6` | Every 6 months | `'every_6_months'` | Supported (semi-annually) |
| `12` | Every 12 months | `'every_12_months'` | Supported (annually) |
| Other | Every N months | `'every_N_months'` | Supported (any interval) |

**Budget Wise Supported Frequencies:**
- Daily: `'daily'`, `'every_N_days'`
- Weekly: `'weekly'`, `'every_N_weeks'`
- Monthly: `'monthly'`, `'every_N_months'`

**Migration Strategy:**
- **Recommended:** Direct conversion using `'every_N_months'` pattern
- All legacy frequencies are fully supported in Budget Wise
- Example: `repeating: 3` → `frequency: 'every_3_months'`
- Example: `repeating: 1` → `frequency: 'monthly'`

---

### Savings Goals

**Legacy Name:** `SavingGoal`  
**Budget Wise Name:** `SavingsGoal`

#### GET /api/saving-goal?category_id={id}

**Response Example:**
```json
[
  {
    "id": 1,
    "name": "MeinSavingGoal",
    "created_at": "2022-10-12T09:30:24.065300Z",
    "date": "2022-09-09T13:49:51.141000Z",
    "amount": 80,
    "monthly_amount": 20,
    "isopen": true,
    "deleted": false,
    "category": 4
  }
]
```

#### POST /api/saving-goal

**Request Example:**
```json
{
  "name": "MeinSavingGoal 5",
  "category": 1,
  "created_at": "2022-11-21",
  "dueDate": "2022-12-24",
  "amount": 50,
  "monthly_amount": 25,
  "version": "{{latest_version}}"
}
```

**Response:** `201 Created`

#### PUT /api/saving-goal

**Request Example:**
```json
{
  "id": 2,
  "name": "Mein-Saving-Goal Nr.2",
  "category": 1,
  "date": "2022-09-09T13:49:51.141Z",
  "amount": 55,
  "monthly_amount": 21,
  "version": "{{latest_version}}"
}
```

#### DELETE /api/saving-goal?id={id}&version={version}

**Response:** `200 OK` (empty body)

#### Field Mapping Table

| Legacy Field | Type | Budget Wise Field | Notes |
|--------------|------|-------------------|-------|
| `id` | integer | `id` | Convert to string |
| `name` | string | `name` | Direct mapping |
| `amount` | number | `targetAmount` | Direct mapping |
| `date` | ISO datetime | `deadline` | **Format conversion:** `2022-09-09T13:49:51.141000Z` → `2022-09-09` |
| `dueDate` | date string | `deadline` | Direct mapping (used in POST, `date` in GET) |
| `monthly_amount` | number | `monthlyAmount` | Direct mapping |
| `category` | integer | `categoryId` | Convert to string |
| `created_at` | ISO datetime | N/A | Not stored in Budget Wise |
| `isopen` | boolean | N/A | **Gap:** Budget Wise doesn't track open/closed status |
| `deleted` | boolean | N/A | **Filter:** Exclude deleted items during import |
| N/A | N/A | `accountId` | **Derive:** From category's account or user's default account |
| N/A | N/A | `icon` | **Default:** Omit or use default |
| N/A | N/A | `iconColor` | **Default:** Omit or use default |
| N/A | N/A | `frequency` | **Default:** Omit or derive from `monthly_amount` |

**Note:** Legacy API uses both `date` and `dueDate` fields inconsistently. Need to handle both during import.

---

## Gap Analysis

### 1. Missing in Budget Wise (Legacy → Budget Wise)

#### Account Transfers
- **Legacy Fields:** `target_account`, `sender_account`, `target_balance_id`, `sender_balance_id`, `is_transfer_balance` in Balance
- **Impact:** Cannot import transfer transactions directly
- **Django Model Finding:**
```python
class Balance(models.Model):
    target_account = models.ForeignKey(Account, blank=True, null=True, on_delete=models.SET_NULL, related_name='target_account')
    target_balance_id = models.IntegerField(null=True, blank=True)
    sender_account = models.ForeignKey(Account, blank=True, null=True, on_delete=models.SET_NULL, related_name='sender_account')
    sender_balance_id = models.IntegerField(null=True, blank=True)
    is_transfer_balance = models.BooleanField(null=True, blank=False, default=False)
```
- **How Transfers Work:** Creates TWO Balance records:
  1. Sender balance (expense) with `target_account` and `target_balance_id`
  2. Target balance (income) with `sender_account` and `sender_balance_id`
  3. Both marked with `is_transfer_balance=True`
- **Resolution Options:** 
  - Option A: Skip transfer transactions during import (simplest)
  - Option B: Create two separate transactions (expense from sender, income to target) with note indicating they're related
  - Option C: Add transfer support to Budget Wise (future feature)
  - **Recommended:** Option B - Split into two transactions with matching amounts and dates, add note "Transfer from/to [Account Name]"

#### Category Features
- **Legacy:** `active` field (enable/disable categories)
- **Impact:** Active/inactive state lost
- **Resolution:** Import only active categories, or import all and let user delete unwanted ones

- **Legacy:** `default` field (e.g., `DEFAULT_TRANSFER`)
- **Django Model:**
```python
CATEGORY_DEFAULT_CHOICES = [
    ('DEFAULT', 'DEFAULT'),
    ('DEFAULT_TRANSFER', 'DEFAULT_TRANSFER')
]
```
- **Impact:** Special category types not preserved
- **Resolution:** 
  - `DEFAULT` → Map to closest Budget Wise default category
  - `DEFAULT_TRANSFER` → Map to a transfer-related category or create custom category
  - Document that only 2 default types exist in legacy system

- **Legacy:** `limitsDate` (limit expiration date)
- **Impact:** Time-based limits not supported
- **Resolution:** Import limit amount only, document that limits are monthly in Budget Wise

#### Account Metadata
- **Legacy:** `description`, `color`, `created_at`, `last_change`, `version`
- **Impact:** Account metadata lost
- **Resolution:** Document in migration notes, not critical for functionality

#### Recurring Item End Dates
- **Legacy:** `endDate` field
- **Status:** Mapped to `RecurringItem.endDate`; occurrences stop at the end date

#### Savings Goal Status
- **Legacy:** `isopen` field
- **Impact:** Cannot distinguish active vs completed goals
- **Resolution:** Calculate completion status from linked transactions

### 2. Missing in Legacy (Budget Wise → Legacy)

#### Templates
- **Budget Wise:** Separate Template entity with full CRUD operations
- **Legacy:** Template model exists in database but NO API endpoints
- **Impact:** Cannot import templates from legacy system via API
- **Resolution:** Templates are a Budget Wise feature. Legacy templates (if any exist) would require direct database access to migrate.

#### Transaction Metadata
- **Budget Wise:** `createdAt`, `executedAt`, `isCompletionTransaction`
- **Legacy:** Not present
- **Resolution:** Set defaults during import

#### Category Customization
- **Budget Wise:** `color` field on categories
- **Legacy:** Not present
- **Resolution:** Use default colors from presets

#### Account Profile Images
- **Budget Wise:** `profileImage` field
- **Legacy:** Not present
- **Resolution:** Leave empty, users can set after migration

### 3. Data Format Differences

#### Date Formats
- **Legacy:** ISO 8601 datetime strings (`2022-09-09T13:49:51.141000Z`)
- **Budget Wise:** Date-only strings (`2022-09-09`)
- **Conversion:** Strip time component

#### Enum Values
- **Legacy:** `BT_EXPENSE`, `BT_INCOME`
- **Budget Wise:** `'expense'`, `'income'`
- **Conversion:** Remove `BT_` prefix and lowercase

#### ID Types
- **Legacy:** Integer IDs
- **Budget Wise:** String IDs (UUIDs)
- **Conversion:** Convert integers to strings, maintain mapping for relationships

#### Icon References
- **Legacy:** Path-like strings (`//iconpath`)
- **Budget Wise:** Icon keys (`'cash'`, `'pig'`)
- **Conversion:** Requires icon mapping table (see below)



---

## Data Format Conversions

### Date/Time Conversion

```typescript
// Legacy: "2022-09-09T13:49:51.141000Z"
// Budget Wise: "2022-09-09"

function convertDate(legacyDate: string): string {
  return legacyDate.split('T')[0];
}
```

### Balance Type Conversion

```typescript
type LegacyBalanceType = 'BT_EXPENSE' | 'BT_INCOME';
type BudgetWiseType = 'expense' | 'income';

function convertBalanceType(legacyType: LegacyBalanceType): BudgetWiseType {
  return legacyType === 'BT_EXPENSE' ? 'expense' : 'income';
}
```

### ID Conversion

```typescript
function convertId(legacyId: number): string {
  return legacyId.toString();
}

// Maintain mapping for relationship resolution
const idMap = new Map<string, string>();
idMap.set(`legacy-category-${legacyId}`, budgetWiseId);
```

### Icon Conversion

**Legacy Icon System:**
- Android drawable resource names
- Pattern: `kategorie_{type}_{number}`
- 50 expense icons: `kategorie_ausgaben_1` to `kategorie_ausgaben_50`
- 50 income icons: `kategorie_einnahmen_1` to `kategorie_einnahmen_50`

**Budget Wise Icon System:**
- Icon keys from Lucide React icon library
- Examples: `'cash'`, `'pig'`, `'shopping'`, `'home'`, `'car'`, etc.

**Conversion Strategy:**

```typescript
// Default fallback mapping
function convertIcon(legacyIcon: string, balanceType: 'expense' | 'income'): string {
  // Check if we have a specific mapping
  const mapped = iconMapping[legacyIcon];
  if (mapped) return mapped;
  
  // Fallback to default based on type
  return balanceType === 'expense' ? 'shopping' : 'cash';
}

// Specific icon mapping (requires visual inspection of legacy icons)
const iconMapping: Record<string, string> = {
  'kategorie_ausgaben_1': 'shopping',
  'kategorie_ausgaben_2': 'home',
  'kategorie_ausgaben_3': 'car',
  // ... add mappings for commonly used icons
  'kategorie_einnahmen_1': 'cash',
  'kategorie_einnahmen_2': 'briefcase',
  // ... add mappings for commonly used icons
};
```



### Frequency Conversion

**Legacy System:** `repeating` = number of MONTHS between occurrences

```typescript
type LegacyRepeating = number; // 1, 2, 3, 6, 12, etc.
type BudgetWiseFrequency = 
  | 'daily' | `every_${number}_days`
  | 'weekly' | `every_${number}_weeks`
  | 'monthly' | `every_${number}_months`;

function convertFrequency(repeating: number): BudgetWiseFrequency {
  // Direct conversion - all legacy frequencies are supported
  if (repeating === 1) {
    return 'monthly';
  }
  
  // Use Budget Wise's flexible frequency pattern
  return `every_${repeating}_months`;
}

// Example conversions:
// repeating: 1  → 'monthly'
// repeating: 2  → 'every_2_months'
// repeating: 3  → 'every_3_months' (quarterly)
// repeating: 6  → 'every_6_months' (semi-annually)
// repeating: 12 → 'every_12_months' (annually)
```

---

## Sync Endpoint Analysis

### GET /api/sync/all-for-user

Returns all data for the authenticated user across all accounts.

**Response Structure:**
```json
{
  "accounts": [...],
  "categories": [...],
  "balances": [...],
  "recurring": [...],
  "savingGoals": [...]
}
```

### GET /api/sync/all-for-user?account_id={id}

Returns all data for a specific account.

**Migration Strategy:**
1. Call `/api/sync/all-for-user` to get complete dataset
2. Process entities in order:
   1. Accounts
   2. Categories
   3. Limits (extracted from categories)
   4. Transactions (balances)
   5. Recurring items
   6. Savings goals
3. Maintain ID mapping throughout process
4. Handle deleted items (filter out where `deleted: true`)

---

## Versioning and Optimistic Locking

The legacy API uses a `version` field (UUID string) for optimistic locking:

```json
{
  "id": 8,
  "version": "{{latest_version}}"
}
```

**Budget Wise:** Does not use optimistic locking (local-first, single-user)

**Migration Impact:** Version fields can be ignored during import.

### Version Conflict Handling

When updating or deleting entities, if the provided version doesn't match the current version, the API returns a conflict error:

**Error Response:** `409 Conflict`
```json
{
  "error": "Version conflict",
  "message": "The entity has been modified by another request",
  "current_version": "new-uuid-here"
}
```

**Resolution Strategy for Migration:**
1. Fetch latest version before each update/delete operation
2. Use the version from the most recent GET response
3. If conflict occurs, retry with updated version
4. For migration, conflicts are unlikely (single-user import process)

---

## Error Response Examples

The legacy API returns standard HTTP status codes with JSON error bodies:

### Authentication Errors

**401 Unauthorized** - Invalid or missing token
```json
{
  "detail": "Invalid token."
}
```

**403 Forbidden** - Valid token but insufficient permissions
```json
{
  "detail": "You do not have permission to perform this action."
}
```

### Validation Errors

**400 Bad Request** - Invalid request data
```json
{
  "name": ["This field is required."],
  "amount": ["A valid number is required."]
}
```

### Not Found Errors

**404 Not Found** - Entity doesn't exist
```json
{
  "detail": "Not found."
}
```

### Version Conflict

**409 Conflict** - Optimistic locking version mismatch
```json
{
  "error": "Version conflict",
  "current_version": "uuid-string"
}
```

### Server Errors

**500 Internal Server Error** - Server-side error
```json
{
  "detail": "Internal server error"
}
```

**Migration Error Handling Strategy:**
1. **401/403:** Stop migration, re-authenticate
2. **400:** Log validation error, skip entity, continue
3. **404:** Log missing reference, skip entity, continue
4. **409:** Retry with latest version
5. **500:** Log error, retry with exponential backoff

---

## Authentication Token Management

**Token Format:** String (e.g., `"daa2a964f2b126022896705b3dc4aa180222aeab"`)

**Token Usage:**
```
Authorization: Bearer daa2a964f2b126022896705b3dc4aa180222aeab
```

**Token Expiration:** Tokens remain valid until user logs out or deletes account

**Migration Process:**
1. User provides email/password
2. Call `POST /user/get-token` to obtain token
3. Use token for all subsequent API calls
4. Token remains valid until user logs out or deletes account

---

## Recommended Migration Order

1. **Authenticate:** Get user token
2. **Fetch Data:** Call `/api/sync/all-for-user`
3. **Create Account:** Import account data (or use default)
4. **Import Categories:** Create categories, extract limits
5. **Import Limits:** Create separate limit records
6. **Import Transactions:** Convert balances to transactions
7. **Import Recurring Items:** Convert with frequency mapping
8. **Import Savings Goals:** Link to categories
9. **Validate:** Check data integrity
10. **Cleanup:** Mark migration complete

---


