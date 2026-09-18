import { useEffect } from "react";

/**
 * Scrolls the focused input into view on Android in two scenarios:
 *
 * 1. Keyboard opens — `visualViewport` resize fires, we scroll the focused
 *    input above the keyboard.
 * 2. Focus moves while keyboard is already open — `focusin` fires on the
 *    document, we re-run the same visibility check for the new target.
 *    (visualViewport does NOT resize in this case, so the resize listener
 *    alone is insufficient — this was the gap identified in code review.)
 *
 * Samsung WebView (Galaxy S-series) uses adjustResize, shrinking the layout
 * viewport when the keyboard opens. We detect this via `window.innerHeight`
 * and skip the manual scroll to avoid double-adjustment.
 *
 * iOS handles keyboard scroll natively and is explicitly excluded to avoid
 * interfering with WebKit's own logic.
 */
export function useScrollToFocusedInput() {
  useEffect(() => {
    if (typeof window === "undefined" || !window.visualViewport) return;

    // iOS handles this natively; skip to avoid regressions.
    // iPadOS reports "Macintosh" disambiguated by touch support
    // (mirrors the same check in drawer.tsx / vaul).
    const isIOS =
      /iPhone|iPad|iPod/.test(navigator.userAgent) ||
      (/Macintosh/.test(navigator.userAgent) && navigator.maxTouchPoints > 1);
    if (isIOS) return;

    // Track layout viewport height to detect Samsung adjustResize behaviour.
    let lastInnerHeight = window.innerHeight;

    /**
     * Core scroll logic — shared by both the resize and focusin handlers.
     * Accepts an optional target element so focusin can pass e.target directly
     * rather than relying on document.activeElement (which may not be updated
     * yet at the time the event fires).
     */
    const scrollTargetIntoView = (target?: Element | null) => {
      const focused = (target ?? document.activeElement) as HTMLElement | null;
      if (!focused) return;

      const tag = focused.tagName.toLowerCase();
      if (tag !== "input" && tag !== "textarea" && tag !== "select") return;

      // Find the nearest scrollable ancestor
      let scrollable: HTMLElement | null = focused.parentElement;
      while (scrollable) {
        const { overflowY } = getComputedStyle(scrollable);
        if (overflowY === "auto" || overflowY === "scroll") break;
        scrollable = scrollable.parentElement;
      }
      if (!scrollable) return;

      const inputRect = focused.getBoundingClientRect();
      const visibleBottom =
        window.visualViewport!.offsetTop + window.visualViewport!.height;

      const overflow = inputRect.bottom - visibleBottom;
      if (overflow > 0) {
        // 16px breathing room between input bottom and keyboard top
        scrollable.scrollTop += overflow + 16;
      }
    };

    // --- Listener 1: visualViewport resize (keyboard opens / closes) ---
    const handleViewportResize = () => {
      const currentInnerHeight = window.innerHeight;
      const layoutShrunk = lastInnerHeight - currentInnerHeight;
      lastInnerHeight = currentInnerHeight;

      // Samsung adjustResize: OS already moved the layout up, skip.
      if (layoutShrunk > 50) return;

      scrollTargetIntoView();
    };

    // --- Listener 2: focusin (focus moves while keyboard is already open) ---
    // Use rAF so the browser has finished painting the newly focused element
    // into its final position before we read getBoundingClientRect.
    const handleFocusIn = (e: FocusEvent) => {
      // Only act when the keyboard is already visible (visual viewport is
      // meaningfully shorter than the layout viewport).
      const keyboardOpen =
        window.visualViewport!.height < window.innerHeight - 100;
      if (!keyboardOpen) return;

      const target = e.target as Element | null;
      requestAnimationFrame(() => scrollTargetIntoView(target));
    };

    window.visualViewport.addEventListener("resize", handleViewportResize);
    document.addEventListener("focusin", handleFocusIn);

    return () => {
      window.visualViewport?.removeEventListener("resize", handleViewportResize);
      document.removeEventListener("focusin", handleFocusIn);
    };
  }, []);
}
