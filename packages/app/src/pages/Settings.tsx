import { useRef, useState } from 'react';
import Layout from '@/components/Layout';
import { useBudget } from '@/contexts/BudgetContext';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ChevronRight, Loader2, Trash2, Users } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import ProfileDialog from '@/components/ProfileDialog';
import { cn } from '@/lib/utils';
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
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { toast } from '@/hooks/use-toast';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useAccount } from '@/contexts/AccountContext';
import { uploadQueue } from '@budget/core';
import { usePendingInvites } from '@/contexts/PendingInvitesContext';
import { SentryDebugPanel } from '@/components/SentryDebugPanel';
// Card style matching sidebar items and other pages — white bg, visible border, subtle shadow
const cardBase = "p-3 rounded-[7px] shadow-sm bg-white dark:bg-white/5 border border-black/10 dark:border-white/10 hover:bg-gray-50 dark:hover:bg-white/10 transition-colors font-sans";

// Reusable row component matching sidebar item pattern from Layout.tsx
// Uses <div> when rightContent is provided (e.g. Switch) to avoid nested <button> in DOM
const SettingsRow = ({
  title,
  onClick,
  rightContent,
  destructive,
}: {
  title: string;
  onClick?: () => void;
  rightContent?: React.ReactNode;
  destructive?: boolean;
}) => {
  const classes = cn(
    cardBase,
    "w-full flex items-center justify-between h-[54px] text-sm font-medium",
    destructive ? "text-budget-red" : "text-black dark:text-white"
  );

  if (rightContent) {
    return (
      <div className={classes}>
        <span>{title}</span>
        {rightContent}
      </div>
    );
  }

  return (
    <button onClick={onClick} className={classes}>
      <span>{title}</span>
      <ChevronRight className="h-6 w-4 text-gray-600" />
    </button>
  );
};

const Settings = () => {
  const navigate = useNavigate();
  const { resetApp, addAccount, accounts, deleteAccount, switchAccount, currentAccount, deleteOnlineAccount } = useBudget();
  const { t, i18n } = useTranslation();
  const language = i18n.language;
  const { logout, isLoggedIn } = useAccount();

  const [resetDialogOpen, setResetDialogOpen] = useState(false);
  const [logoutDialogOpen, setLogoutDialogOpen] = useState(false);
  const [unsyncedCount, setUnsyncedCount] = useState(0);
  const [newAccountOpen, setNewAccountOpen] = useState(false);
  const [accountName, setAccountName] = useState('');
  const [deleteAccountId, setDeleteAccountId] = useState<string | null>(null);
  const [deleteOnlineDialogOpen, setDeleteOnlineDialogOpen] = useState(false);
  const [isDeletingOnlineAccount, setIsDeletingOnlineAccount] = useState(false);
  const isDeletingOnlineAccountRef = useRef(false);
  const [profileDialogOpen, setProfileDialogOpen] = useState(false);
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const [menuView, setMenuView] = useState<'main' | 'accounts'>('main');

  const { resetOnboarding } = useAccount();

  // Pending invites — only need count for the badge on the nav row
  const { pendingCount } = usePendingInvites();


  const handleResetConfirm = async () => {
    try {
      await resetApp();
      setResetDialogOpen(false);
      resetOnboarding();
    } catch (error) {
      console.error('Failed to reset app:', error);
    }
  };

  const handleAddAccount = async () => {
    if (!accountName.trim()) {
      toast({
        title: t('error'),
        description: t('please_enter'),
        variant: 'destructive',
      });
      return;
    }

    try {
      await addAccount(accountName);
      setAccountName('');
      setNewAccountOpen(false);
    } catch (error) {
      console.error('Failed to add account:', error);
    }
  };

  const handleDeleteAccount = async () => {
    if (deleteAccountId) {
      try {
        await deleteAccount(deleteAccountId);
        setDeleteAccountId(null);
      } catch (error) {
        console.error('Failed to delete account:', error);
      }
    }
  };

  const handleDeleteOnlineAccount = async () => {
    setIsDeletingOnlineAccount(true);
    isDeletingOnlineAccountRef.current = true;
    try {
      await deleteOnlineAccount();
      // If we get here, the account was successfully deleted.
      // The component will redirect to onboarding via resetOnboarding() from the context.
      setDeleteOnlineDialogOpen(false);
    } catch (error) {
      console.error('Failed to delete online account:', error);
      toast({
        title: t('error'),
        description: t('delete_online_account_failed'),
        variant: 'destructive',
      });
    } finally {
      setIsDeletingOnlineAccount(false);
      isDeletingOnlineAccountRef.current = false;
    }
  };

  const handleLogoutClick = async () => {
    try {
      const count = await uploadQueue.count();
      setUnsyncedCount(count);
    } catch {
      setUnsyncedCount(0);
    }
    setLogoutDialogOpen(true);
  };

  const handleLogoutConfirm = async () => {
    try {
      await logout();
    } catch {
      toast({ title: t('error'), description: t('logout_failed'), variant: 'destructive' });
    }
    setLogoutDialogOpen(false);
  };

  return (
    <Layout>
      {/* Single wrapper with sidebar-matching background covering the full area */}
      <div className="min-h-screen bg-white dark:bg-[#1A2124] px-6 pt-6 pb-24">
        {/* Profile Hero - compact card */}
        <button
          onClick={() => {
            setMenuView('main');
            setProfileMenuOpen(true);
          }}
          className={cn(cardBase, "w-full flex items-center gap-3 mb-6")}
          data-testid="profile-hero-button"
        >
          <Avatar className="h-14 w-14">
            {currentAccount?.profileImage ? (
              <img src={currentAccount.profileImage} alt="Profile" className="h-full w-full object-cover rounded-full" />
            ) : (
              <AvatarFallback className="text-lg bg-zinc-800 text-white font-bold">
                {currentAccount?.initials || 'MK'}
              </AvatarFallback>
            )}
          </Avatar>
          <div className="flex-1 text-left min-w-0">
            <span className="text-sm font-medium text-black dark:text-white truncate block">{currentAccount?.name}</span>
            {isLoggedIn && localStorage.getItem('userEmail') && (
              <span className="text-xs text-gray-500 dark:text-gray-400 truncate block">{localStorage.getItem('userEmail')}</span>
            )}
          </div>
          <ChevronRight className="h-6 w-4 text-gray-600 shrink-0" />
        </button>

        {/* Accounts Section */}
        <div className="space-y-3 mb-6">
          {accounts.map((account) => (
            <div
              key={account.id}
              className={cn(cardBase, "flex items-center h-[54px]")}
              data-testid={`account-item-${account.id}`}
            >
              <button
                onClick={() => {
                  if (account.id !== currentAccount?.id) {
                    switchAccount(account.id);
                  }
                }}
                className="flex items-center gap-3 flex-1 min-w-0"
                data-testid={`switch-account-${account.id}`}
              >
                <Avatar className="h-8 w-8 border border-black/10 transition-shadow">
                  {account.profileImage ? (
                    <img src={account.profileImage} alt="Profile" className="h-full w-full object-cover rounded-full" />
                  ) : (
                    <AvatarFallback className="text-xs text-black font-bold">{account.initials || 'MK'}</AvatarFallback>
                  )}
                </Avatar>
                <span className={cn(
                  "text-sm font-medium truncate",
                  account.id === currentAccount?.id ? "text-budget-category-green" : "text-black dark:text-white"
                )}>
                  {account.name}
                </span>
              </button>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => navigate(`/settings/sharing/${account.id}`)}
                  className="p-2 text-[#0b75c2] hover:text-[#0b75c2]/70 transition-colors"
                  aria-label={`Share ${account.name}`}
                  data-testid={`share-account-button-${account.id}`}
                >
                  <Users className="h-4 w-4" />
                </button>
                <button
                  onClick={() => setDeleteAccountId(account.id)}
                  className="p-2 text-budget-red hover:text-budget-red/70 transition-colors"
                  aria-label={`Delete ${account.name}`}
                  data-testid={`delete-account-button-${account.id}`}
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </div>
          ))}
          <SettingsRow title={t('new_account')} onClick={() => setNewAccountOpen(true)} />
        </div>

        {/* App Settings */}
        <div className="space-y-3 mb-6">
          {/* Language Row */}
          <div className={cn(cardBase, "flex items-center justify-between h-[54px]")}>
            <span className="text-sm font-medium text-black dark:text-white">{t('language')}</span>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm" className="text-xs text-black/60 dark:text-white/60 font-bold hover:bg-gray-50 dark:hover:bg-white/10" data-testid="language-trigger">
                  {language === 'de' ? t('german') : t('english')}
                  <ChevronRight className="ml-1 h-3 w-3" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="bg-popover border-border text-popover-foreground min-w-[140px] shadow-xl">
                <DropdownMenuItem className="focus:bg-accent focus:text-accent-foreground flex items-center justify-between py-3 cursor-pointer" onClick={() => {
                  i18n.changeLanguage('de');
                  localStorage.setItem('i18nextLng', 'de');
                  localStorage.setItem('language', 'de');
                }}>
                  <span>{t('german')}</span>
                  {language === 'de' && <div className="h-1.5 w-1.5 rounded-full bg-budget-category-green" />}
                </DropdownMenuItem>
                <DropdownMenuItem className="focus:bg-accent focus:text-accent-foreground flex items-center justify-between py-3 cursor-pointer" onClick={() => {
                  i18n.changeLanguage('en');
                  localStorage.setItem('i18nextLng', 'en');
                  localStorage.setItem('language', 'en');
                }}>
                  <span>{t('english')}</span>
                  {language === 'en' && <div className="h-1.5 w-1.5 rounded-full bg-budget-category-green" />}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>


        </div>

        {/* Data Management + Destructive actions */}
        <div className="space-y-3 mb-6">
          {/* Migration row */}
          <button
            onClick={() => navigate('/migration')}
            className={cn(
              cardBase,
              "w-full flex items-center justify-between h-[54px] text-sm font-medium text-black dark:text-white"
            )}
            data-testid="settings-migration-row"
          >
            <span>{t('migration.page_title')}</span>
            <ChevronRight className="h-6 w-4 text-gray-600" />
          </button>

          {/* Pending Invites */}
          <button
            onClick={() => navigate('/invites')}
            className={cn(cardBase, "w-full flex items-center justify-between h-[54px] text-sm font-medium text-black dark:text-white")}
            data-testid="pending-invites-row"
          >
            <span>{t('pending_invites')}</span>
            <div className="flex items-center gap-2">
              {pendingCount > 0 && (
                <span className="text-xs text-budget-blue font-medium bg-budget-blue/10 px-2 py-1 rounded-full">
                  {t('new')}
                </span>
              )}
              <ChevronRight className="h-6 w-4 text-gray-600" />
            </div>
          </button>

          <SettingsRow
            title={t('reset_app')}
            onClick={() => setResetDialogOpen(true)}
            destructive
          />

          {isLoggedIn && (
            <SettingsRow
              title={t('delete_online_account')}
              onClick={() => setDeleteOnlineDialogOpen(true)}
              destructive
            />
          )}
        </div>

        {/* Sentry debug panel — visible when localStorage.__sentry_debug__ === '1' */}
        <div className="mb-6">
          <SentryDebugPanel />
        </div>

        {/* Legal links */}
        <div className="flex justify-start space-x-6 flex-wrap gap-y-4 mb-2">          <button onClick={() => navigate('/impressum', { state: { from: '/settings' } })} className="text-sm font-medium text-black dark:text-white hover:text-black/60 dark:hover:text-white/60 transition-colors font-sans" data-testid="legal-imprint">
            {t('imprint')}
          </button>
          <button onClick={() => navigate('/datenschutz', { state: { from: '/settings' } })} className="text-sm font-medium text-black dark:text-white hover:text-black/60 dark:hover:text-white/60 transition-colors font-sans" data-testid="legal-privacy">
            {t('privacy')}
          </button>
          <button onClick={() => navigate('/about', { state: { from: '/settings' } })} className="text-sm font-medium text-black dark:text-white hover:text-black/60 dark:hover:text-white/60 transition-colors font-sans" data-testid="legal-about">
            {t('about')}
          </button>
        </div>
        <span className="text-xs font-medium text-[rgba(0,0,0,0.60)] dark:text-white/60 mb-4 block">{t('app_version')} {APP_VERSION}</span>

        {isLoggedIn && (
          <div className="flex justify-center pt-2 pb-2">
            <Button
              onClick={handleLogoutClick}
              variant="outline"
              className="w-[135px] h-[58px] rounded-lg font-bold border border-black/10 dark:border-white/10 bg-white dark:bg-white/10 text-black dark:text-white shadow-sm hover:bg-gray-50 dark:hover:bg-white/20"
            >
              {t('logout')}
            </Button>
          </div>
        )}
        </div>

      {/* Reset Confirmation Dialog */}
      <AlertDialog open={resetDialogOpen} onOpenChange={setResetDialogOpen}>
        <AlertDialogContent className="rounded-[12px] max-w-[calc(100%-2rem)] bg-white dark:bg-[#1A2124] border border-black/10 dark:border-white/10 shadow-lg">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-lg font-semibold text-black">{t('reset_app')}</AlertDialogTitle>
            <AlertDialogDescription className="text-gray-500">{t('reset_warning')}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-row gap-3 sm:gap-3">
            <AlertDialogCancel className="flex-1 rounded-[8px] mt-0 bg-white dark:bg-white/10 text-black dark:text-white border border-black/10 dark:border-white/10 hover:bg-gray-50 dark:hover:bg-white/20 shadow-sm">{t('cancel')}</AlertDialogCancel>
            <AlertDialogAction onClick={handleResetConfirm} className="flex-1 rounded-[8px] bg-budget-red hover:bg-budget-red/90 text-white" data-testid="confirm-reset-button">{t('reset')}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Logout Confirmation Dialog */}
      <AlertDialog open={logoutDialogOpen} onOpenChange={setLogoutDialogOpen}>
        <AlertDialogContent className="rounded-[12px] max-w-[calc(100%-2rem)] bg-white dark:bg-[#1A2124] border border-black/10 dark:border-white/10 shadow-lg">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-lg font-semibold text-black dark:text-white">{t('logout')}</AlertDialogTitle>
            <AlertDialogDescription className="text-gray-500">
              {unsyncedCount > 0
                ? t('logout_unsynced_warning', { count: unsyncedCount })
                : t('logout_confirm')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-row gap-3 sm:gap-3">
            <AlertDialogCancel className="flex-1 rounded-[8px] mt-0 bg-white dark:bg-white/10 text-black dark:text-white border border-black/10 dark:border-white/10 hover:bg-gray-50 dark:hover:bg-white/20 shadow-sm" data-testid="logout-cancel-button">{t('cancel')}</AlertDialogCancel>
            <AlertDialogAction onClick={handleLogoutConfirm} className="flex-1 rounded-[8px] bg-budget-red hover:bg-budget-red/90 text-white" data-testid="confirm-logout-button">{t('logout')}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* New Account Dialog */}
      <Dialog open={newAccountOpen} onOpenChange={setNewAccountOpen}>
        <DialogContent className="rounded-[12px] max-w-[calc(100%-2rem)] bg-white dark:bg-[#1A2124] border border-black/10 dark:border-white/10 shadow-lg">
          <DialogTitle className="text-lg font-semibold text-black">{t('new_account')}</DialogTitle>
          <DialogDescription className="sr-only">{t('new_account')}</DialogDescription>
          <div className="space-y-4 pt-4">
            <div>
              <Label htmlFor="accountName" className="text-sm font-medium mb-1.5 block text-black">{t('account_name')}</Label>
              <Input
                id="accountName"
                value={accountName}
                onChange={(e) => setAccountName(e.target.value)}
                placeholder={t('account_name_placeholder')}
                className="rounded-[8px] h-11 bg-white dark:bg-white/5 border border-black/10 dark:border-white/10 text-black dark:text-white placeholder:text-gray-400"
              />
            </div>
            <div className="flex justify-end gap-3 pt-2">
              <Button variant="outline" onClick={() => setNewAccountOpen(false)} className="rounded-[8px] px-6 bg-white dark:bg-white/10 border border-black/10 dark:border-white/10 text-black dark:text-white hover:bg-gray-50 dark:hover:bg-white/20 shadow-sm">{t('cancel')}</Button>
              <Button onClick={handleAddAccount} className="bg-budget-category-green text-white rounded-[8px] px-6 font-semibold border-none hover:bg-budget-category-green/90">{t('create')}</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete Account Dialog */}
      <AlertDialog open={!!deleteAccountId} onOpenChange={() => setDeleteAccountId(null)}>
        <AlertDialogContent className="rounded-[12px] max-w-[calc(100%-2rem)] bg-white border-gray-200 shadow-lg">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-lg font-semibold text-black">{t('delete_account')}</AlertDialogTitle>
            <AlertDialogDescription className="text-gray-500">{t('delete_account_warning')}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-row gap-3 sm:gap-3">
            <AlertDialogCancel className="flex-1 rounded-[8px] mt-0 bg-gray-100 border-gray-200 text-black hover:bg-gray-200">{t('cancel')}</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteAccount} className="flex-1 rounded-[8px] bg-budget-red hover:bg-budget-red/90 text-white" data-testid="confirm-delete-account-button">{t('delete')}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete Online Account Confirmation Dialog */}
      <AlertDialog open={deleteOnlineDialogOpen} onOpenChange={(open) => {
        if (!isDeletingOnlineAccountRef.current) {
          setDeleteOnlineDialogOpen(open);
        }
      }}>
        <AlertDialogContent className="rounded-[12px] max-w-[calc(100%-2rem)] bg-white dark:bg-[#1A2124] border border-black/10 dark:border-white/10 shadow-lg">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-lg font-semibold text-budget-red">{t('delete_online_account')}</AlertDialogTitle>
            <AlertDialogDescription className="text-gray-500 space-y-2">
              <p>{t('delete_online_account_warning')}</p>
              <p className="font-medium text-gray-700 dark:text-gray-300">{t('delete_online_account_implications')}</p>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-row gap-3 sm:gap-3">
            <AlertDialogCancel
              className="flex-1 rounded-[8px] mt-0 bg-white dark:bg-white/10 text-black dark:text-white border border-black/10 dark:border-white/10 hover:bg-gray-50 dark:hover:bg-white/20 shadow-sm"
              disabled={isDeletingOnlineAccount}
            >
              {t('cancel')}
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteOnlineAccount}
              className="flex-1 rounded-[8px] bg-budget-red hover:bg-budget-red/90 text-white disabled:opacity-50 disabled:cursor-not-allowed"
              data-testid="confirm-delete-online-account-button"
              disabled={isDeletingOnlineAccount}
            >
              {isDeletingOnlineAccount ? (
                <span className="flex items-center justify-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  {t('delete_online_account_loading')}
                </span>
              ) : (
                t('delete_online_account_confirm')
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <ProfileDialog open={profileDialogOpen} onOpenChange={setProfileDialogOpen} />

      {/* Profile Quick Actions Menu */}
      <Dialog open={profileMenuOpen} onOpenChange={setProfileMenuOpen}>
        <DialogContent className="rounded-[12px] max-w-[calc(100%-2rem)] bg-white dark:bg-[#1A2124] border border-black/10 dark:border-white/10 p-6 overflow-hidden shadow-xl">
          <DialogTitle className="text-center text-lg font-bold text-black dark:text-white mb-4">
            {menuView === 'main' ? t('profile_actions') : t('switch_account')}
          </DialogTitle>
          <DialogDescription className="sr-only">
            {menuView === 'main' ? t('profile_actions') : t('switch_account_title')}
          </DialogDescription>

          {menuView === 'main' ? (
            <div className="space-y-3">
              <button
                className={cn(cardBase, "w-full flex items-center justify-between h-[54px] text-sm font-medium text-black dark:text-white")}
                onClick={() => {
                  setProfileMenuOpen(false);
                  setProfileDialogOpen(true);
                }}
              >
                <span>{t('edit_profile')}</span>
                <ChevronRight className="h-6 w-4 text-gray-600" />
              </button>

              <button
                className={cn(cardBase, "w-full flex items-center justify-between h-[54px] text-sm font-medium text-black dark:text-white")}
                onClick={() => setMenuView('accounts')}
              >
                <span>{t('switch_account')}</span>
                <ChevronRight className="h-6 w-4 text-gray-600" />
              </button>

              <Button
                variant="ghost"
                className="mt-2 text-gray-500 dark:text-gray-400 hover:text-black dark:hover:text-white w-full"
                onClick={() => setProfileMenuOpen(false)}
              >
                {t('cancel')}
              </Button>
            </div>
          ) : (
            <div className="space-y-3 max-h-[60vh] overflow-y-auto">
              {accounts.map((account) => (
                <button
                  key={account.id}
                  onClick={() => {
                    if (account.id !== currentAccount?.id) {
                      switchAccount(account.id);
                    }
                    setProfileMenuOpen(false);
                  }}
                  className={cn(
                    cardBase,
                    "w-full flex items-center gap-3 h-[54px]",
                    account.id === currentAccount?.id
                      ? "bg-budget-category-green/10 text-budget-category-green"
                      : "text-black dark:text-white"
                  )}
                >
                  <Avatar className="h-8 w-8 border border-gray-200">
                    {account.profileImage ? (
                      <img src={account.profileImage} alt="" className="rounded-full" />
                    ) : (
                      <AvatarFallback className="text-xs font-bold">
                        {account.initials}
                      </AvatarFallback>
                    )}
                  </Avatar>
                  <span className="text-sm font-medium truncate flex-1 text-left">
                    {account.name}
                  </span>
                  {account.id === currentAccount?.id && (
                    <div className="h-2 w-2 rounded-full bg-budget-category-green" />
                  )}
                </button>
              ))}
              <div className="pt-2 flex gap-2">
                <Button
                  variant="ghost"
                  className="flex-1 bg-white dark:bg-white/10 text-black dark:text-white border border-black/10 dark:border-white/10 hover:bg-gray-50"
                  onClick={() => setMenuView('main')}
                >
                  {t('back')}
                </Button>
                <Button
                  className="flex-1 bg-budget-category-green text-white border-none hover:bg-budget-category-green/90"
                  onClick={() => {
                    setProfileMenuOpen(false);
                    setNewAccountOpen(true);
                  }}
                >
                  {t('new_account')}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

    </Layout>
  );
};

export default Settings;
