import React, { useEffect, useState } from 'react';
import { X } from 'lucide-react';

const FirefoxInstallHint = () => {
  const [show, setShow] = useState(false);

  useEffect(() => {
    const isFirefox = /firefox/i.test(navigator.userAgent);
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches || (window.navigator as any).standalone;
    if (isFirefox && !isStandalone) {
      setShow(true);
    }
  }, []);

  if (!show) return null;

  return (
    <div className="fixed left-0 right-0 bottom-[calc(var(--bottom-nav-height)+var(--safe-area-bottom))] z-50 px-4 pb-3">
      <div className="w-full max-w-sm mx-auto bg-card border rounded-xl shadow-lg p-4">
        <div className="flex items-start gap-3">
          <img
            src="/assets/logo-deutshland.webp"
            alt="My Budget"
            className="h-10 w-10 rounded-lg shrink-0"
          />
          <div className="flex-1 min-w-0">
            <p className="text-xs text-muted-foreground">
              To install this app, use your browser menu: <b>Add to Home Screen</b> (mobile) or <b>Install</b> (desktop).
            </p>
          </div>
          <button
            onClick={() => setShow(false)}
            className="shrink-0 text-muted-foreground hover:text-foreground transition-colors"
            aria-label="Dismiss"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
};

export default FirefoxInstallHint; 