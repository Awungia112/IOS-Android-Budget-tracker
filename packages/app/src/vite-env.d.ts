/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

declare const APP_VERSION: string;

interface ImportMetaEnv {
  /**
   * Sentry DSN for crash and error monitoring.
   * Leave unset (or empty) in local development to disable Sentry entirely.
   * Set via CI/CD environment variables for staging and production builds.
   *
   * Example: https://<public-key>@o<org-id>.ingest.sentry.io/<project-id>
   */
  readonly VITE_SENTRY_DSN?: string;
  /**
   * Set to 'true' to enable the in-app Sentry debug panel (Settings page).
   * The panel exposes test buttons for handled errors, unhandled errors, and
   * native crashes. Omit this flag in staging and production builds — the
   * component is tree-shaken when the value is not exactly 'true'.
   */
  readonly VITE_SENTRY_DEBUG?: string;
}

interface Window {
  db?: unknown;
  __resetMigration?: () => Promise<void>;
}
