// Lightweight "who am I" endpoint for the frontend. Returns the user's
// current Avolin tier (basic | core | elite) and a few helpful flags.
// Frontend can cache the result and call invalidate after a checkout.

import { Router } from "express";
import { getUserTier, TIER_RANK, type Tier } from "../lib/userTier";

const router = Router();

router.get("/me/tier", async (req, res) => {
  const auth = (req as any).auth;
  const userId: string | undefined = auth?.userId;
  if (!userId) {
    res.json({ tier: "basic" as Tier, signedIn: false });
    return;
  }
  try {
    const tier = await getUserTier(userId);
    res.json({
      tier,
      signedIn: true,
      rank: TIER_RANK[tier],
      features: {
        hdImage: TIER_RANK[tier] >= TIER_RANK.core,
        ultraImage: TIER_RANK[tier] >= TIER_RANK.elite,
        longMusic: TIER_RANK[tier] >= TIER_RANK.core,
        cloudSync: TIER_RANK[tier] >= TIER_RANK.core,
      },
    });
  } catch {
    res.json({ tier: "basic" as Tier, signedIn: true });
  }
});

export default router;
