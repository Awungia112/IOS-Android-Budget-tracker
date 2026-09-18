/**
 * Custom hook for limit form validation
 * Returns validation errors for limit form submission
 */

import { useTranslation } from "react-i18next";
import { Limit } from "@budget/core";

export interface ValidationError {
  field: "categoryId" | "amount";
  message: string;
}

export const useLimitValidation = () => {
  const { t } = useTranslation();

  /**
   * Validate limit form inputs
   * @param categoryId - Selected category ID
   * @param amount - Entered amount as string
   * @param existingLimits - List of existing limits
   * @param excludeLimitId - ID of limit being edited (to exclude from duplicate check)
   * @returns Array of validation errors (empty if valid)
   */
  const validateLimitForm = (
    categoryId: string,
    amount: string,
    existingLimits: Limit[] = [],
    excludeLimitId?: string
  ): ValidationError[] => {
    const errors: ValidationError[] = [];

    // Check if category is selected
    if (!categoryId || categoryId.trim() === "") {
      errors.push({
        field: "categoryId",
        message: t("limit_empty_field"),
      });
    }

    // Check if amount is provided
    if (!amount || amount.trim() === "") {
      errors.push({
        field: "amount",
        message: t("limit_empty_field"),
      });
      return errors; // Skip further amount validation if empty
    }

    // Check if amount is a valid number
    const numAmount = Number(amount);
    if (isNaN(numAmount)) {
      errors.push({
        field: "amount",
        message: t("limit_invalid_amount"),
      });
      return errors;
    }

    // Check if amount is greater than 0
    if (numAmount <= 0) {
      errors.push({
        field: "amount",
        message: t("limit_invalid_amount"),
      });
      return errors;
    }

    // Check for duplicate limits in same month (same category)
    if (categoryId) {
      const categoryLimitExists = existingLimits.some(
        (limit) =>
          limit.categoryId === categoryId &&
          limit.id !== excludeLimitId // Exclude the limit being edited
      );

      if (categoryLimitExists) {
        errors.push({
          field: "categoryId",
          message: t("limit_already_exists"),
        });
      }
    }

    return errors;
  };

  return {
    validateLimitForm,
  };
};
