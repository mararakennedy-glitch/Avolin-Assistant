import { useEffect, useState } from "react";
import { useUser } from "@clerk/react";
import { AuthOptionsModal } from "@/components/auth-options-modal";

const SEEN_KEY = "avolin.welcomeSeen";

/**
 * One-time welcome / sign-in prompt shown on the very first visit. Wraps
 * the shared <AuthOptionsModal/> with showGuest=true so guests can also
 * dismiss. After it's been shown once we never show it again on this
 * device — discoverability is preserved by the SIGN IN button in the
 * header which opens the same options modal on demand.
 */
export function WelcomeModal() {
  const { isLoaded, isSignedIn } = useUser();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!isLoaded) return;
    if (isSignedIn) return;
    // Never auto-pop on the dedicated sign-in / sign-up pages — those pages
    // already show Clerk's full sign-in form, and stacking this modal on
    // top of them creates a confusing overlapping layout where the user
    // can see "Continue with Google" twice and can't tell which button is
    // real. Same for the upgrade picker (the user is mid-checkout) and the
    // SSO callback path used by Google/Apple OAuth returns.
    const path = window.location.pathname;
    if (
      path.includes("/sign-in") ||
      path.includes("/sign-up") ||
      path.includes("/sso-callback") ||
      path.endsWith("/upgrade") ||
      path.endsWith("/upgrade/")
    ) {
      return;
    }
    let seen = false;
    try { seen = localStorage.getItem(SEEN_KEY) === "1"; } catch { /* no-op */ }
    if (seen) return;
    const t = window.setTimeout(() => setOpen(true), 600);
    return () => window.clearTimeout(t);
  }, [isLoaded, isSignedIn]);

  const close = () => {
    try { localStorage.setItem(SEEN_KEY, "1"); } catch { /* no-op */ }
    setOpen(false);
  };

  return (
    <AuthOptionsModal
      open={open}
      onClose={close}
      showGuest
      title="Welcome to Avolin"
      subtitle="Sign in to save your conversations and sync across devices, or continue as a guest."
    />
  );
}
