import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import Layout from '@/components/Layout';
import { MigrationWizard } from '@/components/MigrationWizard';
import {
  MigrationService,
  LegacyApiClient,
  LegacyDataTransformer,
} from '@budget/core';
import type { MigrationStep, MigrationResult } from '@budget/core';
import { extractPublicKeyFromToken, API_BASE_URL, createAppOnlineAccountsClient } from '@/lib/api';
import { budgetService } from '@/services/budgetServiceInstance';
import { useBudget } from '@/contexts/BudgetContext';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { CheckCircle, RefreshCw } from 'lucide-react';
import {
  isMigrationCompleted,
  markMigrationCompleted,
} from '@/lib/migrationStatus';
import {
  createDebugMigrationResult,
  getDebugOnlineMigrationScenario,
} from '@/lib/debugMigrationScenarios';
import { Capacitor } from '@capacitor/core';
import { setStoredCurrentAccountId } from '@/lib/accountStorage';

const LOGO_SRC = '/assets/deutschland-preview.png';

// Web/PWA routes legacy calls through the same-origin /legacy-api proxy to
// avoid CORS (the deployed web app cannot reach the legacy API directly — the
// legacy server returns no Access-Control-Allow-Origin). In dev, /legacy-api is
// the Vite proxy (vite.config.ts); in the deployed PWA it is a Cloudflare Pages
// Function (functions/legacy-api/[[path]].ts). Native builds bypass CORS via
// CapacitorHttp, so they use the absolute legacy origin directly.
const LEGACY_API_BASE = import.meta.env.DEV
  ? '/legacy-api'
  : Capacitor.isNativePlatform()
    ? 'https://www.mein-budget-app.de'
    : '/legacy-api';

const AVATAR_COLORS = [
  '#F5A623', '#4A90E2', '#7ED321', '#9B59B6',
  '#E74C3C', '#1ABC9C', '#E67E22', '#3498DB',
];

type ImportedAccount = MigrationResult['importedAccounts'][number];

// =============================================================================
// ACCOUNT PICKER OVERLAY
// Full-screen transparent overlay matching the legacy "Mein Budget" style:
// - Blurred dark backdrop over the current page
// - Floating carousel cards (no dialog box background)
// - Overview panel at the bottom listing all accounts
// =============================================================================

const AccountPickerOverlay = ({
  accounts,
  onSelect,
}: {
  accounts: ImportedAccount[];
  onSelect: (id: string) => void;
}) => {
  const { t } = useTranslation();
  const [activeIndex, setActiveIndex] = useState(0);
  const scrollRef = useRef<HTMLDivElement>(null);
  const GAP = 16;

  const handleScroll = () => {
    if (!scrollRef.current) return;
    const container = scrollRef.current;
    const containerLeft = container.getBoundingClientRect().left;
    const containerCenter = containerLeft + container.offsetWidth / 2;

    let closest = 0;
    let minDist = Infinity;
    Array.from(container.children).forEach((child, i) => {
      const rect = child.getBoundingClientRect();
      const cardCenter = rect.left + rect.width / 2;
      const dist = Math.abs(cardCenter - containerCenter);
      if (dist < minDist) {
        minDist = dist;
        closest = i;
      }
    });
    setActiveIndex(closest);
  };

  const entityLabels: Array<{ key: keyof ImportedAccount['counts']; label: string }> = [
    { key: 'transactions', label: t('transactions') },
    { key: 'categories', label: t('categories') },
    { key: 'limits', label: t('limits') },
    { key: 'templates', label: t('templates') },
    { key: 'recurringItems', label: t('recurring_items') },
    { key: 'savingsGoals', label: t('savings_goals') },
  ];

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col"
      style={{ background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(8px)' }}
    >
      {/* Title area */}
      <div className="flex-1 flex flex-col justify-end pb-4 px-4">
        <h2 className="text-center text-lg font-bold text-white mb-1">
          {t('migration.pick_account_title')}
        </h2>
        <p className="text-center text-xs text-white/70 mb-4">
          {t('migration.pick_account_description')}
        </p>

        {/* Carousel */}
        <div
          ref={scrollRef}
          onScroll={handleScroll}
          className="flex overflow-x-auto snap-x snap-mandatory"
          style={{
            scrollbarWidth: 'none',
            msOverflowStyle: 'none',
            gap: `${GAP}px`,
            paddingTop: '40px',
            paddingBottom: '8px',
            paddingLeft: '32px',
            paddingRight: '32px',
          }}
        >
          {accounts.map((account, i) => {
            const color = AVATAR_COLORS[i % AVATAR_COLORS.length];
            const isActive = i === activeIndex;
            return (
              <div
                key={account.id}
                className="snap-center shrink-0 relative"
                style={{ width: 'calc(100% - 64px)', minWidth: 'calc(100% - 64px)' }}
              >
                {/* Avatar overlapping top */}
                <div
                  className="absolute left-1/2 -translate-x-1/2 -top-8 w-16 h-16 rounded-full flex items-center justify-center text-white text-xl font-bold shadow-xl border-4 border-white dark:border-white/5 z-10"
                  style={{ backgroundColor: color }}
                >
                  {account.initials}
                </div>

                {/* Card */}
                <div
                  className={`w-full bg-white dark:bg-[#1A2124] border border-black/10 dark:border-white/10 rounded-[12px] shadow-sm flex flex-col items-center px-5 pt-12 pb-4 transition-all duration-200 ${
                    isActive ? 'opacity-100' : 'opacity-50 scale-95'
                  }`}
                >
                  <p className="text-sm font-bold text-black dark:text-white text-center mb-3">
                    {account.name}
                  </p>

                  <div className="w-full space-y-1.5 mb-4">
                    {entityLabels.map(({ key, label }) => (
                      <div key={key} className="flex justify-between text-xs">
                        <span className="text-gray-500 dark:text-gray-400">{label}</span>
                        <span className="font-semibold text-black dark:text-white">{account.counts[key]}</span>
                      </div>
                    ))}
                  </div>

                  <button
                    onClick={() => onSelect(account.id)}
                    className="w-full h-10 bg-budget-blue hover:bg-budget-blue/90 active:scale-95 text-white rounded-xl text-sm font-bold transition-all"
                  >
                    {t('migration.pick_account_select')}
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        {/* Dot indicators */}
        {accounts.length > 1 && (
          <div className="flex justify-center gap-1.5 mt-3">
            {accounts.map((_, i) => (
              <div
                key={i}
                className={`h-1.5 rounded-full transition-all duration-200 ${
                  i === activeIndex ? 'w-5 bg-budget-blue' : 'w-1.5 bg-white/40'
                }`}
              />
            ))}
          </div>
        )}
      </div>

      {/* Overview panel — all accounts summary */}
      <div className="mx-4 mb-8 rounded-[12px] bg-white dark:bg-[#1A2124] border border-black/10 dark:border-white/10 shadow-sm px-5 py-4">
        <p className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wide mb-3 text-center">
          {t('migration.overview_title')}
        </p>
        <div className="space-y-2">
          {accounts.map((account, i) => {
            const color = AVATAR_COLORS[i % AVATAR_COLORS.length];
            const total = Object.values(account.counts).reduce((s, n) => s + n, 0);
            const isActive = i === activeIndex;
            return (
              <div key={account.id} className="flex items-center gap-3">
                <div
                  className="w-6 h-6 rounded-full flex items-center justify-center text-white text-[10px] font-bold shrink-0"
                  style={{ backgroundColor: color }}
                >
                  {account.initials.substring(0, 1)}
                </div>
                <span className={`text-sm flex-1 ${isActive ? 'font-bold text-black dark:text-white' : 'text-gray-500 dark:text-gray-400'}`}>
                  {account.name}
                </span>
                <span className={`text-sm ${isActive ? 'font-bold text-black dark:text-white' : 'text-gray-400 dark:text-gray-500'}`}>
                  {total} {t('migration.overview_items')}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

// =============================================================================
// MIGRATION COMPLETION FLAG
// Scoped to the current account so each account tracks its own migration state.
// Helpers live in @/lib/migrationStatus — imported above.
// =============================================================================

// =============================================================================
// ALREADY MIGRATED SCREEN
// Shown when the user revisits /migration after a successful import.
// =============================================================================

const AlreadyMigratedScreen = ({
  onConfirmRerun,
  onGoBack,
}: {
  onConfirmRerun: () => void;
  onGoBack: () => void;
}) => {
  const { t } = useTranslation();
  const [confirming, setConfirming] = useState(false);

  if (confirming) {
    return (
      <div className="flex flex-col items-center px-6 py-8 gap-6 text-center">
        <p className="text-sm text-gray-500 dark:text-gray-400">
          {t('migration.rerun_warning')}
        </p>
        <div className="flex gap-3 w-full">
          <Button
            variant="outline"
            onClick={onGoBack}
            className="flex-1 h-[54px] rounded-[8px] bg-[#D7DDE4] dark:bg-white/10 border-0 text-black dark:text-white font-bold hover:bg-gray-300 dark:hover:bg-white/20"
          >
            {t('cancel')}
          </Button>
          <Button
            onClick={onConfirmRerun}
            className="flex-1 h-[54px] bg-budget-blue hover:bg-budget-blue/90 text-white rounded-[8px] font-bold"
          >
            {t('migration.rerun_confirm')}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center px-6 py-8 gap-6 text-center">
      <CheckCircle className="w-14 h-14 text-budget-category-green" aria-hidden="true" />
      <div>
        <h3 className="text-base font-bold text-black dark:text-white mb-1">
          {t('migration.already_migrated_title')}
        </h3>
        <p className="text-sm text-gray-500 dark:text-gray-400">
          {t('migration.already_migrated_description')}
        </p>
      </div>
      <div className="flex gap-3 w-full">
        <Button
          onClick={onGoBack}
          className="flex-1 h-[54px] bg-budget-blue hover:bg-budget-blue/90 text-white rounded-[8px] font-bold"
        >
          {t('back')}
        </Button>
        <Button
          variant="outline"
          onClick={() => setConfirming(true)}
          className="flex-1 h-[54px] rounded-[8px] bg-[#D7DDE4] dark:bg-white/10 border-0 text-black dark:text-white font-bold hover:bg-gray-300 dark:hover:bg-white/20"
        >
          <RefreshCw className="w-4 h-4 mr-2" aria-hidden="true" />
          {t('migration.rerun')}
        </Button>
      </div>
    </div>
  );
};

// =============================================================================
// MIGRATION PAGE
// =============================================================================

const MigrationPage = () => {
  const navigate = useNavigate();
  const { t, i18n } = useTranslation();
  const { currentAccount } = useBudget();

  const accountId = currentAccount?.id ?? 'default';
  const [alreadyMigrated, setAlreadyMigrated] = useState(false);
  const [forceRerun, setForceRerun] = useState(false);

  useEffect(() => {
    const debugScenario = getDebugOnlineMigrationScenario();
    if (debugScenario === 'already_migrated') {
      setAlreadyMigrated(true);
      return;
    }

    if (currentAccount?.id) {
      setAlreadyMigrated(isMigrationCompleted(currentAccount.id));
    }
  }, [currentAccount?.id]);

  const [pickerOpen, setPickerOpen] = useState(false);
  const [importedAccounts, setImportedAccounts] = useState<ImportedAccount[]>([]);

  const handleMigrate = async (
    email: string,
    password: string,
    onProgress: (step: MigrationStep) => Promise<void> | void,
    platform: string,
    retryCount: number,
  ): Promise<MigrationResult> => {
    const debugScenario = getDebugOnlineMigrationScenario();

    if (debugScenario === 'migration_error') {
      throw new Error('Debug online migration failure');
    }

    if (debugScenario === 'success_single_account' || debugScenario === 'success_multiple_accounts') {
      const result = createDebugMigrationResult(debugScenario === 'success_multiple_accounts' ? 2 : 1);
      await onProgress({ step: 'FETCHING', entity: 'accounts' });
      await onProgress({ step: 'IMPORTING_ENTITY', entity: 'accounts', current: result.imported.accounts, total: result.imported.accounts });
      await onProgress({ step: 'COMPLETE', result });
      return result;
    }

    const token = localStorage.getItem('session_token');
    const userPublicKey = token ? extractPublicKeyFromToken(token) : null;
    const client = token
      ? createAppOnlineAccountsClient({
          sessionToken: token,
          baseUrl: API_BASE_URL || window.location.origin,
        })
      : undefined;

    const pepper = (import.meta as any).env?.VITE_EMAIL_HASH_PEPPER ?? '';

    const pushProvider =
      client && userPublicKey
        ? {
            client,
            userPublicKey,
            emailHashPepper: pepper,
          }
        : undefined;

    const service = new MigrationService(
      new LegacyApiClient(LEGACY_API_BASE),
      new LegacyDataTransformer(),
      budgetService,
    );
    return service.migrate(email, password, onProgress, retryCount, platform, pushProvider);
  };

  const handleDone = (result: MigrationResult) => {
    // Set the completion flag for every imported account so that revisiting
    // /migration from any of those accounts shows the "You're All Set" screen.
    // We cannot use `accountId` here — it's the pre-migration account and the
    // user will be switched to one of the imported accounts after reload.
    if (result.success) {
      result.importedAccountIds.forEach(id => markMigrationCompleted(id));
    }

    // If any account was provisioned online, clear the offline-mode preference
    // before reload. Without this, BudgetContext's persist effect (which runs
    // after the login effect but before syncOnlineState) rewrites "true" back
    // into localStorage, causing syncOnlineState to see explicitlyOffline=true
    // and skip the online transition even when sync metadata exists.
    const hasOnlineAccounts =
      result.pushed.accounts > 0 ||
      result.importedAccounts.some(a => a.needsOnlinePush);
    if (hasOnlineAccounts) {
      localStorage.removeItem('budget-wise-offline-mode');
    }

    if (result.importedAccounts.length > 1) {
      setImportedAccounts(result.importedAccounts);
      setPickerOpen(true);
    } else {
      // Use the first imported account if available, otherwise keep the current account
      const firstId = result.importedAccountIds[0] ?? accountId;
      setStoredCurrentAccountId(firstId);
      navigate('/');
      window.location.reload();
    }
  };

  const handlePickAccount = (pickedAccountId: string) => {
    setPickerOpen(false);
    setStoredCurrentAccountId(pickedAccountId);

    // Same rationale as handleDone — clear offline preference so the app
    // transitions to online mode for the picked account after reload.
    const picked = importedAccounts.find(a => a.id === pickedAccountId);
    if (picked?.needsOnlinePush) {
      localStorage.removeItem('budget-wise-offline-mode');
    }

    navigate('/');
    window.location.reload();
  };

  const debugScenario = getDebugOnlineMigrationScenario();
  const showWizard = debugScenario === 'required' || !alreadyMigrated || forceRerun;

  return (
    <Layout>
      <div className="min-h-[calc(100dvh-64px)] bg-white dark:bg-[#1A2124] px-9 pb-24 flex flex-col transition-colors duration-300">
        <div
          className="flex items-start justify-between"
          style={{ paddingTop: 'calc(var(--safe-area-top, 0px) + 1.25rem)' }}
        >
          <img
            src={LOGO_SRC}
            alt="Deutschland im Plus"
            className="w-[91px] h-[91px] object-contain"
          />
          <button
            onClick={() => i18n.changeLanguage(i18n.language === 'de' ? 'en' : 'de')}
            aria-label={t('registration.change_language')}
            className="px-3 py-1.5 mt-2 rounded-full bg-white border border-black/10 text-[13px] font-semibold text-[#0b0b0b] hover:bg-gray-50 transition-colors shadow-sm dark:bg-[#1A2124] dark:border-white/10 dark:text-white dark:hover:bg-white/5"
          >
            {i18n.language === 'de' ? 'EN' : 'DE'}
          </button>
        </div>

        <div className="flex-1 flex flex-col items-center justify-center pb-10">
          <div className="w-full max-w-[320px]">
            {showWizard ? (
              <MigrationWizard
                onMigrate={handleMigrate}
                onDone={handleDone}
                platform={Capacitor.getPlatform()}
              />
            ) : (
              <AlreadyMigratedScreen
                onConfirmRerun={() => setForceRerun(true)}
                onGoBack={() => navigate(-1)}
              />
            )}
          </div>
        </div>
      </div>

      {pickerOpen && (
        <AccountPickerOverlay
          accounts={importedAccounts}
          onSelect={handlePickAccount}
        />
      )}
    </Layout>
  );
};

export default MigrationPage;
