import type { FastifyPluginAsync } from 'fastify';

import {
  acceptInvite,
  cancelInvite,
  declineInvite,
  listPendingInvitesForRecipient,
} from '../invites/invite.service.js';
import { authenticateSession } from '../auth/session.js';
import {
  ERROR_CODES,
  ERROR_RESPONSE_SCHEMA,
  HTTP_STATUS,
  UUID_PATTERN,
  type ErrorResponse,
} from '../http/http-contract.js';

export const INVITE_ROUTES = {
  pendingInvites: '/v1/invites/pending',
  acceptInvite: '/v1/invites/:id/accept',
  declineInvite: '/v1/invites/:id/decline',
  cancelInvite: '/v1/invites/:id',
} as const;

export const inviteRoutes: FastifyPluginAsync = async (server) => {
  // GET /v1/invites/pending — list pending invites addressed to the authenticated user
  server.get(
    INVITE_ROUTES.pendingInvites,
    {
      config: { skipNonce: true },
      schema: {
        response: {
          [HTTP_STATUS.ok]: {
            type: 'object',
            required: ['invites'],
            properties: {
              invites: {
                type: 'array',
                items: {
                  type: 'object',
                  required: ['id', 'account_id', 'sender_user_id', 'created_at'],
                  properties: {
                    id: { type: 'string', pattern: UUID_PATTERN },
                    account_id: { type: 'string', pattern: UUID_PATTERN },
                    sender_user_id: { type: 'string', pattern: UUID_PATTERN },
                    inviter_name: { type: 'string', nullable: true },
                    inviter_email: { type: 'string', nullable: true },
                    account_name: { type: 'string', nullable: true },
                    created_at: { type: 'string' },
                  },
                },
              },
            },
          },
          [HTTP_STATUS.unauthorized]: ERROR_RESPONSE_SCHEMA,
        },
      },
    },
    async (request, reply): Promise<{ invites: unknown[] } | ErrorResponse> => {
      const session = await authenticateSession(server, request);
      if (!session) {
        return reply.code(HTTP_STATUS.unauthorized).send({ error: ERROR_CODES.unauthorized });
      }

      const invites = await listPendingInvitesForRecipient(server.db, {
        recipientEmailHash: session.emailHash,
      });

      return {
        invites: invites.map((inv) => ({
          id: inv.id,
          account_id: inv.accountId,
          sender_user_id: inv.senderUserId,
          inviter_name: inv.senderName,
          inviter_email: inv.senderEmail,
          account_name: inv.accountName,
          created_at: inv.createdAt.toISOString(),
        })),
      };
    },
  );

  // POST /v1/invites/:id/accept — recipient accepts a pending invite
  server.post(
    INVITE_ROUTES.acceptInvite,
    {
      schema: {
        params: {
          type: 'object',
          required: ['id'],
          properties: { id: { type: 'string', pattern: UUID_PATTERN } },
        },
        response: {
          [HTTP_STATUS.ok]: { type: 'object', properties: {} },
          [HTTP_STATUS.unauthorized]: ERROR_RESPONSE_SCHEMA,
          [HTTP_STATUS.forbidden]: ERROR_RESPONSE_SCHEMA,
          [HTTP_STATUS.notFound]: ERROR_RESPONSE_SCHEMA,
          [HTTP_STATUS.conflict]: ERROR_RESPONSE_SCHEMA,
        },
      },
    },
    async (request, reply): Promise<Record<string, never> | ErrorResponse> => {
      const session = await authenticateSession(server, request);
      if (!session) {
        return reply.code(HTTP_STATUS.unauthorized).send({ error: ERROR_CODES.unauthorized });
      }

      const { id: inviteId } = request.params as { id: string };

      const result = await acceptInvite(server.db, {
        inviteId,
        recipientEmailHash: session.emailHash,
      });

      server.log.info(
        { inviteId, recipientEmailHash: session.emailHash, status: result.status },
        'invite accepted',
      );

      if (result.status === 'not_found') {
        return reply.code(HTTP_STATUS.notFound).send({ error: ERROR_CODES.inviteNotFound });
      }
      if (result.status === 'forbidden') {
        return reply.code(HTTP_STATUS.forbidden).send({ error: ERROR_CODES.forbidden });
      }
      if (result.status === 'already_responded') {
        return reply.code(HTTP_STATUS.conflict).send({ error: ERROR_CODES.inviteAlreadyResponded });
      }

      return reply.code(HTTP_STATUS.ok).send({});
    },
  );

  // POST /v1/invites/:id/decline — recipient declines a pending invite
  server.post(
    INVITE_ROUTES.declineInvite,
    {
      schema: {
        params: {
          type: 'object',
          required: ['id'],
          properties: { id: { type: 'string', pattern: UUID_PATTERN } },
        },
        response: {
          [HTTP_STATUS.ok]: { type: 'object', properties: {} },
          [HTTP_STATUS.unauthorized]: ERROR_RESPONSE_SCHEMA,
          [HTTP_STATUS.forbidden]: ERROR_RESPONSE_SCHEMA,
          [HTTP_STATUS.notFound]: ERROR_RESPONSE_SCHEMA,
          [HTTP_STATUS.conflict]: ERROR_RESPONSE_SCHEMA,
        },
      },
    },
    async (request, reply): Promise<Record<string, never> | ErrorResponse> => {
      const session = await authenticateSession(server, request);
      if (!session) {
        return reply.code(HTTP_STATUS.unauthorized).send({ error: ERROR_CODES.unauthorized });
      }

      const { id: inviteId } = request.params as { id: string };

      const result = await declineInvite(server.db, {
        inviteId,
        recipientEmailHash: session.emailHash,
      });

      if (result.status === 'not_found') {
        return reply.code(HTTP_STATUS.notFound).send({ error: ERROR_CODES.inviteNotFound });
      }
      if (result.status === 'forbidden') {
        return reply.code(HTTP_STATUS.forbidden).send({ error: ERROR_CODES.forbidden });
      }
      if (result.status === 'already_responded') {
        return reply.code(HTTP_STATUS.conflict).send({ error: ERROR_CODES.inviteAlreadyResponded });
      }

      return reply.code(HTTP_STATUS.ok).send({});
    },
  );

  // DELETE /v1/invites/:id — owner cancels a pending invite
  server.delete(
    INVITE_ROUTES.cancelInvite,
    {
      schema: {
        params: {
          type: 'object',
          required: ['id'],
          properties: { id: { type: 'string', pattern: UUID_PATTERN } },
        },
        response: {
          [HTTP_STATUS.ok]: { type: 'object', properties: {} },
          [HTTP_STATUS.unauthorized]: ERROR_RESPONSE_SCHEMA,
          [HTTP_STATUS.forbidden]: ERROR_RESPONSE_SCHEMA,
          [HTTP_STATUS.notFound]: ERROR_RESPONSE_SCHEMA,
          [HTTP_STATUS.conflict]: ERROR_RESPONSE_SCHEMA,
        },
      },
    },
    async (request, reply): Promise<Record<string, never> | ErrorResponse> => {
      const session = await authenticateSession(server, request);
      if (!session) {
        return reply.code(HTTP_STATUS.unauthorized).send({ error: ERROR_CODES.unauthorized });
      }

      const { id: inviteId } = request.params as { id: string };

      const result = await cancelInvite(server.db, {
        inviteId,
        senderUserId: session.userId,
      });

      if (result.status === 'not_found') {
        return reply.code(HTTP_STATUS.notFound).send({ error: ERROR_CODES.inviteNotFound });
      }
      if (result.status === 'forbidden') {
        return reply.code(HTTP_STATUS.forbidden).send({ error: ERROR_CODES.forbidden });
      }
      if (result.status === 'already_responded') {
        return reply.code(HTTP_STATUS.conflict).send({ error: ERROR_CODES.inviteAlreadyResponded });
      }

      return reply.code(HTTP_STATUS.ok).send({});
    },
  );
};
