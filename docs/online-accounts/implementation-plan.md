# Online Accounts — Implementation Plan

## Executive summary

We are extending our Budget app today a fully local app to support **online accounts**: server-side persistence of user data, multi-device access via email recovery, and shared accounts between users. Because the app handles financial data, we are building this on a **zero-knowledge architecture**: the server stores only encrypted blobs and email hashes; it cannot read user data, even if compromised.

This plan covers the 6-phase delivery agreed by the team. **Step 0 uses the tooling baseline documented in [tools-report.md](tools-report.md); the initial backend scaffold is described in [backend-foundation-runbook.md](backend-foundation-runbook.md).**

---

## 1. Scope

- iOS and Android mobile apps only.
- Email-based registration with client-generated keypairs (per the existing registration design doc).
- Email-based account recovery on a new device.
- Server-side persistence of encrypted user data.
- Account sharing between users (owner + member, with revocation).
- Extension of the existing migration ([packages/core/src/migration/](../../packages/core/src/migration/)) to push migrated online accounts to the new server and re-map shared-account permissions.
- Backend deployment.
---

## 2. Architecture principles

### Terminology

To avoid ambiguity, this document distinguishes:

- **User** — one human, identified by an email. A user has exactly one keypair.
- **Budget account** — a budget container (e.g. "Personal", "Joint with Sarah"), as defined by [packages/core/src/types/account.ts](../../packages/core/src/types/account.ts). One user can own many budget accounts. A budget account can be shared with other users.

When this document says "account" it means **budget account** unless explicitly prefixed with "user".

### Principles

1. **Zero-knowledge server.** The server stores `(user_id, email_hash, public_key, encrypted_blob)`. It cannot decrypt user data.
2. **ChangeLog as the sync substrate.** The existing [ChangeLog](../../packages/core/src/changelog/change-log.ts) already records every write as a sequenced record. Online sync = encrypt those records, push to the server, pull and replay on another device.
3. **Recovery is a separate trust boundary.** A separate recovery service holds the encrypted private key. Compromising the main server does not compromise recovery, and vice versa.

### Two-layer key model

| Layer | What | How many | Where it lives |
|---|---|---|---|
| **Identity (asymmetric)** | User keypair (public + private) | **1 per user** (= 1 per email) | Private key in iOS Keychain / Android Keystore; public key on the server |
| **Data encryption (symmetric)** | `accountKey` | **1 per budget account** | Generated on device; wrapped with each member's public key; stored server-side |

The user's private key is **only used to unwrap `accountKey`s** — never to encrypt data directly. The `accountKey` does the actual encryption of change records. Encrypted records and wrapped keys are stored as **versioned crypto envelopes**, not raw ciphertext, so each payload carries its own algorithm metadata for future crypto evolution.

#### Why we need both layers (not just the user keypair)

The user keypair alone is not sufficient because:

1. **Selective sharing.** A user can share one budget account with another user without sharing their other budget accounts. This is only possible if each budget account has its own data-encryption key — otherwise sharing one account would expose all of them.
2. **Performance & size.** Asymmetric encryption is ~1000× slower than symmetric and has hard size limits change records cannot be encrypted directly with a public key. This is why every real-world crypto system uses envelope encryption (symmetric key for data, asymmetric key for the symmetric key).
3. **Revocation isolation.** When a member is removed from a budget account, only that account's `accountKey` rotates. The user's other accounts are unaffected.

#### Concrete example

Alice (one email, one keypair) owns three budget accounts:

```
Alice
 └── User keypair (public_A, private_A)
       ├── Budget account "Personal"      → accountKey_1  (wrapped with public_A)
       ├── Budget account "Joint w/ Bob"  → accountKey_2  (wrapped with public_A AND public_B)
       └── Budget account "Vacation"      → accountKey_3  (wrapped with public_A)
```

Bob only ever receives `accountKey_2`. He cannot decrypt anything from "Personal" or "Vacation" those records use different `accountKey`s he has never seen.

### Honest tradeoff to surface at onboarding

A user who loses their device **and** cannot complete the email recovery flow loses their data. Support cannot recover it. This is the price of zero-knowledge.

---

## 3. Implementation phases

### Step 0 — Backend foundation 

**Goal:** validate the backend tooling baseline, then stand up a backend workspace and deploy dev + staging environments.

**Tooling baseline:** see [tools-report.md](tools-report.md) for the decision matrix, rejected alternatives, and follow-up risks.

- Backend language and framework: TypeScript + Node LTS + Fastify.
- Runtime baseline: Node 24 LTS preferred; Node 22 LTS acceptable if the team wants lower repo-wide CI churn. Do not introduce the backend on Node 20.
- Database: PostgreSQL.
- Database access and migrations: Drizzle ORM + Drizzle Kit migrations.
- Hosting for dev and staging: EU-hosted, Germany-operated, container-capable infrastructure deployed from GitLab CI. We develop the service and deployment pipeline; the German team owns hosting, database, backups, secrets, and runtime access.
- Email delivery provider: Brevo, pending vendor and compliance approval.
- Cryptography library: libsodium protocol primitives, with platform-native Web Crypto only where needed.
- Recovery isolation: separate recovery service and database for dev/staging; production isolation to be confirmed by the tech lead before recovery goes live.

**Deliverables:**
- A new server workspace in the monorepo with Fastify, Drizzle/PostgreSQL tooling, `/health`, Docker build support, and Nx lint/typecheck/test/build targets.
- CI coverage for the server workspace through the existing Nx affected jobs.
- Dev + staging environments after the German team provides the hosting target, database endpoints, registry, deployment method, and secrets model.
- A reviewed **tools report** documenting the stack, hosting provider, email-delivery provider, cryptography library, and recovery isolation decision.

**Dependencies:** the tools report must stay current as the backend evolves. Real deployment jobs and environment provisioning remain blocked until the German-team infrastructure inputs in [backend-foundation-runbook.md](backend-foundation-runbook.md) are available.

---

### Step 1 — Registration & recovery

> Note: the original Step 1 combined registration and recovery. Recovery is materially harder than registration (separate server, key escrow, threat model around the recovery server itself) and is tracked separately so its complexity does not hide inside the registration estimate.

#### Step 1a — Registration

**Goal:** a user registers an email, validates via magic link, and uses the app online from the registering device.

**Deliverables:**
- The flow from the existing registration design doc, with these clarifications added (gaps in the current doc):
  - **Private key storage:** iOS Keychain / Android Keystore (hardware-backed at-rest encryption, no passphrase needed).
  - **Replay protection:** every signed request to the server carries a server-issued nonce + timestamp; old or re-used nonces are rejected.
  - **Magic link mechanism:** deep link via Universal Links (iOS) / App Links (Android), with manual code entry as a fallback.
- Server endpoints for registration + email verification.
- `users` table: id, email_hash, public_key, validated_at.
- Cleanup job for unvalidated registrations.
- UI: registration, "check your email", validation success.

#### Step 1b — Recovery (Still need to be confirm)

**Goal:** a user who lost their device can recover access on a new device using email + secret code.

**Deliverables:**
- Recovery service (separate database from the main server).
- Tables: `(email_hash, encrypted_private_key, tmp_secret_code_hash, code_expires_at)`.
- Flow: user enters email on new device → recovery server emails a secret code → user enters code → device receives the encrypted private key from the recovery server.
- UI: "recover my account" entry point, secret code entry.
- In-app warnings about the zero-knowledge tradeoff.

**Dependencies:** Step 1a complete.

---

### Step 2 — Encrypted data sync 

**Goal:** a registered user's data is persisted encrypted on the server and can be restored on a new device after recovery.

**Deliverables:**
- Per-budget-account `accountKey` (symmetric, generated on device, wrapped with the user's public key, stored server-side). A single user has one `accountKey` per budget account they own.
- Client-side encryption of `ChangeRecord`s before upload.
- Versioned crypto envelopes for encrypted records and wrapped keys. Each envelope carries at least an envelope version, algorithm/suite id, key id or account key id, key epoch, nonce/IV material, and ciphertext. This allows new algorithms to be introduced for future records without bulk-migrating existing encrypted data.
- Server endpoints: push records, pull records since a given sequence.
- Tables: `accounts (id, owner_user_id, key_epoch)`, `change_records (account_id, sequence, encrypted_payload, created_at)`, `account_keys (account_id, user_id, wrapped_key, epoch)` — note `encrypted_payload` and `wrapped_key` store envelopes, not raw ciphertext, and `account_keys` carries one row per `(budget account, user)` pair: one for the owner, plus one for each shared member.
- **Conflict resolution:** the server assigns a monotonic sequence number on receipt; ties (e.g. simultaneous pushes) break by change UUID. (Still need to be decide just a proposal here)
- **New-device replay:** after recovery, the device pulls all encrypted records and replays them via the existing command replayer.
- UI: sync status indicator.

**Dependencies:** Step 1a complete.

---

### Step 3 — Account sharing 

**Goal:** an account owner can invite another user by email; the invitee accepts and gains access.

**Deliverables:**
- Two-phase invite flow:
  1. Owner sends invite → server records `(recipient_email_hash, account_id, status='pending')`. No `accountKey` is sent yet the recipient may not have registered.
  2. Recipient (once registered) accepts → owner's device wraps `accountKey` with the recipient's public key and uploads it → server stores it in `account_members`.
- Tables: `invites`, `account_members (account_id, user_id, wrapped_account_key, role, joined_at)`.
- Endpoints: invite create / list / accept, key delivery, member removal.
- **Revocation — epoch model:** removed members lose access to future writes (encrypted with a new `accountKey'`). Past records they already pulled remain readable. Full re-encryption of past data is not done because it provides no real security gain (the ex-member already had the data on their device).
- Roles: owner + member.
- UI: sharing settings page, invite by email, pending invite notifications, member list, revoke action.

**Dependencies:** Step 2 complete.

---

### Step 4 — Migrate legacy online accounts

**Goal:** when the existing migration detects an account that was online in the legacy app, push it to the new server. When it detects a shared online account, map the permissions to the new sharing system.

This phase **extends the existing migration** at [packages/core/src/migration/](../../packages/core/src/migration/) — it does not duplicate or replace any of that work.

**Deliverables:**
- A new post-step in [migration.service.ts](../../packages/core/src/migration/migration.service.ts): after local-side migration completes for an account, inspect the legacy data for an "online account" indicator.
- If online: generate `accountKey`, encrypt the change records produced by the migration, push to the new server.
- If shared (owner / member role detected in the legacy data, via [legacy-api-client.ts](../../packages/core/src/migration/legacy-api-client.ts)): create the corresponding `account_members` rows on the new server. For each non-owner who has also migrated, deliver the wrapped `accountKey`.
- For shared co-owners who have not yet migrated: create a pending invite for them so they receive access when they do.

**Dependencies:** Steps 1–3 complete and stable.

---

### Step 5 — Backend production deployment 

**Goal:** the backend is live in production with monitoring and rollback capability. App store releases of the mobile app follow the normal mobile release process and are out of scope for this plan.

**Deliverables:**
- Production environment provisioned and hardened.
- Monitoring dashboards: registration success rate, sync latency, error rates, recovery completion rate.
- Backend rollback plan + support runbook for common issues.
- Feature flag in the mobile app to gate online features so a backend incident cannot break the app.

**Dependencies:** all prior steps complete; security review passed.

---

## 4. Risk register

| # | Risk | Mitigation |
|---|------|------------|
| 1 | User loses device and cannot complete email recovery → data lost | Recovery flow; explicit user warnings at onboarding |
| 2 | Main server compromised | Zero-knowledge: attacker gets only ciphertext + email hashes |
| 3 | Recovery server compromised | Separate infra; rate-limit recovery attempts |
| 4 | Crypto implementation bug | External security review before backend production deploy |
| 5 | Legacy online migration data loss | Step 4 is an extension of the existing migration; no data is deleted from the legacy server during the process |
| 6 | Concurrent edits on shared accounts cause silent overwrites | LWW with a visible "edited by X" badge in the UI |
| 7 | Schedule slips | Phased delivery; Step 3 scope (sharing) can be trimmed if needed |

---

## 5. Open decisions (non-tooling)

Decisions the team and/or PM still need to make. Tooling choices are excluded — those are owned by the team in Step 0.

| # | Decision | Decide by |
|---|----------|-----------|
| 1 | Magic link UX — deep link only, manual code only, or both | Start of Step 1a |
| 2 | Email validation window length (proposed 24h) | Start of Step 1a |
