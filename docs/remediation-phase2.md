**Remediation Phase 2 (detect-and-act)**

This document explains how to run and test the Phase 2 remediation locally, and how to
control it across environments.

## How the phase is gated

Phase 2 is a **build-time** feature flag read from the Vite environment variable
`VITE_ENABLE_REMEDIATION_PHASE2`:

```ts
// packages/app/src/contexts/BudgetContext.tsx
const shouldRunPhase2 = import.meta.env.VITE_ENABLE_REMEDIATION_PHASE2 === 'true';
```

- When `VITE_ENABLE_REMEDIATION_PHASE2` is **not** exactly `'true'`, the app runs
  **Phase 1 (detect-only)**: it scans the ChangeLog, reports content-free aggregate
  stats to Sentry, and never mutates any row.
- When it **is** `'true'`, the app runs **Phase 2 (detect-and-act)**: it soft-archives
  flagged duplicate rows and appends `UPDATE_*` ChangeLog commands.

Because it is a Vite env var, the value is **baked into the static assets at build
time**. Changing it requires a rebuild + redeploy; it is not read at runtime.

## Testing locally

### Option A — Build with the flag enabled (recommended for device/QA testing)

Build the app with Phase 2 enabled, then install on the device:

```bash
# Prerequisites: Java 21 + Android SDK
export JAVA_HOME=/usr/lib/jvm/java-21-openjdk-amd64
export ANDROID_HOME=$HOME/Android/Sdk

# Build with Phase 2 enabled
VITE_ENABLE_REMEDIATION_PHASE2=true pnpm build

# Sync web assets into the native project and build the APK
npx cap sync android
cd android && ./gradlew assembleDebug

# Install on a connected device/emulator
adb install app/build/outputs/apk/debug/app-debug.apk
```

> **Important:** the remediation runs **once per device**, gated by the persisted
> `remediation_done` flag (Capacitor Preferences). If you have already run Phase 1 or
> Phase 2 on the device, you must clear app data before re-testing:
>
> ```bash
> adb shell pm list packages | grep budget   # find the package id
> adb shell pm clear <your.package.id>
> ```

### Option B — Dev-only console helpers

In a development build you can trigger Phase 2 manually from the browser/WebView console:

- `window.__runRemediationPhase2()` — runs detect-and-act and logs the result.
- `window.__purgeArchived(days)` — hard-deletes archived rows older than `days`
  (pass `0` to purge immediately for QA).

### Automated tests

- `packages/core/src/remediation/duplicate-migration-remediation.test.ts` — Phase 1
  detection logic (clustering, hybrid id + content matching, bug-window filter).
- `packages/core/src/remediation/duplicate-migration-remediation.phase2.test.ts` —
  Phase 2 detect-and-act (soft-archive + ChangeLog `UPDATE_*` + purge).

## Deployment

Phase 2 is a **staged rollout**. The intent (per the ticket) is:

1. **Ship Phase 1 first** (broadly, zero mutation risk) and let Sentry telemetry
   validate the 60-second cluster threshold.
2. **Enable Phase 2 only after** that telemetry confirms the threshold, so the
   mutation ships only once the detection is trusted.

### What to do per environment

| Environment         | `VITE_ENABLE_REMEDIATION_PHASE2` | Rationale                                                                                |
| ------------------- | -------------------------------- | ---------------------------------------------------------------------------------------- |
| Local dev / preview | `true` (or unset)                | Test the full flow; unset runs Phase 1 only.                                             |
| Staging             | `true`                           | Validate detect-and-act against real-shaped data before production.                      |
| Production          | **`false` / unset** initially    | Ship Phase 1 first; enable Phase 2 only after Phase 1 telemetry validates the threshold. |

### How to set it in CI/CD

`VITE_ENABLE_REMEDIATION_PHASE2` is a Vite env var and must be present **at build
time**. It is passed to the app build exactly like the other `VITE_*` variables in
`.gitlab-ci.yml` (see the `deploy:*` jobs, e.g. line ~1088):

```bash
VITE_API_BASE_URL="${VITE_API_BASE_URL}" \
VITE_RECOVERY_SERVER_URL="${VITE_RECOVERY_SERVER_URL}" \
VITE_EMAIL_HASH_PEPPER="${VITE_EMAIL_HASH_PEPPER}" \
VITE_ENABLE_REMEDIATION_PHASE2="${VITE_ENABLE_REMEDIATION_PHASE2}" \
pnpm --filter @budget/app run build
```

To control it per environment, define a **GitLab CI/CD variable** named
`VITE_ENABLE_REMEDIATION_PHASE2` with the appropriate scope (e.g. `true` for the
staging environment, `false`/unset for production). Because it is baked in at build
time, flipping the variable requires a rebuild + redeploy of that environment.

> **Note:** the remediation is a **silent, one-time** sweep. Once a device has run it,
> the `remediation_done` flag prevents it from ever running again — so enabling Phase 2
> in production is safe even if a user later performs a manual "Import Data" restore.

## Notes

- Phase 2 only **soft-archives**; hard-delete is controlled separately and defaults to
  a 30-day grace period (`purgeArchivedOlderThan`).
- The fix is silent by design (per customer sign-off): no user-facing toast is shown.
- **Archival is a silent, device-local operation with no audit trail**: When Phase 2
  archives a duplicate entity, it only sets the `archivedAt` field on the row. It does
  **not** emit ChangeLog commands (UPDATE_*) or any other audit entries. This is a
  conscious design choice to keep the fix completely silent and avoid cross-device
  propagation of the remediation actions. The trade-offs are:
  - **Pros**: No risk of cross-device data loss; the fix is truly local and invisible
    to other devices; no sync noise from remediation actions.
  - **Cons**: No audit trail for support/telemetry to see which entities were archived;
    if a scan is capped and re-evaluated later, the same entities may be re-flagged
    (though archival is idempotent, so re-flagging is harmless).
- The `archivedAt` field itself serves as the only record that an entity was archived
  by the remediation. Support can query the database directly to see archived rows if
  needed for debugging.
- **Remediation state is device-local**: The `remediation_done` and `remediation_in_progress`
  flags are stored in Capacitor Preferences, which never syncs across devices. This is a
  conscious design choice for per-device independence:
  - **Pros**: Each device runs the remediation independently based on its own data state;
    no risk of one device's remediation affecting another device's data; fresh reinstalls
    get a clean slate and run the sweep based on their current data.
  - **Cons**: A second device or fresh reinstall will run the sweep independently (even
    if another device already ran it); there is no central record of which devices have
    completed the remediation or what was archived.
  - This aligns with the #462 requirement that the fix should be device-local and not
    interfere with data on other devices.
- **In-progress flag has staleness recovery**: The `remediation_in_progress` flag includes
  a timestamp-based timeout (1 hour) to handle crashes or OS kills during remediation.
  If the flag is older than the timeout, it's treated as stale and automatically cleared,
  allowing remediation to retry on the next app launch. This prevents the flag from
  permanently blocking remediation on devices that crash mid-sweep.
- **Intra-cluster duplicates are not detected**: The remediation requires 2+ post-bug
  clusters to detect duplicates (cross-cluster detection). If a user manually re-imports
  the same data twice within the 60-second `CLUSTER_GAP_MS` window, both copies coalesce
  into a single cluster and are skipped. This is a known limitation and is **out of scope**
  for #462, which targets the migration bug where `importEntity()` is sequential and
  bursts are sub-second. Manual double imports within a minute are an edge case that
  would require intra-cluster duplicate detection (same entity twice in one burst),
  which adds complexity for a scenario outside the primary use case.
- **Duplicate detection uses content-hash only**: The remediation detects duplicates
  by comparing content fingerprints (contentHash), not by entity ID (idHash). This is
  because two ChangeLog records with the same `entityId` can only represent one physical
  row due to Dexie's primary-key uniqueness and the `importEntity()` existence check.
  Matching by `idHash` would incorrectly archive the user's only copy of a row if it
  ever matched (e.g., via sync-replayed commands). The content-hash approach detects
  true duplicates with divergent IDs (the pre-#470 migration bug scenario), which is
  the primary use case for #462.
