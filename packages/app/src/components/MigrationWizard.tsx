import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import Spinner from '@/components/ui/Spinner';
import { CheckCircle, XCircle, RefreshCw, Eye, EyeOff, Mail } from 'lucide-react';
import type { MigrationResult, MigrationStep, MigrationErrorCode } from '@budget/core';
import { SUPPORT_EMAIL, buildMailto } from '@/config/support';

// =============================================================================
// TYPES
// =============================================================================

export type WizardStep = 'intro' | 'credentials' | 'progress' | 'result';

interface MigrationWizardProps {
  onMigrate: (
    email: string,
    password: string,
    onProgress: (step: MigrationStep) => Promise<void> | void,
    platform: string,
    retryCount: number,
  ) => Promise<MigrationResult>;
  onDone: (result: MigrationResult) => void;
  /** Platform string passed to the support mailto link. Defaults to 'unknown'. */
  platform?: string;
}

// =============================================================================
// HELPERS
// =============================================================================

/** Build a mailto: href pre-filled with app version, platform, error code, record counts, and raw error details. */
function buildSupportMailto(
  errorCode: MigrationErrorCode,
  platform: string,
  recordCounts: Record<string, number>,
  errors: string[],
): string {
  const appVersion = APP_VERSION;
  const counts = Object.entries(recordCounts)
    .map(([k, v]) => `${k}: ${v}`)
    .join(', ');
  const subject = `Migrationsfehler: ${errorCode}`;
  const details = errors.length > 0 ? `\nDetails:\n${errors.map(e => `- ${e}`).join('\n')}` : '';
  const body = `App-Version: ${appVersion}\nPlattform: ${platform}\nFehlercode: ${errorCode}\nDatensätze: ${counts}${details}`;
  return buildMailto(SUPPORT_EMAIL, subject, body);
}

// =============================================================================
// STEP COMPONENTS
// Each step renders only its body content — the shared h2 lives in the wizard
// wrapper so there is exactly one id="migration-wizard-heading" in the DOM.
// =============================================================================

const IntroStep = ({ onStart }: { onStart: () => void }) => {
  const { t } = useTranslation();

  return (
    <div className="flex flex-col items-center text-center gap-6">
      {/* Migration animation: cloud to phone */}
      <div className="relative flex items-center justify-center gap-4 w-full max-w-[260px] mx-auto h-[120px]">
        {/* Cloud */}
        <div className="flex flex-col items-center gap-1.5 shrink-0">
          <svg width="64" height="52" viewBox="0 0 64 52" fill="none" aria-hidden="true">
            <path d="M20 40C13.3726 40 8 34.6274 8 28C8 21.3726 13.3726 16 20 16C21.2686 16 22.4916 16.1986 23.6378 16.5672C25.5308 12.6274 29.5726 10 34 10C40.6274 10 46 15.3726 46 22C46 22.3407 45.9862 22.6782 45.9593 23.0119C50.7275 24.2763 54 28.6526 54 33.8C54 40.0751 49.0751 45 42.8 45H20Z" fill="#0B75C2" fillOpacity="0.1" stroke="#0B75C2" strokeWidth="2"/>
            <line x1="22" y1="26" x2="40" y2="26" stroke="#0B75C2" strokeWidth="1.5" strokeOpacity="0.5"/>
            <line x1="22" y1="31" x2="36" y2="31" stroke="#0B75C2" strokeWidth="1.5" strokeOpacity="0.5"/>
            <line x1="22" y1="36" x2="38" y2="36" stroke="#0B75C2" strokeWidth="1.5" strokeOpacity="0.5"/>
          </svg>
        </div>

        {/* Animated dots + arrow */}
        <div className="flex flex-col items-center gap-1.5">
          <div className="flex gap-1.5 items-center">
            {[0, 1, 2].map((i) => (
              <div
                key={i}
                className="w-2 h-2 rounded-full bg-budget-blue"
                style={{
                  animation: 'migration-dot 1.2s ease-in-out infinite',
                  animationDelay: `${i * 0.2}s`,
                }}
              />
            ))}
          </div>
          <svg width="52" height="10" viewBox="0 0 52 10" fill="none" aria-hidden="true">
            <path d="M0 5 L44 5" stroke="#1E90FF" strokeWidth="1.5" strokeDasharray="4 2"/>
            <path d="M40 1 L48 5 L40 9" fill="#1E90FF"/>
          </svg>
        </div>

        {/* Phone */}
        <div className="flex flex-col items-center gap-1.5 shrink-0">
          <svg width="38" height="64" viewBox="0 0 38 64" fill="none" aria-hidden="true">
            <rect x="1" y="1" width="36" height="62" rx="5" fill="#0B75C2" fillOpacity="0.08" stroke="#0B75C2" strokeWidth="2"/>
            <rect x="12" y="5" width="14" height="2" rx="1" fill="#0B75C2" fillOpacity="0.3"/>
            <circle cx="19" cy="57" r="3" fill="#0B75C2" fillOpacity="0.3"/>
            <line x1="7" y1="15" x2="31" y2="15" stroke="#0B75C2" strokeWidth="1.5" strokeOpacity="0.5"/>
            <line x1="7" y1="22" x2="27" y2="22" stroke="#0B75C2" strokeWidth="1.5" strokeOpacity="0.5"/>
            <line x1="7" y1="29" x2="31" y2="29" stroke="#0B75C2" strokeWidth="1.5" strokeOpacity="0.5"/>
            <line x1="7" y1="36" x2="23" y2="36" stroke="#0B75C2" strokeWidth="1.5" strokeOpacity="0.5"/>
          </svg>
        </div>

        <style>{`
          @keyframes migration-dot {
            0%, 100% { opacity: 0.2; transform: scale(0.8); }
            50% { opacity: 1; transform: scale(1.2); }
          }
        `}</style>
      </div>

      <div className="space-y-3 text-sm text-gray-500 dark:text-gray-400 leading-relaxed">
        <div className="space-y-1.5 text-left">
          <p className="font-semibold text-gray-700 dark:text-gray-200">
            {t('migration.who_needs_this_title')}
          </p>
          <p className="text-gray-600 dark:text-gray-300">
            {t('migration.who_needs_this_body')}
          </p>
        </div>
      </div>
      <Button
        onClick={onStart}
        className="w-full h-[54px] bg-budget-blue hover:bg-budget-blue/90 text-white rounded-[8px] font-bold"
        data-testid="migration-start-button"
      >
        {t('migration.start')}
      </Button>
    </div>
  );
};

const CredentialsStep = ({
  onConnect,
  error,
  loading,
}: {
  onConnect: (email: string, password: string) => void;
  error: string | null;
  loading: boolean;
}) => {
  const { t } = useTranslation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [emailError, setEmailError] = useState('');
  const [passwordError, setPasswordError] = useState('');

  const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  const validateEmail = (val: string) => {
    if (!val.trim()) return t('migration.error_email_required');
    if (!EMAIL_RE.test(val.trim())) return t('migration.error_email_invalid');
    return '';
  };

  const validatePassword = (val: string) => {
    if (!val) return t('migration.error_password_required');
    return '';
  };

  /** Map raw backend error strings to user-friendly messages */
  const friendlyError = (raw: string | null): string | null => {
    if (!raw) return null;
    const lower = raw.toLowerCase();
    if (
      lower.includes('unable to log in') ||
      lower.includes('invalid credentials') ||
      lower.includes('no active account') ||
      lower.includes('not found') ||
      lower.includes('migration aborted')
    )
      return t('migration.error_invalid_credentials');
    if (lower.includes('network') || lower.includes('failed to fetch') || lower.includes('err_'))
      return t('migration.error_network');
    if (lower.includes('http 5') || lower.includes('server error'))
      return t('migration.error_server');
    return t('migration.error_invalid_credentials'); // safe fallback — most errors are auth-related
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const eErr = validateEmail(email);
    const pErr = validatePassword(password);
    setEmailError(eErr);
    setPasswordError(pErr);
    if (eErr || pErr) return;
    onConnect(email.trim(), password);
    setPassword('');
  };

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-5" noValidate>
      <div className="space-y-2 text-sm text-gray-500 dark:text-gray-400">
        <p>{t('migration.credentials_description')}</p>
        <p className="text-xs leading-relaxed text-gray-400 dark:text-gray-500">
          {t('migration.credentials_security_note')}
        </p>
      </div>

      <div className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="migration-email" className="text-sm font-medium text-black dark:text-white">
            {t('email')}
          </Label>
          <Input
            id="migration-email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => { setEmail(e.target.value); if (emailError) setEmailError(validateEmail(e.target.value)); }}
            onBlur={() => setEmailError(validateEmail(email))}
            placeholder={t('email_placeholder')}
            disabled={loading}
            required
            aria-describedby={emailError ? 'migration-email-error' : error ? 'migration-error' : undefined}
            aria-invalid={!!emailError}
            className="rounded-[8px] h-11 bg-gray-50 dark:bg-white/10 border-gray-200 dark:border-white/10 text-black dark:text-white placeholder:text-gray-400 dark:placeholder:text-gray-500"
            data-testid="migration-email-input"
          />
          {emailError && (
            <p id="migration-email-error" className="text-xs text-budget-red mt-1" role="alert">{emailError}</p>
          )}
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="migration-password" className="text-sm font-medium text-black dark:text-white">
            {t('migration.password')}
          </Label>
          <div className="relative">
            <Input
              id="migration-password"
              type={showPassword ? 'text' : 'password'}
              autoComplete="current-password"
              value={password}
              onChange={(e) => { setPassword(e.target.value); if (passwordError) setPasswordError(validatePassword(e.target.value)); }}
              onBlur={() => setPasswordError(validatePassword(password))}
              placeholder={t('migration.password_placeholder')}
              disabled={loading}
              required
              aria-describedby={passwordError ? 'migration-password-error' : error ? 'migration-error' : undefined}
              aria-invalid={!!passwordError}
              className="rounded-[8px] h-11 bg-gray-50 dark:bg-white/10 border-gray-200 dark:border-white/10 text-black dark:text-white placeholder:text-gray-400 dark:placeholder:text-gray-500 pr-11"
              data-testid="migration-password-input"
            />
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors"
              aria-label={showPassword ? t('migration.password_hide') : t('migration.password_show')}
              tabIndex={-1}
            >
              {showPassword
                ? <EyeOff className="w-4 h-4" aria-hidden="true" />
                : <Eye className="w-4 h-4" aria-hidden="true" />
              }
            </button>
          </div>
          {passwordError && (
            <p id="migration-password-error" className="text-xs text-budget-red mt-1" role="alert">{passwordError}</p>
          )}
        </div>
      </div>

      {error && (
        <div
          id="migration-error"
          role="alert"
          className="flex items-start gap-2 p-3 rounded-[8px] bg-red-50 dark:bg-budget-red/10 border border-red-200 dark:border-budget-red/25"
        >
          <XCircle className="w-4 h-4 text-budget-red mt-0.5 shrink-0" aria-hidden="true" />
          <p className="text-sm text-budget-red">{friendlyError(error)}</p>
        </div>
      )}

      <Button
        type="submit"
        disabled={loading}
        className="w-full h-[54px] bg-budget-blue hover:bg-budget-blue/90 text-white rounded-[8px] font-bold disabled:opacity-50"
        data-testid="migration-connect-button"
      >
        {loading ? (
          <span className="flex items-center gap-2">
            <Spinner size={18} />
            {t('migration.connecting')}
          </span>
        ) : (
          t('migration.connect')
        )}
      </Button>
    </form>
  );
};

// =============================================================================
// PROGRESS STEP
// =============================================================================

// Only show 3 user-facing steps — TRANSFORMING is internal and hidden
const VISIBLE_STEPS: Array<MigrationStep['step']> = [
  'AUTHENTICATING',
  'FETCHING',
  'IMPORTING',
];

// Step-specific animated icons
const StepIcon = ({ step, isDone, isActive }: { step: string; isDone: boolean; isActive: boolean }) => {
  if (isDone) {
    return <CheckCircle className="w-6 h-6 text-budget-category-green" aria-hidden="true" />;
  }
  if (!isActive) {
    return <div className="w-5 h-5 rounded-full border-2 border-gray-300 dark:border-white/20" aria-hidden="true" />;
  }

  // Active step — unique animated icon per step
  if (step === 'AUTHENTICATING') {
    // Lock with pulsing ring
    return (
      <div className="relative w-6 h-6 flex items-center justify-center" aria-hidden="true">
        <div className="absolute inset-0 rounded-full border-2 border-budget-blue animate-ping opacity-30" />
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#1E90FF" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
          <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
        </svg>
      </div>
    );
  }
  if (step === 'FETCHING') {
    // Cloud with animated download arrow
    return (
      <div className="relative w-6 h-6 flex items-center justify-center" aria-hidden="true">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#1E90FF" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="8 17 12 21 16 17" style={{ animation: 'fetch-arrow 1s ease-in-out infinite' }}/>
          <line x1="12" y1="12" x2="12" y2="21" style={{ animation: 'fetch-arrow 1s ease-in-out infinite' }}/>
          <path d="M20.88 18.09A5 5 0 0 0 18 9h-1.26A8 8 0 1 0 3 16.29"/>
        </svg>
        <style>{`
          @keyframes fetch-arrow {
            0%, 100% { opacity: 0.3; transform: translateY(-2px); }
            50% { opacity: 1; transform: translateY(2px); }
          }
        `}</style>
      </div>
    );
  }
  if (step === 'IMPORTING') {
    // Database with pulsing dots
    return (
      <div className="relative w-6 h-6 flex items-center justify-center" aria-hidden="true">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#1E90FF" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <ellipse cx="12" cy="5" rx="9" ry="3"/>
          <path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"/>
          <path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"/>
        </svg>
        <div className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-budget-blue animate-ping opacity-75" />
      </div>
    );
  }
  return <Spinner size={24} />;
};

const ProgressStep = ({ currentStep }: { currentStep: MigrationStep | null }) => {
  const { t } = useTranslation();

  const stepLabels: Record<string, string> = {
    AUTHENTICATING: t('migration.step_authenticating'),
    FETCHING: t('migration.step_fetching'),
    IMPORTING: t('migration.step_importing'),
  };

  // Map internal steps to user-facing visible steps to prevent progress bar jumps
  const visibleStep =
    currentStep?.step === 'TRANSFORMING'
      ? 'FETCHING'
      : currentStep?.step === 'DETECTING' || currentStep?.step === 'PUSHING'
      ? 'IMPORTING'
      : currentStep?.step;

  const activeIndex = visibleStep ? VISIBLE_STEPS.indexOf(visibleStep as MigrationStep['step']) : -1;

  const progressValue = activeIndex >= 0
    ? Math.round(((activeIndex + 0.5) / VISIBLE_STEPS.length) * 100)
    : 0;

  return (
    <div className="flex flex-col gap-6">
      <p className="text-sm text-gray-500 dark:text-gray-400">
        {t('migration.progress_description')}
      </p>

      <Progress
        value={progressValue}
        className="h-2 bg-gray-200 dark:bg-white/10 [&>div]:bg-budget-blue"
        aria-label={t('migration.progress_title')}
      />

      <div className="space-y-3" role="status" aria-live="polite">
        {VISIBLE_STEPS.map((step, index) => {
          const isDone = activeIndex > index;
          const isActive = activeIndex === index;

          return (
            <div
              key={step}
              className="flex items-center gap-3 p-3 rounded-[8px] bg-white dark:bg-white/10 shadow-sidebar-item"
            >
              <div className="w-8 h-8 flex items-center justify-center shrink-0">
                <StepIcon step={step} isDone={isDone} isActive={isActive} />
              </div>
              <span
                className={`text-sm font-medium ${
                  isDone
                    ? 'text-budget-category-green'
                    : isActive
                    ? 'text-black dark:text-white'
                    : 'text-gray-400 dark:text-gray-500'
                }`}
              >
                {stepLabels[step]}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
};

// =============================================================================
// RESULT STEP
// =============================================================================

const ResultStep = ({
  result,
  onDone,
  onRetry,
  platform = 'unknown',
}: {
  result: MigrationResult;
  onDone: (result: MigrationResult) => void;
  onRetry: () => void;
  platform?: string;
}) => {
  const { t } = useTranslation();

  const entityLabels: Array<{ key: keyof MigrationResult['imported']; label: string }> = [
    { key: 'accounts', label: t('accounts') },
    { key: 'transactions', label: t('transactions') },
    { key: 'categories', label: t('categories') },
    { key: 'limits', label: t('limits') },
    { key: 'templates', label: t('templates') },
    { key: 'recurringItems', label: t('recurring_items') },
    { key: 'savingsGoals', label: t('savings_goals') },
  ];

  const totalImported = Object.values(result.imported).reduce((sum, n) => sum + n, 0);
  const nothingNew = result.success && totalImported === 0;

  // User-facing message driven by the structured error code
  const errorCodeMessage = result.errorCode
    ? t(`migration.error_code_${result.errorCode}`, { defaultValue: t('migration.error_code_UNKNOWN') })
    : null;

  // Show "Contact Support" for codes that can't self-resolve.
  //
  // Triage rationale per code:
  //   ANDROID_FILE_COPY_FAILED  — user can retry; transient file-system issue, no support needed
  //   IOS_COREDATA_FILE_NOT_FOUND — message says "may already be migrated"; self-contained, no action for support
  //   NO_ACCOUNT_ACCESS         — legacy account has no data to migrate; self-contained, no action for support
  //   REALM_KEY_MISSING         — requires manual key recovery; support can assist → show link
  //   INTEGRITY_ERROR           — data is corrupt; user should retry, but support may need to investigate → show link (via UNKNOWN fallback)
  //   SCHEMA_MISMATCH           — message says "update the app"; support can't do more than that, but link is shown
  //                               so users have a channel if the update doesn't resolve it
  //   UNKNOWN                   — catch-all; always show link since we can't predict the cause
  const showSupportLink =
    result.errorCode === 'REALM_KEY_MISSING' ||
    result.errorCode === 'SCHEMA_MISMATCH' ||
    result.errorCode === 'UNKNOWN';

  const supportHref = result.errorCode
    ? buildSupportMailto(result.errorCode, platform, result.imported, result.errors)
    : '#';

  return (
    <div className="flex flex-col gap-6">
      <div className="flex justify-center">
        {result.success ? (
          <CheckCircle className="w-14 h-14 text-budget-category-green" aria-hidden="true" />
        ) : (
          <XCircle className="w-14 h-14 text-budget-red" aria-hidden="true" />
        )}
      </div>

      <p className="text-sm text-gray-500 dark:text-gray-400 text-center">
        {nothingNew
          ? t('migration.result_nothing_new')
          : result.success
          ? t('migration.result_success_description')
          : t('migration.result_failure_description')}
      </p>

      {/* Error code message — same style as the credentials-step error block */}
      {!result.success && errorCodeMessage && (
        <div
          role="alert"
          className="flex items-start gap-2 p-3 rounded-[8px] bg-red-50 dark:bg-budget-red/10 border border-red-200 dark:border-budget-red/25"
        >
          <XCircle className="w-4 h-4 text-budget-red mt-0.5 shrink-0" aria-hidden="true" />
          <div className="flex flex-col gap-1.5">
            <p className="text-sm text-budget-red">{errorCodeMessage}</p>
            {showSupportLink && (
              <a
                href={supportHref}
                className="inline-flex items-center gap-1.5 text-xs text-budget-red underline underline-offset-2 hover:opacity-80"
                data-testid="migration-support-link"
              >
                <Mail className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                {t('migration.contact_support')}
              </a>
            )}
          </div>
        </div>
      )}

      {/* Only show the summary table when there's something to show */}
      {!nothingNew && (
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500">
            {t('migration.imported_summary')}
          </p>
          <div className="rounded-[8px] overflow-hidden border border-gray-200 dark:border-white/10 shadow-sidebar-item">
            {entityLabels.map(({ key, label }, index) => (
              <div
                key={key}
                className={`flex items-center justify-between px-4 py-3 text-sm bg-white dark:bg-white/10 ${
                  index < entityLabels.length - 1 ? 'border-b border-gray-100 dark:border-white/10' : ''
                }`}
              >
                <span className="text-gray-600 dark:text-gray-300">{label}</span>
                <span className="font-semibold text-black dark:text-white">
                  {result.imported[key]}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="flex gap-3">
        {!result.success && (
          <Button
            onClick={onRetry}
            variant="outline"
            className="flex-1 h-[54px] rounded-[8px] bg-[#D7DDE4] dark:bg-white/10 border-0 text-black dark:text-white font-bold hover:bg-gray-300 dark:hover:bg-white/20"
            data-testid="migration-retry-button"
          >
            <RefreshCw className="w-4 h-4 mr-2" aria-hidden="true" />
            {t('migration.retry')}
          </Button>
        )}
        <Button
          onClick={() => onDone(result)}
          className="flex-1 h-[54px] bg-budget-blue hover:bg-budget-blue/90 text-white rounded-[8px] font-bold"
          data-testid="migration-done-button"
        >
          {t('migration.done')}
        </Button>
      </div>
    </div>
  );
};

// =============================================================================
// HEADING MAP — single source of truth for the wizard's current title
// =============================================================================

const STEP_HEADING_KEY: Record<WizardStep, string> = {
  intro: 'migration.intro_title',
  credentials: 'migration.credentials_title',
  progress: 'migration.progress_title',
  result: 'migration.result_success_title', // overridden below for failure
};

// =============================================================================
// MAIN WIZARD
// =============================================================================

export const MigrationWizard = ({ onMigrate, onDone, platform = 'unknown' }: MigrationWizardProps) => {
  const [step, setStep] = useState<WizardStep>('intro');
  const [currentProgress, setCurrentProgress] = useState<MigrationStep | null>(null);
  const [result, setResult] = useState<MigrationResult | null>(null);
  const [credentialError, setCredentialError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [retryCount, setRetryCount] = useState(0);
  const { t } = useTranslation();

  const handleConnect = async (email: string, password: string) => {
    setCredentialError(null);
    setLoading(true);
    // Show AUTHENTICATING immediately so the screen is never blank
    setCurrentProgress({ step: 'AUTHENTICATING' });
    setStep('progress');

    const STEP_DURATION_MS = 1500;
    const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

    const progressWithDelay = async (progressStep: MigrationStep) => {
      // COMPLETE is internal — skip it, we handle the transition ourselves
      if (progressStep.step === 'COMPLETE') return;

      // Show the step immediately
      setCurrentProgress(progressStep);

      // Hold it visible for the full duration before returning control to the service
      await sleep(STEP_DURATION_MS);
    };

    try {
      const migrationResult = await onMigrate(email, password, progressWithDelay, platform, retryCount);

      // The UI only shows the generic error-code message — surface the raw
      // error messages here so they are retrievable via remote DevTools/logcat.
      if (!migrationResult.success) {
        console.error(
          `Migration failed (code: ${migrationResult.errorCode ?? 'none'})`,
          migrationResult.errors,
        );
      }

      // After onMigrate returns, IMPORTING is the last visible step.
      // Give it one more full duration so the user sees it complete before result.
      await sleep(STEP_DURATION_MS);

      setResult(migrationResult);
      setStep('result');
    } catch (err) {
      const message = err instanceof Error ? err.message : t('migration.error_generic');
      setCredentialError(message);
      setStep('credentials');
    } finally {
      setLoading(false);
    }
  };

  const handleRetry = () => {
    setRetryCount((c) => c + 1);
    setResult(null);
    setCurrentProgress(null);
    setCredentialError(null);
    setStep('credentials');
  };

  // Resolve the single heading text for the current state
  const headingKey = step === 'result' && result && !result.success
    ? 'migration.result_failure_title'
    : step === 'result' && result && Object.values(result.imported).reduce((s, n) => s + n, 0) === 0
    ? 'migration.result_nothing_new_title'
    : STEP_HEADING_KEY[step];

  return (
    <div className="w-full flex flex-col" role="region" aria-labelledby="migration-wizard-heading">
      <h2
        id="migration-wizard-heading"
        className="text-[32px] font-semibold leading-tight text-[#0b0b0b] dark:text-white text-center mb-8"
      >
        {t(headingKey)}
      </h2>

      {step === 'intro' && <IntroStep onStart={() => setStep('credentials')} />}
      {step === 'credentials' && (
        <CredentialsStep
          onConnect={handleConnect}
          error={credentialError}
          loading={loading}
        />
      )}
      {step === 'progress' && <ProgressStep currentStep={currentProgress} />}
      {step === 'result' && result && (
        <ResultStep result={result} onDone={onDone} onRetry={handleRetry} platform={platform} />
      )}    </div>
  );
};
