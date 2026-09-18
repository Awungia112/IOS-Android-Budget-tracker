import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useTranslation } from 'react-i18next';
import { toast } from '@/components/ui/use-toast';
import { useFeedbackForm } from '@/services/feedbackService';

const FeedbackForm = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [feedbackSuccessOpen, setFeedbackSuccessOpen] = useState(false);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');
  const { t } = useTranslation();
  const { submitFeedback, state } = useFeedbackForm();

const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!message.trim()) {
      toast({
        title: t('error'),
        description: t('please_enter_feedback'),
        variant: 'destructive',
      });
      return;
    }
    if (!email.trim()) {
      toast({
        title: t('error'),
        description: t('email_required'),
        variant: 'destructive',
      });
      return;
    }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email.trim())) {
      toast({
        title: t('error'),
        description: t('invalid_email'),
        variant: 'destructive',
      });
      return;
    }
    try {
      await submitFeedback(message, email.trim());
      setName('');
      setEmail('');
      setMessage('');
      setIsOpen(false);
      setFeedbackSuccessOpen(true);
    } catch (error) {
      console.error('Failed to submit feedback:', error);
      toast({
        title: t('feedback_error'),
        description: t('feedback_error'),
        variant: 'destructive',
      });
    }
  };

  return (
    <>
      <Button
        variant="ghost"
        className="w-full justify-start"
        onClick={() => setIsOpen(true)}
        data-testid="feedback-button"
      >
        {t('feedback')}
      </Button>

      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('feedback_title')}</DialogTitle>
            <DialogDescription>
              {t('feedback_description')}
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="name" className="block text-sm font-medium mb-1">
                {t('name')}
              </label>
              <Input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={t('name_placeholder')}
              />
            </div>

            <div>
              <label htmlFor="email" className="block text-sm font-medium mb-1">
                {t('email')}
              </label>
              <Input
                id="email"
                data-testid="feedback-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder={t('email_placeholder')}
              />
            </div>

            <div>
              <label htmlFor="message" className="block text-sm font-medium mb-1">
                {t('message')}
              </label>
              <Textarea
                id="message"
                data-testid="feedback-textarea"
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder={t('message_placeholder')}
                rows={4}
              />
            </div>

            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setIsOpen(false)}
              >
                {t('cancel')}
              </Button>
              <Button type="submit" disabled={state.submitting} data-testid="feedback-submit-button">
                {state.submitting ? t('sending') : t('submit')}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

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
              className="bg-budget-blue hover:bg-budget-blue/90 text-white rounded-[8px] font-semibold w-full sm:w-auto"
              data-testid="feedback-success-ok-button"
            >
              {t('okay')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};

export default FeedbackForm; 