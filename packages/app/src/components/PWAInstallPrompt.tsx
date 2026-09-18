import React, { useEffect, useState } from 'react';
import { Button } from './ui/button';
import { X } from 'lucide-react';

const PWAInstallPrompt: React.FC = () => {
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [showPrompt, setShowPrompt] = useState(false);

  useEffect(() => {
    const handler = (e: any) => {
      e.preventDefault();
      setDeferredPrompt(e);
      setShowPrompt(true);
    };
    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  const handleInstallClick = async () => {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      if (outcome === 'accepted') {
        setShowPrompt(false);
      }
      setDeferredPrompt(null);
    }
  };

  if (!showPrompt) return null;

  return (
    <div className="fixed left-0 right-0 bottom-[calc(var(--bottom-nav-height)+var(--safe-area-bottom))] z-50 px-4 pb-3">
      <div className="w-full max-w-sm mx-auto bg-card border rounded-xl shadow-lg p-4">
        <div className="flex items-start gap-3">
          <img
            src="/assets/logo-deutshland.png"
            alt="My Budget"
            className="h-10 w-10 rounded-lg shrink-0"
          />
          <div className="flex-1 min-w-0">
            <h3 className="text-sm font-semibold text-foreground">Install My Budget</h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              Add to your home screen for quick access
            </p>
          </div>
          <button
            onClick={() => setShowPrompt(false)}
            className="shrink-0 text-muted-foreground hover:text-foreground transition-colors"
            aria-label="Dismiss"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <Button
          onClick={handleInstallClick}
          className="w-full mt-3 bg-primary text-primary-foreground rounded-lg h-10 text-sm font-semibold"
        >
          Install
        </Button>
      </div>
    </div>
  );
};

export default PWAInstallPrompt; 