import { config as dotenvConfig } from 'dotenv';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

// Load .env from the server package directory regardless of CWD
dotenvConfig({ path: join(fileURLToPath(import.meta.url), '..', '..', '.env') });

import { buildServer } from './app.js';
import { readServerEnv } from './config/env.js';
import { readPackageMeta } from './config/package-meta.js';
import { runMigrations } from './db/check-migrations.js';
import { createPgPool, createDb, closePgPool } from './db/client.js';

try {
  const env = readServerEnv();
  readPackageMeta();
  const pool = createPgPool(env.databaseUrl);
  const db = createDb(pool);

  await runMigrations(db);

  const server = await buildServer({ db, env });

  const shutdown = async (signal: NodeJS.Signals): Promise<void> => {
    server.log.info({ signal }, 'Shutting down budget-wise server');

    try {
      await server.close();
      await closePgPool(pool);
    } catch (error) {
      server.log.error({ error }, 'Failed to shut down budget-wise server cleanly');
      process.exitCode = 1;
    }
  };

  process.once('SIGTERM', () => {
    void shutdown('SIGTERM');
  });
  process.once('SIGINT', () => {
    void shutdown('SIGINT');
  });

  await server.listen({
    host: env.host,
    port: env.port,
  });
} catch (error) {
  console.error('Failed to start budget-wise server', error);
  process.exitCode = 1;
}
