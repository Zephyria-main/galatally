import { getStore } from "@netlify/blobs";

export const KEYS = ["opening", "tables", "inkind", "raffle1", "raffle2", "donations", "pledges", "silent", "live"];
const LOG_LIMIT = 200;
const MAX_AMOUNT = 10_000_000;

export const round2 = (n) => Math.round(n * 100) / 100;

export const store = () => getStore({ name: "gala-totals", consistency: "strong" });

export const defaults = () => ({
  title: "2026 ABCF RAKU Canberra Brain Cancer Gala Dinner",
  goal: 0,
  amounts: Object.fromEntries(KEYS.map((k) => [k, 0])),
  excluded: [],
  feeds: { square: true, stripe: true, silentbids: true },
  lots: [],
  updatedAt: null,
  log: [],
});

export function normalize(data) {
  const base = defaults();
  if (!data || typeof data !== "object") return base;
  return {
    ...base,
    ...data,
    amounts: { ...base.amounts, ...(data.amounts || {}) },
    excluded: Array.isArray(data.excluded) ? data.excluded.filter((k) => KEYS.includes(k)) : [],
    feeds: { ...base.feeds, ...(data.feeds || {}) },
    log: Array.isArray(data.log) ? data.log : [],
    lots: Array.isArray(data.lots) ? data.lots : [],
  };
}

export const LOT_LIMIT = 100;

/** Sum of the bids on the lot sheet. */
export const lotsTotal = (state) =>
  round2(state.lots.reduce((sum, l) => sum + (Number(l.bid) || 0), 0));

/**
 * Writes one lot's bid and re-totals the silent auction from the sheet.
 * The sheet is the source of truth for `silent` once it has a row.
 */
export function setLotBid(state, { lot, bid, label }) {
  const number = String(lot ?? "").trim().slice(0, 12);
  if (!number) return "Give the lot a number.";
  const value = Number(bid);
  if (!Number.isFinite(value) || value < 0) return "Enter a bid of zero or more.";
  if (value > 1_000_000) return "That bid is too large.";

  const existing = state.lots.find((l) => l.lot === number);
  if (!existing && state.lots.length >= LOT_LIMIT) return `No room for more than ${LOT_LIMIT} lots.`;

  const before = existing ? Number(existing.bid) || 0 : 0;
  if (existing) {
    existing.bid = round2(value);
    if (label !== undefined) existing.label = String(label).slice(0, 60);
  } else {
    state.lots.push({ lot: number, bid: round2(value), label: label ? String(label).slice(0, 60) : "" });
    state.lots.sort((a, b) => String(a.lot).localeCompare(String(b.lot), undefined, { numeric: true }));
  }

  const silentBefore = state.amounts.silent;
  state.amounts.silent = lotsTotal(state);
  pushLog(state, {
    type: "lot",
    key: "silent",
    lot: number,
    amount: round2(value - before),
    before: silentBefore,
    after: state.amounts.silent,
    note: `Lot ${number}: ${before ? `$${before} → ` : ""}$${round2(value)}`,
  });
  return null;
}

/** Removes a lot row and re-totals. */
export function removeLot(state, lot) {
  const number = String(lot ?? "").trim();
  const index = state.lots.findIndex((l) => l.lot === number);
  if (index === -1) return "That lot is not on the sheet.";
  const before = state.amounts.silent;
  state.lots.splice(index, 1);
  state.amounts.silent = lotsTotal(state);
  pushLog(state, { type: "lot", key: "silent", lot: number, before, after: state.amounts.silent, note: `Lot ${number} removed` });
  return null;
}

export function pushLog(state, entry) {
  state.log.push({ id: crypto.randomUUID(), at: new Date().toISOString(), source: "manual", ...entry });
  if (state.log.length > LOG_LIMIT) state.log.splice(0, state.log.length - LOG_LIMIT);
}

export const json = (body, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });

export const text = (body, status = 200) =>
  new Response(body, { status, headers: { "content-type": "text/plain", "cache-control": "no-store" } });

export async function load() {
  return normalize(await store().get("state", { type: "json" }));
}

/**
 * Read, apply `fn`, write — retrying on conflict so simultaneous saves and
 * webhooks arriving at once never overwrite each other.
 * fn(state) returns an error string, or null/undefined on success.
 */
export async function mutate(fn) {
  const s = store();
  for (let attempt = 0; attempt < 8; attempt++) {
    const current = await s.getWithMetadata("state", { type: "json" });
    const state = normalize(current?.data);
    const error = fn(state);
    if (error) return { error };
    state.updatedAt = new Date().toISOString();
    const opts = current ? { onlyIfMatch: current.etag } : { onlyIfNew: true };
    const result = await s.setJSON("state", state, opts);
    if (result && result.modified === false) {
      await new Promise((r) => setTimeout(r, 60 + Math.random() * 140));
      continue;
    }
    return { state };
  }
  return { error: "Too many changes at once. Try again." };
}

/** Records a payment id. Returns false if it has been seen before. */
export async function claimEvent(id) {
  const result = await store().setJSON(`seen/${id}`, { at: new Date().toISOString() }, { onlyIfNew: true });
  return !(result && result.modified === false);
}

export function addAmount(state, { key, amount, source = "manual", note }) {
  if (!KEYS.includes(key)) return "Unknown category.";
  const n = Number(amount);
  if (!Number.isFinite(n) || n === 0) return "Enter an amount other than zero.";
  if (Math.abs(n) > MAX_AMOUNT) return "That amount is too large.";
  const before = state.amounts[key];
  const after = round2(before + n);
  if (after < 0) return "That would make the total negative.";
  state.amounts[key] = after;
  pushLog(state, { type: "add", key, amount: round2(n), before, after, source, note });
  return null;
}

export function setAmount(state, { key, value }) {
  if (!KEYS.includes(key)) return "Unknown category.";
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return "Enter a total of zero or more.";
  if (n > MAX_AMOUNT) return "That amount is too large.";
  const before = state.amounts[key];
  state.amounts[key] = round2(n);
  pushLog(state, { type: "set", key, before, after: state.amounts[key] });
  return null;
}

/** Parses "LOCATION_ID=donations,OTHER_ID=raffle1" into a lookup. */
export function parseMap(raw) {
  const map = {};
  for (const pair of (raw || "").split(",")) {
    const [id, key] = pair.split("=").map((s) => s?.trim());
    if (id && KEYS.includes(key)) map[id] = key;
  }
  return map;
}

export const secretsFrom = (raw) => (raw || "").split(",").map((s) => s.trim()).filter(Boolean);
