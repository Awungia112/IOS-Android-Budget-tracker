import React, { useState, ReactNode, useEffect, useRef } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { Capacitor } from "@capacitor/core";
import { cn } from "@/lib/utils";
import {
  Menu,
  X,
  Settings,
  Moon,
  Sun,
  User,
  ArrowLeft,
  ChevronRight,
  ExternalLink,
  SquareArrowOutUpRight,
  Bell,
  Mail,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useBudget } from "@/contexts/BudgetContext";
import { useAccount } from "@/contexts/AccountContext";
import { usePendingInvites, type PendingInvite } from "@/contexts/PendingInvitesContext";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import Spinner from "./ui/Spinner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { useTranslation } from "react-i18next";
import { toast } from "@/hooks/use-toast";
import FeedbackForm from "./FeedbackForm";
import ProfileDialog from "./ProfileDialog";
import AccountSwitcher from "./AccountSwitcher";
import { ExecutedTransactionsDrawer } from "./ExecutedTransactionsDrawer";
import { MigrationOptionsDrawer } from "./MigrationOptionsDrawer";
import { useMigrationDrawer } from "@/contexts/MigrationDrawerContext";
import { useMigrationRequired } from "@/lib/migrationStatus";
import { SyncIndicator } from "./SyncIndicator";
import { SyncErrorSheet } from "./SyncErrorSheet";
import OnlineFeaturesPrompt from "./OnlineFeaturesPrompt";
import GoOfflineConfirmDialog from "./GoOfflineConfirmDialog";
import { hasOptedOutOfOnlinePrompt, getHasSession } from "@/lib/accountStorage";
import { PendingInvitesDrawer } from "./PendingInvitesDrawer";
import { InviteDetailDialog } from "./InviteDetailDialog";

interface LayoutProps {
  children: ReactNode;
  disableScroll?: boolean;
}

// Safe sessionStorage wrapper — silently fails in restricted environments
// (private browsing on some browsers, cross-origin iframes, quota exceeded).
const safeSession = {
  get: (key: string): string | null => {
    try { return sessionStorage.getItem(key); } catch { return null; }
  },
  set: (key: string, value: string): void => {
    try { sessionStorage.setItem(key, value); } catch { /* ignore */ }
  },
  remove: (key: string): void => {
    try { sessionStorage.removeItem(key); } catch { /* ignore */ }
  },
};

const Layout = ({ children, disableScroll = false }: LayoutProps) => {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [notificationsDrawerOpen, setNotificationsDrawerOpen] = useState(false);

  const [darkModeInitialized, setDarkModeInitialized] = useState(false);
  const userToggledDarkModeRef = useRef(false);
  const [logoutLoading, setLogoutLoading] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();
  const { currentAccount, accounts, switchAccount, isLoading, isOfflineMode, setIsOfflineMode, goOffline, goOnline, exportAccountData, importAccountData, missedNotifications, dismissMissedNotifications } =
    useBudget();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { logout, isLoggedIn } = useAccount();
  const { t, i18n } = useTranslation();
  const language = i18n.language;
  const hasSession = getHasSession();
  const [profileDialogOpen, setProfileDialogOpen] = useState(false);
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const [exportDialogOpen, setExportDialogOpen] = useState(false);
  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const [syncErrorSheetOpen, setSyncErrorSheetOpen] = useState(false);
  const [onlinePromptOpen, setOnlinePromptOpen] = useState(false);
  const [goOfflineConfirmOpen, setGoOfflineConfirmOpen] = useState(false);
  const [pendingInvitesDrawerOpen, setPendingInvitesDrawerOpen] = useState(false);
  const [selectedInvite, setSelectedInvite] = useState<PendingInvite | null>(null);
  const [inviteDetailOpen, setInviteDetailOpen] = useState(false);

  const getOnlineModeAriaLabel = () => {
    return isOfflineMode ? t("enable_online_mode") : t("disable_online_mode");
  };

  const handleOnlineModeToggle = () => {
    if (!currentAccount?.id) return;

    if (!isOfflineMode) {
      // Toggling OFF (going offline) — show confirmation
      setGoOfflineConfirmOpen(true);
      return;
    }

    // Toggling ON (going online)
    const optedOut = hasOptedOutOfOnlinePrompt();

    if (!optedOut) {
      // Show the "What are online features?" prompt unless the user opted out
      setOnlinePromptOpen(true);
    } else if (!isLoggedIn || !hasSession) {
      // Already seen the prompt and not registered — go straight to registration
      // Check both isLoggedIn state and hasSession to handle stale localStorage
      navigate("/register");
    } else {
      // Already seen the prompt and registered — go online directly
      goOnline();
    }
  };

  const { open: migrationDrawerOpen, closeDrawer: closeMigrationDrawer } = useMigrationDrawer();
  const migrationRequired = useMigrationRequired(currentAccount?.id);

  const {
    pendingInvites,
    pendingKeyDeliveryAccountIds,
    isLoading: pendingInvitesLoading,
    pendingCount,
    acceptInvite,
    declineInvite,
    acceptingInviteId,
    decliningInviteId,
    removePendingKeyDeliveryAccount,
  } = usePendingInvites();

  // Auto-open the pending invites drawer once per session when there are pending invites.
  // Uses sessionStorage so it survives Layout remounts on route navigation.
  const hasAutoOpenedInvitesRef = React.useRef(
    safeSession.get('invites_drawer_auto_opened') === 'true',
  );
  // Tracks whether at least one fetch cycle has completed, so we don't
  // clear the session flag on initial render when count is 0 by default.
  const hasFetchedInvitesRef = React.useRef(false);

  useEffect(() => {
    // Mark that a fetch has completed (loading just transitioned to false)
    if (!pendingInvitesLoading) {
      hasFetchedInvitesRef.current = true;
    }

    if (!pendingInvitesLoading && pendingCount > 0 && !hasAutoOpenedInvitesRef.current) {
      hasAutoOpenedInvitesRef.current = true;
      safeSession.set('invites_drawer_auto_opened', 'true');
      setPendingInvitesDrawerOpen(true);
    }
  }, [pendingInvitesLoading, pendingCount]);

  // Initialize dark mode from localStorage on mount (defaults to light/false)
  useEffect(() => {
    // If the user already toggled dark mode before initialization (tests may do this),
    // avoid overwriting their choice with persisted value to prevent race conditions.
    if (userToggledDarkModeRef.current) {
      setDarkModeInitialized(true);
      return;
    }

    const savedDarkMode = localStorage.getItem("darkMode");
    if (savedDarkMode !== null) {
      try {
        const parsed = JSON.parse(savedDarkMode);
        setIsDarkMode(parsed);
      } catch (err) {
        localStorage.removeItem("darkMode");
      }
    }
    setDarkModeInitialized(true);
  }, []);

  // Apply dark mode class to html element
  useEffect(() => {
    if (!darkModeInitialized) return;
    // Ensure exclusive application: remove both then add the correct one
    document.documentElement.classList.remove("light", "dark");
    if (isDarkMode) {
      document.documentElement.classList.add("dark");
    } else {
      document.documentElement.classList.add("light");
    }
  }, [isDarkMode, darkModeInitialized]);

  // Toggle dark mode
  const toggleDarkMode = () => {
    const newDarkMode = !isDarkMode;
    userToggledDarkModeRef.current = true;
    setIsDarkMode(newDarkMode);
    localStorage.setItem("darkMode", JSON.stringify(newDarkMode));
    // Apply class immediately so tests and UI see the change synchronously
    document.documentElement.classList.remove("light", "dark");
    if (newDarkMode) {
      document.documentElement.classList.add("dark");
    } else {
      document.documentElement.classList.add("light");
    }
  };

  const isMainPage =
    location.pathname === "/" ||
    location.pathname === "/savings-goals" ||
    location.pathname === "/limits" ||
    location.pathname === "/statistics" ||
    location.pathname.startsWith("/categories") ||
    location.pathname === "/recurring" ||
    location.pathname === "/templates";

  const getPageTitle = () => {
    const path = location.pathname;
    if (path === "/account") return t("account_functions");
    if (path === "/impressum") return t("imprint");
    if (path === "/datenschutz") return t("privacy");
    if (path === "/settings") return t("settings");
    if (path === "/feedback") return t("feedback");
    if (path === "/about") return t("about_us");
    if (path.startsWith("/templates")) return t("templates");
    if (path.startsWith("/limits")) return t("set_limits");
    if (path.startsWith("/savings-goals")) return t("savings_goals");
    if (path === "/statistics") return t("statistics");
    if (path.startsWith("/categories/income")) return t("income_categories");
    if (path.startsWith("/categories/expense")) return t("expense_categories");
    if (path === "/recurring") return t("recurring_items");
    if (path === "/migration") return t("migration.page_title");
    if (path.includes("/settings/sharing/")) return t("sharing_settings");
    return null;
  };

  const isDetailPage =
    (location.pathname.startsWith("/limits/") && location.pathname !== "/limits") ||
    (location.pathname.startsWith("/savings-goals/") && location.pathname !== "/savings-goals") ||
    location.pathname.startsWith("/settings/sharing/");


  if (isLoading) {
    return (
      <div className="flex h-dvh flex-col items-center justify-center bg-[#3A464F]" data-testid="loading-spinner">
        <img
          src="/assets/deutshland-im-plus.webp"
          alt=""
          width={72}
          height={72}
          className="rounded-full animate-pulse"
        />
        <p className="mt-4 text-lg font-semibold text-white tracking-wide">
          My Budget
        </p>
        <p className="mt-1 text-xs text-white/50">Expenses under control</p>
        <div className="mt-7 w-[120px] h-[3px] rounded-full bg-white/15 overflow-hidden">
          <div className="h-full w-3/5 rounded-full bg-budget-blue animate-[splash-bar_1.2s_ease-in-out_infinite]" />
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-white dark:bg-[#1A2124] transition-colors duration-300">
      {/* Pending key delivery notification */}
      {(pendingKeyDeliveryAccountIds?.size ?? 0) > 0 && (
        <div className="bg-blue-50 dark:bg-blue-500/10 border-b border-blue-200 dark:border-blue-500/20 px-4 py-2 text-center">
          <p className="text-sm text-blue-700 dark:text-blue-400">
            {pendingKeyDeliveryAccountIds.size === 1
              ? t('waiting_for_key_delivery')
              : t('waiting_for_key_delivery_plural', { count: pendingKeyDeliveryAccountIds.size })}
          </p>
        </div>
      )}
      {/* Header */}
      {(
          <header
              className="bg-budget-header text-white sticky top-0 z-20 shadow-sm transition-colors duration-300 ios-header-safe-area">

            <div className="container mx-auto px-4">
              <div className="grid h-16 w-full grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2">
                {/* Left: back / menu button */}
                <div className="flex items-center gap-2">
                  {(!isMainPage || location.pathname === "/settings") ? (
                      <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => {
                            if (location.state?.from) {
                              navigate(location.state.from);
                            } else if (location.pathname.startsWith("/categories/")) {
                              navigate("/categories");
                            } else {
                              navigate("/");
                            }
                          }}
                          className="text-white hover:bg-white/10 relative pointer-events-auto"
                          data-testid="back-button"
                      >
                        <ArrowLeft className="h-5 w-5" strokeWidth={2.5}/>
                      </Button>
                  ) : (
                      <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => setSidebarOpen(true)}
                          className="text-white relative hover:bg-white/10"
                          data-testid="sidebar-menu-button"
                      >
                        <img
                            src="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24' fill='none' stroke='white' stroke-width='2.5' stroke-linecap='round' stroke-linejoin='round'%3E%3Cline x1='3' y1='12' x2='21' y2='12'%3E%3C/line%3E%3Cline x1='3' y1='6' x2='21' y2='6'%3E%3C/line%3E%3Cline x1='3' y1='18' x2='21' y2='18'%3E%3C/line%3E%3C/svg%3E"
                            alt="Menu"
                            className="h-5 w-5"
                        />
                      </Button>
                  )}
                </div>

                {/* Centre: page title */}
                <div className="min-w-0 flex justify-center pointer-events-none">
                  {getPageTitle() && (
                      <h1
                          className="max-w-full truncate px-2 text-center text-lg text-white font-semibold font-sans"
                          data-testid={
                            location.pathname === "/limits" ? "limits-heading" :
                                location.pathname === "/statistics" ? "statistics-heading" :
                                    location.pathname === "/savings-goals" ? "savings-goals-heading" :
                                        "page-title"
                          }
                      >
                        {getPageTitle()}
                      </h1>
                  )}
                </div>

                {/* Right: sync indicator + action icons + avatar */}
                <div className="ml-auto flex min-w-0 max-w-[55vw] shrink-0 items-center justify-end gap-1 sm:max-w-none sm:gap-2">
                  <SyncIndicator onErrorClick={() => setSyncErrorSheetOpen(true)}/>
                  {/* Pending invites badge */}
                  {pendingCount > 0 && (
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={(e) => {
                        (e.currentTarget as HTMLButtonElement).blur();
                        setPendingInvitesDrawerOpen(true);
                      }}
                      className="text-white hover:bg-white/10 relative"
                      aria-label="View pending invites"
                    >
                      <Mail className="h-5 w-5"/>
                      <span
                        className="absolute top-1 right-1 h-4 w-4 rounded-full bg-budget-blue text-[10px] font-bold text-white flex items-center justify-center leading-none">
                        {pendingCount > 9 ? "9+" : pendingCount}
                      </span>
                    </Button>
                  )}
                  {/* Notification bell */}
                  {missedNotifications.length > 0 && (
                      <Button
                          variant="ghost"
                          size="icon"
                          onClick={(e) => {
                            (e.currentTarget as HTMLButtonElement).blur();
                            setNotificationsDrawerOpen(true);
                          }}
                          className="text-white hover:bg-white/10 relative"
                          aria-label="View executed transactions"
                      >
                        <Bell className="h-5 w-5"/>
                        <span
                            className="absolute top-1 right-1 h-4 w-4 rounded-full bg-red-500 text-[10px] font-bold text-white flex items-center justify-center leading-none">
                    {missedNotifications.length > 9 ? "9+" : missedNotifications.length}
                  </span>
                      </Button>
                  )}
                  <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => setProfileMenuOpen(true)}
                      className="text-white hover:bg-white/10"
                      aria-label={currentAccount?.name || "Profile"}
                  >
                    <Avatar className="h-8 w-8 bg-[#A2FF77]">
                      {currentAccount?.profileImage ? (
                          <img
                              src={currentAccount.profileImage}
                              alt="Profile"
                              className="h-full w-full object-cover rounded-full"
                          />
                      ) : (
                          <AvatarFallback className="text-black bg-[#A2FF77]">
                            {currentAccount?.initials || "MK"}
                          </AvatarFallback>
                      )}
                    </Avatar>
                  </Button>
                </div>
              </div>
            </div>
          </header>
      )}

      {/* Sidebar */}
      <div
        className={cn(
          "fixed inset-0 z-40 bg-black/50 backdrop-blur-sm transition-opacity sidebar-overlay",
          sidebarOpen ? "opacity-100" : "opacity-0 pointer-events-none",
        )}
        onClick={() => setSidebarOpen(false)}
      />

      <div
        className={cn(
          "fixed left-0 top-0 z-50 h-[100dvh] w-full transform transition-transform duration-300 ease-out sidebar-container flex flex-col overflow-hidden",
          sidebarOpen ? "translate-x-0" : "-translate-x-full",
          isDarkMode ? "bg-[#1A2124]" : "bg-white",
        )}
        data-testid="sidebar-container"
      >
        {/* Sidebar Header */}
        <div
          className={cn(
            "w-full flex items-center justify-start ios-header-safe-area shrink-0",
            "bg-budget-header min-h-[64px]",
          )}
        >
          <button
            onClick={() => setSidebarOpen(false)}
            className="cursor-pointer relative ml-8 w-10 h-10 flex items-center justify-center"
            aria-label="Close sidebar"
          >
            <X className="h-10 w-10 text-white stroke-[3]" />
          </button>
        </div>

        {/* Menu Content with padding */}
        <div className="sidebar-content pb-24 px-[30px] overflow-y-auto flex-1">
          {/* Section: Konto Funktionen */}
          <div className="flex items-center mt-[31px] mb-4">
            <div className={cn("flex-1 h-px", isDarkMode ? "bg-white/20" : "bg-gray-200")} />
            <span className={cn("px-3 text-xs font-medium uppercase tracking-wide", isDarkMode ? "text-white/50" : "text-gray-400")}>
              {t("account_functions")}
            </span>
            <div className={cn("flex-1 h-px", isDarkMode ? "bg-white/20" : "bg-gray-200")} />
          </div>

          <div className="space-y-3">
            <Link
              to="/"
              className={cn(
                "flex items-center justify-between p-3 rounded-[7px] hover:bg-gray-50 dark:hover:bg-white/10 transition-colors shadow-sm dark:shadow-none border border-black/10 dark:border-white/10 h-[54px] font-sans",
                location.pathname === "/"
                  ? "bg-gray-50 dark:bg-white/10 text-black dark:text-white"
                  : "bg-white dark:bg-white/5 text-black dark:text-white",
              )}
              onClick={() => setSidebarOpen(false)}
              data-testid="sidebar-link-overview"
            >
              <span className="text-sm font-medium">{t("overview")}</span>
              <ChevronRight
                className="h-6 w-4 text-gray-400 dark:text-gray-400"
                data-testid="icon-ChevronRight"
              />
            </Link>

            <Link
              to="/categories/income"
              className={cn(
                "flex items-center justify-between p-3 rounded-[7px] hover:bg-gray-50 dark:hover:bg-white/10 transition-colors shadow-sm dark:shadow-none border border-black/10 dark:border-white/10 h-[54px] font-sans",
                location.pathname === "/categories/income"
                  ? "bg-gray-50 dark:bg-white/10 text-black dark:text-white"
                  : "bg-white dark:bg-white/5 text-black dark:text-white",
              )}
              onClick={() => setSidebarOpen(false)}
              data-testid="sidebar-link-income-categories"
            >
              <span className="text-sm font-medium">
                {t("income_categories")}
              </span>
              <ChevronRight
                className="h-6 w-4 text-gray-400 dark:text-gray-400"
                data-testid="icon-ChevronRight"
              />
            </Link>

            <Link
              to="/categories/expense"
              className={cn(
                "flex items-center justify-between p-3 rounded-[7px] hover:bg-gray-50 dark:hover:bg-white/10 transition-colors shadow-sm dark:shadow-none border border-black/10 dark:border-white/10 h-[54px] font-sans",
                location.pathname === "/categories/expense"
                  ? "bg-gray-50 dark:bg-white/10 text-black dark:text-white"
                  : "bg-white dark:bg-white/5 text-black dark:text-white",
              )}
              onClick={() => setSidebarOpen(false)}
              data-testid="sidebar-link-expense-categories"
            >
              <span className="text-sm font-medium">
                {t("expense_categories")}
              </span>
              <ChevronRight
                className="h-6 w-4 text-gray-400 dark:text-gray-400"
                data-testid="icon-ChevronRight"
              />
            </Link>

            <Link
              to="/templates"
              className={cn(
                "flex items-center justify-between p-3 rounded-[7px] hover:bg-gray-50 dark:hover:bg-white/10 transition-colors shadow-sm dark:shadow-none border border-black/10 dark:border-white/10 h-[54px] font-sans",
                location.pathname === "/templates"
                  ? "bg-gray-50 dark:bg-white/10 text-black dark:text-white"
                  : "bg-white dark:bg-white/5 text-black dark:text-white",
              )}
              onClick={() => setSidebarOpen(false)}
            >
              <span className="text-sm font-medium">{t("templates")}</span>
              <ChevronRight
                className="h-6 w-4 text-gray-400 dark:text-gray-400"
                data-testid="icon-ChevronRight"
              />
            </Link>

            <Link
              to="/recurring"
              className={cn(
                "flex items-center justify-between p-3 rounded-[7px] hover:bg-gray-50 dark:hover:bg-white/10 transition-colors shadow-sm dark:shadow-none border border-black/10 dark:border-white/10 h-[54px] font-sans",
                location.pathname === "/recurring"
                  ? "bg-gray-50 dark:bg-white/10 text-black dark:text-white"
                  : "bg-white dark:bg-white/5 text-black dark:text-white",
              )}
              onClick={() => setSidebarOpen(false)}
            >
              <span className="text-sm font-medium">
                {t("recurring_items")}
              </span>
              <ChevronRight
                className="h-6 w-4 text-gray-400 dark:text-gray-400"
                data-testid="icon-ChevronRight"
              />
            </Link>

            <Link
              to="/settings"
              className={cn(
                "flex items-center justify-between p-3 rounded-[7px] hover:bg-gray-50 dark:hover:bg-white/10 transition-colors shadow-sm dark:shadow-none border border-black/10 dark:border-white/10 h-[54px] font-sans",
                location.pathname === "/settings"
                  ? "bg-gray-50 dark:bg-white/10 text-black dark:text-white"
                  : "bg-white dark:bg-white/5 text-black dark:text-white",
              )}
              onClick={() => setSidebarOpen(false)}
              data-testid="sidebar-link-settings"
            >
              <span className="text-sm font-medium">{t("settings")}</span>
              <ChevronRight
                className="h-6 w-4 text-gray-400 dark:text-gray-400"
                data-testid="icon-ChevronRight"
              />
            </Link>

            <Link
              to="/limits"
              className={cn(
                "flex items-center justify-between p-3 rounded-[7px] hover:bg-gray-50 dark:hover:bg-white/10 transition-colors shadow-sm dark:shadow-none border border-black/10 dark:border-white/10 h-[54px] font-sans",
                location.pathname === "/limits"
                  ? "bg-gray-50 dark:bg-white/10 text-black dark:text-white"
                  : "bg-white dark:bg-white/5 text-black dark:text-white",
              )}
              onClick={() => setSidebarOpen(false)}
            >
              <span className="text-sm font-medium">{t("limits")}</span>
              <ChevronRight
                className="h-6 w-4 text-gray-400 dark:text-gray-400"
                data-testid="icon-ChevronRight"
              />
            </Link>

            <button
              className="flex items-center justify-between p-3 rounded-[7px] hover:bg-gray-50 dark:hover:bg-white/10 transition-colors shadow-sm dark:shadow-none border border-black/10 dark:border-white/10 h-[54px] font-sans bg-white dark:bg-white/5 text-black dark:text-white w-full"
              onClick={() => setExportDialogOpen(true)}
              data-testid="sidebar-export-data"
            >
              <span className="text-sm font-medium">{t("export_data")}</span>
              <ChevronRight
                className="h-6 w-4 text-gray-400 dark:text-gray-400"
                data-testid="icon-ChevronRight"
              />
            </button>

            <button
              className="flex items-center justify-between p-3 rounded-[7px] hover:bg-gray-50 dark:hover:bg-white/10 transition-colors shadow-sm dark:shadow-none border border-black/10 dark:border-white/10 h-[54px] font-sans bg-white dark:bg-white/5 text-black dark:text-white w-full"
              onClick={() => setImportDialogOpen(true)}
              data-testid="sidebar-import-data"
            >
              <span className="text-sm font-medium">{t("import_data")}</span>
              <ChevronRight
                className="h-6 w-4 text-gray-400 dark:text-gray-400"
                data-testid="icon-ChevronRight"
              />
            </button>
          </div>

          {/* Online Mode Toggle */}
          <div className="mt-3 mb-3">
            <div
              role="button"
              tabIndex={0}
              aria-label={getOnlineModeAriaLabel()}
              onClick={handleOnlineModeToggle}
              onKeyDown={(e) => {
                if (e.key !== 'Enter' && e.key !== ' ') return;
                e.preventDefault();
                handleOnlineModeToggle();
              }}
              className={cn(
                "flex items-center justify-between w-full p-3 rounded-[7px] transition-colors shadow-sidebar-item dark:shadow-none h-[54px] font-sans border border-black/10 dark:border-white/10 cursor-pointer",
                isOfflineMode
                  ? "bg-gray-100 dark:bg-white/5 text-black dark:text-white"
                  : "bg-white dark:bg-white/5 text-black dark:text-white",
              )}
            >
              <span className="text-sm font-medium">{t("online_mode")}</span>
              <div data-testid="online-mode-switch">
                <Switch
                  checked={!isOfflineMode}
                  aria-hidden="true"
                  className="data-[state=checked]:bg-budget-blue data-[state=unchecked]:bg-[#C4C4C4]"
                />
              </div>
            </div>
          </div>

          <div className="mb-3">
            <button
              className={cn(
                "flex items-center justify-between p-3 rounded-[7px] hover:bg-gray-50 dark:hover:bg-white/10 transition-colors shadow-sm dark:shadow-none border border-black/10 dark:border-white/10 h-[54px] font-sans w-full",
                location.pathname === "/account"
                  ? "bg-gray-50 dark:bg-white/10 text-black dark:text-white"
                  : "bg-white dark:bg-white/5 text-black dark:text-white",
              )}
              onClick={() => {
                setSidebarOpen(false);
                navigate("/account");
              }}
              data-testid="sidebar-account-button"
            >
              <span className="text-sm font-medium">{t("account_functions")}</span>
              <ChevronRight
                className="h-6 w-4 text-gray-400 dark:text-gray-400"
                data-testid="icon-ChevronRight"
              />
            </button>
          </div>

          {/* Light Mode Toggle - correct position after Online Mode */}
          <div className="mb-3">
            <div
              className={cn(
                "flex items-center justify-between w-full p-3 rounded-[7px] hover:bg-gray-100 dark:hover:bg-white/10 transition-colors shadow-sidebar-item dark:shadow-none h-[54px] font-sans border border-black/10 dark:border-white/10",
                "bg-white dark:bg-white/5 text-black dark:text-white",
              )}
            >
              <span className="text-sm font-medium">
                {isDarkMode ? t("dark_mode") : t("light_mode")}
              </span>
              <div
                data-testid="dark-mode-switch"
                role="button"
                tabIndex={0}
                onClick={() => toggleDarkMode()}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") toggleDarkMode();
                }}
              >
                <Switch
                  checked={isDarkMode}
                  aria-label="Toggle dark mode"
                  className="data-[state=unchecked]:bg-[#C4C4C4] data-[state=checked]:bg-blue-500 [&_[data-state=unchecked]_span]:bg-white [&_[data-state=checked]_span]:bg-white [&_span]:!bg-white"
                />
              </div>
            </div>
          </div>

          {/* Section: Sonstiges */}
          <div className="flex items-center my-4">
            <div className={cn("flex-1 h-px", isDarkMode ? "bg-white/20" : "bg-gray-200")} />
            <span className={cn("px-3 text-xs font-medium uppercase tracking-wide", isDarkMode ? "text-white/50" : "text-gray-400")}>
              {t("miscellaneous")}
            </span>
            <div className={cn("flex-1 h-px", isDarkMode ? "bg-white/20" : "bg-gray-200")} />
          </div>

          <div className="space-y-3 mb-[33px]">
            <Link
              to="/feedback"
              className={cn(
                "flex items-center justify-between p-3 rounded-[7px] hover:bg-gray-50 dark:hover:bg-white/10 transition-colors shadow-sm dark:shadow-none border border-black/10 dark:border-white/10 h-[54px] font-sans",
                location.pathname === "/feedback"
                  ? "bg-gray-50 dark:bg-white/10 text-black dark:text-white"
                  : "bg-white dark:bg-white/5 text-black dark:text-white",
              )}
              onClick={() => setSidebarOpen(false)}
              data-testid="sidebar-link-feedback"
            >
              <span className="text-sm font-medium">{t("your_feedback")}</span>
              <ChevronRight className="h-6 w-4 text-gray-400 dark:text-gray-400" />
            </Link>

            <a
              href="https://www.deutschland-im-plus.de/"
              target="_blank"
              rel="noopener noreferrer"
              className={cn(
                "flex items-center justify-between p-3 rounded-[7px] hover:bg-gray-50 dark:hover:bg-white/10 transition-colors shadow-sm dark:shadow-none border border-black/10 dark:border-white/10 h-[54px] font-sans",
                "bg-white dark:bg-white/5 text-black dark:text-white",
              )}
            >
              <div className="flex items-center gap-3">
                <img
                  src="/assets/deutschland.webp"
                  alt="Deutschland Logo"
                  className="h-[39px] w-[39px] rounded-lg"
                />
                <span className="text-sm font-medium">Deutschland im Plus</span>
              </div>
              <SquareArrowOutUpRight className="w-5 h-5" />
            </a>

            <Link
              to="/about"
              className={cn(
                "flex items-center justify-between p-3 rounded-[7px] hover:bg-gray-50 dark:hover:bg-white/10 transition-colors shadow-sm dark:shadow-none border border-black/10 dark:border-white/10 h-[54px] font-sans",
                "bg-white dark:bg-white/5 text-black dark:text-white",
              )}
              onClick={() => setSidebarOpen(false)}
            >
              <span className="text-sm font-medium">{t("about_us")}</span>
              <ChevronRight className="h-6 w-4 text-gray-400 dark:text-gray-400" />
            </Link>

            <Link
              to="/impressum"
              className={cn(
                "flex items-center justify-between p-3 rounded-[7px] hover:bg-gray-50 dark:hover:bg-white/10 transition-colors shadow-sm dark:shadow-none border border-black/10 dark:border-white/10 h-[54px] font-sans",
                "bg-white dark:bg-white/5 text-black dark:text-white",
              )}
              onClick={() => setSidebarOpen(false)}
            >
              <span className="text-sm font-medium">{t("imprint")}</span>
              <ChevronRight className="h-6 w-4 text-gray-400 dark:text-gray-400" />
            </Link>

            <Link
              to="/datenschutz"
              className={cn(
                "flex items-center justify-between p-3 rounded-[7px] hover:bg-gray-50 dark:hover:bg-white/10 transition-colors shadow-sm dark:shadow-none border border-black/10 dark:border-white/10 h-[54px] font-sans",
                "bg-white dark:bg-white/5 text-black dark:text-white",
              )}
              onClick={() => setSidebarOpen(false)}
            >
              <span className="text-sm font-medium">{t("privacy")}</span>
              <ChevronRight className="h-6 w-4 text-gray-400 dark:text-gray-400" />
            </Link>
          </div>

          {/* Logout Button */}
          <div className="mx-4 my-4 flex justify-center">
            <Button
              variant="outline"
              className={cn(
                "w-[135px] h-[58px] rounded-lg hover:bg-gray-200 font-bold border-0 font-inter",
                "bg-white dark:bg-white/10 text-black dark:text-white shadow-sm border border-black/10 dark:border-white/10 hover:bg-gray-50 dark:hover:bg-white/20",
              )}
              data-testid="sidebar-logout-button"
              onClick={async () => {
                try {
                  setLogoutLoading(true);
                  setSidebarOpen(false);
                  await logout();
                } catch (error) {
                  console.error("Logout failed:", error);
                  toast({
                    title: t("error"),
                    description:
                      t("logout_failed") || "Logout failed. Please try again.",
                    variant: "destructive",
                  });
                } finally {
                  setLogoutLoading(false);
                }
              }}
            >
              {logoutLoading ? <Spinner size={24} /> : t("logout")}
            </Button>
          </div>

          <div className="text-left mt-4 mb-[24px]">
            <p
              className={cn(
                "font-sans text-sm font-medium",
                isDarkMode ? "text-white/50" : "text-[rgba(0,0,0,0.60)]",
              )}
            >
              {t("app_version")} {APP_VERSION}
            </p>
          </div>
        </div>
      </div>

      {/* Sync Error Detail Sheet */}
      <SyncErrorSheet
        open={syncErrorSheetOpen}
        onOpenChange={setSyncErrorSheetOpen}
      />

      {/* Export Confirmation Dialog */}
      <AlertDialog open={exportDialogOpen} onOpenChange={setExportDialogOpen}>
        <AlertDialogContent className="rounded-[12px] max-w-[calc(100%-2rem)] bg-white dark:bg-[#1A2124] border-gray-200 dark:border-white/10 shadow-lg">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-lg font-semibold text-black dark:text-white">{t("export_data")}</AlertDialogTitle>
            <AlertDialogDescription className="text-gray-500">{t("export_data_description")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-row gap-3 sm:gap-3">
            <AlertDialogCancel className="flex-1 rounded-[8px] mt-0 bg-gray-100 dark:bg-white/10 border-gray-200 dark:border-white/10 text-black dark:text-white hover:bg-gray-200 dark:hover:bg-white/20">{t("cancel")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => {
                await exportAccountData();
                setSidebarOpen(false);
              }}
              className="flex-1 rounded-[8px] bg-budget-blue hover:bg-budget-blue/90 text-white"
              data-testid="confirm-export-button"
            >
              {t("export_data")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Import Confirmation Dialog */}
      <AlertDialog open={importDialogOpen} onOpenChange={importOpen => {
        if (!importOpen) (document.activeElement as HTMLElement)?.blur();
        setImportDialogOpen(importOpen);
      }}>
        <AlertDialogContent className="rounded-[12px] max-w-[calc(100%-2rem)] bg-white dark:bg-[#1A2124] border-gray-200 dark:border-white/10 shadow-lg">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-lg font-semibold text-black dark:text-white">{t("import_data")}</AlertDialogTitle>
            <AlertDialogDescription className="text-gray-500">{t("import_data_description")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-row gap-3 sm:gap-3">
            <AlertDialogCancel className="flex-1 rounded-[8px] mt-0 bg-gray-100 dark:bg-white/10 border-gray-200 dark:border-white/10 text-black dark:text-white hover:bg-gray-200 dark:hover:bg-white/20">{t("cancel")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => {
                if (Capacitor.isNativePlatform()) {
                  // Native: file picker is launched inside importAccountData
                  await importAccountData();
                  setSidebarOpen(false);
                } else {
                  // Web: trigger the hidden file input
                  fileInputRef.current?.click();
                }
              }}
              className="flex-1 rounded-[8px] bg-budget-blue hover:bg-budget-blue/90 text-white"
              data-testid="confirm-import-button"
            >
              {t("import_data")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Hidden file input for import — web only */}
      <input
        type="file"
        accept=".json,.csv,application/json,text/csv"
        ref={fileInputRef}
        data-testid="import-file-input"
        className="hidden"
        onChange={async (e) => {
          const file = e.target.files?.[0];
          if (file) {
            await importAccountData(file);
          }
          if (fileInputRef.current) {
            fileInputRef.current.value = '';
          }
          setSidebarOpen(false);
        }}
      />

      {/* Main Content */}
      <main
        className={cn(
          "min-h-0 flex-1 overflow-y-auto animate-fade-in ios-main-safe-area",
          disableScroll && "overflow-hidden",
        )}
      >
        {children}
      </main>

      {/* Bottom Navigation */}
      {location.pathname !== "/settings" && location.pathname !== "/feedback" && (
        <nav
          className="flex-none bg-budget-header shadow-[0_-2px_10px_rgba(0,0,0,0.1)] flex justify-between px-0 pb-[var(--safe-area-bottom)] z-30 transition-colors duration-300"
          data-testid="bottom-navigation"
        >
          <Link
            to="/"
            className={cn(
              "flex flex-col items-center justify-center w-full py-3 transition-colors",
              location.pathname === "/"
                ? "bg-budget-blue text-white"
                : "text-white hover:text-white",
            )}
            data-testid="bottom-nav-overview"
          >
            <img
              src="/assets/overview-icon.svg"
              alt="Overview"
              className={cn(
                "h-6 w-6 brightness-0 invert",
              )}
            />
            <span className="text-xs mt-1">{t("overview")}</span>
          </Link>

          <Link
            to="/savings-goals"
            className={cn(
              "flex flex-col items-center justify-center w-full py-3 transition-colors",
              location.pathname === "/savings-goals"
                ? "bg-budget-blue text-white"
                : "text-white hover:text-white",
            )}
            data-testid="bottom-nav-savings"
          >
            <img
              src="/assets/savings-goal-icon.svg"
              alt="Savings Goals"
              className={cn(
                "h-6 w-6 brightness-0 invert",
              )}
            />
            <span className="text-xs mt-1">{t("savings_goals")}</span>
          </Link>

          <Link
            to="/limits"
            className={cn(
              "flex flex-col items-center justify-center w-full py-3 transition-colors",
              location.pathname === "/limits"
                ? "bg-budget-blue text-white"
                : "text-white hover:text-white",
            )}
            data-testid="bottom-nav-limits"
          >
            <img
              src="/assets/limits-icon.svg"
              alt="Limits"
              className={cn(
                "h-6 w-6 brightness-0 invert",
              )}
            />
            <span className="text-xs mt-1">{t("limits")}</span>
          </Link>

          <Link
            to="/statistics"
            className={cn(
              "flex flex-col items-center justify-center w-full py-3 transition-colors",
              location.pathname === "/statistics"
                ? "bg-budget-blue text-white"
                : "text-white hover:text-white",
            )}
            data-testid="bottom-nav-statistics"
          >
            <img
              src="/assets/statistics-icon.svg"
              alt="Statistics"
              className={cn(
                "h-6 w-6 brightness-0 invert",
              )}
            />
            <span className="text-xs mt-1">{t("statistics")}</span>
          </Link>
        </nav>
      )}

      <AccountSwitcher
        open={profileMenuOpen}
        onOpenChange={setProfileMenuOpen}
        onEditAccount={(account) => {
          // Legacy behaviour: tapping "Settings" on an account opens its
          // settings. The profile dialog edits the current account, so switch
          // to the selected account first.
          if (account.id !== currentAccount?.id) {
            switchAccount(account.id);
          }
          setProfileDialogOpen(true);
        }}
      />

      <ProfileDialog
        open={profileDialogOpen}
        onOpenChange={setProfileDialogOpen}
        onGoOnline={handleOnlineModeToggle}
        onGoOffline={() => setGoOfflineConfirmOpen(true)}
      />

      <ExecutedTransactionsDrawer
        open={notificationsDrawerOpen}
        onClose={() => setNotificationsDrawerOpen(false)}
        notifications={missedNotifications}
        onDismiss={dismissMissedNotifications}
      />

      {migrationRequired && (
        <MigrationOptionsDrawer
          open={migrationDrawerOpen}
          onClose={closeMigrationDrawer}
        />
      )}

{/* Online Features Prompt — shown when toggling online for the first time on an account */}
      <OnlineFeaturesPrompt
        open={onlinePromptOpen}
        onOpenChange={setOnlinePromptOpen}
        isLoggedIn={isLoggedIn}
        hasSession={hasSession}
        onRegister={() => {
          navigate("/register");
        }}
        onConfirm={() => {
          goOnline();
        }}
        onCancel={() => {
          // Stay in offline mode — do nothing else
        }}
      />

      {/* Go Offline Confirmation — shown when toggling offline while online */}
      <GoOfflineConfirmDialog
        open={goOfflineConfirmOpen}
        onOpenChange={setGoOfflineConfirmOpen}
        onConfirm={() => {
          goOffline();
        }}
        onCancel={() => {
          // Stay online — do nothing
        }}
      />

      <PendingInvitesDrawer
        open={pendingInvitesDrawerOpen}
        onClose={() => setPendingInvitesDrawerOpen(false)}
        pendingInvites={pendingInvites}
        isLoading={pendingInvitesLoading}
        onSelectInvite={(invite) => {
          setSelectedInvite(invite);
          setPendingInvitesDrawerOpen(false);
          setInviteDetailOpen(true);
        }}
      />

      <InviteDetailDialog
        open={inviteDetailOpen}
        onOpenChange={setInviteDetailOpen}
        invite={selectedInvite}
        onAccept={acceptInvite}
        onDecline={declineInvite}
        acceptingInviteId={acceptingInviteId}
        decliningInviteId={decliningInviteId}
      />
    </div>
  );
};

export default Layout;
