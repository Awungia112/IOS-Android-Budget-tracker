# Gate 6 — Manual E2E Test Output

**Date:** 2026-07-02T12:36:54.095Z
**Environment:** Local Compose Stack (Real PostgreSQL + Real Fastify Server)
**Status:** ✅ PASSED

---

## Test Results

| # | Test | Status | Details |
|---|------|--------|---------|
| 1 | 1. Migration success | ✅ PASS | Accounts imported: 1<br>Transactions imported: 1<br>Records pushed to server: 3 |
| 2 | 2. ChangeLog count matches fixture | ✅ PASS | Expected: 3, Got: 3 |
| 3 | 3. Upload queue drained after push | ✅ PASS | All 1 account(s) have empty upload queues |
| 4 | 4. SQL evidence after first migration | ✅ PASS | Record count: 3<br>Unique change_uuids: 3<br>Algorithms in use: xsalsa20-poly1305<br>Account keys: 1<br>Sample records: 3 |
| 5 | 5. encrypted_payload->>alg = xsalsa20-poly1305 | ✅ PASS | All 3 records have alg='xsalsa20-poly1305' |
| 6 | 6. Unique change_uuid constraint satisfied | ✅ PASS | All 3 records have unique change_uuids (no duplicates) |
| 7 | 7. Round-trip decryption (pull + decrypt) | ✅ PASS | Decrypted 3 records from server back to original ChangeRecords<br>Account key is 32 bytes (xsalsa20-poly1305 key size) |
| 8 | 8. Account key created on server | ✅ PASS | 1 account key(s) found |
| 9 | 9. Re-run migration succeeded | ✅ PASS | Records pushed (second run): 3<br>No data corruption from re-run |
| 10 | 10. SQL evidence after re-run (no duplicates) | ✅ PASS | Total records: 6<br>Unique change_uuids: 6<br>Account keys: 2 |
| 11 | 11. No duplicate change_uuids after re-run | ✅ PASS | All 6 records are still unique<br>Re-run creates records for a new server account without clashing |
| 12 | 12. encrypted_payload->>alg still correct | ✅ PASS | All 6 records still have alg='xsalsa20-poly1305' |
| 13 | 13. Second account records decrypt successfully | ✅ PASS | Decrypted 3 records from the second server account |
| 14 | 14. Blocking bugs found | ✅ NONE | All checks passed. No blocking bugs detected. |

---

## SQL Evidence

### Query: Unique change_uuid + encrypted_payload->>alg
```sql
SELECT change_uuid, account_id, sequence, encrypted_payload->>'alg' AS alg
FROM change_records
ORDER BY sequence;
```

### Query: Distinct algorithms in use
```sql
SELECT DISTINCT encrypted_payload->>'alg' AS algorithm
FROM change_records;
```

### Actual Results

```
change_uuid                          | account_id                           | sequence | alg              
──────────────────────────────────── | ──────────────────────────────────── | ──────── | ─────────────────
edb783e9-20e4-422e-986d-8ba877b7aa90 | 1e068072-cc61-41ab-9def-92ec14d18387 | 1        | xsalsa20-poly1305
ec6ba86a-417d-430f-8ce2-d85e00d0cdb0 | 1e068072-cc61-41ab-9def-92ec14d18387 | 2        | xsalsa20-poly1305
a6b2271a-a6f7-446c-9f9f-9638e559fb8c | 1e068072-cc61-41ab-9def-92ec14d18387 | 3        | xsalsa20-poly1305
631b67d5-0842-407d-ac07-48b3e6c28e9f | 40cf273f-76eb-46d1-8429-eb2c02ffc71a | 4        | xsalsa20-poly1305
797c7aed-d6ce-4bbb-b646-6f3e3c80bc81 | 40cf273f-76eb-46d1-8429-eb2c02ffc71a | 5        | xsalsa20-poly1305
f587293b-c84e-4b1d-bcbf-ec5ba556b201 | 40cf273f-76eb-46d1-8429-eb2c02ffc71a | 6        | xsalsa20-poly1305
```

- 6 records total
- All change_uuids are unique
- All use `xsalsa20-poly1305` algorithm

---

## Blocking Bugs Found

None. All validations passed.

---

## Key Checks Verified

| Check | Result |
|-------|--------|
| Unique change_uuid per record | ✅ All records have distinct change_uuids |
| encrypted_payload->>alg = xsalsa20-poly1305 | ✅ All records use the correct symmetric envelope algorithm |
| Record count before re-run | ✅ See evidence check (#1 3 records) |
| Record count after re-run | ✅ See evidence check (6 records total) |
| No duplicate change_uuids across runs | ✅ Unique constraint verified |
| Round-trip decryption succeeds | ✅ Pulled records decrypt to originals |
| Account keys provisioned | ✅ Keys stored per migration run |
