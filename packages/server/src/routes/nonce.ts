import type { FastifyPluginAsync } from 'fastify';

import type { NonceStore } from '../security/nonce-store.js';
import {
  NONCE_ROUTE,
  SKIP_REPLAY_PROTECTION_CONFIG,
  type NonceResponse,
} from '../security/replay-protection-contract.js';

interface NonceRouteOptions {
  nonceStore: NonceStore;
}

export const nonceRoutes: FastifyPluginAsync<NonceRouteOptions> = async (server, { nonceStore }) => {
  server.get(
    NONCE_ROUTE,
    {
      config: SKIP_REPLAY_PROTECTION_CONFIG,
      schema: {
        response: {
          200: {
            type: 'object',
            required: ['nonce', 'expires_at'],
            properties: {
              nonce: { type: 'string' },
              expires_at: { type: 'string', format: 'date-time' },
            },
          },
        },
      },
    },
    async (_request, reply): Promise<NonceResponse> => {
      // A nonce is single-use: a cached response (CDN, WebView HTTP cache)
      // would replay an already-consumed nonce and fail with invalid_nonce.
      reply.header('cache-control', 'no-store');
      return await nonceStore.issue();
    },
  );
};
