import { vi } from 'vitest';
import type { MigrationIntegrationFixture } from '../../test-fixtures/index.js';

export const LEGACY_TEST_BASE_URL = 'https://legacy.example.com';

// These service-level integration tests mock fetch directly so they can
// deterministically simulate fetch rejections and JSON parsing failures without
// depending on app-level MSW handlers.
export const HTTP_STATUS = {
  ok: 200,
  unauthorized: 401,
} as const;

const HTTP_SUCCESS_RANGE = {
  min: 200,
  maxExclusive: 300,
} as const;

export type RouteOverride =
  | { body: unknown; status?: number }
  | { error: Error }
  | { jsonError: Error; status?: number };

function isSuccessfulHttpStatus(status: number): boolean {
  return status >= HTTP_SUCCESS_RANGE.min && status < HTTP_SUCCESS_RANGE.maxExclusive;
}

function getRequestUrl(input: RequestInfo | URL): string {
  if (typeof input === 'string') {
    return input;
  }

  if (input instanceof URL) {
    return input.toString();
  }

  return input.url;
}

function getRouteKey(input: RequestInfo | URL, init?: RequestInit): string {
  const url = new URL(getRequestUrl(input));
  const method = (init?.method ?? 'GET').toUpperCase();
  const query = url.searchParams.toString();

  return `${method} ${url.pathname}${query ? `?${query}` : ''}`;
}

function createMockResponse(body: unknown, status: number = HTTP_STATUS.ok): Response {
  return {
    ok: isSuccessfulHttpStatus(status),
    status,
    json: vi.fn().mockResolvedValue(body),
  } as unknown as Response;
}

function createJsonErrorResponse(error: Error, status: number = HTTP_STATUS.ok): Response {
  return {
    ok: isSuccessfulHttpStatus(status),
    status,
    json: vi.fn().mockRejectedValue(error),
  } as unknown as Response;
}

export function createFixtureFetchMock(
  fixture: MigrationIntegrationFixture,
  overrides: Record<string, RouteOverride> = {},
): typeof fetch {
  return vi.fn().mockImplementation((input: RequestInfo | URL, init?: RequestInit) => {
    const routeKey = getRouteKey(input, init);
    const override = overrides[routeKey];

    if (override && 'error' in override) {
      return Promise.reject(override.error);
    }

    if (override && 'jsonError' in override) {
      return Promise.resolve(createJsonErrorResponse(override.jsonError, override.status));
    }

    if (override && 'body' in override) {
      return Promise.resolve(createMockResponse(override.body, override.status));
    }

    const body = fixture.responses[routeKey];
    if (body === undefined) {
      return Promise.reject(new Error(`Missing migration fixture response for ${routeKey}`));
    }

    return Promise.resolve(createMockResponse(body));
  }) as unknown as typeof fetch;
}
