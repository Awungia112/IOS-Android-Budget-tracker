import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { LocalMigrationVerificationResult } from '@budget/core';

const mocks = vi.hoisted(() => ({
  resolveLocalMigrationVerification: vi.fn(),
  captureMessage: vi.fn(),
}));

vi.mock('@budget/core', () => ({
  resolveLocalMigrationVerification: mocks.resolveLocalMigrationVerification,
}));

vi.mock('@sentry/capacitor', () => ({
  captureMessage: mocks.captureMessage,
}));

import { checkForSkippedLocalMigration } from './migrationVerification.js';

const partialResult: LocalMigrationVerificationResult = {
  classification: 'partial',
  accounts: [
    {
      accountId: 'acc-1',
      status: 'partial',
      details: [{ entity: 'transactions', legacyCount: 2, lastElementPresent: false }],
    },
  ],
};

beforeEach(() => {
  mocks.resolveLocalMigrationVerification.mockReset();
  mocks.captureMessage.mockReset();
});

describe('checkForSkippedLocalMigration', () => {
  it('passes an anomaly-reporter callback through to resolveLocalMigrationVerification and returns its outcome', async () => {
    mocks.resolveLocalMigrationVerification.mockImplementation(async () => 'remediate');

    const outcome = await checkForSkippedLocalMigration();

    expect(outcome).toBe('remediate');
    expect(mocks.resolveLocalMigrationVerification).toHaveBeenCalledWith(expect.any(Function));
  });

  it('reports only classification and per-entity counts to Sentry on a partial anomaly — no account ids, titles, or amounts', async () => {
    mocks.resolveLocalMigrationVerification.mockImplementation(async (onAnomalyDetected: (r: LocalMigrationVerificationResult) => void) => {
      onAnomalyDetected(partialResult);
      return 'none';
    });

    await checkForSkippedLocalMigration();

    expect(mocks.captureMessage).toHaveBeenCalledTimes(1);
    const [message, context] = mocks.captureMessage.mock.calls[0];
    expect(message).toBe('local_migration_verification_anomaly');
    expect(context.extra).toEqual({
      classification: 'partial',
      accounts: [
        {
          status: 'partial',
          entities: [{ entity: 'transactions', legacyCount: 2, lastElementPresent: false }],
        },
      ],
    });
    // No accountId anywhere in the reported payload.
    expect(JSON.stringify(context.extra)).not.toContain('acc-1');
  });

  it('never throws and returns none when the underlying check fails', async () => {
    mocks.resolveLocalMigrationVerification.mockRejectedValue(new Error('native bridge unavailable'));

    const outcome = await checkForSkippedLocalMigration();

    expect(outcome).toBe('none');
  });
});
