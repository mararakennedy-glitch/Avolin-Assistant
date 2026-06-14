// Browser-local conversation store for guest (signed-out) users.
//
// Signed-in users get per-user conversations on the API server. Guests do
// NOT, but we still want their chat history to survive page reloads — so we
// persist it to localStorage. This file is the single owner of that data.
//
// Storage layout (single JSON blob under one key so we get atomic writes):
//   {
//     version: 1,
//     conversations: [
//       { id, title, createdAt, updatedAt, messages: [{id, role, content, imageUrl?, music?}] },
//       ...
//     ]
//   }
//
// IDs are strings prefixed with "guest-" to distinguish them from server
// numeric IDs (so the chat hook can branch with a single typeof check).

const STORAGE_KEY = "avolin:guest:conversations";
const MAX_CONVERSATIONS = 30;
const MAX_MESSAGES_PER_CONV = 200;
const CHANGE_EVENT = "avolin:local-conv-changed";

export type LocalMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  imageUrl?: string;
  imagePrompt?: string;
  music?: {
    mood: string;
    playing: boolean;
    prompt?: string;
    seed?: number;
    durationSec?: number;
  };
};

export type LocalConversation = {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  messages: LocalMessage[];
};

type Store = {
  version: 1;
  conversations: LocalConversation[];
};

function emptyStore(): Store {
  return { version: 1, conversations: [] };
}

function readStore(): Store {
  if (typeof window === "undefined") return emptyStore();
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return emptyStore();
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || !Array.isArray(parsed.conversations)) {
      return emptyStore();
    }
    // Defensive: drop anything that doesn't look like a conversation.
    const safe: LocalConversation[] = [];
    for (const c of parsed.conversations) {
      if (
        c && typeof c === "object" &&
        typeof c.id === "string" &&
        typeof c.title === "string" &&
        Array.isArray(c.messages)
      ) {
        safe.push({
          id: c.id,
          title: c.title,
          createdAt: typeof c.createdAt === "number" ? c.createdAt : Date.now(),
          updatedAt: typeof c.updatedAt === "number" ? c.updatedAt : Date.now(),
          messages: c.messages
            .filter((m: any) =>
              m && typeof m === "object" &&
              typeof m.id === "string" &&
              (m.role === "user" || m.role === "assistant") &&
              typeof m.content === "string"
            )
            .map((m: any) => ({
              id: m.id,
              role: m.role,
              content: m.content,
              ...(typeof m.imageUrl === "string" ? { imageUrl: m.imageUrl } : {}),
              ...(typeof m.imagePrompt === "string" ? { imagePrompt: m.imagePrompt } : {}),
              ...(m.music && typeof m.music === "object"
                ? {
                    music: {
                      mood: String(m.music.mood ?? ""),
                      playing: false,
                      ...(typeof m.music.prompt === "string" ? { prompt: m.music.prompt } : {}),
                      ...(typeof m.music.seed === "number" ? { seed: m.music.seed } : {}),
                      ...(typeof m.music.durationSec === "number"
                        ? { durationSec: m.music.durationSec }
                        : {}),
                    },
                  }
                : {}),
            })),
        });
      }
    }
    return { version: 1, conversations: safe };
  } catch {
    return emptyStore();
  }
}

function writeStore(store: Store): void {
  if (typeof window === "undefined") return;
  try {
    // Cap the conversation list — drop the oldest when we go over the limit.
    if (store.conversations.length > MAX_CONVERSATIONS) {
      store.conversations.sort((a, b) => b.updatedAt - a.updatedAt);
      store.conversations = store.conversations.slice(0, MAX_CONVERSATIONS);
    }
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
    // Notify subscribers in this tab. (Other tabs get the native "storage" event.)
    window.dispatchEvent(new CustomEvent(CHANGE_EVENT));
  } catch (err) {
    // Quota exceeded or storage disabled — best-effort fallback: keep going,
    // the user can still chat in this tab even if persistence fails.
    console.warn("[avolin] failed to write guest conversations", err);
  }
}

function newId(): string {
  const rand =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? (crypto as any).randomUUID().slice(0, 8)
      : Math.random().toString(36).slice(2, 10);
  return `guest-${Date.now().toString(36)}-${rand}`;
}

export function isLocalConversationId(id: unknown): id is string {
  return typeof id === "string" && id.startsWith("guest-");
}

export function listLocalConversations(): LocalConversation[] {
  const { conversations } = readStore();
  // Newest first.
  return [...conversations].sort((a, b) => b.updatedAt - a.updatedAt);
}

export function getLocalConversation(id: string): LocalConversation | null {
  const { conversations } = readStore();
  return conversations.find((c) => c.id === id) ?? null;
}

export function createLocalConversation(title = "New Conversation"): LocalConversation {
  const now = Date.now();
  const conv: LocalConversation = {
    id: newId(),
    title,
    createdAt: now,
    updatedAt: now,
    messages: [],
  };
  const store = readStore();
  store.conversations.push(conv);
  writeStore(store);
  return conv;
}

export function appendLocalMessage(convId: string, message: LocalMessage): void {
  const store = readStore();
  const conv = store.conversations.find((c) => c.id === convId);
  if (!conv) return;
  conv.messages.push(message);
  if (conv.messages.length > MAX_MESSAGES_PER_CONV) {
    // Drop oldest to keep the conversation manageable.
    conv.messages = conv.messages.slice(-MAX_MESSAGES_PER_CONV);
  }
  conv.updatedAt = Date.now();
  writeStore(store);
}

// Replace the contents of an existing message (used while streaming so the
// final assistant text is persisted, not the partial chunks).
export function updateLocalMessage(
  convId: string,
  messageId: string,
  patch: Partial<Omit<LocalMessage, "id" | "role">>,
): void {
  const store = readStore();
  const conv = store.conversations.find((c) => c.id === convId);
  if (!conv) return;
  const msg = conv.messages.find((m) => m.id === messageId);
  if (!msg) return;
  if (typeof patch.content === "string") msg.content = patch.content;
  if (typeof patch.imageUrl === "string") msg.imageUrl = patch.imageUrl;
  if (typeof patch.imagePrompt === "string") msg.imagePrompt = patch.imagePrompt;
  if (patch.music) {
    msg.music = {
      mood: patch.music.mood,
      playing: false,
      ...(typeof patch.music.prompt === "string" ? { prompt: patch.music.prompt } : {}),
      ...(typeof patch.music.seed === "number" ? { seed: patch.music.seed } : {}),
      ...(typeof patch.music.durationSec === "number"
        ? { durationSec: patch.music.durationSec }
        : {}),
    };
  }
  conv.updatedAt = Date.now();
  writeStore(store);
}

export function setLocalConversationTitle(convId: string, title: string): void {
  const store = readStore();
  const conv = store.conversations.find((c) => c.id === convId);
  if (!conv) return;
  conv.title = title.trim().slice(0, 80) || "New Conversation";
  conv.updatedAt = Date.now();
  writeStore(store);
}

export function deleteLocalConversation(convId: string): void {
  const store = readStore();
  const before = store.conversations.length;
  store.conversations = store.conversations.filter((c) => c.id !== convId);
  if (store.conversations.length !== before) writeStore(store);
}

// Subscribe to changes (in this tab via custom event, in other tabs via the
// native storage event). Returns an unsubscribe function. Used by the React
// hook below to keep components in sync with the store.
export function subscribeLocalConversations(cb: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  const onLocal = () => cb();
  const onStorage = (e: StorageEvent) => {
    if (e.key === STORAGE_KEY || e.key === null) cb();
  };
  window.addEventListener(CHANGE_EVENT, onLocal);
  window.addEventListener("storage", onStorage);
  return () => {
    window.removeEventListener(CHANGE_EVENT, onLocal);
    window.removeEventListener("storage", onStorage);
  };
}

// Quick title heuristic for guest conversations (signed-in convs use the
// LLM-generated title API). Strips markdown-ish noise and trims to ~50 chars.
export function deriveLocalTitle(firstUserMessage: string): string {
  const cleaned = firstUserMessage
    .replace(/[`*_#>]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (cleaned.length <= 50) return cleaned || "New Conversation";
  return cleaned.slice(0, 47).trimEnd() + "...";
}
