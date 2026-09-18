import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { successfulLocalMigrationResult } from '@/test-utils/localMigration';
import { LocalMigrationGate } from './LocalMigrationGate';
import { useTranslation } from 'react-i18next';

import i18n from 'i18next';

const mocks = vi.hoisted(() => ({
  platform: 'ios',
  isMigrationDone: vi.fn(),
  runMigration: vi.fn(),
  fetchLegacyData: vi.fn(),
  wasMigrationSkipped: vi.fn(),
  shouldAttemptSkipRetry: vi.fn(),
  markMigrationSkipped: vi.fn(),
  resetMigrationFlag: vi.fn(),
  checkForSkippedLocalMigration: vi.fn(),
}));

vi.mock('@capacitor/core', () => ({
  Capacitor: {
    getPlatform: vi.fn(() => mocks.platform),
  },
}));

vi.mock('@budget/core', async () => {
  const { createEmptyMigrationResult } =
    await import('../../../core/src/migration/migration-result');

  return {
    createEmptyMigrationResult,
    isMigrationDone: mocks.isMigrationDone,
    runMigration: mocks.runMigration,
    fetchLegacyData: mocks.fetchLegacyData,
    markMigrationDone: vi.fn().mockResolvedValue(undefined),
    markMigrationSkipped: mocks.markMigrationSkipped,
    wasMigrationSkipped: mocks.wasMigrationSkipped,
    shouldAttemptSkipRetry: mocks.shouldAttemptSkipRetry,
    resetMigrationFlag: mocks.resetMigrationFlag,
  };
});

vi.mock('@/lib/migrationVerification', () => ({
  checkForSkippedLocalMigration: mocks.checkForSkippedLocalMigration,
}));

vi.mock('@/services/budgetServiceInstance', () => ({
  budgetService: {
    initializeDatabase: vi.fn(),
    importData: vi.fn(),
    deleteAccount: vi.fn(),
    getRecurringItemsByAccountId: vi.fn(),
    reconcileRecurring: vi.fn(),
  },
}));

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

const service = {
  initializeDatabase: vi.fn(),
  importData: vi.fn(),
  deleteAccount: vi.fn(),
  getRecurringItemsByAccountId: vi.fn(),
  reconcileRecurring: vi.fn(),
};

const successResult = successfulLocalMigrationResult();

const nonEmptyPayload = {
  schemaVersion: 1 as const,
  exportedAt: new Date().toISOString(),
  platform: 'ios' as const,
  accounts: [{ id: 'a1', name: 'Test' }],
  categories: [],
  transactions: [{ id: 't1' }],
  limits: [],
  recurringEntries: [],
  savingGoals: [],
  templates: [],
};

describe('LocalMigrationGate', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('en');
    mocks.platform = 'ios';
    mocks.isMigrationDone.mockReset();
    mocks.runMigration.mockReset();
    mocks.fetchLegacyData.mockReset();
    mocks.wasMigrationSkipped.mockReset();
    mocks.shouldAttemptSkipRetry.mockReset();
    mocks.markMigrationSkipped.mockReset();
    mocks.resetMigrationFlag.mockReset();
    mocks.checkForSkippedLocalMigration.mockReset();
    mocks.isMigrationDone.mockResolvedValue(true);
    mocks.runMigration.mockResolvedValue(successResult);
    mocks.wasMigrationSkipped.mockResolvedValue(false);
    mocks.shouldAttemptSkipRetry.mockResolvedValue(false);
    mocks.markMigrationSkipped.mockResolvedValue(undefined);
    mocks.resetMigrationFlag.mockResolvedValue(undefined);
    // Default: verification finds nothing to remediate (genuine successful
    // migration, or nothing to migrate at all).
    mocks.checkForSkippedLocalMigration.mockResolvedValue('none');
    // Default: empty payload (fresh install) — all arrays empty
    mocks.fetchLegacyData.mockResolvedValue({
      schemaVersion: 1,
      exportedAt: new Date().toISOString(),
      platform: 'ios',
      accounts: [],
      categories: [],
      transactions: [],
      limits: [],
      recurringEntries: [],
      savingGoals: [],
      templates: [],
    });
    localStorage.clear();
  });

  it('renders children immediately on web without checking the native flag', async () => {
    mocks.platform = 'web';

    render(
      <LocalMigrationGate service={service}>
        <div data-testid="app-routes">Routes</div>
      </LocalMigrationGate>,
    );

    await waitFor(() => expect(screen.getByTestId('app-routes')).toBeInTheDocument());
    expect(mocks.isMigrationDone).not.toHaveBeenCalled();
    expect(mocks.runMigration).not.toHaveBeenCalled();
  });

  it('blocks route children while checking the migration flag', async () => {
    const pendingCheck = deferred<boolean>();
    mocks.isMigrationDone.mockReturnValue(pendingCheck.promise);

    render(
      <LocalMigrationGate service={service}>
        <div data-testid="app-routes">Routes</div>
      </LocalMigrationGate>,
    );

    // While checking, the gate shows the wrapper (no wizard yet — gateStatus is 'checking')
    expect(screen.queryByTestId('app-routes')).not.toBeInTheDocument();

    pendingCheck.resolve(true);
    await waitFor(() => expect(screen.getByTestId('app-routes')).toBeInTheDocument());
  });

  it('renders children when the migration flag is already set', async () => {
    mocks.isMigrationDone.mockResolvedValue(true);

    render(
      <LocalMigrationGate service={service}>
        <div data-testid="app-routes">Routes</div>
      </LocalMigrationGate>,
    );

    await waitFor(() => expect(screen.getByTestId('app-routes')).toBeInTheDocument());
    expect(mocks.runMigration).not.toHaveBeenCalled();
  });

  it('shows the wizard and passes fetchLegacyData when migration is needed', async () => {
    mocks.isMigrationDone.mockResolvedValue(false);
    // fetchLegacyData (payload check) returns data — wizard should show
    mocks.fetchLegacyData.mockResolvedValue({
      schemaVersion: 1,
      exportedAt: new Date().toISOString(),
      platform: 'ios',
      accounts: [{ id: 'a1', name: 'Test' }],
      categories: [],
      transactions: [{ id: 't1' }],
      limits: [],
      recurringEntries: [],
      savingGoals: [],
      templates: [],
    });

    render(
      <LocalMigrationGate service={service}>
        <div data-testid="app-routes">Routes</div>
      </LocalMigrationGate>,
    );

    // Wizard mounts and calls runMigration via the injected fetchLegacyData prop
    await waitFor(() => expect(screen.getByTestId('sync-migration-wizard')).toBeInTheDocument());
    expect(screen.queryByTestId('app-routes')).not.toBeInTheDocument();
    await waitFor(() =>
      expect(mocks.runMigration).toHaveBeenCalledWith(service, expect.any(Function)),
    );
  });

  it('renders children after migration completes and user clicks "Let\'s go →"', async () => {
    const user = userEvent.setup();
    mocks.isMigrationDone.mockResolvedValue(false);
    mocks.fetchLegacyData.mockResolvedValue(nonEmptyPayload);
    mocks.runMigration.mockResolvedValue(successResult);

    render(
      <LocalMigrationGate service={service}>
        <div data-testid="app-routes">Routes</div>
      </LocalMigrationGate>,
    );

    await waitFor(() => expect(screen.getByTestId('sync-wizard-lets-go')).toBeInTheDocument());
    expect(screen.queryByTestId('app-routes')).not.toBeInTheDocument();

    await user.click(screen.getByTestId('sync-wizard-lets-go'));

    await waitFor(() => expect(screen.getByTestId('app-routes')).toBeInTheDocument());
    expect(localStorage.getItem('currentAccountId')).toBe('account-1');
  });

  it('renders children automatically when a fresh native install has no legacy data', async () => {
    mocks.isMigrationDone.mockResolvedValue(false);
    // fetchLegacyData returns empty payload (fresh install)
    // mocks.fetchLegacyData already returns empty payload from beforeEach

    render(
      <LocalMigrationGate service={service}>
        <div data-testid="app-routes">Routes</div>
      </LocalMigrationGate>,
    );

    await waitFor(() => expect(screen.getByTestId('app-routes')).toBeInTheDocument());
    expect(screen.queryByTestId('sync-migration-wizard')).not.toBeInTheDocument();
    // initializeDatabase must be called so BudgetContext can start on fresh install
    expect(service.initializeDatabase).toHaveBeenCalled();
    expect(localStorage.getItem('currentAccountId')).toBeNull();
  });

  it('does not reapply the theme class when an unrelated storage key changes (e.g. migration dismissal)', async () => {
    // Regression for ticket #349: dismissing the migration banner dispatches
    // a synthetic 'storage' event with the migration key. LocalMigrationGate
    // used to reapply the theme class on every storage event, briefly
    // overwriting Layout's light class with the system/dark theme.
    mocks.platform = 'web';

    // Reproduce the desync: budget-wise-theme is unset (so resolution falls
    // back to the system preference) but the OS prefers dark, while Layout —
    // reading its own `darkMode` flag — keeps the user in light mode.
    localStorage.removeItem('budget-wise-theme');
    const matchMediaSpy = vi
      .spyOn(window, 'matchMedia')
      .mockImplementation((query: string) => ({
        matches: query === '(prefers-color-scheme: dark)',
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      }));

    const { unmount } = render(
      <LocalMigrationGate service={service}>
        <div data-testid="app-routes">Routes</div>
      </LocalMigrationGate>,
    );

    await waitFor(() => expect(screen.getByTestId('app-routes')).toBeInTheDocument());

    // Mirror Layout's mount effect: it runs after the gate's mount effect
    // and resets the documentElement to the user's explicit light choice.
    document.documentElement.classList.remove('dark', 'light');
    document.documentElement.classList.add('light');

    // Simulate "Don't remind me again" — synthetic storage event for the
    // migration banner dismissed key (NOT the theme key).
    window.dispatchEvent(
      new StorageEvent('storage', { key: 'migration_banner_dismissed_account-1' }),
    );

    expect(document.documentElement.classList.contains('light')).toBe(true);
    expect(document.documentElement.classList.contains('dark')).toBe(false);

    // Sanity check: an actual theme change in another tab still re-applies.
    localStorage.setItem('budget-wise-theme', 'dark');
    window.dispatchEvent(new StorageEvent('storage', { key: 'budget-wise-theme' }));
    expect(document.documentElement.classList.contains('dark')).toBe(true);

    matchMediaSpy.mockRestore();
    unmount();
  });

  it('renders children when user skips after repeated failures', async () => {
    const user = userEvent.setup();
    mocks.isMigrationDone.mockResolvedValue(false);
    mocks.fetchLegacyData.mockResolvedValue(nonEmptyPayload);
    mocks.runMigration.mockRejectedValue(new Error('DB write failed'));

    render(
      <LocalMigrationGate service={service}>
        <div data-testid="app-routes">Routes</div>
      </LocalMigrationGate>,
    );

    // Retry 3 times to unlock Skip
    for (let i = 0; i < 3; i++) {
      await waitFor(() => expect(screen.getByTestId('sync-wizard-retry')).toBeInTheDocument());
      await user.click(screen.getByTestId('sync-wizard-retry'));
    }

    await waitFor(() => expect(screen.getByTestId('sync-wizard-skip')).toBeInTheDocument());
    await user.click(screen.getByTestId('sync-wizard-skip'));

    await waitFor(() => expect(screen.getByTestId('app-routes')).toBeInTheDocument());
    // Skip must be tracked distinctly from a genuine successful/empty
    // migration so the gate can auto-retry it later (see tests below).
    expect(mocks.markMigrationSkipped).toHaveBeenCalled();
  });

  it('auto-retries migration when a prior Skip left a pending-retry marker', async () => {
    // Migration was previously marked done via Skip. wasMigrationSkipped()
    // and shouldAttemptSkipRetry() both say "yes, try again this launch."
    mocks.isMigrationDone.mockResolvedValue(true);
    mocks.wasMigrationSkipped.mockResolvedValue(true);
    mocks.shouldAttemptSkipRetry.mockResolvedValue(true);
    mocks.fetchLegacyData.mockResolvedValue(nonEmptyPayload);

    render(
      <LocalMigrationGate service={service}>
        <div data-testid="app-routes">Routes</div>
      </LocalMigrationGate>,
    );

    // Falls through past the "done" flag to re-check legacy data, finds
    // real data, and shows the wizard instead of silently passing through.
    await waitFor(() => expect(screen.getByTestId('sync-migration-wizard')).toBeInTheDocument());
    expect(screen.queryByTestId('app-routes')).not.toBeInTheDocument();
  });

  it('stops auto-retrying once shouldAttemptSkipRetry reports the retry budget is spent', async () => {
    mocks.isMigrationDone.mockResolvedValue(true);
    mocks.wasMigrationSkipped.mockResolvedValue(true);
    mocks.shouldAttemptSkipRetry.mockResolvedValue(false);

    render(
      <LocalMigrationGate service={service}>
        <div data-testid="app-routes">Routes</div>
      </LocalMigrationGate>,
    );

    await waitFor(() => expect(screen.getByTestId('app-routes')).toBeInTheDocument());
    expect(mocks.fetchLegacyData).not.toHaveBeenCalled();
    expect(mocks.runMigration).not.toHaveBeenCalled();
  });

  it('does not re-enter migration pipeline on the cold start after a genuine successful migration (regression: duplicate import bug)', async () => {
    // Regression for: successful migration on cold start N causing a silent
    // re-import on cold start N+1, duplicating all user data.
    // isMigrationDone()=true with no skip marker, and verification confirming
    // the legacy accounts already exist in Dexie ('none' — nothing to
    // remediate), must be an unconditional dead end — fetchLegacyPayload and
    // runMigration must never be called, and the flag must never be reset.
    mocks.isMigrationDone.mockResolvedValue(true);
    mocks.wasMigrationSkipped.mockResolvedValue(false);
    mocks.checkForSkippedLocalMigration.mockResolvedValue('none');
    // Source DB is never deleted — it still has real data — but the gate must
    // not reach it.
    mocks.fetchLegacyData.mockResolvedValue(nonEmptyPayload);

    render(
      <LocalMigrationGate service={service}>
        <div data-testid="app-routes">Routes</div>
      </LocalMigrationGate>,
    );

    await waitFor(() => expect(screen.getByTestId('app-routes')).toBeInTheDocument());
    expect(mocks.fetchLegacyData).not.toHaveBeenCalled();
    expect(mocks.runMigration).not.toHaveBeenCalled();
    expect(mocks.resetMigrationFlag).not.toHaveBeenCalled();
  });

  it('resets the migration flag and shows the real wizard when verification finds a pre-4.5.0 skip (skipped-unmigrated remediation)', async () => {
    // The check conclusively found real legacy accounts that never made it
    // into Dexie — nothing there for a re-import to duplicate, so the gate
    // must reset the flag and fall through to the normal payload-fetch/
    // wizard flow, exactly as on a first launch.
    mocks.isMigrationDone.mockResolvedValue(true);
    mocks.wasMigrationSkipped.mockResolvedValue(false);
    mocks.checkForSkippedLocalMigration.mockResolvedValue('remediate');
    mocks.fetchLegacyData.mockResolvedValue(nonEmptyPayload);

    render(
      <LocalMigrationGate service={service}>
        <div data-testid="app-routes">Routes</div>
      </LocalMigrationGate>,
    );

    await waitFor(() => expect(mocks.resetMigrationFlag).toHaveBeenCalled());
    await waitFor(() => expect(screen.getByTestId('sync-migration-wizard')).toBeInTheDocument());
    expect(screen.queryByTestId('app-routes')).not.toBeInTheDocument();
    await waitFor(() =>
      expect(mocks.runMigration).toHaveBeenCalledWith(service, expect.any(Function)),
    );
  });

  it('does not consult verification at all when migration is not yet done (first launch)', async () => {
    mocks.isMigrationDone.mockResolvedValue(false);
    mocks.fetchLegacyData.mockResolvedValue(nonEmptyPayload);

    render(
      <LocalMigrationGate service={service}>
        <div data-testid="app-routes">Routes</div>
      </LocalMigrationGate>,
    );

    await waitFor(() => expect(screen.getByTestId('sync-migration-wizard')).toBeInTheDocument());
    expect(mocks.checkForSkippedLocalMigration).not.toHaveBeenCalled();
  });
});
