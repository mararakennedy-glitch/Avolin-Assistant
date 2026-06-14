// Resolve a Clerk user's billing tier by looking up their most recent paid
// PayNow subscription that has not yet expired. Cached briefly per-user to
// avoid hammering the DB on every API call. Used by the `requireTier`
// middleware and by GET /api/me/tier.

import { db } from "@workspace/db";
import { subscriptions } from "@workspace/db/schema";
import { and, desc, eq } from "drizzle-orm";

export type Tier = "basic" | "core" | "elite";
export const TIER_RANK: Record<Tier, number> = { basic: 0, core: 1, elite: 2 };

const CACHE_TTL_MS = 30_000;
type CacheEntry = { tier: Tier; expiresAt: number };
const cache = new Map<string, CacheEntry>();

function isTier(v: string): v is Tier {
  return v === "basic" || v === "core" || v === "elite";
}

export async function getUserTier(userId: string | null | undefined): Promise<Tier> {
  if (!userId) return "basic";

  const cached = cache.get(userId);
  if (cached && cached.expiresAt > Date.now()) return cached.tier;

  let tier: Tier = "basic";
  try {
    // Pull every paid subscription this user has ever had; pick the one with
    // the highest rank that is still inside its access window. We sort by
    // expiresAt desc so the newest paid window wins ties.
    const rows = await db
      .select()
      .from(subscriptions)
      .where(and(eq(subscriptions.userId, userId), eq(subscriptions.paid, true)))
      .orderBy(desc(subscriptions.expiresAt));
    const now = Date.now();
    let bestRank = 0;
    for (const row of rows) {
      if (!row.tier || !isTier(row.tier)) continue;
      if (!row.expiresAt) continue;
      if (row.expiresAt.getTime() < now) continue;
      const rank = TIER_RANK[row.tier];
      if (rank > bestRank) {
        bestRank = rank;
        tier = row.tier;
      }
    }
  } catch {
    // On any failure, default to basic so the user is never locked out
    // unjustly. Gating decisions stay safe-by-default.
    tier = "basic";
  }

  cache.set(userId, { tier, expiresAt: Date.now() + CACHE_TTL_MS });
  return tier;
}

export function invalidateTier(userId: string): void {
  cache.delete(userId);
}

export function meetsTier(actual: Tier, min: Tier): boolean {
  return TIER_RANK[actual] >= TIER_RANK[min];
}
