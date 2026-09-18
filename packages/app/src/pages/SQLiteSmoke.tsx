import React, { useEffect, useState } from 'react';
import { Capacitor } from '@capacitor/core';
import { CapacitorSQLite, SQLiteConnection } from '@capacitor-community/sqlite';
import {
  closeConnection,
  openReadOnly,
  prepareiOSDatabases,
  readCoreDataEntities,
  type MigrationPayload,
  type PrepareiOSDatabasesResult,
} from '@budget/core';

const sqlite = new SQLiteConnection(CapacitorSQLite);
const SMOKE_DB_NAME = 'sqlite_smoke_test';
const EXPECTED_VALUES = [{ '1': 1 }];

type SmokeStatus = 'idle' | 'running' | 'passed' | 'failed' | 'unsupported';

type SmokeState = {
  status: SmokeStatus;
  message: string;
  values: unknown[];
};

type CoreDataSmokeState = {
  status: SmokeStatus;
  message: string;
  setup?: PrepareiOSDatabasesResult;
  counts?: Record<string, number>;
  sample?: Record<string, unknown>;
};

function countPayload(payload: Partial<MigrationPayload>): Record<string, number> {
  return {
    accounts: payload.accounts?.length ?? 0,
    categories: payload.categories?.length ?? 0,
    transactions: payload.transactions?.length ?? 0,
    limits: payload.limits?.length ?? 0,
    recurringEntries: payload.recurringEntries?.length ?? 0,
    savingGoals: payload.savingGoals?.length ?? 0,
    templates: payload.templates?.length ?? 0,
  };
}

function samplePayload(payload: Partial<MigrationPayload>): Record<string, unknown> {
  return {
    account: payload.accounts?.[0],
    category: payload.categories?.[0],
    transaction: payload.transactions?.[0],
    limit: payload.limits?.[0],
    recurringEntry: payload.recurringEntries?.[0],
    savingGoal: payload.savingGoals?.[0],
    template: payload.templates?.[0],
  };
}

async function ensureSmokeDatabaseExists(): Promise<void> {
  const hasConnection = (await sqlite.isConnection(SMOKE_DB_NAME, false)).result;
  // Bootstrap the database file with a temporary RW connection.
  // The actual smoke test then validates the real migration path by creating
  // a separate RO connection via openReadOnly().
  const connection = hasConnection
    ? await sqlite.retrieveConnection(SMOKE_DB_NAME, false)
    : await sqlite.createConnection(SMOKE_DB_NAME, false, 'no-encryption', 1, false);

  await connection.open();

  try {
    await connection.query('SELECT 1');
  } finally {
    await sqlite.closeConnection(SMOKE_DB_NAME, false);
  }
}

async function executeSmokeTest(platform: string): Promise<SmokeState> {
  const isNativePlatform = platform === 'android' || platform === 'ios';

  if (!isNativePlatform) {
    return {
      status: 'unsupported',
      message: `SQLite smoke test is only available on native builds. Current platform: ${platform}.`,
      values: [],
    };
  }

  try {
    await ensureSmokeDatabaseExists();

    const { connection } = await openReadOnly(SMOKE_DB_NAME);

    try {
      const result = await connection.query('SELECT 1');
      const values = result.values ?? [];
      const matchesExpectation = JSON.stringify(values) === JSON.stringify(EXPECTED_VALUES);

      if (!matchesExpectation) {
        throw new Error(
          `Expected ${JSON.stringify(EXPECTED_VALUES)} but received ${JSON.stringify(values)}`
        );
      }

      return {
        status: 'passed',
        message: 'Smoke test passed.',
        values,
      };
    } finally {
      await closeConnection(SMOKE_DB_NAME);
    }
  } catch (error) {
    return {
      status: 'failed',
      message: error instanceof Error ? error.message : 'SQLite smoke test failed.',
      values: [],
    };
  }
}

async function executeCoreDataSmokeTest(platform: string): Promise<CoreDataSmokeState> {
  if (platform !== 'ios') {
    return {
      status: 'unsupported',
      message: `Core Data smoke test is only available on iOS native builds. Current platform: ${platform}.`,
    };
  }

  try {
    const setup = await prepareiOSDatabases();

    if (!setup.coreDataPresent) {
      return {
        status: 'passed',
        message: 'No Core Data database found. Empty migration path skipped successfully.',
        setup,
        counts: {},
        sample: {},
      };
    }

    const payload = await readCoreDataEntities({ legacyLimits: setup.limits });
    const counts = countPayload(payload);

    return {
      status: 'passed',
      message: `Core Data smoke test passed. Copied: ${setup.copied ? 'yes' : 'no'}.`,
      setup,
      counts,
      sample: samplePayload(payload),
    };
  } catch (error) {
    return {
      status: 'failed',
      message: error instanceof Error ? error.message : 'Core Data smoke test failed.',
    };
  }
}

const SQLiteSmoke = () => {
  const [state, setState] = useState<SmokeState>({
    status: 'idle',
    message: 'Waiting to run the native SQLite smoke test.',
    values: [],
  });
  const [coreDataState, setCoreDataState] = useState<CoreDataSmokeState>({
    status: 'idle',
    message: 'Waiting to run the iOS Core Data smoke test.',
  });

  const platform = Capacitor.getPlatform();

  const runSmokeTest = async () => {
    setState({
      status: 'running',
      message: `Preparing ${SMOKE_DB_NAME} and running SELECT 1 through openReadOnly...`,
      values: [],
    });

    setState(await executeSmokeTest(platform));
  };

  const runCoreDataSmokeTest = async () => {
    setCoreDataState({
      status: 'running',
      message: 'Preparing copied Core Data database and reading migration payload...',
    });

    setCoreDataState(await executeCoreDataSmokeTest(platform));
  };

  useEffect(() => {
    setState({
      status: 'running',
      message: `Preparing ${SMOKE_DB_NAME} and running SELECT 1 through openReadOnly...`,
      values: [],
    });

    void executeSmokeTest(platform).then(setState);
    if (platform === 'ios') {
      setCoreDataState({
        status: 'running',
        message: 'Preparing copied Core Data database and reading migration payload...',
      });
      void executeCoreDataSmokeTest(platform).then(setCoreDataState);
    }
  }, [platform]);

  return (
    <div className="min-h-screen bg-budget-dark px-4 py-8 text-white">
      <div className="mx-auto max-w-3xl space-y-6">
        <div className="rounded-2xl border border-white/10 bg-white/5 p-6 shadow-2xl">
          <div className="mb-6">
            <p className="text-xs uppercase tracking-[0.24em] text-white/50">SQLite Smoke Test</p>
            <h1 className="mt-2 text-2xl font-semibold">Native migration DB check</h1>
            <p className="mt-3 text-sm text-white/70">
              This hidden screen verifies the Capacitor SQLite plugin is registered and that the
              migration helper can open a read-only connection and execute <code>SELECT 1</code>.
            </p>
          </div>

          <div className="space-y-3 rounded-xl bg-black/20 p-4 text-sm">
            <p>
              <span className="text-white/50">Platform:</span> {platform}
            </p>
            <p>
              <span className="text-white/50">Database:</span> {SMOKE_DB_NAME}
            </p>
            <p>
              <span className="text-white/50">Expected result:</span> {JSON.stringify(EXPECTED_VALUES)}
            </p>
            <p data-testid="sqlite-smoke-status">
              <span className="text-white/50">Status:</span> {state.status}
            </p>
            <p data-testid="sqlite-smoke-message" className="break-words text-white/80">
              {state.message}
            </p>
            <pre
              data-testid="sqlite-smoke-values"
              className="overflow-x-auto rounded-lg bg-black/30 p-3 text-xs text-emerald-200"
            >
              {JSON.stringify(state.values, null, 2)}
            </pre>
          </div>

          <button
            type="button"
            onClick={() => void runSmokeTest()}
            className="mt-6 rounded-lg bg-budget-blue px-4 py-3 text-sm font-semibold text-white transition hover:bg-budget-blue/90"
          >
            Run smoke test again
          </button>
        </div>

        <div className="rounded-2xl border border-white/10 bg-white/5 p-6 shadow-2xl">
          <div className="mb-6">
            <p className="text-xs uppercase tracking-[0.24em] text-white/50">iOS Core Data Smoke Test</p>
            <h2 className="mt-2 text-2xl font-semibold">Legacy Core Data migration check</h2>
            <p className="mt-3 text-sm text-white/70">
              This panel runs the native iOS database setup and reads the seeded
              <code> D_in_Plus.sqlite</code> migration payload.
            </p>
          </div>

          <div className="space-y-3 rounded-xl bg-black/20 p-4 text-sm">
            <p data-testid="coredata-smoke-status">
              <span className="text-white/50">Status:</span> {coreDataState.status}
            </p>
            <p data-testid="coredata-smoke-message" className="break-words text-white/80">
              {coreDataState.message}
            </p>
            <p>
              <span className="text-white/50">Core Data present:</span>{' '}
              {coreDataState.setup ? String(coreDataState.setup.coreDataPresent) : 'unknown'}
            </p>
            <p>
              <span className="text-white/50">Copied:</span>{' '}
              {coreDataState.setup ? String(coreDataState.setup.copied) : 'unknown'}
            </p>
            <p>
              <span className="text-white/50">Native limits:</span>{' '}
              {coreDataState.setup?.limits.length ?? 0}
            </p>
            {coreDataState.setup?.error ? (
              <p className="break-words text-budget-red">
                <span className="text-white/50">Setup error:</span> {coreDataState.setup.error}
              </p>
            ) : null}
            {coreDataState.setup?.limitsError ? (
              <p className="break-words text-budget-red">
                <span className="text-white/50">Limits error:</span> {coreDataState.setup.limitsError}
              </p>
            ) : null}
            <pre
              data-testid="coredata-smoke-counts"
              className="overflow-x-auto rounded-lg bg-black/30 p-3 text-xs text-emerald-200"
            >
              {JSON.stringify(coreDataState.counts ?? {}, null, 2)}
            </pre>
            <pre
              data-testid="coredata-smoke-sample"
              className="max-h-80 overflow-x-auto rounded-lg bg-black/30 p-3 text-xs text-emerald-200"
            >
              {JSON.stringify(coreDataState.sample ?? {}, null, 2)}
            </pre>
          </div>

          <button
            type="button"
            onClick={() => void runCoreDataSmokeTest()}
            className="mt-6 rounded-lg bg-budget-blue px-4 py-3 text-sm font-semibold text-white transition hover:bg-budget-blue/90"
          >
            Run Core Data smoke test again
          </button>
        </div>
      </div>
    </div>
  );
};

export default SQLiteSmoke;
