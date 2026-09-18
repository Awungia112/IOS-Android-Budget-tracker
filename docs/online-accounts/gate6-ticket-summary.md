# Gate 6 — Legacy Encrypted Push Migration: Test Summary

> **Ticket:** #306 — Gate 6: Legacy encrypted push migration E2E test
> **Date:** 2026-06-30
> **Branch:** test/306-legacy-encrypted-migration-e2e

---

## 1. Scope

Verify that legacy data migrated from the old Budget app is:

1. **Encrypted** with `xsalsa20-poly1305` into `SymmetricEnvelope` format before leaving the client
2. **Pushed** to the server and stored in PostgreSQL as `encrypted_payload` (JSONB)
3. **Deduplicated** by `change_uuid` (unique constraint)
4. **Pulled back** and **decrypted** to original `ChangeRecord` plaintext
5. **Re-runnable** — re-migration produces new records in a separate server account without clashing

---

## 2. Test Files Created

| File | Type | Tests | Description |
|------|------|-------|-------------|
| `packages/core/src/migration/__integration__tests__/encrypted-push.integration.test.ts` | Core integration | 7 | SymmetricEnvelope round-trip, migration with push, key wrapping, re-run |
| `packages/server/src/accounts/encrypted-push.integration.test.ts` | Server integration | 6 | Real payload push/pull/decrypt, dedup, conflict detection, incremental pull |
| `scripts/gate6-manual-e2e.test.ts` | Manual E2E | 14 evidence checks | Full flow against real Docker PG + Fastify + legacy mock |
| `scripts/run-gate6-e2e.sh` | Shell runner | — | Orchestrates the manual E2E test |

### Core-side Tests (7)

| # | Test | What It Verifies |
|---|------|------------------|
| 1 | `seal()`/`open()` round-trip | Plaintext → encrypt → decrypt → original plaintext |
| 2 | Wrong-key rejection | `open()` throws `authentication tag mismatch` with wrong key |
| 3 | `encryptChangeRecord()`/`decryptChangeRecord()` round-trip | All ChangeRecord fields preserved through crypto pipeline |
| 4 | Semantic security | Same plaintext produces different nonces and ciphertexts each time |
| 5 | Full migration round-trip | Real `MigrationService.migrate()` → encrypted ChangeRecords → mock server → decrypt |
| 6 | Key wrapping | `AsymmetricEnvelope` unwraps with user's private key, matches stored account key |
| 7 | Re-run does not duplicate | Second migration call does not push duplicate records |

### Server-side Tests (6)

| # | Test | What It Verifies |
|---|------|------------------|
| 1 | Real payload push/pull/decrypt | SymmetricEnvelope → server → pull → decrypt → original |
| 2 | Deduplication | Re-push same `change_uuid` is idempotent (no duplicate rows) |
| 3 | Cross-account conflict | Different account using same `change_uuid` returns HTTP 409 |
| 4 | Incremental pull | `since` parameter returns only records after a sequence number |
| 5 | Authentication enforcement | Request without valid JWT returns HTTP 403 |
| 6 | Multiple nonces | Each payload has unique nonce, all stored and retrieved correctly |

### Manual E2E Evidence Checks (14)

| # | Check | What It Proves |
|---|-------|----------------|
| 1 | Migration success | End-to-end migration works |
| 2 | ChangeLog count matches fixture | All records captured in local IndexedDB |
| 3 | Upload queue drained after push | Queue successfully cleared after server acknowledges |
| 4 | SQL: records, unique change_uuids, algorithm | Data correctly stored in PostgreSQL |
| 5 | `encrypted_payload->>'alg' = 'xsalsa20-poly1305'` | Encryption algorithm consistent |
| 6 | No duplicate change_uuids | Unique constraint working |
| 7 | Round-trip decryption works | Pulled records decrypt back to original ChangeRecords |
| 8 | Account key exists on server | Key provisioning during migration works |
| 9 | Re-run produces fresh records | Second execution creates new server account |
| 10 | SQL after re-run | No duplication across runs |
| 11 | No duplicate change_uuids after re-run | Cross-run isolation |
| 12 | Algorithm still correct after re-run | Consistency maintained |
| 13 | Second account records decrypt | Both accounts properly provisioned |
| 14 | No blocking bugs | All criteria satisfied |

---

## 3. Architecture Verified

```
User's Browser / Test             Server (Fastify)                PostgreSQL
┌─────────────────────────┐     ┌─────────────────┐           ┌──────────────┐
│ MigrationService        │     │ POST /v1/accounts│           │ change_records│
│  migrate()              │ ──▶ │ :id/records     │ ─────────▶ │  - id (PK)   │
│  ├─ provisionAndLoadKey │     │ pushChangeRecords│           │  - account_id │
│  ├─ importData()        │     │  ├─ authorize    │           │  - sequence   │
│  └─ pushQueueForAccount │     │  ├─ deduplicate  │           │  - encrypted_ │
│                         │     │  └─ insert       │           │    payload    │
│ ChangeLog.append()      │     │                  │           │    (jsonb)    │
│  └─ encryptChangeRecord │     │ GET /v1/accounts │           │  - change_    │
│     └─ seal()           │ ◀── │ :id/records      │ ◀──────── │    uuid (UQ)  │
│        → SymmetricEnvelope│   │ pullChangeRecords│           │  - created_at  │
│           xsalsa20-     │     │                  │           └──────────────┘
│           poly1305      │     └─────────────────┘
└─────────────────────────┘
```

**Crypto flow:** `ChangeRecord (JSON) → TextEncoder → seal(accountKey) → SymmetricEnvelope { v:1, alg:'xsalsa20-poly1305', nonce, ciphertext } → base64url fields`

---

## 4. How to Run

```bash
# Run core integration tests
pnpm test:integration

# Run server integration tests (requires Docker)
pnpm --filter @budget/server run test

# Run manual E2E test (requires Docker)
bash scripts/run-gate6-e2e.sh
```
