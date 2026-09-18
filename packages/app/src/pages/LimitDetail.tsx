import { useState } from "react";
import Layout from "@/components/Layout";
import { useBudget } from "@/contexts/BudgetContext";
import { formatCurrency, calculateProgress } from "@/lib/formatters";
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
import { Trash2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useNavigate, useParams } from "react-router-dom";

export default function LimitDetail() {
  const navigate = useNavigate();
  const { limitId } = useParams();
  const { limits, categories, transactions, deleteLimit } = useBudget();
  const { t, i18n } = useTranslation();
  const { limitsWithSpending } = useMonthlyLimits(limits, transactions);

  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);

  const limitWithSpending = limitsWithSpending.find(
    (l) => l.limit.id === limitId,
  );
  const limit = limitWithSpending?.limit;
  const spending = limitWithSpending?.spending || 0;

  if (!limit) {
    return (
      <Layout>
        <div className="flex items-center justify-center h-screen bg-white dark:bg-[#1A2124]">
          <div className="text-black dark:text-white text-center">
            <p className="text-lg font-semibold">{t("unknownCategory")}</p>
          </div>
        </div>
      </Layout>
    );
  }

  const category = categories.find((c) => c.id === limit.categoryId);
  const categoryColor = getCategoryColor(category?.name || "");
  const isExceeded = spending > limit.amount;
  const progress = calculateProgress(spending, limit.amount);

  // Format date based on language
  const formatMonthDate = (): string => {
    const locale = i18n.language === "en" ? "en-US" : "de-DE";
    return new Date().toLocaleDateString(locale, {
      year: "numeric",
      month: "long",
    });
  };

  const handleDelete = () => {
    deleteLimit(limit.id);
    navigate("/limits");
  };

  return (
    <Layout>
      <div className="flex flex-col h-screen bg-white dark:bg-[#1A2124]">
        {/* Header */}
        <div className="sticky top-0 z-20 flex items-center justify-between h-16 px-6 bg-white dark:bg-[#1A2124] border-b border-gray-200 dark:border-white/10 text-black dark:text-white ios-header-safe-area transition-colors">
          <button
            onClick={() => navigate("/limits")}
            className="flex-none text-black dark:text-white hover:opacity-70 transition-opacity"
          >
            <span className="text-sm font-medium">{t("cancel")}</span>
          </button>
          
          <h1 className="flex-1 px-4 text-center text-lg font-bold truncate" data-testid="limit-detail-name">
            {translateCategoryLabel(t, category?.name || "", category?.isDefault ?? false)}
          </h1>

          <button
            onClick={() => navigate(`/limits/edit/${limitId}`)}
            className="flex-none text-black dark:text-white font-bold hover:opacity-70 transition-opacity cursor-pointer"
            data-testid="limit-detail-edit"
          >
            <span className="text-sm font-bold">{t("edit_limit")}</span>
          </button>
        </div>



        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto pb-20">
          <div className="px-6 py-8 space-y-8 max-w-2xl mx-auto">
            {/* Category Icon */}
            <div className="flex justify-center mb-6">
              <CategoryAvatar categoryKey={category?.name || ""} icon={category?.icon} size={60} />
            </div>

            {/* Category Name */}
            <div className="text-center">
              <h2 className="text-black dark:text-white text-4xl font-bold mb-2">
                {translateCategoryLabel(t, category?.name || "", category?.isDefault ?? false)}
              </h2>
              <p className="text-gray-500 dark:text-white/60 text-sm">{formatMonthDate()}</p>
            </div>

            {/* Spending Progress Box */}
            <div className="border border-dashed border-black/10 dark:border-white/20 rounded-lg p-2 text-center max-w-md mx-auto shadow-sm bg-white dark:bg-white/5">
              {/* Inner Box */}
              <div className="rounded-lg p-6 bg-transparent overflow-hidden">
                <div className="flex justify-center items-center gap-1 mb-2 flex-wrap min-w-0">
                  <span
                    className={`font-bold truncate text-[#E33B80] ${
                      formatCurrency(spending).length > 10
                        ? "text-xl sm:text-2xl"
                        : formatCurrency(spending).length > 8
                          ? "text-2xl sm:text-3xl"
                          : "text-2xl sm:text-4xl"
                    }`}
                    data-testid="limit-detail-spending"
                  >
                    {formatCurrency(spending)}
                  </span>
                  <span
                    className={`text-gray-500 dark:text-white/60 font-bold ${
                      formatCurrency(spending).length > 10
                        ? "text-lg sm:text-xl"
                        : formatCurrency(spending).length > 8
                          ? "text-xl sm:text-2xl"
                          : "text-2xl sm:text-3xl"
                    }`}
                  >
                    /
                  </span>
                  <span
                    className={`font-bold text-black dark:text-white truncate ${
                      formatCurrency(limit.amount).length > 10
                        ? "text-xl sm:text-2xl"
                        : formatCurrency(limit.amount).length > 8
                          ? "text-2xl sm:text-3xl"
                          : "text-2xl sm:text-4xl"
                    }`}
                    data-testid="limit-detail-amount"
                  >
                    {formatCurrency(limit.amount)}
                  </span>
                </div>
              </div>
            </div>

            {/* Delete Button */}
            <div className="pt-10 flex justify-center">
              <button
                aria-label={t("delete_limit")}
                onClick={() => setDeleteConfirmOpen(true)}
                className="w-full max-w-[280px] py-2.5 px-6 rounded-[12px] bg-red-500/10 border border-red-500/20 flex items-center justify-center gap-2 hover:bg-red-500/20 transition-all text-budget-red font-semibold shadow-sm"
                data-testid="limit-detail-delete"
              >


                <Trash2 className="w-5 h-5" />
                <span>{t("delete_limit")}</span>
              </button>
            </div>


          </div>
        </div>

        {/* Delete Confirmation Dialog */}
        <AlertDialog
          open={deleteConfirmOpen}
          onOpenChange={setDeleteConfirmOpen}
        >
          <AlertDialogContent className="rounded-[12px] max-w-[calc(100%-2rem)] bg-white dark:bg-[#1A2124] border-gray-200 dark:border-white/10 shadow-lg">
            <AlertDialogHeader>
              <AlertDialogTitle className="text-lg font-semibold text-foreground">
                {t("delete_limit")}
              </AlertDialogTitle>
              <AlertDialogDescription className="text-muted-foreground">
                {t("are_you_sure_delete")}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter className="flex-row gap-3 sm:gap-3">
              <AlertDialogCancel className="flex-1 rounded-[8px] mt-0 bg-white dark:bg-white/10 text-black dark:text-white border border-black/10 dark:border-white/10 hover:bg-gray-50 dark:hover:bg-white/20 shadow-sm">
                {t("cancel")}
              </AlertDialogCancel>
              <AlertDialogAction
                onClick={handleDelete}
                className="flex-1 rounded-[8px] bg-budget-red hover:bg-budget-red/90"
                data-testid="limit-detail-delete-confirm"
              >
                {t("delete")}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </Layout>
  );
}
