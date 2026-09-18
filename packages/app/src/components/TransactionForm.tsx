import { useState, useEffect, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useBudget } from "@/contexts/BudgetContext";
import { Frequency, Transaction, TransactionType } from "@budget/core";
import { useTranslation } from "react-i18next";
import { CategoryChip } from "@/components/ui/category-chip";
import { ChevronDown, ChevronUp } from "lucide-react";
import { translateCategoryLabel } from "@/lib/categoryHelpers";
import { DatePickerDialog } from "@/components/DatePickerDialog";
import { toast } from "@/components/ui/use-toast";
import { formatDate, toLocalDateString } from "@/lib/formatters";

interface TransactionFormProps {
  type: TransactionType;
  onSave: () => void;
  onCancel: () => void;
  editTransaction?: Transaction;
}

const TransactionForm = ({
  type,
  onSave,
  onCancel,
  editTransaction,
}: TransactionFormProps) => {
  const { categories, addTransaction, updateTransaction, addRecurringItem, deleteRecurringItem } = useBudget();
  const { t, i18n } = useTranslation();

  const [amount, setAmount] = useState(
    editTransaction?.amount.toString() || "",
  );
  const [categoryId, setCategoryId] = useState(() => {
    if (editTransaction?.category) return editTransaction.category;
    const initialCats = categories.filter((cat) => cat.type === type && !cat.hidden);
    return initialCats.length > 0 ? initialCats[0].id : "";
  });  const [date, setDate] = useState(
    editTransaction?.date || toLocalDateString(),
  );
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [title, setTitle] = useState(editTransaction?.title || "");
  const [isCategoryExpanded, setIsCategoryExpanded] = useState(true);
  const [isRecurring, setIsRecurring] = useState(false);
  const [recurringFrequency, setRecurringFrequency] = useState<Frequency>("monthly");

  // Filter categories by type, excluding hidden ones.
  // When editing, always include the currently-assigned category even if hidden,
  // so the picker shows the correct selection instead of falling back to placeholder.
  // Memoized so the scroll effects below only re-run when the input actually
  // changes — a rebuilt array identity on every render would otherwise fire them
  // on each keystroke (e.g. typing into Amount/Note would snap the grid back).
  const filteredCategories = useMemo(
    () =>
      categories.filter((cat) => {
        if (cat.type !== type) return false;
        if (!cat.hidden) return true;
        // keep the assigned category visible while editing so it stays selected
        return editTransaction?.category === cat.id;
      }),
    [categories, type, editTransaction?.category],
  );

  // Helper to parse date string (YYYY-MM-DD) safely without timezone issues
  const parseDateString = (dateStr: string) => {
    const [year, month, day] = dateStr.split("-").map(Number);
    return { year, month: month - 1, day }; // month is 0-indexed
  };

  // Helper to format date as YYYY-MM-DD string without timezone conversion
  const formatDateString = (year: number, month: number, day: number) => {
    const y = year.toString().padStart(4, "0");
    const m = (month + 1).toString().padStart(2, "0");
    const d = day.toString().padStart(2, "0");
    return `${y}-${m}-${d}`;
  };

  // Helper to get last day of month
  const getLastDayOfMonth = (year: number, month: number) => {
    return new Date(year, month + 1, 0).getDate();
  };

  useEffect(() => {
    // Set default category if none selected and categories are available
    if (!categoryId && filteredCategories.length > 0) {
      setCategoryId(filteredCategories[0].id);
    }
  }, [categoryId, filteredCategories]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!amount || isNaN(Number(amount)) || Number(amount) <= 0) {
      toast({
        title: t("error"),
        description: t("error_amount_required"),
        variant: "destructive",
      });
      return;
    }

    if (!categoryId) {
      toast({
        title: t("error"),
        description: t("error_category_required"),
        variant: "destructive",
      });
      return;
    }

    try {
      if (editTransaction) {
        await updateTransaction({
          ...editTransaction,
          type,
          amount: Number(amount),
          category: categoryId,
          date,
          title,
        });
      } else {
        // If recurring is enabled, create the recurring item first to avoid
        // a one-time transaction being saved without its recurring counterpart
        if (isRecurring) {
          const selectedCategory = categories.find((c) => c.id === categoryId);
          const recurringName = title
            || (selectedCategory ? translateCategoryLabel(t, selectedCategory.name, selectedCategory.isDefault ?? false) : `${type === "income" ? t("income") : t("expense")} ${amount}`);
          
          // Calculate the start date for recurring item (next month from user's selected date)
          const selectedDate = new Date(date);
          
          // Fix JavaScript Date month-end bug by setting day to 1 first, then clamping to last day of target month
          const targetDay = selectedDate.getDate();
          const daysInTargetMonth = new Date(selectedDate.getFullYear(), selectedDate.getMonth() + 2, 0).getDate();
          const clampedDay = Math.min(targetDay, daysInTargetMonth);
          
          // Create recurring item that starts exactly one month after selected date
          // Set day to 1 first to avoid month overflow, then set correct day
          const nextMonthStart = new Date(selectedDate);
          nextMonthStart.setDate(1); // Reset to 1st to avoid overflow
          nextMonthStart.setMonth(selectedDate.getMonth() + 1); // Now safe to change month
          nextMonthStart.setDate(clampedDay); // Set to clamped day (last day of month if needed)
          
          // Format date locally to avoid timezone shifts
          const year = nextMonthStart.getFullYear();
          const month = String(nextMonthStart.getMonth() + 1).padStart(2, '0');
          const day = String(nextMonthStart.getDate()).padStart(2, '0');
          const startDate = `${year}-${month}-${day}`;
          
          const recurringId = await addRecurringItem({
            name: recurringName,
            amount: Number(amount),
            categoryId,
            type,
            frequency: recurringFrequency,
            startDate, // Use locally formatted date
          }, { silent: true });

          try {
            await addTransaction({
              type,
              amount: Number(amount),
              category: categoryId,
              date,
              title,
              isRecurring: true,
              // Link to the recurring item so processRecurringItems can find this
              // transaction via the primary FK check and won't generate a duplicate
              ...(recurringId ? { recurringItemId: recurringId } : {}),
            });
          } catch (err) {
            // Roll back the recurring item if the transaction failed
            if (recurringId) await deleteRecurringItem(recurringId);
            throw err;
          }
        } else {
          // TODO (#457 Phase 2): Add UI to link manual transactions to existing recurring items.
          // Currently, when a user manually enters a transaction that matches an existing
          // recurring item (e.g., entering a different amount for this month's rent), the
          // recurringItemId FK is NOT set. The duplicate prevention relies solely on the
          // fuzzy fallback (title + category match). Phase 2 should add an "Override this
          // occurrence" or "Link to recurring item" control in the UI to allow users to
          // explicitly link manual entries to recurring items, ensuring the primary FK check
          // works and providing better duplicate detection.
          await addTransaction({
            type,
            amount: Number(amount),
            category: categoryId,
            date,
            title,
          });
        }

        if (isRecurring) {
          toast({
            title: t("success"),
            description: t("transaction_added_with_recurring"),
            variant: "success",
          });
        }
      }

      onSave();
    } catch (err) {
      console.error("Form submission failed:", err);
    }
  };

  // Get selected category name for dropdown display
  const selectedCategory = filteredCategories.find(
    (cat) => cat.id === categoryId,
  );

  return (
    <form onSubmit={handleSubmit} className="space-y-4" data-testid="transaction-form" noValidate>
      {/* Amount Input - Figma: Large colored display */}
      <div>
        <label
          htmlFor="amount"
          className="block text-sm font-bold text-foreground mb-2"
        >
          {t("amount")} (€)
        </label>
        <div className="border border-black/10 dark:border-white/10 rounded-[8px] px-6 py-4 flex items-center justify-center min-h-[125px] bg-white dark:bg-white/5 shadow-sm">
          <Input
            id="amount"
            type="number"
            step="0.01"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="0.00"
            className={`text-[42px] sm:text-[54px] font-semibold text-center border-none shadow-none bg-transparent w-full ${
              type === "income" ? "text-[#00B569]" : "text-[#E33B80]"
            } caret-primary text-foreground dark:text-white`}
            required
            data-testid="transaction-amount-input"
          />
        </div>
      </div>

      {/* Name/Title Input - Figma style */}
      <div>
        <label
          htmlFor="title"
          className="block text-sm font-bold text-foreground mb-2"
        >
          {t("enter_title")}
        </label>
        <div className="border border-black/10 dark:border-white/10 rounded-[8px] h-[55px] flex items-center px-4 bg-white dark:bg-white/5 shadow-sm">
          <Input
            id="title"
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={t("enter_title_optional")}
            className="border-none shadow-none bg-transparent text-[14px] text-foreground dark:text-white placeholder:text-muted-foreground/50"
            data-testid="transaction-note-input"
          />
        </div>
      </div>

      {/* Category Dropdown Display - Figma style */}
      <div>
        <label className="block text-sm font-bold text-foreground mb-2">
          {t("category")}
        </label>
        <button
          type="button"
          onClick={() => setIsCategoryExpanded(!isCategoryExpanded)}
          className="w-full border border-black/10 dark:border-white/10 rounded-[8px] h-[55px] flex items-center justify-between px-4 bg-white dark:bg-white/5 shadow-sm cursor-pointer text-foreground dark:text-white"
          data-testid="transaction-category-chip"
        >
          <span className="text-[14px] text-foreground dark:text-white">
            {selectedCategory
              ? translateCategoryLabel(t, selectedCategory.name, selectedCategory.isDefault ?? false)
              : t("select_category")}
          </span>
          {isCategoryExpanded ? (
            <ChevronUp className="h-4 w-4 text-muted-foreground/50" />
          ) : (
            <ChevronDown className="h-4 w-4 text-muted-foreground/50" />
          )}
        </button>
      </div>

      {/* Category Chips Grid - Figma: 3 columns, 100x117px chips.
          Deliberately uncapped and not its own scroll region: the drawer body is
          the single scroll region, so every chip is reachable by scrolling the
          form and nothing is clipped mid-row (chip height is content-dependent —
          min-h-[125px] plus a label that wraps on longer German category names —
          so no fixed max-height can align to the rows). Because nothing is behind
          a fold, the selected chip needs no scroll-into-view: scrolling it into
          view would move the whole form and push the amount field off-screen.
          p-1 gives the selected chip's scale-105 room. */}
      {isCategoryExpanded && (
        <div className="grid grid-cols-3 gap-3 p-1">
          {filteredCategories.map((category) => (
            <CategoryChip
              key={category.id}
              icon={category.icon}
              categoryKey={category.name}
              label={translateCategoryLabel(t, category.name, category.isDefault ?? false)}
              selected={categoryId === category.id}
              data-selected={categoryId === category.id}
              onClick={() => setCategoryId(category.id)}
            />
          ))}
        </div>
      )}

      {/* Date Picker - Figma style */}
      <div>
        <label className="block text-sm font-bold text-foreground mb-2">
          {t("date")}
        </label>
        <button
          type="button"
          onClick={() => setShowDatePicker(true)}
          className="w-full border border-black/10 dark:border-white/10 rounded-[8px] h-[55px] flex items-center justify-between px-4 bg-white dark:bg-white/5 shadow-sm cursor-pointer text-foreground dark:text-white"
          data-testid="transaction-date-picker-button"
        >
          <span className="text-[14px] text-foreground dark:text-white">
            {date
              ? formatDate(new Date(date).toISOString())
              : t("select_date")}
          </span>
          <ChevronDown className="h-4 w-4 text-muted-foreground/50" />
        </button>
      </div>

      {/* Date Picker Dialog */}
      <DatePickerDialog
        open={showDatePicker}
        onOpenChange={setShowDatePicker}
        selectedYear={parseDateString(date).year}
        selectedMonth={parseDateString(date).month}
        selectedDay={parseDateString(date).day}
        onYearChange={(year) => {
          setDate(prev => {
            const { month, day } = parseDateString(prev);
            return formatDateString(year, month, Math.min(day, getLastDayOfMonth(year, month)));
          });
        }}
        onMonthChange={(month) => {
          setDate(prev => {
            const { year, day } = parseDateString(prev);
            return formatDateString(year, month, Math.min(day, getLastDayOfMonth(year, month)));
          });
        }}
        onDayChange={(day) => {
          setDate(prev => {
            const { year, month } = parseDateString(prev);
            return formatDateString(year, month, day);
          });
        }}
        onSelect={() => setShowDatePicker(false)}
        disablePastDates={false}
        showRecurringToggle={!editTransaction}
        isRecurring={isRecurring}
        onRecurringChange={setIsRecurring}
        recurringFrequency={recurringFrequency}
        onRecurringFrequencyChange={setRecurringFrequency}
      />

      {/* Action Buttons - Figma: Cancel gray, Save colored */}
      <div className="flex gap-3 pt-4">
        <Button
          type="button"
          onClick={onCancel}
          className="flex-1 h-[58px] bg-secondary text-foreground dark:text-white font-bold rounded-[8px] hover:bg-secondary/80 border-border"
        >
          {t("cancel")}
        </Button>
        <Button
          type="submit"
          className={`flex-1 h-[58px] font-bold rounded-[8px] ${
            type === "income"
              ? "bg-[#3FCB72] hover:bg-[#3FCB72]/90"
              : "bg-[#E33B80] hover:bg-[#E33B80]/90"
          } text-white`}
          data-testid="transaction-save-button"
        >
          {editTransaction ? t("update") : t("save")}
        </Button>
      </div>
    </form>
  );
};

export default TransactionForm;
