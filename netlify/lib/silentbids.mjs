import { mutate, setAmount, round2, LOT_LIMIT } from "./state.mjs";

/**
 * Keeps the silent auction figure level with the high bids showing on
 * silentauctions.app. Live lots are never counted here: the live auction is
 * called from the podium and entered by hand.
 *
 * SILENTBIDS_TOTALS_URL should return JSON in either of these shapes:
 *   { "silentTotal": 19480 }
 *   { "lots": [ { "lot": 201, "currentBid": 440, "type": "silent" }, … ] }
 * With the second shape a lot counts when its type says "silent", or — if the
 * feed carries no type — when its number falls inside SILENTBIDS_LOT_RANGE.
 */
const DEFAULT_RANGE = "200-299";

function inRange(lot, range) {
  const [lo, hi] = (range || DEFAULT_RANGE).split("-").map(Number);
  return Number.isFinite(lot) && lot >= lo && lot <= hi;
}

/** The silent lots in a feed, as sheet rows. */
export function silentLotsFrom(data, range) {
  const lots = Array.isArray(data?.lots) ? data.lots : Array.isArray(data) ? data : null;
  if (!lots) return null;
  const rows = [];
  for (const lot of lots) {
    const kind = (lot.type || lot.category || "").toLowerCase();
    const number = lot.lot ?? lot.lotNumber ?? lot.number;
    const isSilent = kind ? kind.includes("silent") : inRange(Number(number), range);
    if (!isSilent) continue;
    const bid = Number(lot.currentBid ?? lot.highBid ?? lot.amount ?? 0);
    rows.push({ lot: String(number), bid: Number.isFinite(bid) ? round2(bid) : 0, label: String(lot.name ?? lot.title ?? "").slice(0, 60) });
  }
  return rows.slice(0, LOT_LIMIT).sort((a, b) => a.lot.localeCompare(b.lot, undefined, { numeric: true }));
}

export function silentTotalFrom(data, range) {
  if (typeof data?.silentTotal === "number") return round2(data.silentTotal);

  const lots = Array.isArray(data?.lots) ? data.lots : Array.isArray(data) ? data : null;
  if (!lots) return null;

  let sum = 0;
  for (const lot of lots) {
    const kind = (lot.type || lot.category || "").toLowerCase();
    const number = Number(lot.lot ?? lot.lotNumber ?? lot.number);
    const isSilent = kind ? kind.includes("silent") : inRange(number, range);
    if (!isSilent) continue;
    const bid = Number(lot.currentBid ?? lot.highBid ?? lot.amount ?? 0);
    if (Number.isFinite(bid)) sum += bid;
  }
  return round2(sum);
}

/** Fetches the feed and writes the silent total. Returns a result object. */
export async function syncSilentAuction() {
  const url = process.env.SILENTBIDS_TOTALS_URL;
  if (!url) return { error: "SILENTBIDS_TOTALS_URL is not set." };

  let data;
  try {
    const res = await fetch(url, {
      headers: process.env.SILENTBIDS_TOKEN ? { authorization: `Bearer ${process.env.SILENTBIDS_TOKEN}` } : {},
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return { error: `SilentBids replied ${res.status}.` };
    data = await res.json();
  } catch (e) {
    return { error: `Could not reach SilentBids: ${e.message}` };
  }

  const range = process.env.SILENTBIDS_LOT_RANGE;
  const total = silentTotalFrom(data, range);
  if (total === null) return { error: "Could not find silent lot bids in that feed." };
  const rows = silentLotsFrom(data, range);

  const { state, error } = await mutate((s) => {
    if (!s.feeds.silentbids) return "SKIP";
    if (s.amounts.silent === total && !rows) return "SAME";
    if (rows) s.lots = rows;
    const before = s.amounts.silent;
    const err = setAmount(s, { key: "silent", value: total });
    if (err) return err;
    const last = s.log[s.log.length - 1];
    if (last) { last.source = "silentbids"; last.note = `High bids on silent lots (was $${before})`; }
    return null;
  });

  if (error === "SKIP") return { paused: true, silentTotal: total };
  if (error === "SAME") return { unchanged: true, silentTotal: total };
  if (error) return { error };
  return { silentTotal: total, state };
}
