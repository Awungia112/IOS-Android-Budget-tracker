import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach } from "vitest";
import Feedback from "../pages/Feedback";
import { useFeedbackForm } from "@/services/feedbackService";

// Mock dependencies
const mockToast = vi.hoisted(() => vi.fn());
vi.mock("@/hooks/use-toast", () => ({
  toast: mockToast,
}));

vi.mock("@/services/feedbackService");
vi.mock("@/components/Layout", () => ({
  default: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
}));

const mockNavigate = vi.fn();
vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual("react-router-dom");
  return {
    ...(actual as any),
    useNavigate: () => mockNavigate,
  };
});

// Mock i18next
vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: {
      changeLanguage: () => Promise.resolve(),
      language: "en",
    },
  }),
  I18nextProvider: ({ children }: { children: React.ReactNode }) => children,
  initReactI18next: { type: "3rdParty", init: () => {} },
}));

// Mock APP_VERSION globally if not defined
if (typeof (global as any).APP_VERSION === "undefined") {
  (global as any).APP_VERSION = "3.11.3-test.0";
}

describe("Feedback Page", () => {
  const mockSubmitFeedback = vi.fn();
  let user: ReturnType<typeof userEvent.setup>;

  beforeEach(() => {
    vi.clearAllMocks();
    user = userEvent.setup();
    vi.mocked(useFeedbackForm).mockReturnValue({
      submitFeedback: mockSubmitFeedback,
      state: { submitting: false },
    });
  });

  it("renders feedback form correctly", () => {
    render(<Feedback />);
    expect(screen.getByPlaceholderText("your_feedback")).toBeInTheDocument();
    expect(screen.getByTestId("feedback-email")).toBeInTheDocument();
    expect(screen.getByText("send_feedback")).toBeInTheDocument();
  });

  it("handles feedback submission with valid email", async () => {
    render(<Feedback />);
    const textarea = screen.getByPlaceholderText("your_feedback");
    const emailInput = screen.getByTestId("feedback-email");

    await user.type(emailInput, "user@example.com");
    await user.type(textarea, "Great app!");

    await user.click(screen.getByText("send_feedback"));
    expect(mockSubmitFeedback).toHaveBeenCalledWith("Great app!", "user@example.com");
  });

  it("validates email format in feedback", async () => {
    render(<Feedback />);
    const textarea = screen.getByPlaceholderText("your_feedback");
    const emailInput = screen.getByTestId("feedback-email");
    
    await user.type(textarea, "Great app!");
    await user.type(emailInput, "invalid-email");
    
    await user.click(screen.getByText("send_feedback"));
    
    // Should not call submitFeedback with invalid email
    expect(mockSubmitFeedback).not.toHaveBeenCalled();
    expect(mockToast).toHaveBeenCalledWith(expect.objectContaining({
      title: "error",
      description: "invalid_email",
    }));
  });

  it("blocks feedback submission when email is empty", async () => {
    render(<Feedback />);
    const textarea = screen.getByPlaceholderText("your_feedback");
    await user.type(textarea, "Great app!");

    await user.click(screen.getByText("send_feedback"));
    expect(mockSubmitFeedback).not.toHaveBeenCalled();
    expect(mockToast).toHaveBeenCalledWith(expect.objectContaining({
      title: "error",
      description: "email_required",
    }));
  });

  it("blocks feedback submission when feedback text is empty", async () => {
    render(<Feedback />);
    const emailInput = screen.getByTestId("feedback-email");
    await user.type(emailInput, "user@example.com");

    await user.click(screen.getByText("send_feedback"));
    expect(mockSubmitFeedback).not.toHaveBeenCalled();
    expect(mockToast).toHaveBeenCalledWith(expect.objectContaining({
      title: "error",
      description: "please_enter_feedback",
    }));
  });
});
