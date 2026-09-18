function parsePort(raw: string | undefined): number {
  if (raw === undefined || raw.trim() === '') return 3001;
  const port = Number(raw);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`Invalid PORT value: ${raw}`);
  }
  return port;
}

function parsePositiveInt(raw: string | undefined): number | undefined {
  if (raw === undefined || raw.trim() === '') return undefined;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 1) {
    throw new Error(`Invalid positive integer value: ${raw}`);
  }
  return value;
}

export interface RecoveryEnv {
  host: string;
  port: number;
  nodeEnv: string;
  recoveryDbUrl: string;
  recoveryJwtSecret: string;
  recoveryEmailPepper: string;
  brevoApiKey: string;
  brevoSenderEmail: string;
  brevoSenderName: string;
  /** When set, delegates to a Brevo-hosted template. When omitted, uses inline HTML builder. */
  recoveryEmailTemplateId: number | undefined;
}

export function readRecoveryEnv(env: NodeJS.ProcessEnv = process.env): RecoveryEnv {
  const dbName = env.RECOVERY_DB_NAME?.trim() || env.DB_NAME?.trim() || 'budget_recovery';
  const recoveryDbUrl = env.RECOVERY_DB_URL?.trim() || (
    env.DB_HOST && env.DB_PORT && env.DB_USER && env.DB_PASSWORD
      ? `postgresql://${env.DB_USER}:${encodeURIComponent(env.DB_PASSWORD)}@${env.DB_HOST}:${env.DB_PORT}/${dbName}`
      : ''
  );
  const recoveryJwtSecret = env.RECOVERY_JWT_SECRET?.trim();
  const recoveryEmailPepper = env.RECOVERY_EMAIL_PEPPER?.trim();
  const brevoApiKey = env.BREVO_API_KEY?.trim();
  const brevoSenderEmail = env.BREVO_SENDER_EMAIL?.trim() ?? '';
  const brevoSenderName = env.BREVO_SENDER_NAME?.trim() ?? 'Mein Budget';
  const recoveryEmailTemplateId = parsePositiveInt(env.RECOVERY_EMAIL_TEMPLATE_ID);

  // Fail fast in non-test environments — a misconfigured server must never start silently
  if (env.NODE_ENV !== 'test') {
    if (!recoveryDbUrl) throw new Error('RECOVERY_DB_URL or (DB_HOST, DB_PORT, DB_USER, DB_PASSWORD) must be set');
    if (!recoveryJwtSecret) throw new Error('RECOVERY_JWT_SECRET is required');
    if (!recoveryEmailPepper) throw new Error('RECOVERY_EMAIL_PEPPER is required');
    if (!brevoApiKey && env.NODE_ENV === 'production') throw new Error('BREVO_API_KEY is required in production');
  }

  return {
    host: env.HOST?.trim() || '0.0.0.0',
    port: parsePort(env.PORT),
    nodeEnv: env.NODE_ENV?.trim() || 'development',
    recoveryDbUrl: recoveryDbUrl ?? '',
    recoveryJwtSecret: recoveryJwtSecret ?? '',
    recoveryEmailPepper: recoveryEmailPepper ?? '',
    brevoApiKey: brevoApiKey ?? '',
    brevoSenderEmail,
    brevoSenderName,
    recoveryEmailTemplateId,
  };
}
