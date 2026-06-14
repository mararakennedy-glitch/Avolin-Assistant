import app from "./app";
import { logger } from "./lib/logger";
import { ensureSchema } from "./lib/ensureSchema";
import { getPaypalMode, isPaypalConfigured } from "./lib/paypalClient";

const rawPort = process.env["PORT"];
if (!rawPort) throw new Error("PORT environment variable is required");
const port = Number(rawPort);
if (Number.isNaN(port) || port <= 0) throw new Error(`Invalid PORT: "${rawPort}"`);

if (isPaypalConfigured()) {
  logger.info({ mode: getPaypalMode() }, "PayPal configured — payments enabled");
} else {
  logger.warn(
    "PayPal not configured — set PAYPAL_CLIENT_ID and PAYPAL_CLIENT_SECRET to enable payments",
  );
}

app.listen(port, (err) => {
  if (err) { logger.error({ err }, "Error listening"); process.exit(1); }
  logger.info({ port }, "Server listening");
  ensureSchema().catch((err) => {
    logger.error({ err }, "ensureSchema failed — DB-backed routes will error");
  });
});
