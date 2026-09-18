# Release Guide

This document describes the versioning and release management process for the Budget Wise PWA monorepo.

---

## Overview

The project uses [release-it](https://github.com/release-it/release-it) for automated versioning and releases. There are two release workflows:

| Workflow | Command | Branch | What It Does |
|----------|---------|--------|-------------|
| **Production Release** | `pnpm release` | `main` or `develop` | Bumps version, generates changelog, creates git tag, creates GitLab release, triggers full CI pipeline |
| **Dry Run** | `pnpm release:dry` | `main` or `develop` | Previews what a production release would do without executing anything |
| **Test Release** | `pnpm release:test` | Any branch | Creates a timestamped test tag, triggers CI build + TestFlight upload. No version bump. |

---

## Production Release

### Prerequisites

- You must be on `main` or `develop` branch
- Working directory must be clean (no uncommitted changes)
- You must have push access to the GitLab repository

### Steps

```bash
# 1. Ensure you are on main or develop
git checkout develop

# 2. Pull latest changes
git pull origin develop

# 3. Run the release
pnpm release
```

### What Happens

release-it will interactively guide you through the process:

1. **Determines version bump** from [Conventional Commits](https://www.conventionalcommits.org/) since the last tag:
   - `fix:` commits trigger a **patch** bump (e.g., `3.3.0` -> `3.3.1`)
   - `feat:` commits trigger a **minor** bump (e.g., `3.3.0` -> `3.4.0`)
   - `BREAKING CHANGE:` triggers a **major** bump (e.g., `3.3.0` -> `4.0.0`)
   - You can override the suggested bump interactively

2. **Syncs version** across all monorepo files (via `sync-versions.sh`):
   - `package.json` (root) — already bumped by release-it
   - `packages/app/package.json`
   - `packages/core/package.json`
   - `android/app/build.gradle` (`versionName` + auto-incremented `versionCode` fallbacks)

   Note: The iOS `MARKETING_VERSION` is not synced to source — it is injected at CI build time by Fastlane using the git tag. This prevents stale hardcoded values from reaching the store.

3. **Generates changelog** in `CHANGELOG.md` from commit history

4. **Commits** all changes with message `chore(release): v3.4.0`

5. **Creates git tag** `v3.4.0`

6. **Pushes** commit and tag to GitLab

7. **Creates GitLab Release** with the changelog as the release description

8. **CI pipeline triggers** automatically:
   - `build:mobile` — builds the PWA
   - `package:android` — creates debug APK
   - `package:ios` — creates signed .ipa and uploads to TestFlight
   - `deploy:android:internal` — uploads to Google Play internal testing
   - `deploy:ios:production` — manual trigger to submit to App Store
   - `release` — creates GitLab release entry

### Dry Run (Preview Without Executing)

To see what a release would do without making any changes:

```bash
pnpm release:dry
```

> **Warning:** Do NOT use `pnpm release -- --dry-run`. The `--` separator causes pnpm to pass a literal `--` to release-it, which makes it interpret `--dry-run` as a version string instead of a flag. This will execute a real release. Always use the dedicated `pnpm release:dry` script instead.

### Explicit Version Bump

To bypass the interactive prompt and specify the bump type directly:

```bash
pnpm exec release-it patch    # 3.3.0 -> 3.3.1
pnpm exec release-it minor    # 3.3.0 -> 3.4.0
pnpm exec release-it major    # 3.3.0 -> 4.0.0
```

### CI-Only Release (Non-Interactive)

For automated releases in CI pipelines:

```bash
pnpm exec release-it --ci
```

---

## Test Release

Test releases allow you to build and deploy to TestFlight from any branch without bumping the version. Use this when you need to test a fix or feature on a real device before merging.

### Steps

```bash
# From any branch (feature, develop, main, etc.)
pnpm release:test
```

### What Happens

1. Reads the current version from `package.json` (e.g., `3.3.0`)
2. Creates a timestamped tag: `v3.3.0-test.20260223143000`
3. Pushes the tag to GitLab
4. CI pipeline triggers:
   - `build:mobile` — builds the PWA
   - `package:android` — creates debug APK (CI artifact)
   - `package:ios:simulator` — builds simulator .app (CI artifact)
   - `package:ios` — creates signed .ipa and uploads to TestFlight

### Key Points

- No version bump occurs — source files are not modified
- No changelog is generated
- No GitLab release is created
- Multiple developers can create test releases from different branches without conflicts (timestamp suffix prevents tag collisions)
- Test releases do **not** trigger store deployments (Google Play, App Store)

---

## Commit Message Convention

This project uses [Conventional Commits](https://www.conventionalcommits.org/). The commit message format directly determines the version bump type and changelog content.

### Format

```
<type>(<scope>): <description>

[optional body]

[optional footer(s)]
```

### Types

| Type | Description | Version Bump |
|------|------------|-------------|
| `feat` | New feature | Minor |
| `fix` | Bug fix | Patch |
| `docs` | Documentation only | None |
| `style` | Code style (formatting, whitespace) | None |
| `refactor` | Code change that neither fixes a bug nor adds a feature | None |
| `perf` | Performance improvement | Patch |
| `test` | Adding or correcting tests | None |
| `chore` | Build process, tooling, dependencies | None |

### Examples

```bash
# Patch release (3.3.0 -> 3.3.1)
git commit -m "fix: bottom navbar clipped by device safe area"

# Minor release (3.3.0 -> 3.4.0)
git commit -m "feat(ui): add dark mode support to settings page"

# Major release (3.3.0 -> 4.0.0)
git commit -m "feat!: redesign authentication flow

BREAKING CHANGE: removed password-based login in favor of keypair authentication"
```

---

## Version Files

The version is maintained in sync across these files:

| File | Field | Example | Synced by |
|------|-------|---------|-----------|
| `package.json` (root) | `version` | `"3.11.0"` | release-it (source of truth) |
| `packages/app/package.json` | `version` | `"3.11.0"` | `sync-versions.sh` (after:bump hook) |
| `packages/core/package.json` | `version` | `"3.11.0"` | `sync-versions.sh` (after:bump hook) |
| `android/app/build.gradle` | `versionName` (fallback) | `"3.11.0"` | `sync-versions.sh` (after:bump hook) |
| `android/app/build.gradle` | `versionCode` (fallback) | `149` | `sync-versions.sh` (auto-incremented) |
| iOS `project.pbxproj` | `MARKETING_VERSION` | `1.0` (hardcoded fallback) | Overridden at CI build time by Fastlane via `CI_COMMIT_TAG` |

The `scripts/sync-versions.sh` script handles synchronization of package.json files and gradle fallbacks automatically during releases. Never update these files manually — let release-it manage them.

### Platform Version Overrides at CI Build Time

The fallback values in source files are used for local development builds. For store submissions, CI overrides them with the git tag version:

| Platform | Field | CI source | Mechanism |
|----------|-------|-----------|-----------|
| Android | `versionName` | `CI_COMMIT_TAG` (stripped of `v`) | `-PVERSION_NAME="$VERSION_NAME"` passed to `gradlew` |
| Android | `versionCode` | `VERSION_CODE_OFFSET + CI_PIPELINE_IID` | `-PVERSION_CODE="$VERSION_CODE"` passed to `gradlew` |
| iOS | `MARKETING_VERSION` | `CI_COMMIT_TAG` (stripped of `v`) | `MARKETING_VERSION=#{version}` passed via Fastlane `xcargs` |
| iOS | `CURRENT_PROJECT_VERSION` | `CI_PIPELINE_IID` | Fastlane `increment_build_number` |

The `VERSION_CODE_OFFSET` CI variable (set in GitLab CI/CD settings) ensures the Android `versionCode` always exceeds the live app's code. Currently set to `1000000`.

### App Version Display

The app version displayed in the UI is injected at build time via Vite:

```typescript
// packages/app/vite.config.ts
define: {
  APP_VERSION: JSON.stringify(process.env.npm_package_version || '0.0.1'),
}
```

This reads from `packages/app/package.json`, which is synced during releases.

---

## Release Flow Diagram

```
Feature Branch:
  feature/xyz --> commit --> push --> MR
                                      |
                          (optional) pnpm release:test
                                      |
                                v3.3.0-test.20260223143000
                                      |
                              CI: APK + simulator + TestFlight
                              (no version bump, no store deploy)

Merge to develop:
  develop --> pnpm release
                |
        1. Bump version (3.3.0 -> 3.4.0)
        2. Sync all package.json + build.gradle fallbacks
        3. Generate CHANGELOG.md
        4. Commit "chore(release): v3.4.0"
        5. Tag v3.4.0
        6. Push to GitLab
        7. Create GitLab Release
                |
        CI pipeline (tag v3.4.0):
                |
        ├── build:mobile → PWA (APP_VERSION from package.json)
        │
        ├── package:android → AAB
        │     versionName = "3.4.0"        (from CI_COMMIT_TAG)
        │     versionCode = 1000000 + IID   (VERSION_CODE_OFFSET + CI_PIPELINE_IID)
        │
        ├── package:ios → IPA → TestFlight
        │     MARKETING_VERSION = "3.4.0"   (from CI_COMMIT_TAG, injected via Fastlane xcargs)
        │     CURRENT_PROJECT_VERSION = IID (from CI_PIPELINE_IID, via increment_build_number)
        │
        ├── deploy:android:internal → Google Play internal testing
        ├── deploy:ios:production → App Store (manual trigger)
        └── release → GitLab Release entry
```

---

## Pre-Release Checklist

Before running a production release, verify:

- [ ] Current live iOS version (`CFBundleShortVersionString`) is documented (check App Store Connect)
- [ ] Current live Android `versionCode` is documented (check Play Console)
- [ ] Next release version exceeds both live versions (iOS: `MARKETING_VERSION` > live, Android: `OFFSET + IID` > live `versionCode`)
- [ ] `VERSION_CODE_OFFSET` CI variable is set in GitLab (current value: `1000000`)
- [ ] Working directory is clean (no uncommitted changes)
- [ ] On `main` or `develop` branch

> **Note on iOS version numbering:** The `MARKETING_VERSION` is injected from `CI_COMMIT_TAG` at CI build time. If the live App Store version exceeds the monorepo version (e.g., live iOS is `4.0.9` but monorepo is `3.x`), you must bump the monorepo to a higher version or the submission will be rejected.

---

## Configuration Reference

### `.release-it.json`

| Setting | Value | Purpose |
|---------|-------|---------|
| `git.tagName` | `v${version}` | Tag format (e.g., `v3.4.0`) |
| `git.commitMessage` | `chore(release): v${version}` | Release commit message |
| `git.requireBranch` | `["main", "develop"]` | Allowed branches for production releases |
| `git.requireCleanWorkingDir` | `true` | Prevents dirty releases |
| `gitlab.release` | `false` | Disabled — CI pipeline handles GitLab Release creation |
| `npm.publish` | `false` | Disabled (private project) |
| `plugins` | `@release-it/conventional-changelog` | Generates changelog from commits |
| `hooks.before:init` | `git fetch --prune --prune-tags origin` | Prevents stale tag errors |
| `hooks.after:bump` | `bash scripts/sync-versions.sh` | Syncs version across monorepo |

### CI Tag Patterns

| Pattern | Matches | Triggers |
|---------|---------|----------|
| `v3.4.0` | Release tag | Full pipeline (build + package + deploy) |
| `v3.3.0-test.20260223143000` | Test tag | Build + package + TestFlight (no store deploy) |

---

## Authentication

Both release workflows (`pnpm release` and `pnpm release:test`) use standard git operations only — pushing commits and tags. If you can `git push` to the repository, you have all the access needed. No additional tokens or API keys are required.

GitLab Release entries are created automatically by the CI pipeline when it detects a release tag.

---

## Troubleshooting

### "Must be on branch main,develop"

You are trying to run `pnpm release` from a feature branch. Production releases are restricted to `main` and `develop`. Use `pnpm release:test` for feature branch testing.


### "Tag already exists"

The `before:init` hook runs `git fetch --prune --prune-tags origin` to prevent this. If it still occurs, manually delete the conflicting tag:

```bash
git tag -d v3.4.0
git push origin :refs/tags/v3.4.0
```

### Version mismatch across files

If versions get out of sync (e.g., after a failed release), run the sync script manually:

```bash
bash scripts/sync-versions.sh
```

This reads the version from the root `package.json` and updates all other files to match. Review and commit the changes manually.

### Dry run (preview without executing)

Always use the dedicated script:

```bash
pnpm release:dry
```

> **Warning:** Never use `pnpm release -- --dry-run` — this executes a real release due to pnpm passing `--` as a literal argument to release-it.
