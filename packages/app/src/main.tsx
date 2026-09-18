import { createRoot } from 'react-dom/client'
import App from './App'
import './index.css'
import './lib/i18n'
import { installDevGlobals } from './lib/devGlobals'
import { initMonitoring } from './lib/monitoring'
import { registerServiceWorkerIfWeb } from './lib/serviceWorkerRegistration'

// Initialise crash / error monitoring as early as possible so that errors
// thrown during app bootstrap are also captured.  No-ops when VITE_SENTRY_DSN
// is not set (local development).
initMonitoring();

// Native Capacitor builds do not need a browser service worker.
registerServiceWorkerIfWeb();

// Expose db for E2E tests and debugging
if (import.meta.env.DEV || window.location.hostname === 'localhost') {
    installDevGlobals();
}

createRoot(document.getElementById("root")!).render(<App />);
