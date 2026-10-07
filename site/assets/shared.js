export const CATEGORIES = [
  { key: "raffle1", name: "Raffle 1", group: "night" },
  { key: "raffle2", name: "Raffle 2", group: "night" },
  { key: "donations", name: "Donations", group: "night" },
  { key: "pledges", name: "Pledges", group: "night" },
  { key: "silent", name: "Silent auction", group: "night" },
  { key: "live", name: "Live auction", group: "night" },
  { key: "opening", name: "Starting funds", group: "pre" },
  { key: "tables", name: "Table sponsorships", group: "pre" },
  { key: "inkind", name: "In-kind donations", group: "pre" },
];

export const GROUPS = { night: "On the night", pre: "Before the gala" };

// Raffle ticket prices. Change a number here and both pages follow.
export const TICKET_PRICE = { raffle1: 50, raffle2: 200 };

const whole = new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD", maximumFractionDigits: 0 });
const cents = new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD", minimumFractionDigits: 2 });

export const money = (n) => whole.format(Math.round(n || 0));
export const moneyExact = (n) => cents.format(n || 0);

export const totalOf = (state) =>
  CATEGORIES.filter((c) => !state.excluded.includes(c.key)).reduce((s, c) => s + (state.amounts[c.key] || 0), 0);

export const timeOf = (iso) =>
  iso ? new Date(iso).toLocaleTimeString("en-AU", { hour: "numeric", minute: "2-digit" }) : "";

export const nameOf = (key) => CATEGORIES.find((c) => c.key === key)?.name ?? key;

/** Whole tickets a raffle total represents, for the "x tickets" line. */
export function ticketsFor(key, amount) {
  const price = TICKET_PRICE[key];
  if (!price || !amount) return null;
  return Math.round((amount / price) * 100) / 100;
}
