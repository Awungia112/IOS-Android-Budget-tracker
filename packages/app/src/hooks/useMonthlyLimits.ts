/**
 * Custom hook for limit business logic
 * Extracts spending calculations and limit logic from component
 */

import { useMemo, useCallback } from "react";
import { Transaction, Limit } from "@budget/core";

interface LimitWithSpending {
  limit: Limit;
  spending: number;
  progress: number;
  isExceeded: boolean;
  categoryId: string;
}

interface UseMonthlyLimitsOptions {
  year?: number;
  month?: number; // 0-indexed (0 = January, 11 = December)
}

const formatDate = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

export const useMonthlyLimits = (
  limits: Limit[],
  transactions: Transaction[],
  options?: UseMonthlyLimitsOptions
) => {
  // Use provided year/month or default to current
  const currentDate = new Date();
  const selectedYear = options?.year ?? currentDate.getFullYear();
  const selectedMonth = options?.month ?? currentDate.getMonth();

  // Calculate the selected month's date range
  // Use local timezone to avoid UTC conversion issues
  const firstDayOfMonth = formatDate(new Date(selectedYear, selectedMonth, 1));
  const lastDayOfMonth = formatDate(new Date(selectedYear, selectedMonth + 1, 0));

  /**
   * Get spending for a specific category in the selected month
   */
  const getSpendingForCategory = useCallback(
    (categoryId: string): number => {
      const filtered = transactions.filter(
        (transaction) =>
          transaction.type === "expense" &&
          transaction.category === categoryId &&
          transaction.date.substring(0, 10) >= firstDayOfMonth &&
          transaction.date.substring(0, 10) <= lastDayOfMonth
      );

      return filtered.reduce((sum, transaction) => sum + transaction.amount, 0);
    },
    [transactions, firstDayOfMonth, lastDayOfMonth]
  );

  /**
   * Calculate progress percentage (capped at 100 for display)
   */
  const calculateProgress = (spending: number, limit: number): number => {
    if (limit <= 0) return 0;
    return Math.min((spending / limit) * 100, 100);
  };

  /**
   * Get limits with calculated spending data
   */
  const limitsWithSpending = useMemo(() => {
    return limits.map((limit) => {
      const spending = getSpendingForCategory(limit.categoryId);
      const progress = calculateProgress(spending, limit.amount);
      const isExceeded = spending > limit.amount;

      return {
        limit,
        spending,
        progress,
        isExceeded,
        categoryId: limit.categoryId,
      };
    });
  }, [limits, getSpendingForCategory]);

  return {
    limitsWithSpending,
    currentMonth: { firstDay: firstDayOfMonth, lastDay: lastDayOfMonth },
    selectedYear,
    selectedMonth,
    getSpendingForCategory,
    calculateProgress,
  };
};
