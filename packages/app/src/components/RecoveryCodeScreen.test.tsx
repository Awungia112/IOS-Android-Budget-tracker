/** @vitest-environment jsdom */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import "@testing-library/jest-dom/vitest";
import { RecoveryCodeScreen } from "./RecoveryCodeScreen";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

// No react-router-dom mock — the component no longer uses useBlocker.
// Tests run under MemoryRouter (a real router) to verify no throws occur.

describe("RecoveryCodeScreen", () => {
  const secretCode = "alpha-bravo-charlie-delta-echo-foxtrot";
  const onConfirmed = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(window.history, "pushState");
    vi.spyOn(window.history, "back").mockImplementation(() => undefined);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        writeText: vi.fn().mockResolvedValue(undefined),
      },
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ── Real-router contract ──────────────────────────────────────────────────

  it("renders without throwing under a real BrowserRouter-compatible router", () => {
    // This test would throw under useBlocker + BrowserRouter because
    // useBlocker calls useDataRouterContext which is not available in
    // BrowserRouter / MemoryRouter. Passing here proves the component
    // is safe under the app's current router setup.
    expect(() =>
      render(
        <MemoryRouter>
          <RecoveryCodeScreen secretCode={secretCode} onConfirmed={onConfirmed} />
        </MemoryRouter>,
      ),
    ).not.toThrow();
  });

  // ── Basic rendering & confirmation ───────────────────────────────────────

  it("renders all code words and disables proceed until confirmed", () => {
    render(
      <MemoryRouter>
        <RecoveryCodeScreen secretCode={secretCode} onConfirmed={onConfirmed} />
      </MemoryRouter>,
    );

    const words = secretCode.split("-");
    for (const word of words) {
      expect(screen.getByText(word)).toBeInTheDocument();
    }

    const proceedButton = screen.getByTestId("recovery-proceed-button");
    expect(proceedButton).toBeDisabled();

    const checkbox = screen.getByTestId("recovery-confirm-checkbox");
    fireEvent.click(checkbox);
    expect(proceedButton).toBeEnabled();
  });

  it("uses parsed words when a recovery word contains hyphens", () => {
    render(
      <MemoryRouter>
        <RecoveryCodeScreen
          secretCode="drop-down-felt-tip-t-shirt-yo-yo-abacus-zoom"
          secretWords={["drop-down", "felt-tip", "t-shirt", "yo-yo", "abacus", "zoom"]}
          onConfirmed={onConfirmed}
        />
      </MemoryRouter>,
    );

    expect(screen.getByText("drop-down")).toBeInTheDocument();
    expect(screen.getByText("felt-tip")).toBeInTheDocument();
    expect(screen.getByText("t-shirt")).toBeInTheDocument();
    expect(screen.getByText("yo-yo")).toBeInTheDocument();
  });

  it("calls onConfirmed after confirmation and proceed click", () => {
    render(
      <MemoryRouter>
        <RecoveryCodeScreen secretCode={secretCode} onConfirmed={onConfirmed} />
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByTestId("recovery-confirm-checkbox"));
    fireEvent.click(screen.getByTestId("recovery-proceed-button"));

    expect(onConfirmed).toHaveBeenCalledTimes(1);
  });

  // ── Upload-state blocking (thread 3) ─────────────────────────────────────

  it("blocks proceed while upload is in progress", () => {
    render(
      <MemoryRouter>
        <RecoveryCodeScreen
          secretCode={secretCode}
          onConfirmed={onConfirmed}
          isUploading={true}
        />
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByTestId("recovery-confirm-checkbox"));
    expect(screen.getByTestId("recovery-proceed-button")).toBeDisabled();
  });

  it("blocks proceed after upload failure until user acknowledges no server backup", () => {
    render(
      <MemoryRouter>
        <RecoveryCodeScreen
          secretCode={secretCode}
          onConfirmed={onConfirmed}
          uploadError={true}
        />
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByTestId("recovery-confirm-checkbox"));

    // Still blocked — failure acknowledgement not checked
    expect(screen.getByTestId("recovery-proceed-button")).toBeDisabled();

    // Check the explicit acknowledgement
    fireEvent.click(screen.getByTestId("recovery-upload-failure-acknowledged-checkbox"));

    expect(screen.getByTestId("recovery-proceed-button")).toBeEnabled();
  });

  it("calls onConfirmed after upload-failure path: confirm + acknowledge + proceed", () => {
    render(
      <MemoryRouter>
        <RecoveryCodeScreen
          secretCode={secretCode}
          onConfirmed={onConfirmed}
          uploadError={true}
        />
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByTestId("recovery-confirm-checkbox"));
    fireEvent.click(screen.getByTestId("recovery-upload-failure-acknowledged-checkbox"));
    fireEvent.click(screen.getByTestId("recovery-proceed-button"));

    expect(onConfirmed).toHaveBeenCalledTimes(1);
  });

  // ── Copy ──────────────────────────────────────────────────────────────────

  it("copies recovery code to clipboard and shows copied label", async () => {
    render(
      <MemoryRouter>
        <RecoveryCodeScreen secretCode={secretCode} onConfirmed={onConfirmed} />
      </MemoryRouter>,
    );

    const copyButton = screen.getByRole("button", { name: "recovery.copy_code" });
    fireEvent.click(copyButton);

    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(secretCode);
    expect(
      await screen.findByRole("button", { name: "recovery.copied" }),
    ).toBeInTheDocument();
  });

  it("shows a copy failure message when clipboard is unavailable", async () => {
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        writeText: vi.fn().mockRejectedValue(new Error("NotAllowedError")),
      },
    });

    render(
      <MemoryRouter>
        <RecoveryCodeScreen secretCode={secretCode} onConfirmed={onConfirmed} />
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole("button", { name: "recovery.copy_code" }));

    expect(await screen.findByText("recovery.copy_failed")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "recovery.copied" })).not.toBeInTheDocument();
  });

  // ── Navigation guard (thread 2) ───────────────────────────────────────────

  it("pushes a history lock entry on mount while unconfirmed", () => {
    render(
      <MemoryRouter>
        <RecoveryCodeScreen secretCode={secretCode} onConfirmed={onConfirmed} />
      </MemoryRouter>,
    );

    expect(window.history.pushState).toHaveBeenCalledWith(
      { recoveryCodeLock: true },
      '',
    );
  });

  it("re-pushes the lock entry on popstate while unconfirmed", () => {
    render(
      <MemoryRouter>
        <RecoveryCodeScreen secretCode={secretCode} onConfirmed={onConfirmed} />
      </MemoryRouter>,
    );

    vi.mocked(window.history.pushState).mockClear();
    window.dispatchEvent(new PopStateEvent("popstate"));

    expect(window.history.pushState).toHaveBeenCalledWith(
      { recoveryCodeLock: true },
      '',
    );
  });

  it("releases the history lock after confirmation", () => {
    const { unmount } = render(
      <MemoryRouter>
        <RecoveryCodeScreen secretCode={secretCode} onConfirmed={onConfirmed} />
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByTestId("recovery-confirm-checkbox"));
    unmount();

    expect(window.history.back).toHaveBeenCalled();
  });
});
