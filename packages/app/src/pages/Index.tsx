import { useState, useMemo, lazy, Suspense, type ReactNode } from "react";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerDescription,
  DrawerTrigger,
} from "@/components/ui/drawer";
import Layout from "@/components/Layout";
import { useBudget } from "@/contexts/BudgetContext";
import {formatCurrency, formatCurrencyShort} from "@/lib/formatters";
import TransactionForm from "@/components/TransactionForm";
import { useTranslation } from "react-i18next";
import {
  DashboardBackground,
  IncomeIcon,
  ExpenseIcon,
} from "@/components/ui/figma-svgs";
import { DatePickerDialog } from "@/components/DatePickerDialog";
import {ChevronRight} from "lucide-react";

const Balance = lazy(() => import("./Balance"));

// UI Constants - could be moved to a config file
const UI_CONSTANTS = {
  TRANSACTION_LIMIT: 5,
  BUTTON_SIZE: "w-16 h-16",
  ICON_SIZES: {
    SURFACE: { width: 60, height: 60 },
    MINUS: { width: 60, height: 60 },
  },
  TEXT_LENGTH_THRESHOLDS: { LARGE: 10, MEDIUM: 8 },
} as const;

// Calendar Icon Component
const CalendarIcon = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
    <path
      d="M16 3.55556V2.88889C16 1.2963 14.7037 0 13.1111 0H2.88889C1.2963 0 0 1.2963 0 2.88889V3.55556H16Z"
      fill="currentColor"
    />
    <path
      d="M0 4.88892V13.1111C0 14.7037 1.2963 16 2.88889 16H13.1111C14.7037 16 16 14.7037 16 13.1111V4.88892H0ZM4.22222 13.3334C3.6088 13.3334 3.11111 12.8357 3.11111 12.2222C3.11111 11.6088 3.6088 11.1111 4.22222 11.1111C4.83565 11.1111 5.33333 11.6088 5.33333 12.2222C5.33333 12.8357 4.83565 13.3334 4.22222 13.3334ZM4.22222 9.33336C3.6088 9.33336 3.11111 8.83568 3.11111 8.22225C3.11111 7.60882 3.6088 7.11114 4.22222 7.11114C4.83565 7.11114 5.33333 7.60882 5.33333 8.22225C5.33333 8.83568 4.83565 9.33336 4.22222 9.33336ZM8 13.3334C7.38657 13.3334 6.88889 12.8357 6.88889 12.2222C6.88889 11.6088 7.38657 11.1111 8 11.1111C8.61343 11.1111 9.11111 11.6088 9.11111 12.2222C9.11111 12.8357 8.61343 13.3334 8 13.3334ZM8 9.33336C7.38657 9.33336 6.88889 8.83568 6.88889 8.22225C6.88889 7.60882 7.38657 7.11114 8 7.11114C8.61343 7.11114 9.11111 7.60882 9.11111 8.22225C9.11111 8.83568 8.61343 9.33336 8 9.33336ZM11.7778 9.33336C11.1644 9.33336 10.6667 8.83568 10.6667 8.22225C10.6667 7.60882 11.1644 7.11114 11.7778 7.11114C12.3912 7.11114 12.8889 7.60882 12.8889 8.22225C12.8889 8.83568 12.3912 9.33336 11.7778 9.33336Z"
      fill="currentColor"
    />
  </svg>
);

const SummaryValue = ({
  label,
  value,
  positive = false,
  negative = false,
  bold = false,
  large = false,
  testId,
}: {
  label: ReactNode;
  value: number;
  positive?: boolean;
  negative?: boolean;
  bold?: boolean;
  large?: boolean;
  testId?: string;
}) => (
  <div className="flex items-center justify-between gap-4 min-w-0">
    <span className={`min-w-0 flex-1 text-black dark:text-white ${bold ? "font-bold" : "font-medium"}`}>
      {label}
    </span>
    <span
      className={`shrink-0 ${bold ? "font-bold" : "font-semibold"} ${large ? "text-2xl" : "text-[19px]"} ${positive ? "text-budget-green" : negative ? "text-budget-red" : value < 0 ? "text-budget-red" : "text-budget-green"}`}
      style={{ color: positive || (!negative && value >= 0) ? "#1DB155" : "#E33B80" }}
      data-testid={testId}
    >
      {value < 0 ? "-" : ""}{formatCurrency(Math.abs(value))}
    </span>
  </div>
);

const Index = () => {
  const { transactions, currentAccount } = useBudget();
  const { t, i18n } = useTranslation();
  const [balanceOpen, setBalanceOpen] = useState(false);
  const [incomeDrawerOpen, setIncomeDrawerOpen] = useState(false);
  const [expenseDrawerOpen, setExpenseDrawerOpen] = useState(false);

  // Date picker state
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth());
  const [selectedDay, setSelectedDay] = useState(new Date().getDate());
  const [showDatePicker, setShowDatePicker] = useState(false);

  // Filter transactions for selected month/year using string comparison to avoid timezone issues
  const cutoffDate = useMemo(
    () => `${selectedYear}-${String(selectedMonth + 1).padStart(2, "0")}-${String(selectedDay).padStart(2, "0")}`,
    [selectedYear, selectedMonth, selectedDay],
  );

  const filteredTransactions = useMemo(() => transactions.filter((transaction) => {
    const month = `${selectedYear}-${String(selectedMonth + 1).padStart(2, "0")}`;
    return transaction.date.startsWith(month);
  }), [transactions, selectedYear, selectedMonth]);

  // Normalize the current date to start of day (memoized to avoid recreating on each render)
  const now = useMemo(() => {
    const date = new Date();
    date.setHours(0, 0, 0, 0);
    return date;
  }, []);

  const todayDate = useMemo(() => {
    const date = new Date(now);
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
  }, [now]);
  const selectedMonthKey = `${selectedYear}-${String(selectedMonth + 1).padStart(2, "0")}`;
  const currentMonthKey = todayDate.substring(0, 7);
  const selectedMonthRelation = selectedMonthKey.localeCompare(currentMonthKey);

  // Separate current transactions from pending (future) transactions
  const currentTransactions = useMemo(() => {
    return filteredTransactions.filter((transaction) => {
      const date = transaction.date.substring(0, 10);
      if (selectedMonthRelation < 0) return true;
      return date <= cutoffDate;
    });
  }, [filteredTransactions, cutoffDate, selectedMonthRelation]);

  const pendingTransactions = useMemo(() => {
    // Pending transactions are not restricted to the selected month. A future
    // occurrence must remain visible and included in My Budget while browsing
    // the current month, and selecting a later month should not hide it.
    const actualPending = transactions.filter((transaction) => {
      const date = transaction.date.substring(0, 10);
      if (selectedMonthRelation < 0) return false;
      return date > cutoffDate;
    });
    
    const combined = actualPending;

    return combined.sort((a, b) => {
        const dateA = new Date(a.date);
        const dateB = new Date(b.date);
        dateA.setHours(0, 0, 0, 0);
        dateB.setHours(0, 0, 0, 0);
        
        const dateDiff = dateB.getTime() - dateA.getTime();
        if (dateDiff !== 0) return dateDiff;
        
        if (a.createdAt && b.createdAt) {
          return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
        }
        return b.id.localeCompare(a.id);
      });
  }, [transactions, cutoffDate, selectedMonthRelation]);

  // Forecast calculations use every future transaction, but the visible
  // pending list follows the month selected in the calendar.
  const visiblePendingTransactions = useMemo(
    () => pendingTransactions.filter((transaction) => transaction.date.startsWith(selectedMonthKey)),
    [pendingTransactions, selectedMonthKey],
  );
  // Calculate totals based on current transactions only (exclude pending)
  const totalIncome = useMemo(() => {
    return currentTransactions
      .filter((t) => t.type === "income")
      .reduce((sum, transaction) => sum + transaction.amount, 0);
  }, [currentTransactions]);

  const totalExpense = useMemo(() => {
    return currentTransactions
      .filter((t) => t.type === "expense")
      .reduce((sum, transaction) => sum + transaction.amount, 0);
  }, [currentTransactions]);

  const balance = useMemo(() => {
    return totalIncome - totalExpense;
  }, [totalIncome, totalExpense]);

  // Values shown in the legacy app's second overview card. The carried-over
  // amount contains transactions before the selected month; planned amounts
  // contain future real transactions and recurring projections for that month.
  const monthStart = useMemo(
    () => `${selectedYear}-${String(selectedMonth + 1).padStart(2, "0")}-01`,
    [selectedYear, selectedMonth],
  );

  const transferredBalance = useMemo(() => {
    // Carry Over is the complete balance at the end of the previous month.
    // It must be based on the selected month boundary, not today's pending
    // classification: by the end of a previous month all of its entries count.
    return transactions
      .filter((transaction) => transaction.date.substring(0, 10) < monthStart)
      .reduce((sum, transaction) => sum + (transaction.type === "income" ? transaction.amount : -transaction.amount), 0);
  }, [transactions, monthStart]);

  const plannedTransactionsForBudget = useMemo(() => {
    const plannedTransactions = visiblePendingTransactions;

    // Legacy keeps one nextRepeatingDate per recurring item. Keep only the
    // earliest virtual occurrence for each item so recurring values are not
    // counted more than once in the planned budget.
    const nextRecurringByItem = new Map<string, typeof plannedTransactions[number]>();
    for (const transaction of plannedTransactions) {
      if (!transaction.id.startsWith("recurring-")) continue;
      const recurringItemId = transaction.id.slice("recurring-".length, -11);
      const existing = nextRecurringByItem.get(recurringItemId);
      if (!existing || transaction.date < existing.date) {
        nextRecurringByItem.set(recurringItemId, transaction);
      }
    }

    return [
      ...plannedTransactions.filter((transaction) => !transaction.id.startsWith("recurring-")),
      ...nextRecurringByItem.values(),
    ];
  }, [visiblePendingTransactions]);

  const plannedIncome = useMemo(() => {
    return plannedTransactionsForBudget
      .filter((transaction) => transaction.type === "income")
      .reduce((sum, transaction) => sum + transaction.amount, 0);
  }, [plannedTransactionsForBudget]);

  const plannedExpense = useMemo(() => {
    return plannedTransactionsForBudget
      .filter((transaction) => transaction.type === "expense")
      .reduce((sum, transaction) => sum + transaction.amount, 0);
  }, [plannedTransactionsForBudget]);

  const monthBudget = useMemo(
    () => balance + transferredBalance + plannedIncome - plannedExpense,
    [balance, transferredBalance, plannedIncome, plannedExpense],
  );

  const cumulativeBudget = monthBudget;

  const formatMonthDate = (): string => {
    const locale = i18n.language === "en" ? "en-US" : "de-DE";
    return new Date(selectedYear, selectedMonth).toLocaleDateString(locale, {
      year: "numeric",
      month: "long",
    });
  };

  const formatBalanceDate = (): string => {
    const locale = i18n.language === "en" ? "en-GB" : "de-DE";
    return new Date(selectedYear, selectedMonth, selectedDay).toLocaleDateString(locale, {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    });
  };

  const formatCarryOverMonth = (): string => {
    const locale = i18n.language === "en" ? "en-US" : "de-DE";
    const previousMonth = new Date(selectedYear, selectedMonth - 1, 1);
    return previousMonth.toLocaleDateString(locale, {
      month: "long",
      year: "numeric",
    });
  };

  return (
    <Layout>
      <div className="flex min-h-full flex-col">
      {/* Meine Bilanz (Summary) Card */}
      <div className="p-4 pt-6">
        <div className="mb-3 flex justify-end">
          <button
            type="button"
            onClick={() => setShowDatePicker(true)}
            className="flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground dark:text-gray-400 dark:hover:text-white"
            data-testid="main-date-picker-button"
          >
            <CalendarIcon />
            <span>{formatMonthDate()}</span>
          </button>
        </div>
        <div
          className="bg-white dark:bg-[#1A2124] p-4 rounded-[6px] cursor-pointer active:opacity-80 transition-opacity border border-dotted border-[#3A464F]/40 dark:border-white/40"
          onClick={() => setBalanceOpen(true)}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              setBalanceOpen(true);
            }
          }}
          role="button"
          tabIndex={0}
          style={{
            boxShadow: "1px 1px 7px rgba(73.03, 95.55, 143, 0.12)",
          }}
          data-testid="balance-card-link"
        >
          <h2 className="sr-only" data-testid="balance-header">{t("sum", "Summe")}</h2>
          <div className="space-y-4">
            <SummaryValue label={t("income", "Einnahmen")} value={totalIncome} positive testId="total-income" />
            <SummaryValue label={t("expenses", "Ausgaben")} value={-totalExpense} negative testId="total-expense" />
            <div className="border-t border-gray-200 dark:border-white/10 pt-3">
              <SummaryValue label={<span className="inline-flex max-w-full flex-wrap items-baseline gap-x-2 gap-y-0.5"><span className="whitespace-nowrap font-bold">{t("sum", "Summe")}</span><span className="whitespace-nowrap text-sm font-normal text-muted-foreground dark:text-gray-400">{formatBalanceDate()}</span></span>} value={balance} bold large testId="total-balance" />
            </div>
          </div>
        </div>
      </div>

      {/* Planned values and budget, matching the legacy overview structure. */}
      <div className="px-4 pt-2 pb-4">
        <div className="min-h-[160px] bg-white dark:bg-[#1A2124] p-4 rounded-[6px] border border-dotted border-[#3A464F]/40 dark:border-white/40" style={{ boxShadow: "1px 1px 7px rgba(73.03, 95.55, 143, 0.12)" }} data-testid="budget-card">
          <>
          <div className="grid grid-cols-1 gap-4">
            <SummaryValue label={<>{t("carry_over", "Carry Over")} <span className="text-sm font-normal text-muted-foreground dark:text-gray-400">({formatCarryOverMonth()})</span></>} value={transferredBalance} />
            <SummaryValue label={t("pending_income", "Pending Income")} value={plannedIncome} positive />
            <SummaryValue label={t("pending_expenses", "Pending Expenses")} value={-plannedExpense} negative />
          </div>
          <div className="mt-3 border-t border-gray-200 dark:border-white/10 pt-3">
            <SummaryValue label={<>{t("my_budget", "My Budget")} <span className="ml-2 text-sm font-normal text-muted-foreground dark:text-gray-400">{formatMonthDate()}</span></>} value={cumulativeBudget} bold testId="budget-card-value" />
          </div>
          </>
        </div>
      </div>

      {/* Add Transaction Buttons - Bottom Section with Restored Styling */}
      <div className="flex flex-1 px-4 bg-white dark:bg-[#1A2124]">
        <div
          className="action-pocket relative min-h-[260px] flex-1 rounded-lg flex justify-around items-center gap-6 bg-white dark:bg-[#1a2124] border border-black/10 dark:border-white/10 shadow-lg"
          style={{
            borderRadius: "6px",
            boxShadow: "1px 1px 7px rgba(73.03, 95.55, 143, 0.12)",
          }}
        >
          {/* Background SVG Pattern */}
          <DashboardBackground className="absolute inset-0 w-full h-full pointer-events-none" />

          {/* Income Button - Left Side */}
          <Drawer open={incomeDrawerOpen} onOpenChange={setIncomeDrawerOpen}>
            <DrawerTrigger asChild>
              <div
                className="flex-1 flex flex-col items-center gap-1 cursor-pointer z-10"
              >
                <button
                  className={`${UI_CONSTANTS.BUTTON_SIZE} rounded-full flex items-center justify-center transition-transform hover:scale-110 active:scale-95`}
                  data-testid="add-income-button"
                  aria-label={t("add_income", "Einnahme")}
                >
                  <IncomeIcon
                    width={UI_CONSTANTS.ICON_SIZES.SURFACE.width}
                    height={UI_CONSTANTS.ICON_SIZES.SURFACE.height}
                  />
                </button>
                <div className="text-black dark:text-white text-sm font-bold text-center leading-tight max-w-16">
                  {t("add_income", "Einnahme")}
                </div>
              </div>
            </DrawerTrigger>
            <DrawerContent>
              <DrawerHeader>
                <DrawerTitle>{t("new_income")}</DrawerTitle>
                <DrawerDescription className="sr-only">
                  {t(
                    "add_income_description",
                    "Form to add a new income transaction",
                  )}
                </DrawerDescription>
              </DrawerHeader>
              <div className="px-4 pb-4 overflow-y-auto flex-1">
                <TransactionForm
                  type="income"
                  onSave={() => setIncomeDrawerOpen(false)}
                  onCancel={() => setIncomeDrawerOpen(false)}
                />
              </div>
            </DrawerContent>
          </Drawer>

          {/* Expense Button - Right Side */}
          <Drawer open={expenseDrawerOpen} onOpenChange={setExpenseDrawerOpen}>
            <DrawerTrigger asChild>
              <div
                className="flex-1 flex flex-col items-center gap-1 cursor-pointer z-10"
              >
                <button
                  className={`${UI_CONSTANTS.BUTTON_SIZE} rounded-full flex items-center justify-center transition-transform hover:scale-110 active:scale-95`}
                  data-testid="add-expense-button"
                  aria-label={t("add_expense", "Ausgabe")}
                >
                  <ExpenseIcon
                    width={UI_CONSTANTS.ICON_SIZES.MINUS.width}
                    height={UI_CONSTANTS.ICON_SIZES.MINUS.height}
                  />
                </button>
                <div className="text-black dark:text-white text-sm font-bold text-center leading-tight max-w-16 transition-colors">
                  {t("add_expense", "Ausgabe")}
                </div>
              </div>
            </DrawerTrigger>
            <DrawerContent>
              <DrawerHeader>
                <DrawerTitle>{t("new_expense")}</DrawerTitle>
                <DrawerDescription className="sr-only">
                  {t(
                    "add_expense_description",
                    "Form to add a new expense transaction",
                  )}
                </DrawerDescription>
              </DrawerHeader>
              <div className="px-4 pb-4 overflow-y-auto flex-1">
                <TransactionForm
                  type="expense"
                  onSave={() => setExpenseDrawerOpen(false)}
                  onCancel={() => setExpenseDrawerOpen(false)}
                />
              </div>
            </DrawerContent>
          </Drawer>
        </div>
      </div>
      </div>

      {/* Date Picker Dialog */}
      <DatePickerDialog
        open={showDatePicker}
        onOpenChange={setShowDatePicker}
        selectedYear={selectedYear}
        selectedMonth={selectedMonth}
        selectedDay={selectedDay}
        onYearChange={setSelectedYear}
        onMonthChange={setSelectedMonth}
        onDayChange={setSelectedDay}
      />

      {/* Balance slide-in panel */}
      <Drawer open={balanceOpen} onOpenChange={(open) => { if (!open) (document.activeElement as HTMLElement)?.blur(); setBalanceOpen(open); }} direction="right">
        <DrawerContent className="inset-0 h-[100dvh] max-h-none w-full rounded-none border-none bg-budget-dark mt-0 [&>div:first-child]:hidden">
          <DrawerTitle className="sr-only">{t("bilanz")}</DrawerTitle>
          <DrawerDescription className="sr-only">{t("bilanz")}</DrawerDescription>
          <Suspense fallback={<div className="flex items-center justify-center h-full"><span className="text-white/60 text-sm">{t("loading")}</span></div>}>
            <Balance onClose={() => setBalanceOpen(false)} />
          </Suspense>
        </DrawerContent>
      </Drawer>
    </Layout>
  );
};

export default Index;
