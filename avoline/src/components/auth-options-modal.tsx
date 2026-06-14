import { useState } from "react";
import { Mail, UserPlus, X, Loader2 } from "lucide-react";
// The signal-based useSignIn() in @clerk/react v6 doesn't expose
// authenticateWithRedirect on the future resource. The legacy hook still
// returns the classic SignInResource which has it, and is the documented
// path for custom OAuth flows.
import { useSignIn } from "@clerk/react/legacy";
import { motion, AnimatePresence } from "framer-motion";

type Strategy = "oauth_google" | "oauth_apple";

// Sign in with Apple requires:
//   1. An Apple Developer account ($99/year)
//   2. An App ID + Services ID + Private Key configured in Apple's portal
//   3. Those credentials plugged into the Auth pane in Replit
//      (Workspace toolbar → Auth → Apple OAuth credentials)
// Until that's done in production, Apple sign-in returns the dreaded
// "account not identified" error from Apple's side — which we cannot fix
// from code. So we hide the button entirely until Apple is properly set
// up, and surface email + Google as the two universal paths that work
// for every account on every device. Flip this back to `true` after
// Apple credentials are saved in the Auth pane.
const APPLE_ENABLED = false;

const basePath = import.meta.env.BASE_URL.replace(/\/$/, "") || "";

/**
 * Reusable rich auth options modal — shows Google + Apple OAuth buttons,
 * email/password sign-in, "create new account", and optionally a "continue
 * as guest" choice. Used by:
 *   • WelcomeModal (first-visit prompt, with showGuest=true)
 *   • Header SIGN IN button (signed-out)
 *   • Settings → Profile signed-out card
 */
export function AuthOptionsModal({
  open,
  onClose,
  showGuest = false,
  title = "Sign in to Avolin",
  subtitle = "Pick how you'd like to sign in.",
}: {
  open: boolean;
  onClose: () => void;
  showGuest?: boolean;
  title?: string;
  subtitle?: string;
}) {
  const { signIn, isLoaded } = useSignIn();
  const [busy, setBusy] = useState<Strategy | "email" | "signup" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const back = typeof window !== "undefined"
    ? `${window.location.pathname}${window.location.search}`
    : "/";

  // True when we're rendered inside an iframe (e.g. the Replit workspace
  // canvas preview, or anywhere the app is embedded). Google and Apple's
  // OAuth consent screens refuse to load inside iframes for clickjacking
  // protection — Google specifically returns a generic "403 you do not have
  // access to this document" page in that case. So when embedded, we have
  // to escape the iframe by opening OAuth in a brand-new top-level tab.
  const inIframe = (() => {
    if (typeof window === "undefined") return false;
    try {
      return window.self !== window.top;
    } catch {
      // Cross-origin frame access threw — that itself means we're embedded.
      return true;
    }
  })();

  const goOAuth = async (strategy: Strategy) => {
    setError(null);

    // When embedded in an iframe, OAuth redirects in-place will hit Google's
    // X-Frame-Options block. Open the dedicated /sign-in page in a NEW
    // top-level tab — Clerk's <SignIn> there has its own Google/Apple
    // buttons that will run OAuth at the top window level. We pass a hint
    // so the sign-in page knows to highlight the OAuth button.
    if (inIframe) {
      const url = `${window.location.origin}${basePath}/sign-in`;
      const opened = window.open(url, "_blank", "noopener,noreferrer");
      if (!opened) {
        // Pop-up blocker — fall back to top-window navigation.
        try {
          if (window.top) window.top.location.href = url;
          else window.location.href = url;
        } catch {
          window.location.href = url;
        }
      }
      return;
    }

    if (!isLoaded || !signIn) {
      // Clerk hasn't booted — fall back to the dedicated sign-in page.
      window.location.href = `${basePath}/sign-in?redirect_url=${encodeURIComponent(back)}`;
      return;
    }
    setBusy(strategy);
    try {
      await signIn.authenticateWithRedirect({
        strategy,
        // Clerk needs an SSO-callback path to land on after Google/Apple
        // returns. We use /sign-in/sso-callback because <SignIn routing="path"
        // path="/sign-in"> on that page handles the callback automatically.
        redirectUrl: `${basePath}/sign-in/sso-callback`,
        redirectUrlComplete: back,
      });
    } catch (err: any) {
      // Most common reason: provider isn't enabled in the Clerk dashboard.
      // Fall back to the dedicated sign-in page so the user can still get in.
      console.error("[avolin] oauth start failed", err);
      const friendly =
        strategy === "oauth_google"
          ? "Google sign-in isn't available right now — try email instead."
          : "Apple sign-in isn't available right now — try email instead.";
      setError(friendly);
      setBusy(null);
    }
  };

  const goEmail = () => {
    setBusy("email");
    window.location.href = `${basePath}/sign-in?redirect_url=${encodeURIComponent(back)}`;
  };
  const goSignUp = () => {
    setBusy("signup");
    window.location.href = `${basePath}/sign-up?redirect_url=${encodeURIComponent(back)}`;
  };
  // Land on the dedicated /sign-in page with Clerk's hosted widget; the
  // widget exposes a "Forgot password?" link that triggers Clerk's full
  // password-reset flow (email → code → new password). Wiring our own
  // CTA straight to /sign-in keeps the user one tap away from recovery.
  const goForgot = () => {
    setBusy("email");
    window.location.href = `${basePath}/sign-in?redirect_url=${encodeURIComponent(back)}`;
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center p-3 sm:p-4"
          style={{ background: "rgba(0,4,12,0.85)", backdropFilter: "blur(8px)" }}
          onClick={onClose}
          role="dialog"
          aria-modal="true"
          aria-label={title}
        >
          <motion.div
            initial={{ scale: 0.95, y: 24 }}
            animate={{ scale: 1, y: 0 }}
            exit={{ scale: 0.95, y: 24 }}
            transition={{ type: "spring", damping: 22, stiffness: 260 }}
            onClick={(e) => e.stopPropagation()}
            className="relative w-full max-w-md rounded-t-2xl sm:rounded-2xl p-6 max-h-[92dvh] overflow-y-auto"
            style={{
              background: "rgba(0,8,20,0.96)",
              border: "1px solid rgba(0,220,255,0.3)",
              boxShadow: "0 0 60px rgba(0,180,240,0.3)",
              fontFamily: "'Rajdhani', sans-serif",
            }}
          >
            <button
              onClick={onClose}
              aria-label="Close"
              className="absolute right-3 top-3 w-8 h-8 rounded-md text-cyan-300/60 hover:text-cyan-100 hover:bg-cyan-400/10 flex items-center justify-center"
            >
              <X className="w-4 h-4" />
            </button>

            <div className="flex flex-col items-center text-center mb-5">
              <div
                className="relative w-16 h-16 rounded-[22%] overflow-hidden border border-cyan-400/40 mb-3"
                style={{
                  boxShadow: "0 0 40px rgba(0,180,255,0.45)",
                  background: "#000208",
                }}
              >
                <img
                  src={`${basePath}/icon-512.png`}
                  alt=""
                  width={64}
                  height={64}
                  className="w-full h-full object-cover"
                  draggable={false}
                />
              </div>
              <h2
                className="text-2xl tracking-[0.3em] font-bold text-cyan-100"
                style={{
                  fontFamily: "'Orbitron', sans-serif",
                  textShadow: "0 0 20px rgba(0,220,255,0.4)",
                }}
              >
                AVOLIN
              </h2>
              <p className="text-cyan-200/70 text-sm mt-1.5 px-2">{subtitle}</p>
            </div>

            <div className="space-y-2.5">
              {/* Email / password — promoted to the top as the primary path
                  because it works for every account type. Google sign-in
                  below requires a verified production OAuth client and may
                  be blocked by Google for school / Family Link / under-18
                  accounts when using a Clerk dev instance. Apple is hidden
                  entirely until the Apple Developer account ($99/year) is
                  set up — re-enable by flipping APPLE_ENABLED to true. */}
              <button
                onClick={goEmail}
                disabled={busy !== null}
                className="w-full flex items-center justify-center gap-2.5 py-3 rounded-xl font-mono text-sm tracking-widest uppercase disabled:opacity-60"
                style={{
                  background:
                    "linear-gradient(135deg, rgb(0,180,240) 0%, rgb(0,220,255) 100%)",
                  color: "#001020",
                  boxShadow: "0 0 24px rgba(0,180,240,0.4)",
                }}
              >
                {busy === "email" ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Mail className="w-4 h-4" />
                )}
                Sign in with email
              </button>

              {/* Reassurance line: every account works via email. This
                  removes any doubt for users whose Google account is
                  restricted (school / Family Link / under-18) or who
                  don't have an Apple ID — they can always use their
                  email to get in. */}
              <p className="text-[11px] text-cyan-300/55 text-center px-2 leading-snug">
                Works with any email — Gmail, iCloud, Yahoo, Outlook,
                school, work, anything.
              </p>

              {/* Create account */}
              <button
                onClick={goSignUp}
                disabled={busy !== null}
                className="w-full flex items-center justify-center gap-2.5 py-3 rounded-xl font-mono text-sm tracking-widest uppercase border border-cyan-400/35 text-cyan-100 hover:bg-cyan-400/10 active:bg-cyan-400/20 disabled:opacity-60 transition-colors"
              >
                {busy === "signup" ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <UserPlus className="w-4 h-4" />
                )}
                Create new account
              </button>

              {/* Forgot password recovery link — lands on /sign-in where
                  Clerk's hosted widget exposes the full email-code reset
                  flow. Without this, users who forget their password
                  often think their account is broken (they see Clerk's
                  generic "couldn't sign you in" 422 error). */}
              <button
                onClick={goForgot}
                disabled={busy !== null}
                className="w-full text-center text-[12px] font-mono tracking-wider text-cyan-300/70 hover:text-cyan-200 underline underline-offset-4 decoration-cyan-400/40 hover:decoration-cyan-300 transition-colors py-1 disabled:opacity-60"
              >
                Forgot your password?
              </button>

              <div className="flex items-center gap-3 my-3">
                <div className="flex-1 h-px bg-cyan-400/20" />
                <div className="font-mono text-[10px] tracking-widest uppercase text-cyan-400/50">
                  or
                </div>
                <div className="flex-1 h-px bg-cyan-400/20" />
              </div>

              {/* Google (secondary — placed below email because it can fail
                  for restricted account types until production OAuth is set
                  up in the Clerk dashboard). */}
              <button
                onClick={() => goOAuth("oauth_google")}
                disabled={busy !== null}
                className="w-full flex items-center justify-center gap-3 py-3 rounded-xl bg-white text-[#1f1f1f] font-medium text-sm hover:bg-cyan-50 active:bg-cyan-100 disabled:opacity-60 transition-colors"
                style={{ boxShadow: "0 0 18px rgba(0,180,240,0.2)" }}
              >
                {busy === "oauth_google" ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <GoogleGlyph />
                )}
                Continue with Google
              </button>

              {APPLE_ENABLED && (
                <button
                  onClick={() => goOAuth("oauth_apple")}
                  disabled={busy !== null}
                  className="w-full flex items-center justify-center gap-3 py-3 rounded-xl bg-black text-white font-medium text-sm hover:bg-zinc-900 active:bg-zinc-800 disabled:opacity-60 border border-cyan-400/20 transition-colors"
                >
                  {busy === "oauth_apple" ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <AppleGlyph />
                  )}
                  Continue with Apple
                </button>
              )}

              {showGuest && (
                <button
                  onClick={onClose}
                  className="w-full py-2.5 rounded-xl font-mono text-xs tracking-widest uppercase text-cyan-300/60 hover:text-cyan-200 hover:bg-cyan-400/5 transition-colors"
                >
                  Continue as guest
                </button>
              )}

              {error && (
                <div
                  role="alert"
                  className="mt-2 px-3 py-2 rounded-lg border border-red-400/30 bg-red-400/10 text-red-200 text-xs font-mono"
                >
                  {error}
                </div>
              )}
            </div>

            <p className="mt-5 text-center text-[10px] font-mono tracking-widest uppercase text-cyan-400/35">
              Built by Kennedy Marara
            </p>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function GoogleGlyph() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
      <path fill="#4285F4" d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92c1.7-1.57 2.68-3.88 2.68-6.62z"/>
      <path fill="#34A853" d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.8.54-1.84.86-3.04.86-2.34 0-4.32-1.58-5.03-3.7H.96v2.34A9 9 0 0 0 9 18z"/>
      <path fill="#FBBC05" d="M3.97 10.72A5.41 5.41 0 0 1 3.68 9c0-.6.1-1.18.29-1.72V4.94H.96A9 9 0 0 0 0 9c0 1.45.35 2.83.96 4.06l3.01-2.34z"/>
      <path fill="#EA4335" d="M9 3.58c1.32 0 2.5.45 3.44 1.34l2.58-2.58C13.46.86 11.43 0 9 0A9 9 0 0 0 .96 4.94l3.01 2.34C4.68 5.16 6.66 3.58 9 3.58z"/>
    </svg>
  );
}

function AppleGlyph() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" fill="white">
      <path d="M16.365 1.43c0 1.14-.41 2.16-1.22 3.06-.97 1.07-2.14 1.69-3.41 1.59-.05-1.11.45-2.27 1.27-3.13.85-.9 2.16-1.55 3.36-1.52zM20.5 17.45c-.55 1.27-.81 1.84-1.51 2.96-.98 1.56-2.36 3.5-4.07 3.51-1.52.02-1.91-.99-3.97-.98-2.06.01-2.49 1-4.01.98-1.71-.01-3.02-1.78-4-3.34C-.16 16.65-.42 11.31 1.93 8.7c1.36-1.51 3.5-2.41 5.5-2.41 2.05 0 3.34 1.12 5.04 1.12 1.65 0 2.65-1.13 5.02-1.13 1.78 0 3.66.97 5 2.65-4.39 2.41-3.68 8.69 0 9.52z"/>
    </svg>
  );
}
