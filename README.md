# NC Website Deployment

## Environment Variables

### Backend (Render)
- `STRIPE_SECRET_KEY` - live/test secret from Stripe.
- `ADMIN_KEY` - strong random string for admin endpoints; must match the frontend admin key when in use.
- `FRONTEND_ORIGIN` - `https://<your-netlify-site>.netlify.app` (https, no trailing slash).
- `FRONTEND_ORIGIN_2` - optional custom domain (`https://example.com`).
- `BACKEND_ORIGIN` - optional explicit backend origin (`https://nc-website.onrender.com`).
- `DATABASE_URL` - Postgres connection string used for durable customers, sales, vault saves, catalog, drops, analytics, and recommendations.
- `NODE_VERSION` - `20` (keeps Render on Node 20).
- SMTP vars (if email is enabled): `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`.
- `ORDER_NOTIFY_EMAIL` - email address that receives a notification for every completed purchase.

### Frontend (Netlify)
- `VITE_BACKEND_URL` - `https://<your-render-service>.onrender.com` (https, no trailing slash).
- `VITE_STRIPE_PUBLISHABLE_KEY` - Stripe publishable key for the environment.
- `VITE_ADMIN_KEY` - only when the in-browser admin UI is used; must equal the backend `ADMIN_KEY`.

> Optional proxy: Instead of `VITE_BACKEND_URL`, add a redirect in `netlify.toml` pointing `/api/*` to the Render URL and switch the frontend calls to relative `/api/...`. Only use one approach at a time.

## Checkout Links

One URL that opens the shop with the bag already filled — for a post, an email,
or a QR code at a show.

```
https://no-connection.com/shop?products=<id>:<qty>,<id>:<qty>&coupon=<CODE>
```

- `products` — comma-separated product ids from the catalog. The quantity after
  the colon is optional, so `?products=tee-black` means one. Quantities are
  capped at the shop's own per-item limit (3), and a link carries at most 20
  products.
- `coupon` — optional. Letters, digits and dashes, 3-32 characters. Stored
  upper-cased on the Stripe PaymentIntent so an order can be traced back to the
  campaign that sent it. **It does not change any price.** The shop runs no
  discounts today; charging less than the bag showed would need real pricing
  rules in `summarizeCart`, not a code in a URL.

A link is a request, never a reservation. Opening one resolves it against the
live catalog first (`GET /api/checkout/link`), and what it can add goes in the
bag through the same `/api/cart/add` every other add uses. Anything misspelled
or pulled from the shop is named rather than silently dropped, and the link is
taken out of the address bar so a reload doesn't add everything twice.

**Between drops a link still fills the bag.** The shop is closed, not gone, so
the link shows what it was pointing at and the bag says checkout opens with the
next drop. Nothing is taken out of inventory then — there is no drop to take it
from — so those lines carry no hold and no countdown. Paying stays shut:
`create-intent`, `prepare` and `confirm` each refuse outside a live drop.

This is what makes Meta Commerce's checkout-URL verification pass whenever Meta
runs it, rather than only while a drop happens to be live. During a drop the
old behaviour is unchanged: only what is genuinely for sale goes in the bag,
and sold-out items are named instead of added.

Because a bag can now exist without holding stock, every line records how many
units it actually took (`held`). Releases, expiry and the hold countdown all
read that, so a preview line can never hand back units it never took. When
checkout opens, `create-intent` converts any unheld line into a real
reservation before anything is charged — `confirm` does not re-check stock, so
without that step a bag built between drops could oversell the first units of
the next one.

Nothing in a link is trusted: malformed entries are skipped rather than
rejecting the whole link, so `?products=tee-black:2,junk,other:two` still opens
a bag with two tees in it. Sizes can't be set from a link — they're picked in
the bag, and checkout won't charge without them.

Check what a link will do before sharing it:

```
curl "https://<render-service>.onrender.com/api/checkout/link?products=tee-black:2&coupon=SHOW-2026"
```

The response gives each item a `status` (`ok`, `unknown`, `sold_out`,
`scheduled`, `unavailable`), the subtotal of what is buyable, anything it
couldn't parse in `problems`, and a cleaned-up `link` to share instead.

## Local Verification
```
# Backend
cd nc-working-backend
npm install
npm run db:migrate
npm run start
# In another terminal
curl http://localhost:8787/api/health
curl http://localhost:8787/api/drop/state

# Frontend
cd frontend
set VITE_BACKEND_URL=http://localhost:8787 && npm install && npm run dev
# mac/linux: export VITE_BACKEND_URL=http://localhost:8787
```
In the browser devtools Network tab, confirm API calls go to `http://localhost:8787/api/...` with 200 responses.

## Production Verification
- `https://<render-service>.onrender.com/` returns `{ ok: true, service: "nc-backend", docs: "/api/health" }`.
- `https://<render-service>.onrender.com/api/health` returns `{ ok: true }`.
- Netlify site loads without `Failed to fetch`; Network tab shows requests hitting the Render host (or `/api/...` when using the proxy) with 200/204 responses.
- If admin UI is enabled, API calls succeed with `x-admin-key` headers and uploads persist after refresh.

## Deploy Steps
1. **Render backend**
   - Set the env vars above (no trailing slash on origins).
   - Redeploy; Render runs `node dist/scripts/migrate.js` before starting the backend.
   - To migrate existing JSON data once, run `npm run db:import-json -- --dir ./data` from `nc-working-backend` with `DATABASE_URL` set.
   - Verify the startup log prints `CORS allowList: [...]` once, then remove or disable the log after confirming the origins.
2. **Netlify frontend (env approach)**
   - Set `VITE_BACKEND_URL` and `VITE_STRIPE_PUBLISHABLE_KEY`.
   - Redeploy; confirm API calls succeed.
3. **Netlify frontend (proxy approach)**
   - Add `/api/*` redirect in `netlify.toml` pointing to the Render URL.
   - Remove `VITE_BACKEND_URL` from the site envs; ensure frontend calls use relative `/api/...`.
   - Redeploy and verify the proxy works.

After verification, remove the temporary `console.log('CORS allowList:', allowList);` in `nc-working-backend/src/index.ts` to keep logs clean.
