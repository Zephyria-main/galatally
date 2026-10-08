import { mutate, setAmount, round2 } from "./state.mjs";

/**
 * Keeps the Donations figure level with the donations board on
 * galasquare.netlify.app, rather than counting Square payments directly.
 * That board already decides what is confirmed and how fee coverage is
 * treated, so following it keeps the two screens showing the same number.
 *
 * GALASQUARE_TOTALS_URL should return JSON like:
 *   { "raised": 28650, "donations": 143, "stationsOnline": 14, "unconfirmed": 2 }
 * Any of these keys work for the amount: raised, total, confirmedTotal.
 */
export function donationsTotalFrom(data) {
  for (const key of ["raised", "total", "confirmedTotal", "donationsTotal"]) {
    const value = data?.[key];
    if (typeof value === "number" && Number.isFinite(value)) return round2(value);
    // Tolerate "$28,650.00" from a board that formats its own figures.
    if (typeof value === "string") {
      const parsed = Number(value.replace(/[^0-9.-]/g, ""));
      if (Number.isFinite(parsed)) return round2(parsed);
    }
  }
  return null;
}

/** Fetches the donations board and writes the Donations figure. */
export async function syncDonations() {
  const url = process.env.GALASQUARE_TOTALS_URL;
  if (!url) return { error: "GALASQUARE_TOTALS_URL is not set." };

  let data;
  try {
    const res = await fetch(url, {
      headers: process.env.GALASQUARE_TOKEN ? { authorization: `Bearer ${process.env.GALASQUARE_TOKEN}` } : {},
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return { error: `Donations board replied ${res.status}.` };
    data = await res.json();
  } catch (e) {
    return { error: `Could not reach the donations board: ${e.message}` };
  }

  const total = donationsTotalFrom(data);
  if (total === null) return { error: "Could not find a raised figure in that feed." };

  const { state, error } = await mutate((s) => {
    if (!s.feeds.galasquare) return "SKIP";
    if (s.amounts.donations === total) return "SAME";
    const before = s.amounts.donations;
    const err = setAmount(s, { key: "donations", value: total });
    if (err) return err;
    const last = s.log[s.log.length - 1];
    if (last) {
      last.source = "galasquare";
      const count = Number(data.donations);
      last.note = Number.isFinite(count)
        ? `${count} donations on the board (was $${before})`
        : `Donations board (was $${before})`;
    }
    return null;
  });

  if (error === "SKIP") return { paused: true, raised: total };
  if (error === "SAME") return { unchanged: true, raised: total };
  if (error) return { error };
  return { raised: total, updatedAt: state.updatedAt };
}
