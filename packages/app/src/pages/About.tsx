import React from 'react';
import { useTranslation } from 'react-i18next';
import Layout from '../components/Layout';

const About = () => {
    const { t } = useTranslation();

    return (
        <Layout>
            <div className="container mx-auto p-4 max-w-2xl pb-24 min-h-screen">
                <div className="bg-white dark:bg-white/5 text-black dark:text-white rounded-lg p-6 space-y-6 animate-fade-in border border-black/10 dark:border-white/10 shadow-sm">
                    <div>
                        <h2 className="text-xl mb-4 text-black dark:text-white">{t('about_budget_wise')}</h2>
                        <p className="text-sm leading-relaxed">
                            {t('about_budget_wise_description')}
                        </p>
                    </div>

                    <div>
                        <h2 className="text-xl mb-4 text-black dark:text-white">{t('about_deutschland_im_plus')}</h2>
                        <div className="space-y-4">
                            <p className="text-sm leading-relaxed">
                                {t('about_deutschland_im_plus_description')}
                            </p>

                            <div>
                                <p className="font-medium mb-2">{t('contact_information')}:</p>
                                <p className="text-sm">Stiftung Deutschland im Plus – die Stiftung für private Überschuldungsprävention</p>
                                <p className="text-sm">Beuthener Str. 25</p>
                                <p className="text-sm">90471 Nürnberg</p>
                                <p className="text-sm">E-Mail: info@deutschland-im-plus.de</p>
                                <p className="text-sm">URL: www.deutschland-im-plus.de</p>
                                <p className="text-sm">Telefon: 0911 / 9234 950</p>
                            </div>

                            <div>
                                <p className="font-medium mb-2">{t('website')}:</p>
                                <a
                                    href="https://www.deutschland-im-plus.de"
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-blue-600 hover:text-blue-800 text-sm underline"
                                >
                                    www.deutschland-im-plus.de
                                </a>
                            </div>
                        </div>
                    </div>

                    <div>
                        <h2 className="text-xl mb-4 text-black dark:text-white">{t('app_information')}</h2>
                        <div className="space-y-4">
                            <div>
                                <p className="font-medium mb-1">{t('version')}:</p>
                                <p className="text-sm">{APP_VERSION}</p>
                            </div>

                            <div>
                                <p className="font-medium mb-1">{t('copyright')}:</p>
                                <p className="text-sm">© 2025 Deutschland im Plus</p>
                            </div>

                            <div>
                                <p className="font-medium mb-1">{t('legal_notice')}:</p>
                                <p className="text-sm leading-relaxed">
                                    {t('legal_notice_description')}
                                </p>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </Layout>
    );
};

export default About;
