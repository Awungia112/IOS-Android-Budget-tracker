# Branch & Commit Standards

this defines the version control standards for the **Budget Wise PWA** codebase. These guidelines are designed to ensure consistency, traceability, high code quality, and safe continuous delivery across all teams and contributors.

Adherence to this document is **mandatory** for all repositories under the Budget Wise organization.

---

## Branching Strategy

**Workflow Model:** GitHub Flow with Staging

A hybrid branching model combining GitHub Flow simplicity with a staging environment for pre-production validation. This approach ensures safe continuous delivery while providing a dedicated environment for integration testing before production releases.

### Branch Structure

> Reference: [Version Policy Diagram](architecture/budget-wise-version-policy.png)


### Branch Types

| Branch     | Pattern                           | Description                                           |
| ---------- | --------------------------------- | ----------------------------------------------------- |
| `main`     | `main`                            | Production-ready code. Always deployable.             |
| `develop`  | `develop`                         | Integration branch. Deployed to staging environment.  |
| `feature`  | `feature/<ticket>-<description>`  | New user-facing or internal functionality             |
| `bugfix`   | `bugfix/<ticket>-<description>`   | Non-critical defect fixes                             |
| `refactor` | `refactor/<ticket>-<description>` | Code structure or maintainability improvements        |
| `hotfix`   | `hotfix/<description>`            | Critical production fixes requiring immediate release |


## Branch Naming Conventions

### Format

```
<type>/<ticket-number>-<short-description>
```

### Rules

1. Use **lowercase** characters only
2. Separate words using **hyphens** (`-`)
3. Include the associated ticket or task identifier
4. Keep descriptions concise (3–5 words)
5. Avoid ambiguous or generic names

### Examples

```
refactor/025-budget-context-cleanup
hotfix/critical-db-connection
```

---

## Commit Message Standards

**Specification:** Conventional Commits v1.0.0

All commits must follow the Conventional Commits specification to enable automated changelogs, semantic versioning, and traceable history.

### Commit Format

```
<type>(<scope>): <subject>

[optional body]

[optional footer]
```

### Commit Types

| Type       | Description                                           |
| ---------- | ----------------------------------------------------- |
| `feat`     | Introduces a new feature                              |
| `fix`      | Fixes a bug                                           |
| `refactor` | Code changes that neither fix a bug nor add a feature |
| `docs`     | Documentation-only changes                            |
| `style`    | Formatting changes (no logic impact)                  |
| `test`     | Adds or updates tests                                 |
| `chore`    | Maintenance tasks                                     |
| `ci`       | CI/CD configuration changes                           |
| `perf`     | Performance improvements                              |
| `build`    | Build system or tooling changes                       |

### Scopes

Scopes should reflect the logical ownership of the change.

| Scope  | Area                            |
| ------ | ------------------------------- |
| `core` | Shared business logic           |
| `app`  | Application layer               |
| `db`   | Database and persistence        |
| `ui`   | UI components and design system |
| `ci`   | CI/CD pipeline                  |
| `deps` | Dependency management           |

### Commit Rules

1. Use the **imperative mood** (e.g., "add", not "added")
2. Subject line must be **lowercase**
3. Do **not** end the subject with a period
4. Subject length must not exceed **50 characters**
5. Commits must represent a **single logical change**

### Examples

```
feat(core): add transaction repository

fix(app): resolve date formatting in statistics

refactor(core): extract types into shared module

docs: update README with nx commands

chore(deps): bump vite to v5.4.2

ci: add nx affected to pipeline
```

### Breaking Changes

Breaking changes must be explicitly declared.

```
feat(core)!: change repository method signatures

BREAKING CHANGE: getAll() now requires an accountId parameter
```

---

## Development Workflow

### 1. Create a Branch

Always branch from the latest `develop`.

```bash
git checkout develop
git pull origin develop
git checkout -b feature/004-extract-transaction-types
```

### 2. Develop and Commit

Commit frequently with meaningful, atomic commits.

```bash
git add .
git commit -m "feat(core): add transaction type definitions"
git push -u origin feature/004-extract-transaction-types
```

### 3. Open a Pull Request to Develop

* Target branch: `develop`
* Complete the pull request template
* Request at least one reviewer
* Ensure all CI checks pass

### 4. Review and Merge to Develop

* Address all review feedback
* Obtain required approvals
* Ensure CI is green
* Squash or rebase if required
* Merge into `develop`
* Delete the source branch
* Verify on staging environment

### 5. Promote to Production

When `develop` is stable and ready for release:

* Create a pull request from `develop` to `main`
* Obtain approval
* Merge into `main`
* Production deployment triggers automatically

---

## Release & Versioning

### Versioning Strategy

**Standard:** Semantic Versioning (SemVer)

```
MAJOR.MINOR.PATCH

1.0.0 → Initial release
1.1.0 → Backward-compatible feature
1.1.1 → Bug fix
2.0.0 → Breaking change
```

### Creating a Release

Releases are created using annotated Git tags on `main`.

```bash
git checkout main
git pull origin main
git tag -a v1.0.0 -m "Release v1.0.0"
git push origin v1.0.0
```

### App Store Release Flow

1. Features merged into `develop` → Deploy to staging
2. QA verification on staging environment
3. Merge `develop` into `main` → Deploy to production
4. Production verification
5. Create a version tag (`vX.Y.Z`)
6. Generate store artifacts via PWABuilder
7. Submit to Google Play and Apple App Store

### Hotfix Workflow

> Reference: [Hotfix Flow Diagram](architecture/budget-wise-hotfix.png)

For critical production issues that cannot wait for the normal flow:

```bash
git checkout main
git checkout -b hotfix/critical-fix
git commit -m "fix(core): resolve critical database issue"
# Open PR to main → Review → Merge
git tag -a v1.0.1 -m "Hotfix v1.0.1"
git push origin v1.0.1
# Back-merge hotfix to develop
git checkout develop
git merge main
git push origin develop
```

---

## Code Review Standards

### Pre-Review Checklist

* [ ] Commits follow Conventional Commits
* [ ] CI pipeline passes
* [ ] Self-review completed
* [ ] No debug code or commented-out logic
* [ ] Tests added or updated where applicable

### Pull Request Template

```markdown
## Summary
Brief description of the change.

## Ticket
TICKET-XXX

## Changes
- Description of change 1
- Description of change 2

## Testing
- [ ] Tested locally
- [ ] Edge cases covered
```

---

## Environments

| Trigger          | Environment                  |
| ---------------- | ---------------------------- |
| Pull request     | Preview / Review environment |
| `develop` branch | Staging                      |
| `main` branch    | Production                   |
| `v*` tag         | App store build              |

---

## Summary

| Category        | Standard                                     |
| --------------- | -------------------------------------------- |
| Branching model | GitHub Flow with Staging                     |
| Default branch  | `develop` (integration), `main` (production) |
| Branch naming   | `<type>/<ticket>-<description>`              |
| Commit messages | Conventional Commits                         |
| Versioning      | Semantic Versioning                          |
| Code reviews    | Required for all merges                      |
