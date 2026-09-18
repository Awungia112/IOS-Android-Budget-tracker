import { useState, useRef, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useToast } from '@/components/ui/use-toast';
import { API_BASE_URL, nativeFetch } from '@/lib/api';

const LOGO_SRC = '/assets/deutschland.webp';

const RegistrationOTP = () => {
  const [otp, setOtp] = useState(['', '', '', '', '', '']);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isError, setIsError] = useState(false);
  const inputs = useRef<(HTMLInputElement | null)[]>([]);
  const navigate = useNavigate();
  const location = useLocation();
  const { t, i18n } = useTranslation();
  const { toast } = useToast();
  const email = location.state?.email || 'your@email.com';
  const email_hash = location.state?.email_hash;
  const isAlreadyRegistered = location.state?.isAlreadyRegistered === true;

  useEffect(() => {
    inputs.current[0]?.focus();
  }, []);

  const handleChange = (index: number, value: string) => {
    if (!/^\d*$/.test(value)) return;
    const newOtp = [...otp];
    newOtp[index] = value.slice(-1);
    setOtp(newOtp);
    setIsError(false);
    if (value && index < 5) {
      inputs.current[index + 1]?.focus();
    }
    if (index === 5 && value) {
      handleVerify(newOtp.join(''));
    }
  };

  const handleKeyDown = (index: number, e: React.KeyboardEvent) => {
    if (e.key === 'Backspace' && !otp[index] && index > 0) {
      inputs.current[index - 1]?.focus();
    }
  };

  const handleVerify = async (code: string) => {
    setIsSubmitting(true);
    setIsError(false);

    try {
      // Fetch nonce for replay protection
      const nonceResponse = await nativeFetch(`${API_BASE_URL}/v1/nonce`);
      if (!nonceResponse.ok) throw new Error('nonce_failed');
      const { nonce } = await nonceResponse.json();

      const response = await nativeFetch(`${API_BASE_URL}/v1/auth/verify-code`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'x-nonce': nonce,
          'x-timestamp': Date.now().toString(),
        },
        body: JSON.stringify({ email_hash, email, code }),
      });

      if (!response.ok) {
        setIsError(true);
        setOtp(['', '', '', '', '', '']);
        inputs.current[0]?.focus();
        const errorData = await response.json().catch(() => ({}));
        toast({
          title: t('registration.verify_error'),
          description: errorData.error === 'invalid_code' 
            ? t('registration.otp_invalid') 
            : errorData.error === 'code_expired'
            ? t('registration.otp_expired')
            : t('registration.network_error'),
          variant: 'destructive',
        });
        return;
      }

      const data = await response.json();
      const emailHash = data.user.email_hash || email_hash;

      localStorage.setItem('session_token', data.token);
      localStorage.setItem('emailHash', emailHash);
      localStorage.setItem('userId', emailHash); // Used as key for PrivateKeyStore
      localStorage.setItem('userEmail', email); // Used for self-invite check in sharing
      localStorage.setItem('onboardingComplete', 'true');
      
      navigate('/register/success', { state: { isAlreadyRegistered } });
    } catch (err) {
      setIsError(true);
      console.error('OTP verification error:', err);
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
        <div className="w-full max-w-[360px] text-center">
          <h1 className="text-[32px] font-bold text-[#0b0b0b] mb-2 leading-tight">
            {t('registration.otp_title')}
          </h1>
          <p className="text-[16px] text-[#0b0b0b]/70 leading-[21px] mb-12">
            {t('registration.otp_subtitle')}
            <br />
            <span className="font-semibold text-[#0b0b0b]">{email}</span>
          </p>

          <div className={`flex justify-center gap-2 mb-10 ${isError ? 'animate-shake' : ''}`}>
            {otp.map((digit, i) => (
              <input
                key={i}
                ref={(el) => (inputs.current[i] = el)}
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={1}
                value={digit}
                onChange={(e) => handleChange(i, e.target.value)}
                onKeyDown={(e) => handleKeyDown(i, e)}
                disabled={isSubmitting}
                aria-label={t('registration.otp_digit_label', { number: i + 1 })}
                className={`w-12 h-16 text-center text-2xl font-bold rounded-[12px] border-2 transition-all ${
                  isError 
                  ? 'border-red-500 bg-red-50 text-red-600' 
                  : 'border-gray-200 bg-white text-[#0b0b0b] focus:border-[#0b75c2] focus:ring-1 focus:ring-[#0b75c2]'
                }`}
              />
            ))}
          </div>

          <div className="space-y-4">
            <div className="h-4 flex items-center justify-center">
              {isSubmitting && (
                <div className="flex items-center gap-2">
                  <div className="w-4 h-4 border-2 border-[#0b75c2]/30 border-t-[#0b75c2] rounded-full animate-spin" />
                  <span className="text-sm font-medium text-[#0b75c2]">{t('loading')}</span>
                </div>
              )}
            </div>

            <button
              onClick={() => navigate(-1)}
              className="w-full h-[58px] rounded-[12px] bg-transparent text-[#0b0b0b]/60 font-semibold text-[15px] font-['Inter',sans-serif] hover:bg-gray-50 transition-colors"
            >
              {t('back')}
            </button>

            <button
              onClick={() => navigate('/recovery')}
              className="w-full h-[58px] bg-transparent text-[#0b75c2] font-semibold text-[14px] font-['Inter',sans-serif] hover:underline transition-all"
            >
              {t('onboarding_recover')}
            </button>
          </div>
        </div>
      </div>

      <style dangerouslySetInnerHTML={{ __html: `
        @keyframes shake {
          0%, 100% { transform: translateX(0); }
          25% { transform: translateX(-8px); }
          50% { transform: translateX(8px); }
          75% { transform: translateX(-8px); }
        }
        .animate-shake {
          animation: shake 0.4s ease-in-out;
        }
      `}} />
    </div>
  );
};

export default RegistrationOTP;
