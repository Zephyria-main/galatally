import crypto from "node:crypto";
import { mutate, addAmount, claimEvent, parseMap, secretsFrom, text, json } from "../lib/state.mjs";

// Square signs: base64( HMAC-SHA256( notificationUrl + rawBody ) )
function verify(rawBody, signature) {
  const url = process.env.SQUARE_WEBHOOK_URL;
  const keys = secretsFrom(process.env.SQUARE_SIGNATURE_KEY);
  if (!url || !keys.length || !signature) return false;
  return keys.some((key) => {
    const expected = crypto.createHmac("sha256", key).update(url + rawBody).digest("base64");
    const a = Buffer.from(expected);
    const b = Buffer.from(signature);
    return a.length === b.length && crypto.timingSafeEqual(a, b);
  });
}

export default async (req) => {
  if (req.method !== "POST") return text("Method not allowed.", 405);

  const rawBody = await req.text();
  if (!verify(rawBody, req.headers.get("x-square-hmacsha256-signature"))) {
    return text("Signature check failed.", 401);
  }

  let event;
  try {
    event = JSON.parse(rawBody);
  } catch {
    return text("Invalid payload.", 400);
  }

  const payment = event?.data?.object?.payment;
  const type = event?.type || "";

  // Only count completed payments; ignore the interim states Square also sends.
  if (!payment || !["payment.created", "payment.updated"].includes(type)) return json({ ignored: type });
  if (payment.status !== "COMPLETED") return json({ ignored: `status ${payment.status}` });

  const cents = payment.total_money?.amount ?? payment.amount_money?.amount ?? 0;
  const amount = Number(cents) / 100;
  if (!amount) return json({ ignored: "zero amount" });

  // Route by Square location or device, so a second account or a separate
  // terminal bank can land in a different category.
  const byLocation = parseMap(process.env.SQUARE_LOCATION_MAP);
  const key =
    byLocation[payment.location_id] ||
    byLocation[payment.device_details?.device_id] ||
    process.env.SQUARE_CATEGORY ||
    "donations";

  if (!(await claimEvent(`square:${payment.id}:${payment.status}`))) return json({ duplicate: payment.id });

  const { error } = await mutate((state) => {
    if (!state.feeds.square) return "SKIP";
    return addAmount(state, {
      key,
      amount,
      source: "square",
      note: payment.receipt_number ? `Receipt ${payment.receipt_number}` : undefined,
    });
  });

  if (error === "SKIP") return json({ paused: true });
  if (error) return json({ error }, 400);
  return json({ recorded: amount, key });
};

export const config = { path: "/api/webhooks/square" };
