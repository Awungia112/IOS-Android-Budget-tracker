import { Button } from "@/components/ui/button";
import { formatCurrency } from "@/lib/formatters";
import { CategoryAvatar } from "@/components/CategoryAvatar";
import { useTranslation } from "react-i18next";
import { useBudget } from "@/contexts/BudgetContext";
import { useNavigate } from "react-router-dom";
import { useMemo } from "react";
import { filterExecutedTransactions } from "@budget/core";
import type { SavingsGoal } from "@budget/core";

interface SavingsGoalCardProps {
  goal: SavingsGoal;
  currentSavings: number;
  progress: number;
  onEdit: (goalId: string) => void;
  onDelete?: (goalId: string) => void;
}

/**
 * SavingsGoalCard component displays a single savings goal with progress information
 * Matches the Figma design with card-based layout and colored icon backgrounds
 */
export const SavingsGoalCard = ({
  goal,
  currentSavings,
  progress,
  onEdit,
  onDelete,
}: SavingsGoalCardProps) => {
  const { t, i18n } = useTranslation();
  const { categories, transactions } = useBudget();
  const navigate = useNavigate();

  // Find the category using categoryId - same logic as limits page
  const category = categories.find((c) => c.id === goal.categoryId);

  const handleCardClick = () => {
    navigate(`/savings-goals/${goal.id}`);
  };

  const handleEditClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    onEdit(goal.id);
  };

  const parseDeadlineDate = (deadline: string) => {
    const locale = i18n.language === "en" ? "en-US" : "de-DE";
    const [year, month] = deadline.split('-').map(Number);
    const date = new Date(year, month - 1, 1);
    const formattedDate = date.toLocaleDateString(locale, {
      year: "numeric",
      month: "long",
    });
    return t("savingsGoals.until") + " " + formattedDate;
  };

  // Calculate monthly savings amount needed - use saved amount if available, otherwise calculate
  const calculateMonthlySavings = () => {
    // Use saved monthly amount if user manually set it
    if (goal.monthlyAmount) {
      // If monthly amount exceeds target, reduce it to target amount
      if (goal.monthlyAmount > goal.targetAmount) {
        return goal.targetAmount;
      }
      return goal.monthlyAmount;
    }
    
    // Calculate current savings for this goal (same logic as details page)
    const currentSavings = filterExecutedTransactions(transactions)
      .filter((t) => t.type === "expense" && t.savingsGoalId === goal.id)
      .reduce((sum, t) => sum + t.amount, 0);
    
    // Use remaining amount instead of full target amount
    const remainingAmount = Math.max(0, goal.targetAmount - currentSavings);
    
    // Calculate months until stored deadline
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const [y, m, d] = goal.deadline.split('-').map(Number);
    const endDate = new Date(y, m - 1, d);
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
  };

  // Check if goal is completed
  const isCompleted = useMemo(() => {
    // Goal is completed if current savings reach or exceed target amount
    return currentSavings >= goal.targetAmount;
  }, [currentSavings, goal.targetAmount]);

  return (
    <div
      onClick={handleCardClick}
      className="bg-white dark:bg-white/5 rounded-[8px] shadow-sm dark:shadow-none overflow-hidden flex flex-col w-full cursor-pointer hover:shadow-md dark:hover:bg-white/10 transition-all h-[200px] border border-black/10 dark:border-white/10 relative"
      data-testid={`savings-goal-card-${goal.id}`}
    >
      {/* Vertical Progress Bar - covers entire card */}
      <div className="absolute bottom-0 left-0 right-0 h-full pointer-events-none z-0">
        <div
          className="bg-green-600/20 w-full transition-all duration-300"
          style={{
            height: `${Math.min(progress, 100)}%`,
            bottom: 0,
            position: 'absolute'
          }}
          data-testid={`savings-goal-progress-${goal.id}`}
        />
      </div>

      {/* Header with icon and edit button */}
      <div className="p-2 pb-1 flex items-start justify-between flex-shrink-0 relative z-0">
        <div className="flex items-start gap-2 flex-1 min-w-0">
          {/* Icon Background Circle */}
          {category ? (
            <CategoryAvatar
              categoryKey={category.name}
              icon={category.icon}
              size={32}
              className="opacity-85"
            />
          ) : (
            <div
              className="flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-xs opacity-85"
              style={{
                backgroundColor: goal.iconColor || "#7c3aed",
              }}
            >
              {goal.icon || "🎯"}
            </div>
          )}
          {/* Goal Name and Deadline */}
          <div className="flex-1 min-w-0">
            <h3 className="font-semibold text-xs text-black dark:text-white leading-tight truncate" data-testid={`savings-goal-name-${goal.id}`}>
              {goal.name}
            </h3>
            <p className="text-[#848484] dark:text-gray-400 text-[9px] font-normal mt-0.5 truncate w-[90px]">
              {parseDeadlineDate(goal.deadline)}
            </p>
          </div>
          
          {/* Completion Badge */}
          {isCompleted && (
            <div className="flex-shrink-0 ml-2">
              <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800 border border-green-200">
                {t("savingsGoals.completed")}
              </span>
            </div>
          )}
        </div>
        <div className="flex items-center gap-1 flex-shrink-0">
          {/* Edit Icon */}
          <button
            onClick={handleEditClick}
            className="p-1 hover:opacity-70 transition-opacity text-black dark:text-white"
            aria-label={t("edit")}
            data-testid={`savings-goal-edit-${goal.id}`}
          >
            <svg
              width="15"
              height="15"
              viewBox="0 0 15 15"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path
                d="M2.03125 12.9688L2.95898 9.72172C2.98747 9.61918 3.04281 9.52641 3.11768 9.45154L10.035 2.53503C10.7056 1.86365 11.7944 1.86365 12.465 2.53505C13.1364 3.20561 13.1364 4.29448 12.465 4.96505L5.5485 11.8824C5.47363 11.9572 5.38005 12.0118 5.27832 12.0411L2.03125 12.9688Z"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeMiterlimit="10"
                strokeLinejoin="round"
              />
            </svg>
          </button>
          
          {/* Delete Icon */}
          {onDelete && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onDelete(goal.id);
              }}
              className="p-1 hover:opacity-70 transition-opacity"
              aria-label={t("savingsGoals.delete")}
              data-testid={`savings-goal-delete-${goal.id}`}
            >
              <svg
                width="14"
                height="14"
                viewBox="0 0 14 14"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
              >
                <path
                  d="M1.75 3.5H12.25M5.25 6.125V10.375M8.75 6.125V10.375M2.625 3.5L3.5 11.375C3.5 11.8391 3.68437 12.2842 4.01256 12.6124C4.34075 12.9406 4.78587 13.125 5.25 13.125H8.75C9.21413 13.125 9.65925 12.9406 9.98744 12.6124C10.3156 12.2842 10.5 11.8391 10.5 11.375L11.375 3.5M4.8125 3.5V1.75C4.8125 1.51794 4.90469 1.29538 5.06878 1.13128C5.23288 0.967187 5.45544 0.875 5.6875 0.875H8.3125C8.54456 0.875 8.76712 0.967187 8.93122 1.13128C9.09531 1.29538 9.1875 1.51794 9.1875 1.75V3.5"
                  stroke="#E33B80"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </button>
          )}
        </div>
      </div>

      {/* Content area that fills remaining space */}
      <div className="px-2 py-1 flex flex-col gap-1 flex-grow relative z-0">
        {/* Saved Amount Section */}
        <div className="bg-white dark:bg-white/5 rounded-[6px] border border-black/5 dark:border-white/10 px-2 py-1 shadow-sm">
          <p className="text-xs text-gray-700 dark:text-gray-300 font-normal leading-tight">
            {t("savingsGoals.alreadySaved")}
          </p>
          <p className="text-xs font-bold text-green-600 dark:text-budget-green mt-0.5">
            {formatCurrency(currentSavings)}
          </p>
        </div>

        {/* Target Amount Section */}
        <div className="bg-white dark:bg-white/5 rounded-[6px] border border-black/5 dark:border-white/10 px-2 py-1 shadow-sm">
          <p className="text-xs text-gray-700 dark:text-gray-300 font-normal leading-tight">
            {t("savingsGoals.savingsGoal")}
          </p>
          <p className="text-xs font-bold text-black dark:text-white mt-0.5">
            {formatCurrency(goal.targetAmount)}
          </p>
        </div>

        {/* Monthly Savings Amount - positioned at left bottom */}
        <div className="flex justify-start items-start px-2 pt-1">
          <p className="text-[10px] sm:text-xs text-gray-600 dark:text-gray-400 font-medium">
            {t("savingsGoals.monthlyAmount", { amount: calculateMonthlySavings().toFixed(2) })}
          </p>
        </div>
      </div>
    </div>
  );
};
