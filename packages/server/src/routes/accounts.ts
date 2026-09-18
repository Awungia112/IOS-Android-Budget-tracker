import type { FastifyPluginAsync } from 'fastify';

import { SYNC_RECORDS_MAX_PER_REQUEST } from '@budget/shared/sync-limits';

import {
  batchUploadWrappedKeys,
  createAccountWithOwnerKey,
  getAccountKeyForUser,
  getAccountMembers,
  listAccountsForUser,
  removeAccountMember,
  removeAccountMemberAndUploadWrappedKeys,
} from '../accounts/account.service.js';
import { pullChangeRecords, pushChangeRecords } from '../accounts/change-record.service.js';
import {
  cancelInvite,
  getAccountSharingInfo,
  inviteMember,
  removeMember,
} from '../accounts/sharing.service.js';
import { authenticateSession } from '../auth/session.js';
import {
  ERROR_CODES,
  ERROR_RESPONSE_SCHEMA,
  HTTP_STATUS,
  OPAQUE_JSON_OBJECT_SCHEMA,
  UUID_PATTERN,
  type ErrorResponse,
} from '../http/http-contract.js';
import {
  deliverWrappedKey,
  listPendingKeyDeliveries,
} from '../invites/invite.service.js';
import { PUBLIC_KEY_PATTERN } from '../users/user-contract.js';
import { hashEmail } from '@budget/core';

export interface CreateAccountRequest {
  wrapped_key: Record<string, unknown>;
  epoch: 1;
}

export interface CreateAccountResponse {
  id: string;
  key_epoch: 1;
}

export interface ListAccountsResponse {
  accounts: Array<{
    id: string;
    key_epoch: number;
    role: 'owner' | 'member';
    record_count: number;
    created_at: string;
  }>;
}

export interface GetAccountKeyQuery {
  epoch?: number;
}

export interface GetAccountKeyResponse {
  account_id: string;
  epoch: number;
  wrapped_key: unknown;
}

export interface PushChangeRecordsRequest {
  records: Array<{
    change_uuid: string;
    encrypted_payload: Record<string, unknown>;
  }>;
}

export interface PushChangeRecordsResponse {
  results: Array<{
    change_uuid: string;
    sequence: number;
  }>;
}

export interface PullChangeRecordsQuery {
  since?: number;
}

export interface PullChangeRecordsResponse {
  records: Array<{
    change_uuid: string;
    sequence: number;
    encrypted_payload: unknown;
  }>;
  next_since: number | null;
}

export interface GetAccountMembersResponse {
  members: Array<{
    user_id: string;
    role: 'owner' | 'member';
    joined_at: string;
    public_key: string;
  }>;
}

export interface RemoveAccountMemberResponse {
  new_epoch: number;
}

export interface BatchUploadWrappedKeysRequest {
  new_epoch: number;
  wrapped_keys: Array<{
    user_id: string;
    wrapped_key: Record<string, unknown>;
  }>;
}

export interface BatchUploadWrappedKeysResponse {
  status: 'ok';
}

export interface RemoveAccountMemberAndUploadWrappedKeysRequest {
  wrapped_keys: Array<{
    user_id: string;
    wrapped_key: Record<string, unknown>;
  }>;
}

export interface RemoveAccountMemberAndUploadWrappedKeysResponse {
  new_epoch: number;
}

export interface PendingKeyDelivery {
  invite_id: string;
  recipient_user_id: string;
  recipient_public_key: string;
}

export interface PollPendingKeyRequestsResponse {
  pending_key_deliveries: PendingKeyDelivery[];
}

export interface DeliverAccountKeyRequest {
  user_id: string;
  wrapped_key: Record<string, unknown>;
  epoch: number;
}

export const ACCOUNTS_ROUTES = {
  accounts: '/v1/accounts',
  accountKeys: '/v1/accounts/:id/keys',
  accountPendingKeyRequests: '/v1/accounts/:id/pending-key-requests',
  accountRecords: '/v1/accounts/:id/records',
  accountMembers: '/v1/accounts/:id/members',
  accountMember: '/v1/accounts/:id/members/:userId',
  accountMemberKeysBatch: '/v1/accounts/:id/members/:userId/keys/batch',
  accountKeysBatch: '/v1/accounts/:id/keys/batch',
  accountSharing: '/v1/accounts/:id/sharing',
  accountInvites: '/v1/accounts/:id/invites',
  accountInviteDetail: '/v1/accounts/:id/invites/:inviteId',
} as const;

export const accountsRoutes: FastifyPluginAsync = async (server) => {
  server.get(
    ACCOUNTS_ROUTES.accounts,
    {
      schema: {
        response: {
          [HTTP_STATUS.ok]: {
            type: 'object',
            required: ['accounts'],
            properties: {
              accounts: {
                type: 'array',
                items: {
                  type: 'object',
                  required: ['id', 'key_epoch', 'role', 'record_count', 'created_at'],
                  properties: {
                    id: { type: 'string', pattern: UUID_PATTERN },
                    key_epoch: { type: 'integer', minimum: 1 },
                    role: { type: 'string', enum: ['owner', 'member'] },
                    record_count: { type: 'integer', minimum: 0 },
                    created_at: { type: 'string', format: 'date-time' },
                  },
                  additionalProperties: false,
                },
              },
            },
            additionalProperties: false,
          },
          [HTTP_STATUS.unauthorized]: ERROR_RESPONSE_SCHEMA,
        },
      },
    },
    async (request, reply): Promise<ListAccountsResponse | ErrorResponse> => {
      const session = await authenticateSession(server, request);
      if (!session) {
        return reply.code(HTTP_STATUS.unauthorized).send({ error: ERROR_CODES.unauthorized });
      }

      const accounts = await listAccountsForUser(server.db, { userId: session.userId });

      return {
        accounts: accounts.map((account) => ({
          id: account.id,
          key_epoch: account.keyEpoch,
          role: account.role,
          record_count: account.recordCount,
          created_at: account.createdAt.toISOString(),
        })),
      };
    },
  );

  server.post(
    ACCOUNTS_ROUTES.accounts,
    {
      schema: {
        body: {
          type: 'object',
          required: ['wrapped_key', 'epoch'],
          properties: {
            wrapped_key: OPAQUE_JSON_OBJECT_SCHEMA,
            epoch: { type: 'integer', const: 1 },
          },
          additionalProperties: false,
        },
        response: {
          [HTTP_STATUS.created]: {
            type: 'object',
            required: ['id', 'key_epoch'],
            properties: {
              id: { type: 'string', pattern: UUID_PATTERN },
              key_epoch: { type: 'integer', const: 1 },
            },
          },
          [HTTP_STATUS.unauthorized]: ERROR_RESPONSE_SCHEMA,
          [HTTP_STATUS.internalServerError]: ERROR_RESPONSE_SCHEMA,
        },
      },
    },
    async (request, reply): Promise<CreateAccountResponse | ErrorResponse> => {
      const session = await authenticateSession(server, request);
      if (!session) {
        return reply.code(HTTP_STATUS.unauthorized).send({ error: ERROR_CODES.unauthorized });
      }

      const body = request.body as CreateAccountRequest;

      try {
        const account = await createAccountWithOwnerKey(server.db, {
          userId: session.userId,
          wrappedKey: body.wrapped_key,
          epoch: body.epoch,
        });

        return reply.code(HTTP_STATUS.created).send({
          id: account.id,
          key_epoch: account.keyEpoch,
        });
      } catch (error) {
        server.log.error({ error }, 'Account creation failed');
        return reply
          .code(HTTP_STATUS.internalServerError)
          .send({ error: ERROR_CODES.accountCreateFailed });
      }
    },
  );

  server.get(
    ACCOUNTS_ROUTES.accountKeys,
    {
      schema: {
        params: {
          type: 'object',
          required: ['id'],
          properties: {
            id: { type: 'string', pattern: UUID_PATTERN },
          },
        },
        querystring: {
          type: 'object',
          properties: {
            epoch: { type: 'integer', minimum: 1 },
          },
          additionalProperties: false,
        },
        response: {
          [HTTP_STATUS.ok]: {
            type: 'object',
            required: ['account_id', 'epoch', 'wrapped_key'],
            properties: {
              account_id: { type: 'string', pattern: UUID_PATTERN },
              epoch: { type: 'integer', minimum: 1 },
              wrapped_key: OPAQUE_JSON_OBJECT_SCHEMA,
            },
          },
          [HTTP_STATUS.unauthorized]: ERROR_RESPONSE_SCHEMA,
          [HTTP_STATUS.forbidden]: ERROR_RESPONSE_SCHEMA,
          [HTTP_STATUS.notFound]: ERROR_RESPONSE_SCHEMA,
        },
      },
    },
    async (request, reply): Promise<GetAccountKeyResponse | ErrorResponse> => {
      const session = await authenticateSession(server, request);
      if (!session) {
        return reply.code(HTTP_STATUS.unauthorized).send({ error: ERROR_CODES.unauthorized });
      }

      const { id } = request.params as { id: string };
      const { epoch } = request.query as GetAccountKeyQuery;
      const result = await getAccountKeyForUser(server.db, {
        accountId: id,
        userId: session.userId,
        epoch,
      });

      if (result.status === 'account_not_found') {
        return reply.code(HTTP_STATUS.notFound).send({ error: ERROR_CODES.accountNotFound });
      }

      if (result.status === 'forbidden') {
        return reply.code(HTTP_STATUS.forbidden).send({ error: ERROR_CODES.forbidden });
      }

      return {
        account_id: result.accountId,
        epoch: result.epoch,
        wrapped_key: result.wrappedKey,
      };
    },
  );

  // GET /v1/accounts/:id/pending-key-requests
  // Owner polls for accepted invites that are awaiting a wrapped key delivery.
  server.get(
    ACCOUNTS_ROUTES.accountPendingKeyRequests,
    {
      config: { skipNonce: true },
      schema: {
        params: {
          type: 'object',
          required: ['id'],
          properties: {
            id: { type: 'string', pattern: UUID_PATTERN },
          },
        },
        response: {
          [HTTP_STATUS.ok]: {
            type: 'object',
            required: ['pending_key_deliveries'],
            properties: {
              pending_key_deliveries: {
                type: 'array',
                items: {
                  type: 'object',
                  required: ['invite_id', 'recipient_user_id', 'recipient_public_key'],
                  properties: {
                    invite_id: { type: 'string', pattern: UUID_PATTERN },
                    recipient_user_id: { type: 'string', pattern: UUID_PATTERN },
                    recipient_public_key: { type: 'string', pattern: PUBLIC_KEY_PATTERN },
                  },
                },
              },
            },
          },
          [HTTP_STATUS.unauthorized]: ERROR_RESPONSE_SCHEMA,
          [HTTP_STATUS.forbidden]: ERROR_RESPONSE_SCHEMA,
          [HTTP_STATUS.notFound]: ERROR_RESPONSE_SCHEMA,
        },
      },
    },
    async (request, reply): Promise<PollPendingKeyRequestsResponse | ErrorResponse> => {
      const session = await authenticateSession(server, request);
      if (!session) {
        return reply.code(HTTP_STATUS.unauthorized).send({ error: ERROR_CODES.unauthorized });
      }

      const { id } = request.params as { id: string };
      const result = await listPendingKeyDeliveries(server.db, {
        accountId: id,
        ownerUserId: session.userId,
      }, server.log);

      server.log.info(
        { accountId: id, ownerUserId: session.userId, resultType: typeof result, pendingCount: Array.isArray(result) ? result.length : result },
        'pollPendingKeyRequests result',
      );

      if (result === 'account_not_found') {
        return reply.code(HTTP_STATUS.notFound).send({ error: ERROR_CODES.accountNotFound });
      }

      if (result === 'forbidden') {
        return reply.code(HTTP_STATUS.forbidden).send({ error: ERROR_CODES.forbidden });
      }

      return {
        pending_key_deliveries: result.map((d) => ({
          invite_id: d.inviteId,
          recipient_user_id: d.recipientUserId,
          recipient_public_key: d.recipientPublicKey,
        })),
      };
    },
  );

  // POST /v1/accounts/:id/keys
  // Owner delivers a wrapped account key to a recipient who accepted an invite.
  server.post(
    ACCOUNTS_ROUTES.accountKeys,
    {
      schema: {
        params: {
          type: 'object',
          required: ['id'],
          properties: {
            id: { type: 'string', pattern: UUID_PATTERN },
          },
        },
        body: {
          type: 'object',
          required: ['user_id', 'wrapped_key', 'epoch'],
          properties: {
            user_id: { type: 'string', pattern: UUID_PATTERN },
            wrapped_key: OPAQUE_JSON_OBJECT_SCHEMA,
            epoch: { type: 'integer', minimum: 1 },
          },
          additionalProperties: false,
        },
        response: {
          [HTTP_STATUS.created]: {
            type: 'object',
            required: ['status'],
            properties: {
              status: { type: 'string', const: 'ok' },
            },
          },
          [HTTP_STATUS.unauthorized]: ERROR_RESPONSE_SCHEMA,
          [HTTP_STATUS.forbidden]: ERROR_RESPONSE_SCHEMA,
          [HTTP_STATUS.notFound]: ERROR_RESPONSE_SCHEMA,
          [HTTP_STATUS.conflict]: ERROR_RESPONSE_SCHEMA,
        },
      },
    },
    async (request, reply): Promise<{ status: 'ok' } | ErrorResponse> => {
      const session = await authenticateSession(server, request);
      if (!session) {
        return reply.code(HTTP_STATUS.unauthorized).send({ error: ERROR_CODES.unauthorized });
      }

      const { id } = request.params as { id: string };
      const body = request.body as DeliverAccountKeyRequest;

      const result = await deliverWrappedKey(server.db, {
        accountId: id,
        ownerUserId: session.userId,
        recipientUserId: body.user_id,
        wrappedKey: body.wrapped_key,
        epoch: body.epoch,
      });

      if (result.status === 'account_not_found') {
        return reply.code(HTTP_STATUS.notFound).send({ error: ERROR_CODES.accountNotFound });
      }

      if (result.status === 'forbidden') {
        return reply.code(HTTP_STATUS.forbidden).send({ error: ERROR_CODES.forbidden });
      }

      if (result.status === 'invite_not_accepted') {
        return reply.code(HTTP_STATUS.conflict).send({ error: ERROR_CODES.inviteNotAccepted });
      }

      return reply.code(HTTP_STATUS.created).send({ status: 'ok' });
    },
  );

  server.post(
    ACCOUNTS_ROUTES.accountRecords,
    {
      schema: {
        params: {
          type: 'object',
          required: ['id'],
          properties: {
            id: { type: 'string', pattern: UUID_PATTERN },
          },
        },
        body: {
          type: 'object',
          required: ['records'],
          properties: {
            records: {
              type: 'array',
              minItems: 1,
              maxItems: SYNC_RECORDS_MAX_PER_REQUEST,
              items: {
                type: 'object',
                required: ['change_uuid', 'encrypted_payload'],
                properties: {
                  change_uuid: { type: 'string', pattern: UUID_PATTERN },
                  encrypted_payload: OPAQUE_JSON_OBJECT_SCHEMA,
                },
                additionalProperties: false,
              },
            },
          },
          additionalProperties: false,
        },
        response: {
          [HTTP_STATUS.ok]: {
            type: 'object',
            required: ['results'],
            properties: {
              results: {
                type: 'array',
                items: {
                  type: 'object',
                  required: ['change_uuid', 'sequence'],
                  properties: {
                    change_uuid: { type: 'string', pattern: UUID_PATTERN },
                    sequence: { type: 'integer', minimum: 1 },
                  },
                },
              },
            },
          },
          [HTTP_STATUS.unauthorized]: ERROR_RESPONSE_SCHEMA,
          [HTTP_STATUS.forbidden]: ERROR_RESPONSE_SCHEMA,
          [HTTP_STATUS.notFound]: ERROR_RESPONSE_SCHEMA,
          [HTTP_STATUS.conflict]: ERROR_RESPONSE_SCHEMA,
          [HTTP_STATUS.internalServerError]: ERROR_RESPONSE_SCHEMA,
        },
      },
    },
    async (request, reply): Promise<PushChangeRecordsResponse | ErrorResponse> => {
      const session = await authenticateSession(server, request);
      if (!session) {
        return reply.code(HTTP_STATUS.unauthorized).send({ error: ERROR_CODES.unauthorized });
      }

      const { id } = request.params as { id: string };
      const body = request.body as PushChangeRecordsRequest;

      try {
        const result = await pushChangeRecords(server.db, {
          accountId: id,
          userId: session.userId,
          records: body.records.map((record) => ({
            changeUuid: record.change_uuid,
            encryptedPayload: record.encrypted_payload,
          })),
        });

        if (result.status === 'account_not_found') {
          return reply.code(HTTP_STATUS.notFound).send({ error: ERROR_CODES.accountNotFound });
        }

        if (result.status === 'forbidden') {
          return reply.code(HTTP_STATUS.forbidden).send({ error: ERROR_CODES.accountKeyNotFound });
        }

        if (result.status === 'change_uuid_conflict') {
          return reply.code(HTTP_STATUS.conflict).send({ error: ERROR_CODES.changeUuidConflict });
        }

        return {
          results: result.results.map((record) => ({
            change_uuid: record.changeUuid,
            sequence: record.sequence,
          })),
        };
      } catch (error) {
        server.log.error({ error }, 'Change record push failed');
        return reply
          .code(HTTP_STATUS.internalServerError)
          .send({ error: ERROR_CODES.changeRecordPushFailed });
      }
    },
  );

  server.get(
    ACCOUNTS_ROUTES.accountRecords,
    {
      schema: {
        params: {
          type: 'object',
          required: ['id'],
          properties: {
            id: { type: 'string', pattern: UUID_PATTERN },
          },
        },
        querystring: {
          type: 'object',
          properties: {
            since: { type: 'integer', minimum: 0 },
          },
          additionalProperties: false,
        },
        response: {
          [HTTP_STATUS.ok]: {
            type: 'object',
            required: ['records', 'next_since'],
            properties: {
              records: {
                type: 'array',
                items: {
                  type: 'object',
                  required: ['change_uuid', 'sequence', 'encrypted_payload'],
                  properties: {
                    change_uuid: { type: 'string', pattern: UUID_PATTERN },
                    sequence: { type: 'integer', minimum: 1 },
                    encrypted_payload: OPAQUE_JSON_OBJECT_SCHEMA,
                  },
                },
              },
              next_since: {
                anyOf: [
                  { type: 'integer', minimum: 1 },
                  { type: 'null' },
                ],
              },
            },
          },
          [HTTP_STATUS.unauthorized]: ERROR_RESPONSE_SCHEMA,
          [HTTP_STATUS.forbidden]: ERROR_RESPONSE_SCHEMA,
          [HTTP_STATUS.notFound]: ERROR_RESPONSE_SCHEMA,
        },
      },
    },
    async (request, reply): Promise<PullChangeRecordsResponse | ErrorResponse> => {
      const session = await authenticateSession(server, request);
      if (!session) {
        return reply.code(HTTP_STATUS.unauthorized).send({ error: ERROR_CODES.unauthorized });
      }

      const { id } = request.params as { id: string };
      const { since = 0 } = request.query as PullChangeRecordsQuery;
      const result = await pullChangeRecords(server.db, {
        accountId: id,
        userId: session.userId,
        since,
      });

      if (result.status === 'account_not_found') {
        return reply.code(HTTP_STATUS.notFound).send({ error: ERROR_CODES.accountNotFound });
      }

      if (result.status === 'forbidden') {
        return reply.code(HTTP_STATUS.forbidden).send({ error: ERROR_CODES.accountKeyNotFound });
      }

      return {
        records: result.records.map((record) => ({
          change_uuid: record.changeUuid,
          sequence: record.sequence,
          encrypted_payload: record.encryptedPayload,
        })),
        next_since: result.nextSince,
      };
    },
  );

  server.get(
    ACCOUNTS_ROUTES.accountMembers,
    {
      schema: {
        params: {
          type: 'object',
          required: ['id'],
          properties: {
            id: { type: 'string', pattern: UUID_PATTERN },
          },
        },
        response: {
          [HTTP_STATUS.ok]: {
            type: 'object',
            required: ['members'],
            properties: {
              members: {
                type: 'array',
                items: {
                  type: 'object',
                  required: ['user_id', 'role', 'joined_at', 'public_key'],
                  additionalProperties: false,
                  properties: {
                    user_id: { type: 'string', pattern: UUID_PATTERN },
                    role: { type: 'string', enum: ['owner', 'member'] },
                    joined_at: { type: 'string', format: 'date-time' },
                    public_key: { type: 'string', pattern: PUBLIC_KEY_PATTERN },
                  },
                },
              },
            },
          },
          [HTTP_STATUS.unauthorized]: ERROR_RESPONSE_SCHEMA,
          [HTTP_STATUS.forbidden]: ERROR_RESPONSE_SCHEMA,
          [HTTP_STATUS.notFound]: ERROR_RESPONSE_SCHEMA,
        },
      },
    },
    async (request, reply): Promise<GetAccountMembersResponse | ErrorResponse> => {
      const session = await authenticateSession(server, request);
      if (!session) {
        return reply.code(HTTP_STATUS.unauthorized).send({ error: ERROR_CODES.unauthorized });
      }

      const { id } = request.params as { id: string };
      const result = await getAccountMembers(server.db, {
        accountId: id,
        requestorUserId: session.userId,
      });

      if (result.status === 'account_not_found') {
        return reply.code(HTTP_STATUS.notFound).send({ error: ERROR_CODES.accountNotFound });
      }

      if (result.status === 'forbidden') {
        return reply.code(HTTP_STATUS.forbidden).send({ error: ERROR_CODES.forbidden });
      }

      return {
        members: result.members.map((member) => ({
          user_id: member.userId,
          role: member.role,
          joined_at: member.joinedAt.toISOString(),
          public_key: member.publicKey,
        })),
      };
    },
  );

  server.delete(
    ACCOUNTS_ROUTES.accountMember,
    {
      schema: {
        params: {
          type: 'object',
          required: ['id', 'userId'],
          properties: {
            id: { type: 'string', pattern: UUID_PATTERN },
            userId: { type: 'string', pattern: UUID_PATTERN },
          },
        },
        response: {
          [HTTP_STATUS.ok]: {
            type: 'object',
            required: ['new_epoch'],
            properties: {
              new_epoch: { type: 'integer', minimum: 1 },
            },
          },
          [HTTP_STATUS.unauthorized]: ERROR_RESPONSE_SCHEMA,
          [HTTP_STATUS.forbidden]: ERROR_RESPONSE_SCHEMA,
          [HTTP_STATUS.notFound]: ERROR_RESPONSE_SCHEMA,
          [HTTP_STATUS.conflict]: ERROR_RESPONSE_SCHEMA,
        },
      },
    },
    async (request, reply): Promise<RemoveAccountMemberResponse | ErrorResponse> => {
      const session = await authenticateSession(server, request);
      if (!session) {
        return reply.code(HTTP_STATUS.unauthorized).send({ error: ERROR_CODES.unauthorized });
      }

      const { id, userId } = request.params as { id: string; userId: string };
      const result = await removeAccountMember(server.db, {
        accountId: id,
        requestorUserId: session.userId,
        userIdToRemove: userId,
      });

      if (result.status === 'account_not_found') {
        return reply.code(HTTP_STATUS.notFound).send({ error: ERROR_CODES.accountNotFound });
      }

      if (result.status === 'forbidden') {
        return reply.code(HTTP_STATUS.forbidden).send({ error: ERROR_CODES.forbidden });
      }

      if (result.status === 'cannot_remove_owner') {
        return reply.code(HTTP_STATUS.conflict).send({ error: ERROR_CODES.cannotRemoveOwner });
      }

      if (result.status === 'member_not_found') {
        return reply.code(HTTP_STATUS.notFound).send({ error: ERROR_CODES.memberNotFound });
      }

      return {
        new_epoch: result.newEpoch,
      };
    },
  );

  server.post(
    ACCOUNTS_ROUTES.accountMemberKeysBatch,
    {
      schema: {
        params: {
          type: 'object',
          required: ['id', 'userId'],
          properties: {
            id: { type: 'string', pattern: UUID_PATTERN },
            userId: { type: 'string', pattern: UUID_PATTERN },
          },
        },
        body: {
          type: 'object',
          required: ['wrapped_keys'],
          properties: {
            wrapped_keys: {
              type: 'array',
              minItems: 1,
              items: {
                type: 'object',
                required: ['user_id', 'wrapped_key'],
                properties: {
                  user_id: { type: 'string', pattern: UUID_PATTERN },
                  wrapped_key: OPAQUE_JSON_OBJECT_SCHEMA,
                },
              },
              uniqueItems: true,
            },
          },
        },
        response: {
          [HTTP_STATUS.ok]: {
            type: 'object',
            required: ['new_epoch'],
            properties: {
              new_epoch: { type: 'integer', minimum: 1 },
            },
          },
          [HTTP_STATUS.unauthorized]: ERROR_RESPONSE_SCHEMA,
          [HTTP_STATUS.forbidden]: ERROR_RESPONSE_SCHEMA,
          [HTTP_STATUS.notFound]: ERROR_RESPONSE_SCHEMA,
          [HTTP_STATUS.conflict]: ERROR_RESPONSE_SCHEMA,
        },
      },
    },
    async (request, reply): Promise<RemoveAccountMemberAndUploadWrappedKeysResponse | ErrorResponse> => {
      const session = await authenticateSession(server, request);
      if (!session) {
        return reply.code(HTTP_STATUS.unauthorized).send({ error: ERROR_CODES.unauthorized });
      }

      const { id, userId } = request.params as { id: string; userId: string };
      const body = request.body as RemoveAccountMemberAndUploadWrappedKeysRequest;
      const result = await removeAccountMemberAndUploadWrappedKeys(server.db, {
        accountId: id,
        requestorUserId: session.userId,
        userIdToRemove: userId,
        wrappedKeys: body.wrapped_keys.map((wk) => ({
          userId: wk.user_id,
          wrappedKey: wk.wrapped_key,
        })),
      });

      if (result.status === 'account_not_found') {
        return reply.code(HTTP_STATUS.notFound).send({ error: ERROR_CODES.accountNotFound });
      }

      if (result.status === 'forbidden') {
        return reply.code(HTTP_STATUS.forbidden).send({ error: ERROR_CODES.forbidden });
      }

      if (result.status === 'cannot_remove_owner') {
        return reply.code(HTTP_STATUS.conflict).send({ error: ERROR_CODES.cannotRemoveOwner });
      }

      if (result.status === 'member_not_found') {
        return reply.code(HTTP_STATUS.notFound).send({ error: ERROR_CODES.memberNotFound });
      }

      if (result.status === 'non_member') {
        return reply.code(HTTP_STATUS.conflict).send({ error: ERROR_CODES.nonMember });
      }

      return {
        new_epoch: result.newEpoch,
      };
    },
  );

  server.post(
    ACCOUNTS_ROUTES.accountKeysBatch,
    {
      schema: {
        params: {
          type: 'object',
          required: ['id'],
          properties: {
            id: { type: 'string', pattern: UUID_PATTERN },
          },
        },
        body: {
          type: 'object',
          required: ['new_epoch', 'wrapped_keys'],
          properties: {
            new_epoch: { type: 'integer', minimum: 1 },
            wrapped_keys: {
              type: 'array',
              minItems: 1,
              items: {
                type: 'object',
                required: ['user_id', 'wrapped_key'],
                properties: {
                  user_id: { type: 'string', pattern: UUID_PATTERN },
                  wrapped_key: OPAQUE_JSON_OBJECT_SCHEMA,
                },
              },
              uniqueItems: true,
            },
          },
        },
        response: {
          [HTTP_STATUS.ok]: {
            type: 'object',
            required: ['status'],
            properties: {
              status: { type: 'string', const: 'ok' },
            },
          },
          [HTTP_STATUS.unauthorized]: ERROR_RESPONSE_SCHEMA,
          [HTTP_STATUS.forbidden]: ERROR_RESPONSE_SCHEMA,
          [HTTP_STATUS.notFound]: ERROR_RESPONSE_SCHEMA,
          [HTTP_STATUS.conflict]: ERROR_RESPONSE_SCHEMA,
        },
      },
    },
    async (request, reply): Promise<BatchUploadWrappedKeysResponse | ErrorResponse> => {
      const session = await authenticateSession(server, request);
      if (!session) {
        return reply.code(HTTP_STATUS.unauthorized).send({ error: ERROR_CODES.unauthorized });
      }

      const { id } = request.params as { id: string };
      const body = request.body as BatchUploadWrappedKeysRequest;
      const result = await batchUploadWrappedKeys(server.db, {
        accountId: id,
        requestorUserId: session.userId,
        newEpoch: body.new_epoch,
        wrappedKeys: body.wrapped_keys.map((wk) => ({
          userId: wk.user_id,
          wrappedKey: wk.wrapped_key,
        })),
      });

      if (result.status === 'account_not_found') {
        return reply.code(HTTP_STATUS.notFound).send({ error: ERROR_CODES.accountNotFound });
      }

      if (result.status === 'forbidden') {
        return reply.code(HTTP_STATUS.forbidden).send({ error: ERROR_CODES.forbidden });
      }

      if (result.status === 'epoch_mismatch') {
        return reply.code(HTTP_STATUS.conflict).send({ error: ERROR_CODES.conflict });
      }

      if (result.status === 'non_member') {
        return reply.code(HTTP_STATUS.conflict).send({ error: ERROR_CODES.nonMember });
      }

      return { status: 'ok' };
    },
  );
  server.get(
    ACCOUNTS_ROUTES.accountSharing,
    {
      schema: {
        params: {
          type: 'object',
          required: ['id'],
          properties: { id: { type: 'string', pattern: UUID_PATTERN } },
        },
        response: {
          [HTTP_STATUS.ok]: {
            type: 'object',
            properties: {
              currentUserId: { type: 'string' },
              members: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    userId: { type: 'string' },
                    displayEmail: { type: 'string', nullable: true },
                    role: { type: 'string' },
                    joinedAt: { type: 'string' },
                  },
                },
              },
              pendingInvites: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    id: { type: 'string' },
                    recipientEmail: { type: 'string', nullable: true },
                    recipientEmailHash: { type: 'string' },
                    status: { type: 'string' },
                    createdAt: { type: 'string' },
                  },
                },
              },
            },
          },
          [HTTP_STATUS.unauthorized]: ERROR_RESPONSE_SCHEMA,
          [HTTP_STATUS.forbidden]: ERROR_RESPONSE_SCHEMA,
        },
      },
    },
    async (request, reply) => {
      const session = await authenticateSession(server, request);
      if (!session) {
        return reply.code(HTTP_STATUS.unauthorized).send({ error: ERROR_CODES.unauthorized });
      }

      const { id } = request.params as { id: string };
      const result = await getAccountSharingInfo(server.db, id, session.userId);

      if (result.status === 'forbidden') {
        return reply.code(HTTP_STATUS.forbidden).send({ error: ERROR_CODES.forbidden });
      }

      return result;
    },
  );

  server.post(
    ACCOUNTS_ROUTES.accountInvites,
    {
      schema: {
        params: {
          type: 'object',
          required: ['id'],
          properties: { id: { type: 'string', pattern: UUID_PATTERN } },
        },
        body: {
          type: 'object',
          required: ['recipient_email_hash', 'sender_name', 'account_name'],
          properties: {
            recipient_email: { type: 'string', format: 'email', nullable: true },
            recipient_email_hash: { type: 'string', pattern: '^[a-f0-9]{64}$' },
            sender_name: { type: 'string' },
            sender_email: { type: 'string', format: 'email', nullable: true },
            account_name: { type: 'string' },
            language: { type: 'string', nullable: true },
          },
        },
        response: {
          [HTTP_STATUS.created]: {
            type: 'object',
            properties: { status: { type: 'string' } },
          },
          [HTTP_STATUS.unauthorized]: ERROR_RESPONSE_SCHEMA,
          [HTTP_STATUS.forbidden]: ERROR_RESPONSE_SCHEMA,
          [HTTP_STATUS.notFound]: ERROR_RESPONSE_SCHEMA,
          [HTTP_STATUS.conflict]: ERROR_RESPONSE_SCHEMA,
          [HTTP_STATUS.badRequest]: ERROR_RESPONSE_SCHEMA,
        },
      },
    },
    async (request, reply) => {
      const session = await authenticateSession(server, request);
      if (!session) {
        return reply.code(HTTP_STATUS.unauthorized).send({ error: ERROR_CODES.unauthorized });
      }

      const { id } = request.params as { id: string };
      const body = request.body as any;

      // Always re-compute the email hash server-side so the pepper used for
      // invites matches the one used during registration (server.env.emailHashPepper).
      // The client-provided hash may use a different pepper (or none at all).
      const recipientEmailHash = body.recipient_email
        ? await hashEmail(body.recipient_email, server.env.emailHashPepper)
        : body.recipient_email_hash;

      const result = await inviteMember(server.db, {
        accountId: id,
        senderUserId: session.userId,
        senderName: body.sender_name,
        senderEmail: body.sender_email,
        recipientEmail: body.recipient_email,
        recipientEmailHash,
        accountName: body.account_name,
        language: body.language,
      });

      server.log.info(
        {
          accountId: id,
          recipientEmail: body.recipient_email ? 'provided' : 'absent',
          recipientEmailHashProvided: !!body.recipient_email_hash,
          recipientEmailHashComputed: !!body.recipient_email,
          finalEmailHash: recipientEmailHash,
          resultStatus: result.status,
        },
        'invite creation result',
      );

      if (result.status === 'ok') {
        return reply.code(HTTP_STATUS.created).send({ status: 'ok' });
      }

      if (result.status === 'forbidden') {
        return reply.code(HTTP_STATUS.forbidden).send({ error: ERROR_CODES.forbidden });
      }

      if (result.status === 'account_not_found') {
        return reply.code(HTTP_STATUS.notFound).send({ error: result.status });
      }

      if (result.status === 'already_member' || result.status === 'already_invited') {
        return reply.code(HTTP_STATUS.conflict).send({ error: result.status });
      }

      return reply.code(HTTP_STATUS.badRequest).send({ error: (result as any).status });
    },
  );

  server.delete(
    ACCOUNTS_ROUTES.accountInviteDetail,
    {
      schema: {
        params: {
          type: 'object',
          required: ['id', 'inviteId'],
          properties: {
            id: { type: 'string', pattern: UUID_PATTERN },
            inviteId: { type: 'string', pattern: UUID_PATTERN },
          },
        },
      },
    },
    async (request, reply) => {
      const session = await authenticateSession(server, request);
      if (!session) {
        return reply.code(HTTP_STATUS.unauthorized).send({ error: ERROR_CODES.unauthorized });
      }

      const { id, inviteId } = request.params as { id: string; inviteId: string };
      const result = await cancelInvite(server.db, id, session.userId, inviteId);

      if (result.status === 'forbidden') {
        return reply.code(HTTP_STATUS.forbidden).send({ error: ERROR_CODES.forbidden });
      }

      if (result.status === 'not_found') {
        return reply.code(HTTP_STATUS.notFound).send({ error: result.status });
      }

      if (result.status === 'already_responded') {
        return reply.code(HTTP_STATUS.conflict).send({ error: result.status });
      }

      return reply.code(HTTP_STATUS.ok).send({ status: 'ok' });
    },
  );
};
