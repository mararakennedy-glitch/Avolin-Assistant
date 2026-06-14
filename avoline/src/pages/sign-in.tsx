import { Component, type ReactNode, useEffect, useRef, useState } from "react";
import { SignIn, useClerk } from "@clerk/react";
import { ArrowLeft, AlertTriangle, RefreshCw, Home, Loader2 } from "lucide-react";
import { Link } from "wouter";

/**
 * Catches any uncaught render error inside Clerk's <SignIn /> widget so
 * a broken third-party render doesn't blank-screen the whole page. When
 * it fires we surface the same friendly fallback the empty-DOM check
 * would show.
 */
class SignInErrorBoundary extends Component<
  { onError: (err: Error) => void; children: ReactNode },
  { hasError: boolean }
> {
  state = { hasError: false };
  static getDerivedStateFromError() {
    return { hasError: true };
  }
  componentDidCatch(error: Error) {
    this.props.onError(error);
  }
  render() {
    if (this.state.hasError) return null;
    return this.props.children;
  }
}

/**
 * Sign-in page. Renders Clerk's hosted <SignIn /> widget.
 *
 * The actual dev↔prod publishable-key swap happens in App.tsx via
 * publishableKeyFromHost() + the proxyUrl on <ClerkProvider>, so on the
 * published .replit.app site Clerk loads its production Frontend API
 * through /api/__clerk and the widget renders normally.
 *
 * Three layers of resilience around the widget:
 *  1. Show a quiet "loading" indicator while Clerk JS bootstraps so the
 *     screen never looks blank/broken during the first second.
 *  2. Empty-DOM fallback: after a short grace period, if the widget still
 *     hasn't rendered anything, surface a refresh prompt — covers
 *     transient network failures and Clerk JS load issues.
 *  3. Error boundary around <SignIn /> catches uncaught render errors
 *     inside the widget and shows the same friendly fallback instead of
 *     a blank page.
 */
export default function SignInPage() {
  const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");
  const { loaded } = useClerk();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [showEmptyWarning, setShowEmptyWarning] = useState(false);
  const [boundaryError, setBoundaryError] = useState<Error | null>(null);

  // Empty-DOM fallback: after a short grace period, if Clerk's widget
  // hasn't put anything inside our container, treat it as broken. Reset
  // the warning whenever loaded flips so a successful late-load clears
  // the message instead of leaving stale UI.
  useEffect(() => {
    if (boundaryError) {
      setShowEmptyWarning(true);
      return;
    }
    setShowEmptyWarning(false);
    const t = window.setTimeout(() => {
      const node = containerRef.current;
      const empty = !node || !node.firstChild || node.scrollHeight < 40;
      if (empty) setShowEmptyWarning(true);
    }, 6000);
    return () => window.clearTimeout(t);
  }, [loaded, boundaryError]);

  return (
    <div
      className="min-h-[100dvh] flex flex-col items-center justify-center p-6 dark relative overflow-hidden"
      style={{ background: "#000208", fontFamily: "'Rajdhani', sans-serif" }}
    >
      <div
        className="absolute inset-0 pointer-events-none"
        style={{ background: "radial-gradient(ellipse 60% 50% at 50% 40%, rgba(0,80,160,0.25) 0%, transparent 60%)" }}
      />
      <Link
        to="/"
        className="absolute top-6 left-6 inline-flex items-center gap-2 text-xs font-mono text-cyan-400/60 hover:text-cyan-300 tracking-widest uppercase z-10"
      >
        <ArrowLeft className="w-3.5 h-3.5" /> Back to Avolin
      </Link>
      <div className="relative z-10 mb-6 text-center">
        <h1
          className="text-3xl tracking-[0.4em] font-bold text-cyan-100"
          style={{ fontFamily: "'Orbitron', sans-serif", textShadow: "0 0 20px rgba(0,220,255,0.5)" }}
        >
          AVOLIN
        </h1>
        <p className="text-cyan-400/55 text-xs font-mono tracking-widest uppercase mt-2">
          Sign in to your assistant
        </p>
      </div>
      <div ref={containerRef} className="relative z-10 min-h-[60px]">
        <SignInErrorBoundary onError={setBoundaryError}>
          <SignIn
            routing="path"
            path={`${basePath}/sign-in`}
            signUpUrl={`${basePath}/sign-up`}
            forceRedirectUrl={`${basePath}/`}
            fallbackRedirectUrl={`${basePath}/`}
          />
        </SignInErrorBoundary>
        {!loaded && !showEmptyWarning && (
          <div
            className="flex items-center justify-center gap-2 py-8 text-cyan-300/70 text-xs font-mono tracking-widest uppercase"
            aria-live="polite"
          >
            <Loader2 className="w-4 h-4 animate-spin" />
            Loading sign-in…
          </div>
        )}
      </div>

      {showEmptyWarning && (
        <div
          role="alert"
          className="relative z-10 mt-6 max-w-md w-full rounded-xl border p-5 text-center"
          style={{
            background: "rgba(20, 8, 0, 0.85)",
            borderColor: "rgba(255, 180, 80, 0.4)",
            boxShadow: "0 0 28px rgba(255, 140, 0, 0.18)",
          }}
        >
          <AlertTriangle className="w-6 h-6 text-amber-300 mx-auto mb-2" />
          <p className="text-amber-100 text-sm font-medium mb-1">
            Sign-in didn't load
          </p>
          <p className="text-amber-200/70 text-xs mb-4 leading-relaxed">
            {boundaryError
              ? "Something interrupted the sign-in form. Refresh to try again."
              : "The sign-in form hasn't appeared. Check your connection, then refresh — if it keeps happening, give it a minute and try again."}
          </p>
          <div className="flex flex-col sm:flex-row gap-2 justify-center">
            <button
              onClick={() => window.location.reload()}
              className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg font-mono text-xs tracking-widest uppercase border border-amber-400/40 bg-amber-400/15 hover:bg-amber-400/25 text-amber-100 transition-colors"
            >
              <RefreshCw className="w-3.5 h-3.5" /> Refresh
            </button>
            <Link
              to="/"
              className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg font-mono text-xs tracking-widest uppercase border border-cyan-400/30 hover:bg-cyan-400/10 text-cyan-200 transition-colors"
            >
              <Home className="w-3.5 h-3.5" /> Back home
            </Link>
          </div>
        </div>
      )}

      <p className="relative z-10 mt-6 text-[10px] font-mono tracking-widest uppercase text-cyan-400/30">
        Powered by Avolin · Built by Kennedy Marara
      </p>
    </div>
  );
}
