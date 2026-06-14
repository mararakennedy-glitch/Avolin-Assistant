import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Phone, MessageSquare, Mail, ExternalLink, MapPin, Search, Copy, Check, AlertTriangle, ShieldAlert, X } from "lucide-react";

type ActionData =
  | { type: "call"; label: string; number: string }
  | { type: "sms"; label: string; number: string; message: string }
  | { type: "whatsapp"; label: string; number: string; message: string }
  | { type: "email"; label: string; to: string; subject?: string; body?: string }
  | { type: "link"; label: string; url: string }
  | { type: "maps"; label: string; query: string }
  | { type: "search"; label: string; query: string }
  | { type: "copy"; label: string; text: string };

function normalizePhone(raw: string): string {
  const trimmed = (raw || "").trim().replace(/[\s\-().]/g, "");
  if (!trimmed) return "";
  return trimmed.startsWith("+") ? trimmed : `+${trimmed.replace(/^00/, "")}`;
}

function whatsappNumber(raw: string): string {
  return normalizePhone(raw).replace(/^\+/, "");
}

function safeUrl(raw: string): string {
  const t = (raw || "").trim();
  if (/^https?:\/\//i.test(t)) return t;
  return `https://${t}`;
}

const styleByType: Record<ActionData["type"], { Icon: React.ComponentType<any>; tint: string; ring: string }> = {
  call:     { Icon: Phone,         tint: "text-emerald-300", ring: "border-emerald-400/40 hover:border-emerald-300 hover:shadow-[0_0_18px_rgba(80,255,180,0.35)]" },
  sms:      { Icon: MessageSquare, tint: "text-cyan-300",    ring: "border-cyan-400/40 hover:border-cyan-300 hover:shadow-[0_0_18px_rgba(80,220,255,0.35)]" },
  whatsapp: { Icon: MessageSquare, tint: "text-emerald-300", ring: "border-emerald-400/40 hover:border-emerald-300 hover:shadow-[0_0_18px_rgba(80,255,180,0.35)]" },
  email:    { Icon: Mail,          tint: "text-amber-300",   ring: "border-amber-400/40 hover:border-amber-300 hover:shadow-[0_0_18px_rgba(255,200,80,0.35)]" },
  link:     { Icon: ExternalLink,  tint: "text-cyan-300",    ring: "border-cyan-400/40 hover:border-cyan-300 hover:shadow-[0_0_18px_rgba(80,220,255,0.35)]" },
  maps:     { Icon: MapPin,        tint: "text-rose-300",    ring: "border-rose-400/40 hover:border-rose-300 hover:shadow-[0_0_18px_rgba(255,120,160,0.35)]" },
  search:   { Icon: Search,        tint: "text-violet-300",  ring: "border-violet-400/40 hover:border-violet-300 hover:shadow-[0_0_18px_rgba(180,140,255,0.35)]" },
  copy:     { Icon: Copy,          tint: "text-cyan-300",    ring: "border-cyan-400/40 hover:border-cyan-300 hover:shadow-[0_0_18px_rgba(80,220,255,0.35)]" },
};

function isNonEmptyString(v: unknown): v is string {
  return typeof v === "string" && v.trim().length > 0;
}

function validateActionFields(a: any): string | null {
  if (!isNonEmptyString(a.label)) return "Missing label";
  switch (a.type) {
    case "call":
      return isNonEmptyString(a.number) ? null : "Missing phone number";
    case "sms":
    case "whatsapp":
      return isNonEmptyString(a.number) ? null : "Missing phone number";
    case "email":
      return isNonEmptyString(a.to) ? null : "Missing recipient";
    case "link":
      return isNonEmptyString(a.url) ? null : "Missing URL";
    case "maps":
    case "search":
      return isNonEmptyString(a.query) ? null : "Missing query";
    case "copy":
      return isNonEmptyString(a.text) ? null : "Missing text";
    default:
      return "Unknown action type";
  }
}

function buildHref(a: ActionData): string | null {
  switch (a.type) {
    case "call":     return `tel:${normalizePhone(a.number)}`;
    case "sms": {
      const num = normalizePhone(a.number);
      const body = encodeURIComponent(a.message ?? "");
      return `sms:${num}${body ? `?&body=${body}` : ""}`;
    }
    case "whatsapp": {
      const num = whatsappNumber(a.number);
      const text = encodeURIComponent(a.message ?? "");
      return `https://wa.me/${num}${text ? `?text=${text}` : ""}`;
    }
    case "email": {
      const to = encodeURIComponent(a.to);
      const params: string[] = [];
      if (a.subject) params.push(`subject=${encodeURIComponent(a.subject)}`);
      if (a.body) params.push(`body=${encodeURIComponent(a.body)}`);
      return `mailto:${to}${params.length ? `?${params.join("&")}` : ""}`;
    }
    case "link":   return safeUrl(a.url);
    case "maps":   return `https://www.google.com/maps?q=${encodeURIComponent(a.query)}`;
    case "search": return `https://www.google.com/search?q=${encodeURIComponent(a.query)}`;
    case "copy":   return null;
  }
}

function subtitle(a: ActionData): string {
  switch (a.type) {
    case "call":     return normalizePhone(a.number);
    case "sms":      return `${normalizePhone(a.number)}${a.message ? ` · "${a.message.slice(0, 60)}${a.message.length > 60 ? "…" : ""}"` : ""}`;
    case "whatsapp": return `${normalizePhone(a.number)}${a.message ? ` · "${a.message.slice(0, 60)}${a.message.length > 60 ? "…" : ""}"` : ""}`;
    case "email":    return `${a.to}${a.subject ? ` · ${a.subject}` : ""}`;
    case "link":     return safeUrl(a.url);
    case "maps":     return a.query;
    case "search":   return `Google: "${a.query}"`;
    case "copy":     return `${a.text.slice(0, 80)}${a.text.length > 80 ? "…" : ""}`;
  }
}

function confirmationDetails(a: ActionData): { label: string; value: string } {
  switch (a.type) {
    case "call":     return { label: "Call number", value: normalizePhone(a.number) };
    case "sms":      return { label: "Send SMS to", value: `${normalizePhone(a.number)}${a.message ? ` — "${a.message.slice(0, 80)}${a.message.length > 80 ? "…" : ""}"` : ""}` };
    case "whatsapp": return { label: "WhatsApp to", value: `${normalizePhone(a.number)}${a.message ? ` — "${a.message.slice(0, 80)}${a.message.length > 80 ? "…" : ""}"` : ""}` };
    case "email":    return { label: "Email to", value: `${a.to}${a.subject ? ` — ${a.subject}` : ""}` };
    case "link":     return { label: "Open URL", value: safeUrl(a.url) };
    case "maps":     return { label: "Search Maps for", value: a.query };
    case "search":   return { label: "Google search", value: a.query };
    case "copy":     return { label: "Copy to clipboard", value: a.text.slice(0, 120) + (a.text.length > 120 ? "…" : "") };
  }
}

function extractHostname(href: string): string | null {
  try {
    return new URL(href).hostname;
  } catch {
    return null;
  }
}

function ConfirmationOverlay({
  action,
  onConfirm,
  onCancel,
}: {
  action: ActionData;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const details = confirmationDetails(action);
  const href = buildHref(action);
  const hostname = href && /^https?:\/\//i.test(href) ? extractHostname(href) : null;
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.97 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.97 }}
      transition={{ duration: 0.15 }}
      className="my-2 w-full rounded-lg border border-amber-400/50 bg-[rgba(30,20,0,0.92)] backdrop-blur-sm p-3 flex flex-col gap-2.5"
    >
      <div className="flex items-start gap-2">
        <ShieldAlert className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" />
        <div className="flex flex-col gap-0.5 min-w-0">
          <span className="text-[10px] font-mono tracking-widest uppercase text-amber-400/80">AI-suggested action — review before proceeding</span>
          <span className="text-xs text-amber-200/70 font-mono">{details.label}:</span>
          <span className="text-xs text-amber-100 font-mono break-all">{details.value}</span>
          {hostname && (
            <span className="text-[10px] font-mono text-amber-300/70 mt-0.5">
              Domain: <span className="text-amber-200 font-semibold">{hostname}</span>
            </span>
          )}
        </div>
      </div>
      <div className="flex items-center gap-2 justify-end">
        <button
          type="button"
          onClick={onCancel}
          className="flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-mono tracking-widest uppercase border border-cyan-400/30 text-cyan-300/70 hover:border-cyan-400/60 hover:text-cyan-200 transition-colors"
        >
          <X className="w-3 h-3" />
          Cancel
        </button>
        <button
          type="button"
          onClick={onConfirm}
          className="flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-mono tracking-widest uppercase border border-amber-400/60 text-amber-200 bg-amber-500/10 hover:bg-amber-500/20 hover:border-amber-300 transition-colors"
        >
          <Check className="w-3 h-3" />
          Proceed
        </button>
      </div>
    </motion.div>
  );
}

export function ActionButton({ raw }: { raw: string }) {
  const [copied, setCopied] = useState(false);
  const [confirming, setConfirming] = useState(false);

  let action: ActionData | null = null;
  let parseErr = "";
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || !parsed.type || !styleByType[parsed.type as ActionData["type"]]) {
      parseErr = "Invalid action type";
    } else {
      const validation = validateActionFields(parsed);
      if (validation) {
        parseErr = validation;
      } else {
        action = parsed as ActionData;
      }
    }
  } catch (e: any) {
    parseErr = e?.message || "Could not parse action";
  }

  if (!action) {
    return (
      <div className="my-2 flex items-center gap-2 px-3 py-2 rounded-md border border-amber-500/40 bg-amber-500/10 text-amber-200 text-xs font-mono">
        <AlertTriangle className="w-3.5 h-3.5" />
        <span>Action error: {parseErr}</span>
      </div>
    );
  }

  const { Icon, tint, ring } = styleByType[action.type];
  const href = buildHref(action);
  const sub = subtitle(action);

  const handleCopy = async () => {
    if (action?.type !== "copy") return;
    try {
      await navigator.clipboard.writeText(action.text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {}
  };

  const handleConfirm = () => {
    setConfirming(false);
    if (action?.type === "copy") {
      handleCopy();
    } else if (href) {
      window.open(href, /^https?:\/\//i.test(href) ? "_blank" : "_self", "noopener,noreferrer");
    }
  };

  const handleCancel = () => {
    setConfirming(false);
  };

  const inner = (
    <>
      <div className={`flex-shrink-0 w-9 h-9 rounded-md flex items-center justify-center bg-[rgba(0,30,50,0.6)] border ${ring.replace(/hover:[^\s]+/g, "")}`}>
        {action.type === "copy" && copied
          ? <Check className={`w-4 h-4 text-emerald-300`} />
          : <Icon className={`w-4 h-4 ${tint}`} />}
      </div>
      <div className="flex flex-col items-start min-w-0 flex-1">
        <span className="text-sm font-semibold text-cyan-50 truncate w-full text-left">
          {action.type === "copy" && copied ? "Copied" : action.label}
        </span>
        <span className="text-[11px] text-cyan-300/60 font-mono truncate w-full text-left">{sub}</span>
      </div>
      <ShieldAlert className="w-3.5 h-3.5 text-amber-400/60 flex-shrink-0" title="AI-suggested action — requires confirmation" />
    </>
  );

  const baseCls = `my-2 w-full flex items-center gap-3 px-3 py-2.5 rounded-lg border bg-[rgba(0,15,28,0.7)] backdrop-blur-sm transition-all duration-200 ${ring} text-left no-underline`;

  return (
    <AnimatePresence mode="wait">
      {confirming ? (
        <ConfirmationOverlay
          key="confirm"
          action={action}
          onConfirm={handleConfirm}
          onCancel={handleCancel}
        />
      ) : (
        <motion.button
          key="button"
          type="button"
          onClick={() => setConfirming(true)}
          whileTap={{ scale: 0.98 }}
          className={baseCls}
        >
          {inner}
        </motion.button>
      )}
    </AnimatePresence>
  );
}
