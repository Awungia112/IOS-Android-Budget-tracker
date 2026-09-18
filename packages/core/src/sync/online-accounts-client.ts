import type { AsymmetricEnvelope } from '../crypto/index.js';
import { SESSION_TOKEN_RENEWAL_HEADER } from '@budget/shared/session-token';

export interface AccountSyncChangeRecord {
  change_uuid: string;
  encrypted_payload: Record<string, unknown>;
}

export interface PulledChangeRecord {
  change_uuid: string;
  sequence: number;
  encrypted_payload: unknown;
}

export interface PendingKeyRequest {
  inviteId: string;
  recipientUserId: string;
  recipientPublicKey: string;
}

export interface OnlineAccountSummary {
  id: string;
  keyEpoch: number;
  role: 'owner' | 'member';
  recordCount: number;
  createdAt: string;
}

export interface PendingInviteForRecipient {
  id: string;
  accountId: string;
  senderUserId: string;
  inviterName: string | null;
  inviterEmail: string | null;
  accountName: string | null;
  createdAt: string;
}

export interface OnlineAccountsClient {
  listAccounts(): Promise<{ accounts: OnlineAccountSummary[] }>;
  createAccount(input: {
    wrappedKey: AsymmetricEnvelope;
    epoch: 1;
  }): Promise<{ id: string; keyEpoch: 1 }>;
  getAccountKey(input: {
    accountId: string;
    epoch?: number;
  }): Promise<{ accountId: string; epoch: number; wrappedKey: AsymmetricEnvelope }>;
  pushChangeRecords(input: {
    accountId: string;
    records: AccountSyncChangeRecord[];
  }): Promise<{ results: { change_uuid: string; sequence: number }[] }>;
  pullChangeRecords(input: {
    accountId: string;
    since?: number;
  }): Promise<{ records: PulledChangeRecord[]; next_since: number | null }>;
  /** Poll for pending key delivery requests (new member invites accepted) */
  pollPendingKeyRequests(input: {
    accountId: string;
  }): Promise<{ pendingKeyDeliveries: PendingKeyRequest[] }>;
  /** Fetch a user's public key by their user ID */
  getRecipientPublicKey(input: {
    userId: string;
  }): Promise<{ publicKey: string }>;
  /** Deliver wrapped account key to a recipient who accepted an invite */
  deliverAccountKey(input: {
    accountId: string;
    userId: string;
    wrappedKey: AsymmetricEnvelope;
    epoch: number;
  }): Promise<{ status: 'ok' }>;
  getAccountMembers(input: {
    accountId: string;
  }): Promise<{ members: Array<{ userId: string; role: 'owner' | 'member'; joinedAt: string; publicKey: string }> }>;
  removeAccountMember(input: {
    accountId: string;
    userIdToRemove: string;
  }): Promise<{ newEpoch: number }>;
  removeAccountMemberAndUploadWrappedKeys(input: {
    accountId: string;
    userIdToRemove: string;
    wrappedKeys: Array<{ userId: string; wrappedKey: AsymmetricEnvelope }>;
  }): Promise<{ newEpoch: number }>;
  batchUploadWrappedKeys(input: {
    accountId: string;
    newEpoch: number;
    wrappedKeys: Array<{ userId: string; wrappedKey: AsymmetricEnvelope }>;
  }): Promise<{ status: 'ok' }>;
  getSharingInfo(accountId: string): Promise<{
    currentUserId: string;
    members: Array<{ userId: string; displayEmail: string | null; role: string; joinedAt: string }>;
    pendingInvites: Array<{ id: string; recipientEmail: string | null; recipientEmailHash: string; status: string; createdAt: string }>;
  }>;
  inviteMember(input: {
    accountId: string;
    recipientEmail: string;
    recipientEmailHash: string;
    senderName: string;
    senderEmail?: string;
    accountName: string;
    /** BCP-47 language tag (e.g. 'de', 'en') to localise the invite email. */
    language?: string;
  }): Promise<{ status: string }>;
  cancelInvite(accountId: string, inviteId: string): Promise<{ status: string }>;
  removeMember(accountId: string, userId: string): Promise<{ status: string }>;
  /** Register user's own display email so they appear by name in sharing settings */
  updateDisplayEmail(email: string): Promise<void>;
  /** List pending invites for the current user (recipient) */
  listPendingInvitesForMe(): Promise<{ invites: PendingInviteForRecipient[] }>;
  /** Accept a pending invite */
  acceptInvite(inviteId: string): Promise<{ status: string }>;
  /** Decline a pending invite */
  declineInvite(inviteId: string): Promise<{ status: string }>;
  /** Permanently delete the authenticated user's account and all associated data */
  deleteAccount(): Promise<{ status: string }>;
  /** Delete recovery data for the current user's email hash */
  deleteRecoveryData(emailHash: string): Promise<{ status: string }>;
}

export interface CreateOnlineAccountsClientOptions {
  baseUrl: string;
  sessionToken: string;
  recoveryBaseUrl?: string;
  fetchFn?: typeof fetch;
  now?: () => number;
  /**
   * Invoked when the server returns a renewed session token (sliding
   * expiration) via the SESSION_TOKEN_RENEWAL_HEADER response header.
   *
   * The app should replace its stored token so subsequent requests keep
   * using a session that is never more than one window old.
   */
  onTokenRenewed?: (token: string) => void;
}

interface NonceResponse {
  nonce: string;
}

interface CreateAccountResponse {
  id: string;
  key_epoch: number;
}

interface ListAccountsResponse {
  accounts: Array<{
    id: string;
    key_epoch: number;
    role: 'owner' | 'member';
    record_count: number;
    created_at: string;
  }>;
}

interface AccountKeyResponse {
  account_id: string;
  epoch: number;
  wrapped_key: AsymmetricEnvelope;
}

interface AccountMembersResponse {
  members: Array<{
    user_id: string;
    role: 'owner' | 'member';
    joined_at: string;
    public_key: string;
  }>;
}

interface RemoveAccountMemberResponse {
  new_epoch: number;
}

interface RemoveAccountMemberAndUploadWrappedKeysRequest {
  wrapped_keys: Array<{
    user_id: string;
    wrapped_key: AsymmetricEnvelope;
  }>;
}

interface RemoveAccountMemberAndUploadWrappedKeysResponse {
  new_epoch: number;
}

interface BatchUploadWrappedKeysRequest {
  new_epoch: number;
  wrapped_keys: Array<{
    user_id: string;
    wrapped_key: AsymmetricEnvelope;
  }>;
}

interface BatchUploadWrappedKeysResponse {
  status: 'ok';
}

interface PollPendingKeyDeliveriesResponse {
  pending_key_deliveries: Array<{
    invite_id: string;
    recipient_user_id: string;
    recipient_public_key: string;
  }>;
}

interface RecipientPublicKeyResponse {
  public_key: string;
}

interface DeliverAccountKeyResponse {
  status: 'ok';
}

interface ListPendingInvitesForMeResponse {
  invites: Array<{
    id: string;
    account_id: string;
    sender_user_id: string;
    inviter_name: string | null;
    inviter_email: string | null;
    account_name: string | null;
    created_at: string;
  }>;
}

function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.replace(/\/+$/, '');
}

async function readJson<T>(response: Response): Promise<T> {
  const text = await response.text();
  return (text ? JSON.parse(text) : undefined) as T;
}

export class OnlineAccountsError extends Error {
  /** The parsed JSON body from the server response, if available. */
  readonly body: unknown;
  readonly status: number;

  constructor(status: number, body: unknown) {
    super(`Online accounts request failed with HTTP ${status}`);
    this.name = 'OnlineAccountsError';
    this.status = status;
    this.body = body;
  }
}

function makeExpectJson(onTokenRenewed?: (token: string) => void) {
  return async function expectJson<T>(response: Response): Promise<T> {
    if (!response.ok) {
      const body = await readJson<unknown>(response).catch(() => undefined);
      throw new OnlineAccountsError(response.status, body);
    }

    // Sliding session expiration: surface any renewed token the server handed
    // back so the app can replace its stored one transparently.
    const renewed = response.headers?.get?.(SESSION_TOKEN_RENEWAL_HEADER);
    if (renewed) {
      onTokenRenewed?.(renewed);
    }

    return readJson<T>(response);
  };
}

export function createOnlineAccountsClient(
  options: CreateOnlineAccountsClientOptions,
): OnlineAccountsClient {
  const fetchFn = options.fetchFn ?? fetch;
  const baseUrl = normalizeBaseUrl(options.baseUrl);
  const now = options.now ?? Date.now;
  const expectJson = makeExpectJson(options.onTokenRenewed);

  async function fetchNonce(): Promise<string> {
    const response = await fetchFn(`${baseUrl}/v1/nonce`);
    const body = await expectJson<NonceResponse>(response);
    return body.nonce;
  }

  return {
    async listAccounts() {
      const response = await fetchFn(`${baseUrl}/v1/accounts`, {
        headers: {
          authorization: `Bearer ${options.sessionToken}`,
        },
      });
      const body = await expectJson<ListAccountsResponse>(response);

      return {
        accounts: body.accounts.map(account => ({
          id: account.id,
          keyEpoch: account.key_epoch,
          role: account.role,
          recordCount: account.record_count,
          createdAt: account.created_at,
        })),
      };
    },

    async createAccount(input) {
      const nonce = await fetchNonce();
      const response = await fetchFn(`${baseUrl}/v1/accounts`, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${options.sessionToken}`,
          'content-type': 'application/json',
          'x-nonce': nonce,
          'x-timestamp': String(now()),
        },
        body: JSON.stringify({
          wrapped_key: input.wrappedKey,
          epoch: input.epoch,
        }),
      });
      const body = await expectJson<CreateAccountResponse>(response);

      return {
        id: body.id,
        keyEpoch: body.key_epoch as 1,
      };
    },

    async getAccountKey(input) {
      const search = new URLSearchParams();
      if (input.epoch !== undefined) {
        search.set('epoch', String(input.epoch));
      }

      const query = input.epoch !== undefined ? `?${search.toString()}` : '';
      const response = await fetchFn(
        `${baseUrl}/v1/accounts/${encodeURIComponent(input.accountId)}/keys${query}`,
        {
          headers: {
            authorization: `Bearer ${options.sessionToken}`,
          },
        },
      );
      const body = await expectJson<AccountKeyResponse>(response);

      return {
        accountId: body.account_id,
        epoch: body.epoch,
        wrappedKey: body.wrapped_key,
      };
    },

    async pushChangeRecords(input) {
      const nonce = await fetchNonce();
      const response = await fetchFn(
        `${baseUrl}/v1/accounts/${encodeURIComponent(input.accountId)}/records`,
        {
          method: 'POST',
          headers: {
            authorization: `Bearer ${options.sessionToken}`,
            'content-type': 'application/json',
            'x-nonce': nonce,
            'x-timestamp': String(now()),
          },
          body: JSON.stringify({ records: input.records }),
        },
      );
      return expectJson(response);
    },

    async pullChangeRecords(input) {
      const search = new URLSearchParams();
      if (input.since !== undefined) {
        search.set('since', String(input.since));
      }
      const query = input.since !== undefined ? `?${search.toString()}` : '';
      const response = await fetchFn(
        `${baseUrl}/v1/accounts/${encodeURIComponent(input.accountId)}/records${query}`,
        {
          headers: {
            authorization: `Bearer ${options.sessionToken}`,
          },
        },
      );
      return expectJson(response);
    },

    async getAccountMembers(input) {
      const response = await fetchFn(
        `${baseUrl}/v1/accounts/${encodeURIComponent(input.accountId)}/members`,
        {
          headers: {
            authorization: `Bearer ${options.sessionToken}`,
          },
        },
      );
      const body = await expectJson<AccountMembersResponse>(response);

      return {
        members: body.members.map((member) => ({
          userId: member.user_id,
          role: member.role,
          joinedAt: member.joined_at,
          publicKey: member.public_key,
        })),
      };
    },

    async removeAccountMember(input) {
      const nonce = await fetchNonce();
      const response = await fetchFn(
        `${baseUrl}/v1/accounts/${encodeURIComponent(input.accountId)}/members/${encodeURIComponent(input.userIdToRemove)}`,
        {
          method: 'DELETE',
          headers: {
            authorization: `Bearer ${options.sessionToken}`,
            'content-type': 'application/json',
            'x-nonce': nonce,
            'x-timestamp': String(now()),
          },
          body: '{}',
        },
      );
      const body = await expectJson<RemoveAccountMemberResponse>(response);

      return {
        newEpoch: body.new_epoch,
      };
    },

    async removeAccountMemberAndUploadWrappedKeys(input) {
      const nonce = await fetchNonce();
      const response = await fetchFn(
        `${baseUrl}/v1/accounts/${encodeURIComponent(input.accountId)}/members/${encodeURIComponent(input.userIdToRemove)}/keys/batch`,
        {
          method: 'POST',
          headers: {
            authorization: `Bearer ${options.sessionToken}`,
            'content-type': 'application/json',
            'x-nonce': nonce,
            'x-timestamp': String(now()),
          },
          body: JSON.stringify({
            wrapped_keys: input.wrappedKeys.map((wk) => ({
              user_id: wk.userId,
              wrapped_key: wk.wrappedKey,
            })),
          }),
        },
      );
      const body = await expectJson<RemoveAccountMemberAndUploadWrappedKeysResponse>(response);

      return {
        newEpoch: body.new_epoch,
      };
    },

    async batchUploadWrappedKeys(input) {
      const nonce = await fetchNonce();
      const response = await fetchFn(
        `${baseUrl}/v1/accounts/${encodeURIComponent(input.accountId)}/keys/batch`,
        {
          method: 'POST',
          headers: {
            authorization: `Bearer ${options.sessionToken}`,
            'content-type': 'application/json',
            'x-nonce': nonce,
            'x-timestamp': String(now()),
          },
          body: JSON.stringify({
            new_epoch: input.newEpoch,
            wrapped_keys: input.wrappedKeys.map((wk) => ({
              user_id: wk.userId,
              wrapped_key: wk.wrappedKey,
            })),
          }),
        },
      );
      return expectJson<BatchUploadWrappedKeysResponse>(response);
    },

    async pollPendingKeyRequests(input) {
      const response = await fetchFn(
        `${baseUrl}/v1/accounts/${encodeURIComponent(input.accountId)}/pending-key-requests`,
        {
          headers: {
            authorization: `Bearer ${options.sessionToken}`,
          },
        },
      );
      const body = await expectJson<PollPendingKeyDeliveriesResponse>(response);
      return {
        pendingKeyDeliveries: body.pending_key_deliveries.map((d) => ({
          inviteId: d.invite_id,
          recipientUserId: d.recipient_user_id,
          recipientPublicKey: d.recipient_public_key,
        })),
      };
    },

    async getRecipientPublicKey(input) {
      const response = await fetchFn(
        `${baseUrl}/v1/users/${encodeURIComponent(input.userId)}/public-key`,
        {
          headers: {
            authorization: `Bearer ${options.sessionToken}`,
          },
        },
      );
      const body = await expectJson<RecipientPublicKeyResponse>(response);
      return { publicKey: body.public_key };
    },

    async deliverAccountKey(input) {
      const nonce = await fetchNonce();
      const response = await fetchFn(
        `${baseUrl}/v1/accounts/${encodeURIComponent(input.accountId)}/keys`,
        {
          method: 'POST',
          headers: {
            authorization: `Bearer ${options.sessionToken}`,
            'content-type': 'application/json',
            'x-nonce': nonce,
            'x-timestamp': String(now()),
          },
          body: JSON.stringify({
            user_id: input.userId,
            wrapped_key: input.wrappedKey,
            epoch: input.epoch,
          }),
        },
      );
      await expectJson<DeliverAccountKeyResponse>(response);
      return { status: 'ok' as const };
    },

    async getSharingInfo(accountId) {
      const response = await fetchFn(
        `${baseUrl}/v1/accounts/${encodeURIComponent(accountId)}/sharing`,
        { headers: { authorization: `Bearer ${options.sessionToken}` } },
      );
      return expectJson(response);
    },

    async inviteMember(input) {
      const nonce = await fetchNonce();
      const response = await fetchFn(
        `${baseUrl}/v1/accounts/${encodeURIComponent(input.accountId)}/invites`,
        {
          method: 'POST',
          headers: {
            authorization: `Bearer ${options.sessionToken}`,
            'content-type': 'application/json',
            'x-nonce': nonce,
            'x-timestamp': String(now()),
          },
          body: JSON.stringify({
            recipient_email: input.recipientEmail,
            recipient_email_hash: input.recipientEmailHash,
            sender_name: input.senderName,
            sender_email: input.senderEmail ?? null,
            account_name: input.accountName,
            language: input.language ?? null,
          }),
        },
      );
      return expectJson(response);
    },

    async cancelInvite(accountId, inviteId) {
      const nonce = await fetchNonce();
      const response = await fetchFn(
        `${baseUrl}/v1/accounts/${encodeURIComponent(accountId)}/invites/${encodeURIComponent(inviteId)}`,
        {
          method: 'DELETE',
          headers: {
            authorization: `Bearer ${options.sessionToken}`,
            'content-type': 'application/json',
            'x-nonce': nonce,
            'x-timestamp': String(now()),
          },
          body: '{}',
        },
      );
      return expectJson(response);
    },

    async removeMember(accountId, userId) {
      const nonce = await fetchNonce();
      const response = await fetchFn(
        `${baseUrl}/v1/accounts/${encodeURIComponent(accountId)}/members/${encodeURIComponent(userId)}`,
        {
          method: 'DELETE',
          headers: {
            authorization: `Bearer ${options.sessionToken}`,
            'content-type': 'application/json',
            'x-nonce': nonce,
            'x-timestamp': String(now()),
          },
          body: '{}',
        },
      );
      return expectJson(response)
    },

    async updateDisplayEmail(email) {
      const nonce = await fetchNonce();
      await fetchFn(`${baseUrl}/v1/users/me/display-email`, {
        method: 'PATCH',
        headers: {
          authorization: `Bearer ${options.sessionToken}`,
          'content-type': 'application/json',
          'x-nonce': nonce,
          'x-timestamp': String(now()),
        },
        body: JSON.stringify({ display_email: email }),
      });
    },

    async listPendingInvitesForMe() {
      const response = await fetchFn(
        `${baseUrl}/v1/invites/pending`,
        {
          headers: {
            authorization: `Bearer ${options.sessionToken}`,
          },
        },
      );
      const body = await expectJson<ListPendingInvitesForMeResponse>(response);
      return {
        invites: body.invites.map((inv) => ({
          id: inv.id,
          accountId: inv.account_id,
          senderUserId: inv.sender_user_id,
          inviterName: inv.inviter_name,
          inviterEmail: inv.inviter_email,
          accountName: inv.account_name,
          createdAt: inv.created_at,
        })),
      };
    },

    async acceptInvite(inviteId) {
      const nonce = await fetchNonce();
      const response = await fetchFn(
        `${baseUrl}/v1/invites/${encodeURIComponent(inviteId)}/accept`,
        {
          method: 'POST',
          headers: {
            authorization: `Bearer ${options.sessionToken}`,
            'content-type': 'application/json',
            'x-nonce': nonce,
            'x-timestamp': String(now()),
          },
          body: '{}',
        },
      );
      await expectJson(response);
      return { status: 'ok' };
    },

    async declineInvite(inviteId) {
      const nonce = await fetchNonce();
      const response = await fetchFn(
        `${baseUrl}/v1/invites/${encodeURIComponent(inviteId)}/decline`,
        {
          method: 'POST',
          headers: {
            authorization: `Bearer ${options.sessionToken}`,
            'content-type': 'application/json',
            'x-nonce': nonce,
            'x-timestamp': String(now()),
          },
          body: '{}',
        },
      );
      await expectJson(response);
      return { status: 'ok' };
    },

    async deleteAccount() {
      const nonce = await fetchNonce();
      const response = await fetchFn(
        `${baseUrl}/v1/users/me`,
        {
          method: 'DELETE',
          headers: {
            authorization: `Bearer ${options.sessionToken}`,
            'content-type': 'application/json',
            'x-nonce': nonce,
            'x-timestamp': String(now()),
          },
          body: '{}',
        },
      );
      const body = await expectJson<{ status: string }>(response);
      return { status: body.status };
    },

    async deleteRecoveryData(emailHash) {
      // The recovery server may or may not use the same base URL.
      // Use the RECOVERY_API_BASE_URL env var if set, otherwise same base.
      const recoveryBase = options.recoveryBaseUrl ?? baseUrl;
      const nonce = await fetchNonce();
      const response = await fetchFn(
        `${recoveryBase}/v1/recovery/account`,
        {
          method: 'DELETE',
          headers: {
            authorization: `Bearer ${options.sessionToken}`,
            'content-type': 'application/json',
            'x-nonce': nonce,
            'x-timestamp': String(now()),
          },
          body: JSON.stringify({ email_hash: emailHash }),
        },
      );
      // Let errors propagate so the caller (BudgetContext) can decide whether
      // and how to surface the failure to the user. The main server deletion
      // has already completed, so this is a non-fatal warning — but we must
      // not silently discard it, because the recovery data (including the
      // email_hash) is the one piece of directly identifying information that
      // the GDPR right to erasure (Art. 17) requires us to delete.
      const body = await expectJson<{ status: string }>(response);
      return { status: body.status };
    },
  };
}