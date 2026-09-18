import { useState, useMemo, useCallback, useEffect, useRef } from "react";
import Layout from "@/components/Layout";
import { useBudget } from "@/contexts/BudgetContext";
import {
  formatCurrency,
  formatDate,
  calculateProgress,
  calculateTotalSavings,
} from "@/lib/formatters";
import { translateCategoryLabel } from "@/lib/categoryHelpers";
import { CategoryAvatar } from "@/components/CategoryAvatar";
import { useTranslation } from "react-i18next";
import { useNavigate, useParams } from "react-router-dom";
import { toast } from "@/components/ui/use-toast";
import { Check, Loader2 } from "lucide-react";
import { filterExecutedTransactions } from "@budget/core";
import { SavingsGoalCompletionDialog } from "@/components/SavingsGoalCompletionDialog";

// Define the possible states for the payment flow
type PaymentStep = 
  | 'input'           // Initial payment input screen
  | 'success'         // Payment successful, showing success screen
  | 'completion'      // Goal completed, showing completion dialog
  | 'loading'         // Processing payment or completion action
  | 'error';          // Error state

export default function MakeSavingsPayment() {
  const navigate = useNavigate();
  const { goalId } = useParams();
  const { savingsGoals, categories, transactions, addTransaction, deleteTransaction, deleteSavingsGoal, updateSavingsGoal } =
    useBudget();
  const { t } = useTranslation();
  const inputRef = useRef<HTMLInputElement>(null);

  const goal = savingsGoals.find((g) => g.id === goalId);
  const category = goal
    ? categories.find((c) => c.id === goal.categoryId)
    : null;

  // Single memoized calculation for current savings of this goal
  const currentSavings = useMemo(() => {
    return transactions
      .filter((t) => t.type === "expense" && t.savingsGoalId === goalId)
      .reduce((sum, t) => sum + t.amount, 0);
  }, [transactions, goalId]);

  // Calculate months until deadline
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const deadline = goal ? new Date(goal.deadline) : new Date();
  deadline.setHours(0, 0, 0, 0);

  const monthsUntilDeadline = Math.max(
    1,
    Math.ceil(
      (deadline.getTime() - today.getTime()) / (1000 * 60 * 60 * 24 * 30.44),
    ),
  );

  // Calculate recommended payment amount
  const recommendedPaymentAmount = useMemo(() => {
    if (!goal) return 0;
    
    const remainingAmount = Math.max(0, goal.targetAmount - currentSavings);
    
    // If this is the final payment (remaining amount <= monthly amount), show exact remaining amount
    if (goal.monthlyAmount && remainingAmount <= goal.monthlyAmount) {
      return remainingAmount;
    }
    
    // Otherwise use saved monthly amount, but ensure it doesn't exceed target
    if (goal.monthlyAmount) {
      // If monthly amount exceeds target, reduce it to target amount
      if (goal.monthlyAmount > goal.targetAmount) {
        return goal.targetAmount;
      }
      return goal.monthlyAmount;
    }
    
    return goal.targetAmount / monthsUntilDeadline;
  }, [goal, currentSavings, monthsUntilDeadline]);

  // Single source of truth for component state
  const [currentStep, setCurrentStep] = useState<PaymentStep>('input');
  const [paymentInput, setPaymentInput] = useState<string>("0.00");
  const [successAmount, setSuccessAmount] = useState(0);
  const [successDate, setSuccessDate] = useState("");
  const [hasDismissedCompletion, setHasDismissedCompletion] = useState(false);

  // Update payment input when recommended amount changes
  useEffect(() => {
    setPaymentInput(recommendedPaymentAmount.toFixed(2));
  }, [recommendedPaymentAmount]);

  // Auto-focus input when page loads
  useEffect(() => {
    if (inputRef.current && currentStep === 'input') {
      // Small delay to ensure the page is fully rendered
      const timer = setTimeout(() => {
        inputRef.current?.focus();
      }, 100);
      
      return () => clearTimeout(timer);
    }
  }, [currentStep]);

  // Calculate required monthly rate to reach goal (Soll-Rate)
  const requiredMonthlyRate = useMemo(() => {
    if (!goal || goal.targetAmount <= 0) return 0;
    
    // Calculate remaining amount needed
    const remainingAmount = Math.max(0, goal.targetAmount - currentSavings);
    
    // If goal has a monthlyAmount set, use the minimum of monthly amount vs remaining amount
    if (goal.monthlyAmount) {
      // For final payment, show remaining amount if it's less than monthly amount
      const monthlyAmount = goal.monthlyAmount > goal.targetAmount ? goal.targetAmount : goal.monthlyAmount;
      return Math.min(monthlyAmount, remainingAmount) || 0;
    }
    
    // If no monthly amount set, calculate based on remaining amount and deadline
    return monthsUntilDeadline > 0 ? remainingAmount / monthsUntilDeadline : 0;
  }, [goal, currentSavings, monthsUntilDeadline]);

  const formatCurrentDate = useCallback((): string => {
    return formatDate(new Date());
  }, []);

  // All hooks must be called at the top level, not conditionally
  const handlePaymentChange = useCallback((value: string) => {
    // Allow only numbers and decimal point
    const sanitizedValue = value.replace(/[^0-9.]/g, '');
    
    // Ensure only one decimal point
    const parts = sanitizedValue.split('.');
    if (parts.length > 2) {
      return;
    }
    
    // Limit to 2 decimal places
    if (parts[1] && parts[1].length > 2) {
      return;
    }
    
    setPaymentInput(sanitizedValue || '0');
  }, []);

  // Handle payment completion
  const handleDone = useCallback(async () => {
    const paymentValue = parseFloat(paymentInput);

    if (!paymentValue || paymentValue <= 0) {
      toast({
        title: t("error"),
        description: t("savingsGoals.invalid_payment_amount"),
        variant: "destructive",
      });
      return;
    }

    setCurrentStep('loading');

    try {
      const incomeCategory = categories.find(
        (c) => c.type === "income" && c.name === "income",
      );

      await addTransaction({
        type: "expense",
        amount: paymentValue,
        title: category
          ? translateCategoryLabel(t, category.name, category.isDefault ?? false)
          : t("unknownCategory"),
        category: category?.name || "expense", // Use the goal's category
        date: new Date().toISOString().split("T")[0],
        savingsGoalId: goalId,
      });

      // Check if this payment completes the goal
      const newTotalSavings = currentSavings + paymentValue;
      const goalCompleted = goal && newTotalSavings >= goal.targetAmount;

      if (goalCompleted) {
        setCurrentStep('completion');
      } else {
        // Set success state
        setSuccessAmount(paymentValue);
        setSuccessDate(formatCurrentDate());
        setCurrentStep('success');

        // Auto navigate after 2 seconds
        setTimeout(() => {
          navigate(`/savings-goals/${goalId}`);
        }, 2000);
      }
    } catch (error) {
      console.error("Payment error:", error);
      toast({
        title: t("error"),
        description: t("savingsGoals.payment_error"),
        variant: "destructive",
      });
      setCurrentStep('input');
    }
  }, [paymentInput, currentSavings, goal, goalId, category, t, navigate, addTransaction, categories, formatCurrentDate]);

  // Handle completion dialog actions
  const handleCompletionIncome = useCallback(async () => {
    // Only proceed if we're actually in completion state
    if (currentStep !== 'completion') {
      return;
    }

    setCurrentStep('loading');
    
    try {
      if (goal) {
        const currentSavings = filterExecutedTransactions(transactions)
          .filter((t) => t.type === "expense" && t.savingsGoalId === goalId)
          .reduce((sum, t) => sum + t.amount, 0);

        // Find standard income category (legacy app behavior)
        const incomeCategory = categories.find(
          (c) => c.type === "income" && c.isDefault
        );

        await addTransaction({
          type: "income",
          amount: currentSavings,
          title: category
            ? translateCategoryLabel(t, category.name, category.isDefault ?? false)
            : t("savingsGoals.completed"),
          category: incomeCategory?.name || "income",
          date: new Date().toISOString().split("T")[0],
        });

        // Remove goal only (legacy app behavior for income)
        await deleteSavingsGoal(goalId);

        // Show success toast
        toast({
          title: t("savingsGoals.payment_recorded_as_income"),
          className: "bg-green-500 text-white border-green-500",
        });
      }

      navigate("/savings-goals");
    } catch (error) {
      console.error("Completion income error:", error);
      toast({
        title: t("error"),
        description: t("savingsGoals.payment_error"),
        variant: "destructive",
      });
      setCurrentStep('completion');
    }
  }, [currentStep, goal, goalId, category, t, navigate, addTransaction, categories, transactions, deleteSavingsGoal]);

  const handleCompletionExpense = useCallback(async () => {
    // Only proceed if we're actually in completion state
    if (currentStep !== 'completion') {
      return;
    }

    setCurrentStep('loading');
    
    try {
      if (goal) {
        const currentSavings = filterExecutedTransactions(transactions)
          .filter((t) => t.type === "expense" && t.savingsGoalId === goalId)
          .reduce((sum, t) => sum + t.amount, 0);

        // Delete all individual payment transactions first
        const paymentTransactions = transactions.filter(
          (t) => t.type === "expense" && t.savingsGoalId === goalId
        );
        
        for (const paymentTransaction of paymentTransactions) {
          await deleteTransaction(paymentTransaction.id);
        }

        // Create a single expense transaction for the total goal amount
        await addTransaction({
          type: "expense",
          amount: goal.targetAmount, // Use the complete goal amount, not currentSavings
          title: category
            ? translateCategoryLabel(t, category.name, category.isDefault ?? false)
            : t("savingsGoals.completed"),
          category: category?.name || "expense",
          date: new Date().toISOString().split("T")[0],
          // No savingsGoalId - this is a regular expense transaction
          isCompletionTransaction: true, // Mark this as a completion transaction so it can be identified
        });

        // Remove goal
        await deleteSavingsGoal(goalId);

        // Show success toast
        toast({
          title: t("savingsGoals.payment_recorded_as_expense"),
          className: "bg-red-500 text-white border-red-500",
        });
      }

      navigate("/savings-goals");
    } catch (error) {
      console.error("Completion expense error:", error);
      toast({
        title: t("error"),
        description: t("savingsGoals.payment_error"),
        variant: "destructive",
      });
      setCurrentStep('completion');
    }
  }, [currentStep, goal, goalId, category, t, navigate, addTransaction, transactions, deleteSavingsGoal, deleteTransaction]);

  // Check if goal has already been completed (has completion transaction)
  const hasCompletionTransaction = useMemo(() => {
    if (!goal) return false;
    
    // Calculate current savings for this goal (from expense payments)
    const goalCurrentSavings = filterExecutedTransactions(transactions)
      .filter((t) => t.type === "expense" && t.savingsGoalId === goal.id)
      .reduce((sum, t) => sum + t.amount, 0);
    
    // Look for completion transactions specific to THIS goal
    // We need to be language-independent, so we'll match by amount and check if title contains "completed"
    const goalTransactions = transactions.filter(t => !t.savingsGoalId); // Only completion transactions
    
    // Find expense completion transaction (language-independent)
    const expenseTransaction = goalTransactions.find(
      (t) => t.type === "expense" && 
              t.amount === goalCurrentSavings && 
              (t.title.includes("completed") || t.title.includes("abgeschlossen") || t.title.includes("abgeschlossenes"))
    );
    
    // Find income completion transaction (language-independent)
    const incomeTransaction = goalTransactions.find(
      (t) => t.type === "income" && 
              t.amount === goalCurrentSavings && 
              (t.title.includes("completed") || t.title.includes("abgeschlossen") || t.title.includes("abgeschlossenes"))
    );
    
    return !!(expenseTransaction || incomeTransaction);
  }, [goal, transactions]);

  const handleCompletionDialogClose = useCallback(() => {
    // If dialog is closed without making a choice, mark as dismissed and go back to input
    // DO NOT create any transactions - just navigate back
    setHasDismissedCompletion(true);
    setCurrentStep('input');
    navigate(`/savings-goals/${goalId}`);
  }, [navigate, goalId]);

  if (!goal) {
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
      <div className="h-screen flex flex-col bg-white dark:bg-[#1A2124] overflow-hidden">
        {/* Header */}
        <div className="flex-none bg-white dark:bg-[#1A2124] border-b border-gray-200 dark:border-white/10 sticky top-0 z-20 transition-colors h-16 ios-header-safe-area">
          <div className="flex items-center justify-between h-full px-6">
            <button
              onClick={() => navigate(`/savings-goals/${goalId}`)}
              className="flex-none text-black dark:text-white hover:opacity-70 transition-opacity"
            >
              <span className="text-sm font-medium">{t("cancel")}</span>
            </button>
            <h1 className="flex-1 px-4 text-center text-black dark:text-white text-lg font-bold truncate">
              {goal.name}
            </h1>
            <button
              onClick={handleDone}
              disabled={currentStep === 'success' || currentStep === 'loading'}
              className="flex-none text-black dark:text-white font-bold hover:opacity-70 transition-opacity disabled:opacity-50"
            >
              <span className="text-sm font-medium">
                {t("savingsGoals.save")}
              </span>
            </button>
          </div>
        </div>



        {/* Content - Takes remaining space */}
        <div className="flex-1 flex flex-col px-6 py-6 overflow-hidden">
          {currentStep === 'success' ? (
            // Success Screen
            <div className="flex flex-col items-center justify-center flex-1 gap-6">
              {/* Green Circle with Checkmark */}
              <div className="w-32 h-32 rounded-full bg-green-500/20 border-4 border-green-500/50 flex items-center justify-center">
                <Check className="w-16 h-16 text-green-400" />
              </div>

              {/* Success Message */}
              <div className="text-center">
                <h2 className="text-black dark:text-white text-3xl font-bold mb-2">
                  {t("savingsGoals.payment_recorded")}
                </h2>
                <p className="text-gray-500 dark:text-white/60 text-lg">
                  {t("savingsGoals.added_to_savings")}
                </p>
              </div>

              {/* Payment Details */}
              <div className="w-full bg-white dark:bg-white/5 border border-gray-200 dark:border-white/10 rounded-xl p-6 space-y-4 shadow-sm dark:shadow-none">
                {/* Date */}
                <div className="flex items-center justify-between">
                  <span className="text-gray-500 dark:text-white/60 text-base">{t("date")}:</span>
                  <span className="text-black dark:text-white font-medium text-lg">{successDate}</span>
                </div>

                {/* Amount */}
                <div className="flex items-center justify-between border-t border-gray-100 dark:border-white/10 pt-4">
                  <span className="text-gray-500 dark:text-white/60 text-base">{t("amount")}:</span>
                  <span className="text-green-600 dark:text-green-400 font-bold text-2xl">
                    {formatCurrency(successAmount)}
                  </span>
                </div>
              </div>

              {/* Redirect Message */}
              <p className="text-gray-400 dark:text-white/40 text-base text-center">
                {t("redirecting_in_seconds", { seconds: 2 })}
              </p>
            </div>
          ) : (
            // Payment Input Screen
            <div 
              className="flex flex-col items-center gap-4 flex-1"
              onClick={(e) => {
                // Only blur if clicking directly on the container (empty space)
                // Don't blur if clicking on child elements like text, icons, etc.
                if (e.target === e.currentTarget) {
                  inputRef.current?.blur();
                }
              }}
            >
              {/* Date */}
                <p className="text-green-600 dark:text-green-400 text-base font-medium">{formatCurrentDate()}</p>

              {/* Icon */}
              <CategoryAvatar
                categoryKey={category?.name || ""}
                icon={category?.icon}
                size={60}
              />

              {/* Goal Name */}
              <p className="text-black dark:text-white text-2xl font-bold">
                {goal.name}
              </p>

              {/* Target Rate */}
              <p className="text-gray-500 dark:text-white/60 text-lg">
                {t("savingsGoals.target_rate")}
                {formatCurrency(requiredMonthlyRate)}
              </p>

              {/* Payment Input */}
              <div className="w-full py-6">
                <input
                  ref={inputRef}
                  type="text"
                  inputMode="decimal"
                  value={paymentInput}
                  onChange={(e) => handlePaymentChange(e.target.value)}
                  className="w-full text-center bg-transparent text-green-600 dark:text-green-400 text-6xl font-bold border-none outline-none placeholder-green-400/50"
                  placeholder="0.00"
                />
              </div>
            </div>
          )}
        </div>

      </div>

      {/* Completion Dialog */}
      <SavingsGoalCompletionDialog
        open={currentStep === 'completion'}
        onOpenChange={handleCompletionDialogClose}
        onIncome={handleCompletionIncome}
        onExpense={handleCompletionExpense}
      />
    </Layout>
  );
}
