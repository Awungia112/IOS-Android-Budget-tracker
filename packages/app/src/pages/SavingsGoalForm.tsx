import { useState, useEffect, useMemo } from "react";
import Layout from "@/components/Layout";
import { useBudget } from "@/contexts/BudgetContext";
import { formatCurrency } from "@/lib/formatters";
import {
  getCategoryColor,
  translateCategoryLabel,
} from "@/lib/categoryHelpers";
import { calculateSavingsGoalEndDate, calculateSavingsGoalEndDateAsDate } from "@/lib/formatters";
import { CategoryAvatar } from "@/components/CategoryAvatar";
import { DatePickerDialog } from "@/components/DatePickerDialog";
import {
  useSavingsGoalValidation,
  ValidationError,
} from "@/hooks/useSavingsGoalValidation";
import { Input } from "@/components/ui/input";
import { AlertCircle } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useNavigate, useParams } from "react-router-dom";
import { toast } from "@/components/ui/use-toast";
import { useScrollToFocusedInput } from "@/hooks/useScrollToFocusedInput";

export default function SavingsGoalForm() {
  useScrollToFocusedInput();
  const navigate = useNavigate();
  const { goalId } = useParams();
  const { savingsGoals, categories, transactions, addSavingsGoal, updateSavingsGoal } =
    useBudget();
  const { t, i18n } = useTranslation();
  const { validateSavingsGoalForm } = useSavingsGoalValidation();

  // Get only expense categories (same as limits page), excluding hidden ones.
  // When editing, always include the currently-assigned category even if hidden.
  const expenseCategories = categories.filter((category) => {
    if (category.type !== "expense") return false;
    if (!category.hidden) return true;
    return goalId !== undefined && category.id === selectedCategory;
  });

  const [name, setName] = useState("");
  const [targetAmount, setTargetAmount] = useState("");
  const [monthlyAmount, setMonthlyAmount] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("");
  const [deadline, setDeadline] = useState("");
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [userSetMonthlyAmount, setUserSetMonthlyAmount] = useState(false);
  const [isInitialLoad, setIsInitialLoad] = useState(true);
  const [selectedYear, setSelectedYear] = useState(
    new Date().getFullYear() + 1,
  );
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth());
  const [selectedDay, setSelectedDay] = useState(new Date().getDate());
  const [validationErrors, setValidationErrors] = useState<ValidationError[]>(
    [],
  );
  const [originalValues, setOriginalValues] = useState<{
    name: string;
    targetAmount: number;
    deadline: string;
    categoryId: string | undefined;
    monthlyAmount: number | undefined;
  } | null>(null);

  // Calculate current savings for this goal once and reuse everywhere
  const goalCurrentSavings = useMemo(() => {
    if (!goalId) return 0;
    return transactions
      .filter((t) => t.type === "expense" && t.savingsGoalId === goalId)
      .reduce((sum, t) => sum + t.amount, 0);
  }, [goalId, transactions]);

  // Load goal data if editing
  useEffect(() => {
    if (goalId) {
      const goal = savingsGoals.find((g) => g.id === goalId);
      if (goal) {
        setName(goal.name);
        setTargetAmount(goal.targetAmount.toString());
        
        // Set deadline and date picker state from existing goal
        // Use calculated end date instead of original deadline for consistency
        const endDate = calculateSavingsGoalEndDateAsDate(goal, transactions);
        
        // Format the calculated end date as YYYY-MM-DD for the deadline state
        const calculatedDeadlineString = `${endDate.getFullYear()}-${String(endDate.getMonth() + 1).padStart(2, '0')}-${String(endDate.getDate()).padStart(2, '0')}`;
        setDeadline(calculatedDeadlineString);
        
        // Load saved monthly amount or calculate if not set
        if (goal.monthlyAmount) {
          setMonthlyAmount(goal.monthlyAmount.toFixed(2));
          setUserSetMonthlyAmount(true); // Mark as user set since it was manually saved
        } else {
          // Calculate monthly amount based on remaining amount (consistent with other logic)
          const today = new Date();
          today.setHours(0, 0, 0, 0);
          endDate.setHours(0, 0, 0, 0);
          const monthsUntilDeadline = Math.max(
            1,
            Math.ceil(
              (endDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24 * 30.44),
            ),
          );
          
          // Use remaining amount instead of full target amount
          const remainingAmount = Math.max(0, goal.targetAmount - goalCurrentSavings);
          
          // Calculate monthly amount based on remaining amount
          const calculatedMonthlyAmount = remainingAmount > 0 ? remainingAmount / monthsUntilDeadline : 0;
          setMonthlyAmount(calculatedMonthlyAmount.toFixed(2));
          setUserSetMonthlyAmount(false); // Reset flag for auto-calculated amount
        }
        
        // Set date picker state using calculated end date
        setSelectedYear(endDate.getFullYear());
        setSelectedMonth(endDate.getMonth());
        setSelectedDay(endDate.getDate());
        
        // Set selected category if categoryId exists
        if (goal.categoryId) {
          setSelectedCategory(goal.categoryId);
        }
        
        setIsInitialLoad(false); // Initial load complete
        
        // Store original values for change detection
        // Use the calculated deadline that matches what the form actually shows
        setOriginalValues({
          name: goal.name,
          targetAmount: goal.targetAmount,
          deadline: calculatedDeadlineString, // Use calculated deadline, not original
          categoryId: goal.categoryId,
          monthlyAmount: goal.monthlyAmount,
        });
      }
    } else {
      // For new goals, set initial load to false immediately
      setIsInitialLoad(false);
      setUserSetMonthlyAmount(false); // Reset flag for new goals
      // Set default deadline to 1 year from now
      const defaultDeadline = new Date();
      defaultDeadline.setFullYear(defaultDeadline.getFullYear() + 1);
      const defaultDeadlineString = defaultDeadline.toISOString().split("T")[0];
      setDeadline(defaultDeadlineString);
      // Set date picker state to default
      setSelectedYear(defaultDeadline.getFullYear());
      setSelectedMonth(defaultDeadline.getMonth());
      setSelectedDay(defaultDeadline.getDate());
    }
  }, [goalId, savingsGoals]);

  // Update deadline when date picker values change
  useEffect(() => {
    // Use UTC date construction to avoid timezone issues
    const date = new Date(Date.UTC(selectedYear, selectedMonth, selectedDay));
    const newDeadline = date.toISOString().split("T")[0];
    if (newDeadline !== deadline) {
      setDeadline(newDeadline);
      
      // Recalculate monthly amount when date changes
      // Allow recalculation if user hasn't manually set monthly amount OR if monthly amount is empty
      if ((!userSetMonthlyAmount || !monthlyAmount.trim()) && targetAmount) {
        const targetValue = parseFloat(targetAmount);
        if (targetValue > 0) {
          // For new goals, use full target amount. For existing goals, use remaining amount
          const currentSavings = goalCurrentSavings;
          
          // Use remaining amount for existing goals, full target for new goals
          const amountToCalculate = goalId 
            ? Math.max(0, targetValue - currentSavings)
            : targetValue;
          
          // Calculate months until new deadline
          const today = new Date();
          today.setHours(0, 0, 0, 0);
          const deadlineDate = new Date(newDeadline);
          deadlineDate.setHours(0, 0, 0, 0);
          
          const monthsUntilDeadline = Math.max(
            1,
            Math.ceil(
              (deadlineDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24 * 30.44),
            ),
          );
          
          // Calculate monthly amount based on new deadline
          const calculatedMonthlyAmount = amountToCalculate > 0 ? amountToCalculate / monthsUntilDeadline : 0;
          setMonthlyAmount(calculatedMonthlyAmount.toFixed(2));
        }
      }
    }
  }, [selectedYear, selectedMonth, selectedDay, deadline, targetAmount, userSetMonthlyAmount, goalId, goalCurrentSavings, monthlyAmount]);

  // Recalculate deadline when monthly amount changes (only if user manually set monthly amount)
  useEffect(() => {
    if (monthlyAmount && targetAmount && userSetMonthlyAmount) {
      const monthlyValue = parseFloat(monthlyAmount);
      const targetValue = parseFloat(targetAmount);
      
      if (monthlyValue > 0 && targetValue > 0) {
        // For new goals, use full target amount. For existing goals, use remaining amount
        const currentSavings = goalCurrentSavings;
        
        // Use remaining amount for existing goals, full target for new goals
        const amountToCalculate = goalId 
          ? Math.max(0, targetValue - currentSavings)
          : targetValue;
        
        // Calculate months needed based on monthly amount
        const monthsNeeded = Math.ceil(amountToCalculate / monthlyValue);
        
        // Calculate new deadline by adding months to current date
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const newEndDate = new Date(today);
        newEndDate.setMonth(newEndDate.getMonth() + monthsNeeded);
        
        const newDeadlineString = `${newEndDate.getFullYear()}-${String(newEndDate.getMonth() + 1).padStart(2, '0')}-${String(newEndDate.getDate()).padStart(2, '0')}`;
        
        // Only update deadline if it's different from current
        if (newDeadlineString !== deadline) {
          setDeadline(newDeadlineString);
          
          // Update date picker state
          setSelectedYear(newEndDate.getFullYear());
          setSelectedMonth(newEndDate.getMonth());
          setSelectedDay(newEndDate.getDate());
        }
      }
    }
  }, [monthlyAmount, targetAmount, userSetMonthlyAmount, goalId, goalCurrentSavings]);

  // Recalculate monthly amount when target amount changes (but NOT when deadline changes to avoid circular dependency)
  useEffect(() => {
    // Skip during initial load to prevent overwriting saved values
    if (isInitialLoad) return;
    
    // For existing goals, only recalculate if user hasn't set monthly amount
    // For new goals, only recalculate when target amount changes (NOT deadline)
    const shouldRecalculate = goalId 
      ? !userSetMonthlyAmount || monthlyAmount.trim() === ""
      : true;
    
    if (!shouldRecalculate) {
      return;
    }
    
    // Clear monthly amount if target amount is empty or zero
    if (!targetAmount || parseFloat(targetAmount) <= 0) {
      setMonthlyAmount("");
      setUserSetMonthlyAmount(false);
      return;
    }
    
    const targetValue = parseFloat(targetAmount);
    if (targetValue > 0) {
      // For new goals, use full target amount. For existing goals, use remaining amount
      const currentSavings = goalCurrentSavings;
      
      // Use remaining amount for existing goals, full target for new goals
      const amountToCalculate = goalId 
        ? Math.max(0, targetValue - currentSavings)
        : targetValue;
      
      // Default to 12 months - use current deadline if available
      const monthsUntilDeadline = deadline ? 
        Math.max(1, Math.ceil((new Date(deadline).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24 * 30.44))) : 
        12;
      
      // Calculate monthly amount based on amount to calculate
      const calculatedMonthlyAmount = amountToCalculate > 0 ? amountToCalculate / monthsUntilDeadline : 0;
      
      // Only update if monthly amount is empty or significantly different
      if (!monthlyAmount || Math.abs(parseFloat(monthlyAmount) - calculatedMonthlyAmount) > 0.01) {
        setMonthlyAmount(calculatedMonthlyAmount.toFixed(2));
        // Don't set userSetMonthlyAmount for auto-calculated values
      }
    }
  }, [targetAmount, goalId, goalCurrentSavings]); // Removed deadline from dependencies to break circular dependency

  const getFieldError = (
    field: "name" | "targetAmount" | "deadline" | "categoryId" | "monthlyAmount",
  ): string | null => {
    const error = validationErrors.find((e) => e.field === field);
    return error?.message || null;
  };

  const handleSubmit = async () => {
    // Get the selected category name
    const selectedCategoryObj = expenseCategories.find(
      (cat) => cat.id === selectedCategory,
    );
    const categoryName = selectedCategoryObj ? selectedCategoryObj.name : "";

    const errors = validateSavingsGoalForm(
      name,
      targetAmount,
      deadline,
      selectedCategory,
      categoryName,
      monthlyAmount,
      savingsGoals,
      transactions,
      goalId || undefined,
    );

    if (errors.length > 0) {
      setValidationErrors(errors);
      
      // Show toast for monthly amount validation error
      const monthlyAmountError = errors.find(e => e.field === "monthlyAmount");
      if (monthlyAmountError) {
        toast({
          title: t("error"),
          description: monthlyAmountError.message,
          variant: "destructive",
        });
      }
      
      return;
    }

    setValidationErrors([]);

    // Prepare goal data with monthly amount if provided
    const goalData = {
      name,
      targetAmount: Number(targetAmount),
      deadline,
      categoryId: selectedCategory || undefined,
      monthlyAmount: monthlyAmount ? Number(monthlyAmount) : undefined,
    };

    if (goalId) {
      const goalToUpdate = savingsGoals.find((g) => g.id === goalId);
      if (goalToUpdate) {
        // Ensure originalValues is set before proceeding
        if (!originalValues) {
          navigate("/savings-goals");
          return;
        }
        
        // Get the current monthly amount value that would be saved
        // This should match exactly the logic used when saving the goal
        const currentMonthlyAmountValue = userSetMonthlyAmount && monthlyAmount ? Number(monthlyAmount) : undefined;
        
        // Check if anything actually changed - compare against original values
        const nameChanged = originalValues.name !== name;
        const targetAmountChanged = Math.abs(originalValues.targetAmount - Number(targetAmount)) > 0.01;
        const deadlineChanged = originalValues.deadline !== deadline;
        const categoryIdChanged = originalValues.categoryId !== (selectedCategory || undefined);
        const monthlyAmountChanged = originalValues.monthlyAmount !== currentMonthlyAmountValue;
        
        const hasChanges = nameChanged || targetAmountChanged || deadlineChanged || categoryIdChanged || monthlyAmountChanged;

        if (hasChanges) {
          await updateSavingsGoal({
            ...goalToUpdate,
            ...goalData,
          }, true);
        } else {
          // Still navigate back but don't call update
          navigate("/savings-goals");
          return; // Prevent the final navigate call
        }
      }
    } else {
      await addSavingsGoal(goalData);
    }

    navigate("/savings-goals");
  };

  const formatDeadline = () => {
    if (!deadline) return "";
    const date = new Date(deadline);
    // Use UTC methods to avoid timezone issues
    return `${t("savingsGoals.until")} ${date.getUTCDate().toString().padStart(2, "0")}.${(date.getUTCMonth() + 1).toString().padStart(2, "0")}.${date.getUTCFullYear()}`;
  };

  const calculateMonthlyAmount = () => {
    if (!monthlyAmount) return t("savingsGoals.defaultMonthly");
    return `${t("savingsGoals.per")} ${formatCurrency(Number(monthlyAmount))}`;
  };

  return (
    <Layout>
      <div className="flex flex-col h-screen bg-white dark:bg-[#1A2124]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 bg-white dark:bg-[#1A2124] border-b border-gray-200 dark:border-white/10 text-black dark:text-white sticky top-0 z-20">
          <button
            onClick={() => navigate("/savings-goals")}
            className="text-black dark:text-white text-sm font-medium"
            data-testid="savings-goal-form-cancel"
          >
            {t("savingsGoals.cancel")}
          </button>
          <h1 className="text-black dark:text-white text-lg font-bold flex-1 text-center mx-4" data-testid="savings-goal-form-title">
            {goalId ? t("savingsGoals.editGoal") : t("savingsGoals.newGoal")}
          </h1>
          <button
            onClick={handleSubmit}
            className="text-black dark:text-white text-sm font-medium"
            data-testid="savings-goal-form-save"
          >
            {goalId ? t("savingsGoals.update") : t("save")}
          </button>
        </div>

        {/* Main Content */}
        <div className="flex-1 overflow-y-auto pb-20">
          <div className="px-6 py-8 space-y-8 max-w-2xl mx-auto">
            {/* Date and Monthly Amount */}
            <div className="flex items-center justify-between gap-3 px-2">
              <div className="flex-1 min-w-0">
                <button
                  onClick={() => {
                    setShowDatePicker(true);
                    // Reset userSetMonthlyAmount when opening date picker
                    // This allows monthly amount to be recalculated when date changes
                    setUserSetMonthlyAmount(false);
                  }}
                  className="text-black dark:text-white text-sm font-medium hover:opacity-80 transition-colors flex items-center gap-2 w-full min-w-0"
                  data-testid="savings-goal-deadline-button"
                  aria-label={t("select_date")}
                >
                  <svg
                    width="16"
                    height="16"
                    viewBox="0 0 16 16"
                    fill="none"
                    className="hover:opacity-80 transition-opacity flex-shrink-0"
                    aria-hidden="true"
                  >
                    <path
                      d="M16 3.55556V2.88889C16 1.2963 14.7037 0 13.1111 0H2.88889C1.2963 0 0 1.2963 0 2.88889V3.55556H16Z"
                      fill="currentColor"
                    />
                    <path
                      d="M0 4.88892V13.1111C0 14.7037 1.2963 16 2.88889 16H13.1111C14.7037 16 16 14.7037 16 13.1111V4.88892H0ZM4.22222 13.3334C3.6088 13.3334 3.11111 12.8357 3.11111 12.2222C3.11111 11.6088 3.6088 11.1111 4.22222 11.1111C4.83565 11.1111 5.33333 11.6088 5.33333 12.2222C5.33333 12.8357 4.83565 13.3334 4.22222 13.3334ZM4.22222 9.33336C3.6088 9.33336 3.11111 8.83568 3.11111 8.22225C3.11111 7.60882 3.6088 7.11114 4.22222 7.11114C4.83565 7.11114 5.33333 7.60882 5.33333 8.22225C5.33333 8.83568 4.83565 9.33336 4.22222 9.33336ZM8 13.3334C7.38657 13.3334 6.88889 12.8357 6.88889 12.2222C6.88889 11.6088 7.38657 11.1111 8 11.1111C8.61343 11.1111 9.11111 11.6088 9.11111 12.2222C9.11111 12.8357 8.61343 13.3334 8 9.33336ZM8 9.33336C7.38657 9.33336 6.88889 8.83568 6.88889 8.22225C6.88889 7.60882 7.38657 7.11114 8 7.11114C8.61343 7.11114 9.11111 7.60882 9.11111 8.22225C9.11111 8.83568 8.61343 9.33336 8 9.33336ZM11.7778 9.33336C11.1644 9.33336 10.6667 8.83568 10.6667 8.22225C10.6667 7.60882 11.1644 7.11114 11.7778 7.11114C12.3912 7.11114 12.8889 7.60882 12.8889 8.22225C12.8889 8.83568 12.3912 9.33336 11.7778 9.33336Z"
                      fill="currentColor"
                    />
                  </svg>
                  <span className="flex-1 min-w-0 truncate text-left">{formatDeadline()}</span>
                </button>
                {getFieldError("deadline") && (
                  <div className="flex items-center gap-2 mt-2 text-destructive text-xs">
                    <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
                    <span className="leading-tight">{getFieldError("deadline")}</span>
                  </div>
                )}
              </div>
              <div className="flex items-center gap-1 flex-shrink-0">
                <input
                  type="number"
                  step="0.01"
                  placeholder={!goalId ? t("savingsGoals.monthly_amount_placeholder") : "0.00"}
                  value={monthlyAmount}
                  onChange={(e) => {
                    const value = e.target.value;
                    setMonthlyAmount(value);
                    setUserSetMonthlyAmount(true); // Mark that user manually set this
                    // Clear monthly amount validation error when user is typing
                    setValidationErrors((prev) =>
                      prev.filter((e) => e.field !== "monthlyAmount"),
                    );
                  }}
                  className={`text-black dark:text-white placeholder:text-gray-400 dark:placeholder:text-white/60 text-xs sm:text-sm font-medium hover:opacity-80 transition-colors bg-transparent border-none outline-none text-right w-36 sm:w-40 [-webkit-text-size-adjust:100%] [-webkit-appearance:none] [text-size-adjust:100%] ${
                    getFieldError("monthlyAmount")
                      ? "text-destructive placeholder:text-destructive"
                      : ""
                  }`}
                />
                <span className={`text-sm font-medium ${
                  getFieldError("monthlyAmount")
                    ? "text-destructive"
                    : "text-black dark:text-white"
                }`}>€</span>
              </div>
            </div>

            {/* Date Picker Dialog */}
            {(DatePickerDialog as any)({
              open: showDatePicker,
              onOpenChange: setShowDatePicker,
              selectedYear: selectedYear,
              selectedMonth: selectedMonth,
              selectedDay: selectedDay,
              onYearChange: setSelectedYear,
              onMonthChange: setSelectedMonth,
              onDayChange: setSelectedDay,
              disablePastDates: true,
              onSelect: () => {
                setShowDatePicker(false);
                // Reset userSetMonthlyAmount when user manually changes deadline
                // This allows monthly amount to be recalculated based on new date
                setUserSetMonthlyAmount(false);
                setValidationErrors((prev) =>
                  prev.filter((e) => e.field !== "deadline"),
                );
              },
            })}

            {/* Large Amount Display */}
            <div className="text-center mb-8 overflow-hidden">
              <div className="font-bold text-black dark:text-white mb-2 text-5xl sm:text-6xl">
                {formatCurrency(Number(targetAmount))}
              </div>
            </div>

            {/* Amount Input */}
            <div>
              <Input
                type="number"
                step="0.01"
                placeholder={t("enter_amount")}
                value={targetAmount}
                onChange={(e) => {
                  setTargetAmount(e.target.value);
                  setValidationErrors((prev) =>
                    prev.filter((e) => e.field !== "targetAmount"),
                  );
                }}
                className={`w-full bg-white dark:bg-white/10 border text-black dark:text-white placeholder:text-gray-400 dark:placeholder:text-white/50 rounded-lg px-4 py-3 text-center text-lg font-semibold shadow-sm focus:bg-gray-50 dark:focus:bg-white/15 focus:outline-none transition-colors border-black/10 dark:border-white/20`}
                data-testid="savings-goal-form-amount"
              />
              {getFieldError("targetAmount") && (
                <div className="flex items-center gap-2 mt-2 text-destructive text-sm">
                  <AlertCircle className="w-4 h-4" />
                  {getFieldError("targetAmount")}
                </div>
              )}
            </div>

            {/* Goal Name Input */}
            <div>
              <Input
                type="text"
                placeholder={t("savingsGoals.namePlaceholder")}
                value={name}
                onChange={(e) => {
                  setName(e.target.value);
                  setValidationErrors((prev) =>
                    prev.filter((e) => e.field !== "name"),
                  );
                }}
                className={`w-full bg-white dark:bg-white/10 border text-black dark:text-white placeholder:text-gray-400 dark:placeholder:text-white/50 rounded-lg px-4 py-3 text-center text-lg font-semibold shadow-sm focus:bg-gray-50 dark:focus:bg-white/15 focus:outline-none transition-colors border-black/10 dark:border-white/20`}
                data-testid="savings-goal-form-name"
              />
              {getFieldError("name") && (
                <div className="flex items-center gap-2 mt-2 text-destructive text-sm">
                  <AlertCircle className="w-4 h-4" />
                  {getFieldError("name")}
                </div>
              )}
            </div>

            {/* Category Selection */}
            <div>
              <div className="text-gray-500 dark:text-white/60 text-lg font-medium text-center">
                {t("savingsGoals.category")}
              </div>
              {getFieldError("categoryId") && (
                <div className="flex items-center gap-2 mt-2 text-destructive text-sm bg-destructive/10 p-3 rounded-lg border border-destructive/30">
                  <AlertCircle className="w-4 h-4 flex-shrink-0" />
                  <span>{getFieldError("categoryId")}</span>
                </div>
              )}
              <div className="grid grid-cols-3 gap-4 mt-4">
                {expenseCategories.map((category) => {
                  const isSelected = selectedCategory === category.id;
                  const categoryColor = getCategoryColor(category.name);
                  const categoryError = getFieldError("categoryId");
                  return (
                    <button
                      key={category.id}
                      onClick={() => {
                        setSelectedCategory(category.id);
                        setValidationErrors((prev) =>
                          prev.filter(
                            (e) => e.field !== "categoryId",
                          ),
                        );
                      }}
                      data-testid={`savings-goal-category-${category.id}`}
                      className={`flex flex-col items-center justify-center py-6 rounded-lg border-2 border-dashed transition-all shadow-sm dark:shadow-none ${
                        isSelected
                        ? "border-[#3A464F] dark:border-white bg-[#3A464F] dark:bg-white"
                          : categoryError
                            ? "border-destructive bg-destructive/5"
                            : "border-black/10 dark:border-white/20 bg-white dark:bg-white/5 hover:bg-gray-100 dark:hover:bg-white/10"
                      }`}
                    >
                      <CategoryAvatar
                        categoryKey={category.name}
                        icon={category.icon}
                        size={42}
                        className="mb-3"
                        style={{
                          backgroundColor: isSelected
                            ? categoryColor
                            : categoryColor + "40",
                        }}
                      />
                      <span className={`text-xs text-center leading-tight transition-all ${isSelected
                        ? "text-white dark:text-budget-dark font-bold opacity-100 scale-105"
                        : "text-black dark:text-white text-xs font-medium text-center leading-tight"
                        }`}>
                        {translateCategoryLabel(t, category.name, category.isDefault ?? false)}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </div>
    </Layout>
  );
}
