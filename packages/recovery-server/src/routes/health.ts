import type { FastifyPluginAsync } from 'fastify';

export const RECOVERY_SERVICE_NAME = 'recovery';

export const healthRoutes: FastifyPluginAsync = async (server) => {
  server.get(
    '/health',
    {
      schema: {
        response: {
          200: {
            type: 'object',
            required: ['status', 'service'],
            properties: {
              status: { type: 'string', const: 'ok' },
              service: { type: 'string', const: RECOVERY_SERVICE_NAME },
            },
          },
        },
      },
    },
    async () => ({ status: 'ok', service: RECOVERY_SERVICE_NAME }),
  );
};
