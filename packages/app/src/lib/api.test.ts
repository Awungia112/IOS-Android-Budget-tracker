import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getApiBaseUrl, getRecoveryServerUrl, createAppOnlineAccountsClient } from './api';
import { createOnlineAccountsClient } from '@budget/core';

vi.mock('@budget/core', () => ({
  createOnlineAccountsClient: vi.fn(),
}));

describe('environment URL defaults', () => {
  it('falls back to the production API base URL when no app env is provided', () => {
    expect(getApiBaseUrl({} as ImportMetaEnv)).toBe('https://api.prod.dip.on.adorsys.com');
  });

  it('falls back to the production recovery URL when no recovery env is provided', () => {
    expect(getRecoveryServerUrl({} as ImportMetaEnv)).toBe('https://recovery.prod.dip.on.adorsys.com');
  });

  it('uses the configured values when provided', () => {
    expect(getApiBaseUrl({ VITE_API_BASE_URL: 'https://example.test' } as unknown as ImportMetaEnv)).toBe('https://example.test');
    expect(getRecoveryServerUrl({ VITE_RECOVERY_SERVER_URL: 'https://recovery.example.test' } as unknown as ImportMetaEnv)).toBe('https://recovery.example.test');
  });

  it('prefers the production endpoints when the app is hosted on the production domain', () => {
    const originalLocation = window.location;
    Object.defineProperty(window, 'location', {
      value: new URL('https://app.prod.dip.on.adorsys.com/register'),
      writable: true,
    });

    try {
      expect(getApiBaseUrl({ VITE_API_BASE_URL: 'https://api.dev.dip.on.adorsys.com' } as unknown as ImportMetaEnv)).toBe('https://api.prod.dip.on.adorsys.com');
      expect(getRecoveryServerUrl({ VITE_RECOVERY_SERVER_URL: 'https://recovery.dev.dip.on.adorsys.com' } as unknown as ImportMetaEnv)).toBe('https://recovery.prod.dip.on.adorsys.com');
    } finally {
      Object.defineProperty(window, 'location', {
        value: originalLocation,
        writable: true,
      });
    }
  });
});

describe('createAppOnlineAccountsClient', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.mocked(createOnlineAccountsClient).mockClear();
  });

  it('persists a renewed session token to localStorage, replacing the stored one', () => {
    localStorage.setItem('session_token', 'old-token');
    createAppOnlineAccountsClient({
      baseUrl: 'https://api.example.test',
      sessionToken: 'old-token',
    });

    expect(createOnlineAccountsClient).toHaveBeenCalledOnce();

    const options = vi.mocked(createOnlineAccountsClient).mock.calls[0][0];
    options.onTokenRenewed?.('renewed-token');

    expect(localStorage.getItem('session_token')).toBe('renewed-token');
  });
});
