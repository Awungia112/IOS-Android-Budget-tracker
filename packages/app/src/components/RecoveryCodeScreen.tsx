/**
 * RecoveryCodeScreen — non-dismissible screen shown after registration.
 *
 * Displays the user's 6-word recovery secret code and requires them to
 * explicitly confirm they have saved it before proceeding.
 *
 * Design requirements (ticket #272):
 *   - Non-dismissible: no back button, no skip, no close gesture
 *   - User must tap "I have saved this code" to proceed
 *   - Opt-in copy button with clipboard-sync warning
 *   - Zero-knowledge warning: losing both device and code = permanent data loss
 */

import { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Copy, Check, ShieldAlert } from 'lucide-react';

interface RecoveryCodeScreenProps {
  /** The 6-word hyphen-separated secret code to display. */
  secretCode: string;
  /** Parsed EFF words for display. Required when a word itself contains hyphens. */
  secretWords?: string[];
  /** Called when the user confirms they have saved the code. */
  onConfirmed: () => void;
  /** Whether the enrollment upload is in progress. */
  isUploading?: boolean;
  /**
   * Whether the enrollment upload failed.
   * When true the user must explicitly acknowledge they are proceeding
   * without server backup before the proceed button is enabled.
   */
  uploadError?: boolean;
  /** Called to retry the enrollment upload after a failure. */
  onRetryUpload?: () => void;
}

export const RecoveryCodeScreen = ({
  secretCode,
  secretWords,
  onConfirmed,
  isUploading = false,
  uploadError = false,
  onRetryUpload,
}: RecoveryCodeScreenProps) => {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);
  const [copyFailed, setCopyFailed] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  // Explicit acknowledgement required when enrollment failed — user must
  // check this before the proceed button enables, making the failure durable.
  const [uploadFailureAcknowledged, setUploadFailureAcknowledged] = useState(false);
  // Holds the active copy-reset timer so it can be cancelled on unmount or re-copy.
  const copyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const words = secretWords ?? secretCode.split('-').filter(Boolean);

  // ── Navigation guards ────────────────────────────────────────────────────────

  // 1. Browser unload (refresh / close tab).
  //    e.returnValue = '' is required by older browsers; e.preventDefault() alone
  //    is sufficient in modern ones — both are set for maximum compatibility.
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, []);

  // 2. SPA back-button / internal route changes.
  //    useBlocker requires a data router (createBrowserRouter) and throws under
  //    the BrowserRouter the app currently uses. Instead we use the same
  //    pushState/popstate lock that SyncMigrationWizard uses — compatible with
  //    any router version and with BrowserRouter.
  //    The lock is set up once on mount and torn down on unmount only — running
  //    the effect on every `confirmed` change caused history.back() to fire on
  //    any re-render (e.g. copy button click), which navigated away and triggered
  //    a React DOM insertBefore crash caught by the ErrorBoundary.
  const confirmedRef = useRef(confirmed);
  useEffect(() => {
    confirmedRef.current = confirmed;
  }, [confirmed]);

  // Tracks whether the user actually completed the flow (clicked proceed).
  // Used by the history lock cleanup to avoid popping the dummy entry after
  // a successful navigate('/') — which would otherwise send the user back here.
  const proceededRef = useRef(false);

  useEffect(() => {
    // Push a dummy history entry so the first back-press hits it instead of
    // navigating away from the screen.
    window.history.pushState({ recoveryCodeLock: true }, '');

    const handler = () => {
      // If the user has already confirmed, let navigation proceed normally.
      if (confirmedRef.current) return;
      // Re-push to keep the lock in place for subsequent back-presses.
      window.history.pushState({ recoveryCodeLock: true }, '');
    };

    window.addEventListener('popstate', handler);

    return () => {
      window.removeEventListener('popstate', handler);
      // Only pop the dummy entry if the user hasn't completed the flow.
      // If they confirmed and navigated away, calling history.back() here
      // would undo that navigation and bounce them back to this screen.
      if (!proceededRef.current) {
        window.history.back();
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // mount/unmount only — intentionally no deps

  // ── Copy timer cleanup ───────────────────────────────────────────────────────

  // Clear any pending copy-reset timer when the component unmounts.
  useEffect(() => {
    return () => {
      if (copyTimerRef.current !== null) clearTimeout(copyTimerRef.current);
    };
  }, []);

  const handleCopy = async () => {
    // Cancel any in-flight reset before starting a new one.
    if (copyTimerRef.current !== null) clearTimeout(copyTimerRef.current);

    let success = false;

    // Primary: modern Clipboard API (requires HTTPS or localhost with permissions).
    if (navigator.clipboard && navigator.clipboard.writeText) {
      try {
        await navigator.clipboard.writeText(secretCode);
        success = true;
      } catch {
        // Fall through to legacy method.
      }
    }

    // Fallback: document.execCommand — works on HTTP and older browsers.
    if (!success) {
      try {
        const textarea = document.createElement('textarea');
        textarea.value = secretCode;
        // Keep it out of the viewport but still selectable.
        textarea.style.cssText = 'position:fixed;top:0;left:0;opacity:0;pointer-events:none';
        document.body.appendChild(textarea);
        textarea.focus();
        textarea.select();
        success = document.execCommand('copy');
        document.body.removeChild(textarea);
      } catch {
        success = false;
      }
    }

    if (success) {
      setCopied(true);
      setCopyFailed(false);
      copyTimerRef.current = setTimeout(() => {
        setCopied(false);
        copyTimerRef.current = null;
      }, 2500);
    } else {
      // Both methods failed — let the user know to copy manually.
      setCopyFailed(true);
    }
  };

  const handleConfirm = () => {
    // Block while upload is in progress.
    if (isUploading) return;
    // After a failed upload the user must explicitly acknowledge they are
    // proceeding without a server-backed recovery envelope.
    if (uploadError && !uploadFailureAcknowledged) return;
    if (!confirmed) return;
    proceededRef.current = true;
    onConfirmed();
  };

  return (
    <div
      className="min-h-screen bg-white flex flex-col font-['Inter',sans-serif]"
      role="main"
      aria-labelledby="recovery-code-heading"
    >
      {/* Header */}
      <div
        className="px-6 pt-6 pb-4 flex flex-col items-center gap-3"
        style={{ paddingTop: 'calc(var(--safe-area-top, 0px) + 1.5rem)' }}
      >
        <ShieldAlert className="w-10 h-10 text-[#0b75c2]" aria-hidden="true" />
        <h1
          id="recovery-code-heading"
          className="text-[24px] font-bold text-[#0b0b0b] text-center leading-tight"
        >
          {t('recovery.title')}
        </h1>
        <p className="text-[15px] text-[#0b0b0b]/70 text-center leading-[22px] max-w-[320px] mb-8">
          {t('recovery.subtitle')}
        </p>
      </div>

      {/* Code display */}
      <div className="px-6 flex-1 flex flex-col gap-5">
        <div
          className="rounded-[12px] bg-[#f8fafc] border border-[#0b75c2]/10 p-5"
          aria-label={t('recovery.code_label')}
        >
          <div className="grid grid-cols-2 gap-3">
            {words.map((word, index) => (
              <div
                key={index}
                className="flex items-center gap-2.5 bg-white rounded-[8px] px-3 py-2.5 shadow-sm border border-[#0b0b0b]/5"
              >
                <span className="text-[12px] font-semibold text-[#0b75c2] w-4 shrink-0 select-none">
                  {index + 1}
                </span>
                <span className="text-[15px] font-semibold text-[#0b0b0b] tracking-wide select-all">
                  {word}
                </span>
              </div>
            ))}
          </div>

          {/* Copy button */}
          <button
            onClick={handleCopy}
            className="mt-4 w-full flex items-center justify-center gap-2 py-2.5 rounded-[8px] border border-[#0b75c2]/30 text-[#0b75c2] text-[14px] font-semibold hover:bg-[#0b75c2]/5 transition-colors"
            aria-label={copied ? t('recovery.copied') : t('recovery.copy_code')}
          >
            {copied ? (
              <>
                <Check className="w-4 h-4" aria-hidden="true" />
                {t('recovery.copied')}
              </>
            ) : (
              <>
                <Copy className="w-4 h-4" aria-hidden="true" />
                {t('recovery.copy_code')}
              </>
            )}
          </button>

          {/* Clipboard sync warning */}
          <p className="mt-2.5 text-[12px] text-[#0b0b0b]/50 text-center leading-[18px]">
            {t('recovery.clipboard_warning')}
          </p>
          {/* Copy failure feedback */}
          {copyFailed && (
            <p className="mt-1.5 text-[12px] text-red-600 text-center" role="alert">
              {t('recovery.copy_failed')}
            </p>
          )}
        </div>

        {/* Warning: device + code required */}
        <p className="mt-4 mb-4 text-[13px] text-amber-700 leading-[19px] text-center">
          {t('recovery.zero_knowledge_body')}
        </p>

        {/* Upload status */}
        {isUploading && (
          <div className="flex items-center justify-center gap-2 text-[13px] text-[#0b0b0b]/50">
            <div className="w-4 h-4 rounded-full border-2 border-[#0b75c2]/30 border-t-[#0b75c2] animate-spin" />
            {t('recovery.uploading')}
          </div>
        )}
        {uploadError && !isUploading && (
          <div className="flex flex-col gap-2">
            <p className="text-[13px] text-red-600 text-center">
              {t('recovery.upload_error')}
            </p>
            {onRetryUpload && (
              <button
                onClick={onRetryUpload}
                className="text-[13px] text-[#0b75c2] underline underline-offset-2 text-center hover:opacity-80"
                data-testid="recovery-retry-upload-button"
              >
                {t('recovery.retry_upload')}
              </button>
            )}
            {/* Explicit acknowledgement — user must check this to proceed without backup */}
            <label className="flex items-start gap-2 cursor-pointer select-none mt-1">
              <input
                type="checkbox"
                checked={uploadFailureAcknowledged}
                onChange={(e) => setUploadFailureAcknowledged(e.target.checked)}
                className="mt-0.5 accent-red-600"
                data-testid="recovery-upload-failure-acknowledged-checkbox"
              />
              <span className="text-[12px] text-red-700 leading-[18px]">
                {t('recovery.upload_failure_acknowledged')}
              </span>
            </label>
          </div>
        )}

        {/* Confirmation checkbox */}
        <label className="flex items-start gap-3 cursor-pointer select-none">
          <div className="relative mt-0.5 shrink-0 pointer-events-none">
            <input
              type="checkbox"
              checked={confirmed}
              onChange={(e) => setConfirmed(e.target.checked)}
              className="sr-only"
              aria-describedby="recovery-confirm-label"
              data-testid="recovery-confirm-checkbox"
            />
            <div
              className={`w-5 h-5 rounded-[4px] border-2 flex items-center justify-center transition-colors ${
                confirmed
                  ? 'bg-[#0b75c2] border-[#0b75c2]'
                  : 'bg-white border-[#0b0b0b]/20'
              }`}
              aria-hidden="true"
            >
              {confirmed && <Check className="w-3 h-3 text-white" />}
            </div>
          </div>
          <span
            id="recovery-confirm-label"
            className="text-[14px] text-[#0b0b0b] leading-[20px]"
          >
            {t('recovery.confirm_saved')}
          </span>
        </label>
      </div>

      {/* CTA button */}
      <div
        className="px-6 pt-2 pb-10"
        style={{ paddingBottom: 'calc(var(--safe-area-bottom, 0px) + 2.5rem)' }}
      >
        <button
          onClick={handleConfirm}
          disabled={!confirmed || isUploading || (uploadError && !uploadFailureAcknowledged)}
          className="w-full h-[58px] rounded-[8px] bg-[#0b75c2] text-white font-bold text-[16px] font-['Inter',sans-serif] hover:bg-[#0b75c2]/90 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          data-testid="recovery-proceed-button"
        >
          {isUploading ? t('recovery.uploading') : t('recovery.proceed')}
        </button>
      </div>
    </div>
  );
};

export default RecoveryCodeScreen;
