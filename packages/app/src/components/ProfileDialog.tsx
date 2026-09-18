import React, { useRef, useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "./ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "./ui/alert-dialog";
import { Input } from "./ui/input";
import { Button } from "./ui/button";
import { Switch } from "./ui/switch";
import { useBudget } from "@/contexts/BudgetContext";
import { Avatar, AvatarFallback } from "./ui/avatar";
import Spinner from "./ui/Spinner";
import MembersList from "./MembersList";
import { Camera, Trash2, Upload } from "lucide-react";
import { cn } from "@/lib/utils";
import { useTranslation } from "react-i18next";

interface ProfileDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Trigger the "go online" transition (prompt/registration handled by the caller). */
  onGoOnline?: () => void;
  /** Trigger the "go offline" transition (confirmation handled by the caller). */
  onGoOffline?: () => void;
}

const ProfileDialog: React.FC<ProfileDialogProps> = ({
  open,
  onOpenChange,
  onGoOnline,
  onGoOffline,
}) => {
  const { t } = useTranslation();
  const {
    currentAccount,
    updateAccount,
    isOfflineMode,
    deleteAccount,
  } = useBudget();
  const [name, setName] = useState(currentAccount?.name || "");
  const [profileImage, setProfileImage] = useState(
    currentAccount?.profileImage || "",
  );
  const [loading, setLoading] = useState(false);
  const [showPhotoMenu, setShowPhotoMenu] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleUploadClick = () => {
    setShowPhotoMenu(false); // Hide menu immediately when upload is clicked
    fileInputRef.current?.click();
  };

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (ev) => {
        setProfileImage(ev.target?.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleDeletePhoto = () => {
    setProfileImage("");
    setShowPhotoMenu(false);
  };

  const handleCameraClick = () => {
    setShowPhotoMenu(true);
  };

  // Close menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Element;
      const menuElement = document.getElementById("photo-menu");

      if (showPhotoMenu && menuElement && !menuElement.contains(target)) {
        setShowPhotoMenu(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [showPhotoMenu]);

  const handleSave = async () => {
    if (!currentAccount) return;
    setLoading(true);
    const initials = name
      .trim()
      .split(/\s+/)
      .map((word) => word[0])
      .join("")
      .toUpperCase()
      .substring(0, 2);

    await updateAccount({
      ...currentAccount,
      name,
      initials,
      profileImage,
    });
    setLoading(false);
    onOpenChange(false);
  };

  const handleDeleteAccount = async () => {
    if (!currentAccount) return;
    setDeleting(true);
    try {
      await deleteAccount(currentAccount.id);
      setDeleteConfirmOpen(false);
      onOpenChange(false);
    } catch (error) {
      console.error("Failed to delete account:", error);
    } finally {
      setDeleting(false);
    }
  };

  React.useEffect(() => {
    if (open && currentAccount) {
      setName(currentAccount.name || "");
      setProfileImage(currentAccount.profileImage || "");
    }
  }, [open, currentAccount]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="rounded-[12px] max-w-[calc(100%-2rem)] bg-white dark:bg-[#1A2124] border-gray-200 dark:border-white/10 shadow-lg p-4">
        <DialogTitle className="text-black dark:text-white text-base font-semibold mb-4 text-center">
          {t("account_settings")}
        </DialogTitle>
        <DialogDescription className="sr-only">
          {t("account_settings")}
        </DialogDescription>
        <div className="flex flex-col items-center gap-4">
          <div className="relative">
            <Avatar className="h-20 w-20 bg-zinc-800">
              {profileImage ? (
                <img
                  src={profileImage}
                  alt="Profile"
                  className="h-full w-full object-cover rounded-full"
                />
              ) : (
                <AvatarFallback className="text-black dark:text-white font-bold text-xl bg-gray-100 dark:bg-white/10">
                  {currentAccount?.initials || "MK"}
                </AvatarFallback>
              )}
            </Avatar>
            <Button
              type="button"
              size="sm"
              className="absolute bottom-0 right-0 rounded-full h-8 w-8 p-0 bg-muted-foreground/60 hover:bg-muted-foreground/80 text-white border-none shadow-lg transition-transform"
              onClick={(e) => {
                e.stopPropagation();
                handleCameraClick();
              }}
              data-testid="camera-button"
            >
              <Camera className="h-4 w-4" />
            </Button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleImageChange}
            />

            {/* Popup Menu */}
            {showPhotoMenu && (
              <div
                id="photo-menu"
                className="absolute top-1/2 left-full ml-2 transform -translate-y-1/2 bg-white dark:bg-white/5 border-gray-200 dark:border-white/10 rounded-[8px] shadow-lg p-1 min-w-[120px] z-50 ring-1 ring-gray-200 dark:ring-white/10"
              >
                <Button
                  variant="ghost"
                  className="w-full flex items-center gap-1.5 px-1.5 py-1 text-black dark:text-white justify-start text-xs transition-all hover:bg-gray-100 dark:hover:bg-white/10"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleUploadClick();
                  }}
                  data-testid="upload-photo-button"
                >
                  <Upload className="h-3 w-3" />
                  {t("upload_photo")}
                </Button>
                {profileImage && (
                  <Button
                    variant="ghost"
                    className="w-full flex items-center gap-1.5 px-1.5 py-1 text-budget-red justify-start text-xs transition-all hover:bg-gray-100 dark:hover:bg-white/10"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDeletePhoto();
                    }}
                    data-testid="delete-photo-button"
                  >
                    <Trash2 className="h-3 w-3" />
                    {t("delete_photo")}
                  </Button>
                )}
              </div>
            )}
          </div>
          <div className="w-full">
            <label
              htmlFor="profile-name"
              className="block text-xs font-semibold mb-1 text-gray-500 dark:text-gray-400"
            >
              {t("name")}
            </label>
            <Input
              id="profile-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t("your_name")}
              className="bg-gray-50 dark:bg-white/5 border-gray-200 dark:border-white/10 text-black dark:text-white placeholder:text-gray-400 h-9 rounded-[8px] text-sm"
              data-testid="profile-name-input"
            />
          </div>
          {/* Online mode — toggle to go online or back offline */}
          <div className="w-full flex items-center justify-between rounded-[8px] bg-gray-50 dark:bg-white/5 border border-gray-200 dark:border-white/10 px-3 py-2">
            <span className="text-xs font-semibold text-gray-500 dark:text-gray-400">
              {t("online_mode")}
            </span>
            <Switch
              checked={!isOfflineMode}
              onCheckedChange={(checked) => {
                if (checked) onGoOnline?.();
                else onGoOffline?.();
              }}
              data-testid="profile-online-switch"
              className="data-[state=checked]:bg-budget-blue data-[state=unchecked]:bg-[#C4C4C4]"
            />
          </div>

          {/* Email is only shown when the account is online */}
          {!isOfflineMode && localStorage.getItem('userEmail') && (
            <div className="w-full">
              <label className="block text-xs font-semibold mb-1 text-gray-500 dark:text-gray-400">
                {t('email')}
              </label>
              <div className="w-full h-9 rounded-[8px] bg-gray-50 dark:bg-white/5 border border-gray-200 dark:border-white/10 px-3 flex items-center text-sm text-black dark:text-white">
                {localStorage.getItem('userEmail')}
              </div>
            </div>
          )}

          {/* Shared account members — invite is available even offline, routed
              through the online-features prompt */}
          {currentAccount && (
            <MembersList
              accountId={currentAccount.id}
              isOfflineMode={isOfflineMode}
              onGoOnline={onGoOnline}
            />
          )}

          <div className="flex gap-2 w-full">
            <Button
              variant="ghost"
              className="flex-1 text-gray-500 dark:text-gray-400 hover:text-black dark:hover:text-white text-xs h-8"
              onClick={() => onOpenChange(false)}
              disabled={loading}
            >
              {t("cancel")}
            </Button>
            <Button
              className="flex-1 bg-budget-category-green hover:bg-budget-category-green/90 text-white rounded-[8px] font-semibold text-xs h-8"
              onClick={handleSave}
              disabled={loading || !name.trim()}
              data-testid="save-profile-button"
            >
              {loading ? <Spinner size={16} /> : t("save_changes")}
            </Button>
          </div>

          <div className="w-full border-t border-gray-200 dark:border-white/10 pt-3">
            <Button
              variant="ghost"
              className="w-full flex items-center justify-center gap-1.5 text-budget-red hover:bg-red-50 dark:hover:bg-red-500/10 text-xs h-8"
              onClick={() => setDeleteConfirmOpen(true)}
              disabled={deleting}
              data-testid="delete-account-button"
            >
              <Trash2 className="h-3 w-3" />
              {t("delete_account")}
            </Button>
          </div>
        </div>
      </DialogContent>

      <AlertDialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
        <AlertDialogContent className="rounded-[12px] max-w-[calc(100%-2rem)] bg-white dark:bg-[#1A2124] border-gray-200 dark:border-white/10 shadow-lg">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-black dark:text-white">
              {t("delete_account")}
            </AlertDialogTitle>
            <AlertDialogDescription className="text-gray-500">
              {t("delete_account_warning")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>
              {t("cancel")}
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteAccount}
              disabled={deleting}
              className="bg-budget-red hover:bg-budget-red/90 text-white"
              data-testid="confirm-delete-account-button"
            >
              {deleting ? <Spinner size={16} /> : t("delete_account")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Dialog>
  );
};

export default ProfileDialog;
