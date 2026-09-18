declare module 'fastify' {
  interface FastifyContextConfig extends ReplayProtectionRouteConfig {}
}

export const NONCE_ROUTE = '/v1/nonce';

export const REPLAY_PROTECTION_HEADERS = {
  nonce: 'x-nonce',
  timestamp: 'x-timestamp',
} as const;

export const REPLAY_PROTECTION_ERRORS = {
  invalidNonce: 'invalid_nonce',
  timestampOutOfRange: 'timestamp_out_of_range',
} as const;

export const NONCE_TTL_MS = 90_000;
export const NONCE_SWEEP_INTERVAL_MS = 30_000;
export const TIMESTAMP_TOLERANCE_MS = 60_000;

export const PROTECTED_MUTATION_METHODS = ['POST', 'PUT', 'PATCH', 'DELETE'] as const;

export interface NonceResponse {
  nonce: string;
  expires_at: string;
}

export interface ReplayProtectionRouteConfig {
  skipNonce?: boolean;
}

export const SKIP_REPLAY_PROTECTION_CONFIG = {
  skipNonce: true,
} satisfies ReplayProtectionRouteConfig;

export function isProtectedMutationMethod(method: string): boolean {
  return PROTECTED_MUTATION_METHODS.includes(method as (typeof PROTECTED_MUTATION_METHODS)[number]);
}
