import { useState, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useCreateOpenaiConversation, generateOpenaiImage, getListOpenaiConversationsQueryKey } from "@workspace/api-client-react";
import { useVoiceRecorder } from "@workspace/integrations-openai-ai-react";
import { useUser, useAuth } from "@clerk/react";
import { useTier } from "./use-tier";
import { generateMusic, type GeneratedMusic } from "@/lib/music-gen";
import {
  appendLocalMessage,
  createLocalConversation,
  deriveLocalTitle,
  getLocalConversation,
  setLocalConversationTitle,
} from "@/lib/local-conversations";

export type Message = {
  id: string;
  role: "user" | "assistant";
  content: string;
  isStreaming?: boolean;
  imageUrl?: string;
  imagePrompt?: string;
  music?: {
    mood: string;
    playing: boolean;
    // Fields below let us re-render the EXACT same composition for download.
    prompt?: string;
    seed?: number;
    durationSec?: number;
  };
};

// ─── Shared AudioContext + global TTS state ───
let __ttsCtx: AudioContext | null = null;
let __ttsGain: GainNode | null = null;
function getTtsCtx(): AudioContext {
  if (!__ttsCtx || __ttsCtx.state === "closed") {
    __ttsCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
    __ttsGain = __ttsCtx.createGain();
    // Amplify TTS so the assistant sounds loud and clear (1.0 = native; 1.7 ≈ +4.6 dB).
    __ttsGain.gain.value = 1.7;
    __ttsGain.connect(__ttsCtx.destination);
  }
  return __ttsCtx;
}
function getTtsGain(): GainNode {
  getTtsCtx();
  return __ttsGain!;
}

// Strip everything that isn't visible prose so the TTS only speaks what the
// user actually sees on the screen — never raw markdown syntax, URLs, code,
// table pipes, action blocks, image alt text, or other "hidden" content.
function cleanForTTS(text: string): string {
  return text
    // Fenced code blocks (```code```, ```action {...}```) — never read aloud.
    .replace(/```[\s\S]*?```/g, "")
    // Image markdown ![alt](url) — the user sees an image, not the alt text.
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
    // Markdown links [text](url) → text only (the URL is hidden in the UI).
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    // Bare URLs (http/https/www/mailto) — sound terrible spelled out.
    .replace(/\bhttps?:\/\/\S+/gi, "")
    .replace(/\bwww\.\S+/gi, "")
    .replace(/\bmailto:\S+/gi, "")
    // Inline HTML tags — invisible structure, never speak.
    .replace(/<\/?[a-z][^>]*>/gi, "")
    // Headings (#, ##, ### …) — drop the marker, keep the text.
    .replace(/^#{1,6}\s+/gm, "")
    // Blockquote markers > at line start.
    .replace(/^>\s?/gm, "")
    // Bullet markers (-, *, +) and numbered list markers (1.) at line start —
    // they're rendered as bullets in the UI, so don't say "dash".
    .replace(/^\s*[-*+]\s+/gm, "")
    .replace(/^\s*\d+[.)]\s+/gm, "")
    // Horizontal rules (---, ___, ***).
    .replace(/^\s*([-_*])\1{2,}\s*$/gm, "")
    // Markdown table separator rows: |---|---|
    .replace(/^\s*\|?[\s|:-]{3,}\|?\s*$/gm, "")
    // Table pipe characters → natural comma pause.
    .replace(/\s*\|\s*/g, ", ")
    // Strikethrough ~~text~~ → text.
    .replace(/~~([^~]+)~~/g, "$1")
    // Bold/italic: **x**, __x__, *x*, _x_ → x.
    .replace(/(\*\*|__)(.*?)\1/g, "$2")
    .replace(/(\*|_)(.*?)\1/g, "$2")
    // Inline code `x` → x.
    .replace(/`([^`]+)`/g, "$1")
    // Bullet/middle-dot separators → comma so they read naturally.
    .replace(/\s*[·•]\s*/g, ", ")
    // Em/en-dashes around phrases → comma pause.
    .replace(/\s*[—–]\s*/g, ", ")
    // Collapse leftover whitespace from all the stripping above.
    .replace(/\s+/g, " ")
    .replace(/\s+([,.!?])/g, "$1")
    .trim();
  // No length cap — chunkForTTS below splits long content into TTS-friendly pieces.
}

// Make the FIRST chunk tiny (≈ one sentence / ≤200 chars) so the TTS API
// returns it almost instantly — the user hears audio within a fraction of a
// second of pressing Read. Remaining text is chunked normally and fetched
// in parallel in the background.
function chunkForTTSFast(text: string, firstMax = 200, restMax = 1400): string[] {
  const clean = text.trim();
  if (!clean) return [];
  if (clean.length <= firstMax) return [clean];

  const minOpener = 60; // ignore boundaries before this — avoids "Hi." as a chunk

  // Look for a sentence boundary inside [minOpener, firstMax]. Take the LAST
  // qualifying boundary so the first chunk is as substantive as possible
  // without exceeding the cap.
  let cut = -1;
  const upper = Math.min(clean.length, firstMax);
  for (let i = minOpener; i < upper; i++) {
    const ch = clean[i];
    if (ch === "." || ch === "!" || ch === "?") {
      const next = clean[i + 1];
      if (!next || next === " " || next === "\n") {
        cut = i + 1; // include the punctuation
      }
    }
  }

  // No qualifying sentence end → fall back to the last word boundary inside firstMax.
  if (cut <= 0) {
    cut = clean.lastIndexOf(" ", firstMax);
    if (cut < minOpener) cut = firstMax; // hard cut if even the first word is huge
  }

  cut = Math.min(cut, firstMax); // belt-and-suspenders cap

  const firstChunk = clean.slice(0, cut).trim();
  const rest = clean.slice(cut).trim();
  if (!rest) return [firstChunk];
  return [firstChunk, ...chunkForTTS(rest, restMax)];
}

// Split arbitrarily long text into sentence-aligned chunks ≤ maxLen chars
// so each TTS request stays under the API's per-call limit and starts playing
// quickly, while later chunks are fetched in the background.
function chunkForTTS(text: string, maxLen = 1400): string[] {
  const clean = text.trim();
  if (!clean) return [];
  if (clean.length <= maxLen) return [clean];
  const sentences = clean.match(/[^.!?]+[.!?]+(\s|$)|[^.!?]+$/g) || [clean];
  const chunks: string[] = [];
  let buf = "";
  for (const sRaw of sentences) {
    const s = sRaw.trim();
    if (!s) continue;
    if (s.length > maxLen) {
      // Single huge sentence — hard-split on whitespace.
      if (buf) { chunks.push(buf.trim()); buf = ""; }
      const words = s.split(/\s+/);
      let part = "";
      for (const w of words) {
        if ((part + " " + w).trim().length > maxLen) {
          chunks.push(part.trim());
          part = w;
        } else {
          part = part ? part + " " + w : w;
        }
      }
      if (part) chunks.push(part.trim());
      continue;
    }
    if ((buf + " " + s).trim().length > maxLen) {
      chunks.push(buf.trim());
      buf = s;
    } else {
      buf = buf ? buf + " " + s : s;
    }
  }
  if (buf.trim()) chunks.push(buf.trim());
  return chunks;
}

async function generateTitle(convId: number, userMessage: string, assistantMessage: string, queryClient: ReturnType<typeof useQueryClient>) {
  try {
    const res = await fetch("/api/openai/generate-title", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userMessage, assistantMessage }),
    });
    const { title } = await res.json();
    if (title) {
      await fetch(`/api/openai/conversations/${convId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title }),
      });
      queryClient.invalidateQueries({ queryKey: getListOpenaiConversationsQueryKey() });
    }
  } catch {
  }
}

export function useAvolineChat() {
  const queryClient = useQueryClient();
  // Signed-in users get conversations stored per-user on the API.
  // Guests (anonymous) get conversations stored in browser localStorage so
  // their chat history still survives page reloads. Branching is done by
  // checking `user` — when null, we route everything through the local
  // conversation store and the /openai/anonymous-stream endpoint instead.
  const { user } = useUser();
  const { getToken } = useAuth();
  const { features, loading: tierLoading } = useTier();
  const isGuest = !user;
  // Keep refs so getOrCreateConversation (async) always reads the latest
  // tier state without closing over stale reactive values.
  const tierLoadingRef = useRef(tierLoading);
  const featuresRef = useRef(features);
  tierLoadingRef.current = tierLoading;
  featuresRef.current = features;
  const [messages, setMessages] = useState<Message[]>([]);
  // Server conversations use numeric IDs; guest conversations use strings
  // prefixed with "guest-". A single union covers both.
  const [conversationId, setConversationId] = useState<string | number | null>(null);
  const [isThinking, setIsThinking] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [isTitled, setIsTitled] = useState(false);

  // ─── TTS speech state ───
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isSpeechPaused, setIsSpeechPaused] = useState(false);
  const speechQueueRef = useRef<Promise<void>>(Promise.resolve());
  const activeSourceRef = useRef<AudioBufferSourceNode | null>(null);
  const speakingCountRef = useRef(0);
  const isSpeechPausedRef = useRef(false);
  const generationRef = useRef(0); // bumped to invalidate in-flight TTS when user starts new turn

  const musicRef = useRef<GeneratedMusic | null>(null);
  const musicMsgIdRef = useRef<string | null>(null);
  const [isMusicPlaying, setIsMusicPlaying] = useState(false);
  const createConversation = useCreateOpenaiConversation();

  const stopMusic = () => {
    if (musicRef.current) {
      musicRef.current.stop();
      musicRef.current = null;
      setIsMusicPlaying(false);
      const mid = musicMsgIdRef.current;
      if (mid) {
        setMessages((prev) =>
          prev.map((msg) =>
            msg.id === mid && msg.music
              ? { ...msg, music: { ...msg.music, playing: false } }
              : msg
          )
        );
        musicMsgIdRef.current = null;
      }
    }
  };

  // ─── Continuous, gapless TTS ───
  // Fetch + decode of each chunk starts the instant enqueueSpeak is called,
  // running in parallel with any other in-flight chunks. Playback is still
  // sequential via speechQueueRef, but because the next buffer is usually
  // already decoded by the time the current one finishes, audio plays back
  // continuously with no network-induced gap between chunks.
  const enqueueSpeak = (rawText: string) => {
    const text = cleanForTTS(rawText);
    if (!text) return;
    const gen = generationRef.current;

    // Kick off fetch+decode immediately (in parallel with other chunks).
    const bufferPromise: Promise<AudioBuffer | null> = (async () => {
      try {
        if (gen !== generationRef.current) return null;
        // Pass the browser's preferred language so the server can pick the
        // right voice/accent for natural-sounding pronunciation. The server
        // safely normalizes BCP-47 → ISO-639-1 (e.g. "sn-ZW" → "sn") and
        // builds a language-specific instruction for the TTS model.
        const language =
          typeof navigator !== "undefined"
            ? (navigator.language || (navigator.languages && navigator.languages[0]))
            : undefined;
        const res = await fetch("/api/openai/tts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text, language }),
        });
        if (!res.ok) return null;
        const data = await res.json();
        if (!data.audio_b64) return null;
        if (gen !== generationRef.current) return null;
        const bytes = Uint8Array.from(atob(data.audio_b64), (c) => c.charCodeAt(0));
        const ctx = getTtsCtx();
        return await ctx.decodeAudioData(bytes.buffer.slice(0));
      } catch {
        return null;
      }
    })();

    speakingCountRef.current += 1;
    setIsSpeaking(true);

    speechQueueRef.current = speechQueueRef.current
      .then(async () => {
        const buffer = await bufferPromise;
        if (!buffer || gen !== generationRef.current) return;
        const ctx = getTtsCtx();
        if (ctx.state === "suspended" && !isSpeechPausedRef.current) {
          try { await ctx.resume(); } catch {}
        }
        await new Promise<void>((resolve) => {
          const source = ctx.createBufferSource();
          source.buffer = buffer;
          // Route through the shared gain node for amplified, "loud and clear" output.
          source.connect(getTtsGain());
          activeSourceRef.current = source;
          source.onended = () => {
            try { source.disconnect(); } catch {}
            if (activeSourceRef.current === source) activeSourceRef.current = null;
            resolve();
          };
          try { source.start(0); } catch { resolve(); }
        });
      })
      .catch(() => {
        // swallow — keep the queue draining no matter what
      })
      .finally(() => {
        speakingCountRef.current = Math.max(0, speakingCountRef.current - 1);
        if (speakingCountRef.current === 0) {
          setIsSpeaking(false);
          setIsSpeechPaused(false);
          isSpeechPausedRef.current = false;
        }
      });
  };

  const pauseSpeaking = () => {
    if (!__ttsCtx) return;
    isSpeechPausedRef.current = true;
    setIsSpeechPaused(true);
    __ttsCtx.suspend().catch(() => {});
  };

  const resumeSpeaking = () => {
    if (!__ttsCtx) return;
    isSpeechPausedRef.current = false;
    setIsSpeechPaused(false);
    __ttsCtx.resume().catch(() => {});
  };

  const stopSpeaking = () => {
    generationRef.current += 1; // invalidate in-flight TTS fetches/decodes
    if (activeSourceRef.current) {
      try { activeSourceRef.current.stop(); } catch {}
      try { activeSourceRef.current.disconnect(); } catch {}
      activeSourceRef.current = null;
    }
    speechQueueRef.current = Promise.resolve();
    speakingCountRef.current = 0;
    isSpeechPausedRef.current = false;
    setIsSpeaking(false);
    setIsSpeechPaused(false);
    if (__ttsCtx && __ttsCtx.state === "suspended") {
      __ttsCtx.resume().catch(() => {});
    }
  };

  const getOrCreateConversation = async (): Promise<string | number> => {
    if (conversationId !== null) return conversationId;
    // If a signed-in user fires a message before tier entitlements have
    // resolved, wait briefly so we route to the correct storage path.
    // Guests skip this because there is nothing to resolve.
    if (!isGuest && tierLoadingRef.current) {
      await new Promise<void>((resolve) => {
        const start = Date.now();
        const check = () => {
          if (!tierLoadingRef.current || Date.now() - start > 3000) {
            resolve();
          } else {
            setTimeout(check, 50);
          }
        };
        check();
      });
    }
    const shouldUseLocal = isGuest || !featuresRef.current.cloudSync;
    if (shouldUseLocal) {
      // Guest path (or signed-in user without cloudSync) — persist in
      // localStorage. Title is set after the first user message lands so
      // it's actually meaningful.
      const conv = createLocalConversation();
      setConversationId(conv.id);
      setIsTitled(false);
      return conv.id;
    }
    const res = await createConversation.mutateAsync({ data: { title: "New Conversation" } });
    setConversationId(res.id);
    setIsTitled(false);
    queryClient.invalidateQueries({ queryKey: getListOpenaiConversationsQueryKey() });
    return res.id;
  };

  const loadConversation = (id: string | number, msgs: Message[]) => {
    stopSpeaking();
    setConversationId(id);
    setMessages(msgs);
    setIsTitled(true);
  };

  // Convenience: load a guest conversation straight from localStorage by id.
  const loadLocalConversation = (id: string): boolean => {
    const conv = getLocalConversation(id);
    if (!conv) return false;
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
    return true;
  };

  const startNewConversation = () => {
    stopSpeaking();
    stopMusic();
    setConversationId(null);
    setMessages([]);
    setIsTitled(false);
  };

  const sendMessage = async (content: string) => {
    // Cancel any ongoing speech from a previous turn.
    stopSpeaking();

    // Pre-warm the audio context INSIDE the user-gesture stack frame.
    // iOS Safari (and some Android browsers) refuse to start an
    // AudioContext unless `resume()` is called from within a user
    // gesture. The send button click IS that gesture, but by the time
    // the streamed assistant reply arrives and `enqueueSpeak` runs, the
    // gesture is gone — so iOS would silently swallow the audio.
    // Resuming here keeps the context "live" for the rest of the turn,
    // letting the very first sentence of the answer play out loud the
    // instant it streams in. No-op on browsers that don't need it.
    try {
      const ctx = getTtsCtx();
      if (ctx.state === "suspended") void ctx.resume().catch(() => {});
    } catch { /* ignore — TTS is best-effort */ }

    const id = await getOrCreateConversation();
    const guestConv = typeof id === "string";

    const userMsgId = Date.now().toString();
    const assistMsgId = (Date.now() + 1).toString();

    // Snapshot the prior history BEFORE we mutate state — needed by the guest
    // streaming endpoint, which is fully stateless and expects the full chat
    // log (including the new user turn) on every request.
    const priorHistory = messages.map((m) => ({ role: m.role, content: m.content }));

    setMessages((prev) => [...prev, { id: userMsgId, role: "user", content }]);

    // Guest mode: persist the user turn (and set the title on the very first
    // message) so the conversation survives a reload.
    if (guestConv) {
      const conv = getLocalConversation(id);
      const isFirst = !conv || conv.messages.length === 0;
      appendLocalMessage(id, { id: userMsgId, role: "user", content });
      if (isFirst) setLocalConversationTitle(id, deriveLocalTitle(content));
    }

    const lowerContent = content.toLowerCase();

    // ─── Music generation intent ───
    if (/\b(generate|create|make|play|compose)\b.*\b(song|music|melody|tune|track|beat|sound)\b/i.test(content) ||
        /\b(song|music|melody|tune|track|beat)\b.*\b(generate|create|make|play|compose)\b/i.test(content) ||
        /^play\s+(a|some|me)\s+/i.test(content)) {
      setMessages((prev) => [
        ...prev,
        { id: assistMsgId, role: "assistant", content: "Composing your music...", isStreaming: true },
      ]);
      setIsThinking(true);
      try {
        stopMusic();
        const music = generateMusic(content, 45);
        musicRef.current = music;
        musicMsgIdRef.current = assistMsgId;
        setIsMusicPlaying(true);
        setIsThinking(false);
        const caption = `Now playing a 45-second ${music.mood} composition. Say "stop" or click stop to end it.`;
        setMessages((prev) =>
          prev.map((msg) =>
            msg.id === assistMsgId
              ? {
                  ...msg,
                  content: caption,
                  isStreaming: false,
                  music: {
                    mood: music.mood,
                    playing: true,
                    prompt: music.prompt,
                    seed: music.seed,
                    durationSec: music.durationSec,
                  },
                }
              : msg
          )
        );
        music.finished.then(() => {
          setMessages((prev) =>
            prev.map((msg) =>
              msg.id === assistMsgId && msg.music
                ? { ...msg, music: { ...msg.music, playing: false } }
                : msg
            )
          );
          if (musicRef.current === music) {
            musicRef.current = null;
            setIsMusicPlaying(false);
          }
        });
        if (guestConv) {
          // Persist the music turn so it shows up after a reload (without
          // the live `playing` flag — playback can't survive a refresh).
          appendLocalMessage(id, {
            id: assistMsgId,
            role: "assistant",
            content: caption,
            music: {
              mood: music.mood,
              playing: false,
              prompt: music.prompt,
              seed: music.seed,
              durationSec: music.durationSec,
            },
          });
        } else if (!isTitled) {
          setIsTitled(true);
          generateTitle(id as number, content, caption, queryClient);
        }
      } catch {
        setIsThinking(false);
        setMessages((prev) =>
          prev.map((msg) =>
            msg.id === assistMsgId ? { ...msg, content: "Sorry, I couldn't generate music.", isStreaming: false } : msg
          )
        );
      }
      return;
    }

    // ─── Stop music intent ───
    if (
      musicRef.current &&
      /\b(stop|cancel|pause|silence|enough|quiet|shut\s*up|end)\b/i.test(content)
    ) {
      stopMusic();
      setMessages((prev) => [
        ...prev,
        { id: assistMsgId, role: "assistant", content: "Music stopped.", isStreaming: false },
      ]);
      return;
    }

    // ─── Image generation intent ───
    // Three flavors of phrasings we accept:
    //   1) Verbs that alone imply visual creation: "draw a cat", "sketch a robot",
    //      "paint a sunset", "illustrate a forest".
    //   2) Generic creation verbs paired with a visual-noun:
    //      "generate an image", "create a picture", "make me a quick render",
    //      "render an image", "produce an illustration", "imagine a logo of...",
    //      "show me a picture of...".
    //   3) Bare visual-noun followed by "of":
    //      "image of a cat", "picture of a sunset", "photo of...", etc.
    const visualVerbAlone =
      /\b(?:draw|sketch|paint|illustrate)\b/i;
    const verbPlusVisualNoun =
      /\b(?:generate|create|make|produce|design|render|imagine|show me)\b[^.?!]{0,60}\b(?:image|picture|photo|illustration|artwork|drawing|render|logo|poster|wallpaper|icon|portrait)s?\b/i;
    const visualNounOf =
      /\b(?:image|picture|photo|illustration|artwork|drawing|render|logo|poster|wallpaper|portrait)s?\s+of\b/i;
    if (
      visualVerbAlone.test(content) ||
      verbPlusVisualNoun.test(content) ||
      visualNounOf.test(content)
    ) {
      setMessages((prev) => [
        ...prev,
        { id: assistMsgId, role: "assistant", content: "Generating your image...", isStreaming: true },
      ]);
      setIsThinking(true);

      // Stream progressive partial images so the user sees a preview within
      // ~3s instead of waiting for the full render. Falls back to the
      // non-streaming endpoint on any error so we never regress UX.
      let finalDataUrl: string | null = null;
      let lastDataUrl: string | null = null;
      let finalFormat = "jpeg";
      try {
        // Auth: signed-in users need a Clerk bearer; guests get tier=free.
        const headers: Record<string, string> = { "Content-Type": "application/json" };
        if (!guestConv) {
          try {
            const token = await getToken();
            if (token) headers["Authorization"] = `Bearer ${token}`;
          } catch { /* fall through */ }
        }
        const resp = await fetch("/api/openai/generate-image-stream", {
          method: "POST",
          credentials: "include",
          headers,
          body: JSON.stringify({ prompt: content, size: "1024x1024" }),
        });
        if (!resp.ok || !resp.body) {
          throw new Error(`stream ${resp.status}`);
        }
        const reader = resp.body.getReader();
        const decoder = new TextDecoder();
        let buf = "";
        let sawAny = false;
        let streamErr: string | null = null;
        outer: while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          // Normalize CRLF -> LF so SSE parsing works regardless of proxy.
          buf += decoder.decode(value, { stream: true }).replace(/\r\n/g, "\n");
          const parts = buf.split("\n\n");
          buf = parts.pop() ?? "";
          for (const part of parts) {
            // SSE allows multiple `data:` lines per event — concatenate them.
            const dataLines = part
              .split("\n")
              .filter((l) => l.startsWith("data:"))
              .map((l) => l.slice(5).replace(/^ /, ""));
            if (dataLines.length === 0) continue;
            const payload = dataLines.join("\n");
            let ev: { type?: string; b64?: string; format?: string; error?: string };
            try {
              ev = JSON.parse(payload);
            } catch {
              continue;
            }
            if (ev.type === "error") {
              streamErr = ev.error || "stream error";
              break outer;
            }
            if ((ev.type === "partial" || ev.type === "done") && ev.b64) {
              sawAny = true;
              const fmt = ev.format || "jpeg";
              finalFormat = fmt;
              const dataUrl = `data:image/${fmt};base64,${ev.b64}`;
              lastDataUrl = dataUrl;
              if (ev.type === "done") finalDataUrl = dataUrl;
              setIsThinking(false);
              setMessages((prev) =>
                prev.map((msg) =>
                  msg.id === assistMsgId
                    ? { ...msg, imageUrl: dataUrl, imagePrompt: content }
                    : msg,
                ),
              );
            }
          }
        }
        if (streamErr) throw new Error(streamErr);
        if (!sawAny) throw new Error("no events");

        // Fallback: if the stream ended without an explicit "done" event,
        // promote the last partial we received so persistence still works.
        if (!finalDataUrl) {
          if (!lastDataUrl) throw new Error("no final image");
          finalDataUrl = lastDataUrl;
        }
      } catch {
        // Fallback to the original (non-streaming) endpoint.
        try {
          const imgRes = await generateOpenaiImage({ prompt: content, size: "1024x1024" });
          finalDataUrl = `data:image/png;base64,${imgRes.b64_json}`;
          finalFormat = "png";
          setMessages((prev) =>
            prev.map((msg) =>
              msg.id === assistMsgId
                ? { ...msg, imageUrl: finalDataUrl!, imagePrompt: content }
                : msg,
            ),
          );
        } catch {
          setIsThinking(false);
          const errText = "Sorry, I failed to generate the image.";
          setMessages((prev) =>
            prev.map((msg) =>
              msg.id === assistMsgId ? { ...msg, content: errText, isStreaming: false } : msg,
            ),
          );
          return;
        }
      }

      setIsThinking(false);
      const caption = "Here is the image you requested.";
      setMessages((prev) =>
        prev.map((msg) =>
          msg.id === assistMsgId
            ? { ...msg, content: caption, isStreaming: false }
            : msg,
        ),
      );
      enqueueSpeak(caption);
      if (guestConv && finalDataUrl) {
        appendLocalMessage(id, {
          id: assistMsgId,
          role: "assistant",
          content: caption,
          imageUrl: finalDataUrl,
          imagePrompt: content,
        });
      } else if (!guestConv && !isTitled) {
        setIsTitled(true);
        generateTitle(id as number, content, caption, queryClient);
      }
      return;
    }

    setMessages((prev) => [
      ...prev,
      { id: assistMsgId, role: "assistant", content: "", isStreaming: true },
    ]);
    setIsThinking(true);

    // Sentence-level streaming TTS state for this turn
    let totalStreamed = "";
    let ttsBuffer = "";
    let firstChunkSpoken = false;

    const flushSentences = (force: boolean) => {
      // Don't speak text inside an open code/action block (odd # of ``` so far)
      const fences = (totalStreamed.match(/```/g) || []).length;
      const inOpenCodeBlock = fences % 2 === 1;
      if (inOpenCodeBlock && !force) return;

      // ── Fast first chunk ──
      // For the VERY first piece of audio of the turn, keep it SHORT
      // (≤ ~100 chars) so the network round-trip to /api/openai/tts and
      // the audio decode happen in a fraction of a second. This is what
      // makes the assistant feel like it's speaking the instant the
      // answer arrives — especially on Android Chrome where the TTS
      // round-trip dominates perceived latency. Even if the model bursts
      // a full long sentence in one chunk, we cap here. After this first
      // chunk, normal full-sentence boundaries take over for natural
      // prosody on the rest of the response.
      if (!firstChunkSpoken) {
        const buf = ttsBuffer;
        const FIRST_CAP = 100;
        let cut = -1;

        // Prefer a sentence boundary that fits inside the cap.
        const sentInCap = buf.slice(0, FIRST_CAP).match(/^([\s\S]*?[.!?])(\s+|$)/);
        if (sentInCap) {
          cut = sentInCap[1].length;
        } else {
          // Otherwise the earliest clause break (,;:—–) after ≥30 chars
          // and inside the cap.
          for (let i = 30; i < Math.min(buf.length, FIRST_CAP); i++) {
            const ch = buf[i];
            if (ch === "," || ch === ";" || ch === ":" || ch === "—" || ch === "–") {
              cut = i + 1;
              break;
            }
          }
          // Or fall back to a word boundary inside the cap once we have
          // enough content to be worth speaking.
          if (cut < 0 && buf.length >= 60) {
            const ws = buf.lastIndexOf(" ", FIRST_CAP);
            if (ws >= 30) cut = ws;
            else if (buf.length >= FIRST_CAP) cut = FIRST_CAP; // hard cap
          }
        }

        if (cut > 0) {
          const head = buf.slice(0, cut).trim();
          if (head) {
            ttsBuffer = buf.slice(cut);
            firstChunkSpoken = true;
            enqueueSpeak(head);
          }
        } else if (force && buf.trim().length > 0) {
          // Stream finished before any natural break — still speak it.
          firstChunkSpoken = true;
          ttsBuffer = "";
          enqueueSpeak(buf);
          return;
        } else {
          // Not enough text yet AND not forced — wait for the next chunk.
          return;
        }
      }

      const SENT_RE = /^([\s\S]*?[.!?])(\s+|$)/;
      while (true) {
        const m = ttsBuffer.match(SENT_RE);
        if (!m) break;
        const sentence = m[1];
        ttsBuffer = ttsBuffer.slice(m[0].length);
        enqueueSpeak(sentence);
      }
      if (force && ttsBuffer.trim().length > 0) {
        enqueueSpeak(ttsBuffer);
        ttsBuffer = "";
      }
    };

    try {
      // Guests use the stateless anonymous endpoint and ship the full chat
      // log on every request. Signed-in users hit the per-conversation
      // endpoint which loads history from the DB on the server side.
      // Signed-in users MUST send the Clerk bearer token on the streaming
      // POST or the server replies 401 — which means no assistant turn is
      // generated AND nothing is persisted, so reopening the conversation
      // later shows nothing. Attach the token before firing.
      const authHeaders: Record<string, string> = { "Content-Type": "application/json" };
      if (!guestConv) {
        try {
          const token = await getToken();
          if (token) authHeaders["Authorization"] = `Bearer ${token}`;
        } catch {
          // Fall through — server will return 401 and we surface it below.
        }
      }
      const response = guestConv
        ? await fetch(`/api/openai/anonymous-stream`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              messages: [...priorHistory, { role: "user", content }],
            }),
          })
        : await fetch(`/api/openai/conversations/${id}/messages`, {
            method: "POST",
            credentials: "include",
            headers: authHeaders,
            body: JSON.stringify({ content }),
          });

      if (!response.body) throw new Error("No body");
      setIsThinking(false);

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let fullResponse = "";
      let buffer = "";

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          if (line.startsWith("data: ") && line.length > 6) {
            try {
              const data = JSON.parse(line.slice(6));

              if (data.status === "searching") {
                setIsSearching(true);
              }

              if (data.content) {
                setIsSearching(false);
                fullResponse += data.content;
                totalStreamed += data.content;
                ttsBuffer += data.content;
                setMessages((prev) =>
                  prev.map((msg) =>
                    msg.id === assistMsgId
                      ? { ...msg, content: msg.content + data.content }
                      : msg
                  )
                );
                flushSentences(false);
              }
              if (data.done) {
                setIsSearching(false);
                setMessages((prev) =>
                  prev.map((msg) =>
                    msg.id === assistMsgId ? { ...msg, isStreaming: false } : msg
                  )
                );
                flushSentences(true);
                if (guestConv) {
                  // Persist the completed assistant turn locally so reload
                  // restores the full transcript.
                  appendLocalMessage(id, {
                    id: assistMsgId,
                    role: "assistant",
                    content: fullResponse,
                  });
                } else if (!isTitled) {
                  setIsTitled(true);
                  generateTitle(id as number, content, fullResponse, queryClient);
                }
              }
            } catch {
            }
          }
        }
      }
    } catch {
      setIsThinking(false);
      setIsSearching(false);
      const errText = "Sorry, I encountered an error. Please try again.";
      setMessages((prev) =>
        prev.map((msg) =>
          msg.id === assistMsgId ? { ...msg, isStreaming: false, content: errText } : msg
        )
      );
    }
  };

  const { state: recorderState, startRecording, stopRecording } = useVoiceRecorder();
  const isRecording = recorderState === "recording";

  const toggleVoice = async () => {
    if (isRecording) {
      const blob = await stopRecording();
      if (!blob || blob.size === 0) return;

      setIsTranscribing(true);
      try {
        const arrayBuffer = await blob.arrayBuffer();
        const bytes = new Uint8Array(arrayBuffer);
        let binary = "";
        for (let i = 0; i < bytes.byteLength; i++) {
          binary += String.fromCharCode(bytes[i]);
        }
        const base64 = btoa(binary);

        // Pass the browser's preferred language as an ISO-639-1 hint so
        // Whisper can correctly transcribe low-resource languages like
        // Shona ("sn"), Ndebele, Swahili, etc. The server normalizes the
        // BCP-47 tag (e.g. "sn-ZW" → "sn") before forwarding to Whisper.
        // When the user's browser language doesn't match what they're
        // actually speaking, Whisper still does its own auto-detection
        // pass, so this is a safe hint, not a hard filter.
        const language =
          typeof navigator !== "undefined"
            ? (navigator.language || (navigator.languages && navigator.languages[0]))
            : undefined;

        const res = await fetch("/api/openai/transcribe", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ audio: base64, language }),
        });
        const { transcript } = await res.json();
        setIsTranscribing(false);

        if (transcript?.trim()) {
          await sendMessage(transcript);
        }
      } catch {
        setIsTranscribing(false);
      }
    } else {
      startRecording();
    }
  };

  /**
   * Public helper: queue arbitrary text to be read aloud right now.
   * Cancels anything currently being spoken first so we don't overlap.
   * Long text is split into sentence-aligned chunks so big conversations
   * play through completely, loud and clear.
   */
  const speakText = (text: string) => {
    stopSpeaking();
    const cleaned = cleanForTTS(text);
    if (!cleaned) return;
    // Pre-warm the audio context inside the user gesture so the first buffer
    // can play with zero context-resume latency once it arrives.
    try {
      const ctx = getTtsCtx();
      if (ctx.state === "suspended") ctx.resume().catch(() => {});
    } catch {}
    // Fast chunker → tiny first chunk (≈1 sentence) so audio starts almost
    // instantly; the rest of the conversation streams in behind it in parallel.
    const chunks = chunkForTTSFast(cleaned);
    for (const chunk of chunks) enqueueSpeak(chunk);
  };

  return {
    messages,
    sendMessage,
    isThinking,
    isSearching,
    isListening: isRecording || isTranscribing,
    isTranscribing,
    toggleVoice,
    isRecording,
    conversationId,
    loadConversation,
    startNewConversation,
    stopMusic,
    isMusicPlaying,
    isSpeaking,
    isSpeechPaused,
    pauseSpeaking,
    resumeSpeaking,
    stopSpeaking,
    speakText,
  };
}
