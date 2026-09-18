/** @vitest-environment node */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { enrollRecovery } from './recovery-api-client.js';
import type { RecoveryEnvelope } from './envelope.js';

const BASE_URL = 'https://recovery.example.com';
const EMAIL_HASH = 'a'.repeat(64);
const VALID_ENVELOPE: RecoveryEnvelope = {
    v: 1,
    alg: 'argon2id+xchacha20-poly1305',
    kdf_salt: 'AAAAAAAAAAAAAAAAAAAAAA',
    kdf_ops: 2,
    kdf_mem: 67108864,
    nonce: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
    ciphertext: 'A'.repeat(64),
};

describe('enrollRecovery', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
        global.fetch = vi.fn();
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('returns success when the recovery server responds with OK', async () => {
        (global.fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
            ok: true,
            status: 200,
        });

        const result = await enrollRecovery({
            recoveryServerUrl: BASE_URL,
            emailHash: EMAIL_HASH,
            encryptedPrivateKey: VALID_ENVELOPE,
        });

        expect(result).toEqual({ success: true });
        expect(global.fetch).toHaveBeenCalledOnce();
        expect(global.fetch).toHaveBeenCalledWith(`${BASE_URL}/v1/recovery/enroll`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            signal: expect.any(AbortSignal),
            body: JSON.stringify({
                email_hash: EMAIL_HASH,
                encrypted_private_key: VALID_ENVELOPE,
            }),
        });
    });

    it('returns server_error when the response is not OK', async () => {
        (global.fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
            ok: false,
            status: 500,
        });

        const result = await enrollRecovery({
            recoveryServerUrl: BASE_URL,
            emailHash: EMAIL_HASH,
            encryptedPrivateKey: VALID_ENVELOPE,
        });

        expect(result).toEqual({ success: false, reason: 'server_error', status: 500 });
    });

    it('returns already_enrolled when the response is 409 Conflict', async () => {
        (global.fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
            ok: false,
            status: 409,
        });

        const result = await enrollRecovery({
            recoveryServerUrl: BASE_URL,
            emailHash: EMAIL_HASH,
            encryptedPrivateKey: VALID_ENVELOPE,
        });

        expect(result).toEqual({ success: false, reason: 'already_enrolled' });
    });

    it('normalizes a trailing slash in the recovery server URL', async () => {
        (global.fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
            ok: true,
            status: 200,
        });

        await enrollRecovery({
            recoveryServerUrl: `${BASE_URL}/`,
            emailHash: EMAIL_HASH,
            encryptedPrivateKey: VALID_ENVELOPE,
        });

        expect(global.fetch).toHaveBeenCalledWith(
            `${BASE_URL}/v1/recovery/enroll`,
            expect.objectContaining({ method: 'POST' }),
        );
    });

    it('returns validation_error for an invalid email hash', async () => {
        const result = await enrollRecovery({
            recoveryServerUrl: BASE_URL,
            emailHash: 'not-a-hash',
            encryptedPrivateKey: VALID_ENVELOPE,
        });

        expect(result).toEqual({
            success: false,
            reason: 'validation_error',
            message: 'invalid_email_hash',
        });
        expect(global.fetch).not.toHaveBeenCalled();
    });

    it('returns network_error when fetch throws', async () => {
        (global.fetch as unknown as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
            new Error('network unavailable'),
        );

        const result = await enrollRecovery({
            recoveryServerUrl: BASE_URL,
            emailHash: EMAIL_HASH,
            encryptedPrivateKey: VALID_ENVELOPE,
        });

        expect(result).toMatchObject({
            success: false,
            reason: 'network_error',
        });
        if (result.success === false && result.reason === 'network_error') {
            expect(result.cause).toBeInstanceOf(Error);
            expect(result.cause.message).toBe('network unavailable');
        }
    });
});
