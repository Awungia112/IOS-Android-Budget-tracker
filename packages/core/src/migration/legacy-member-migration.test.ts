import { describe, it, expect, vi, beforeEach } from 'vitest';
import { LegacyMemberMigrationService, mapLegacyRole } from './legacy-member-migration';
import type { OnlineAccountsClient } from '../sync/online-accounts-client';
import type { AsymmetricEnvelope } from '../crypto/envelope';
import {
  SERVER_ACCOUNT_ID,
  OWNER_USER_ID,
  REGISTERED_MEMBER_USER_ID,
  OWNER_EMAIL,
  REGISTERED_MEMBER_EMAIL,
  UNREGISTERED_MEMBER_EMAIL,
  TEST_ACCOUNT_KEY,
  TEST_EPOCH,
  TEST_EMAIL_HASH_PEPPER,
  TEST_SENDER_NAME,
  TEST_ACCOUNT_NAME,
  OWNER_PUBLIC_KEY_BASE64,
  REGISTERED_MEMBER_PUBLIC_KEY_BASE64,
} from './test-fixtures/legacy-member-migration';

// Mock crypto dependencies that require libsodium WASM (not available in jsdom)
vi.mock('../crypto/hashing', () => ({
  hashEmail: vi.fn().mockResolvedValue('a'.repeat(64)),
}));
vi.mock('../crypto/account-key', () => ({
  wrapAccountKey: vi.fn().mockResolvedValue({
    v: 1,
    alg: 'x25519-xsalsa20-poly1305',
    ciphertext: 'mocked-ciphertext',
  }),
}));
vi.mock('../crypto/envelope', () => ({
  fromBase64url: vi.fn().mockResolvedValue(new Uint8Array(32).fill(1)),
  toBase64url: vi.fn().mockResolvedValue('mocked-base64url'),
}));

// =============================================================================
// HELPERS
// =============================================================================

function createMockClient(): {
  client: OnlineAccountsClient;
  getSharingInfo: ReturnType<typeof vi.fn>;
  getAccountMembers: ReturnType<typeof vi.fn>;
  deliverAccountKey: ReturnType<typeof vi.fn>;
  inviteMember: ReturnType<typeof vi.fn>;
} {
  const getSharingInfo = vi.fn();
  const getAccountMembers = vi.fn();
  const deliverAccountKey = vi.fn().mockResolvedValue({ status: 'ok' });
  const inviteMember = vi.fn().mockResolvedValue({ status: 'ok' });

  const client = {
    getSharingInfo,
    getAccountMembers,
    deliverAccountKey,
    inviteMember,
    listAccounts: vi.fn(),
    createAccount: vi.fn(),
    getAccountKey: vi.fn(),
    pushChangeRecords: vi.fn(),
    pullChangeRecords: vi.fn(),
    pollPendingKeyRequests: vi.fn(),
    getRecipientPublicKey: vi.fn(),
    removeAccountMember: vi.fn(),
    removeAccountMemberAndUploadWrappedKeys: vi.fn(),
    batchUploadWrappedKeys: vi.fn(),
    cancelInvite: vi.fn(),
    removeMember: vi.fn(),
  } as unknown as OnlineAccountsClient & {
    getSharingInfo: ReturnType<typeof vi.fn>;
    getAccountMembers: ReturnType<typeof vi.fn>;
    deliverAccountKey: ReturnType<typeof vi.fn>;
    inviteMember: ReturnType<typeof vi.fn>;
  };

  return { client, getSharingInfo, getAccountMembers, deliverAccountKey, inviteMember };
}

// =============================================================================
// mapLegacyRole
// =============================================================================

describe('mapLegacyRole', () => {
  it('maps legacy "owner" to "owner"', () => {
    expect(mapLegacyRole('owner')).toBe('owner');
  });

  it('maps legacy "member" to "member"', () => {
    expect(mapLegacyRole('member')).toBe('member');
  });

  it('defaults unknown roles to "member"', () => {
    expect(mapLegacyRole('viewer')).toBe('member');
    expect(mapLegacyRole('admin')).toBe('member');
    expect(mapLegacyRole('')).toBe('member');
  });
});

// =============================================================================
// LegacyMemberMigrationService
// =============================================================================

describe('LegacyMemberMigrationService', () => {
  let service: LegacyMemberMigrationService;

  beforeEach(() => {
    service = new LegacyMemberMigrationService(TEST_EMAIL_HASH_PEPPER);
  });

  // ─── Scenario 1: Owner Only ───────────────────────────────────────────────

  describe('owner-only account', () => {
    it('does nothing when there are no member emails', async () => {
      const { client, getSharingInfo, getAccountMembers, deliverAccountKey, inviteMember } =
        createMockClient();
      getSharingInfo.mockResolvedValue({
        currentUserId: OWNER_USER_ID,
        members: [{ userId: OWNER_USER_ID, displayEmail: OWNER_EMAIL, role: 'owner', joinedAt: '' }],
        pendingInvites: [],
      });
      getAccountMembers.mockResolvedValue({
        members: [{ userId: OWNER_USER_ID, role: 'owner', joinedAt: '', publicKey: OWNER_PUBLIC_KEY_BASE64 }],
      });

      const result = await service.migrateMembers({
        serverAccountId: SERVER_ACCOUNT_ID,
        accountKey: TEST_ACCOUNT_KEY,
        epoch: TEST_EPOCH,
        client,
        ownerEmail: OWNER_EMAIL,
        memberEmails: [],
        emailHashPepper: TEST_EMAIL_HASH_PEPPER,
        senderName: TEST_SENDER_NAME,
        accountName: TEST_ACCOUNT_NAME,
      });

      expect(result).toEqual({
        deliveredKeys: 0,
        sentInvites: 0,
        skipped: 0,
        errors: [],
        memberRoles: {},
      });
      expect(deliverAccountKey).not.toHaveBeenCalled();
      expect(inviteMember).not.toHaveBeenCalled();
    });
  });

  // ─── Scenario 2: Shared Account With Registered Members ───────────────────

  describe('shared account with already-registered members', () => {
    it('delivers wrapped account keys to registered members and skips owner', async () => {
      const { client, getSharingInfo, getAccountMembers, deliverAccountKey, inviteMember } =
        createMockClient();
      getSharingInfo.mockResolvedValue({
        currentUserId: OWNER_USER_ID,
        members: [
          { userId: OWNER_USER_ID, displayEmail: OWNER_EMAIL, role: 'owner', joinedAt: '' },
          { userId: REGISTERED_MEMBER_USER_ID, displayEmail: REGISTERED_MEMBER_EMAIL, role: 'member', joinedAt: '' },
        ],
        pendingInvites: [],
      });
      getAccountMembers.mockResolvedValue({
        members: [
          { userId: OWNER_USER_ID, role: 'owner', joinedAt: '', publicKey: OWNER_PUBLIC_KEY_BASE64 },
          { userId: REGISTERED_MEMBER_USER_ID, role: 'member', joinedAt: '', publicKey: REGISTERED_MEMBER_PUBLIC_KEY_BASE64 },
        ],
      });

      const result = await service.migrateMembers({
        serverAccountId: SERVER_ACCOUNT_ID,
        accountKey: TEST_ACCOUNT_KEY,
        epoch: TEST_EPOCH,
        client,
        ownerEmail: OWNER_EMAIL,
        memberEmails: [OWNER_EMAIL, REGISTERED_MEMBER_EMAIL],
        emailHashPepper: TEST_EMAIL_HASH_PEPPER,
        senderName: TEST_SENDER_NAME,
        accountName: TEST_ACCOUNT_NAME,
      });

      expect(result).toEqual({
        deliveredKeys: 1,
        sentInvites: 0,
        skipped: 0,
        errors: [],
        memberRoles: { [REGISTERED_MEMBER_EMAIL]: 'member' },
      });

      // Owner should NOT get a key delivered
      expect(deliverAccountKey).toHaveBeenCalledTimes(1);
      expect(deliverAccountKey).toHaveBeenCalledWith({
        accountId: SERVER_ACCOUNT_ID,
        userId: REGISTERED_MEMBER_USER_ID,
        wrappedKey: expect.objectContaining({
          v: 1,
          alg: 'x25519-xsalsa20-poly1305',
          ciphertext: expect.any(String),
        }),
        epoch: TEST_EPOCH,
      });

      expect(inviteMember).not.toHaveBeenCalled();
    });

    it('includes the alg field in the wrapped envelope', async () => {
      const { client, getSharingInfo, getAccountMembers, deliverAccountKey } =
        createMockClient();
      getSharingInfo.mockResolvedValue({
        currentUserId: OWNER_USER_ID,
        members: [
          { userId: OWNER_USER_ID, displayEmail: OWNER_EMAIL, role: 'owner', joinedAt: '' },
          { userId: REGISTERED_MEMBER_USER_ID, displayEmail: REGISTERED_MEMBER_EMAIL, role: 'member', joinedAt: '' },
        ],
        pendingInvites: [],
      });
      getAccountMembers.mockResolvedValue({
        members: [
          { userId: OWNER_USER_ID, role: 'owner', joinedAt: '', publicKey: OWNER_PUBLIC_KEY_BASE64 },
          { userId: REGISTERED_MEMBER_USER_ID, role: 'member', joinedAt: '', publicKey: REGISTERED_MEMBER_PUBLIC_KEY_BASE64 },
        ],
      });

      await service.migrateMembers({
        serverAccountId: SERVER_ACCOUNT_ID,
        accountKey: TEST_ACCOUNT_KEY,
        epoch: TEST_EPOCH,
        client,
        ownerEmail: OWNER_EMAIL,
        memberEmails: [REGISTERED_MEMBER_EMAIL],
        emailHashPepper: TEST_EMAIL_HASH_PEPPER,
        senderName: TEST_SENDER_NAME,
        accountName: TEST_ACCOUNT_NAME,
      });

      const deliveredEnvelope = deliverAccountKey.mock.calls[0][0].wrappedKey as AsymmetricEnvelope;
      expect(deliveredEnvelope.alg).toBe('x25519-xsalsa20-poly1305');
    });
  });

  // ─── Language forwarding ──────────────────────────────────────────────────

  describe('language forwarding for invite emails', () => {
    function makeSharedSetup(mock: ReturnType<typeof createMockClient>) {
      mock.getSharingInfo.mockResolvedValue({
        currentUserId: OWNER_USER_ID,
        members: [
          { userId: OWNER_USER_ID, displayEmail: OWNER_EMAIL, role: 'owner', joinedAt: '' },
        ],
        pendingInvites: [],
      });
      mock.getAccountMembers.mockResolvedValue({
        members: [
          { userId: OWNER_USER_ID, role: 'owner', joinedAt: '', publicKey: OWNER_PUBLIC_KEY_BASE64 },
        ],
      });
      mock.inviteMember.mockResolvedValue({ status: 'ok' });
    }

    it('passes language "de" to inviteMember when set on input', async () => {
      const mock = createMockClient();
      makeSharedSetup(mock);

      await service.migrateMembers({
        serverAccountId: SERVER_ACCOUNT_ID,
        accountKey: TEST_ACCOUNT_KEY,
        epoch: TEST_EPOCH,
        client: mock.client,
        ownerEmail: OWNER_EMAIL,
        memberEmails: [UNREGISTERED_MEMBER_EMAIL],
        emailHashPepper: TEST_EMAIL_HASH_PEPPER,
        senderName: TEST_SENDER_NAME,
        accountName: TEST_ACCOUNT_NAME,
        language: 'de',
      });

      expect(mock.inviteMember).toHaveBeenCalledWith(
        expect.objectContaining({ language: 'de' }),
      );
    });

    it('passes language "en" to inviteMember when set on input', async () => {
      const mock = createMockClient();
      makeSharedSetup(mock);

      await service.migrateMembers({
        serverAccountId: SERVER_ACCOUNT_ID,
        accountKey: TEST_ACCOUNT_KEY,
        epoch: TEST_EPOCH,
        client: mock.client,
        ownerEmail: OWNER_EMAIL,
        memberEmails: [UNREGISTERED_MEMBER_EMAIL],
        emailHashPepper: TEST_EMAIL_HASH_PEPPER,
        senderName: TEST_SENDER_NAME,
        accountName: TEST_ACCOUNT_NAME,
        language: 'en',
      });

      expect(mock.inviteMember).toHaveBeenCalledWith(
        expect.objectContaining({ language: 'en' }),
      );
    });

    it('passes language "de-DE" (regional BCP-47) to inviteMember unchanged', async () => {
      const mock = createMockClient();
      makeSharedSetup(mock);

      await service.migrateMembers({
        serverAccountId: SERVER_ACCOUNT_ID,
        accountKey: TEST_ACCOUNT_KEY,
        epoch: TEST_EPOCH,
        client: mock.client,
        ownerEmail: OWNER_EMAIL,
        memberEmails: [UNREGISTERED_MEMBER_EMAIL],
        emailHashPepper: TEST_EMAIL_HASH_PEPPER,
        senderName: TEST_SENDER_NAME,
        accountName: TEST_ACCOUNT_NAME,
        language: 'de-DE',
      });

      expect(mock.inviteMember).toHaveBeenCalledWith(
        expect.objectContaining({ language: 'de-DE' }),
      );
    });

    it('passes undefined language to inviteMember when language is omitted', async () => {
      const mock = createMockClient();
      makeSharedSetup(mock);

      await service.migrateMembers({
        serverAccountId: SERVER_ACCOUNT_ID,
        accountKey: TEST_ACCOUNT_KEY,
        epoch: TEST_EPOCH,
        client: mock.client,
        ownerEmail: OWNER_EMAIL,
        memberEmails: [UNREGISTERED_MEMBER_EMAIL],
        emailHashPepper: TEST_EMAIL_HASH_PEPPER,
        senderName: TEST_SENDER_NAME,
        accountName: TEST_ACCOUNT_NAME,
        // language intentionally omitted
      });

      expect(mock.inviteMember).toHaveBeenCalledWith(
        expect.objectContaining({ language: undefined }),
      );
    });
  });

  // ─── Scenario 3: Shared Account With Unregistered Members ─────────────────

  describe('shared account with unregistered members', () => {
    it('sends invites to non-registered members', async () => {
      const { client, getSharingInfo, getAccountMembers, deliverAccountKey, inviteMember } =
        createMockClient();
      getSharingInfo.mockResolvedValue({
        currentUserId: OWNER_USER_ID,
        members: [
          { userId: OWNER_USER_ID, displayEmail: OWNER_EMAIL, role: 'owner', joinedAt: '' },
        ],
        pendingInvites: [],
      });
      getAccountMembers.mockResolvedValue({
        members: [
          { userId: OWNER_USER_ID, role: 'owner', joinedAt: '', publicKey: OWNER_PUBLIC_KEY_BASE64 },
        ],
      });
      inviteMember.mockResolvedValue({ status: 'ok' });

      const result = await service.migrateMembers({
        serverAccountId: SERVER_ACCOUNT_ID,
        accountKey: TEST_ACCOUNT_KEY,
        epoch: TEST_EPOCH,
        client,
        ownerEmail: OWNER_EMAIL,
        memberEmails: [UNREGISTERED_MEMBER_EMAIL],
        emailHashPepper: TEST_EMAIL_HASH_PEPPER,
        senderName: TEST_SENDER_NAME,
        accountName: TEST_ACCOUNT_NAME,
      });

      expect(result).toEqual({
        deliveredKeys: 0,
        sentInvites: 1,
        skipped: 0,
        errors: [],
        memberRoles: { [UNREGISTERED_MEMBER_EMAIL]: 'member' },
      });

      expect(inviteMember).toHaveBeenCalledTimes(1);
      expect(inviteMember).toHaveBeenCalledWith(
        expect.objectContaining({
          accountId: SERVER_ACCOUNT_ID,
          recipientEmail: UNREGISTERED_MEMBER_EMAIL,
          recipientEmailHash: expect.stringMatching(/^[a-f0-9]{64}$/),
          senderName: TEST_SENDER_NAME,
          accountName: TEST_ACCOUNT_NAME,
        }),
      );

      expect(deliverAccountKey).not.toHaveBeenCalled();
    });

    it('does not attempt key wrapping for unregistered members', async () => {
      const { client, getSharingInfo, getAccountMembers, deliverAccountKey, inviteMember } =
        createMockClient();
      getSharingInfo.mockResolvedValue({
        currentUserId: OWNER_USER_ID,
        members: [
          { userId: OWNER_USER_ID, displayEmail: OWNER_EMAIL, role: 'owner', joinedAt: '' },
        ],
        pendingInvites: [],
      });
      getAccountMembers.mockResolvedValue({
        members: [
          { userId: OWNER_USER_ID, role: 'owner', joinedAt: '', publicKey: OWNER_PUBLIC_KEY_BASE64 },
        ],
      });
      inviteMember.mockResolvedValue({ status: 'ok' });

      await service.migrateMembers({
        serverAccountId: SERVER_ACCOUNT_ID,
        accountKey: TEST_ACCOUNT_KEY,
        epoch: TEST_EPOCH,
        client,
        ownerEmail: OWNER_EMAIL,
        memberEmails: [UNREGISTERED_MEMBER_EMAIL],
        emailHashPepper: TEST_EMAIL_HASH_PEPPER,
        senderName: TEST_SENDER_NAME,
        accountName: TEST_ACCOUNT_NAME,
      });

      expect(deliverAccountKey).not.toHaveBeenCalled();
    });
  });

  // ─── Mixed scenario ──────────────────────────────────────────────────────

  describe('mixed: registered + unregistered members', () => {
    it('delivers keys to registered members and sends invites to unregistered', async () => {
      const { client, getSharingInfo, getAccountMembers, deliverAccountKey, inviteMember } =
        createMockClient();
      getSharingInfo.mockResolvedValue({
        currentUserId: OWNER_USER_ID,
        members: [
          { userId: OWNER_USER_ID, displayEmail: OWNER_EMAIL, role: 'owner', joinedAt: '' },
          { userId: REGISTERED_MEMBER_USER_ID, displayEmail: REGISTERED_MEMBER_EMAIL, role: 'member', joinedAt: '' },
        ],
        pendingInvites: [],
      });
      getAccountMembers.mockResolvedValue({
        members: [
          { userId: OWNER_USER_ID, role: 'owner', joinedAt: '', publicKey: OWNER_PUBLIC_KEY_BASE64 },
          { userId: REGISTERED_MEMBER_USER_ID, role: 'member', joinedAt: '', publicKey: REGISTERED_MEMBER_PUBLIC_KEY_BASE64 },
        ],
      });
      inviteMember.mockResolvedValue({ status: 'ok' });

      const result = await service.migrateMembers({
        serverAccountId: SERVER_ACCOUNT_ID,
        accountKey: TEST_ACCOUNT_KEY,
        epoch: TEST_EPOCH,
        client,
        ownerEmail: OWNER_EMAIL,
        memberEmails: [REGISTERED_MEMBER_EMAIL, UNREGISTERED_MEMBER_EMAIL],
        emailHashPepper: TEST_EMAIL_HASH_PEPPER,
        senderName: TEST_SENDER_NAME,
        accountName: TEST_ACCOUNT_NAME,
      });

      expect(result).toEqual({
        deliveredKeys: 1,
        sentInvites: 1,
        skipped: 0,
        errors: [],
        memberRoles: {
          [REGISTERED_MEMBER_EMAIL]: 'member',
          [UNREGISTERED_MEMBER_EMAIL]: 'member',
        },
      });

      expect(deliverAccountKey).toHaveBeenCalledTimes(1);
      expect(inviteMember).toHaveBeenCalledTimes(1);
    });
  });

  // ─── Error handling ──────────────────────────────────────────────────────

  describe('error handling', () => {
    it('collects errors from failed key deliveries and continues with remaining members', async () => {
      const { client, getSharingInfo, getAccountMembers, deliverAccountKey } =
        createMockClient();
      getSharingInfo.mockResolvedValue({
        currentUserId: OWNER_USER_ID,
        members: [
          { userId: OWNER_USER_ID, displayEmail: OWNER_EMAIL, role: 'owner', joinedAt: '' },
          { userId: REGISTERED_MEMBER_USER_ID, displayEmail: REGISTERED_MEMBER_EMAIL, role: 'member', joinedAt: '' },
        ],
        pendingInvites: [],
      });
      getAccountMembers.mockResolvedValue({
        members: [
          { userId: OWNER_USER_ID, role: 'owner', joinedAt: '', publicKey: OWNER_PUBLIC_KEY_BASE64 },
          { userId: REGISTERED_MEMBER_USER_ID, role: 'member', joinedAt: '', publicKey: REGISTERED_MEMBER_PUBLIC_KEY_BASE64 },
        ],
      });
      deliverAccountKey.mockRejectedValue(new Error('Network error'));

      const result = await service.migrateMembers({
        serverAccountId: SERVER_ACCOUNT_ID,
        accountKey: TEST_ACCOUNT_KEY,
        epoch: TEST_EPOCH,
        client,
        ownerEmail: OWNER_EMAIL,
        memberEmails: [REGISTERED_MEMBER_EMAIL],
        emailHashPepper: TEST_EMAIL_HASH_PEPPER,
        senderName: TEST_SENDER_NAME,
        accountName: TEST_ACCOUNT_NAME,
      });

      expect(result.deliveredKeys).toBe(0);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toContain('Key delivery failed');
      expect(result.errors[0]).toContain(REGISTERED_MEMBER_EMAIL);
    });

    it('collects errors from failed invites and continues', async () => {
      const { client, getSharingInfo, getAccountMembers, inviteMember } =
        createMockClient();
      getSharingInfo.mockResolvedValue({
        currentUserId: OWNER_USER_ID,
        members: [
          { userId: OWNER_USER_ID, displayEmail: OWNER_EMAIL, role: 'owner', joinedAt: '' },
        ],
        pendingInvites: [],
      });
      getAccountMembers.mockResolvedValue({
        members: [
          { userId: OWNER_USER_ID, role: 'owner', joinedAt: '', publicKey: OWNER_PUBLIC_KEY_BASE64 },
        ],
      });
      inviteMember.mockRejectedValue(new Error('Server error'));

      const result = await service.migrateMembers({
        serverAccountId: SERVER_ACCOUNT_ID,
        accountKey: TEST_ACCOUNT_KEY,
        epoch: TEST_EPOCH,
        client,
        ownerEmail: OWNER_EMAIL,
        memberEmails: [UNREGISTERED_MEMBER_EMAIL],
        emailHashPepper: TEST_EMAIL_HASH_PEPPER,
        senderName: TEST_SENDER_NAME,
        accountName: TEST_ACCOUNT_NAME,
      });

      expect(result.sentInvites).toBe(0);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toContain('Invite failed');
    });

    it('skips members without a public key instead of erroring', async () => {
      const { client, getSharingInfo, getAccountMembers, deliverAccountKey } =
        createMockClient();
      getSharingInfo.mockResolvedValue({
        currentUserId: OWNER_USER_ID,
        members: [
          { userId: OWNER_USER_ID, displayEmail: OWNER_EMAIL, role: 'owner', joinedAt: '' },
          { userId: REGISTERED_MEMBER_USER_ID, displayEmail: REGISTERED_MEMBER_EMAIL, role: 'member', joinedAt: '' },
        ],
        pendingInvites: [],
      });
      getAccountMembers.mockResolvedValue({
        members: [
          { userId: OWNER_USER_ID, role: 'owner', joinedAt: '', publicKey: OWNER_PUBLIC_KEY_BASE64 },
          { userId: REGISTERED_MEMBER_USER_ID, role: 'member', joinedAt: '', publicKey: '' },
        ],
      });

      const result = await service.migrateMembers({
        serverAccountId: SERVER_ACCOUNT_ID,
        accountKey: TEST_ACCOUNT_KEY,
        epoch: TEST_EPOCH,
        client,
        ownerEmail: OWNER_EMAIL,
        memberEmails: [REGISTERED_MEMBER_EMAIL],
        emailHashPepper: TEST_EMAIL_HASH_PEPPER,
        senderName: TEST_SENDER_NAME,
        accountName: TEST_ACCOUNT_NAME,
      });

      expect(result.deliveredKeys).toBe(0);
      expect(result.skipped).toBe(1);
      expect(deliverAccountKey).not.toHaveBeenCalled();
    });
  });
});
