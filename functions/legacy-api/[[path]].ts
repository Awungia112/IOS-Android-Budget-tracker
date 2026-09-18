/**
 * Cloudflare Pages Function — legacy API reverse proxy.
 *
 * Mirrors the Vite dev proxy (packages/app/vite.config.ts → /legacy-api) so the
 * deployed PWA / mobile web can reach the legacy "Mein Budget" Django API
 * same-origin, avoiding browser CORS restrictions on cross-origin POSTs.
 *
 * Why this exists:
 *   The legacy API (https://www.mein-budget-app.de) does NOT return CORS headers
 *   for our app origin, so the browser blocks the preflight/POST from the deployed
 *   web app. Native (Capacitor) builds are unaffected — CapacitorHttp bypasses
 *   CORS. Local dev is unaffected — Vite proxies /legacy-api. This Pages Function
 *   closes the gap for the deployed web/PWA by performing the call server-side
 *   (Cloudflare Workers runtime), where CORS does not apply.
 *
 * Routing:
 *   Inbound  /legacy-api/user/get-token  (same-origin → covered by CSP 'self')
 *   Outbound https://www.mein-budget-app.de/user/get-token
 *
 * Header handling:
 *   The Request constructor automatically drops forbidden request headers (Host,
 *   Connection, etc.). We forward Content-Type and Authorization (the only headers
 *   LegacyApiClient sends) plus Accept. From the upstream response we strip hop
 *   content-encoding/length (Workers already decompresses the body) so the browser
 *   decodes the plain JSON correctly.
 *
 * Refs: #359
 */

const PROD_LEGACY_ORIGIN = 'https://www.mein-budget-app.de';
const TEST_LEGACY_ORIGIN = 'https://www-test.mein-budget-app.de';

/** Headers forwarded from the browser request to the upstream legacy server. */
const FORWARD_REQUEST_HEADERS = new Set([
  'content-type',
  'authorization',
  'accept',
  'accept-language',
]);

/** Response headers stripped before returning (hop-by-hop / already-resolved). */
const STRIP_RESPONSE_HEADERS = new Set([
  'content-encoding',
  'content-length',
  'transfer-encoding',
  'connection',
]);

/**
 * Resolve the legacy origin from the requesting host, mirroring the host-based
 * environment resolution used by packages/app/src/lib/api.ts:
 *   app.prod.dip.on.adorsys.com / *.prod.dip.on.adorsys.com → prod legacy
 *   app.dev|qa.dip.on.adorsys.com / *.dev|qa.dip.on.adorsys.com → test legacy
 * Falls back to the test legacy instance for unknown hosts (safer for preview
 * deployments than hitting production legacy data).
 */
function resolveLegacyOrigin(hostname: string): string {
  const host = hostname.toLowerCase();
  if (host === 'app.prod.dip.on.adorsys.com' || host.endsWith('.prod.dip.on.adorsys.com')) {
    return PROD_LEGACY_ORIGIN;
  }
  if (host === 'app.dev.dip.on.adorsys.com' || host.endsWith('.dev.dip.on.adorsys.com')) {
    return TEST_LEGACY_ORIGIN;
  }
  if (host === 'app.qa.dip.on.adorsys.com' || host.endsWith('.qa.dip.on.adorsys.com')) {
    return TEST_LEGACY_ORIGIN;
  }
  // Preview deployments and unknown hosts: route to the test legacy instance.
  return TEST_LEGACY_ORIGIN;
}

interface PagesFunctionContext {
  request: Request;
  env: Record<string, unknown>;
  params: Record<string, unknown>;
}

export const onRequest = async (context: PagesFunctionContext): Promise<Response> => {
  const url = new URL(context.request.url);

  // Strip the /legacy-api prefix (preserving the rest of the path + query).
  const targetPath = url.pathname.replace(/^\/legacy-api/, '') || '/';
  const origin = resolveLegacyOrigin(url.hostname);
  const legacyUrl = origin + targetPath + url.search;

  // Build a clean outgoing request — only forward the headers the legacy API
  // needs. The Request constructor also drops forbidden headers (Host, etc.).
  const outHeaders = new Headers();
  for (const [key, value] of context.request.headers.entries()) {
    if (FORWARD_REQUEST_HEADERS.has(key.toLowerCase())) {
      outHeaders.set(key, value);
    }
  }

  const init: RequestInit = {
    method: context.request.method,
    headers: outHeaders,
    redirect: 'manual',
  };
  // Forward a body only for methods that may carry one (avoids "GET with body").
  if (context.request.method !== 'GET' && context.request.method !== 'HEAD') {
    init.body = context.request.body;
  }

  let upstream: Response;
  try {
    upstream = await fetch(legacyUrl, init);
  } catch (err) {
    return new Response(
      JSON.stringify({
        error: 'Bad gateway',
        message: err instanceof Error ? err.message : 'Failed to reach legacy API',
      }),
      {
        status: 502,
        headers: { 'Content-Type': 'application/json' },
      },
    );
  }

  // Copy upstream headers, stripping hop-by-hop / already-resolved encoding
  // headers so the browser decodes the (already-decompressed) body correctly.
  const responseHeaders = new Headers();
  for (const [key, value] of upstream.headers.entries()) {
    if (!STRIP_RESPONSE_HEADERS.has(key.toLowerCase())) {
      responseHeaders.set(key, value);
    }
  }
  // Defensive same-origin CORS (no-op for same-origin calls, but harmless and
  // keeps the response usable if the endpoint is ever invoked cross-origin).
  responseHeaders.set('Access-Control-Allow-Origin', url.origin);
  responseHeaders.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  responseHeaders.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  return new Response(upstream.body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers: responseHeaders,
  });
};

export const onRequestOptions = (context: PagesFunctionContext): Response => {
  const url = new URL(context.request.url);
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': url.origin,
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      'Access-Control-Max-Age': '86400',
    },
  });
};