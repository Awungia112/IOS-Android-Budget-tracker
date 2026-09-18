import { useState, useEffect } from "react";
import Layout from "@/components/Layout";
import { useBudget } from "@/contexts/BudgetContext";
import { formatCurrency } from "@/lib/formatters";
import { cn } from "@/lib/utils";
import { getCategoryColor, translateCategoryLabel } from "@/lib/categoryHelpers";
import { CategoryAvatar } from "@/components/CategoryAvatar";
import { Input } from "@/components/ui/input";
import { AlertCircle } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useNavigate, useParams } from "react-router-dom";
import { toast } from "@/components/ui/use-toast";
import { TransactionType } from "@budget/core";
import { useScrollToFocusedInput } from "@/hooks/useScrollToFocusedInput";

export default function TemplateForm() {
  useScrollToFocusedInput();
  const navigate = useNavigate();
  const { templateId } = useParams();
  const { templates, categories, addTemplate, updateTemplate } = useBudget();
  const { t } = useTranslation();

  const [name, setName] = useState("");
  const [amount, setAmount] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [type, setType] = useState<TransactionType>("expense");
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Get categories filtered by type, excluding hidden ones.
  // When editing, always include the currently-assigned category even if hidden.
  const filteredCategories = categories.filter((category) => {
    if (category.type !== type) return false;
    if (!category.hidden) return true;
    return templateId !== undefined && category.id === categoryId;
  });

  // Load template data if editing
  useEffect(() => {
    if (templateId) {
      const template = templates.find((t) => t.id === templateId);
      if (template) {
        setName(template.name);
        setAmount(template.amount.toString());
        setCategoryId(template.categoryId);
        setType(template.type);
      }
    }
  }, [templateId, templates]);

  // Reset category when type changes
  const handleTypeChange = (newType: TransactionType) => {
    setType(newType);
    setCategoryId("");
    setErrors((prev) => ({ ...prev, categoryId: "" }));
  };

  const validate = (): boolean => {
    const newErrors: Record<string, string> = {};

    if (!name.trim()) {
      newErrors.name = t("error_name_required");
    }
    if (!amount || isNaN(Number(amount)) || Number(amount) <= 0) {
      newErrors.amount = t("error_amount_required");
    }
    if (!categoryId) {
      newErrors.categoryId = t("error_category_required");
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = () => {
    if (!validate()) {
      toast({
        title: t("error"),
        description: t("please_fill_all_fields"),
        variant: "destructive",
      });
      return;
    }

    if (templateId) {
      const template = templates.find((t) => t.id === templateId);
      if (template) {
        updateTemplate({
          ...template,
          name,
          amount: Number(amount),
          categoryId,
          type,
        });
      }
    } else {
      addTemplate({
        name,
        amount: Number(amount),
        categoryId,
        type,
      });
    }

    navigate("/templates");
  };

  return (
    <Layout>
      <div className="flex flex-col h-screen bg-white dark:bg-[#1A2124]">
        {/* Header with Back Button - matches Layout header style */}
        <div className="sticky top-0 z-[15] flex items-center justify-between px-6 py-4 bg-white dark:bg-[#1A2124] border-b border-gray-200 dark:border-white/10 text-black dark:text-white">
          <button
            onClick={() => navigate("/templates")}
            className="text-black dark:text-white hover:opacity-70 transition-opacity"
            aria-label={t("cancel")}
          >
            <span className="text-sm font-medium">{t("cancel")}</span>
          </button>
          <h1 className="text-black dark:text-white text-lg font-bold text-center flex-1 mx-2 truncate">
            {templateId ? t("editTemplate") : t("newTemplate")}
          </h1>
          <button
            onClick={handleSubmit}
            className="text-black dark:text-white font-bold hover:opacity-70 transition-opacity"
            aria-label={t("save")}
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
                {type === "income" ? "+" : "-"} {formatCurrency(Number(amount) || 0)}
              </div>
            </div>

            {/* Name Input */}
            <div>
              <Input
                type="text"
                placeholder={t("enter_title")}
                value={name}
                onChange={(e) => {
                  setName(e.target.value);
                  setErrors((prev) => ({ ...prev, name: "" }));
                }}
                className={`w-full bg-white dark:bg-white/10 border text-black dark:text-white placeholder:text-gray-500 dark:placeholder:text-white/50 rounded-lg px-4 py-3 text-center text-lg font-semibold shadow-sm focus:bg-gray-50 dark:focus:bg-white/15 focus:outline-none transition-colors border-black/10 dark:border-white/20`}
              />
              {errors.name && (
                <div className="flex items-center gap-2 mt-2 text-destructive text-sm">
                  <AlertCircle className="w-4 h-4" />
                  {errors.name}
                </div>
              )}
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
                  setErrors((prev) => ({ ...prev, amount: "" }));
                }}
                className={`w-full bg-white dark:bg-white/10 border text-black dark:text-white placeholder:text-gray-500 dark:placeholder:text-white/50 rounded-lg px-4 py-3 text-center text-lg font-semibold shadow-sm focus:bg-gray-50 dark:focus:bg-white/15 focus:outline-none transition-colors border-black/10 dark:border-white/20`}
              />
              {errors.amount && (
                <div className="flex items-center gap-2 mt-2 text-destructive text-sm">
                  <AlertCircle className="w-4 h-4" />
                  {errors.amount}
                </div>
              )}
            </div>

            {/* Type Toggle */}
            <div className="flex gap-2 bg-white dark:bg-white/10 rounded-lg p-1">
              <button
                onClick={() => handleTypeChange("expense")}
                className={cn(
                  "flex-1 py-3 rounded-md text-sm font-semibold transition-all",
                  type === "expense"
                    ? "bg-[#E33B80] text-white"
                    : "text-gray-700 dark:text-white/60 hover:text-black dark:hover:text-white"
                )}
              >
                {t("expense")}
              </button>
              <button
                onClick={() => handleTypeChange("income")}
                className={cn(
                  "flex-1 py-3 rounded-md text-sm font-semibold transition-all",
                  type === "income"
                    ? "bg-[#00C853] text-white"
                    : "text-gray-700 dark:text-white/60 hover:text-black dark:hover:text-white"
                )}
              >
                {t("income")}
              </button>
            </div>

            {/* Category Label */}
            <div className="text-gray-700 dark:text-white/60 text-lg font-medium text-center">
              {t("category")}
            </div>

            {/* Category Error */}
            {errors.categoryId && (
              <div className="flex items-center gap-2 mt-2 text-destructive text-sm bg-destructive/10 p-3 rounded-lg border border-destructive/30">
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                <span>{errors.categoryId}</span>
              </div>
            )}

            {/* Category Grid */}
            <div className="grid grid-cols-3 gap-4">
              {filteredCategories.map((category) => {
                const isSelected = categoryId === category.id;
                const categoryColor = getCategoryColor(category.name);
                const categoryError = errors.categoryId;
                return (
                  <button
                    key={category.id}
                    onClick={() => {
                      setCategoryId(category.id);
                      setErrors((prev) => ({ ...prev, categoryId: "" }));
                    }}
                    aria-label={translateCategoryLabel(t, category.name, category.isDefault ?? false)}
                    aria-pressed={isSelected}
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
