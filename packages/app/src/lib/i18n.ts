import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import enTranslations from '../i18n/locales/en.json';
import deTranslations from '../i18n/locales/de.json';

i18n
  .use(initReactI18next)
  .init({
    resources: {
      en: {
        translation: enTranslations
      },
      de: {
        translation: deTranslations
      }
    },
    lng: (() => {
      if (typeof localStorage === 'undefined' || typeof localStorage.getItem !== 'function') {
        return 'de';
      }

      return localStorage.getItem('i18nextLng') || localStorage.getItem('language') || 'de';
    })(),
    fallbackLng: 'en',
    interpolation: {
      escapeValue: false
    },
    react: {
      useSuspense: false
    }
  });