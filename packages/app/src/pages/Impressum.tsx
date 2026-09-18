import React from 'react';
import { useTranslation } from 'react-i18next';
import Layout from '../components/Layout';

const Impressum = () => {
    const { t } = useTranslation();

    return (
        <Layout>
            <div className="container mx-auto p-4 max-w-2xl pb-24 min-h-screen">
                <div className="space-y-6 animate-fade-in">
                    <div className="bg-white dark:bg-white/5 text-black dark:text-white rounded-lg p-6 border border-black/10 dark:border-white/10 shadow-sm">
                        <h2 className="text-xl mb-4 text-black dark:text-white">{t('impressum_title')}</h2>
                        
                        <div className="space-y-4 text-black dark:text-white">
                            <div>
                                <p className="font-medium mb-1">{t('address')}:</p>
                                <p className="text-sm">Beuthener Str. 25</p>
                                <p className="text-sm">90471 Nürnberg</p>
                            </div>

                            <div>
                                <p className="font-medium mb-1">{t('contact')}:</p>
                                <p className="text-sm">E-Mail: info@deutschland-im-plus.de</p>
                                <p className="text-sm">URL: www.deutschland-im-plus.de</p>
                                <p className="text-sm">Telefon: 0911 / 9234 950</p>
                                <p className="text-sm">Telefax: 0911 / 9232 342</p>
                            </div>

                            <div>
                                <p className="font-medium mb-1">{t('legal_status')}:</p>
                                <p className="text-sm">Die Stiftung Deutschland im Plus ist eine rechtsfähige öffentliche Stiftung bürgerlichen Rechts.</p>
                            </div>

                            <div>
                                <p className="font-medium mb-1">{t('authorized_representatives')}:</p>
                                <p className="text-sm">Vertretungsberechtigt im Sinne des § 6 TDG ist der Vorstand:</p>
                                <p className="text-sm">Philipp Blomeyer (Vors.)</p>
                                <p className="text-sm">Prof. Dr. Holger Arndt</p>
                                <p className="text-sm">Prof. Dr. Kerstin Herzog</p>
                                <p className="text-sm">Ute Scharnagl</p>
                            </div>

                            <div>
                                <p className="font-medium mb-1">{t('supervisory_authority')}:</p>
                                <p className="text-sm">Regierung von Mittelfranken</p>
                                <p className="text-sm">Promenade 27, 91522 Ansbach</p>
                            </div>

                            <div>
                                <p className="font-medium mb-1">{t('app_version')}:</p>
                                <p className="text-sm">{APP_VERSION}</p>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </Layout>
    );
};

export default Impressum;
