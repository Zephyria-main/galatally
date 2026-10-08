import { syncDonations } from "../lib/galasquare.mjs";

// Follows the donations board once a minute.
export default async () => {
  const result = await syncDonations();
  return new Response(JSON.stringify(result), {
    status: result.error ? 502 : 200,
    headers: { "content-type": "application/json" },
  });
};

export const config = { schedule: "* * * * *" };
