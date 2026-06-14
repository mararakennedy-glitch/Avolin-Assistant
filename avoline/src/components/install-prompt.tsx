// "Install Avolin to your home screen" banner.
//
// Click flow:
//  1. If the browser supports `beforeinstallprompt` (Chromium: Chrome / Edge /
//     Brave / Opera on desktop & Android), we trigger the OS install dialog
//     directly. ONE click. No walkthrough.
//  2. If the page is loaded inside an iframe (e.g. the Replit preview), no
//     browser ever fires `beforeinstallprompt` for iframes — security rule.
//     The Install button instead pops the app out into a real top-level tab,
//     where the install event WILL fire and the user can install with one
//     click from that tab. We persist a hint flag so the new tab knows to
//     auto-prompt the moment the event arrives.
//  3. Only when (a) we are at top-level AND (b) the browser truly has no PWA
//     install API (iOS Safari, Firefox on most platforms, older Mac Safari)
//     do we show the visual walkthrough — there's literally no JavaScript
//     install API on those engines, only the browser's own menu.

import { useEffect, useRef, useState, type ReactNode } from "react";
import { Download, X, Share, Plus, MoreVertical, Menu, ChevronRight, ExternalLink, Loader2 } from "lucide-react";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

declare global {
  interface Window {
    __avolinDeferredInstall?: BeforeInstallPromptEvent | null;
    /**
     * Triggers the Avolin install flow from anywhere in the app
     * (e.g. from the Settings page entry). Returns once the user has either
     * accepted, dismissed, or been shown the manual walkthrough.
     *
     * Set up by <InstallPrompt /> on mount.
     */
    avolinTriggerInstall?: () => void | Promise<void>;
  }
}

const SESSION_DISMISS_KEY = "avolin.installPrompt.dismissedThisSession";
const INSTALLED_KEY = "avolin.installed";
const AUTO_PROMPT_KEY = "avolin.autoPromptInstall";

function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  if (window.matchMedia?.("(display-mode: standalone)").matches) return true;
  return (window.navigator as { standalone?: boolean }).standalone === true;
}

function rememberInstalled() {
  try { localStorage.setItem(INSTALLED_KEY, "1"); } catch { /* no-op */ }
}

function wasEverInstalled(): boolean {
  try { return localStorage.getItem(INSTALLED_KEY) === "1"; } catch { return false; }
}

function inIframe(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.top !== window.self;
  } catch {
    // Cross-origin frame access throws — that itself confirms we're framed.
    return true;
  }
}

function isIos(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent.toLowerCase();
  const iPadOs =
    navigator.platform === "MacIntel" &&
    typeof (navigator as Navigator & { maxTouchPoints?: number }).maxTouchPoints === "number" &&
    ((navigator as Navigator & { maxTouchPoints?: number }).maxTouchPoints ?? 0) > 1;
  return /iphone|ipad|ipod/.test(ua) || iPadOs;
}

function isWindows(): boolean {
  if (typeof navigator === "undefined") return false;
  return /windows/i.test(navigator.userAgent) || /win32|win64/i.test(navigator.platform);
}

function isMac(): boolean {
  if (typeof navigator === "undefined") return false;
  if (isIos()) return false;
  return /mac/i.test(navigator.platform) || /macintosh/i.test(navigator.userAgent);
}

function isAndroid(): boolean {
  if (typeof navigator === "undefined") return false;
  return /android/i.test(navigator.userAgent);
}

function isEdge(): boolean {
  if (typeof navigator === "undefined") return false;
  return /edg\//i.test(navigator.userAgent);
}

function isFirefox(): boolean {
  if (typeof navigator === "undefined") return false;
  return /firefox|fxios/i.test(navigator.userAgent);
}

function isSafari(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent;
  return /safari/i.test(ua) && !/chrome|crios|edg|fxios|firefox/i.test(ua);
}

// Chromium (Chrome / Edge / Brave / Opera / Samsung) is the only family that
// supports `beforeinstallprompt`. We use this to decide whether popping the
// app out of an iframe will actually unlock one-click install.
function isChromium(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent;
  // iOS Chrome / Edge / Firefox all run on WebKit and don't support PWA install.
  if (isIos()) return false;
  return /chrome|crios|edg|opr\/|opera|samsungbrowser/i.test(ua) && !/fxios|firefox/i.test(ua);
}

// ────────────────────────────────────────────────────────────────────────────
// Per-platform install walkthrough (only used when we truly cannot trigger
// install programmatically — iOS Safari, Firefox, etc.).
// ────────────────────────────────────────────────────────────────────────────

type WalkthroughStep = { icon: ReactNode; heading: string; body: string };
type Walkthrough = { title: string; steps: WalkthroughStep[] };

function buildWalkthrough(): Walkthrough {
  if (isIos()) {
    return {
      title: "Install Avolin on iPhone / iPad",
      steps: [
        { icon: <Share className="w-5 h-5" />, heading: "Tap the Share button", body: "It's the square with an up-arrow at the bottom of Safari (or top-right on iPad)." },
        { icon: <Plus className="w-5 h-5" />, heading: 'Choose "Add to Home Screen"', body: "Scroll down inside the share sheet — it sits between the Bookmark and Markup options." },
        { icon: <Download className="w-5 h-5" />, heading: 'Tap "Add" in the top-right', body: "Avolin will appear on your home screen with its own icon, just like a real app." },
      ],
    };
  }
  if (isAndroid()) {
    return {
      title: "Install Avolin on Android",
      steps: [
        { icon: <MoreVertical className="w-5 h-5" />, heading: "Open the browser menu", body: "Tap the three-dot icon in the top-right of Chrome (or your browser)." },
        { icon: <Download className="w-5 h-5" />, heading: 'Tap "Install app" or "Add to Home screen"', body: "Different browsers use slightly different wording — both options work." },
        { icon: <ChevronRight className="w-5 h-5" />, heading: 'Confirm with "Install"', body: "Avolin will be added to your home screen and app drawer." },
      ],
    };
  }
  if (isWindows()) {
    if (isFirefox()) {
      return {
        title: "Install Avolin on Windows (Firefox)",
        steps: [
          { icon: <Menu className="w-5 h-5" />, heading: "Open the Firefox menu", body: "Click the ☰ icon in the top-right corner." },
          { icon: <Download className="w-5 h-5" />, heading: 'Choose "Install"', body: "If you don't see it, switch to Microsoft Edge or Chrome for one-click install." },
        ],
      };
    }
    return {
      title: `Install Avolin on Windows (${isEdge() ? "Edge" : "Chrome"})`,
      steps: [
        { icon: <Download className="w-5 h-5" />, heading: "Look for the install icon", body: "It's a small monitor with a down-arrow at the right end of the address bar — click it." },
        { icon: <MoreVertical className="w-5 h-5" />, heading: "Or use the menu", body: isEdge() ? "Click ⋯ in the top-right, then Apps → Install Avolin." : "Click ⋮ in the top-right, then Cast, save, and share → Install Avolin." },
        { icon: <ChevronRight className="w-5 h-5" />, heading: 'Confirm with "Install"', body: "Avolin will be pinned to your Start menu and (if you choose) your taskbar and desktop." },
      ],
    };
  }
  if (isMac()) {
    if (isSafari()) {
      return {
        title: "Install Avolin on Mac (Safari)",
        steps: [
          { icon: <Menu className="w-5 h-5" />, heading: 'Open the "File" menu', body: "It's at the top-left of your screen, next to Safari." },
          { icon: <Download className="w-5 h-5" />, heading: 'Choose "Add to Dock…"', body: "Requires Safari 17 or newer (macOS Sonoma)." },
          { icon: <ChevronRight className="w-5 h-5" />, heading: 'Confirm with "Add"', body: "Avolin appears in your Dock and Launchpad as a real app." },
        ],
      };
    }
    if (isFirefox()) {
      return {
        title: "Install Avolin on Mac (Firefox)",
        steps: [
          { icon: <Menu className="w-5 h-5" />, heading: "Open the Firefox menu", body: "Click the ☰ icon in the top-right corner." },
          { icon: <Download className="w-5 h-5" />, heading: 'Choose "Install"', body: "If unavailable, switch to Chrome / Edge / Safari 17 for one-click install." },
        ],
      };
    }
    return {
      title: `Install Avolin on Mac (${isEdge() ? "Edge" : "Chrome"})`,
      steps: [
        { icon: <Download className="w-5 h-5" />, heading: "Look for the install icon", body: "It's a small monitor with a down-arrow at the right end of the address bar — click it." },
        { icon: <MoreVertical className="w-5 h-5" />, heading: "Or use the menu", body: isEdge() ? "Click ⋯ in the top-right, then Apps → Install Avolin." : "Click ⋮ in the top-right, then Cast, save, and share → Install Avolin." },
        { icon: <ChevronRight className="w-5 h-5" />, heading: 'Confirm with "Install"', body: "Avolin appears in your Applications and Launchpad as a real app." },
      ],
    };
  }
  return {
    title: "Install Avolin",
    steps: [
      { icon: <MoreVertical className="w-5 h-5" />, heading: "Open your browser menu", body: "Look for ⋮, ⋯, or ☰ usually in the top-right corner." },
      { icon: <Download className="w-5 h-5" />, heading: 'Choose "Install app" or "Add to Home Screen"', body: "The wording depends on your browser, but both options install Avolin." },
    ],
  };
}

// ────────────────────────────────────────────────────────────────────────────
// Component.
// ────────────────────────────────────────────────────────────────────────────

export function InstallPrompt() {
  const [evt, setEvt] = useState<BeforeInstallPromptEvent | null>(null);
  const [showFallbackHint, setShowFallbackHint] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [installed, setInstalled] = useState(false);
  const [walkthroughOpen, setWalkthroughOpen] = useState(false);
  const [popoutMessage, setPopoutMessage] = useState<string | null>(null);
  // Tri-state install phase:
  //   "idle"       — nothing in flight, button is interactive
  //   "waiting"    — user tapped Install but `beforeinstallprompt` hasn't
  //                  fired yet on Chromium; we're listening up to 2.5s
  //   "installing" — we've called `evt.prompt()` and the OS dialog is open
  // Used to disable the button and show honest copy for each step.
  const [installPhase, setInstallPhase] = useState<"idle" | "waiting" | "installing">("idle");
  const busy = installPhase !== "idle";
  // Synchronous lock — React state is async, so two near-simultaneous code
  // paths (manual click + URL auto-prompt + late event arrival) could each
  // call `prompt()` on the same event before any of them re-renders. This
  // ref blocks that race in the same tick.
  const promptInFlightRef = useRef(false);
  const autoTriedRef = useRef(false);

  useEffect(() => {
    // The install banner should appear on every device that opens the app
    // unless the app is *currently* running as an installed standalone
    // window (where there's nothing left to install). We deliberately do
    // NOT suppress the banner just because the user previously installed
    // — they may have uninstalled, switched to a different browser
    // profile, or be using the same Avolin account on a fresh device,
    // and the banner needs to be available in all those cases.
    if (isStandalone()) {
      rememberInstalled();
      setInstalled(true);
    } else {
      try {
        if (sessionStorage.getItem(SESSION_DISMISS_KEY) === "1") {
          setDismissed(true);
        }
      } catch {
        /* sessionStorage may be unavailable in private mode */
      }
    }

    // The bootstrap script in index.html may have already captured the event
    // before React mounted — pick it up if so.
    if (window.__avolinDeferredInstall) {
      setEvt(window.__avolinDeferredInstall);
    }

    const onPrompt = (e: Event) => {
      e.preventDefault();
      const ev = e as BeforeInstallPromptEvent;
      window.__avolinDeferredInstall = ev;
      setEvt(ev);
    };
    const onAvailable = () => {
      if (window.__avolinDeferredInstall) {
        setEvt(window.__avolinDeferredInstall);
      }
    };
    const onInstalled = () => {
      rememberInstalled();
      setInstalled(true);
      setEvt(null);
      setWalkthroughOpen(false);
      window.__avolinDeferredInstall = null;
    };

    window.addEventListener("beforeinstallprompt", onPrompt as EventListener);
    window.addEventListener("avolin:install-available", onAvailable as EventListener);
    window.addEventListener("appinstalled", onInstalled);

    // Show the banner immediately on mount so every device that opens the
    // app sees an install affordance — we no longer wait for the
    // BeforeInstallPromptEvent (which never fires on iOS / Firefox /
    // older Safari) before surfacing the banner. When the event does
    // arrive later the button just upgrades to one-click install.
    setShowFallbackHint(true);

    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt as EventListener);
      window.removeEventListener("avolin:install-available", onAvailable as EventListener);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  // Auto-prompt path: when this page was opened from a "pop out" click in
  // another tab, we set ?install=1 in the URL. As soon as the install event
  // arrives in this real tab, fire it immediately so the user only had to
  // click ONE button overall.
  useEffect(() => {
    if (!evt || autoTriedRef.current) return;
    let shouldAuto = false;
    try {
      const url = new URL(window.location.href);
      if (url.searchParams.get("install") === "1") shouldAuto = true;
      if (sessionStorage.getItem(AUTO_PROMPT_KEY) === "1") shouldAuto = true;
    } catch { /* ignore */ }
    if (!shouldAuto) return;
    autoTriedRef.current = true;
    try { sessionStorage.removeItem(AUTO_PROMPT_KEY); } catch {}
    // Clean the URL so a refresh doesn't keep re-prompting.
    try {
      const url = new URL(window.location.href);
      if (url.searchParams.has("install")) {
        url.searchParams.delete("install");
        window.history.replaceState({}, "", url.toString());
      }
    } catch {}
    void runNativeInstall(evt);
  }, [evt]);

  const runNativeInstall = async (e: BeforeInstallPromptEvent) => {
    // Synchronous double-fire guard — see promptInFlightRef declaration.
    if (promptInFlightRef.current) return;
    promptInFlightRef.current = true;
    setInstallPhase("installing");
    try {
      await e.prompt();
      const choice = await e.userChoice;
      setEvt(null);
      window.__avolinDeferredInstall = null;
      if (choice.outcome === "accepted") {
        rememberInstalled();
        setInstalled(true);
      }
    } catch {
      setEvt(null);
      window.__avolinDeferredInstall = null;
      // If the native prompt fails for some reason, surface the walkthrough
      // so the user is never stuck.
      setWalkthroughOpen(true);
    } finally {
      promptInFlightRef.current = false;
      setInstallPhase("idle");
      setPopoutMessage(null);
    }
  };

  const popOutToRealTab = () => {
    // Iframe context (e.g. Replit preview) blocks `beforeinstallprompt` —
    // open the app in a real top-level tab and ask it to auto-prompt as soon
    // as the install event arrives there.
    let target = "";
    try {
      const url = new URL(window.location.href);
      url.searchParams.set("install", "1");
      target = url.toString();
    } catch {
      target = window.location.href;
    }
    try { sessionStorage.setItem(AUTO_PROMPT_KEY, "1"); } catch {}
    const opened = window.open(target, "_blank", "noopener,noreferrer");
    if (!opened) {
      // Pop-up blocked or sandbox forbids opening new windows — show inline
      // guidance instead.
      setPopoutMessage(
        "Your browser blocked the new tab. Please open Avolin directly at avolin.replit.app and click Install there.",
      );
    } else {
      setPopoutMessage("Opened Avolin in a new tab — click Install there for one-click install.");
    }
  };

  // iOS Safari has no programmatic install API at all (Apple security rule).
  // The closest one-tap experience we can offer is calling navigator.share()
  // which opens the SAME native share sheet that contains "Add to Home
  // Screen" — turning the install flow into 2 taps total (Install → Add to
  // Home Screen) instead of 3 (Install → open share menu manually → Add).
  // After the share sheet closes we still show the walkthrough as a backup,
  // because some users dismiss the sheet without installing.
  const tryIosShareSheet = async (): Promise<boolean> => {
    if (!isIos()) return false;
    const nav = navigator as Navigator & {
      share?: (data: { title?: string; text?: string; url?: string }) => Promise<void>;
    };
    if (typeof nav.share !== "function") return false;
    try {
      await nav.share({
        title: "Avolin",
        text: "Install Avolin to your home screen",
        url: window.location.origin + (import.meta.env.BASE_URL || "/"),
      });
      return true;
    } catch {
      // User cancelled or share failed — fall through to walkthrough.
      return false;
    }
  };

  // Wait up to `timeoutMs` for the browser to fire `beforeinstallprompt`.
  // Returns the event if it arrives in time, or null otherwise. Used when
  // the user taps Install before Chrome has had a chance to dispatch the
  // event — instead of immediately showing the walkthrough we pause and
  // grab the real event so the tap fires the actual install dialog.
  const waitForInstallEvent = (timeoutMs: number): Promise<BeforeInstallPromptEvent | null> => {
    return new Promise((resolve) => {
      // Already captured — return immediately.
      if (window.__avolinDeferredInstall) {
        resolve(window.__avolinDeferredInstall);
        return;
      }
      let done = false;
      const finish = (ev: BeforeInstallPromptEvent | null) => {
        if (done) return;
        done = true;
        window.removeEventListener("beforeinstallprompt", onPrompt as EventListener);
        window.removeEventListener("avolin:install-available", onAvailable as EventListener);
        window.clearTimeout(timer);
        resolve(ev);
      };
      const onPrompt = (e: Event) => {
        e.preventDefault();
        const ev = e as BeforeInstallPromptEvent;
        window.__avolinDeferredInstall = ev;
        setEvt(ev);
        finish(ev);
      };
      const onAvailable = () => {
        if (window.__avolinDeferredInstall) finish(window.__avolinDeferredInstall);
      };
      window.addEventListener("beforeinstallprompt", onPrompt as EventListener);
      window.addEventListener("avolin:install-available", onAvailable as EventListener);
      const timer = window.setTimeout(() => finish(null), timeoutMs);
    });
  };

  const handleInstall = async () => {
    // Don't fire twice if a wait or install is already in flight.
    if (busy || promptInFlightRef.current) return;

    // Path 1: native one-click install (best case — Chromium at top level
    // where the BeforeInstallPromptEvent has fired). Synchronous gesture
    // chain: the click handler is still inside its user-activation window,
    // so `prompt()` is honoured and the OS install dialog appears instantly.
    if (evt) {
      await runNativeInstall(evt);
      return;
    }
    // Path 2: iframe context (Replit preview) — pop out to a real tab
    // where Chromium will fire the install event and we'll auto-prompt
    // on arrival. Done before any wait because the event can NEVER fire
    // inside an iframe, so waiting here would be wasted time.
    if (inIframe() && isChromium()) {
      popOutToRealTab();
      return;
    }
    // Path 3: iOS — open the native share sheet directly so the user can
    // tap "Add to Home Screen" without manually finding the share button.
    // Apple gives us no programmatic install API at all, so this is the
    // closest we can get to "one-tap install" on iPhone / iPad.
    if (isIos()) {
      const opened = await tryIosShareSheet();
      // Only fall back to the visual walkthrough if the share sheet
      // failed to open — when it succeeds the user is already in the
      // right place and the walkthrough would just clutter the screen.
      if (!opened) {
        setWalkthroughOpen(true);
      }
      return;
    }
    // Path 4: top-level Chromium where `beforeinstallprompt` simply
    // hasn't arrived yet. Wait briefly (≤2.5s) inside the same gesture
    // so we can fire the OS dialog as soon as Chrome dispatches the
    // event. We deliberately do NOT wait longer than that — past ~5s
    // the user-activation window expires and `prompt()` would be
    // ignored by Chrome anyway.
    if (isChromium()) {
      setInstallPhase("waiting");
      setPopoutMessage("Waiting for browser install support…");
      const ev = await waitForInstallEvent(2500);
      setInstallPhase("idle");
      setPopoutMessage(null);
      if (ev) {
        await runNativeInstall(ev);
        return;
      }
      // The event never arrived — site likely doesn't yet meet Chrome's
      // engagement heuristics, OR Avolin is already installed in this
      // browser profile. Fall through to the walkthrough so the user has
      // a manual path via Chrome's address-bar install icon / menu.
    }
    // Path 5: any remaining case (Firefox, Mac Safari, etc.) — show the
    // per-device walkthrough so the user always gets clear instructions
    // rather than a silent no-op.
    setWalkthroughOpen(true);
  };

  const handleDismiss = () => {
    try { sessionStorage.setItem(SESSION_DISMISS_KEY, "1"); } catch { /* no-op */ }
    setDismissed(true);
    setWalkthroughOpen(false);
    setPopoutMessage(null);
  };

  // Expose a stable global trigger so any UI in the app (e.g. the Settings →
  // "Install on this device" entry) can re-open the install flow at any time
  // — even after the floating banner has been dismissed or the user has
  // installed once before. This is what makes "install" reachable on every
  // device, regardless of whether the floating banner is visible.
  useEffect(() => {
    window.avolinTriggerInstall = () => {
      // If we're currently running standalone there's nothing to install.
      if (isStandalone()) {
        rememberInstalled();
        setInstalled(true);
        return;
      }
      void handleInstall();
    };
    return () => {
      if (window.avolinTriggerInstall) {
        delete window.avolinTriggerInstall;
      }
    };
    // We deliberately re-bind whenever evt changes so the handler captures
    // the latest BeforeInstallPromptEvent.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [evt]);

  const walkthrough = buildWalkthrough();
  const buttonLabel = evt
    ? "Install"
    : inIframe() && isChromium()
    ? "Install"
    : isChromium()
    ? "Install"
    : "How to install";

  // The floating bottom banner is only shown when there's an install
  // affordance to surface AND the user hasn't already installed/dismissed it.
  // The walkthrough modal, however, must remain mountable any time the
  // global trigger fires it — so it's rendered separately below.
  const showBanner =
    !installed && !dismissed && (Boolean(evt) || showFallbackHint);

  return (
    <>
      {showBanner && (
      <div
        role="dialog"
        aria-label="Install Avolin"
        className="fixed bottom-4 left-1/2 -translate-x-1/2 z-40 max-w-sm w-[calc(100%-2rem)]
                   rounded-xl border border-cyan-400/40 bg-[rgba(0,8,16,0.95)] backdrop-blur-md
                   shadow-[0_0_30px_rgba(0,180,255,0.35)] p-3 flex flex-col gap-2"
      >
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-cyan-400/15 flex items-center justify-center text-cyan-300 flex-shrink-0">
            <Download className="w-5 h-5" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="font-mono text-xs tracking-widest text-cyan-200 uppercase">
              Install to Home Screen
            </div>
            <div className="font-mono text-[11px] text-cyan-300/65 leading-snug mt-0.5">
              {evt
                ? "One click to install — works offline, real app icon."
                : inIframe() && isChromium()
                ? "Open Avolin in a new tab to install with one click."
                : isChromium()
                ? "Click Install to add Avolin as a real app."
                : "One-click access, works offline, real app icon."}
            </div>
          </div>
          <button
            onClick={handleInstall}
            disabled={busy}
            className="px-3 py-1.5 rounded-lg bg-cyan-400 text-[#020a14] font-mono text-xs tracking-widest uppercase hover:bg-cyan-300 transition-colors whitespace-nowrap flex items-center gap-1.5 disabled:opacity-70 disabled:cursor-wait"
          >
            {busy ? (
              <Loader2 className="w-3 h-3 animate-spin" />
            ) : (
              !evt && inIframe() && isChromium() && <ExternalLink className="w-3 h-3" />
            )}
            <span>
              {installPhase === "installing"
                ? "Installing…"
                : installPhase === "waiting"
                ? "Waiting…"
                : buttonLabel}
            </span>
          </button>
          <button
            onClick={handleDismiss}
            aria-label="Dismiss install prompt"
            className="w-7 h-7 rounded-md text-cyan-300/55 hover:text-cyan-200 hover:bg-cyan-400/10 flex items-center justify-center"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {popoutMessage && (
          <div className="font-mono text-[10px] tracking-wider text-cyan-300/80 leading-snug px-1">
            {popoutMessage}
          </div>
        )}
      </div>
      )}

      {walkthroughOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={walkthrough.title}
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/70 backdrop-blur-sm p-4"
          onClick={() => setWalkthroughOpen(false)}
        >
          <div
            className="relative w-full max-w-md rounded-2xl border border-cyan-400/40 bg-[rgba(0,8,16,0.98)] shadow-[0_0_60px_rgba(0,180,255,0.45)] p-5"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={() => setWalkthroughOpen(false)}
              aria-label="Close"
              className="absolute right-3 top-3 w-8 h-8 rounded-md text-cyan-300/65 hover:text-cyan-100 hover:bg-cyan-400/10 flex items-center justify-center"
            >
              <X className="w-4 h-4" />
            </button>

            {/* App icon "cover" — exactly the icon that will land on the
                user's home screen once they install. Helps them recognise
                Avolin in the system installer dialog. */}
            <div className="flex flex-col items-center text-center mb-5">
              <div
                className="relative w-24 h-24 rounded-[22%] overflow-hidden border border-cyan-400/40"
                style={{
                  boxShadow:
                    "0 0 40px rgba(0,180,255,0.45), inset 0 0 0 1px rgba(0,220,255,0.15)",
                  background: "#000208",
                }}
              >
                <img
                  src="/icon-512.png"
                  alt="Avolin app icon"
                  width={96}
                  height={96}
                  className="w-full h-full object-cover"
                  draggable={false}
                />
              </div>
              <div className="font-mono text-[10px] tracking-[0.25em] text-cyan-300/70 uppercase mt-3">
                Avolin
              </div>
              <h2 className="font-mono text-base sm:text-lg text-cyan-100 mt-1">
                {walkthrough.title}
              </h2>
              <p className="font-mono text-[11px] text-cyan-300/60 mt-1">
                This is the icon that will appear on your home screen.
              </p>
            </div>

            <ol className="space-y-3">
              {walkthrough.steps.map((step, i) => (
                <li
                  key={i}
                  className="flex gap-3 p-3 rounded-xl bg-cyan-400/5 border border-cyan-400/20"
                >
                  <div className="w-9 h-9 rounded-lg bg-cyan-400/15 text-cyan-200 flex items-center justify-center flex-shrink-0">
                    {step.icon}
                  </div>
                  <div className="min-w-0">
                    <div className="font-mono text-xs tracking-wider text-cyan-100 uppercase">
                      {i + 1}. {step.heading}
                    </div>
                    <div className="font-mono text-[11px] text-cyan-300/70 leading-snug mt-1">
                      {step.body}
                    </div>
                  </div>
                </li>
              ))}
            </ol>

            <button
              onClick={() => setWalkthroughOpen(false)}
              className="w-full mt-5 py-2.5 rounded-xl bg-cyan-400 text-[#020a14] font-mono text-xs tracking-widest uppercase hover:bg-cyan-300 transition-colors"
            >
              Got it
            </button>
          </div>
        </div>
      )}
    </>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// SettingsInstallEntry — always-available "Install on this device" row for
// the Settings page. Works on every browser/device that has any path to
// install (Chromium one-click, iOS Safari Add-to-Home-Screen, Mac Safari
// Add-to-Dock, Firefox menu, etc.) by delegating to the global trigger that
// <InstallPrompt /> exposes. Hides itself when the app is already running
// standalone (currently installed on this device).
// ────────────────────────────────────────────────────────────────────────────

/**
 * Hook returning whether the install affordance should be visible to the
 * current user. Returns `false` when the app is already running standalone
 * OR was previously installed in this browser. Use this to gate the entire
 * "Install on this device" UI block (including section headers) so they
 * disappear together.
 */
export function useShouldShowInstall(): boolean {
  const [show, setShow] = useState<boolean>(() => {
    if (typeof window === "undefined") return true;
    return !(isStandalone() || wasEverInstalled());
  });
  useEffect(() => {
    if (typeof window === "undefined") return;
    const recheck = () => setShow(!(isStandalone() || wasEverInstalled()));
    recheck();
    window.addEventListener("appinstalled", recheck);
    document.addEventListener("visibilitychange", recheck);
    return () => {
      window.removeEventListener("appinstalled", recheck);
      document.removeEventListener("visibilitychange", recheck);
    };
  }, []);
  return show;
}

export function SettingsInstallEntry() {
  const [hidden, setHidden] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return isStandalone() || wasEverInstalled();
  });

  useEffect(() => {
    if (typeof window === "undefined") return;
    const onInstalled = () => setHidden(true);
    window.addEventListener("appinstalled", onInstalled);
    // Re-check standalone & previously-installed state on visibility change
    // (user may have just installed and re-opened the standalone window).
    const onVis = () => {
      if (isStandalone() || wasEverInstalled()) setHidden(true);
    };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      window.removeEventListener("appinstalled", onInstalled);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, []);

  if (hidden) return null;

  const onClick = () => {
    if (typeof window !== "undefined" && window.avolinTriggerInstall) {
      void window.avolinTriggerInstall();
    }
  };

  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full flex items-center gap-3 px-4 py-3 rounded-xl border border-cyan-400/25 bg-cyan-400/5 hover:bg-cyan-400/10 active:bg-cyan-400/15 transition-colors text-left"
    >
      <div className="w-10 h-10 rounded-lg overflow-hidden border border-cyan-400/30 bg-[#000208] flex-shrink-0">
        <img
          src="/icon-512.png"
          alt=""
          width={40}
          height={40}
          className="w-full h-full object-cover"
          draggable={false}
        />
      </div>
      <div className="flex-1 min-w-0">
        <div className="font-mono text-xs tracking-widest text-cyan-100 uppercase">
          Install Avolin on this device
        </div>
        <div className="font-mono text-[11px] text-cyan-300/70 mt-0.5 leading-snug">
          Works on iPhone, iPad, Android, Windows, Mac and Linux. One-tap on
          Chrome / Edge — guided steps for Safari and Firefox.
        </div>
      </div>
      <Download className="w-5 h-5 text-cyan-300 flex-shrink-0" />
    </button>
  );
}
