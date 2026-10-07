# 2026 ABCF RAKU Canberra Brain Cancer Gala Dinner — live tally

- `/public` — full-screen black-and-white display for the big screen (refreshes every 3 seconds)
- `/edit` — PIN-protected, mobile-first page for entering money by hand
- `/` — redirects to `/public`
- `/api/webhooks/square` — Square payments (terminals and pads)
- `/api/webhooks/stripe` — Stripe payments
- scheduled `silentbids-sync` — reads the high bids on the silent lots every minute

## Categories

On the night: Raffle 1, Raffle 2, Donations, Pledges, Silent auction, Live auction.
Before the gala: Starting funds, Table sponsorships, In-kind donations.

Keys, for the mapping variables below: `raffle1`, `raffle2`, `donations`, `pledges`,
`silent`, `live`, `opening`, `tables`, `inkind`.

Raffle ticket prices live in `site/assets/shared.js` (`TICKET_PRICE`): Raffle 1 is $50 a
ticket, Raffle 2 is $200. Change a number there and both pages follow.

## Logos

Drop two files into `site/assets/`:

- `abcflogo.png` — the wide mark, 3338 × 574 (any size at that ratio)
- `raku.png` — the square mark, 1:1

They sit side by side in the top-left of the big screen, matched on height with a hairline
between them. Transparent PNGs look best on the black background. A slot whose file is
missing hides itself, so the screen never shows a broken image.

## Deploy
1. Push to a GitHub repo and import in Netlify, or run `netlify deploy --build --prod`.
   Netlify Drop (drag-and-drop) will not work, because the site uses functions.
2. Add the environment variables below, then redeploy.

No build command is needed. Data lives in Netlify Blobs (store `gala-totals`), which needs no setup.

## Environment variables

| Variable | Needed for | Notes |
| --- | --- | --- |
| `ADMIN_PIN` | /edit | Any PIN, e.g. 6 digits |
| `SQUARE_SIGNATURE_KEY` | Square | Signature key from the webhook subscription. Comma-separate to accept two accounts |
| `SQUARE_WEBHOOK_URL` | Square | Must match the URL entered in Square exactly |
| `SQUARE_CATEGORY` | Square | Default category, e.g. `donations` |
| `SQUARE_LOCATION_MAP` | optional | `LOCATION_ID=donations,OTHER_ID=raffle1` — routes by location or device id |
| `STRIPE_WEBHOOK_SECRET` | Stripe | `whsec_…`. Comma-separate to accept two accounts |
| `STRIPE_CATEGORY` | Stripe | Default category, e.g. `silent` |
| `STRIPE_ACCOUNT_MAP` | optional | `acct_123=silent,acct_456=donations` — routes by Connect account |
| `SILENTBIDS_TOTALS_URL` | silent auction sync | JSON feed of current bids (see below) |
| `SILENTBIDS_TOKEN` | optional | Sent as `Authorization: Bearer …` to that feed |
| `SILENTBIDS_LOT_RANGE` | optional | Silent lot numbers, default `200-299`. Only used when the feed carries no lot type |

## Silent auction sync

`SILENTBIDS_TOTALS_URL` should return either of these shapes:

```json
{ "silentTotal": 19480 }
```

```json
{ "lots": [ { "lot": 201, "currentBid": 440, "type": "silent" } ] }
```

With the second shape, a lot counts when its `type` (or `category`) says silent; if the
feed has no type field, lots inside `SILENTBIDS_LOT_RANGE` count and everything else —
the 100-series live lots — is ignored. The sync *sets* the silent figure rather than
adding to it, so re-running it is always safe.

Each run writes to the change log as "Silent auction sync". There is also a
"Sync silent auction now" button on /edit.

## Wiring the payment accounts

**Square** (Developer Dashboard > Webhooks > Subscriptions): add `https…/api/webhooks/square`,
subscribe to `payment.created` and `payment.updated`. Only `COMPLETED` payments count, and
each payment id counts once.

**Stripe** (Developers > Webhooks): add `https…/api/webhooks/stripe`, subscribe to
`payment_intent.succeeded`. For Connect, enable "Listen to events on connected accounts".
A PaymentIntent can override its category with metadata `gala_category`.

Unsigned or wrongly signed requests are rejected, so the endpoints can be public.

## Silent auction lot sheet

/edit has a sheet of 25 lots (201–225 by default, editable, and you can add more up to 100).
Type a current high bid against a lot number and the silent auction figure becomes the sum
of that sheet, straight away on the big screen. Lot numbers are text, so 201a works.

The sheet and the sync are the same figure from two directions, so entering a bid by hand
switches the sync off and says so; turn it back on under Automatic payments and the next
run refills the sheet from the feed. Undo does not cover lot edits — retype the bid.

## Notes
- Raffles, pledges, live auction, starting funds, table sponsorships and in-kind are entered by hand.
- Raffle entry is in tickets, not dollars: the page multiplies by the ticket price.
- Each of the three feeds can be paused from /edit. Money taken while a feed is paused is not counted later.
- Every change is logged with its source and the last one can be undone.
- "Counts toward total" excludes a category from the headline figure while still showing it.
- The public screen goes full screen with the button, the F key or a double-click, and holds a screen wake lock.
