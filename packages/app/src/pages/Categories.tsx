import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useParams, useNavigate } from 'react-router-dom';
import Layout from '@/components/Layout';
import { useBudget } from '@/contexts/BudgetContext';
import { translateCategoryLabel } from '@/lib/categoryHelpers';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Plus, X, Pencil, Eye, EyeOff, ChevronDown, ChevronUp } from 'lucide-react';
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerDescription,
  DrawerFooter,
} from '@/components/ui/drawer';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { IconPicker } from '@/components/ui/icon-picker';
import { CategoryChip } from '@/components/ui/category-chip';
import { CategoryService, type Category } from '@budget/core';

const Categories = () => {
  const { t } = useTranslation();
  const { categories, addCategory, updateCategory, deleteCategory } = useBudget();
  const { type } = useParams<{ type: string }>();
  const navigate = useNavigate();
  const [categoryType, setCategoryType] = useState<'income' | 'expense'>((type as 'income' | 'expense') || 'expense');

  useEffect(() => {
    if (type && (type === 'income' || type === 'expense')) {
      setCategoryType(type as 'income' | 'expense');
    }
  }, [type]);

  const setAndNavigateType = (newType: 'income' | 'expense') => {
    setCategoryType(newType);
    navigate(`/categories/${newType}`);
  };
  const [newDialogOpen, setNewDialogOpen] = useState(false);
  const [categoryName, setCategoryName] = useState('');
  const [categoryIcon, setCategoryIcon] = useState('');
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);
  const [editName, setEditName] = useState('');
  const [editIcon, setEditIcon] = useState('');
  const [showHidden, setShowHidden] = useState(false);
  // Track which card has its action buttons revealed (tap to reveal on mobile)
  const [activeCardId, setActiveCardId] = useState<string | null>(null);

  const visibleCategories = categories.filter((c) => c.type === categoryType && !c.hidden);
  const hiddenCategories = categories.filter((c) => c.type === categoryType && c.hidden);
  // keep old name for backward compat with the rest of the file
  const filteredCategories = visibleCategories;

  const handleAddCategory = async () => {
    if (!categoryName || !categoryIcon) return;
    await addCategory({
      name: categoryName,
      icon: categoryIcon,
      type: categoryType,
      color: '#0B75C2',
    });
    setNewDialogOpen(false);
    setCategoryName('');
    setCategoryIcon('');
  };

  const handleStartEdit = (category: Category) => {
    setEditingCategory(category);
    setEditName(category.name);
    setEditIcon(category.icon || '');
  };

  const handleUpdateCategory = async () => {
    if (!editingCategory || !editName || !editIcon) return;
    await updateCategory(editingCategory.id, {
      name: editName,
      icon: editIcon,
    });
    setEditingCategory(null);
    setEditName('');
    setEditIcon('');
  };

  return (
    <Layout>
      <div className="min-h-screen bg-white dark:bg-[#1A2124] transition-colors duration-300">
        {/* Type Toggle - Moved below Layout header */}
        <div className="bg-white dark:bg-[#1A2124] border-b border-gray-200 dark:border-white/10 sticky top-0 z-[15]">
          <div className="max-w-2xl mx-auto flex">
            {(['income', 'expense'] as const).map((tType) => (
              <button
                key={tType}
                onClick={() => setAndNavigateType(tType)}
                className={`flex-1 py-3 text-sm font-bold transition-all border-b-2 ${
                  categoryType === tType
                    ? 'text-black dark:text-white border-budget-blue'
                    : 'text-gray-400 border-transparent hover:text-gray-600'
                }`}
              >
                {t(tType === 'income' ? 'income' : 'expense')}
              </button>
            ))}
          </div>
        </div>

        <div className="max-w-2xl mx-auto px-5 py-6">
          <div className="grid grid-cols-3 gap-4" data-testid="category-grid">
            {/* Add category button as first grid item */}
            <button
              data-testid="add-category-fab"
              aria-label={t('add_category')}
              onClick={() => {
                setCategoryName('');
                setCategoryIcon('');
                setNewDialogOpen(true);
              }}
              className="flex flex-col items-center justify-center w-full min-h-[125px] py-6 rounded-[8px] bg-white dark:bg-transparent border-2 border-dashed border-black/10 dark:border-white/20 hover:border-black dark:hover:border-white hover:bg-black/5 dark:hover:bg-white/5 shadow-sm transition-all text-black dark:text-white"
            >
              <Plus className="h-8 w-8" />
            </button>
            {filteredCategories.map((category) => (
              <div key={category.id} className="relative group flex flex-col">
                <CategoryChip
                  categoryKey={category.name}
                  icon={category.icon}
                  color={CategoryService.resolveColor(category)}
                  label={translateCategoryLabel(t, category.name, category.isDefault ?? false)}
                  selected={false}
                  onClick={() => setActiveCardId(activeCardId === category.id ? null : category.id)}
                  className="focus:ring-0 focus:ring-offset-0 bg-white dark:bg-white/5 text-black dark:text-white border border-black/10 dark:border-white/10 shadow-sm"
                  data-testid="category-chip"
                />
                {/* Action buttons — visible when card is tapped (mobile) or hovered (desktop) */}
                <div className={`absolute -top-1 -right-1 flex gap-1 z-10 transition-opacity ${
                  activeCardId === category.id ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
                }`}>
                  {/* Hide toggle — available for all categories including defaults */}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      updateCategory(category.id, { hidden: true });
                      setActiveCardId(null);
                    }}
                    aria-label={`${t('hide_category')} ${translateCategoryLabel(t, category.name, category.isDefault ?? false)}`}
                    data-testid={`hide-category-${category.name.replace('category_', '').toLowerCase().replace(/\s+/g, '-')}`}
                    className="w-5 h-5 bg-white text-[#1A2124] rounded-full flex items-center justify-center text-xs shadow-md border border-white/20 hover:bg-white/90"
                  >
                    <EyeOff className="h-3 w-3" />
                  </button>
                  {!category.isDefault && (
                    <>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleStartEdit(category);
                          setActiveCardId(null);
                        }}
                        aria-label={`Edit ${category.name}`}
                        data-testid={`edit-category-${category.name.replace('category_', '').toLowerCase().replace(/\s+/g, '-')}`}
                        className="w-5 h-5 bg-white text-[#1A2124] rounded-full flex items-center justify-center text-xs shadow-md border border-white/20 hover:bg-white/90"
                      >
                        <Pencil className="h-3 w-3" />
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setDeleteId(category.id);
                          setActiveCardId(null);
                        }}
                        aria-label={`Delete ${category.name}`}
                        data-testid={`delete-category-${category.name.replace('category_', '').toLowerCase().replace(/\s+/g, '-')}`}
                        className="w-5 h-5 bg-white text-[#1A2124] rounded-full flex items-center justify-center text-xs shadow-md border border-white/20 hover:bg-white/90"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </>
                  )}
                </div>
              </div>
            ))}
            {filteredCategories.length === 0 && (
              <div className="col-span-full py-10 text-center">
                <p className="text-gray-500 dark:text-gray-400 text-sm">{t('no_categories')}</p>
              </div>
            )}
          </div>

          {/* Hidden categories section — always visible so users discover the feature */}
          <div className="mt-6">
            <button
              onClick={() => setShowHidden((prev) => !prev)}
              className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 transition-colors mb-4"
              data-testid="toggle-hidden-categories"
              aria-expanded={showHidden}
            >
              {showHidden ? (
                <ChevronUp className="h-4 w-4" />
              ) : (
                <ChevronDown className="h-4 w-4" />
              )}
              {showHidden ? t('hide_hidden_categories') : t('show_hidden_categories')} ({hiddenCategories.length})
            </button>

            {showHidden && hiddenCategories.length > 0 && (
              <div className="grid grid-cols-3 gap-4" data-testid="hidden-category-grid">
                  {hiddenCategories.map((category) => (
                    <div key={category.id} className="relative group flex flex-col opacity-50">
                      <CategoryChip
                        categoryKey={category.name}
                        icon={category.icon}
                        color={CategoryService.resolveColor(category)}
                        label={translateCategoryLabel(t, category.name, category.isDefault ?? false)}
                        selected={false}
                        onClick={() => setActiveCardId(activeCardId === category.id ? null : category.id)}
                        className="focus:ring-0 focus:ring-offset-0 bg-white dark:bg-white/5 text-black dark:text-white border border-black/10 dark:border-white/10 shadow-sm"
                        data-testid="hidden-category-chip"
                      />
                      <div className={`absolute -top-1 -right-1 flex gap-1 z-10 transition-opacity ${
                        activeCardId === category.id ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
                      }`}>
                        {/* Restore button */}
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            updateCategory(category.id, { hidden: false });
                            setActiveCardId(null);
                          }}
                          aria-label={`${t('show_category')} ${translateCategoryLabel(t, category.name, category.isDefault ?? false)}`}
                          data-testid={`show-category-${category.name.replace('category_', '').toLowerCase().replace(/\s+/g, '-')}`}
                          className="w-5 h-5 bg-white text-[#1A2124] rounded-full flex items-center justify-center text-xs shadow-md border border-white/20 hover:bg-white/90"
                        >
                          <Eye className="h-3 w-3" />
                        </button>
                        {!category.isDefault && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setDeleteId(category.id);
                              setActiveCardId(null);
                            }}
                            aria-label={`Delete ${category.name}`}
                            data-testid={`delete-hidden-category-${category.name.replace('category_', '').toLowerCase().replace(/\s+/g, '-')}`}
                            className="w-5 h-5 bg-white text-[#1A2124] rounded-full flex items-center justify-center text-xs shadow-md border border-white/20 hover:bg-white/90"
                          >
                            <X className="h-3 w-3" />
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
            )}
          </div>
        </div>

        {/* Add Category Drawer */}
        <Drawer open={newDialogOpen} onOpenChange={setNewDialogOpen}>
          <DrawerContent className="bg-white dark:bg-[#1A2124] border-gray-200 dark:border-white/10">
            <DrawerHeader>
              <DrawerTitle className="text-black dark:text-white">
                {categoryType === 'income' ? t('new_income') : t('new_expense')} {t('category')}
              </DrawerTitle>
              <DrawerDescription className="sr-only">
                {t('add_category_description', 'Form to add a new category')}
              </DrawerDescription>
            </DrawerHeader>
            <div className="px-4 py-2 space-y-4 overflow-y-auto flex-1">
              {/* Category Name Input */}
              <div className="space-y-2">
                <label htmlFor="name" className="text-sm font-medium text-black dark:text-white">
                  {t('category')}
                </label>
                <Input
                  id="name"
                  value={categoryName}
                  onChange={(e) => setCategoryName(e.target.value)}
                  placeholder={t('category')}
                  className="w-full bg-white dark:bg-white/5 text-black dark:text-white border border-black/10 dark:border-white/10 shadow-sm"
                  data-testid="category-name-input"
                />
              </div>
              {/* Icon Picker */}
              <div className="space-y-2">
                <IconPicker value={categoryIcon} onChange={setCategoryIcon} />
              </div>
            </div>
            <DrawerFooter className="flex-row gap-3 pt-3 pb-4">
              <Button
                type="button"
                variant="outline"
                onClick={() => setNewDialogOpen(false)}
                className="flex-1"
              >
                {t('cancel')}
              </Button>
              <Button
                type="button"
                onClick={handleAddCategory}
                disabled={!categoryName || !categoryIcon}
                className="flex-1 bg-budget-blue hover:bg-budget-blue/90 text-white"
                data-testid="save-category-button"
              >
                {t('save')}
              </Button>
            </DrawerFooter>
          </DrawerContent>
        </Drawer>

        {/* Edit Category Drawer */}
        <Drawer open={!!editingCategory} onOpenChange={(open) => !open && setEditingCategory(null)}>
          <DrawerContent className="bg-white dark:bg-[#1A2124] border-gray-200 dark:border-white/10">
            <DrawerHeader>
              <DrawerTitle className="text-black dark:text-white">
                {t('edit_category')}
              </DrawerTitle>
              <DrawerDescription className="sr-only">
                {t('edit_category_description', 'Edit category name, icon and color')}
              </DrawerDescription>
            </DrawerHeader>
            <div className="px-4 py-2 space-y-4 overflow-y-auto flex-1">
              {/* Category Name Input */}
              <div className="space-y-2">
                <label htmlFor="edit-name" className="text-sm font-medium text-black dark:text-white">
                  {t('category')}
                </label>
                <Input
                  id="edit-name"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  placeholder={t('category')}
                  className="w-full bg-white dark:bg-white/5 text-black dark:text-white border border-black/10 dark:border-white/10 shadow-sm"
                  data-testid="edit-category-name-input"
                />
              </div>
              {/* Icon Picker */}
              <div className="space-y-2">
                <IconPicker value={editIcon} onChange={setEditIcon} />
              </div>
            </div>
            <DrawerFooter className="flex-row gap-3 pt-3 pb-4">
              <Button
                type="button"
                variant="outline"
                onClick={() => setEditingCategory(null)}
                className="flex-1"
              >
                {t('cancel')}
              </Button>
              <Button
                type="button"
                onClick={handleUpdateCategory}
                disabled={!editName || !editIcon}
                className="flex-1 bg-budget-blue hover:bg-budget-blue/90 text-white"
                data-testid="update-category-button"
              >
                {t('save')}
              </Button>
            </DrawerFooter>
          </DrawerContent>
        </Drawer>

        {/* Delete Confirmation Dialog */}
        <AlertDialog open={!!deleteId} onOpenChange={(open) => !open && setDeleteId(null)}>
          <AlertDialogContent className="max-w-md max-h-[90vh] overflow-y-auto bg-white dark:bg-[#1A2124] border-gray-200 dark:border-white/10">
            <AlertDialogHeader>
              <AlertDialogTitle>{t('delete_category')}</AlertDialogTitle>
              <AlertDialogDescription>{t('are_you_sure_delete_category')}</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter className="flex-row gap-3">
              <AlertDialogCancel
                className="flex-1 mt-0"
                onClick={() => setDeleteId(null)}
              >
                {t('cancel')}
              </AlertDialogCancel>
              <AlertDialogAction
                className="flex-1 bg-destructive hover:bg-destructive/90 text-white"
                onClick={async () => {
                  if (deleteId) await deleteCategory(deleteId);
                  setDeleteId(null);
                }}
                data-testid="confirm-delete-category-button"
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

export default Categories;
