import { useState } from "react";
import Layout from "@/components/Layout";
import { useBudget } from "@/contexts/BudgetContext";
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
import { formatCurrency, formatDate } from "@/lib/formatters";
import { translateCategoryLabel } from "@/lib/categoryHelpers";
import { CategoryAvatar } from "@/components/CategoryAvatar";
import { Edit, Calendar } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";

const RecurringItems = () => {
  const { recurringItems, categories, deleteRecurringItem } = useBudget();
  const { t } = useTranslation();
  const navigate = useNavigate();

  const [deleteId, setDeleteId] = useState<string | null>(null);

  // Translate any frequency key dynamically
  const getFrequencyLabel = (frequency: string) => t(`frequency_${frequency}`, frequency);

  const handleDeleteConfirm = () => {
    if (deleteId) {
      deleteRecurringItem(deleteId);
      setDeleteId(null);
    }
  };

  return (
    <Layout>
      <div className="mb-6 px-6 py-4 bg-white dark:bg-[#1A2124] border-b border-black/10 dark:border-white/10 shadow-sm">
        <h2 className="text-black dark:text-white text-lg font-bold max-w-2xl mx-auto">
          {t("recurring_items")}
        </h2>
      </div>
      <div className="px-6 pb-6">

        {recurringItems.length === 0 ? (
          <div className="mt-8">
            <div
              style={{
                height: "77px",
                maxWidth: "100%",
                boxShadow: "0 1px 3px rgba(0, 0, 0, 0.05)",
                borderRadius: "8px",
                border: "1px solid rgba(0, 0, 0, 0.1)",
                overflow: "hidden",
              }}
              className="w-full"
            >
              <button
                onClick={() => navigate("/recurring/add")}
                className="w-full h-full bg-white dark:bg-transparent text-black dark:text-white hover:bg-gray-50 dark:hover:bg-white/10 transition-colors flex items-center gap-4 px-4 border border-black/5 dark:border-white/10"
                aria-label={t("create_recurring_item")}
              >
                <div className="flex-shrink-0" style={{ width: 38, height: 38 }}>
                  <svg
                    width="38"
                    height="38"
                    viewBox="0 0 38 38"
                    fill="none"
                    xmlns="http://www.w3.org/2000/svg"
                  >
                    <path
                      d="M38 19C38 29.4927 29.4927 38 19 38C8.50732 38 0 29.4927 0 19C0 8.50732 8.50732 0 19 0C29.4927 0 38 8.50732 38 19Z"
                      fill="#DFE3E4"
                      fillOpacity="0.8"
                    />
                    <path
                      d="M29.6301 16.5019H21.9389V9.12012H16.8114V16.5019H9.12012V21.4232H16.8114V28.805H21.9389V21.4232H29.6301V16.5019Z"
                      className="fill-[#1A2124] dark:fill-white"
                    />
                  </svg>
                </div>
                <div className="flex-1 flex items-center">
                  <div
                    className="text-black dark:text-white font-semibold"
                    style={{
                      height: "28px",
                      justifyContent: "center",
                      display: "flex",
                      flexDirection: "column",
                      fontSize: "14px",
                      fontFamily:
                        'Inter, system-ui, -apple-system, Roboto, "Helvetica Neue", Arial',
                      fontWeight: 600,
                      wordWrap: "break-word",
                    }}
                  >
                    {t("create_recurring_item")}
                  </div>
                </div>
              </button>
            </div>
          </div>
        ) : (
          <div data-testid="recurring-list" className="space-y-3">
            {recurringItems.map((item) => {
              const category = categories.find((c) => c.id === item.categoryId);

              return (
                <div
                  key={item.id}
                  data-testid={`recurring-item-${item.id}`}
                  style={{
                    position: "relative",
                    minHeight: "77px",
                    maxWidth: "100%",
                    boxShadow: "0 1px 3px rgba(0, 0, 0, 0.05)",
                    border: "1px solid rgba(0, 0, 0, 0.1)",
                    borderRadius: "8px",
                    overflow: "hidden",
                    padding: "6px",
                    boxSizing: "border-box",
                  }}
                  className="bg-white dark:bg-white/5"
                >
                  {/* Inner background container - adapt to theme */}
                  <div
                    className="bg-white dark:bg-transparent"
                    style={{
                      position: "absolute",
                      width: "calc(100% - 12px)",
                      height: "calc(100% - 12px)",
                      borderRadius: "6px",
                      left: "6px",
                      top: "6px",
                    }}
                  />

                  {/* Card Content */}
                  <div
                    className="relative p-2 sm:p-3 flex items-center gap-2 h-full"
                    style={{ overflow: "hidden", zIndex: 1 }}
                  >
                    <CategoryAvatar
                      categoryKey={category?.name || ""}
                      icon={category?.icon}
                      size={36}
                      className="flex-shrink-0"
                    />

                    <div className="flex-1 min-w-0">
                      <h3 className="text-black dark:text-white font-semibold text-xs sm:text-sm leading-tight truncate">
                        {item.name}
                      </h3>
                      <p className="text-[#666] dark:text-gray-400 text-xs truncate">
                        {category ? translateCategoryLabel(t, category.name, category.isDefault ?? false) : t("unknownCategory")} • {getFrequencyLabel(item.frequency)}
                      </p>
                      <div className="flex items-center text-[#666] text-xs mt-0.5">
                        <Calendar className="h-3 w-3 mr-1" />
                        <span>{formatDate(item.startDate)}</span>
                      </div>
                    </div>

                    <div className="text-right flex-shrink-0">
                      <p
                        className={`font-bold text-xs ${
                          item.type === "income" ? "text-budget-green" : "text-budget-red"
                        }`}
                      >
                        {item.type === "income" ? "+" : "-"} {formatCurrency(item.amount)}
                      </p>
                    </div>

                    <div className="flex items-center gap-1 flex-shrink-0">
                      <button
                        onClick={() => navigate(`/recurring/edit/${item.id}`)}
                        className="p-1.5 hover:opacity-70 transition-opacity"
                        aria-label={t("edit")}
                      >
                        <Edit className="h-4 w-4 text-black dark:text-white/60" />
                      </button>
                      <button
                        onClick={() => setDeleteId(item.id)}
                        className="p-1.5 hover:opacity-70 transition-opacity"
                        aria-label={t("delete")}
                      >
                        <svg
                          width="14"
                          height="14"
                          viewBox="0 0 14 14"
                          fill="none"
                          xmlns="http://www.w3.org/2000/svg"
                        >
                          <path
                            d="M1.75 3.5H12.25M5.25 6.125V10.375M8.75 6.125V10.375M2.625 3.5L3.5 11.375C3.5 11.8391 3.68437 12.2842 4.01256 12.6124C4.34075 12.9406 4.78587 13.125 5.25 13.125H8.75C9.21413 13.125 9.65925 12.9406 9.98744 12.6124C10.3156 12.2842 10.5 11.8391 10.5 11.375L11.375 3.5M4.8125 3.5V1.75C4.8125 1.51794 4.90469 1.29538 5.06878 1.13128C5.23288 0.967187 5.45544 0.875 5.6875 0.875H8.3125C8.54456 0.875 8.76712 0.967187 8.93122 1.13128C9.09531 1.29538 9.1875 1.51794 9.1875 1.75V3.5"
                            stroke="#E33B80"
                            strokeWidth="1.5"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        </svg>
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}

            {/* Add New Recurring Item Card */}
            <div
              style={{
                height: "77px",
                maxWidth: "100%",
                boxShadow: "0 1px 3px rgba(0, 0, 0, 0.05)",
                borderRadius: "8px",
                border: "1px solid rgba(0, 0, 0, 0.1)",
                overflow: "hidden",
              }}
              className="w-full"
            >
              <button
                onClick={() => navigate("/recurring/add")}
                className="w-full h-full bg-white dark:bg-transparent text-black dark:text-white hover:bg-gray-50 dark:hover:bg-white/10 transition-colors flex items-center gap-4 px-4 border border-black/5 dark:border-white/10"
                aria-label={t("create_recurring_item")}
              >
                <div className="flex-shrink-0" style={{ width: 38, height: 38 }}>
                  <svg
                    width="38"
                    height="38"
                    viewBox="0 0 38 38"
                    fill="none"
                    xmlns="http://www.w3.org/2000/svg"
                  >
                    <path
                      d="M38 19C38 29.4927 29.4927 38 19 38C8.50732 38 0 29.4927 0 19C0 8.50732 8.50732 0 19 0C29.4927 0 38 8.50732 38 19Z"
                      fill="#DFE3E4"
                      fillOpacity="0.8"
                    />
                    <path
                      d="M29.6301 16.5019H21.9389V9.12012H16.8114V16.5019H9.12012V21.4232H16.8114V28.805H21.9389V21.4232H29.6301V16.5019Z"
                      fill="currentColor"
                    />
                  </svg>
                </div>
                <div className="flex-1 flex items-center">
                  <span className="text-black dark:text-white text-sm font-semibold">{t("create_recurring_item")}</span>
                </div>
              </button>
            </div>
          </div>
        )}

        {/* Delete Confirmation */}
        <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
          <AlertDialogContent className="rounded-[12px] max-w-[calc(100%-2rem)] bg-white dark:bg-[#1A2124] border-gray-200 dark:border-white/10 shadow-lg">
            <AlertDialogHeader>
              <AlertDialogTitle className="text-lg font-semibold text-black dark:text-white">
                {t('delete_recurring_item')}
              </AlertDialogTitle>
              <AlertDialogDescription className="text-gray-500 dark:text-gray-400">
                {t('delete_recurring_confirmation')}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter className="flex-row gap-3 sm:gap-3">
              <AlertDialogCancel className="flex-1 rounded-[8px] mt-0 bg-white dark:bg-white/10 text-black dark:text-white border border-black/10 dark:border-white/10 hover:bg-gray-50 dark:hover:bg-white/20 shadow-sm">
                {t('cancel')}
              </AlertDialogCancel>
              <AlertDialogAction
                onClick={handleDeleteConfirm}
                className="flex-1 rounded-[8px] bg-budget-red hover:bg-budget-red/90 text-white"
              >
                {t('delete')}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </Layout>
  );
};

export default RecurringItems;
