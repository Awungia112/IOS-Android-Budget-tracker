# Recovery Server — Trust Boundary

## What is the recovery server?

`packages/recovery-server` is a **separate Fastify service** that handles account-recovery flows (e.g. password reset, email verification). It runs as an independent process with its own PostgreSQL database, secrets, and deployment identity.

It is intentionally isolated from the main `packages/server` so that a compromise of one service cannot be leveraged to attack the other.

---

## Trust boundary

| Concern | Main server (`@budget/server`) | Recovery server (`@budget/recovery-server`) |
|---|---|---|
| Database | `DATABASE_URL` | `RECOVERY_DB_URL` — different DB name **and** different credentials |
| JWT signing key | `JWT_SECRET` (future) | `RECOVERY_JWT_SECRET` — never shared |
| Email pepper | — | `RECOVERY_EMAIL_PEPPER` — never shared |
| Deployment identity | own service account | own service account |
| CI pipeline | `nx run server:*` targets | `nx run recovery-server:*` targets |

The two services **may share a Postgres host** in dev/staging but must use different database names and different credentials. In production they should use separate hosts.

---

## What the recovery server stores

- Recovery tokens (hashed, short-lived)
- Email address hashes (peppered with `RECOVERY_EMAIL_PEPPER`)
- Audit log of recovery attempts

## What the recovery server must never store

- User passwords or password hashes
- Financial data (transactions, budgets, categories)
- Session tokens belonging to the main server
- Any secret from the main server's environment

---

## Environment variables

All three variables below are **exclusive to the recovery server**. They must never appear in the main server's environment and vice-versa.

| Variable | Purpose |
|---|---|
| `RECOVERY_DB_URL` | PostgreSQL connection string for the recovery database |
| `RECOVERY_JWT_SECRET` | Signs short-lived recovery JWTs |
| `RECOVERY_EMAIL_PEPPER` | HMAC pepper applied before hashing email addresses |

---

## CI pipeline jobs

| Job | Stage | Purpose |
|---|---|---|
| `recovery:lint` | quality | ESLint on recovery-server source |
| `recovery:test` | quality | Vitest unit + integration tests (includes `/health` assertion) |
| `recovery:typecheck` | build | TypeScript type-check |
| `recovery:build` | build | Compile to `packages/recovery-server/dist/` |
| `recovery:health-check` | build | Starts the built binary and asserts `GET /health → 200` |

---

## Health endpoint

```
GET /health
→ 200 { "status": "ok", "service": "recovery" }
```

This is the only unauthenticated endpoint. All other routes will require a valid `RECOVERY_JWT_SECRET`-signed token.
