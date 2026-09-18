# Regression Testing — Manual E2E Test Evidence Report: Account Switching & Sync Regression

**Ticket:** #309  
**Parent:** #300  
**Status:** Manual regression test — no product code changes  
**Date:** *(generated on run)*

---

## Summary

Regression Testing verifies that account switching, offline/online toggle, logout/re-login, and per-account online mode work correctly. These are edge cases that automated CI tests do not fully exercise.

Two manual E2E Playwright scripts and one regression checklist were created:

1. **Full regression** (`scripts/309-account-switching.spec.ts`) — Automates Steps 0, 1, 3, 4, 5, 6, 7, 9, 10, 13; requires manual intervention for email verification and recovery flow
2. **Step 15 standalone** (`scripts/309-per-account-online.spec.ts`) — Per-account online mode verification

---

## How to Run

### Automated portion (Playwright)

```bash
cd packages/app
npx playwright test scripts/309-account-switching.spec.ts --headed --project=chromium
npx playwright test scripts/309-per-account-online.spec.ts --headed --project=chromium
```

### Prerequisites

| Requirement | Details |
|---|---|
| Local Compose stack | Running with recovery server |
| Recovery server | Magic link email delivery (Brevo or local dev harness) |
| App | Running on `http://localhost:8080` |
| Browser | Chromium (headed mode recommended for manual steps) |

---

## Regression Checklist

### Step 0 — Clear state
- [ ] Clear `localStorage` and `IndexedDB` via DevTools
- [ ] Reload — app should redirect to onboarding

### Step 1 — Register new user (local/offline)
- [ ] Complete onboarding slides
- [ ] Create account named "Test User"
- [ ] App lands on dashboard
- [ ] **No sync metadata** in IndexedDB (check `SyncMetadata` table)
- [ ] Account is **offline/local only**

### Step 2 — Toggle online (provisioning)
- [ ] Go to Settings → Sharing → click Sync/Share for "Test User"
- [ ] Complete email registration flow (magic link / OTP)
- [ ] Server account is provisioned
- [ ] Sync metadata now exists in IndexedDB
- [ ] Transactions sync to server

### Step 3 — Toggle offline
- [ ] Open sidebar → toggle Offline mode ON
- [ ] Status indicator shows "Offline"
- [ ] Add a transaction (e.g. amount: 50) — saves locally
- [ ] No sync attempts visible in network tab

### Step 4 — Toggle back online
- [ ] Toggle Offline mode OFF
- [ ] Status indicator changes to "Synced"
- [ ] Previously added offline transaction syncs to server
- [ ] No data loss

### Step 5 — Create second local account
- [ ] Go to Settings → "New Account"
- [ ] Name it "Second Account"
- [ ] Account is created **offline** (no auto-provisioning)
- [ ] No sync metadata for this account

### Step 6 — Switch between accounts (data isolation)
- [ ] Switch to "Test User" → add transaction (amount: 123.45)
- [ ] Switch to "Second Account"
- [ ] Verify the 123.45 transaction is **NOT visible**
- [ ] Data does not bleed between accounts

### Step 7 — Logout (online account)
- [ ] Go to Settings → Logout
- [ ] Redirected to onboarding
- [ ] Auth data cleared from session
- [ ] localStorage `session_token` cleared

### Step 8 — Re-login via recovery
- [ ] Click "Recover" on onboarding
- [ ] Enter registered email
- [ ] Enter OTP from email
- [ ] Enter 6-word recovery code
- [ ] Account restored, lands on dashboard

### Step 9 — Verify data after re-login
- [ ] Dashboard shows previous transactions (including 123.45)
- [ ] Account name is correct ("Test User")
- [ ] Sync metadata is intact

### Step 10 — Clear storage (clean state)
- [ ] Clear `localStorage` and `IndexedDB`
- [ ] Reload — app redirects to onboarding
- [ ] No ghost sync metadata remains

### Step 11 — Stale metadata scenario (server-side)
- [ ] Delete the account from the **server database** manually
- [ ] Reload the app
- [ ] App handles 404 gracefully
- [ ] Returns to SYNCED state or prompts re-registration
- [ ] Stale metadata is cleaned up

### Step 12 — Security check
- [ ] Open DevTools → Network tab
- [ ] Verify no plaintext account keys in request payloads
- [ ] Verify no plaintext keys in `localStorage` values
- [ ] Private keys should only appear in IndexedDB (encrypted)

### Step 13 — Register, then toggle online on a different account
- [ ] Clear state and register a fresh user
- [ ] Create first account ("Primary Account") — stays offline
- [ ] Create second account ("Sync Account") — stays offline
- [ ] Toggle "Sync Account" online via Sharing Settings
- [ ] Complete email registration for "Sync Account"
- [ ] Verify "Primary Account" remains offline (no sync metadata)
- [ ] Per-account online mode is respected — only the toggled account is online

---

## Evidence Required

| Evidence | How to capture |
|---|---|
| Offline/online toggle states | Screenshots of status indicator at each toggle |
| Sync metadata state | DevTools → Application → IndexedDB → `SyncMetadata` table |
| Server DB state | SQL queries against the recovery server DB at each provisioning step |
| Data isolation | Screenshots showing transaction list per account |
| Logout/re-login | Screenshot of onboarding after logout, dashboard after re-login |
| Unexpected behavior | Notes on any race conditions, error toasts, or UI glitches |

---

## Key Files Tested

| File | Role |
|---|---|
| `BudgetContext.tsx` | Account state, sync online/offline logic, `goOnline()` |
| `AccountContext.tsx` | Auth state, login/logout, `isAuthenticated` |
| `Layout.tsx` | Offline mode toggle switch in sidebar |
| `sync-engine.ts` | Sync queue, conflict resolution, metadata management |
| `SharingSettings.tsx` | Per-account sync status, "Sync Now" / "Retry" buttons |

---

## Files Created

| File | Purpose |
|---|---|
| `scripts/309-account-switching.spec.ts` | Full regression Playwright script (automates 10/13 steps) |
| `scripts/309-per-account-online.spec.ts` | Per-account online mode standalone test |
| `docs/online-accounts/gate-account-switching-regression-report.md` | This evidence report |
