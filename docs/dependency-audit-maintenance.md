# Dependency Audit Maintenance Guide

## How vulnerabilities are monitored

Two CI jobs scan for dependency vulnerabilities automatically:

| Job | Runs on | What it scans |
|-----|---------|---------------|
| `dependency-audit` | Every MR + develop push | `pnpm audit --audit-level=high` -- direct and transitive npm deps |
| `trivy-scan` | develop push + release tags | Full filesystem scan -- catches issues pnpm audit may miss |

Both jobs start as `allow_failure: true` (warning, not blocking). When all findings are resolved, promote to `allow_failure: false` to make them blocking gates.

---

## Triaging a new vulnerability

When the pipeline flags a new finding:

### 1. Check if a parent package update fixes it

```bash
# See which parent packages have newer versions
pnpm outdated

# Check what pulls in the vulnerable package
pnpm why <vulnerable-package>
```

If the parent has a patch/minor update available, update it:

```bash
pnpm update <parent-package>
pnpm audit --audit-level=high  # verify it resolved
```

Parent updates are always preferred over overrides because they resolve the dependency tree naturally.

### 2. Apply an override (last resort)

If the parent package has not released a fix, force the transitive dependency to a patched version using `pnpm.overrides` in the root `package.json`:

```json
"pnpm": {
  "overrides": {
    "<package>@<vulnerable-range>": "<patched-version>"
  }
}
```

**Rules for overrides:**
- Only override **patch or minor** version bumps (e.g., 3.1.2 -> 3.1.4, 5.1.6 -> 5.1.8)
- Never override **major** version jumps (e.g., 6.x -> 7.x) -- these can break the parent package
- Run `pnpm install` after adding an override to regenerate the lockfile
- Run `pnpm test` and `pnpm build` to verify nothing broke

### 3. Document what cannot be overridden

If a vulnerability requires a major version jump, document it in the "Pending upstream updates" section below and wait for the parent package to release a compatible update.

---

## Removing an override

When a parent package releases an update that includes the fix:

```bash
# Update the parent
pnpm update <parent-package>

# Verify the vulnerability is gone
pnpm audit --audit-level=high

# If resolved, remove the override from package.json
# Then regenerate the lockfile
pnpm install
```

---

## Promoting the CI job to blocking

When `pnpm audit --audit-level=high` returns **0 high/critical findings**:

1. Edit `.gitlab-ci.yml`
2. Find the `dependency-audit` job
3. Change `allow_failure: true` to `allow_failure: false`
4. Do the same for `trivy-scan` if its report is also clean

This makes the jobs blocking -- MRs with new vulnerabilities will fail the pipeline.

---

## Current overrides (as of 2026-03-16)

Applied in root `package.json` under `pnpm.overrides`:

| Override | Patched to | Parent package |
|----------|-----------|----------------|
| `minimatch@<3.1.4` | 3.1.4 | `eslint` via `@nx/eslint` |
| `minimatch@>=5.0.0 <5.1.8` | 5.1.8 | `@nx/devkit` via `ejs > jake > filelist` |
| `minimatch@>=9.0.0 <9.0.7` | 9.0.7 | `@nx/devkit`, `nx` |
| `minimatch@>=10.0.0 <10.2.3` | 10.2.3 | `@capacitor/cli` via `rimraf > glob` |
| `basic-ftp@<5.2.0` | 5.2.0 | `release-it`, `@lhci/cli` via `proxy-agent` |
| `axios@>=1.0.0 <=1.13.4` | 1.13.6 | `nx` |
| `@isaacs/brace-expansion@<=5.0.0` | 5.0.1 | `@capacitor/cli` via `rimraf > glob > minimatch` |

---

## Pending upstream updates

These vulnerabilities require major version jumps and cannot be safely overridden:

| Package | Current | Needs | Resolves when |
|---------|---------|-------|---------------|
| `tar@6.2.1` | 6.x | >=7.5.11 | `@capacitor/cli` updates (8.2.0+ may help) |
| `rollup@4.55.1` | 4.55.1 | >=4.59.0 | `vite` patches 5.x or project upgrades to 6.x+ |
| `serialize-javascript@6.0.2` | 6.x | >=7.0.3 | `vite-plugin-pwa` updates `workbox-build` |

Check periodically with:

```bash
pnpm outdated @capacitor/cli vite vite-plugin-pwa
```
