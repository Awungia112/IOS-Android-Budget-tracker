import { useNavigate, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import RegistrationEmailForm from '@/components/RegistrationEmailForm';

const LOGO_SRC = '/assets/deutschland.webp';

const RegistrationEmail = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { t, i18n } = useTranslation();

  const intent = (
    location.state?.intent ||
    undefined
  ) as 'signin' | undefined;

  return (
    <div className="min-h-screen bg-white flex flex-col">
      {/* Header: Logo + Language */}
      <div
        className="flex items-start justify-between px-9"
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
          className="px-3 py-1.5 mt-2 rounded-full bg-white border border-black/10 text-[13px] font-semibold text-[#0b0b0b] hover:bg-gray-50 transition-colors shadow-sm"
        >
          {i18n.language === 'de' ? 'EN' : 'DE'}
        </button>
      </div>

      <div className="flex-1 flex flex-col items-center justify-center px-10 pb-20">
        <div className="w-full max-w-[320px]">
          <h1 className="text-[32px] font-bold text-[#0b0b0b] text-center mb-2 leading-tight">
            {intent === 'signin'
              ? t('registration.signin_title')
              : t('registration.register_title')}
          </h1>
          <p className="text-[16px] text-[#0b0b0b]/70 text-center leading-[21px] mb-6">
            {intent === 'signin'
              ? t('registration.signin_subtitle')
              : t('registration.register_subtitle')}
          </p>

          <RegistrationEmailForm
            intent={intent}
            onBack={() => navigate(-1)}
          />
        </div>
      </div>
    </div>
  );
};

export default RegistrationEmail;
