import { syncSilentAuction } from "../lib/silentbids.mjs";

// Runs every minute while the auction is open.
export default async () => {
  const result = await syncSilentAuction();
  return new Response(JSON.stringify(result), {
    status: result.error ? 502 : 200,
    headers: { "content-type": "application/json" },
  });
};

export const config = { schedule: "* * * * *" };
