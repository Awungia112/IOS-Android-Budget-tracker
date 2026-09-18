import { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { getCategoryColor, normalizeCategoryKey } from "@/lib/categoryHelpers";
import { getIconPath } from "@/lib/category-icons";
import { getLucideIcon } from "@/components/ui/icon-picker";
import {
    ShoppingBag,
    Utensils,
    Home,
    Bus,
    Star,
    Info,
    Wallet,
    Briefcase,
    Wifi,
    Gift,
    Heart,
    Tv,
    Phone,
    Plane,
    Zap,
    MoreHorizontal,
    Smile,
    PiggyBank,
    PartyPopper,
    BookOpen,
    ArrowLeftRight,
    GraduationCap,
    ShoppingCart,
    Baby,
    Award,
    BadgePercent,
    MonitorPlay,
    Sparkles,
    Stethoscope,
    Dumbbell,
    Users,
} from "lucide-react";

interface CategoryAvatarProps {
    categoryKey?: string;
    icon?: string;           // Optional icon key from category.icon (takes precedence)
    size?: number;
    className?: string;
    style?: React.CSSProperties;
    color?: string; // Optional manual color override
    alt?: string;   // Optional alt text for the icon
    selected?: boolean; // New prop to handle highlighted selection
}

/**
 * Get category icon component with proportional sizing
 * Icon is scaled to cover 75% of the circle
 */
export const getCategoryIcon = (categoryKey: string, strokeWidth = 2.5): ReactNode => {
    const key = normalizeCategoryKey(categoryKey);
    const cls = "w-3/4 h-3/4";
    const sw = strokeWidth;

    const icons: Record<string, ReactNode> = {
        // Shopping
        shopping: <ShoppingBag className={cls} strokeWidth={sw} />,
        clothing: <ShoppingBag className={cls} strokeWidth={sw} />,

        // Food
        food: <Utensils className={cls} strokeWidth={sw} />,
        meals: <Utensils className={cls} strokeWidth={sw} />,
        restaurant: <Utensils className={cls} strokeWidth={sw} />,

        // Housing
        housing: <Home className={cls} strokeWidth={sw} />,
        wohnen: <Home className={cls} strokeWidth={sw} />,
        haushalt: <Home className={cls} strokeWidth={sw} />,

        // Transport
        transport: <Bus className={cls} strokeWidth={sw} />,
        bus: <Bus className={cls} strokeWidth={sw} />,
        transit: <Bus className={cls} strokeWidth={sw} />,

        // Leisure
        leisure: <Star className={cls} strokeWidth={sw} />,
        entertainment: <Tv className={cls} strokeWidth={sw} />,
        hobby: <Heart className={cls} strokeWidth={sw} />,
        going_out: <Smile className={cls} strokeWidth={sw} />,
        party: <PartyPopper className={cls} strokeWidth={sw} />,

        // Savings
        savings: <PiggyBank className={cls} strokeWidth={sw} />,

        // Health
        health: <Stethoscope className={cls} strokeWidth={sw} />,
        medical: <Stethoscope className={cls} strokeWidth={sw} />,

        // Utilities
        utilities: <Zap className={cls} strokeWidth={sw} />,
        strom: <Zap className={cls} strokeWidth={sw} />,
        electricity: <Zap className={cls} strokeWidth={sw} />,
        internet: <Wifi className={cls} strokeWidth={sw} />,
        wifi: <Wifi className={cls} strokeWidth={sw} />,
        mobile: <Phone className={cls} strokeWidth={sw} />,
        phone: <Phone className={cls} strokeWidth={sw} />,

        // Finance
        salary: <Info className={cls} strokeWidth={sw} />,
        income: <Info className={cls} strokeWidth={sw} />,
        allowance: <Wallet className={cls} strokeWidth={sw} />,
        office: <Briefcase className={cls} strokeWidth={sw} />,

        // Travel
        travel: <Plane className={cls} strokeWidth={sw} />,
        trip: <Plane className={cls} strokeWidth={sw} />,
        vacation: <Plane className={cls} strokeWidth={sw} />,
        urlaub: <Plane className={cls} strokeWidth={sw} />,

        // Gifts
        gift: <Gift className={cls} strokeWidth={sw} />,

        // Holiday Job
        holiday_job: <Briefcase className={cls} strokeWidth={sw} />,

        // Transfer
        transfer: <ArrowLeftRight className={cls} strokeWidth={sw} />,

        // Books
        books: <BookOpen className={cls} strokeWidth={sw} />,

        // Youth-focused
        tutoring: <GraduationCap className={cls} strokeWidth={sw} />,
        selling_online: <ShoppingCart className={cls} strokeWidth={sw} />,
        babysitting: <Baby className={cls} strokeWidth={sw} />,
        scholarship: <Award className={cls} strokeWidth={sw} />,
        cashback: <BadgePercent className={cls} strokeWidth={sw} />,
        subscriptions: <MonitorPlay className={cls} strokeWidth={sw} />,
        personal_care: <Sparkles className={cls} strokeWidth={sw} />,
        education: <GraduationCap className={cls} strokeWidth={sw} />,
        sports: <Dumbbell className={cls} strokeWidth={sw} />,
        family: <Users className={cls} strokeWidth={sw} />,
        children: <Baby className={cls} strokeWidth={sw} />,

        // Miscellaneous
        general: <MoreHorizontal className={cls} strokeWidth={sw} />,
        miscellaneous: <MoreHorizontal className={cls} strokeWidth={sw} />,
        misc: <MoreHorizontal className={cls} strokeWidth={sw} />,
        andere: <MoreHorizontal className={cls} strokeWidth={sw} />,
        other: <MoreHorizontal className={cls} strokeWidth={sw} />,
        sonstiges: <MoreHorizontal className={cls} strokeWidth={sw} />,

    };

    return (
        // eslint-disable-next-line security/detect-object-injection -- key is validated enum value/safe access pattern
        icons[key] || (
            <span className={cls + " flex items-center justify-center font-bold"}>
                {key.charAt(0).toUpperCase()}
            </span>
        )
    );
};

/**
 * CategoryAvatar component - displays category icon in a colored circle
 * Icon covers 75% of the circle for consistent, visible sizing
 * If icon prop is provided (from category.icon), uses that SVG icon
 * Otherwise falls back to name-based Lucide icon lookup
 */
export function CategoryAvatar({
    categoryKey,
    icon,
    size = 40,
    className = "",
    style,
    color: manualColor, // Use manualColor alias to avoid conflict
    alt,
    selected = false,
}: CategoryAvatarProps) {
    const color = manualColor || (categoryKey ? getCategoryColor(categoryKey) : "#8B5CF6");
    const iconPath = icon ? getIconPath(icon) : undefined;
    const iconSize = Math.round(size * 0.65);

    // If selected, we don't want the background circle, but we want the icon to have the category color
    const avatarStyle = {
        width: size,
        height: size,
        ...style,
        ...(selected
            ? { backgroundColor: "transparent", color: "hsl(var(--background))" }
            : { backgroundColor: color, color: "white" }),
    };

    const lucideNode = getLucideIcon(icon, iconSize, 2.5, selected ? "text-background" : "text-white group-active:text-inherit");

    return (
        <div
            className={`rounded-full flex items-center justify-center transition-all ${className} 
                ${!selected ? "group-active:bg-transparent" : ""}`}
            style={avatarStyle}
        >
            {iconPath ? (
                <img
                    src={iconPath}
                    alt={alt || categoryKey}
                    style={{
                        width: iconSize,
                        height: iconSize,
                        objectFit: "contain",
                        filter: !selected ? "brightness(0) invert(1)" : undefined,
                    }}
                />
            ) : lucideNode ? (
                lucideNode
            ) : (
                getCategoryIcon(categoryKey || "general")
            )}
        </div>
    );
}
