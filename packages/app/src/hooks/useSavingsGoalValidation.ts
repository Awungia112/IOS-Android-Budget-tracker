/**
 * Custom hook for savings goal form validation
 * Returns validation errors for savings goal form submission
 */

import { useTranslation } from "react-i18next";
import { SavingsGoal } from "@budget/core";
import { Transaction } from "@budget/core";
import { filterExecutedTransactions } from "@budget/core";

export interface ValidationError {
    field: "name" | "targetAmount" | "deadline" | "categoryId" | "monthlyAmount";
    message: string;
}

export const useSavingsGoalValidation = () => {
    const { t } = useTranslation();

    /**
     * Check if a savings goal is completed
     * @param goal - The savings goal to check
     * @param transactions - All transactions to calculate current savings
     * @returns boolean indicating if the goal is completed
     */
    const isGoalCompleted = (goal: SavingsGoal, transactions: Transaction[]): boolean => {
        const currentSavings = filterExecutedTransactions(transactions)
            .filter((t) => t.type === "income" && t.savingsGoalId === goal.id)
            .reduce((sum, t) => sum + t.amount, 0);
        return currentSavings >= goal.targetAmount;
    };

    /**
     * Filter out completed savings goals
     * @param goals - All savings goals
     * @param transactions - All transactions to determine completion status
     * @returns Array of active (non-completed) savings goals
     */
    const getActiveGoals = (goals: SavingsGoal[], transactions: Transaction[]): SavingsGoal[] => {
        return goals.filter(goal => !isGoalCompleted(goal, transactions));
    };

    /**
     * Validate savings goal form inputs
     * @param name - Goal name
     * @param targetAmount - Target amount as string
     * @param deadline - Deadline date as string
     * @param categoryId - Selected category ID
     * @param categoryName - Selected category display name
     * @param monthlyAmount - Monthly amount as string
     * @param existingGoals - List of existing savings goals
     * @param transactions - All transactions to determine completion status
     * @param excludeGoalId - ID of goal being edited (to exclude from duplicate check)
     * @returns Array of validation errors (empty if valid)
     */
    const validateSavingsGoalForm = (
        name: string,
        targetAmount: string,
        deadline: string,
        categoryId: string,
        categoryName: string,
        monthlyAmount: string,
        existingGoals: SavingsGoal[] = [],
        transactions: Transaction[] = [],
        excludeGoalId?: string
    ): ValidationError[] => {
        const errors: ValidationError[] = [];

        // Check if category is selected
        if (!categoryId || categoryId.trim() === "") {
            errors.push({
                field: "categoryId",
                message: t("savingsGoals.empty_field"),
            });
        }

        // Check if name is provided
        if (!name || name.trim() === "") {
            errors.push({
                field: "name",
                message: t("savings_goal_empty_name"),
            });
        } else {
            // Check for duplicate savings goal names (only among active goals)
            const activeGoals = getActiveGoals(existingGoals, transactions);

            const duplicateNameExists = activeGoals.some(
                (goal) =>
                    goal.name.trim().toLowerCase() === name.trim().toLowerCase() &&
                    goal.id !== excludeGoalId
            );

            if (duplicateNameExists) {
                errors.push({
                    field: "name",
                    message: t("savingsGoals.already_exists"),
                });
            }
        }

        // Check if target amount is provided
        if (!targetAmount || targetAmount.trim() === "") {
            errors.push({
                field: "targetAmount",
                message: t("savingsGoals.empty_field"),
            });
            return errors; // Skip further validation if empty
        }

        // Check if target amount is a valid number
        const numAmount = Number(targetAmount);
        if (isNaN(numAmount)) {
            errors.push({
                field: "targetAmount",
                message: t("savingsGoals.invalid_amount"),
            });
            return errors;
        }

        // Check if target amount is greater than 0
        if (numAmount <= 0) {
            errors.push({
                field: "targetAmount",
                message: t("savingsGoals.invalid_amount"),
            });
            return errors;
        }

        // Check if deadline is provided
        if (!deadline || deadline.trim() === "") {
            errors.push({
                field: "deadline",
                message: t("savings_goal_empty_deadline"),
            });
            return errors;
        }

        // Check if deadline is not in the past
        const deadlineDate = new Date(deadline);
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        deadlineDate.setHours(0, 0, 0, 0);

        if (deadlineDate < today) {
            errors.push({
                field: "deadline",
                message: t("savingsGoals.deadline_in_past"),
            });
        }

        // Validate monthly amount if provided
        if (monthlyAmount && monthlyAmount.trim() !== "") {
            const monthlyNum = Number(monthlyAmount);
            const targetNum = Number(targetAmount);
            
            if (isNaN(monthlyNum) || monthlyNum <= 0) {
                errors.push({
                    field: "monthlyAmount",
                    message: t("savingsGoals.invalid_amount"),
                });
            } else if (targetNum > 0 && monthlyNum > targetNum) {
                errors.push({
                    field: "monthlyAmount",
                    message: t("savingsGoals.monthly_amount_exceeds_target"),
                });
            } else {
                // Check if monthly amount exceeds remaining amount needed
                // Find the goal being edited to get current savings
                const goalBeingEdited = existingGoals.find(g => g.id === excludeGoalId);
                if (goalBeingEdited) {
                    const currentSavings = filterExecutedTransactions(transactions)
                        .filter((t) => t.type === "expense" && t.savingsGoalId === goalBeingEdited.id)
                        .reduce((sum, t) => sum + t.amount, 0);
                    
                    const remainingAmount = targetNum - currentSavings;
                    
                    if (remainingAmount > 0 && monthlyNum > remainingAmount) {
                        errors.push({
                            field: "monthlyAmount",
                            message: t("savingsGoals.monthly_amount_exceeds_remaining"),
                        });
                    }
                }
            }
        }

        return errors;
    };

    return {
        validateSavingsGoalForm,
    };
};
