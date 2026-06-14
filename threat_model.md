# Threat Model

## Project Overview

Avolin is a TypeScript pnpm monorepo with a React + Vite web frontend in `artifacts/avoline/` and an Express 5 API in `artifacts/api-server/`. The application uses Clerk for end-user authentication, PostgreSQL + Drizzle for persistence, and Replit AI / OpenAI integrations for chat, voice, transcription, and image generation. Production users interact with the web frontend at `/`, while the backend serves API routes under `/api`.

This scan assumes the production deployment runs on Replit with `NODE_ENV=production`, TLS handled by the platform, and that the mockup sandbox is not deployed to production.

## Assets

- **User accounts and sessions** — Clerk user identities and bearer/session credentials. Compromise would let an attacker impersonate users and access their conversations and paid features.
- **Conversation history and generated content** — stored chat titles, messages, generated images, and any user-submitted prompts or audio-derived transcripts. This data may contain personal or business-sensitive information.
- **Billing and subscription state** — subscription rows, payment references, purchased tier windows, and payer contact details. Incorrect changes here can grant paid access or misroute payment outcomes.
- **Application secrets and third-party credentials** — Clerk secret key, PayPal credentials, database connection details, and Replit AI/OpenAI integration credentials. Exposure would allow service impersonation or unauthorized third-party API use.
- **Model/API quota and server resources** — public AI routes consume paid inference and media-generation capacity. Abuse can create direct financial loss and deny service to legitimate users.

## Trust Boundaries

- **Browser to API** — all frontend input crosses from an untrusted client into the Express API. Every request body, route parameter, header, and uploaded/base64 payload must be treated as attacker-controlled.
- **API to Clerk** — auth state is derived from Clerk middleware and the production Clerk proxy route. The backend must not trust client-side auth state without Clerk validation.
- **API to PostgreSQL** — the API has direct write access to conversations, messages, and subscriptions. Route-level authorization failures become direct data-access failures.
- **API to external services** — the server calls Replit AI/OpenAI services, Google News RSS, DuckDuckGo Instant Answer, Clerk, and PayPal. These calls consume secrets, money, and compute, and must not be exposed as an open relay.
- **Model output to client actions** — assistant text and web-retrieved context are untrusted content, even when they appear inside branded UI. Rendering paths that upgrade model output into links, buttons, or device actions cross an additional trust boundary and need explicit safeguards.
- **Public to authenticated features** — some routes are intentionally public (health checks, guest AI usage, pricing/config), while conversation history, payment state, and paid features are user-scoped. This separation must be enforced server-side.
- **Production to dev-only code** — `artifacts/mockup-sandbox/` and development scripts exist in the repo but are assumed not to be production-reachable unless proven otherwise.

## Scan Anchors

- **Production entry points:** `artifacts/api-server/src/index.ts`, `artifacts/api-server/src/app.ts`, `artifacts/api-server/src/routes/*`, `artifacts/avoline/src/App.tsx`, `artifacts/avoline/src/pages/home.tsx`
- **Highest-risk areas:** `artifacts/api-server/src/routes/openai/conversations.ts`, `artifacts/api-server/src/routes/payments.ts`, `artifacts/api-server/src/middlewares/clerkProxyMiddleware.ts`, `artifacts/api-server/src/lib/paypalClient.ts`, `artifacts/avoline/src/hooks/use-avoline-chat.ts`, `artifacts/avoline/src/components/answer-panel.tsx`, `artifacts/avoline/src/components/action-button.tsx`
- **Public surfaces:** `/api/healthz`, `/api/payments/config`, `/api/me/tier`, guest AI/media routes under `/api/openai/*` that do not require a user ID
- **Authenticated surfaces:** conversation CRUD and message streaming, voice message routes, payment checkout/status, tier-gated HD image generation
- **Dev-only areas to usually ignore:** `artifacts/mockup-sandbox/`, `scripts/`, workspace scaffolding unless production reachability is demonstrated

## Threat Categories

### Spoofing

Authentication depends on Clerk middleware and bearer/session validation on protected API routes. All routes that return or mutate user-owned conversation or payment data must require a valid Clerk-authenticated user and must derive the acting user from the server-side auth context rather than from client input.

### Tampering

Clients can submit conversation titles, prompts, audio blobs, and payment tier selections. The API must validate these inputs, constrain high-cost operations, and ensure payment completion can only update the subscription row that matches the original reference and amount recorded by the server.

Assistant output and retrieved web context must also remain untrusted after generation. The frontend must not silently upgrade model-emitted structures into privileged device actions, payment steps, or high-trust navigational UI without confirmation, provenance, or destination controls.

### Information Disclosure

Conversation history, payment metadata, and secrets must never leak across users, into logs, or into public responses. Public AI endpoints must not expose stored user conversation data, and error handling/logging must avoid returning stack traces, provider responses, tokens, or cookies.

### Denial of Service

The public API exposes expensive AI and media endpoints that can trigger model inference, image generation, transcription, and external fetches. Production routes must enforce reasonable authentication, rate limits, request-size bounds, and time/resource limits so unauthenticated internet traffic cannot exhaust paid API quota, CPU, or memory.

### Elevation of Privilege

User-owned conversations and subscription-derived capabilities must be enforced server-side. A user must only access conversations with their own `userId`, only receive tier-gated features they have paid for, and never be able to grant themselves access by modifying request parameters, payment references, or client-side state.
