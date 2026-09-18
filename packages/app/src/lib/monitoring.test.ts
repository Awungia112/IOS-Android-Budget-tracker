import { beforeEach, describe, expect, it, vi } from 'vitest';
import { initMonitoring, sanitizeEventForMonitoring } from './monitoring';

// vi.mock is hoisted to the top of the file by Vitest, so any variables
// referenced inside the factory must also be hoisted with vi.hoisted().
const { sentryInit } = vi.hoisted(() => ({ sentryInit: vi.fn() }));

vi.mock('@sentry/capacitor', () => ({
  init: sentryInit,
  captureException: vi.fn(),
}));

describe('monitoring', () => {
  beforeEach(() => {
    sentryInit.mockReset();
  });

  it('does not initialize when no DSN is configured', () => {
    expect(initMonitoring({ VITE_SENTRY_DSN: '', MODE: 'test' } as ImportMetaEnv)).toBe(false);
    expect(sentryInit).not.toHaveBeenCalled();
  });

  it('initializes Sentry with DSN, environment, release and safe defaults', () => {
    const configured = initMonitoring({
      VITE_SENTRY_DSN: 'https://public@example.com/1',
      MODE: 'production',
    } as ImportMetaEnv);

    expect(configured).toBe(true);
    expect(sentryInit).toHaveBeenCalledWith(expect.objectContaining({
      dsn: 'https://public@example.com/1',
      environment: 'production',
      sendDefaultPii: false,
      // replaysSessionSampleRate / replaysOnErrorSampleRate are intentionally
      // absent — CapacitorOptions omits them; the Capacitor SDK disables replay
      // by design and does not accept those options.
    }));
  });

  it('scrubs emails from message and request URL before sending', () => {
    const event = {
      message: 'Budget sync failed for user@example.com',
      request: { url: 'https://budget.example.com/?email=user@example.com' },
      user: { email: 'user@example.com' },
    };

    const result = sanitizeEventForMonitoring(event as any);

    expect(result.message).not.toContain('user@example.com');
    expect(result.request?.url).not.toContain('user@example.com');
    expect(result.user?.email).toBeUndefined();
  });

  it('scrubs spaced IBANs and German-locale amounts from event messages', () => {
    // These are the formats the app actually produces — human-readable IBAN
    // grouping and German locale number formatting (dot thousands, comma decimal).
    const event = {
      message: 'Transfer of 1.234,56 € to DE89 3704 0044 0532 0130 00 failed',
    };

    const result = sanitizeEventForMonitoring(event as any);

    expect(result.message).not.toContain('DE89');
    expect(result.message).not.toContain('1.234,56');
    expect(result.message).toContain('[iban]');
    expect(result.message).toContain('[amount]');
  });

  it('scrubs compact IBANs and international-locale amounts', () => {
    const event = {
      message: 'Payment of 250 € from DE89370400440532013000',
    };

    const result = sanitizeEventForMonitoring(event as any);

    expect(result.message).not.toContain('DE89370400440532013000');
    expect(result.message).not.toContain('250 €');
    expect(result.message).toContain('[iban]');
    expect(result.message).toContain('[amount]');
  });

  it('scrubs PII from extra and contexts fields', () => {
    const event = {
      extra: { note: 'Transfer to user@example.com', amount: '250 EUR' },
      contexts: { budget: { label: 'DE89370400440532013000 account' } },
    };

    const result = sanitizeEventForMonitoring(event as any);

    expect(JSON.stringify(result.extra)).not.toContain('user@example.com');
    expect(JSON.stringify(result.contexts)).not.toContain('DE89370400440532013000');
  });

  it('preserves array shape in extra/contexts after scrubbing', () => {
    // scrubObject must not corrupt arrays into array-like objects
    const event = {
      extra: {
        recentCategories: ['food', 'transport', 'user@example.com'],
        count: 3,
      },
    };

    const result = sanitizeEventForMonitoring(event as any);
    const cats = (result.extra as any).recentCategories;

    expect(Array.isArray(cats)).toBe(true);
    expect(cats).toHaveLength(3);
    expect(cats[2]).toBe('[email]');
    expect(cats[0]).toBe('food');
  });

  it('strips breadcrumb data payloads and scrubs breadcrumb messages', () => {
    const event = {
      breadcrumbs: [
        { category: 'ui.click', message: 'clicked user@example.com row', data: { secret: 'value' } },
        { category: 'navigation', message: 'navigated to /settings', data: { from: '/home' } },
      ],
    };

    const result = sanitizeEventForMonitoring(event as any);
    const crumbs = result.breadcrumbs as any[];

    expect(crumbs[0].message).not.toContain('user@example.com');
    expect(crumbs[0].data).toBeUndefined();
    expect(crumbs[1].data).toBeUndefined();
    expect(crumbs[1].category).toBe('navigation');
  });

  it('does not skip matches when scrubString is called multiple times', () => {
    // Regression test for the global /g regex lastIndex bug.
    // If patterns were module-level singletons, the second call would start
    // matching from where the first left off and silently miss matches.
    const first = sanitizeEventForMonitoring({
      message: 'error for user@example.com',
    } as any);
    const second = sanitizeEventForMonitoring({
      message: 'error for other@example.com',
    } as any);

    expect(first.message).toBe('error for [email]');
    expect(second.message).toBe('error for [email]');
  });
});
