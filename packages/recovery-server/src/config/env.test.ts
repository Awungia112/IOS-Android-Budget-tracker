import { describe, it, expect } from 'vitest';
import { readRecoveryEnv } from './env.js';

const VALID_ENV = {
  NODE_ENV: 'production',
  RECOVERY_DB_URL: 'postgres://user:pass@localhost:5432/recovery',
  RECOVERY_JWT_SECRET: 'super-secret-jwt',
  RECOVERY_EMAIL_PEPPER: 'super-secret-pepper',
  BREVO_API_KEY: 'xkeysib-test-api-key',
  BREVO_SENDER_EMAIL: 'noreply@example.com',
  BREVO_SENDER_NAME: 'Mein Budget',
  RECOVERY_EMAIL_TEMPLATE_ID: '5',
};

describe('readRecoveryEnv', () => {
  describe('secret validation (non-test env)', () => {
    it('throws if RECOVERY_DB_URL is missing', () => {
      expect(() =>
        readRecoveryEnv({ NODE_ENV: 'production' }),
      ).toThrow('RECOVERY_DB_URL or (DB_HOST, DB_PORT, DB_USER, DB_PASSWORD) must be set');
    });

    it('throws if RECOVERY_JWT_SECRET is missing', () => {
      expect(() =>
        readRecoveryEnv({ NODE_ENV: 'production', RECOVERY_DB_URL: 'postgres://x' }),
      ).toThrow('RECOVERY_JWT_SECRET is required');
    });

    it('throws if RECOVERY_EMAIL_PEPPER is missing', () => {
      expect(() =>
        readRecoveryEnv({
          NODE_ENV: 'production',
          RECOVERY_DB_URL: 'postgres://x',
          RECOVERY_JWT_SECRET: 'secret',
        }),
      ).toThrow('RECOVERY_EMAIL_PEPPER is required');
    });

    it('throws if BREVO_API_KEY is missing', () => {
      expect(() =>
        readRecoveryEnv({
          NODE_ENV: 'production',
          RECOVERY_DB_URL: 'postgres://x',
          RECOVERY_JWT_SECRET: 'secret',
          RECOVERY_EMAIL_PEPPER: 'pepper',
        }),
      ).toThrow('BREVO_API_KEY is required');
    });

    it('throws if secrets are whitespace-only', () => {
      expect(() =>
        readRecoveryEnv({ NODE_ENV: 'production', RECOVERY_DB_URL: '   ' }),
      ).toThrow('RECOVERY_DB_URL or (DB_HOST, DB_PORT, DB_USER, DB_PASSWORD) must be set');
    });
  });

  describe('secret validation skipped in test env', () => {
    it('does not throw when NODE_ENV is test and secrets are absent', () => {
      expect(() => readRecoveryEnv({ NODE_ENV: 'test' })).not.toThrow();
    });

    it('returns empty strings for missing secrets in test env', () => {
      const env = readRecoveryEnv({ NODE_ENV: 'test' });
      expect(env.recoveryDbUrl).toBe('');
      expect(env.recoveryJwtSecret).toBe('');
      expect(env.recoveryEmailPepper).toBe('');
    });
  });

  describe('returns correct values when fully configured', () => {
    it('parses all fields', () => {
      const env = readRecoveryEnv({ ...VALID_ENV, HOST: '127.0.0.1', PORT: '4000' });
      expect(env).toEqual({
        host: '127.0.0.1',
        port: 4000,
        nodeEnv: 'production',
        recoveryDbUrl: VALID_ENV.RECOVERY_DB_URL,
        recoveryJwtSecret: VALID_ENV.RECOVERY_JWT_SECRET,
        recoveryEmailPepper: VALID_ENV.RECOVERY_EMAIL_PEPPER,
        brevoApiKey: VALID_ENV.BREVO_API_KEY,
        brevoSenderEmail: VALID_ENV.BREVO_SENDER_EMAIL,
        brevoSenderName: VALID_ENV.BREVO_SENDER_NAME,
        recoveryEmailTemplateId: 5,
      });
    });

    it('defaults host to 0.0.0.0 and port to 3001', () => {
      const env = readRecoveryEnv(VALID_ENV);
      expect(env.host).toBe('0.0.0.0');
      expect(env.port).toBe(3001);
    });

    it('trims whitespace from secrets', () => {
      const env = readRecoveryEnv({
        ...VALID_ENV,
        RECOVERY_JWT_SECRET: '  trimmed  ',
      });
      expect(env.recoveryJwtSecret).toBe('trimmed');
    });

    it('builds RECOVERY_DB_URL from DB parts and DB_NAME', () => {
      const env = readRecoveryEnv({
        NODE_ENV: 'production',
        DB_HOST: 'db.local',
        DB_PORT: '5432',
        DB_USER: 'budget_user',
        DB_PASSWORD: 'p@ss/word',
        DB_NAME: 'budget',
        RECOVERY_JWT_SECRET: VALID_ENV.RECOVERY_JWT_SECRET,
        RECOVERY_EMAIL_PEPPER: VALID_ENV.RECOVERY_EMAIL_PEPPER,
        BREVO_API_KEY: VALID_ENV.BREVO_API_KEY,
      });
      expect(env.recoveryDbUrl).toBe('postgresql://budget_user:p%40ss%2Fword@db.local:5432/budget');
    });

    it('lets RECOVERY_DB_NAME override DB_NAME', () => {
      const env = readRecoveryEnv({
        NODE_ENV: 'production',
        DB_HOST: 'db.local',
        DB_PORT: '5432',
        DB_USER: 'budget_user',
        DB_PASSWORD: 'secret',
        DB_NAME: 'budget',
        RECOVERY_DB_NAME: 'budget_recovery',
        RECOVERY_JWT_SECRET: VALID_ENV.RECOVERY_JWT_SECRET,
        RECOVERY_EMAIL_PEPPER: VALID_ENV.RECOVERY_EMAIL_PEPPER,
        BREVO_API_KEY: VALID_ENV.BREVO_API_KEY,
      });
      expect(env.recoveryDbUrl).toBe('postgresql://budget_user:secret@db.local:5432/budget_recovery');
    });
  });

  describe('port parsing', () => {
    it('accepts a valid port', () => {
      expect(readRecoveryEnv({ ...VALID_ENV, PORT: '8080' }).port).toBe(8080);
    });

    it('throws on a non-numeric port', () => {
      expect(() => readRecoveryEnv({ ...VALID_ENV, PORT: 'abc' })).toThrow('Invalid PORT value');
    });

    it('throws on port 0', () => {
      expect(() => readRecoveryEnv({ ...VALID_ENV, PORT: '0' })).toThrow('Invalid PORT value');
    });

    it('throws on port above 65535', () => {
      expect(() => readRecoveryEnv({ ...VALID_ENV, PORT: '65536' })).toThrow('Invalid PORT value');
    });

    it('throws on a float', () => {
      expect(() => readRecoveryEnv({ ...VALID_ENV, PORT: '3000.5' })).toThrow('Invalid PORT value');
    });
  });
});
