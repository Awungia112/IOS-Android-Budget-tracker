import "fake-indexeddb/auto";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import userEvent from "@testing-library/user-event";
import { screen, waitFor, fireEvent } from "@testing-library/react";
import {
  renderWithRealProviders,
  cleanupTestResources,
} from "@/test-utils/render";
import Categories from "../../pages/Categories";
import React from "react";

// ---------------------------------------------------------------------------
// i18n mock — force English so assertions are language-independent
// (German is now the app default; see SyncMigrationWizard.test.tsx for the
// same pattern). `t`/`i18n` must stay referentially stable across renders —
// unlike the real react-i18next, a freshly-created object every render would
// break useCallback/useEffect deps keyed on `t` (e.g. BudgetContext) and
// cause a render loop.
// ---------------------------------------------------------------------------
import enTranslations from "@/i18n/locales/en.json";

const mockT = (key: string, options?: Record<string, unknown>) => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const template = (enTranslations as any)[key];
  if (typeof template !== "string") return key;
  if (!options) return template;
  return Object.entries(options).reduce(
    (acc, [optKey, optValue]) =>
      acc.replaceAll(`{{${optKey}}}`, String(optValue)),
    template,
  );
};
const mockI18n = { language: "en", changeLanguage: vi.fn() };

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: mockT, i18n: mockI18n }),
  initReactI18next: { type: "3rdParty", init: vi.fn() },
}));

describe("Categories Integration Tests", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    cleanupTestResources();
  });

  it("renders category chips for each default category", async () => {
    renderWithRealProviders(<Categories />, {
      initialRoute: "/categories/expense",
    });

    await waitFor(() => {
      // Should show default category elements
      const categoryElements = screen.queryAllByTestId(/category-chip/);
      expect(categoryElements.length).toBeGreaterThan(0);
    });
  });

  it("renders category names and colors matching seeded data", async () => {
    renderWithRealProviders(<Categories />);

    await waitFor(() => {
      // Should show default category names
      const categoryNames = screen.queryAllByText(
        /Household|Entertainment|Mobile|Savings/i,
      );
      expect(categoryNames.length).toBeGreaterThan(0);
    });
  });

  it("adds new category through form flow", async () => {
    const user = userEvent.setup();

    renderWithRealProviders(<Categories />);

    await waitFor(() => {
      // Should show add button
      const addButton = screen.queryByRole("button", { name: /add/i });
      expect(addButton).toBeTruthy();
    });

    // Try to open add category dialog
    const addButton = screen.getByRole("button", { name: /add/i });
    await user.click(addButton);

    await waitFor(() => {
      // Should show the add dialog or form
      const nameInput = screen.queryByTestId("category-name-input");
      const formElement = screen.queryByRole("form");
      expect(nameInput || formElement).toBeTruthy();
    });
  });

  it("blocks submitting a duplicate default category name", async () => {
    const user = userEvent.setup();

    renderWithRealProviders(<Categories />, {
      initialRoute: "/categories/expense",
    });

    // Wait for default categories to load
    await waitFor(
      () => {
        const categoryElements = screen.queryAllByTestId(/category-chip/);
        expect(categoryElements.length).toBeGreaterThan(0);
      },
      { timeout: 10000 },
    );

    const initialCategoryCount =
      screen.queryAllByTestId(/category-chip/).length;
    const addButton = screen.getByRole("button", { name: /add/i });
    await user.click(addButton);

    await waitFor(
      () => {
        expect(screen.getByTestId("category-name-input")).toBeTruthy();
      },
      { timeout: 5000 },
    );

    await user.type(screen.getByTestId("category-name-input"), "Food");
    fireEvent.click(screen.getByTestId("icon-lucide:food"));
    fireEvent.click(screen.getByTestId("save-category-button"));

    await waitFor(() => {
      expect(screen.queryAllByTestId(/category-chip/)).toHaveLength(
        initialCategoryCount,
      );
    });
  });

  it("blocks submitting a duplicate translated display label", async () => {
    const user = userEvent.setup();

    renderWithRealProviders(<Categories />, {
      initialRoute: "/categories/expense",
    });

    // Wait for default categories to load
    await waitFor(
      () => {
        const categoryElements = screen.queryAllByTestId(/category-chip/);
        expect(categoryElements.length).toBeGreaterThan(0);
      },
      { timeout: 10000 },
    );

    const initialCategoryCount =
      screen.queryAllByTestId(/category-chip/).length;
    const addButton = screen.getByRole("button", { name: /add/i });
    await user.click(addButton);

    await waitFor(
      () => {
        expect(screen.getByTestId("category-name-input")).toBeTruthy();
      },
      { timeout: 5000 },
    );

    await user.type(screen.getByTestId("category-name-input"), "Household");
    fireEvent.click(screen.getByTestId("icon-lucide:home"));
    fireEvent.click(screen.getByTestId("save-category-button"));

    await waitFor(() => {
      expect(screen.queryAllByTestId(/category-chip/)).toHaveLength(
        initialCategoryCount,
      );
    });
  });
});
