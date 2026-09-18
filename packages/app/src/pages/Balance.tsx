import { useState, useMemo, useRef, useEffect } from "react";
import Layout from "@/components/Layout";
import { useBudget } from "@/contexts/BudgetContext";
import { formatCurrency, formatDate, getMonthName } from "@/lib/formatters";
import { useTranslation } from "react-i18next";
import { CategoryAvatar } from "@/components/CategoryAvatar";
import { DatePickerDialog } from "@/components/DatePickerDialog";
import { CategoryChip } from "@/components/ui/category-chip";
import TransactionForm from "@/components/TransactionForm";
import type { Transaction } from "@budget/core";
import { translateCategoryLabel } from "@/lib/categoryHelpers";
import { cn } from "@/lib/utils";
import { ChevronDown, Filter, Check, ArrowLeft, X } from "lucide-react";
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
import { CategoryService } from "@budget/core";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerDescription,
} from "@/components/ui/drawer";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";

type TimePeriod = "none" | "30" | "90" | "180" | "custom";

interface FilterState {
  searchText: string;
  timePeriod: TimePeriod;
  dateFrom: string;
  dateTo: string;
  amountMin: string;
  amountMax: string;
  categoryType: "all" | "income" | "expense";
  selectedCategories: Set<string>;
}

export const groupTransactionsByMonth = (txs: Transaction[]) => {
  const groups = new Map<string, Transaction[]>();
  for (const tx of txs) {
    const key = tx.date.substring(0, 7);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(tx);
  }
  return [...groups.entries()]
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([key, groupTxs]) => {
      const [year, month] = key.split("-").map(Number);
      const income = groupTxs
        .filter((tx) => tx.type === "income")
        .reduce((s, tx) => s + tx.amount, 0);
      const expenses = groupTxs
        .filter((tx) => tx.type === "expense")
        .reduce((s, tx) => s + tx.amount, 0);
      return {
        key,
        year,
        month: month - 1,
        transactions: groupTxs.sort((a, b) => {
          const dateDiff = b.date.localeCompare(a.date);
          if (dateDiff !== 0) return dateDiff;
          // Same-day transactions: newest created first so newly added entries
          // appear on top. Treat missing timestamps (e.g. imported legacy
          // transactions) as the oldest possible date so the order stays
          // stable instead of falling back to arbitrary UUID ordering.
          const aCreated = a.createdAt ? Date.parse(a.createdAt) : 0;
          const bCreated = b.createdAt ? Date.parse(b.createdAt) : 0;
          if (aCreated !== bCreated) return bCreated - aCreated;
          return b.id.localeCompare(a.id); // last-resort stable tiebreak
        }),
        income,
        expenses,
        net: income - expenses,
      };
    });
};

const toLocalDate = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

const getDefaultFilters = (): FilterState => {
  const now = new Date();
  const today = toLocalDate(now);
  const futureLimit = new Date(now.getFullYear(), now.getMonth() + 3, now.getDate());
  const thirtyDaysAgo = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 30);
  return {
    searchText: "",
    timePeriod: "none",
    dateFrom: toLocalDate(thirtyDaysAgo),
    // Include persisted recurring instances in the current month and the next
    // three months. The Balance page later collapses future months, but they
    // must remain in the source range so forecasting is visible.
    dateTo: toLocalDate(futureLimit),
    amountMin: "",
    amountMax: "",
    categoryType: "all",
    selectedCategories: new Set<string>(),
  };
};

interface BalanceProps {
  onClose?: () => void;
}

const Balance = ({ onClose }: BalanceProps = {}) => {
  const { transactions, recurringItems, categories, deleteTransaction } = useBudget();
  const [deletingTxId, setDeletingTxId] = useState<string | null>(null);
  const { t } = useTranslation();
  const [futureExpanded, setFutureExpanded] = useState(false);
  const [filterOpen, setFilterOpen] = useState(false);
  const [filters, setFilters] = useState<FilterState>(getDefaultFilters);
  const [timePeriodOpen, setTimePeriodOpen] = useState(false);
  const [dateFromPickerOpen, setDateFromPickerOpen] = useState(false);
  const [dateToPickerOpen, setDateToPickerOpen] = useState(false);
  
  // Date selection state
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth());
  const [showDatePicker, setShowDatePicker] = useState(false);

  const [editingTransaction, setEditingTransaction] = useState<Transaction | null>(null);
  const timePeriodRef = useRef<HTMLDivElement>(null);

  // Close time period dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (timePeriodRef.current && !timePeriodRef.current.contains(e.target as Node)) {
        setTimePeriodOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  // Scroll to selected month when jump is triggered
  useEffect(() => {
    if (showDatePicker) return; // Wait until dialog closes
    const monthStr = `${selectedYear}-${String(selectedMonth + 1).padStart(2, "0")}`;
    const element = document.getElementById(`month-group-${monthStr}`);
    if (element) {
      element.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, [selectedYear, selectedMonth, showDatePicker]);

  const today = useMemo(() => toLocalDate(new Date()), []);

  const allTransactions = transactions;

  // Shared filters: search, amount, category
  const applySharedFilters = (txs: Transaction[]) => {
    let result = txs;

    if (filters.searchText) {
      const search = filters.searchText.toLowerCase();
      result = result.filter((tx) =>
        tx.title?.toLowerCase().includes(search),
      );
    }

    if (filters.amountMin) {
      const min = parseFloat(filters.amountMin);
      if (!isNaN(min)) result = result.filter((tx) => tx.amount >= min);
    }

    if (filters.amountMax) {
      const max = parseFloat(filters.amountMax);
      if (!isNaN(max)) result = result.filter((tx) => tx.amount <= max);
    }

    if (filters.selectedCategories.size > 0) {
      result = result.filter((tx) =>
        filters.selectedCategories.has(tx.category),
      );
    }

    return result;
  };

  // Apply all filters to transactions
  const filteredTransactions = useMemo(() => {
    let result = applySharedFilters(allTransactions);

    // Apply time period filter to ALL transactions
    if (filters.timePeriod !== "none") {
      if (filters.timePeriod === "custom" && filters.dateFrom && filters.dateTo) {
        result = result.filter((tx) => {
          const date = tx.date.substring(0, 10);
          return date >= filters.dateFrom && date <= filters.dateTo;
        });
      } else if (filters.timePeriod !== "custom") {
        const days = parseInt(filters.timePeriod);
        const cutoff = new Date();
        cutoff.setDate(cutoff.getDate() - days);
        const cutoffStr = toLocalDate(cutoff);
        result = result.filter((tx) => {
          const date = tx.date.substring(0, 10);
          return date >= cutoffStr && date <= today;
        });
      }
    }

    return result;
  }, [allTransactions, filters, today]);

  // Group all transactions by month
  const allGroups = useMemo(
    () => groupTransactionsByMonth(filteredTransactions),
    [filteredTransactions],
  );

  // Separate groups into past and future for display purposes only
  const { pastGroups, futureGroups } = useMemo(() => {
    const past: typeof allGroups = [];
    const future: typeof allGroups = [];
    const currentMonthKey = today.substring(0, 7); // YYYY-MM format
    
    const [currentYear, currentMonth] = currentMonthKey.split("-").map(Number);
    const currentMonthIndex = currentYear * 12 + currentMonth;

    allGroups.forEach(group => {
      // Current month always goes to "past" section (visible by default)
      // Only fully future months go to the collapsible "future" section
      if (group.key === currentMonthKey) {
        past.push(group);
      } else if (group.transactions.some(tx => tx.date.substring(0, 10) > today)) {
        const [year, month] = group.key.split("-").map(Number);
        const monthDistance = year * 12 + month - currentMonthIndex;
        if (monthDistance <= 3) future.push(group);
      } else {
        past.push(group);
      }
    });
    
    return { pastGroups: past, futureGroups: future };
  }, [allGroups, today]);

  // Available months for filter (from all transactions)
  const availableMonths = useMemo(() => {
    const months = new Set<string>();
    for (const tx of allTransactions) {
      months.add(tx.date.substring(0, 7));
    }
    return [...months].sort((a, b) => b.localeCompare(a));
  }, [allTransactions]);

  // Categories split by type for filter
  const incomeCategories = useMemo(
    () => categories.filter((c) => c.type === "income"),
    [categories],
  );
  // Parse "YYYY-MM-DD" to {year, month (0-based), day}
  const parseDateStr = (d: string) => {
    const [y, m, day] = d.split("-").map(Number);
    return { year: y, month: m - 1, day };
  };

  // Format {year, month (0-based), day} to "YYYY-MM-DD"
  const toDateStr = (year: number, month: number, day: number) =>
    `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;

  const dateFromParts = parseDateStr(filters.dateFrom);
  const dateToParts = parseDateStr(filters.dateTo);

  const timePeriodOptions: { value: TimePeriod; label: string }[] = [
    { value: "none", label: t("no_time_period") },
    { value: "30", label: t("last_30_days") },
    { value: "90", label: t("last_90_days") },
    { value: "180", label: t("last_180_days") },
    { value: "custom", label: t("custom_period") },
  ];

  const timePeriodLabel = timePeriodOptions.find(
    (o) => o.value === filters.timePeriod,
  )?.label;

  const expenseCategories = useMemo(
    () => categories.filter((c) => c.type === "expense"),
    [categories],
  );

  const toggleCategory = (categoryId: string) => {
    setFilters((f) => {
      const next = new Set(f.selectedCategories);
      if (next.has(categoryId)) {
        next.delete(categoryId);
      } else {
        next.add(categoryId);
      }
      return { ...f, selectedCategories: next };
    });
  };

  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (filters.searchText) count++;
    if (filters.timePeriod !== "none") count++;
    if (filters.amountMin) count++;
    if (filters.amountMax) count++;
    if (filters.categoryType !== "all") count++;
    if (filters.selectedCategories.size > 0) count++;
    return count;
  }, [filters]);

  const amountRangeError = useMemo(() => {
    if (!filters.amountMin || !filters.amountMax) return false;
    const min = parseFloat(filters.amountMin);
    const max = parseFloat(filters.amountMax);
    return !isNaN(min) && !isNaN(max) && min > max;
  }, [filters.amountMin, filters.amountMax]);

  const dateRangeError = useMemo(() => {
    if (filters.timePeriod !== "custom") return false;
    return filters.dateFrom > filters.dateTo;
  }, [filters.timePeriod, filters.dateFrom, filters.dateTo]);

  const hasValidationErrors = amountRangeError || dateRangeError;

  const getCategoryForTransaction = (categoryId: string) => {
    return categories.find((c) => c.id === categoryId);
  };

  const formatMonthKey = (key: string) => {
    const [year, month] = key.split("-").map(Number);
    return `${getMonthName(month - 1, t)} ${year}`;
  };

  // Render a month group (reused for past and future)
  const renderMonthGroup = (group: (typeof pastGroups)[number]) => (
    <div key={group.key} className="mb-3 scroll-mt-20">
      <div className="rounded-xl overflow-hidden bg-white dark:bg-[#1A2124] border border-dotted border-[#3A464F]/40 dark:border-white/40 shadow-sm">
        {group.transactions.map((tx) => {
          const category = getCategoryForTransaction(tx.category);
          const displayTitle = tx.title
            || (category ? translateCategoryLabel(t, category.name, category.isDefault ?? false) : null)
            || (tx.type === "income" ? t("new_income") : t("new_expense"));
          
          // Check if this is a recurring transaction in the future only
          const isPending = tx.date.substring(0, 10) > today;
          const isRecurring = (tx.id.startsWith('recurring-') || tx.isRecurring) && isPending;
          
          return (
            <div
              key={tx.id}
              data-testid="transaction-item"
              className="grid grid-cols-[36px_minmax(0,1fr)_90px_28px] items-center gap-2 px-3 py-3 sm:gap-3 sm:px-4 border-b border-border/30 last:border-b-0 cursor-pointer hover:bg-muted/30 active:bg-muted/50 transition-colors"
              onClick={() => setEditingTransaction(tx)}
            >
              <CategoryAvatar
                categoryKey={category?.name || "general"}
                icon={category?.icon}
                size={36}
              />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-black dark:text-white truncate">
                  {displayTitle}
                </p>
                <p className="min-w-0 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-gray-500 dark:text-white/50">
                  <span>{formatDate(tx.date)}</span>
                  {isRecurring && (
                    <span className="basis-full flex items-center text-muted-foreground dark:text-slate-400 font-medium">
                      <span>
                        {t("recurring")}
                      </span>
                    </span>
                  )}
                  {isPending && !isRecurring && (
                    <span className="basis-full flex items-center text-muted-foreground dark:text-slate-400 font-medium">
                      <span>
                        {t("pending")}
                      </span>
                    </span>
                  )}
                </p>
              </div>
              <p
                className={cn(
                  "w-[90px] text-right text-sm font-semibold whitespace-nowrap",
                  tx.type === "income"
                    ? "text-budget-green"
                    : "text-budget-red",
                )}
              >
                {tx.type === "expense" ? "-" : ""}
                {formatCurrency(tx.amount)}
              </p>
              {!isRecurring ? (
                <button
                  onClick={(e) => { e.stopPropagation(); setDeletingTxId(tx.id); }}
                  className="h-7 w-7 rounded-md p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 transition-colors"
                  aria-label={t("delete")}
                  data-testid="transaction-delete-button"
                >
                  <X className="h-4 w-4" />
                </button>
              ) : (
                <div className="h-7 w-7 p-1.5" aria-hidden="true" />
              )}            </div>
          );
        })}
        {/* Monthly sum footer */}
        <div className="relative grid items-center gap-2 px-3 py-3 sm:gap-3 sm:px-4" style={{ gridTemplateColumns: "minmax(0, 1fr) 90px 28px" }}>
          <span className="absolute top-0 left-2.5 right-2.5 h-px bg-border/70 dark:bg-white/30" aria-hidden="true" />
          <p className="text-sm font-bold text-black dark:text-white">
            {t("monthly_sum", {
              month: getMonthName(group.month, t),
              year: group.year,
            })}
          </p>
          <p
            className={cn(
              "text-right text-sm font-bold",
              group.net >= 0 ? "text-budget-green" : "text-budget-red",
            )}
          >
            {formatCurrency(group.net)}
          </p>
          <span aria-hidden="true" />
        </div>
      </div>
    </div>
  );

  const content = (
    <div className="flex h-full min-h-0 flex-col bg-white dark:bg-budget-dark">
      <main className="flex-1 min-h-0 overflow-y-auto px-2 pb-28 bg-white dark:bg-budget-dark sm:px-5">
        {/* Header with back arrow and filter */}
        <div className="sticky top-0 z-[20] -mx-2 shadow-sm bg-budget-header ios-header-safe-area sm:-mx-5">
          <div className="flex items-center justify-between px-5 py-4 border-b border-white/10">
            <div className="flex-1 flex items-center gap-2">
              {onClose && (
                <button
                  onClick={onClose}
                  className="p-1 rounded-full hover:opacity-70 transition-opacity"
                  data-testid="balance-back-button"
                >
                  <ArrowLeft className="w-5 h-5 text-white" strokeWidth={2.5} />
                </button>
              )}
              <h1 className="text-white text-xl font-bold">
                {t("bilanz")}
              </h1>
            </div>

            <button
              onClick={() => setFilterOpen(true)}
              className="relative p-2 rounded-full hover:opacity-70 transition-opacity"
              data-testid="bilanz-filter-button"
            >
              <Filter className="w-5 h-5 text-white" strokeWidth={2.5} />
              {activeFilterCount > 0 && (
                <span className="absolute -top-1 -right-1 w-5 h-5 bg-budget-blue text-white text-[10px] font-bold rounded-full flex items-center justify-center">
                  {activeFilterCount}
                </span>
              )}
            </button>
          </div>
        </div>

        {/* Future transactions section */}
        {futureGroups.length > 0 && (
          <>
            {futureExpanded && (
              <div className="mb-2 pt-2">
                {futureGroups.map(renderMonthGroup)}
              </div>
            )}
            <div className="mb-1">
              <button
                onClick={() => setFutureExpanded(!futureExpanded)}
                className="w-full flex items-center justify-between py-1 text-left"
                data-testid="future-transactions-toggle"
              >
                <span className="text-sm text-black/60 dark:text-white/60">
                  {t("future_transactions_header")}
                </span>
                <ChevronDown
                  className={cn(
                    "w-5 h-5 text-black/60 dark:text-white/60 transition-transform duration-300",
                    futureExpanded && "rotate-180",
                  )}
                />
              </button>
            </div>
          </>
        )}

        {/* Current and historical transactions start below the subtle legacy-style divider. */}
        {pastGroups.length > 0 ? (
          <div className={cn(futureGroups.length > 0 && "border-t border-white/15 pt-2")}>
            {pastGroups.map(renderMonthGroup)}
          </div>
        ) : futureGroups.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-black/50 dark:text-white/50">
              {t("no_transactions_found")}
            </p>
          </div>
        ) : null}
      </main>

      {/* Edit Transaction Drawer */}
      <Drawer
        open={!!editingTransaction}
        onOpenChange={(open) => !open && setEditingTransaction(null)}
      >
        <DrawerContent>
          <DrawerHeader>
            <DrawerTitle className="text-black dark:text-white">
              {editingTransaction?.type === "income"
                ? t("edit_income")
                : t("edit_expense")}
            </DrawerTitle>
            <DrawerDescription className="sr-only">
              {t("edit_transaction_description", "Form to edit this transaction")}
            </DrawerDescription>
          </DrawerHeader>
          <div className="px-4 pb-4 overflow-y-auto flex-1">
            {editingTransaction && (
              <TransactionForm
                type={editingTransaction.type}
                onSave={() => setEditingTransaction(null)}
                onCancel={() => setEditingTransaction(null)}
                editTransaction={editingTransaction}
              />
            )}
          </div>
        </DrawerContent>
      </Drawer>

      {/* Filter Drawer */}
      <Drawer open={filterOpen} onOpenChange={setFilterOpen}>
        <DrawerContent>
          <DrawerHeader>
            <DrawerTitle className="text-black dark:text-white">{t("filter_transactions")}</DrawerTitle>
            <DrawerDescription className="sr-only">
              {t("filter_transactions")}
            </DrawerDescription>
          </DrawerHeader>
          <div className="px-4 pb-4 overflow-y-auto space-y-5 flex-1">
            {/* Search input */}
            <input
              type="text"
              placeholder={t("search") || "Search..."}
              value={filters.searchText}
              onChange={(e) =>
                setFilters((f) => ({ ...f, searchText: e.target.value }))
              }
              className="w-full px-4 py-2.5 rounded-lg border border-black/10 dark:border-white/10 bg-white dark:bg-white/10 text-foreground text-sm placeholder:text-muted-foreground shadow-sm focus:outline-none focus:ring-2 focus:ring-budget-blue"
            />

            {/* Category toggle switches + chips */}
            <div>
              <p className="text-sm font-semibold text-foreground mb-3 text-center">
                {t("all_categories")}
              </p>
              <div className="space-y-3 mb-4">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-foreground">{t("all_categories")}</span>
                  <Switch
                    checked={[...incomeCategories, ...expenseCategories].length > 0 && [...incomeCategories, ...expenseCategories].every((c) => filters.selectedCategories.has(c.id))}
                    onCheckedChange={(checked) => {
                      setFilters((f) => {
                        const next = new Set<string>();
                        if (checked) {
                          [...incomeCategories, ...expenseCategories].forEach((c) => next.add(c.id));
                        }
                        return { ...f, categoryType: "all", selectedCategories: next };
                      });
                    }}
                  />
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-foreground">{t("all_income")}</span>
                  <Switch
                    checked={incomeCategories.length > 0 && incomeCategories.every((c) => filters.selectedCategories.has(c.id))}
                    onCheckedChange={(checked) => {
                      setFilters((f) => {
                        const next = new Set(f.selectedCategories);
                        incomeCategories.forEach((c) => checked ? next.add(c.id) : next.delete(c.id));
                        return { ...f, categoryType: "all", selectedCategories: next };
                      });
                    }}
                  />
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-foreground">{t("all_expenses")}</span>
                  <Switch
                    checked={expenseCategories.length > 0 && expenseCategories.every((c) => filters.selectedCategories.has(c.id))}
                    onCheckedChange={(checked) => {
                      setFilters((f) => {
                        const next = new Set(f.selectedCategories);
                        expenseCategories.forEach((c) => checked ? next.add(c.id) : next.delete(c.id));
                        return { ...f, categoryType: "all", selectedCategories: next };
                      });
                    }}
                  />
                </div>
              </div>
            </div>

            {/* Amount range */}
            <div>
              <p className="text-sm font-semibold text-foreground mb-2">
                {t("amount_from")} / {t("amount_to")}
              </p>
              <div className="grid grid-cols-2 gap-3">
                <input
                  type="number"
                  placeholder={t("amount_from")}
                  value={filters.amountMin}
                  onChange={(e) =>
                    setFilters((f) => ({ ...f, amountMin: e.target.value }))
                  }
                  className={cn(
                    "w-full px-4 py-2.5 rounded-lg border bg-white dark:bg-white/10 text-foreground text-sm placeholder:text-muted-foreground shadow-sm focus:outline-none focus:ring-2 focus:ring-budget-blue",
                    amountRangeError ? "border-budget-red" : "border-black/10 dark:border-white/10"
                  )}
                />
                <input
                  type="number"
                  placeholder={t("amount_to")}
                  value={filters.amountMax}
                  onChange={(e) =>
                    setFilters((f) => ({ ...f, amountMax: e.target.value }))
                  }
                  className={cn(
                    "w-full px-4 py-2.5 rounded-lg border bg-white dark:bg-white/10 text-foreground text-sm placeholder:text-muted-foreground shadow-sm focus:outline-none focus:ring-2 focus:ring-budget-blue",
                    amountRangeError ? "border-budget-red" : "border-black/10 dark:border-white/10"
                  )}
                />
              </div>
              {amountRangeError && (
                <p className="text-budget-red text-xs mt-1">{t("filter_amount_range_error")}</p>
              )}
            </div>

            {/* Time period dropdown */}
            <div>
              <p className="text-sm font-semibold text-foreground mb-2">
                {t("time_period")}
              </p>
              <div ref={timePeriodRef} className="relative">
                <button
                  type="button"
                  onClick={() => setTimePeriodOpen(!timePeriodOpen)}
                  className="w-full flex items-center justify-between px-4 py-2.5 rounded-lg border border-black/10 dark:border-white/10 bg-white dark:bg-white/10 text-foreground text-sm shadow-sm"
                >
                  <span>{timePeriodLabel}</span>
                  <ChevronDown className={cn("w-4 h-4 text-muted-foreground transition-transform", timePeriodOpen && "rotate-180")} />
                </button>
                {timePeriodOpen && (
                  <div className="absolute z-50 mt-1 w-full rounded-lg border border-black/10 dark:border-white/10 bg-white dark:bg-[#1A2124] shadow-lg overflow-hidden">
                    {timePeriodOptions.map((opt) => (
                      <button
                        key={opt.value}
                        onClick={() => {
                          setFilters((f) => ({
                            ...f,
                            timePeriod: opt.value,
                          }));
                          setTimePeriodOpen(false);
                        }}
                        className={cn(
                          "w-full flex items-center justify-between px-4 py-2.5 text-sm text-left transition-colors hover:bg-gray-50 dark:hover:bg-white/10",
                          filters.timePeriod === opt.value
                            ? "text-budget-blue font-medium"
                            : "text-foreground",
                        )}
                      >
                        <span>{opt.label}</span>
                        {filters.timePeriod === opt.value && (
                          <Check className="w-4 h-4 text-budget-blue" />
                        )}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Date range shown only when custom is selected */}
              {filters.timePeriod === "custom" && (
                <div className="mt-3">
                  <div className="grid grid-cols-2 gap-3">
                    <button
                      type="button"
                      onClick={() => setDateFromPickerOpen(true)}
                      className={cn(
                        "w-full px-3 py-2.5 rounded-lg border bg-white dark:bg-white/10 text-foreground text-sm text-left shadow-sm",
                        dateRangeError ? "border-budget-red" : "border-black/10 dark:border-white/10"
                      )}
                    >
                      {formatDate(filters.dateFrom)}
                    </button>
                    <button
                      type="button"
                      onClick={() => setDateToPickerOpen(true)}
                      className={cn(
                        "w-full px-3 py-2.5 rounded-lg border bg-white dark:bg-white/10 text-foreground text-sm text-left shadow-sm",
                        dateRangeError ? "border-budget-red" : "border-black/10 dark:border-white/10"
                      )}
                    >
                      {formatDate(filters.dateTo)}
                    </button>
                  </div>
                  {dateRangeError && (
                    <p className="text-budget-red text-xs mt-1">{t("filter_date_range_error")}</p>
                  )}

                  <DatePickerDialog
                    open={dateFromPickerOpen}
                    onOpenChange={setDateFromPickerOpen}
                    selectedYear={dateFromParts.year}
                    selectedMonth={dateFromParts.month}
                    selectedDay={dateFromParts.day}
                    onYearChange={() => {}}
                    onMonthChange={() => {}}
                    onConfirm={(year, month, day) => {
                      const d = day ?? dateFromParts.day;
                      setFilters((f) => ({ ...f, dateFrom: toDateStr(year, month, d) }));
                    }}
                  />

                  <DatePickerDialog
                    open={dateToPickerOpen}
                    onOpenChange={setDateToPickerOpen}
                    selectedYear={dateToParts.year}
                    selectedMonth={dateToParts.month}
                    selectedDay={dateToParts.day}
                    onYearChange={() => {}}
                    onMonthChange={() => {}}
                    onConfirm={(year, month, day) => {
                      const d = day ?? dateToParts.day;
                      setFilters((f) => ({ ...f, dateTo: toDateStr(year, month, d) }));
                    }}
                  />
                </div>
              )}
            </div>

            {/* Individual category selection using CategoryChip */}
            {incomeCategories.length > 0 && (
              <div>
                <p className="text-sm font-semibold text-foreground mb-2">
                  {t("income_categories")}
                </p>
                <div className="grid grid-cols-3 gap-3">
                  {incomeCategories.map((cat) => (
                    <CategoryChip
                      key={cat.id}
                      icon={cat.icon}
                      categoryKey={cat.name}
                      label={translateCategoryLabel(t, cat.name, cat.isDefault ?? false)}
                      color={CategoryService.resolveColor(cat)}
                      selected={filters.selectedCategories.has(cat.id)}
                      onClick={() => toggleCategory(cat.id)}
                    />
                  ))}
                </div>
              </div>
            )}

            {expenseCategories.length > 0 && (
              <div>
                <p className="text-sm font-semibold text-foreground mb-2">
                  {t("expense_categories")}
                </p>
                <div className="grid grid-cols-3 gap-3">
                  {expenseCategories.map((cat) => (
                    <CategoryChip
                      key={cat.id}
                      icon={cat.icon}
                      categoryKey={cat.name}
                      label={translateCategoryLabel(t, cat.name, cat.isDefault ?? false)}
                      color={CategoryService.resolveColor(cat)}
                      selected={filters.selectedCategories.has(cat.id)}
                      onClick={() => toggleCategory(cat.id)}
                    />
                  ))}
                </div>
              </div>
            )}

            {/* Reset + Close */}
            <div className="flex gap-3 pt-2">
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => setFilters(getDefaultFilters())}
              >
                {t("reset_filters")}
              </Button>
              <Button
                className={cn(
                  "flex-1 text-white",
                  hasValidationErrors
                    ? "bg-budget-blue/50 cursor-not-allowed"
                    : "bg-budget-blue hover:bg-budget-blue/90"
                )}
                onClick={() => !hasValidationErrors && setFilterOpen(false)}
              >
                {t("save")}
              </Button>
            </div>
          </div>
        </DrawerContent>
      </Drawer>

      {/* Delete transaction confirmation */}
      <AlertDialog open={!!deletingTxId} onOpenChange={() => setDeletingTxId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="text-black dark:text-white">{t("delete")}</AlertDialogTitle>
            <AlertDialogDescription className="text-gray-500 dark:text-gray-400">{t("delete_confirmation")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-row gap-3 sm:gap-3">
            <AlertDialogCancel className="flex-1 rounded-[8px] mt-0 bg-gray-100 dark:bg-white/10 text-black dark:text-white border-gray-200 dark:border-white/10 hover:bg-gray-200 dark:hover:bg-white/20">{t("cancel")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => { if (deletingTxId) deleteTransaction(deletingTxId); setDeletingTxId(null); }}
              className="flex-1 rounded-[8px] bg-budget-red hover:bg-budget-red/90"
              data-testid="transaction-delete-confirm-button"
            >
              {t("delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      {/* Date Picker for Month Jump */}
      <DatePickerDialog
        open={showDatePicker}
        onOpenChange={setShowDatePicker}
        selectedYear={selectedYear}
        selectedMonth={selectedMonth}
        onYearChange={setSelectedYear}
        onMonthChange={setSelectedMonth}
      />
    </div>
  );

  if (onClose) return content;
  return <Layout>{content}</Layout>;
};

export default Balance;
