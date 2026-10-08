// galasquare: netlify/functions/tally.mjs
//
// Reports the same figures the admin board shows, as JSON, so the gala tally
// board can follow them. Read-only. Adapt the two lines marked ADAPT to
// however admin.html already loads its data.

import { getStore } from "@netlify/blobs";
import { timingSafeEqual } from "node:crypto";

function authorized(request) {
  const expected = process.env.TALLY_TOKEN;
  if (!expected) return false;
  const provided = (request.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export default async (request) => {
  if (!authorized(request)) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "content-type": "application/json" },
    });
  }

  // ADAPT: whatever admin.html reads. If it calls another function, call the
  // same store here; if donations live in one blob, read that instead.
  const store = getStore({ name: "gala-donations", consistency: "strong" });
  const { blobs } = await store.list();

  const donations = [];
  for (const blob of blobs) {
    const record = await store.get(blob.key, { type: "json" });
    if (record && typeof record === "object") donations.push(record);
  }

  // ADAPT: the field names your records use.
  const confirmed = donations.filter((d) => d.status === "confirmed" || d.confirmed === true);
  const unconfirmed = donations.length - confirmed.length;

  // The gift, not the fee the donor volunteered to cover — the tally board
  // should show what the cause receives, matching the admin board.
  const raised = confirmed.reduce((sum, d) => sum + (Number(d.amount) || 0), 0);

  const stations = new Set(confirmed.map((d) => d.station).filter(Boolean));

  return new Response(
    JSON.stringify({
      generatedAt: new Date().toISOString(),
      raised: Math.round(raised * 100) / 100,
      donations: confirmed.length,
      unconfirmed,
      stationsOnline: stations.size,
    }),
    { headers: { "content-type": "application/json", "cache-control": "no-store" } },
  );
};

export const config = { path: "/api/tally" };
