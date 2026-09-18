# Critical Path Test Suite

## Purpose

This document defines the repeatable, environment-agnostic test procedures for Budget Wise's core user journeys. Every deployed environment (dev, QA, staging, production) must pass these tests before being considered operational.

The goal is predictability: anyone on the team can follow these procedures and get the same pass/fail result for the same environment, regardless of when they test or which environment they test against.

---

## Terminology

| Term | Meaning |
|---|---|
| **Critical Path** | A user journey that, if broken, renders the app unusable for its primary purpose. Failure on a critical path is a release blocker. |
| **Major Path** | A user journey that is important but has workarounds or is not the primary value proposition. |
| **Minor Path** | A secondary feature. Failure is a bug but not a release blocker. |

---

## Environment Prerequisites

Before testing any environment, confirm the following are operational.

### Infrastructure Checklist

| # | Check | How to Verify |
|---|---|---|
| 1 | Main API health | `GET https://api.<ENV>.dip.on.adorsys.com/health` returns `{"status":"ok"}` |
| 2 | Recovery API health | `GET https://recovery.<ENV>.dip.on.adorsys.com/health` returns `{"status":"ok"}` |
| 3 | PWA loads | `https://app.<ENV>.dip.on.adorsys.com/` serves the app, no blank page |
| 4 | CORS allows PWA origin | `curl -H "Origin: https://app.<ENV>.dip.on.adorsys.com" -I https://api.<ENV>.dip.on.adorsys.com/v1/nonce` returns `access-control-allow-origin: https://app.<ENV>.dip.on.adorsys.com` |
| 5 | CSP allows WASM | Browser console: no `WebAssembly` CSP errors when loading `/register` |
| 6 | Email delivery works | Brevo API key is set (not `REPLACE_ME`) in AWS Secrets Manager for the environment |
| 7 | Database connectivity | Both ECS tasks show `healthy` in CloudWatch logs within 2 minutes of startup |
| 8 | SSL/TLS | All URLs use HTTPS, no mixed-content warnings |

### Environment URLs

| Environment | PWA | API | Recovery | Git Branch |
|---|---|---|---|---|
| dev | `https://app.dev.dip.on.adorsys.com` | `https://api.dev.dip.on.adorsys.com` | `https://recovery.dev.dip.on.adorsys.com` | `develop` |
| QA | `https://app.qa.dip.on.adorsys.com` | `https://api.qa.dip.on.adorsys.com` | `https://recovery.qa.dip.on.adorsys.com` | `qa` |
| Production | `https://app.prod.dip.on.adorsys.com` | `https://api.prod.dip.on.adorsys.com` | `https://recovery.prod.dip.on.adorsys.com` | `main` |

### Cloudflare Pages Deployment

The PWA is deployed to Cloudflare Pages with automatic branch-based deployments:

| Git Branch | Cloudflare Pages URL | Custom Domain |
|---|---|---|
| `develop` | `https://dev.budget-wise-pwa.pages.dev` | `app.dev.dip.on.adorsys.com` |
| `qa` | `https://qa.budget-wise-pwa.pages.dev` | `app.qa.dip.on.adorsys.com` |
| `main` | `https://budget-wise-pwa.pages.dev` | `app.prod.dip.on.adorsys.com` |

**Note:** Route53 CNAME records point custom domains to the appropriate Cloudflare Pages branch URLs.

### Git Branch Strategy

The project uses three long-lived branches for environment deployments:

- **`develop`** → dev environment (for development work)
- **`qa`** → QA environment (for pre-production testing)
- **`main`** → production environment (for live releases)

**Important:** When merging changes from `develop` to `main`, they do **not** automatically go to `qa`. The `qa` branch is a separate long-lived branch that must be updated independently if you want to test in QA before promoting to production.

**Recommended workflow:**
1. Develop features on feature branches, merge to `develop`
2. When ready for QA testing, merge `develop` into `qa` (or cherry-pick specific commits)
3. Test in QA environment
4. When ready for production, merge `qa` into `main`

---

## CP-1: Registration (Magic Link)

**Priority:** Critical Path
**Automated Coverage:** E2E (`onboarding.spec.ts`), integration (partial)
**API Endpoints Exercised:** `POST /v1/nonce`, `POST /v1/auth/register`, `GET /v1/auth/verify?token=X`, `POST /v1/auth/verify`, `POST /v1/recovery/enroll`

### Preconditions
- Fresh browser session (no localStorage/IndexedDB data)
- Valid email address that the tester can access
- Brevo email delivery operational

### Test Steps

| Step | Action | Expected Result |
|---|---|---|
| 1 | Navigate to the PWA URL | Redirected to `/onboarding` |
| 2 | Swipe through onboarding slides, tap "Login" | Navigated to `/register` |
| 3 | Enter a valid email address, tap "Continue" | Loading spinner appears; `POST /v1/auth/register` returns 200; email sent |
| 4 | Check email inbox for magic link | Email received from Brevo within 60 seconds |
| 5 | Click the magic link in the email | Opens app at `/register/verify?token=XXX`; `GET /v1/auth/verify` validates token |
| 6 | App processes the token | `POST /v1/auth/verify` returns `session_token`, `email_hash`, `user_id` |
| 7 | Recovery code screen appears | 12-word recovery code displayed with "I have saved my recovery code" checkbox |
| 8 | Check the confirmation box, tap "Continue" | `POST /v1/recovery/enroll` succeeds; redirected to dashboard (`/`) |
| 9 | Dashboard loads with no errors | Balance shown as 0, no error banners, `localStorage` has `onboardingComplete=true` |

### Failure Indicators
- Magic link email not received within 120 seconds (Brevo or email pepper misconfiguration)
- Browser console shows `CORS` or `CSP` errors (infrastructure issue)
- Browser console shows `WebAssembly` compilation error (CSP `wasm-unsafe-eval` missing)
- `401` or `500` from any API call (server bug or database issue)
- Token validation returns `410` (token expired -- links are time-limited)

---

## CP-2: Registration (OTP Code)

**Priority:** Critical Path
**Automated Coverage:** E2E (`onboarding.spec.ts`)
**API Endpoints Exercised:** `POST /v1/nonce`, `POST /v1/auth/register`, `POST /v1/auth/verify-code`, `POST /v1/recovery/enroll`

### Preconditions
- Same as CP-1

### Test Steps

| Step | Action | Expected Result |
|---|---|---|
| 1 | Complete steps 1-3 of CP-1 | On "Check your email" screen at `/register/check-email` |
| 2 | Tap "Enter code manually" (or wait for OTP screen) | Navigated to `/register/otp` |
| 3 | Enter the 6-digit OTP code from the email | Code auto-submits on 6th digit |
| 4 | Server verifies OTP | `POST /v1/auth/verify-code` returns session data |
| 5 | Recovery code screen appears | Same as CP-1 step 7-8 |
| 6 | Confirm recovery code, reach dashboard | Same as CP-1 step 8-9 |

### Failure Indicators
- OTP code rejected with "invalid code" error (wrong pepper, expired code)
- Rate limit (429) after too many attempts (5 max)

---

## CP-3: Account Recovery

**Priority:** Critical Path
**Automated Coverage:** Integration (`recovery.integration.test.tsx`)
**API Endpoints Exercised:** `POST /v1/recovery/request`, `POST /v1/recovery/verify`

### Preconditions
- An account registered via CP-1 or CP-2 (need the recovery code saved during registration)
- Access to the email address used during registration

### Test Steps

| Step | Action | Expected Result |
|---|---|---|
| 1 | Clear app data (Settings > Reset, or clear localStorage/IndexedDB) | App returns to onboarding |
| 2 | Tap "Recover existing account" | Navigated to `/recovery` |
| 3 | Security warning is visible | Yellow alert box explaining email + recovery code are both required |
| 4 | Enter the registered email, tap "Continue" | `POST /v1/recovery/request` returns 200; OTP email sent |
| 5 | Enter the OTP code from the email | `POST /v1/recovery/verify` returns `encrypted_private_key` envelope |
| 6 | Enter the 6-word recovery code saved during registration | `openRecovery()` decrypts the envelope successfully |
| 7 | Progress screen shows: Verifying -> Decrypting -> Syncing | Private key recovered and stored |
| 8 | Redirected to dashboard | Account data restored, balance matches pre-reset state |

### Failure Indicators
- "Email not registered" error (email pepper mismatch between registration and recovery server)
- Decryption fails with recovery code (wrong code entered, or recovery envelope corrupted)
- Rate limit after 5 failed OTP attempts (429 response)
- Private key not stored after decryption (browser keystore issue)

---

## CP-4: Transaction Management

**Priority:** Critical Path
**Automated Coverage:** E2E (`transactions.spec.ts`), integration (`TransactionForm.integration.test.tsx`)

### Test Steps

| Step | Action | Expected Result |
|---|---|---|
| 1 | From dashboard, tap "+" (income) button | Transaction form opens as drawer/sheet |
| 2 | Enter amount "100", select category, tap save | Transaction appears in dashboard list, balance updated |
| 3 | Tap "-" (expense) button, enter amount "30", select category, save | Expense appears, balance reflects both transactions |
| 4 | Tap on an existing transaction, edit amount, save | Updated amount reflected in list and balance |
| 5 | Swipe or tap delete on a transaction, confirm deletion | Transaction removed, balance recalculated |
| 6 | Add a future-dated transaction | Transaction appears in "Pending" section |
| 7 | Navigate to previous/future month | Transactions for that month displayed |

### Failure Indicators
- Transaction not persisting (IndexedDB write failure)
- Balance not updating after add/edit/delete
- Category selector not loading or empty
- Date picker not working on mobile

---

## CP-5: Category and Limit Management

**Priority:** Major Path
**Automated Coverage:** E2E (`categories.spec.ts`, `limits.spec.ts`), integration (`Categories.integration.test.tsx`, `LimitForm.integration.test.tsx`, `useLimitValidation.integration.test.tsx`, `useMonthlyLimits.integration.test.tsx`)

### Categories

| Step | Action | Expected Result |
|---|---|---|
| 1 | Navigate to sidebar > Categories ( Income / Expense ) | Category list displayed |
| 2 | Add a new category with name and icon | Category appears in list and in transaction form chip selector |
| 3 | Edit an existing category name | Name updated in list and in all transactions using it |
| 4 | Attempt to delete a category in use | Confirmation dialog; deletion removes category and reassigns transactions |
| 5 | Delete an unused category | Category removed immediately |

### Limits

| Step | Action | Expected Result |
|---|---|---|
| 1 | Navigate to Limits tab | Active limits displayed with progress bars |
| 2 | Create a spending limit: select category, set amount, set period (monthly) | Limit created, progress bar shows 0% used |
| 3 | Add transactions that exceed the limit | Warning indicator on limit card, dashboard shows limit warning |
| 4 | Edit the limit amount to a higher value | Progress bar recalculates, warning may clear |
| 5 | Delete a limit | Limit removed from list |

---

## CP-6: Savings Goals

**Priority:** Major Path
**Automated Coverage:** E2E (`savings-goals.spec.ts`), integration (`SavingsGoals.integration.test.tsx`, `SavingsGoalForm.integration.test.tsx`, `useSavingsGoalValidation.integration.test.tsx`)

### Test Steps

| Step | Action | Expected Result |
|---|---|---|
| 1 | Navigate to Savings tab | Savings goals list displayed |
| 2 | Create a new savings goal: name, target amount, optional deadline | Goal card appears with 0% progress |
| 3 | Make a payment toward the goal | Progress bar updates, remaining amount decreases |
| 4 | Reach target amount | Completion dialog shown |
| 5 | Edit goal: change target amount or deadline | Updated values reflected |
| 6 | Delete a goal | Goal removed from list |

---

## CP-7: Recurring Transactions

**Priority:** Major Path
**Automated Coverage:** E2E (`recurring.spec.ts`)

### Test Steps

| Step | Action | Expected Result |
|---|---|---|
| 1 | Navigate to sidebar > Recurring | Recurring items list displayed |
| 2 | Create a recurring expense: amount, category, frequency (weekly/monthly) | Item appears in list with next execution date |
| 3 | View executed instances | Past executions shown in a drawer |
| 4 | Edit the recurring item: change amount or frequency | Updated values reflected |
| 5 | Delete a recurring item | Item removed, no new instances generated |

---

## CP-8: Templates

**Priority:** Minor Path
**Automated Coverage:** E2E (`templates.spec.ts`), integration (`TemplateForm.integration.test.tsx`)

### Test Steps

| Step | Action | Expected Result |
|---|---|---|
| 1 | Navigate to sidebar > Templates | Template list displayed |
| 2 | Create a template: type, amount, category, note | Template appears in list |
| 3 | Use template to create a transaction | Transaction created with template values, appears in dashboard |
| 4 | Edit template | Updated values reflected |
| 5 | Delete template | Template removed |

---

## CP-9: Statistics

**Priority:** Major Path
**Automated Coverage:** E2E (`statistics.spec.ts`), integration (`Statistics.integration.test.tsx`)

### Test Steps

| Step | Action | Expected Result |
|---|---|---|
| 1 | Navigate to Statistics tab | Spending breakdown chart displayed |
| 2 | Filter by date range (this month, last month, custom) | Chart and numbers update to reflect selected range |
| 3 | Verify income vs expense totals match dashboard | Totals are consistent |
| 4 | Switch between category breakdown views | Views update correctly |

---

## CP-10: Online Sync

**Priority:** Critical Path
**Automated Coverage:** Integration (none for sync flow), E2E (none for sync flow)
**API Endpoints Exercised:** `POST /v1/accounts`, `POST /v1/accounts/:id/records`, `GET /v1/accounts/:id/records?since=N`

This flow requires two browser sessions (or two devices) to verify bidirectional sync.

### Preconditions
- Two registered accounts (User A and User B) via CP-1 or CP-2
- Both users are members of the same shared account (see CP-11 first, or test sync with a single user first)

### Test Steps (Single User)

| Step | Action | Expected Result |
|---|---|---|
| 1 | From a local-only account, trigger "go online" (SyncMigrationWizard) | Account creation on server: `POST /v1/accounts` with wrapped key returns 201 |
| 2 | Add transactions locally while online | Transactions are encrypted and pushed to server via `POST /v1/accounts/:id/records` |
| 3 | Open the same account on a different browser/device, pull changes | Remote changes pulled and replayed locally |
| 4 | Make conflicting changes on both devices simultaneously | Last-write-wins or merge resolution operates correctly |
| 5 | Go offline (disable network), make changes, go back online | Changes queued locally, then pushed when connectivity restored |
| 6 | Observe sync indicator | Shows: IDLE -> SYNCING -> SYNCED (success) or ERROR (failure) |

### Test Steps (Shared Account)

| Step | Action | Expected Result |
|---|---|---|
| 1 | User A (owner) creates a transaction | Change record pushed to server, encrypted with account key |
| 2 | User B (member) triggers sync | Change record pulled, decrypted, appears in User B's dashboard |
| 3 | User B creates a transaction | Change record pushed to server |
| 4 | User A triggers sync | User B's transaction appears in User A's dashboard |

---

## CP-11: Account Sharing (Invite and Key Delivery)

**Priority:** Critical Path
**Automated Coverage:** Integration (none for UI flow), Gate 3 API script (`scripts/gate3-invite-accept-key-delivery.mjs`)
**API Endpoints Exercised:** `POST /v1/accounts/:id/invites`, `GET /v1/invites/pending`, `POST /v1/invites/:id/accept`, `GET /v1/accounts/:id/pending-key-requests`, `GET /v1/users/:id/public-key`, `POST /v1/accounts/:id/keys`, `GET /v1/accounts/:id/keys`

### Preconditions
- Two registered accounts: User A (owner) and User B (invitee)
- Both accounts have completed onboarding
- Device must be online for sharing operations

### Test Steps

| Step | Action | Expected Result |
|---|---|---|
| 1 | User A navigates to Settings > Sharing for the account | Sharing settings page loads, shows "No members yet" |
| 2 | User A enters User B's email, taps "Invite" | `POST /v1/accounts/:id/invites` returns 201; invite email sent |
| 3 | User B checks email, sees invite | Email contains link to the app |
| 4 | User B opens the app, navigates to pending invites | `GET /v1/invites/pending` returns the invite |
| 5 | User B accepts the invite | `POST /v1/invites/:id/accept` returns 200 |
| 6 | User A's app detects pending key request | `GET /v1/accounts/:id/pending-key-requests` returns User B's user ID |
| 7 | User A wraps account key for User B and delivers it | `POST /v1/accounts/:id/keys` returns 201 |
| 8 | User B fetches and unwraps the account key | `GET /v1/accounts/:id/keys` returns wrapped key; local decryption succeeds |
| 9 | Both users see the shared account in their account list | Account appears with correct role (owner/member) |

### Member Removal

| Step | Action | Expected Result |
|---|---|---|
| 1 | User A removes User B from the shared account | `DELETE /v1/accounts/:id/members/:userId` succeeds |
| 2 | Account key is rotated for remaining members | New epoch created, new wrapped keys uploaded |
| 3 | User B no longer has access to the account data | Sync fails with authorization error for User B |

### Failure Indicators
- Invite email not sent (Brevo misconfiguration)
- Key delivery fails with 409 `invite_not_accepted` (timing issue -- accept before delivering)
- Key delivery stuck in pending queue (owner goes offline after invite accepted)
- Member removal does not rotate key (security issue -- removed member can still decrypt data)

---

## CP-12: Settings and Account Management

**Priority:** Major Path
**Automated Coverage:** E2E (`settings.spec.ts`)

### Test Steps

| Step | Action | Expected Result |
|---|---|---|
| 1 | Navigate to Settings | Settings page loads, shows profile, accounts, language toggle |
| 2 | Edit profile name | Name updated in header and sidebar |
| 3 | Switch language between DE and EN | All visible text updates accordingly |
| 4 | Create a second account | New account appears in account switcher |
| 5 | Switch between accounts | Data isolation: each account shows only its own transactions |
| 6 | Delete an account | Confirmation dialog; after confirmation, account removed, remaining account shows |
| 7 | Export data | Downloaded JSON file contains all transactions |
| 8 | Reset app (clear all data) | Returns to onboarding screen |
| 9 | Submit feedback | `POST /v1/feedback` returns 200; feedback stored on server |

---

## CP-13: Offline Resilience

**Priority:** Major Path
**Automated Coverage:** E2E (`cross-cutting.spec.ts`), integration (none)

### Test Steps

| Step | Action | Expected Result |
|---|---|---|
| 1 | While online, verify app functions normally | All features work |
| 2 | Disable network (simulated via DevTools > Offline, or airplane mode) | App continues to function for local operations (add/edit/delete transactions, categories, limits) |
| 3 | Add transactions while offline | Transactions saved locally, sync indicator shows offline |
| 4 | Re-enable network | Sync indicator transitions: OFFLINE -> SYNCING -> SYNCED |
| 5 | Verify offline changes were synced | Remote data matches local data |

---

## CP-14: Data Export/Import

**Priority:** Minor Path
**Automated Coverage:** E2E (`settings.spec.ts`), integration (`exportService.integration.test.ts`)

### Test Steps

| Step | Action | Expected Result |
|---|---|---|
| 1 | Navigate to Settings | Settings page visible |
| 2 | Tap "Export Data" | JSON file downloaded with all account data |
| 3 | Verify exported JSON structure | Contains transactions, categories, limits, savings goals, recurring items |
| 4 | Reset app, then import the exported file | All data restored from the exported file |

---

## CP-15: Migration (Legacy Data)

**Priority:** Minor Path (conditionally Major if legacy users exist)
**Automated Coverage:** E2E (none), integration (`migration.integration.test.tsx`, `MigrationBanner.integration.test.tsx`, `SettingsMigrationCTA.integration.test.tsx`)

### Test Steps

| Step | Action | Expected Result |
|---|---|---|
| 1 | Navigate to Settings > Migration, or follow migration banner | Migration page loads |
| 2 | Select "Import from file" | File picker opens |
| 3 | Select a valid legacy JSON export file | Data transformed and imported |
| 4 | Verify imported data | Transactions, categories, and balances match the legacy data |
| 5 | Verify GDPR data clearing | Legacy credentials and personal data removed after successful migration |

---

## Test Coverage Matrix

### Automated Tests

| Flow | Integration Tests | E2E Tests (Playwright) | API/Gate Tests |
|---|---|---|---|
| CP-1 Registration (magic link) | -- | `onboarding.spec.ts` | -- |
| CP-2 Registration (OTP) | -- | `onboarding.spec.ts` | -- |
| CP-3 Account Recovery | `recovery.integration.test.tsx` | -- | -- |
| CP-4 Transactions | `TransactionForm.integration.test.tsx` | `transactions.spec.ts` | -- |
| CP-5 Categories & Limits | `Categories`, `LimitForm`, `useLimit*` | `categories.spec.ts`, `limits.spec.ts` | -- |
| CP-6 Savings Goals | `SavingsGoals`, `SavingsGoalForm`, `useSavingsGoalValidation` | `savings-goals.spec.ts` | -- |
| CP-7 Recurring | -- | `recurring.spec.ts` | -- |
| CP-8 Templates | `TemplateForm.integration.test.tsx` | `templates.spec.ts` | -- |
| CP-9 Statistics | `Statistics.integration.test.tsx` | `statistics.spec.ts` | -- |
| CP-10 Online Sync | -- | -- | -- |
| CP-11 Sharing & Key Delivery | -- | -- | `gate3-invite-accept-key-delivery.mjs` |
| CP-12 Settings & Accounts | `BudgetContext.integration.test.tsx` | `settings.spec.ts` | -- |
| CP-13 Offline Resilience | -- | `cross-cutting.spec.ts` | -- |
| CP-14 Export/Import | `exportService.integration.test.ts` | `settings.spec.ts` | -- |
| CP-15 Migration | `migration.integration.test.tsx`, `MigrationBanner`, `SettingsMigrationCTA` | -- | -- |

### Manual Test Gaps (No Automated Coverage)

These flows require manual testing in deployed environments because they depend on external services or cross-device scenarios that are difficult to automate:

| Flow | Why Manual | Risk |
|---|---|---|
| CP-1 Step 4-5 | Email delivery (Brevo) and magic link deep linking require a real email client and browser | High - registration is the front door |
| CP-3 Full recovery | Requires a previously saved recovery code and OTP email delivery | High - users who lose access need this |
| CP-10 Online sync | Requires two browser sessions or two devices, and real server communication | High - sync is the core value of online accounts |
| CP-11 Sharing | Requires two registered users, email delivery, and real-time key delivery | High - sharing is the core value of online accounts |
| CP-13 Offline | Requires network interruption, not simulatable in CI | Medium - PWA must work offline |

---

## Pre-Deployment Sign-Off Checklist

Use this checklist before promoting any build to a new environment.

### Build Verification

- [ ] Docker images built and pushed to ECR
- [ ] Terraform image tags updated to new build
- [ ] CI pipeline passes (lint, typecheck, unit tests, integration tests)
- [ ] E2E tests pass against local dev server

### Infrastructure Verification

- [ ] Both ECS tasks healthy (main server + recovery server)
- [ ] RDS databases accessible from ECS tasks
- [ ] `CORS_ORIGIN` environment variable set to correct PWA domain
- [ ] `_headers` file in PWA deployment contains correct CSP (including `wasm-unsafe-eval` and API `connect-src` origins)
- [ ] Brevo API key is set in AWS Secrets Manager (not `REPLACE_ME`)
- [ ] Email pepper and magic link secrets are unique per environment
- [ ] SSL/TLS certificates valid for all domains

### Critical Path Smoke Test

- [ ] CP-1: Registration via magic link completes successfully
- [ ] CP-3: Account recovery completes successfully
- [ ] CP-4: Transactions can be created, edited, and deleted
- [ ] CP-10: Sync push and pull works for online accounts
- [ ] CP-11: Inviting a new member and key delivery works end-to-end

---

## Appendix A: Test Data Templates

### Test User Registration

When testing registration, use a pattern that identifies the test run:

```
budgetwise-test+<timestamp>@<your-domain>
```

Example: `budgetwise-test+20260624@example.com`

### Recovery Code Storage

When testing CP-3, copy the 12-word recovery code to a text file before clearing app data. Example:

```
apple banana cherry dog elephant frog giraffe hat igloo juggle kite lemon
```

### Test Account for Sync/Sharing

Create two accounts with distinct email addresses for invite/share testing:
- Owner: `budgetwise-owner+<timestamp>@<your-domain>`
- Member: `budgetwise-member+<timestamp>@<your-domain>`

---

## Appendix B: Common Failure Patterns

| Symptom | Likely Cause | Resolution |
|---|---|---|
| Registration error: WebAssembly compile fails | CSP missing `wasm-unsafe-eval` in `script-src` | Update `_headers` file in PWA deployment, redeploy |
| Registration error: network error | CORS blocking or API unreachable | Check `CORS_ORIGIN` env var on ECS task, check `_headers` `connect-src` |
| Email not received | Brevo API key is `REPLACE_ME` or invalid | Update AWS Secrets Manager with valid key |
| Email received but link doesn't work | Deep link path incorrect for environment | Verify VITE variables and Capacitor config |
| Recovery OTP rejected | Email pepper mismatch between registration and recovery | Verify `EMAIL_PEPPER` is same for both servers |
| Recovery code fails to decrypt | Wrong code entered, or recovery envelope corrupted | Re-register and save new code |
| Sync indicator stays on ERROR | Server unreachable or session expired | Check ECS health, session token validity |
| Key delivery stuck in pending | Owner device offline after member accepts invite | Owner must come online; pending delivery retries automatically |
| Invite email not sent | Brevo sender domain not verified | Verify Brevo domain DNS records (SPF, DKIM, DMARC) |