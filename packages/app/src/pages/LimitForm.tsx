import { useState, useEffect } from "react";
import Layout from "@/components/Layout";
import { useBudget } from "@/contexts/BudgetContext";
import { formatCurrency } from "@/lib/formatters";
import { cn } from "@/lib/utils";
import { getCategoryColor, translateCategoryLabel } from "@/lib/categoryHelpers";
import { CategoryAvatar } from "@/components/CategoryAvatar";
import {
  useLimitValidation,
  ValidationError,
} from "@/hooks/useLimitValidation";
import { Input } from "@/components/ui/input";
import { AlertCircle } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useNavigate, useParams } from "react-router-dom";
import { useScrollToFocusedInput } from "@/hooks/useScrollToFocusedInput";

export default function LimitForm() {
  useScrollToFocusedInput();
  const navigate = useNavigate();
  const { limitId } = useParams();
  const { limits, categories, addLimit, updateLimit } = useBudget();
  const { t } = useTranslation();
  const { validateLimitForm } = useLimitValidation();

  const [categoryId, setCategoryId] = useState("");
  const [amount, setAmount] = useState("");
  const [validationErrors, setValidationErrors] = useState<ValidationError[]>(
    [],
  );

  // Get only expense categories, excluding hidden ones.
  // When editing, always include the currently-assigned category even if hidden.
  const expenseCategories = categories.filter((category) => {
    if (category.type !== "expense") return false;
    if (!category.hidden) return true;
    return limitId !== undefined && category.id === categoryId;
  });

  // Load limit data if editing
  useEffect(() => {
    if (limitId) {
      const limit = limits.find((l) => l.id === limitId);
      if (limit) {
        setCategoryId(limit.categoryId);
        setAmount(limit.amount.toString());
      }
    }
  }, [limitId, limits]);

  const getFieldError = (field: "categoryId" | "amount"): string | null => {
    const error = validationErrors.find((e) => e.field === field);
    return error?.message || null;
  };

  const handleSubmit = () => {
    const errors = validateLimitForm(
      categoryId,
      amount,
      limits,
      limitId || undefined,
    );

    if (errors.length > 0) {
      setValidationErrors(errors);
      return;
    }

    setValidationErrors([]);

    if (limitId) {
      const limitToUpdate = limits.find((limit) => limit.id === limitId);
      if (limitToUpdate) {
        updateLimit({
          ...limitToUpdate,
          categoryId,
          amount: Number(amount),
        });
      }
    } else {
      addLimit({
        categoryId,
        amount: Number(amount),
      });
    }

    navigate("/limits");
  };

  return (
    <Layout>
      <div className="flex flex-col h-screen bg-white dark:bg-[#1A2124]">
        {/* Header with Back Button - matches Layout header style */}
        <div className="sticky top-0 z-[15] flex items-center justify-between px-6 py-4 bg-white dark:bg-[#1A2124] border-b border-gray-200 dark:border-white/10 text-black dark:text-white">
          <button
            onClick={() => navigate("/limits")}
            className="text-black dark:text-white hover:opacity-70 transition-opacity"
            aria-label={t("cancel")}
            data-testid="limit-form-cancel"
          >
            <span className="text-sm font-medium">{t("cancel")}</span>
          </button>
          <h1 className="text-black dark:text-white text-lg font-bold text-center flex-1 mx-2 truncate" data-testid="limit-form-title">
            {limitId ? t("edit_limit") : t("new_limit")}
          </h1>
          <button
            onClick={handleSubmit}
            className="text-black dark:text-white font-bold hover:opacity-70 transition-opacity"
            aria-label={t("save")}
            data-testid="limit-form-save"
          >
            {t("save")}
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto pb-20">
          <div className="px-6 py-8 space-y-8 max-w-2xl mx-auto">
            {/* Amount Display */}
            <div className="text-center mb-8 overflow-hidden">
              <div
                className={`font-bold text-black dark:text-white mb-2 ${
                  formatCurrency(Number(amount) || 0).length > 10
                    ? "text-3xl sm:text-4xl"
                    : formatCurrency(Number(amount) || 0).length > 8
                      ? "text-4xl sm:text-5xl"
                      : "text-5xl sm:text-6xl"
                }`}
              >
                {formatCurrency(Number(amount) || 0)}
              </div>
            </div>

            {/* Amount Input */}
            <div>
              <Input
                type="number"
                step="0.01"
                placeholder={t("enter_amount")}
                value={amount}
                onChange={(e) => {
                  setAmount(e.target.value);
                  setValidationErrors(
                    validationErrors.filter((e) => e.field !== "amount"),
                  );
                }}
                data-testid="limit-form-amount"
                className={`w-full bg-white dark:bg-white/10 border text-black dark:text-white placeholder:text-gray-500 dark:placeholder:text-white/50 rounded-lg px-4 py-3 text-center text-lg font-semibold shadow-sm focus:bg-gray-50 dark:focus:bg-white/15 focus:outline-none transition-colors border-black/10 dark:border-white/20`}
              />
              {getFieldError("amount") && (
                <div className="flex items-center gap-2 mt-2 text-destructive text-sm">
                  <AlertCircle className="w-4 h-4" />
                  {getFieldError("amount")}
                </div>
              )}
              {getFieldError("categoryId") && (
                <div className="flex items-center gap-2 mt-2 text-destructive text-sm bg-destructive/10 p-3 rounded-lg border border-destructive/30">
                  <AlertCircle className="w-4 h-4 flex-shrink-0" />
                  <span>{getFieldError("categoryId")}</span>
                </div>
              )}
            </div>

            {/* Category Label */}
            <div className="text-gray-700 dark:text-white/60 text-lg font-medium text-center">
              {t("category")}
            </div>

            {/* Category Grid */}
            <div className="grid grid-cols-3 gap-4">
              {expenseCategories.map((category) => {
                const isSelected = categoryId === category.id;
                const categoryColor = getCategoryColor(category.name);
                const categoryError = getFieldError("categoryId");
                return (
                  <button
                    key={category.id}
                    onClick={() => {
                      setCategoryId(category.id);
                      setValidationErrors(
                        validationErrors.filter(
                          (e) => e.field !== "categoryId",
                        ),
                      );
                    }}
                    aria-label={translateCategoryLabel(t, category.name, category.isDefault ?? false)}
                    aria-pressed={isSelected}
                    data-testid={`limit-category-${category.id}`}
                    className={cn(
                      "flex flex-col items-center justify-center py-6 rounded-lg border-2 border-dashed transition-all shadow-sm dark:shadow-none",
                      isSelected
                        ? "border-[#3A464F] dark:border-white bg-[#3A464F] dark:bg-white"
                        : categoryError
                          ? "border-destructive bg-destructive/5"
                          : "border-black/10 dark:border-white/20 bg-white dark:bg-white/5 hover:bg-gray-100 dark:hover:bg-white/10",
                    )}
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
                    <span className={cn(
                      "text-xs text-center leading-tight transition-all",
                      isSelected
                        ? "text-white dark:text-budget-dark font-bold opacity-100 scale-105"
                        : "text-black dark:text-white text-xs font-medium text-center leading-tight"
                    )}>
                      {translateCategoryLabel(t, category.name, category.isDefault ?? false)}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </Layout>
  );
}
