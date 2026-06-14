// Idempotent schema bootstrap. Drizzle-kit's introspection sometimes cannot
// reach the database from the build/shell environment, but the running
// api-server's own pg pool can. We run CREATE TABLE IF NOT EXISTS at startup
// so the app always has the tables it needs, with no risk of data loss
// (these statements are no-ops when the tables already exist).

import { pool } from "@workspace/db";
import { logger } from "./logger";

const STATEMENTS: string[] = [
  `CREATE TABLE IF NOT EXISTS "conversations" (
    "id" serial PRIMARY KEY,
    "user_id" text,
    "title" text NOT NULL,
    "created_at" timestamptz NOT NULL DEFAULT now()
  )`,
  // Backfill column for older deployments that pre-date per-user scoping.
  `ALTER TABLE "conversations" ADD COLUMN IF NOT EXISTS "user_id" text`,
  `CREATE TABLE IF NOT EXISTS "messages" (
    "id" serial PRIMARY KEY,
    "conversation_id" integer NOT NULL REFERENCES "conversations"("id") ON DELETE CASCADE,
    "role" text NOT NULL,
    "content" text NOT NULL,
    "created_at" timestamptz NOT NULL DEFAULT now()
  )`,
  `CREATE INDEX IF NOT EXISTS "messages_conversation_id_idx" ON "messages" ("conversation_id")`,
  `CREATE INDEX IF NOT EXISTS "conversations_created_at_idx" ON "conversations" ("created_at" DESC)`,
  `CREATE INDEX IF NOT EXISTS "conversations_user_id_idx" ON "conversations" ("user_id")`,
  // PayNow-backed subscriptions. One row per attempted payment.
  `CREATE TABLE IF NOT EXISTS "subscriptions" (
    "id" serial PRIMARY KEY,
    "user_id" text NOT NULL,
    "tier" text NOT NULL,
    "reference" text NOT NULL UNIQUE,
    "poll_url" text,
    "status" text NOT NULL DEFAULT 'pending',
    "paid" boolean NOT NULL DEFAULT false,
    "amount_usd" text NOT NULL,
    "email" text,
    "phone" text,
    "starts_at" timestamptz,
    "expires_at" timestamptz,
    "created_at" timestamptz NOT NULL DEFAULT now(),
    "updated_at" timestamptz NOT NULL DEFAULT now()
  )`,
  `CREATE INDEX IF NOT EXISTS "subscriptions_user_id_idx" ON "subscriptions" ("user_id")`,
  `CREATE INDEX IF NOT EXISTS "subscriptions_user_paid_idx" ON "subscriptions" ("user_id", "paid")`,
];

export async function ensureSchema(): Promise<void> {
  for (const sql of STATEMENTS) {
    try {
      await pool.query(sql);
    } catch (err) {
      logger.error({ err, sql }, "ensureSchema statement failed");
      throw err;
    }
  }
  logger.info("Database schema ensured");
}
