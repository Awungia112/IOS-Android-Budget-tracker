import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import Layout from '@/components/Layout';
import RegistrationEmailForm from '@/components/RegistrationEmailForm';

type AccountTab = 'register' | 'signin';

const Account = () => {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState<AccountTab>('register');

  const switchTab = (tab: AccountTab) => setActiveTab(tab);

  return (
    <Layout>
      <div className="min-h-screen bg-white dark:bg-[#1A2124] transition-colors duration-300">

        {/* Tab switcher — same pattern as Categories */}
        <div className="bg-white dark:bg-[#1A2124] border-b border-gray-200 dark:border-white/10 sticky top-0 z-[15]">
          <div className="max-w-2xl mx-auto flex">
            {(['register', 'signin'] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => switchTab(tab)}
                data-testid={`account-tab-${tab}`}
                className={`flex-1 py-3 text-sm font-bold transition-all border-b-2 ${
                  activeTab === tab
                    ? 'text-black dark:text-white border-budget-blue'
                    : 'text-gray-400 border-transparent hover:text-gray-600 dark:hover:text-gray-300'
                }`}
              >
                {tab === 'register' ? t('onboarding_register') : t('onboarding_login')}
              </button>
            ))}
          </div>
        </div>

        {/* Tab content */}
        <div className="max-w-2xl mx-auto px-10 py-8 flex flex-col items-center">
          <div className="w-full max-w-[320px]">

            {/* Tab title */}
            <h1 className="text-[28px] font-bold text-[#0b0b0b] dark:text-white text-center mb-2 leading-tight">
              {activeTab === 'signin'
                ? t('registration.signin_title')
                : t('registration.register_title')}
            </h1>
            <p className="text-[16px] text-[#0b0b0b]/70 dark:text-white/60 text-center leading-[21px] mb-6">
              {activeTab === 'signin'
                ? t('registration.signin_subtitle')
                : t('registration.register_subtitle')}
            </p>

            {/* The full registration/sign-in form — re-mounts on tab switch to reset state */}
            <RegistrationEmailForm
              key={activeTab}
              intent={activeTab === 'signin' ? 'signin' : undefined}
              hideBack
              onSwitchToRegister={() => switchTab('register')}
            />

          </div>
        </div>

      </div>
    </Layout>
  );
};

export default Account;
