import { useState } from 'react';
import { useTranslation } from 'react-i18next';

export interface RecoveryEnrollScreenProps {
  /** The 6-word secret code to display, e.g. 'word1-word2-word3-word4-word5-word6' */
  secretCode: string;
  /** Called once the user confirms they have saved the code */
  onConfirmed: () => void;
  /** Whether the enroll network request is in progress */
  isLoading?: boolean;
  /** Error message to display if enrollment failed */
  error?: string | null;
}

/**
 * Non-dismissible screen that displays the 6-word recovery code.
 * The user must tap "I have saved this code" to proceed — there is no
 * back button or skip option on this screen.
 *
 * Decryption is always client-side; the server only stores the encrypted
 * envelope. Losing both the device and this code means permanent data loss.
 */
export function RecoveryEnrollScreen({
  secretCode,
  onConfirmed,
  isLoading = false,
  error = null,
}: RecoveryEnrollScreenProps) {
  const { t } = useTranslation();
  const [confirmed, setConfirmed] = useState(false);

  const words = secretCode.split('-');

  return (
    <div className="min-h-screen bg-white dark:bg-[#1a2124] flex flex-col font-['Inter',sans-serif]">
      {/* Header */}
      <div className="px-6 pt-12 pb-4">
        <h1 className="text-[26px] font-bold text-[#0b0b0b] dark:text-white leading-tight">
          {t('recovery_enroll_title')}
        </h1>
        <p className="mt-2 text-[15px] text-[#555] dark:text-white/60 leading-[22px]">
          {t('recovery_enroll_subtitle')}
        </p>
      </div>

      {/* Zero-knowledge warning */}
      <div className="mx-6 mb-4 px-0">
        <p className="text-[13px] font-semibold text-amber-800 dark:text-amber-300 leading-[20px]">
          ⚠ {t('recovery_enroll_zero_knowledge_warning')}
        </p>
      </div>

      {/* Secret code display */}
      <div className="mx-6">
        <p className="text-[12px] font-semibold uppercase tracking-widest text-[#888] dark:text-white/40 mb-3">
          {t('recovery_enroll_your_code')}
        </p>
        <div className="grid grid-cols-2 gap-2">
          {words.map((word, i) => (
            <div
              key={i}
              className="flex items-center gap-2 rounded-[8px] bg-white dark:bg-white/10 px-3 py-2 shadow-sm"
            >
              <span className="text-[12px] font-bold text-[#0b75c2] dark:text-[#4da6e8] w-4 shrink-0">
                {i + 1}.
              </span>
              <span className="text-[15px] font-semibold text-[#0b0b0b] dark:text-white tracking-wide">
                {word}
              </span>
            </div>
          ))}
        </div>

        {/* Full code as copyable text */}
        <div className="mt-4 rounded-[8px] bg-white dark:bg-white/10 px-3 py-2">
          <p className="text-[12px] text-[#888] dark:text-white/40 mb-1">
            {t('recovery_enroll_full_code')}
          </p>
          <p
            className="text-[13px] font-mono text-[#0b0b0b] dark:text-white break-all select-all"
            data-testid="recovery-secret-code"
          >
            {secretCode}
          </p>
        </div>
      </div>

      {/* Clipboard sync warning */}
      <p className="mx-6 mt-3 text-[12px] text-[#888] dark:text-white/40 leading-[18px]">
        {t('recovery_enroll_clipboard_warning')}
      </p>

      {/* Error */}
      {error && (
        <div className="mx-6 mt-3 rounded-[8px] bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-700 px-4 py-3">
          <p className="text-[13px] text-red-700 dark:text-red-400">{error}</p>
        </div>
      )}

      {/* Confirmation checkbox + CTA */}
      <div className="flex-1" />
      <div className="px-6 pb-10 pt-4 space-y-3">
        <label className="flex items-start gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={confirmed}
            onChange={(e) => setConfirmed(e.target.checked)}
            className="mt-0.5 h-5 w-5 rounded border-gray-300 accent-[#0b75c2]"
            data-testid="recovery-confirm-checkbox"
          />
          <span className="text-[14px] text-[#0b0b0b] dark:text-white leading-[20px]">
            {t('recovery_enroll_confirm_label')}
          </span>
        </label>

        <button
          onClick={onConfirmed}
          disabled={!confirmed || isLoading}
          className="w-full h-[58px] rounded-[8px] bg-[#0b75c2] text-white font-bold text-[16px] hover:bg-[#0b75c2]/90 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          data-testid="recovery-confirm-button"
        >
          {isLoading ? t('recovery_enroll_saving') : t('recovery_enroll_confirm_button')}
        </button>
      </div>
    </div>
  );
}
