import Fastify, { type FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import jwt from '@fastify/jwt';
import rateLimit from '@fastify/rate-limit';
import { debugRoutes } from './routes/debug.js';
import { healthRoutes } from './routes/health.js';
import { enrollRoutes } from './routes/enroll.js';
import { requestRoutes } from './routes/request.js';
import { verifyRoutes } from './routes/verify.js';
import { deleteAccountRoutes } from './routes/delete-account.js';
import type { RecoveryDb } from './db/recovery.repository.js';
import type { BrevoClient } from './email/brevo.js';

export interface AppOptions {
  db?: RecoveryDb;
  brevo?: BrevoClient;
  emailPepper?: string;
  fastifyOptions?: Parameters<typeof Fastify>[0];
}

export async function buildServer(options: AppOptions = {}): Promise<FastifyInstance> {
  const { db, brevo, emailPepper = '', fastifyOptions = {} } = options;

  const server = Fastify({
    logger: true,
    ...fastifyOptions,
  });

  // Read the JWT secret from env — should be set to the same value as
  // the main server's MAGIC_LINK_SECRET so session tokens are accepted.
  const recoveryJwtSecret = process.env['RECOVERY_JWT_SECRET']?.trim() || 'dev-recovery-secret';

  // Fail fast in production: if the secret falls back to the dev default,
  // every DELETE /v1/recovery/account will return 401 and recovery data
  // (including the email_hash — directly identifying under GDPR Art. 17)
  // will silently survive account deletion.
  const isProduction = process.env['NODE_ENV'] === 'production';
  if (isProduction && recoveryJwtSecret === 'dev-recovery-secret') {
    throw new Error(
      'RECOVERY_JWT_SECRET must be configured in production. ' +
      'Set it to the same value as the main server\'s MAGIC_LINK_SECRET.',
    );
  }

  // Restrict origins in production; allow all in development.
  await server.register(cors, {
    origin: isProduction ? (process.env['CORS_ORIGIN'] || 'https://app.example.com') : true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  });

  // ── JWT plugin ──────────────────────────────────────────────────────────────
  // Required for the DELETE /v1/recovery/account endpoint which authenticates
  // using the session JWT from the main server.
  await server.register(jwt, {
    secret: recoveryJwtSecret,
  });

  // ── Global rate-limit (defence-in-depth) ────────────────────────────────────
  // Applied to all routes unless overridden per-route.
  // 100 requests per minute per IP is a generous ceiling for normal usage while
  // blocking automated scanning.
  await server.register(rateLimit, {
    global: true,
    max: 100,
    timeWindow: '1 minute',
  });

  // Only register debug routes when RECOVERY_DEBUG=true — reduces attack surface.
  if (process.env['RECOVERY_DEBUG'] === 'true') {
    await server.register(debugRoutes);
  }
  await server.register(healthRoutes);

  if (db) {
    await server.register(enrollRoutes, { db });
    await server.register(requestRoutes, { db, brevo, emailPepper });
    await server.register(verifyRoutes, { db });
    await server.register(deleteAccountRoutes, { db });
  }

  return server;
}
