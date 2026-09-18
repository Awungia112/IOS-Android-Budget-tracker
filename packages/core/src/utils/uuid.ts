/**
 * Generates a RFC 4122 version 4 compliant UUID
 * @returns A string representation of a UUID
 */
export function generateUUID(): string {
  // Use crypto.randomUUID() if available (modern browsers and Node 19+)
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }

  // Fallback using crypto.getRandomValues() for environments where
  // randomUUID() is unavailable but the Web Crypto API is present.
  // crypto.getRandomValues() is available in all browsers since IE11.
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    const bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);

    // Set version 4 (bits 12-15 of byte 6)
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    // Set variant bits (bits 6-7 of byte 8)
    bytes[8] = (bytes[8] & 0x3f) | 0x80;

    return [...bytes]
      .map((b, i) =>
        [4, 6, 8, 10].includes(i) ? `-${b.toString(16).padStart(2, '0')}` : b.toString(16).padStart(2, '0')
      )
      .join('');
  }

  // No cryptographic API available. Throwing here is intentional -- silently
  // falling back to Math.random() would produce predictable IDs for financial
  // transaction records, which is a security risk not an acceptable degradation.
  throw new Error('No cryptographic random source available. This application requires Web Crypto API support.');
}
