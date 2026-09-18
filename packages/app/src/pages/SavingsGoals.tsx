import { useState, useMemo, useCallback } from "react";
import Layout from "@/components/Layout";
import { SavingsGoalCard } from "@/components/SavingsGoalCard";
import { AddGoalCard } from "@/components/AddGoalCard";
import { PageHeader } from "@/components/PageHeader";
import { useBudget } from "@/contexts/BudgetContext";
import {
  formatCurrency,
  calculateProgress,
} from "@/lib/formatters";
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
import { useNavigate } from "react-router-dom";

const SavingsGoals = () => {
  const navigate = useNavigate();
  const { savingsGoals, transactions, deleteSavingsGoal } = useBudget();
  const [deleteGoalId, setDeleteGoalId] = useState<string | null>(null);

  const { t } = useTranslation();

  // Calculate savings per goal efficiently - process transactions once and store in Map
  const savingsByGoal = useMemo(() => {
    const map = new Map<string, number>();

    for (const t of transactions) {
      if (t.type === "expense" && t.savingsGoalId) {
        map.set(
          t.savingsGoalId,
          (map.get(t.savingsGoalId) || 0) + t.amount
        );
      }
    }

    return map;
  }, [transactions]);

  // Show all goals, completed ones will get badges
  const activeGoals = savingsGoals;

  const handleEditGoal = (goalId: string) => {
    navigate(`/savings-goals/edit/${goalId}`);
  };

  const handleDeleteConfirm = () => {
    if (deleteGoalId) {
      deleteSavingsGoal(deleteGoalId);
      setDeleteGoalId(null);
    }
  };

  return (
    <Layout>
      <div className="p-4 sm:p-6 pb-24">
        {/* Page Header */}
        <div className="mb-8 flex items-center justify-between">
          <PageHeader>
            {t("savingsGoals.runningGoals")}
          </PageHeader>
        </div>

        {/* Savings Goals Grid */}
        {activeGoals.length === 0 ? (
          <div className="grid grid-cols-2 gap-3 auto-rows-max" data-testid="savings-goals-empty">
            <AddGoalCard onClick={() => navigate("/savings-goals/add")} />
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3 mb-6 auto-rows-max">
            {activeGoals.map((goal) => {
              const currentSavings = savingsByGoal.get(goal.id) || 0;
              const progress = calculateProgress(
                currentSavings,
                goal.targetAmount,
              );

              return (
                <SavingsGoalCard
                  key={goal.id}
                  goal={goal}
                  currentSavings={currentSavings}
                  progress={progress}
                  onEdit={handleEditGoal}
                  onDelete={(id) => setDeleteGoalId(id)}
                />
              );
            })}
            <AddGoalCard onClick={() => navigate("/savings-goals/add")} />
          </div>
        )}

        <AlertDialog
          open={!!deleteGoalId}
          onOpenChange={() => setDeleteGoalId(null)}
        >
          <AlertDialogContent className="rounded-[12px] mx-4 max-w-[calc(100%-2rem)] bg-white dark:bg-[#1A2124] border-gray-200 dark:border-white/10 shadow-lg">
            <AlertDialogHeader>
              <AlertDialogTitle className="text-lg font-semibold text-black dark:text-white">
                {t("savingsGoals.deleteConfirmTitle")}
              </AlertDialogTitle>
              <AlertDialogDescription className="text-gray-500 dark:text-gray-400">
                {t("savingsGoals.deleteConfirmDescription")}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter className="flex-row gap-3 sm:gap-3">
              <AlertDialogCancel className="flex-1 rounded-[8px] mt-0 bg-white dark:bg-white/10 text-black dark:text-white border border-black/10 dark:border-white/10 hover:bg-gray-50 dark:hover:bg-white/20 shadow-sm">
                {t("savingsGoals.deleteConfirmCancel")}
              </AlertDialogCancel>
              <AlertDialogAction
                onClick={handleDeleteConfirm}
                className="flex-1 rounded-[8px] bg-budget-red hover:bg-budget-red/90 text-white"
                data-testid="savings-goal-delete-confirm"
              >
                {t("savingsGoals.deleteConfirmDelete")}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </Layout>
  );
};

export default SavingsGoals;
