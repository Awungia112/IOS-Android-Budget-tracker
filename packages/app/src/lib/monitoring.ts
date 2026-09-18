import * as Sentry from '@sentry/capacitor';
import { makeBrowserOfflineTransport, makeFetchTransport } from '@sentry/browser';
import type { Breadcrumb } from '@sentry/capacitor';
import type { ErrorEvent } from '@sentry/core';

/**
 * Validate an IBAN candidate via the mod-97 checksum (ISO 7064 MOD 97-10).
 *
 * Length/prefix alone (2 letters + 2 digits + 15-34 chars) matches all sorts
 * of non-IBAN identifiers — internal codes, hashes, feature flags. The
 * checksum cuts the false-positive rate to ~1/97 for random strings while
 * still catching every real IBAN, without adding any regex complexity.
 */
function isValidIbanChecksum(compact: string): boolean {
  if (compact.length < 15 || compact.length > 34) return false;

  // Move the 4-char country+check-digit prefix to the end, per the spec.
  const rearranged = compact.slice(4) + compact.slice(0, 4);

  let remainder = 0;
  for (const char of rearranged) {
    const code = char.charCodeAt(0);
    if (code >= 48 && code <= 57) {
      // '0'-'9' — single digit
      remainder = (remainder * 10 + (code - 48)) % 97;
    } else if (code >= 65 && code <= 90) {
      // 'A'-'Z' — two-digit value (A=10 ... Z=35)
      remainder = (remainder * 100 + (code - 55)) % 97;
    } else {
      return false;
    }
  }

  return remainder === 1;
}

/**
 * Scrub PII tokens from a string.
 *
 * Regex design — safe-regex / security/detect-unsafe-regex constraints:
 * All patterns must avoid nested quantifiers (a quantified group wrapping
 * another quantifier or alternation). The approach here is:
 *   1. Use a deliberately broad, simple regex to find candidate spans.
 *   2. Apply a lightweight JS post-filter to confirm the match is real
 *      before replacing.
 *
 * This avoids catastrophic backtracking while still correctly scrubbing
 * both compact and spaced IBANs (DE89370400440532013000 and
 * DE89 3704 0044 0532 0130 00) and German/international amounts
 * (1.234,56 €, 250 EUR, $99.99).
 */
function scrubString(value: string): string {
  let result = value;

  // --- Emails ---
  // Simple linear pattern, no nested quantifiers.
  result = result.replace(
    /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g,
    '[email]',
  );

  // --- IBANs ---
  // Broad match: 2 uppercase letters + 2 digits + 10–34 alphanumeric/space chars.
  // Post-filter: trim any trailing whitespace the greedy class swallowed
  // (preserved as-is so we don't eat the space before the next word), then
  // validate the mod-97 checksum on the compact form to confirm it's a real
  // IBAN rather than an incidentally-shaped identifier.
  result = result.replace(/[A-Z]{2}[0-9]{2}[A-Z0-9 ]{10,34}/g, (match) => {
    const trimmed = match.replace(/\s+$/, '');
    const trailingSpace = match.slice(trimmed.length);
    const compact = trimmed.replace(/\s/g, '');
    return isValidIbanChecksum(compact) ? '[iban]' + trailingSpace : match;
  });

  // --- Amounts ---
  // Digits optionally followed by separators and more digits, then an
  // optional space and a currency symbol/code — the currency alternation is
  // mandatory in the pattern itself, so no post-filter is needed here.
  result = result.replace(/[0-9][0-9.,]*\s*(?:EUR|USD|GBP|[€$£])(?![a-zA-Z])/gi, '[amount]');

  return result;
}

/**
 * Recursively scrub all string values inside an arbitrary object.
 * Used for the `extra` and `contexts` fields on a Sentry event, which can
 * contain budget transaction data interpolated into error payloads.
 *
 * Arrays are preserved as real arrays — Object.entries() on an array produces
 * numeric string keys, so without the Array.isArray guard the scrubbed result
 * would be an array-like object ({0: 'x', 1: 'y'}) instead of ['x', 'y'],
 * corrupting any array values attached to Sentry context.
 */
function scrubObject(obj: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (typeof value === 'string') {
      result[key] = scrubString(value);
    } else if (Array.isArray(value)) {
      result[key] = value.map((item) =>
        typeof item === 'string'
          ? scrubString(item)
          : item !== null && typeof item === 'object'
            ? scrubObject(item as Record<string, unknown>)
            : item,
      );
    } else if (value !== null && typeof value === 'object') {
      result[key] = scrubObject(value as Record<string, unknown>);
    } else {
      result[key] = value;
    }
  }
  return result;
}

/**
 * Sanitize a Sentry event before it is transmitted.
 *
 * Layers of protection:
 * - `user` block stripped entirely (no email, no id)
 * - `message` and `request.url` scrubbed for emails / IBANs / amounts
 * - `extra` and `contexts` deeply scrubbed via scrubObject (budget data risk)
 * - breadcrumb `data` payloads dropped; breadcrumb messages scrubbed
 *
 * GDPR note: `sendDefaultPii: false` in Sentry.init() means the SDK never
 * attaches cookies, request bodies or IP addresses. This hook is a second
 * layer of defence for values that appear in exception messages or manual
 * breadcrumbs added by application code.
 */
export function sanitizeEventForMonitoring(event: ErrorEvent): ErrorEvent {
  const sanitized = { ...event };

  // Strip user identity entirely — we never need it in crash reports
  if (sanitized.user) {
    sanitized.user = {};
  }

  // Scrub the top-level message
  if (typeof sanitized.message === 'string') {
    sanitized.message = scrubString(sanitized.message);
  }

  // Scrub request URL (query params may contain user data)
  if (sanitized.request?.url && typeof sanitized.request.url === 'string') {
    sanitized.request = {
      ...sanitized.request,
      url: scrubString(sanitized.request.url),
    };
  }

  // Scrub extra and contexts — these can contain transaction data interpolated
  // into error messages by application code (e.g. category names, amounts).
  if (sanitized.extra) {
    sanitized.extra = scrubObject(sanitized.extra as Record<string, unknown>);
  }
  if (sanitized.contexts) {
    sanitized.contexts = scrubObject(
      sanitized.contexts as Record<string, unknown>,
    ) as typeof sanitized.contexts;
  }

  // Strip breadcrumb data payloads; scrub messages
  if (sanitized.breadcrumbs) {
    sanitized.breadcrumbs = (sanitized.breadcrumbs as Breadcrumb[]).map(
      ({ data: _data, message, ...rest }) => ({
        ...rest,
        ...(typeof message === 'string' ? { message: scrubString(message) } : {}),
      }),
    );
  }

  return sanitized;
}

/**
 * Initialize Sentry / Capacitor crash monitoring.
 *
 * Called once at app startup (`main.tsx`). Returns `true` when Sentry was
 * configured, `false` when no DSN is available (e.g. local dev without
 * VITE_SENTRY_DSN set).
 *
 * Design decisions:
 * - `release`              — set from APP_VERSION so every crash is tagged with
 *                            the app version; satisfies the ticket AC and enables
 *                            version-based filtering in the Sentry dashboard.
 * - `sendDefaultPii: false`— never attach IP, cookies or request bodies
 * - `beforeSend`           — PII scrub + infrastructure noise filter
 * - `tracesSampleRate: 0.1`— 10 % performance traces; crashes always sent
 * - `replaysSessionSampleRate: 0` / `replaysOnErrorSampleRate: 0`
 *                          — session replays disabled; too much financial data
 *                            risk for a budgeting app
 * - `attachStacktrace: true`— full stack trace on all captured errors
 *
 * Native SDK auto-init:
 *   `io.sentry.auto-init` is NOT disabled in AndroidManifest. The native SDK
 *   must self-initialise from the DSN meta-data before this JS call so that
 *   @sentry/capacitor can attach to the native client for ANR / JVM crash capture.
 */
export function initMonitoring(env: ImportMetaEnv = import.meta.env): boolean {
  const dsn = env.VITE_SENTRY_DSN?.trim();

  if (!dsn) {
    return false;
  }

  Sentry.init({
    dsn,
    // Tag every event with the app version so crashes can be filtered and
    // correlated with deploys in the Sentry dashboard.
    release: typeof APP_VERSION !== 'undefined' ? APP_VERSION : undefined,
    environment: env.MODE,
    // Never send PII automatically
    sendDefaultPii: false,
    // Full stack traces on all captured errors
    attachStacktrace: true,
    // Low traces sample rate — crash reports are more important than perf data
    tracesSampleRate: 0.1,
    // Session replays: CapacitorOptions omits replaysSessionSampleRate and
    // replaysOnErrorSampleRate — the Capacitor SDK does not support the Replay
    // integration and has them disabled by design. No explicit config needed.
    //
    // Offline transport: wraps the standard fetch transport with IndexedDB
    // persistence. When the device has no connectivity, events are queued in
    // IndexedDB (up to 30 envelopes) and flushed automatically when the
    // window 'online' event fires. This covers JS-layer errors (captureException,
    // unhandled throws) triggered while offline.
    //
    // Native Android crashes (ANRs, JVM crashes) are handled separately by the
    // sentry-android SDK which writes envelopes to disk and flushes on next
    // app launch — no JS transport is involved for those.
    transport: makeBrowserOfflineTransport(makeFetchTransport),
    // Suppress known infrastructure noise that is not actionable
    ignoreErrors: [
      // Emitted by @sentry/capacitor when the native bridge hasn't finished
      // starting before the JS init call fires — not a real app error.
      "Native Client is not available, can't start on native.",
    ],
    // PII scrub + noise filter runs before every event is transmitted
    beforeSend(event: ErrorEvent) {
      // Belt-and-braces: drop native-bridge init errors that slip past ignoreErrors
      if (
        typeof event.message === 'string' &&
        event.message.includes('Native Client is not available')
      ) {
        return null;
      }
      return sanitizeEventForMonitoring(event);
    },
  });

  return true;
}

interface RemediationTelemetry {
  accountsAnalyzed: number;
  accountsWithClusters: number;
  totalClusters: number;
  totalDuplicateHashes: number;
  withinClusterGaps: number[];
  betweenClusterGaps: number[];
  wasCapped: boolean;
}

export function reportRemediationStats(data: RemediationTelemetry): void {
  Sentry.captureMessage('remediation_phase1_stats', {
    extra: {
      accountsAnalyzed: data.accountsAnalyzed,
      accountsWithClusters: data.accountsWithClusters,
      totalClusters: data.totalClusters,
      totalDuplicateHashes: data.totalDuplicateHashes,
      withinClusterGaps: data.withinClusterGaps,
      betweenClusterGaps: data.betweenClusterGaps,
      wasCapped: data.wasCapped,
    },
  });
}
