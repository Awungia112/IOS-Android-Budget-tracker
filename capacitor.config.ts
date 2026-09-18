import { CapacitorConfig } from '@capacitor/cli';

// This file runs under Node (Capacitor CLI) but sits outside every tsconfig
// project, so the Node globals aren't in scope for the type checker.
declare const process: { env: Record<string, string | undefined> };

/**
 * WebView origin hostname (combined with androidScheme/iosScheme below).
 *
 * WARNING: this value defines the origin under which all WebView storage
 * (IndexedDB, localStorage) lives. Changing it after a release orphans the
 * local data of every existing install. Pick the final production value
 * before the first public release and treat it as immutable afterwards.
 *
 * It must also match an origin the API server allows via CORS.
 * Resolved at `cap sync` time; set CAPACITOR_SERVER_HOSTNAME to override
 * per environment (see .gitlab-ci.yml).
 */
const serverHostname =
  process.env.CAPACITOR_SERVER_HOSTNAME ?? 'app.qa.dip.on.adorsys.com';

const config: CapacitorConfig = {
  appId: 'de.deutschland-im-plus.MeinBudget',
  appName: 'Mein Budget',
  webDir: 'dist',
  server: {
    androidScheme: 'https',
    iosScheme: 'https',
    hostname: serverHostname,
  },
  plugins: {
    CapacitorHttp: {
      enabled: true,
    },
    SplashScreen: {
      launchShowDuration: 3000,
      launchAutoHide: true,
      backgroundColor: "#ffffff",
      androidSplashResourceName: "splash",
      androidScaleType: "CENTER_CROP",
      showSpinner: true,
      androidSpinnerStyle: "large",
      iosSpinnerStyle: "small",
      spinnerColor: "#999999",
      splashFullScreen: true,
      splashImmersive: true,
      layoutName: "launch_screen",
      useDialog: true,
    },
    StatusBar: {
      overlaysWebView: false,
      style: "LIGHT",
      backgroundColor: "#3A464F"
    },
    EdgeToEdge: {
      backgroundColor: "#3A464F"
    },
    SystemBars: {
      insetsHandling: "disable"
    },
    Keyboard: {
      // Must stay false (the plugin default) because @capawesome/capacitor-android-edge-to-edge-support
      // already applies its own insets to the webview. Setting this to true makes the Keyboard
      // plugin resize the webview a second time on top of that, double-reserving space for the
      // keyboard/nav-bar and producing a visible gap between the content and the keyboard.
      // See the "Capacitor Keyboard Plugin" section of that package's README.
      resizeOnFullScreen: false,
    },
    CapacitorSQLite: {
      iosDatabaseLocation: 'Library/CapacitorDatabase',
      iosIsEncryption: false,
      androidIsEncryption: false
    }
  },
  ios: {
    path: 'ios',
  },
  android: {
    path: 'android',
    buildOptions: {
      keystorePath: undefined,
      keystoreAlias: undefined,
      keystorePassword: undefined,
      keystoreAliasPassword: undefined,
    },
  },
};

export default config;
