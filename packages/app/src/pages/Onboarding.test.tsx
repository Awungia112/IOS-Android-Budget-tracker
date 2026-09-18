/** @vitest-environment jsdom */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import Onboarding from "./Onboarding";

const makeRecoveryScreen = ({
  secretCode,
  isUploading,
  uploadError,
  onConfirmed,
  onRetryUpload,
}: {
  secretCode: string;
  onConfirmed: () => void;
  isUploading: boolean;
  uploadError: boolean;
  onRetryUpload?: () => void;
}) => (
  <div>
    <div>recovery.title</div>
    <div>{secretCode}</div>
    {isUploading && <div>recovery.uploading</div>}
    {uploadError && (
      <div>
        <div>recovery.upload_error</div>
        {onRetryUpload && (
          <button type="button" onClick={onRetryUpload} data-testid="recovery-retry-upload-button">
            recovery.retry_upload
          </button>
        )}
        <input
          type="checkbox"
          data-testid="recovery-upload-failure-acknowledged-checkbox"
          onChange={() => undefined}
        />
      </div>
    )}
    <button type="button" onClick={onConfirmed}>
      recovery.proceed
    </button>
  </div>
);

const addAccount = vi.fn();
const switchAccount = vi.fn();
const setIsAuthenticated = vi.fn();
const setIsLoggedIn = vi.fn();

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: {
      language: "en",
      changeLanguage: vi.fn(),
    },
  }),
}));

vi.mock("react-router-dom", () => ({
  useNavigate: () => vi.fn(),
}));

vi.mock("@budget/core", () => ({
  generateSecretCode: vi.fn(),
  parseSecretCodeWords: vi.fn(),
  sealRecovery: vi.fn(),
  enrollRecovery: vi.fn(),
  loadPrivateKey: vi.fn(),
}));

import {
  generateSecretCode as generateSecretCodeFn,
  parseSecretCodeWords as parseSecretCodeWordsFn,
  sealRecovery as sealRecoveryFn,
  enrollRecovery as enrollRecoveryFn,
  loadPrivateKey as loadPrivateKeyFn,
} from "@budget/core";

const generateSecretCode = vi.mocked(generateSecretCodeFn);
const parseSecretCodeWords = vi.mocked(parseSecretCodeWordsFn);
const sealRecovery = vi.mocked(sealRecoveryFn);
const enrollRecovery = vi.mocked(enrollRecoveryFn);
const loadPrivateKey = vi.mocked(loadPrivateKeyFn);

vi.mock("@/hooks/useSwipeNavigation", () => ({
  useSwipeNavigation: () => ({ swipeHandlers: {}, dragOffset: 0 }),
}));

vi.mock("@/components/RecoveryCodeScreen", () => ({
  RecoveryCodeScreen: ({
    secretCode,
    onConfirmed,
    isUploading,
    uploadError,
    onRetryUpload,
  }: any) =>
    makeRecoveryScreen({ secretCode, onConfirmed, isUploading, uploadError, onRetryUpload }),
}));

vi.mock("@/contexts/BudgetContext", () => ({
  useBudget: () => ({
    accounts: [],
    addAccount,
    switchAccount,
  }),
}));

vi.mock("@/contexts/AccountContext", () => ({
  useAccount: () => ({
    isAuthenticated: false,
    setIsAuthenticated,
    isLoggedIn: false,
    setIsLoggedIn,
    logout: vi.fn(),
    resetOnboarding: vi.fn(),
  }),
}));

const setImportMetaEnv = () => {
  Object.assign(import.meta.env, {
    VITE_RECOVERY_SERVER_URL: "https://recovery.example.com",
  });
};

const EMAIL_HASH = "a".repeat(64);
const USER_ID = "test-user-id";
const accountName = "Test Account";
const account = { id: "account-id", name: accountName, initials: "TA" };
const secretCode = "alpha-bravo-charlie-delta-echo-foxtrot";
const privateKey = new Uint8Array([1, 2, 3, 4]);
const envelope = {
  v: 1 as const,
  alg: "argon2id+xchacha20-poly1305" as const,
  kdf_salt: "AAAAAAAAAAAAAAAAAAAAAA",
  kdf_ops: 2,
  kdf_mem: 67108864,
  nonce: "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
  ciphertext: "A".repeat(64),
} as const;

describe("Onboarding page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    parseSecretCodeWords.mockReturnValue(secretCode.split("-"));
  });

  afterEach(() => {
    delete (import.meta.env as Record<string, unknown>).VITE_RECOVERY_SERVER_URL;
    vi.restoreAllMocks();
  });

  it("shows only the get-started action on the first slide", () => {
    render(<Onboarding />);

    expect(screen.getByTestId("onboarding-next-button")).toBeInTheDocument();
    expect(screen.queryByTestId("onboarding-register-button")).not.toBeInTheDocument();
    expect(screen.queryByTestId("onboarding-signin-button")).not.toBeInTheDocument();
    expect(screen.queryByTestId("onboarding-recover-button")).not.toBeInTheDocument();
  });

  it("shows the recovery code screen after successful account creation", async () => {
    setImportMetaEnv();
    localStorage.setItem("emailHash", EMAIL_HASH);
    localStorage.setItem("userId", USER_ID);
    generateSecretCode.mockResolvedValueOnce(secretCode);
    addAccount.mockResolvedValueOnce(account);
    loadPrivateKey.mockResolvedValueOnce(privateKey);
    sealRecovery.mockResolvedValueOnce(envelope);
    enrollRecovery.mockResolvedValueOnce({ success: true });

    render(<Onboarding />);

    fireEvent.click(screen.getByTestId("onboarding-next-button"));
    fireEvent.click(screen.getByTestId("onboarding-next-button"));
    fireEvent.click(screen.getByTestId("onboarding-next-button"));

    const nameInput = await screen.findByTestId(
      "onboarding-account-name-input",
    );
    fireEvent.change(nameInput, { target: { value: accountName } });
    fireEvent.click(screen.getByTestId("onboarding-account-submit-button"));

    await waitFor(() => expect(generateSecretCode).toHaveBeenCalledOnce());
    await waitFor(() => expect(addAccount).toHaveBeenCalledOnce());

    expect(screen.getByText("recovery.title")).toBeInTheDocument();
    expect(screen.getByText(secretCode)).toBeInTheDocument();
  });

  it("completes onboarding without showing recovery when enrollment prerequisites are missing", async () => {
    generateSecretCode.mockResolvedValueOnce(secretCode);
    addAccount.mockResolvedValueOnce(account);

    render(<Onboarding />);

    fireEvent.click(screen.getByTestId("onboarding-next-button"));
    fireEvent.click(screen.getByTestId("onboarding-next-button"));
    fireEvent.click(screen.getByTestId("onboarding-next-button"));

    const nameInput = await screen.findByTestId(
      "onboarding-account-name-input",
    );
    fireEvent.change(nameInput, { target: { value: accountName } });
    fireEvent.click(screen.getByTestId("onboarding-account-submit-button"));

    await waitFor(() => expect(setIsAuthenticated).toHaveBeenCalledWith(true));
    expect(screen.queryByText("recovery.title")).not.toBeInTheDocument();
    expect(loadPrivateKey).not.toHaveBeenCalled();
  });

  it("displays an error message when secret code generation fails", async () => {
    generateSecretCode.mockRejectedValueOnce(new Error("entropy failure"));

    render(<Onboarding />);

    fireEvent.click(screen.getByTestId("onboarding-next-button"));
    fireEvent.click(screen.getByTestId("onboarding-next-button"));
    fireEvent.click(screen.getByTestId("onboarding-next-button"));

    const nameInput = await screen.findByTestId(
      "onboarding-account-name-input",
    );
    fireEvent.change(nameInput, { target: { value: accountName } });
    fireEvent.click(screen.getByTestId("onboarding-account-submit-button"));

    await waitFor(() => expect(generateSecretCode).toHaveBeenCalledOnce());
    expect(screen.getByText("recovery.setup_error")).toBeInTheDocument();
    expect(addAccount).not.toHaveBeenCalled();
  });

  it("does not show recovery.setup_error when addAccount throws (addAccount shows its own toast)", async () => {
    // addAccount already shows a toast when it fails — the catch block must
    // bail silently so the user sees only the account-creation error, not a
    // misleading "recovery code could not be generated" message.
    generateSecretCode.mockResolvedValueOnce(secretCode);
    addAccount.mockRejectedValueOnce(new Error("failed to create account"));

    render(<Onboarding />);

    fireEvent.click(screen.getByTestId("onboarding-next-button"));
    fireEvent.click(screen.getByTestId("onboarding-next-button"));
    fireEvent.click(screen.getByTestId("onboarding-next-button"));

    const nameInput = await screen.findByTestId("onboarding-account-name-input");
    fireEvent.change(nameInput, { target: { value: accountName } });
    fireEvent.click(screen.getByTestId("onboarding-account-submit-button"));

    await waitFor(() => expect(addAccount).toHaveBeenCalledOnce());
    expect(screen.queryByText("recovery.setup_error")).not.toBeInTheDocument();
    // Recovery screen must not appear
    expect(screen.queryByText("recovery.title")).not.toBeInTheDocument();
  });

  it("shows recovery.setup_error when resolveRecoveryEnrollmentContext throws unexpectedly", async () => {
    setImportMetaEnv();
    localStorage.setItem("emailHash", EMAIL_HASH);
    localStorage.setItem("userId", USER_ID);
    generateSecretCode.mockResolvedValueOnce(secretCode);
    addAccount.mockResolvedValueOnce(account);
    // loadPrivateKey is called inside resolveRecoveryEnrollmentContext;
    // make it throw to simulate a keystore I/O failure
    loadPrivateKey.mockRejectedValueOnce(new Error("keystore unavailable"));

    render(<Onboarding />);

    fireEvent.click(screen.getByTestId("onboarding-next-button"));
    fireEvent.click(screen.getByTestId("onboarding-next-button"));
    fireEvent.click(screen.getByTestId("onboarding-next-button"));

    const nameInput = await screen.findByTestId("onboarding-account-name-input");
    fireEvent.change(nameInput, { target: { value: accountName } });
    fireEvent.click(screen.getByTestId("onboarding-account-submit-button"));

    await waitFor(() =>
      expect(screen.getByText("recovery.setup_error")).toBeInTheDocument(),
    );
    // Recovery screen must not appear
    expect(screen.queryByText("recovery.title")).not.toBeInTheDocument();
  });

  it("shows upload error when recovery enrollment fails after account creation", async () => {
    setImportMetaEnv();
    localStorage.setItem("emailHash", EMAIL_HASH);
    localStorage.setItem("userId", USER_ID);
    generateSecretCode.mockResolvedValueOnce(secretCode);
    addAccount.mockResolvedValueOnce(account);
    loadPrivateKey.mockResolvedValueOnce(privateKey);
    sealRecovery.mockResolvedValueOnce(envelope);
    enrollRecovery.mockResolvedValueOnce({
      success: false,
      reason: "server_error",
      status: 500,
    });

    render(<Onboarding />);

    fireEvent.click(screen.getByTestId("onboarding-next-button"));
    fireEvent.click(screen.getByTestId("onboarding-next-button"));
    fireEvent.click(screen.getByTestId("onboarding-next-button"));

    const nameInput = await screen.findByTestId(
      "onboarding-account-name-input",
    );
    fireEvent.change(nameInput, { target: { value: accountName } });
    fireEvent.click(screen.getByTestId("onboarding-account-submit-button"));

    await waitFor(() =>
      expect(screen.getByText("recovery.upload_error")).toBeInTheDocument(),
    );
  });

  it("retry button re-triggers enrollment upload after a failure", async () => {
    setImportMetaEnv();
    localStorage.setItem("emailHash", EMAIL_HASH);
    localStorage.setItem("userId", USER_ID);
    generateSecretCode.mockResolvedValueOnce(secretCode);
    addAccount.mockResolvedValueOnce(account);
    loadPrivateKey.mockResolvedValue(privateKey);
    sealRecovery.mockResolvedValue(envelope);
    // First call fails, second succeeds
    enrollRecovery
      .mockResolvedValueOnce({ success: false, reason: "server_error", status: 500 })
      .mockResolvedValueOnce({ success: true });

    render(<Onboarding />);

    fireEvent.click(screen.getByTestId("onboarding-next-button"));
    fireEvent.click(screen.getByTestId("onboarding-next-button"));
    fireEvent.click(screen.getByTestId("onboarding-next-button"));

    const nameInput = await screen.findByTestId("onboarding-account-name-input");
    fireEvent.change(nameInput, { target: { value: accountName } });
    fireEvent.click(screen.getByTestId("onboarding-account-submit-button"));

    await waitFor(() =>
      expect(screen.getByTestId("recovery-retry-upload-button")).toBeInTheDocument(),
    );

    fireEvent.click(screen.getByTestId("recovery-retry-upload-button"));

    await waitFor(() => expect(enrollRecovery).toHaveBeenCalledTimes(2));
  });
});
