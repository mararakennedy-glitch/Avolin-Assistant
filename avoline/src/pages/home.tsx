import React, { useState, useEffect, useMemo, useCallback } from "react";
import { Send, Mic, Menu, X, MessageSquarePlus, Trash2, Crown, Globe, Code2, BrainCircuit, ImageIcon, BarChart3, Atom, Music, Square, Settings as SettingsIcon, Paperclip, LogIn, FileImage, FileVideo, FileAudio, File as FileIcon, Pause, Play, LogOut, Volume2, Headphones, Download, Sparkles, BadgeCheck } from "lucide-react";
import { Link } from "wouter";
import { useUser, useClerk, useAuth } from "@clerk/react";
import { AuthOptionsModal } from "@/components/auth-options-modal";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Orb } from "@/components/orb";
import { AnswerPanel } from "@/components/answer-panel";
import { useAvolineChat } from "@/hooks/use-avoline-chat";
import { useIsMobile } from "@/hooks/use-mobile";
import { Button } from "@/components/ui/button";
import { useListOpenaiConversations, useDeleteOpenaiConversation, getOpenaiConversation, getListOpenaiConversationsQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import { useLocalConversations } from "@/hooks/use-local-conversations";
import { useTier } from "@/hooks/use-tier";
import {
  deleteLocalConversation,
  isLocalConversationId,
  type LocalConversation,
} from "@/lib/local-conversations";

// ─── Binary code rain (vertical 0s and 1s) — fills the entire background ───
function BinaryRain() {
  const isMobile = useIsMobile();
  const cols = isMobile ? 16 : 38;
  // Generate column data once (stable across renders)
  const columns = useMemo(() =>
    Array.from({ length: cols }).map((_, c) => {
      const len = 18 + Math.floor(Math.random() * 12);
      const chars = Array.from({ length: len }).map(() => Math.random() < 0.5 ? "0" : "1");
      return {
        chars,
        duration: 6 + Math.random() * 8,
        delay: -Math.random() * 12,
        left: (c / cols) * 100,
        opacity: 0.35 + Math.random() * 0.4,
        fontSize: 10 + Math.floor(Math.random() * 4),
      };
    }),
  []);

  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none select-none" style={{ zIndex: 1, contain: "strict" }}>
      {columns.map((col, i) => (
        <motion.div
          key={i}
          className="absolute top-0 font-mono leading-[1.2em] whitespace-pre"
          style={{
            left: `${col.left}%`,
            fontSize: col.fontSize,
            color: "rgba(80,180,255,0.85)",
            textShadow: "0 0 6px rgba(80,180,255,0.6)",
            willChange: "transform",
            transform: "translateZ(0)",
            backfaceVisibility: "hidden",
          }}
          animate={{ y: ["-50%", "120%"] }}
          transition={{ duration: col.duration, repeat: Infinity, delay: col.delay, ease: "linear" }}
        >
          {col.chars.map((ch, r) => (
            <div
              key={r}
              style={{
                opacity: r === col.chars.length - 1
                  ? 1
                  : Math.max(0.05, col.opacity * (1 - r / col.chars.length)),
                color: r === col.chars.length - 1 ? "rgba(220,250,255,1)" : undefined,
                textShadow: r === col.chars.length - 1 ? "0 0 8px rgba(150,220,255,1)" : undefined,
              }}
            >
              {ch}
            </div>
          ))}
        </motion.div>
      ))}
    </div>
  );
}

// ─── Circuit board lines (top and bottom) converging on the orb ───
function CircuitLines() {
  return (
    <svg
      className="absolute inset-0 w-full h-full pointer-events-none"
      style={{ zIndex: 2 }}
      viewBox="0 0 1280 800"
      preserveAspectRatio="xMidYMid slice"
    >
      <defs>
        <filter id="circuitGlow">
          <feGaussianBlur stdDeviation="1.2" result="b" />
          <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
        </filter>
      </defs>
      <g stroke="rgba(100,200,255,0.55)" strokeWidth="1.2" fill="none" filter="url(#circuitGlow)">
        {/* Top circuit lines */}
        <path d="M 540 0 L 540 80 L 580 120 L 580 200" />
        <path d="M 640 0 L 640 100 L 600 140 L 600 220" />
        <path d="M 740 0 L 740 60 L 700 100 L 700 200" />
        <path d="M 460 0 L 460 130 L 510 180 L 510 230" />
        <path d="M 820 0 L 820 90 L 770 140 L 770 220" />
        <path d="M 380 0 L 380 70 L 440 130 L 440 240" />
        <path d="M 900 0 L 900 60 L 840 120 L 840 250" />

        {/* Bottom circuit lines */}
        <path d="M 540 800 L 540 720 L 580 680 L 580 600" />
        <path d="M 640 800 L 640 700 L 600 660 L 600 580" />
        <path d="M 740 800 L 740 740 L 700 700 L 700 600" />
        <path d="M 460 800 L 460 670 L 510 620 L 510 570" />
        <path d="M 820 800 L 820 710 L 770 660 L 770 580" />
        <path d="M 380 800 L 380 730 L 440 670 L 440 560" />
        <path d="M 900 800 L 900 740 L 840 680 L 840 550" />
      </g>

      {/* Bright glowing nodes on circuit lines */}
      <g>
        {[
          [540, 80], [580, 120], [640, 100], [600, 140], [740, 60], [700, 100],
          [460, 130], [510, 180], [820, 90], [770, 140], [380, 70], [440, 130],
          [540, 720], [580, 680], [640, 700], [600, 660], [740, 740], [700, 700],
          [460, 670], [510, 620], [820, 710], [770, 660], [380, 730], [440, 670],
        ].map(([x, y], i) => (
          <g key={i}>
            <circle cx={x} cy={y} r="3.5" fill="rgba(180,240,255,1)">
              <animate attributeName="opacity" values="1;0.3;1" dur={`${1.5 + (i % 5) * 0.3}s`} repeatCount="indefinite" />
            </circle>
            <circle cx={x} cy={y} r="6" fill="rgba(120,220,255,0.4)" />
          </g>
        ))}
      </g>
    </svg>
  );
}

function AvolinHeader() {
  const [tick, setTick] = useState(0);
  const isMobile = useIsMobile();
  useEffect(() => {
    const t = setInterval(() => setTick((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, []);
  const now = new Date();
  const time = now.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false });
  const date = now.toLocaleDateString("en-US", { weekday: "short", day: "2-digit", month: "short", year: "numeric" }).toUpperCase();

  return (
    <div
      className="relative w-full select-none pointer-events-none overflow-hidden"
      style={{
        background: "linear-gradient(180deg, rgba(0,8,24,0.92) 0%, rgba(0,4,16,0.85) 100%)",
        borderTop: "1px solid rgba(80,180,255,0.3)",
        borderBottom: "1px solid rgba(80,180,255,0.25)",
        minHeight: isMobile ? 64 : 80,
        backdropFilter: "blur(2px)",
        paddingTop: "env(safe-area-inset-top, 0)",
      }}
    >
      {/* Horizontal scan lines across the whole panel */}
      <div className="absolute inset-0 pointer-events-none" style={{
        backgroundImage: "repeating-linear-gradient(0deg, transparent, transparent 5px, rgba(80,180,255,0.03) 5px, rgba(80,180,255,0.03) 6px)"
      }} />

      {/* Data bars at the bottom of the panel */}
      <div className="absolute bottom-0 left-0 right-0 flex items-end gap-px px-2 h-1.5 overflow-hidden">
        {Array.from({ length: 60 }).map((_, i) => (
          <div
            key={i}
            className="flex-1"
            style={{
              height: `${30 + Math.sin(i * 0.7) * 40 + Math.sin(i * 1.3 + 1) * 30}%`,
              background: `rgba(80,180,255,${0.15 + Math.abs(Math.sin(i * 0.5)) * 0.2})`,
            }}
          />
        ))}
      </div>

      {/* Left side data bars */}
      <div className="absolute left-4 top-1/2 -translate-y-1/2 flex flex-col gap-0.5">
        {[40, 70, 55, 85, 35].map((w, i) => (
          <div key={i} className="h-px bg-cyan-400/30" style={{ width: w }} />
        ))}
      </div>

      {/* Center content */}
      <div className="flex flex-col items-center justify-center pt-12 pb-2 sm:py-3 px-2 sm:px-4">
        <div className="hidden sm:flex items-center gap-5 mb-1 font-mono text-[9px] tracking-[0.3em]" style={{ color: "rgba(80,180,255,0.45)" }}>
          <span>{time}</span>
          <span className="flex items-center gap-1.5">
            <motion.span
              animate={{ opacity: [1, 0.2, 1] }}
              transition={{ duration: 1.2, repeat: Infinity }}
              className="w-1.5 h-1.5 rounded-full inline-block"
              style={{ background: "rgba(120,200,255,0.8)", boxShadow: "0 0 6px rgba(120,200,255,0.8)" }}
            />
            ONLINE
          </span>
          <span>{date}</span>
        </div>

        <div
          className="font-mono font-bold tracking-[0.35em] sm:tracking-[0.4em] leading-none"
          style={{
            color: "rgba(220,250,248,0.95)",
            textShadow: "0 0 15px rgba(0,220,200,0.6), 0 0 50px rgba(0,180,180,0.25), 0 2px 4px rgba(0,0,0,0.8)",
            fontSize: "clamp(1.4rem, 5.5vw, 2.6rem)",
          }}
        >
          {tick % 11 === 0 ? (
            <motion.span animate={{ opacity: [1, 0.3, 1] }} transition={{ duration: 0.06 }}>AVOLIN</motion.span>
          ) : "AVOLIN"}
        </div>

        <div className="mt-1 font-mono text-[8px] tracking-[0.25em]" style={{ color: "rgba(80,180,255,0.35)" }}>
          BY KENNEDY MARARA
        </div>
      </div>

      {/* Right circular HUD — hidden on mobile to save space */}
      <div className="hidden sm:block absolute right-6 top-1/2 -translate-y-1/2 w-14 h-14">
        <svg viewBox="0 0 56 56" className="w-full h-full">
          <circle cx="28" cy="28" r="24" fill="rgba(0,15,40,0.6)" stroke="rgba(80,180,255,0.3)" strokeWidth="1" />
          <circle cx="28" cy="28" r="16" fill="none" stroke="rgba(80,180,255,0.2)" strokeWidth="0.8" />
          <circle cx="28" cy="28" r="8" fill="none" stroke="rgba(80,180,255,0.25)" strokeWidth="0.8" />
          <circle cx="28" cy="28" r="3" fill="rgba(0,220,200,0.6)" />
          <motion.circle
            cx="28" cy="28" r="24" fill="none" stroke="rgba(0,220,200,0.55)" strokeWidth="1.5"
            strokeDasharray="24 126"
            animate={{ rotate: 360 }}
            transition={{ duration: 3.5, repeat: Infinity, ease: "linear" }}
            style={{ transformOrigin: "28px 28px" }}
          />
          <motion.circle
            cx="28" cy="28" r="16" fill="none" stroke="rgba(80,180,255,0.4)" strokeWidth="1"
            strokeDasharray="10 90"
            animate={{ rotate: -360 }}
            transition={{ duration: 5, repeat: Infinity, ease: "linear" }}
            style={{ transformOrigin: "28px 28px" }}
          />
        </svg>
      </div>
    </div>
  );
}

function SidebarInstallButton({ onClose }: { onClose: () => void }) {
  const [hidden, setHidden] = useState(false);
  useEffect(() => {
    const check = () => {
      try {
        const standalone =
          window.matchMedia("(display-mode: standalone)").matches ||
          // @ts-ignore - iOS Safari
          window.navigator.standalone === true;
        const everInstalled = (() => {
          try { return localStorage.getItem("avolin.installed") === "1"; }
          catch { return false; }
        })();
        if (standalone || everInstalled) setHidden(true);
      } catch { /* no-op */ }
    };
    check();
    const onInstalled = () => setHidden(true);
    window.addEventListener("appinstalled", onInstalled);
    document.addEventListener("visibilitychange", check);
    return () => {
      window.removeEventListener("appinstalled", onInstalled);
      document.removeEventListener("visibilitychange", check);
    };
  }, []);
  if (hidden) return null;
  return (
    <button
      onClick={() => {
        onClose();
        try {
          // @ts-ignore - global trigger registered by InstallPrompt
          if (typeof window.avolinTriggerInstall === "function") window.avolinTriggerInstall();
        } catch { /* no-op */ }
      }}
      className="flex items-center gap-2 w-full px-3 py-2.5 rounded-lg text-sm font-mono border border-cyan-400/30 bg-cyan-400/10 hover:bg-cyan-400/15 text-cyan-200 transition-colors"
    >
      <Download className="w-4 h-4" />
      <span>INSTALL APP</span>
    </button>
  );
}

function HistorySidebar({
  isOpen,
  onClose,
  onSelect,
  onNew,
}: {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (id: string | number) => void;
  onNew: () => void;
}) {
  const { user } = useUser();
  const { features } = useTier();
  // Cloud-sync (core+) users see their server-stored conversations.
  // Free-tier signed-in users and guests see browser-local ones.
  const { data: serverConversations } = useListOpenaiConversations({ query: { queryKey: getListOpenaiConversationsQueryKey(), enabled: !!user && features.cloudSync } });
  const localConversations = useLocalConversations();
  const conversations = (user && features.cloudSync)
    ? (serverConversations ?? []).map((c) => ({ id: c.id as string | number, title: c.title }))
    : localConversations.map((c) => ({ id: c.id as string | number, title: c.title }));

  const deleteMutation = useDeleteOpenaiConversation();
  const queryClient = useQueryClient();

  const handleDelete = async (e: React.MouseEvent, id: string | number) => {
    e.stopPropagation();
    if (typeof id === "string") {
      // Guest conversation — local only.
      deleteLocalConversation(id);
      return;
    }
    await deleteMutation.mutateAsync({ id });
    queryClient.invalidateQueries({ queryKey: ["/api/openai/conversations"] });
  };

  return (
    <>
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/70 backdrop-blur-sm z-40"
            onClick={onClose}
          />
        )}
      </AnimatePresence>
      <motion.div
        initial={false}
        animate={{ x: isOpen ? 0 : "-100%" }}
        transition={{ type: "spring", damping: 30, stiffness: 300 }}
        className="fixed top-0 left-0 bottom-0 w-72 z-50 flex flex-col"
        style={{
          background: "rgba(0,8,16,0.97)",
          borderRight: "1px solid rgba(0,220,255,0.18)",
          boxShadow: "4px 0 40px rgba(0,220,255,0.04)",
        }}
      >
        <div className="flex items-center justify-between p-4 border-b border-cyan-400/12">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-cyan-400 shadow-[0_0_8px_rgba(0,220,255,0.8)]" />
            <h2 className="font-mono text-sm tracking-widest uppercase text-cyan-300">Conversations</h2>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose} className="rounded-lg text-cyan-400/60 hover:text-cyan-300 h-8 w-8">
            <X className="w-4 h-4" />
          </Button>
        </div>

        <div className="p-3 flex flex-col flex-1 overflow-hidden">
          <button
            className="w-full flex items-center gap-2 px-3 py-2.5 rounded-lg mb-3 text-sm font-mono text-cyan-300 border border-cyan-400/20 bg-cyan-400/5 hover:bg-cyan-400/10 transition-colors"
            onClick={() => { onNew(); onClose(); }}
          >
            <MessageSquarePlus className="w-4 h-4" />
            <span>NEW CONVERSATION</span>
          </button>

          <div className="space-y-1 overflow-y-auto flex-1 pr-1" style={{ scrollbarWidth: "thin", scrollbarColor: "rgba(0,220,255,0.15) transparent" }}>
            {!user && conversations.length === 0 && (
              <div className="px-3 py-6 text-center">
                <div className="text-xs text-cyan-300/60 font-mono mb-2">No conversations yet</div>
                <div className="text-[10px] text-cyan-300/40 font-mono leading-relaxed">
                  Your guest chats are saved on this device. Sign in to sync them across devices.
                </div>
              </div>
            )}
            {conversations.map((conv) => (
              <div
                key={String(conv.id)}
                onClick={() => { onSelect(conv.id); onClose(); }}
                className="group flex items-center justify-between px-3 py-2.5 rounded-lg hover:bg-cyan-400/8 cursor-pointer transition-colors border border-transparent hover:border-cyan-400/12"
              >
                <div className="flex-1 truncate text-xs text-cyan-200/65 font-mono">{conv.title}</div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6 rounded opacity-0 group-hover:opacity-100 hover:text-red-400 text-cyan-400/40 transition-all"
                  onClick={(e) => handleDelete(e, conv.id)}
                >
                  <Trash2 className="w-3 h-3" />
                </Button>
              </div>
            ))}
          </div>
        </div>

        <div className="p-3 border-t border-cyan-400/12 space-y-2">
          <SidebarInstallButton onClose={onClose} />
          <Link
            to="/settings"
            onClick={onClose}
            className="flex items-center gap-2 w-full px-3 py-2.5 rounded-lg text-sm font-mono border border-cyan-400/20 bg-cyan-400/5 hover:bg-cyan-400/10 text-cyan-200 transition-colors"
          >
            <SettingsIcon className="w-4 h-4" />
            <span>SETTINGS</span>
          </Link>
          <Link
            to="/upgrade"
            onClick={onClose}
            className="flex items-center gap-2 w-full px-3 py-2.5 rounded-lg text-sm font-mono border border-amber-400/25 bg-amber-400/5 hover:bg-amber-400/10 text-amber-300 transition-colors"
          >
            <Crown className="w-4 h-4" />
            <span>AVOLIN PLANS</span>
          </Link>
        </div>
      </motion.div>
    </>
  );
}

type Attachment = { name: string; kind: "image" | "video" | "audio" | "file"; size: number; dataUrl?: string };

// Header sign-in button — opens our rich AuthOptionsModal (Google + Apple +
// email + create account) instead of Clerk's hosted modal. Modals from Clerk
// are unreliable inside iframes / mobile PWAs, so we own the UI.
function HeaderSignInButton() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="flex items-center justify-center gap-1.5 h-10 px-3 sm:h-auto sm:py-1.5 rounded-lg border border-cyan-400/50 bg-cyan-400/20 active:bg-cyan-400/35 hover:bg-cyan-400/30 text-cyan-100 transition-colors font-mono text-xs tracking-wider backdrop-blur-sm shadow-[0_0_18px_rgba(0,180,255,0.35)]"
        aria-label="Sign in"
      >
        <LogIn className="w-4 h-4 sm:w-3.5 sm:h-3.5" />
        <span>SIGN IN</span>
      </button>
      <AuthOptionsModal open={open} onClose={() => setOpen(false)} />
    </>
  );
}

/**
 * Header slot that renders the SIGN IN button OR the user menu, depending
 * on auth state. Critically, this is *defensive*: if Clerk hasn't finished
 * loading (or the Clerk frontend API is unreachable on the published
 * domain), we still render the SIGN IN button as the default. Without
 * this, Clerk's <Show> component renders nothing during the loading state
 * and users on the published .replit.app site report "the sign in button
 * is missing" — even though clicking it would still work fine.
 */
function HeaderAuthSlot() {
  const { isLoaded, isSignedIn } = useUser();
  // Show user menu only once Clerk has positively confirmed the user is
  // signed in. In every other case (loading, signed-out, Clerk failed to
  // load) we surface the SIGN IN button so a path forward is always
  // visible.
  if (isLoaded && isSignedIn) return <AvolineUserMenu />;
  return <HeaderSignInButton />;
}

// Custom user menu — replaces Clerk's <UserButton /> so we never expose
// Clerk-branded "Manage account" links that redirect to the external Clerk-hosted
// account portal. All actions stay inside the Avolin app.
function AvolineUserMenu() {
  const { user } = useUser();
  const { signOut } = useClerk();
  const [open, setOpen] = useState(false);
  const [signOutError, setSignOutError] = useState<string | null>(null);

  if (!user) return null;

  const initial =
    (user.firstName?.[0] || user.username?.[0] || user.primaryEmailAddress?.emailAddress?.[0] || "A").toUpperCase();
  const avatarUrl = user.imageUrl;
  const displayName = user.fullName || user.username || user.primaryEmailAddress?.emailAddress || "Avolin User";
  const email = user.primaryEmailAddress?.emailAddress;

  const handleSignOut = async () => {
    setSignOutError(null);
    try {
      await signOut();
      setOpen(false);
      // Only on success: hard navigation to fully reset React + Clerk state.
      window.location.href = import.meta.env.BASE_URL || "/";
    } catch (err) {
      console.error("[avolin] sign-out failed", err);
      setSignOutError("Could not sign out. Please try again.");
    }
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          className="w-9 h-9 rounded-full overflow-hidden ring-1 ring-cyan-400/40 hover:ring-cyan-300 active:ring-cyan-200 transition-all bg-cyan-400/10 flex items-center justify-center text-cyan-100 font-mono text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300"
          aria-label="Account menu"
          aria-haspopup="menu"
          aria-expanded={open}
        >
          {avatarUrl ? (
            <img src={avatarUrl} alt="" className="w-full h-full object-cover" />
          ) : (
            <span aria-hidden="true">{initial}</span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        sideOffset={8}
        className="w-64 p-0 border border-cyan-400/25 bg-[rgba(0,8,16,0.97)] backdrop-blur-md text-cyan-100"
      >
        <div className="px-4 py-3 border-b border-cyan-400/15">
          <div
            className="font-mono text-sm tracking-wide text-cyan-100 truncate"
            title={displayName}
          >
            {displayName}
          </div>
          {email && email !== displayName && (
            <div className="font-mono text-[10px] tracking-wider text-cyan-300/55 truncate mt-0.5" title={email}>
              {email}
            </div>
          )}
        </div>
        <div className="py-1">
          <Link
            to="/settings"
            onClick={() => setOpen(false)}
            className="flex items-center gap-2.5 w-full px-4 py-2.5 text-left font-mono text-xs tracking-widest uppercase text-cyan-200/80 hover:bg-cyan-400/10 hover:text-cyan-100 transition-colors"
          >
            <SettingsIcon className="w-3.5 h-3.5" />
            <span>Settings</span>
          </Link>
          <button
            onClick={handleSignOut}
            className="flex items-center gap-2.5 w-full px-4 py-2.5 text-left font-mono text-xs tracking-widest uppercase text-cyan-200/80 hover:bg-red-400/10 hover:text-red-300 transition-colors"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>Sign out</span>
          </button>
          {signOutError && (
            <div
              role="alert"
              className="px-4 py-2 font-mono text-[10px] tracking-wide text-red-300/90 border-t border-red-400/15"
            >
              {signOutError}
            </div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

export default function Home() {
  const { messages, sendMessage, isThinking, isSearching, isListening, toggleVoice, isRecording, isTranscribing, conversationId, loadConversation, startNewConversation, stopMusic, isMusicPlaying, isSpeaking, isSpeechPaused, pauseSpeaking, resumeSpeaking, speakText } = useAvolineChat();
  const { user } = useUser();
  const { openSignIn } = useClerk();
  const { features, refresh: refreshTier } = useTier();
  const { getToken } = useAuth();
  // Set the moment the user comes back from a successful PayPal checkout —
  // drives the full-screen celebration overlay defined below.
  const [celebrateTier, setCelebrateTier] = useState<"core" | "elite" | null>(null);
  const [input, setInput] = useState("");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [newChatMode, setNewChatMode] = useState(false);
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  // Local conversations are still consulted by handleSelectConversation when
  // the user resumes a chat from the sidebar.
  const localRecent = useLocalConversations();
  // Tracks which conversation is currently loading so we can disable other
  // resume actions and prevent the "tap-multiple-quickly = last response wins" race.
  const [loadingConvId, setLoadingConvId] = useState<string | number | null>(null);

  // ─── Post-payment celebration ──────────────────────────────────────────
  // PayPal sends the user back to "/?payment=success&ref=XXX&tier=core|elite"
  // after a successful checkout. We poll the server to confirm the order
  // captured, refresh the user's tier, then pop a celebration overlay. URL
  // params are wiped immediately so a refresh doesn't re-trigger the toast.
  const confirmPayment = useCallback(
    async (reference: string, urlTier: "core" | "elite") => {
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
              await refreshTier();
              // Trust the server's tier (defence-in-depth — a tampered URL
              // could otherwise show "ELITE" copy when only Core was paid).
              // Fall back to the URL value only if the server somehow omitted
              // it, which shouldn't happen for paid rows.
              const serverTier =
                data.tier === "core" || data.tier === "elite"
                  ? data.tier
                  : urlTier;
              setCelebrateTier(serverTier);
              return;
            }
            if (data.status === "cancelled" || data.status === "failed") {
              return;
            }
          }
        } catch {
          /* keep polling */
        }
        await new Promise((r) => setTimeout(r, 3000));
      }
    },
    [getToken, refreshTier],
  );

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("payment") !== "success") return;
    const ref = params.get("ref");
    const tier = params.get("tier");
    if (!ref || (tier !== "core" && tier !== "elite")) return;
    // Strip the params first so a refresh doesn't replay the celebration.
    params.delete("payment");
    params.delete("ref");
    params.delete("tier");
    const qs = params.toString();
    window.history.replaceState(
      {},
      "",
      `${window.location.pathname}${qs ? `?${qs}` : ""}`,
    );
    void confirmPayment(ref, tier);
  }, [confirmPayment]);

  const classifyFile = (f: File): Attachment["kind"] => {
    if (f.type.startsWith("image/")) return "image";
    if (f.type.startsWith("video/")) return "video";
    if (f.type.startsWith("audio/")) return "audio";
    return "file";
  };

  const handleFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const next: Attachment[] = [];
    for (const f of Array.from(files)) {
      // Cap at 10MB per file to avoid blowing memory
      if (f.size > 10 * 1024 * 1024) {
        window.alert(`${f.name} is larger than 10MB and was skipped.`);
        continue;
      }
      const kind = classifyFile(f);
      let dataUrl: string | undefined;
      if (kind === "image") {
        dataUrl = await new Promise<string>((resolve) => {
          const r = new FileReader();
          r.onload = () => resolve(r.result as string);
          r.readAsDataURL(f);
        });
      }
      next.push({ name: f.name, kind, size: f.size, dataUrl });
    }
    setAttachments((prev) => [...prev, ...next]);
  };

  const removeAttachment = (idx: number) => {
    setAttachments((prev) => prev.filter((_, i) => i !== idx));
  };

  // sendMessage in useAvolineChat already opens the Clerk sign-in modal for
  // anonymous users, so callers don't need to re-check. These thin wrappers
  // exist only to keep the call sites readable.
  const sendMessageGated = (content: string) => {
    sendMessage(content);
  };

  const handleSend = (e: React.FormEvent) => {
    e.preventDefault();
    if ((!input.trim() && attachments.length === 0) || isThinking) return;
    let composed = input;
    if (attachments.length > 0) {
      const lines = attachments.map((a) => `📎 ${a.kind.toUpperCase()}: ${a.name} (${Math.round(a.size / 1024)} KB)`);
      composed = `${input}${input ? "\n\n" : ""}[Attachments]\n${lines.join("\n")}`;
    }
    sendMessage(composed);
    setInput("");
    setAttachments([]);
    setNewChatMode(false);
  };

  const handleNewChat = () => {
    startNewConversation();
    setNewChatMode(true);
  };

  const orbState = isRecording ? "listening" : isThinking ? "thinking" : "idle";
  const hasMessages = messages.length > 0;

  const handleSelectConversation = async (id: string | number) => {
    // Guard: if a load is already in flight (or the same chip was tapped twice
    // in quick succession) ignore extra taps so we never end up applying a
    // stale fetch result on top of a newer one.
    if (loadingConvId !== null) return;
    setLoadingConvId(id);
    try {
      if (isLocalConversationId(id)) {
        // Guest conversation — load straight from localStorage, no fetch.
        const conv = (localRecent.find((c) => c.id === id)) as LocalConversation | undefined;
        if (conv) {
          loadConversation(
            conv.id,
            conv.messages.map((m) => ({
              id: m.id,
              role: m.role,
              content: m.content,
              ...(m.imageUrl ? { imageUrl: m.imageUrl } : {}),
              ...(m.imagePrompt ? { imagePrompt: m.imagePrompt } : {}),
              ...(m.music
                ? {
                    music: {
                      mood: m.music.mood,
                      playing: false,
                      ...(m.music.prompt ? { prompt: m.music.prompt } : {}),
                      ...(typeof m.music.seed === "number" ? { seed: m.music.seed } : {}),
                      ...(typeof m.music.durationSec === "number"
                        ? { durationSec: m.music.durationSec }
                        : {}),
                    },
                  }
                : {}),
            })),
          );
          setNewChatMode(false);
          setSidebarOpen(false);
        }
        return;
      }
      // Server conversation — go through the generated API client so the
       // Clerk bearer token is auto-attached (via ClerkApiBridge in App.tsx).
       // Using raw fetch() here would 401 for signed-in users because the
       // /api/openai/conversations/:id endpoint requires auth.
      const numericId = typeof id === "number" ? id : Number(id);
      if (!Number.isFinite(numericId)) {
        throw new Error(`Invalid conversation id: ${id}`);
      }
      const data = await getOpenaiConversation(numericId);
      const msgList = Array.isArray((data as any)?.messages)
        ? (data as any).messages
        : [];
      loadConversation(
        id,
        msgList.map((m: any) => ({
          id: String(m.id),
          role: m.role,
          content: m.content,
        })),
      );
      setNewChatMode(false);
      // Close the sidebar so the user immediately sees the resumed thread.
      setSidebarOpen(false);
    } catch (err) {
      console.error("[avolin] failed to resume conversation", id, err);
    } finally {
      setLoadingConvId(null);
    }
  };

  const micLabel = isTranscribing ? "PROCESSING..." : isRecording ? "LISTENING..." : "VOICE";

  return (
    <div
      className="relative min-h-[100dvh] w-full overflow-hidden font-sans dark text-foreground"
      style={{ background: "#000208" }}
    >
      <HistorySidebar
        isOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        onSelect={handleSelectConversation}
        onNew={startNewConversation}
      />

      {/* ─── Binary code rain background ─── */}
      <BinaryRain />

      {/* ─── Circuit board lines connecting top/bottom to the orb ─── */}
      <CircuitLines />

      {/* Center radial blue glow behind the orb */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background: "radial-gradient(ellipse 50% 55% at 50% 48%, rgba(20,80,180,0.35) 0%, rgba(0,40,120,0.15) 30%, transparent 60%)",
          zIndex: 2,
        }}
      />

      {/* Scanlines */}
      <div
        className="absolute inset-0 pointer-events-none opacity-[0.04]"
        style={{
          backgroundImage: "repeating-linear-gradient(0deg, transparent, transparent 3px, rgba(80,180,255,0.5) 3px, rgba(80,180,255,0.5) 4px)",
          zIndex: 3,
        }}
      />

      {/* Sidebar toggle — overlaps header */}
      <button
        onClick={() => setSidebarOpen(true)}
        className="absolute top-[14px] sm:top-[22px] left-2 sm:left-4 z-30 w-10 h-10 sm:w-9 sm:h-9 flex items-center justify-center rounded-lg border border-cyan-500/25 bg-black/60 active:bg-cyan-400/15 hover:bg-cyan-400/10 text-cyan-400/70 hover:text-cyan-300 transition-colors backdrop-blur-sm"
        aria-label="Open menu"
      >
        <Menu className="w-4 h-4" />
      </button>

      {/* Top-right control cluster */}
      <div className="absolute top-[14px] sm:top-[22px] right-2 sm:right-4 z-30 flex items-center gap-1.5 sm:gap-2">
        <button
          onClick={handleNewChat}
          className="flex items-center justify-center gap-1.5 w-10 h-10 sm:w-auto sm:h-auto sm:px-3 sm:py-1.5 rounded-lg border border-cyan-400/30 bg-black/60 active:bg-cyan-400/15 hover:bg-cyan-400/10 text-cyan-300/80 hover:text-cyan-200 transition-colors font-mono text-xs tracking-wider backdrop-blur-sm"
          aria-label="New chat"
          title="New chat"
        >
          <MessageSquarePlus className="w-4 h-4 sm:w-3.5 sm:h-3.5" />
          <span className="hidden sm:inline">NEW CHAT</span>
        </button>
        <Link
          to="/upgrade"
          className="flex items-center justify-center gap-1.5 w-10 h-10 sm:w-auto sm:h-auto sm:px-3 sm:py-1.5 rounded-lg border border-amber-400/25 bg-black/60 active:bg-amber-400/15 hover:bg-amber-400/10 text-amber-300/70 hover:text-amber-300 transition-colors font-mono text-xs tracking-wider backdrop-blur-sm"
          aria-label="Plans"
        >
          <Crown className="w-4 h-4 sm:w-3.5 sm:h-3.5" />
          <span className="hidden sm:inline">PLAN</span>
        </Link>
        <Link
          to="/settings"
          className="hidden sm:flex w-9 h-9 items-center justify-center rounded-lg border border-cyan-500/25 bg-black/60 hover:bg-cyan-400/10 text-cyan-400/70 hover:text-cyan-300 transition-colors backdrop-blur-sm"
          aria-label="Settings"
        >
          <SettingsIcon className="w-4 h-4" />
        </Link>
        <HeaderAuthSlot />
      </div>

      {/* Main layout */}
      <div className="relative z-10 h-[100dvh] flex flex-col items-center">

        {/* AVOLIN Header — always visible at top */}
        <div className="w-full">
          <AvolinHeader />
        </div>

        {/* Center area: orb + prompt (shrinks into top when messages appear) */}
        <AnimatePresence>
          {!hasMessages ? (
            <motion.div
              key="idle"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.85 }}
              transition={{ duration: 0.5 }}
              className="flex-1 flex flex-col items-center justify-center"
              style={{ marginTop: -20 }}
            >
              {newChatMode ? (
                <>
                  <div className="scale-75 origin-center -mt-6">
                    <Orb state={orbState} />
                  </div>
                  <motion.h2
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.3 }}
                    className="text-2xl sm:text-3xl text-cyan-50/95 mt-2 mb-1 text-center"
                    style={{
                      fontFamily: "'Rajdhani', sans-serif",
                      fontWeight: 500,
                      letterSpacing: "0.02em",
                      textShadow: "0 0 20px rgba(0,180,255,0.25)",
                    }}
                  >
                    What are you working on?
                  </motion.h2>
                  <motion.p
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.45 }}
                    className="font-mono text-[10px] tracking-[0.4em] uppercase mb-4"
                    style={{ color: "rgba(80,180,255,0.35)" }}
                  >
                    Ask · Create · Generate
                  </motion.p>
                </>
              ) : (
                <>
                  <Orb state={orbState} />
                  <motion.p
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.4 }}
                    className="font-mono text-xs tracking-[0.3em] uppercase mt-0"
                    style={{ color: "rgba(80,180,255,0.35)" }}
                  >
                    How can I assist you?
                  </motion.p>
                </>
              )}
            </motion.div>
          ) : (
            <motion.div
              key="active"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="flex-1 w-full flex flex-col overflow-hidden"
            >
              {/* Mini orb strip at top when chatting — orb centered */}
              <div className="relative flex items-center justify-center py-2">
                <motion.div
                  animate={{ scale: orbState === "thinking" ? [1, 1.1, 1] : 1 }}
                  transition={{ duration: 0.6, repeat: orbState === "thinking" ? Infinity : 0 }}
                >
                  <div
                    className="w-8 h-8 rounded-full border border-cyan-400/40"
                    style={{
                      background: "radial-gradient(circle, rgba(0,220,255,0.4) 0%, rgba(0,80,120,0.6) 60%, rgba(0,10,20,0.9) 100%)",
                      boxShadow: "0 0 16px rgba(0,220,255,0.35)",
                    }}
                  />
                </motion.div>
              </div>
              <AnswerPanel
                messages={messages}
                isVisible={hasMessages}
                isSearching={isSearching}
                isSpeaking={isSpeaking}
                onRead={() => {
                  const assistantText = messages
                    .filter((m) => m.role === "assistant" && m.content.trim().length > 0)
                    .map((m) => m.content.trim())
                    .join("\n\n");
                  if (assistantText) speakText(assistantText);
                }}
                onExit={handleNewChat}
              />
              <EliteUpgradeNudge
                assistantReplies={
                  messages.filter(
                    (m) => m.role === "assistant" && !m.isStreaming && m.content.trim().length > 0,
                  ).length
                }
              />
            </motion.div>
          )}
        </AnimatePresence>

        {/* Bottom input area */}
        <div
          className="w-full max-w-2xl px-3 sm:px-4 flex flex-col items-center gap-2 sm:gap-3"
          style={{ paddingBottom: "max(1rem, env(safe-area-inset-bottom, 1rem))" }}
        >
          {/* Gemini-style suggested prompts — only on default empty state */}
          {!hasMessages && !newChatMode && (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 }}
              className="w-full mb-2"
            >
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {[
                  { Icon: Globe,        label: "World news",         prompt: "What's the latest news happening in the world today?",    color: "rgba(120,200,255," },
                  { Icon: Code2,        label: "Write code",          prompt: "Help me write a Python script that",                      color: "rgba(120,255,200," },
                  { Icon: BrainCircuit, label: "Deep analysis",       prompt: "Give me a deep analysis of",                              color: "rgba(180,140,255," },
                  { Icon: ImageIcon,    label: "Generate image",      prompt: "Create an image of a futuristic city at night with neon lights", color: "rgba(255,180,120," },
                  { Icon: Music,        label: "Generate music",      prompt: "Generate a calm ambient song",                            color: "rgba(255,120,200," },
                  { Icon: Atom,         label: "Explain science",     prompt: "Explain quantum computing in simple terms",               color: "rgba(120,255,255," },
                ].map(({ Icon, label, prompt, color }) => (
                  <button
                    key={label}
                    onClick={() => { sendMessageGated(prompt); }}
                    className="group relative flex items-start gap-2.5 px-3 py-2.5 rounded-xl text-left border transition-all overflow-hidden"
                    style={{
                      borderColor: `${color}0.18)`,
                      background: `linear-gradient(135deg, ${color}0.06) 0%, rgba(0,8,20,0.5) 100%)`,
                    }}
                  >
                    {/* Hover glow */}
                    <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none" style={{ background: `radial-gradient(circle at 0% 0%, ${color}0.15) 0%, transparent 60%)` }} />
                    <div
                      className="relative flex items-center justify-center w-8 h-8 rounded-lg flex-shrink-0"
                      style={{
                        background: `${color}0.12)`,
                        border: `1px solid ${color}0.3)`,
                        boxShadow: `0 0 10px ${color}0.15)`,
                      }}
                    >
                      <Icon className="w-4 h-4" style={{ color: `${color}1)` }} />
                    </div>
                    <div className="relative flex-1 min-w-0 pt-0.5">
                      <div className="text-xs font-semibold tracking-wide group-hover:text-white transition-colors leading-snug" style={{ color: `${color}0.95)`, fontFamily: "'Rajdhani', sans-serif" }}>
                        {label}
                      </div>
                      <div className="text-[10px] mt-0.5 truncate font-mono" style={{ color: `${color}0.45)` }}>
                        {prompt.slice(0, 32)}...
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            </motion.div>
          )}

          {/* Floating Pause/Resume voice indicator — visible while assistant is reading aloud */}
          <AnimatePresence>
            {isSpeaking && (
              <motion.button
                initial={{ opacity: 0, y: 10, scale: 0.9 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 10, scale: 0.9 }}
                onClick={() => (isSpeechPaused ? resumeSpeaking() : pauseSpeaking())}
                aria-label={isSpeechPaused ? "Resume voice" : "Pause voice"}
                className="self-center flex items-center gap-2 px-4 py-2 rounded-full font-mono text-xs tracking-widest"
                style={{
                  background: isSpeechPaused
                    ? "linear-gradient(135deg, rgba(120,200,255,0.18), rgba(80,140,255,0.14))"
                    : "linear-gradient(135deg, rgba(0,220,255,0.18), rgba(80,180,255,0.14))",
                  border: `1px solid ${isSpeechPaused ? "rgba(120,200,255,0.5)" : "rgba(0,220,255,0.5)"}`,
                  color: isSpeechPaused ? "rgba(180,220,255,0.95)" : "rgba(180,240,255,0.95)",
                  boxShadow: `0 0 20px ${isSpeechPaused ? "rgba(120,200,255,0.3)" : "rgba(0,220,255,0.3)"}`,
                }}
              >
                {!isSpeechPaused && (
                  <motion.span
                    animate={{ scale: [1, 1.4, 1], opacity: [1, 0.4, 1] }}
                    transition={{ duration: 1, repeat: Infinity }}
                    className="w-2 h-2 rounded-full"
                    style={{ background: "rgba(0,220,255,1)", boxShadow: "0 0 8px rgba(0,220,255,1)" }}
                  />
                )}
                <Volume2 className="w-3.5 h-3.5" />
                <span>{isSpeechPaused ? "VOICE PAUSED" : "READING"}</span>
                {isSpeechPaused ? <Play className="w-3 h-3 ml-1" fill="currentColor" /> : <Pause className="w-3 h-3 ml-1" fill="currentColor" />}
                <span>{isSpeechPaused ? "RESUME" : "PAUSE"}</span>
              </motion.button>
            )}
          </AnimatePresence>

          {/* Floating Stop Music indicator */}
          <AnimatePresence>
            {isMusicPlaying && (
              <motion.button
                initial={{ opacity: 0, y: 10, scale: 0.9 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 10, scale: 0.9 }}
                onClick={stopMusic}
                className="self-center flex items-center gap-2 px-4 py-2 rounded-full font-mono text-xs tracking-widest"
                style={{
                  background: "linear-gradient(135deg, rgba(255,80,160,0.18), rgba(140,80,255,0.14))",
                  border: "1px solid rgba(255,120,200,0.45)",
                  color: "rgba(255,180,220,0.95)",
                  boxShadow: "0 0 20px rgba(255,100,180,0.3)",
                }}
              >
                <motion.span
                  animate={{ scale: [1, 1.4, 1], opacity: [1, 0.4, 1] }}
                  transition={{ duration: 1, repeat: Infinity }}
                  className="w-2 h-2 rounded-full"
                  style={{ background: "rgba(255,120,200,1)", boxShadow: "0 0 8px rgba(255,120,200,1)" }}
                />
                <Music className="w-3.5 h-3.5" />
                <span>MUSIC PLAYING</span>
                <Square className="w-3 h-3 ml-1" fill="currentColor" />
                <span>STOP</span>
              </motion.button>
            )}
          </AnimatePresence>

          {/* Attachment chip strip */}
          <AnimatePresence>
            {attachments.length > 0 && (
              <motion.div
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 6 }}
                className="w-full flex flex-wrap gap-2"
              >
                {attachments.map((a, i) => {
                  const Icon =
                    a.kind === "image" ? FileImage :
                    a.kind === "video" ? FileVideo :
                    a.kind === "audio" ? FileAudio :
                    FileIcon;
                  return (
                    <div
                      key={i}
                      className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-cyan-400/10 border border-cyan-400/30 text-xs font-mono text-cyan-200"
                    >
                      {a.dataUrl ? (
                        <img src={a.dataUrl} alt={a.name} className="w-6 h-6 object-cover rounded" />
                      ) : (
                        <Icon className="w-4 h-4 text-cyan-400/80" />
                      )}
                      <span className="max-w-[140px] truncate">{a.name}</span>
                      <button
                        type="button"
                        onClick={() => removeAttachment(i)}
                        className="text-cyan-400/60 hover:text-red-400 transition-colors"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  );
                })}
              </motion.div>
            )}
          </AnimatePresence>

          {/* Input bar */}
          <form onSubmit={handleSend} className="w-full">
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept="image/*,video/*,audio/*,.pdf,.txt,.doc,.docx,.csv,.json"
              className="hidden"
              onChange={(e) => { handleFiles(e.target.files); e.target.value = ""; }}
            />
            <div
              className={`relative flex items-center px-2 py-1.5 gap-1.5 ${newChatMode && !hasMessages ? "rounded-full" : "rounded-xl"}`}
              style={{
                background: "rgba(0,12,22,0.9)",
                border: `1px solid ${isRecording ? "rgba(0,220,255,0.55)" : "rgba(0,220,255,0.2)"}`,
                boxShadow: isRecording
                  ? "0 0 0 2px rgba(0,220,255,0.2), 0 0 30px rgba(0,220,255,0.12)"
                  : newChatMode && !hasMessages
                  ? "0 0 30px rgba(0,180,255,0.12), inset 0 0 20px rgba(0,140,220,0.05)"
                  : "0 0 20px rgba(0,220,255,0.04)",
              }}
            >
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={isThinking}
                className="flex items-center justify-center w-9 h-9 rounded-lg text-cyan-400/55 hover:text-cyan-300 hover:bg-cyan-400/10 transition-all border border-transparent hover:border-cyan-400/20"
                aria-label="Attach files"
                title="Attach images, videos, audio, or files"
              >
                <Paperclip className="w-4 h-4" />
              </button>

              <button
                type="button"
                onClick={toggleVoice}
                disabled={isThinking}
                className={`flex items-center gap-1.5 px-3 py-2 rounded-lg font-mono text-xs tracking-widest transition-all ${
                  isRecording
                    ? "bg-cyan-400/20 text-cyan-300 border border-cyan-400/50 shadow-[0_0_12px_rgba(0,220,255,0.3)]"
                    : isTranscribing
                    ? "bg-amber-400/10 text-amber-300 border border-amber-400/30"
                    : "text-cyan-400/45 hover:text-cyan-300 border border-transparent hover:border-cyan-400/18"
                }`}
              >
                <Mic className={`w-4 h-4 ${isRecording ? "animate-pulse" : ""}`} />
                <span className="hidden sm:inline">{micLabel}</span>
              </button>

              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder={isRecording ? "Listening..." : isTranscribing ? "Processing voice..." : newChatMode && !hasMessages ? "Ask anything" : "Message Avolin..."}
                className="flex-1 bg-transparent border-none outline-none text-sm text-cyan-50 placeholder:text-cyan-400/28 focus:ring-0 py-2 px-2"
                disabled={isRecording || isThinking || isTranscribing}
              />

              <button
                type="submit"
                disabled={!input.trim() || isThinking || isRecording || isTranscribing}
                className="flex items-center justify-center w-9 h-9 rounded-lg transition-all disabled:opacity-25"
                style={{
                  background: input.trim() ? "rgba(0,210,255,0.9)" : "rgba(0,210,255,0.08)",
                  color: input.trim() ? "#010a0f" : "rgba(0,210,255,0.35)",
                  boxShadow: input.trim() ? "0 0 18px rgba(0,210,255,0.4)" : "none",
                }}
              >
                <Send className="w-4 h-4 ml-0.5" />
              </button>
            </div>
          </form>
        </div>
      </div>

      <UpgradeCelebration
        tier={celebrateTier}
        onClose={() => setCelebrateTier(null)}
      />
    </div>
  );
}

// ─── Post-payment celebration overlay ─────────────────────────────────────
// Shown the first time the user lands on "/" with ?payment=success.
// Big, on-brand, can't-miss-it moment that says: thanks, you're upgraded,
// here's what unlocked. Auto-dismisses after a few seconds; tap-anywhere or
// the "Start using Avolin" button also dismisses.
function UpgradeCelebration({
  tier,
  onClose,
}: {
  tier: "core" | "elite" | null;
  onClose: () => void;
}) {
  // Auto-dismiss after 12s so the overlay doesn't trap people who walked
  // away from the device. Cleared if the user dismisses manually first.
  useEffect(() => {
    if (!tier) return;
    const t = setTimeout(onClose, 12_000);
    return () => clearTimeout(t);
  }, [tier, onClose]);

  const isElite = tier === "elite";
  const accent = isElite ? "rgba(255,180,80," : "rgba(0,220,255,";
  const tierLabel = isElite ? "ELITE" : "CORE";
  const tierLine = isElite
    ? "Production-grade Avolin is now yours — for the next 365 days."
    : "Full Avolin is now unlocked — for the next 30 days.";

  return (
    <AnimatePresence>
      {tier && (
        <motion.div
          key="celebrate"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.3 }}
          className="fixed inset-0 z-[100] flex items-center justify-center p-6 cursor-pointer"
          style={{
            background:
              "radial-gradient(ellipse at center, rgba(0,16,40,0.85) 0%, rgba(0,2,8,0.96) 70%)",
            backdropFilter: "blur(8px)",
            paddingTop: "max(env(safe-area-inset-top, 0), 24px)",
            paddingBottom: "max(env(safe-area-inset-bottom, 0), 24px)",
          }}
          onClick={onClose}
          role="dialog"
          aria-label={`Welcome to Avolin ${tierLabel}`}
        >
          <motion.div
            initial={{ scale: 0.85, y: 20 }}
            animate={{ scale: 1, y: 0 }}
            exit={{ scale: 0.92, y: 10 }}
            transition={{ type: "spring", stiffness: 280, damping: 24 }}
            className="relative w-full max-w-md rounded-3xl p-8 text-center"
            style={{
              background:
                "linear-gradient(160deg, rgba(0,30,60,0.9) 0%, rgba(0,8,20,0.95) 100%)",
              border: `1px solid ${accent}0.5)`,
              boxShadow: `0 0 80px ${accent}0.35), 0 0 30px ${accent}0.25) inset`,
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Animated rings behind the badge */}
            <div className="absolute inset-0 pointer-events-none rounded-3xl overflow-hidden">
              {[0, 1, 2].map((i) => (
                <motion.div
                  key={i}
                  className="absolute left-1/2 top-[88px] -translate-x-1/2 -translate-y-1/2 rounded-full border"
                  style={{ borderColor: `${accent}0.4)`, width: 140, height: 140 }}
                  animate={{
                    scale: [1, 2.2, 2.2],
                    opacity: [0.6, 0, 0],
                  }}
                  transition={{
                    duration: 2.4,
                    repeat: Infinity,
                    delay: i * 0.8,
                    ease: "easeOut",
                  }}
                />
              ))}
            </div>

            <motion.div
              className="relative mx-auto mb-5 w-[88px] h-[88px] rounded-full flex items-center justify-center"
              style={{
                background: `radial-gradient(circle at 35% 30%, ${accent}1) 0%, ${accent}0.3) 60%, transparent 80%)`,
                boxShadow: `0 0 40px ${accent}0.7)`,
              }}
              animate={{ rotate: [0, 6, -6, 0] }}
              transition={{ duration: 1.2, repeat: 1 }}
            >
              {isElite ? (
                <Crown
                  className="w-10 h-10"
                  style={{ color: "#0a0510" }}
                  strokeWidth={2.5}
                />
              ) : (
                <Sparkles
                  className="w-10 h-10"
                  style={{ color: "#020a14" }}
                  strokeWidth={2.5}
                />
              )}
            </motion.div>

            <div
              className="text-[10px] font-mono tracking-[0.4em] mb-2"
              style={{ color: `${accent}0.7)` }}
            >
              PAYMENT CONFIRMED
            </div>
            <h2
              className="text-3xl font-bold tracking-[0.25em] mb-3"
              style={{
                color: `${accent}0.95)`,
                fontFamily: "'Orbitron', sans-serif",
                textShadow: `0 0 20px ${accent}0.5)`,
              }}
            >
              WELCOME TO
              <br />
              AVOLIN {tierLabel}
            </h2>
            <p className="text-cyan-100/80 text-sm font-mono leading-relaxed mb-6">
              {tierLine}
            </p>

            <div className="flex items-center justify-center gap-2 mb-6 text-emerald-300 text-xs font-mono">
              <BadgeCheck className="w-4 h-4" />
              Your account has been upgraded
            </div>

            <button
              onClick={onClose}
              className="w-full py-3 rounded-xl font-mono text-sm tracking-widest transition-transform hover:scale-[1.02] active:scale-[0.98]"
              style={{
                background: `${accent}0.95)`,
                color: isElite ? "#0a0510" : "#020a14",
                boxShadow: `0 0 24px ${accent}0.5)`,
              }}
            >
              START USING AVOLIN
            </button>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/**
 * Elite upgrade nudge shown inside the chat view for users who are NOT
 * already on Elite. Designed to be encouraging without being annoying:
 *   • Only appears once the assistant has actually given the user a few
 *     finished replies (proves the product is working before asking
 *     for money — much higher conversion than upfront paywalls).
 *   • Dismissible per session (sessionStorage). Once you tap "Not now"
 *     it stays hidden until you open Avolin in a new tab.
 *   • Respects current tier — basic users see "Go Core or Elite",
 *     core users see a softer "Go Elite for the full experience" pitch.
 *   • Mobile-first: a single tap-able card with a clear CTA. Works on
 *     Android Chrome and iPhone Safari (and PWAs installed from either).
 */
function EliteUpgradeNudge({ assistantReplies }: { assistantReplies: number }) {
  const { tier, signedIn } = useTier();

  // Read sessionStorage SYNCHRONOUSLY in the lazy initializer so the
  // nudge never flashes on screen for users who already dismissed it
  // earlier in the session. (Reading inside a useEffect would mean the
  // first paint shows the nudge and then a second paint hides it.)
  const [dismissed, setDismissed] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    try {
      return sessionStorage.getItem("avolin:eliteNudgeDismissed") === "1";
    } catch {
      // sessionStorage can throw in private mode — treat as not dismissed.
      return false;
    }
  });

  // Don't show until the assistant has actually been useful at least
  // 3 times — that's enough conversation that the user has felt the
  // value, but not so much that we're nagging them.
  const REPLY_THRESHOLD = 3;

  if (tier === "elite") return null;
  if (assistantReplies < REPLY_THRESHOLD) return null;
  if (dismissed) return null;

  const headline = tier === "core"
    ? "Loving Avolin? Go Elite — unlock everything."
    : signedIn
    ? "Make Avolin truly yours. Upgrade your plan."
    : "Like what you're hearing? Avolin gets even better.";

  const sub = tier === "core"
    ? "4K image generation, 30-min full songs, commercial license. $90/year — 25% off monthly."
    : "Custom personalities, emotion-aware voice, cloud sync, priority support — and so much more.";

  const cta = tier === "core" ? "Go Elite — $90/yr" : "See plans";

  const handleDismiss = () => {
    try {
      sessionStorage.setItem("avolin:eliteNudgeDismissed", "1");
    } catch {}
    setDismissed(true);
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.2, duration: 0.45 }}
      className="w-full max-w-2xl mx-auto px-3 sm:px-4 mt-3 mb-1"
    >
      <div
        className="relative rounded-xl px-4 py-3 sm:px-5 sm:py-4 overflow-hidden"
        style={{
          background:
            "linear-gradient(135deg, rgba(20,8,0,0.92) 0%, rgba(40,20,4,0.92) 100%)",
          border: "1px solid rgba(255,180,80,0.35)",
          boxShadow:
            "0 0 30px rgba(255,180,80,0.12), inset 0 0 30px rgba(255,180,80,0.04)",
          fontFamily: "'Rajdhani', sans-serif",
        }}
      >
        {/* Subtle animated shimmer along the top edge */}
        <div
          className="absolute inset-x-0 top-0 h-px"
          style={{
            background:
              "linear-gradient(90deg, transparent 0%, rgba(255,200,120,0.7) 50%, transparent 100%)",
          }}
        />

        <button
          onClick={handleDismiss}
          aria-label="Dismiss upgrade prompt"
          className="absolute right-2 top-2 w-7 h-7 rounded-md text-amber-300/50 hover:text-amber-200 hover:bg-amber-400/10 active:bg-amber-400/20 flex items-center justify-center transition-colors"
        >
          <X className="w-3.5 h-3.5" />
        </button>

        <div className="flex items-center gap-3 pr-7">
          <div
            className="flex-shrink-0 w-9 h-9 sm:w-10 sm:h-10 rounded-lg flex items-center justify-center"
            style={{
              background:
                "linear-gradient(135deg, rgba(255,180,80,0.25) 0%, rgba(255,140,40,0.15) 100%)",
              border: "1px solid rgba(255,180,80,0.4)",
              boxShadow: "0 0 16px rgba(255,180,80,0.25)",
            }}
          >
            <Crown className="w-4 h-4 sm:w-5 sm:h-5 text-amber-300" />
          </div>
          <div className="min-w-0 flex-1">
            <p
              className="text-sm sm:text-base font-semibold text-amber-100 leading-tight"
              style={{
                textShadow: "0 0 12px rgba(255,180,80,0.3)",
              }}
            >
              {headline}
            </p>
            <p className="text-[12px] sm:text-[13px] text-amber-200/70 mt-0.5 leading-snug">
              {sub}
            </p>
          </div>
        </div>

        <div className="mt-3 flex items-center gap-2">
          <Link
            to={tier === "core" ? "/upgrade?tier=elite" : "/upgrade"}
            className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-lg font-mono text-xs sm:text-sm tracking-widest uppercase transition-transform active:scale-[0.98] hover:scale-[1.01]"
            style={{
              background:
                "linear-gradient(135deg, rgba(255,200,120,0.95) 0%, rgba(255,160,60,0.95) 100%)",
              color: "#1a0a00",
              boxShadow:
                "0 0 22px rgba(255,180,80,0.45), inset 0 1px 0 rgba(255,255,255,0.25)",
            }}
            onClick={() => {
              // Reward dismiss the nudge after they tap through, so the
              // returning user isn't shown the same nudge again right away.
              try {
                sessionStorage.setItem("avolin:eliteNudgeDismissed", "1");
              } catch {}
            }}
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>{cta}</span>
          </Link>
          <button
            onClick={handleDismiss}
            className="px-3 py-2.5 rounded-lg font-mono text-[11px] sm:text-xs tracking-widest uppercase text-amber-200/60 hover:text-amber-100 hover:bg-amber-400/10 transition-colors"
          >
            Not now
          </button>
        </div>
      </div>
    </motion.div>
  );
}
