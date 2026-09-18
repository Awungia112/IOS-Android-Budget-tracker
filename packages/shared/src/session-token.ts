/**
 * Session token renewal contract.
 *
 * When a request authenticates successfully with a still-valid session JWT,
 * the server re-signs the token (identical claims, fresh `exp`) and returns it
 * via this response header so clients can transparently replace their stored
 * token. Expired or invalid tokens are never renewed — they receive the usual
 * 401 and the client's re-auth flow.
 *
 * Change this value here and both packages pick it up.
 */
export const SESSION_TOKEN_RENEWAL_HEADER = 'x-auth-token';
