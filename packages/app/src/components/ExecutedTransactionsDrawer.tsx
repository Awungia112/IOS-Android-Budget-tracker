import { useTranslation } from "react-i18next";
import { CheckCircle } from "lucide-react";
import { CategoryAvatar } from "@/components/CategoryAvatar";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerDescription,
  DrawerFooter,
} from "@/components/ui/drawer";
import { Button } from "@/components/ui/button";
import { formatCurrency, formatDate } from "@/lib/formatters";
import type { PendingNotification } from "@/lib/pendingNotifications";
import { useBudget } from "@/contexts/BudgetContext";
import { translateCategoryLabel } from "@/lib/categoryHelpers";

interface ExecutedTransactionsDrawerProps {
  open: boolean;
  onClose: () => void;
  notifications: PendingNotification[];
  onDismiss: () => void;
}

export function ExecutedTransactionsDrawer({
  open,
  onClose,
  notifications,
  onDismiss,
}: ExecutedTransactionsDrawerProps) {
  const { t } = useTranslation();
  const { categories } = useBudget();

  const handleDismiss = () => {
    onDismiss();
    onClose();
  };

  return (
    <Drawer open={open} onOpenChange={(v) => !v && onClose()}>
      <DrawerContent className="max-h-[80dvh] bg-white dark:bg-[#1A2124]">
        <DrawerHeader className="pb-2">
          <DrawerTitle className="text-base font-semibold text-black dark:text-white flex items-center gap-2">
            <CheckCircle className="h-5 w-5 text-green-500" />
            {t("transactions_executed_while_away")}
          </DrawerTitle>
          <DrawerDescription className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            {t("transactions_executed_while_away_description", {
              count: notifications.length,
            })}
          </DrawerDescription>
        </DrawerHeader>

        {/* Transaction list */}
        <div className="overflow-y-auto px-4 flex-1 divide-y divide-gray-100 dark:divide-white/10">
          {notifications.map((n) => (
            <div
              key={n.id}
              className="flex items-center justify-between py-3 gap-3"
            >
              <div className="flex items-center gap-3 min-w-0">
                <CategoryAvatar
                  categoryKey={categories.find((c) => c.id === n.category)?.name}
                  icon={categories.find((c) => c.id === n.category)?.icon}
                  size={32}
                />
                <div className="min-w-0">
                  <p className="text-sm font-medium text-black dark:text-white truncate">
                    {(() => {
                      const cat = categories.find((c) => c.id === n.category);
                      return n.title || (cat ? translateCategoryLabel(t, cat.name, cat.isDefault ?? false) : null) || (n.type === "income" ? t("new_income") : t("new_expense"));
                    })()}
                  </p>
                  <p className="text-xs text-gray-400 dark:text-gray-500 flex items-center gap-1">
                    <span>{formatDate(n.executedAt)}</span>
                    {(() => {
                      const cat = categories.find((c) => c.id === n.category);
                      return cat ? <><span>•</span><span className="truncate">{translateCategoryLabel(t, cat.name, cat.isDefault ?? false)}</span></> : null;
                    })()}
                  </p>
                </div>
              </div>
              <span
                className={`text-sm font-semibold flex-shrink-0 ${
                  n.type === "income"
                    ? "text-green-600 dark:text-green-400"
                    : "text-red-500 dark:text-red-400"
                }`}
              >
                {n.type === "income" ? "+" : "-"}
                {formatCurrency(n.amount)}
              </span>
            </div>
          ))}
        </div>

        <DrawerFooter className="pt-2">
          <Button
            onClick={handleDismiss}
            className="w-full rounded-[8px] bg-budget-blue hover:bg-budget-blue/90 text-white"
          >
            {t("dismiss")}
          </Button>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  );
}
