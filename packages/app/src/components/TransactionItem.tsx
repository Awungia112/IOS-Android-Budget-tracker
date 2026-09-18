import { formatCurrency, formatDate } from "@/lib/formatters";
import { useBudget } from "@/contexts/BudgetContext";
import { Transaction } from "@budget/core";
import { cn } from "@/lib/utils";
import { X, Pen } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerDescription,
  DrawerTrigger,
} from "@/components/ui/drawer";
import { Button } from "@/components/ui/button";
import { useState } from "react";
import TransactionForm from "./TransactionForm";
import { useTranslation } from "react-i18next";
import { translateCategoryLabel } from "@/lib/categoryHelpers";

interface TransactionItemProps {
  transaction: Transaction;
}

export default function TransactionItem({ transaction }: TransactionItemProps) {
  const { deleteTransaction, categories } = useBudget();
  const { t, i18n } = useTranslation();
  const language = i18n.language;
  const [editDrawerOpen, setEditDrawerOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);

  const category = categories.find((c) => c.id === transaction.category);

  const formattedDate = formatDate(transaction.date);

  const handleDelete = async () => {
    try {
      await deleteTransaction(transaction.id);
      setDeleteDialogOpen(false);
    } catch (error) {
      console.error("Failed to delete transaction:", error);
    }
  };

  return (
    <div
      className="grid items-start gap-3 p-4 hover:bg-gray-50 dark:hover:bg-slate-800/50 transition-colors"
      style={{ gridTemplateColumns: "minmax(0, 1fr) 32px 90px 32px" }}
      data-testid="transaction-item"
    >
      {/* Left - Transaction info */}
      <div className="flex-1 min-w-0">
        <div
          className="font-bold text-black dark:text-slate-100"
          data-testid="transaction-title"
        >
          {transaction.title ||
            (category ? translateCategoryLabel(t, category.name, category.isDefault ?? false) : null) ||
            (transaction.type === "income"
              ? t("new_income")
              : t("new_expense"))}
        </div>
        <div className="text-xs text-muted-foreground dark:text-slate-400 flex items-center gap-2 mt-1">
          <span>{formattedDate}</span>
          <span>•</span>
          <span className="truncate text-muted-foreground dark:text-slate-500">
            {category ? translateCategoryLabel(t, category.name, category.isDefault ?? false) : ""}
          </span>
        </div>
      </div>

      {/* Middle - Edit button */}
      <Drawer open={editDrawerOpen} onOpenChange={setEditDrawerOpen}>
        <DrawerTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setEditDrawerOpen(true)}
            className="h-8 w-8 justify-self-center text-muted-foreground/60 hover:text-red-600 dark:hover:text-red-400"
            data-testid="transaction-edit-button"
          >
            <Pen />
          </Button>
        </DrawerTrigger>
        <DrawerContent className="bg-white dark:bg-[#1A2124]">
          <DrawerHeader>
            <DrawerTitle className="text-black dark:text-white">
              {transaction.type === "income"
                ? t("edit_income")
                : t("edit_expense")}
            </DrawerTitle>
            <DrawerDescription className="sr-only">
              {t(
                "edit_transaction_description",
                "Form to edit this transaction",
              )}
            </DrawerDescription>
          </DrawerHeader>
          <div className="px-4 pb-4 overflow-y-auto flex-1">
            <TransactionForm
              type={transaction.type}
              onSave={() => setEditDrawerOpen(false)}
              onCancel={() => setEditDrawerOpen(false)}
              editTransaction={transaction}
            />
          </div>
        </DrawerContent>
      </Drawer>

      {/* Amount */}
      <span
        className={cn(
          "font-medium whitespace-nowrap text-right",
          transaction.type === "income"
            ? "text-budget-green"
            : "text-budget-red",
        )}
      >
        {transaction.type === "income" ? "+" : "-"}
        {formatCurrency(transaction.amount)}
      </span>

      {/* Delete button */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setDeleteDialogOpen(true)}
            className="h-8 w-8 justify-self-center"
            data-testid="transaction-delete-button"
          >
            <X className="h-4 w-4" />
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent className="rounded-[12px] w-full max-w-sm px-6 bg-white dark:bg-[#1A2124] border-gray-200 dark:border-white/10 shadow-lg">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-lg font-semibold text-black dark:text-white">
              {t("delete")}
            </AlertDialogTitle>
            <AlertDialogDescription className="text-gray-500 dark:text-gray-400">
              {t("delete_confirmation")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-row gap-3 sm:gap-3">
            <AlertDialogCancel className="flex-1 rounded-[8px] mt-0 bg-gray-100 dark:bg-white/10 text-black dark:text-white border-gray-200 dark:border-white/10 hover:bg-gray-200 dark:hover:bg-white/20">
              {t("cancel")}
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-red-600 hover:bg-red-700"
              data-testid="transaction-delete-confirm-button"
            >
              {t("delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
