import { Router, type Request } from "express";
import {
  getProduct,
  listCatalog,
  getCurrentDrop,
  getAllRemaining,
  getDisplayedRemaining,
  getRecentlyLiveProductIds,
  getVaultSaveWindowMs,
} from "../lib/inventory.js";

export const shareRouter = Router();

/** Below this, the page names the number instead of just saying "in stock". */
const LOW_STOCK_AT = 5;

type Availability =
  | { state: "available"; qty: number }
  | { state: "low"; qty: number }
  | { state: "soldout" }
  /** In a drop that hasn't opened yet — the link works, the buying doesn't. */
  | { state: "scheduled"; startsAt: string }
  | { state: "upcoming"; startsAt: string | null };

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (ch) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch] ?? ch,
  );
}

function trimSlash(value: string | undefined | null): string {
  return (value ?? "").trim().replace(/\/+$/, "");
}

/** Where the shop lives, so "Shop this" leaves the API host. */
function frontendOrigin(): string {
  return trimSlash(process.env.FRONTEND_ORIGIN) || trimSlash(process.env.FRONTEND_ORIGIN_2) || "";
}

/** Crawlers need an absolute og:image; uploads are stored as site-relative paths. */
function absoluteUrl(req: Request, url: string | undefined): string {
  if (!url) return "";
  if (/^https?:\/\//i.test(url)) return url;
  const base =
    trimSlash(process.env.BACKEND_ORIGIN) ||
    `${req.protocol}://${req.get("host") ?? ""}`;
  return `${base}${url.startsWith("/") ? "" : "/"}${url}`;
}

function availabilityOf(productId: string): Availability {
  const drop = getCurrentDrop();
  // Same source the shop reads, so the two never contradict each other.
  const qty = getDisplayedRemaining()[productId] ?? 0;

  if (drop?.status === "live") {
    if (qty <= 0) return { state: "soldout" };
    return qty <= LOW_STOCK_AT ? { state: "low", qty } : { state: "available", qty };
  }

  // Scheduled drop this product is part of: say when, so the link is worth
  // sharing before the drop opens.
  if (drop?.status === "scheduled" && drop.startsAt && productId in getAllRemaining()) {
    return { state: "scheduled", startsAt: drop.startsAt };
  }

  // Between drops: an item that was just live is sold out rather than unreleased.
  const recent = new Set(getRecentlyLiveProductIds(getVaultSaveWindowMs()));
  if (recent.has(productId)) return { state: "soldout" };
  return { state: "upcoming", startsAt: drop?.startsAt ?? null };
}

function statusLabel(a: Availability): string {
  switch (a.state) {
    case "available": return "In stock";
    case "low": return `${a.qty} left`;
    case "soldout": return "Sold out";
    case "scheduled": return "Drops soon";
    case "upcoming": return "Not yet released";
  }
}

/**
 * UTC rendering of the drop time. This is what crawlers and no-JS readers get;
 * the browser rewrites it into the reader's own zone on load.
 */
function whenLabel(iso: string): string {
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return "";
  return d.toLocaleString("en-US", {
    weekday: "long", month: "long", day: "numeric",
    hour: "numeric", minute: "2-digit", timeZone: "UTC", timeZoneName: "short",
  });
}

function priceLabel(cents: number): string {
  return `$${(cents / 100).toFixed(2).replace(/\.00$/, "")}`;
}

shareRouter.get("/:id", (req, res) => {
  const requested = req.params.id;
  let product = getProduct(requested);

  // These links get typed, pasted into other apps and auto-capitalised by
  // phone keyboards, so a wrong-case id shouldn't be a dead end. Send the
  // reader to the canonical URL rather than serving two URLs for one product.
  if (!product) {
    const match = listCatalog().find(
      (item) => item.id.toLowerCase() === requested.toLowerCase(),
    );
    if (match) {
      res.redirect(301, `/p/${encodeURIComponent(match.id)}`);
      return;
    }
  }

  if (!product || product.enabled === false) {
    res.status(404).type("html").send(notFoundPage(frontendOrigin()));
    return;
  }

  const availability = availabilityOf(product.id);
  const status = statusLabel(availability);
  const shop = frontendOrigin();
  const images = (product.images?.length ? product.images : product.imageUrl ? [product.imageUrl] : [])
    .map((url) => absoluteUrl(req, url));
  const ogImage = images[0] ?? "";
  const canonical = `${trimSlash(process.env.BACKEND_ORIGIN) || `${req.protocol}://${req.get("host") ?? ""}`}/p/${encodeURIComponent(product.id)}`;
  const shareUrl = shop ? `${shop}/p/${encodeURIComponent(product.id)}` : canonical;

  const title = escapeHtml(product.title);
  const price = priceLabel(product.priceCents);
  const description =
    availability.state === "soldout"
      ? `${product.title} — sold out. Get told if it returns.`
      : availability.state === "scheduled"
        ? `${product.title} — ${price}. Drops ${whenLabel(availability.startsAt)}.`
        : `${product.title} — ${price}. Limited drops, no restocks.`;

  // Sold out and between-drops both offer the alert; the copy differs.
  const wantsAlert = availability.state === "soldout";
  const canShop = availability.state === "available" || availability.state === "low";

  res.type("html").send(`<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${title} — NO CONNECTION</title>
<meta name="description" content="${escapeHtml(description)}" />
<link rel="canonical" href="${escapeHtml(shareUrl)}" />

<meta property="og:type" content="product" />
<meta property="og:site_name" content="NO CONNECTION" />
<meta property="og:url" content="${escapeHtml(shareUrl)}" />
<meta property="og:title" content="${title} — ${escapeHtml(price)}" />
<meta property="og:description" content="${escapeHtml(description)}" />
${ogImage ? `<meta property="og:image" content="${escapeHtml(ogImage)}" />
<meta property="og:image:alt" content="${title}" />` : ""}
<meta name="twitter:card" content="summary_large_image" />
<meta name="twitter:title" content="${title} — ${escapeHtml(price)}" />
<meta name="twitter:description" content="${escapeHtml(description)}" />
${ogImage ? `<meta name="twitter:image" content="${escapeHtml(ogImage)}" />` : ""}

<style>
  *{box-sizing:border-box}
  html,body{margin:0}
  body{
    background:#f2f2ee;color:#111;
    font-family:ui-sans-serif,system-ui,-apple-system,"Segoe UI",Inter,Helvetica,Arial,sans-serif;
    -webkit-font-smoothing:antialiased;
    min-height:100svh;display:flex;flex-direction:column;
  }
  a{color:inherit;text-decoration:none}
  .top{
    display:flex;align-items:center;justify-content:space-between;gap:16px;
    padding:calc(14px + env(safe-area-inset-top)) 20px 14px;
    max-width:1100px;width:100%;margin:0 auto;
  }
  .mark{width:26px;height:auto;display:block}
  .mark path{fill:#111}
  .label{font-size:11px;letter-spacing:.18em;text-transform:uppercase;opacity:.55}
  main{
    flex:1;width:100%;max-width:1100px;margin:0 auto;padding:0 20px 40px;
    display:grid;gap:clamp(20px,4vw,56px);align-content:start;
    grid-template-columns:1fr;
  }
  @media (min-width:820px){ main{grid-template-columns:1fr 1fr;align-items:center} }
  .shot{display:grid;place-items:center;padding:8px 0}
  .shot img{width:100%;max-width:460px;height:auto;display:block}
  .shot--empty{
    width:100%;max-width:460px;aspect-ratio:1;border-radius:20px;
    background:radial-gradient(ellipse at 45% 40%,#1c1c1c,#0b0b0b 72%);
  }
  .meta{display:flex;flex-direction:column;gap:14px;align-items:flex-start}
  h1{
    margin:0;font-size:clamp(34px,7vw,60px);font-weight:700;letter-spacing:-.045em;
    line-height:.95;text-transform:uppercase;
  }
  .price{font-size:clamp(18px,2.4vw,24px);font-weight:700;letter-spacing:-.02em}
  .status{
    display:inline-flex;align-items:center;gap:9px;
    padding-top:14px;border-top:1px solid rgba(0,0,0,.14);width:100%;
    font-size:11px;letter-spacing:.18em;text-transform:uppercase;
  }
  .status i{width:6px;height:6px;border-radius:999px;background:#111;font-style:normal}
  .status.is-low{color:#a32b1f} .status.is-low i{background:#a32b1f}
  .status.is-gone{color:rgba(17,17,17,.45)} .status.is-gone i{background:rgba(17,17,17,.3)}
  .actions{display:flex;flex-wrap:wrap;gap:10px;margin-top:6px}
  .btn{
    display:inline-flex;align-items:center;justify-content:center;
    border:1px solid rgba(0,0,0,.14);background:transparent;color:#111;cursor:pointer;
    border-radius:999px;padding:13px 22px;font:inherit;font-size:13px;letter-spacing:.06em;
    line-height:1;transition:transform .15s ease,background .15s ease,opacity .15s ease;
  }
  .btn:hover{transform:translateY(-1px)}
  .btn--solid{background:#111;color:#fdfdfb;border-color:#111}
  .btn--solid:hover{background:#050505}
  form.alert{display:flex;flex-wrap:wrap;gap:10px;width:100%;max-width:420px;margin-top:4px}
  /* Beats the class selector above, which would otherwise keep a hidden form visible. */
  form.alert[hidden]{display:none}
  form.alert input{
    flex:1 1 200px;min-width:0;font:inherit;font-size:16px;color:#111;
    background:#fff;border:1px solid rgba(0,0,0,.14);border-radius:999px;padding:12px 18px;
  }
  form.alert input:focus-visible,.btn:focus-visible{outline:2px solid #111;outline-offset:2px}
  .note{font-size:12.5px;line-height:1.6;color:rgba(17,17,17,.6);margin:0;max-width:44ch}
  .note[hidden]{display:none}
  footer{
    max-width:1100px;width:100%;margin:0 auto;
    padding:16px 20px calc(22px + env(safe-area-inset-bottom));
    border-top:1px solid rgba(0,0,0,.08);
    display:flex;justify-content:space-between;gap:16px;flex-wrap:wrap;
    font-size:11px;letter-spacing:.18em;text-transform:uppercase;color:rgba(17,17,17,.55);
  }
  footer a:hover{color:#111}
  @media (prefers-reduced-motion:reduce){ .btn{transition:none} }
</style>
</head>
<body>
  <div class="top">
    <a href="${escapeHtml(shop || "/")}" aria-label="No Connection — home">
      <svg class="mark" viewBox="0 0 120 44" aria-hidden="true">
        <path d="M34 2 Q40 20 116 21.5 Q40 23 34 42 Q28 23 4 21.5 Q28 20 34 2 Z"/>
      </svg>
    </a>
    <span class="label">Limited drops &middot; No restocks</span>
  </div>

  <main>
    <div class="shot">
      ${ogImage
        ? `<img src="${escapeHtml(ogImage)}" alt="${title}" />`
        : `<div class="shot--empty" role="img" aria-label="${title}"></div>`}
    </div>

    <div class="meta">
      <h1>${title}</h1>
      <div class="price">${escapeHtml(price)}</div>
      <div class="status ${availability.state === "low" ? "is-low" : availability.state === "available" ? "" : "is-gone"}">
        <i></i>${escapeHtml(status)}
      </div>

      <div class="actions">
        ${canShop && shop
          ? `<a class="btn btn--solid" href="${escapeHtml(shop)}/shop?p=${encodeURIComponent(product.id)}">Shop this</a>`
          : ""}
        <button class="btn" type="button" id="share">Share</button>
      </div>

      ${wantsAlert
        ? `<form class="alert" id="alertForm">
             <input id="alertEmail" type="email" name="email" inputmode="email"
                    autocomplete="email" required placeholder="Email for a heads-up" aria-label="Email address" />
             <button class="btn btn--solid" type="submit">Tell me</button>
           </form>
           <p class="note" id="alertNote">One message if this comes back. Nothing else.</p>`
        : availability.state === "scheduled"
          ? `<p class="note">Drops <b><time datetime="${escapeHtml(availability.startsAt)}" data-when>${escapeHtml(whenLabel(availability.startsAt))}</time></b>. Save the link &mdash; this page turns into the buy page when it opens.</p>`
          : availability.state === "upcoming"
            ? `<p class="note">This piece isn&rsquo;t in the current drop. ${shop ? `<a href="${escapeHtml(shop)}/shop" style="text-decoration:underline;text-underline-offset:3px">See what&rsquo;s live</a>.` : ""}</p>`
            : ""}
    </div>
  </main>

  <footer>
    <a href="${escapeHtml(shop || "/")}">no-connection.com</a>
    ${shop ? `<a href="${escapeHtml(shop)}/shop">Shop</a>` : ""}
  </footer>

<script>
(function () {
  // The drop time is rendered in UTC so it is correct before any JS runs.
  // Anyone with a browser gets it in their own timezone instead.
  var when = document.querySelector("[data-when]");
  if (when && when.dateTime) {
    var at = new Date(when.dateTime);
    if (!isNaN(at.getTime())) {
      try {
        when.textContent = at.toLocaleString(undefined, {
          weekday: "long", month: "long", day: "numeric",
          hour: "numeric", minute: "2-digit", timeZoneName: "short"
        });
      } catch (e) {
        /* keep the UTC text */
      }
    }
  }

  var url = ${JSON.stringify(shareUrl)};
  var title = ${JSON.stringify(product.title)};
  var btn = document.getElementById("share");
  if (btn) {
    btn.addEventListener("click", function () {
      // The native sheet is the whole point on a phone; copy is the desktop fallback.
      if (navigator.share) {
        navigator.share({ title: title, url: url }).catch(function () {});
        return;
      }
      var done = function () {
        var was = btn.textContent;
        btn.textContent = "Link copied";
        setTimeout(function () { btn.textContent = was; }, 1600);
      };
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(url).then(done, function () {});
      } else {
        var f = document.createElement("input");
        f.value = url; document.body.appendChild(f); f.select();
        try { document.execCommand("copy"); done(); } catch (e) {}
        document.body.removeChild(f);
      }
    });
  }

  var form = document.getElementById("alertForm");
  if (form) {
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      var email = document.getElementById("alertEmail").value.trim();
      var note = document.getElementById("alertNote");
      var submit = form.querySelector("button");
      if (!email) return;
      submit.disabled = true; submit.textContent = "Sending";
      fetch(${JSON.stringify("/api/save")}, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productId: ${JSON.stringify(product.id)}, email: email })
      }).then(function (r) {
        return r.json().catch(function () { return {}; }).then(function (d) {
          return { ok: r.ok, data: d };
        });
      }).then(function (res) {
        if (res.ok) {
          form.hidden = true;
          note.textContent = "Done. We'll email " + email + " if it returns.";
        } else {
          submit.disabled = false; submit.textContent = "Tell me";
          note.textContent = res.data.error || "That didn't go through. Try again.";
        }
      }).catch(function () {
        submit.disabled = false; submit.textContent = "Tell me";
        note.textContent = "That didn't go through. Try again.";
      });
    });
  }
})();
</script>
</body>
</html>`);
});

function notFoundPage(shop: string): string {
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Not found — NO CONNECTION</title>
<meta name="robots" content="noindex" />
<style>
  html,body{margin:0}
  body{background:#f2f2ee;color:#111;min-height:100svh;display:grid;place-items:center;text-align:center;
    font-family:ui-sans-serif,system-ui,-apple-system,"Segoe UI",Inter,Helvetica,Arial,sans-serif;padding:24px}
  h1{margin:0 0 12px;font-size:30px;font-weight:700;letter-spacing:-.04em;text-transform:uppercase}
  p{margin:0 0 22px;font-size:13px;letter-spacing:.06em;color:rgba(17,17,17,.6)}
  a{display:inline-block;color:#fdfdfb;background:#111;border-radius:999px;padding:13px 22px;
    font-size:13px;letter-spacing:.06em;text-decoration:none}
</style></head>
<body><div>
  <h1>Gone</h1>
  <p>This piece isn&rsquo;t here any more.</p>
  ${shop ? `<a href="${shop}/shop">See what&rsquo;s live</a>` : ""}
</div></body></html>`;
}
