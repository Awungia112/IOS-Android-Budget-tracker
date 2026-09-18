import { Capacitor, CapacitorHttp } from '@capacitor/core';
import {
  createOnlineAccountsClient,
  type CreateOnlineAccountsClientOptions,
  type OnlineAccountsClient,
} from '@budget/core';

const DEV_API_BASE_URL = 'https://api.dev.dip.on.adorsys.com';
const QA_API_BASE_URL = 'https://api.qa.dip.on.adorsys.com';
const PRODUCTION_API_BASE_URL = 'https://api.prod.dip.on.adorsys.com';
const DEV_RECOVERY_SERVER_URL = 'https://recovery.dev.dip.on.adorsys.com';
const QA_RECOVERY_SERVER_URL = 'https://recovery.qa.dip.on.adorsys.com';
const PRODUCTION_RECOVERY_SERVER_URL = 'https://recovery.prod.dip.on.adorsys.com';

function getEnvValue(env: ImportMetaEnv | undefined, key: string): string | undefined {
  const value = env?.[key];
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function getCurrentHostname(): string | undefined {
  if (typeof window === 'undefined' || !window.location?.hostname) {
    return undefined;
  }

  return window.location.hostname.toLowerCase();
}

function resolveHostBasedDefault(hostname: string | undefined, envKey: 'api' | 'recovery'): string | undefined {
  if (!hostname) {
    return undefined;
  }

  if (hostname === 'app.prod.dip.on.adorsys.com' || hostname.endsWith('.prod.dip.on.adorsys.com')) {
    return envKey === 'api' ? PRODUCTION_API_BASE_URL : PRODUCTION_RECOVERY_SERVER_URL;
  }

  if (hostname === 'app.dev.dip.on.adorsys.com' || hostname.endsWith('.dev.dip.on.adorsys.com')) {
    return envKey === 'api' ? DEV_API_BASE_URL : DEV_RECOVERY_SERVER_URL;
  }

  if (hostname === 'app.qa.dip.on.adorsys.com' || hostname.endsWith('.qa.dip.on.adorsys.com')) {
    return envKey === 'api' ? QA_API_BASE_URL : QA_RECOVERY_SERVER_URL;
  }

  return undefined;
}

export function getApiBaseUrl(env: ImportMetaEnv | undefined = import.meta.env): string {
  return resolveHostBasedDefault(getCurrentHostname(), 'api') ?? getEnvValue(env, 'VITE_API_BASE_URL') ?? PRODUCTION_API_BASE_URL;
}

export function getRecoveryServerUrl(env: ImportMetaEnv | undefined = import.meta.env): string {
  return resolveHostBasedDefault(getCurrentHostname(), 'recovery') ?? getEnvValue(env, 'VITE_RECOVERY_SERVER_URL') ?? PRODUCTION_RECOVERY_SERVER_URL;
}

export const API_BASE_URL = getApiBaseUrl();
export const RECOVERY_SERVER_URL = getRecoveryServerUrl();

/**
 * App-level online-accounts client factory.
 *
 * Wires the sliding session-token renewal contract: whenever the server
 * returns a renewed session token via the x-auth-token response header, it is
 * persisted to localStorage so the next request uses the fresh token.
 * Call sites that build their client per request automatically pick up the
 * renewed token because they read it from localStorage first.
 */
export function createAppOnlineAccountsClient(
  options: Omit<CreateOnlineAccountsClientOptions, 'onTokenRenewed'>,
): OnlineAccountsClient {
  return createOnlineAccountsClient({
    ...options,
    onTokenRenewed: (token) => {
      localStorage.setItem('session_token', token);
    },
  });
}

/**
 * Cross-platform fetch wrapper.
 *
 * On iOS native, WKWebView enforces CORS at the NSURLSession level and
 * silently blocks requests when the server's CORS config doesn't allow
 * the WebView's origin (capacitor:// or https://).  This makes API calls
 * fail with "Load failed" before they ever reach the server.
 *
 * By routing through CapacitorHttp on iOS, requests go through a native
 * NSURLSession that does NOT send an Origin header, bypassing the WKWebView
 * CORS layer entirely.  On Android and web, regular fetch() is used since
 * Android's WebView already handles this correctly.
 */

export interface NativeFetchResponse {
  ok: boolean;
  status: number;
  statusText: string;
  headers: Headers;
  json(): Promise<any>;
  text(): Promise<string>;
}

export async function nativeFetch(
  url: string,
  options: RequestInit = {},
): Promise<NativeFetchResponse> {
  const platform = Capacitor.getPlatform();

  // On iOS, route through CapacitorHttp to bypass WKWebView CORS
  if (platform === 'ios') {
    const method = (options.method || 'GET').toUpperCase();

    // Build headers object
    const headers: Record<string, string> = {};
    if (options.headers) {
      if (options.headers instanceof Headers) {
        options.headers.forEach((value, key) => {
          headers[key] = value;
        });
      } else if (Array.isArray(options.headers)) {
        for (const [key, value] of options.headers) {
          headers[key] = String(value);
        }
      } else {
        for (const [key, value] of Object.entries(options.headers)) {
          headers[key] = String(value);
        }
      }
    }

    // Parse body — CapacitorHttp expects an object, not a string
    let data: any = undefined;
    if (options.body) {
      if (typeof options.body === 'string') {
        try {
          data = JSON.parse(options.body);
        } catch {
          data = options.body;
        }
      } else {
        data = options.body;
      }
    }

    const response = await CapacitorHttp.request({
      url,
      method,
      headers,
      data,
      responseType: 'json',
    });

    return {
      ok: response.status >= 200 && response.status < 300,
      status: response.status,
      statusText: '',
      headers: new Headers(response.headers || {}),
      json: async () => response.data,
      text: async () =>
        typeof response.data === 'string'
          ? response.data
          : JSON.stringify(response.data),
    };
  }

  // On Android and web, use regular fetch
  return fetch(url, options) as Promise<NativeFetchResponse>;
}

/**
 * Parse a JWT payload without verifying the signature.
 * Returns the decoded payload object, or null if the token is malformed.
 *
 * This is used to extract the public key (`pk` claim) from session tokens
 * issued by the budget server. The token's integrity is already verified
 * by HTTPS and the server's session mechanism; we only need the claims.
 */
export function parseJwtPayload(token: string): Record<string, unknown> | null {
  try {
    const parts = token.split('.');
    if (parts.length < 2) return null;

    const base64url = parts[1];
    const base64 = base64url.replace(/-/g, '+').replace(/_/g, '/');
    const pad = base64.length % 4 === 0 ? '' : '='.repeat(4 - (base64.length % 4));
    const decoded = atob(base64 + pad);

    return JSON.parse(decoded);
  } catch {
    return null;
  }
}

/**
 * Extract the X25519 public key bytes from a session token.
 *
 * The server embeds the user's public key as a `pk` claim in the JWT payload,
 * encoded as a 43-character base64url string (raw X25519 public key).
 *
 * Returns the public key as a Uint8Array, or null if the token is malformed
 * or does not contain a `pk` claim.
 */
export function extractPublicKeyFromToken(token: string): Uint8Array | null {
  const payload = parseJwtPayload(token);
  if (!payload || typeof payload.pk !== 'string') return null;

  const b64url = payload.pk;
  const b64 = b64url.replace(/-/g, '+').replace(/_/g, '/');
  const pad = b64.length % 4 === 0 ? '' : '='.repeat(4 - (b64.length % 4));
  const bin = atob(b64 + pad);
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);

  return arr;
}