# Online Accounts Tools Report

Issue: #258 Backend foundation and tooling

Status: decision proposal for team validation. Backend scaffolding, CI deployment jobs, and environment provisioning should start only after this report is accepted.

## Context

The online accounts backend is not a traditional finance CRUD backend. The product direction in the Phase 2 planning documents is local-first and zero-knowledge: devices remain the source of truth, and the server stores encrypted change records, email hashes, public keys, wrapped account keys, and routing metadata.

The current repository is already a TypeScript, Nx, and pnpm monorepo with `packages/app` and `packages/core`. No server workspace exists yet. The current GitLab CI still sets `NODE_VERSION: "20"`, while the README requires Node.js 22+. This must be corrected before building a long-lived backend service.

`docs/online-accounts/implementation-plan.md` is present and its Step 0 section should point to this report as the decision source. If the team changes any recommendation below, update both documents in the same MR so Step 0 remains aligned with the approved tooling baseline.

## Decision Matrix

| Decision | Recommended choice | Why | Rejected alternatives | Follow-up risk |
|---|---|---|---|---|
| Backend language and framework | TypeScript + Node LTS + Fastify | Fits the current monorepo and lets the team share types, tooling, tests, lint rules, and CI patterns. Fastify is small enough for a blind relay server and has official TypeScript, schema validation, and route injection testing support. | NestJS adds useful structure but too much framework weight for the first health/auth/sync relay service. Hono is attractive for edge runtimes but constrains hosting and database choices earlier than needed. A non-TypeScript backend would split the stack and slow client/server contract work. | Keep module boundaries clean so the service does not become an unstructured collection of routes. Revisit Nest only if the backend grows into many independently owned domains. |
| Runtime baseline | Node 24 LTS preferred; Node 22 LTS acceptable for lower repo churn | Node 20 is end-of-life and should not be the baseline for new backend work. The repo already uses Node 22 locally and documents Node 22+ in the README. | Staying on Node 20 for backend work creates an immediate lifecycle and security maintenance problem. | Decide whether #258 upgrades CI globally to Node 24/22 or gives the server job its own newer Node image first. |
| Database | PostgreSQL | The next phases need relational integrity for users, account membership, invites, wrapped keys, recovery metadata, and ordered encrypted change records. PostgreSQL also gives reliable transactions and locking for monotonic sync sequencing. | SQLite is wrong for shared server environments. MySQL/MariaDB is viable but brings less value than PostgreSQL for this new TypeScript service. Document databases do not fit membership, invite, sequence, and uniqueness constraints as cleanly. | Schemas are out of scope for #258. Do not design user/account/change-record tables in this ticket beyond documenting why PostgreSQL is the target. |
| Database access and migrations | Drizzle ORM + Drizzle Kit migrations | Drizzle is TypeScript-first, keeps SQL visible, and generates migration files that can be committed and reviewed. This matches a security-sensitive backend where schema changes should be explicit. | Prisma is mature and productive, but its generated client and migration workflow are heavier. Raw SQL only is transparent but gives less type safety and slower iteration. | Define the migration workflow in the server scaffold ticket: committed SQL migrations, reviewable migration diffs, and separate dev/staging database URLs. |
| Hosting provider for dev and staging | EU-hosted, Germany-operated, container-capable infrastructure deployed from GitLab CI | The backend will eventually hold identity metadata, encrypted blobs, recovery metadata, audit logs, secrets, and database migrations. Keeping runtime and PostgreSQL data in EU-hosted infrastructure managed by the German team gives the project a clear data-residency and operational-ownership model while still letting us develop and ship the service through GitLab. | Generic managed application platforms are not the default because they add vendor, residency, access-control, backup, and audit questions. Non-container runtimes are avoided because they constrain PostgreSQL access, migrations, background jobs, and future observability too early. | The German team must confirm the exact dev/staging target, access model, backup location, and data-residency guarantees. Until then, #258 should document this as the recommended hosting direction and avoid provisioning. |
| Email delivery provider | Brevo, pending vendor approval | Registration and recovery need transactional email. Brevo offers transactional email APIs and templates and is a reasonable EU-oriented default candidate. | Postmark has excellent transactional delivery but may require vendor/compliance approval. Amazon SES is robust and cheap but operationally heavier. | Validate vendor policy, data processing agreement, sender-domain setup, SPF/DKIM/DMARC ownership, and rate limits before Step 1a starts. |
| Cryptography library | libsodium protocol primitives; Web Crypto only where platform-native integration is required | The planned design needs modern primitives for key generation, public-key wrapping, signatures/nonces, hashing, and symmetric encryption. libsodium is a conservative, well-known crypto toolkit and avoids inventing protocol primitives. Every encrypted value must be stored as a versioned crypto envelope that carries the algorithm metadata used to create it. | Writing directly against low-level Web Crypto everywhere risks inconsistent app/server implementations and harder protocol review. Small ad-hoc crypto packages should be avoided. Raw ciphertext storage is rejected because it would force a full data migration when algorithms or parameters evolve. | The actual protocol must be reviewed before production. The server must never decrypt user data; crypto use in the backend should be limited to verification, hashing, token/nonce handling, and storage of public/wrapped/encrypted envelopes. |
| Recovery server isolation | Separate recovery service and database on the same chosen infra for dev/staging; production isolation to be confirmed by tech lead | Recovery is a separate trust boundary because it stores encrypted private-key recovery material. For dev/staging, separate service, database, secrets, and deployment identity are enough to unblock work without vendor sprawl. | Same service and same database weakens blast-radius separation. Completely different vendor is stronger but adds cost and operational overhead before the threat model is finalized. | Tech lead must decide production isolation before recovery goes live. The tools report should record this as a risk and not silently collapse recovery into the main server. |

## Recommended Step 0 Implementation Shape

After this report is approved, implement the backend foundation as a new `packages/server` workspace inside the existing pnpm workspace and Nx project graph.

The first scaffold should include:

- a minimal Fastify app factory that registers `GET /health`;
- a server entrypoint that reads host and port from environment variables;
- a Node-specific TypeScript config and ESLint setup;
- Nx targets for `serve`, `build`, `lint`, `typecheck`, and `test`;
- Vitest tests using Fastify route injection for `/health`;
- a placeholder database module that does not define production schemas yet;
- a Dockerfile or equivalent container build definition once the hosting target is confirmed.

The first scaffold should not include:

- registration endpoints;
- authentication/session logic;
- sync/change-record APIs;
- sharing APIs;
- recovery APIs;
- database schemas for users, budget accounts, account keys, invites, or change records.

## CI And Runtime Notes

The backend should not be introduced under Node 20. The team should make one of these choices before the scaffold MR:

1. upgrade GitLab CI from Node 20 to Node 24 or Node 22 for the whole repository; or
2. keep the PWA pipeline unchanged temporarily and add server-specific jobs using Node 24 or Node 22.

The cleaner long-term option is a repo-wide Node upgrade, because the README already says Node 22+ and the local development environment is already Node 22.

The server pipeline should prove:

- `pnpm install --frozen-lockfile`;
- `nx lint server`;
- `nx typecheck server`;
- `nx test server`;
- `nx build server`;
- deployed dev `/health` returns `200 OK`;
- deployed staging `/health` returns `200 OK`.

## Hosting Recommendation Detail

Use an EU-hosted, Germany-operated, container-capable dev/staging environment, with GitLab CI as the deployment path. This keeps the backend compatible with a normal Node HTTP server, PostgreSQL, database migrations, service-level secrets, and future observability while respecting the team's data-residency direction.

The intended ownership split is:

- we develop the backend service, tests, container image, database migrations, and deployment pipeline;
- the German team owns the hosting account/project, database instance, backups, secrets, runtime access, and production operational controls;
- GitLab CI builds and deploys the approved container image to dev/staging using environment-scoped credentials;
- app data, database backups, logs, and object storage stay in the EU, preferably Germany if the selected provider supports it;
- developers should not have unrestricted production database access. Debug access should be audited, time-bound, and mediated by the operating team.

Managed application platforms can be kept as fallback options only if they can satisfy the same EU/Germany data-residency, access-control, backup, and audit requirements.

## Recovery Isolation Recommendation Detail

For dev/staging, run recovery as a separate deployable service with its own database, secrets, service account, and environment variables. It can share the same infrastructure provider while keeping operational boundaries clear.

For production, make the isolation decision explicit before implementation:

- minimum acceptable: same provider, separate service, separate database, separate credentials, separate access controls;
- stronger option: separate provider or account boundary for recovery;
- not acceptable: recovery tables inside the main backend database without a clear security exception.

## Crypto Envelope Requirement

Encrypted change records and wrapped account keys must be stored and transmitted as envelopes, not raw ciphertext blobs. The envelope gives the client enough metadata to select the right decrypt/unseal implementation for each individual record, so a future algorithm or parameter change can be introduced for new records without rewriting all old encrypted data.

Minimum envelope metadata:

- `envelopeVersion`: serialization format version;
- `algorithm`: the encryption or key-wrapping algorithm/suite identifier;
- `keyId` or `accountKeyId`: the logical key used for encryption or wrapping;
- `keyEpoch`: the account key epoch used for revocation and rotation;
- `nonce` or equivalent algorithm-specific IV material;
- `ciphertext`: the encrypted payload;
- optional `aad` or `context`: authenticated metadata such as account id, record id, and record type.

The server treats the full envelope as opaque data. It may index routing metadata outside the envelope when needed, but it must not need to understand or decrypt the ciphertext. When the crypto suite changes, clients write new envelopes with the new `algorithm` value while keeping old envelopes readable through their own metadata.

## External References

- Fastify TypeScript documentation: https://fastify.dev/docs/latest/Reference/TypeScript/
- Fastify validation and serialization: https://fastify.dev/docs/latest/Reference/Validation-and-Serialization/
- Drizzle migrations: https://orm.drizzle.team/docs/migrations
- libsodium documentation: https://libsodium.gitbook.io/doc
- Brevo transactional email API: https://developers.brevo.com/docs/send-a-transactional-email
- Node.js releases and end-of-life schedule: https://nodejs.org/en/about/previous-releases

## Validation Checklist

- [ ] Team accepts or amends the recommended backend stack.
- [ ] Team confirms the Node runtime baseline.
- [ ] Team confirms the dev/staging hosting provider.
- [ ] Team confirms the email provider or requests a provider comparison spike.
- [ ] Tech lead confirms recovery isolation for dev/staging and the required production posture.
- [x] Online implementation-plan document is available.
- [x] Step 0 in `docs/online-accounts/implementation-plan.md` is updated with the proposed choices.
