import React, { useRef, useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Message } from "@/hooks/use-avoline-chat";
import { Bot, User, Globe, Headphones, LogOut, Download, Music2 } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { ActionButton } from "@/components/action-button";
import {
  downloadImageWithWatermark,
  downloadGeneratedMusic,
} from "@/lib/download";

function MarkdownContent({ content }: { content: string }) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        p: ({ children }) => <p className="mb-2 last:mb-0 leading-relaxed">{children}</p>,
        h1: ({ children }) => <h1 className="text-lg font-bold text-cyan-200 mb-2 mt-3 first:mt-0">{children}</h1>,
        h2: ({ children }) => <h2 className="text-base font-bold text-cyan-300 mb-2 mt-3 first:mt-0">{children}</h2>,
        h3: ({ children }) => <h3 className="text-sm font-semibold text-cyan-400 mb-1 mt-2 first:mt-0">{children}</h3>,
        ul: ({ children }) => <ul className="mb-2 ml-4 space-y-0.5">{children}</ul>,
        ol: ({ children }) => <ol className="mb-2 ml-4 space-y-0.5 list-decimal">{children}</ol>,
        li: ({ children }) => <li className="leading-relaxed before:content-['▸'] before:text-cyan-500 before:mr-1.5 before:text-xs list-none">{children}</li>,
        strong: ({ children }) => <strong className="font-bold text-cyan-100">{children}</strong>,
        em: ({ children }) => <em className="italic text-cyan-200/80">{children}</em>,
        code: ({ children, className }) => {
          const isBlock = className?.startsWith("language-");
          if (isBlock) {
            const lang = className?.replace("language-", "") || "";

            // Special case: action blocks render as tappable buttons
            if (lang === "action") {
              const raw = String(children).trim();
              if (!raw) return null;
              return <ActionButton raw={raw} />;
            }

            return (
              <div className="my-2 rounded-lg overflow-hidden border border-cyan-400/20">
                {lang && (
                  <div className="px-3 py-1 bg-cyan-900/40 text-cyan-400/60 text-[10px] font-mono tracking-widest uppercase border-b border-cyan-400/15">
                    {lang}
                  </div>
                )}
                <pre className="px-4 py-3 bg-black/50 overflow-x-auto">
                  <code className="text-xs text-cyan-100 font-mono leading-relaxed">{children}</code>
                </pre>
              </div>
            );
          }
          return (
            <code className="px-1.5 py-0.5 rounded bg-cyan-900/40 text-cyan-300 text-xs font-mono border border-cyan-400/20">
              {children}
            </code>
          );
        },
        pre: ({ children }) => <>{children}</>,
        blockquote: ({ children }) => (
          <blockquote className="border-l-2 border-cyan-400/50 pl-3 my-2 text-cyan-200/70 italic">{children}</blockquote>
        ),
        table: ({ children }) => (
          <div className="my-2 overflow-x-auto rounded-lg border border-cyan-400/20">
            <table className="w-full text-xs">{children}</table>
          </div>
        ),
        thead: ({ children }) => <thead className="bg-cyan-900/30">{children}</thead>,
        th: ({ children }) => <th className="px-3 py-2 text-left text-cyan-300 font-semibold border-b border-cyan-400/20">{children}</th>,
        td: ({ children }) => <td className="px-3 py-2 text-cyan-100/80 border-b border-cyan-400/10">{children}</td>,
        a: ({ href, children }) => (
          <a href={href} target="_blank" rel="noopener noreferrer" className="text-cyan-400 underline underline-offset-2 hover:text-cyan-300 transition-colors">
            {children}
          </a>
        ),
        hr: () => <hr className="my-3 border-cyan-400/20" />,
      }}
    >
      {content}
    </ReactMarkdown>
  );
}

export function AnswerPanel({
  messages,
  isVisible,
  isSearching,
  onRead,
  onExit,
  isSpeaking,
}: {
  messages: Message[];
  isVisible: boolean;
  isSearching?: boolean;
  onRead?: () => void;
  onExit?: () => void;
  isSpeaking?: boolean;
}) {
  const hasAssistantMessage = messages.some((m) => m.role === "assistant" && m.content.trim().length > 0);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isSearching]);

  return (
    <AnimatePresence>
      {isVisible && (
        <motion.div
          initial={{ opacity: 0, y: 40 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 40 }}
          transition={{ duration: 0.4, ease: "easeOut" }}
          className="absolute inset-x-0 bottom-28 top-16 mx-auto max-w-2xl px-4 z-10 pointer-events-auto"
        >
          <div className="relative h-full">
            <div className="absolute top-0 left-0 w-5 h-5 border-t-2 border-l-2 border-cyan-400/50 z-20" />
            <div className="absolute top-0 right-0 w-5 h-5 border-t-2 border-r-2 border-cyan-400/50 z-20" />
            <div className="absolute bottom-0 left-0 w-5 h-5 border-b-2 border-l-2 border-cyan-400/50 z-20" />
            <div className="absolute bottom-0 right-0 w-5 h-5 border-b-2 border-r-2 border-cyan-400/50 z-20" />
            <div className="absolute top-0 inset-x-5 h-px bg-gradient-to-r from-transparent via-cyan-400/40 to-transparent z-20" />
            <div className="absolute bottom-0 inset-x-5 h-px bg-gradient-to-r from-transparent via-cyan-400/25 to-transparent z-20" />

            {/* Toolbar attached to the conversation card */}
            {(onRead || onExit) && (
              <div className="absolute -top-3 right-3 z-30 flex items-center gap-1.5">
                {onRead && (
                  <button
                    onClick={onRead}
                    disabled={isSpeaking || !hasAssistantMessage}
                    aria-label="Read conversation aloud"
                    title="Read aloud"
                    className="flex items-center gap-1.5 px-2.5 py-1 rounded-full font-mono text-[10px] font-semibold tracking-widest uppercase transition-all hover:scale-105 active:scale-95 disabled:opacity-40 disabled:cursor-default backdrop-blur-md"
                    style={{
                      background: "linear-gradient(135deg, rgba(0,30,50,0.95), rgba(0,20,40,0.9))",
                      border: "1px solid rgba(0,220,255,0.65)",
                      color: "rgba(180,240,255,1)",
                      boxShadow: "0 0 12px rgba(0,220,255,0.45)",
                    }}
                  >
                    <Headphones className="w-3 h-3" />
                    <span>Read</span>
                  </button>
                )}
                {onExit && (
                  <button
                    onClick={onExit}
                    aria-label="Exit conversation"
                    title="Exit conversation"
                    className="flex items-center gap-1.5 px-2.5 py-1 rounded-full font-mono text-[10px] font-semibold tracking-widest uppercase transition-all hover:scale-105 active:scale-95 backdrop-blur-md"
                    style={{
                      background: "linear-gradient(135deg, rgba(50,10,20,0.95), rgba(40,5,15,0.9))",
                      border: "1px solid rgba(255,140,160,0.65)",
                      color: "rgba(255,210,215,1)",
                      boxShadow: "0 0 12px rgba(255,80,120,0.45)",
                    }}
                  >
                    <LogOut className="w-3 h-3" />
                    <span>Exit</span>
                  </button>
                )}
              </div>
            )}

            <div
              ref={scrollRef}
              className="h-full w-full bg-[rgba(1,10,15,0.92)] backdrop-blur-2xl border border-cyan-400/18 rounded-lg overflow-y-auto shadow-[0_0_40px_rgba(0,220,255,0.06)] flex flex-col gap-4 p-5"
              style={{ scrollbarWidth: "thin", scrollbarColor: "rgba(0,220,255,0.15) transparent" }}
            >
              {messages.map((msg) => (
                <motion.div
                  key={msg.id}
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.3 }}
                  className={`flex gap-3 ${msg.role === "user" ? "flex-row-reverse" : "flex-row"}`}
                >
                  <div className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center mt-0.5 ${
                    msg.role === "user"
                      ? "bg-cyan-400/15 border border-cyan-400/35"
                      : "bg-[rgba(0,30,50,0.8)] border border-cyan-400/25"
                  }`}>
                    {msg.role === "user"
                      ? <User className="w-4 h-4 text-cyan-300" />
                      : <Bot className="w-4 h-4 text-cyan-400" />
                    }
                  </div>

                  <div className={`flex flex-col max-w-[84%] ${msg.role === "user" ? "items-end" : "items-start"}`}>
                    <div className={`text-[10px] mb-1 font-mono tracking-widest uppercase ${
                      msg.role === "user" ? "text-cyan-400/50" : "text-cyan-300/40"
                    }`}>
                      {msg.role === "user" ? "YOU" : "AVOLIN"}
                    </div>

                    <div className={`relative px-4 py-3 text-sm leading-relaxed ${
                      msg.role === "user"
                        ? "bg-cyan-500/8 border border-cyan-400/25 rounded-lg rounded-tr-sm text-cyan-50"
                        : "bg-[rgba(0,15,28,0.6)] border border-cyan-400/12 rounded-lg rounded-tl-sm text-cyan-100/85"
                    }`}>
                      {msg.role === "assistant" ? (
                        <MarkdownContent content={msg.content} />
                      ) : (
                        <p className="leading-relaxed">{msg.content}</p>
                      )}
                      {msg.isStreaming && (
                        <motion.span
                          animate={{ opacity: [0, 1, 0] }}
                          transition={{ duration: 0.65, repeat: Infinity }}
                          className="inline-block ml-1 w-2 h-[1em] bg-cyan-400 align-middle rounded-sm"
                        />
                      )}
                    </div>

                    {msg.imageUrl && (
                      <div className="mt-3 w-full">
                        <div className="rounded-lg overflow-hidden border border-cyan-400/18 shadow-[0_0_20px_rgba(0,220,255,0.08)]">
                          <img src={msg.imageUrl} alt="Generated" className="w-full h-auto object-cover" />
                        </div>
                        <div className="mt-2 flex justify-end">
                          <DownloadImageButton
                            url={msg.imageUrl}
                            prompt={msg.imagePrompt || "image"}
                          />
                        </div>
                      </div>
                    )}

                    {msg.music && msg.music.prompt && typeof msg.music.seed === "number" && typeof msg.music.durationSec === "number" && (
                      <div className="mt-3 flex justify-end">
                        <DownloadMusicButton
                          prompt={msg.music.prompt}
                          seed={msg.music.seed}
                          durationSec={msg.music.durationSec}
                          mood={msg.music.mood}
                        />
                      </div>
                    )}
                  </div>
                </motion.div>
              ))}

              {/* Live search indicator */}
              <AnimatePresence>
                {isSearching && (
                  <motion.div
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 8 }}
                    className="flex gap-3"
                  >
                    <div className="flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center bg-[rgba(0,30,50,0.8)] border border-cyan-400/25">
                      <motion.div
                        animate={{ rotate: 360 }}
                        transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                      >
                        <Globe className="w-4 h-4 text-cyan-400" />
                      </motion.div>
                    </div>
                    <div className="flex flex-col max-w-[84%]">
                      <div className="text-[10px] mb-1 font-mono tracking-widest uppercase text-cyan-300/40">AVOLIN</div>
                      <div className="px-4 py-3 bg-[rgba(0,15,28,0.6)] border border-cyan-400/12 rounded-lg rounded-tl-sm">
                        <div className="flex items-center gap-2 text-xs text-cyan-400/70 font-mono">
                          <motion.div
                            animate={{ opacity: [0.4, 1, 0.4] }}
                            transition={{ duration: 1.2, repeat: Infinity }}
                            className="flex gap-1"
                          >
                            <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 inline-block" />
                            <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 inline-block" style={{ animationDelay: "0.2s" }} />
                            <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 inline-block" style={{ animationDelay: "0.4s" }} />
                          </motion.div>
                          <span className="tracking-widest">SEARCHING THE WEB...</span>
                        </div>
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function DownloadImageButton({ url, prompt }: { url: string; prompt: string }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  return (
    <button
      type="button"
      disabled={busy}
      onClick={async () => {
        setErr(null);
        setBusy(true);
        try {
          await downloadImageWithWatermark(url, prompt);
        } catch (e: any) {
          setErr("Failed to save image.");
          console.error("[avolin] image download failed", e);
        } finally {
          setBusy(false);
        }
      }}
      title={err ?? "Download image with Avolin watermark"}
      className="flex items-center gap-1.5 px-3 py-1.5 rounded-full font-mono text-[10px] font-semibold tracking-widest uppercase transition-all hover:scale-105 active:scale-95 disabled:opacity-50 disabled:cursor-default backdrop-blur-md"
      style={{
        background: "linear-gradient(135deg, rgba(0,30,50,0.95), rgba(0,20,40,0.9))",
        border: "1px solid rgba(0,220,255,0.55)",
        color: "rgba(180,240,255,1)",
        boxShadow: "0 0 10px rgba(0,220,255,0.35)",
      }}
    >
      <Download className="w-3 h-3" />
      <span>{busy ? "Saving..." : "Download"}</span>
    </button>
  );
}

function DownloadMusicButton({
  prompt,
  seed,
  durationSec,
  mood,
}: {
  prompt: string;
  seed: number;
  durationSec: number;
  mood: string;
}) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  return (
    <button
      type="button"
      disabled={busy}
      onClick={async () => {
        setErr(null);
        setBusy(true);
        try {
          await downloadGeneratedMusic({ prompt, seed, durationSec, mood });
        } catch (e: any) {
          setErr("Failed to save music.");
          console.error("[avolin] music download failed", e);
        } finally {
          setBusy(false);
        }
      }}
      title={err ?? "Download this composition as a WAV file"}
      className="flex items-center gap-1.5 px-3 py-1.5 rounded-full font-mono text-[10px] font-semibold tracking-widest uppercase transition-all hover:scale-105 active:scale-95 disabled:opacity-50 disabled:cursor-default backdrop-blur-md"
      style={{
        background: "linear-gradient(135deg, rgba(0,30,50,0.95), rgba(0,20,40,0.9))",
        border: "1px solid rgba(0,220,255,0.55)",
        color: "rgba(180,240,255,1)",
        boxShadow: "0 0 10px rgba(0,220,255,0.35)",
      }}
    >
      {busy ? <Music2 className="w-3 h-3 animate-pulse" /> : <Download className="w-3 h-3" />}
      <span>{busy ? "Rendering..." : "Download WAV"}</span>
    </button>
  );
}
