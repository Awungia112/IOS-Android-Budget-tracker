import { formatCurrency, formatDate } from "@/lib/formatters";
import { useBudget } from "@/contexts/BudgetContext";
import { Transaction } from "@budget/core";
import { cn } from "@/lib/utils";
import { X } from "lucide-react";
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
import { Button } from "@/components/ui/button";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { translateCategoryLabel } from "@/lib/categoryHelpers";

interface PendingTransactionItemProps {
  transaction: Transaction;
  "data-testid"?: string;
}

/**
 * PendingTransactionItem Component
 *
 * Displays a pending transaction (scheduled for a future date) with:
 * - Days until execution indicator
 * - Cancel/Delete button for user to cancel the pending transaction
 * - Visual distinction from executed transactions
 *
 * Key features per requirements:
 * - Shows when money is blocked but not yet debited
 * - Allows cancellation within a few days before the due date
 * - Provides visibility of pending transactions
 */
const PendingTransactionItem = ({
  transaction,
  "data-testid": testId,
}: PendingTransactionItemProps) => {
  const { categories, deleteTransaction } = useBudget();
  const { t, i18n } = useTranslation();
  const language = i18n.language;
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);

  const category = categories.find((cat) => cat.id === transaction.category);

  const formattedDate = formatDate(transaction.date);
  
  // Check if this is a recurring-generated transaction or manually marked as recurring
  const isRecurring = transaction.id.startsWith('recurring-') || transaction.isRecurring;

  return (
    <div
      className="flex items-center justify-between p-4 gap-3 hover:bg-gray-50 dark:hover:bg-slate-800/50 transition-colors"
      data-testid={testId || "pending-transaction-item"}
    >
      <div className="flex-1 min-w-0">
        <div className="font-bold text-black dark:text-slate-100">
          {transaction.title ||
            (category ? translateCategoryLabel(t, category.name, category.isDefault ?? false) : null) ||
            (transaction.type === "income"
              ? t("new_income")
              : t("new_expense"))}
        </div>
        <div className="text-xs text-muted-foreground dark:text-slate-400 flex items-center gap-2 mt-1">
          <span>{formattedDate}</span>
          {isRecurring && (
            <>
              <span>•</span>
              <span className="text-muted-foreground dark:text-slate-400 font-medium">
                {t("recurring", "Recurring")}
              </span>
            </>
          )}
          <span>•</span>
          <span className="truncate text-muted-foreground dark:text-slate-500">
            {category ? translateCategoryLabel(t, category.name, category.isDefault ?? false) : ""}
          </span>
        </div>
      </div>

      {/* Right side - Amount and Delete Button */}
      <div className="flex items-center gap-3">
        <span
          className={cn(
            "font-bold whitespace-nowrap text-sm",
            transaction.type === "income"
              ? "text-budget-green"
              : "text-budget-red",
          )}
        >
          {transaction.type === "income" ? "+" : "-"}
          {formatCurrency(transaction.amount)}
        </span>

        {!isRecurring && (
          <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setDeleteDialogOpen(true)}
              className="h-8 w-8 text-muted-foreground/60 hover:text-red-600 dark:hover:text-red-400"
              aria-label={t("cancel_pending_transaction", "Cancel pending transaction")}
              title={t(
                "cancel_pending_transaction",
                "Cancel pending transaction",
              )}
            >
            <X className="h-4 w-4" aria-hidden="true" />
          </Button>

          <AlertDialogContent className="rounded-[12px] w-full max-w-sm px-6 bg-white dark:bg-[#1A2124] border-gray-200 dark:border-white/10 shadow-lg">
            <AlertDialogHeader>
              <AlertDialogTitle className="text-lg font-semibold text-black dark:text-white">
                {t("cancel_pending_transaction", "Cancel Pending Transaction")}
              </AlertDialogTitle>
              <AlertDialogDescription className="text-gray-500 dark:text-gray-400">
                {t(
                  "cancel_pending_transaction_confirmation",
                  "Are you sure you want to cancel this pending transaction? The blocked amount will be released back to your account.",
                )}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter className="flex-row gap-3 sm:gap-3">
              <AlertDialogCancel className="flex-1 rounded-[8px] mt-0 bg-gray-100 dark:bg-white/10 text-black dark:text-white border-gray-200 dark:border-white/10 hover:bg-gray-200 dark:hover:bg-white/20">
                {t("keep_transaction", "Keep Transaction")}
              </AlertDialogCancel>
              <AlertDialogAction
                onClick={() => deleteTransaction(transaction.id)}
                className="flex-1 rounded-[8px] bg-budget-red hover:bg-budget-red/90"
              >
                {t("cancel_transaction", "Cancel Transaction")}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
        )}
      </div>
    </div>
  );
};

export default PendingTransactionItem;
