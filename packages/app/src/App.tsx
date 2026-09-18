import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate, useNavigate } from "react-router-dom";
import { BudgetProvider } from "@/contexts/BudgetContext";
import { ThemeProvider } from "@/contexts/ThemeContext";
import { AccountProvider } from "@/contexts/AccountContext";
import { MigrationDrawerProvider } from "@/contexts/MigrationDrawerContext";
import { PendingInvitesProvider } from "@/contexts/PendingInvitesContext";
import { useTranslation } from "react-i18next";
import { useAccount } from "@/contexts/AccountContext";
import PWAInstallPrompt from "./components/PWAInstallPrompt";
import FirefoxInstallHint from "./components/FirefoxInstallHint";
import ConnectivityStatus from "./components/ConnectivityStatus";
import { LocalMigrationGate } from "./components/LocalMigrationGate";
import { QRCodeCanvas } from "qrcode.react";
import React, { useEffect, useState, Suspense, lazy } from "react";
import { Capacitor } from "@capacitor/core";
import * as Sentry from "@sentry/capacitor";
import { SUPPORT_EMAIL, buildMailto } from "@/config/support";

// Lazy load all pages for code splitting
const Index = lazy(() => import("./pages/Index"));
const NotFound = lazy(() => import("./pages/NotFound"));
const Settings = lazy(() => import("./pages/Settings"));
const Feedback = lazy(() => import("./pages/Feedback"));
const Templates = lazy(() => import("./pages/Templates"));
const TemplateForm = lazy(() => import("./pages/TemplateForm"));
const Statistics = lazy(() => import("./pages/Statistics"));
const Categories = lazy(() => import("./pages/Categories"));
const Balance = lazy(() => import("./pages/Balance"));
const Limits = lazy(() => import("./pages/Limits"));
const LimitForm = lazy(() => import("./pages/LimitForm"));
const LimitDetail = lazy(() => import("./pages/LimitDetail"));
const SavingsGoals = lazy(() => import("./pages/SavingsGoals"));
const SavingsGoalForm = lazy(() => import("./pages/SavingsGoalForm"));
const SavingsGoalDetail = lazy(() => import("./pages/SavingsGoalDetail"));
const MakeSavingsPayment = lazy(() => import("./pages/MakeSavingsPayment"));
const RecurringItems = lazy(() => import("./pages/RecurringItems"));
const RecurringItemForm = lazy(() => import("./pages/RecurringItemForm"));
const Onboarding = lazy(() => import("./pages/Onboarding"));
const Impressum = lazy(() => import("./pages/Impressum"));
const Datenschutz = lazy(() => import("./pages/Datenschutz"));
const About = lazy(() => import("./pages/About"));
const MigrationPage = lazy(() => import("./pages/MigrationPage"));
const SharingSettings = lazy(() => import("./pages/SharingSettings"));
const PendingInvites = lazy(() => import("./pages/PendingInvites"));
const SQLiteSmoke = lazy(() => import("./pages/SQLiteSmoke"));
const RealmSmoke = lazy(() => import("./pages/RealmSmoke"));
const Account = lazy(() => import("./pages/Account"));
const RegistrationEmail = lazy(() => import("./pages/RegistrationEmail"));
const RegistrationCheckEmail = lazy(() => import("./pages/RegistrationCheckEmail"));
const RegistrationOTP = lazy(() => import("./pages/RegistrationOTP"));
const RegistrationVerify = lazy(() => import("./pages/RegistrationVerify"));
const RegistrationSuccess = lazy(() => import("./pages/RegistrationSuccess"));
const RecoveryEmail = lazy(() => import("./pages/RecoveryEmail"));
const RecoveryOTP = lazy(() => import("./pages/RecoveryOTP"));
const RecoveryCode = lazy(() => import("./pages/RecoveryCode"));

const queryClient = new QueryClient();

// Simple loading component for Suspense
const PageLoader = () => (
  <div className="flex flex-col items-center justify-center min-h-screen bg-budget-dark">
    <div className="w-12 h-12 rounded-full border-4 border-budget-blue/20 border-t-budget-blue animate-spin mb-4"></div>
    <p className="text-white/60 text-sm font-medium animate-pulse">Loading...</p>
  </div>
);

// Error Boundary for handling chunk load failures
export class ErrorBoundary extends React.Component<{ children: React.ReactNode }, { hasError: boolean }> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: Error) {
    // Report to Sentry so chunk-load failures appear in the crash dashboard.
    // The beforeSend hook in monitoring.ts scrubs PII before transmission.
    Sentry.captureException(error);
    console.error("Chunk load error:", error);
  }

  render() {
    if (this.state.hasError) {
      const appVersion = APP_VERSION;
      const platform = Capacitor.getPlatform();
      const subject = '[App-Fehler] Verbindungsproblem';
      const body = `Hallo,\n\nIch habe einen Fehler beim Laden der App festgestellt.\n\nApp-Version: ${appVersion}\nPlattform: ${platform}\n\nBitte helfen Sie mir, dieses Problem zu lösen.`;
      const mailtoHref = buildMailto(SUPPORT_EMAIL, subject, body);

      return (
        <div className="flex flex-col items-center justify-center min-h-screen bg-budget-dark px-10 text-center">
          <h2 className="text-white text-xl font-bold mb-4">Verbindungsproblem</h2>
          <p className="text-white/70 mb-8">Wir hatten Probleme beim Laden dieses Teils der App. Bitte überprüfen Sie Ihre Verbindung und versuchen Sie es erneut.</p>
          <div className="flex flex-col gap-3 w-full max-w-xs">
            <button
              onClick={() => window.location.reload()}
              className="px-6 py-3 bg-budget-blue text-white rounded-lg font-bold hover:bg-budget-blue/90 transition-colors"
            >
              App neu laden
            </button>
            <a
              href={mailtoHref}
              className="px-6 py-3 bg-gray-600 text-white rounded-lg font-bold hover:bg-gray-500 transition-colors text-center"
              data-testid="app-error-contact-support"
            >
              Support kontaktieren
            </a>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

// Protected route component
const ProtectedRoute = ({ children }: { children: React.ReactNode }) => {
  const { isAuthenticated } = useAccount();
  return isAuthenticated ? (
    <>{children}</>
  ) : (
    <Navigate to="/onboarding" replace />
  );
};

const DesktopOverlay = () => {
  const [isDesktop, setIsDesktop] = useState(false);

  useEffect(() => {
    // Never show the desktop gate inside a native app (iPhone/iPad/Android).
    if (Capacitor.isNativePlatform()) {
      setIsDesktop(false);
      return;
    }
    const checkDesktop = () => {
      setIsDesktop(window.innerWidth > 900);
    };
    checkDesktop();
    window.addEventListener("resize", checkDesktop);
    return () => window.removeEventListener("resize", checkDesktop);
  }, []);

  if (!isDesktop) return null;

  return (
    <div
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        width: "100vw",
        height: "100vh",
        background: "rgba(0,0,0,0.85)",
        zIndex: 9999,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        color: "#fff",
        textAlign: "center",
      }}
    >
      <h2 style={{ fontSize: 32, marginBottom: 16 }}>
        Open on your mobile device
      </h2>
      <p style={{ fontSize: 18, marginBottom: 24 }}>
        Scan this QR code to open and install the app on your phone or tablet.
      </p>
      <QRCodeCanvas
        value={window.location.href}
        size={200}
        bgColor="#fff"
        fgColor="#1E90FF"
        aria-label="QR Code to open this app on mobile"
      />
      <p style={{ marginTop: 24, fontSize: 16 }}>
        Or visit this URL on your mobile browser:
        <br />
        <span style={{ color: "#1E90FF" }}>{window.location.href}</span>
      </p>
    </div>
  );
};

const DeepLinkHandler = () => {
  const navigate = useNavigate();

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;

    let cleanup: (() => void) | undefined;

    import('@capacitor/app')
      .then(({ App: CapApp }) => {
        CapApp.addListener('appUrlOpen', (event: { url: string }) => {
          try {
            const url = new URL(event.url);
            const path = url.pathname;
            const search = url.search;

            if (path === '/register/verify') {
              navigate(`${path}${search}`);
            }
          } catch (err) {
            console.error('Deep link parsing error:', err);
          }
        });

        cleanup = () => { CapApp.removeAllListeners(); };
      })
      .catch((err) => {
        console.warn('Capacitor App plugin unavailable:', err);
      });

    return () => { cleanup?.(); };
  }, [navigate]);

  return null;
};

const App = () => {
  const { t, i18n } = useTranslation();
  const language = i18n.language;
  const [isDesktop, setIsDesktop] = useState(false);

  useEffect(() => {
    // The desktop overlay is a web-PWA concern only.
    // Never show it inside the native Capacitor shell (iPhone or iPad),
    // otherwise reviewers testing on iPad see a QR-code gate instead of the app.
    if (Capacitor.isNativePlatform()) {
      setIsDesktop(false);
      return;
    }
    const checkDesktop = () => {
      setIsDesktop(window.innerWidth > 900);
    };
    checkDesktop();
    window.addEventListener("resize", checkDesktop);
    return () => window.removeEventListener("resize", checkDesktop);
  }, []);

  if (isDesktop) {
    return <DesktopOverlay />;
  }

  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider defaultTheme="system" storageKey="budget-wise-theme">
        <TooltipProvider>
          <BrowserRouter
            future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
          >
            <DeepLinkHandler />
            <LocalMigrationGate>
              <AccountProvider>
                <PendingInvitesProvider>
                  <BudgetProvider>
                    <MigrationDrawerProvider>
                    <Toaster />
                    <Sonner />
                    <PWAInstallPrompt />
                    <FirefoxInstallHint />
                    <ConnectivityStatus />
                    <ErrorBoundary>
                      <Suspense fallback={<PageLoader />}>
                        <Routes>
                      <Route path="/onboarding" element={<Onboarding />} />
                      <Route path="/account" element={<Account />} />
                      <Route path="/register" element={<RegistrationEmail />} />
                      <Route path="/register/check-email" element={<RegistrationCheckEmail />} />
                      <Route path="/register/verify" element={<RegistrationVerify />} />
                      <Route path="/register/otp" element={<RegistrationOTP />} />
                      <Route path="/register/success" element={<RegistrationSuccess />} />
                      <Route path="/recovery" element={<RecoveryEmail />} />
                      <Route path="/recovery/otp" element={<RecoveryOTP />} />
                      <Route path="/recovery/code" element={<RecoveryCode />} />
                      <Route
                        path="/"
                        element={
                          <ProtectedRoute>
                            <Index />
                          </ProtectedRoute>
                        }
                      />
                      <Route
                        path="/settings"
                        element={
                          <ProtectedRoute>
                            <Settings />
                          </ProtectedRoute>
                        }
                      />
                      <Route
                        path="/feedback"
                        element={
                          <ProtectedRoute>
                            <Feedback />
                          </ProtectedRoute>
                        }
                      />
                      <Route
                        path="/templates"
                        element={
                          <ProtectedRoute>
                            <Templates />
                          </ProtectedRoute>
                        }
                      />
                      <Route
                        path="/templates/add"
                        element={
                          <ProtectedRoute>
                            <TemplateForm />
                          </ProtectedRoute>
                        }
                      />
                      <Route
                        path="/templates/edit/:templateId"
                        element={
                          <ProtectedRoute>
                            <TemplateForm />
                          </ProtectedRoute>
                        }
                      />
                      <Route
                        path="/balance"
                        element={
                          <ProtectedRoute>
                            <Balance />
                          </ProtectedRoute>
                        }
                      />
                      <Route
                        path="/statistics"
                        element={
                          <ProtectedRoute>
                            <Statistics />
                          </ProtectedRoute>
                        }
                      />
                      <Route
                        path="/categories/:type"
                        element={
                          <ProtectedRoute>
                            <Categories />
                          </ProtectedRoute>
                        }
                      />
                      <Route
                        path="/limits"
                        element={
                          <ProtectedRoute>
                            <Limits />
                          </ProtectedRoute>
                        }
                      />
                      <Route
                        path="/limits/add"
                        element={
                          <ProtectedRoute>
                            <LimitForm />
                          </ProtectedRoute>
                        }
                      />
                      <Route
                        path="/limits/edit/:limitId"
                        element={
                          <ProtectedRoute>
                            <LimitForm />
                          </ProtectedRoute>
                        }
                      />
                      <Route
                        path="/limits/:limitId"
                        element={
                          <ProtectedRoute>
                            <LimitDetail />
                          </ProtectedRoute>
                        }
                      />
                      <Route
                        path="/savings-goals"
                        element={
                          <ProtectedRoute>
                            <SavingsGoals />
                          </ProtectedRoute>
                        }
                      />
                      <Route
                        path="/savings-goals/add"
                        element={
                          <ProtectedRoute>
                            <SavingsGoalForm />
                          </ProtectedRoute>
                        }
                      />
                      <Route
                        path="/savings-goals/edit/:goalId"
                        element={
                          <ProtectedRoute>
                            <SavingsGoalForm />
                          </ProtectedRoute>
                        }
                      />
                      <Route
                        path="/savings-goals/:goalId/pay"
                        element={
                          <ProtectedRoute>
                            <MakeSavingsPayment />
                          </ProtectedRoute>
                        }
                      />
                      <Route
                        path="/savings-goals/:goalId"
                        element={
                          <ProtectedRoute>
                            <SavingsGoalDetail />
                          </ProtectedRoute>
                        }
                      />
                      <Route
                        path="/recurring"
                        element={
                          <ProtectedRoute>
                            <RecurringItems />
                          </ProtectedRoute>
                        }
                      />
                      <Route
                        path="/recurring/add"
                        element={
                          <ProtectedRoute>
                            <RecurringItemForm />
                          </ProtectedRoute>
                        }
                      />
                      <Route
                        path="/recurring/edit/:itemId"
                        element={
                          <ProtectedRoute>
                            <RecurringItemForm />
                          </ProtectedRoute>
                        }
                      />
                      <Route
                        path="/migration"
                        element={
                          <ProtectedRoute>
                            <MigrationPage />
                          </ProtectedRoute>
                        }
                      />
                      <Route path="/impressum" element={<Impressum />} />
                      <Route path="/datenschutz" element={<Datenschutz />} />
                      <Route path="/about" element={<About />} />
                      <Route
                        path="/settings/sharing/:accountId"
                        element={
                          <ProtectedRoute>
                            <SharingSettings />
                          </ProtectedRoute>
                        }
                      />
                      <Route
                        path="/invites"
                        element={
                          <ProtectedRoute>
                            <PendingInvites />
                          </ProtectedRoute>
                        }
                      />
                      <Route path="/sqlite-smoke" element={<SQLiteSmoke />} />
                      <Route path="/realm-smoke" element={<RealmSmoke />} />
                      <Route path="*" element={<NotFound />} />
                        </Routes>
                      </Suspense>
                    </ErrorBoundary>
                  </MigrationDrawerProvider>
                </BudgetProvider>
              </PendingInvitesProvider>
            </AccountProvider>
          </LocalMigrationGate>
        </BrowserRouter>
        </TooltipProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
};

export default App;
