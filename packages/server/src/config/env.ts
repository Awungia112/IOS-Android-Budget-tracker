export interface ServerEnv {
  host: string;
  port: number;
  nodeEnv: string;
  databaseUrl: string;
  emailHashPepper: string;
  emailEncryptionKey: string;
  magicLinkSecret: string;
  corsOrigin: string | string[] | RegExp[] | true;
  feedbackRecipientPrimary: string;
  feedbackRecipientBackup: string;
  feedbackRateLimitMax: number;
  feedbackRateLimitWindowMs: number;
  /**
   * Store-review account (optional). When both are set, POST /v1/auth/register
   * issues this fixed code for this email instead of a random one and skips
   * the email send, so App Store / Play Store reviewers can sign in via the
   * manual-code flow without access to a mailbox. Inactive when unset.
   */
  reviewAccountEmail?: string;
  reviewAccountCode?: string;

  /**
   * Apple Team ID (10-character alphanumeric) for the iOS Universal Links
   * AASA file. Found in Apple Developer Portal > Membership.
   * Example: ABCDE12345
   */
  appleTeamId: string;

  /**
   * SHA-256 certificate fingerprint for Android App Links assetlinks.json.
   * Must match the signing key of the production APK/AAB.
   * For Play Store builds this is the Play App Signing key (not upload key).
   * Example: 43:12:D4:27:D7:C4:14:...
   */
  androidSha256Fingerprint: string;

  /**
   * Recovery server base URL (optional). When set, the main server calls
   * DELETE /v1/recovery/account on the recovery server after deleting a user
   * account, so the recovery entry (encrypted private key) is also removed
   * and the user can re-enroll with the same email.
   * Example: https://recovery.prod.dip.on.adorsys.com
   */
  recoveryServerUrl?: string;
}

function parsePort(raw: string | undefined): number {
  if (raw === undefined || raw.trim() === '') return 3000;

  const port = Number(raw);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`Invalid PORT value: ${raw}`);
  }

  return port;
}

/**
 * Reads and validates the optional store-review account pair.
 * Both variables must be set together; the code must be exactly 6 digits.
 * The email is normalized (trim + lowercase) the same way hashEmail does,
 * so the register route can compare it against the incoming email.
 */
function parseReviewAccount(env: NodeJS.ProcessEnv): Pick<ServerEnv, 'reviewAccountEmail' | 'reviewAccountCode'> {
  const reviewAccountEmail = env.REVIEW_ACCOUNT_EMAIL?.trim().toLowerCase() || undefined;
  const reviewAccountCode = env.REVIEW_ACCOUNT_CODE?.trim() || undefined;

  if ((reviewAccountEmail === undefined) !== (reviewAccountCode === undefined)) {
    throw new Error('REVIEW_ACCOUNT_EMAIL and REVIEW_ACCOUNT_CODE must be set together');
  }
  if (reviewAccountCode !== undefined && !/^\d{6}$/.test(reviewAccountCode)) {
    throw new Error('REVIEW_ACCOUNT_CODE must be exactly 6 digits');
  }

  return { reviewAccountEmail, reviewAccountCode };
}

/**
 * Reads and validates required server environment variables.
 * Throws on startup if DATABASE_URL is not set (either directly or via
 * individual DB_HOST/DB_PORT/DB_USER/DB_PASSWORD/DB_NAME).
 *
 * Note: EMAIL_HASH_PEPPER is intentionally not validated here.
 * Per the agreed hashing contract, the client applies the pepper and
 * hashes the email before sending — the server only stores and compares
 * the resulting hash and never sees the plaintext email or the pepper.
 */
export function readServerEnv(env: NodeJS.ProcessEnv = process.env): ServerEnv {
  const databaseUrl = env.DATABASE_URL?.trim() || (
    env.DB_HOST && env.DB_PORT && env.DB_USER && env.DB_PASSWORD && env.DB_NAME
      ? `postgresql://${env.DB_USER}:${encodeURIComponent(env.DB_PASSWORD)}@${env.DB_HOST}:${env.DB_PORT}/${env.DB_NAME}`
      : ''
  );
  if (!databaseUrl) {
    throw new Error('DATABASE_URL or (DB_HOST, DB_PORT, DB_USER, DB_PASSWORD, DB_NAME) must be set');
  }

  const magicLinkSecret = env.MAGIC_LINK_SECRET?.trim();
  const budgetWisePepper = env.BUDGET_WISE_PEPPER?.trim();
  const nodeEnv = env.NODE_ENV?.trim() || 'development';

  if (nodeEnv === 'production' && (!magicLinkSecret || magicLinkSecret === 'replace-with-local-dev-secret')) {
    throw new Error('MAGIC_LINK_SECRET must be configured in production');
  }

  if (nodeEnv === 'production' && (!budgetWisePepper || budgetWisePepper === 'replace-with-stable-pepper')) {
    throw new Error('BUDGET_WISE_PEPPER must be configured in production');
  }

  const feedbackRecipientPrimary = env.FEEDBACK_RECIPIENT_PRIMARY?.trim() || 'mobilebudget@deutschland-im-plus.de';
  const feedbackRecipientBackup = env.FEEDBACK_RECIPIENT_BACKUP?.trim() || 'info@deutschland-im-plus.de';
  const feedbackRateLimitMax = Number(env.FEEDBACK_RATE_LIMIT_MAX ?? 10);
  const feedbackRateLimitWindowMs = Number(env.FEEDBACK_RATE_LIMIT_WINDOW_MS ?? 15 * 60 * 1000);

  if (nodeEnv === 'production') {
    if (!env.FEEDBACK_RECIPIENT_PRIMARY?.trim()) {
      throw new Error('FEEDBACK_RECIPIENT_PRIMARY must be configured in production');
    }
    if (!env.FEEDBACK_RECIPIENT_BACKUP?.trim()) {
      throw new Error('FEEDBACK_RECIPIENT_BACKUP must be configured in production');
    }
  }

  const emailEncryptionKey = env.EMAIL_ENCRYPTION_KEY?.trim();
  if (!emailEncryptionKey || emailEncryptionKey.length !== 64 || !/^[0-9a-fA-F]{64}$/.test(emailEncryptionKey)) {
    throw new Error(
      'EMAIL_ENCRYPTION_KEY must be a 64-character hex string (32 bytes for AES-256). ' +
      'Generate one with: openssl rand -hex 32',
    );
  }
  // CORS_ORIGIN: comma-separated list of allowed origins (e.g. "https://app.example.com,https://staging.example.com").
  // Falls back to production regex defaults if not set.
  const corsOrigin = env.CORS_ORIGIN?.trim()
    ? env.CORS_ORIGIN.trim().split(',').map(o => o.trim()).filter(Boolean)
    : nodeEnv === 'production'
      ? [/\.budget-wise\.de$/, /\.deutschlandimplus\.de$/]
      : true;

  return {
    host: env.HOST?.trim() || '127.0.0.1',
    port: parsePort(env.PORT),
    nodeEnv,
    databaseUrl,
    emailHashPepper: budgetWisePepper || 'dev-pepper',
    emailEncryptionKey,
    magicLinkSecret: magicLinkSecret || 'dev-secret-do-not-use-in-production',
    corsOrigin,
    feedbackRecipientPrimary,
    feedbackRecipientBackup,
    feedbackRateLimitMax,
    feedbackRateLimitWindowMs,
    ...parseReviewAccount(env),
    appleTeamId: env.APPLE_TEAM_ID?.trim() || '',
    androidSha256Fingerprint: env.ANDROID_SHA256_FINGERPRINT?.trim() || '',
    recoveryServerUrl: env.RECOVERY_SERVER_URL?.trim() || undefined,
  };
}