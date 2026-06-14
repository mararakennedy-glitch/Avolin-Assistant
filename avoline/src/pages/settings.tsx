import { useState, useEffect } from "react";
import { ArrowLeft, User, Sun, Moon, Database, Info, LogOut, Trash2, Download, Phone, Mail, ShieldCheck, FileText, ChevronRight } from "lucide-react";
import { Link } from "wouter";
import { motion } from "framer-motion";
import { useUser, useClerk, Show } from "@clerk/react";
import { AuthOptionsModal } from "@/components/auth-options-modal";
import { SettingsInstallEntry, useShouldShowInstall } from "@/components/install-prompt";

type Tab = "profile" | "data" | "about";

export default function Settings() {
  const { user } = useUser();
  const { signOut } = useClerk();
  const [tab, setTab] = useState<Tab>("profile");
  const [theme, setTheme] = useState<"dark" | "light">(() => {
    if (typeof window === "undefined") return "dark";
    return (localStorage.getItem("avoline-theme") as "dark" | "light") || "dark";
  });
  const [phone, setPhone] = useState(() => localStorage.getItem("avoline-phone") || "");
  const [trainConsent, setTrainConsent] = useState(
    () => localStorage.getItem("avoline-train-consent") === "true"
  );
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    const root = document.documentElement;
    if (theme === "dark") root.classList.add("dark");
    else root.classList.remove("dark");
    localStorage.setItem("avoline-theme", theme);
  }, [theme]);

  useEffect(() => {
    localStorage.setItem("avoline-phone", phone);
  }, [phone]);

  useEffect(() => {
    localStorage.setItem("avoline-train-consent", String(trainConsent));
  }, [trainConsent]);

  const handleExport = async () => {
    setBusy("export");
    try {
      const res = await fetch("/api/openai/conversations");
      const data = await res.json();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `avoline-export-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setBusy(null);
    }
  };

  const handleDeleteAllChats = async () => {
    if (!window.confirm("Delete every conversation forever? This cannot be undone.")) return;
    setBusy("delete-all");
    try {
      const res = await fetch("/api/openai/conversations");
      const list = await res.json();
      await Promise.all(
        (list || []).map((c: any) =>
          fetch(`/api/openai/conversations/${c.id}`, { method: "DELETE" })
        )
      );
      window.alert("All conversations deleted.");
    } finally {
      setBusy(null);
    }
  };

  const handleLogoutAll = async () => {
    if (!user) return;
    if (!window.confirm("Sign out of every device?")) return;
    try {
      const sessions = await user.getSessions();
      await Promise.all(sessions.map((s) => s.revoke()));
      await signOut();
    } catch {
      window.alert("Could not sign out of all devices.");
    }
  };

  const handleDeleteAccount = async () => {
    if (!user) return;
    if (!window.confirm("Delete your Avolin account permanently? This cannot be undone.")) return;
    try {
      await user.delete();
    } catch {
      window.alert("Account deletion failed.");
    }
  };

  return (
    <div
      className="min-h-[100dvh] relative overflow-hidden dark"
      style={{ background: "#000208", fontFamily: "'Rajdhani', sans-serif" }}
    >
      <div
        className="absolute inset-0 pointer-events-none"
        style={{ background: "radial-gradient(ellipse 60% 50% at 50% 20%, rgba(0,80,160,0.2) 0%, transparent 60%)" }}
      />

      <div className="relative z-10 max-w-3xl mx-auto p-6">
        <Link
          to="/"
          className="inline-flex items-center gap-2 mb-6 text-xs font-mono text-cyan-400/60 hover:text-cyan-300 tracking-widest uppercase"
        >
          <ArrowLeft className="w-3.5 h-3.5" /> Back
        </Link>

        <h1
          className="text-3xl mb-1 tracking-[0.3em] font-bold text-cyan-100"
          style={{ fontFamily: "'Orbitron', sans-serif", textShadow: "0 0 20px rgba(0,220,255,0.3)" }}
        >
          SETTINGS
        </h1>
        <p className="text-cyan-400/55 text-sm font-mono mb-8 tracking-wider uppercase">
          Configure your Avolin experience
        </p>

        {/* Theme toggle — always at the top */}
        <Section title="Appearance" icon={theme === "dark" ? Moon : Sun}>
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm text-cyan-100">Theme</div>
              <div className="text-xs text-cyan-400/50 font-mono">
                Switch between dark (recommended) and light mode
              </div>
            </div>
            <div className="flex rounded-lg border border-cyan-400/25 overflow-hidden">
              <button
                onClick={() => setTheme("dark")}
                className={`flex items-center gap-1.5 px-4 py-2 text-xs font-mono tracking-wider ${
                  theme === "dark" ? "bg-cyan-400/20 text-cyan-200" : "text-cyan-400/50 hover:text-cyan-300"
                }`}
              >
                <Moon className="w-3.5 h-3.5" /> DARK
              </button>
              <button
                onClick={() => setTheme("light")}
                className={`flex items-center gap-1.5 px-4 py-2 text-xs font-mono tracking-wider ${
                  theme === "light" ? "bg-cyan-400/20 text-cyan-200" : "text-cyan-400/50 hover:text-cyan-300"
                }`}
              >
                <Sun className="w-3.5 h-3.5" /> LIGHT
              </button>
            </div>
          </div>
        </Section>

        {/* Tabs */}
        <div className="flex gap-2 mt-8 mb-4 border-b border-cyan-400/15">
          {([
            { k: "profile" as Tab, label: "Profile", Icon: User },
            { k: "data" as Tab, label: "Data", Icon: Database },
            { k: "about" as Tab, label: "About", Icon: Info },
          ]).map(({ k, label, Icon }) => (
            <button
              key={k}
              onClick={() => setTab(k)}
              className={`flex items-center gap-2 px-4 py-2.5 text-xs font-mono tracking-widest uppercase border-b-2 -mb-px transition-colors ${
                tab === k
                  ? "border-cyan-400 text-cyan-200"
                  : "border-transparent text-cyan-400/45 hover:text-cyan-300"
              }`}
            >
              <Icon className="w-3.5 h-3.5" /> {label}
            </button>
          ))}
        </div>

        {tab === "profile" && (
          <motion.div initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }}>
            <Show when="signed-out">
              <SettingsSignedOutCard />
            </Show>
            <Show when="signed-in">
              <Section title="Account" icon={User}>
                <Field label="Name" value={user?.fullName || user?.firstName || "—"} />
                <Field
                  label="Email address"
                  value={user?.primaryEmailAddress?.emailAddress || "—"}
                  Icon={Mail}
                />
                <div className="flex items-center justify-between py-3 border-t border-cyan-400/10">
                  <div className="flex items-center gap-2">
                    <Phone className="w-4 h-4 text-cyan-400/55" />
                    <div className="text-xs text-cyan-400/55 font-mono uppercase tracking-wider">
                      Phone number <span className="opacity-50">(optional)</span>
                    </div>
                  </div>
                  <input
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="+263 ..."
                    className="bg-transparent border border-cyan-400/20 rounded-lg px-3 py-1.5 text-sm text-cyan-100 placeholder:text-cyan-400/30 focus:outline-none focus:border-cyan-400/50 w-48 text-right font-mono"
                  />
                </div>
              </Section>

              <Section title="Sessions" icon={ShieldCheck}>
                <RowButton onClick={handleLogoutAll} icon={LogOut} label="Log out of all devices" />
                <RowButton
                  onClick={handleDeleteAccount}
                  icon={Trash2}
                  label="Delete account"
                  danger
                />
              </Section>
            </Show>
          </motion.div>
        )}

        {tab === "data" && (
          <motion.div initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }}>
            <Section title="Improve the model for everyone" icon={Database}>
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1">
                  <div className="text-sm text-cyan-100 mb-1">
                    Allow your content to train our models
                  </div>
                  <div className="text-xs text-cyan-400/55 font-mono leading-relaxed">
                    Help improve our services. We secure your data privacy and never sell it.
                  </div>
                </div>
                <button
                  onClick={() => setTrainConsent((v) => !v)}
                  className={`relative w-12 h-6 rounded-full transition-colors flex-shrink-0 ${
                    trainConsent ? "bg-cyan-400/80" : "bg-cyan-400/15 border border-cyan-400/25"
                  }`}
                >
                  <div
                    className="absolute top-0.5 w-5 h-5 rounded-full bg-white transition-all"
                    style={{ left: trainConsent ? "1.625rem" : "0.125rem" }}
                  />
                </button>
              </div>
            </Section>

            <Section title="Export data" icon={Download}>
              <p className="text-xs text-cyan-400/55 font-mono mb-3 leading-relaxed">
                This data includes your account information and all chat history.
                Exporting may take some time. The download link will be valid for 7 days.
              </p>
              <button
                onClick={handleExport}
                disabled={busy === "export"}
                className="px-5 py-2 rounded-lg text-xs font-mono tracking-wider disabled:opacity-50"
                style={{
                  background: "rgba(0,220,255,0.18)",
                  color: "rgba(180,240,255,0.95)",
                  border: "1px solid rgba(0,220,255,0.4)",
                }}
              >
                {busy === "export" ? "EXPORTING..." : "EXPORT"}
              </button>
            </Section>

            <Section title="Delete all chats" icon={Trash2}>
              <RowButton
                onClick={handleDeleteAllChats}
                icon={Trash2}
                label={busy === "delete-all" ? "Deleting..." : "Delete all chats"}
                danger
              />
            </Section>
          </motion.div>
        )}

        {tab === "about" && (
          <motion.div initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }}>
            <InstallSection />

            <Section title="About Avolin" icon={Info}>
              <p className="text-sm text-cyan-100 mb-2">Avolin v1.0</p>
              <p className="text-xs text-cyan-400/55 font-mono leading-relaxed">
                A hyper-advanced AI assistant built by{" "}
                <span className="text-cyan-300">Kennedy Marara</span> in Zimbabwe.
                Voice, vision, music generation, and a JARVIS-grade interface.
              </p>
            </Section>

            <Section title="Terms & Conditions" icon={FileText}>
              <div className="text-xs text-cyan-400/55 font-mono leading-relaxed space-y-2">
                <p>
                  By using Avolin you agree to use the service responsibly and
                  in compliance with applicable laws. Generated content is provided
                  on an "as is" basis without warranties of any kind.
                </p>
                <p>
                  Subscriptions renew automatically until cancelled. You may cancel
                  any time from this Settings page. Refunds are issued at our
                  discretion within 14 days of purchase.
                </p>
                <p>
                  Misuse of the service — including generating illegal, harmful,
                  or hateful content — may result in account termination.
                </p>
              </div>
            </Section>

            <Section title="Privacy Policy" icon={ShieldCheck}>
              <div className="text-xs text-cyan-400/55 font-mono leading-relaxed space-y-2">
                <p>
                  We collect only what's needed to make Avolin work: your account
                  information (when you sign in), your conversations, and basic
                  usage analytics. We never sell your data.
                </p>
                <p>
                  Voice recordings are processed transiently for transcription and
                  are not stored. Generated images and music are stored only when
                  you save them.
                </p>
                <p>
                  You may export or delete your data at any time from the Data tab.
                  For questions, contact <span className="text-cyan-300">privacy@avoline.app</span>.
                </p>
              </div>
            </Section>
          </motion.div>
        )}
      </div>
    </div>
  );
}

// Signed-out card on the Profile tab. Same Google/Apple/email/create-account
// options as the welcome modal — keeps every sign-in entry point consistent.
function SettingsSignedOutCard() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <div className="rounded-xl border border-cyan-400/25 bg-cyan-400/5 p-8 text-center">
        <User className="w-12 h-12 text-cyan-400/60 mx-auto mb-4" />
        <h3 className="text-cyan-100 text-lg mb-2">Sign in to manage your profile</h3>
        <p className="text-cyan-400/55 text-sm font-mono mb-5">
          Continue with Google, Apple, or email to sync across devices.
        </p>
        <button
          onClick={() => setOpen(true)}
          className="px-6 py-2.5 rounded-lg font-mono text-sm tracking-wider"
          style={{
            background: "rgba(0,220,255,0.95)",
            color: "#020a14",
            boxShadow: "0 0 20px rgba(0,220,255,0.35)",
          }}
        >
          SIGN IN
        </button>
      </div>
      <AuthOptionsModal open={open} onClose={() => setOpen(false)} />
    </>
  );
}

function InstallSection() {
  const show = useShouldShowInstall();
  if (!show) return null;
  return (
    <Section title="Install on this device" icon={Download}>
      <SettingsInstallEntry />
    </Section>
  );
}

function Section({
  title,
  icon: Icon,
  children,
}: {
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  children: React.ReactNode;
}) {
  return (
    <div
      className="mb-4 rounded-xl border border-cyan-400/15 bg-[rgba(0,8,18,0.65)] backdrop-blur-md p-5"
      style={{ boxShadow: "0 0 24px rgba(0,80,160,0.06)" }}
    >
      <div className="flex items-center gap-2 mb-4">
        <Icon className="w-4 h-4 text-cyan-400/80" />
        <h2 className="text-xs font-mono tracking-widest uppercase text-cyan-300">{title}</h2>
      </div>
      {children}
    </div>
  );
}

function Field({
  label,
  value,
  Icon,
}: {
  label: string;
  value: string;
  Icon?: React.ComponentType<{ className?: string }>;
}) {
  return (
    <div className="flex items-center justify-between py-3 border-t first:border-t-0 border-cyan-400/10">
      <div className="flex items-center gap-2">
        {Icon && <Icon className="w-4 h-4 text-cyan-400/55" />}
        <div className="text-xs text-cyan-400/55 font-mono uppercase tracking-wider">{label}</div>
      </div>
      <div className="text-sm text-cyan-100 font-mono">{value}</div>
    </div>
  );
}

function RowButton({
  onClick,
  icon: Icon,
  label,
  danger,
}: {
  onClick: () => void;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  danger?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center justify-between w-full px-4 py-3 rounded-lg border transition-colors ${
        danger
          ? "border-red-400/25 bg-red-400/5 hover:bg-red-400/10 text-red-300"
          : "border-cyan-400/20 bg-cyan-400/5 hover:bg-cyan-400/10 text-cyan-200"
      }`}
    >
      <span className="flex items-center gap-3 text-sm">
        <Icon className="w-4 h-4" /> {label}
      </span>
      <ChevronRight className="w-4 h-4 opacity-50" />
    </button>
  );
}
