# Gate 6 — Legacy Encrypted Push Migration E2E Test Evidence Report

**Date:** 2026-06-30  
**Status:** ✅ PASSED  
**Gate:** Gate 6 — Legacy encrypted push migration E2E test

---

## Summary

Gate 6 verifies that the full encrypted push migration flow works end-to-end: ChangeRecords produced during legacy data migration are encrypted with the account key into SymmetricEnvelope payloads, pushed to the server, and can be decrypted back to the original data without loss.

Two integration test suites and one manual E2E script were created:

1. **Core-side** (`packages/core/.../encrypted-push.integration.test.ts`) — 7 tests
2. **Server-side** (`packages/server/.../encrypted-push.integration.test.ts`) — 6 tests
3. **Manual E2E** (`scripts/gate6-manual-e2e.test.ts`) — 14 evidence checks

---

## Core-Side Integration Tests (7 tests)

### SymmetricEnvelope round-trip

| Test | Result |
|------|--------|
| Encrypts a ChangeRecord with `seal()` and decrypts it back with `open()` | ✅ PASS |
| Rejects decryption with the wrong key (authentication tag mismatch) | ✅ PASS |

**Verified:**
- `seal()` produces a valid `SymmetricEnvelope` with `v: 1`, `alg: 'xsalsa20-poly1305'`, `nonce`, and `ciphertext`
- `open()` recovers the original plaintext byte-for-byte
- Wrong-key decryption throws `'Decryption failed: authentication tag mismatch'`

### ChangeRecord crypto round-trip

| Test | Result |
|------|--------|
| `encryptChangeRecord()` / `decryptChangeRecord()` preserves all fields | ✅ PASS |
| Produces different nonces for the same plaintext (semantic security) | ✅ PASS |

**Verified:**
- `encryptChangeRecord()` serializes a ChangeRecord to JSON, encodes to bytes, and seals it
- `decryptChangeRecord()` opens the envelope and deserializes back to the original ChangeRecord
- Each encryption produces a unique nonce (24-byte random), ensuring semantic security
- Different nonces produce different ciphertexts for the same plaintext

### Migration with encrypted push — round-trip verification

| Test | Result |
|------|--------|
| Encrypts ChangeRecords during migration and decrypts them back to original data | ✅ PASS |
| Wraps the account key so the server-stored key can be unwrapped by the user | ✅ PASS |
| Pushes all command types through the encrypted pipeline without data loss | ✅ PASS |
| Does not duplicate pushed records when migration is re-run | ✅ PASS |

**Verified:**
- `MigrationService.migrate()` with `pushProvider` provisions an account key, wraps it with the user's public key, and stores it locally
- Every ChangeRecord produced during `importData()` is encrypted into a SymmetricEnvelope and enqueued in the upload queue
- Each pushed envelope can be decrypted back to the original ChangeRecord using the stored account key
- The wrapped key (AsymmetricEnvelope) can be unwrapped using the user's private key
- Re-running migration does not duplicate records (importData skips existing entities)
- The upload queue is drained after a successful push
- No sensitive data leaks into IndexedDB or localStorage

---

## Server-Side Integration Tests (6 tests)

All server-side tests use Docker PostgreSQL and real libsodium crypto (no mocks).

| Test | Result |
|------|--------|
| Pushes real SymmetricEnvelope payloads, pulls them back, and decrypts them | ✅ PASS |
| Deduplicates real encrypted payloads by change_uuid | ✅ PASS |
| Rejects cross-account conflict with real encrypted payloads | ✅ PASS |
| Pulls records incrementally with `since` parameter | ✅ PASS |
| Rejects unauthorized access to encrypted records | ✅ PASS |
| Stores and retrieves multiple encrypted payloads with different nonces | ✅ PASS |

**Verified:**
- Real `xsalsa20-poly1305` SymmetricEnvelope payloads accepted by push endpoint
- Pulled payloads byte-identical to what was pushed
- Round-trip decrypt succeeds: `seal()` → push → pull → `open()` recovers original plaintext
- Deduplication by `change_uuid` works correctly (idempotent push)
- Cross-account conflict detection returns HTTP 409 with `change_uuid_conflict`
- Incremental pull with `since` parameter works correctly
- Unauthorized access returns HTTP 403 with `account_key_not_found`
- Multiple records with same plaintext but different nonces stored correctly
- All nonces unique (semantic security at storage layer)
- `encrypted_payload->>'alg'` correctly stores `'xsalsa20-poly1305'`

---

## Files Created

| File | Purpose |
|------|---------|
| `packages/core/src/migration/__integration__tests__/encrypted-push.integration.test.ts` | Core-side Gate 6 E2E test (7 tests) |
| `packages/server/src/accounts/encrypted-push.integration.test.ts` | Server-side Gate 6 E2E test (6 tests) |
| `scripts/gate6-manual-e2e.test.ts` | Manual E2E test script (14 evidence checks) |
| `scripts/run-gate6-e2e.sh` | Shell orchestrator for manual E2E |
| `docs/online-accounts/gate6-evidence-report.md` | This evidence report |
| `docs/online-accounts/gate6-manual-e2e-output.md` | Manual E2E detailed output |
| `docs/online-accounts/gate6-ticket-summary.md` | Ticket system test summary |

---

## Conclusion

Gate 6 is **PASSED**. The legacy encrypted push migration E2E tests verify that:

1. **Encryption round-trip**: ChangeRecords → SymmetricEnvelope → decrypt → original without loss
2. **Key management**: Account keys generated, wrapped with user's public key, stored locally, unwrappable
3. **Server storage**: Real encrypted payloads stored in PostgreSQL as JSONB, pulled back intact
4. **Semantic security**: Different nonces per encryption → same plaintext → different ciphertexts
5. **Deduplication**: Server deduplicates by `change_uuid` (idempotent push)
6. **Conflict detection**: Cross-account UUID conflicts detected and rejected with HTTP 409
7. **Authorization**: Unauthorized access rejected with HTTP 403
8. **Incremental sync**: `since` parameter correctly filters records
9. **Re-run isolation**: Re-migration creates new server account + key; no cross-run collisions
10. **SQL evidence**: PostgreSQL stores `change_uuid` (unique), `sequence` (bigserial), `encrypted_payload` (JSONB with `v:1`, `alg:'xsalsa20-poly1305'`)
