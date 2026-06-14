import { useEffect } from "react";
import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ClerkProvider, useAuth } from "@clerk/react";
import { publishableKeyFromHost } from "@clerk/shared/keys";
import { dark } from "@clerk/themes";
import { setAuthTokenGetter } from "@workspace/api-client-react";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import Home from "@/pages/home";
import Upgrade from "@/pages/upgrade";
import Settings from "@/pages/settings";
import SignInPage from "@/pages/sign-in";
import SignUpPage from "@/pages/sign-up";
import { InstallPrompt } from "@/components/install-prompt";
import { WelcomeModal } from "@/components/welcome-modal";

// Wires the generated API client up to Clerk so every authenticated request
// it makes (chat history, conversations, image gen, etc.) carries the current
// user's session as `Authorization: Bearer <token>`. Cookies alone aren't
// reliable inside iframes (Replit preview) or when third-party cookies are
// blocked, so the Bearer header is the dependable path. Cleared when no user
// is signed in so calls fall back to anonymous mode (which the server allows
// for public endpoints).
function ClerkApiBridge() {
  const { getToken, isSignedIn, isLoaded } = useAuth();

  useEffect(() => {
    if (!isLoaded) return;
    if (!isSignedIn) {
      setAuthTokenGetter(null);
      return;
    }
    setAuthTokenGetter(async () => {
      try {
        return (await getToken()) ?? null;
      } catch {
        return null;
      }
    });
    return () => {
      setAuthTokenGetter(null);
    };
  }, [getToken, isSignedIn, isLoaded]);

  return null;
}

const queryClient = new QueryClient();

// Resolve the publishable key from the current hostname so the same build
// can serve both the dev workspace and the published .replit.app domain.
// In production, Replit's managed Clerk maps the hostname to the right
// production publishable key automatically; in development this falls
// back to the dev key in VITE_CLERK_PUBLISHABLE_KEY.
const PUBLISHABLE_KEY =
  typeof window !== "undefined"
    ? publishableKeyFromHost(
        window.location.hostname,
        import.meta.env.VITE_CLERK_PUBLISHABLE_KEY,
      )
    : import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;

// In production, Replit injects VITE_CLERK_PROXY_URL pointing at the
// /api/__clerk proxy route on the deployed domain. Passing it to
// ClerkProvider tells the Clerk SDK to talk to the production Clerk
// frontend API through our own domain (which is what makes sign-in
// actually render on the published site).
const CLERK_PROXY_URL = import.meta.env.VITE_CLERK_PROXY_URL as string | undefined;

const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

function Router() {
  return (
    <Switch>
      <Route path="/" component={Home} />
      <Route path="/upgrade" component={Upgrade} />
      <Route path="/settings" component={Settings} />
      <Route path="/sign-in/*?" component={SignInPage} />
      <Route path="/sign-up/*?" component={SignUpPage} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  // Initialize theme from localStorage on first render
  if (typeof document !== "undefined") {
    const saved = localStorage.getItem("avoline-theme");
    if (saved === "light") document.documentElement.classList.remove("dark");
    else document.documentElement.classList.add("dark");
  }

  const inner = (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={basePath}>
          <Router />
        </WouterRouter>
        <Toaster />
        <InstallPrompt />
        <WelcomeModal />
      </TooltipProvider>
    </QueryClientProvider>
  );

  if (!PUBLISHABLE_KEY) {
    return inner;
  }

  const logoUrl = `${import.meta.env.BASE_URL}icon-192.svg`;
  const homeUrl = `${basePath}/`;

  return (
    <ClerkProvider
      publishableKey={PUBLISHABLE_KEY}
      proxyUrl={CLERK_PROXY_URL}
      signInUrl={`${basePath}/sign-in`}
      signUpUrl={`${basePath}/sign-up`}
      appearance={{
        baseTheme: dark,
        variables: {
          colorPrimary: "rgb(0,220,255)",
          colorBackground: "rgba(0,8,20,0.92)",
          colorText: "rgb(220,240,255)",
          colorTextSecondary: "rgba(180,210,235,0.7)",
          colorInputBackground: "rgba(0,20,40,0.6)",
          colorInputText: "rgb(220,240,255)",
          fontFamily: "'Rajdhani', sans-serif",
          borderRadius: "0.75rem",
        },
        layout: {
          logoPlacement: "none",
          showOptionalFields: true,
          helpPageUrl: homeUrl,
          privacyPageUrl: homeUrl,
          termsPageUrl: homeUrl,
        },
        elements: {
          // Hide Clerk's "Secured by Clerk" branding so the experience reads
          // as Avolin end-to-end. The host page provides its own brand mark.
          footer: { display: "none" },
          logoBox: { display: "none" },
          card: {
            background: "rgba(0,8,20,0.92)",
            border: "1px solid rgba(0,220,255,0.18)",
            boxShadow:
              "0 0 40px rgba(0,180,240,0.15), inset 0 0 60px rgba(0,40,80,0.4)",
          },
          headerTitle: {
            fontFamily: "'Orbitron', sans-serif",
            letterSpacing: "0.15em",
            color: "rgb(220,240,255)",
          },
          headerSubtitle: { color: "rgba(180,210,235,0.7)" },
          formButtonPrimary: {
            background:
              "linear-gradient(135deg, rgb(0,180,240) 0%, rgb(0,220,255) 100%)",
            color: "#001020",
            fontWeight: 700,
            letterSpacing: "0.05em",
          },
          socialButtonsBlockButton: {
            borderColor: "rgba(0,220,255,0.25)",
          },
        },
      }}
      localization={{
        signIn: {
          start: {
            title: "Sign in to Avolin",
            subtitle: "Welcome back to your assistant.",
            actionText: "New here?",
            actionLink: "Create an Avolin account",
          },
          password: { title: "Enter your password", subtitle: "to continue to Avolin" },
          emailCode: { title: "Check your email", subtitle: "to continue to Avolin" },
          forgotPasswordAlternativeMethods: { title: "Sign in to Avolin" },
        },
        signUp: {
          start: {
            title: "Create your Avolin account",
            subtitle: "Get your personal AI assistant in seconds.",
            actionText: "Already have an account?",
            actionLink: "Sign in to Avolin",
          },
          emailCode: { title: "Verify your email", subtitle: "to finish setting up Avolin" },
        },
        userButton: { action__signOut: "Sign out of Avolin", action__manageAccount: "Manage Avolin account" },
        userProfile: {
          start: { headerTitle__account: "Avolin account", headerTitle__security: "Avolin security" },
        },
      }}
    >
      <ClerkApiBridge />
      {inner}
    </ClerkProvider>
  );
}

export default App;
