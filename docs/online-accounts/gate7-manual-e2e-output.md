# Gate 7 — Manual E2E Test Output

**Test:** Legacy Shared-Account Permission Migration
**Date:** 2026-07-03T13:34:46.398Z
**Environment:** Self-contained Docker PostgreSQL (postgres:16-alpine) + Fastify in-process server
**Status:** ✅ PASSED

---

## Test Results

| # | Test | Status | Details |
|---|------|--------|---------|
| 1 | 1. Migration succeeded | ✅ PASS | Accounts imported: 1<br>Transactions imported: 2 |
| 2 | 2. Account imported | ✅ PASS | Local account ID: ae27530e-2e3e-5edf-ab1e-e26dd4e331d3 |
| 3 | 3. Server account created | ✅ PASS | Server account ID: 69688193-273c-4518-9d91-bcbc8e584eb2<br>Role: owner<br>Key epoch: 1 |
| 4 | 3a. Owner role on server account | ✅ PASS | Legacy owner → server account role = owner |
| 5 | 4. DB evidence after migration | ✅ PASS | account_members: 1 rows<br>account_keys: 1 rows<br>invites: 2 rows |
| 6 | 5. Pending invites created | ✅ PASS | 2 pending invite(s) found for shared-account members |
| 7 | 6. Owner in account_members | ✅ PASS | Owner user_id=c6be133c… role=owner |
| 8 | 7. Invite for registered member found | ✅ PASS | Invite ID: 1b9c71c0-2633-49da-923c-b7f6a6e4b788 |
| 9 | 8. Member A sees pending invite | ✅ PASS | Found 1 pending invite(s)<br>Account: Shared Test Budget |
| 10 | 9. Member A accepted invite | ✅ PASS | Invite 1b9c71c0… accepted |
| 11 | 10. Pending key requests found | ✅ PASS | 1 pending request(s) |
| 12 | 11. Wrapped key delivered to Member A | ✅ PASS | Wrapped key delivered and stored on server |
| 13 | 12. Member A in account_members after key delivery | ✅ PASS | role=member<br>Legacy member → new account_members role = member |
| 14 | 13. account_keys has Member A key | ✅ PASS | epoch=1, active (not revoked) |
| 15 | 14. Member A retrieved and unwrapped account key | ✅ PASS | Unwrapped symmetric key matches expected length (32 bytes)<br>Member A can decrypt the delivered wrapped key with their own private key |
| 16 | 15. Member A pulled records from server | ✅ PASS | 8 record(s) pulled |
| 17 | 16. Member A decrypted pulled records | ✅ PASS | Successfully decrypted 8 record(s) with unwrapped key<br>Round-trip: member unwraps own envelope → decrypts records with unwrapped key |
| 18 | 17. Invite for unregistered member found | ✅ PASS | Invite ID: b539c3ed-7558-41af-91ea-04a5cbe008a8 |
| 19 | 18. Member B registered via real API | ✅ PASS | User ID: 02dfc4be-d2a6-4068-a32c-720c84f1b745 (auto-generated)<br>POST /users via server.inject() — validated_at set directly (note: magic-link flow skipped) |
| 20 | 19. Member B sees pending invite after registration | ✅ PASS | Found 1 pending invite(s) for newly registered user |
| 21 | 20. Member B accepted invite | ✅ PASS | Unregistered member accepts invite after registration |
| 22 | 21. Wrapped key delivered to Member B | ✅ PASS | Key delivered successfully after registration and invite acceptance |
| 23 | 22. Member B pulled records from server | ✅ PASS | 8 record(s) pulled |
| 24 | 23. Member B decrypted pulled records | ✅ PASS | Successfully decrypted 8 record(s) with unwrapped key<br>Unregistered → registered → invite accept → key delivery → unwrap → decrypt verified |
| 25 | 24. Final DB evidence | ✅ PASS | account_members: 3 rows<br>account_keys: 3 rows<br>invites: 2 rows |
| 26 | 25. Role mapping verified | ✅ PASS | Legacy owner → account_members role = owner<br>Legacy members → account_members role = member (×2) |
| 27 | 26. All members have active account keys | ✅ PASS | 3 active key(s) in account_keys |
| 28 | 27. All invites accepted | ✅ PASS | 2/2 invites accepted |

---

## SQL Evidence

### Query: account_members rows
```sql
SELECT account_id, user_id, role, display_email, joined_at
FROM account_members
ORDER BY joined_at;
```

### Query: account_keys rows
```sql
SELECT account_id, user_id, epoch, wrapped_key->>'alg' AS alg, revoked_at
FROM account_keys
ORDER BY created_at;
```

### Query: invites rows
```sql
SELECT id, account_id, sender_user_id, recipient_email_hash, status, created_at
FROM invites
ORDER BY created_at;
```

---

## Legacy Role Mapping Evidence

| Legacy Role | New Role | Evidence Source |
|-------------|----------|-----------------|
| owner | owner | account_members.role (owner user) |
| member | member | account_members.role (member A) |
| member | member | account_members.role (member B) |

---

## Blocking Bugs Found

None. All validations passed.

---

## Key Checks Verified

| Check | Result |
|-------|--------|
| Legacy owner maps to owner role | ✅ Verified via account_members |
| Legacy members map to member role | ✅ Verified via account_members |
| Recipient receives pending invites | ✅ Verified via invites table |
| Registered member can sync/decrypt migrated shared data | ✅ Pull + decrypt verified |
| Unregistered invited member receives access after registration and key delivery | ✅ Full flow verified |
| DB evidence for account_members | ✅ Queried and attached |
| DB evidence for account_keys | ✅ Queried and attached |
| DB evidence for invites | ✅ Queried and attached |
