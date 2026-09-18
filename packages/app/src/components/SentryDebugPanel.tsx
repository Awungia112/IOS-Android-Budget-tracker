import * as Sentry from '@sentry/capacitor';
import { Bug } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * QA panel for verifying Sentry integration end-to-end on a real device.
 *
 * Gated behind the VITE_SENTRY_DEBUG build-time flag so it is tree-shaken
 * from any build where the flag is absent or not exactly 'true'.
 *
 * To enable, set in your local .env before building:
 *   VITE_SENTRY_DEBUG=true
 * Then rebuild:
 *   pnpm build && npx cap sync android
 *   cd android && ./gradlew assembleDebug
 *
 * The panel appears in Settings automatically. Remove VITE_SENTRY_DEBUG
 * (or leave it unset) for staging and production builds.
 *
 * Three test scenarios:
 *  1. Handled JS error  — captureException is called manually; app keeps running.
 *                         Shows in Sentry as a handled error with full stack trace.
 *  2. Unhandled JS error — thrown via setTimeout so it bypasses React's error
 *                          boundary and is caught by the global onerror handler.
 *                          Shows in Sentry as unhandled.
 *  3. Native crash (Android only) — calls Sentry.nativeCrash() which produces a
 *                          real JVM crash. The app will close — that is expected.
 *                          Check Sentry after reopening the app.
 */

const cardBase =
  'p-3 rounded-[7px] shadow-sm bg-white dark:bg-white/5 border border-black/10 dark:border-white/10 hover:bg-gray-50 dark:hover:bg-white/10 transition-colors font-sans';

function triggerJsError() {
  try {
    throw new Error('[Sentry test] handled JS error from SentryDebugPanel');
  } catch (err) {
    Sentry.captureException(err);
    if (import.meta.env.DEV) {
      console.warn('[SentryDebugPanel] captureException called — check Sentry dashboard');
    }
  }
}

function triggerUnhandledError() {
  // Defer via setTimeout so React's ErrorBoundary doesn't catch it first.
  // The global window.onerror handler will fire, showing this as unhandled in Sentry.
  setTimeout(() => {
    throw new Error('[Sentry test] unhandled JS error from SentryDebugPanel');
  }, 0);
}

function triggerNativeCrash() {
  // nativeCrash() is a no-op on web. On Android it produces a real JVM crash —
  // the app will close, which is expected. Check Sentry after reopening the app.
  Sentry.nativeCrash();
}

export function SentryDebugPanel() {
  // Tree-shaken entirely when VITE_SENTRY_DEBUG is not set to 'true'
  if (import.meta.env.VITE_SENTRY_DEBUG !== 'true') return null;

  return (
    <div className="space-y-2 mt-2">
      <div className="flex items-center gap-2 px-1 mb-1">
        <Bug className="h-3.5 w-3.5 text-orange-500" aria-hidden="true" />
        <span className="text-[11px] font-bold uppercase tracking-wide text-orange-500">
          Sentry Debug
        </span>
      </div>

      <button
        onClick={triggerJsError}
        className={cn(
          cardBase,
          'w-full flex items-center justify-between h-[54px] text-sm font-medium text-black dark:text-white',
        )}
        data-testid="sentry-debug-js-error"
      >
        <span>Send handled JS error</span>
        <span className="text-xs text-orange-400 font-mono">captureException</span>
      </button>

      <button
        onClick={triggerUnhandledError}
        className={cn(
          cardBase,
          'w-full flex items-center justify-between h-[54px] text-sm font-medium text-black dark:text-white',
        )}
        data-testid="sentry-debug-unhandled"
      >
        <span>Trigger unhandled JS error</span>
        <span className="text-xs text-orange-400 font-mono">window.onerror</span>
      </button>

      <button
        onClick={triggerNativeCrash}
        className={cn(
          cardBase,
          'w-full flex items-center justify-between h-[54px] text-sm font-medium text-budget-red',
        )}
        data-testid="sentry-debug-native-crash"
      >
        <span>Native crash (Android)</span>
        <span className="text-xs text-budget-red/60 font-mono">nativeCrash()</span>
      </button>
    </div>
  );
}
