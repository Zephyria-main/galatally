# Deploy checklist — 2026 ABCF RAKU Canberra Brain Cancer Gala Dinner tally board

Work top to bottom. Steps 1–5 get a working board; 6–8 are the automatic feeds
and can be skipped or added later without redeploying anything but the variables.

---

## 1. Add the logos

Unzip, then put two files in `site/assets/`:

- `abcflogo.png` — wide mark, 3338 × 574
- `raku.png` — square mark, 1:1

Transparent PNGs. A missing file just hides its slot.

## 2. Push to GitHub

```bash
cd gala-tally
git init && git add -A && git commit -m "Gala tally board"
gh repo create abcf-gala-tally --private --source=. --push
```

No Git? `npm i -g netlify-cli && netlify login && netlify deploy --prod` from the
folder works too. Drag-and-drop on app.netlify.com will NOT work — it cannot carry
functions.

## 3. Create the Netlify site

Add new site → Import an existing project → pick the repo.
Leave the build command empty. Publish directory `site` (netlify.toml sets it anyway).

Then Site configuration → Change site name → something typeable at the venue, e.g.
`abcf-gala-tally`. Everything below assumes `https://abcf-gala-tally.netlify.app`.

## 4. Set the PIN

Site configuration → Environment variables → Add:

| Key | Value |
| --- | --- |
| `ADMIN_PIN` | a 6-digit number you will hand to volunteers |

Deploys → Trigger deploy → Deploy site.

## 5. Check it works

- `https://abcf-gala-tally.netlify.app` redirects to the big screen, shows $0 and the logos
- `/raffle` and `/live` each show one big figure from the same data
- `/edit` asks for the PIN
- Add $10 to Donations on /edit; it appears on the screen within ~3 seconds
- Press "Full screen" on the display machine

Stop here and you have a working manual board. Everything below is optional.

---

## 6. Donations from the galasquare board (recommended)

Pulls the figure your donations board already shows, so the two agree and the
board's own confirmed/unconfirmed and fee-coverage rules apply.

On **galasquare**:
1. Add `netlify/functions/tally.mjs` from `galasquare-tally-endpoint.mjs`.
2. Adapt the two lines marked ADAPT to match how admin.html gets its data.
3. Set `TALLY_TOKEN` to a long random string: `openssl rand -hex 32`
4. Deploy.
5. Test: `curl -H "Authorization: Bearer <token>" https://galasquare.netlify.app/api/tally`
   Without the header it must return 401.

On **the tally board**:

| Key | Value |
| --- | --- |
| `GALASQUARE_TOTALS_URL` | `https://galasquare.netlify.app/api/tally` |
| `GALASQUARE_TOKEN` | the same value as `TALLY_TOKEN` |

Redeploy, then press "Sync donations now" on /edit under Automatic payments.

Leave the Square webhook (step 8) OFF if you use this, or card donations count twice.

## 7. Silent auction from SilentBids

On **SilentBids**: add the route from `silentbids-tally-endpoint.ts` at
`app/api/public/auctions/[auctionId]/tally/route.ts`, adapt the SQL to your schema,
set `TALLY_TOKEN`, deploy.

On **the tally board**:

| Key | Value |
| --- | --- |
| `SILENTBIDS_TOTALS_URL` | `https://www.silentauctions.app/api/public/auctions/54a28bfe-8778-4cc6-94fd-ce91afecdaea/tally` |
| `SILENTBIDS_TOKEN` | the same value as `TALLY_TOKEN` |
| `SILENTBIDS_LOT_RANGE` | `200-299` — only used if the feed carries no lot type |

Redeploy, then "Sync silent auction now" on /edit. The lot sheet fills with the
feed's lots, which doubles as a check that it is reading the right ones.

Not ready by the night? Leave these unset and keep the lot sheet by hand.

## 8. Square webhook — ONLY if you skip step 6

Square Developer Dashboard → your app → switch to **Production** → Webhooks →
Subscriptions → Add subscription.

- URL: `https://abcf-gala-tally.netlify.app/api/webhooks/square`
- Events: `payment.created` and `payment.updated`
- Save, reopen the subscription, copy the **Signature key**

| Key | Value |
| --- | --- |
| `SQUARE_SIGNATURE_KEY` | the signature key you just copied |
| `SQUARE_WEBHOOK_URL` | `https://abcf-gala-tally.netlify.app/api/webhooks/square` — character-identical to what you typed in Square |
| `SQUARE_CATEGORY` | `donations` |
| `SQUARE_LOCATION_MAP` | optional: `LOCATION_ID=donations,OTHER_ID=raffle1` |

`SQUARE_WEBHOOK_URL` is not redundant: Square signs the URL together with the body,
so the board must know the exact string. Comma-separate `SQUARE_SIGNATURE_KEY` to
accept a second Square account.

Stripe, if you want it, is the same shape: `STRIPE_WEBHOOK_SECRET` (`whsec_…`),
`STRIPE_CATEGORY`, optional `STRIPE_ACCOUNT_MAP`, subscribed to
`payment_intent.succeeded` at `/api/webhooks/stripe`.

---

## On the day

1. /edit → Screen settings → set the goal (0 hides the bar). Save.
2. /edit → Start over → type RESET → Clear all totals. This wipes test figures.
3. Starting funds → type the pre-gala total → Set.
4. Table sponsorships and In-kind → enter the known figures.
5. Decide what counts: under Adjust on each card, untick "Counts toward total" for
   anything that should show but not be counted. Pledges and in-kind are the usual ones.
6. Open /public on the display machine, press Full screen.
7. Hand volunteers the PIN and the /edit link.

Raffle 1 is $50 a ticket and Raffle 2 is $200 — entry is in tickets, not dollars.
Change those in `site/assets/shared.js` if the prices move.

## If something goes wrong on the night

- Screen stuck on "Reconnecting…" → the display lost wifi. The last figures stay up.
- A feed misbehaving → /edit → Automatic payments → turn it off and enter by hand.
- Wrong figure → Adjust on that card overwrites the total outright.
- Function errors → Netlify → Functions → click the function → Logs.
