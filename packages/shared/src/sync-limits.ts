/**
 * Sync Limits
 *
 * Shared constants governing the contract between client and server
 * for change-record synchronisation payloads.
 *
 * These values are coupled:
 * - SYNC_BATCH_SIZE must be <= SYNC_RECORDS_MAX_PER_REQUEST
 * - SYNC_BODY_LIMIT_BYTES must accommodate the largest expected payload
 *   (SYNC_RECORDS_MAX_PER_REQUEST * max encrypted record size)
 *
 * Change any value here and both packages pick it up.
 */

/** Maximum number of change records the server accepts in a single POST. */
export const SYNC_RECORDS_MAX_PER_REQUEST = 500;

/**
 * Number of records the client sends per batched POST request.
 *
 * Must be <= SYNC_RECORDS_MAX_PER_REQUEST.
 * A smaller batch keeps each request well under the body-size limit
 * and allows incremental progress reporting.
 */
export const SYNC_BATCH_SIZE = 50;

/**
 * Maximum request body size the server accepts, in bytes.
 *
 * Fastify defaults to 1 MiB which is too small for encrypted sync
 * payloads. Encrypted change records use xsalsa20-poly1305 envelopes
 * with base64url-encoded ciphertext (33% expansion over binary).
 */
export const SYNC_BODY_LIMIT_BYTES = 10 * 1024 * 1024; // 10 MiB