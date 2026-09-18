import { buildServer } from './app.js';
import { readRecoveryEnv } from './config/env.js';
import { startCleanupScheduler } from './db/cleanup.js';
import { closePgPool, createDb, createPgPool, ensureDbExists } from './db/client.js';
import { runMigrations } from './db/migrate.js';
import { BrevoClientImpl } from './email/brevo.js';

try {
  const env = readRecoveryEnv();
  let pool;
  let db;

  if (env.recoveryDbUrl) {
    // Bootstrap: create the target database if it doesn't exist yet.
    // This is a no-op on subsequent starts or when RECOVERY_DB_NAME is not set.
    await ensureDbExists();

    pool = createPgPool(env.recoveryDbUrl);
    db = createDb(pool);
    await runMigrations(db);
  }

  let brevo;
  if (env.brevoApiKey && (env.brevoSenderEmail || env.recoveryEmailTemplateId)) {
    brevo = new BrevoClientImpl({
      apiKey: env.brevoApiKey,
      senderEmail: env.brevoSenderEmail,
      senderName: env.brevoSenderName,
      templateId: env.recoveryEmailTemplateId,
    });
  }

  const server = await buildServer({ db, brevo, emailPepper: env.recoveryEmailPepper });

  if (!brevo) {
    if (!env.brevoApiKey) {
      server.log.warn('BREVO_API_KEY is not set — email delivery disabled');
    }
    if (!env.brevoSenderEmail && !env.recoveryEmailTemplateId) {
      server.log.warn('Neither BREVO_SENDER_EMAIL nor RECOVERY_EMAIL_TEMPLATE_ID is set — email delivery disabled');
    }
  }

  await server.listen({ host: env.host, port: env.port });

  let stopCleanup: (() => void) | undefined;
  if (db) {
    stopCleanup = startCleanupScheduler(db, {
      info: (msg, meta) => server.log.info(meta ?? {}, msg),
      error: (msg, meta) => server.log.error(meta ?? {}, msg),
    });
  } else {
    server.log.warn('RECOVERY_DB_URL is not set — database features disabled');
  }

  const shutdown = async (signal: string) => {
    server.log.info({ signal }, 'Shutting down recovery server');
    try {
      stopCleanup?.();
      await server.close();
      if (pool) await closePgPool(pool);
    } catch (error) {
      server.log.error({ error }, 'Failed to shut down recovery server cleanly');
      process.exitCode = 1;
    }
  };

  process.once('SIGTERM', () => { void shutdown('SIGTERM'); });
  process.once('SIGINT', () => { void shutdown('SIGINT'); });
} catch (error) {
  console.error('Failed to start recovery server', error);
  process.exitCode = 1;
}
