import { KEYS, load, mutate, addAmount, setAmount, setLotBid, removeLot, defaults, round2, json } from "../lib/state.mjs";
import { syncSilentAuction } from "../lib/silentbids.mjs";
import { syncDonations } from "../lib/galasquare.mjs";

export default async (req) => {
  const adminPin = process.env.ADMIN_PIN;
  const authed = Boolean(adminPin) && req.headers.get("x-admin-pin") === adminPin;

  if (req.method === "GET") {
    const state = await load();
    if (authed) return json({ ...state, authed: true });
    const { log, feeds, ...publicState } = state;
    return json({ ...publicState, authed: false });
  }

  if (req.method !== "POST") return json({ error: "Method not allowed." }, 405);
  if (!adminPin) return json({ error: "ADMIN_PIN is not set in Netlify environment variables." }, 500);
  if (!authed) return json({ error: "Incorrect PIN." }, 401);

  let body;
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid request." }, 400);
  }

  if (body.action === "sync" || body.action === "syncDonations") {
    const result = body.action === "sync" ? await syncSilentAuction() : await syncDonations();
    if (result.error) return json({ error: result.error }, 502);
    return json({ ...(await load()), authed: true });
  }

  const { state, error } = await mutate((s) => {
    switch (body.action) {
      case "add":
        return addAmount(s, { key: body.key, amount: body.amount, source: "manual" });
      case "set":
        return setAmount(s, { key: body.key, value: body.value });
      case "lot": {
        // Entering bids by hand means the sheet is in charge, not the feed.
        s.feeds.silentbids = false;
        return setLotBid(s, { lot: body.lot, bid: body.bid, label: body.label });
      }
      case "removeLot": {
        s.feeds.silentbids = false;
        return removeLot(s, body.lot);
      }
      case "undo": {
        const last = s.log.pop();
        if (!last) return "There is nothing to undo.";
        if (last.type === "lot") return "Undo does not cover the lot sheet. Retype the bid instead.";
        if (last.type === "add" || last.type === "set") s.amounts[last.key] = last.before;
        return null;
      }
      case "settings": {
        if (typeof body.title === "string") s.title = body.title.trim().slice(0, 80);
        if (body.goal !== undefined) {
          const goal = Number(body.goal);
          if (!Number.isFinite(goal) || goal < 0) return "Enter a goal of zero or more.";
          s.goal = round2(goal);
        }
        if (Array.isArray(body.excluded)) s.excluded = body.excluded.filter((k) => KEYS.includes(k));
        if (body.feeds && typeof body.feeds === "object") {
          for (const feed of ["square", "stripe", "silentbids", "galasquare"]) {
            if (typeof body.feeds[feed] === "boolean") s.feeds[feed] = body.feeds[feed];
          }
        }
        return null;
      }
      case "reset": {
        if (body.confirm !== "RESET") return "Type RESET to confirm.";
        s.amounts = defaults().amounts;
        s.log = [];
        return null;
      }
      default:
        return "Unknown action.";
    }
  });

  if (error) return json({ error }, 400);
  return json({ ...state, authed: true });
};

export const config = { path: "/api/totals" };
