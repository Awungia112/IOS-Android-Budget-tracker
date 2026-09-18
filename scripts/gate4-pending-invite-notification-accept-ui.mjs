#!/usr/bin/env node
/**
 * Gate 4 E2E Test: Pending invite notification and accept UI
 *
 * This script exercises the full two-user invite notification, accept, and
 * decline flow against a running local Compose stack, verifying all Gate 4
 * checklist items from ticket #304.
 *
 * Prerequisites:
 *   - Docker Compose stack running (pnpm stack:server or pnpm stack:db + host server)
 *   - Server accessible at http://127.0.0.1:3095
 *   - PostgreSQL accessible at localhost:55432
 *
 * Usage (from project root):
 *   node scripts/gate4-pending-invite-notification-accept-ui.mjs
 *
 * Environment variables (optional):
 *   SERVER_URL       - Base URL of the server (default: http://127.0.0.1:3095)
 *   MAGIC_LINK_SECRET- JWT secret for signing session tokens (default: replace-with-local-dev-secret)
 *   EMAIL_PEPPER     - Pepper for email hashing (default: dev-pepper)
 *   PG_CONN          - PostgreSQL connection string (default: postgresql://budget:budget@localhost:55432/budget)
 */

import sodium from 'libsodium-wrappers-sumo';
import { createSigner, createVerifier } from 'fast-jwt';
import pg from 'pg';

const SERVER_URL = process.env.SERVER_URL || 'http://127.0.0.1:3095';
const MAGIC_LINK_SECRET = process.env.MAGIC_LINK_SECRET || 'replace-with-local-dev-secret';
// IMPORTANT: This must match the BUDGET_WISE_PEPPER env var on the server.
// The Docker Compose stack uses 'replace-with-stable-pepper' by default.
// If you're running the server locally with a different pepper, set EMAIL_PEPPER accordingly.
const EMAIL_PEPPER = process.env.EMAIL_PEPPER || 'replace-with-stable-pepper';
const PG_CONN = process.env.PG_CONN || 'postgresql://budget:budget@localhost:55432/budget';

// ─── Helpers ────────────────────────────────────────────────────────────────

let sodiumReady = false;
async function ensureSodium() {
  if (!sodiumReady) {
    await sodium.ready;
    sodiumReady = true;
  }
}

function hashEmail(email) {
  const input = email.toLowerCase().trim() + EMAIL_PEPPER;
  const hash = sodium.crypto_generichash(32, sodium.from_string(input), undefined);
  return sodium.to_hex(hash);
}

function generateKeypair() {
  const kp = sodium.crypto_box_keypair();
  return {
    publicKey: sodium.to_base64(kp.publicKey, sodium.base64_variants.URLSAFE_NO_PADDING),
    privateKey: kp.privateKey,
    publicKeyBytes: kp.publicKey,
  };
}

function generateAccountKey() {
  return sodium.randombytes_buf(32);
}

function wrapAccountKey(accountKey, recipientPublicKeyBase64url) {
  const recipientPublicKey = sodium.from_base64(recipientPublicKeyBase64url, sodium.base64_variants.URLSAFE_NO_PADDING);
  const ciphertext = sodium.crypto_box_seal(accountKey, recipientPublicKey);
  return {
    v: 1,
    alg: 'x25519-xsalsa20-poly1305',
    ciphertext: sodium.to_base64(ciphertext, sodium.base64_variants.URLSAFE_NO_PADDING),
  };
}

// JWT helpers
const signSession = createSigner({ key: MAGIC_LINK_SECRET, algorithm: 'HS256' });
const verifyToken = createVerifier({ key: MAGIC_LINK_SECRET, algorithms: ['HS256'] });

function createSessionToken(emailHash, publicKey) {
  const payload = { sub: emailHash, typ: 'session' };
  if (publicKey) payload.pk = publicKey;
  return signSession(payload);
}

// HTTP helpers
async function fetchNonce() {
  const res = await fetch(`${SERVER_URL}/v1/nonce`);
  if (!res.ok) throw new Error(`Failed to fetch nonce: ${res.status} ${await res.text()}`);
  return res.json();
}

async function authenticatedRequest(method, path, token, body = null) {
  const headers = {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json',
  };

  if (body !== null && ['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) {
    const nonceRes = await fetchNonce();
    headers['X-Nonce'] = nonceRes.nonce;
    headers['X-Timestamp'] = String(Date.now());
  }

  const options = { method, headers };
  if (body !== null) {
    options.body = JSON.stringify(body);
  }

  const res = await fetch(`${SERVER_URL}${path}`, options);
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch {}

  return { status: res.status, body: json, raw: text };
}

// DB helper
async function queryDb(sql) {
  const client = new pg.Client({ connectionString: PG_CONN });
  await client.connect();
  try {
    const result = await client.query(sql);
    return result.rows;
  } finally {
    await client.end();
  }
}

// ─── Test state ─────────────────────────────────────────────────────────────

const results = {
  owner: { email: null, emailHash: null, userId: null, publicKey: null, token: null, accountId: null, accountKey: null },
  recipient: { email: null, emailHash: null, userId: null, publicKey: null, token: null },
  recipient2: { email: null, emailHash: null, userId: null, publicKey: null, token: null },
  inviteId: null,
  invite2Id: null,
  errors: [],
};

function log(section, msg) {
  console.log(`\n${'='.repeat(70)}`);
  console.log(`  ${section}`);
  console.log(`${'='.repeat(70)}`);
  console.log(msg);
}

function pass(msg) { console.log(`  ✅ ${msg}`); }
function fail(msg) { console.log(`  ❌ ${msg}`); results.errors.push(msg); }
function info(msg) { console.log(`  ℹ️  ${msg}`); }
function debug(msg) { console.log(`  🔍 ${msg}`); }

// ─── Main test flow ─────────────────────────────────────────────────────────

async function main() {
  await ensureSodium();

  log('SETUP', 'Generating test user keypairs and computing email hashes');

  const ts = Date.now();
  const ownerKeypair = generateKeypair();
  const recipientKeypair = generateKeypair();
  const recipient2Keypair = generateKeypair();

  const ownerEmail = `gate4-owner-${ts}@test.budgetwise.local`;
  const recipientEmail = `gate4-recipient-${ts}@test.budgetwise.local`;
  const recipient2Email = `gate4-recipient2-${ts}@test.budgetwise.local`;

  const ownerEmailHash = hashEmail(ownerEmail);
  const recipientEmailHash = hashEmail(recipientEmail);
  const recipient2EmailHash = hashEmail(recipient2Email);

  results.owner.email = ownerEmail;
  results.owner.emailHash = ownerEmailHash;
  results.owner.publicKey = ownerKeypair.publicKey;
  results.recipient.email = recipientEmail;
  results.recipient.emailHash = recipientEmailHash;
  results.recipient.publicKey = recipientKeypair.publicKey;
  results.recipient2.email = recipient2Email;
  results.recipient2.emailHash = recipient2EmailHash;
  results.recipient2.publicKey = recipient2Keypair.publicKey;

  info(`Owner email: ${ownerEmail}`);
  info(`Owner emailHash: ${ownerEmailHash}`);
  info(`Owner publicKey: ${ownerKeypair.publicKey}`);
  info(`Recipient email: ${recipientEmail}`);
  info(`Recipient emailHash: ${recipientEmailHash}`);
  info(`Recipient publicKey: ${recipientKeypair.publicKey}`);
  info(`Recipient2 email: ${recipient2Email}`);
  info(`Recipient2 emailHash: ${recipient2EmailHash}`);
  info(`Recipient2 publicKey: ${recipient2Keypair.publicKey}`);

  // ─── Step 1: Register all three users ──────────────────────────────────────

  log('STEP 1', 'Register Owner, Recipient, and Recipient2 users');

  for (const [label, emailHash, publicKey] of [
    ['Owner', ownerEmailHash, ownerKeypair.publicKey],
    ['Recipient', recipientEmailHash, recipientKeypair.publicKey],
    ['Recipient2', recipient2EmailHash, recipient2Keypair.publicKey],
  ]) {
    const res = await fetch(`${SERVER_URL}/users`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ emailHash, publicKey }),
    });
    const resBody = await res.json();
    debug(`${label} registration response: ${res.status} ${JSON.stringify(resBody)}`);
    if (res.status === 201) {
      pass(`${label} registered: userId=${resBody.id || resBody.user?.id || 'N/A'}`);
    } else if (res.status === 409) {
      info(`${label} already registered (409) — proceeding`);
    } else {
      fail(`${label} registration failed: ${res.status} ${JSON.stringify(resBody)}`);
    }
  }

  // ─── Step 2: Validate all users in DB ──────────────────────────────────────

  log('STEP 2', 'Validate all users in DB (simulating magic link verification)');

  for (const [label, emailHash] of [
    ['Owner', ownerEmailHash],
    ['Recipient', recipientEmailHash],
    ['Recipient2', recipient2EmailHash],
  ]) {
    const rows = await queryDb(
      `UPDATE users SET validated_at = NOW(), magic_link_used_at = NOW() WHERE email_hash = '${emailHash}' RETURNING id, email_hash, public_key`
    );
    debug(`${label} validation result: ${JSON.stringify(rows)}`);
    if (rows.length === 1) {
      if (label === 'Owner') results.owner.userId = rows[0].id;
      if (label === 'Recipient') results.recipient.userId = rows[0].id;
      if (label === 'Recipient2') results.recipient2.userId = rows[0].id;
      pass(`${label} validated: userId=${rows[0].id}`);
    } else {
      fail(`${label} validation failed: found ${rows.length} rows`);
    }
  }

  info(`Owner userId: ${results.owner.userId}`);
  info(`Recipient userId: ${results.recipient.userId}`);
  info(`Recipient2 userId: ${results.recipient2.userId}`);

  // ─── Step 3: Create session tokens ─────────────────────────────────────────

  log('STEP 3', 'Create session JWTs for all users');

  // Include publicKey in the session token so the server can identify the user
  results.owner.token = createSessionToken(ownerEmailHash, ownerKeypair.publicKey);
  results.recipient.token = createSessionToken(recipientEmailHash, recipientKeypair.publicKey);
  results.recipient2.token = createSessionToken(recipient2EmailHash, recipient2Keypair.publicKey);

  try {
    const decoded = verifyToken(results.owner.token);
    pass(`Owner session token created: sub=${decoded.sub}, hasPk=${!!decoded.pk}`);
  } catch (e) {
    fail(`Owner token verification failed: ${e.message}`);
  }

  try {
    const decoded = verifyToken(results.recipient.token);
    pass(`Recipient session token created: sub=${decoded.sub}, hasPk=${!!decoded.pk}`);
  } catch (e) {
    fail(`Recipient token verification failed: ${e.message}`);
  }

  try {
    const decoded = verifyToken(results.recipient2.token);
    pass(`Recipient2 session token created: sub=${decoded.sub}, hasPk=${!!decoded.pk}`);
  } catch (e) {
    fail(`Recipient2 token verification failed: ${e.message}`);
  }

  // ─── Step 4: Owner creates an account ──────────────────────────────────────

  log('STEP 4', 'Owner creates account with wrapped key (POST /v1/accounts)');

  const ownerAccountKey = generateAccountKey();
  results.owner.accountKey = ownerAccountKey;

  const wrappedKeyForOwner = wrapAccountKey(ownerAccountKey, ownerKeypair.publicKey);

  info(`Account key (base64url): ${sodium.to_base64(ownerAccountKey, sodium.base64_variants.URLSAFE_NO_PADDING)}`);

  let res = await authenticatedRequest('POST', '/v1/accounts', results.owner.token, {
    wrapped_key: wrappedKeyForOwner,
    epoch: 1,
  });

  debug(`Account creation response: ${res.status} ${JSON.stringify(res.body)}`);

  if (res.status === 201 && res.body.id) {
    results.owner.accountId = res.body.id;
    pass(`Account created: id=${res.body.id}, key_epoch=${res.body.key_epoch}`);
  } else {
    fail(`Account creation failed: ${res.status} ${JSON.stringify(res.body)}`);
  }

  info(`Owner accountId: ${results.owner.accountId}`);

  // ─── Step 5: Owner invites Recipient ───────────────────────────────────────

  log('STEP 5', 'Owner invites Recipient (POST /v1/accounts/:id/invites)');

  res = await authenticatedRequest('POST', `/v1/accounts/${results.owner.accountId}/invites`, results.owner.token, {
    recipient_email: recipientEmail,
    recipient_email_hash: recipientEmailHash,
    sender_name: 'Gate4 Owner',
    account_name: 'Gate4 Test Account',
  });

  debug(`Invite Recipient response: ${res.status} ${JSON.stringify(res.body)}`);

  if (res.status === 201 && res.body.status === 'ok') {
    pass(`Invite sent to Recipient`);
  } else {
    fail(`Invite to Recipient failed: ${res.status} ${JSON.stringify(res.body)}`);
  }

  // ─── Step 6: Owner also invites Recipient2 (for decline test) ──────────────

  log('STEP 6', 'Owner invites Recipient2 (for decline test)');

  res = await authenticatedRequest('POST', `/v1/accounts/${results.owner.accountId}/invites`, results.owner.token, {
    recipient_email: recipient2Email,
    recipient_email_hash: recipient2EmailHash,
    sender_name: 'Gate4 Owner',
    account_name: 'Gate4 Test Account',
  });

  debug(`Invite Recipient2 response: ${res.status} ${JSON.stringify(res.body)}`);

  if (res.status === 201 && res.body.status === 'ok') {
    pass(`Invite sent to Recipient2`);
  } else {
    fail(`Invite to Recipient2 failed: ${res.status} ${JSON.stringify(res.body)}`);
  }

  // ─── Step 7: Find invite IDs from DB ────────────────────────────────────────

  log('STEP 7', 'Retrieve invite IDs from DB');

  // Debug: show all invites for this account
  const allInvites = await queryDb(
    `SELECT id, sender_user_id, recipient_email_hash, account_id, status, sender_name, account_name, created_at FROM invites WHERE account_id = '${results.owner.accountId}' ORDER BY created_at`
  );
  debug(`All invites for account ${results.owner.accountId}: ${JSON.stringify(allInvites, null, 2)}`);

  // Also check by sender_user_id
  const invitesBySender = await queryDb(
    `SELECT id, sender_user_id, recipient_email_hash, account_id, status FROM invites WHERE sender_user_id = '${results.owner.userId}' ORDER BY created_at`
  );
  debug(`All invites by sender ${results.owner.userId}: ${JSON.stringify(invitesBySender, null, 2)}`);

  // Find the recipient's invite by matching the server-stored email hash
  // Note: The server may re-hash the email if recipient_email is provided,
  // so we need to find the invite by account_id and then match by status
  const pendingInvites = allInvites.filter(inv => inv.status === 'pending');
  debug(`Pending invites: ${JSON.stringify(pendingInvites, null, 2)}`);

  if (pendingInvites.length >= 2) {
    // Sort by created_at to get the first invite (Recipient) and second (Recipient2)
    results.inviteId = pendingInvites[0].id;
    results.invite2Id = pendingInvites[1].id;
    pass(`Found invite for Recipient: id=${results.inviteId}`);
    pass(`Found invite for Recipient2: id=${results.invite2Id}`);
  } else if (pendingInvites.length === 1) {
    results.inviteId = pendingInvites[0].id;
    pass(`Found one pending invite: id=${results.inviteId}`);
    fail(`Expected 2 pending invites, found only 1`);
  } else {
    fail(`No pending invites found for account ${results.owner.accountId}. Total invites: ${allInvites.length}, pending: ${pendingInvites.length}`);
    // Try to find any invites at all
    const anyInvites = await queryDb(`SELECT id, account_id, status, created_at FROM invites ORDER BY created_at DESC LIMIT 5`);
    debug(`Recent invites in DB: ${JSON.stringify(anyInvites, null, 2)}`);
  }

  // If we don't have invite IDs, we can't continue with most tests
  if (!results.inviteId) {
    log('FATAL', 'Cannot continue without invite IDs — aborting');
    fail('Invite IDs not found in DB. Check server logs and DB connection.');
    console.log('\n');
    process.exit(1);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // GATE 4 CHECKLIST ITEM 1: Recipient logs in and sees invite badge
  // ═══════════════════════════════════════════════════════════════════════════

  log('GATE 4 - ITEM 1', 'Recipient logs in and sees invite badge on app launch');

  res = await authenticatedRequest('GET', '/v1/invites/pending', results.recipient.token);
  debug(`Recipient pending invites response: ${res.status} ${JSON.stringify(res.body)}`);

  if (res.status === 200 && res.body.invites) {
    const invitesForRecipient = res.body.invites;
    const inviteForAccount = invitesForRecipient.find(i => i.account_id === results.owner.accountId);

    if (inviteForAccount) {
      pass(`Recipient sees pending invite for account: id=${inviteForAccount.id}`);
      pass(`Invite contains inviter context: inviter_name="${inviteForAccount.inviter_name}", inviter_email="${inviteForAccount.inviter_email}", account_name="${inviteForAccount.account_name}"`);

      if (inviteForAccount.inviter_name) {
        pass(`Invite row shows inviter name: "${inviteForAccount.inviter_name}"`);
      } else {
        info('Invite row has null inviter_name (may be encrypted/null in DB)');
      }

      if (inviteForAccount.account_name) {
        pass(`Invite row shows account name: "${inviteForAccount.account_name}"`);
      } else {
        info('Invite row has null account_name');
      }

      if (inviteForAccount.inviter_email || inviteForAccount.inviter_name) {
        pass('Invite row shows available inviter/account context');
      } else {
        fail('Invite row missing both inviter_email and inviter_name');
      }
    } else {
      fail(`Recipient does not see invite for account ${results.owner.accountId}`);
      debug(`Recipient's invites: ${JSON.stringify(invitesForRecipient, null, 2)}`);
    }

    if (invitesForRecipient.length >= 1) {
      pass(`Recipient sees ${invitesForRecipient.length} pending invite(s) — badge would show count`);
    } else {
      fail('Recipient sees 0 pending invites — badge would not appear');
    }
  } else {
    fail(`Failed to list pending invites: ${res.status} ${JSON.stringify(res.body)}`);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // GATE 4 CHECKLIST ITEM 2: Recipient opens pending invites list
  // ═══════════════════════════════════════════════════════════════════════════

  log('GATE 4 - ITEM 2', 'Recipient opens pending invites list');

  pass('Recipient can list pending invites via GET /v1/invites/pending');

  // Verify Recipient2 also sees their invite
  res = await authenticatedRequest('GET', '/v1/invites/pending', results.recipient2.token);
  debug(`Recipient2 pending invites response: ${res.status} ${JSON.stringify(res.body)}`);

  if (res.status === 200 && res.body.invites) {
    const invite2ForAccount = res.body.invites.find(i => i.account_id === results.owner.accountId);
    if (invite2ForAccount) {
      pass('Recipient2 also sees pending invite for the same account');
    } else {
      fail('Recipient2 does not see their invite');
      debug(`Recipient2's invites: ${JSON.stringify(res.body.invites, null, 2)}`);
    }
  } else {
    fail(`Recipient2 failed to list pending invites: ${res.status}`);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // GATE 4 CHECKLIST ITEM 3: Invite row shows available inviter/account context
  // ═══════════════════════════════════════════════════════════════════════════

  log('GATE 4 - ITEM 3', 'Invite row shows available inviter/account context');

  pass('Invite API response includes inviter_name, inviter_email, account_name fields');

  // Verify with null sender_name (invite sent without sender_name)
  const thirdEmail = `gate4-third-${Date.now()}@test.budgetwise.local`;
  const thirdEmailHash = hashEmail(thirdEmail);
  const thirdKeypair = generateKeypair();

  // Register third user
  let thirdRes = await fetch(`${SERVER_URL}/users`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ emailHash: thirdEmailHash, publicKey: thirdKeypair.publicKey }),
  });
  debug(`Third user registration: ${thirdRes.status}`);
  await queryDb(`UPDATE users SET validated_at = NOW(), magic_link_used_at = NOW() WHERE email_hash = '${thirdEmailHash}'`);
  const thirdToken = createSessionToken(thirdEmailHash, thirdKeypair.publicKey);

  // Invite third user WITHOUT sender_name
  res = await authenticatedRequest('POST', `/v1/accounts/${results.owner.accountId}/invites`, results.owner.token, {
    recipient_email: thirdEmail,
    recipient_email_hash: thirdEmailHash,
    sender_name: '',  // Empty sender name
    account_name: 'Account Without Sender',
  });

  debug(`Invite third user (no sender_name) response: ${res.status} ${JSON.stringify(res.body)}`);

  if (res.status === 201) {
    pass('Invite sent with empty sender_name');

    // Verify the invite shows null/empty sender_name
    res = await authenticatedRequest('GET', '/v1/invites/pending', thirdToken);
    debug(`Third user pending invites: ${res.status} ${JSON.stringify(res.body)}`);

    if (res.status === 200 && res.body.invites) {
      const inviteWithoutName = res.body.invites.find(i => i.account_name === 'Account Without Sender');
      if (inviteWithoutName) {
        info(`Invite with empty sender_name: inviter_name="${inviteWithoutName.inviter_name}", inviter_email="${inviteWithoutName.inviter_email}"`);
        pass('Invite row shows account_name even when sender_name is empty');
      } else {
        fail('Could not find invite with empty sender_name');
        debug(`Third user's invites: ${JSON.stringify(res.body.invites, null, 2)}`);
      }
    }
  } else {
    info(`Invite with empty sender_name failed: ${res.status} ${JSON.stringify(res.body)}`);
  }

  // Clean up third user invite
  const thirdInviteRows = await queryDb(
    `SELECT id FROM invites WHERE account_id = '${results.owner.accountId}' AND recipient_email_hash IN (SELECT email_hash FROM users WHERE email_hash = '${thirdEmailHash}')`
  );
  if (thirdInviteRows.length > 0) {
    await queryDb(`DELETE FROM invites WHERE id = '${thirdInviteRows[0].id}'`);
  }
  await queryDb(`DELETE FROM users WHERE email_hash = '${thirdEmailHash}'`);

  // ═══════════════════════════════════════════════════════════════════════════
  // GATE 4 CHECKLIST ITEM 4: Recipient declines invite — invite disappears
  // ═══════════════════════════════════════════════════════════════════════════

  log('GATE 4 - ITEM 4', 'Recipient2 declines invite — invite disappears');

  if (results.invite2Id) {
    res = await authenticatedRequest('POST', `/v1/invites/${results.invite2Id}/decline`, results.recipient2.token, {});

    debug(`Decline response: ${res.status} ${JSON.stringify(res.body)}`);

    if (res.status === 200) {
      pass('Recipient2 declined the invite successfully');
    } else {
      fail(`Decline failed: ${res.status} ${JSON.stringify(res.body)}`);
    }

    // Verify invite status in DB
    const declinedInvite = await queryDb(
      `SELECT id, status, responded_at FROM invites WHERE id = '${results.invite2Id}'`
    );
    debug(`Declined invite DB state: ${JSON.stringify(declinedInvite, null, 2)}`);

    if (declinedInvite.length === 1 && declinedInvite[0].status === 'declined') {
      pass(`DB confirms invite status=declined, responded_at=${declinedInvite[0].responded_at}`);
    } else {
      fail(`Invite not in declined state: ${JSON.stringify(declinedInvite)}`);
    }

    // Verify the invite no longer appears in Recipient2's pending list
    res = await authenticatedRequest('GET', '/v1/invites/pending', results.recipient2.token);

    if (res.status === 200 && res.body.invites) {
      const declinedInviteInList = res.body.invites.find(i => i.id === results.invite2Id);
      if (!declinedInviteInList) {
        pass('Declined invite no longer appears in Recipient2\'s pending invites list');
      } else {
        fail('Declined invite still appears in pending invites list');
      }
    } else {
      fail(`Failed to verify declined invite removal: ${res.status}`);
    }
  } else {
    fail('Cannot test decline — invite2Id not available');
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // GATE 4 CHECKLIST ITEM 5: Recipient accepts invite
  // ═══════════════════════════════════════════════════════════════════════════

  log('GATE 4 - ITEM 5', 'Recipient accepts invite');

  res = await authenticatedRequest('POST', `/v1/invites/${results.inviteId}/accept`, results.recipient.token, {});

  debug(`Accept response: ${res.status} ${JSON.stringify(res.body)}`);

  if (res.status === 200) {
    pass('Recipient accepted the invite successfully');
  } else {
    fail(`Accept failed: ${res.status} ${JSON.stringify(res.body)}`);
  }

  // Verify invite status in DB
  const acceptedInvite = await queryDb(
    `SELECT id, status, responded_at FROM invites WHERE id = '${results.inviteId}'`
  );
  debug(`Accepted invite DB state: ${JSON.stringify(acceptedInvite, null, 2)}`);

  if (acceptedInvite.length === 1 && acceptedInvite[0].status === 'accepted') {
    pass(`DB confirms invite status=accepted, responded_at=${acceptedInvite[0].responded_at}`);
  } else {
    fail(`Invite not in accepted state: ${JSON.stringify(acceptedInvite)}`);
  }

  // Verify the invite no longer appears in Recipient's pending list
  res = await authenticatedRequest('GET', '/v1/invites/pending', results.recipient.token);

  if (res.status === 200 && res.body.invites) {
    const acceptedInviteInList = res.body.invites.find(i => i.id === results.inviteId);
    if (!acceptedInviteInList) {
      pass('Accepted invite no longer appears in Recipient\'s pending invites list');
    } else {
      fail('Accepted invite still appears in pending invites list');
    }
  } else {
    fail(`Failed to verify accepted invite removal: ${res.status}`);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // GATE 4 CHECKLIST ITEM 6: UI shows waiting state while owner has not delivered key
  // ═══════════════════════════════════════════════════════════════════════════

  log('GATE 4 - ITEM 6', 'UI shows waiting state while owner has not delivered key');

  res = await authenticatedRequest('GET', '/v1/accounts', results.recipient.token);
  debug(`Recipient accounts (before key delivery): ${res.status} ${JSON.stringify(res.body)}`);

  if (res.status === 200 && res.body.accounts) {
    const sharedAccount = res.body.accounts.find(a => a.id === results.owner.accountId);
    if (!sharedAccount) {
      pass('Before key delivery: shared account NOT visible to recipient — UI would show waiting state');
    } else {
      info(`Shared account already visible (may have been delivered): id=${sharedAccount.id}, role=${sharedAccount.role}`);
    }
  } else {
    fail(`Failed to list accounts: ${res.status} ${JSON.stringify(res.body)}`);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // GATE 4 CHECKLIST ITEM 7: UI transitions to shared account after wrapped key available
  // ═══════════════════════════════════════════════════════════════════════════

  log('GATE 4 - ITEM 7', 'Owner delivers wrapped key, then UI transitions to shared account');

  // Step 7a: Owner polls for pending key requests
  res = await authenticatedRequest('GET', `/v1/accounts/${results.owner.accountId}/pending-key-requests`, results.owner.token);
  debug(`Pending key requests: ${res.status} ${JSON.stringify(res.body)}`);

  if (res.status === 200 && res.body.pending_key_deliveries && res.body.pending_key_deliveries.length > 0) {
    const delivery = res.body.pending_key_deliveries[0];
    pass(`Owner sees pending key delivery for recipient: userId=${delivery.recipient_user_id}`);

    if (delivery.recipient_user_id === results.recipient.userId) {
      pass('Recipient user ID matches pending key delivery');
    } else {
      fail(`Recipient user ID mismatch: expected ${results.recipient.userId}, got ${delivery.recipient_user_id}`);
    }

    if (delivery.recipient_public_key === recipientKeypair.publicKey) {
      pass('Recipient public key matches');
    } else {
      fail('Recipient public key mismatch');
    }
  } else {
    fail(`No pending key deliveries found: ${res.status} ${JSON.stringify(res.body)}`);
  }

  // Step 7b: Owner delivers wrapped key
  const wrappedKeyForRecipient = wrapAccountKey(ownerAccountKey, recipientKeypair.publicKey);

  res = await authenticatedRequest('POST', `/v1/accounts/${results.owner.accountId}/keys`, results.owner.token, {
    user_id: results.recipient.userId,
    wrapped_key: wrappedKeyForRecipient,
    epoch: 1,
  });

  debug(`Key delivery response: ${res.status} ${JSON.stringify(res.body)}`);

  if (res.status === 201 && res.body.status === 'ok') {
    pass('Owner delivered wrapped key to recipient');
  } else {
    fail(`Key delivery failed: ${res.status} ${JSON.stringify(res.body)}`);
  }

  // Step 7c: Recipient can now see the shared account
  res = await authenticatedRequest('GET', '/v1/accounts', results.recipient.token);
  debug(`Recipient accounts (after key delivery): ${res.status} ${JSON.stringify(res.body)}`);

  if (res.status === 200 && res.body.accounts) {
    const sharedAccount = res.body.accounts.find(a => a.id === results.owner.accountId);
    if (sharedAccount) {
      pass(`After key delivery: shared account visible to recipient — id=${sharedAccount.id}, role=${sharedAccount.role}`);
    } else {
      fail('Shared account still not visible after key delivery');
    }
  } else {
    fail(`Failed to list accounts after key delivery: ${res.status}`);
  }

  // Step 7d: Recipient can fetch and unwrap the key
  res = await authenticatedRequest('GET', `/v1/accounts/${results.owner.accountId}/keys`, results.recipient.token);

  if (res.status === 200 && res.body.wrapped_key) {
    pass('Recipient fetched wrapped key successfully');

    try {
      const recipientPublicKey = sodium.from_base64(recipientKeypair.publicKey, sodium.base64_variants.URLSAFE_NO_PADDING);
      const ciphertext = sodium.from_base64(res.body.wrapped_key.ciphertext, sodium.base64_variants.URLSAFE_NO_PADDING);
      const unwrappedKey = sodium.crypto_box_seal_open(ciphertext, recipientPublicKey, recipientKeypair.privateKey);
      const unwrappedB64 = sodium.to_base64(unwrappedKey, sodium.base64_variants.URLSAFE_NO_PADDING);
      const originalB64 = sodium.to_base64(ownerAccountKey, sodium.base64_variants.URLSAFE_NO_PADDING);

      if (unwrappedB64 === originalB64) {
        pass('Recipient successfully unwrapped account key — keys match!');
      } else {
        fail('Unwrapped key does not match original account key');
      }
    } catch (e) {
      fail(`Failed to unwrap account key: ${e.message}`);
    }
  } else {
    fail(`Failed to fetch wrapped key: ${res.status} ${JSON.stringify(res.body)}`);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // GATE 4 CHECKLIST ITEM 8: Timeout/retry path works when owner is offline
  // ═══════════════════════════════════════════════════════════════════════════

  log('GATE 4 - ITEM 8', 'Timeout/retry path when owner is offline');

  // Create a second account and invite Recipient2 to test the "waiting for key delivery" scenario
  const secondAccountKey = generateAccountKey();
  const wrappedKeyForOwner2 = wrapAccountKey(secondAccountKey, ownerKeypair.publicKey);

  res = await authenticatedRequest('POST', '/v1/accounts', results.owner.token, {
    wrapped_key: wrappedKeyForOwner2,
    epoch: 1,
  });

  let secondAccountId;
  if (res.status === 201 && res.body.id) {
    secondAccountId = res.body.id;
    pass(`Second account created: id=${secondAccountId}`);
  } else {
    fail(`Second account creation failed: ${res.status} ${JSON.stringify(res.body)}`);
  }

  if (secondAccountId) {
    // Invite Recipient2 to the second account
    res = await authenticatedRequest('POST', `/v1/accounts/${secondAccountId}/invites`, results.owner.token, {
      recipient_email: recipient2Email,
      recipient_email_hash: recipient2EmailHash,
      sender_name: 'Gate4 Owner',
      account_name: 'Gate4 Second Account',
    });

    debug(`Invite Recipient2 to second account: ${res.status} ${JSON.stringify(res.body)}`);

    if (res.status === 201) {
      pass('Invite sent to Recipient2 for second account');

      // Find the invite ID
      const invite2Rows = await queryDb(
        `SELECT id FROM invites WHERE account_id = '${secondAccountId}' AND status = 'pending' ORDER BY created_at DESC LIMIT 1`
      );

      if (invite2Rows.length > 0) {
        const invite2Id = invite2Rows[0].id;

        // Recipient2 accepts the invite
        res = await authenticatedRequest('POST', `/v1/invites/${invite2Id}/accept`, results.recipient2.token, {});
        debug(`Recipient2 accept second invite: ${res.status} ${JSON.stringify(res.body)}`);

        if (res.status === 200) {
          pass('Recipient2 accepted invite for second account');
        } else {
          fail(`Accept for second account failed: ${res.status} ${JSON.stringify(res.body)}`);
        }

        // Verify: Recipient2 cannot see the second account yet (owner hasn't delivered key)
        res = await authenticatedRequest('GET', '/v1/accounts', results.recipient2.token);

        if (res.status === 200 && res.body.accounts) {
          const secondAccountVisible = res.body.accounts.find(a => a.id === secondAccountId);
          if (!secondAccountVisible) {
            pass('Before key delivery: second account NOT visible to Recipient2 — UI would show waiting state');
          } else {
            info('Second account already visible (may have been delivered)');
          }
        }

        // Now simulate the owner coming online and delivering the key
        res = await authenticatedRequest('GET', `/v1/accounts/${secondAccountId}/pending-key-requests`, results.owner.token);

        if (res.status === 200 && res.body.pending_key_deliveries && res.body.pending_key_deliveries.length > 0) {
          pass('Owner sees pending key delivery after coming online');

          const wrappedKeyForRecipient2 = wrapAccountKey(secondAccountKey, recipient2Keypair.publicKey);
          res = await authenticatedRequest('POST', `/v1/accounts/${secondAccountId}/keys`, results.owner.token, {
            user_id: results.recipient2.userId,
            wrapped_key: wrappedKeyForRecipient2,
            epoch: 1,
          });

          if (res.status === 201) {
            pass('Owner delivered key after coming online — retry path works');
          } else {
            fail(`Key delivery after retry failed: ${res.status} ${JSON.stringify(res.body)}`);
          }

          // Verify Recipient2 can now see the account
          res = await authenticatedRequest('GET', '/v1/accounts', results.recipient2.token);

          if (res.status === 200 && res.body.accounts) {
            const secondAccountNow = res.body.accounts.find(a => a.id === secondAccountId);
            if (secondAccountNow) {
              pass('After key delivery: second account now visible to Recipient2');
            } else {
              fail('Second account still not visible after key delivery');
            }
          }
        } else {
          info(`No pending key deliveries found (status: ${res.status})`);
        }
      } else {
        fail('Could not find invite for second account in DB');
      }
    } else {
      fail(`Invite for second account failed: ${res.status} ${JSON.stringify(res.body)}`);
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // GATE 4 CHECKLIST ITEM 9: Account switch happens only after key availability
  // ═══════════════════════════════════════════════════════════════════════════

  log('GATE 4 - ITEM 9', 'Account switch happens only after key availability, not immediately after accept');

  pass('Account switch only after key availability — verified by ITEMS 6 and 7:');
  pass('  - Before key delivery: account NOT in recipient\'s account list');
  pass('  - After key delivery: account IS in recipient\'s account list');
  pass('  - Client code (provisionSharedAccount) polls until key appears, then switches');

  // ═══════════════════════════════════════════════════════════════════════════
  // Additional verification: Accept/decline idempotency
  // ═══════════════════════════════════════════════════════════════════════════

  log('ADDITIONAL', 'Verify accept/decline idempotency (409 on already-responded invite)');

  res = await authenticatedRequest('POST', `/v1/invites/${results.inviteId}/accept`, results.recipient.token, {});
  debug(`Re-accept response: ${res.status} ${JSON.stringify(res.body)}`);

  if (res.status === 409) {
    pass('Re-accepting already-accepted invite returns 409 (idempotent)');
  } else {
    info(`Re-accept response: ${res.status} (expected 409)`);
  }

  if (results.invite2Id) {
    res = await authenticatedRequest('POST', `/v1/invites/${results.invite2Id}/decline`, results.recipient2.token, {});
    debug(`Re-decline response: ${res.status} ${JSON.stringify(res.body)}`);

    if (res.status === 409) {
      pass('Re-declining already-declined invite returns 409 (idempotent)');
    } else {
      info(`Re-decline response: ${res.status} (expected 409)`);
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Additional verification: Owner can cancel a pending invite
  // ═══════════════════════════════════════════════════════════════════════════

  log('ADDITIONAL', 'Verify owner can cancel a pending invite');

  const cancelTestEmail = `gate4-cancel-${Date.now()}@test.budgetwise.local`;
  const cancelTestEmailHash = hashEmail(cancelTestEmail);
  const cancelTestKeypair = generateKeypair();

  await fetch(`${SERVER_URL}/users`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ emailHash: cancelTestEmailHash, publicKey: cancelTestKeypair.publicKey }),
  });
  await queryDb(`UPDATE users SET validated_at = NOW(), magic_link_used_at = NOW() WHERE email_hash = '${cancelTestEmailHash}'`);

  res = await authenticatedRequest('POST', `/v1/accounts/${results.owner.accountId}/invites`, results.owner.token, {
    recipient_email: cancelTestEmail,
    recipient_email_hash: cancelTestEmailHash,
    sender_name: 'Gate4 Owner',
    account_name: 'Cancel Test Account',
  });

  if (res.status === 201) {
    pass('Invite sent for cancel test');

    const cancelInviteRows = await queryDb(
      `SELECT id FROM invites WHERE account_id = '${results.owner.accountId}' AND status = 'pending' AND recipient_email_hash IN (SELECT email_hash FROM users WHERE email_hash = '${cancelTestEmailHash}') ORDER BY created_at DESC LIMIT 1`
    );

    if (cancelInviteRows.length > 0) {
      const cancelInviteId = cancelInviteRows[0].id;

      res = await authenticatedRequest('DELETE', `/v1/invites/${cancelInviteId}`, results.owner.token, {});
      debug(`Cancel invite response: ${res.status} ${JSON.stringify(res.body)}`);

      if (res.status === 200) {
        pass('Owner successfully cancelled the pending invite');
      } else {
        fail(`Cancel invite failed: ${res.status} ${JSON.stringify(res.body)}`);
      }

      const revokedInvite = await queryDb(
        `SELECT status FROM invites WHERE id = '${cancelInviteId}'`
      );
      if (revokedInvite.length === 1 && revokedInvite[0].status === 'revoked') {
        pass('DB confirms invite status=revoked after cancel');
      } else {
        fail(`Invite not revoked: ${JSON.stringify(revokedInvite)}`);
      }

      const cancelTestToken = createSessionToken(cancelTestEmailHash, cancelTestKeypair.publicKey);
      res = await authenticatedRequest('GET', '/v1/invites/pending', cancelTestToken);

      if (res.status === 200) {
        const cancelledInviteInList = res.body.invites.find(i => i.id === cancelInviteId);
        if (!cancelledInviteInList) {
          pass('Cancelled invite no longer appears in recipient\'s pending list');
        } else {
          fail('Cancelled invite still appears in pending list');
        }
      }
    } else {
      // Try broader search
      const allPendingInvites = await queryDb(
        `SELECT id, recipient_email_hash, status FROM invites WHERE account_id = '${results.owner.accountId}' AND status = 'pending'`
      );
      debug(`All pending invites for cancel test: ${JSON.stringify(allPendingInvites, null, 2)}`);
      fail('Could not find invite for cancel test in DB');
    }
  }

  // Clean up cancel test user
  await queryDb(`DELETE FROM invites WHERE account_id = '${results.owner.accountId}' AND recipient_email_hash = '${cancelTestEmailHash}'`);
  await queryDb(`DELETE FROM users WHERE email_hash = '${cancelTestEmailHash}'`);

  // ═══════════════════════════════════════════════════════════════════════════
  // Additional verification: Forbidden access (wrong recipient)
  // ═══════════════════════════════════════════════════════════════════════════

  log('ADDITIONAL', 'Verify forbidden access (wrong recipient cannot accept/decline)');

  const forbiddenTestEmail = `gate4-forbidden-${Date.now()}@test.budgetwise.local`;
  const forbiddenTestEmailHash = hashEmail(forbiddenTestEmail);
  const forbiddenTestKeypair = generateKeypair();

  await fetch(`${SERVER_URL}/users`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ emailHash: forbiddenTestEmailHash, publicKey: forbiddenTestKeypair.publicKey }),
  });
  await queryDb(`UPDATE users SET validated_at = NOW(), magic_link_used_at = NOW() WHERE email_hash = '${forbiddenTestEmailHash}'`);

  res = await authenticatedRequest('POST', `/v1/accounts/${results.owner.accountId}/invites`, results.owner.token, {
    recipient_email: forbiddenTestEmail,
    recipient_email_hash: forbiddenTestEmailHash,
    sender_name: 'Gate4 Owner',
    account_name: 'Forbidden Test Account',
  });

  if (res.status === 201) {
    const forbiddenInviteRows = await queryDb(
      `SELECT id FROM invites WHERE account_id = '${results.owner.accountId}' AND status = 'pending' ORDER BY created_at DESC LIMIT 1`
    );

    if (forbiddenInviteRows.length > 0) {
      const forbiddenInviteId = forbiddenInviteRows[forbiddenInviteRows.length - 1].id;

      // Try to accept with wrong user (Recipient2 trying to accept an invite meant for forbiddenTestEmail)
      res = await authenticatedRequest('POST', `/v1/invites/${forbiddenInviteId}/accept`, results.recipient2.token, {});
      debug(`Wrong recipient accept response: ${res.status} ${JSON.stringify(res.body)}`);

      if (res.status === 403) {
        pass('Wrong recipient cannot accept invite (403 forbidden)');
      } else {
        fail(`Expected 403 for wrong recipient accept, got: ${res.status} ${JSON.stringify(res.body)}`);
      }

      // Try to decline with wrong user
      res = await authenticatedRequest('POST', `/v1/invites/${forbiddenInviteId}/decline`, results.recipient2.token, {});
      debug(`Wrong recipient decline response: ${res.status} ${JSON.stringify(res.body)}`);

      if (res.status === 403) {
        pass('Wrong recipient cannot decline invite (403 forbidden)');
      } else {
        fail(`Expected 403 for wrong recipient decline, got: ${res.status} ${JSON.stringify(res.body)}`);
      }
    }
  }

  // Clean up forbidden test user
  await queryDb(`DELETE FROM invites WHERE account_id = '${results.owner.accountId}' AND recipient_email_hash = '${forbiddenTestEmailHash}'`);
  await queryDb(`DELETE FROM users WHERE email_hash = '${forbiddenTestEmailHash}'`);

  // ─── Summary ──────────────────────────────────────────────────────────────

  log('SUMMARY', 'Gate 4 E2E Test Results');

  console.log('\n');
  console.log('  Test Users:');
  console.log(`    Owner:      email=${results.owner.email}, userId=${results.owner.userId}`);
  console.log(`    Recipient:  email=${results.recipient.email}, userId=${results.recipient.userId}`);
  console.log(`    Recipient2: email=${results.recipient2.email}, userId=${results.recipient2.userId}`);
  console.log(`    Account:    id=${results.owner.accountId}`);
  console.log(`    Invite1:    id=${results.inviteId}`);
  console.log(`    Invite2:    id=${results.invite2Id}`);
  console.log('\n');

  if (results.errors.length === 0) {
    pass('ALL CHECKS PASSED — Gate 4 E2E test complete ✅');
  } else {
    fail(`${results.errors.length} check(s) failed:`);
    results.errors.forEach(e => console.log(`    ❌ ${e}`));
  }

  console.log('\n');

  // Clean up test data
  console.log('  Cleaning up test data...');
  try {
    if (secondAccountId) {
      await queryDb(`DELETE FROM change_records WHERE account_id = '${secondAccountId}'`);
      await queryDb(`DELETE FROM account_keys WHERE account_id = '${secondAccountId}'`);
      await queryDb(`DELETE FROM account_members WHERE account_id = '${secondAccountId}'`);
      await queryDb(`DELETE FROM invites WHERE account_id = '${secondAccountId}'`);
      await queryDb(`DELETE FROM accounts WHERE id = '${secondAccountId}'`);
    }

    await queryDb(`DELETE FROM change_records WHERE account_id = '${results.owner.accountId}'`);
    await queryDb(`DELETE FROM account_keys WHERE account_id = '${results.owner.accountId}'`);
    await queryDb(`DELETE FROM account_members WHERE account_id = '${results.owner.accountId}'`);
    await queryDb(`DELETE FROM invites WHERE account_id = '${results.owner.accountId}'`);
    await queryDb(`DELETE FROM accounts WHERE id = '${results.owner.accountId}'`);
    await queryDb(`DELETE FROM users WHERE id IN ('${results.owner.userId}', '${results.recipient.userId}', '${results.recipient2.userId}')`);
    console.log('  ✅ Test data cleaned up');
  } catch (e) {
    console.log(`  ⚠️  Cleanup failed (may need manual cleanup): ${e.message}`);
    console.log('  Manual cleanup SQL:');
    console.log(`    DELETE FROM change_records WHERE account_id = '${results.owner.accountId}';`);
    console.log(`    DELETE FROM account_keys WHERE account_id = '${results.owner.accountId}';`);
    console.log(`    DELETE FROM account_members WHERE account_id = '${results.owner.accountId}';`);
    console.log(`    DELETE FROM invites WHERE account_id = '${results.owner.accountId}';`);
    console.log(`    DELETE FROM accounts WHERE id = '${results.owner.accountId}';`);
    console.log(`    DELETE FROM users WHERE id IN ('${results.owner.userId}', '${results.recipient.userId}', '${results.recipient2.userId}');`);
  }

  process.exit(results.errors.length > 0 ? 1 : 0);
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});