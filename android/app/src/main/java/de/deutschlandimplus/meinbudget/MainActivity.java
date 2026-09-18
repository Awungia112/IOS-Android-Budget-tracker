package de.deutschlandimplus.meinbudget;

import android.os.Bundle;
import android.view.View;
import androidx.core.view.ViewCompat;

import com.getcapacitor.BridgeActivity;
import com.getcapacitor.community.database.sqlite.CapacitorSQLitePlugin;
import de.deutschlandimplus.meinbudget.MigrationFileCopyPlugin;
import de.deutschlandimplus.meinbudget.PrivateKeyStorePlugin;
import com.capacitorjs.plugins.app.AppPlugin;
import com.capacitorjs.plugins.keyboard.KeyboardPlugin;
import io.sentry.capacitor.SentryCapacitor;

/**
 * MainActivity for Budget Wise PWA
 *
 * Edge-to-edge support is handled by Capacitor and Android styles via these
 * settings: capacitor.config.ts -> StatusBar.overlaysWebView: false,
 * EdgeToEdge.backgroundColor: "#3A464F", and SystemBars.insetsHandling:
 * "disable". styles.xml -> android:windowOptOutEdgeToEdgeEnforcement.
 *
 * This allows proper safe area handling on Android 15+ without manual
 * intervention.
 */
public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(AppPlugin.class);
        registerPlugin(KeyboardPlugin.class);
        registerPlugin(CapacitorSQLitePlugin.class);
        registerPlugin(MigrationFileCopyPlugin.class);
        registerPlugin(PrivateKeyStorePlugin.class);
        registerPlugin(SentryCapacitor.class);

        WebViewUpgradeRecovery.resetIfAppVersionChanged(this);
        super.onCreate(savedInstanceState);

        // Work around a bug in Capacitor core's SystemBars plugin: its
        // insets listener always calls View.setPadding() on the WebView's
        // parent to reserve room for the IME, even when
        // SystemBars.insetsHandling is set to "disable" in
        // capacitor.config.ts (that flag only gates the CSS safe-area-inset
        // variables, not the padding calls — see
        // com.getcapacitor.plugin.SystemBars#initWindowInsetsListener in
        // @capacitor/android). Since this app already opts out of
        // edge-to-edge and lets windowSoftInputMode="adjustResize" resize
        // the WebView itself, that extra native padding double-reserves
        // keyboard height: the WebView shrinks once for adjustResize, then
        // its parent is padded by the same amount again, leaving a visible
        // gap (colored by the window background) between the content and
        // the keyboard.
        //
        // Re-registering a passthrough listener on the same view after
        // super.onCreate() (where SystemBars installs its listener) replaces
        // it, since a View keeps only the most recently set
        // OnApplyWindowInsetsListener.
        View webViewParent = (View) getBridge().getWebView().getParent();
        ViewCompat.setOnApplyWindowInsetsListener(webViewParent, (v, insets) -> insets);
    }
}
