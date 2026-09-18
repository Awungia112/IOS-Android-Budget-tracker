/**
 * @vitest-environment jsdom
 */

import { describe, it, expect, vi } from "vitest";
import {
  normalizeCategoryKey,
  getCategoryColor,
  translateCategoryLabel,
  CategoryKey,
} from "./categoryHelpers";

describe("normalizeCategoryKey", () => {
  describe("translation key format", () => {
    it("strips category_ prefix", () => {
      expect(normalizeCategoryKey("category_food")).toBe("food");
    });

    it("strips category_ prefix case-insensitively", () => {
      expect(normalizeCategoryKey("Category_Shopping")).toBe("shopping");
    });

    it("handles category_bus", () => {
      expect(normalizeCategoryKey("category_bus")).toBe("bus");
    });
  });

  describe("German name variants", () => {
    it("maps Essen to food", () => {
      expect(normalizeCategoryKey("Essen")).toBe("food");
    });

    it("maps Einkaufen to shopping", () => {
      expect(normalizeCategoryKey("Einkaufen")).toBe("shopping");
    });

    it("maps Wohnen to housing", () => {
      expect(normalizeCategoryKey("Wohnen")).toBe("housing");
    });

    it("maps Household to household", () => {
      expect(normalizeCategoryKey("Household")).toBe("household");
    });

    it("maps Haushalt to household", () => {
      expect(normalizeCategoryKey("Haushalt")).toBe("household");
    });

    it("maps shipped German default labels to their stable keys", () => {
      expect(normalizeCategoryKey("Lebensmittel")).toBe("food");
      expect(normalizeCategoryKey("Allgemein")).toBe("general");
      expect(normalizeCategoryKey("Unterhaltung")).toBe("entertainment");
      expect(normalizeCategoryKey("Reisen")).toBe("travel");
    });

    it("maps Freizeit to leisure", () => {
      expect(normalizeCategoryKey("Freizeit")).toBe("leisure");
    });

    it("maps Gesundheit to health", () => {
      expect(normalizeCategoryKey("Gesundheit")).toBe("health");
    });

    it("maps Lohn to salary", () => {
      expect(normalizeCategoryKey("Lohn")).toBe("salary");
    });

    it("maps Taschengeld to allowance", () => {
      expect(normalizeCategoryKey("Taschengeld")).toBe("allowance");
    });

    it("maps Geschenk to gift", () => {
      expect(normalizeCategoryKey("Geschenk")).toBe("gift");
    });

    it("maps Ferienjob to holiday_job", () => {
      expect(normalizeCategoryKey("Ferienjob")).toBe("holiday_job");
    });

    it("maps Umbuchung to transfer", () => {
      expect(normalizeCategoryKey("Umbuchung")).toBe("transfer");
    });

    it("maps Bücher to books", () => {
      expect(normalizeCategoryKey("Bücher")).toBe("books");
      expect(normalizeCategoryKey("bucher")).toBe("books");
    });

    it("maps Urlaub to vacation", () => {
      expect(normalizeCategoryKey("Urlaub")).toBe("vacation");
    });

    it("maps Sonstiges to other", () => {
      expect(normalizeCategoryKey("Sonstiges")).toBe("other");
    });
  });

  describe("English name variants", () => {
    it("maps food to food", () => {
      expect(normalizeCategoryKey("food")).toBe("food");
    });

    it("maps shopping to shopping", () => {
      expect(normalizeCategoryKey("shopping")).toBe("shopping");
    });

    it("maps salary to salary", () => {
      expect(normalizeCategoryKey("salary")).toBe("salary");
    });

    it("maps going_out to going_out", () => {
      expect(normalizeCategoryKey("going_out")).toBe("going_out");
    });

    it("maps going-out with hyphen to going_out", () => {
      expect(normalizeCategoryKey("going-out")).toBe("going_out");
    });

    it("maps holiday_job to holiday_job", () => {
      expect(normalizeCategoryKey("holiday_job")).toBe("holiday_job");
    });

    it("strips category_ prefix for new keys", () => {
      expect(normalizeCategoryKey("category_holiday_job")).toBe("holiday_job");
      expect(normalizeCategoryKey("category_transfer")).toBe("transfer");
      expect(normalizeCategoryKey("category_books")).toBe("books");
    });
  });

  describe("edge cases", () => {
    it("returns the input lowered/trimmed for unknown names", () => {
      expect(normalizeCategoryKey("UnknownCategory")).toBe("unknowncategory");
    });

    it("handles empty string", () => {
      expect(normalizeCategoryKey("")).toBe("");
    });

    it("handles null/undefined by returning empty", () => {
      expect(normalizeCategoryKey(null as unknown as string)).toBe("");
      expect(normalizeCategoryKey(undefined as unknown as string)).toBe("");
    });

    it("trims whitespace", () => {
      expect(normalizeCategoryKey("  food  ")).toBe("food");
    });
  });
});

describe("getCategoryColor", () => {
  it("returns pink for shopping", () => {
    expect(getCategoryColor("shopping")).toBe("#EC4899");
  });

  it("returns cyan for food", () => {
    expect(getCategoryColor("food")).toBe("#06B6D4");
  });

  it("returns purple for housing", () => {
    expect(getCategoryColor("housing")).toBe("#7C3AED");
  });

  it("returns amber for transport", () => {
    expect(getCategoryColor("transport")).toBe("#F59E0B");
  });

  it("returns emerald for salary", () => {
    expect(getCategoryColor("salary")).toBe("#059669");
  });

  it("returns emerald for holiday_job", () => {
    expect(getCategoryColor("holiday_job")).toBe("#059669");
  });

  it("returns indigo for transfer", () => {
    expect(getCategoryColor("transfer")).toBe("#6366F1");
  });

  it("returns purple-blue for books", () => {
    expect(getCategoryColor("books")).toBe("#8B5CF6");
  });

  it("returns default purple-blue for unknown key", () => {
    expect(getCategoryColor("nonexistent")).toBe("#8B5CF6");
  });

  it("normalizes before lookup — handles category_ prefix", () => {
    expect(getCategoryColor("category_food")).toBe("#06B6D4");
  });

  it("normalizes before lookup — handles German name", () => {
    expect(getCategoryColor("Essen")).toBe("#06B6D4");
  });
});

describe("translateCategoryLabel", () => {
  it("returns translated value when translation exists", () => {
    const t = (key: string) => {
      const translations: Record<string, string> = {
        category_food: "Essen & Trinken",
      };
      // eslint-disable-next-line security/detect-object-injection -- key is validated enum value/safe access pattern
      return translations[key] || key;
    };

    expect(translateCategoryLabel(t, "food")).toBe("Essen & Trinken");
  });

  it("returns original name when no translation found", () => {
    const t = (key: string) => key; // returns key as-is (no translation)

    expect(translateCategoryLabel(t, "My Custom Cat")).toBe("My Custom Cat");
  });

  it("handles category_ prefixed names", () => {
    const t = (key: string) => {
      const translations: Record<string, string> = {
        category_shopping: "Einkaufen",
      };
      // eslint-disable-next-line security/detect-object-injection -- key is validated enum value/safe access pattern
      return translations[key] || key;
    };

    expect(translateCategoryLabel(t, "category_shopping")).toBe("Einkaufen");
  });

  it("normalizes German names before translating", () => {
    const t = (key: string) => {
      const translations: Record<string, string> = {
        category_food: "Food & Drinks",
      };
      // eslint-disable-next-line security/detect-object-injection -- key is validated enum value/safe access pattern
      return translations[key] || key;
    };

    // "Essen" normalizes to "food", then looks up "category_food"
    expect(translateCategoryLabel(t, "Essen")).toBe("Food & Drinks");
  });
});

// =============================================================================
// translateCategoryLabel — isDefault third-argument variants
// Pins the behaviour introduced in this branch: passing isDefault:true forces
// translation (with humanised fallback), passing isDefault:false always returns
// the raw name, and passing a stable-ID string uses DEFAULT_CATEGORIES lookup.
// =============================================================================

describe("translateCategoryLabel — isDefault hint", () => {
  const t = (key: string) => {
    const labels: Record<string, string> = {
      category_food: "Food",
      category_household: "Household",
    };
    return labels[key] ?? key;
  };

  // isDefault: true — must translate via t()
  it("returns translated label when isDefault is true and translation exists", () => {
    expect(translateCategoryLabel(t, "category_food", true)).toBe("Food");
  });

  it("returns stored name as fallback when isDefault is true but translation key is missing", () => {
    // When t() returns the key unchanged (no translation loaded), fall back to
    // the stored name — do NOT reconstruct from the key. Reconstruction via
    // \b\w mangling umlauts (Überweisung → üBerweisung) and loses stored casing.
    const tMissing = (key: string) => key;
    expect(translateCategoryLabel(tMissing, "category_hobby", true)).toBe(
      "category_hobby",
    );
  });

  it("preserves umlaut casing when no translation is found (regression for \\b\\w umlaut bug)", () => {
    // \b\w treats ü as a word break — "überweisung" would become "üBerweisung".
    // Returning the stored name avoids the mangling entirely.
    const tMissing = (key: string) => key;
    expect(translateCategoryLabel(tMissing, "Überweisung", true)).toBe(
      "Überweisung",
    );
  });

  // isDefault: false — must always return the raw name unchanged
  it("returns raw name when isDefault is false, even if name looks like a translation key", () => {
    // A user-created category named "category_food" must not be translated to "Food"
    expect(translateCategoryLabel(t, "category_food", false)).toBe(
      "category_food",
    );
  });

  it("returns raw name when isDefault is false for a plain user-created name", () => {
    expect(translateCategoryLabel(t, "My Holidays", false)).toBe("My Holidays");
  });
});
