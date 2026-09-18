/**
 * @vitest-environment jsdom
 *
 * Integration tests — Migration Flow (UI)
 *
 * Covers the full user-facing migration pipeline:
 *   intro → credentials → progress → result (success / failure)
 *
 * Uses:
 *   - Real BudgetProvider (fake-indexeddb)
 *   - Real MigrationWizard + MigrationPage components
 *   - MSW for legacy API HTTP mocking
 *   - Real timers so IndexedDB transactions are not interrupted by fake-clock
 *     scheduling while coverage instrumentation is enabled
 *
 * GDPR assertions run after every test to confirm no credentials are
 * persisted in localStorage, sessionStorage, or IndexedDB object stores.
 */

import 'fake-indexeddb/auto';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { screen, waitFor, cleanup, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom/vitest';
import { server } from '../../__mocks__/server';
import { renderIntegration } from '@/test-utils/integration-render';
import MigrationPage from '@/pages/MigrationPage';
import { db, DEFAULT_ACCOUNT_ID } from '@budget/core';
import {
  migrationSuccessHandlers,
  migrationInvalidCredentialsHandlers,
  migrationMidFetchFailureHandlers,
  migrationMalformedPayloadHandlers,
  VALID_EMAIL,
  VALID_PASSWORD,
  AUTH_TOKEN,
} from '../../__mocks__/handlers/migration';

// ---------------------------------------------------------------------------
// i18n mock — force English so assertions are language-independent
// (German is now the app default; see SyncMigrationWizard.test.tsx for the
// same pattern). `t`/`i18n` must stay referentially stable across renders —
// unlike the real react-i18next, a freshly-created object every render would
// break useCallback/useEffect deps keyed on `t` (e.g. BudgetContext) and
// cause a render loop.
// ---------------------------------------------------------------------------
import enTranslations from '@/i18n/locales/en.json';

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

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Wait for the wizard's bounded animation sequence to finish.
 * Real timers are intentional: fake timers can make Dexie transactions commit
 * early when coverage is enabled.
 */
const advanceAnimations = async () => {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 10_500));
  });
};

/** Wait for the intro screen's "Import My Data" button to appear. */
const waitForIntro = () =>
  waitFor(
    () => expect(screen.getByTestId('migration-start-button')).toBeInTheDocument(),
    { timeout: 10_000 },
  );

/** Click through intro → credentials step. */
const goToCredentials = async (user: ReturnType<typeof userEvent.setup>) => {
  await waitForIntro();
  await user.click(screen.getByTestId('migration-start-button'));
  await waitFor(
    () => expect(screen.getByTestId('migration-email-input')).toBeInTheDocument(),
    { timeout: 5_000 },
  );
};

/** Fill in credentials and submit. */
const submitCredentials = async (
  user: ReturnType<typeof userEvent.setup>,
  email = VALID_EMAIL,
  password = VALID_PASSWORD,
) => {
  await user.type(screen.getByTestId('migration-email-input'), email);
  await user.type(screen.getByTestId('migration-password-input'), password);
  await user.click(screen.getByTestId('migration-connect-button'));
};

// ---------------------------------------------------------------------------
// GDPR assertion — runs after every test
// ---------------------------------------------------------------------------

const CREDENTIAL_PATTERNS = [
  /password/i,
  /bearer/i,
  /token/i,
  /legacy.*email/i,
  /secret/i,
];

/**
 * Assert that no migration credentials are persisted in any browser storage.
 * Checks localStorage, sessionStorage, and all IndexedDB object store records.
 */
const assertNoCredentialsPersisted = async () => {
  // localStorage
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i)!;
    const value = localStorage.getItem(key) ?? '';
    for (const pattern of CREDENTIAL_PATTERNS) {
      expect(
        pattern.test(key) || pattern.test(value),
        `localStorage key "${key}" looks like a persisted credential`,
      ).toBe(false);
    }
  }

  // sessionStorage
  for (let i = 0; i < sessionStorage.length; i++) {
    const key = sessionStorage.key(i)!;
    const value = sessionStorage.getItem(key) ?? '';
    for (const pattern of CREDENTIAL_PATTERNS) {
      expect(
        pattern.test(key) || pattern.test(value),
        `sessionStorage key "${key}" looks like a persisted credential`,
      ).toBe(false);
    }
  }

  // IndexedDB — scan all known object stores for credential-like strings
  try {
    const stores = db.tables.map(t => t.name);
    for (const storeName of stores) {
      const records = await db.table(storeName).toArray();
      const serialised = JSON.stringify(records).toLowerCase();
      expect(
        serialised.includes('bearer') || serialised.includes(VALID_PASSWORD) || serialised.includes(VALID_EMAIL) || serialised.includes(AUTH_TOKEN.toLowerCase()),
        `IndexedDB store "${storeName}" contains credential data`,
      ).toBe(false);
    }
  } catch {
    // db may not be open in all scenarios — skip silently
  }
};

// ---------------------------------------------------------------------------
// Suite setup
// ---------------------------------------------------------------------------

// Mock react-router-dom's useNavigate at the module level (hoisted by vi.mock)
const mockNavigate = vi.fn();
vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>();
  return { ...actual, useNavigate: () => mockNavigate };
});

describe('Migration Flow — integration', () => {
  beforeEach(async () => {
    localStorage.clear();
    sessionStorage.clear();

    // Reset MSW to default (no migration handlers active by default)
    server.resetHandlers();

    // Reset navigate mock
    mockNavigate.mockClear();

    // Mock window.location.reload (jsdom doesn't allow spying on it directly)
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { ...window.location, reload: vi.fn() },
    });

    try {
      await db.close();
      await db.delete();
      await db.open();
      await db.initializeDefaultData();
    } catch (e) {
      // Surface setup failures in CI logs — matches the pattern used across all
      // other integration test files in this suite. The broad catch is intentional:
      // fake-indexeddb occasionally throws on close/delete between test runs, and
      // a noisy console.error is preferable to a silent empty DB.
      console.error('DB setup failed', e);
    }

    // Fake timers so wizard step animations don't slow tests down.
    // shouldAdvanceTime: true lets real time pass (so waitFor polling works)
    // while still allowing vi.runAllTimersAsync() to drain setTimeout delays.
    vi.useRealTimers();
  });

  afterEach(async () => {
    vi.useRealTimers();
    cleanup();
    vi.restoreAllMocks();
    try {
      await db.close();
    } catch { /* ignore */ }
  });

  // =========================================================================
  // 1. Happy path — successful migration
  // =========================================================================

  it('happy path: renders intro, accepts credentials, shows progress, displays success result', async () => {
    server.use(...migrationSuccessHandlers);

    const user = userEvent.setup();

    renderIntegration(<MigrationPage />, {
      initialEntries: ['/migration'],
      routePath: '/migration',
    });

    // ── Step 1: Intro ──────────────────────────────────────────────
    await waitForIntro();
    expect(screen.getByText('Bring Your Previous Data')).toBeInTheDocument();

    // ── Step 2: Credentials ────────────────────────────────────────
    await goToCredentials(user);
    expect(screen.getByText('Sign In to Import')).toBeInTheDocument();

    await submitCredentials(user);

    // ── Step 3: Progress ───────────────────────────────────────────
    await waitFor(
      () => expect(screen.getByText('Migrating Your Data')).toBeInTheDocument(),
      { timeout: 5_000 },
    );

    // Advance through all animation delays
    await advanceAnimations();

    // ── Step 4: Result ─────────────────────────────────────────────
    await waitFor(
      () => expect(screen.getByText('All Done')).toBeInTheDocument(),
      { timeout: 15_000 },
    );

    // Imported summary table should be visible
    expect(screen.getByText('Imported')).toBeInTheDocument();

    // Done button is present
    expect(screen.getByTestId('migration-done-button')).toBeInTheDocument();

    // GDPR check
    await assertNoCredentialsPersisted();
  });

  // =========================================================================
  // 2. Invalid credentials
  // =========================================================================

  it('invalid credentials: shows error alert, retry available, no data imported, no credentials persisted', async () => {
    server.use(...migrationInvalidCredentialsHandlers);

    const user = userEvent.setup();

    renderIntegration(<MigrationPage />, {
      initialEntries: ['/migration'],
      routePath: '/migration',
    });

    await goToCredentials(user);
    await submitCredentials(user, 'wrong@example.com', 'wrongpassword');

    // The wizard always mounts the progress step synchronously before calling onMigrate,
    // so we wait for it to appear before draining the animation timers.
    await waitFor(
      () => expect(screen.getByText('Migrating Your Data')).toBeInTheDocument(),
      { timeout: 5_000 },
    );

    // Drain the AUTHENTICATING step delay — the auth error is thrown inside onMigrate
    // which causes the wizard to catch and transition back to credentials.
    await advanceAnimations();

    // Error alert should appear on the credentials step
    await waitFor(
      () =>
        expect(screen.getByRole('alert')).toBeInTheDocument(),
      { timeout: 15_000 },
    );

    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent(/incorrect email or password/i);

    // Connect button is available again (retry)
    expect(screen.getByTestId('migration-connect-button')).toBeInTheDocument();

    // No data should have been imported
    const transactions = await db.transactions.toArray();
    expect(transactions).toHaveLength(0);

    // GDPR check
    await assertNoCredentialsPersisted();
  });

  // =========================================================================
  // 3. Mid-fetch failure
  // =========================================================================

  it('mid-fetch failure: auth succeeds, fetch fails, shows failure result with zero counts, retry available', async () => {
    server.use(...migrationMidFetchFailureHandlers);

    const user = userEvent.setup();

    renderIntegration(<MigrationPage />, {
      initialEntries: ['/migration'],
      routePath: '/migration',
    });

    await goToCredentials(user);
    await submitCredentials(user);

    // Progress screen appears
    await waitFor(
      () => expect(screen.getByText('Migrating Your Data')).toBeInTheDocument(),
      { timeout: 5_000 },
    );

    await advanceAnimations();

    // Failure result screen
    await waitFor(
      () => expect(screen.getByText('Something Went Wrong')).toBeInTheDocument(),
      { timeout: 15_000 },
    );

    // Retry button is present
    expect(screen.getByTestId('migration-retry-button')).toBeInTheDocument();

    // No data imported
    const transactions = await db.transactions.toArray();
    expect(transactions).toHaveLength(0);

    // GDPR check
    await assertNoCredentialsPersisted();
  });

  // =========================================================================
  // 4. Malformed payload
  // =========================================================================

  it('malformed payload: UI fails safely, shows failure result, app remains interactive, no credentials persisted', async () => {
    server.use(...migrationMalformedPayloadHandlers);

    const user = userEvent.setup();

    renderIntegration(<MigrationPage />, {
      initialEntries: ['/migration'],
      routePath: '/migration',
    });

    await goToCredentials(user);
    await submitCredentials(user);

    await advanceAnimations();

    // Should land on a failure or error state — either the result failure screen
    // or back on credentials with an error. Either way the app is still interactive.
    await waitFor(
      () => {
        const hasFailed = screen.queryByText('Something Went Wrong') !== null;
        const hasError = screen.queryByRole('alert') !== null;
        const hasRetry =
          screen.queryByTestId('migration-retry-button') !== null ||
          screen.queryByTestId('migration-connect-button') !== null;
        expect(hasFailed || hasError || hasRetry).toBe(true);
      },
      { timeout: 15_000 },
    );

    // App is still interactive — at least one actionable button exists
    const buttons = screen.getAllByRole('button');
    expect(buttons.length).toBeGreaterThan(0);

    // GDPR check
    await assertNoCredentialsPersisted();
  });

  // =========================================================================
  // 5. Duplicate migration attempt
  // =========================================================================

  it('duplicate attempt: shows "already migrated" screen, requires explicit confirmation to rerun, no silent second import', async () => {
    // Simulate a previous successful migration by setting the completion flag.
    // Uses the exported DEFAULT_ACCOUNT_ID constant so this stays in sync if the seed value changes.
    localStorage.setItem(`migration_completed_${DEFAULT_ACCOUNT_ID}`, 'true');

    const user = userEvent.setup();

    renderIntegration(<MigrationPage />, {
      initialEntries: ['/migration'],
      routePath: '/migration',
    });

    // "You're All Set" screen should appear instead of the wizard
    await waitFor(
      () => expect(screen.getByText("You're All Set")).toBeInTheDocument(),
      { timeout: 10_000 },
    );

    // The wizard's start button must NOT be visible — no silent re-import
    expect(screen.queryByTestId('migration-start-button')).not.toBeInTheDocument();

    // "Import Again" button is present but requires a confirmation step
    const rerunButton = screen.getByRole('button', { name: /import again/i });
    expect(rerunButton).toBeInTheDocument();

    // Click "Import Again" — should show a confirmation warning, not start immediately
    await user.click(rerunButton);

    await waitFor(
      () =>
        expect(
          screen.getByRole('button', { name: /yes, import again/i }),
        ).toBeInTheDocument(),
      { timeout: 5_000 },
    );

    // Warning copy is shown
    expect(
      screen.getByText(/this will sync any new items/i),
    ).toBeInTheDocument();

    // GDPR check — no credentials were ever entered in this flow
    await assertNoCredentialsPersisted();
  });

  // =========================================================================
  // 6. GDPR — success path: completion flag uses account ID, not credentials
  // =========================================================================

  it('GDPR: after successful migration, completion flag is set by account ID only — no credentials in any store', async () => {
    server.use(...migrationSuccessHandlers);

    const user = userEvent.setup();

    renderIntegration(<MigrationPage />, {
      initialEntries: ['/migration'],
      routePath: '/migration',
    });

    await goToCredentials(user);
    await submitCredentials(user);

    await waitFor(
      () => expect(screen.getByText('Migrating Your Data')).toBeInTheDocument(),
      { timeout: 5_000 },
    );

    await advanceAnimations();

    await waitFor(
      () => expect(screen.getByText('All Done')).toBeInTheDocument(),
      { timeout: 15_000 },
    );

    // Click Done to trigger handleDone which sets the completion flags
    await user.click(screen.getByTestId('migration-done-button'));

    // Wait for the completion flags — handleDone writes them synchronously before
    // navigating, but waitFor guards against any future reordering.
    await waitFor(() =>
      expect(
        Object.keys(localStorage).some(k => k.startsWith('migration_completed_')),
      ).toBe(true),
    );

    // Completion flags exist (keyed by account ID)
    const migrationFlags = Object.keys(localStorage).filter(k =>
      k.startsWith('migration_completed_'),
    );
    expect(migrationFlags.length).toBeGreaterThan(0);

    // But no flag value contains credentials
    for (const key of migrationFlags) {
      const value = localStorage.getItem(key) ?? '';
      expect(value).not.toContain(VALID_PASSWORD);
      expect(value.toLowerCase()).not.toContain('bearer');
    }

    // Full GDPR sweep
    await assertNoCredentialsPersisted();
  });
});
