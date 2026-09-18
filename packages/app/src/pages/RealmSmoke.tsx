import { useEffect, useState } from 'react';
import { Capacitor } from '@capacitor/core';
import {
  MigrationSetupPlugin,
  readRealmData,
  type RealmDataResult,
  type RealmMigrationPayload,
} from '@budget/core';

type SmokeStatus = 'idle' | 'running' | 'passed' | 'failed' | 'unsupported';

type SmokeState = {
  status: SmokeStatus;
  message: string;
  counts: Record<string, number>;
  sample: Record<string, unknown>;
  raw: Partial<Record<keyof RealmDataResult, number>>;
};

const emptyState: SmokeState = {
  status: 'idle',
  message: 'Waiting to run the native Realm smoke test.',
  counts: {},
  sample: {},
  raw: {},
};

function countMappedPayload(payload: RealmMigrationPayload): Record<string, number> {
  return {
    accounts: payload.accounts.length,
    categories: payload.categories.length,
    transactions: payload.transactions.length,
    limits: payload.limits.length,
    recurringEntries: payload.recurringEntries.length,
    savingGoals: payload.savingGoals.length,
    templates: payload.templates.length,
  };
}

function countRawPayload(payload: RealmDataResult): Partial<Record<keyof RealmDataResult, number>> {
  return {
    accounts: payload.accounts.length,
    balances: payload.balances.length,
    categories: payload.categories.length,
    savingGoals: payload.savingGoals.length,
    recurringBalances: payload.recurringBalances.length,
    templates: payload.templates.length,
  };
}

function sampleMappedPayload(payload: RealmMigrationPayload): Record<string, unknown> {
  return {
    account: payload.accounts[0],
    category: payload.categories[0],
    transaction: payload.transactions[0],
    limit: payload.limits[0],
    recurringEntry: payload.recurringEntries[0],
    savingGoal: payload.savingGoals[0],
    template: payload.templates[0],
  };
}

async function executeSmokeTest(platform: string): Promise<SmokeState> {
  if (platform !== 'ios') {
    return {
      ...emptyState,
      status: 'unsupported',
      message: `Realm smoke test is only available on native iOS builds. Current platform: ${platform}.`,
    };
  }

  try {
    const raw = await MigrationSetupPlugin.readRealmData();
    const mapped = await readRealmData();
    const counts = countMappedPayload(mapped);
    const total = Object.values(counts).reduce((sum, count) => sum + count, 0);

    return {
      status: 'passed',
      message: total === 0
        ? 'No Realm database found. Empty Realm migration path skipped successfully.'
        : 'Realm smoke test passed.',
      counts,
      sample: sampleMappedPayload(mapped),
      raw: countRawPayload(raw),
    };
  } catch (error) {
    return {
      ...emptyState,
      status: 'failed',
      message: error instanceof Error ? error.message : 'Realm smoke test failed.',
    };
  }
}

const RealmSmoke = () => {
  const [state, setState] = useState<SmokeState>(emptyState);
  const platform = Capacitor.getPlatform();

  const runSmokeTest = async () => {
    setState({
      ...emptyState,
      status: 'running',
      message: 'Reading native Realm payload and mapped migration payload...',
    });

    setState(await executeSmokeTest(platform));
  };

  useEffect(() => {
    setState({
      ...emptyState,
      status: 'running',
      message: 'Reading native Realm payload and mapped migration payload...',
    });

    void executeSmokeTest(platform).then(setState);
  }, [platform]);

  return (
    <div className="min-h-screen bg-budget-dark px-4 py-8 text-white">
      <div className="mx-auto max-w-2xl rounded-2xl border border-white/10 bg-white/5 p-6 shadow-2xl">
        <div className="mb-6">
          <p className="text-xs uppercase tracking-[0.24em] text-white/50">Realm Smoke Test</p>
          <h1 className="mt-2 text-2xl font-semibold">Native Realm migration check</h1>
          <p className="mt-3 text-sm text-white/70">
            This hidden screen verifies the iOS Realm bridge and the TypeScript migration reader.
          </p>
        </div>

        <div className="space-y-3 rounded-xl bg-black/20 p-4 text-sm">
          <p>
            <span className="text-white/50">Platform:</span> {platform}
          </p>
          <p data-testid="realm-smoke-status">
            <span className="text-white/50">Status:</span> {state.status}
          </p>
          <p data-testid="realm-smoke-message" className="break-words text-white/80">
            {state.message}
          </p>
          <p className="text-white/50">Mapped counts</p>
          <pre
            data-testid="realm-smoke-counts"
            className="overflow-x-auto rounded-lg bg-black/30 p-3 text-xs text-emerald-200"
          >
            {JSON.stringify(state.counts, null, 2)}
          </pre>
          <p className="text-white/50">Raw native counts</p>
          <pre
            data-testid="realm-smoke-raw"
            className="overflow-x-auto rounded-lg bg-black/30 p-3 text-xs text-sky-200"
          >
            {JSON.stringify(state.raw, null, 2)}
          </pre>
          <p className="text-white/50">Sample</p>
          <pre
            data-testid="realm-smoke-sample"
            className="overflow-x-auto rounded-lg bg-black/30 p-3 text-xs text-emerald-200"
          >
            {JSON.stringify(state.sample, null, 2)}
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
    </div>
  );
};

export default RealmSmoke;
