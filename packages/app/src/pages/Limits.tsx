import { useState } from "react";
import Layout from "@/components/Layout";
import { useBudget } from "@/contexts/BudgetContext";
import { formatCurrency } from "@/lib/formatters";
import { getCategoryColor, translateCategoryLabel } from "@/lib/categoryHelpers";
import { CategoryAvatar } from "@/components/CategoryAvatar";
import { useMonthlyLimits } from "@/hooks/useMonthlyLimits";
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
import { DatePickerDialog } from "@/components/DatePickerDialog";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";

const Limits = () => {
  const navigate = useNavigate();
  const { limits, categories, transactions, deleteLimit } = useBudget();
  const { t, i18n } = useTranslation();

  // Date picker state
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth());
  const [showDatePicker, setShowDatePicker] = useState(false);

  const { limitsWithSpending } = useMonthlyLimits(
    limits,
    transactions,
    { year: selectedYear, month: selectedMonth }
  );

  const [deleteLimitId, setDeleteLimitId] = useState<string | null>(null);

  const handleAddOrUpdateLimit = () => {
    // Handled by navigation to LimitForm page
  };

  const handleEditLimit = (limitId: string) => {
    navigate(`/limits/edit/${limitId}`);
  };

  const handleDeleteConfirm = () => {
    if (deleteLimitId) {
      deleteLimit(deleteLimitId);
      setDeleteLimitId(null);
    }
  };

  // Format date based on language using selected year/month
  const formatMonthDate = (): string => {
    const locale = i18n.language === "en" ? "en-US" : "de-DE";
    return new Date(selectedYear, selectedMonth).toLocaleDateString(locale, {
      year: "numeric",
      month: "long",
    });
  };

  return (
    <Layout>
      <div className="p-6 pb-24">
        <div className="flex justify-center mb-6">
          <button
            onClick={() => setShowDatePicker(true)}
            className="flex items-center gap-2 text-black/70 dark:text-white/70 text-sm hover:text-black dark:hover:text-white transition-colors cursor-pointer"
            data-testid="limits-date-picker"
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 16 16"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
              className="w-4 h-4"
            >
              <path
                d="M16 3.55556V2.88889C16 1.2963 14.7037 0 13.1111 0H2.88889C1.2963 0 0 1.2963 0 2.88889V3.55556H16Z"
                fill="currentColor"
              />
              <path
                d="M0 4.88892V13.1111C0 14.7037 1.2963 16 2.88889 16H13.1111C14.7037 16 16 14.7037 16 13.1111V4.88892H0ZM4.22222 13.3334C3.6088 13.3334 3.11111 12.8357 3.11111 12.2222C3.11111 11.6088 3.6088 11.1111 4.22222 11.1111C4.83565 11.1111 5.33333 11.6088 5.33333 12.2222C5.33333 12.8357 4.83565 13.3334 4.22222 13.3334ZM4.22222 9.33336C3.6088 9.33336 3.11111 8.83568 3.11111 8.22225C3.11111 7.60882 3.6088 7.11114 4.22222 7.11114C4.83565 7.11114 5.33333 7.60882 5.33333 8.22225C5.33333 8.83568 4.83565 9.33336 4.22222 9.33336ZM8 13.3334C7.38657 13.3334 6.88889 12.8357 6.88889 12.2222C6.88889 11.6088 7.38657 11.1111 8 11.1111C8.61343 11.1111 9.11111 11.6088 9.11111 12.2222C9.11111 12.8357 8.61343 13.3334 8 13.3334ZM8 9.33336C7.38657 9.33336 6.88889 8.83568 6.88889 8.22225C6.88889 7.60882 7.38657 7.11114 8 7.11114C8.61343 7.11114 9.11111 7.60882 9.11111 8.22225C9.11111 8.83568 8.61343 9.33336 8 9.33336ZM11.7778 9.33336C11.1644 9.33336 10.6667 8.83568 10.6667 8.22225C10.6667 7.60882 11.1644 7.11114 11.7778 7.11114C12.3912 7.11114 12.8889 7.60882 12.8889 8.22225C12.8889 8.83568 12.3912 9.33336 11.7778 9.33336Z"
                fill="currentColor"
              />
            </svg>
            <span>{formatMonthDate()}</span>
          </button>
        </div>

        {limits.length === 0 ? (
          <div>
            <div
              style={{
                height: "77px",
                maxWidth: "100%",
                boxShadow: "0 1px 3px rgba(0, 0, 0, 0.05)",
                border: "1px solid rgba(0, 0, 0, 0.1)",
                borderRadius: "8px",
                overflow: "hidden",
              }}
              className="w-full"
            >
              <button
                onClick={() => {
                  navigate("/limits/add");
                }}
                className="w-full h-full bg-white dark:bg-white/10 text-black dark:text-white hover:bg-gray-50 dark:hover:bg-white/10 transition-colors flex items-center gap-4 px-4 border border-black/10 dark:border-white/10 shadow-sm"
                aria-label={t("new_limit_button")}
                data-testid="limits-add-button"
              >
                <div
                  className="flex-shrink-0"
                  style={{ width: 38, height: 38 }}
                >
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
                    {t("new_limit_button")}
                  </div>
                </div>
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
              {limitsWithSpending.map(
                ({ limit, spending, progress, isExceeded }) => {
                  const category = categories.find(
                    (c) => c.id === limit.categoryId,
                  );

                  return (
                    <div
                      key={limit.id}
                      onClick={() => navigate(`/limits/${limit.id}`)}
                      onKeyDown={(e) => e.key === 'Enter' && navigate(`/limits/${limit.id}`)}
                      role="button"
                      tabIndex={0}
                      data-testid={`limit-card-${limit.id}`}
                      className="w-full text-left transition-all hover:shadow-md cursor-pointer bg-white dark:bg-white/5"
                      style={{
                        position: "relative",
                        height: "77px",
                        maxWidth: "100%",
                        boxShadow: "0 1px 3px rgba(0, 0, 0, 0.05)",
                        border: "1px solid rgba(0, 0, 0, 0.1)",
                        borderRadius: "8px",
                        overflow: "hidden",
                        padding: "6px",
                        boxSizing: "border-box",
                        zIndex: "auto",
                      }}
                    >
                      {/* Inner background container - adapt to theme */}
                      <div
                        className="bg-transparent"
                        style={{
                          position: "absolute",
                          width: "calc(100% - 12px)",
                          height: "calc(100% - 12px)",
                          borderRadius: "6px",
                          left: "6px",
                          top: "6px",
                        }}
                      />

                      {/* Progress Bar Background */}
                      <svg
                        style={{
                          position: "absolute",
                          left: "6px",
                          top: "6px",
                          width: `${Math.min(progress, 100)}%`,
                          height: "calc(100% - 12px)",
                        }}
                        viewBox="0 0 310 65"
                        fill="none"
                        xmlns="http://www.w3.org/2000/svg"
                        preserveAspectRatio="none"
                      >
                        <path
                          d="M0 5C0 2.23858 2.23858 0 5 0H310V65H7.99999C3.58171 65 0 61.4183 0 57V5Z"
                          fill="#E33B80"
                          fillOpacity="0.11"
                        />
                      </svg>

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
                            {category
                              ? translateCategoryLabel(t, category.name, category.isDefault ?? false)
                              : t("unknownCategory")}
                          </h3>
                        </div>

                        <div className="text-right flex-shrink-0" data-testid={`limit-card-spending-${limit.id}`}>
                          <p className="text-black dark:text-white font-bold text-xs">
                            <span
                              className={
                                isExceeded ? "text-[#e33b80]" : "text-black dark:text-white"
                              }
                            >
                              {formatCurrency(spending)}
                            </span>
                            <span className="text-black dark:text-white">{" / "}</span>
                            <span className="text-black dark:text-white">
                              {formatCurrency(limit.amount)}
                            </span>
                          </p>
                        </div>

                        <div className="flex items-center gap-1 flex-shrink-0">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleEditLimit(limit.id);
                            }}
                            className="p-1.5 hover:opacity-70 transition-opacity"
                            aria-label={t("edit_limit")}
                            data-testid={`limit-edit-${limit.id}`}
                          >
                            <svg
                              width="15"
                              height="15"
                              viewBox="0 0 15 15"
                              fill="none"
                              xmlns="http://www.w3.org/2000/svg"
                            >
                              <path
                                d="M2.03125 12.9688L2.95898 9.72172C2.98747 9.61918 3.04281 9.52641 3.11768 9.45154L10.035 2.53503C10.7056 1.86365 11.7944 1.86365 12.465 2.53503C13.1364 3.20561 13.1364 4.29448 12.465 4.96505L5.5485 11.8824C5.47363 11.9572 5.38005 12.0118 5.27832 12.0411L2.03125 12.9688Z"
                                stroke="currentColor"
                                strokeMiterlimit="10"
                                strokeLinejoin="round"
                              />
                              <path
                                d="M9.09766 3.47266L11.5277 5.90267"
                                stroke="currentColor"
                                strokeMiterlimit="10"
                              />
                            </svg>
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setDeleteLimitId(limit.id);
                            }}
                            className="p-1.5 hover:opacity-70 transition-opacity"
                            aria-label={t("delete")}
                            data-testid={`limit-delete-${limit.id}`}
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
                },
              )}

              {/* Add New Limit Card */}
              <div
                style={{
                  height: "77px",
                  maxWidth: "100%",
                  boxShadow: "0 1px 3px rgba(0, 0, 0, 0.05)",
                  border: "1px solid rgba(0, 0, 0, 0.1)",
                  borderRadius: "8px",
                  overflow: "hidden",
                }}
                className="w-full"
              >
                <button
                  onClick={() => {
                    navigate("/limits/add");
                  }}
                  className="w-full h-full bg-white dark:bg-white/10 text-black dark:text-white hover:bg-gray-50 dark:hover:bg-white/10 transition-colors flex items-center gap-4 px-4 border border-black/10 dark:border-white/10 shadow-sm"
                  aria-label={t("new_limit_button")}
                  data-testid="limits-add-button"
                >
                  <div
                    className="flex-shrink-0"
                    style={{ width: 38, height: 38 }}
                  >
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
                    {t("new_limit_button")}
                  </div>
                </div>
                </button>
              </div>
          </div>
        )}
      </div>

        {/* Dialog for Add/Edit Limit - Full Screen Mobile Modal */}
        {/* Removed - now using separate LimitForm page */}

        {/* Delete Confirmation */}
        <AlertDialog open={!!deleteLimitId} onOpenChange={() => setDeleteLimitId(null)}>
          <AlertDialogContent className="rounded-[12px] max-w-[calc(100%-2rem)] bg-white dark:bg-[#1A2124] border-gray-200 dark:border-white/10 shadow-lg">
            <AlertDialogHeader>
              <AlertDialogTitle className="text-lg font-semibold text-black dark:text-white">
                {t('delete_limit')}
              </AlertDialogTitle>
              <AlertDialogDescription className="text-gray-500 dark:text-gray-400">
                {t('are_you_sure_delete')}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter className="flex-row gap-3 sm:gap-3">
              <AlertDialogCancel className="flex-1 rounded-[8px] mt-0 bg-white dark:bg-white/10 text-black dark:text-white border border-black/10 dark:border-white/10 hover:bg-gray-50 dark:hover:bg-white/20 shadow-sm">
                {t('cancel')}
              </AlertDialogCancel>
              <AlertDialogAction
                onClick={handleDeleteConfirm}
                className="flex-1 rounded-[8px] bg-budget-red hover:bg-budget-red/90"
                data-testid="limit-delete-confirm"
              >
                {t('delete')}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* Date Picker Dialog - Shared component */}
        <DatePickerDialog
          open={showDatePicker}
          onOpenChange={setShowDatePicker}
          selectedYear={selectedYear}
          selectedMonth={selectedMonth}
          onYearChange={setSelectedYear}
          onMonthChange={setSelectedMonth}
        />
    </Layout>
  );
};

export default Limits;
