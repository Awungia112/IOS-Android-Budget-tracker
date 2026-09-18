import type { FastifyPluginAsync } from 'fastify';
import { type Static, Type } from '@sinclair/typebox';

import { HTTP_STATUS, ERROR_RESPONSE_SCHEMA } from '../http/http-contract.js';
import { SKIP_REPLAY_PROTECTION_CONFIG } from '../security/replay-protection-contract.js';
import { sendFeedbackEmail } from '../auth/email.service.js';

export const FEEDBACK_ROUTES = {
  submit: '/v1/feedback',
} as const;

// Request body schema (used for validation and type inference)
const FeedbackBodySchema = Type.Object(
  {
    message: Type.String({ minLength: 1, maxLength: 5000 }),
    email: Type.Optional(Type.String({ format: 'email' })),
  },
  { additionalProperties: false },
);

type FeedbackBody = Static<typeof FeedbackBodySchema>;

// Response schemas
const FeedbackSuccessSchema = Type.Object({
  status: Type.Literal('ok'),
});

const FeedbackRateLimitSchema = Type.Object({
  status: Type.Literal('too_many_requests'),
  retryAfter: Type.Optional(Type.Integer()),
});

interface FeedbackRouteOptions {
  recipientPrimary: string;
  recipientBackup: string;
  rateLimitMax?: number;
  rateLimitWindowMs?: number;
}

export const feedbackRoutes: FastifyPluginAsync<FeedbackRouteOptions> = async (
  server,
  { recipientPrimary, recipientBackup, rateLimitMax = 10, rateLimitWindowMs = 15 * 60 * 1000 },
) => {
  // Custom error handler for rate limit to match our schema
  server.setErrorHandler(async (error, request, reply) => {
    // Check if this is a rate limit error from @fastify/rate-limit
    const err = error as { statusCode?: number };
    if (err.statusCode === HTTP_STATUS.tooManyRequests) {
      return reply.code(HTTP_STATUS.tooManyRequests).send({
        status: 'too_many_requests',
        retryAfter: Math.ceil(rateLimitWindowMs / 1000),
      });
    }
    // Re-throw for default error handling
    throw error;
  });

  server.post(
    FEEDBACK_ROUTES.submit,
    {
      config: {
        ...SKIP_REPLAY_PROTECTION_CONFIG,
        rateLimit: {
          max: rateLimitMax,
          timeWindow: rateLimitWindowMs,
        },
      },
      schema: {
        body: FeedbackBodySchema,
        response: {
          [HTTP_STATUS.ok]: FeedbackSuccessSchema,
          [HTTP_STATUS.tooManyRequests]: FeedbackRateLimitSchema,
          [HTTP_STATUS.badRequest]: ERROR_RESPONSE_SCHEMA,
        },
      },
    },
    async (request, reply) => {
      const { message, email } = request.body as FeedbackBody;

      await sendFeedbackEmail({
        message,
        email,
        timestamp: new Date().toISOString(),
        recipientPrimary,
        recipientBackup,
      });

      return reply.code(HTTP_STATUS.ok).send({ status: 'ok' });
    },
  );
};