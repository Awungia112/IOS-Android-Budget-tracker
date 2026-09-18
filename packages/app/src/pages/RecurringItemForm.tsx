import { useState, useEffect, useRef, type FormEvent } from "react";
import Layout from "@/components/Layout";
import { useBudget } from "@/contexts/BudgetContext";
import { formatCurrency, formatDate, toLocalDateString, parseDateString } from "@/lib/formatters";
import { cn } from "@/lib/utils";
import { getCategoryColor, translateCategoryLabel } from "@/lib/categoryHelpers";
import { CategoryAvatar } from "@/components/CategoryAvatar";
import { Input } from "@/components/ui/input";
import { AlertCircle, Calendar, ChevronDown, Check, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useNavigate, useParams } from "react-router-dom";
import { toast } from "@/components/ui/use-toast";
import { useScrollToFocusedInput } from "@/hooks/useScrollToFocusedInput";
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
import { DatePickerDialog, MAX_INTERVALS, unitIntervalToFrequency } from "@/components/DatePickerDialog";
import { Frequency, TransactionType } from "@budget/core";

export default function RecurringItemForm() {
  useScrollToFocusedInput();
  const navigate = useNavigate();
  const { itemId } = useParams();
  const { recurringItems, categories, addRecurringItem, updateRecurringItem } = useBudget();
  const { t } = useTranslation();

  const [name, setName] = useState("");
  const [amount, setAmount] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [type, setType] = useState<TransactionType>("expense");
  const [frequency, setFrequency] = useState<Frequency>("monthly");
  const [showFrequencySelector, setShowFrequencySelector] = useState(false);
  const [startDate, setStartDate] = useState(toLocalDateString());
  const [endDate, setEndDate] = useState<string | null>(null);
  const [showNoEndDateWarning, setShowNoEndDateWarning] = useState(false);
  const noEndDateWarningAcknowledged = useRef(false);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [datePickerTarget, setDatePickerTarget] = useState<"start" | "end">("start");
  const amountInputRef = useRef<HTMLInputElement>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Get categories filtered by type, excluding hidden ones.
  // When editing, always include the currently-assigned category even if hidden.
  const filteredCategories = categories.filter((category) => {
    if (category.type !== type) return false;
    if (!category.hidden) return true;
    return itemId !== undefined && category.id === categoryId;
  });

  // Load item data if editing
  useEffect(() => {
    if (itemId) {
      const item = recurringItems.find((i) => i.id === itemId);
      if (item) {
        setName(item.name);
        setAmount(item.amount.toString());
        setCategoryId(item.categoryId);
        setType(item.type);
        setFrequency(item.frequency);
        setStartDate(item.startDate);
        setEndDate(item.endDate ?? null);
      }
    }
  }, [itemId, recurringItems]);

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
    if (!startDate) {
      newErrors.startDate = t("error_date_required");
    }
    if (endDate && endDate < startDate) {
      newErrors.endDate = t("error_end_date_before_start", "End date must not be before the start date");
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (event?: FormEvent) => {
    event?.preventDefault();

    if (!validate()) {
      toast({
        title: t("error"),
        description: t("please_fill_all_fields"),
        variant: "destructive",
      });
      return;
    }

    if (!itemId && !endDate && !noEndDateWarningAcknowledged.current) {
      setShowNoEndDateWarning(true);
      return;
    }
    noEndDateWarningAcknowledged.current = false;

    if (itemId) {
      const item = recurringItems.find((i) => i.id === itemId);
      if (item) {
        updateRecurringItem({
          ...item,
          name,
          amount: Number(amount),
          categoryId,
          type,
          frequency,
          startDate,
          endDate,
        });
      }
    } else {
      addRecurringItem({
        name,
        amount: Number(amount),
        categoryId,
        type,
        frequency,
        startDate,
        endDate,
      });
    }

    navigate("/recurring");
  };

  return (
    <Layout>
      <div className="flex flex-col h-screen bg-white dark:bg-[#1A2124]">
        {/* Header with Back Button - matches Layout header style */}
        <div className="sticky top-0 z-[15] flex items-center justify-between px-6 py-4 bg-white dark:bg-[#1A2124] border-b border-gray-200 dark:border-white/10 text-black dark:text-white">
          <button
            onClick={() => navigate("/recurring")}
            className="text-black dark:text-white hover:opacity-70 transition-opacity"
            aria-label={t("cancel")}
          >
            <span className="text-sm font-medium">{t("cancel")}</span>
          </button>
          <h1 className="text-black dark:text-white text-lg font-bold text-center flex-1 mx-2 truncate">
            {itemId ? t("edit_recurring_item") : t("new_recurring_item")}
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
            <div className="mb-8 overflow-hidden text-center">
              <div className="relative inline-block">
              <button
                type="button"
                disabled={Boolean(itemId)}
                onClick={() => amountInputRef.current?.focus()}
                className={`relative cursor-text border-0 bg-transparent font-bold text-black outline-none dark:text-white ${
                  formatCurrency(Number(amount) || 0).length > 10
                    ? "text-3xl sm:text-4xl"
                    : formatCurrency(Number(amount) || 0).length > 8
                      ? "text-4xl sm:text-5xl"
                      : "text-5xl sm:text-6xl"
                }`}
                aria-label={t("enter_amount")}
              >
                <span id="recurring-amount-value">
                  {type === "income" ? "+" : "-"} {formatCurrency(Number(amount) || 0)}
                </span>
              </button>
                {/* The visible amount is display-only; this input receives the
                    digits, so it carries the label and announces the amount. */}
                <Input
                  ref={amountInputRef}
                  disabled={Boolean(itemId)}
                  type="text"
                  inputMode="numeric"
                  value={amount ? String(Math.round(Number(amount) * 100)) : ""}
                  onChange={(event) => {
                    const digits = event.target.value.replace(/\D/g, "").slice(0, 12);
                    setAmount(digits ? (Number(digits) / 100).toFixed(2) : "");
                    setErrors((prev) => ({ ...prev, amount: "" }));
                  }}
                  className="absolute h-0 w-0 overflow-hidden border-0 p-0 opacity-0"
                  tabIndex={-1}
                  aria-label={t("enter_amount")}
                  aria-describedby="recurring-amount-value"
                />
              </div>
            </div>

            {/* Name Input */}
            <div>
              <Input
                type="text"
                disabled={Boolean(itemId)}
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

            {/* Type Toggle */}
            <div className="flex gap-2 bg-white dark:bg-white/10 rounded-lg p-1 border border-black/10 dark:border-white/10 shadow-sm">
              <button
                type="button"
                disabled={Boolean(itemId)}
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
                type="button"
                disabled={Boolean(itemId)}
                onClick={() => handleTypeChange("income")}
                className={cn(
                  "flex-1 py-3 rounded-md text-sm font-semibold transition-all",
                  type === "income"
                    ? "bg-[#22C55E] text-white"
                    : "text-gray-700 dark:text-white/60 hover:text-black dark:hover:text-white"
                )}
              >
                {t("income")}
              </button>
            </div>

            {/* Frequency Selection */}
            <div>
              <div className="text-gray-700 dark:text-white/60 text-sm font-medium mb-2">
                {t("frequency")}
              </div>
              <div className="relative">
                <button
                  type="button"
                  disabled={Boolean(itemId)}
                  onClick={() => setShowFrequencySelector(!showFrequencySelector)}
                  className="w-full flex items-center justify-between px-4 py-2.5 rounded-lg border border-black/10 dark:border-white/10 bg-white dark:bg-white/10 text-black dark:text-white text-sm hover:bg-gray-50 dark:hover:bg-white/15 transition-colors shadow-sm"
                >
                  <span>{t(`frequency_${frequency}`, frequency)}</span>
                  <ChevronDown className={cn("w-4 h-4 text-gray-400 dark:text-white/50 transition-transform", showFrequencySelector && "rotate-180")} />
                </button>
                {showFrequencySelector && (
                  <div className="absolute z-50 mt-1 w-full rounded-lg border border-gray-200 dark:border-white/10 bg-white dark:bg-[#1A2124] shadow-lg max-h-[240px] overflow-y-auto">
                    {Array.from({ length: MAX_INTERVALS.months }, (_, i) => i + 1).map((n) => {
                      const freq = unitIntervalToFrequency('months', n);
                      const isSelected = frequency === freq;
                      return (
                        <button
                          key={freq}
                          type="button"
                          onClick={() => { setFrequency(freq); setShowFrequencySelector(false); }}
                          className={cn(
                            "w-full flex items-center justify-between px-4 py-2.5 text-sm text-left transition-colors hover:bg-gray-50 dark:hover:bg-white/10",
                            isSelected ? "text-budget-blue font-medium" : "text-gray-700 dark:text-white/80",
                          )}
                        >
                          <span>{t(`frequency_${freq}`, freq)}</span>
                          {isSelected && <Check className="w-4 h-4 text-budget-blue" />}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>

            {/* Start Date */}
            <div>
              <div className="text-gray-700 dark:text-white/60 text-sm font-medium mb-2">
                {t("start_date")}
              </div>
              <button
                type="button"
                data-testid="recurring-start-date-button"
                disabled={Boolean(itemId)}
                onClick={() => {
                  setDatePickerTarget("start");
                  setShowDatePicker(true);
                }}
                className={cn(
                  "relative w-full bg-white dark:bg-white/10 border rounded-lg px-4 py-3 text-center text-lg font-semibold transition-colors flex items-center justify-center gap-2 shadow-sm border-black/10 dark:border-white/20"
                )}
              >
                <Calendar className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400 dark:text-white/60" />
                <span className="text-black dark:text-white">
                  {formatDate(startDate)}
                </span>
              </button>
              {errors.startDate && (
                <div className="flex items-center gap-2 mt-2 text-destructive text-sm">
                  <AlertCircle className="w-4 h-4" />
                  {errors.startDate}
                </div>
              )}
            </div>

            {/* End Date */}
            <div>
              <div className="text-gray-700 dark:text-white/60 text-sm font-medium mb-2">
                {t("end_date", "End date")}
              </div>
              <div className="relative">
                <button
                  type="button"
                  onClick={() => {
                    setDatePickerTarget("end");
                    setShowDatePicker(true);
                  }}
                  className="w-full bg-white dark:bg-white/10 border rounded-lg px-12 py-3 text-center text-lg font-semibold text-black dark:text-white transition-colors flex items-center justify-center gap-2 shadow-sm border-black/10 dark:border-white/20"
                  aria-label={t("end_date", "End date")}
                >
                  <Calendar className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400 dark:text-white/60" />
                  <span>{endDate ? formatDate(endDate) : "dd.mm.yyyy"}</span>
                </button>
                {endDate && (
                  <button
                    type="button"
                    aria-label={t("clear_end_date", "Clear end date")}
                    onClick={() => setEndDate(null)}
                    className="absolute right-4 top-1/2 -translate-y-1/2 rounded-full p-1 text-gray-400 hover:text-black dark:text-white/60 dark:hover:text-white"
                  >
                    <X className="h-4 w-4" />
                  </button>
                )}
              </div>
              {errors.endDate && <div className="mt-2 text-destructive text-sm">{errors.endDate}</div>}
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
                    type="button"
                    disabled={Boolean(itemId)}
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
                          : "border-black/10 dark:border-white/20 bg-white dark:bg-white/5 hover:bg-gray-100 dark:hover:bg-white/10"
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

      {/* Date Picker Dialog */}
      <DatePickerDialog
        open={showDatePicker}
        onOpenChange={setShowDatePicker}
        selectedYear={parseDateString(datePickerTarget === "start" ? startDate : endDate ?? startDate).year}
        selectedMonth={parseDateString(datePickerTarget === "start" ? startDate : endDate ?? startDate).month}
        selectedDay={parseDateString(datePickerTarget === "start" ? startDate : endDate ?? startDate).day}
        onYearChange={() => {}}
        onMonthChange={() => {}}
        onConfirm={(year, month, day) => {
          const selected = datePickerTarget === "start" ? startDate : endDate ?? startDate;
          const currentDay = day ?? parseDateString(selected).day;
          const value = `${year}-${String(month + 1).padStart(2, "0")}-${String(currentDay).padStart(2, "0")}`;
          if (datePickerTarget === "start") setStartDate(value);
          else setEndDate(value);
        }}
      />
      <AlertDialog open={showNoEndDateWarning} onOpenChange={setShowNoEndDateWarning}>
        <AlertDialogContent className="rounded-[12px] max-w-[calc(100%-2rem)] bg-white dark:bg-[#1A2124] border-gray-200 dark:border-white/10 shadow-lg">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-lg font-semibold text-black dark:text-white">
              {t("recurring_no_end_date_title", "No end date selected")}
            </AlertDialogTitle>
            <AlertDialogDescription className="text-gray-500 dark:text-gray-400">
              {t("recurring_no_end_date_confirmation", "This recurring item has no end date. The next 12 occurrences will be created for forecasting. You can add an end date later.")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-row gap-3 sm:gap-3">
            <AlertDialogCancel className="flex-1 rounded-[8px] mt-0 bg-gray-100 dark:bg-white/10 text-black dark:text-white border-gray-200 dark:border-white/10 hover:bg-gray-200 dark:hover:bg-white/20">
              {t("cancel")}
            </AlertDialogCancel>
            <AlertDialogAction
              className="flex-1 rounded-[8px] bg-[#0B75C2] text-white hover:bg-[#0968ab]"
              onClick={() => {
                setShowNoEndDateWarning(false);
                noEndDateWarningAcknowledged.current = true;
                void handleSubmit();
              }}
            >
              {t("continue", "Continue")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Layout>
  );
}
