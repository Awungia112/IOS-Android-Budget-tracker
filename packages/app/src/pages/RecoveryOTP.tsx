import { useState, useRef, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useToast } from '@/components/ui/use-toast';
import type { RecoveryEnvelope } from '@budget/core';
import { RECOVERY_SERVER_URL } from '@/lib/api';

const LOGO_SRC = '/assets/deutschland.webp';

const RecoveryOTP = () => {
  const [otp, setOtp] = useState(['', '', '', '', '', '']);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isError, setIsError] = useState(false);
  const [attemptsRemaining, setAttemptsRemaining] = useState(5);
  const inputs = useRef<(HTMLInputElement | null)[]>([]);
  const navigate = useNavigate();
  const location = useLocation();
  const { t, i18n } = useTranslation();
  const { toast } = useToast();
  const email = location.state?.email || 'your@email.com';
  const emailHash = location.state?.emailHash as string | undefined;

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
      // Dev/test mock — only active in explicit test mode, never in production
      if (import.meta.env.MODE === 'test') {
        const isMockSuccess = code === '654321';
        if (isMockSuccess) {
          // Pass a mock envelope so RecoveryCode can test the decryption path
          navigate('/recovery/code', { state: { email, emailHash } });
        } else {
          const remaining = attemptsRemaining - 1;
          setAttemptsRemaining(remaining);
          setIsError(true);
          setOtp(['', '', '', '', '', '']);
          inputs.current[0]?.focus();
          toast({
            title: t('error'),
            description: t('recovery.error_otp_wrong', { attempts: remaining }),
            variant: 'destructive',
          });
          if (remaining <= 0) {
            toast({ title: t('error'), description: t('recovery.error_otp_locked'), variant: 'destructive' });
            navigate('/recovery');
          }
        }
        return;
      }

      if (!emailHash) {
        toast({ title: t('error'), description: t('recovery.error_network'), variant: 'destructive' });
        navigate('/recovery');
        return;
      }

      if (!RECOVERY_SERVER_URL) {
        toast({ title: t('error'), description: t('recovery.error_server_not_configured'), variant: 'destructive' });
        navigate('/recovery');
        return;
      }

      const response = await fetch(`${RECOVERY_SERVER_URL}/v1/recovery/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email_hash: emailHash, code }),
      });

      if (response.status === 429) {
        toast({ title: t('error'), description: t('recovery.error_otp_locked'), variant: 'destructive' });
        navigate('/recovery');
        return;
      }

      if (response.status === 401) {
        const body = await response.json().catch(() => ({})) as { attempts_remaining?: number };
        const remaining = body.attempts_remaining ?? attemptsRemaining - 1;
        setAttemptsRemaining(remaining);
        setIsError(true);
        setOtp(['', '', '', '', '', '']);
        inputs.current[0]?.focus();
        toast({
          title: t('error'),
          description: remaining > 0
            ? t('recovery.error_otp_wrong', { attempts: remaining })
            : t('recovery.error_otp_locked'),
          variant: 'destructive',
        });
        if (remaining <= 0) {
          navigate('/recovery');
        }
        return;
      }

      if (!response.ok) {
        throw new Error(`verify_failed_${response.status}`);
      }

      const { encrypted_private_key } = await response.json() as { encrypted_private_key: RecoveryEnvelope };
      navigate('/recovery/code', { state: { email, emailHash, envelope: encrypted_private_key } });
    } catch (err) {
      setIsError(true);
      toast({ title: t('error'), description: t('recovery.error_network'), variant: 'destructive' });
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
          className="px-3 py-1.5 mt-2 rounded-full bg-white border border-black/10 text-[13px] font-semibold text-[#0b0b0b] hover:bg-gray-50 transition-colors shadow-sm"
        >
          {i18n.language === 'de' ? 'EN' : 'DE'}
        </button>
      </div>

      <div className="flex-1 flex flex-col items-center justify-center px-10 pb-20">
        <div className="w-full max-w-[360px] text-center">
          <h1 className="text-[32px] font-bold text-[#0b0b0b] mb-2 leading-tight break-words">
            {t('recovery.otp_title')}
          </h1>
          <p className="text-[16px] text-[#0b0b0b]/70 leading-[21px] mb-12">
            {t('recovery.otp_subtitle')}
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

export default RecoveryOTP;
