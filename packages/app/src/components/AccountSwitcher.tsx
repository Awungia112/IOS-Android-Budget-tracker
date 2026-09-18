import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useBudget } from "@/contexts/BudgetContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatCurrency } from "@/lib/formatters";
import { cn } from "@/lib/utils";
import { useTranslation } from "react-i18next";
import { toast } from "@/hooks/use-toast";
import type { Account } from "@budget/core";

interface AccountSwitcherProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Called when the user taps "Settings" on an account card (edit account). */
  onEditAccount?: (account: Account) => void;
}

/** Phases of the inline "Add New Account" flow. */
type CreationState = "idle" | "editing" | "loading";

/**
 * Full-screen account switcher that replicates the legacy "Mein Budget"
 * account carousel UX. It shows a horizontally scrollable carousel of account
 * cards (initials, name, "Select" and "Settings" actions) plus an "Add New
 * Account" card, and a balance summary panel below listing each account's
 * balance and the total.
 */
const AccountSwitcher: React.FC<AccountSwitcherProps> = ({
  open,
  onOpenChange,
  onEditAccount,
}) => {
  const { t } = useTranslation();
  const {
    currentAccount,
    accounts,
    switchAccount,
    addAccount,
    getAccountBalances,
  } = useBudget();

  const [creationState, setCreationState] = useState<CreationState>("idle");
  const [newAccountName, setNewAccountName] = useState("");
  const [balances, setBalances] = useState<Record<string, number>>({});
  const [balancesLoading, setBalancesLoading] = useState(false);
  // The account currently centered in the carousel. Mirrors the legacy
  // behaviour where the "Allgemeine Übersicht" highlights the account in view
  // as the user scrolls, without requiring them to tap "Select".
  const [activeAccountId, setActiveAccountId] = useState<string | null>(
    currentAccount?.id ?? null,
  );
  const carouselRef = useRef<HTMLDivElement>(null);

  // When the switcher opens, fetch balances for every account (not just the
  // current one) and scroll the carousel so the currently selected account is
  // centered — mirroring the legacy behaviour of opening on the active account.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setBalancesLoading(true);
    getAccountBalances()
      .then((result) => {
        if (!cancelled) setBalances(result);
      })
      .catch((error) => {
        console.error("Failed to load account balances:", error);
        if (!cancelled) {
          toast({
            title: t("error"),
            description: t("failed_to_load_balances"),
            variant: "destructive",
          });
        }
      })
      .finally(() => {
        if (!cancelled) setBalancesLoading(false);
      });

    setActiveAccountId(currentAccount?.id ?? null);
    const currentId = currentAccount?.id;
    if (currentId && carouselRef.current) {
      const card = carouselRef.current.querySelector<HTMLElement>(
        `[data-account-id="${currentId}"]`,
      );
      // scrollIntoView is not implemented in jsdom; guard for non-browser envs.
      if (card && typeof card.scrollIntoView === "function") {
        card.scrollIntoView({ behavior: "auto", inline: "center", block: "nearest" });
      }
    }

    return () => {
      cancelled = true;
    };
  }, [open, getAccountBalances, currentAccount?.id, t]);

  // Update the highlighted account in the summary and apply the legacy
  // "coverflow" scale effect as the user scrolls: the centered card is full
  // size while the cards to the left and right shrink, growing/shrinking
  // smoothly as they move toward/away from the center.
  const handleScroll = useCallback(() => {
    const container = carouselRef.current;
    if (!container) return;
    const containerRect = container.getBoundingClientRect();
    const center = containerRect.left + container.clientWidth / 2;
    let active: string | null = null;
    container
      .querySelectorAll<HTMLElement>(".carousel-card")
      .forEach((card) => {
        const rect = card.getBoundingClientRect();
        if (center >= rect.left && center < rect.right) {
          active = card.dataset.accountId ?? null;
        }
        // Distance of the card's center from the viewport center, in card
        // widths (-1..1). Clamp so far-away cards don't shrink indefinitely.
        const distance = (rect.left + rect.width / 2 - center) / rect.width;
        const absDistance = Math.min(Math.abs(distance), 1);
        const scale = 1 - 0.25 * absDistance;
        const translateX = -distance * 36;
        card.style.transform = `translateX(${translateX}px) scale(${scale})`;
        card.style.zIndex = String(Math.round((1 - absDistance) * 10));
      });
    if (active) setActiveAccountId(active);
  }, []);

  // Apply the initial scale effect once the cards are rendered on open.
  useEffect(() => {
    if (!open) return;
    const raf = requestAnimationFrame(() => handleScroll());
    return () => cancelAnimationFrame(raf);
  }, [open, handleScroll]);

  const totalBalance = useMemo(() => {
    return Object.values(balances).reduce((sum, balance) => sum + balance, 0);
  }, [balances]);

  if (!open) return null;

  const handleSelect = (account: Account) => {
    if (account.id !== currentAccount?.id) {
      switchAccount(account.id);
    }
    onOpenChange(false);
  };

  const handleCreateAccount = async () => {
    const trimmedName = newAccountName.trim();
    if (!trimmedName) return;

    setCreationState("loading");
    try {
      await addAccount(trimmedName);
      setNewAccountName("");
      // Reset to idle so the card returns to the "+" state when the switcher
      // is reopened (the component stays mounted and toggles via `open`).
      setCreationState("idle");
      onOpenChange(false);
    } catch (error) {
      console.error("Failed to create account:", error);
      // Keep the form open so the user can correct their input and retry.
      setCreationState("editing");
    }
  };

  return (
    <div
      className="fixed inset-0 z-[100] flex flex-col bg-black/80"
      data-testid="account-switcher"
      role="dialog"
      aria-modal="true"
      aria-label={t("switch_account")}
      onClick={() => onOpenChange(false)}
    >
      {/* Carousel */}
      <div className="flex flex-1 flex-col items-center justify-end overflow-hidden pb-4">
        {accounts.length === 0 && (
          <div
            className="mb-6 px-6 text-center text-white"
            onClick={(event) => event.stopPropagation()}
          >
            <p className="text-lg font-bold">{t("no_accounts")}</p>
            <p className="mt-1 text-sm text-white/70">
              {t("create_first_account")}
            </p>
          </div>
        )}
        <div
          ref={carouselRef}
          onScroll={handleScroll}
          className="flex w-full snap-x snap-mandatory gap-4 overflow-x-auto px-[calc(50%-min(35vw,140px))] pb-2 pt-6 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          {accounts.map((account) => {
            const isCurrent = account.id === currentAccount?.id;
            return (
              <div
                key={account.id}
                className="relative w-[min(70vw,280px)] shrink-0 snap-center carousel-card"
                data-testid={`account-card-${account.id}`}
                data-account-id={account.id}
                onClick={(event) => event.stopPropagation()}
              >
                {/* Card background — matches the app's card surface */}
                <div
                  className="mt-12 h-[240px] rounded-[6px] border border-black/10 bg-white dark:border-white/10 dark:bg-[#1A2124] sm:h-[300px]"
                  style={{ boxShadow: "1px 1px 7px rgba(73.03, 95.55, 143, 0.12)" }}
                />

                {/* Initials circle overlapping the card */}
                <div className="absolute left-1/2 top-0 -translate-x-1/2">
                  <div className="flex h-24 w-24 items-center justify-center rounded-full border-4 border-white bg-[#A2FF77] text-2xl font-bold text-black shadow-md dark:border-[#1A2124]">
                    {account.profileImage ? (
                      <img
                        src={account.profileImage}
                        alt=""
                        className="h-full w-full rounded-full object-cover"
                      />
                    ) : (
                      account.initials
                    )}
                  </div>
                </div>

                {/* Card content */}
                <div className="absolute inset-x-0 top-0 flex flex-col items-center px-5 pb-2 pt-[104px] sm:pb-5">
                  <div className="text-center text-base font-bold text-black dark:text-white">
                    {account.name}
                  </div>

                  <Button
                    type="button"
                    onClick={() => handleSelect(account)}
                    className="mt-2 w-full max-w-[180px] h-[44px] rounded-[8px] bg-[#3FCB72] text-white font-bold hover:bg-[#3FCB72]/90 sm:mt-5 sm:h-[58px]"
                    data-testid={`select-account-${account.id}`}
                  >
                    {isCurrent ? t("current_account") : t("select")}
                  </Button>

                  <button
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation();
                      onOpenChange(false);
                      onEditAccount?.(account);
                    }}
                    className="mt-2 w-full max-w-[180px] h-[44px] rounded-[8px] bg-secondary text-foreground dark:text-white font-bold hover:bg-secondary/80 border-border sm:mt-3 sm:h-[58px]"
                    data-testid={`settings-account-${account.id}`}
                  >
                    {t("settings")}
                  </button>
                </div>
              </div>
            );
          })}

          {/* Add New Account card */}
          <div
            className="relative w-[min(70vw,280px)] shrink-0 snap-center carousel-card"
            onClick={(event) => event.stopPropagation()}
          >
            {/* Solid card background matching the account cards */}
            <div
              className="mt-12 h-[240px] rounded-[6px] border border-black/10 bg-white dark:border-white/10 dark:bg-[#1A2124] sm:h-[300px]"
              style={{ boxShadow: "1px 1px 7px rgba(73.03, 95.55, 143, 0.12)" }}
            />

            <div className="absolute left-1/2 top-0 -translate-x-1/2">
              <div className="flex h-24 w-24 items-center justify-center rounded-full border-4 border-white bg-budget-blue text-3xl font-bold text-white shadow-md dark:border-[#1A2124]">
                +
              </div>
            </div>

            <div className="absolute inset-x-0 top-0 flex flex-col items-center px-5 pb-2 pt-[104px] sm:pb-5">
              {creationState === "editing" || creationState === "loading" ? (
                <>
                  <div className="w-full text-center text-base font-bold text-black dark:text-white">
                    {t("new_account")}
                  </div>
                  <Input
                    autoFocus
                    value={newAccountName}
                    onChange={(event) => setNewAccountName(event.target.value)}
                    placeholder={t("account_name_placeholder")}
                    className="mt-4 w-full rounded-[8px] border border-black/10 bg-white px-3 py-2 text-sm text-black placeholder:text-gray-400 dark:border-white/10 dark:bg-white/5 dark:text-white dark:placeholder:text-white/50"
                    data-testid="new-account-name-input"
                  />
                  <div className="mt-4 flex w-full gap-2">
                    <Button
                      type="button"
                      variant="ghost"
                      onClick={() => {
                        setCreationState("idle");
                        setNewAccountName("");
                      }}
                      className="flex-1 text-gray-500 hover:text-black dark:text-gray-400 dark:hover:text-white"
                    >
                      {t("cancel")}
                    </Button>
                    <Button
                      type="button"
                      onClick={handleCreateAccount}
                      disabled={
                        !newAccountName.trim() || creationState === "loading"
                      }
                      className="flex-1 rounded-[8px] bg-budget-green text-white font-semibold hover:bg-budget-green/90"
                      data-testid="confirm-create-account"
                    >
                      {creationState === "loading"
                        ? t("creating")
                        : t("create")}
                    </Button>
                  </div>
                </>
              ) : (
                <>
                  <div className="text-center text-base font-bold text-black dark:text-white">
                    {t("new_account")}
                  </div>
                  <Button
                    type="button"
                    onClick={() => setCreationState("editing")}
                    className="mt-2 w-full max-w-[180px] h-[44px] rounded-[8px] bg-[#3FCB72] text-white font-bold hover:bg-[#3FCB72]/90 sm:mt-5 sm:h-[58px]"
                    data-testid="create-new-account"
                  >
                    {t("create")}
                  </Button>
                </>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Balance summary panel */}
      <div
        className="mx-6 mb-6 rounded-[6px] border border-black/10 bg-white p-5 dark:border-white/10 dark:bg-[#1A2124]"
        style={{ boxShadow: "1px 1px 7px rgba(73.03, 95.55, 143, 0.12)" }}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="text-center text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
          {t("general_overview")}
        </div>

        {/* Scrollable list — shows ~7 accounts, scrolls for the rest */}
        <div className="mt-3 max-h-[150px] space-y-2 overflow-y-auto pr-1 [-ms-overflow-style:none] [scrollbar-width:thin] sm:max-h-[190px]">
          {accounts.map((account) => {
            const balance = balances[account.id] ?? 0;
            const isActive = account.id === activeAccountId;
            return (
              <div
                key={account.id}
                className="flex items-center justify-between text-sm"
              >
                <span
                  className={cn(
                    "truncate pr-3",
                    isActive
                      ? "font-bold text-black dark:text-white"
                      : "text-gray-600 dark:text-gray-300",
                  )}
                >
                  {account.name}
                </span>
                <span
                  className={cn(
                    "shrink-0 font-semibold",
                    balance >= 0 ? "text-budget-green" : "text-budget-red",
                  )}
                >
                  {balancesLoading ? "…" : formatCurrency(balance)}
                </span>
              </div>
            );
          })}
        </div>

        <div className="mt-3 h-px bg-gray-200 dark:bg-white/10" />

        <div className="mt-3 flex items-center justify-between">
          <span className="text-sm font-medium text-gray-600 dark:text-gray-300">
            {t("overview_sum")}
          </span>
          <span
            className={cn(
              "text-base font-bold",
              totalBalance >= 0 ? "text-budget-green" : "text-budget-red",
            )}
            data-testid="account-switcher-total"
          >
            {balancesLoading ? "…" : formatCurrency(totalBalance)}
          </span>
        </div>
      </div>
    </div>
  );
};

export default AccountSwitcher;
