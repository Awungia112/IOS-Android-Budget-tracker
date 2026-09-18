/**
 * @vitest-environment jsdom
 *
 * Unit tests — SyncMigrationWizard
 *
 * The component is stateful but fully testable via the injected fetchLegacyData prop.
 * Every phase is exercised by controlling what fetchLegacyData resolves/rejects with
 * and what onProgress callbacks it fires — no real native calls needed.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom/vitest';
import React from 'react';

// ---------------------------------------------------------------------------
// i18n mock — force English so assertions are language-independent
// ---------------------------------------------------------------------------
import enTranslations from '../i18n/locales/en.json';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => {
      // Handle flat dot-notation keys (e.g. "sync_wizard.preparing_title")
      // as well as nested objects
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const flat = (enTranslations as any)[key];
      if (typeof flat === 'string') return flat;
      // fallback: try nested traversal
      const parts = key.split('.');
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let value: any = enTranslations;
      for (const part of parts) {
        if (value && typeof value === 'object' && part in value) {
          value = value[part];
        } else {
          return key;
        }
      }
      return typeof value === 'string' ? value : key;
    },
    i18n: { language: 'en', changeLanguage: vi.fn() },
  }),
  initReactI18next: { type: '3rdParty', init: vi.fn() },
}));

import { SyncMigrationWizard } from '@/components/SyncMigrationWizard';
import type { FetchLegacyDataFn, ImportSummary, MigrationError } from '@/components/SyncMigrationWizard';
import type { MigrationResult } from '@budget/core';

// ---------------------------------------------------------------------------
// Shared fixtures
// ---------------------------------------------------------------------------

const MOCK_SUMMARY: ImportSummary = {
  accounts: 2,
  categories: 5,
  balances: 10,
  recurringEntries: 3,
  savingGoals: 1,
  templates: 4,
};

const MOCK_RESULT: MigrationResult = {
  success: true,
  imported: {
    accounts: 2,
    transactions: 10,
    categories: 5,
    limits: 0,
    templates: 4,
    recurringItems: 3,
    savingsGoals: 1,
  },
  importedAccountIds: ['acc-1'],
  importedAccounts: [],
  skippedAccounts: 0,
  skippedAccountIds: [],
  skippedTemplates: 0,
  skippedTemplateReasons: [],
  permanentlySkippedTemplates: 0,
  warnings: [],
  errors: [],
  retryCount: 0,
  pushed: { records: 0, accounts: 0 },
};

const MOCK_ERROR: MigrationError = {
  message: 'Failed to fetch data from the server.',
  code: 'ERR_FETCH_500',
};

// ---------------------------------------------------------------------------
// fetchLegacyData factories
// ---------------------------------------------------------------------------

/** Resolves immediately with a successful result, no progress callbacks */
const makeSuccessFetch = (result = MOCK_RESULT): FetchLegacyDataFn =>
  vi.fn().mockResolvedValue(result);

/** Rejects immediately */
const makeFailFetch = (message = MOCK_ERROR.message): FetchLegacyDataFn =>
  vi.fn().mockRejectedValue(new Error(message));

/** Hangs forever — useful for testing the preparing phase */
const makeHangingFetch = (): FetchLegacyDataFn =>
  vi.fn().mockReturnValue(new Promise(() => {}));

// ---------------------------------------------------------------------------
// Render helper
// ---------------------------------------------------------------------------

const renderWizard = (
  fetchLegacyData: FetchLegacyDataFn,
  overrides: {
    onComplete?: (result: MigrationResult) => void;
    onSkip?: () => void;
    appVersion?: string;
    platform?: string;
    supportEmail?: string;
  } = {},
) => {
  const props = {
    fetchLegacyData,
    onComplete: overrides.onComplete ?? vi.fn(),
    onSkip: overrides.onSkip ?? vi.fn(),
    appVersion: overrides.appVersion ?? '1.0.0',
    platform: overrides.platform ?? 'web',
    supportEmail: overrides.supportEmail ?? 'support@test.app',
  };
  return render(<SyncMigrationWizard {...props} />);
};

// ---------------------------------------------------------------------------
// Suite
// ---------------------------------------------------------------------------

describe('SyncMigrationWizard', () => {
  beforeEach(() => {
    vi.spyOn(window.history, 'pushState').mockImplementation(() => {});
    vi.spyOn(window, 'addEventListener');
    vi.spyOn(window, 'removeEventListener');
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  // =========================================================================
  // Phase: preparing
  // =========================================================================

  describe('preparing phase', () => {
    it('renders the preparing title on mount', () => {
      renderWizard(makeHangingFetch());
      expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent('Getting Ready');
    });

    it('shows the indeterminate spinner', () => {
      renderWizard(makeHangingFetch());
      expect(document.querySelector('svg.animate-spin')).toBeInTheDocument();
    });

    it('shows the preparing description text', () => {
      renderWizard(makeHangingFetch());
      expect(screen.getByTestId('sync-wizard-preparing-text')).toHaveTextContent(
        'Checking whether there is existing data on this device…',
      );
    });

    it('preparing text has aria-live="polite"', () => {
      renderWizard(makeHangingFetch());
      expect(screen.getByTestId('sync-wizard-preparing-text')).toHaveAttribute(
        'aria-live',
        'polite',
      );
    });
  });

  // =========================================================================
  // Phase: importing — driven by onProgress callbacks
  // =========================================================================

  describe('importing phase', () => {
    it('transitions to importing when fetchLegacyData fires FETCHING', async () => {
      const fetch: FetchLegacyDataFn = vi.fn((onProgress) => {
        onProgress({ step: 'FETCHING', entity: 'balances' });
        return new Promise<MigrationResult>(() => {});
      });

      renderWizard(fetch);

      await waitFor(() =>
        expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent('Importing Your Data'),
      );
    });

    it('shows the current entity and counts via IMPORTING_ENTITY', async () => {
      const fetch: FetchLegacyDataFn = vi.fn((onProgress) => {
        onProgress({ step: 'IMPORTING_ENTITY', entity: 'balances', current: 3, total: 10 });
        return new Promise<MigrationResult>(() => {});
      });

      renderWizard(fetch);

      await waitFor(() => {
        const text = screen.getByTestId('sync-wizard-progress-text');
        expect(text).toHaveTextContent('balances');
        expect(text).toHaveTextContent('3');
        expect(text).toHaveTextContent('10');
      });
    });

    it('progress text has aria-live="polite"', async () => {
      const fetch: FetchLegacyDataFn = vi.fn((onProgress) => {
        onProgress({ step: 'FETCHING', entity: 'accounts' });
        return new Promise<MigrationResult>(() => {});
      });

      renderWizard(fetch);

      await waitFor(() =>
        expect(screen.getByTestId('sync-wizard-progress-text')).toHaveAttribute('aria-live', 'polite'),
      );
    });

    it('renders a determinate progress bar', async () => {
      const fetch: FetchLegacyDataFn = vi.fn((onProgress) => {
        onProgress({ step: 'FETCHING', entity: 'accounts' });
        return new Promise<MigrationResult>(() => {});
      });

      renderWizard(fetch);

      await waitFor(() =>
        expect(screen.getByRole('progressbar')).toBeInTheDocument(),
      );
    });
  });

  // =========================================================================
  // Phase: complete
  // =========================================================================

  describe('complete phase', () => {
    it('transitions to complete when fetchLegacyData resolves', async () => {
      renderWizard(makeSuccessFetch());

      await waitFor(() =>
        expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent('All Done'),
      );
    });

    it('shows per-entity counts from the result', async () => {
      renderWizard(makeSuccessFetch());

      await waitFor(() => {
        expect(screen.getByTestId('sync-wizard-count-accounts')).toHaveTextContent('2');
        expect(screen.getByTestId('sync-wizard-count-categories')).toHaveTextContent('5');
        expect(screen.getByTestId('sync-wizard-count-balances')).toHaveTextContent('10');
        expect(screen.getByTestId('sync-wizard-count-recurringEntries')).toHaveTextContent('3');
        expect(screen.getByTestId('sync-wizard-count-savingGoals')).toHaveTextContent('1');
        expect(screen.getByTestId('sync-wizard-count-templates')).toHaveTextContent('4');
      });
    });

    it('summary container has aria-live="polite"', async () => {
      renderWizard(makeSuccessFetch());

      await waitFor(() =>
        expect(screen.getByTestId('sync-wizard-summary')).toHaveAttribute('aria-live', 'polite'),
      );
    });

    it('calls onComplete with the result when "Let\'s go →" is clicked', async () => {
      const onComplete = vi.fn();
      renderWizard(makeSuccessFetch(), { onComplete });

      await waitFor(() => expect(screen.getByTestId('sync-wizard-lets-go')).toBeInTheDocument());
      await userEvent.click(screen.getByTestId('sync-wizard-lets-go'));

      expect(onComplete).toHaveBeenCalledOnce();
      expect(onComplete).toHaveBeenCalledWith(MOCK_RESULT);
    });

    it('shows "Let\'s go →" CTA button', async () => {
      renderWizard(makeSuccessFetch());

      await waitFor(() =>
        expect(screen.getByTestId('sync-wizard-lets-go')).toBeInTheDocument(),
      );
    });
  });

  // =========================================================================
  // Phase: error
  // =========================================================================

  describe('error phase', () => {
    it('transitions to error when fetchLegacyData rejects', async () => {
      renderWizard(makeFailFetch());

      await waitFor(() =>
        expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent('Something Went Wrong'),
      );
    });

    it('shows the human-readable error message', async () => {
      renderWizard(makeFailFetch(MOCK_ERROR.message));

      await waitFor(() =>
        expect(screen.getByTestId('sync-wizard-error-box')).toHaveTextContent(
          'Failed to fetch data from the server.',
        ),
      );
    });

    it('error box has role="alert" and aria-live="assertive"', async () => {
      renderWizard(makeFailFetch());

      await waitFor(() => {
        const box = screen.getByTestId('sync-wizard-error-box');
        expect(box).toHaveAttribute('role', 'alert');
        expect(box).toHaveAttribute('aria-live', 'assertive');
      });
    });

    it('re-runs fetchLegacyData when "Try again" is clicked', async () => {
      const fetch = makeFailFetch();
      renderWizard(fetch);

      await waitFor(() => expect(screen.getByTestId('sync-wizard-retry')).toBeInTheDocument());
      await userEvent.click(screen.getByTestId('sync-wizard-retry'));

      expect(fetch).toHaveBeenCalledTimes(2);
    });

    it('"Contact support" renders a pre-filled mailto link', async () => {
      renderWizard(
        makeFailFetch(MOCK_ERROR.message),
        { appVersion: '2.1.0', platform: 'ios', supportEmail: 'help@test.app' },
      );

      await waitFor(() => expect(screen.getByTestId('sync-wizard-contact-support')).toBeInTheDocument());

      const href = screen.getByTestId('sync-wizard-contact-support').getAttribute('href') ?? '';
      expect(href).toMatch(/^mailto:help@test\.app/);
      expect(href).toContain('2.1.0');
      expect(href).toContain('ios');
    });

    it('does NOT show "Skip" before 3 retries', async () => {
      renderWizard(makeFailFetch());

      await waitFor(() => expect(screen.getByTestId('sync-wizard-retry')).toBeInTheDocument());
      expect(screen.queryByTestId('sync-wizard-skip')).not.toBeInTheDocument();
    });

    it('does NOT show data-loss warning before 3 retries', async () => {
      renderWizard(makeFailFetch());

      await waitFor(() => expect(screen.getByTestId('sync-wizard-retry')).toBeInTheDocument());
      expect(screen.queryByTestId('sync-wizard-skip-warning')).not.toBeInTheDocument();
    });

    it('shows "Skip" only after 3 failed retries', async () => {
      const fetch = makeFailFetch();
      renderWizard(fetch);

      // Retry 3 times
      for (let i = 0; i < 3; i++) {
        await waitFor(() => expect(screen.getByTestId('sync-wizard-retry')).toBeInTheDocument());
        await act(async () => {
          await userEvent.click(screen.getByTestId('sync-wizard-retry'));
        });
      }

      await waitFor(() =>
        expect(screen.getByTestId('sync-wizard-skip')).toBeInTheDocument(),
      );
    });

    it('shows data-loss warning banner alongside "Skip" after 3 retries', async () => {
      const fetch = makeFailFetch();
      renderWizard(fetch);

      for (let i = 0; i < 3; i++) {
        await waitFor(() => expect(screen.getByTestId('sync-wizard-retry')).toBeInTheDocument());
        await act(async () => {
          await userEvent.click(screen.getByTestId('sync-wizard-retry'));
        });
      }

      await waitFor(() =>
        expect(screen.getByTestId('sync-wizard-skip-warning')).toBeInTheDocument(),
      );
    });

    it('calls onSkip when "Skip" is clicked after 3 retries', async () => {
      const onSkip = vi.fn();
      const fetch = makeFailFetch();
      renderWizard(fetch, { onSkip });

      for (let i = 0; i < 3; i++) {
        await waitFor(() => expect(screen.getByTestId('sync-wizard-retry')).toBeInTheDocument());
        await act(async () => {
          await userEvent.click(screen.getByTestId('sync-wizard-retry'));
        });
      }

      await waitFor(() => expect(screen.getByTestId('sync-wizard-skip')).toBeInTheDocument());
      await userEvent.click(screen.getByTestId('sync-wizard-skip'));

      expect(onSkip).toHaveBeenCalledOnce();
    });
  });

  // =========================================================================
  // Back / swipe prevention
  // =========================================================================

  describe('back/swipe prevention', () => {
    it('pushes a history entry on mount to block back navigation', () => {
      renderWizard(makeHangingFetch());
      expect(window.history.pushState).toHaveBeenCalledWith({ syncWizardLock: true }, '');
    });

    it('registers a popstate listener while active', () => {
      renderWizard(makeHangingFetch());
      expect(window.addEventListener).toHaveBeenCalledWith('popstate', expect.any(Function));
    });

    it('removes the popstate listener on unmount', () => {
      const { unmount } = renderWizard(makeHangingFetch());
      unmount();
      expect(window.removeEventListener).toHaveBeenCalledWith('popstate', expect.any(Function));
    });

    it('does not push history lock when migration completes', async () => {
      vi.mocked(window.history.pushState).mockClear();
      renderWizard(makeSuccessFetch());

      await waitFor(() => expect(screen.getByTestId('sync-wizard-lets-go')).toBeInTheDocument());

      // pushState was called on mount (preparing phase), but not again after complete
      // The key assertion: the lock is released (no new pushState after complete)
      const callsAfterComplete = vi.mocked(window.history.pushState).mock.calls.filter(
        (c) => c[0]?.syncWizardLock,
      );
      // Only the initial mount call — no re-lock after complete
      expect(callsAfterComplete.length).toBeLessThanOrEqual(1);
    });
  });

  // =========================================================================
  // Accessibility
  // =========================================================================

  describe('accessibility', () => {
    it('has role="region" with aria-labelledby pointing to the heading', () => {
      renderWizard(makeHangingFetch());
      const region = screen.getByTestId('sync-migration-wizard');
      expect(region).toHaveAttribute('role', 'region');
      expect(region).toHaveAttribute('aria-labelledby', 'sync-wizard-heading');
      expect(document.getElementById('sync-wizard-heading')).toBeInTheDocument();
    });
  });

  // =========================================================================
  // Injectability — fetchLegacyData is the only external dependency
  // =========================================================================

  describe('injectability', () => {
    it('calls fetchLegacyData on mount', () => {
      const fetch = makeHangingFetch();
      renderWizard(fetch);
      expect(fetch).toHaveBeenCalledOnce();
    });

    it('passes an onProgress callback to fetchLegacyData', () => {
      const fetch = makeHangingFetch();
      renderWizard(fetch);
      expect(fetch).toHaveBeenCalledWith(expect.any(Function));
    });
  });
});
