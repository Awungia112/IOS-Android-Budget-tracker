import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useBudget } from "@/contexts/BudgetContext";
import { useAccount } from "@/contexts/AccountContext";
import { useSwipeNavigation } from "@/hooks/useSwipeNavigation";
import { RecoveryCodeScreen } from "@/components/RecoveryCodeScreen";
import {
  generateSecretCode,
  loadPrivateKey,
  parseSecretCodeWords,
  sealRecovery,
} from "@budget/core";
import { enrollWithRetryOnConflict } from "@/lib/recovery-enroll";
import { getRecoveryServerUrl } from "@/lib/api";

type RecoveryEnrollmentContext = {
  recoveryServerUrl: string;
  emailHash: string;
  privateKey: Uint8Array;
};

const EMAIL_HASH_PATTERN = /^[0-9a-f]{64}$/;

async function resolveRecoveryEnrollmentContext(): Promise<RecoveryEnrollmentContext | null> {
  const recoveryServerUrl = getRecoveryServerUrl();
  if (!recoveryServerUrl) {
    console.warn(
      "[recovery] VITE_RECOVERY_SERVER_URL is not set — skipping recovery enrollment",
    );
    return null;
  }

  try {
    new URL(recoveryServerUrl);
  } catch {
    console.warn(
      "[recovery] VITE_RECOVERY_SERVER_URL is invalid — skipping recovery enrollment",
    );
    return null;
  }

  const emailHash = localStorage.getItem("emailHash");
  if (!emailHash || !EMAIL_HASH_PATTERN.test(emailHash)) {
    console.warn(
      "[recovery] valid emailHash not found in localStorage — skipping recovery enrollment",
    );
    return null;
  }

  const userId = localStorage.getItem("userId");
  if (!userId) {
    console.warn(
      "[recovery] userId not found in localStorage — skipping recovery enrollment",
    );
    return null;
  }

  const privateKey = await loadPrivateKey(userId);
  if (!privateKey) {
    console.warn(
      "[recovery] private key not found for userId — skipping recovery enrollment",
    );
    return null;
  }

  return {
    recoveryServerUrl,
    emailHash,
    privateKey,
  };
}

// Slide images: the offline/no-registration slide is shown first.
const SLIDE_IMAGES = [
  "/onboarding-animation/set-limits.gif",
  "/onboarding-animation/budget-expense.webp", // primary for crossfade
  "/onboarding-animation/savings-goals.gif",
];

// Welcome slide crossfade images
const WELCOME_IMAGES = [
  "/onboarding-animation/budget-expense.webp", // primary for crossfade
  "/onboarding-animation/welcome.gif",
];

const LOGO_SRC = "/assets/deutschland.webp";
const getHeaderSpacerHeight = (isSmallScreen: boolean) => {
  if (isSmallScreen) return "clamp(80px, 11svh, 100px)";
  return "clamp(90px, 12svh, 120px)";
};

// Language toggle shared across all screens
const LanguageToggle = () => {
  const { i18n } = useTranslation();
  const lang = i18n.language;

  return (
    <button
      onClick={() => i18n.changeLanguage(lang === "de" ? "en" : "de")}
      className="px-3 py-1.5 rounded-full bg-white border border-black/10 text-[13px] font-semibold text-[#0b0b0b] hover:bg-gray-50 transition-colors shadow-sm"
      aria-label={lang === "de" ? "Switch to English" : "Auf Deutsch wechseln"}
      data-testid="language-toggle"
    >
      {lang === "de" ? "EN" : "DE"}
    </button>
  );
};

// Crossfade between two static images (used for welcome slide).
// Uses CSS grid stacking (grid-area: 1/1) instead of absolute positioning
// so images are always in-flow and size correctly from the parent's explicit
// height — absolute + h-full chains collapse on some Android WebViews.
const ImageCrossfade = ({
  images,
  interval = 3000,
}: {
  images: string[];
  interval?: number;
}) => {
  const [activeIndex, setActiveIndex] = useState(0);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const timer = setInterval(() => {
      setActiveIndex((prev) => (prev + 1) % images.length);
    }, interval);
    return () => clearInterval(timer);
  }, [images.length, interval]);

  useEffect(() => {
    setMounted(true);
  }, []);

  // The wrapper is a single-cell grid. Every child image is placed in that
  // same cell (gridArea: '1/1'), stacked in DOM order. Opacity toggles drive
  // the crossfade. No absolute positioning — each img is a normal grid item
  // that inherits the parent's concrete width and height directly.
  return (
    <div
      style={{
        display: 'grid',
        width: '100%',
        maxWidth: '320px',
        height: '100%',
      }}
    >
      {/* First image — always rendered to avoid layout shift */}
      <img
        src={images[0]}
        alt=""
        loading="eager"
        className="transition-opacity duration-1000"
        style={{
          gridArea: '1/1',
          width: '100%',
          height: '100%',
          objectFit: 'contain',
          objectPosition: 'center',
          opacity: activeIndex === 0 ? 1 : 0,
          display: 'block',
        }}
      />
      {/* Remaining images — rendered after mount */}
      {mounted &&
        images.slice(1).map((src, i) => (
          <img
            key={src}
            src={src}
            alt=""
            loading="lazy"
            className="transition-opacity duration-1000"
            style={{
              gridArea: '1/1',
              width: '100%',
              height: '100%',
              objectFit: 'contain',
              objectPosition: 'center',
              opacity: i + 1 === activeIndex ? 1 : 0,
              display: 'block',
            }}
          />
        ))}
    </div>
  );
};

const OnboardingSlide = ({
  image,
  crossfadeImages,
  title,
  subtitle,
  body,
  isActive,
  isNear,
  headerSpacerHeight,
}: {
  image: string;
  crossfadeImages?: string[];
  title: string;
  subtitle?: string;
  body: string;
  isActive: boolean;
  isNear: boolean;
  headerSpacerHeight: string;
}) => (
  /*
   * Simple flex-column layout — far more predictable than grid across
   * Android WebView versions.
   *
   * The image container:
   *  - flex-1 min-h-0: Takes available space, shrinks to fit if needed
   *  - overflow-hidden: Prevents overlap with text/header if images overrun
   *
   * The text container:
   *  - shrink-0: Prioritized visibility (Inclusion Priority)
   *  - min-h: Guaranteed safe area for German translations
   */
  <div className="w-full h-full flex-shrink-0 flex flex-col">
    {/* Spacer for the absolutely-positioned logo/language bar */}
    <div className="shrink-0" style={{ height: headerSpacerHeight }} />

    {/* Image row — flexible, never collapses, overflow clipped */}
    <div
      className="flex-1 min-h-0 w-full flex items-center justify-center px-4 sm:px-6 overflow-hidden"
    >
      {isActive || isNear ? (
        crossfadeImages ? (
          <ImageCrossfade images={crossfadeImages} />
        ) : (
          <img
            src={image}
            alt=""
            loading="lazy"
            style={{
              width: '100%',
              maxWidth: '320px',
              height: '100%',
              objectFit: 'contain',
              objectPosition: 'center',
              display: 'block',
            }}
          />
        )
      ) : (
        <div
          style={{ width: '100%', maxWidth: '320px', height: '100%' }}
          className="rounded-lg bg-white/50 border border-black/5"
        />
      )}
    </div>

    {/* Text — prioritized visibility, never clipped */}
    <div
      className="shrink-0 min-h-[140px] w-full flex flex-col items-center justify-center px-8 text-center py-2"
      style={{ gap: '0.15rem' }}
    >
      <h1
        className="font-bold text-[#0b0b0b] leading-tight"
        style={{ fontSize: 'clamp(18px, min(5vw, 3.8svh), 28px)' }}
        data-testid="welcome-heading"
      >
        {title}
      </h1>
      {subtitle && (
        <p
          className="font-semibold text-[#0b0b0b]"
          style={{ fontSize: 'clamp(13px, min(3.5vw, 2.8svh), 17px)' }}
        >
          {subtitle}
        </p>
      )}
      <p
        className="text-[#0b0b0b]/80 leading-snug w-full max-w-[300px]"
        style={{ fontSize: 'clamp(12px, min(3.2vw, 2.5svh), 14px)' }}
      >
        {body}
      </p>
    </div>
  </div>
);

const DotIndicator = ({
  count,
  activeIndex,
  onDotClick,
}: {
  count: number;
  activeIndex: number;
  onDotClick: (index: number) => void;
}) => (
  <div
    className="flex items-center justify-center gap-2"
    role="tablist"
    aria-label="Slide navigation"
  >
    {Array.from({ length: count }, (_, i) => (
      <button
        key={i}
        onClick={() => onDotClick(i)}
        className={`rounded-full transition-all duration-300 ${
          i === activeIndex ? "w-2.5 h-2.5 bg-[#0b75c2]" : "w-2 h-2 bg-black/10"
        }`}
        role="tab"
        aria-selected={i === activeIndex}
        aria-label={`Go to slide ${i + 1}`}
      />
    ))}
  </div>
);

const OnboardingSlides = ({
  onComplete,
}: {
  onComplete: () => void;
}) => {
  const [slideIndex, setSlideIndex] = useState(0);
  const { t } = useTranslation();

  const { swipeHandlers, dragOffset } = useSwipeNavigation({
    slideCount: 3,
    slideIndex,
    onSlideChange: setSlideIndex,
    onComplete,
  });

  const slides = [
    {
      title: t("onboarding_offline_title"),
      body: t("onboarding_offline_body"),
    },
    {
      title: t("onboarding_welcome_title"),
      subtitle: t("onboarding_welcome_subtitle"),
      body: t("onboarding_welcome_body"),
    },
    {
      title: t("onboarding_savings_title"),
      body: t("onboarding_savings_body"),
    },
  ];

  const handleSlideNext = () => {
    if (slideIndex < 2) {
      setSlideIndex(slideIndex + 1);
    } else {
      onComplete();
    }
  };

  const translateX = -(slideIndex * 100);

  return (
    <div
      className="bg-white flex flex-col relative overflow-hidden"
      style={{ height: '100svh' }}
    >
      {/* Header: Logo + Language */}
      <div
        className="absolute left-9 right-9 z-10 flex items-start justify-between"
        style={{ top: "calc(var(--safe-area-top, 0px) + 1.25rem)" }}
      >
        <img
          src={LOGO_SRC}
          alt="Deutschland im Plus"
          className="w-[91px] h-[91px] object-contain"
        />
        <div className="pt-2">
          <LanguageToggle />
        </div>
      </div>

      {/* Swipeable slide container */}
      <div
        className="relative flex-1 min-h-0 overflow-hidden"
        style={{ touchAction: "pan-y" }}
        {...swipeHandlers}
      >
        <div
          className="flex h-full transition-transform duration-300 ease-out"
          style={{
            transform: `translateX(calc(${translateX}% + ${dragOffset}px))`,
            ...(dragOffset !== 0 ? { transitionDuration: "0ms" } : {}),
          }}
        >
          {slides.map((slide, index) => (
            <OnboardingSlide
              key={index}
              // eslint-disable-next-line security/detect-object-injection -- key is validated enum value/safe access pattern
              image={SLIDE_IMAGES[index]}
              crossfadeImages={index === 1 ? WELCOME_IMAGES : undefined}
              title={slide.title}
              subtitle={slide.subtitle}
              body={slide.body}
              isActive={index === slideIndex}
              isNear={Math.abs(index - slideIndex) <= 1}
              headerSpacerHeight={getHeaderSpacerHeight(window.innerHeight <= 660)}
            />
          ))}
        </div>
      </div>

      {/* Dot indicators */}
      <div className="py-2 shrink-0">
        <DotIndicator
          count={3}
          activeIndex={slideIndex}
          onDotClick={setSlideIndex}
        />
      </div>

      {/* Buttons — fixed 52px height, comfortable on all screen sizes */}
      <div className="px-5 sm:px-10 pb-4 pt-1 space-y-2 shrink-0">
        <button
          onClick={handleSlideNext}
          className="w-full h-[58px] rounded-[8px] bg-[#0b75c2] text-white font-bold text-[16px] hover:bg-[#0b75c2]/90 transition-colors"
          data-testid="onboarding-next-button"
        >
          {slideIndex === 0
            ? t('onboarding_get_started')
            : slideIndex === 2
            ? t('onboarding_start')
            : t('onboarding_continue')}
        </button>
      </div>
    </div>
  );
};

const Onboarding = () => {
  // Flow: 'slides' → 'account' → 'recovery' → app
  const [step, setStep] = useState<"slides" | "account" | "recovery">("slides");
  const [accountName, setAccountName] = useState("");
  const [creatingNew, setCreatingNew] = useState(false);
  const [secretCode, setSecretCode] = useState("");
  const [secretWords, setSecretWords] = useState<string[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState(false);
  const [recoveryEnrollment, setRecoveryEnrollment] =
    useState<RecoveryEnrollmentContext | null>(null);
  const [recoverySetupError, setRecoverySetupError] = useState<string | null>(
    null,
  );
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { accounts, addAccount, switchAccount } = useBudget();
  const { setIsAuthenticated, setIsLoggedIn } = useAccount();

  const hasAccounts = accounts && accounts.length > 0;

  const completeOnboarding = () => {
    localStorage.setItem("onboardingComplete", "true");
    setIsAuthenticated(true);
    setIsLoggedIn(true);
    navigate("/");
  };

  const handleAccountSelect = (accountId: string) => {
    switchAccount(accountId);
    completeOnboarding();
  };

  /**
   * Generate the recovery code, create the account, then show the recovery
   * screen only when the online registration context is available.
   *
   * Each step has its own error handling so failures surface the right message:
   *   - generateSecretCode failure → recovery.setup_error
   *   - addAccount failure        → already handled by BudgetContext (shows toast)
   *                                  and throws; we surface a generic setup error here
   *   - resolveRecoveryEnrollmentContext failure → recovery.setup_error
   *     (private-key store errors are unexpected; normal "missing context" returns null)
   */
  const handleAccountCreate = async () => {
    if (!accountName.trim() || isDuplicateName) return;

    // Step 1 — generate the recovery code before creating the account so we
    // never create an account without a code to show.
    let code: string;
    let words: string[];
    try {
      code = await generateSecretCode();
      words = parseSecretCodeWords(code);
    } catch (err) {
      console.error("[recovery] secret code generation failed:", err);
      setRecoverySetupError(t("recovery.setup_error"));
      return;
    }

    // Step 2 — create the account. addAccount already shows a toast on failure
    // and throws; we just need to bail out here.
    let account: Awaited<ReturnType<typeof addAccount>>;
    try {
      account = await addAccount(accountName);
    } catch {
      // addAccount's own error toast is already shown — no additional message needed.
      return;
    }
    if (!account) return;

    setAccountName("");
    setCreatingNew(false);
    setUploadError(false);
    setRecoveryEnrollment(null);
    setRecoverySetupError(null);

    // Step 3 — resolve enrollment context (reads localStorage + keystore).
    // Returns null when prerequisites are simply missing (expected in local-only
    // flow). Only throws on unexpected errors (e.g. keystore I/O failure).
    let enrollment: RecoveryEnrollmentContext | null;
    try {
      enrollment = await resolveRecoveryEnrollmentContext();
    } catch (err) {
      console.error("[recovery] failed to resolve enrollment context:", err);
      setRecoverySetupError(t("recovery.setup_error"));
      return;
    }

    if (!enrollment) {
      completeOnboarding();
      return;
    }

    setSecretCode(code);
    setSecretWords(words);
    setRecoveryEnrollment(enrollment);
    setStep("recovery");
  };

  /**
   * Called when the user confirms they have saved the recovery code.
   * The enrollment upload runs in the background — we don't block the user
   * if it fails (they already have the code).
   */
  const handleRecoveryConfirmed = () => {
    completeOnboarding();
  };

  /**
   * Kick off the background enrollment upload once we have the secret code
   * and the account's private key is available.
   *
   * This runs as a side-effect when the recovery step is shown.
   */
  useEffect(() => {
    if (step !== "recovery" || !secretCode || !recoveryEnrollment) return;

    let cancelled = false;

    const uploadEnrollment = async () => {
      setIsUploading(true);
      setUploadError(false);

      try {
        const envelope = await sealRecovery(
          recoveryEnrollment.privateKey,
          secretCode,
        );

        const ok = await enrollWithRetryOnConflict({
          recoveryServerUrl: recoveryEnrollment.recoveryServerUrl,
          emailHash: recoveryEnrollment.emailHash,
          encryptedPrivateKey: envelope,
        });

        if (!cancelled) {
          setIsUploading(false);
          if (!ok) {
            console.error("[recovery] enrollment upload failed");
            setUploadError(true);
          }
        }
      } catch (err) {
        console.error("[recovery] enrollment upload threw unexpectedly:", err);
        if (!cancelled) {
          setIsUploading(false);
          setUploadError(true);
        }
      }
    };

    void uploadEnrollment();

    return () => {
      cancelled = true;
      setIsUploading(false);
      setUploadError(false);
    };
  }, [step, secretCode, recoveryEnrollment]);

  const isDuplicateName = accounts?.some(
    (acc) => acc.name.toLowerCase() === accountName.trim().toLowerCase(),
  );

  // ─── Recovery code screen (non-dismissible) ───
  if (step === "recovery") {
    return (
      <RecoveryCodeScreen
        secretCode={secretCode}
        secretWords={secretWords}
        onConfirmed={handleRecoveryConfirmed}
        isUploading={isUploading}
        uploadError={uploadError}
        onRetryUpload={
          recoveryEnrollment
            ? () => {
                // Reset error state and re-trigger the upload effect.
                // The effect depends on [step, secretCode, recoveryEnrollment] so
                // we force a re-run by clearing and re-setting uploadError via
                // toggling the enrollment context reference.
                setUploadError(false);
                setRecoveryEnrollment({ ...recoveryEnrollment });
              }
            : undefined
        }
      />
    );
  }

  // ─── Onboarding Slides (shown first) ───
  if (step === "slides") {
    return (
      <OnboardingSlides
        onComplete={() => setStep('account')}
      />
    );
  }

  // ─── Account Selection / Creation (shown after slides) ───
  if (hasAccounts && !creatingNew) {
    return (
      <div className="min-h-screen bg-white flex flex-col">
        {/* Header: Logo + Language */}
        <div
          className="flex items-start justify-between px-9"
          style={{ paddingTop: "calc(var(--safe-area-top, 0px) + 1.25rem)" }}
        >
          <img
            src={LOGO_SRC}
            alt="Deutschland im Plus"
            className="w-[91px] h-[91px] object-contain"
          />
          <div className="pt-2">
            <LanguageToggle />
          </div>
        </div>

        <div className="flex-1 flex flex-col items-center justify-center px-10">
          <h1 className="text-[32px] font-bold text-[#0b0b0b] text-center mb-2">
            {t("select_account")}
          </h1>
          <p className="text-[16px] text-[#0b0b0b] text-center leading-[21px] max-w-[306px] mb-8">
            {t("select_account_desc")}
          </p>

          <div className="w-full max-w-[275px] space-y-3">
            {accounts.map((acc) => (
              <button
                key={acc.id}
                onClick={() => handleAccountSelect(acc.id)}
                className="w-full h-[58px] rounded-[8px] bg-[#0b75c2] text-white font-bold text-[16px] hover:bg-[#0b75c2]/90 transition-colors"
                data-testid={`onboarding-account-button-${acc.name.toLowerCase()}`}
              >
                {acc.name}
              </button>
            ))}
            <button
              onClick={() => setCreatingNew(true)}
              className="w-full h-[58px] rounded-[8px] bg-[#1a2124] text-white font-bold text-[16px] hover:bg-[#1a2124]/90 transition-colors"
              data-testid="onboarding-create-account-button"
            >
              {t("create_account_title")}
            </button>
            <button
              onClick={() => setStep("slides")}
              className="w-full h-[58px] rounded-[8px] bg-transparent text-[#0b0b0b] font-bold text-[16px] hover:bg-gray-100 transition-colors"
              data-testid="onboarding-back-button"
            >
              {t("back")}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Account creation form
  return (
    <div className="min-h-screen bg-white flex flex-col">
      {/* Header: Logo + Language */}
      <div
        className="flex items-start justify-between px-9"
        style={{ paddingTop: "calc(var(--safe-area-top, 0px) + 1.25rem)" }}
      >
        <img
          src={LOGO_SRC}
          alt="Deutschland im Plus"
          className="w-[91px] h-[91px] object-contain"
        />
        <div className="pt-2">
          <LanguageToggle />
        </div>
      </div>

      <div className="flex-1 flex flex-col items-center justify-center px-10">
        <h1 className="text-[32px] font-bold text-[#0b0b0b] text-center mb-2">
          {t("create_account_title")}
        </h1>
        <p className="text-[16px] text-[#0b0b0b] text-center leading-[21px] max-w-[306px] mb-8">
          {t("create_account_description")}
        </p>

        <div className="w-full max-w-[275px] space-y-4">
          <div>
            <Label
              htmlFor="accountName"
              className="text-sm font-medium mb-1.5 block text-[#0b0b0b]"
            >
              {t("account_name")}
            </Label>
            <Input
              id="accountName"
              value={accountName}
              onChange={(e) => setAccountName(e.target.value)}
              placeholder={t("account_name_placeholder")}
              className="rounded-[8px] h-11 border-gray-300 bg-white text-[#0b0b0b] placeholder:text-gray-400"
              data-testid="onboarding-account-name-input"
            />
            {isDuplicateName && (
              <p className="text-red-500 text-[13px] mt-1">
                {t("account_name_exists")}
              </p>
            )}
          </div>
          <button
            onClick={handleAccountCreate}
            disabled={!accountName.trim() || isDuplicateName}
            className="w-full h-[58px] rounded-[8px] bg-[#0b75c2] text-white font-bold text-[16px] hover:bg-[#0b75c2]/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            data-testid="onboarding-account-submit-button"
          >
            {t("next")}
          </button>
          <button
            onClick={() =>
              hasAccounts ? setCreatingNew(false) : setStep("slides")
            }
            className="w-full h-[58px] rounded-[8px] bg-transparent text-[#0b0b0b] font-bold text-[16px] hover:bg-gray-100 transition-colors"
          >
            {t("back")}
          </button>
          {recoverySetupError && (
            <p className="text-red-600 text-[13px] text-center">
              {recoverySetupError}
            </p>
          )}
        </div>
      </div>
    </div>
  );
};

export default Onboarding;
