import { useSyncExternalStore } from "react";
import {
  listLocalConversations,
  subscribeLocalConversations,
  type LocalConversation,
} from "@/lib/local-conversations";

// React-friendly view of guest conversations. useSyncExternalStore re-renders
// the consumer whenever a writer mutates the store (in this tab via custom
// event, or in another tab via the native storage event).
//
// We cache the result inside a closure ref so the snapshot is stable between
// renders that don't follow a real change — useSyncExternalStore requires
// reference-equal snapshots when nothing has changed, otherwise React loops.
export function useLocalConversations(): LocalConversation[] {
  return useSyncExternalStore(
    subscribeLocalConversations,
    getCachedSnapshot,
    getServerSnapshot,
  );
}

let cached: LocalConversation[] = [];
let cachedKey = "";

function getCachedSnapshot(): LocalConversation[] {
  const fresh = listLocalConversations();
  // Stable key based on id + updatedAt so unchanged data returns the same array.
  const key = fresh.map((c) => `${c.id}:${c.updatedAt}:${c.messages.length}`).join("|");
  if (key !== cachedKey) {
    cached = fresh;
    cachedKey = key;
  }
  return cached;
}

function getServerSnapshot(): LocalConversation[] {
  return [];
}
