import { useState, useMemo, useCallback } from 'react';
import { PieChart, Pie, Cell, ResponsiveContainer } from 'recharts';
import { cn } from "@/lib/utils";
import Layout from '@/components/Layout';
import { useBudget } from '@/contexts/BudgetContext';
import { formatCurrency } from '@/lib/formatters';
import { useTranslation } from 'react-i18next';
import { getIconPath } from '@/lib/category-icons';
import { getCategoryIcon } from '@/components/CategoryAvatar';
import { getLucideIcon } from '@/components/ui/icon-picker';
import { CategoryService, filterExecutedTransactions } from '@budget/core';
import { translateCategoryLabel, getCategoryColor } from '@/lib/categoryHelpers';
import { DatePickerDialog } from '@/components/DatePickerDialog';
import { CategoryAvatar } from '@/components/CategoryAvatar';
import {
  Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerDescription,
} from '@/components/ui/drawer';
import TransactionItem from '@/components/TransactionItem';

// Brand colours — never change between modes (Figma styleguide)
const C = {
  income:  '#1DB155',
  expense: '#E33B80',
  blue:    '#0B75C2',
  header:  '#3A464F',

};

// Donut chart proportions
const DONUT = {
  innerRadius: '62%',
  outerRadius: '88%',
  paddingAngle: 2,
  animationDuration: 700,
} as const;

const MONTH_KEYS = [
  'month_january','month_february','month_march','month_april',
  'month_may','month_june','month_july','month_august',
  'month_september','month_october','month_november','month_december',
] as const;

// ─── Category row ─────────────────────────────────────────────────────────────
interface CatRow {
  id: string; name: string; value: number; icon?: string;
  color: string; type: 'income' | 'expense'; total: number; pct: string;
  isDefault?: boolean;
}

function CategoryRow({ cat, t, onClick }: { cat: CatRow; t: (k: string) => string; onClick: () => void }) {
  const iconPath = getIconPath(cat.icon);
  const lucideNode = getLucideIcon(cat.icon, 22);
  const amtColor = cat.type === 'income' ? C.income : C.expense;
  return (
    <button
      onClick={onClick}
      className="w-full flex items-center gap-3 p-3 rounded-xl mb-2 bg-white dark:bg-white/5 hover:bg-gray-50 dark:hover:bg-white/10 transition-all text-left cursor-pointer border border-black/10 dark:border-white/5 shadow-sm"
    >
      <CategoryAvatar
        categoryKey={cat.name}
        icon={cat.icon}
        size={40}
        color={cat.color}
      />
      <span className="flex-1 text-sm font-medium text-black dark:text-white">
        {translateCategoryLabel(t, cat.name, cat.isDefault ?? false)}
      </span>
      <span className="text-sm font-bold whitespace-nowrap" style={{ color: amtColor }}>
        {formatCurrency(cat.value)} ({cat.pct}%)
      </span>
    </button>
  );
}

const Statistics = () => {
  const { transactions, categories } = useBudget();
  const { t, i18n } = useTranslation();

  const [tab, setTab]                       = useState<'balance' | 'history'>('balance');
  const [year, setYear]                     = useState(new Date().getFullYear());
  const [month, setMonth]                   = useState(new Date().getMonth());
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [period, setPeriod]                 = useState<'monthly' | 'yearly'>('yearly');
  const [historyPeriod, setHistoryPeriod]   = useState<'monthly' | 'yearly'>('monthly');
  const [sliderMonth, setSliderMonth]       = useState(new Date().getMonth());
  const [selectedCat, setSelectedCat]       = useState<CatRow | null>(null);

  const locale = i18n.language === 'de' ? 'de-DE' : 'en-US';

  const yearTx = useMemo(() => {
    const currentDate = new Date();
    return filterExecutedTransactions(
      transactions.filter(tx => tx.date.startsWith(year.toString())),
      currentDate
    );
  }, [transactions, year]);

  // ── Balance tab — respects period (monthly / yearly) ─────────────────
  const balanceTx = useMemo(() =>
    period === 'monthly' ? yearTx.filter(tx => parseInt(tx.date.split('-')[1], 10) - 1 === month) : yearTx,
  [yearTx, period, month]);

  const annualTotals = useMemo(() => {
    const inc = balanceTx.filter(tx => tx.type === 'income').reduce((s, tx) => s + tx.amount, 0);
    const exp = balanceTx.filter(tx => tx.type === 'expense').reduce((s, tx) => s + tx.amount, 0);
    return { inc, exp, bal: inc - exp };
  }, [balanceTx]);

  const pieData = useMemo(() => {
    const { inc, exp } = annualTotals;
    if (inc === 0 && exp === 0) return [{ value: 1, color: C.header }];

    const total = inc + exp;
    // Enforce a minimum visual arc of 3% of total so tiny segments stay visible
    const MIN_PCT = 0.03;
    const minVal = total * MIN_PCT;

    const d: { value: number; color: string }[] = [];
    if (inc > 0) d.push({ value: Math.max(inc, minVal), color: C.income });
    if (exp > 0) d.push({ value: Math.max(exp, minVal), color: C.expense });
    return d;
  }, [annualTotals]);

  const { incomeCats, expenseCats } = useMemo(() => {
    const build = (type: 'income' | 'expense', total: number): CatRow[] =>
      categories
        .filter(c => c.type === type)
        .map(cat => {
          const value = balanceTx
            .filter(tx => tx.type === type && tx.category === cat.id)
            .reduce((s, tx) => s + tx.amount, 0);
          const pct = total > 0 ? ((value / total) * 100).toFixed(2) : '0.00';
          return { id: cat.id, name: cat.name, value, icon: cat.icon, color: CategoryService.resolveColor(cat), type, total, pct, isDefault: cat.isDefault };
        })
        .filter(r => r.value > 0)
        .sort((a, b) => b.value - a.value);
    return { incomeCats: build('income', annualTotals.inc), expenseCats: build('expense', annualTotals.exp) };
  }, [categories, balanceTx, annualTotals]);

  // ── Category drill-down transactions ─────────────────────────────────────
  const categoryTx = useMemo(() => {
    if (!selectedCat) return [];
    return balanceTx
      .filter(tx => tx.category === selectedCat.id)
      .sort((a, b) => b.date.localeCompare(a.date));
  }, [balanceTx, selectedCat]);

  // ── History ───────────────────────────────────────────────────────────────
  const historyTx = useMemo(() =>
    historyPeriod === 'monthly' ? yearTx.filter(tx => tx.date.startsWith(`${year}-${String(month + 1).padStart(2, '0')}`)) : yearTx,
  [yearTx, historyPeriod, month]);

  const historyTotals = useMemo(() => {
    const totalIncome  = historyTx.filter(tx => tx.type === 'income').reduce((s, tx) => s + tx.amount, 0);
    const totalExpense = historyTx.filter(tx => tx.type === 'expense').reduce((s, tx) => s + tx.amount, 0);
    const totalBalance = totalIncome - totalExpense;
    const rawSavingsRate     = totalIncome > 0 ? (totalBalance / totalIncome) * 100 : 0;
    const displaySavingsRate = Math.max(Math.min(rawSavingsRate, 99.9), -99.9);
    return { totalIncome, totalExpense, totalBalance, rawSavingsRate, displaySavingsRate };
  }, [historyTx]);

  const historyAverages = useMemo(() => {
    if (historyPeriod === 'monthly') {
      const yInc = yearTx.filter(tx => tx.type === 'income').reduce((s, tx) => s + tx.amount, 0);
      const yExp = yearTx.filter(tx => tx.type === 'expense').reduce((s, tx) => s + tx.amount, 0);
      return { avgIncome: yInc / 12, avgExpense: yExp / 12 };
    }
    return { avgIncome: historyTotals.totalIncome, avgExpense: historyTotals.totalExpense };
  }, [yearTx, historyPeriod, historyTotals]);

  const historyTopCats = useMemo(() => {
    const build = (type: 'income' | 'expense') =>
      categories.filter(c => c.type === type)
        .map(cat => ({
          name: cat.name, icon: cat.icon, color: CategoryService.resolveColor(cat), type,
          isDefault: cat.isDefault,
          value: historyTx.filter(tx => tx.type === type && tx.category === cat.id).reduce((s, tx) => s + tx.amount, 0),
        }))
        .filter(r => r.value > 0).sort((a, b) => b.value - a.value);
    const top: ReturnType<typeof build> = [];
    const inc = build('income'); const exp = build('expense');
    if (inc.length > 0) top.push(inc[0]);
    if (exp.length > 0) top.push(exp[0]);
    return top;
  }, [categories, historyTx]);

  const chartData = useMemo(() =>
    Array.from({ length: 12 }, (_, i) => {
      const monthFiltered = yearTx.filter(tx => parseInt(tx.date.split('-')[1], 10) - 1 === i);
      return {
        income:  monthFiltered.filter(tx => tx.type === 'income').reduce((s, tx) => s + tx.amount, 0),
        expense: monthFiltered.filter(tx => tx.type === 'expense').reduce((s, tx) => s + tx.amount, 0),
      };
    }),
  [yearTx]);

  const maxBar = useMemo(() => Math.max(...chartData.flatMap(d => [d.income, d.expense]), 1), [chartData]);

  const sliderMonthName = new Date(year, sliderMonth, 1).toLocaleDateString(locale, { month: 'long' });
  const handleSlider = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const val = Number(e.target.value);
    setSliderMonth(val);
    // In monthly mode the slider drives the selected month for all stats
    if (historyPeriod === 'monthly') setMonth(val);
  }, [historyPeriod]);

  const formattedDate = useMemo(() => {
    const d = new Date(year, month, 1);
    // In balance tab: show month only when monthly period is active
    if (tab === 'balance') {
      return period === 'monthly' ? d.toLocaleDateString(locale, { month: 'long', year: 'numeric' }) : String(year);
    }
    return historyPeriod === 'monthly' ? d.toLocaleDateString(locale, { month: 'long', year: 'numeric' }) : String(year);
  }, [year, month, period, historyPeriod, tab, locale]);

  return (
    <Layout>
      {/* Page bg always #1A2124 — dark background is the brand identity */}
      <div className="min-h-screen bg-white dark:bg-[#1A2124] transition-colors duration-300 font-sans">

        {/* ── Sticky header ─────────────────────────────────────────────── */}
        <div className="sticky top-0 z-[15] bg-white dark:bg-[#1A2124] border-b border-black/10 dark:border-white/10 transition-colors shadow-sm">
          <div className="max-w-2xl mx-auto h-14 flex items-center px-5">
            <span className="text-black dark:text-white text-lg font-bold">{t('statistics')}</span>
            <div className="ml-auto flex items-center gap-3">
              <button onClick={() => setShowDatePicker(true)}
                      className="p-1 text-black dark:text-white hover:opacity-70 transition-opacity leading-none"
                      aria-label={t('select_date')} data-testid="statistics-date-picker">
                <svg width="20" height="20" viewBox="0 0 16 16" fill="none">
                  <path d="M16 3.55556V2.88889C16 1.2963 14.7037 0 13.1111 0H2.88889C1.2963 0 0 1.2963 0 2.88889V3.55556H16Z" fill="currentColor"/>
                  <path d="M0 4.88892V13.1111C0 14.7037 1.2963 16 2.88889 16H13.1111C14.7037 16 16 14.7037 16 13.1111V4.88892H0ZM4.22222 13.3334C3.6088 13.3334 3.11111 12.8357 3.11111 12.2222C3.11111 11.6088 3.6088 11.1111 4.22222 11.1111C4.83565 11.1111 5.33333 11.6088 5.33333 12.2222C5.33333 12.8357 4.83565 13.3334 4.22222 13.3334ZM4.22222 9.33336C3.6088 9.33336 3.11111 8.83568 3.11111 8.22225C3.11111 7.60882 3.6088 7.11114 4.22222 7.11114C4.83565 7.11114 5.33333 7.60882 5.33333 8.22225C5.33333 8.83568 4.83565 9.33336 4.22222 9.33336ZM8 13.3334C7.38657 13.3334 6.88889 12.8357 6.88889 12.2222C6.88889 11.6088 7.38657 11.1111 8 11.1111C8.61343 11.1111 9.11111 11.6088 9.11111 12.2222C9.11111 12.8357 8.61343 13.3334 8 13.3334ZM8 9.33336C7.38657 9.33336 6.88889 8.83568 6.88889 8.22225C6.88889 7.60882 7.38657 7.11114 8 7.11114C8.61343 7.11114 9.11111 7.60882 9.11111 8.22225C9.11111 8.83568 8.61343 9.33336 8 9.33336ZM11.7778 9.33336C11.1644 9.33336 10.6667 8.83568 10.6667 8.22225C10.6667 7.60882 11.1644 7.11114 11.7778 7.11114C12.3912 7.11114 12.8889 7.60882 12.8889 8.22225C12.8889 8.83568 12.3912 9.33336 11.7778 9.33336Z" fill="currentColor"/>
                </svg>
              </button>
              <span className="text-black dark:text-white text-sm font-bold"
                    data-testid="statistics-date-display">{formattedDate}</span>
            </div>
          </div>

          {/* Tab bar */}
          <div className="max-w-2xl mx-auto flex">
            {(['balance', 'history'] as const).map(tabKey => (
              <button key={tabKey} onClick={() => setTab(tabKey)}
                data-testid={`statistics-${tabKey}-tab`}
                className={cn(
                  "flex-1 py-3 text-sm font-bold transition-colors duration-200 bg-transparent cursor-pointer border-0 border-b-2",
                  tab === tabKey ? "text-black dark:text-white border-budget-blue" : "text-[#7A8A94] border-transparent"
                )}
              >
                {t(tabKey === 'balance' ? 'balance' : 'history')}
              </button>
            ))}
          </div>
        </div>

        {/* ══ ANNUAL BALANCE TAB ══════════════════════════════════════════ */}
        {tab === 'balance' && (
          <div className="max-w-2xl mx-auto px-4 pt-5 pb-10">

            {/* Period toggle */}
            <div className="flex gap-2 mb-4 justify-center">
              {(['monthly', 'yearly'] as const).map(p => (
                <button key={p} onClick={() => setPeriod(p)}
                  data-testid={`balance-period-${p}`}
                  className={cn(
                    "text-xs font-semibold px-5 py-1.5 rounded-full border-none cursor-pointer transition-colors duration-200",
                    period === p ? "bg-budget-blue text-white" : "bg-white dark:bg-[#3A464F] text-black dark:text-white border border-black/10 dark:border-white/10 shadow-sm"
                  )}
                >
                  {t(p)}
                </button>
              ))}
            </div>

            {/* Year / Month navigator */}
            <div className="flex items-center justify-center gap-4 mb-2">
              <button
                aria-label="previous"
                onClick={() => {
                  if (period === 'yearly') {
                    setYear(y => y - 1);
                  } else {
                    if (month === 0) { setMonth(11); setYear(y => y - 1); }
                    else setMonth(m => m - 1);
                  }
                }}
                className="p-1 text-black dark:text-white hover:opacity-70 transition-opacity"
              >
                <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                  <path d="M13 4L7 10L13 16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </button>

              <p className="text-black dark:text-white text-xl font-bold min-w-[180px] text-center">
                {period === 'monthly'
                  ? new Date(year, month, 1).toLocaleDateString(locale, { month: 'long', year: 'numeric' })
                  : String(year)}
              </p>

              <button
                aria-label="next"
                onClick={() => {
                  if (period === 'yearly') {
                    setYear(y => y + 1);
                  } else {
                    if (month === 11) { setMonth(0); setYear(y => y + 1); }
                    else setMonth(m => m + 1);
                  }
                }}
                className="p-1 text-black dark:text-white hover:opacity-70 transition-opacity"
              >
                <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                  <path d="M7 4L13 10L7 16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </button>
            </div>

            {/* Donut chart */}
            <div className="relative w-full" style={{ height: 380 }}>
              <ResponsiveContainer width="100%" height={380}>
                <PieChart>
                  <Pie data={pieData} cx="50%" cy="50%"
                       innerRadius={DONUT.innerRadius} outerRadius={DONUT.outerRadius}
                       paddingAngle={pieData.length > 1 ? DONUT.paddingAngle : 0}
                       dataKey="value" startAngle={90} endAngle={-270}
                       animationBegin={0} animationDuration={DONUT.animationDuration} animationEasing="ease-out"
                       stroke="none">
                    {pieData.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                  </Pie>
                </PieChart>
              </ResponsiveContainer>

              {/* Centre text — always white so it's visible over the dark ring */}
              <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none gap-1.5"
                   style={{ padding: '0 22%' }}>
                <p className="text-sm text-center leading-snug text-black dark:text-white">
                  <span style={{ color: C.income, fontWeight: 700 }}>{t('income_short')}: </span>
                  <span style={{ fontWeight: 500 }}>+ {formatCurrency(annualTotals.inc)}</span>
                </p>
                <p className="text-sm text-center leading-snug text-black dark:text-white">
                  <span style={{ color: C.expense, fontWeight: 700 }}>{t('expense_short')}: </span>
                  <span style={{ fontWeight: 500 }}>- {formatCurrency(annualTotals.exp)}</span>
                </p>
                <div className="w-3/5 h-px bg-black/10 dark:bg-white/30 my-1" />
                <p className="text-sm font-bold text-center leading-snug"
                   style={{ color: annualTotals.bal >= 0 ? C.income : C.expense }}
                   data-testid="statistics-savings-rate">
                  {t('balance')}: {annualTotals.bal >= 0 ? '+' : ''}{formatCurrency(annualTotals.bal)}
                </p>
              </div>
            </div>

            {incomeCats.length > 0 && (
              <div className="mt-6">
                <p className="text-sm font-semibold text-black dark:text-white mb-2">{t('total_income')}</p>
                {incomeCats.map(cat => (
                  <CategoryRow key={cat.id} cat={cat} t={t} onClick={() => { (document.activeElement as HTMLElement)?.blur(); setSelectedCat(cat); }} />
                ))}
              </div>
            )}

            {expenseCats.length > 0 && (
              <div className="mt-5">
                <p className="text-sm font-semibold text-black dark:text-white mb-2">{t('total_expenses')}</p>
                {expenseCats.map(cat => (
                  <CategoryRow key={cat.id} cat={cat} t={t} onClick={() => { (document.activeElement as HTMLElement)?.blur(); setSelectedCat(cat); }} />
                ))}
              </div>
            )}

            {incomeCats.length === 0 && expenseCats.length === 0 && (
              <p className="text-center text-gray-500 text-sm mt-8">{t('no_data_available')}</p>
            )}
          </div>
        )}

        {/* ══ HISTORY TAB ═════════════════════════════════════════════════ */}
        {tab === 'history' && (
          <div className="max-w-4xl mx-auto pt-4 px-[25px] pb-6">

            {/* Period toggle */}
            <div className="flex gap-2 mb-4">
              {(['monthly', 'yearly'] as const).map(p => (
                <button key={p} onClick={() => setHistoryPeriod(p)}
                  data-testid={`history-period-${p}`}
                  className={cn(
                    "text-xs font-semibold px-5 py-1.5 rounded-full border-none cursor-pointer transition-colors duration-200",
                    historyPeriod === p ? "bg-budget-blue text-white" : "bg-white dark:bg-[#3A464F] text-black dark:text-white border border-black/10 dark:border-white/10 shadow-sm"
                  )}
                >
                  {t(p)}
                </button>
              ))}
            </div>

            {/* Summary card */}
            <div className="bg-white dark:bg-white/5 rounded-lg shadow-sm p-4 sm:p-6 mb-6 border border-black/10 dark:border-white/5">
              <div className="grid grid-cols-2 gap-2 sm:gap-4">

                {/* Savings Rate */}
                <div className="rounded-lg p-3 flex flex-col bg-white dark:bg-white/5 border border-black/5 dark:border-white/10 shadow-sm"
                     style={{ minHeight: 134 }}>
                  <p className="text-xs font-semibold text-gray-800 dark:text-white mb-1">{t('savings_rate')}</p>
                  <div className="flex-1 flex items-center justify-center text-gray-900 dark:text-white font-semibold"
                       style={{ fontSize: 'clamp(34px, 4vw, 56px)' }}
                       data-testid="statistics-savings-rate">
                    {historyTotals.displaySavingsRate.toFixed(1)}%
                  </div>
                </div>

                {/* Most Frequent Categories */}
                <div className="rounded-lg p-3 flex flex-col bg-white dark:bg-white/5"
                     style={{ minHeight: 134 }} data-testid="statistics-top-categories">
                  <p className="font-semibold text-gray-800 dark:text-white mb-3"
                     style={{ fontSize: 'clamp(10px, 2.5vw, 11px)' }}>
                    {t('most_frequent_categories')}
                  </p>
                  <div className="flex flex-col gap-2">
                    {historyTopCats.length > 0 ? historyTopCats.map((cat, i) => (
                      <div key={i} className="flex items-center gap-2">
                        <CategoryAvatar
                          categoryKey={cat.name}
                          icon={cat.icon}
                          size={40}
                          color={cat.color}
                        />
                        <span className="text-xs text-gray-800 dark:text-white">
                          {translateCategoryLabel(t, cat.name, cat.isDefault ?? false)}
                        </span>
                      </div>
                    )) : (
                      <p className="text-xs italic text-gray-400 dark:text-gray-500">{t('no_data_available')}</p>
                    )}
                  </div>
                </div>
              </div>

              {/* Income */}
              <div className="rounded-lg p-4 sm:p-6 mt-6 bg-white dark:bg-white/5 border border-black/10 dark:border-white/10 shadow-sm">
                <p className="text-xs font-semibold text-gray-800 dark:text-white mb-3">{t('total_income')}</p>
                <div className="font-semibold mb-3" style={{ color: C.income, fontSize: 'clamp(34px, 4vw, 56px)' }}
                     data-testid="statistics-total-income">
                  {formatCurrency(historyTotals.totalIncome)}
                </div>
                <p className="text-xs italic text-gray-500 dark:text-gray-400">
                  {t('average_per_month')} {formatCurrency(historyAverages.avgIncome)}
                </p>
              </div>

              {/* Expenses */}
              <div className="rounded-lg p-4 sm:p-6 mt-4 bg-white dark:bg-white/5 border border-black/10 dark:border-white/10 shadow-sm">
                <p className="text-xs font-semibold text-gray-800 dark:text-white mb-3">{t('total_expenses')}</p>
                <div className="font-semibold mb-3" style={{ color: C.expense, fontSize: 'clamp(34px, 4vw, 56px)' }}
                     data-testid="statistics-total-expenses">
                  {formatCurrency(historyTotals.totalExpense)}
                </div>
                <p className="text-xs italic text-gray-500 dark:text-gray-400">
                  {t('average_per_month')} {formatCurrency(historyAverages.avgExpense)}
                </p>
              </div>
            </div>

            {/* Bar chart card */}
            <div className="bg-white dark:bg-white/5 rounded-lg shadow-sm p-3 sm:p-4 md:p-6 border border-black/10 dark:border-white/5"
                 data-testid="statistics-chart">
              <p className="text-sm font-semibold text-gray-900 dark:text-white mb-4">
                {t('summary')} {year}
              </p>

              <div className="w-full overflow-x-auto">
                <div className="flex items-end justify-between mb-3 px-2"
                     style={{ minWidth: 236, height: 160 }}>
                  {chartData.map((data, i) => {
                    const barH = (Math.max(data.income, data.expense) / maxBar) * 140;
                    const isIncome = data.income >= data.expense;
                    return (
                      <div key={i} className="flex flex-col items-center" style={{ width: 17 }}>
                        <div className="w-full rounded-t-sm transition-all duration-300"
                             data-testid={`statistics-chart-bar-${i}`}
                             style={{
                               height: `${Math.max(barH, 2)}px`,
                               backgroundColor: isIncome ? C.income : C.expense,
                               opacity: i === sliderMonth ? 1 : 0.55,
                             }} />
                      </div>
                    );
                  })}
                </div>

                <div className="flex justify-between px-2" style={{ minWidth: 236 }}>
                  {MONTH_KEYS.map((key, i) => (
                    <span key={i} style={{ width: 17, textAlign: 'center', fontSize: 8, lineHeight: 1.2,
                                          fontWeight: i === sliderMonth ? 700 : 500 }}
                          className={i === sliderMonth ? 'text-gray-900 dark:text-white' : 'text-gray-400 dark:text-gray-500'}>
                      {t(key).substring(0, 3).toUpperCase()}
                    </span>
                  ))}
                </div>
              </div>

              {/* Slider — only meaningful in monthly mode */}
              {historyPeriod === 'monthly' && (
                <>
                  <div className="pt-4 pb-1">
                    <input type="range" min={0} max={11} step={1}
                           value={sliderMonth} onChange={handleSlider}
                           aria-label={t('filter_month')}
                           className="w-full cursor-pointer accent-[#0B75C2]" />
                  </div>
                  <p className="text-center text-sm font-semibold text-gray-900 dark:text-white mt-1">
                    {sliderMonthName}
                  </p>
                </>
              )}
            </div>

          </div>
        )}

      </div>

      <DatePickerDialog
        open={showDatePicker}
        onOpenChange={setShowDatePicker}
        selectedYear={year}
        selectedMonth={month}
        onYearChange={setYear}
        onMonthChange={setMonth}
      />

      {/* ── Category transaction drill-down drawer ─────────────────────── */}
      <Drawer open={!!selectedCat} onOpenChange={open => { if (!open) setSelectedCat(null); }}>
        <DrawerContent>
          <DrawerHeader className="border-b border-border pb-3">
            <DrawerTitle className="flex items-center gap-2">
              {selectedCat && (
                <>
                  <CategoryAvatar
                    categoryKey={selectedCat.name}
                    icon={selectedCat.icon}
                    size={32}
                    color={selectedCat.color}
                  />
                  <span>{translateCategoryLabel(t, selectedCat.name, selectedCat.isDefault ?? false)}</span>
                </>
              )}
            </DrawerTitle>
            <DrawerDescription className="text-xs text-muted-foreground mt-1">
              {selectedCat && (
                <span style={{ color: selectedCat.type === 'income' ? C.income : C.expense }}>
                  {formatCurrency(selectedCat.value)} · {selectedCat.pct}%
                </span>
              )}
            </DrawerDescription>
          </DrawerHeader>
          <div className="overflow-y-auto pb-6">
            {categoryTx.length > 0
              ? categoryTx.map(tx => <TransactionItem key={tx.id} transaction={tx} />)
              : <p className="text-center text-muted-foreground text-sm py-10">{t('no_data_available')}</p>
            }
          </div>
        </DrawerContent>
      </Drawer>
    </Layout>
  );
};

export default Statistics;
