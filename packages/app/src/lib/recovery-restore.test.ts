/**
 * @vitest-environment jsdom
 */
import 'fake-indexeddb/auto';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { restoreAfterRecovery, RecoveryRestoreError } from './recovery-restore';

// Mock @/lib/api — nativeFetch needs to return nonce + session responses.
const mockNonceResponse = { ok: true, json: async () => ({ nonce: 'test-nonce' }) };
const mockSessionOkResponse = {
  ok: true,
  json: async () => ({ token: 'mock-session-token' }),
};

let fetchImpl: ReturnType<typeof vi.fn>;

vi.mock('@/lib/api', () => ({
  API_BASE_URL: 'http://localhost:3095',
  createAppOnlineAccountsClient: () => ({
    listAccounts: vi.fn().mockResolvedValue({ accounts: [] }),
    getAccountKey: vi.fn(),
    pullChangeRecords: vi.fn(),
  }),
  get nativeFetch() {
    return fetchImpl;
  },
}));

// Mock @budget/core — only the functions restoreAfterRecovery actually calls.
const mockGetPublicKey = vi.fn();
const mockReplayRecoveredOnlineAccounts = vi.fn();

vi.mock('@budget/core', () => ({
  BudgetService: vi.fn().mockImplementation(() => ({
    executeCommand: vi.fn().mockResolvedValue(undefined),
  })),
  createOnlineAccountsClient: vi.fn().mockReturnValue({
    listAccounts: vi.fn().mockResolvedValue({ accounts: [] }),
    getAccountKey: vi.fn(),
    pullChangeRecords: vi.fn(),
  }),
  getPublicKey: (...args: unknown[]) => mockGetPublicKey(...args),
  publicKeyToBase64url: vi.fn().mockReturnValue('A'.repeat(43)),
  replayRecoveredOnlineAccounts: (...args: unknown[]) =>
    mockReplayRecoveredOnlineAccounts(...args),
}));

describe('restoreAfterRecovery', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();

    // Re-establish default mock returns (clearAllMocks wipes them)
    mockGetPublicKey.mockResolvedValue(new Uint8Array(32));
    mockReplayRecoveredOnlineAccounts.mockResolvedValue({ accounts: [] });

    fetchImpl = vi.fn().mockImplementation(async (url: string) => {
      if (url.includes('/v1/nonce')) return mockNonceResponse;
      if (url.includes('/v1/auth/recover-session')) return mockSessionOkResponse;
      return { ok: false, status: 404, json: async () => ({}) };
    });
  });

  it('persists session_token and isLoggedIn on success', async () => {
    await restoreAfterRecovery({
      emailHash: 'abc123def456',
      privateKey: new Uint8Array(32),
    });

    expect(localStorage.getItem('session_token')).toBe('mock-session-token');
    // isLoggedIn is no longer written to localStorage — AccountContext derives
    // login state from session_token at init time.
    expect(localStorage.getItem('isLoggedIn')).toBeNull();
    expect(localStorage.getItem('budget-wise-offline-mode')).toBeNull();
  });

  it('replays with clearLocalData: false so local/unsynced data is never wiped', async () => {
    await restoreAfterRecovery({
      emailHash: 'abc123def456',
      privateKey: new Uint8Array(32),
    });

    expect(mockReplayRecoveredOnlineAccounts).toHaveBeenCalledTimes(1);
    expect(mockReplayRecoveredOnlineAccounts.mock.calls[0][0]).toMatchObject({
      clearLocalData: false,
    });
  });

  it('calls /v1/nonce then /v1/auth/recover-session', async () => {
    await restoreAfterRecovery({
      emailHash: 'abc123def456',
      privateKey: new Uint8Array(32),
    });

    const urls = fetchImpl.mock.calls.map((c) => c[0] as string);
    expect(urls.some((u) => u.includes('/v1/nonce'))).toBe(true);
    expect(urls.some((u) => u.includes('/v1/auth/recover-session'))).toBe(true);
  });

  it('throws RecoveryRestoreError when session fetch fails', async () => {
    fetchImpl.mockImplementation(async (url: string) => {
      if (url.includes('/v1/nonce')) return mockNonceResponse;
      return { ok: false, status: 401, json: async () => ({ error: 'unauthorized' }) };
    });

    await expect(
      restoreAfterRecovery({
        emailHash: 'abc123def456',
        privateKey: new Uint8Array(32),
      }),
    ).rejects.toThrow(RecoveryRestoreError);
  });

  it('throws RecoveryRestoreError when nonce fetch fails', async () => {
    fetchImpl.mockImplementation(async () => ({
      ok: false,
      status: 500,
      json: async () => ({}),
    }));

    await expect(
      restoreAfterRecovery({
        emailHash: 'abc123def456',
        privateKey: new Uint8Array(32),
      }),
    ).rejects.toThrow(RecoveryRestoreError);
  });

  it('throws RecoveryRestoreError when getPublicKey returns null', async () => {
    mockGetPublicKey.mockResolvedValue(null);

    await expect(
      restoreAfterRecovery({
        emailHash: 'abc123def456',
        privateKey: new Uint8Array(32),
      }),
    ).rejects.toThrow(RecoveryRestoreError);
  });

  it('still persists session when replay fails (best-effort)', async () => {
    mockReplayRecoveredOnlineAccounts.mockRejectedValue(new Error('replay network error'));

    // restoreAfterRecovery should throw for replay failures too (the caller
    // handles it as best-effort), but the session is already stored before
    // the replay runs, so isLoggedIn is true.
    await expect(
      restoreAfterRecovery({
        emailHash: 'abc123def456',
        privateKey: new Uint8Array(32),
      }),
    ).rejects.toThrow();

    // Session was persisted before replay ran
    expect(localStorage.getItem('session_token')).toBe('mock-session-token');
    // isLoggedIn is no longer written to localStorage — session_token is the
    // canonical signal that AccountContext reads at init time.
    expect(localStorage.getItem('isLoggedIn')).toBeNull();
  });
});