# CI Security Scanning

Every merge request and branch push runs two security jobs in the `security` pipeline stage, after `quality` and before `build`.

## Jobs

| Job | Analyzer | What it catches |
|---|---|---|
| `semgrep-sast` | Semgrep (GitLab managed) | Code-level vulnerabilities: injection, unsafe regex, hardcoded credentials, insecure randomness |
| `secret_detection` | GitLab managed | API keys, tokens, SSH keys, JWT secrets, database connection strings in commit diffs |

Both jobs are provided by GitLab's free built-in templates. No additional analyzer configuration is required -- GitLab auto-detects the TypeScript project.

Both jobs run on every MR and branch push. Tag pipelines (releases) are excluded.

## Viewing findings

Findings are available in the **Security tab** of the pipeline on the Free tier. The MR security widget (inline findings on the merge request itself) requires GitLab Ultimate.

## Triage process

For each finding:

- **True positive** -- fix the code, rotate any exposed credential immediately
- **False positive** -- suppress it with documented reasoning:
  - SAST: disable the specific rule by adding a `.gitlab/sast-ruleset.toml` file, or exclude the path via the `SAST_EXCLUDED_PATHS` CI/CD variable
  - Secret Detection: dismiss via the GitLab vulnerability dismissal UI on the finding

## Stage configuration

The SAST and Secret Detection templates default all jobs to `stage: test`. This pipeline uses custom stage names, so the concrete template jobs are overridden in `.gitlab-ci.yml` to point at the `security` stage. Hidden jobs (dot-prefixed) do not trigger the stage validator and do not need overriding.

Overridden jobs:

- `sast` -- parent job defined by the SAST template
- `semgrep-sast` -- the concrete analyzer that runs for TypeScript, also restricts pipeline sources
- `secret_detection` -- the Secret Detection job, also restricts pipeline sources

Reference: https://docs.gitlab.com/ee/user/application_security/detect/security_configuration

## History

The full repository git history (855 commits) was scanned with Gitleaks prior to enabling these jobs and returned clean.
