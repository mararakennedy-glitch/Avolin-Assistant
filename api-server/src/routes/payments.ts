// PayPal payment routes for Avolin tier upgrades.
//
// Flow:
//   1. POST /api/payments/checkout       — user picks a tier; we create a
//      pending subscription row, ask PayPal to create an Order, and return
//      the PayPal "approve" URL. The frontend redirects the user there.
//   2. GET  /api/payments/status/:ref    — frontend polls this after the
//      user returns from PayPal. If the matching order is APPROVED but not
//      yet captured we capture it now; if it's COMPLETED we mark the
//      subscription paid.
//
// Money paid by customers lands in whatever PayPal merchant account owns
// the PAYPAL_CLIENT_ID / PAYPAL_CLIENT_SECRET pair (mararakennedy@gmail.com
// for production). PayPal handles the entire payment UI — we never touch
// card numbers.

import { Router, type Request, type Response } from "express";
import { getAuth } from "@clerk/express";
import { db } from "@workspace/db";
import { subscriptions, type Subscription } from "@workspace/db/schema";
import { and, eq } from "drizzle-orm";
import {
  captureOrder,
  createOrder,
  getOrder,
  getPaypalMode,
  getPublicBaseUrl,
  isPaypalConfigured,
} from "../lib/paypalClient";
import { invalidateTier } from "../lib/userTier";

const router: Router = Router();

const TIER_PRICES = {
  core: { amount: 10, label: "Avolin Core (1 month)", days: 30 },
  elite: { amount: 90, label: "Avolin Elite (1 year)", days: 365 },
} as const;

type TierKey = keyof typeof TIER_PRICES;

function isTierKey(v: unknown): v is TierKey {
  return v === "core" || v === "elite";
}

function newReference(userId: string, tier: TierKey): string {
  const ts = Date.now().toString(36);
  const rand = Math.random().toString(36).slice(2, 6);
  const userTail = userId.slice(-6);
  return `AVL-${tier.toUpperCase()}-${ts}-${rand}-${userTail}`;
}

router.get("/payments/config", (_req, res) => {
  res.json({
    provider: "paypal",
    mode: getPaypalMode(),
    configured: isPaypalConfigured(),
    currency: "USD",
    tiers: {
      core: { amount: TIER_PRICES.core.amount, days: TIER_PRICES.core.days },
      elite: { amount: TIER_PRICES.elite.amount, days: TIER_PRICES.elite.days },
    },
  });
});

router.post("/payments/checkout", async (req: Request, res: Response) => {
  const auth = getAuth(req);
  const userId = auth.userId;
  if (!userId) {
    res.status(401).json({ error: "Sign in required to upgrade." });
    return;
  }
  if (!isPaypalConfigured()) {
    res.status(503).json({
      error:
        "Payments are not configured yet. The site owner needs to add their PayPal credentials.",
    });
    return;
  }

  const body = (req.body ?? {}) as { tier?: unknown; email?: unknown };
  if (!isTierKey(body.tier)) {
    res.status(400).json({ error: "Invalid tier. Choose 'core' or 'elite'." });
    return;
  }
  const tier = body.tier;
  const email =
    typeof body.email === "string" && body.email.includes("@")
      ? body.email.trim()
      : "";

  const cfg = TIER_PRICES[tier];
  const reference = newReference(userId, tier);
  const baseUrl = getPublicBaseUrl(req);

  // Persist the pending subscription up-front so the status poller can find
  // the row by reference even if the user closes their tab mid-flow.
  await db.insert(subscriptions).values({
    userId,
    tier,
    reference,
    status: "pending",
    paid: false,
    amountUsd: cfg.amount.toFixed(2),
    email: email || null,
  });

  try {
    const order = await createOrder({
      reference,
      amountUsd: cfg.amount,
      description: cfg.label,
      // After paying we send the user back to the home page (the assistant)
      // — that's where they actually use Avolin, so we celebrate the upgrade
      // there rather than dumping them on /upgrade. The home page detects
      // these params, confirms the payment, refreshes the tier, and shows a
      // welcome banner. We leave the cancel URL on /upgrade so the user can
      // immediately retry without having to re-navigate.
      returnUrl: `${baseUrl}/?payment=success&ref=${encodeURIComponent(reference)}&tier=${encodeURIComponent(tier)}`,
      cancelUrl: `${baseUrl}/upgrade?payment=cancelled&ref=${encodeURIComponent(reference)}`,
    });

    // Stash the PayPal order ID alongside the row so the status poller can
    // capture it later. We re-use the existing pollUrl column to avoid a
    // schema migration — the value is now an order ID, not a URL.
    await db
      .update(subscriptions)
      .set({ pollUrl: order.id, updatedAt: new Date() })
      .where(eq(subscriptions.reference, reference));

    res.json({ mode: "redirect", reference, url: order.approveUrl });
  } catch (err: any) {
    req.log?.error({ err }, "PayPal checkout failed");
    await db
      .update(subscriptions)
      .set({ status: "failed", updatedAt: new Date() })
      .where(eq(subscriptions.reference, reference));
    res
      .status(502)
      .json({ error: err?.message ?? "Couldn't start the PayPal checkout." });
  }
});

// Atomic mark-paid. The WHERE includes paid=false so concurrent calls
// (e.g. two browser tabs both polling status) can't double-extend access —
// only the first writer wins and subsequent calls return the already-paid
// row unchanged.
async function markPaid(row: Subscription): Promise<Subscription> {
  if (row.paid) return row;
  const tier = row.tier as TierKey;
  const cfg = TIER_PRICES[tier];
  if (!cfg) return row;
  const startsAt = new Date();
  const expiresAt = new Date(startsAt.getTime() + cfg.days * 24 * 60 * 60 * 1000);
  const updated = await db
    .update(subscriptions)
    .set({
      paid: true,
      status: "paid",
      startsAt,
      expiresAt,
      updatedAt: new Date(),
    })
    .where(and(eq(subscriptions.reference, row.reference), eq(subscriptions.paid, false)))
    .returning();
  if (updated.length === 0) {
    const [fresh] = await db
      .select()
      .from(subscriptions)
      .where(eq(subscriptions.reference, row.reference));
    return fresh ?? row;
  }
  invalidateTier(row.userId);
  return updated[0]!;
}

// Defence-in-depth: even after PayPal says an order is COMPLETED, refuse to
// credit the row unless the order's reference_id and amount match what we
// stored. Prevents a captured-but-mis-routed order from upgrading the wrong
// account.
function orderMatchesRow(order: { reference: string | null; amountUsd: number | null }, row: Subscription): boolean {
  if (order.reference && order.reference !== row.reference) return false;
  if (order.amountUsd != null) {
    const expected = Number(row.amountUsd);
    if (!Number.isFinite(expected)) return false;
    if (Math.abs(order.amountUsd - expected) > 0.01) return false;
  }
  return true;
}

router.get("/payments/status/:ref", async (req: Request, res: Response) => {
  const auth = getAuth(req);
  const userId = auth.userId;
  if (!userId) {
    res.status(401).json({ error: "Sign in required" });
    return;
  }
  const reference = req.params["ref"];
  if (!reference) {
    res.status(400).json({ error: "Missing reference" });
    return;
  }
  const [row] = await db
    .select()
    .from(subscriptions)
    .where(and(eq(subscriptions.reference, reference), eq(subscriptions.userId, userId)));
  if (!row) {
    res.status(404).json({ error: "Payment not found" });
    return;
  }

  // If we still have an order ID and the row is not yet paid, ask PayPal
  // what's going on — capture if APPROVED, mark paid if COMPLETED.
  if (!row.paid && row.pollUrl && isPaypalConfigured()) {
    try {
      let order = await getOrder(row.pollUrl);
      if (order.status === "APPROVED") {
        order = await captureOrder(row.pollUrl);
      }
      if (order.status === "COMPLETED" && orderMatchesRow(order, row)) {
        const updated = await markPaid(row);
        res.json({
          reference,
          tier: updated.tier,
          status: "paid",
          paid: true,
          expiresAt: updated.expiresAt,
        });
        return;
      }
      // Mirror PayPal's status to our DB so the UI can surface "voided",
      // "declined", etc. next time it polls.
      const ourStatus = order.status.toLowerCase();
      if (ourStatus && ourStatus !== row.status) {
        await db
          .update(subscriptions)
          .set({ status: ourStatus, updatedAt: new Date() })
          .where(eq(subscriptions.reference, reference));
      }
    } catch (err) {
      req.log?.error({ err, reference }, "PayPal status check failed");
    }
  }

  res.json({
    reference,
    tier: row.tier,
    status: row.status,
    paid: row.paid,
    expiresAt: row.expiresAt,
  });
});

export default router;
