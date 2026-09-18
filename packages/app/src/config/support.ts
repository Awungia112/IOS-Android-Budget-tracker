/**
 * Support contact configuration
 * Centralized support email address used across the application
 */
export const SUPPORT_EMAIL = 'mobilebudget@deutschland-im-plus.de';

/**
 * Build a mailto: href with the given email, subject, and body
 */
export function buildMailto(email: string, subject: string, body: string): string {
  return `mailto:${email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}
