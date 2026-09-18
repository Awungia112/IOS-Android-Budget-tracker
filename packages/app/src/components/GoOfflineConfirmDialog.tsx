import { useTranslation } from "react-i18next";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { WifiOff } from "lucide-react";

interface GoOfflineConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
  onCancel: () => void;
}

const GoOfflineConfirmDialog = ({
  open,
  onOpenChange,
  onConfirm,
  onCancel,
}: GoOfflineConfirmDialogProps) => {
  const { t } = useTranslation();

  const handleConfirm = () => {
    onOpenChange(false);
    onConfirm();
  };

  const handleCancel = () => {
    onOpenChange(false);
    onCancel();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="rounded-[12px] max-w-[calc(100%-2rem)] bg-white dark:bg-[#1A2124] border-gray-200 dark:border-white/10 shadow-lg"
        onInteractOutside={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle className="text-lg font-semibold text-black dark:text-white flex items-center gap-2">
            <WifiOff className="h-5 w-5 text-budget-blue shrink-0" />
            {t("go_offline_confirm_title")}
          </DialogTitle>
          <DialogDescription className="sr-only">
            {t("go_offline_confirm_title")}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Body text */}
          <p className="text-sm text-gray-600 dark:text-gray-300">
            {t("go_offline_confirm_body")}
          </p>

          {/* Data reassurance */}
          <p className="text-sm text-gray-600 dark:text-gray-300">
            {t("go_offline_confirm_data_note")}
          </p>

          {/* Action buttons */}
          <div className="flex gap-3 pt-4">
            <Button
              variant="secondary"
              onClick={handleCancel}
              className="flex-1 h-[58px] font-bold rounded-[8px] bg-secondary text-foreground dark:text-white border-border hover:bg-secondary/80"
            >
              {t("go_offline_confirm_cancel")}
            </Button>
            <Button
              onClick={handleConfirm}
              className="flex-1 h-[58px] font-bold rounded-[8px] bg-budget-blue hover:bg-budget-blue/90 text-white"
            >
              {t("go_offline_confirm_proceed")}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default GoOfflineConfirmDialog;