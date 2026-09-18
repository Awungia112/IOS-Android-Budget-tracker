import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/components/ui/use-toast';
import { generateKeypair, publicKeyToBase64url, storePrivateKey, loadPrivateKey } from '@budget/core';
import { API_BASE_URL, nativeFetch } from '@/lib/api';

interface RegistrationEmailFormProps {
  /** 'signin' for the sign-in flow, undefined/omitted for registration */
  intent?: 'signin';
  /**
   * Called when a sign-in attempt fails with "email not registered",
   * so the parent (e.g. Account page) can switch to the register tab.
   * When not provided a "Register" link is shown inline instead.
   */
  onSwitchToRegister?: () => void;
  /**
   * Called instead of navigate(-1) when the back button is clicked.
   * When not provided the component calls navigate(-1) directly.
   */
  onBack?: () => void;
  /**
   * When true, the back button is hidden (useful when rendered inside a tab
   * that already has navigation context).
   */
  hideBack?: boolean;
}

const RegistrationEmailForm = ({
  intent,
  onSwitchToRegister,
  onBack,
  hideBack = false,
}: RegistrationEmailFormProps) => {
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showRegisterLink, setShowRegisterLink] = useState(false);
  const navigate = useNavigate();
  const { t, i18n } = useTranslation();
  const { toast } = useToast();

  const validateEmail = (value: string) => {
    // Simple email validation - checks for basic structure: local@domain.tld
    // Uses a safer regex pattern to avoid security/detect-unsafe-regex warning
    const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return re.test(value);
  };

  const handleContinue = async () => {
    if (!email || !validateEmail(email)) {
      setError(t('registration.email_invalid'));
      return;
    }

    setError('');
    setIsSubmitting(true);

    try {
      // 1. Generate unique keypair for this device
      const { publicKey, privateKey } = await generateKeypair();
      const public_key = publicKeyToBase64url(publicKey);

      // 2. Preflight — check whether the account exists and whether this device
      //    holds the private key before the server sends any email.
      try {
        const preflightResponse = await nativeFetch(`${API_BASE_URL}/v1/auth/preflight`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email }),
        });

        if (preflightResponse.ok) {
          const preflightData = await preflightResponse.json();

          if (preflightData.status === 'found') {
            const email_hash = preflightData.email_hash as string;
            const existingKey = await loadPrivateKey(email_hash).catch(() => null);
            if (!existingKey) {
              setError(t('registration.signin_new_device'));
              return;
            }
          } else if (intent === 'signin') {
            setError(t('registration.email_not_registered'));
            setShowRegisterLink(true);
            return;
          }
        }
        // Non-ok response — fall through to the register endpoint.
      } catch {
        // Genuine network error — fall through, never block new registration.
      }

      // 3. Fetch nonce for replay protection
      const nonceResponse = await nativeFetch(`${API_BASE_URL}/v1/nonce`);
      if (!nonceResponse.ok) throw new Error('nonce_failed');
      const { nonce } = await nonceResponse.json();

      // 4. Register / sign-in with the server
      const response = await nativeFetch(`${API_BASE_URL}/v1/auth/register`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-nonce': nonce,
          'x-timestamp': Date.now().toString(),
        },
        body: JSON.stringify({
          email,
          public_key,
          intent,
          language: i18n.language.split('-')[0],
        }),
      });

      if (response.status === 404) {
        setError(t('registration.email_not_registered'));
        setShowRegisterLink(true);
        return;
      }

      if (response.status === 200) {
        // Existing user — sign-in code sent. Do NOT call storePrivateKey here:
        // the freshly-generated keypair must not overwrite the stored device key,
        // because the recovery envelope on the recovery server is INSERT-ONLY and
        // would no longer be decryptable with the new key, silently breaking
        // account recovery for the user.
        const data = await response.json();
        const email_hash = data.email_hash;
        localStorage.setItem('userEmail', email);
        localStorage.setItem('pendingAuthIntent', 'signin');
        localStorage.setItem('pendingAuthPublicKey', public_key);
        navigate('/register/check-email', {
          state: { email, email_hash, isAlreadyRegistered: true },
        });
        return;
      }

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || 'registration_failed');
      }

      const { email_hash } = await response.json();

      try {
        await storePrivateKey(email_hash, privateKey);
      } catch {
        // Keychain unavailable — non-fatal
      }

      localStorage.setItem('userEmail', email);
      localStorage.setItem('pendingAuthIntent', 'register');
      navigate('/register/check-email', { state: { email, email_hash } });
    } catch (err) {
      console.error('Registration error:', err);
      toast({
        title: t('error'),
        description: t('registration.network_error'),
        variant: 'destructive',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Description block */}
      <div className="space-y-2">
        {intent === 'signin' && (
          <p className="text-[13px] font-semibold text-[#0b0b0b] dark:text-white text-center">
            {t('registration.security_note_title')}
          </p>
        )}
        <p className="text-[13px] text-[#0b0b0b]/60 dark:text-white/50 text-center leading-[18px]">
          {intent === 'signin'
            ? t('registration.signin_security_note')
            : t('registration.register_security_note')}
        </p>
        <p className="text-[13px] text-[#0b0b0b]/50 dark:text-white/40 text-center leading-[18px]">
          {t('registration.zero_knowledge_warning')}
        </p>
      </div>

      {/* Email input */}
      <div className="space-y-1.5">
        <Label
          htmlFor="reg-email"
          className="text-sm font-semibold text-[#0b0b0b] dark:text-white ml-1"
        >
          {t('registration.email_label')}
        </Label>
        <Input
          id="reg-email"
          type="email"
          value={email}
          onChange={(e) => {
            setEmail(e.target.value);
            if (error) setError('');
            if (showRegisterLink) setShowRegisterLink(false);
          }}
          placeholder={t('registration.email_placeholder')}
          className={`rounded-[8px] h-14 border-gray-200 dark:border-white/10 bg-white dark:bg-white/5 text-[#0b0b0b] dark:text-white text-base placeholder:text-gray-400 focus:border-[#0b75c2] focus:ring-1 focus:ring-[#0b75c2] transition-all ${
            error ? 'border-red-500 bg-red-50 dark:bg-red-900/20' : ''
          }`}
          autoFocus
        />
        {error && (
          <p className="text-red-500 text-[13px] mt-1 ml-1 font-medium animate-in fade-in slide-in-from-top-1">
            {error}
          </p>
        )}
      </div>

      {/* Continue button */}
      <button
        onClick={handleContinue}
        disabled={isSubmitting}
        aria-label={t('registration.continue')}
        className="w-full h-[58px] rounded-[8px] bg-[#0b75c2] text-white font-bold text-[16px] hover:bg-[#0b75c2]/90 active:scale-[0.98] transition-all shadow-lg shadow-[#0b75c2]/20 disabled:opacity-50 disabled:active:scale-100 flex items-center justify-center gap-2"
      >
        {isSubmitting ? (
          <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
        ) : (
          t('registration.continue')
        )}
      </button>

      {/* Back button */}
      {!hideBack && (
        <button
          onClick={() => (onBack ? onBack() : navigate(-1))}
          className="w-full h-[58px] rounded-[8px] bg-white dark:bg-white/5 text-[#0b0b0b] dark:text-white font-bold text-[16px] border border-black/10 dark:border-white/10 hover:bg-black/5 dark:hover:bg-white/10 active:scale-[0.98] transition-all"
        >
          {t('back')}
        </button>
      )}

      {/* Auxiliary links */}
      <div className="flex flex-col items-center gap-1 mt-2">
        {showRegisterLink && (
          <button
            onClick={() => {
              setError('');
              setShowRegisterLink(false);
              if (onSwitchToRegister) {
                onSwitchToRegister();
              } else {
                navigate('/register', { state: { intent: 'register', email } });
              }
            }}
            className="bg-transparent text-[#0b75c2] font-semibold text-[14px] hover:underline transition-all"
          >
            {t('registration.register_title')}
          </button>
        )}
        <button
          onClick={() => navigate('/recovery')}
          className="bg-transparent text-[#0b75c2] font-semibold text-[14px] hover:underline transition-all"
        >
          {t('onboarding_recover')}
        </button>
      </div>
    </div>
  );
};

export default RegistrationEmailForm;
