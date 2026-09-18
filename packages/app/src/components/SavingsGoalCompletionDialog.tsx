import { useState } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useTranslation } from "react-i18next";
import { CheckCircle, ShoppingCart, TrendingUp, Loader2 } from "lucide-react";

interface SavingsGoalCompletionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onIncome: () => Promise<void> | void;
  onExpense: () => Promise<void> | void;
}

export function SavingsGoalCompletionDialog({
  open,
  onOpenChange,
  onIncome,
  onExpense,
}: SavingsGoalCompletionDialogProps) {
  const { t } = useTranslation();

  // Internal state for handling async operations
  const [isProcessing, setIsProcessing] = useState(false);
  const [actionType, setActionType] = useState<"income" | "expense" | null>(
    null,
  );

  const handleIncomeAction = async () => {
    setIsProcessing(true);
    setActionType("income");

    try {
      await onIncome();
    } catch (error) {
      console.error("Income action failed:", error);
    } finally {
      setIsProcessing(false);
      setActionType(null);
    }
  };

  const handleExpenseAction = async () => {
    setIsProcessing(true);
    setActionType("expense");

    try {
      await onExpense();
    } catch (error) {
      console.error("Expense action failed:", error);
    } finally {
      setIsProcessing(false);
      setActionType(null);
    }
  };

  const handleClose = () => {
    // Only close if not processing and no action was taken
    // This should NOT trigger any financial actions
    if (!isProcessing) {
      onOpenChange(false);
    }
  };

  // Explicitly handle escape key and outside clicks to prevent any actions
  const handleEscapeOrOutsideClick = () => {
    // When user escapes or clicks outside, just close - no actions
    if (!isProcessing) {
      onOpenChange(false);
    }
  };

  return (
    <AlertDialog open={open} onOpenChange={handleClose}>
      <AlertDialogContent className="max-w-lg mx-auto rounded-2xl bg-white dark:bg-[#1a1a1a] backdrop-blur-2xl border border-gray-200/20 dark:border-gray-700/30 shadow-2xl shadow-black/10 sm:max-w-xl md:max-w-2xl">
        {/* Success Icon */}
        <div className="flex justify-center -mt-8 mb-4">
          <div className="w-16 h-16 rounded-full bg-gradient-to-br from-green-400 to-emerald-500 flex items-center justify-center shadow-lg">
            <CheckCircle className="w-8 h-8 text-white" data-testid="icon-CheckCircle" />
          </div>
        </div>

        <AlertDialogHeader className="text-center px-4 sm:px-6 pb-4">
          <AlertDialogTitle className="text-xl font-bold text-gray-900 dark:text-white leading-tight mb-3">
            {t("savingsGoals.completionTitle")}
          </AlertDialogTitle>
          <AlertDialogDescription className="text-sm text-gray-600 dark:text-gray-300 leading-relaxed px-2">
            {t("savingsGoals.completionDescription")}
          </AlertDialogDescription>
        </AlertDialogHeader>

        {/* Choice Cards */}
        <div className="px-4 sm:px-6 pb-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
            {/* Income Option */}
            <AlertDialogAction
              onClick={handleIncomeAction}
              disabled={isProcessing}
              className="p-3 bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-600 hover:to-emerald-700 dark:from-green-600 dark:to-emerald-600 dark:hover:from-green-700 dark:hover:to-emerald-700 text-white font-semibold shadow-lg hover:shadow-xl transform hover:scale-105 transition-all duration-200 rounded-xl group focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-green-400/50 focus-visible:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none"
            >
              {isProcessing && actionType === "income" ? (
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center">
                    <Loader2 className="w-4 h-4 text-white animate-spin" />
                  </div>
                  <div className="flex-1 text-left min-w-0">
                    <div className="font-bold text-white text-xs truncate">
                      Processing...
                    </div>
                    <div className="text-xs text-white/90 mt-0.5 truncate">
                      Adding to income
                    </div>
                  </div>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center group-hover:bg-white/30 transition-colors">
                    <TrendingUp className="w-4 h-4 text-white" data-testid="icon-TrendingUp" />
                  </div>
                  <div className="flex-1 text-left min-w-0">
                    <div className="font-bold text-white text-xs truncate">
                      {t("savingsGoals.completionIncome")}
                    </div>
                    <div className="text-xs text-white/90 mt-0.5 truncate">
                      {t("savingsGoals.creditAsIncome")}
                    </div>
                  </div>
                </div>
              )}
            </AlertDialogAction>

            {/* Expense Option */}
            <AlertDialogAction
              onClick={handleExpenseAction}
              disabled={isProcessing}
              className="p-3 bg-gradient-to-r from-red-500 to-orange-600 hover:from-red-600 hover:to-orange-700 dark:from-red-600 dark:to-orange-600 dark:hover:from-red-700 dark:hover:to-orange-700 text-white font-semibold shadow-lg hover:shadow-xl transform hover:scale-105 transition-all duration-200 rounded-xl group focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-red-400/50 focus-visible:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none"
            >
              {isProcessing && actionType === "expense" ? (
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center">
                    <Loader2 className="w-4 h-4 text-white animate-spin" />
                  </div>
                  <div className="flex-1 text-left min-w-0">
                    <div className="font-bold text-white text-xs truncate">
                      Processing...
                    </div>
                    <div className="text-xs text-white/90 mt-0.5 truncate">
                      Recording expense
                    </div>
                  </div>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center group-hover:bg-white/30 transition-colors">
                    <ShoppingCart className="w-4 h-4 text-white" data-testid="icon-ShoppingCart" />
                  </div>
                  <div className="flex-1 text-left min-w-0">
                    <div className="font-bold text-white text-xs truncate">
                      {t("savingsGoals.completionExpense")}
                    </div>
                    <div className="text-xs text-white/90 mt-0.5 truncate">
                      {t("savingsGoals.recordAsExpense")}
                    </div>
                  </div>
                </div>
              )}
            </AlertDialogAction>
          </div>
        </div>
      </AlertDialogContent>
    </AlertDialog>
  );
}
