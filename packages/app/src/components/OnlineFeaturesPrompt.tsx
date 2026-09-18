import { useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { setOptedOutOfOnlinePrompt, clearOptedOutOfOnlinePrompt, hasOptedOutOfOnlinePrompt } from "@/lib/accountStorage";

interface OnlineFeaturesPromptProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  isLoggedIn: boolean;
  hasSession: boolean;
  onRegister: () => void;
  onCancel: () => void;
  onConfirm?: () => void; // For already logged-in users to turn online mode on
}

const OnlineFeaturesPrompt = ({
  open,
  onOpenChange,
  isLoggedIn,
  hasSession,
  onRegister,
  onCancel,
  onConfirm,
}: OnlineFeaturesPromptProps) => {
  const { t } = useTranslation();
  // Initialize from localStorage so a previous opt-out shows as checked,
  // allowing the user to uncheck and re-enable the prompt.
  const [dontShowAgain, setDontShowAgain] = useState(() => hasOptedOutOfOnlinePrompt());

  const handleDontShowAgainChange = (checked: boolean) => {
    setDontShowAgain(checked);
    if (checked) {
      // Don't persist yet — only persist when the user confirms an action.
      // This keeps the checkbox state local until the user commits.
    } else {
      // Immediately clear any previously persisted opt-out so the prompt
      // will be shown again on the next toggle.
      clearOptedOutOfOnlinePrompt();
    }
  };

  const handlePrimaryAction = () => {
    // Only persist opt-out for logged-in users with a valid session.
    // Non-logged-in users (no session) should always see the prompt.
    // isLoggedIn might be stale from localStorage, so we also check hasSession.
    if (isLoggedIn && hasSession && dontShowAgain) {
      setOptedOutOfOnlinePrompt();
    }
    onOpenChange(false);
    
    if (isLoggedIn && hasSession && onConfirm) {
      onConfirm();
    } else if (!isLoggedIn || !hasSession) {
      onRegister();
    }
  };

  const handleSecondaryAction = () => {
    // Cancel should never persist an opt-out — it's just a dismissal.
    // Reset the checkbox to whatever is actually persisted so the next
    // time the dialog opens it reflects the true stored state.
    setDontShowAgain(hasOptedOutOfOnlinePrompt());
    onOpenChange(false);
    onCancel();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="w-[calc(100vw-2rem)] max-w-[420px] max-h-[calc(100dvh-2rem)] overflow-y-auto rounded-[12px] bg-white dark:bg-[#1A2124] border-gray-200 dark:border-white/10 shadow-lg p-5 sm:p-6"
        onInteractOutside={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle className="text-lg font-semibold text-black dark:text-white">
            {t("online_features_prompt_title")}
          </DialogTitle>
          <DialogDescription className="sr-only">
            {t("online_features_prompt_title")}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 overflow-hidden break-words">
          {/* Body text */}
          <p className="text-sm text-gray-600 dark:text-gray-300">
            {t("online_features_prompt_body")}
          </p>

          {/* Feature list */}
          <ul className="space-y-2">
            <li className="text-sm text-gray-600 dark:text-gray-300 flex items-start gap-2">
              <span className="text-budget-green mt-0.5 shrink-0">&#10003;</span>
              <span>{t("online_features_prompt_feature_sync")}</span>
            </li>
            <li className="text-sm text-gray-600 dark:text-gray-300 flex items-start gap-2">
              <span className="text-budget-green mt-0.5 shrink-0">&#10003;</span>
              <span>{t("online_features_prompt_feature_sharing")}</span>
            </li>
          </ul>

          <div className="space-y-1.5">
            <p className="text-sm font-semibold text-[#0b0b0b] dark:text-white">
              {t("online_features_prompt_optional_title")}
            </p>
            <p className="text-sm leading-relaxed text-gray-600 dark:text-gray-300">
              {t("online_features_prompt_optional_body")}
            </p>
          </div>

          {/* Account required text - only shown when no valid session exists.
              Keyed off !(isLoggedIn && hasSession) to match the primary button
              and checkbox guards — covers the hybrid state where isLoggedIn=true
              from local-only onboarding but no session_token is present. */}
          {!(isLoggedIn && hasSession) && (
            <p className="text-sm text-gray-600 dark:text-gray-300">
              {t("online_features_prompt_account_required")}
            </p>
          )}

          {/* Do not show again checkbox — only for logged-in users with a valid session.
              Non-logged-in users (no session) must always see the prompt so they can
              register or cancel. */}
          {isLoggedIn && hasSession && (
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={dontShowAgain}
                onChange={(e) => handleDontShowAgainChange(e.target.checked)}
                className="h-4 w-4 rounded border-gray-300 text-budget-blue focus:ring-budget-blue accent-[#0B75C2]"
              />
              <span className="text-sm text-gray-500 dark:text-gray-400">
                {t("online_features_prompt_dont_show_again")}
              </span>
            </label>
          )}

          {/* Action buttons */}
          <div className="flex flex-col sm:flex-row gap-3 pt-4">
            <Button
              variant="secondary"
              onClick={handleSecondaryAction}
              className="w-full sm:flex-1 min-h-[52px] h-auto px-3 py-3 whitespace-normal break-words text-center font-bold rounded-[8px] bg-secondary text-foreground dark:text-white border-border hover:bg-secondary/80"
            >
              {t("online_features_prompt_cancel")}
            </Button>
            <Button
              onClick={handlePrimaryAction}
              className="w-full sm:flex-1 min-h-[52px] h-auto px-3 py-3 whitespace-normal break-words text-center font-bold rounded-[8px] bg-[#3FCB72] hover:bg-[#3FCB72]/90 text-white"
            >
              {isLoggedIn && hasSession
                ? t("online_features_prompt_confirm")
                : t("online_features_prompt_register")}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default OnlineFeaturesPrompt;