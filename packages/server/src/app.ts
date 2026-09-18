import Fastify, { type FastifyInstance, type FastifyServerOptions } from 'fastify';
import cors from '@fastify/cors';
import jwt from '@fastify/jwt';
import rateLimit from '@fastify/rate-limit';

import { SYNC_BODY_LIMIT_BYTES } from '@budget/shared/sync-limits';
import { SESSION_TOKEN_RENEWAL_HEADER } from '@budget/shared/session-token';
import { healthRoutes } from './routes/health.js';
import { usersRoutes } from './routes/users.js';
import { authRoutes } from './routes/auth.js';
import { accountsRoutes } from './routes/accounts.js';
import { inviteRoutes } from './routes/invites.js';
import { nonceRoutes } from './routes/nonce.js';
import { feedbackRoutes } from './routes/feedback.js';
import { wellKnownRoutes } from './routes/well-known.js';
import { startCleanupJob } from './jobs/cleanup.js';
import { installReplayProtection } from './security/replay-protection.js';
import { installSessionRenewal } from './auth/session.js';
import { DbNonceStore, type NonceStore } from './security/nonce-store.js';
import { initEmailEncryption } from './crypto/email-encryption.js';
import type { Db } from './users/user.repository.js';
import type { ServerEnv } from './config/env.js';

declare module 'fastify' {
  interface FastifyInstance {
    db: Db;
    env: ServerEnv;
  }
}

export interface AppOptions {
  fastifyOptions?: FastifyServerOptions;
  db: Db;
  env?: ServerEnv;
  /** Overridable for unit tests; defaults to the DB-backed store shared across replicas. */
  nonceStore?: NonceStore;
}

export async function buildServer({ fastifyOptions = {}, db, env, nonceStore }: AppOptions): Promise<FastifyInstance> {
  const server = Fastify({
    logger: {
      timestamp: () => `,"time":"${new Date().toISOString()}"`,
    },
    // Encrypted sync payloads (change records with xsalsa20-poly1305 envelopes,
    // base64url-encoded) can exceed Fastify's default 1MB when an account
    // accumulates many local operations before going online for the first time.
    // See @budget/shared/sync-limits for the coupled constants.
    bodyLimit: SYNC_BODY_LIMIT_BYTES,
    ...fastifyOptions,
  });

  const effectiveEnv: ServerEnv = env ?? {
    host: process.env.HOST?.trim() || '127.0.0.1',
    port: 3000,
    nodeEnv: process.env.NODE_ENV?.trim() || 'development',
    databaseUrl: process.env.DATABASE_URL?.trim() || '',
    emailHashPepper: process.env.BUDGET_WISE_PEPPER?.trim() || 'dev-pepper',
    emailEncryptionKey: process.env.EMAIL_ENCRYPTION_KEY?.trim() || '',
    magicLinkSecret: process.env.MAGIC_LINK_SECRET?.trim() || 'dev-secret-do-not-use-in-production',
    corsOrigin: process.env.CORS_ORIGIN?.trim()
      ? process.env.CORS_ORIGIN.trim().split(',').map(o => o.trim()).filter(Boolean)
      : (process.env.NODE_ENV?.trim() || 'development') === 'production'
        ? [/\.budget-wise\.de$/, /\.deutschlandimplus\.de$/]
        : true,
    feedbackRecipientPrimary: process.env.FEEDBACK_RECIPIENT_PRIMARY?.trim() || 'mobilebudget@deutschland-im-plus.de',
    feedbackRecipientBackup: process.env.FEEDBACK_RECIPIENT_BACKUP?.trim() || 'info@deutschland-im-plus.de',
    feedbackRateLimitMax: Number(process.env.FEEDBACK_RATE_LIMIT_MAX ?? 10),
    feedbackRateLimitWindowMs: Number(process.env.FEEDBACK_RATE_LIMIT_WINDOW_MS ?? 15 * 60 * 1000),
    reviewAccountEmail: process.env.REVIEW_ACCOUNT_EMAIL?.trim().toLowerCase() || undefined,
    reviewAccountCode: process.env.REVIEW_ACCOUNT_CODE?.trim() || undefined,
    appleTeamId: process.env.APPLE_TEAM_ID?.trim() || '',
    androidSha256Fingerprint: process.env.ANDROID_SHA256_FINGERPRINT?.trim() || '',
  };

  // Initialise email encryption key for encrypt/decrypt at rest
  initEmailEncryption(effectiveEnv.emailEncryptionKey);

  // The nonce store must be shared across replicas: prod runs several server
  // instances behind a load balancer, and the nonce is issued and consumed in
  // two separate requests that may land on different instances.
  const effectiveNonceStore = nonceStore ?? new DbNonceStore(db, server.log);

  // Plugins
  await server.register(cors, {
    origin: effectiveEnv.corsOrigin,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'x-nonce', 'x-timestamp'],
    // Clients read the renewed session token out of this response header.
    exposedHeaders: [SESSION_TOKEN_RENEWAL_HEADER],
  });

  await server.register(jwt, {
    secret: effectiveEnv.magicLinkSecret,
  });

  await server.register(rateLimit, { global: false });

  server.decorate('db', db);
  server.decorate('env', effectiveEnv);

  // Security & Routes
  installReplayProtection(server, effectiveNonceStore);
  installSessionRenewal(server);

  await server.register(nonceRoutes, { nonceStore: effectiveNonceStore });
  await server.register(healthRoutes);
  await server.register(wellKnownRoutes);
  await server.register(usersRoutes, { db });
  await server.register(authRoutes);
  await server.register(accountsRoutes);
  await server.register(inviteRoutes);
  await server.register(feedbackRoutes, {
    recipientPrimary: effectiveEnv.feedbackRecipientPrimary,
    recipientBackup: effectiveEnv.feedbackRecipientBackup,
    rateLimitMax: effectiveEnv.feedbackRateLimitMax,
    rateLimitWindowMs: effectiveEnv.feedbackRateLimitWindowMs,
  });

  // Start the hourly cleanup job once the server is ready and clear it on close.
  let cleanupHandle: NodeJS.Timeout | undefined;

  server.addHook('onReady', async () => {
    cleanupHandle = startCleanupJob(db, server.log);
  });

  server.addHook('onClose', async () => {
    if (cleanupHandle) clearInterval(cleanupHandle);
  });

  return server;
}
