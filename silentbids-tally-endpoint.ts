// SilentBids: app/api/public/auctions/[auctionId]/tally/route.ts
//
// One read-only endpoint that reports the current high bid per lot for an
// auction. The gala tally board polls it once a minute and sums the silent
// lots. Adapt the two SQL identifiers marked ADAPT to your schema.

import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { Pool } from "pg";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 2 });

function authorized(request: Request): boolean {
  const expected = process.env.TALLY_TOKEN;
  if (!expected) return false;
  const provided = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function GET(request: Request, { params }: { params: Promise<{ auctionId: string }> }) {
  if (!authorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { auctionId } = await params;

  // ADAPT: table and column names. This assumes
  //   items(id, auction_id, lot_number, name, type, starting_bid)
  //   bids(id, item_id, amount, status)
  // and takes the highest live bid per item. If you already keep a
  // denormalized items.current_bid, select that instead and drop the join.
  const { rows } = await pool.query<{
    lot_number: string;
    name: string;
    type: string;
    current_bid: string | null;
  }>(
    `select i.lot_number,
            i.name,
            i.type,
            max(b.amount) filter (where b.status = 'active') as current_bid
       from items i
       left join bids b on b.item_id = i.id
      where i.auction_id = $1
      group by i.lot_number, i.name, i.type
      order by i.lot_number`,
    [auctionId],
  );

  const lots = rows.map((row) => ({
    lot: row.lot_number,
    name: row.name,
    type: row.type, // "silent" or "live" — the tally board only counts silent
    currentBid: row.current_bid ? Number(row.current_bid) : 0,
  }));

  const sumOf = (kind: string) =>
    Math.round(lots.filter((l) => l.type === kind).reduce((sum, l) => sum + l.currentBid, 0) * 100) / 100;

  return NextResponse.json(
    {
      auctionId,
      generatedAt: new Date().toISOString(),
      silentTotal: sumOf("silent"),
      liveTotal: sumOf("live"),
      lots,
    },
    { headers: { "cache-control": "no-store" } },
  );
}
