import * as React from "react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import {
  allCategoryIcons,
  getIconPath,
  type AllIconKey,
} from "@/lib/category-icons";
import {
  ShoppingBag, Utensils, Home, Bus, Star, Activity, Wallet,
  Briefcase, Wifi, Gift, Heart, Tv, Phone, Plane, Zap, Smile,
  PiggyBank, PartyPopper, BookOpen, ArrowLeftRight, MoreHorizontal,
  Car, Coffee, Dumbbell, GraduationCap, Music, Camera, Palette,
  Scissors, Stethoscope, Baby, Dog, Bike, Fuel, Train, Umbrella,
  Wrench, Leaf, Globe, Mail, Gamepad2, Pizza, Wine,
  type LucideIcon,
} from "lucide-react";

export interface IconPickerProps {
  value?: string;
  onChange: (iconKey: string) => void;
  className?: string;
}

const LUCIDE_ICONS: { key: string; icon: LucideIcon }[] = [
  { key: "lucide:shopping", icon: ShoppingBag },
  { key: "lucide:food", icon: Utensils },
  { key: "lucide:home", icon: Home },
  { key: "lucide:bus", icon: Bus },
  { key: "lucide:star", icon: Star },
  { key: "lucide:health", icon: Activity },
  { key: "lucide:wallet", icon: Wallet },
  { key: "lucide:briefcase", icon: Briefcase },
  { key: "lucide:wifi", icon: Wifi },
  { key: "lucide:gift", icon: Gift },
  { key: "lucide:heart", icon: Heart },
  { key: "lucide:tv", icon: Tv },
  { key: "lucide:phone", icon: Phone },
  { key: "lucide:plane", icon: Plane },
  { key: "lucide:zap", icon: Zap },
  { key: "lucide:smile", icon: Smile },
  { key: "lucide:piggybank", icon: PiggyBank },
  { key: "lucide:party", icon: PartyPopper },
  { key: "lucide:book", icon: BookOpen },
  { key: "lucide:transfer", icon: ArrowLeftRight },
  { key: "lucide:car", icon: Car },
  { key: "lucide:coffee", icon: Coffee },
  { key: "lucide:gym", icon: Dumbbell },
  { key: "lucide:education", icon: GraduationCap },
  { key: "lucide:music", icon: Music },
  { key: "lucide:camera", icon: Camera },
  { key: "lucide:art", icon: Palette },
  { key: "lucide:scissors", icon: Scissors },
  { key: "lucide:medical", icon: Stethoscope },
  { key: "lucide:baby", icon: Baby },
  { key: "lucide:pet", icon: Dog },
  { key: "lucide:bike", icon: Bike },
  { key: "lucide:fuel", icon: Fuel },
  { key: "lucide:train", icon: Train },
  { key: "lucide:umbrella", icon: Umbrella },
  { key: "lucide:tools", icon: Wrench },
  { key: "lucide:nature", icon: Leaf },
  { key: "lucide:globe", icon: Globe },
  { key: "lucide:mail", icon: Mail },
  { key: "lucide:gaming", icon: Gamepad2 },
  { key: "lucide:pizza", icon: Pizza },
  { key: "lucide:wine", icon: Wine },
  { key: "lucide:more", icon: MoreHorizontal },
];

const LUCIDE_MAP = new Map(LUCIDE_ICONS.map(({ key, icon }) => [key, icon]));

const CATEGORY_COLORS = [
  "#CE7D62", // orange
  "#452FA8", // purple
  "#2E9DDC", // blue
  "#C82EDC", // pink
  "#3FCB72", // green
  "#FF6B6B", // coral
  "#4ECDC4", // teal
  "#45B7D1", // sky
  "#FFBE0B", // amber
  "#FB5607", // orange-red
  "#FF006E", // magenta
  "#8338EC", // violet
  "#3A86FF", // azure
];

/** Resolve a `lucide:*` icon key to a React element. Returns null if not found. */
export function getLucideIcon(key: string | undefined, size = 24, strokeWidth = 2.5, className?: string): React.ReactNode {
  if (!key?.startsWith("lucide:")) return null;
  const Icon = LUCIDE_MAP.get(key);
  if (!Icon) return null;
  return <Icon style={{ width: size, height: size }} strokeWidth={strokeWidth} className={className} />;
}

const IconPicker = React.forwardRef<HTMLDivElement, IconPickerProps>(
  ({ value, onChange, className }, ref) => {
    const { t } = useTranslation();
    const svgIconKeys = Object.keys(allCategoryIcons) as AllIconKey[];

    return (
      <div ref={ref} className={cn("w-full", className)}>
        <p className="text-sm text-muted-foreground mb-2">{t('select_icon')}</p>
        {/* Uncapped and not its own scroll region, matching the category chip
            grid: the drawer body is the single scroll region, so no icon sits
            behind a fold. */}
        <div className="grid grid-cols-4 gap-4 p-1">
          {/* SVG preset icons */}
          {svgIconKeys.map((key, index) => {
            const iconPath = getIconPath(key);
            const isSelected = value === key;
            const color = CATEGORY_COLORS[index % CATEGORY_COLORS.length];

            return (
              <button
                key={key}
                type="button"
                onClick={() => onChange(key)}
                data-testid={`icon-${key}`}
                className={cn(
                  "w-14 h-14 rounded-full flex items-center justify-center transition-all duration-200",
                  isSelected
                    ? "ring-4 ring-budget-blue ring-offset-2 scale-110 z-10"
                    : "hover:scale-110",
                  "focus:outline-none focus:ring-2 focus:ring-budget-blue"
                )}
                style={{ backgroundColor: color }}
              >
                {iconPath ? (
                  <img
                    src={iconPath}
                    alt={key}
                    className="w-8 h-8 object-contain pointer-events-none"
                    style={{ filter: "brightness(0) invert(1)" }}
                  />
                ) : (
                  <span className="text-xl text-white font-bold">{key[0].toUpperCase()}</span>
                )}
              </button>
            );
          })}

          {/* Lucide icons */}
          {LUCIDE_ICONS.map(({ key, icon: Icon }, index) => {
            const isSelected = value === key;
            // Offset the index so Lucide icons get different colors than SVG icons if possible
            const color = CATEGORY_COLORS[(index + svgIconKeys.length) % CATEGORY_COLORS.length];

            return (
              <button
                key={key}
                type="button"
                onClick={() => onChange(key)}
                data-testid={`icon-${key}`}
                className={cn(
                  "w-14 h-14 rounded-full flex items-center justify-center transition-all duration-200",
                  isSelected
                    ? "ring-4 ring-budget-blue ring-offset-2 scale-110 z-10"
                    : "hover:scale-110",
                  "focus:outline-none focus:ring-2 focus:ring-budget-blue"
                )}
                style={{ backgroundColor: color }}
              >
                <Icon className="w-8 h-8 text-white pointer-events-none" strokeWidth={2.5} />
              </button>
            );
          })}
        </div>
      </div>
    );
  }
);

IconPicker.displayName = "IconPicker";

export { IconPicker, LUCIDE_ICONS };
