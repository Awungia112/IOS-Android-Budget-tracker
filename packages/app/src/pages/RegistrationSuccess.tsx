import { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { CheckCircle2 } from 'lucide-react';
import { useAccount } from '@/contexts/AccountContext';
import { useBudget } from '@/contexts/BudgetContext';
import { consumePendingRedirect } from '@/lib/accountStorage';
import { RecoveryCodeScreen } from '@/components/RecoveryCodeScreen';
import {
  generateSecretCode,
  loadPrivateKey,
  parseSecretCodeWords,
  sealRecovery,
} from '@budget/core';
import { enrollWithRetryOnConflict } from '@/lib/recovery-enroll';
import { getRecoveryServerUrl } from '@/lib/api';

const LOGO_SRC = '/assets/deutschland.webp';
const EMAIL_HASH_PATTERN = /^[0-9a-f]{64}$/;

type RecoveryEnrollmentContext = {
  recoveryServerUrl: string;
  emailHash: string;
  privateKey: Uint8Array;
};

async function resolveRecoveryEnrollmentContext(): Promise<RecoveryEnrollmentContext | null> {
  const recoveryServerUrl = getRecoveryServerUrl();
  if (!recoveryServerUrl) {
    console.warn('[recovery] VITE_RECOVERY_SERVER_URL is not set — skipping recovery enrollment');
    return null;
  }

  try {
    new URL(recoveryServerUrl);
  } catch {
    console.warn('[recovery] VITE_RECOVERY_SERVER_URL is invalid — skipping recovery enrollment');
    return null;
  }

  const emailHash = localStorage.getItem('emailHash');
  if (!emailHash || !EMAIL_HASH_PATTERN.test(emailHash)) {
    console.warn('[recovery] valid emailHash not found in localStorage — skipping recovery enrollment');
    return null;
  }

  const userId = localStorage.getItem('userId');
  if (!userId) {
    console.warn('[recovery] userId not found in localStorage — skipping recovery enrollment');
    return null;
  }

  const privateKey = await loadPrivateKey(userId);
  if (!privateKey) {
    console.warn('[recovery] private key not found for userId — skipping recovery enrollment');
    return null;
  }

  return { recoveryServerUrl, emailHash, privateKey };
}

const RegistrationSuccess = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { t, i18n } = useTranslation();
  const { setIsAuthenticated, setIsLoggedIn } = useAccount();
  const { requestRestoreOnlineAccounts, requestGoOnline } = useBudget();

  // Source of truth: pendingAuthIntent from localStorage (set by RegistrationEmail
  // on both 201 and 409). Falls back to router state for the OTP path which
  // threads isAlreadyRegistered through check-email → OTP → success.
  // NOTE: This is now consumed in the step state initializer to avoid flipping
  // on re-renders (StrictMode, state changes).

  /**
   * Flow order:
   *   1. recovery — show RecoveryCodeScreen first (register only)
   *   2. success  — show success screen last, then go to dashboard
   *
   * When the user is already registered (sign-in — server returns 200 from
   * POST /v1/auth/register), they already have a recovery code and private
   * key on this device — skip straight to success.
   */
  const [step, setStep] = useState<'recovery' | 'success'>(() => {
    const pendingAuthIntent = localStorage.getItem('pendingAuthIntent') as 'signin' | 'register' | null;
    const registered = pendingAuthIntent === 'signin' || location.state?.isAlreadyRegistered === true;
    // Don't clear pendingAuthIntent here - clear it in handleGoToDashboard after successful completion
    // This handles page refreshes correctly by persisting the intent until the flow is complete
    return registered ? 'success' : 'recovery';
  });

  // Derive isAlreadyRegistered from step for use in effects and handlers
  const isAlreadyRegistered = step === 'success';
  const [secretCode, setSecretCode] = useState('');
  const [secretWords, setSecretWords] = useState<string[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState(false);
  const [recoveryEnrollment, setRecoveryEnrollment] = useState<RecoveryEnrollmentContext | null>(null);
  const [recoverySetupError, setRecoverySetupError] = useState<string | null>(null);

  // Generate recovery code on mount (skip if already registered — they already have one)
  useEffect(() => {
    if (isAlreadyRegistered) return;
    const initRecovery = async () => {
      try {
        const code = await generateSecretCode();
        const words = parseSecretCodeWords(code);
        setSecretCode(code);
        setSecretWords(words);
        const enrollment = await resolveRecoveryEnrollmentContext();
        setRecoveryEnrollment(enrollment);
      } catch (err) {
        console.error('[recovery] setup failed:', err);
        setRecoverySetupError(t('recovery.setup_error'));
      }
    };
    initRecovery();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- isAlreadyRegistered is derived from step
  }, [t, step]);

  // Background enrollment upload — starts as soon as secretCode + enrollment context are ready
  // (skip if already registered — they already have an existing enrollment)
  useEffect(() => {
    if (isAlreadyRegistered || !secretCode || !recoveryEnrollment) return;

    let cancelled = false;
    const uploadEnrollment = async () => {
      setIsUploading(true);
      setUploadError(false);
      try {
        const envelope = await sealRecovery(recoveryEnrollment.privateKey, secretCode);
        const ok = await enrollWithRetryOnConflict({
          recoveryServerUrl: recoveryEnrollment.recoveryServerUrl,
          emailHash: recoveryEnrollment.emailHash,
          encryptedPrivateKey: envelope,
        });
        if (!cancelled) {
          setIsUploading(false);
          if (!ok) {
            console.error('[recovery] enrollment upload failed');
            setUploadError(true);
          }
        }
      } catch (err) {
        console.error('[recovery] enrollment upload failed:', err);
        if (!cancelled) {
          setIsUploading(false);
          setUploadError(true);
        }
      }
    };

    uploadEnrollment();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- isAlreadyRegistered is derived from step
  }, [step, secretCode, recoveryEnrollment]);

  // Step 1 → Step 2: user confirmed they saved the recovery code
  const handleRecoveryConfirmed = () => {
    setStep('success');
  };

  // Step 2 → Dashboard (or pending redirect): user clicks "Go to Dashboard" on the success screen
  const handleGoToDashboard = () => {
    localStorage.setItem('onboardingComplete', 'true');
    // Clear pendingAuthIntent now that the flow is complete
    localStorage.removeItem('pendingAuthIntent');
    setIsAuthenticated(true);
    setIsLoggedIn(true);

    // For sign-in (existing user), trigger account restore and online transition
    // explicitly — mirroring RegistrationVerify's signin branch. This is required
    // because Onboarding.completeOnboarding already called setIsLoggedIn(true) for
    // local-only users, so the automatic false→true transition in BudgetContext
    // never fires when they subsequently sign in via OTP from the Account page.
    if (isAlreadyRegistered) {
      requestRestoreOnlineAccounts();
      requestGoOnline();
    }

    // If the user started from a context like SharingSettings, redirect back
    // there instead of the dashboard.
    const redirectPath = consumePendingRedirect();
    navigate(redirectPath ?? '/');
  };

  // ── Step 1: Recovery code screen ────────────────────────────────────────────
  if (step === 'recovery') {
    return (
      <RecoveryCodeScreen
        secretCode={secretCode}
        secretWords={secretWords}
        onConfirmed={handleRecoveryConfirmed}
        isUploading={isUploading}
        uploadError={uploadError}
        onRetryUpload={recoveryEnrollment ? () => {
          setUploadError(false);
          setRecoveryEnrollment({ ...recoveryEnrollment });
        } : undefined}
      />
    );
  }

  // ── Step 2: Success screen — final step before dashboard ────────────────────
  return (
    <div className="min-h-screen bg-white flex flex-col font-['Inter',sans-serif]">
      {/* Header: Logo + Language */}
      <div
        className="flex items-start justify-between px-9"
        style={{ paddingTop: 'calc(var(--safe-area-top, 0px) + 1.25rem)' }}
      >
        <img src={LOGO_SRC} alt="Deutschland im Plus" className="w-[91px] h-[91px] object-contain" />
        <button
          onClick={() => i18n.changeLanguage(i18n.language === 'de' ? 'en' : 'de')}
          aria-label={t('registration.change_language')}
          className="px-3 py-1.5 mt-2 rounded-full bg-white border border-black/10 text-[13px] font-semibold text-[#0b0b0b] hover:bg-gray-50 transition-colors shadow-sm"
        >
          {i18n.language === 'de' ? 'EN' : 'DE'}
        </button>
      </div>

      <div className="flex-1 flex flex-col items-center justify-center px-10 pb-20">
        <div className="w-full max-w-[340px] text-center">
          <CheckCircle2 className="mx-auto w-14 h-14 text-[#0b75c2] mb-8" />

          <h1 className="text-[32px] font-bold text-[#0b0b0b] mb-2 leading-tight">
            {t('registration.success_title')}
          </h1>
          <p className="text-[17px] text-[#0b0b0b]/70 font-medium mb-10">
            {t('registration.success_subtitle')}
          </p>

          <button
            onClick={handleGoToDashboard}
            aria-label={t('registration.go_to_dashboard')}
            className="w-full h-[58px] rounded-[8px] bg-[#0b75c2] text-white font-bold text-[16px] font-['Inter',sans-serif] hover:bg-[#0b75c2]/90 active:scale-[0.98] transition-all shadow-lg shadow-[#0b75c2]/20 flex items-center justify-center"
          >
            {t('registration.go_to_dashboard')}
          </button>

          {recoverySetupError && (
            <p className="mt-4 text-red-600 text-sm font-medium">{recoverySetupError}</p>
          )}
        </div>
      </div>


    </div>
  );
};

export default RegistrationSuccess;
