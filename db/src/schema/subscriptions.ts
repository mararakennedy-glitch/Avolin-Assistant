import { pgTable, serial, text, timestamp, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

// Avolin tier subscriptions backed by PayNow Zimbabwe payments.
// PayNow does not natively support recurring billing, so each successful
// payment grants a fixed-duration access window (Core = 30 days,
// Elite = 365 days). When the window lapses the user falls back to basic
// and can re-pay to renew.
export const subscriptions = pgTable("subscriptions", {
  id: serial("id").primaryKey(),
  // Clerk user id (e.g. "user_..."). Indexed for the per-user lookup that
  // resolveUserTier performs on every gated request.
  userId: text("user_id").notNull(),
  // "core" | "elite" — basic users have no row at all.
  tier: text("tier").notNull(),
  // PayNow merchant reference we generated when initiating the payment.
  reference: text("reference").notNull().unique(),
  // PayNow poll url used to verify status server-side.
  pollUrl: text("poll_url"),
  // "pending" until PayNow confirms; then "paid" / "cancelled" / "failed".
  status: text("status").notNull().default("pending"),
  // True only after we have observed a paid status from PayNow.
  paid: boolean("paid").notNull().default(false),
  // Amount captured (USD), for receipts/audit.
  amountUsd: text("amount_usd").notNull(),
  // Email + phone we used at checkout (for support / mobile money push).
  email: text("email"),
  phone: text("phone"),
  // The granted access window — only meaningful when paid=true.
  startsAt: timestamp("starts_at", { withTimezone: true }),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const insertSubscriptionSchema = createInsertSchema(subscriptions).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type Subscription = typeof subscriptions.$inferSelect;
export type InsertSubscription = z.infer<typeof insertSubscriptionSchema>;
