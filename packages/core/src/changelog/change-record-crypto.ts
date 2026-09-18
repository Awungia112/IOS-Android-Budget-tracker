/**
 * change-record-crypto.ts
 *
 * Serialise/encrypt and decrypt/deserialise ChangeRecords for the upload queue.
 *
 * Write path:  ChangeRecord → JSON → TextEncoder → Uint8Array → seal() → SymmetricEnvelope
 * Read path:   SymmetricEnvelope → open() → TextDecoder → JSON.parse → ChangeRecord
 */

import { seal, open, type SymmetricEnvelope } from '../crypto/envelope.js';
import type { ChangeRecord } from '../commands/types.js';

/**
 * Serialise and encrypt a ChangeRecord.
 *
 * @param record     The plaintext ChangeRecord to protect.
 * @param accountKey 32-byte symmetric key for the record's account.
 * @returns          A SymmetricEnvelope suitable for storage or upload.
 */
export async function encryptChangeRecord(
  record: ChangeRecord,
  accountKey: Uint8Array,
): Promise<SymmetricEnvelope> {
  const plaintext = new TextEncoder().encode(JSON.stringify(record));
  return seal(plaintext, accountKey);
}

/**
 * Decrypt and deserialise a SymmetricEnvelope back into a ChangeRecord.
 *
 * @param envelope   The encrypted envelope produced by encryptChangeRecord.
 * @param accountKey 32-byte symmetric key used during encryption.
 * @returns          The original ChangeRecord.
 * @throws           If the MAC check fails (wrong key, tampered data).
 */
export async function decryptChangeRecord(
  envelope: SymmetricEnvelope,
  accountKey: Uint8Array,
): Promise<ChangeRecord> {
  const plaintext = await open(envelope, accountKey);
  return JSON.parse(new TextDecoder().decode(plaintext)) as ChangeRecord;
}
