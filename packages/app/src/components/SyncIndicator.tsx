import React, { useEffect, useState } from 'react';
import { RefreshCw, AlertCircle, CheckCircle2, RotateCcw } from 'lucide-react';
import { syncEngine, SyncState, SyncProgress, SYNC_STATES } from '@budget/core';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { useBudget } from '@/contexts/BudgetContext';
import { CloudOff } from 'lucide-react';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

interface SyncIndicatorProps {
  className?: string;
  onErrorClick?: () => void;
}

export const SyncIndicator: React.FC<SyncIndicatorProps> = ({ className, onErrorClick }) => {
  const { t } = useTranslation();
  const { triggerSync, goOnline, isOfflineMode } = useBudget();
  const [state, setState] = useState<SyncState>(syncEngine.getState());
  const [progress, setProgress] = useState<SyncProgress | undefined>(syncEngine.getProgress());
  const [error, setError] = useState<string | undefined>(syncEngine.getLastError());

  useEffect(() => {
    // Force set initial state
    setState(syncEngine.getState());

    const unsubscribe = syncEngine.subscribe((newState, newProgress, newError) => {
      setState(newState);
      setProgress(newProgress);
      setError(newError);
    });
    return unsubscribe;
  }, []);

  // Hide when IDLE and no error
  if (state === SYNC_STATES.IDLE && !error) {
    return null;
  }

  const renderIcon = () => {
    switch (state) {
      case SYNC_STATES.SYNCING:
        return <RefreshCw className="h-4 w-4 animate-spin text-budget-blue" />;
      case SYNC_STATES.ERROR:
        return <AlertCircle className="h-4 w-4 text-red-500" />;
      case SYNC_STATES.SYNCED:
        return <CheckCircle2 className="h-4 w-4 text-green-500" />;
      case SYNC_STATES.OFFLINE:
        return <CloudOff className="h-4 w-4 text-gray-400" />;
      default:
        return null;
    }
  };

  const getStatusMessage = () => {
    if (state === SYNC_STATES.SYNCING) {
      // 1. Prefer explicit stage-based messages
      if (progress?.stage === 'PUSH') return t('sync.status_pushing');
      if (progress?.stage === 'PULL') return t('sync.status_pulling');
      if (progress?.stage === 'REPLAY') {
        return t('sync.status_restoring', { current: progress.current, total: progress.total });
      }

      // 2. Fallback to descriptive message if provided (backwards compatibility)
      if (progress?.message) return progress.message;

      // 3. Last fallback (legacy or unknown state)
      if (progress && progress.total > 0) {
        return t('sync.status_restoring', { current: progress.current, total: progress.total });
      }
      return t('sync.status_syncing');
    }
    if (state === SYNC_STATES.ERROR) return t('sync.status_error');
    if (state === SYNC_STATES.SYNCED) return t('sync.status_synced');
    if (state === SYNC_STATES.OFFLINE) return t('sync.status_offline');
    return t('sync.status_syncing'); // Fallback
  };

  return (
    <div className={cn(
      "flex min-w-0 items-center gap-1 shrink-0 transition-all duration-300",
      className
    )}>
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <div
              className={cn(
                "flex min-w-0 items-center gap-1.5 cursor-pointer hover:bg-white/10 px-2 py-1 rounded-md transition-colors max-w-[120px]",
                state === 'ERROR' && "text-red-500"
              )}
              onClick={state === SYNC_STATES.ERROR ? onErrorClick : undefined}
              data-testid="sync-indicator"
              role="status"
              aria-live="polite"
              aria-atomic="true"
            >
              <span className="shrink-0">{renderIcon()}</span>
              <span className="hidden max-w-[6rem] truncate text-xs font-medium sm:inline-block lg:max-w-[10rem]">
                {getStatusMessage()}
              </span>
            </div>
          </TooltipTrigger>
          <TooltipContent side="bottom" className="bg-budget-dark text-white border-white/10">
            <p>{getStatusMessage()}</p>
            {state === 'ERROR' && <p className="text-[10px] opacity-70 mt-0.5">{error}</p>}
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>

      {state === SYNC_STATES.ERROR && (
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6 shrink-0 text-white hover:bg-white/10"
          onClick={() => {
            if (isOfflineMode) { void goOnline(); } else { triggerSync(); }
          }}
          aria-label={t('sync.retry')}
        >
          <RotateCcw className="h-3 w-3" />
        </Button>
      )}
    </div>
  );
};
