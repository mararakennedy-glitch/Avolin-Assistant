import { useState, useEffect, useCallback } from "react";
import {
  Crown,
  Zap,
  Sparkles,
  Rocket,
  ArrowLeft,
  Check,
  X,
  Loader2,
  BadgeCheck,
  AlertTriangle,
  RefreshCw,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useUser, useAuth, useClerk } from "@clerk/react";
import { useTier } from "@/hooks/use-tier";

type PlanKey = "basic" | "core" | "elite";

type Plan = {
  key: PlanKey;
  name: string;
  tagline: string;
  price: string;
  cadence: string;
  badge?: string;
  highlight: string;
  ring: string;
  glow: string;
  features: { text: string; included: boolean }[];
  cta: string;
};

const PLANS: Plan[] = [
  {
    key: "basic",
    name: "Avolin Basic",
    tagline: "Free forever — taste the future.",
    price: "$0",
    cadence: "/ forever",
    highlight: "rgba(120,200,255,",
    ring: "rgba(120,200,255,0.35)",
    glow: "rgba(120,200,255,0.15)",
    features: [
      { text: "Voice + text interaction", included: true },
      { text: "Web search & deep analysis", included: true },
      { text: "20 image generations / month (1080p)", included: true },
      { text: "10 music tracks / month (up to 5 min)", included: true },
      { text: "Local conversation history", included: true },
      { text: "Commercial license", included: false },
      { text: "Cloud sync & backup", included: false },
    ],
    cta: "Current plan",
  },
  {
    key: "core",
    name: "Avolin Core",
    tagline: "Unlock the full assistant.",
    price: "$10",
    cadence: "/ month",
    highlight: "rgba(0,220,255,",
    ring: "rgba(0,220,255,0.55)",
    glow: "rgba(0,220,255,0.25)",
    features: [
      { text: "Everything in Basic", included: true },
      { text: "Personality editor + multiple personas", included: true },
      { text: "Emotion-responsive voice", included: true },
      { text: "Cloud sync across devices", included: true },
      { text: "Calendar & email deep integration", included: true },
      { text: "Encrypted data vault", included: true },
      { text: "Smart home (IoT) control", included: true },
      { text: "Priority email & chat support", included: true },
    ],
    cta: "Upgrade to Core",
  },
  {
    key: "elite",
    name: "Avolin Elite",
    tagline: "Production-grade. Unlimited. Yours.",
    price: "$90",
    cadence: "/ year",
    badge: "SAVE 25%",
    highlight: "rgba(255,180,80,",
    ring: "rgba(255,180,80,0.55)",
    glow: "rgba(255,180,80,0.25)",
    features: [
      { text: "Everything in Core", included: true },
      { text: "4K / 8K image generation + batch (×10)", included: true },
      { text: "Inpainting, outpainting, style transfer", included: true },
      { text: "30-min full songs + multi-track stems", included: true },
      { text: "Custom singing voice cloning", included: true },
      { text: "Commercial license (image + music)", included: true },
      { text: "API access + family sharing (×5)", included: true },
    ],
    cta: "Go Elite — $90/yr",
  },
];

export default function Upgrade() {
  const [paymentStatus, setPaymentStatus] = useState<
    "success" | "cancelled" | "pending" | "error" | null
  >(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [paymentsConfigured, setPaymentsConfigured] = useState<boolean | null>(null);
  const [pickerTier, setPickerTier] = useState<"core" | "elite" | null>(null);
  const { tier: currentTier, refresh: refreshTier } = useTier();
  const { user, isSignedIn, isLoaded: isAuthLoaded } = useUser();
  const { getToken } = useAuth();
  const { loaded: clerkLoaded } = useClerk();
  // If Clerk hasn't initialised after a few seconds we show an inline notice
  // explaining that sign-in is unavailable rather than letting the user tap a
  // package and get redirected to a blank /sign-in screen.
  const [showAuthOffline, setShowAuthOffline] = useState(false);
  useEffect(() => {
    if (clerkLoaded) {
      setShowAuthOffline(false);
      return;
    }
    const t = window.setTimeout(() => setShowAuthOffline(true), 3500);
    return () => window.clearTimeout(t);
  }, [clerkLoaded]);

  // App.tsx wires the production publishable key + proxyUrl into ClerkProvider
  // (see publishableKeyFromHost), so the only remaining failure mode here is
  // Clerk JS not loading at all (offline, network, blocked). The 3.5s timer
  // above flips showAuthOffline so we can warn the user before they tap a plan.
  const authBlocked = showAuthOffline && !clerkLoaded;

  // If a not-signed-in user clicks "Upgrade", we send them to the dedicated
  // /sign-in page (rather than Clerk's modal — modals are unreliable inside
  // PWAs / mobile in-app browsers / Replit-style iframes). After sign-in
  // Clerk routes them back to /upgrade?tier=core which auto-opens the
  // picker, so it still feels like a single click.
  const startUpgrade = useCallback(
    (tier: "core" | "elite") => {
      if (isSignedIn) {
        setPickerTier(tier);
        return;
      }
      const back = `${window.location.pathname}?tier=${tier}`;
      const signInUrl = `/sign-in?redirect_url=${encodeURIComponent(back)}`;
      window.location.href = signInUrl;
    },
    [isSignedIn],
  );

  // Poll payment status after returning from PayPal.
  const pollStatus = useCallback(
    async (reference: string) => {
      setPaymentStatus("pending");
      setStatusMessage("Verifying your payment with PayPal…");
      const deadline = Date.now() + 60_000;
      while (Date.now() < deadline) {
        try {
          const token = await getToken().catch(() => null);
          const res = await fetch(
            `/api/payments/status/${encodeURIComponent(reference)}`,
            {
              credentials: "include",
              headers: token ? { Authorization: `Bearer ${token}` } : {},
            },
          );
          if (res.ok) {
            const data = await res.json();
            if (data.paid) {
              setPaymentStatus("success");
              setStatusMessage(
                `You're now on Avolin ${String(data.tier).toUpperCase()} — welcome aboard!`,
              );
              refreshTier();
              return;
            }
            if (data.status === "cancelled" || data.status === "failed") {
              setPaymentStatus("cancelled");
              setStatusMessage("Payment was not completed.");
              return;
            }
          }
        } catch {
          /* keep polling */
        }
        await new Promise((r) => setTimeout(r, 3000));
      }
      setPaymentStatus("error");
      setStatusMessage(
        "Couldn't confirm payment yet. If you completed it, your tier will appear shortly — refresh the page in a minute.",
      );
    },
    [refreshTier, getToken],
  );

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const ref = params.get("ref");
    if (params.get("payment") === "success" && ref) {
      void pollStatus(ref);
    } else if (params.get("payment") === "cancelled") {
      setPaymentStatus("cancelled");
      setStatusMessage("Payment cancelled — no charge was made.");
    }

    // Check whether the site owner has wired up PayPal yet.
    fetch("/api/payments/config")
      .then((r) => r.json())
      .then((data) => setPaymentsConfigured(Boolean(data?.configured)))
      .catch(() => setPaymentsConfigured(false));
  }, [pollStatus]);

  // After Clerk redirects the user back here post-sign-in, auto-open the
  // checkout modal for whichever tier they were trying to buy.
  useEffect(() => {
    if (!isAuthLoaded || !isSignedIn) return;
    const params = new URLSearchParams(window.location.search);
    const wanted = params.get("tier");
    if (wanted === "core" || wanted === "elite") {
      setPickerTier(wanted);
      // Clean the URL so a refresh doesn't re-open the modal forever.
      params.delete("tier");
      const qs = params.toString();
      window.history.replaceState(
        {},
        "",
        `${window.location.pathname}${qs ? `?${qs}` : ""}`,
      );
    }
  }, [isAuthLoaded, isSignedIn]);

  return (
    <div
      className="min-h-[100dvh] flex flex-col items-center p-6 relative overflow-hidden dark"
      style={{ background: "#000208", fontFamily: "'Rajdhani', sans-serif" }}
    >
      {/* Ambient backdrop */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            "radial-gradient(ellipse 80% 60% at 50% 30%, rgba(0,80,160,0.25) 0%, transparent 60%)",
        }}
      />
      <div
        className="absolute inset-0 pointer-events-none opacity-[0.05]"
        style={{
          backgroundImage:
            "repeating-linear-gradient(0deg, transparent, transparent 3px, rgba(80,180,255,0.5) 3px, rgba(80,180,255,0.5) 4px)",
        }}
      />

      <div className="relative z-10 w-full max-w-6xl">
        <a
          href="/"
          className="inline-flex items-center gap-2 mb-8 text-xs font-mono text-cyan-400/60 hover:text-cyan-300 tracking-widest uppercase"
        >
          <ArrowLeft className="w-3.5 h-3.5" /> Back to Avolin
        </a>

        {paymentStatus === "success" && (
          <div className="mb-6 px-4 py-3 rounded-lg border border-emerald-400/30 bg-emerald-400/10 text-emerald-300 text-sm font-mono flex items-center gap-2">
            <Check className="w-4 h-4" /> {statusMessage ?? "Payment successful!"}
          </div>
        )}
        {paymentStatus === "pending" && (
          <div className="mb-6 px-4 py-3 rounded-lg border border-cyan-400/30 bg-cyan-400/10 text-cyan-200 text-sm font-mono flex items-center gap-2">
            <Loader2 className="w-4 h-4 animate-spin" /> {statusMessage}
          </div>
        )}
        {paymentStatus === "cancelled" && (
          <div className="mb-6 px-4 py-3 rounded-lg border border-amber-400/30 bg-amber-400/10 text-amber-300 text-sm font-mono">
            {statusMessage ?? "Payment cancelled — no charge was made."}
          </div>
        )}
        {paymentStatus === "error" && (
          <div className="mb-6 px-4 py-3 rounded-lg border border-red-400/30 bg-red-400/10 text-red-300 text-sm font-mono">
            {statusMessage}
          </div>
        )}

        {authBlocked && (
          <div className="mb-6 px-4 py-4 rounded-lg border border-amber-400/40 bg-amber-400/10 text-amber-200 text-sm font-mono">
            <div className="flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-amber-300 mt-0.5 shrink-0" />
              <div className="flex-1 space-y-2">
                <div className="font-bold tracking-wider text-amber-100">
                  SIGN-IN UNAVAILABLE
                </div>
                <p className="leading-relaxed text-amber-200/90">
                  We can't reach the sign-in service from this device right
                  now, so a payment can't start (we need to know who to
                  credit the upgrade to). Try refreshing — if it keeps
                  happening, give it a few minutes and try again.
                </p>
                <button
                  onClick={() => window.location.reload()}
                  className="inline-flex items-center gap-2 px-3 py-1.5 rounded-md font-mono text-[11px] tracking-widest uppercase border border-amber-400/40 bg-amber-400/15 hover:bg-amber-400/25 text-amber-100 transition-colors"
                >
                  <RefreshCw className="w-3.5 h-3.5" /> Refresh
                </button>
              </div>
            </div>
          </div>
        )}

        {paymentsConfigured === false && (
          <div className="mb-6 px-4 py-4 rounded-lg border border-amber-400/30 bg-amber-400/10 text-amber-200 text-sm font-mono space-y-2">
            <div className="font-bold tracking-wider text-amber-100">PAYMENTS NOT YET LIVE</div>
            <p className="leading-relaxed text-amber-200/90">
              To start collecting payments, the owner (Kennedy) needs to:
            </p>
            <ol className="list-decimal list-inside space-y-1 text-amber-200/90">
              <li>
                Open{" "}
                <a
                  href="https://www.paypal.com/bizsignup/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline text-amber-100 hover:text-white"
                >
                  paypal.com/bizsignup
                </a>{" "}
                and create a PayPal Business account using{" "}
                <span className="text-amber-100">mararakennedy@gmail.com</span>.
              </li>
              <li>
                Open{" "}
                <a
                  href="https://developer.paypal.com/dashboard/applications/live"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline text-amber-100 hover:text-white"
                >
                  developer.paypal.com
                </a>{" "}
                → <span className="text-amber-100">My Apps & Credentials</span> →{" "}
                <span className="text-amber-100">Live</span> → <span className="text-amber-100">Create App</span>.
              </li>
              <li>
                Copy the <span className="text-amber-100">Client ID</span> and{" "}
                <span className="text-amber-100">Secret</span>.
              </li>
              <li>
                Paste them when Avolin asks for the two payment secrets — that's it.
              </li>
            </ol>
            <p className="text-amber-300/80 text-xs pt-1">
              All money paid for any plan will land in the PayPal account that owns those credentials.
            </p>
          </div>
        )}

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center mb-10"
        >
          <div className="inline-flex items-center gap-2 mb-4 px-4 py-2 rounded-full border border-cyan-400/30 bg-cyan-400/10 text-cyan-300 text-xs font-mono tracking-widest">
            <Crown className="w-3.5 h-3.5" /> CHOOSE YOUR PLAN
          </div>
          <h1
            className="text-4xl md:text-5xl text-cyan-50 mb-3 tracking-[0.3em] font-bold"
            style={{
              fontFamily: "'Orbitron', sans-serif",
              textShadow: "0 0 20px rgba(0,220,255,0.4)",
            }}
          >
            AVOLIN
          </h1>
          <p className="text-cyan-300/60 text-sm font-mono tracking-widest uppercase">
            Built by Kennedy Marara · Three tiers, one assistant
          </p>
        </motion.div>

        {currentTier !== "basic" && (
          <div className="mb-6 px-4 py-3 rounded-lg border border-cyan-400/30 bg-cyan-400/10 text-cyan-200 text-sm font-mono flex items-center gap-2">
            <BadgeCheck className="w-4 h-4 text-cyan-300" />
            You are currently on{" "}
            <span className="font-bold uppercase tracking-widest">
              Avolin {currentTier}
            </span>
            . Thank you for supporting Avolin.
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          {PLANS.map((plan, idx) => {
            const isCurrent = plan.key === currentTier;
            const isPaid = plan.key !== "basic";
            const isLocked = isPaid && isCurrent;
            return (
              <motion.div
                key={plan.key}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 + idx * 0.1 }}
                className="relative rounded-2xl p-6 backdrop-blur-xl flex flex-col"
                style={{
                  background: `linear-gradient(160deg, ${plan.highlight}0.06) 0%, rgba(0,8,20,0.92) 100%)`,
                  border: `1px solid ${plan.ring}`,
                  boxShadow: `0 0 40px ${plan.glow}`,
                }}
              >
                {plan.badge && (
                  <div
                    className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-1 rounded-full text-[10px] font-mono tracking-widest"
                    style={{
                      background: `${plan.highlight}0.95)`,
                      color: "#0a0510",
                      boxShadow: `0 0 20px ${plan.glow}`,
                    }}
                  >
                    {plan.badge}
                  </div>
                )}

                <div className="flex items-center gap-2 mb-2">
                  {plan.key === "basic" && (
                    <Sparkles
                      className="w-4 h-4"
                      style={{ color: `${plan.highlight}1)` }}
                    />
                  )}
                  {plan.key === "core" && (
                    <Zap className="w-4 h-4" style={{ color: `${plan.highlight}1)` }} />
                  )}
                  {plan.key === "elite" && (
                    <Rocket
                      className="w-4 h-4"
                      style={{ color: `${plan.highlight}1)` }}
                    />
                  )}
                  <h2
                    className="text-xl tracking-widest font-bold"
                    style={{
                      color: `${plan.highlight}0.95)`,
                      fontFamily: "'Orbitron', sans-serif",
                    }}
                  >
                    {plan.name.toUpperCase()}
                  </h2>
                </div>
                <p className="text-cyan-200/55 text-xs font-mono mb-5">{plan.tagline}</p>

                <div className="flex items-baseline gap-2 mb-5">
                  <span
                    className="text-5xl font-light"
                    style={{
                      color: `${plan.highlight}0.95)`,
                      textShadow: `0 0 20px ${plan.glow}`,
                    }}
                  >
                    {plan.price}
                  </span>
                  <span className="text-cyan-400/55 text-xs font-mono uppercase tracking-wider">
                    {plan.cadence}
                  </span>
                </div>

                <ul className="flex-1 space-y-2.5 mb-6">
                  {plan.features.map((f, i) => (
                    <li key={i} className="flex items-start gap-2.5 text-[13px]">
                      {f.included ? (
                        <Check
                          className="w-4 h-4 mt-0.5 flex-shrink-0"
                          style={{ color: `${plan.highlight}0.95)` }}
                        />
                      ) : (
                        <X className="w-4 h-4 mt-0.5 flex-shrink-0 text-red-400/50" />
                      )}
                      <span
                        className={
                          f.included
                            ? "text-cyan-100/85"
                            : "text-cyan-100/30 line-through"
                        }
                      >
                        {f.text}
                      </span>
                    </li>
                  ))}
                </ul>

                <button
                  onClick={() =>
                    !isLocked && isPaid && startUpgrade(plan.key as "core" | "elite")
                  }
                  disabled={!isPaid || isLocked}
                  className="w-full py-3 rounded-xl font-mono text-sm tracking-wider transition-all disabled:opacity-60 disabled:cursor-default flex items-center justify-center gap-2"
                  style={{
                    background: isLocked
                      ? "rgba(0,200,140,0.18)"
                      : isPaid
                        ? `${plan.highlight}0.95)`
                        : "rgba(80,120,160,0.18)",
                    color: isLocked
                      ? "rgb(120,255,210)"
                      : isPaid
                        ? "#020a14"
                        : "rgba(180,220,255,0.6)",
                    boxShadow: isPaid && !isLocked ? `0 0 24px ${plan.glow}` : "none",
                    border: isLocked
                      ? "1px solid rgba(0,200,140,0.45)"
                      : isPaid
                        ? "none"
                        : "1px solid rgba(120,200,255,0.25)",
                  }}
                >
                  {isLocked ? (
                    <>
                      <BadgeCheck className="w-4 h-4" />
                      Current plan
                    </>
                  ) : isCurrent && !isPaid ? (
                    <>Current plan</>
                  ) : (
                    <>
                      {plan.key === "elite" && <Crown className="w-4 h-4" />}
                      {plan.key === "core" && <Zap className="w-4 h-4" />}
                      {plan.cta}
                    </>
                  )}
                </button>
              </motion.div>
            );
          })}
        </div>

        <p className="text-center text-cyan-400/35 text-xs font-mono mt-8">
          Secure checkout · Pay with Mastercard, Visa, Amex, debit card, or PayPal balance — no PayPal account required
        </p>
      </div>

      <AnimatePresence>
        {pickerTier && (
          <CheckoutModal
            tier={pickerTier}
            defaultEmail={user?.primaryEmailAddress?.emailAddress ?? ""}
            onClose={() => setPickerTier(null)}
            getToken={getToken}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

function CheckoutModal({
  tier,
  defaultEmail,
  onClose,
  getToken,
}: {
  tier: "core" | "elite";
  defaultEmail: string;
  onClose: () => void;
  getToken: () => Promise<string | null>;
}) {
  const [email, setEmail] = useState(defaultEmail);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // When set, we've successfully created a PayPal order but the automatic
  // redirect didn't fire (popup blocked, iframe sandbox without
  // allow-top-navigation, in-app webview, etc). The UI swaps to a big
  // "Open secure checkout" link the user can tap to complete payment.
  const [approveUrl, setApproveUrl] = useState<string | null>(null);

  const price = tier === "core" ? "$10 / month" : "$90 / year";

  const goToPaypal = (url: string) => {
    // Try the most reliable path first: navigate the top-level window so the
    // PayPal page replaces the entire tab even when we're inside an iframe
    // (Replit preview) or PWA's webview. window.top can throw if the parent
    // is cross-origin, so we wrap each attempt in try/catch and gracefully
    // fall through to a clickable link if every attempt fails.
    try {
      if (window.top && window.top !== window.self) {
        window.top.location.href = url;
        return true;
      }
    } catch { /* cross-origin parent — fall through */ }
    try {
      window.location.assign(url);
      return true;
    } catch { /* fall through */ }
    try {
      const popup = window.open(url, "_top");
      if (popup) return true;
    } catch { /* fall through */ }
    return false;
  };

  const submit = async () => {
    setError(null);
    setSubmitting(true);
    try {
      // Attach the Clerk session token so the server recognises us as the
      // signed-in user. Cookies alone are unreliable inside iframes / when
      // third-party cookies are blocked, so the Bearer header is the reliable
      // path for authenticated API calls.
      const token = await getToken().catch(() => null);
      const res = await fetch("/api/payments/checkout", {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          tier,
          email: email && email.includes("@") ? email : undefined,
        }),
      });
      const data = await res.json().catch(() => ({} as any));
      if (!res.ok) {
        setError(
          data?.error ?? `Couldn't start the payment (HTTP ${res.status}).`,
        );
        setSubmitting(false);
        return;
      }
      if (data.mode === "redirect" && data.url) {
        // Always show the fallback link first (so the user has a clickable
        // option if anything blocks the auto-redirect), then attempt the
        // navigation. The link stays visible if the redirect silently fails.
        setApproveUrl(data.url);
        const ok = goToPaypal(data.url);
        if (!ok) {
          setError(
            "Your browser blocked the automatic redirect. Tap the button below to open the secure checkout.",
          );
          setSubmitting(false);
        }
        return;
      }
      setError("Unexpected response from the payment server.");
      setSubmitting(false);
    } catch (err: any) {
      console.error("[avolin] checkout failed", err);
      setError(
        err?.message
          ? `Couldn't reach the payment server: ${err.message}`
          : "Couldn't reach the payment server. Check your connection and try again.",
      );
      setSubmitting(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-3 sm:p-4 overflow-y-auto"
      style={{ background: "rgba(0,4,12,0.85)", backdropFilter: "blur(8px)" }}
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.95, y: 20 }}
        animate={{ scale: 1, y: 0 }}
        exit={{ scale: 0.95, y: 20 }}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md rounded-t-2xl sm:rounded-2xl p-5 sm:p-6 relative max-h-[92dvh] overflow-y-auto"
        style={{
          background: "rgba(0,8,20,0.95)",
          border: "1px solid rgba(0,220,255,0.3)",
          boxShadow: "0 0 60px rgba(0,180,240,0.25)",
        }}
      >
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-cyan-400/60 hover:text-cyan-300"
          aria-label="Close"
        >
          <X className="w-5 h-5" />
        </button>
        <h3
          className="text-xl tracking-widest font-bold text-cyan-100 mb-1"
          style={{ fontFamily: "'Orbitron', sans-serif" }}
        >
          AVOLIN {tier.toUpperCase()}
        </h3>
        <p className="text-cyan-300/60 text-sm font-mono mb-5">{price} · card or PayPal</p>

        <label className="block text-xs font-mono tracking-widest uppercase text-cyan-400/70 mb-1">
          Email for receipt (optional)
        </label>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com"
          className="w-full mb-4 px-3 py-2 rounded-lg bg-black/40 border border-cyan-400/25 text-cyan-100 text-sm focus:outline-none focus:border-cyan-300 font-mono"
        />

        <div className="mb-4 px-3 py-2.5 rounded-lg border border-cyan-400/20 bg-cyan-400/5 text-cyan-200/80 text-xs font-mono leading-relaxed">
          You'll see a secure checkout page where you can pay with{" "}
          <span className="text-cyan-100">Mastercard, Visa, American Express,</span>{" "}
          any debit card, or your PayPal balance. No PayPal account needed —
          guest checkout is enabled. After payment you'll be sent right back
          here.
        </div>

        {error && (
          <div className="mb-4 px-3 py-2 rounded-lg border border-red-400/30 bg-red-400/10 text-red-300 text-xs font-mono">
            {error}
          </div>
        )}

        {approveUrl ? (
          // The auto-redirect either fired (and we're about to leave the page)
          // or it was blocked. Either way, give the user a guaranteed working
          // tap-target. target="_top" breaks out of any iframe; rel hardens
          // against tabnabbing.
          <a
            href={approveUrl}
            target="_top"
            rel="noopener noreferrer"
            className="w-full py-3 rounded-xl font-mono text-sm tracking-wider flex items-center justify-center gap-2"
            style={{
              background:
                "linear-gradient(135deg, rgb(0,180,240) 0%, rgb(0,220,255) 100%)",
              color: "#001020",
              boxShadow: "0 0 24px rgba(0,180,240,0.4)",
            }}
          >
            Open secure checkout · Pay {price}
          </a>
        ) : (
          <button
            onClick={submit}
            disabled={submitting}
            className="w-full py-3 rounded-xl font-mono text-sm tracking-wider flex items-center justify-center gap-2 disabled:opacity-60"
            style={{
              background:
                "linear-gradient(135deg, rgb(0,180,240) 0%, rgb(0,220,255) 100%)",
              color: "#001020",
              boxShadow: "0 0 24px rgba(0,180,240,0.4)",
            }}
          >
            {submitting ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" /> Opening secure checkout…
              </>
            ) : (
              <>Pay {price} · Card or PayPal</>
            )}
          </button>
        )}
        <p className="text-[10px] text-cyan-400/45 font-mono mt-3 text-center">
          Secure checkout powered by PayPal · Mastercard · Visa · Amex
        </p>
      </motion.div>
    </motion.div>
  );
}
