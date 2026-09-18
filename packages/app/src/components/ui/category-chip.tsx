import * as React from "react";
import { cn } from "@/lib/utils";
import { CategoryAvatar } from "@/components/CategoryAvatar";

export interface CategoryChipProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  icon?: string;
  categoryKey?: string;
  label: string;
  color?: string;
  selected?: boolean;
}

const CategoryChip = React.forwardRef<HTMLButtonElement, CategoryChipProps>(
  ({ className, icon, categoryKey, label, color, selected = false, ...props }, ref) => {
    const selectedClasses = "bg-[#3A464F] dark:bg-white text-white dark:text-black border-[#3A464F] dark:border-white shadow-lg scale-105 z-10";

    return (
      <button
        ref={ref}
        type="button"
        data-testid="category-chip"
        className={cn(
          "flex flex-col items-center justify-center py-6 px-4 rounded-[8px] transition-all w-full h-full min-h-[125px]",
          "relative pointer-events-auto group border border-solid",
          "focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
          selected
            ? selectedClasses
            : "bg-white dark:bg-white/5 border border-black/10 dark:border-white/10 text-foreground dark:text-white hover:bg-gray-50 dark:hover:bg-white/10 shadow-sm",
          className
        )}
        {...props}
      >
        <div className="flex-shrink-0 mb-3">
          <CategoryAvatar
          categoryKey={categoryKey}
            icon={icon}
            size={42}
            color={color}
            alt={label}
          />
        </div>

        <span className={cn(
          "text-xs text-center leading-tight transition-all break-words",
          selected
            ? "font-bold scale-105 opacity-100"
            : "font-medium opacity-80"
        )}>
          {label}
        </span>
      </button>
    );
  }
);

CategoryChip.displayName = "CategoryChip";

export { CategoryChip };
