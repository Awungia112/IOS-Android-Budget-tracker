import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import Layout from '@/components/Layout';
import { Button } from '@/components/ui/button';
import { toast } from '@/hooks/use-toast';
import { useFeedbackForm } from '@/services/feedbackService';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

export default function Feedback() {
  const { t } = useTranslation();
  
  const [feedbackMessage, setFeedbackMessage] = useState('');
  const [feedbackEmail, setFeedbackEmail] = useState('');
  const [feedbackSuccessOpen, setFeedbackSuccessOpen] = useState(false);
  const { submitFeedback, state } = useFeedbackForm();

  const handleFeedbackSubmit = async () => {
    if (!feedbackMessage.trim()) {
      toast({
        title: t('error'),
        description: t('please_enter_feedback'),
        variant: 'destructive',
      });
      return;
    }

    if (!feedbackEmail.trim()) {
      toast({
        title: t('error'),
        description: t('email_required'),
        variant: 'destructive',
      });
      return;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(feedbackEmail.trim())) {
      toast({
        title: t('error'),
        description: t('invalid_email'),
        variant: 'destructive',
      });
      return;
    }

    try {
      await submitFeedback(feedbackMessage, feedbackEmail.trim());
      setFeedbackMessage('');
      setFeedbackEmail('');
      setFeedbackSuccessOpen(true);
    } catch (error) {
      console.error('Failed to submit feedback:', error);
      toast({
        title: t('error'),
        description: t('feedback_error'),
        variant: 'destructive',
      });
    }
  };

  return (
    <Layout>
      <div className="min-h-[calc(100dvh-64px)] bg-white dark:bg-[#1A2124] px-4 py-4 transition-colors duration-300 flex flex-col">
        <div className="max-w-[500px] w-full mx-auto flex flex-col">
          {/* Feedback Section */}
          <div className="flex flex-col gap-3">
            <p className="text-xs text-gray-500">{t('feedback_desc')}</p>
            <input
              type="email"
              className="w-full border border-black/10 dark:border-white/10 rounded-lg p-3 text-sm shadow-sm focus:ring-1 focus:ring-budget-blue outline-none bg-white dark:bg-white/5 text-black dark:text-white placeholder:text-gray-400"
              placeholder={t('email_required_placeholder')}
              value={feedbackEmail}
              onChange={(e) => setFeedbackEmail(e.target.value)}
              disabled={state.submitting}
              data-testid="feedback-email"
            />
            <textarea
              className="w-full h-[42dvh] min-h-[180px] max-h-[440px] resize-none border border-black/10 dark:border-white/10 rounded-lg p-3 text-sm shadow-sm focus:ring-1 focus:ring-budget-blue outline-none bg-white dark:bg-white/5 text-black dark:text-white placeholder:text-gray-400"
              placeholder={t('your_feedback')}
              value={feedbackMessage}
              onChange={(e) => setFeedbackMessage(e.target.value)}
              disabled={state.submitting}
              maxLength={4800}
              data-testid="feedback-textarea"
            />
            <Button
              onClick={handleFeedbackSubmit}
              disabled={state.submitting}
              className="w-full bg-budget-green hover:bg-budget-green/90 text-white rounded-[8px] font-medium"
              data-testid="feedback-submit-button"
            >
              {state.submitting ? t('sending') : t('send_feedback')}
            </Button>
          </div>
        </div>
      </div>

      {/* Feedback Success Dialog */}
      <AlertDialog open={feedbackSuccessOpen} onOpenChange={setFeedbackSuccessOpen}>
        <AlertDialogContent className="rounded-[12px] max-w-[calc(100%-2rem)] bg-white dark:bg-[#1A2124] border border-black/10 dark:border-white/10 shadow-lg">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-lg font-semibold text-black dark:text-white">{t('feedback_sent')}</AlertDialogTitle>
            <AlertDialogDescription className="text-gray-500 dark:text-gray-400">
              {t('feedback_success_msg')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogAction
              onClick={() => setFeedbackSuccessOpen(false)}
              className="bg-budget-green hover:bg-budget-green/90 text-white rounded-[8px] font-semibold w-full sm:w-auto"
              data-testid="feedback-success-ok-button"
            >
              {t('okay')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Layout>
  );
}
