# Online Accounts Deployment Readiness

Status: draft for CloudOps review  
Audience: CloudOps, AWS/platform team, development leads  
Scope: backend infrastructure preparation, environment planning, and operational readiness

## Purpose

This document summarizes what currently exists in the codebase for the online-accounts backend and what still needs to be defined before CloudOps can provision AWS environments.

It is not a final AWS architecture. The goal is to give CloudOps enough technical context to design and prepare the runtime infrastructure, databases, secrets, deployment path, monitoring, and support model.

## Current Repository State

The online-accounts backend currently contains two backend services:

| Service | Package | Path | Runtime | Purpose |
|---|---|---|---|---|
| Main backend | `@budget/server` | `packages/server` | Node 22 + Fastify | Registration, auth foundation, account/sync backend foundation |
| Recovery backend | `@budget/recovery-server` | `packages/recovery-server` | Node 22 + Fastify | Separate trust boundary for account recovery |

Both services are containerized Node services and use PostgreSQL through Drizzle migrations.

The existing PWA deploys separately to Cloudflare Pages. Backend deployment to AWS is a new deployment track and should not be confused with the current Cloudflare Pages deployment diagrams.

The repository also includes a Docker Compose local development stack for backend
databases, one-shot migrations, optional backend containers, and local smoke
testing. This stack is only for development and reviewer validation; it is not
the production deployment model.

## Current Deployment Status

| Area | Status |
|---|---|
| PWA deployment | Implemented in GitLab CI. Preview from merge requests, staging from `develop`, production from `main`. |
| Main backend Docker image | Dockerfile exists at `packages/server/Dockerfile`. |
| Recovery backend Docker image | Dockerfile exists at `packages/recovery-server/Dockerfile`. |
| Local backend Compose stack | Implemented for local databases, migrations, optional backend containers, and Adminer. |
| Main backend CI | Nx targets exist for `serve`, `build`, `lint`, `typecheck`, and `test`. |
| Recovery backend CI | Dedicated lint, test, typecheck, build, and health-check jobs exist in `.gitlab-ci.yml`. |
| Backend runtime deployment | Not implemented yet. Requires AWS/platform inputs. |
| Backend DEV/QA/PROD environments | Not provisioned yet. Requires environment decision and CloudOps setup. |
| Backend monitoring/backups/runbooks | Not complete yet. Requires CloudOps operating model. |

## Service Boundaries For Infrastructure Planning

CloudOps should treat the main backend and recovery backend as separate deployable services.

| Concern | Main backend | Recovery backend |
|---|---|---|
| Package | `@budget/server` | `@budget/recovery-server` |
| Container file | `packages/server/Dockerfile` | `packages/recovery-server/Dockerfile` |
| Default port | `3000` | `3001` |
| Health endpoint | `GET /health` | `GET /health` |
| Database variable | `DATABASE_URL` | `RECOVERY_DB_URL` |
| Database boundary | Main application database | Separate recovery database |
| Secret boundary | Main backend secrets | Recovery-only secrets |
| Deployment identity | Main backend identity | Separate recovery identity |

The recovery service must not share database credentials, JWT secrets, email peppers, or deployment identity with the main backend. For production, stronger separation than dev/QA is recommended.

## Main Backend Runtime Contract

Service:

- Package: `@budget/server`
- Source path: `packages/server`
- Container: `packages/server/Dockerfile`
- Entrypoint: `node packages/server/dist/main.js`
- Default port: `3000`
- Health endpoint: `GET /health`
- Database: PostgreSQL
- Migration tool: Drizzle Kit

Required runtime configuration:

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | PostgreSQL connection string for the main backend database. Required at startup. |
| `MAGIC_LINK_SECRET` | JWT secret used for magic-link registration flow. Required by the Fastify app. |
| `BREVO_API_KEY` | Transactional email API key. Required only for real email delivery. |
| `BREVO_SENDER_EMAIL` | Verified Brevo sender email for built-in registration emails when no template ID is configured. |
| `BREVO_SENDER_NAME` | Sender display name for built-in registration emails. |
| `MAGIC_LINK_TEMPLATE_ID` | Optional Brevo transactional template ID. |
| `AUTH_DEEP_LINK_BASE` | App verification URL used to construct clickable registration links, for example `/register/verify`. |
| `HOST` | Bind address. Defaults to `0.0.0.0` in container. |
| `PORT` | HTTP port. Defaults to `3000`. |
| `NODE_ENV` | Runtime mode. |

Current public endpoints include:

- `GET /health`
- `GET /v1/nonce`
- `POST /users`
- auth registration and verification routes described in `server-testing-runbook.adoc`

## Recovery Backend Runtime Contract

Service:

- Package: `@budget/recovery-server`
- Source path: `packages/recovery-server`
- Container: `packages/recovery-server/Dockerfile`
- Entrypoint: `node packages/recovery-server/dist/main.js`
- Default port: `3001`
- Health endpoint: `GET /health`
- Database: PostgreSQL
- Migration tool: Drizzle Kit

Required runtime configuration:

| Variable | Purpose |
|---|---|
| `RECOVERY_DB_URL` | PostgreSQL connection string for the recovery database. Must be separate from `DATABASE_URL`. |
| `RECOVERY_JWT_SECRET` | Secret used for recovery tokens. Must not be shared with the main backend. |
| `RECOVERY_EMAIL_PEPPER` | Pepper used before hashing recovery email addresses. Must not be shared with the main backend. |
| `HOST` | Bind address. Defaults to `0.0.0.0` in container. |
| `PORT` | HTTP port. Defaults to `3001`. |
| `NODE_ENV` | Runtime mode. |

## Environment Strategy

Production is mandatory. QA and DEV are strongly recommended because this backend includes database migrations, auth flows, recovery flows, monitoring, backups, and AWS-specific integrations.

| Environment | Purpose | Recommendation |
|---|---|---|
| DEV | Integration target for backend work, migration rehearsal, early CI deployment validation, non-production secrets. | Recommended if cost allows. |
| QA | Release-candidate validation, AWS-specific smoke tests, monitoring and alert testing, backup/restore testing. | Strongly recommended. |
| PROD | Customer runtime with hardened access, monitoring, backups, and controlled releases. | Mandatory. |

Minimum acceptable landscape:

- `QA + PROD`

Preferred landscape:

- `DEV + QA + PROD`

`PROD only` is technically possible but creates avoidable operational risk because deployments, migrations, monitoring, backup/restore, email delivery, and rollback behavior would first be validated in production.

## CI/CD Direction

The expected deployment flow is:

1. GitLab CI runs lint, typecheck, tests, and build.
2. GitLab CI builds immutable container images for `@budget/server` and `@budget/recovery-server`.
3. Images are pushed to the approved registry.
4. Environment-specific deploy jobs roll out the selected image to DEV/QA/PROD.
5. Database migrations are executed using an agreed model before or during rollout.
6. Deployment smoke checks verify `GET /health` and environment-specific readiness.

The migration execution model is not finalized. Options:

- CI-triggered migration job with environment-scoped credentials.
- One-shot task in the target AWS environment.
- CloudOps-controlled manual migration for QA/PROD.

The selected model must support rollback planning and clear ownership if a schema migration succeeds but the application rollout fails.

## Operational Readiness Requirements

CloudOps should plan for:

- HTTPS endpoint per environment.
- Private PostgreSQL databases with encryption at rest.
- Separate main and recovery database credentials.
- Secrets stored in AWS Secrets Manager or SSM Parameter Store.
- Environment-scoped GitLab deployment credentials.
- Logs for both services.
- Metrics and alarms for availability, latency, error rate, and resource usage.
- Application health checks.
- Database backup retention and restore testing.
- Access controls for production runtime and database access.
- Auditability for production secrets and operational access.
- Rollback process for container version rollback.
- Defined process for database migration rollback or forward-fix.

For production multi-instance deployment, replay protection needs a shared nonce store. The current in-memory nonce store is only suitable for local development and single-instance environments.

## AWS Decisions Required

The following decisions are still open:

| Area | Decision needed |
|---|---|
| Environment landscape | `PROD only`, `QA + PROD`, or `DEV + QA + PROD`. |
| AWS account structure | Shared account with isolated environments or separate accounts per environment. |
| Region | AWS region and data-residency constraints. |
| Runtime platform | ECS Fargate, EKS, App Runner, or another approved container platform. |
| Registry | ECR or another approved container registry. |
| Network | VPC/subnet design, public/private placement, security groups, outbound internet. |
| Entry point | ALB, API Gateway, App Runner URL, WAF, TLS termination. |
| DNS/TLS | Hostnames and certificate ownership per environment. |
| PostgreSQL | RDS/Aurora choice, sizing, storage, encryption, backups, maintenance windows. |
| Recovery isolation | Separate database is mandatory; production host/account isolation needs final decision. |
| Secrets | Secret storage, rotation, and GitLab CI access model. |
| Migrations | Who runs migrations and how they are rolled back or recovered. |
| Observability | Logs, metrics, alarms, dashboards, traces. |
| Backups | Retention, restore process, and restore-test cadence. |
| Email provider | Continue with Brevo or evaluate AWS SES. |
| Ownership | Development vs CloudOps responsibilities for deploys, incidents, logs, database access, and support. |

## Related Documentation

| Document | Content |
|---|---|
| `docs/online-accounts/implementation-plan.md` | Online-accounts roadmap: zero-knowledge model, registration, recovery, sync, sharing, migration, production deployment. |
| `docs/online-accounts/tools-report.md` | Stack and tooling decisions: Fastify, Node, PostgreSQL, Drizzle, container hosting, email provider, crypto, recovery isolation. |
| `docs/online-accounts/backend-foundation-runbook.adoc` | Main backend local runbook, env vars, Docker, health check, CI expectations, deployment status. |
| `docs/online-accounts/local-dev-stack.md` | Local Docker Compose setup for backend databases, migrations, optional server containers, and manual smoke tests. |
| `docs/online-accounts/server-testing-runbook.adoc` | Auth registration and magic-link verification testing runbook. |
| `docs/online-accounts/recovery-architecture.md` | Recovery service trust boundary and required isolation. |
| `docs/crypto/envelope.md` | Crypto envelope protocol for encrypted values and future crypto migration. |
| `docs/architecture/02_system_scope_and_context.adoc` | Existing system context and external systems. |
| `docs/architecture/03_design_decisions.adoc` | Architecture decisions, including offline-first and command-based change capture. |
| `docs/architecture/04_building_block_view.adoc` | Current package decomposition and frontend/core structure. |
| `docs/release-guide.md` | Current release and tag process. |
| `docs/ci-security-scanning.md` | GitLab SAST and secret-detection setup. |

## Available Diagrams

Existing rendered diagrams are available under `docs/architecture/images/`.

| Diagram | File |
|---|---|
| Business context | `docs/architecture/images/L00_Business_Context.png` |
| Technical context | `docs/architecture/images/L00_Technical_Context-Budget.png` |
| Whitebox overall | `docs/architecture/images/L01_Whitebox_Overall.png` |
| Frontend architecture | `docs/architecture/images/Frontend_Architecture.png` |
| Current PWA deployment architecture | `docs/architecture/images/Phase1_Deployment_Architecture.png` |
| Current PWA deployment pipeline | `docs/architecture/images/pwa-deployment-pipeline.png` |
| Command/change capture architecture | `docs/architecture/images/Command_Change_Capture_Architecture.png` |
| Command execution flow | `docs/architecture/images/Command_Execution_Flow.png` |

The current rendered deployment diagrams are Phase 1 PWA diagrams. A final AWS backend deployment diagram should be produced after the CloudOps platform decisions are made.

## Known Gaps

- Final AWS deployment architecture is not yet approved.
- DEV/QA/PROD backend environments are not provisioned.
- Backend deploy jobs for AWS are not implemented.
- Production nonce-store design is not finalized.
- Production recovery isolation level is not finalized.
- Monitoring dashboards and alert rules are not defined.
- Backup/restore runbooks are not complete.
- Operational ownership between Development and CloudOps is not finalized.
- Cost estimation is still needed for `PROD only`, `QA + PROD`, and `DEV + QA + PROD`.
