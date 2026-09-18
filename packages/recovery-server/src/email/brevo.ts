/**
 * Brevo transactional email sender.
 *
 * BrevoClient is the injectable interface used by route handlers.
 * BrevoClientImpl is the real implementation that talks to the Brevo REST API
 * via the official @getbrevo/brevo SDK.
 * A no-op implementation is provided for tests and unknown-hash timing equalisation.
 */

import { BrevoClient as BrevoSdkClient } from '@getbrevo/brevo';

/** Supported BCP-47 language tags for recovery emails. */
const SUPPORTED_LANGUAGES = ['de', 'en'] as const;
type EmailLanguage = (typeof SUPPORTED_LANGUAGES)[number];

/** Default language used when the client sends no language tag. */
export const DEFAULT_EMAIL_LANGUAGE: EmailLanguage = 'en';

/**
 * Normalises a raw BCP-47 tag (e.g. 'de-DE', 'DE', undefined) to a supported
 * language code, falling back to DEFAULT_EMAIL_LANGUAGE.
 */
function resolveLanguage(language: string | undefined): EmailLanguage {
  const tag = language?.toLowerCase().split('-')[0];
  return (SUPPORTED_LANGUAGES as readonly string[]).includes(tag ?? '')
    ? (tag as EmailLanguage)
    : DEFAULT_EMAIL_LANGUAGE;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function buildRecoveryText(code: string, language: string | undefined): string {
  const lang = resolveLanguage(language);

  if (lang === 'de') {
    return [
      'Mein Budget — Konto wiederherstellen',
      '',
      'Du hast einen Wiederherstellungscode für dein Mein Budget Konto angefordert.',
      '',
      `Dein 6-stelliger Code lautet: ${code}`,
      '',
      'Gib diesen Code in der App ein, um die Wiederherstellung abzuschließen.',
      '',
      'Dieser Code läuft in Kürze ab. Falls du diese Anfrage nicht gestellt hast, kannst du diese E-Mail ignorieren.',
    ].join('\n');
  }

  return [
    'Mein Budget — Account recovery',
    '',
    'You requested a recovery code for your Mein Budget account.',
    '',
    `Your 6-digit code is: ${code}`,
    '',
    'Enter this code in the app to complete your account recovery.',
    '',
    'This code expires soon. If you did not request this, you can safely ignore this email.',
  ].join('\n');
}

function buildRecoveryHtml(code: string, language: string | undefined): string {
  const lang = resolveLanguage(language);
  const safeCode = escapeHtml(code);

  const isDE = lang === 'de';

  const tagline  = isDE ? 'Deine Ausgaben im Griff'                                          : 'Your expenses under control';
  const heading  = isDE ? 'Konto wiederherstellen'                                           : 'Account recovery';
  const intro    = isDE ? 'Du hast einen Wiederherstellungscode für dein Mein Budget Konto angefordert.' : 'You requested a recovery code for your Mein Budget account.';
  const codeLabel = isDE ? 'Gib diesen 6-stelligen Code in der App ein:'                    : 'Enter this 6-digit code in the app:';
  const expiry   = isDE ? 'Dieser Code läuft in Kürze ab. Falls du diese Anfrage nicht gestellt hast, kannst du diese E-Mail ignorieren.' : 'This code expires soon. If you did not request this, you can safely ignore this email.';
  const footer   = isDE ? 'Mein Budget — Ausgaben im Griff'                                 : 'Mein Budget — Expenses under control';

  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head>
<body style="margin:0;padding:0;background-color:#f4f5f7;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;margin:0 auto;background-color:#ffffff;border-radius:12px;overflow:hidden;">
    <tr>
      <td style="background:linear-gradient(135deg,#0b75c2,#095a96);padding:32px 40px;text-align:center;">
        <h1 style="margin:0;color:#ffffff;font-family:Arial,sans-serif;font-size:24px;font-weight:700;">Mein Budget</h1>
        <p style="margin:8px 0 0;color:rgba(255,255,255,0.85);font-family:Arial,sans-serif;font-size:14px;">${tagline}</p>
      </td>
    </tr>
    <tr>
      <td style="padding:40px;">
        <h2 style="margin:0 0 16px;color:#111827;font-family:Arial,sans-serif;font-size:20px;font-weight:600;">${heading}</h2>
        <p style="margin:0 0 24px;color:#374151;font-family:Arial,sans-serif;font-size:15px;line-height:1.6;">${intro}</p>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f0f7ff;border-radius:8px;">
          <tr>
            <td align="center" style="padding:24px;">
              <p style="margin:0 0 4px;color:#6b7280;font-family:Arial,sans-serif;font-size:12px;">${codeLabel}</p>
              <p style="margin:0;font-family:Courier New,monospace;font-size:32px;font-weight:700;letter-spacing:8px;color:#0b75c2;">${safeCode}</p>
            </td>
          </tr>
        </table>
        <p style="margin:24px 0 0;color:#9ca3af;font-family:Arial,sans-serif;font-size:12px;line-height:1.5;">${expiry}</p>
      </td>
    </tr>
    <tr>
      <td style="padding:20px 40px;text-align:center;border-top:1px solid #e5e7eb;">
        <p style="margin:0;color:#9ca3af;font-family:Arial,sans-serif;font-size:11px;">${footer}</p>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

export interface SendRecoveryCodeParams {
  toEmail: string;
  code: string;
  /** BCP-47 language tag sent by the client (e.g. 'de', 'en'). Defaults to 'en'. */
  language?: string;
}

/** Abstraction over the email transport — injectable for tests. */
export interface BrevoClient {
  /** Send a 6-digit OTP to the given email address. */
  sendRecoveryCode(params: SendRecoveryCodeParams): Promise<void>;
  /** Perform a no-op network call to equalise timing for unknown email hashes. */
  sendNoop(): Promise<void>;
}

export interface BrevoClientOptions {
  apiKey: string;
  senderEmail: string;
  senderName?: string;
  /** When set, delegates to a Brevo-hosted template. When omitted, uses inline HTML. */
  templateId?: number;
}

/** Real Brevo implementation using the official SDK. */
export class BrevoClientImpl implements BrevoClient {
  private readonly client: BrevoSdkClient;

  constructor(private readonly opts: BrevoClientOptions) {
    this.client = new BrevoSdkClient({ apiKey: opts.apiKey });
  }

  async sendRecoveryCode({ toEmail, code, language }: SendRecoveryCodeParams): Promise<void> {
    const { templateId, senderEmail, senderName } = this.opts;
    const sender = { name: senderName || 'Mein Budget', email: senderEmail };

    try {
      if (templateId) {
        await this.client.transactionalEmails.sendTransacEmail({
          to: [{ email: toEmail }],
          templateId,
          params: { code, language: resolveLanguage(language) },
        });
        return;
      }

      // No template — use inline HTML builder (supports i18n)
      const lang = resolveLanguage(language);
      const subject = lang === 'de'
        ? 'Mein Budget — Dein Wiederherstellungscode'
        : 'Mein Budget — Your recovery code';

      await this.client.transactionalEmails.sendTransacEmail({
        to: [{ email: toEmail }],
        sender,
        subject,
        htmlContent: buildRecoveryHtml(code, language),
        textContent: buildRecoveryText(code, language),
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      throw new Error(`Brevo email send failed: ${message}`);
    }
  }

  async sendNoop(): Promise<void> {
    // Perform a real HTTPS round-trip to the Brevo accounts endpoint so that
    // the response time for unknown email hashes matches enrolled ones (~200-500ms).
    // Without this, callers can distinguish enrolled from non-enrolled by timing.
    try {
      await this.client.account.getAccount();
    } catch {
      // Intentionally swallowed — timing equalisation only; outcome is irrelevant.
    }
  }
}
