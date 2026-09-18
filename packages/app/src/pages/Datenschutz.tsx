import React from 'react';
import { useTranslation } from 'react-i18next';
import Layout from '../components/Layout';

const Datenschutz = () => {
    const { t } = useTranslation();

    return (
        <Layout>
            <div className="container mx-auto p-4 max-w-2xl pb-24">
                <div className="space-y-6 animate-fade-in">
                    <div className="bg-white dark:bg-white/5 text-black dark:text-white rounded-lg p-6 border border-black/10 dark:border-white/10 shadow-sm">

                        <h2 className="text-xl font-semibold text-black dark:text-white mb-1">{t('privacy_title')}</h2>
                        <p className="text-xs text-gray-500 dark:text-gray-400 mb-6">{t('policy_last_updated')}</p>

                        <div className="space-y-8 text-black dark:text-white">

                            {/* Introduction */}
                            <p className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed">
                                {t('privacy_intro')}
                            </p>

                            {/* Section 1 */}
                            <section className="border-t border-black/5 dark:border-white/5 pt-6">
                                <h3 className="font-semibold text-base mb-4">{t('privacy_sec_1_title')}</h3>
                                <div className="space-y-3 text-sm text-gray-700 dark:text-gray-300 leading-relaxed">
                                    <div className="bg-gray-50 dark:bg-black/20 rounded-lg p-4">
                                        <p className="font-semibold text-black dark:text-white mb-2">{t('privacy_sec_1_responsible_title')}</p>
                                        <div className="space-y-0.5">
                                            <p>Stiftung Deutschland im Plus – die Stiftung für private Überschuldungsprävention</p>
                                            <p>Beuthener Straße 25</p>
                                            <p>90471 Nürnberg</p>
                                            <p>
                                                E-Mail:{' '}
                                                <a href="mailto:info@deutschland-im-plus.de" className="text-blue-500">
                                                    info@deutschland-im-plus.de
                                                </a>
                                            </p>
                                            <p>Tel.: +49 (0)911-9234 950</p>
                                        </div>
                                    </div>
                                    <div className="bg-gray-50 dark:bg-black/20 rounded-lg p-4">
                                        <p className="font-semibold text-black dark:text-white mb-2">{t('privacy_sec_1_dpo_title')}</p>
                                        <div className="space-y-0.5">
                                            <p>Stiftung Deutschland im Plus – die Stiftung für private Überschuldungsprävention</p>
                                            <p>Beuthener Straße 25</p>
                                            <p>90471 Nürnberg</p>
                                            <p>
                                                E-Mail:{' '}
                                                <a href="mailto:info@deutschland-im-plus.de" className="text-blue-500">
                                                    info@deutschland-im-plus.de
                                                </a>
                                            </p>
                                            <p>Tel.: +49 (0)911-9234 950</p>
                                        </div>
                                    </div>
                                </div>
                            </section>

                            {/* Section 2 */}
                            <section className="border-t border-black/5 dark:border-white/5 pt-6">
                                <h3 className="font-semibold text-base mb-4">{t('privacy_sec_2_title')}</h3>
                                <div className="space-y-3 text-sm text-gray-700 dark:text-gray-300 leading-relaxed">
                                    <p>{t('privacy_sec_2_intro')}</p>
                                    <ul className="list-disc pl-5 space-y-1">
                                        <li>{t('privacy_sec_2_list_item_1')}</li>
                                        <li>{t('privacy_sec_2_list_item_2')}</li>
                                        <li>{t('privacy_sec_2_list_item_3')}</li>
                                    </ul>
                                    <div className="bg-gray-50 dark:bg-black/20 rounded-lg p-3">
                                        <p className="font-semibold text-black dark:text-white">{t('privacy_sec_2_personal_data_title')}</p>
                                        <p className="font-mono text-xs mt-1">{t('privacy_sec_2_personal_data_text')}</p>
                                    </div>
                                    <p>{t('privacy_sec_2_usage_intro')}</p>
                                    <p className="text-xs italic border-l-2 border-gray-300 dark:border-gray-600 pl-3 text-gray-500 dark:text-gray-400">
                                        {t('privacy_sec_2_access_policy')}
                                    </p>
                                </div>
                            </section>

                            {/* Section 3 */}
                            <section className="border-t border-black/5 dark:border-white/5 pt-6">
                                <h3 className="font-semibold text-base mb-4">{t('privacy_sec_3_title')}</h3>
                                <div className="space-y-4 text-sm text-gray-700 dark:text-gray-300 leading-relaxed">
                                    <p>{t('privacy_sec_3_intro')}</p>
                                    <div>
                                        <h4 className="font-semibold text-black dark:text-white mb-1">{t('privacy_sec_3_download_title')}</h4>
                                        <p>{t('privacy_sec_3_download_text')}</p>
                                    </div>
                                    <div>
                                        <h4 className="font-semibold text-black dark:text-white mb-1">{t('privacy_sec_3_auto_title')}</h4>
                                        <p>{t('privacy_sec_3_auto_text')}</p>
                                    </div>
                                    <div>
                                        <h4 className="font-semibold text-black dark:text-white mb-1">{t('privacy_sec_3_reg_title')}</h4>
                                        <p>{t('privacy_sec_3_reg_text')}</p>
                                    </div>
                                    <div>
                                        <h4 className="font-semibold text-black dark:text-white mb-1">{t('privacy_sec_3_usage_title')}</h4>
                                        <p>{t('privacy_sec_3_usage_text')}</p>
                                    </div>
                                    <p>{t('privacy_sec_3_online_text')}</p>
                                    <p className="text-xs bg-gray-50 dark:bg-black/20 border-l-2 border-gray-300 dark:border-gray-600 p-3 rounded-r-lg leading-relaxed">
                                        {t('privacy_sec_3_justification_text')}
                                    </p>
                                    <div className="pt-2">
                                        <h4 className="font-semibold text-black dark:text-white mb-2">{t('privacy_sec_3_survey_title')}</h4>
                                        <div className="space-y-2">
                                            <p>{t('privacy_sec_3_survey_text_1')}</p>
                                            <p>{t('privacy_sec_3_survey_text_2')}</p>
                                            <p>{t('privacy_sec_3_survey_text_3')}</p>
                                            <p>{t('privacy_sec_3_survey_text_4')}</p>
                                        </div>
                                    </div>
                                </div>
                            </section>

                            {/* Section 4 */}
                            <section className="border-t border-black/5 dark:border-white/5 pt-6">
                                <h3 className="font-semibold text-base mb-4">{t('privacy_sec_4_title')}</h3>
                                <p className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed">{t('privacy_sec_4_text')}</p>
                            </section>

                            {/* Section 5 */}
                            <section className="border-t border-black/5 dark:border-white/5 pt-6">
                                <h3 className="font-semibold text-base mb-4">{t('privacy_sec_5_title')}</h3>
                                <div className="space-y-3 text-sm text-gray-700 dark:text-gray-300 leading-relaxed">
                                    <p>{t('privacy_sec_5_text_1')}</p>
                                    <div className="bg-gray-50 dark:bg-black/20 rounded-lg p-3 flex gap-2 items-baseline flex-wrap">
                                        <span className="font-semibold text-black dark:text-white text-xs">{t('privacy_sec_5_hosting_title')}</span>
                                        <span className="font-mono text-xs">{t('privacy_sec_5_hosting_text')}</span>
                                    </div>
                                    <p>{t('privacy_sec_5_text_2')}</p>
                                    <p>{t('privacy_sec_5_text_3')}</p>
                                    <p className="text-xs bg-gray-50 dark:bg-black/20 border-l-2 border-gray-300 dark:border-gray-600 p-3 rounded-r-lg leading-relaxed">
                                        {t('privacy_sec_5_text_4')}
                                    </p>
                                    <p>{t('privacy_sec_5_text_5')}</p>
                                    <p className="text-xs bg-gray-50 dark:bg-black/20 border-l-2 border-gray-300 dark:border-gray-600 p-3 rounded-r-lg leading-relaxed">
                                        {t('privacy_sec_5_text_6')}
                                    </p>
                                </div>
                            </section>

                            {/* Section 6 */}
                            <section className="border-t border-black/5 dark:border-white/5 pt-6">
                                <h3 className="font-semibold text-base mb-4">{t('privacy_sec_6_title')}</h3>
                                <p className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed">{t('privacy_sec_6_text')}</p>
                            </section>

                            {/* Section 7 */}
                            <section className="border-t border-black/5 dark:border-white/5 pt-6">
                                <h3 className="font-semibold text-base mb-4">{t('privacy_sec_7_title')}</h3>
                                <p className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed">{t('privacy_sec_7_text')}</p>
                            </section>

                            {/* Section 8 */}
                            <section className="border-t border-black/5 dark:border-white/5 pt-6">
                                <h3 className="font-semibold text-base mb-4">{t('privacy_sec_8_title')}</h3>
                                <div className="space-y-3 text-sm text-gray-700 dark:text-gray-300 leading-relaxed">
                                    <p>{t('privacy_sec_8_text_1')}</p>
                                    <p>{t('privacy_sec_8_text_2')}</p>
                                </div>
                            </section>

                            {/* Section 9 */}
                            <section className="border-t border-black/5 dark:border-white/5 pt-6">
                                <h3 className="font-semibold text-base mb-4">{t('privacy_sec_9_title')}</h3>
                                <p className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed">{t('privacy_sec_9_text')}</p>
                            </section>

                            {/* Section 10 */}
                            <section className="border-t border-black/5 dark:border-white/5 pt-6">
                                <h3 className="font-semibold text-base mb-4">{t('privacy_sec_10_title')}</h3>
                                <div className="space-y-4 text-sm text-gray-700 dark:text-gray-300 leading-relaxed">
                                    <p>{t('privacy_sec_10_intro')}</p>

                                    <div>
                                        <h4 className="font-semibold text-black dark:text-white mb-1">{t('privacy_sec_10_right_access_title')}</h4>
                                        <p>{t('privacy_sec_10_right_access_text')}</p>
                                    </div>
                                    <div>
                                        <h4 className="font-semibold text-black dark:text-white mb-1">{t('privacy_sec_10_right_rectification_title')}</h4>
                                        <p>{t('privacy_sec_10_right_rectification_text')}</p>
                                    </div>
                                    <div>
                                        <h4 className="font-semibold text-black dark:text-white mb-1">{t('privacy_sec_10_right_erasure_title')}</h4>
                                        <p>{t('privacy_sec_10_right_erasure_text_1')}</p>
                                        <p className="mt-1">{t('privacy_sec_10_right_erasure_text_2')}</p>
                                    </div>
                                    <div>
                                        <h4 className="font-semibold text-black dark:text-white mb-1">{t('privacy_sec_10_right_restriction_title')}</h4>
                                        <p className="mb-2">{t('privacy_sec_10_right_restriction_intro')}</p>
                                        <ul className="list-disc pl-5 space-y-1">
                                            <li>{t('privacy_sec_10_right_restriction_item_1')}</li>
                                            <li>{t('privacy_sec_10_right_restriction_item_2')}</li>
                                            <li>{t('privacy_sec_10_right_restriction_item_3')}</li>
                                            <li>{t('privacy_sec_10_right_restriction_item_4')}</li>
                                        </ul>
                                    </div>
                                    <div>
                                        <h4 className="font-semibold text-black dark:text-white mb-1">{t('privacy_sec_10_right_object_title')}</h4>
                                        <p>{t('privacy_sec_10_right_object_text_1')}</p>
                                        <p className="mt-1">{t('privacy_sec_10_right_object_text_2')}</p>
                                    </div>
                                    <div>
                                        <h4 className="font-semibold text-black dark:text-white mb-1">{t('privacy_sec_10_right_portability_title')}</h4>
                                        <p className="mb-2">{t('privacy_sec_10_right_portability_intro')}</p>
                                        <ul className="list-disc pl-5 space-y-1">
                                            <li>{t('privacy_sec_10_right_portability_item_1')}</li>
                                            <li>{t('privacy_sec_10_right_portability_item_2')}</li>
                                        </ul>
                                        <p className="mt-1">{t('privacy_sec_10_right_portability_text')}</p>
                                    </div>
                                    <div>
                                        <h4 className="font-semibold text-black dark:text-white mb-1">{t('privacy_sec_10_right_complaint_title')}</h4>
                                        <p>{t('privacy_sec_10_right_complaint_text_1')}</p>
                                        <p className="mt-1">{t('privacy_sec_10_right_complaint_text_2')}</p>
                                    </div>
                                    <div>
                                        <h4 className="font-semibold text-black dark:text-white mb-1">{t('privacy_sec_10_right_withdraw_title')}</h4>
                                        <p>{t('privacy_sec_10_right_withdraw_text')}</p>
                                    </div>
                                    <div>
                                        <h4 className="font-semibold text-black dark:text-white mb-1">{t('privacy_sec_10_right_automated_title')}</h4>
                                        <p>{t('privacy_sec_10_right_automated_text')}</p>
                                    </div>
                                </div>
                            </section>

                        </div>
                    </div>
                </div>
            </div>
        </Layout>
    );
};

export default Datenschutz;
