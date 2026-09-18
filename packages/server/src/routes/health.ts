import type { FastifyPluginAsync } from 'fastify';

import { readPackageMeta } from '../config/package-meta.js';
import { SKIP_REPLAY_PROTECTION_CONFIG } from '../security/replay-protection-contract.js';

export const SERVER_SERVICE_NAME = 'budget-wise-server';

export interface HealthResponse {
  status: 'ok';
  service: typeof SERVER_SERVICE_NAME;
  version: string;
  timestamp: string;
}

export const healthRoutes: FastifyPluginAsync = async (server) => {
  server.get(
    '/health',
    {
      config: SKIP_REPLAY_PROTECTION_CONFIG,
      schema: {
        response: {
          200: {
            type: 'object',
            required: ['status', 'service', 'version', 'timestamp'],
            properties: {
              status: { type: 'string', const: 'ok' },
              service: { type: 'string', const: SERVER_SERVICE_NAME },
              version: { type: 'string' },
              timestamp: { type: 'string', format: 'date-time' },
            },
          },
        },
      },
    },
    async (): Promise<HealthResponse> => ({
      status: 'ok',
      service: SERVER_SERVICE_NAME,
      version: readPackageMeta().version,
      timestamp: new Date().toISOString(),
    }),
  );
};
