import React, { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { WifiOff, Wifi } from 'lucide-react';
import { Button } from './ui/button';
import { useBudget } from '@/contexts/BudgetContext';

const ConnectivityStatus = () => {
    const { t } = useTranslation();
    const { isOfflineMode, isNetworkOnline } = useBudget();

    const [showOfflineMsg, setShowOfflineMsg] = useState(false);
    const [showOnlineMsg, setShowOnlineMsg] = useState(false);
    const [offlineReason, setOfflineReason] = useState<'user' | 'network' | null>(null);

    const prevOfflineMode = useRef<boolean>(isOfflineMode);
    const prevNetworkOnline = useRef<boolean>(isNetworkOnline);
    const hasStarted = useRef(false);

    useEffect(() => {
        const timer = setTimeout(() => {
            hasStarted.current = true;
        }, 50);
        return () => clearTimeout(timer);
    }, []);

    useEffect(() => {
        if (!hasStarted.current) {
            prevOfflineMode.current = isOfflineMode;
            prevNetworkOnline.current = isNetworkOnline;
            return;
        }

        if (prevOfflineMode.current !== isOfflineMode) {
            if (isOfflineMode) {
                setOfflineReason('user');
                setShowOfflineMsg(true);
                setShowOnlineMsg(false);
            } else {
                setOfflineReason(null);
                setShowOfflineMsg(false);
                setShowOnlineMsg(true);
                setTimeout(() => setShowOnlineMsg(false), 3000);
            }
        }

        if (prevNetworkOnline.current !== isNetworkOnline) {
            if (!isNetworkOnline && isOfflineMode) {
                setOfflineReason('network');
                setShowOfflineMsg(true);
                setShowOnlineMsg(false);
            } else if (isNetworkOnline) {
                setOfflineReason(null);
                setShowOfflineMsg(false);
                setShowOnlineMsg(true);
                setTimeout(() => setShowOnlineMsg(false), 3000);
            }
        }

        prevOfflineMode.current = isOfflineMode;
        prevNetworkOnline.current = isNetworkOnline;
    }, [isOfflineMode, isNetworkOnline]);

    if (!showOfflineMsg && !showOnlineMsg) return null;

    return (
        <>
            {showOfflineMsg && (
                <div className="fixed bottom-0 left-0 right-0 z-[100] flex justify-center mb-8 px-4">
                    <div className="w-full max-w-sm bg-white p-8 rounded-[12px] shadow-lg flex flex-col items-center text-center">
                        <div className="bg-gray-100 p-4 rounded-full mb-4">
                            <WifiOff className="h-10 w-10 text-[#0b0b0b]" />
                        </div>
                        <h3 className="text-xl font-bold text-black">
                            {offlineReason === 'network' ? t('connectivity_network_offline') : t('connectivity_offline')}
                        </h3>
                        <p className="text-sm text-gray-500 mt-2 mb-6">
                            {offlineReason === 'network' ? t('connectivity_network_offline_description') : t('connectivity_offline_description')}
                        </p>
                        <Button
                            className="w-full bg-budget-category-green hover:bg-budget-category-green/90 text-white rounded-[8px] h-12 font-bold"
                            onClick={() => setShowOfflineMsg(false)}
                        >
                            {t('offline_mode_great')}
                        </Button>
                    </div>
                </div>
            )}

            {showOnlineMsg && (
                <div className="fixed bottom-0 left-0 right-0 z-[100] flex justify-center pointer-events-none">
                    <div className="w-full bg-budget-category-green text-white py-2 px-3 flex items-center justify-center gap-2 animate-in slide-in-from-bottom fade-in duration-300 pointer-events-auto">
                        <Wifi className="h-4 w-4" />
                        <span className="text-xs font-semibold">{t('connectivity_online')}</span>
                    </div>
                </div>
            )}
        </>
    );
};

export default ConnectivityStatus;