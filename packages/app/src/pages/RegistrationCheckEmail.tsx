import { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Mail } from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';
import { getPublicKey, publicKeyToBase64url } from '@budget/core';
import { API_BASE_URL } from '@/lib/api';

const LOGO_SRC = '/assets/deutschland.webp';

const RegistrationCheckEmail = () => {
  const [countdown, setCountdown] = useState(60);
  const [canResend, setCanResend] = useState(false);
  const [isResending, setIsResending] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const { t, i18n } = useTranslation();
  const { toast } = useToast();
  const email = location.state?.email || 'your@email.com';
  const email_hash = location.state?.email_hash;
  const isAlreadyRegistered = location.state?.isAlreadyRegistered === true;

  useEffect(() => {
    let timer: NodeJS.Timeout;
    if (countdown > 0) {
      timer = setTimeout(() => setCountdown(countdown - 1), 1000);
    } else {
      setCanResend(true);
    }
    return () => clearTimeout(timer);
  }, [countdown]);

  const handleResend = async () => {
    if (!canResend || isResending) return;

    setIsResending(true);
    try {
      // Fetch nonce for replay protection
      const nonceResponse = await fetch(`${API_BASE_URL}/v1/nonce`);
      if (!nonceResponse.ok) throw new Error('nonce_failed');
      const { nonce } = await nonceResponse.json();

      let public_key: string | undefined;
      // On sign-in flow the key may be stored ephemerally (RegistrationEmail
      // stores it on 409). Fall back to the keychain-stored key for register flow.
      const storedPublicKey = localStorage.getItem('pendingAuthPublicKey');
      if (storedPublicKey) {
        public_key = storedPublicKey;
      } else if (email_hash) {
        const pkBytes = await getPublicKey(email_hash);
        if (pkBytes) {
          public_key = publicKeyToBase64url(pkBytes);
        }
      }

      const response = await fetch(`${API_BASE_URL}/v1/auth/register`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'x-nonce': nonce,
          'x-timestamp': Date.now().toString(),
        },
        body: JSON.stringify({ email, public_key, language: i18n.language.split('-')[0] }),
      });

      // 409 Conflict means the user is already validated — the server rotated
      // the code and sent a new email. Treat it as success.
      if (!response.ok && response.status !== 409) {
        throw new Error('resend_failed');
      }

      setCountdown(60);
      setCanResend(false);
      toast({
        title: t('success'),
        description: t('registration.email_sent'),
      });
    } catch (err) {
      console.error('Resend error:', err);
      toast({
        title: t('error'),
        description: t('registration.network_error'),
        variant: 'destructive',
      });
    } finally {
      setIsResending(false);
    }
  };

  return (
    <div className="min-h-screen bg-white flex flex-col font-['Inter',sans-serif]">
      {/* Header: Logo + Language */}
      <div className="flex items-start justify-between px-9" style={{ paddingTop: 'calc(var(--safe-area-top, 0px) + 1.25rem)' }}>
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
            <div className="mx-auto w-20 h-20 flex items-center justify-center mb-8">
            <Mail className="w-10 h-10 text-[#0b75c2]" />
          </div>

          <h1 className="text-[32px] font-bold text-[#0b0b0b] mb-4 leading-tight">
            {t('registration.check_email_title')}
          </h1>
          <p className="text-[17px] text-[#0b0b0b]/70 leading-[24px] mb-10">
            {isAlreadyRegistered ? t('registration.check_email_body_already_registered', { email }) : t('registration.check_email_body', { email })}
          </p>

          <div className="space-y-4">
            <button
              onClick={() => {
                localStorage.removeItem('pendingAuthPublicKey');
                navigate('/register/otp', { state: { email, email_hash, isAlreadyRegistered } });
              }}
              className="w-full h-[58px] rounded-[12px] bg-[#0b75c2] text-white font-bold text-[16px] font-['Inter',sans-serif] hover:bg-[#0b75c2]/90 active:scale-[0.98] transition-all shadow-lg shadow-[#0b75c2]/20"
            >
              {t('registration.enter_code_manually')}
            </button>

            <button
              onClick={handleResend}
              disabled={!canResend || isResending}
              className={`w-full h-[58px] rounded-[12px] border border-gray-200 bg-white font-bold text-[16px] transition-all flex items-center justify-center gap-2 ${
                canResend && !isResending ? 'text-[#0b75c2] border-[#0b75c2]/20 hover:bg-gray-50' : 'text-gray-400 cursor-not-allowed'
              }`}
            >
              {isResending ? (
                <div className="w-5 h-5 border-2 border-gray-300 border-t-[#0b75c2] rounded-full animate-spin" />
              ) : canResend ? (
                t('registration.resend_code')
              ) : (
                t('registration.resend_countdown', { seconds: countdown })
              )}
            </button>

            <button
              onClick={() => {
                localStorage.removeItem('pendingAuthPublicKey');
                localStorage.removeItem('pendingAuthIntent');
                navigate(-1);
              }}
              className="w-full h-[58px] rounded-[12px] bg-transparent text-[#0b0b0b]/60 font-semibold text-[15px] font-['Inter',sans-serif] hover:bg-gray-50 transition-colors"
            >
              {t('back')}
            </button>

            <button
              onClick={() => {
                localStorage.removeItem('pendingAuthPublicKey');
                localStorage.removeItem('pendingAuthIntent');
                navigate('/recovery');
              }}
              className="w-full h-[58px] bg-transparent text-[#0b75c2] font-semibold text-[14px] font-['Inter',sans-serif] hover:underline transition-all"
            >
              {t('onboarding_recover')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default RegistrationCheckEmail;
