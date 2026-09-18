/**
 * Category Helper Utilities
 * Decouples UI configuration (icons, colors) from translated labels
 * Uses stable category keys instead of translated names
 */



/**
 * Stable category keys - use these instead of translated names
 * These should match the category names in the database
 */
export enum CategoryKey {
    // Shopping
    SHOPPING = "shopping",
    CLOTHING = "clothing",

    // Food
    FOOD = "food",
    MEALS = "meals",
    RESTAURANT = "restaurant",

    // Housing
    HOUSING = "housing",
    LIVING = "wohnen",
    HOUSEHOLD = "haushalt",

    // Transport
    TRANSPORT = "transport",
    BUS = "bus",
    TRANSIT = "transit",

    // Leisure & Entertainment
    LEISURE = "leisure",
    ENTERTAINMENT = "entertainment",
    HOBBY = "hobby",
    GOING_OUT = "going_out",

    // Health
    HEALTH = "health",
    MEDICAL = "medical",

    // Utilities
    UTILITIES = "utilities",
    ELECTRICITY = "strom",
    INTERNET = "internet",
    WIFI = "wifi",
    MOBILE = "mobile",
    PHONE = "phone",

    // Finance & Work
    SALARY = "salary",
    INCOME = "income",
    ALLOWANCE = "allowance",
    OFFICE = "office",

    // Travel & Vacation
    TRAVEL = "travel",
    TRIP = "trip",
    VACATION = "vacation",
    // Gifts
    GIFT = "gift",

    // Holiday / Side Jobs
    HOLIDAY_JOB = "holiday_job",

    // Transfer
    TRANSFER = "transfer",

    // Books
    BOOKS = "books",

    // Youth-focused
    TUTORING = "tutoring",
    SELLING_ONLINE = "selling_online",
    BABYSITTING = "babysitting",
    SCHOLARSHIP = "scholarship",
    CASHBACK = "cashback",
    SUBSCRIPTIONS = "subscriptions",
    PERSONAL_CARE = "personal_care",
    EDUCATION = "education",
    SPORTS = "sports",

    // Miscellaneous
    GENERAL = "general",
    MISCELLANEOUS = "miscellaneous",
    MISC = "misc",
    OTHER = "andere",
    SONSTIGES = "sonstiges",
}

/**
 * Normalize category name to stable key
 * Handles both German and English variants
 * Also handles translation key format (category_bus -> bus)
 */
export const normalizeCategoryKey = (name: string): string => {
    const raw = (name || "").toLowerCase().trim();
    const isTranslationKey = raw.startsWith("category_");
    const normalized = isTranslationKey ? raw.replace("category_", "") : raw;

    // Create a mapping of all variants to their canonical key
    const variants: Record<string, string> = {
        // Shopping
        shopping: "shopping",
        einkaufen: "shopping",
        clothing: "clothing",
        kleidung: "clothing",

        // Food
        food: "food",
        essen: "food",
        lebensmittel: "food",     // de: category_food
        meals: "meals",
        mahlzeiten: "meals",      // de: category_meals
        restaurant: "restaurant",

        // Housing
        housing: "housing",
        house: "housing",
        household: "household",
        wohnen: "housing",
        haushalt: "household",

        // Transport
        transport: "transport",
        bus: "bus",
        transit: "transit",
        öpnv: "transit",          // de: category_transit

        // Leisure
        leisure: "leisure",
        freizeit: "leisure",
        entertainment: "entertainment",
        unterhaltung: "entertainment", // de: category_entertainment
        hobby: "hobby",
        hobbies: "hobby",
        going_out: "going_out",
        goingout: "going_out",
        "going-out": "going_out",
        "going out": "going_out",      // en: category_going_out
        ausgehen: "going_out",
        party: "party",

        // Savings
        savings: "savings",
        sparen: "savings",
        schatz: "savings",

        // Health
        health: "health",
        gesundheit: "health",
        medical: "medical",
        medizinisch: "medical",   // de: category_medical

        // Utilities
        utilities: "utilities",
        strom: "utilities",
        nebenkosten: "utilities",
        internet: "internet",
        web: "internet",
        wifi: "wifi",
        wlan: "wifi",             // de: category_wifi
        mobile: "mobile",
        mobil: "mobile",          // de: category_mobile
        phone: "phone",
        telefon: "phone",         // de: category_phone
        handy: "mobile",

        // Finance
        salary: "salary",
        gehalt: "salary",         // de: category_salary
        lohn: "salary",
        income: "income",
        allowance: "allowance",
        taschengeld: "allowance",
        "pocket money": "allowance", // en: category_allowance
        office: "office",
        büro: "office",
        buro: "office",

        // Travel
        travel: "travel",
        trip: "travel",
        vacation: "vacation",
        urlaub: "vacation",
        reise: "travel",
        reisen: "travel",         // de: category_travel

        // Gifts
        gift: "gift",
        geschenk: "gift",

        // Holiday Job
        holiday_job: "holiday_job",
        ferienjob: "holiday_job",
        "holiday job": "holiday_job",

        // Transfer
        transfer: "transfer",
        umbuchung: "transfer",

        // Books
        books: "books",
        bücher: "books",
        bucher: "books",

        // Youth-focused
        tutoring: "tutoring",
        nachhilfe: "tutoring",
        selling_online: "selling_online",
        "selling online": "selling_online",
        "online-verkauf": "selling_online",
        babysitting: "babysitting",
        babysitten: "babysitting",
        scholarship: "scholarship",
        stipendium: "scholarship",
        cashback: "cashback",
        subscriptions: "subscriptions",
        abonnements: "subscriptions",
        personal_care: "personal_care",
        "personal care": "personal_care",
        körperpflege: "personal_care",
        korperpflege: "personal_care",
        education: "education",
        bildung: "education",
        sports: "sports",
        sport: "sports",

        // Miscellaneous
        general: "general",
        allgemein: "general",     // de: category_general
        miscellaneous: "miscellaneous",
        misc: "misc",
        andere: "other",
        other: "other",
        sonstiges: "other",
    };

    const mapped = variants[normalized];
    if (mapped) return mapped;
    return isTranslationKey ? raw : normalized;
};

/**
 * Get category color by normalized key
 */
export const getCategoryColor = (categoryKey: string): string => {
    const key = normalizeCategoryKey(categoryKey);

    const colors: Record<string, string> = {
        // Shopping
        [CategoryKey.SHOPPING]: "#EC4899", // Pink
        [CategoryKey.CLOTHING]: "#EC4899", // Pink

        // Food
        [CategoryKey.FOOD]: "#06B6D4", // Cyan
        [CategoryKey.MEALS]: "#06B6D4", // Cyan
        [CategoryKey.RESTAURANT]: "#06B6D4", // Cyan

        // Housing
        [CategoryKey.HOUSING]: "#7C3AED", // Purple
        [CategoryKey.LIVING]: "#7C3AED", // Purple
        [CategoryKey.HOUSEHOLD]: "#7C3AED", // Purple

        // Transport
        [CategoryKey.TRANSPORT]: "#F59E0B", // Amber
        [CategoryKey.BUS]: "#F59E0B", // Amber
        [CategoryKey.TRANSIT]: "#F59E0B", // Amber

        // Leisure
        [CategoryKey.LEISURE]: "#10B981", // Green
        [CategoryKey.ENTERTAINMENT]: "#3B82F6", // Blue
        [CategoryKey.HOBBY]: "#A855F7", // Violet
        [CategoryKey.GOING_OUT]: "#A78BFA", // Light Purple
        party: "#C82EDC", // Magenta

        // Savings
        savings: "#3FCB72", // Teal

        // Health
        [CategoryKey.HEALTH]: "#EF4444", // Red
        [CategoryKey.MEDICAL]: "#EF4444", // Red

        // Utilities
        [CategoryKey.UTILITIES]: "#FBBF24", // Gold
        [CategoryKey.ELECTRICITY]: "#FBBF24", // Gold
        [CategoryKey.INTERNET]: "#0EA5E9", // Sky Blue
        [CategoryKey.WIFI]: "#0EA5E9", // Sky Blue
        [CategoryKey.MOBILE]: "#6366F1", // Indigo
        [CategoryKey.PHONE]: "#6366F1", // Indigo

        // Finance
        [CategoryKey.SALARY]: "#059669", // Emerald
        [CategoryKey.INCOME]: "#059669", // Emerald
        [CategoryKey.ALLOWANCE]: "#84CC16", // Lime
        [CategoryKey.OFFICE]: "#64748B", // Slate

        // Travel
        [CategoryKey.TRAVEL]: "#14B8A6", // Teal
        [CategoryKey.TRIP]: "#14B8A6", // Teal
        [CategoryKey.VACATION]: "#14B8A6", // Teal

        // Gifts
        [CategoryKey.GIFT]: "#F472B6", // Rose

        // Holiday Job
        [CategoryKey.HOLIDAY_JOB]: "#059669", // Emerald

        // Transfer
        [CategoryKey.TRANSFER]: "#6366F1", // Indigo

        // Books
        [CategoryKey.BOOKS]: "#8B5CF6", // Purple-Blue

        // Youth-focused
        [CategoryKey.TUTORING]: "#059669", // Emerald
        [CategoryKey.SELLING_ONLINE]: "#F59E0B", // Amber
        [CategoryKey.BABYSITTING]: "#EC4899", // Pink
        [CategoryKey.SCHOLARSHIP]: "#3B82F6", // Blue
        [CategoryKey.CASHBACK]: "#10B981", // Green
        [CategoryKey.SUBSCRIPTIONS]: "#6366F1", // Indigo
        [CategoryKey.PERSONAL_CARE]: "#F472B6", // Rose
        [CategoryKey.EDUCATION]: "#3B82F6", // Blue
        [CategoryKey.SPORTS]: "#10B981", // Green

        // Miscellaneous
        [CategoryKey.GENERAL]: "#8B5CF6", // Purple-Blue
        [CategoryKey.MISCELLANEOUS]: "#8B5CF6", // Purple-Blue
        [CategoryKey.MISC]: "#8B5CF6", // Purple-Blue
        [CategoryKey.OTHER]: "#8B5CF6", // Purple-Blue
        [CategoryKey.SONSTIGES]: "#8B5CF6", // Purple-Blue
    };

    // eslint-disable-next-line security/detect-object-injection -- key is validated enum value/safe access pattern
    return colors[key] || "#8B5CF6"; // Default to purple-blue
};

/**
 * Translate category name using i18n
 * Normalizes the key first, then looks up translation
 * Falls back to original name if no translation found
 */
export const translateCategoryLabel = (
    t: (key: string) => string,
    name: string,
    idOrIsDefault?: boolean
): string => {
    const normalizedKey = normalizeCategoryKey(name);
    const translationKey = normalizedKey.startsWith("category_")
        ? normalizedKey
        : `category_${normalizedKey}`;

    // If caller explicitly passed `false`, treat as user-created — do not translate.
    // Preserve the original name exactly as stored (even if it looks like a
    // translation key such as "category_food"). UI display should not remap
    // user-provided keys to system defaults.
    if (idOrIsDefault === false) return name;

    const translated = t(translationKey);

    // If caller passed `true`, the category is definitively a default — translate it.
    // Fall back to the stored name if the translation key wasn't found (e.g. a system
    // row that doesn't match any shipped default, or the locale hasn't loaded yet).
    // Do NOT reconstruct from the key — the stored name already has correct casing
    // and handles umlauts / special characters that \b\w would mangle.
    if (idOrIsDefault === true) {
        if (translated !== translationKey) return translated;
        return name;
    }

    // No hint provided — attempt translation, otherwise preserve as-is.
    if (translated !== translationKey) return translated;
    return name;
};

