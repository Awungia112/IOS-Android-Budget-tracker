import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/components/ui/use-toast';
import { AlertCircle } from 'lucide-react';
import { RECOVERY_SERVER_URL } from '@/lib/api';

const LOGO_SRC = '/assets/deutschland.webp';

const RecoveryEmail = () => {
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const navigate = useNavigate();
  const { t, i18n } = useTranslation();
  const { toast } = useToast();

  const validateEmail = (value: string) => {
    const re = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
    return re.test(value);
  };

  const handleContinue = async () => {
    if (!email) {
      setError(t('registration.email_invalid'));
      return;
    }

    if (!validateEmail(email)) {
      setError(t('registration.email_invalid'));
      return;
    }

    setError('');
    setIsSubmitting(true);

    try {
      let emailHash = '';

      // Only call the server when a URL is configured
      if (RECOVERY_SERVER_URL) {
        const response = await fetch(`${RECOVERY_SERVER_URL}/v1/recovery/request`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          // Send only the raw email — the server computes the hash server-side
          // using the server-only pepper so it never appears in the client bundle.
          body: JSON.stringify({ email, language: i18n.language.split('-')[0] }),
        });

        if (response.status === 429) {
          toast({
            title: t('error'),
            description: t('recovery.error_rate_limited'),
            variant: 'destructive',
          });
          return;
        }

        if (!response.ok) {
          throw new Error(`request_failed_${response.status}`);
        }

         // Server returns the email_hash so the client can pass it to /verify
         // without ever knowing the pepper.
         const body = await response.json() as { status: string; email_hash?: string; registered?: boolean };

         if (body.registered === false) {
           setError(t('recovery.error_email_not_registered'));
           return; // stay on this screen, do not navigate to OTP
         }

         emailHash = body.email_hash ?? '';
      }

      navigate('/recovery/otp', { state: { email, emailHash } });
    } catch (err) {
      toast({
        title: t('error'),
        description: t('recovery.error_network'),
        variant: 'destructive',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-white dark:bg-white flex flex-col font-['Inter',sans-serif]">
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

      <div className="flex-1 flex flex-col items-center justify-center px-10 pb-20 bg-white">
        <div className="w-full max-w-[320px]">
          <h1 className="text-[32px] font-bold text-[#0b0b0b] text-center mb-2 leading-tight break-words">
            {t('recovery.email_title')}
          </h1>
          <p className="text-[16px] text-[#0b0b0b]/70 text-center leading-[21px] mb-8">
            {t('recovery.email_subtitle')}
          </p>

          {/* Pre-flow Warning */}
          <div className="mb-8 flex gap-3">
            <AlertCircle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
            <p className="text-[13px] leading-[18px] text-amber-900 font-medium">
              {t('recovery.pre_flow_warning')}
            </p>
          </div>

          <div className="space-y-6">
            <div className="space-y-1.5">
              <Label htmlFor="email" className="text-sm font-semibold text-[#0b0b0b] ml-1">
                {t('registration.email_label')}
              </Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  if (error) setError('');
                }}
                placeholder={t('registration.email_placeholder')}
                className={`rounded-[8px] h-14 border-gray-200 bg-white text-[#0b0b0b] text-base placeholder:text-gray-400 focus:border-[#0b75c2] focus:ring-1 focus:ring-[#0b75c2] transition-all ${
                  error ? 'border-red-500 bg-red-50' : ''
                }`}
                autoFocus
              />
              {error && (
                <p className="text-red-500 text-[13px] mt-1 ml-1 font-medium animate-in fade-in slide-in-from-top-1">
                  {error}
                </p>
              )}
            </div>

            <button
              onClick={handleContinue}
              disabled={isSubmitting}
              className="w-full h-[58px] rounded-[8px] bg-[#0b75c2] text-white font-bold text-[16px] font-['Inter',sans-serif] hover:bg-[#0b75c2]/90 active:scale-[0.98] transition-all shadow-lg shadow-[#0b75c2]/20 disabled:opacity-50 disabled:active:scale-100 flex items-center justify-center gap-2"
            >
              {isSubmitting ? (
                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                t('registration.continue')
              )}
            </button>

            <button
              onClick={() => navigate(-1)}
              className="w-full h-[58px] rounded-[8px] bg-white text-[#0b0b0b] font-bold text-[16px] font-['Inter',sans-serif] border border-black/10 hover:bg-black/5 active:scale-[0.98] transition-all"
            >
              {t('back')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default RecoveryEmail;
