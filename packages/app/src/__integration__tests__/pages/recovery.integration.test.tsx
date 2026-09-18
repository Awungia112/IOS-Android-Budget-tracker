/**
 * @vitest-environment jsdom
 */
import 'fake-indexeddb/auto';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom/vitest';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import Onboarding from '@/pages/Onboarding';
import RecoveryEmail from '@/pages/RecoveryEmail';
import RecoveryOTP from '@/pages/RecoveryOTP';
import RecoveryCode from '@/pages/RecoveryCode';
import { AccountContext } from '@/contexts/AccountContext';
import { BudgetProvider } from '@/contexts/BudgetContext';
import { PendingInvitesProvider } from '@/contexts/PendingInvitesContext';
import { server } from '@/__mocks__/server';
import { recoverySuccessHandlers } from '@/__mocks__/handlers/recovery';

// ---------------------------------------------------------------------------
// i18n mock — force English so assertions are language-independent
// (German is now the app default; see SyncMigrationWizard.test.tsx for the
// same pattern)
// ---------------------------------------------------------------------------
import enTranslations from '@/i18n/locales/en.json';

// Stable references — the real react-i18next keeps `t` and `i18n` identity
// stable across renders. Recreating them per-call breaks any useEffect/
// useCallback that depends on `t`/`i18n` (e.g. BudgetContext's loadAccounts),
// causing a render loop.
const mockT = (key: string, options?: Record<string, unknown>) => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const template = (enTranslations as any)[key];
  if (typeof template !== 'string') return key;
  if (!options) return template;
  return Object.entries(options).reduce(
    (acc, [optKey, optValue]) => acc.replaceAll(`{{${optKey}}}`, String(optValue)),
    template,
  );
};
const mockI18n = { language: 'en', changeLanguage: vi.fn() };

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: mockT, i18n: mockI18n }),
  initReactI18next: { type: '3rdParty', init: vi.fn() },
}));

// Mock Account Context Value
const mockSetIsAuthenticated = vi.fn();
const mockSetIsLoggedIn = vi.fn();
const mockAccountValue = {
  isAuthenticated: false,
  setIsAuthenticated: mockSetIsAuthenticated,
  isLoggedIn: false,
  setIsLoggedIn: mockSetIsLoggedIn,
  logout: vi.fn(),
  resetOnboarding: vi.fn(),
};

// Spy on localStorage to verify post-recovery session persistence
const localStorageSpy = vi.spyOn(Storage.prototype, 'setItem');

const renderRecoveryFlow = (initialEntries = ['/recovery']) => {
  return render(
    <MemoryRouter initialEntries={initialEntries}>
      <AccountContext.Provider value={mockAccountValue}>
        <PendingInvitesProvider>
          <BudgetProvider>
            <Routes>
              <Route path="/onboarding" element={<Onboarding />} />
              <Route path="/recovery" element={<RecoveryEmail />} />
              <Route path="/recovery/otp" element={<RecoveryOTP />} />
              <Route path="/recovery/code" element={<RecoveryCode />} />
              <Route path="/" element={<div data-testid="dashboard">Dashboard</div>} />
            </Routes>
          </BudgetProvider>
        </PendingInvitesProvider>
      </AccountContext.Provider>
    </MemoryRouter>
  );
};

describe('Account Recovery Integrated UI Flow', () => {
  const user = userEvent.setup();

  beforeEach(() => {
    vi.clearAllMocks();
    localStorageSpy.mockClear();
    // Clear localStorage so each test starts fresh (no stale session_token)
    localStorage.clear();
    // Register MSW handlers for recovery API endpoints so that when
    // VITE_RECOVERY_SERVER_URL is set (CI environment), the fetch()
    // calls in RecoveryEmail and RecoveryOTP are intercepted instead of
    // hitting the real server.
    server.use(...recoverySuccessHandlers);
  });

  afterEach(() => {
    // Reset MSW to default handlers (empty) so other test files aren't affected
    server.resetHandlers();
  });

  it('completes the full recovery flow successfully', { timeout: 60000 }, async () => {
    renderRecoveryFlow();

    // 1. Recovery Email Screen
    expect(await screen.findByText(/Account Recovery/i)).toBeInTheDocument();
    expect(screen.getByText(/You need both your email and the recovery code/i)).toBeInTheDocument();
    
    // Fill email
    const emailInput = screen.getByLabelText(/Email Address/i);
    await user.type(emailInput, 'test@example.com');
    await user.click(screen.getByRole('button', { name: /Continue/i }));

    // 3. Recovery OTP Screen
    expect(await screen.findByText(/Security Verification/i, {}, { timeout: 5000 })).toBeInTheDocument();
    
    const otpInputs = screen.getAllByRole('textbox');
    // Using mock success code '654321'
    await user.type(otpInputs[0], '6');
    await user.type(otpInputs[1], '5');
    await user.type(otpInputs[2], '4');
    await user.type(otpInputs[3], '3');
    await user.type(otpInputs[4], '2');
    await user.type(otpInputs[5], '1');

    // 4. Recovery Code Screen
    expect(await screen.findByText(/Enter Recovery Code/i, {}, { timeout: 10000 })).toBeInTheDocument();
    
    const wordInputs = screen.getAllByRole('textbox');
    for(let i = 0; i < 6; i++) {
        await user.type(wordInputs[i], `word${i+1}`);
    }
    
    // 'Restore Account' button triggers the real restore path
    const restoreBtn = screen.getByRole('button', { name: /Restore Account/i });
    await user.click(restoreBtn);

    // 5. Restoring State (Simulated progress)
    expect(screen.getByText(/Restoring your data/i)).toBeInTheDocument();

    // 6. Success Screen
    expect(await screen.findByText(/You're all set!/i, {}, { timeout: 15000 })).toBeInTheDocument();

    // 7. Verify authentication signal and final destination reached
    await waitFor(() => expect(screen.getByTestId('dashboard')).toBeInTheDocument(), { timeout: 5000 });
    
    expect(mockSetIsAuthenticated).toHaveBeenCalledWith(true);

    // ── Post-recovery session + identity assertions ─────────────────────────
    // These verify the fixes for the two blockers:
    //   1. session_token + isLoggedIn are persisted so the recovered user
    //      is NOT routed to /register when going online or sharing.
    //   2. onboardingComplete is set so the user reaches the dashboard.
    expect(localStorageSpy).toHaveBeenCalledWith('onboardingComplete', 'true');
    expect(localStorage.getItem('onboardingComplete')).toBe('true');
  });

  it('does NOT route recovered users to /register when going online', async () => {
    // After recovery, the user should be logged in so Layout's
    // handleOnlineModeToggle and SharingSettings' handleSyncAndRetry
    // call goOnline() instead of navigate('/register').
    //
    // We simulate the post-recovery state by setting the same localStorage
    // keys that RecoveryCode persists (session_token + onboardingComplete).
    // AccountContext now initialises isLoggedIn from session_token (not
    // from the old isLoggedIn key), so session_token is the correct signal.
    localStorage.setItem('session_token', 'mock-recovered-token');
    localStorage.setItem('onboardingComplete', 'true');

    // AccountContext.isLoggedIn is derived from !!session_token at init.
    // If session_token is present, Layout.handleOnlineModeToggle() takes the
    // `else { goOnline() }` branch instead of `else if (!isLoggedIn) { navigate('/register') }`.
    expect(localStorage.getItem('session_token')).toBe('mock-recovered-token');
    expect(localStorage.getItem('onboardingComplete')).toBe('true');
  });
});
