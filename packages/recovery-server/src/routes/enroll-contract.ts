/**
 * Contract for POST /v1/recovery/enroll
 *
 * Single source of truth for validation patterns and error codes shared
 * between the route handler and tests.
 */

/** BLAKE2b-256 always produces a 64-character hex digest. */
export const EMAIL_HASH_HEX_LENGTH = 64;

/**
 * Regex pattern for a valid email hash (64 lowercase hex chars).
 *
 * Uppercase hex is explicitly rejected — the client must hash with lowercase
 * output. This matches the main server contract and prevents silent mismatches
 * where the same email produces two different stored hashes.
 */
export const EMAIL_HASH_PATTERN = `^[0-9a-f]{${EMAIL_HASH_HEX_LENGTH}}$`;

/** Allowed algorithm identifier for the RecoveryEnvelope. */
export const RECOVERY_ALG = 'argon2id+xchacha20-poly1305' as const;

export const ENROLL_ERRORS = {
  alreadyEnrolled: 'already_enrolled',
  internalError: 'internal_error',
} as const;

/** Shape of the encrypted_private_key field in the request body. */
export interface RecoveryEnvelopeBody {
  v: 1;
  alg: typeof RECOVERY_ALG;
  kdf_salt: string;
  /**
   * Argon2id opslimit — stored as-received and trusted as data.
   * The server does not normalise or clamp this value; the schema enforces
   * a reasonable upper bound (100_000_000) to prevent absurdly large inputs.
   */
  kdf_ops: number;
  /**
   * Argon2id memlimit in bytes — stored as-received and trusted as data.
   * The schema enforces a maximum of 1 GiB (1_073_741_824 bytes).
   */
  kdf_mem: number;
  nonce: string;
  ciphertext: string;
}

/** Request body for POST /v1/recovery/enroll */
export interface EnrollRequestBody {
  email_hash: string;
  encrypted_private_key: RecoveryEnvelopeBody;
}

/** Success response for POST /v1/recovery/enroll */
export interface EnrollResponse {
  status: 'enrolled';
}
