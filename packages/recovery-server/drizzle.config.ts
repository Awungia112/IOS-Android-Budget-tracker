import { defineConfig } from 'drizzle-kit';

// Static analysis tools import this config without a database. The db:migrate
// script validates RECOVERY_DB_URL or DB_* before invoking Drizzle Kit.
function resolveRecoveryDbUrl(): string {
  if (process.env.RECOVERY_DB_URL?.trim()) {
    return process.env.RECOVERY_DB_URL.trim();
  }

  const { DB_HOST, DB_PORT, DB_USER, DB_PASSWORD } = process.env;
  const dbName = process.env.RECOVERY_DB_NAME?.trim() || process.env.DB_NAME?.trim() || 'budget_recovery';

  if (DB_HOST && DB_PORT && DB_USER && DB_PASSWORD) {
    return `postgresql://${DB_USER}:${encodeURIComponent(DB_PASSWORD)}@${DB_HOST}:${DB_PORT}/${dbName}`;
  }

  return 'postgresql://unused:unused@localhost:5432/unused';
}

export default defineConfig({
  dialect: 'postgresql',
  schema: './src/db/schema.ts',
  out: './drizzle',
  dbCredentials: {
    url: resolveRecoveryDbUrl(),
  },
  strict: true,
  verbose: true,
});
