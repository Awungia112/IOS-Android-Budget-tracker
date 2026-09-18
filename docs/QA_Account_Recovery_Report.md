# QA Report: Account Recovery UI Flow

**Feature**: Client-side Account Recovery (UI-only Deliverable)
**Ticket**: OA-201 / Account Recovery UI flow
**Status**: Ready for Review ✅
**Environment**: Local / Dev Server (`port 8081`)
**Date**: 2026-05-26

## Overview
This report documents the manual verification of the Account Recovery UI flow. The implementation focuses on user-facing screens and navigation, utilizing mock logic for cryptographic operations and API calls.

## Testing Guidance for Reviewers

### Prerequisites
1. Ensure the dev server is running (`npm run dev`).
2. Go to `http://localhost:8081/onboarding`.
3. If you are already logged in, go to **Settings > Reset App** to return to the Onboarding start.

### Mock Data for Manual Testing
| Field | Value | Purpose |
| :--- | :--- | :--- |
| Email | `tester@example.com` (or any valid email) | Starts recovery flow |
| **Success OTP** | **`654321`** | Navigates to Recovery Code screen |
| Failure OTP | `123456` (or any other 6 digits) | Triggers error state & shakes UI |
| Recovery Code | Any 6 words | Mock restoration trigger |


### Test Scenario: Successful Recovery
| Step | Action | Expected Behavior | Status |
| :--- | :--- | :--- | :--- |
| 1 | Click **"Recover existing account"** on the first onboarding slide. | Navigates to the "Account Recovery" (email entry) page. | PASS |
| 2 | Observe the **Security Warning Alert**. | A yellow alert box explaining the need for both Email and Recovery Code is visible. | PASS |
| 3 | Enter any valid email (e.g., `tester@example.com`) and click **Continue**. | A loading spinner appears, then navigates to the "Security Verification" (OTP) page. | PASS |
| 4 | Enter the mock success code: **`654321`**. | The code auto-submits on the 6th digit. On success, it navigates to "Enter Recovery Code". | PASS |
| 5 | Fill in any text in the **6 word inputs**. | Button becomes active; layout remains stable on mobile view. | PASS |
| 6 | Click the **"Retry"** (Restore) button. | UI transitions to the "Restoring your data..." progress state. | PASS |
| 7 | Wait for the progress bar to complete (approx. 5s). | Shows "Success!" checkmark screen with a smooth transition. | PASS |
| 8 | Wait for the success screen to finish automatically. | **Verified**: Redirects immediately to the **Dashboard (Overview)** page. | PASS |

### Test Scenario: Invalid OTP
| Step | Action | Expected Behavior | Status |
| :--- | :--- | :--- | :--- |
| 1 | On the OTP screen, enter an incorrect code (e.g., `123456`). | Inputs shake, a red error toast appears showing remaining attempts, and inputs are cleared. | PASS |

### Localization Check
- Switch language to **Deutsch (DE)** via the toggle in the header.
- Verify all labels, warnings, and buttons translate correctly to German.
- **Result**: All strings are correctly localized in `en.json` and `de.json`.

## Verification Evidence

### Automated Integration Test
A full integration test covers the end-to-end flow, asserting on correct navigation and state updates.

**Command:**
```bash
npm run test:integration -- packages/app/src/__integration__tests__/pages/recovery.integration.test.tsx
```

**Result:**
```text
 ✓ packages/app/src/__integration__tests__/pages/recovery.integration.test.tsx (1)
   ✓ Account Recovery Integrated UI Flow (1)
     ✓ completes the full recovery flow successfully
```

## Reviewer Notes
- **Mock Logic**: The `654321` OTP code is hardcoded for testing purposes in the mock API handler.
- **Redirection**: Authentication state is updated via `AccountContext` to ensure the user is logged in upon successful recovery completion.
- **UI/UX**: Smooth transitions and loading states implemented to provide a premium feel.

