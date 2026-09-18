# Online Accounts Local Development Stack

This stack gives reviewers and developers a repeatable local environment for the
online-accounts backend. It is a local development and smoke-test harness, not
the production AWS deployment architecture.

The default workflow is hybrid:

- Docker Compose runs PostgreSQL infrastructure.
- Developers usually run the app and servers from the host with `pnpm` for fast
  iteration.
- Compose profiles can also run the compiled backend containers for Docker smoke
  tests.

## Services

| Service | Purpose | Host endpoint |
|---|---|---|
| `postgres` | Main `@budget/server` database | `localhost:55432` |
| `recovery-postgres` | Separate `@budget/recovery-server` database | `localhost:55433` |
| `server` | Optional main backend container profile | `http://127.0.0.1:3095` |
| `recovery-server` | Optional recovery backend container profile | `http://127.0.0.1:3096` |
| `adminer` | Optional DB browser profile | `http://127.0.0.1:8081` |

The app remains host-run by default. `packages/app/vite.config.ts` already
proxies `/v1` to `http://127.0.0.1:3095`, so a host-run Vite app talks to the
local main backend without extra configuration.

## First-Time Setup

```bash
pnpm install
cp packages/server/.env.example packages/server/.env
cp packages/recovery-server/.env.example packages/recovery-server/.env
cp .env.example .env
```

Edit the copied env files before testing real email delivery. The package env
files are used by host-run servers. The repository-root `.env` is used by Docker
Compose interpolation for container profiles. Registration, invite, and recovery
email flows use Brevo. No local Mailpit or mock email adapter is part of this
stack, so a real `BREVO_API_KEY` is required for provider-level manual email
tests.

## Fast Host-Run Workflow

Use this for normal development.

```bash
pnpm stack:db
pnpm db:migrate:server:local
pnpm db:migrate:recovery:local

set -a && source packages/server/.env && set +a
pnpm dev:server
```

In a second terminal:

```bash
pnpm dev
```

Smoke checks:

```bash
curl http://127.0.0.1:3095/health
curl http://127.0.0.1:3095/v1/nonce
```

## Container Backend Workflow

Use this when reviewing Docker behavior or checking the compiled server image.

```bash
pnpm stack:server
```

This builds the main server image, waits for `postgres`, runs server migrations
through the one-shot `server-migrate` service, then starts the server on
`127.0.0.1:3095`.

Smoke checks:

```bash
curl http://127.0.0.1:3095/health
curl http://127.0.0.1:3095/v1/nonce
```

For the recovery backend:

```bash
pnpm stack:recovery
curl http://127.0.0.1:3096/health
```

The recovery profile uses a separate database and separate recovery secrets. A
real Brevo key is still needed for end-to-end recovery email delivery.

## Database Tools

```bash
pnpm stack:tools
```

Open `http://127.0.0.1:8081` and connect with:

| Database | Server | User | Password |
|---|---|---|---|
| Main | `postgres` | `budget` | `budget` |
| Recovery | `recovery-postgres` | `budget_recovery` | `budget_recovery` |

From the host, use ports `55432` and `55433`. From Adminer, use the Compose
service names above.

## Shutdown And Reset

Stop containers but keep database volumes:

```bash
pnpm stack:down
```

Destructive reset, including both PostgreSQL volumes:

```bash
pnpm stack:reset
```

Run `stack:reset` only when you intentionally want to delete local backend data.

## Verification Checklist

`docker compose config` prints resolved environment values. Do not paste that
output into tickets or chat when real Brevo keys are configured.

```bash
docker compose config
pnpm stack:db
pnpm db:migrate:server:local
pnpm db:migrate:recovery:local
docker compose ps
pnpm nx run server:typecheck
pnpm nx run server:test
pnpm nx run recovery-server:typecheck
pnpm nx run recovery-server:test
```

Production multi-instance replay protection still needs a shared nonce-store
design. The current in-memory nonce store is acceptable for this local stack and
single-instance smoke tests only.
