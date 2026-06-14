import express, { type Express } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import { clerkMiddleware } from "@clerk/express";
import router from "./routes";
import { logger } from "./lib/logger";
import {
  CLERK_PROXY_PATH,
  clerkProxyMiddleware,
} from "./middlewares/clerkProxyMiddleware";

const app: Express = express();

// Trust exactly one upstream proxy hop (the Replit edge / reverse proxy).
// This makes req.ip resolve to the real client IP from the rightmost
// trusted position in the X-Forwarded-For chain, preventing IP spoofing.
app.set("trust proxy", 1);

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return { id: req.id, method: req.method, url: req.url?.split("?")[0] };
      },
      res(res) {
        return { statusCode: res.statusCode };
      },
    },
  }),
);

// Clerk auth proxy — must be mounted before body parsers (streams raw bytes).
app.use(CLERK_PROXY_PATH, clerkProxyMiddleware());

app.use(cors());

app.use((req, res, next) => {
  const limit = req.path === "/api/openai/transcribe" ? "5mb" : "1mb";
  express.json({ limit })(req, res, next);
});
app.use((req, res, next) => {
  const limit = req.path === "/api/openai/transcribe" ? "5mb" : "1mb";
  express.urlencoded({ extended: true, limit })(req, res, next);
});

// Build the list of origins we trust to issue Clerk session tokens. This
// becomes the `authorizedParties` whitelist below, which Clerk uses to
// validate the JWT `azp` claim on every authenticated request. Clerk has
// announced that tokens without a matching `azp` will be rejected in a
// future SDK version (currently emitted as a warning per request), so
// supplying an explicit allowlist of our Replit dev + production domains
// keeps the app working when that change ships.
function buildAuthorizedParties(): string[] {
  const origins = new Set<string>();
  // REPLIT_DOMAINS is comma-separated, e.g. "avolin.replit.app,foo.replit.app"
  const replitDomains = process.env["REPLIT_DOMAINS"]?.split(",") ?? [];
  for (const raw of replitDomains) {
    const host = raw.trim();
    if (host) origins.add(`https://${host}`);
  }
  // Replit dev workspace domain (only set in development).
  const devDomain = process.env["REPLIT_DEV_DOMAIN"]?.trim();
  if (devDomain) origins.add(`https://${devDomain}`);
  // Local development convenience.
  if (process.env["NODE_ENV"] !== "production") {
    origins.add("http://localhost:80");
    origins.add("http://localhost:5173");
  }
  return [...origins];
}

const AUTHORIZED_PARTIES = buildAuthorizedParties();
if (AUTHORIZED_PARTIES.length > 0) {
  logger.info({ authorizedParties: AUTHORIZED_PARTIES }, "Clerk authorized parties configured");
}

// Tell the Clerk SDK about our Frontend API proxy so it skips authentication
// on the proxy path itself and auto-derives the proxyUrl for handshake
// redirects on the published .replit.app domain. The dev↔prod publishable
// key swap happens on the frontend via publishableKeyFromHost(); the secret
// key on the server is environment-scoped by Replit automatically.
app.use(
  clerkMiddleware({
    frontendApiProxy: { enabled: true, path: CLERK_PROXY_PATH },
    ...(AUTHORIZED_PARTIES.length > 0 ? { authorizedParties: AUTHORIZED_PARTIES } : {}),
  }),
);

app.use("/api", router);

export default app;
