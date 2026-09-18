package de.deutschlandimplus.meinbudget;

import android.content.Context;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import androidx.core.content.pm.PackageInfoCompat;
import android.util.Log;
import android.os.SystemClock;
import java.io.File;

/**
 * Removes stale PWA runtime state after a native app update.
 *
 * IndexedDB and SQLite are intentionally not touched: migration data must
 * survive the update. Only WebView resource/cache state and service-worker
 * registrations are reset so the new APK's JavaScript bundle is loaded.
 */
final class WebViewUpgradeRecovery {
    private static final String TAG = "WebViewUpgradeRecovery";
    private static final String PREFS_NAME = "webview_upgrade_recovery";
    private static final String VERSION_KEY = "last_reset_version";

    private WebViewUpgradeRecovery() {
    }

    static void resetIfAppVersionChanged(Context context) {
        final long currentVersion;
        try {
            currentVersion = PackageInfoCompat.getLongVersionCode(
                    context.getPackageManager().getPackageInfo(context.getPackageName(), 0));
        } catch (PackageManager.NameNotFoundException exception) {
            return;
        }
        SharedPreferences preferences = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);

        if (String.valueOf(currentVersion).equals(preferences.getString(VERSION_KEY, null))) {
            return;
        }

        File dataDir = new File(context.getApplicationInfo().dataDir);
        File serviceWorkerDir = new File(dataDir, "app_webview/Default/Service Worker");
        File httpCacheDir = new File(context.getCacheDir(), "WebView/Default/HTTP Cache");
        File codeCacheDir = new File(context.getCacheDir(), "WebView/Default/Code Cache");

        // This is intentionally synchronous: the cleanup must finish before
        // WebView is created, otherwise the stale service worker can intercept
        // the first native load. The tradeoff is limited to one update launch
        // and three cache-only roots; IndexedDB, localStorage, and SQLite are
        // not touched. Keep the duration log to detect unexpected growth.
        long cleanupStartedAt = SystemClock.elapsedRealtime();
        boolean resetSucceeded = deleteTree(serviceWorkerDir);
        resetSucceeded &= deleteTree(httpCacheDir);
        resetSucceeded &= deleteTree(codeCacheDir);
        Log.i(TAG, "WebView upgrade cleanup finished in "
                + (SystemClock.elapsedRealtime() - cleanupStartedAt) + " ms; success="
                + resetSucceeded);

        if (resetSucceeded) {
            preferences.edit().putString(VERSION_KEY, String.valueOf(currentVersion)).apply();
        }
    }

    private static boolean deleteTree(File file) {
        if (!file.exists()) {
            return true;
        }

        if (!file.isDirectory()) {
            if (!file.delete()) {
                Log.w(TAG, "Could not delete WebView cache file: " + file);
                return false;
            }
            return true;
        }

        File[] children = file.listFiles();
        if (children == null) {
            Log.w(TAG, "Could not list WebView cache directory: " + file);
            return false;
        }

        boolean deleted = true;
        for (File child : children) {
            deleted &= deleteTree(child);
        }
        if (!file.delete()) {
            Log.w(TAG, "Could not delete WebView cache entry: " + file);
            deleted = false;
        }
        return deleted;
    }
}
