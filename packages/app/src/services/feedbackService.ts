import { useState, useEffect } from 'react';
import { API_BASE_URL } from '../lib/api.js';
import { Device } from '@capacitor/device';
import { App as CapApp } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';

interface Feedback {
  id: string;
  message: string;
  email: string;
  timestamp: string;
  status: 'pending' | 'sent' | 'failed';
}

const FEEDBACK_STORAGE_KEY = 'budget-wise-pending-feedback';

const getTechnicalInfo = async () => {
  let operatingSystem = 'Unknown';
  let osVersion = 'Unknown';
  let manufacturer = 'Unknown';
  let model = 'Unknown';
  let appVersion = typeof APP_VERSION !== 'undefined' ? APP_VERSION : 'Unknown';
  let buildNumber = 'Unknown';

  try {
    if (Capacitor.isNativePlatform()) {
      // Cheap, synchronous baseline that doesn't depend on the Device plugin
      // bridge, so a plugin failure still reports a real OS name instead of
      // 'Unknown'.
      operatingSystem = Capacitor.getPlatform();

      try {
        const info = await Device.getInfo();
        operatingSystem = info.operatingSystem || operatingSystem;
        osVersion = info.osVersion || 'Unknown';
        manufacturer = info.manufacturer || 'Unknown';
        model = info.model || 'Unknown';
      } catch (e) {
        console.error('Failed to get device info from Capacitor Device plugin', e);
      }

      try {
        const appInfo = await CapApp.getInfo();
        appVersion = appInfo.version || appVersion;
        buildNumber = appInfo.build || 'Unknown';
      } catch (e) {
        console.error('Failed to get app build info from Capacitor App plugin', e);
      }
    } else {
      // Web / PWA fallback
      operatingSystem = 'Web';
      const ua = navigator.userAgent;
      if (/android/i.test(ua)) {
        operatingSystem = 'Android';
        const match = ua.match(/Android\s([0-9\._]+)/i);
        if (match) osVersion = match[1];
      } else if (/iPad|iPhone|iPod/.test(ua)) {
        operatingSystem = 'iOS';
        const match = ua.match(/OS\s([0-9_]+)/i);
        if (match) osVersion = match[1].replace(/_/g, '.');
      } else if (/Macintosh/i.test(ua)) {
        operatingSystem = 'macOS';
        const match = ua.match(/Mac\sOS\sX\s([0-9_\.]+)/i);
        if (match) osVersion = match[1].replace(/_/g, '.');
      } else if (/Windows/i.test(ua)) {
        operatingSystem = 'Windows';
        const match = ua.match(/Windows\sNT\s([0-9\.]+)/i);
        if (match) osVersion = match[1];
      } else if (/Linux/i.test(ua)) {
        operatingSystem = 'Linux';
      }
    }
  } catch (error) {
    console.error('Error retrieving technical info:', error);
  }

  // Format OS names cleanly
  if (operatingSystem === 'ios') operatingSystem = 'iOS';
  if (operatingSystem === 'android') operatingSystem = 'Android';

  return {
    operatingSystem,
    osVersion,
    manufacturer,
    model,
    appVersion,
    buildNumber,
  };
};

class ClientError extends Error {
  statusCode: number;
  constructor(statusCode: number, message: string) {
    super(message);
    this.name = 'ClientError';
    this.statusCode = statusCode;
  }
}

const submitToBackend = async (message: string, email: string): Promise<void> => {
  const res = await fetch(`${API_BASE_URL}/v1/feedback`, {
    method: 'POST',
    body: JSON.stringify({ message, email }),
    headers: { 'Content-Type': 'application/json' },
  });
  if (!res.ok) {
    if (res.status >= 400 && res.status < 500) {
      throw new ClientError(res.status, `Server rejected feedback (${res.status})`);
    }
    throw new Error('Submission failed');
  }
};

const updateFeedbackStatus = (feedbackId: string, status: Feedback['status']) => {
  const stored: Feedback[] = JSON.parse(localStorage.getItem(FEEDBACK_STORAGE_KEY) || '[]');
  const updated = stored.map((f) => (f.id === feedbackId ? { ...f, status } : f));
  localStorage.setItem(FEEDBACK_STORAGE_KEY, JSON.stringify(updated));
};

const processPendingFeedback = async () => {
  if (!navigator.onLine) return;

  const stored: Feedback[] = JSON.parse(localStorage.getItem(FEEDBACK_STORAGE_KEY) || '[]');
  const pending = stored.filter((f) => f.status === 'pending');

  for (const feedback of pending) {
    try {
      await submitToBackend(feedback.message, feedback.email);
      updateFeedbackStatus(feedback.id, 'sent');
    } catch (error) {
      if (error instanceof ClientError) {
        updateFeedbackStatus(feedback.id, 'failed');
      }
    }
  }
};

// Process pending feedback when coming back online
if (typeof window !== 'undefined') {
  window.addEventListener('online', processPendingFeedback);
}

export const useFeedbackForm = () => {
  const [submitting, setSubmitting] = useState(false);

  // Process any pending feedback on mount
  useEffect(() => {
    processPendingFeedback();
  }, []);

  const submitFeedback = async (message: string, email: string): Promise<void> => {
    const info = await getTechnicalInfo();
    const osVer = info.osVersion !== 'Unknown' ? info.osVersion : '';
    const osStr = [info.operatingSystem, osVer].filter(Boolean).join(' ') || 'Unknown';
    const devMfg = info.manufacturer !== 'Unknown' ? info.manufacturer : '';
    const devModel = info.model !== 'Unknown' ? info.model : '';
    const devStr = [devMfg, devModel].filter(Boolean).join(' ') || 'Unknown';

    const technicalInfo = [
      'Technical information:',
      `Operating system: ${osStr}`,
      `Device: ${devStr}`,
      `App version: ${info.appVersion}`,
      `Build: ${info.buildNumber}`,
    ].join('\n');

    const fullMessage = `${message}\n\n${technicalInfo}`;

    const feedback: Feedback = {
      id: crypto.randomUUID(),
      message: fullMessage,
      email,
      timestamp: new Date().toISOString(),
      status: 'pending',
    };

    // Store feedback locally
    const stored: Feedback[] = JSON.parse(localStorage.getItem(FEEDBACK_STORAGE_KEY) || '[]');
    stored.push(feedback);
    localStorage.setItem(FEEDBACK_STORAGE_KEY, JSON.stringify(stored));

    // Try to send immediately if online
    if (navigator.onLine) {
      setSubmitting(true);
      try {
        await submitToBackend(feedback.message, feedback.email);
        updateFeedbackStatus(feedback.id, 'sent');
      } catch (error) {
        if (error instanceof ClientError) {
          updateFeedbackStatus(feedback.id, 'failed');
          throw error;
        }
        console.error('Failed to send feedback (will retry):', error);
      } finally {
        setSubmitting(false);
      }
    }
  };

  return {
    submitFeedback,
    state: { submitting },
  };
};
