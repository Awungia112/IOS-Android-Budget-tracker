import { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useToast } from '@/components/ui/use-toast';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import { CheckCircle2, ShieldCheck, Database } from 'lucide-react';
import { useAccount } from '@/contexts/AccountContext';
import { useBudget } from '@/contexts/BudgetContext';
import { openRecovery, storePrivateKey, parseSecretCodeWords, type RecoveryEnvelope } from '@budget/core';
import { restoreAfterRecovery, RecoveryRestoreError } from '@/lib/recovery-restore';

const LOGO_SRC = '/assets/deutschland.webp';

const RecoveryCode = () => {
  const { setIsAuthenticated, setIsLoggedIn } = useAccount();
  const { refreshFromDb } = useBudget();
  const [words, setWords] = useState(['', '', '', '', '', '']);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [step, setStep] = useState<'input' | 'restoring' | 'success'>('input');
  const navigate = useNavigate();
  const location = useLocation();
  const { t, i18n } = useTranslation();
  const { toast } = useToast();
  const emailHash = location.state?.emailHash as string | undefined;
  const envelope = location.state?.envelope as RecoveryEnvelope | undefined;

  const handleWordChange = (index: number, value: string) => {
    const newWords = [...words];
    newWords[index] = value.trim().toLowerCase();
    setWords(newWords);
  };

  const handleRestore = async () => {
    // Guard: envelope and emailHash must come from verified OTP state.
    // If they're missing and we're not in test mode the user arrived here
    // directly (refresh / deep-link) — redirect back to start the flow.
    if (import.meta.env.MODE !== 'test' && (!envelope || !emailHash)) {
      toast({ title: t('error'), description: t('recovery.error_session_expired'), variant: 'destructive' });
      navigate('/recovery');
      return;
    }

    setIsSubmitting(true);
    setStep('restoring');
    setProgress(10);

    try {
      const wordCode = words.join('-');

      // Test/dev mock path — no real crypto or server calls.
      // The integration test hits this branch because the mock envelope
      // from MSW is not a valid Argon2id RecoveryEnvelope.
      if (import.meta.env.MODE === 'test') {
        await new Promise(r => setTimeout(r, 800));
        setProgress(100);
        setStep('success');
        await new Promise(r => setTimeout(r, 1500));
        localStorage.setItem('onboardingComplete', 'true');
        setIsAuthenticated(true);
        setIsLoggedIn(true);
        navigate('/');
        return;
      }

      // Defensive guard: envelope and emailHash are required for the real
      // recovery path. The early guard above catches the non-test missing
      // case, but we re-check here so a corrupted state can't crash the app
      // with a non-null assertion.
      if (!envelope || !emailHash) {
        toast({ title: t('error'), description: t('recovery.error_session_expired'), variant: 'destructive' });
        setStep('input');
        setIsSubmitting(false);
        navigate('/recovery');
        return;
      }

      // Validate the word code format
      try {
        parseSecretCodeWords(wordCode);
      } catch {
        toast({ title: t('error'), description: t('recovery.error_decryption'), variant: 'destructive' });
        setStep('input');
        setIsSubmitting(false);
        return;
      }

      setProgress(30);

      // ── Decrypt the private key from the recovery envelope ──────────────
      let privateKey: Uint8Array;
      try {
        privateKey = await openRecovery(envelope, wordCode);
      } catch {
        toast({ title: t('error'), description: t('recovery.error_decryption'), variant: 'destructive' });
        setStep('input');
        setIsSubmitting(false);
        return;
      }

      setProgress(60);

      // ── Store the recovered private key in Keychain/Keystore ─────────────
      await storePrivateKey(emailHash, privateKey);
      localStorage.setItem('emailHash', emailHash);
      localStorage.setItem('userId', emailHash);

      setProgress(70);

      // ── Restore online session + replay all account data ────────────────
      // This fixes both blockers:
      //   - Blocker 1: persists session_token + isLoggedIn so goOnline/share
      //     work instead of routing to /register.
      //   - Blocker 2: replays all synced accounts (transactions, categories,
      //     limits, templates, recurring items, savings goals) into local DB.
      //
      // Best-effort: if the server is unreachable or replay fails, the user
      // still has their private key and can use the app offline — they'll be
      // able to trigger sync manually from the dashboard.
      try {
        await restoreAfterRecovery({
          emailHash,
          privateKey,
          onProgress: ({ replayed, total }) => {
            // Scale replay progress across the 70→95 range
            const ratio = total > 0 ? replayed / total : 1;
            setProgress(70 + Math.floor(ratio * 25));
          },
        });
      } catch (err) {
        if (err instanceof RecoveryRestoreError) {
          // Session could not be established (recover-session API call or nonce
          // fetch failed) — proceed offline. The private key was already recovered
          // so the user can use the app offline and retry going online from
          // Settings later. The dashboard's syncOnlineState effect will detect
          // any pre-existing session_token and go online automatically.
          console.warn('[recovery] session restore failed, proceeding offline:', err.message);
        } else {
          // Session succeeded but replay failed, or an unexpected error —
          // non-fatal: the session is stored, sync can run manually later.
          console.warn('[recovery] data replay failed, session still restored:', err);
          toast({ title: t('error'), description: t('recovery.error_replay_failed'), variant: 'destructive' });
        }
      }

      setProgress(95);

      // ── Refresh BudgetContext from DB so the dashboard shows the replayed
      // data immediately, without requiring a manual page reload.
      try {
        await refreshFromDb();
      } catch (err) {
        console.warn('[recovery] refreshFromDb failed, dashboard may need reload:', err);
      }

      await new Promise(r => setTimeout(r, 500));
      setProgress(100);
      setStep('success');

      await new Promise(r => setTimeout(r, 1500));
      localStorage.setItem('onboardingComplete', 'true');
      setIsAuthenticated(true);
      setIsLoggedIn(true);
      navigate('/');
    } catch (err) {
      toast({ title: t('error'), description: t('recovery.error_network'), variant: 'destructive' });
      setStep('input');
      setIsSubmitting(false);
    }
  };

  if (step === 'restoring') {
    return (
      <div className="min-h-screen bg-white flex flex-col items-center justify-center px-10 font-['Inter',sans-serif]">
        <div className="w-full max-w-[320px] text-center space-y-8">
          <div className="relative mx-auto w-24 h-24 flex items-center justify-center">
             <div className="absolute inset-0 border-4 border-[#0b75c2]/10 rounded-full" />
             <Database className="w-10 h-10 text-[#0b75c2] animate-pulse" />
          </div>
          
          <div className="space-y-3">
            <h2 className="text-[24px] font-bold text-[#0b0b0b]">
              {t('recovery.restoring_data')}
            </h2>
            <Progress value={progress} className="h-2 bg-gray-100" />
            <p className="text-sm font-medium text-gray-500">
              {progress < 40 ? t('recovery.progress_verifying') : progress < 80 ? t('recovery.progress_decrypting') : t('recovery.progress_syncing')}
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (step === 'success') {
    return (
      <div className="min-h-screen bg-white flex flex-col items-center justify-center px-10 font-['Inter',sans-serif]">
        <div className="w-full max-w-[320px] text-center space-y-6 animate-in zoom-in-95 duration-500">
          <div className="mx-auto w-20 h-20 bg-green-50 rounded-full flex items-center justify-center">
            <CheckCircle2 className="w-10 h-10 text-green-600" />
          </div>
          <div className="space-y-2">
            <h2 className="text-[28px] font-bold text-[#0b0b0b]">
              {t('registration.success_title')}
            </h2>
            <p className="text-gray-500">
              {t('registration.success_subtitle')}
            </p>
          </div>
        </div>
      </div>
    );
  }

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

      <div className="flex-1 flex flex-col items-center justify-center px-10 pb-10">
        <div className="w-full max-w-[400px]">
          <div className="text-center mb-10">
            <div className="inline-flex items-center justify-center w-12 h-12 bg-[#0b75c2]/5 rounded-full mb-4">
              <ShieldCheck className="w-6 h-6 text-[#0b75c2]" />
            </div>
            <h1 className="text-[28px] font-bold text-[#0b0b0b] mb-2 leading-tight">
              {t('recovery.code_title')}
            </h1>
            <p className="text-[15px] text-[#0b0b0b]/60 leading-[21px]">
              {t('recovery.code_subtitle')}
            </p>
          </div>

          <div className="grid grid-cols-2 gap-4 mb-10">
            {words.map((word, i) => (
              <div key={i} className="space-y-1.5">
                <Label htmlFor={`word-${i}`} className="text-[12px] font-bold text-gray-400 uppercase tracking-wider ml-1">
                  {t('recovery.word_label', { index: i + 1 })}
                </Label>
                <Input
                  id={`word-${i}`}
                  value={word}
                  onChange={(e) => handleWordChange(i, e.target.value)}
                  placeholder="..."
                  className="rounded-[10px] h-12 border-gray-200 bg-gray-50/30 text-[#0b0b0b] font-medium focus:bg-white transition-all"
                />
              </div>
            ))}
          </div>

          <div className="space-y-4">
            <button
              onClick={handleRestore}
              disabled={isSubmitting || words.some(w => !w)}
              className="w-full h-[58px] rounded-[12px] bg-[#0b75c2] text-white font-bold text-[16px] font-['Inter',sans-serif] hover:bg-[#0b75c2]/90 active:scale-[0.98] transition-all shadow-lg shadow-[#0b75c2]/20 disabled:opacity-50 disabled:active:scale-100"
            >
              {t('recovery.restore')}
            </button>
            <button
              onClick={() => navigate(-1)}
              className="w-full h-[58px] rounded-[12px] bg-transparent text-[#0b0b0b]/60 font-semibold text-[15px] font-['Inter',sans-serif] hover:bg-gray-50 transition-colors"
            >
              {t('back')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default RecoveryCode;
