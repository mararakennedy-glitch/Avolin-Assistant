// Express middleware that enforces a minimum subscription tier on a route.
// Usage:
//   router.post("/something", requireTier("core"), handler)
//
// Returns 401 if the user is not signed in, 402 (Payment Required) if their
// tier is below the minimum.

import type { Request, Response, NextFunction } from "express";
import { getUserTier, meetsTier, type Tier } from "../lib/userTier";

export function requireTier(min: Tier) {
  return async function (req: Request, res: Response, next: NextFunction) {
    const auth = (req as any).auth;
    const userId: string | undefined = auth?.userId;
    if (!userId) {
      res.status(401).json({ error: "Sign in required", code: "auth_required" });
      return;
    }
    try {
      const tier = await getUserTier(userId);
      if (!meetsTier(tier, min)) {
        res.status(402).json({
          error: `Upgrade required. This feature is available on Avolin ${min === "elite" ? "Elite" : "Core"} and above.`,
          code: "upgrade_required",
          required: min,
          current: tier,
        });
        return;
      }
      (req as any).userTier = tier;
      next();
    } catch (err: any) {
      res.status(500).json({ error: "Tier check failed" });
    }
  };
}
