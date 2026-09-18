// --- Session token ---

const SESSION_TOKEN_KEY = 'session_token';

/**
 * Returns true if a session token is present in localStorage.
 * This is the canonical way to check whether the user has a persisted online
 * session; components should call this rather than inlining the localStorage
 * read so expiry or migration semantics can be added in one place later.
 */
export function getHasSession(): boolean {
  return !!localStorage.getItem(SESSION_TOKEN_KEY);
}

export const CURRENT_ACCOUNT_ID_KEY = 'currentAccountId';

export function getStoredCurrentAccountId(): string | null {
  return localStorage.getItem(CURRENT_ACCOUNT_ID_KEY);
}

export function setStoredCurrentAccountId(accountId: string): void {
  localStorage.setItem(CURRENT_ACCOUNT_ID_KEY, accountId);
}

/**
 * Clears the persisted current-account id. Used when the previously selected
 * account no longer exists (e.g. after logout deletes online accounts) so a
 * stale id cannot resurrect a deleted account on the next login/registration.
 */
export function clearStoredCurrentAccountId(): void {
  localStorage.removeItem(CURRENT_ACCOUNT_ID_KEY);
}

// --- Online features prompt global opt-out ---

const ONLINE_PROMPT_OPT_OUT_KEY = 'online_prompt_opt_out';

/**
 * Returns true if the user has opted out of the online features prompt.
 */
export function hasOptedOutOfOnlinePrompt(): boolean {
  return localStorage.getItem(ONLINE_PROMPT_OPT_OUT_KEY) === 'true';
}

/**
 * Marks the online features prompt as opted-out globally.
 */
export function setOptedOutOfOnlinePrompt(): void {
  localStorage.setItem(ONLINE_PROMPT_OPT_OUT_KEY, 'true');
}

/**
 * Clears the online features prompt opt-out so the prompt will be shown again.
 */
export function clearOptedOutOfOnlinePrompt(): void {
  localStorage.removeItem(ONLINE_PROMPT_OPT_OUT_KEY);
}

// --- Post-registration redirect ---

const PENDING_REDIRECT_KEY = 'pending_redirect';

/**
 * Stores a URL path to redirect to after registration and online transition.
 * Used when the user starts from a context like SharingSettings and needs
 * to return there after completing registration.
 */
export function setPendingRedirect(path: string): void {
  localStorage.setItem(PENDING_REDIRECT_KEY, path);
}

/**
 * Returns and clears the pending redirect path, if any.
 */
export function consumePendingRedirect(): string | null {
  const path = localStorage.getItem(PENDING_REDIRECT_KEY);
  if (path) {
    localStorage.removeItem(PENDING_REDIRECT_KEY);
  }
  return path;
}

// --- Auto-retry sharing sync after online transition ---

const PENDING_SHARING_RETRY_KEY = 'pending_sharing_retry';

/**
 * Stores an account ID that needs an automatic sync retry after going online.
 * Used when the user clicks "Sync now" from SharingSettings, goes through the
 * online prompt / registration flow, and returns — the retry should happen
 * automatically without requiring another button press.
 */
export function setPendingSharingRetry(accountId: string): void {
  localStorage.setItem(PENDING_SHARING_RETRY_KEY, accountId);
}

/**
 * Returns and clears the pending sharing retry account ID, if any.
 */
export function consumePendingSharingRetry(): string | null {
  const id = localStorage.getItem(PENDING_SHARING_RETRY_KEY);
  if (id) {
    localStorage.removeItem(PENDING_SHARING_RETRY_KEY);
  }
  return id;
}
