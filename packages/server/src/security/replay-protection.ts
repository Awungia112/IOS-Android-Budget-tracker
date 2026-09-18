import type { FastifyInstance, FastifyRequest } from 'fastify';

import type { NonceStore } from './nonce-store.js';
import {
  REPLAY_PROTECTION_ERRORS,
  REPLAY_PROTECTION_HEADERS,
  TIMESTAMP_TOLERANCE_MS,
  isProtectedMutationMethod,
} from './replay-protection-contract.js';

function headerValue(value: FastifyRequest['headers'][string]): string | undefined {
  if (Array.isArray(value)) return value[0];
  return value;
}

function parseTimestamp(raw: string | undefined): number | undefined {
  if (raw === undefined || raw.trim() === '') return undefined;

  const timestamp = Number(raw);
  return Number.isSafeInteger(timestamp) && timestamp >= 0 ? timestamp : undefined;
}

function isTimestampInRange(timestamp: number | undefined, now: number): boolean {
  return timestamp !== undefined && Math.abs(now - timestamp) <= TIMESTAMP_TOLERANCE_MS;
}

export function installReplayProtection(server: FastifyInstance, nonceStore: NonceStore): void {
  server.addHook('onClose', async () => {
    await nonceStore.close();
  });

  server.addHook('preHandler', async (request, reply) => {
    if (request.routeOptions.config.skipNonce || !isProtectedMutationMethod(request.method)) {
      return;
    }

    const nonce = headerValue(request.headers[REPLAY_PROTECTION_HEADERS.nonce]);
    if (!nonce) {
      return reply.code(401).send({ error: REPLAY_PROTECTION_ERRORS.invalidNonce });
    }

    const now = Date.now();
    if (!(await nonceStore.consumeIfUsable(nonce, now))) {
      return reply.code(401).send({ error: REPLAY_PROTECTION_ERRORS.invalidNonce });
    }

    const timestamp = parseTimestamp(headerValue(request.headers[REPLAY_PROTECTION_HEADERS.timestamp]));
    if (!isTimestampInRange(timestamp, now)) {
      return reply.code(401).send({ error: REPLAY_PROTECTION_ERRORS.timestampOutOfRange });
    }
  });
}
