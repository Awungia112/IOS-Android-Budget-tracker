/** @vitest-environment jsdom */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import RegistrationEmail from './RegistrationEmail';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { language: 'en', changeLanguage: vi.fn() },
  }),
}));

let mockLocationState: Record<string, unknown> = {};

const mockNavigate = vi.fn();
vi.mock('react-router-dom', () => ({
  useNavigate: () => mockNavigate,
  useLocation: () => ({ state: mockLocationState }),
}));

vi.mock('@/components/ui/input', () => ({ Input: ({ ...props }: any) => <input {...props} /> }));
vi.mock('@/components/ui/label', () => ({ Label: ({ children, ...props }: any) => <label {...props}>{children}</label> }));
vi.mock('@/components/ui/use-toast', () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock('@budget/core', () => ({
  generateKeypair: vi.fn(),
  publicKeyToBase64url: vi.fn(),
  storePrivateKey: vi.fn(),
  loadPrivateKey: vi.fn(),
}));
vi.mock('@/lib/api', () => ({ API_BASE_URL: 'http://test', nativeFetch: vi.fn() }));

import { generateKeypair, publicKeyToBase64url, loadPrivateKey } from '@budget/core';
import { nativeFetch } from '@/lib/api';

/** Helpers ---------------------------------------------------------------- */

function mockKeypair() {
  vi.mocked(generateKeypair).mockResolvedValue({
    publicKey: new Uint8Array([1, 2, 3]),
    privateKey: new Uint8Array([4, 5, 6]),
  });
  vi.mocked(publicKeyToBase64url).mockReturnValue('base64-encoded-public-key');
}

function mockResponse(overrides: Partial<Response> & { jsonData?: unknown }): Response {
  const { jsonData, ...rest } = overrides as any;
  return {
    ok: true,
    status: 200,
    statusText: 'OK',
    headers: new Headers(),
    text: () => Promise.resolve(''),
    json: () => Promise.resolve(jsonData ?? {}),
    ...rest,
  } as unknown as Response;
}

/** Preflight responses */
const preflightFound = (email_hash = 'abc123') =>
  mockResponse({ jsonData: { status: 'found', email_hash } });

const preflightNotFound = () =>
  mockResponse({ jsonData: { status: 'not_found' } });

/** Register / nonce responses */
const nonceOk = () => mockResponse({ jsonData: { nonce: 'test-nonce' } });

const register201 = (email_hash = 'hash-from-server') =>
  mockResponse({ status: 201, jsonData: { email_hash } });

const register200 = (email_hash = 'hash-from-server') =>
  mockResponse({ status: 200, jsonData: { success: true, message: 'Sign-in code sent', email_hash } });

const register404 = () =>
  mockResponse({ ok: false, status: 404, statusText: 'Not Found', jsonData: {} });

function fillEmailAndSubmit(email = 'test@example.com') {
  const input = screen.getByLabelText('registration.email_label');
  fireEvent.change(input, { target: { value: email } });
  fireEvent.click(screen.getByRole('button', { name: 'registration.continue' }));
}

/** Tests ------------------------------------------------------------------ */

describe('RegistrationEmail', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
    mockNavigate.mockClear();
    mockLocationState = {};
    vi.mocked(loadPrivateKey).mockResolvedValue(new Uint8Array([1])); // device has key by default
  });

  describe('subtitle', () => {
    it('shows register subtitle and zero-knowledge warning', () => {
      render(<RegistrationEmail />);
      expect(screen.getByText('registration.register_subtitle')).toBeInTheDocument();
      expect(screen.getByText('registration.zero_knowledge_warning')).toBeInTheDocument();
    });
  });

  describe('new user registration (no existing account)', () => {
    it('navigates to check-email on 201 success', async () => {
      mockKeypair();
      // preflight → not_found, nonce, register 201
      vi.mocked(nativeFetch)
        .mockResolvedValueOnce(preflightNotFound())
        .mockResolvedValueOnce(nonceOk())
        .mockResolvedValueOnce(register201());

      render(<RegistrationEmail />);
      fillEmailAndSubmit('user@example.com');

      await waitFor(() => {
        expect(mockNavigate).toHaveBeenCalledWith('/register/check-email', {
          state: { email: 'user@example.com', email_hash: 'hash-from-server' },
        });
      });
      expect(localStorage.getItem('userEmail')).toBe('user@example.com');
      expect(localStorage.getItem('pendingAuthIntent')).toBe('register');
    });
  });

  describe('existing account, same device', () => {
    it('navigates to check-email with isAlreadyRegistered when device holds the key', async () => {
      mockKeypair();
      vi.mocked(loadPrivateKey).mockResolvedValue(new Uint8Array([1])); // key present
      // preflight → found, nonce, register 200
      vi.mocked(nativeFetch)
        .mockResolvedValueOnce(preflightFound('hash-from-server'))
        .mockResolvedValueOnce(nonceOk())
        .mockResolvedValueOnce(register200('hash-from-server'));

      render(<RegistrationEmail />);
      fillEmailAndSubmit('user@example.com');

      await waitFor(() => {
        expect(mockNavigate).toHaveBeenCalledWith('/register/check-email', {
          state: { email: 'user@example.com', email_hash: 'hash-from-server', isAlreadyRegistered: true },
        });
      });
      expect(localStorage.getItem('userEmail')).toBe('user@example.com');
    });
  });

  describe('existing account, NEW device — OTP must NOT be sent', () => {
    it('shows recover-account error and never calls /v1/auth/register', async () => {
      mockKeypair();
      vi.mocked(loadPrivateKey).mockResolvedValue(null); // no key on this device

      // Only the preflight call should be made — nothing beyond that
      vi.mocked(nativeFetch).mockResolvedValueOnce(preflightFound('abc123'));

      render(<RegistrationEmail />);
      fillEmailAndSubmit('existing@example.com');

      await waitFor(() => {
        expect(screen.getByText('registration.signin_new_device')).toBeInTheDocument();
      });

      // Register endpoint must NOT have been called (only 1 fetch = preflight)
      expect(vi.mocked(nativeFetch)).toHaveBeenCalledTimes(1);
      expect(mockNavigate).not.toHaveBeenCalled();
    });

    it('shows recover-account error even when intent is register (not signin)', async () => {
      // intent is undefined / 'register' — the old code skipped preflight in this case
      mockLocationState = {};
      mockKeypair();
      vi.mocked(loadPrivateKey).mockResolvedValue(null);

      vi.mocked(nativeFetch).mockResolvedValueOnce(preflightFound('abc123'));

      render(<RegistrationEmail />);
      fillEmailAndSubmit('existing@example.com');

      await waitFor(() => {
        expect(screen.getByText('registration.signin_new_device')).toBeInTheDocument();
      });

      expect(vi.mocked(nativeFetch)).toHaveBeenCalledTimes(1);
      expect(mockNavigate).not.toHaveBeenCalled();
    });
  });

  describe('sign-in intent with unregistered email', () => {
    it('shows email-not-registered error and register link when preflight returns not_found', async () => {
      mockLocationState = { intent: 'signin' };
      mockKeypair();

      vi.mocked(nativeFetch).mockResolvedValueOnce(preflightNotFound());

      render(<RegistrationEmail />);
      fillEmailAndSubmit('unknown@example.com');

      await waitFor(() => {
        expect(screen.getByText('registration.email_not_registered')).toBeInTheDocument();
      });

      // Register endpoint must NOT have been called
      expect(vi.mocked(nativeFetch)).toHaveBeenCalledTimes(1);
      expect(mockNavigate).not.toHaveBeenCalled();
    });

    it('falls through to register endpoint when preflight returns a non-ok response (5xx)', async () => {
      mockLocationState = { intent: 'signin' };
      mockKeypair();
      vi.mocked(loadPrivateKey).mockResolvedValue(new Uint8Array([1]));

      vi.mocked(nativeFetch)
        .mockResolvedValueOnce(mockResponse({ ok: false, status: 500, jsonData: {} })) // preflight 5xx
        .mockResolvedValueOnce(nonceOk())
        .mockResolvedValueOnce(register404());

      render(<RegistrationEmail />);
      fillEmailAndSubmit('unknown@example.com');

      await waitFor(() => {
        expect(screen.getByText('registration.email_not_registered')).toBeInTheDocument();
      });
      // Three calls: preflight (5xx) + nonce + register
      expect(vi.mocked(nativeFetch)).toHaveBeenCalledTimes(3);
    });

    it('falls through to register endpoint when preflight throws a network error', async () => {
      mockLocationState = { intent: 'signin' };
      mockKeypair();
      vi.mocked(loadPrivateKey).mockResolvedValue(new Uint8Array([1]));

      vi.mocked(nativeFetch)
        .mockRejectedValueOnce(new TypeError('Failed to fetch')) // genuine network error
        .mockResolvedValueOnce(nonceOk())
        .mockResolvedValueOnce(register404());

      render(<RegistrationEmail />);
      fillEmailAndSubmit('unknown@example.com');

      await waitFor(() => {
        expect(screen.getByText('registration.email_not_registered')).toBeInTheDocument();
      });
      // Three calls: preflight (thrown) + nonce + register
      expect(vi.mocked(nativeFetch)).toHaveBeenCalledTimes(3);
    });
  });

  describe('register intent with unregistered email (normal new registration)', () => {
    it('falls through to server when preflight returns not_found', async () => {
      mockLocationState = {};
      mockKeypair();

      vi.mocked(nativeFetch)
        .mockResolvedValueOnce(preflightNotFound())
        .mockResolvedValueOnce(nonceOk())
        .mockResolvedValueOnce(register201());

      render(<RegistrationEmail />);
      fillEmailAndSubmit('new@example.com');

      await waitFor(() => {
        expect(mockNavigate).toHaveBeenCalledWith('/register/check-email', {
          state: { email: 'new@example.com', email_hash: 'hash-from-server' },
        });
      });
    });
  });

  describe('unvalidated / abandoned registration', () => {
    // The server now returns not_found for unvalidated rows (validatedAt IS NULL),
    // so both register and signin intents should fall through and let upsertRegistration
    // overwrite the stale row — same as if the email had never been used at all.

    it('register intent: falls through and registers normally when account is unvalidated', async () => {
      mockLocationState = {};
      mockKeypair();

      // Server treats unvalidated rows as not_found — preflight returns not_found
      vi.mocked(nativeFetch)
        .mockResolvedValueOnce(preflightNotFound())
        .mockResolvedValueOnce(nonceOk())
        .mockResolvedValueOnce(register201());

      render(<RegistrationEmail />);
      fillEmailAndSubmit('abandoned@example.com');

      await waitFor(() => {
        expect(mockNavigate).toHaveBeenCalledWith('/register/check-email', {
          state: { email: 'abandoned@example.com', email_hash: 'hash-from-server' },
        });
      });
      // No dead-end error shown
      expect(screen.queryByText('registration.signin_new_device')).not.toBeInTheDocument();
    });

    it('signin intent: shows email-not-registered error when account is unvalidated', async () => {
      mockLocationState = { intent: 'signin' };
      mockKeypair();

      // Server treats unvalidated rows as not_found for preflight
      vi.mocked(nativeFetch).mockResolvedValueOnce(preflightNotFound());

      render(<RegistrationEmail />);
      fillEmailAndSubmit('abandoned@example.com');

      await waitFor(() => {
        expect(screen.getByText('registration.email_not_registered')).toBeInTheDocument();
      });
      // Should not navigate anywhere
      expect(mockNavigate).not.toHaveBeenCalled();
    });
  });
});
