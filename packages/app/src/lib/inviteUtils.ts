/**
 * Shared helpers for invite-related UI components.
 * Single source of truth for formatting and display logic used across
 * PendingInvitesDrawer, PendingInvites page, and InviteDetailDialog.
 */

/** Returns up to two initials derived from a display name or email. */
export function getInviteInitials(email: string | null, name: string | null): string {
  if (name) {
    const parts = name.split(' ');
    if (parts.length >= 2) {
      return (parts[0][0] + parts[1][0]).toUpperCase();
    }
    return name.slice(0, 2).toUpperCase();
  }
  if (!email) return '?';
  const parts = email.split('@')[0].split(/[._-]/);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }
  return parts[0].slice(0, 2).toUpperCase();
}

/**
 * Returns a human-readable relative date string for an invite timestamp.
 * @param dateString  ISO date string
 * @param t           i18next translation function — must provide `t('yesterday')`
 */
export function formatInviteDate(dateString: string, t: (key: string) => string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffDays = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24));

  if (diffDays === 0) {
    return new Intl.DateTimeFormat('default', { hour: '2-digit', minute: '2-digit' }).format(date);
  }
  if (diffDays === 1) return t('yesterday');
  if (diffDays < 7) {
    return new Intl.DateTimeFormat('default', { weekday: 'long' }).format(date);
  }
  return new Intl.DateTimeFormat('default', { month: 'short', day: 'numeric' }).format(date);
}

/**
 * Returns a full long-form date string used in the invite detail dialog.
 */
export function formatInviteDateLong(dateString: string): string {
  return new Intl.DateTimeFormat('default', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(dateString));
}
