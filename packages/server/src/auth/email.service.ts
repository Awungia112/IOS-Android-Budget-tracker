import { BrevoClient } from '@getbrevo/brevo';

/** Supported BCP-47 language tags for transactional emails. */
export const SUPPORTED_EMAIL_LANGUAGES = ['de', 'en'] as const;
export type EmailLanguage = (typeof SUPPORTED_EMAIL_LANGUAGES)[number];

/** Default language used when the client sends no language or an unsupported one. */
export const DEFAULT_EMAIL_LANGUAGE: EmailLanguage = 'en';

/**
 * Normalises a raw BCP-47 tag (e.g. 'de-DE', 'DE', undefined) to one of the
 * supported language codes, falling back to DEFAULT_EMAIL_LANGUAGE.
 */
export function resolveEmailLanguage(language: string | undefined): EmailLanguage {
  const tag = language?.toLowerCase().split('-')[0];
  return (SUPPORTED_EMAIL_LANGUAGES as readonly string[]).includes(tag ?? '')
    ? (tag as EmailLanguage)
    : DEFAULT_EMAIL_LANGUAGE;
}

export interface SendMagicLinkEmailParams {
  to: string;
  magicLink: string;
  code: string;
  templateId?: number;
  /** BCP-47 language tag sent by the client (e.g. 'de', 'en'). Defaults to DEFAULT_EMAIL_LANGUAGE. */
  language?: string;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function buildMagicLinkText(params: SendMagicLinkEmailParams): string {
  const lang = resolveEmailLanguage(params.language);

  if (lang === 'de') {
    return [
      'Mein Budget — E-Mail-Adresse bestätigen',
      '',
      `Klicke auf diesen Link, um deine E-Mail-Adresse zu bestätigen: ${params.magicLink}`,
      '',
      `Oder gib diesen 6-stelligen Code in der App ein: ${params.code}`,
      '',
      'Dieser Link und Code laufen bald ab. Falls du kein Mein Budget Konto erstellt hast, kannst du diese E-Mail ignorieren.',
    ].join('\n');
  }

  return [
    'Mein Budget — Verify your email address',
    '',
    `Click this link to confirm your email and complete your registration: ${params.magicLink}`,
    '',
    `Or enter this 6-digit code in the app: ${params.code}`,
    '',
    'This link and code expire soon. If you did not create a Mein Budget account, you can safely ignore this email.',
  ].join('\n');
}

function buildMagicLinkHtml(params: SendMagicLinkEmailParams): string {
  const magicLink = escapeHtml(params.magicLink);
  const code = escapeHtml(params.code);
  const lang = resolveEmailLanguage(params.language);

  const isDE = lang === 'de';

  const tagline = isDE ? 'Deine Ausgaben im Griff' : 'Your expenses under control';
  const heading = isDE ? 'E-Mail-Adresse bestätigen' : 'Verify your email address';
  const intro = isDE
    ? 'Klicke auf den Button unten, um deine E-Mail-Adresse zu bestätigen und die Registrierung abzuschließen.'
    : 'Click the button below to confirm your email and complete your registration.';
  const btnLabel = isDE ? 'E-Mail bestätigen' : 'Verify email';
  const fallbackLabel = isDE
    ? 'Falls der Button nicht funktioniert, kopiere diesen Link in deinen Browser:'
    : 'If the button does not work, copy and paste this link into your browser:';
  const codeLabel = isDE ? 'Oder gib diesen 6-stelligen Code in der App ein:' : 'Or enter this 6-digit code in the app:';
  const expiry = isDE
    ? 'Dieser Link und Code laufen bald ab. Falls du kein Mein Budget Konto erstellt hast, kannst du diese E-Mail ignorieren.'
    : 'This link and code expire soon. If you did not create a Mein Budget account, you can safely ignore this email.';
  const footer = isDE ? 'Mein Budget — Ausgaben im Griff' : 'Mein Budget — Expenses under control';

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
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
          <tr>
            <td align="center" style="padding-bottom:24px;">
              <a href="${magicLink}" style="display:inline-block;background-color:#0b75c2;color:#ffffff;padding:14px 32px;text-decoration:none;border-radius:8px;font-family:Arial,sans-serif;font-size:16px;font-weight:700;">${btnLabel}</a>
            </td>
          </tr>
        </table>
        <p style="margin:0 0 16px;color:#6b7280;font-family:Arial,sans-serif;font-size:13px;line-height:1.5;">${fallbackLabel}</p>
        <p style="margin:0 0 24px;word-break:break-all;">
          <a href="${magicLink}" style="color:#0b75c2;font-family:Arial,sans-serif;font-size:13px;">${magicLink}</a>
        </p>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f0f7ff;border-radius:8px;">
          <tr>
            <td align="center" style="padding:24px;">
              <p style="margin:0 0 4px;color:#6b7280;font-family:Arial,sans-serif;font-size:12px;">${codeLabel}</p>
              <p style="margin:0;font-family:Courier New,monospace;font-size:32px;font-weight:700;letter-spacing:8px;color:#0b75c2;">${code}</p>
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

/**
 * Sends a magic-link transactional email via Brevo.
 * The raw email address is used for delivery only — it is never persisted.
 */
export async function sendMagicLinkEmail(params: SendMagicLinkEmailParams): Promise<void> {
  const apiKey = process.env.BREVO_API_KEY;
  const isPlaceholder = !apiKey || apiKey === 'replace-with-brevo-transactional-api-key';

  if (isPlaceholder) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('BREVO_API_KEY must be configured in production');
    }
    // Fallback for local development if API key is missing or placeholder
    console.log('BREVO_API_KEY not configured. Falling back to console log.');
    console.log('Sending magic link email:', {
      to: params.to,
      magicLink: params.magicLink,
      code: params.code,
      templateId: params.templateId ?? null,
    });
    return;
  }

  const client = new BrevoClient({ apiKey });
  const senderEmail = process.env.BREVO_SENDER_EMAIL?.trim();
  const senderName = process.env.BREVO_SENDER_NAME?.trim() || 'Mein Budget';
  const sender = senderEmail ? { name: senderName, email: senderEmail } : undefined;

  try {
    if (params.templateId) {
      await client.transactionalEmails.sendTransacEmail({
        to: [{ email: params.to }],
        ...(sender ? { sender } : {}),
        templateId: params.templateId,
        params: {
          magic_link: params.magicLink,
          code: params.code,
          language: resolveEmailLanguage(params.language),
        },
      });
      return;
    }

    if (!sender) {
      throw new Error('BREVO_SENDER_EMAIL must be configured when MAGIC_LINK_TEMPLATE_ID is not set');
    }

    const subject = resolveEmailLanguage(params.language) === 'de'
      ? 'Mein Budget Registrierung abschließen'
      : 'Finish your Mein Budget registration';

    await client.transactionalEmails.sendTransacEmail({
      to: [{ email: params.to }],
      sender,
      subject,
      htmlContent: buildMagicLinkHtml(params),
      textContent: buildMagicLinkText(params),
    });
  } catch (err) {
    if (process.env.NODE_ENV !== 'production') {
      // In non-production, log the error but still output the code to the console
      // so local development and testing work without a valid Brevo configuration.
      console.warn('[email] Brevo delivery failed (non-production fallback):', err instanceof Error ? err.message : err);
      console.log('[email] Magic link email (fallback):', {
        to: params.to,
        magicLink: params.magicLink,
        code: params.code,
        templateId: params.templateId ?? null,
      });
      return;
    }
    throw err;
  }
}
export interface InviteEmailParams {
  to: string;
  senderName: string;
  senderEmail?: string; // Shown in the email body so the recipient knows who invited them
  accountName: string;
  templateId?: number;
  /** BCP-47 language tag sent by the client (e.g. 'de', 'en'). Defaults to DEFAULT_EMAIL_LANGUAGE. */
  language?: string;
}

function buildInviteText(params: InviteEmailParams): string {
  const lang = resolveEmailLanguage(params.language);

  if (lang === 'de') {
    const from = params.senderEmail
      ? `${params.senderName} (${params.senderEmail})`
      : params.senderName;

    return [
      `${from} hat dich eingeladen, das Konto „${params.accountName}" auf Mein Budget zu teilen.`,
      '',
      'Mit Mein Budget kannst du gemeinsam mit deinem Haushalt Ausgaben verfolgen, Limits setzen und Sparziele erreichen – alles Ende-zu-Ende-verschlüsselt.',
      '',
      'Um die Einladung anzunehmen oder abzulehnen:',
      '  1. Öffne die Mein Budget App',
      '  2. Melde dich mit deiner E-Mail-Adresse an',
      '  3. Tippe oben auf die Einladungsbenachrichtigung',
      '',
      'Falls du die App noch nicht hast, kannst du sie im App Store deines Geräts installieren.',
      '',
      'Falls du diese Einladung nicht erwartet hast, kannst du diese E-Mail ignorieren.',
      '',
      '— Das Mein Budget Team',
    ].join('\n');
  }

  const from = params.senderEmail
    ? `${params.senderName} (${params.senderEmail})`
    : params.senderName;

  return [
    `${from} has invited you to share the "${params.accountName}" account on Mein Budget.`,
    '',
    'Mein Budget lets you and your household track expenses, set limits, and reach savings goals together — all end-to-end encrypted.',
    '',
    'To accept or decline this invitation:',
    '  1. Open the Mein Budget app',
    '  2. Sign in with your email address',
    '  3. Tap the invitation notification at the top of the screen',
    '',
    'If you do not have the app yet, you can install it from your device\'s app store.',
    '',
    'If you did not expect this invitation, you can safely ignore this email.',
    '',
    '— The Mein Budget Team',
  ].join('\n');
}

function buildInviteHtml(params: InviteEmailParams): string {
  const lang = resolveEmailLanguage(params.language);
  const senderName = escapeHtml(params.senderName);
  const senderEmail = params.senderEmail ? escapeHtml(params.senderEmail) : null;
  const accountName = escapeHtml(params.accountName);

  const senderDisplay = senderEmail
    ? `<strong>${senderName}</strong> <span style="color:#6b7280;">(${senderEmail})</span>`
    : `<strong>${senderName}</strong>`;

  if (lang === 'de') {
    return `
    <div style="font-family: Arial, sans-serif; color: #111827; line-height: 1.6; max-width: 520px; margin: 0 auto;">
      <div style="background: #0b75c2; padding: 24px 32px; border-radius: 12px 12px 0 0;">
        <h1 style="color: #ffffff; font-size: 22px; margin: 0;">Mein Budget</h1>
      </div>
      <div style="border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 12px 12px; padding: 32px;">
        <h2 style="font-size: 20px; margin: 0 0 16px;">Du wurdest eingeladen, ein Konto zu teilen</h2>
        <p style="margin: 0 0 24px;">
          ${senderDisplay} hat dich eingeladen, auf das Konto
          <strong>„${accountName}"</strong> auf Mein Budget zuzugreifen.
        </p>
        <div style="background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 8px; padding: 16px; margin-bottom: 24px;">
          <p style="margin: 0 0 8px; font-size: 14px; color: #6b7280;">Um die Einladung anzunehmen oder abzulehnen:</p>
          <ol style="margin: 0; padding-left: 20px; font-size: 14px; color: #374151;">
            <li style="margin-bottom: 4px;">Öffne die Mein Budget App</li>
            <li style="margin-bottom: 4px;">Melde dich mit deiner E-Mail-Adresse an</li>
            <li>Tippe oben auf dem Bildschirm auf die Einladungsbenachrichtigung</li>
          </ol>
        </div>
        <p style="color: #6b7280; font-size: 13px; margin: 0;">
          Falls du diese Einladung nicht erwartet hast, kannst du diese E-Mail ignorieren.
        </p>
      </div>
    </div>
  `;
  }

  return `
    <div style="font-family: Arial, sans-serif; color: #111827; line-height: 1.6; max-width: 520px; margin: 0 auto;">
      <div style="background: #0b75c2; padding: 24px 32px; border-radius: 12px 12px 0 0;">
        <h1 style="color: #ffffff; font-size: 22px; margin: 0;">Mein Budget</h1>
      </div>
      <div style="border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 12px 12px; padding: 32px;">
        <h2 style="font-size: 20px; margin: 0 0 16px;">You've been invited to share an account</h2>
        <p style="margin: 0 0 24px;">
          ${senderDisplay} has invited you to access the
          <strong>"${accountName}"</strong> account on Mein Budget.
        </p>
        <div style="background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 8px; padding: 16px; margin-bottom: 24px;">
          <p style="margin: 0 0 8px; font-size: 14px; color: #6b7280;">To accept or decline this invitation:</p>
          <ol style="margin: 0; padding-left: 20px; font-size: 14px; color: #374151;">
            <li style="margin-bottom: 4px;">Open the Mein Budget app</li>
            <li style="margin-bottom: 4px;">Sign in with your email address</li>
            <li>Tap the invitation notification at the top of the screen</li>
          </ol>
        </div>
        <p style="color: #6b7280; font-size: 13px; margin: 0;">
          If you did not expect this invitation, you can safely ignore this email.
        </p>
      </div>
    </div>
  `;
}

/**
 * Sends an account invitation transactional email via Brevo.
 */
export async function sendInviteEmail(params: InviteEmailParams): Promise<void> {
  const apiKey = process.env.BREVO_API_KEY;
  const isPlaceholder = !apiKey || apiKey === 'replace-with-brevo-transactional-api-key';

  if (isPlaceholder) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('BREVO_API_KEY must be configured in production');
    }
    console.log('[email] Invite email (dev fallback):', {
      to: params.to,
      senderName: params.senderName,
      accountName: params.accountName,
    });
    return;
  }

  const client = new BrevoClient({ apiKey });
  const templateId = params.templateId ?? Number(process.env.INVITE_TEMPLATE_ID ?? '0');

  try {
    if (templateId > 0) {
      const senderEmail = process.env.BREVO_SENDER_EMAIL?.trim();
      const senderName = process.env.BREVO_SENDER_NAME?.trim() || 'Mein Budget';
      const sender = senderEmail ? { name: senderName, email: senderEmail } : undefined;

      await client.transactionalEmails.sendTransacEmail({
        to: [{ email: params.to }],
        ...(sender ? { sender } : {}),
        templateId,
        params: {
          sender_name: params.senderName,
          account_name: params.accountName,
          language: resolveEmailLanguage(params.language),
        },
      });
      return;
    }

    // No template — use inline HTML
    const senderEmail = process.env.BREVO_SENDER_EMAIL?.trim();
    const senderDisplayName = process.env.BREVO_SENDER_NAME?.trim() || 'Mein Budget';
    if (!senderEmail) {
      throw new Error('BREVO_SENDER_EMAIL must be configured when INVITE_TEMPLATE_ID is not set');
    }

    const subject = resolveEmailLanguage(params.language) === 'de'
      ? `${params.senderName} hat dich eingeladen, ein Konto auf Mein Budget zu teilen`
      : `${params.senderName} invited you to share an account on Mein Budget`;

    await client.transactionalEmails.sendTransacEmail({
      to: [{ email: params.to }],
      sender: { name: senderDisplayName, email: senderEmail },
      subject,
      htmlContent: buildInviteHtml(params),
      textContent: buildInviteText(params),
    });
  } catch (err) {
    if (process.env.NODE_ENV !== 'production') {
      console.warn('[email] Brevo invite delivery failed (non-production fallback):', err instanceof Error ? err.message : err);
      console.log('[email] Invite email (fallback):', { to: params.to, senderName: params.senderName, accountName: params.accountName });
      return;
    }
    throw err;
  }
}

// ─── Feedback Email ──────────────────────────────────────────────────────────

export interface SendFeedbackEmailParams {
  message: string;
  email?: string;
  timestamp: string;
  recipientPrimary: string;
  recipientBackup: string;
}

function buildFeedbackText(params: SendFeedbackEmailParams): string {
  const lines = [
    'New feedback submitted through Mein Budget.',
    '',
    `Message: ${params.message}`,
  ];

  if (params.email) {
    lines.push(`From: ${params.email}`);
  }

  lines.push(
    '',
    `Submitted at: ${params.timestamp}`,
  );

  return lines.join('\n');
}

function buildFeedbackHtml(params: SendFeedbackEmailParams): string {
  const message = escapeHtml(params.message);
  const email = params.email ? escapeHtml(params.email) : null;
  const timestamp = escapeHtml(params.timestamp);

  return `
    <div style="font-family: Arial, sans-serif; color: #111827; line-height: 1.5;">
      <h1 style="font-size: 22px; margin-bottom: 16px;">New Feedback</h1>
      <p style="color: #6b7280; margin-bottom: 24px;">Submitted through Mein Budget</p>
      <div style="background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 8px; padding: 16px; margin-bottom: 16px;">
        <p style="margin: 0; white-space: pre-wrap;">${message}</p>
      </div>
      ${email ? `<p style="color: #6b7280; margin: 0;">From: <a href="mailto:${email}">${email}</a></p>` : ''}
      <p style="color: #9ca3af; font-size: 12px; margin-top: 16px;">${timestamp}</p>
    </div>
  `;
}

/**
 * Sends a feedback email via Brevo to the configured recipients.
 */
export async function sendFeedbackEmail(params: SendFeedbackEmailParams): Promise<void> {
  const apiKey = process.env.BREVO_API_KEY;
  const isPlaceholder = !apiKey || apiKey === 'replace-with-brevo-transactional-api-key';

  if (isPlaceholder) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('BREVO_API_KEY must be configured in production');
    }
    console.log('BREVO_API_KEY not configured. Falling back to console log.');
    console.log('Feedback email:', {
      to: params.recipientPrimary,
      cc: params.recipientBackup,
      message: params.message,
      email: params.email,
      timestamp: params.timestamp,
    });
    return;
  }

  const client = new BrevoClient({ apiKey });
  const senderEmail = process.env.BREVO_SENDER_EMAIL?.trim();
  const senderName = process.env.BREVO_SENDER_NAME?.trim() || 'Mein Budget';
  const sender = senderEmail ? { name: senderName, email: senderEmail } : undefined;

  if (!sender) {
    throw new Error('BREVO_SENDER_EMAIL must be configured');
  }

  const subject = `Mein Budget Feedback${params.email ? ` from ${params.email}` : ''}`;

  try {
    await client.transactionalEmails.sendTransacEmail({
      to: [{ email: params.recipientPrimary }],
      cc: [{ email: params.recipientBackup }],
      sender,
      subject,
      htmlContent: buildFeedbackHtml(params),
      textContent: buildFeedbackText(params),
    });
  } catch (err) {
    if (process.env.NODE_ENV !== 'production') {
      console.warn('[email] Brevo feedback delivery failed (non-production fallback):', err instanceof Error ? err.message : err);
      console.log('[email] Feedback email (fallback):', {
        to: params.recipientPrimary,
        cc: params.recipientBackup,
        message: params.message,
      });
      return;
    }
    throw err;
  }
}
