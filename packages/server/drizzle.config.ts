import { defineConfig } from 'drizzle-kit';

// Static analysis tools import this config without a database. The db:migrate
// script validates DATABASE_URL before invoking Drizzle Kit.
function resolveDatabaseUrl(): string {
  if (process.env.DATABASE_URL?.trim()) {
    return process.env.DATABASE_URL.trim();
  }

  const { DB_HOST, DB_PORT, DB_USER, DB_PASSWORD, DB_NAME } = process.env;

  if (DB_HOST && DB_PORT && DB_USER && DB_PASSWORD && DB_NAME) {
    return `postgresql://${DB_USER}:${encodeURIComponent(DB_PASSWORD)}@${DB_HOST}:${DB_PORT}/${DB_NAME}`;
  }

  return 'postgresql://unused:unused@localhost:5432/unused';
}

export default defineConfig({
  dialect: 'postgresql',
  schema: './src/db/schema.ts',
  out: './drizzle',
  casing: 'snake_case',
  dbCredentials: {
    url: resolveDatabaseUrl(),
  },
  strict: true,
  verbose: true,
});
