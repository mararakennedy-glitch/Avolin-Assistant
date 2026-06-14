// Tiny PayPal v2 Orders REST helper — no SDK, just fetch.
//
// Why no SDK? PayPal's official Node SDKs are either deprecated, very heavy,
// or pull in dozens of dependencies. The Orders v2 surface we need is small
// (oauth → create order → capture order → get order) so a hand-rolled client
// keeps the surface tiny and easy to audit.
//
// All money paid by Avolin customers lands in whatever PayPal merchant
// account owns the PAYPAL_CLIENT_ID / PAYPAL_CLIENT_SECRET pair. To send
// payouts to mararakennedy@gmail.com, the owner registers a PayPal Business
// account under that email and creates an app at
// https://developer.paypal.com/dashboard/applications — the credentials from
// that app are the ones we want set as secrets.

type Mode = "sandbox" | "live";

function getMode(): Mode {
  const m = (process.env["PAYPAL_MODE"] ?? "").toLowerCase();
  return m === "live" || m === "production" ? "live" : "sandbox";
}

function getApiBase(): string {
  return getMode() === "live"
    ? "https://api-m.paypal.com"
    : "https://api-m.sandbox.paypal.com";
}

export function isPaypalConfigured(): boolean {
  return Boolean(
    process.env["PAYPAL_CLIENT_ID"] && process.env["PAYPAL_CLIENT_SECRET"],
  );
}

export function getPublicBaseUrl(req: { headers: Record<string, any> }): string {
  // Honour an explicit override first (set in production for stability).
  const override = process.env["PUBLIC_APP_URL"];
  if (override) return override.replace(/\/$/, "");
  // Replit always sets REPLIT_DOMAINS in deployed envs.
  const dom = process.env["REPLIT_DOMAINS"]?.split(",")[0]?.trim();
  if (dom) return `https://${dom}`;
  // Fallback to the request origin/host (works in local dev).
  const origin = req.headers["origin"];
  if (typeof origin === "string" && origin.startsWith("http")) return origin;
  const host = req.headers["host"];
  if (typeof host === "string") return `https://${host}`;
  return "";
}

// ─── OAuth ────────────────────────────────────────────────────────────────
// Simple in-memory token cache. PayPal access tokens are valid for ~9 hours
// so re-using one across many checkouts keeps the latency down without any
// real risk of a stale token (we re-fetch the moment one expires).
let _token: { value: string; expiresAt: number } | null = null;

async function getAccessToken(): Promise<string> {
  if (_token && Date.now() < _token.expiresAt - 60_000) return _token.value;
  const id = process.env["PAYPAL_CLIENT_ID"];
  const secret = process.env["PAYPAL_CLIENT_SECRET"];
  if (!id || !secret) {
    throw new Error(
      "PayPal not configured. Set PAYPAL_CLIENT_ID and PAYPAL_CLIENT_SECRET secrets.",
    );
  }
  const basic = Buffer.from(`${id}:${secret}`).toString("base64");
  const res = await fetch(`${getApiBase()}/v1/oauth2/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${basic}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`PayPal OAuth failed (${res.status}): ${text.slice(0, 200)}`);
  }
  const data = (await res.json()) as { access_token: string; expires_in: number };
  _token = {
    value: data.access_token,
    expiresAt: Date.now() + (data.expires_in ?? 3600) * 1000,
  };
  return data.access_token;
}

// ─── Orders v2 ────────────────────────────────────────────────────────────

export type CreatedOrder = {
  id: string;
  status: string;
  approveUrl: string;
};

export async function createOrder(opts: {
  reference: string;
  amountUsd: number;
  description: string;
  returnUrl: string;
  cancelUrl: string;
}): Promise<CreatedOrder> {
  const token = await getAccessToken();
  const res = await fetch(`${getApiBase()}/v2/checkout/orders`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      intent: "CAPTURE",
      purchase_units: [
        {
          reference_id: opts.reference,
          description: opts.description,
          amount: {
            currency_code: "USD",
            value: opts.amountUsd.toFixed(2),
          },
        },
      ],
      application_context: {
        brand_name: "Avolin",
        user_action: "PAY_NOW",
        // BILLING shows the guest credit/debit card form first, so customers
        // can pay with a card (Visa / Mastercard / Amex / etc.) without
        // having to create a PayPal account. The "Pay with PayPal" option
        // is still available on that page for users who prefer it.
        landing_page: "BILLING",
        shipping_preference: "NO_SHIPPING",
        return_url: opts.returnUrl,
        cancel_url: opts.cancelUrl,
      },
    }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`PayPal createOrder failed (${res.status}): ${text.slice(0, 300)}`);
  }
  const data = (await res.json()) as {
    id: string;
    status: string;
    links?: { rel: string; href: string }[];
  };
  const approveUrl = data.links?.find((l) => l.rel === "approve")?.href;
  if (!approveUrl) {
    throw new Error("PayPal createOrder returned no approve link");
  }
  return { id: data.id, status: data.status, approveUrl };
}

export type OrderDetails = {
  id: string;
  status: string;
  reference: string | null;
  amountUsd: number | null;
  payerEmail: string | null;
};

function extractDetails(data: any): OrderDetails {
  const pu = Array.isArray(data?.purchase_units) ? data.purchase_units[0] : null;
  const amt = pu?.amount?.value;
  const captures = pu?.payments?.captures;
  const captured = Array.isArray(captures) && captures.length > 0 ? captures[0] : null;
  return {
    id: String(data?.id ?? ""),
    status: String(data?.status ?? ""),
    reference: pu?.reference_id ?? null,
    amountUsd: amt != null ? Number(amt) : (captured?.amount?.value ? Number(captured.amount.value) : null),
    payerEmail: data?.payer?.email_address ?? null,
  };
}

export async function getOrder(orderId: string): Promise<OrderDetails> {
  const token = await getAccessToken();
  const res = await fetch(`${getApiBase()}/v2/checkout/orders/${encodeURIComponent(orderId)}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`PayPal getOrder failed (${res.status}): ${text.slice(0, 300)}`);
  }
  return extractDetails(await res.json());
}

// Capture an APPROVED order. PayPal returns 422 if the order is in any other
// state (e.g. already captured) — callers should treat 422 as "no-op, just
// re-fetch the order to read its current status".
export async function captureOrder(orderId: string): Promise<OrderDetails> {
  const token = await getAccessToken();
  const res = await fetch(
    `${getApiBase()}/v2/checkout/orders/${encodeURIComponent(orderId)}/capture`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        // PayPal recommends an Idempotency-Key for capture so retries don't
        // double-charge. Order IDs are unique per transaction, so reusing
        // them is safe.
        "PayPal-Request-Id": `cap-${orderId}`,
      },
      body: "{}",
    },
  );
  if (res.status === 422) {
    // Already captured (or otherwise non-capturable). Re-fetch and return.
    return getOrder(orderId);
  }
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`PayPal captureOrder failed (${res.status}): ${text.slice(0, 300)}`);
  }
  return extractDetails(await res.json());
}

export function getPaypalMode(): Mode {
  return getMode();
}
