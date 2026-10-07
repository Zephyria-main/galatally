import crypto from "node:crypto";
import { KEYS, mutate, addAmount, claimEvent, parseMap, secretsFrom, text, json } from "../lib/state.mjs";

const TOLERANCE_SECONDS = 300;

// Stripe signs: t=timestamp,v1=hex( HMAC-SHA256( timestamp + "." + rawBody ) )
function verify(rawBody, header) {
  const secrets = secretsFrom(process.env.STRIPE_WEBHOOK_SECRET);
  if (!secrets.length || !header) return false;

  const parts = Object.fromEntries(header.split(",").map((p) => p.split("=").map((s) => s.trim())));
  const timestamp = Number(parts.t);
  if (!timestamp || Math.abs(Date.now() / 1000 - timestamp) > TOLERANCE_SECONDS) return false;

  const signed = `${parts.t}.${rawBody}`;
  const provided = Buffer.from(parts.v1 || "", "hex");
  return secrets.some((secret) => {
    const expected = crypto.createHmac("sha256", secret).update(signed).digest();
    return provided.length === expected.length && crypto.timingSafeEqual(provided, expected);
  });
}

export default async (req) => {
  if (req.method !== "POST") return text("Method not allowed.", 405);

  const rawBody = await req.text();
  if (!verify(rawBody, req.headers.get("stripe-signature"))) {
    return text("Signature check failed.", 401);
  }

  let event;
  try {
    event = JSON.parse(rawBody);
  } catch {
    return text("Invalid payload.", 400);
  }

  if (!["payment_intent.succeeded", "charge.succeeded"].includes(event.type)) {
    return json({ ignored: event.type });
  }

  const object = event.data?.object || {};
  if (object.object === "charge" && object.payment_intent) {
    // Avoid double counting when both events arrive for the same payment.
    return json({ ignored: "charge covered by payment_intent" });
  }

  const cents = object.amount_received ?? object.amount ?? 0;
  const amount = Number(cents) / 100;
  if (!amount) return json({ ignored: "zero amount" });

  // SilentBids can tag a payment with gala_category in metadata; otherwise
  // route by connected account, then fall back to the default category.
  const metaKey = object.metadata?.gala_category;
  const byAccount = parseMap(process.env.STRIPE_ACCOUNT_MAP);
  const key =
    (KEYS.includes(metaKey) && metaKey) ||
    byAccount[event.account] ||
    process.env.STRIPE_CATEGORY ||
    "silent";

  if (!(await claimEvent(`stripe:${object.id}`))) return json({ duplicate: object.id });

  const { error } = await mutate((state) => {
    if (!state.feeds.stripe) return "SKIP";
    return addAmount(state, {
      key,
      amount,
      source: "stripe",
      note: object.metadata?.item_name || object.description || undefined,
    });
  });

  if (error === "SKIP") return json({ paused: true });
  if (error) return json({ error }, 400);
  return json({ recorded: amount, key });
};

export const config = { path: "/api/webhooks/stripe" };
