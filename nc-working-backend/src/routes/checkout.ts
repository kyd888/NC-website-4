import { Router, type Request } from "express";
import { getCurrentDrop, getProduct } from "../lib/inventory.js";
import { absoluteUrl, availabilityOf, frontendOrigin } from "../lib/storefront.js";
import { parseCheckoutLink } from "../lib/checkoutLink.js";

/**
 * GET /checkout?products=<id>:<qty>,...&coupon=<CODE> — a cart page in HTML.
 *
 * The shop is a single-page app: Netlify serves one near-empty document and
 * React builds the bag afterwards, by asking the API what the link resolves to
 * and adding each line. Anything that reads the HTML and stops there — Meta
 * Commerce's checkout test, a link preview, a browser with scripting off — sees
 * a page with no cart on it at all, which is what Meta reported: "your checkout
 * link didn't go to a checkout or cart page."
 *
 * So the cart is rendered here, on the server, where it exists in the markup
 * with no scripting required. This is the same move /p/:id already makes for
 * product pages, and for the same reason.
 *
 * A person is not meant to stop here: the button goes straight to the shop
 * carrying the identical link, which fills the real bag and opens it. This page
 * only has to be true about what that bag will contain.
 */
export const checkoutRouter = Router();

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (ch) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch] ?? ch,
  );
}

const money = (cents: number) => `$${(Math.max(0, Math.round(cents)) / 100).toFixed(2)}`;

/**
 * The shop link, carrying the same cart plus any ad tracking params.
 *
 * Built from what actually parsed, never from the raw query value: that can
 * carry a space or an id the catalog has never heard of, which makes an invalid
 * link and sends the shop off to look up nothing.
 */
function shopHref(shop: string, req: Request, products: string, coupon: string | null): string {
  const extra: string[] = [];
  for (const [key, value] of Object.entries(req.query)) {
    if (typeof value === "string" && /^(fbclid|utm_[a-z]+)$/i.test(key)) {
      extra.push(`${encodeURIComponent(key)}=${encodeURIComponent(value)}`);
    }
  }
  // Commas and colons stay unencoded: they are legal in a query string and are
  // what makes the link readable.
  const parts = [products ? `products=${products}` : "", coupon ? `coupon=${coupon}` : "", ...extra].filter(Boolean);
  return `${shop}/shop${parts.length ? `?${parts.join("&")}` : ""}`;
}

function page(body: string, shop: string): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
<meta name="robots" content="noindex" />
<title>Your cart — NO CONNECTION</title>
<style>
  *{box-sizing:border-box}
  html,body{margin:0}
  body{background:#f2f2ee;color:#111;font-family:ui-sans-serif,system-ui,-apple-system,"Segoe UI",Inter,Helvetica,Arial,sans-serif;-webkit-font-smoothing:antialiased;min-height:100svh;display:flex;flex-direction:column}
  a{color:inherit}
  .top{display:flex;align-items:center;justify-content:space-between;gap:16px;padding:calc(14px + env(safe-area-inset-top)) 20px 14px;max-width:720px;width:100%;margin:0 auto}
  .mark{height:26px;width:auto;display:block}
  .label{font-size:11px;letter-spacing:.18em;text-transform:uppercase;opacity:.55}
  main{flex:1;width:100%;max-width:720px;margin:0 auto;padding:8px 20px 48px;display:grid;gap:20px;align-content:start}
  h1{margin:0;font-size:clamp(26px,5vw,36px);font-weight:700;letter-spacing:-.03em;line-height:1.05}
  p{margin:0;font-size:15px;line-height:1.6;color:rgba(17,17,17,.75);max-width:60ch}
  .card{background:#fff;border:1px solid rgba(0,0,0,.08);border-radius:20px;padding:18px 20px;display:grid;gap:14px}
  .eyebrow{font-size:11px;letter-spacing:.2em;text-transform:uppercase;color:#6b7280}
  .line{display:flex;align-items:center;gap:14px}
  .thumb{width:56px;height:56px;border-radius:12px;object-fit:cover;background:#f2f2ee;flex:none}
  .line__info{flex:1;min-width:0}
  .line__title{font-weight:600;font-size:15px}
  .line__meta{font-size:13px;color:rgba(17,17,17,.6)}
  .line__price{font-size:14px;white-space:nowrap}
  .totals{display:flex;justify-content:space-between;align-items:baseline;border-top:1px solid rgba(0,0,0,.08);padding-top:14px;font-size:15px}
  .totals strong{font-size:18px}
  .btn{display:flex;align-items:center;justify-content:center;border:1px solid #111;background:#111;color:#fdfdfb;border-radius:999px;padding:16px 24px;font-size:13px;letter-spacing:.12em;text-transform:uppercase;font-weight:600;text-decoration:none}
  .note{font-size:12.5px;color:rgba(17,17,17,.6)}
  footer{max-width:720px;width:100%;margin:0 auto;padding:16px 20px calc(22px + env(safe-area-inset-bottom));border-top:1px solid rgba(0,0,0,.08);font-size:11px;letter-spacing:.18em;text-transform:uppercase;color:rgba(17,17,17,.55)}
</style>
</head>
<body>
  <div class="top">
    <a href="${escapeHtml(shop || "/")}" aria-label="No Connection — home"><img class="mark" src="${escapeHtml(`${shop}/nc-star.png`)}" alt="" width="39" height="26" /></a>
    <span class="label">Cart</span>
  </div>
  <main>${body}</main>
  <footer><a href="${escapeHtml(shop || "/")}">no-connection.com</a></footer>
</body>
</html>`;
}

checkoutRouter.get("/", (req, res) => {
  const shop = frontendOrigin();
  const productsParam = typeof req.query.products === "string" ? req.query.products : "";
  const parsed = parseCheckoutLink({
    products: productsParam,
    coupon: typeof req.query.coupon === "string" ? req.query.coupon : null,
  });

  // Between drops every past piece reads as "soldout", which there only means
  // the shop is shut — saying so on each line would call the whole cart sold
  // out every time no drop is running. Only a live drop can tell you a piece is
  // actually gone.
  const live = getCurrentDrop()?.status === "live";

  const lines = parsed.items.flatMap((item) => {
    const product = getProduct(item.productId);
    if (!product || product.enabled === false) return [];
    const { state } = availabilityOf(product.id);
    return [
      {
        id: product.id,
        title: product.title,
        qty: item.qty,
        priceCents: product.priceCents,
        lineCents: product.priceCents * item.qty,
        image: absoluteUrl(req, product.imageUrl),
        soldOut: live && (state === "soldout" || state === "ended"),
      },
    ];
  });

  const subtotal = lines.reduce((sum, line) => sum + line.lineCents, 0);
  // Quantities of one are left off, the way the link builder writes them.
  const cleanProducts = lines.map((line) => (line.qty > 1 ? `${line.id}:${line.qty}` : line.id)).join(",");
  const href = shopHref(shop, req, cleanProducts, parsed.coupon);

  res.set("Cache-Control", "no-store");

  if (!lines.length) {
    return res.status(200).type("html").send(
      page(
        `<h1>Your cart is empty.</h1>
         <p>Nothing in this link is in the shop right now. The pieces it named may have sold out, or the link may be out of date.</p>
         <div class="card"><a class="btn" href="${escapeHtml(href)}">Go to the shop</a></div>`,
        shop,
      ),
    );
  }

  const items = lines
    .map(
      (line) => `<div class="line">
        ${line.image ? `<img class="thumb" src="${escapeHtml(line.image)}" alt="" width="56" height="56" />` : `<div class="thumb"></div>`}
        <div class="line__info">
          <div class="line__title">${escapeHtml(line.title)}</div>
          <div class="line__meta">Qty ${line.qty} · ${escapeHtml(money(line.priceCents))} each${line.soldOut ? " · Sold out" : ""}</div>
        </div>
        <div class="line__price">${escapeHtml(money(line.lineCents))}</div>
      </div>`,
    )
    .join("");

  res.type("html").send(
    page(
      `<h1>Your cart</h1>
       <div class="card">
         <div class="eyebrow">${lines.length} item${lines.length === 1 ? "" : "s"}</div>
         ${items}
         ${parsed.coupon ? `<div class="line__meta">Code ${escapeHtml(parsed.coupon)} applied at checkout</div>` : ""}
         <div class="totals"><span>Subtotal</span><strong>${escapeHtml(money(subtotal))}</strong></div>
       </div>
       <a class="btn" href="${escapeHtml(href)}">Checkout</a>
       <p class="note">${
         live
           ? "Taxes and shipping are worked out at checkout. Sizes are chosen there too."
           : "Your cart is saved. Payment opens when the next drop goes live."
       }</p>`,
      shop,
    ),
  );
});
