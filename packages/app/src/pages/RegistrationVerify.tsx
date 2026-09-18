import { useEffect, useState, useRef } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Loader2, AlertCircle, CheckCircle2 } from 'lucide-react';
import { useAccount } from '@/contexts/AccountContext';
import { useBudget } from '@/contexts/BudgetContext';
import { API_BASE_URL } from '@/lib/api';

const LOGO_SRC = '/assets/deutschland.webp';

const RegistrationVerify = () => {
  const [searchParams] = useSearchParams();
  const [status, setStatus] = useState<'verifying' | 'success' | 'error'>('verifying');
  const [errorHeader, setErrorHeader] = useState('');
  const [errorBody, setErrorBody] = useState('');
  const token = searchParams.get('token');
  const navigate = useNavigate();
  const { t, i18n } = useTranslation();
  const { setIsAuthenticated, setIsLoggedIn } = useAccount();
  const { requestRestoreOnlineAccounts, requestGoOnline } = useBudget();
  const verificationAttempted = useRef(false);

  useEffect(() => {
    if (verificationAttempted.current) return;
    verificationAttempted.current = true;

    if (!token) {
      setStatus('error');
      setErrorHeader(t('registration.verify_error'));
      setErrorBody(t('registration.link_invalid_or_expired'));
      return;
    }

    const verifyToken = async () => {
      try {
        // Step 1: Validate the token (GET /v1/auth/verify)
        // This is safe even if pre-fetched by email scanners
        const validateResponse = await fetch(`${API_BASE_URL}/v1/auth/verify?token=${encodeURIComponent(token)}`);
        
        if (!validateResponse.ok) {
          setStatus('error');
          setErrorHeader(t('registration.verify_error'));
          setErrorBody(t('registration.link_invalid_or_expired'));
          return;
        }

        // Step 2: Consume the token (POST /v1/auth/verify)
        // Replay protection is enforced here: fetch a fresh nonce
        const nonceResponse = await fetch(`${API_BASE_URL}/v1/nonce`);
        if (!nonceResponse.ok) throw new Error('nonce_failed');
        const { nonce } = await nonceResponse.json();

        const verifyResponse = await fetch(`${API_BASE_URL}/v1/auth/verify`, {
          method: 'POST',
          headers: { 
            'Content-Type': 'application/json',
            'x-nonce': nonce,
            'x-timestamp': Date.now().toString(),
          },
          body: JSON.stringify({ token }),
        });

        if (!verifyResponse.ok) {
          const errorData = await verifyResponse.json().catch(() => ({}));
          setStatus('error');
          setErrorHeader(t('registration.verify_error'));
          setErrorBody(
            errorData.error === 'token_expired'
              ? t('registration.link_invalid_or_expired')
              : t('registration.session_error')
          );
          return;
        }

        const data = await verifyResponse.json();
        const sessionToken = data.token;
        const emailHash = data.user.email_hash;

        // Store session token and identity for recovery
        localStorage.setItem('session_token', sessionToken);
        localStorage.setItem('emailHash', emailHash);
        localStorage.setItem('userId', emailHash); // Used as key for PrivateKeyStore
        localStorage.setItem('onboardingComplete', 'true');
        
        setStatus('success');
        
        // Preserve the flow intent so the success page knows whether to show
        // recovery code (register) or skip straight to dashboard (sign-in).
        const pendingIntent = localStorage.getItem('pendingAuthIntent') as 'signin' | 'register' | null;
        localStorage.removeItem('pendingAuthIntent');

        // Derive isAlreadyRegistered from the pending intent — sign-in means
        // the user already exists and already has a recovery code on this device.
        const isAlreadyRegistered = pendingIntent === 'signin';

        // Trigger restoreOnlineAccounts immediately (BudgetContext watches isLoggedIn)
        // so it can start fetching accounts from the server in the background.
        // Also call requestRestoreOnlineAccounts explicitly to handle the case where
        // isLoggedIn was already true (e.g. sign-in from the sidebar with a local account),
        // in which case the normal false→true transition in BudgetContext would not fire.
        setIsAuthenticated(true);
        setIsLoggedIn(true);
        if (isAlreadyRegistered) {
          requestRestoreOnlineAccounts();
          requestGoOnline();
        }

        // Brief delay before redirecting to success page
        setTimeout(() => {
          navigate('/register/success', { state: { isAlreadyRegistered } });
        }, 1500);

      } catch (err) {
        console.error('Verification error:', err);
        setStatus('error');
        setErrorHeader(t('error'));
        setErrorBody(t('registration.network_error'));
      }
    };

    verifyToken();
  }, [token, navigate, t, setIsAuthenticated, setIsLoggedIn, requestRestoreOnlineAccounts, requestGoOnline]);

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
        <div className="w-full max-w-[340px] text-center">
          {status === 'verifying' && (
            <>
              <div className="mx-auto w-20 h-20 bg-[#0b75c2]/10 rounded-full flex items-center justify-center mb-8">
                <Loader2 className="w-10 h-10 text-[#0b75c2] animate-spin" />
              </div>
              <h1 className="text-[28px] font-bold text-[#0b0b0b] mb-4 leading-tight">
                {t('registration.verify_title')}
              </h1>
              <p className="text-[17px] text-[#0b0b0b]/70 leading-[24px]">
                {t('registration.verifying')}
              </p>
            </>
          )}

          {status === 'success' && (
            <>
              <div className="mx-auto w-20 h-20 bg-green-50 rounded-full flex items-center justify-center mb-8">
                <CheckCircle2 className="w-10 h-10 text-green-500 animate-in zoom-in duration-300" />
              </div>
              <h1 className="text-[28px] font-bold text-[#0b0b0b] mb-4 leading-tight">
                {t('registration.verify_success')}
              </h1>
            </>
          )}

          {status === 'error' && (
            <>
              <div className="mx-auto w-20 h-20 bg-red-50 rounded-full flex items-center justify-center mb-8">
                <AlertCircle className="w-10 h-10 text-red-500" />
              </div>
              <h1 className="text-[28px] font-bold text-red-600 mb-4 leading-tight">
                {errorHeader}
              </h1>
              <p className="text-[17px] text-[#0b0b0b]/70 leading-[24px] mb-10">
                {errorBody}
              </p>
              <button
                onClick={() => navigate('/register')}
                className="w-full h-[58px] rounded-[12px] bg-[#0b75c2] text-white font-bold text-[16px] hover:bg-[#0b75c2]/90 active:scale-[0.98] transition-all shadow-lg shadow-[#0b75c2]/20"
              >
                {t('registration.retry')}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default RegistrationVerify;
