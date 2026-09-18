# My Budget

**Expenses under control**

A Progressive Web App for personal finance management developed for **Stiftung Deutschland im Plus**, a public foundation dedicated to combating private over-indebtedness in Germany.

The app serves **36,000+ monthly active users** and has been recognized as one of the best apps of 2024 by AndroidMag and won the **2019 Smartphone App Award -- FinanzApp of the Year**.

---

## Features

- Income and expense tracking with full category management
- Category spending limits with real-time progress visualization
- Transaction templates and automated recurring transactions
- Savings goals with deadline tracking and progress monitoring
- Rich statistics and interactive data visualizations
- Multi-account support with complete data isolation
- Full offline functionality (IndexedDB + Service Worker)
- Multi-language support (German, English)
- Dark mode
- Installable as PWA, available on Google Play (Android) and the App Store (iOS)

---

## Tech Stack

| Layer          | Technology                                                  |
|----------------|-------------------------------------------------------------|
| **Framework**  | React 18 + TypeScript                                       |
| **Build**      | Vite + SWC                                                  |
| **Monorepo**   | Nx + pnpm workspaces                                        |
| **Styling**    | Tailwind CSS + Radix UI                                     |
| **State**      | React Context + IndexedDB (Dexie)                           |
| **Testing**    | Vitest + React Testing Library + Playwright + Lighthouse CI |
| **Mobile**     | Capacitor (iOS + Android)                                   |
| **CI/CD**      | GitLab CI + Fastlane                                        |
| **Hosting**    | Cloudflare Pages                                            |

---

## Prerequisites

- Node.js 24+
- pnpm 9+
- [Gitleaks](https://github.com/gitleaks/gitleaks) -- required for local secret scanning; commits are blocked without it

```bash
# macOS
brew install gitleaks

# Linux
# https://github.com/gitleaks/gitleaks/releases
```

---

## Getting Started

```bash
pnpm install
pnpm dev
```

The development server will be available at `http://localhost:5173`.

---

## Scripts

### Development

| Command                  | Description                                                            |
|--------------------------|------------------------------------------------------------------------|
| `pnpm dev`               | Start development server                                               |
| `pnpm build`             | Build for production                                                   |
| `pnpm preview`           | Preview production build                                               |
| `pnpm lint`              | Run ESLint                                                             |
| `pnpm typecheck`         | TypeScript type checking                                               |
| `pnpm test`              | Run unit tests with Vitest                                             |
| `pnpm test:ui`           | Run tests with Vitest UI                                               |
| `pnpm test:e2e`          | Run E2E smoke tests with Playwright                                    |
| `pnpm test:e2e:ui`       | Run E2E tests in interactive UI mode                                   |
| `pnpm test:e2e:report`   | Open last Playwright HTML report                                       |
| `pnpm test:lighthouse`   | Run Lighthouse audit (requires Chrome installed locally)               |
| `pnpm graph`             | View Nx dependency graph                                               |
| `pnpm knip`              | Detect unused code, dependencies and exports                           |

> E2E tests require a production build first (`pnpm build`). Playwright browsers (Chromium and WebKit) are installed automatically via `postinstall` when you run `pnpm install`. Lighthouse requires Google Chrome -- in CI, the pipeline image provides it.

### Mobile

| Command                       | Description                        |
|-------------------------------|------------------------------------|
| `pnpm exec cap sync ios`      | Sync web assets to iOS project     |
| `pnpm exec cap sync android`  | Sync web assets to Android project |

### Release

| Command              | Description                                     |
|----------------------|-------------------------------------------------|
| `pnpm release`       | Production release (from `main` or `develop`)   |
| `pnpm release:test`  | Test release from any branch (TestFlight + APK) |

See [Release Guide](docs/release-guide.md) for full details.

---

## Deployment

### PWA

Deployed to Cloudflare Pages via GitLab CI/CD:

| Branch       | Environment |
|--------------|-------------|
| `main`       | Production  |
| `develop`    | Staging     |
| MR branches  | Preview     |

### Mobile

Built and distributed via GitLab CI/CD with tag-based releases:

| Platform    | Build Tool                        | Runner          | Distribution           |
|-------------|-----------------------------------|-----------------|------------------------|
| **Android** | Capacitor + Gradle                | Linux           | Google Play Store      |
| **iOS**     | Capacitor + Xcode + Fastlane      | macOS (on-prem) | TestFlight / App Store |

---

## Test Reports

E2E and Lighthouse tests run automatically in the GitLab CI pipeline on merge requests and pushes to `develop`. Reports are collected as job artifacts and kept for 1 week.

| Report             | CI Job       | Artifact path                          | How to view                                              |
|--------------------|--------------|----------------------------------------|----------------------------------------------------------|
| Playwright HTML    | `e2e`        | `packages/app/playwright-report/`      | Download from GitLab job artifacts, open `index.html`    |
| Playwright traces  | `e2e`        | `packages/app/test-results/`           | Download and open with `pnpm exec playwright show-trace` |
| Lighthouse HTML    | `lighthouse` | `packages/app/.lighthouseci/`          | Download from GitLab job artifacts, open any `.html`     |

To access: go to the pipeline page in GitLab, click the job name, then click **Browse** or **Download** under Job Artifacts.

---

## Integration Tests

Run with `pnpm test:integration`.

Integration tests use Vitest + React Testing Library with real providers and
real Dexie writes (patched via `fake-indexeddb`). No browser required.

See [docs/integration-testing.md](docs/integration-testing.md) for the full guide.


## Code Quality

### Dead Code Detection

[Knip](https://knip.dev/) detects unused files, dependencies and exports:

```bash
pnpm knip
```

Ensure `pnpm knip` reports zero issues before submitting a merge request.

### Security

Git hooks are managed with [Husky](https://typicode.github.io/husky/) and install automatically on `pnpm install`. The pre-commit hook runs [Gitleaks](https://github.com/gitleaks/gitleaks) against staged changes to detect secrets before they enter the repository. GitLab [SAST and Secret Detection](docs/ci-security-scanning.md) provide the mandatory enforcement layer in CI.

### Troubleshooting Stale Builds

If type-checking fails with missing exports from `@budget/core`, the compiled `dist` folder may be stale:

```bash
rm -rf packages/core/dist packages/core/tsconfig.tsbuildinfo .nx
pnpm nx build core
pnpm typecheck
```

---

## Documentation

### Process

| Document                                                                    | Description                               |
|-----------------------------------------------------------------------------|-------------------------------------------|
| [Release Guide](docs/release-guide.md)                                      | Versioning, release commands and pipeline |
| [Branch & Commit Standards](docs/branch_&_commit_standards.md)              | Branching strategy and commit conventions |

### Architecture

| Document                                                                                              | Description                      |
|-------------------------------------------------------------------------------------------------------|----------------------------------|
| [Introduction and Goals](docs/architecture/01_introduction_and_goals.adoc)                           | Project vision and quality goals |
| [System Scope and Context](docs/architecture/02_system_scope_and_context.adoc)                       | System boundaries and interfaces |
| [Design Decisions](docs/architecture/03_design_decisions.adoc)                                       | Key technical decisions          |
| [Building Block View](docs/architecture/04_building_block_view.adoc)                                 | Component structure               |

### Infrastructure

| Document                                                                        | Description                              |
|---------------------------------------------------------------------------------|------------------------------------------|
| [Local Mac Runner Setup](docs/local-mac-runner-setup.md)                        | Setting up the macOS CI runner           |
| [Local Runner Setup for Build](docs/local-runner-setup-for-build.md)            | Build environment configuration          |
| [CI Security Scanning](docs/ci-security-scanning.md)                            | SAST and Secret Detection configuration  |

### Migration

| Document                                                                        | Description                              |
|---------------------------------------------------------------------------------|------------------------------------------|
| [Migration Schema JSON](packages/core/src/migration/local/migration-schema.json)                   | JSON Schema for the intermediate migration payload format |
| [Migration Schema Map](docs/migration/local_schema_map.md)                      | Table and column mappings for SQLite/Core Data to Dexie |

---

**License** -- Private &copy; Stiftung Deutschland im Plus
