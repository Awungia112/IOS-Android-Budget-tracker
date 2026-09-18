import { useState, useEffect, useMemo, useCallback } from "react";
import Layout from "@/components/Layout";
import { useBudget } from "@/contexts/BudgetContext";
import {
  formatCurrency,
  formatDate,
  calculateProgress,
  calculateTotalSavings,
  calculateTotalPaymentsNeeded,
  calculatePaymentsLeft,
  calculateSavingsGoalEndDate,
  calculateSavingsGoalEndDateAsDate,
} from "@/lib/formatters";
import { translateCategoryLabel } from "@/lib/categoryHelpers";
import { CategoryAvatar } from "@/components/CategoryAvatar";
import { filterExecutedTransactions } from "@budget/core";
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
import { Trash2, Plus, Check } from "lucide-react";
import { toast } from "@/components/ui/use-toast";
import { useTranslation } from "react-i18next";
import { useNavigate, useParams } from "react-router-dom";
import { SavingsGoalCompletionDialog } from "@/components/SavingsGoalCompletionDialog";

export default function SavingsGoalDetail() {
  const navigate = useNavigate();
  const { goalId } = useParams();
  const {
    savingsGoals,
    categories,
    transactions,
    deleteSavingsGoal,
    addTransaction,
    deleteTransaction,
  } = useBudget();
  const { t, i18n } = useTranslation();

  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [showCompletionDialog, setShowCompletionDialog] = useState(false);
  const [hasDismissedCompletion, setHasDismissedCompletion] = useState(false);

  const currentGoal = savingsGoals.find((g) => g.id === goalId);

  // All hooks must be called before early return
  // Calculate derived values
  const category = currentGoal
    ? categories.find((c) => c.id === currentGoal.categoryId)
    : null;

  const formatMonthDate = useCallback((): string => {
    if (!currentGoal) return "";
    const locale = i18n.language === "en" ? "en-US" : "de-DE";
    const deadline = new Date(currentGoal.deadline);
    return deadline.toLocaleDateString(locale, {
      year: "numeric",
      month: "long",
    });
  }, [currentGoal, i18n.language]);

  const totalSavings = calculateTotalSavings(transactions);

  // Memoized calculation for current savings of this goal - reused throughout the component
  const goalCurrentSavings = useMemo(() => {
    if (!currentGoal) return 0;
    return transactions
      .filter((t) => t.type === "expense" && t.savingsGoalId === currentGoal.id)
      .reduce((sum, t) => sum + t.amount, 0);
  }, [currentGoal, transactions]);

  const currentSavings = goalCurrentSavings;

  const paymentTransactions = useMemo(() => {
    return currentGoal
      ? transactions
          .filter((t) => t.type === "expense" && t.savingsGoalId === currentGoal.id)
          .sort((a, b) => {
            // Normalize dates to start of day for consistent comparison
            const dateA = new Date(a.date);
            const dateB = new Date(b.date);
            dateA.setHours(0, 0, 0, 0);
            dateB.setHours(0, 0, 0, 0);
            
            const dateDiff = dateA.getTime() - dateB.getTime();
            if (dateDiff !== 0) return dateDiff;
            
            // For same-day payments, sort by creation time if available (oldest first)
            if (a.createdAt && b.createdAt) {
              return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
            }
            
            // Fallback to ID for stable ordering
            return a.id.localeCompare(b.id);
          })
      : [];
  }, [currentGoal, transactions]);

  const progress = currentGoal
    ? calculateProgress(currentSavings, currentGoal.targetAmount)
    : 0;

  const goalCompleted =
    currentGoal && currentSavings >= currentGoal.targetAmount;

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const monthsUntilDeadline = currentGoal
    ? (() => {
        const deadline = new Date(currentGoal.deadline);
        deadline.setHours(0, 0, 0, 0);
        return Math.max(
          1,
          Math.ceil(
            (deadline.getTime() - today.getTime()) /
              (1000 * 60 * 60 * 24 * 30.44),
          ),
        );
      })()
    : 1;

  const totalPayments = monthsUntilDeadline;

  const monthlyAmount = currentGoal
    ? (currentGoal.monthlyAmount)
      ? (currentGoal.monthlyAmount > currentGoal.targetAmount)
        ? currentGoal.targetAmount
        : currentGoal.monthlyAmount
      : (() => {
          // Calculate current savings for this goal
          const currentSavings = filterExecutedTransactions(transactions)
            .filter((t) => t.type === "expense" && t.savingsGoalId === currentGoal.id)
            .reduce((sum, t) => sum + t.amount, 0);
          
          // Use remaining amount instead of full target amount
          const remainingAmount = Math.max(0, currentGoal.targetAmount - currentSavings);
          
          // Calculate months until deadline using calculated end date
          const today = new Date();
          today.setHours(0, 0, 0, 0);
          
          const endDate = calculateSavingsGoalEndDateAsDate(currentGoal, transactions);
          endDate.setHours(0, 0, 0, 0);
          
          const monthsUntilDeadline = Math.max(
            1,
            Math.ceil(
              (endDate.getTime() - today.getTime()) /
                (1000 * 60 * 60 * 24 * 30.44),
            ),
          );
          
          // Calculate monthly amount based on remaining amount
          return remainingAmount > 0 ? remainingAmount / monthsUntilDeadline : 0;
        })()
    : 0;

  // Calculate payments based on actual transaction count
  const paymentsMade = paymentTransactions.length;
  const totalPaymentsNeeded = calculateTotalPaymentsNeeded(
    currentGoal?.targetAmount || 0, 
    currentSavings, 
    paymentsMade, 
    monthlyAmount
  );

  const calculateEndDate = useCallback((): string => {
    if (!currentGoal) return "";
    return calculateSavingsGoalEndDate(currentGoal, transactions, i18n.language);
  }, [currentGoal, transactions, i18n.language]);

  // Check if goal has already been completed and get completion details
  const completionDetails = useMemo(() => {
    if (!currentGoal) return { isCompleted: false };
    
    // Calculate current savings for this goal
    const goalCurrentSavings = filterExecutedTransactions(transactions)
      .filter((t) => t.type === "expense" && t.savingsGoalId === currentGoal.id)
      .reduce((sum, t) => sum + t.amount, 0);
    
    // Look for completion transactions using the isCompletionTransaction flag
    const completionTransactions = transactions.filter(t => t.isCompletionTransaction);
    
    // Find completion transaction for this goal by savingsGoalId
    const completionTransaction = completionTransactions.find(
      (t) => t.savingsGoalId === currentGoal.id
    );
    
    return {
      isCompleted: !!completionTransaction,
      completionType: completionTransaction?.type || null,
      completionDate: completionTransaction?.date || null,
      completionAmount: completionTransaction?.amount || 0
    };
  }, [currentGoal, transactions]);

  // Check if goal has already been completed (has completion transaction)
  const hasCompletionTransaction = useMemo(() => {
    if (!currentGoal) return false;
    
    // Calculate current savings for this goal
    const goalCurrentSavings = filterExecutedTransactions(transactions)
      .filter((t) => t.type === "expense" && t.savingsGoalId === currentGoal.id)
      .reduce((sum, t) => sum + t.amount, 0);
    
    // Look for completion transactions using the isCompletionTransaction flag
    const completionTransactions = transactions.filter(t => t.isCompletionTransaction);
    
    // Find completion transaction for this goal by savingsGoalId
    const completionTransaction = completionTransactions.find(
      (t) => t.savingsGoalId === currentGoal.id
    );
    
    return !!completionTransaction;
  }, [currentGoal, transactions]);

  // Show completion dialog when goal is completed and no completion transaction exists yet
  useEffect(() => {
    if (goalCompleted && !hasCompletionTransaction && goalId && !hasDismissedCompletion) {
      setShowCompletionDialog(true);
    }
  }, [goalCompleted, hasCompletionTransaction, goalId, hasDismissedCompletion]);

  const handleDelete = () => {
    if (currentGoal) {
      deleteSavingsGoal(currentGoal.id);
      navigate("/savings-goals");
    }
  };

  const handleCompletionIncome = useCallback(async () => {
    if (!currentGoal || !goalId) return;

    try {
      setShowCompletionDialog(false);

      const savings = transactions
        .filter(
          (t) => t.type === "expense" && t.savingsGoalId === currentGoal.id,
        )
        .reduce((sum, t) => sum + t.amount, 0);

      // Don't delete payment transactions - keep them for history

      const incomeCategory = categories.find(
        (c) => c.type === "income" && c.name === "income",
      );

      const incomeTransaction = {
        type: "income" as const,
        amount: savings,
        title: category
          ? `${translateCategoryLabel(t, category.name, category.isDefault ?? false)} - ${t("savingsGoals.completed")}`
          : t("savingsGoals.completed"),
        category: incomeCategory?.name || "income",
        date: new Date().toISOString().split("T")[0],
        // Add goalId to transaction for better tracking
        savingsGoalId: currentGoal.id, // Store the goal ID for proper tracking
        isCompletionTransaction: true, // Mark this as a completion transaction
      };

      await addTransaction(incomeTransaction);
      
      // Show success toast
      toast({
        title: t("savingsGoals.payment_recorded_as_income"),
        className: "bg-green-500 text-white border-green-500",
      });
      
      // Auto-navigate to completed page
      navigate("/savings-goals/completed");
    } catch (error) {
      console.error("Error in handleCompletionIncome:", error);
      toast({
        title: t("error"),
        description: t("savingsGoals.completion_error"),
        variant: "destructive",
      });
    }
  }, [currentGoal, goalId, transactions, categories, category, addTransaction, navigate, t]);

  const handleCompletionExpense = useCallback(async () => {
    if (!goalId) return;

    try {
      setShowCompletionDialog(false);

      const savings = transactions
        .filter((t) => t.type === "expense" && t.savingsGoalId === goalId)
        .reduce((sum, t) => sum + t.amount, 0);

      // Delete all individual payment transactions first
      const paymentTransactions = transactions.filter(
        (t) => t.type === "expense" && t.savingsGoalId === goalId
      );
      
      for (const paymentTransaction of paymentTransactions) {
        await deleteTransaction(paymentTransaction.id);
      }

      const expenseCategory = categories.find(
        (c) => c.id === currentGoal?.categoryId,
      );

      // Create a single expense transaction for the total goal amount
      const expenseTransaction = {
        type: "expense" as const,
        amount: currentGoal?.targetAmount || savings, // Use complete goal amount
        title: category
          ? translateCategoryLabel(t, category.name, category.isDefault ?? false)
          : t("savingsGoals.completed"),
        category: expenseCategory?.name || "uncategorized",
        date: new Date().toISOString().split("T")[0],
        // Store the goal ID for proper tracking
        savingsGoalId: currentGoal?.id || goalId,
        isCompletionTransaction: true, // Mark this as a completion transaction so it can be identified
      };

      await addTransaction(expenseTransaction);
      
      // Show success toast
      toast({
        title: t("savingsGoals.payment_recorded_as_expense"),
        className: "bg-red-500 text-white border-red-500",
      });
      
      // Auto-navigate to completed page
      navigate("/savings-goals/completed");
    } catch (error) {
      console.error("Error in handleCompletionExpense:", error);
      toast({
        title: t("error"),
        description: t("savingsGoals.completion_error"),
        variant: "destructive",
      });
    }
  }, [goalId, transactions, categories, currentGoal, addTransaction, navigate, t, deleteTransaction, category]);

  if (!currentGoal) {
    return (
      <Layout>
        <div className="flex items-center justify-center h-screen bg-white dark:bg-[#1A2124]">
          <div className="text-black dark:text-white text-center">
            <p className="text-lg font-semibold">{t("unknownCategory")}</p>
          </div>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="flex flex-col h-screen bg-white dark:bg-[#1A2124]">
        {/* Header */}
        <div className="sticky top-0 z-20 flex items-center justify-between h-16 px-6 bg-white dark:bg-[#1A2124] border-b border-gray-200 dark:border-white/10 text-black dark:text-white ios-header-safe-area transition-colors">
          <button
            onClick={() => navigate("/savings-goals")}
            className="flex-none text-black dark:text-white hover:opacity-70 transition-opacity"
          >
            <span className="text-sm font-medium">{t("cancel")}</span>
          </button>
          
          <h1 className="flex-1 px-4 text-center text-lg font-bold truncate">
            {currentGoal.name}
          </h1>

          <div className="flex-none min-w-[60px] flex justify-end">
            {goalCompleted ? (
              <div className="px-2 py-1 rounded-full bg-green-500/20 border border-green-500/30">
                <span className="text-green-600 dark:text-green-300 text-[10px] font-bold whitespace-nowrap">
                  {t("savingsGoals.completed")}
                </span>
              </div>
            ) : (
              <button
                onClick={() => navigate(`/savings-goals/edit/${goalId}`)}
                className="text-black dark:text-white font-bold hover:opacity-70 transition-opacity cursor-pointer"
              >
                <span className="text-sm font-bold">{t("edit")}</span>
              </button>
            )}
          </div>
        </div>



        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto pb-20">
          <div className="px-6 py-6 max-w-2xl mx-auto">
            {/* Icon Label */}
            <div className="flex justify-center mb-6">
              <CategoryAvatar
                categoryKey={category?.name || ""}
                icon={category?.icon}
                size={60}
              />
            </div>

            {/* Goal Name */}
            <div className="text-center">
              <h2 className="text-black dark:text-white text-4xl font-bold mb-2">
                {currentGoal.name}
              </h2>
            </div>

            {/* Subtitle with monthly amount and deadline */}
            <div className="text-center mb-6">
              <p className="text-gray-500 dark:text-white/60 text-sm">
                {formatCurrency(monthlyAmount)}{" "}
                {t("frequency_monthly").toLowerCase()} {t("savingsGoals.until")}{" "}
                {calculateEndDate()}
              </p>
            </div>

            {/* Main Amount Box */}
            <div className="border border-dashed border-black/10 dark:border-white/20 rounded-lg p-2 text-center mb-6 bg-white dark:bg-white/5 shadow-sm">
              <div className="rounded-lg p-6 bg-transparent overflow-hidden">
                <div className="flex justify-center items-center gap-1 mb-2 flex-wrap min-w-0">
                  <span
                    className={`font-bold truncate text-budget-green ${
                      formatCurrency(currentSavings).length > 10
                        ? "text-xl sm:text-2xl"
                        : formatCurrency(currentSavings).length > 8
                          ? "text-2xl sm:text-3xl"
                          : "text-2xl sm:text-4xl"
                    }`}
                    data-testid="savings-goal-detail-saved"
                  >
                    {formatCurrency(currentSavings)}
                  </span>
                  <span
                    className={`text-gray-500 dark:text-white/60 font-bold ${
                      formatCurrency(currentSavings).length > 10
                        ? "text-lg sm:text-xl"
                        : formatCurrency(currentSavings).length > 8
                          ? "text-xl sm:text-2xl"
                          : "text-2xl sm:text-3xl"
                    }`}
                  >
                    /
                  </span>
                  <span
                    className={`font-bold text-black dark:text-white truncate ${
                      formatCurrency(currentGoal.targetAmount).length > 10
                        ? "text-xl sm:text-2xl"
                        : formatCurrency(currentGoal.targetAmount).length > 8
                          ? "text-2xl sm:text-3xl"
                          : "text-2xl sm:text-4xl"
                    }`}
                  >
                    {formatCurrency(currentGoal.targetAmount)}
                  </span>
                </div>
              </div>
            </div>

            {/* Completion Status - Only show if goal is completed */}
            {completionDetails.isCompleted && completionDetails.completionDate && (
              <div className="text-center mb-6">
                <div className="flex items-center justify-center gap-2 mb-2">
                  <span className={`text-sm font-medium ${
                    completionDetails.completionType === 'income' 
                      ? 'text-green-300' 
                      : 'text-red-300'
                  }`}>
                    {completionDetails.completionType === 'income' 
                      ? t("savingsGoals.completionIncome") 
                      : t("savingsGoals.completionExpense")}
                  </span>
                </div>
                <div className="text-gray-500 dark:text-white/60 text-sm">
                  {t("savingsGoals.completedOn")}
                </div>
                <div className="text-black dark:text-white font-medium">
                  {formatDate(completionDetails.completionDate)}
                </div>
              </div>
            )}

            {/* Payments Info */}
            <div className="text-center text-gray-500 dark:text-white/60 text-sm mb-8" data-testid="savings-goal-detail-payments">
              <p>
                {paymentsMade} {t("savingsGoals.of")} {totalPaymentsNeeded}{" "}
                {t("savingsGoals.paymentsMade")}
              </p>
            </div>

            {/* Next Payment Button and Timeline Container */}
            <div className="relative px-2">
              {/* Next Payment Button - Only show if goal is not completed */}
              {!goalCompleted && (
                <button
                  onClick={() => navigate(`/savings-goals/${goalId}/pay`)}
                  className="w-full border border-dashed border-black/10 dark:border-white/20 rounded-lg p-4 hover:border-black/30 dark:hover:border-white/40 bg-white dark:bg-white/5 hover:bg-gray-50 dark:hover:bg-white/10 transition-all cursor-pointer mb-6 relative z-10"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-green-500/10 border-2 border-green-500/50 flex items-center justify-center flex-shrink-0">
                      <Plus className="w-5 h-5 text-green-600 dark:text-green-400" />
                    </div>
                    <p className="text-gray-600 dark:text-white/70 text-sm font-medium">
                      {t("savingsGoals.nextPayment")}
                    </p>
                  </div>
                </button>
              )}

              {/* Payment Schedule Timeline */}
              {paymentTransactions.length > 0 && (
                <div className="space-y-2">
                  {paymentTransactions.map((transaction) => {
                    const formattedDate = formatDate(transaction.date);

                    return (
                      <div
                        key={`payment-${transaction.id}`}
                        className="relative p-4 border border-dashed border-black/10 dark:border-white/20 rounded-xl"
                      >
                        <div className="flex items-center gap-4">
                          <div className="relative z-10 flex-shrink-0 w-10 h-10 rounded-full bg-green-500 border-2 border-green-500/50"></div>
                          <div className="flex-grow flex justify-between items-center bg-white dark:bg-white/5 border border-black/10 dark:border-white/10 p-4 rounded-lg shadow-sm">
                            <span className="text-sm font-semibold text-gray-500 dark:text-white/60">
                              {formattedDate}
                            </span>
                            <span className="text-sm font-bold text-black dark:text-white">
                              {formatCurrency(transaction.amount)}
                            </span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Delete Button */}
            <div className="pt-10 flex justify-center">
              <button
                onClick={() => setDeleteConfirmOpen(true)}
                className="w-full max-w-[280px] py-2.5 px-6 rounded-[12px] bg-red-500/10 border border-red-500/20 flex items-center justify-center gap-2 hover:bg-red-500/20 transition-all text-budget-red font-semibold shadow-sm"
                data-testid="savings-goal-detail-delete"
              >


                <Trash2 className="w-5 h-5" />
                <span>{t("savingsGoals.delete")}</span>
              </button>
            </div>


          </div>
        </div>

        {/* Delete Confirmation Dialog */}
        <AlertDialog
          open={deleteConfirmOpen}
          onOpenChange={setDeleteConfirmOpen}
        >
          <AlertDialogContent className="rounded-[12px] max-w-[calc(100%-2rem)] bg-white dark:bg-[#1A2124] border-gray-200 dark:border-white/10 shadow-lg">
            <AlertDialogHeader>
              <AlertDialogTitle className="text-lg font-semibold text-foreground">
                {t("savingsGoals.deleteConfirmTitle")}
              </AlertDialogTitle>
              <AlertDialogDescription className="text-muted-foreground">
                {t("savingsGoals.deleteConfirmDescription")}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter className="flex-row gap-3 sm:gap-3">
              <AlertDialogCancel className="flex-1 rounded-[8px] mt-0 bg-white dark:bg-white/10 text-black dark:text-white border border-black/10 dark:border-white/10 hover:bg-gray-50 dark:hover:bg-white/20 shadow-sm">
                {t("savingsGoals.deleteConfirmCancel")}
              </AlertDialogCancel>
              <AlertDialogAction
                onClick={handleDelete}
                className="flex-1 rounded-[8px] bg-budget-red hover:bg-budget-red/90"
                data-testid="savings-goal-detail-delete-confirm"
              >
                {t("savingsGoals.deleteConfirmDelete")}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* Completion Dialog */}
        <SavingsGoalCompletionDialog
          open={showCompletionDialog}
          onOpenChange={(open) => {
            setShowCompletionDialog(open);
            if (!open) {
              setHasDismissedCompletion(true);
            }
          }}
          onIncome={handleCompletionIncome}
          onExpense={handleCompletionExpense}
        />
      </div>
    </Layout>
  );
}
