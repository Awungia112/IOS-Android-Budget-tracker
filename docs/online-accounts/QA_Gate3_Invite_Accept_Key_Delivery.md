# Gate 3: Manual E2E Test — Invite Accept and accountKey Delivery

**Ticket:** #303  
**Date:** 2026-06-17  
**Tester:** Michael (via opencode)  
**Prerequisite:** #285 (accountKey delivery to new member on invite accept) — merged as commit `6c984f4b`  
**Stack:** Local Compose (Docker) — server at `http://127.0.0.1:3095`, PostgreSQL at `localhost:55432`  
**#288 status:** Not merged — invite accept tested via API, not UI

---

## Test Script

The automated E2E test script is at `scripts/gate3-invite-accept-key-delivery.mjs`.  
Run from project root: `node scripts/gate3-invite-accept-key-delivery.mjs`

The script exercises the complete two-user invite + key delivery flow using the server API directly (since #288 UI is not merged). It:

1. Registers two test users (owner + recipient) with X25519 keypairs
2. Validates both users in the DB (simulating magic-link verification)
3. Creates session JWTs for both users
4. Owner creates an account with a wrapped accountKey
5. Owner invites recipient
6. Recipient lists and accepts the invite
7. Owner polls for pending key requests
8. Owner fetches recipient's public key
9. Owner wraps and delivers the accountKey to recipient
10. Verifies DB state (account_keys, account_members)
11. Recipient fetches, unwraps, and verifies the accountKey
12. Owner pushes encrypted data; recipient decrypts it
13. Verifies plaintext accountKey never leaves client
14. Verifies idempotent key re-delivery (offline/retry safety)
15. Verifies server rejects key delivery before invite acceptance (409)
16. Cleans up all test data

---

## Checklist Results

| # | Checklist Item | Status | Evidence |
|---|---|---|---|
| 1 | #285 merged | ✅ | Commit `6c984f4b` merged into `develop` |
| 2 | Test script prepared for two users: owner and recipient | ✅ | `scripts/gate3-invite-accept-key-delivery.mjs` |
| 3 | Owner invites recipient | ✅ | `POST /v1/accounts/:id/invites` → 201 |
| 4 | Recipient accepts invite (via API, #288 not merged) | ✅ | `POST /v1/invites/:id/accept` → 200, DB status=accepted |
| 5 | Owner foreground/sync cycle detects pending key request | ✅ | `GET /v1/accounts/:id/pending-key-requests` → 200, returns recipient_user_id + public_key |
| 6 | Owner fetches recipient public key | ✅ | `GET /v1/users/:id/public-key` → 200, matches expected key |
| 7 | Owner wraps accountKey for recipient and uploads wrapped key | ✅ | `POST /v1/accounts/:id/keys` → 201 |
| 8 | Owner offline case queues pending key delivery | ✅ (code review + unit tests) | `deliverAccountKeyToRecipient()` enqueues to IndexedDB on transient errors; `isTransientDeliveryError()` classifies network/5xx/429 as transient. Unit tests: "persists to queue when deliver fails and throws", "does not persist to queue for logical delivery failures" |
| 9 | Queued delivery retries successfully when owner is online | ✅ (E2E + unit tests) | E2E: idempotent re-delivery returns 201 (onConflictDoNothing), no duplicate rows. Server rejects pre-acceptance delivery with 409. Unit tests: "delivers pending keys and removes them from queue on success", "keeps failed deliveries in queue for retry", "keeps 429 rate-limit failures in queue for retry" |
| 10 | Recipient fetches, unwraps, and stores accountKey | ✅ | `GET /v1/accounts/:id/keys` → 200, unwrap matches original 32-byte key |
| 11 | Recipient can decrypt and sync shared account data | ✅ | Owner pushed encrypted record → recipient pulled and decrypted successfully: `{"type":"transaction","amount":42.5,"description":"Gate3 test data"}` |
| 12 | DB evidence: owner and recipient account_keys rows at same epoch | ✅ | Both rows at epoch=1, both revoked_at=null (see DB Evidence section) |
| 13 | Confirm plaintext accountKey never leaves client secure storage | ✅ | DB stores only AsymmetricEnvelope (x25519-xsalsa20-poly1305); no raw key material |
| 14 | Blocking bugs filed and linked, or no blocking bugs found | ✅ | No blocking bugs found |
| 15 | Gate 3 passed | ✅ | All checks pass |

---

## Two-User Test Notes

| Property | Owner | Recipient |
|---|---|---|
| Email | `gate3-owner-1781714229461@test.budgetwise.local` | `gate3-recipient-1781714229461@test.budgetwise.local` |
| Email Hash | `10239da1c862928f7d38084276c4f9742126c5afb92b7621bac0de10ad080aa5` | `2c6a8a784ee13b5fc8087344e9739801aff726f058c2ef1e880b940668ef107e` |
| User ID | `b78fab44-8671-4910-b6d2-2f43e075f9ac` | `db53ae29-525c-4495-a9d5-0e6ef070a9b8` |
| Public Key | `Y3IXnWdHyg621JPGj0WVC6cYeZma_15Dsy26c-XQXWw` | `Wxv1G0UCHH4GPBneRkqSav_5f0fNX94ETRBh03ErMmc` |
| Role | owner | member |

**Account ID:** `ee212033-e71c-4664-a7bc-e4e81547d618`  
**Invite ID:** `b102c2d9-0794-4096-804e-711463dd8daa`

---

## DB Proof: Wrapped Key Rows

### `account_keys` table

| account_id | user_id | epoch | created_at | revoked_at |
|---|---|---|---|---|
| `ee212033-e71c-4664-a7bc-e4e81547d618` | `b78fab44-...` (owner) | 1 | `2026-06-17T16:37:09.580Z` | null |
| `ee212033-e71c-4664-a7bc-e4e81547d618` | `db53ae29-...` (recipient) | 1 | `2026-06-17T16:37:10.280Z` | null |

**Both keys at same epoch (1), neither revoked.**

### `account_members` table

| account_id | user_id | role | joined_at | display_email |
|---|---|---|---|---|
| `ee212033-...` | `db53ae29-...` (recipient) | member | `2026-06-17T16:37:10.280Z` | null |
| `ee212033-...` | `b78fab44-...` (owner) | owner | `2026-06-17T16:37:09.580Z` | null |

---

## Proof: Recipient Can Read Shared Account Data

1. Owner encrypted test data `{"type":"transaction","amount":42.5,"description":"Gate3 test data"}` using the accountKey with XSalsa20-Poly1305 (SymmetricEnvelope)
2. Owner pushed the encrypted change record to the server (`POST /v1/accounts/:id/records`)
3. Recipient fetched the record (`GET /v1/accounts/:id/records?since=0`)
4. Recipient unwrapped the accountKey from the AsymmetricEnvelope using their X25519 private key
5. Recipient decrypted the SymmetricEnvelope payload using the unwrapped accountKey
6. **Result:** Recipient successfully recovered the original plaintext data ✅

---

## Proof: Plaintext accountKey Never Leaves Client Secure Storage

The `account_keys` table stores only `AsymmetricEnvelope` objects with algorithm `x25519-xsalsa20-poly1305`. Each row's `wrapped_key` column contains:

```json
{
  "v": 1,
  "alg": "x25519-xsalsa20-poly1305",
  "ciphertext": "<base64url-encoded sealed box>"
}
```

The `crypto_box_seal` function uses an ephemeral X25519 keypair per encryption — the ciphertext can only be decrypted by the holder of the recipient's private key. The 32-byte plaintext accountKey is never transmitted to or stored on the server.

**Code path verification:**
- `wrapAccountKey()` in `packages/core/src/crypto/account-key.ts` calls `wrapKey()` from `envelope.ts`
- `wrapKey()` uses `sodium.crypto_box_seal()` — anonymous sealed box encryption
- `unwrapAccountKey()` uses `sodium.crypto_box_seal_open()` — requires the recipient's private key
- The accountKey is stored locally via `storeAccountKey()` → `PrivateKeyStore` (native Keystore/Keychain on mobile, localStorage on web)
- At no point in the server code is the plaintext accountKey handled

---

## Offline/Queue Retry Behavior

### Server-side verification (E2E):

1. **Idempotent re-delivery:** Re-sending `POST /v1/accounts/:id/keys` with the same wrapped key returns 201 (onConflictDoNothing). No duplicate `account_keys` rows are created — total count remains 2 (owner + recipient).

2. **Pre-acceptance delivery rejection:** Attempting `POST /v1/accounts/:id/keys` for a user whose invite has not been accepted returns `409 invite_not_accepted`. This is the server-side guard that makes client-side retry safe — the owner can safely retry because the server validates the invite state.

3. **Pending key requests cleared:** After successful delivery, `GET /v1/accounts/:id/pending-key-requests` returns an empty array — no stale entries remain.

### Client-side verification (unit tests):

The client-side queue (`PendingKeyDeliveryQueue` in IndexedDB) is verified by unit tests in `packages/core/src/sync/account-key-lifecycle.test.ts`:

| Test | What it verifies |
|---|---|
| "persists to queue when deliver fails and throws" | Transient errors (network) enqueue the delivery for retry |
| "does not persist to queue for logical delivery failures" | Permanent errors (HTTP 409) do NOT enqueue |
| "keeps failed deliveries in queue for retry" | Transient failures keep the entry in the queue |
| "keeps 429 rate-limit failures in queue for retry" | HTTP 429 is treated as transient |
| "removes permanently failed deliveries from queue" | HTTP 404 removes the entry from the queue |
| "delivers pending keys and removes them from queue on success" | Successful delivery removes the entry |

---

## API Endpoints Exercised

| Method | Path | Purpose | Result |
|---|---|---|---|
| POST | `/users` | Register user | 201 |
| GET | `/v1/nonce` | Get nonce for replay protection | 200 |
| POST | `/v1/accounts` | Create account with owner's wrapped key | 201 |
| POST | `/v1/accounts/:id/invites` | Owner invites recipient | 201 |
| GET | `/v1/invites/pending` | Recipient lists pending invites | 200 |
| POST | `/v1/invites/:id/accept` | Recipient accepts invite | 200 |
| GET | `/v1/accounts/:id/pending-key-requests` | Owner polls for accepted invites | 200 |
| GET | `/v1/users/:id/public-key` | Owner fetches recipient's public key | 200 |
| POST | `/v1/accounts/:id/keys` | Owner delivers wrapped key to recipient | 201 |
| GET | `/v1/accounts/:id/keys` | Recipient fetches their wrapped key | 200 |
| GET | `/v1/accounts` | Recipient lists their accounts | 200 |
| POST | `/v1/accounts/:id/records` | Owner pushes encrypted change record | 200 |
| GET | `/v1/accounts/:id/records` | Recipient pulls change records | 200 |
| GET | `/v1/accounts/:id/sharing` | Owner views sharing info | 200 |
| GET | `/v1/accounts/:id/members` | Recipient views members | 200 |
| POST | `/v1/accounts/:id/keys` | Idempotent re-delivery (duplicate) | 201 |
| POST | `/v1/accounts/:id/keys` | Pre-acceptance delivery (should fail) | 409 |