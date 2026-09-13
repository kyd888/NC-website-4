import { Router, type Request } from "express";
import { getProduct, listCatalog } from "../lib/inventory.js";
import {
  absoluteUrl,
  availabilityOf,
  frontendOrigin,
  trimSlash,
  type Availability,
} from "../lib/storefront.js";

export const shareRouter = Router();

/**
 * Meta Pixel dataset — the same one the shop loads in frontend/index.html.
 * Catalog items link to this page (routes/feeds.ts), so it records the visit
 * and the product viewed, even when the product isn't buyable right now.
 * Public: it ships in page source.
 */
const META_PIXEL_ID = "2284389019019649";

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (ch) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch] ?? ch,
  );
}

/**
 * A link into the shop that keeps the visit's tracking params: Meta's ad click
 * id and utm_* tags. Catalog ads and shop taps land on this page, so without
 * them the fbclid is gone one tap later and a purchase can't be tied back to
 * the ad that sold it.
 */
function shopHref(shop: string, req: Request, productId?: string): string {
  const params = new URLSearchParams();
  if (productId) params.set("p", productId);
  for (const [key, value] of Object.entries(req.query)) {
    if (typeof value === "string" && /^(fbclid|utm_[a-z]+)$/i.test(key)) params.set(key, value);
  }
  const query = params.toString();
  return `${shop}/shop${query ? `?${query}` : ""}`;
}

/**
 * The product shot at page size. Uploads are full-resolution PNG cutouts
 * (1–1.5 MB each), too heavy for a page opened from an ad on a phone, so
 * Cloudinary resizes and picks the format per browser; transparency survives.
 */
function pagePhotoUrl(url: string): string {
  const match = /^(https:\/\/res\.cloudinary\.com\/[^/]+\/image\/upload\/)(.+)$/i.exec(url);
  return match ? `${match[1]}f_auto,q_auto,w_920/${match[2]}` : url;
}

function statusLabel(a: Availability): string {
  switch (a.state) {
    case "available": return "In stock";
    case "low": return `${a.qty} left`;
    case "soldout": return "Sold out";
    case "ended": return "Sold out";
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
  // Every shared link shows the NC mark, not the garment: one recognisable
  // thumbnail across the feed instead of a photo cropped to a social card's
  // shape. The product shots still carry the page itself. Regenerate the
  // asset with scripts/make-og-card.mjs.
  const ogImage = absoluteUrl(req, "/og-card.png");
  // The page shows the piece itself; the mark stands in only when there's no photo.
  const photo = images[0] ? pagePhotoUrl(images[0]) : ogImage;
  const canonical = `${trimSlash(process.env.BACKEND_ORIGIN) || `${req.protocol}://${req.get("host") ?? ""}`}/p/${encodeURIComponent(product.id)}`;
  const shareUrl = shop ? `${shop}/p/${encodeURIComponent(product.id)}` : canonical;

  const title = escapeHtml(product.title);
  const price = priceLabel(product.priceCents);
  const description =
    availability.state === "soldout"
      ? `${product.title} — sold out. Get told if it returns.`
      : availability.state === "ended"
        ? `${product.title} — sold out. Limited drops, no restocks.`
        : availability.state === "scheduled"
          ? `${product.title} — ${price}. Drops ${whenLabel(availability.startsAt)}.`
          : `${product.title} — ${price}. Limited drops, no restocks.`;

  // Only a piece still inside its save window offers the alert: /api/save
  // turns away anything older, so a long-sold-out piece just says so.
  const wantsAlert = availability.state === "soldout";
  const canShop = availability.state === "available" || availability.state === "low";

  res.type("html").send(`<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<!-- viewport-fit=cover: in Instagram's in-app browser the page otherwise stops
     above the iPhone home indicator and the webview paints that strip white.
     The header and footer already pad by env(safe-area-inset-*) for this. -->
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
<meta name="theme-color" content="#f2f2ee" />
<script>
  /* Same as the SPA: inside Instagram's in-app browser the page goes white to
     match the opaque white bar the app draws over the bottom. Runs before first
     paint. indexOf, not a regex: this is a template literal, where \\b breaks. */
  if (navigator.userAgent.indexOf("Instagram") !== -1) {
    document.documentElement.classList.add("in-instagram");
    var themeColor = document.querySelector('meta[name="theme-color"]');
    if (themeColor) themeColor.setAttribute("content", "#ffffff");
  }
</script>
<title>${title} — NO CONNECTION</title>
<meta name="description" content="${escapeHtml(description)}" />
<link rel="canonical" href="${escapeHtml(shareUrl)}" />

<meta property="og:type" content="product" />
<meta property="og:site_name" content="NO CONNECTION" />
<meta property="og:url" content="${escapeHtml(shareUrl)}" />
<meta property="og:title" content="${title} — ${escapeHtml(price)}" />
<meta property="og:description" content="${escapeHtml(description)}" />
<meta property="og:image" content="${escapeHtml(ogImage)}" />
<meta property="og:image:width" content="1200" />
<meta property="og:image:height" content="630" />
<meta property="og:image:alt" content="No Connection" />
<meta name="twitter:card" content="summary_large_image" />
<meta name="twitter:title" content="${title} — ${escapeHtml(price)}" />
<meta name="twitter:description" content="${escapeHtml(description)}" />
<meta name="twitter:image" content="${escapeHtml(ogImage)}" />

<style>
  *{box-sizing:border-box}
  :root{--page-bg:#f2f2ee}
  html.in-instagram{--page-bg:#ffffff}
  html,body{margin:0}
  body{
    background:var(--page-bg);color:#111;
    font-family:ui-sans-serif,system-ui,-apple-system,"Segoe UI",Inter,Helvetica,Arial,sans-serif;
    -webkit-font-smoothing:antialiased;
    min-height:100svh;display:flex;flex-direction:column;
  }
  a{color:inherit;text-decoration:none}
  .top{
    display:flex;align-items:center;justify-content:space-between;gap:16px;
    padding:calc(14px + env(safe-area-inset-top)) max(20px, env(safe-area-inset-right)) 14px max(20px, env(safe-area-inset-left));
    max-width:1100px;width:100%;margin:0 auto;
  }
  .mark{width:26px;height:auto;display:block}
  .mark path{fill:#111}
  .label{font-size:11px;letter-spacing:.18em;text-transform:uppercase;opacity:.55}
  main{
    flex:1;width:100%;max-width:1100px;margin:0 auto;
    padding:0 max(20px, env(safe-area-inset-right)) 40px max(20px, env(safe-area-inset-left));
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
    padding:16px max(20px, env(safe-area-inset-right)) calc(22px + env(safe-area-inset-bottom)) max(20px, env(safe-area-inset-left));
    border-top:1px solid rgba(0,0,0,.08);
    display:flex;justify-content:space-between;gap:16px;flex-wrap:wrap;
    font-size:11px;letter-spacing:.18em;text-transform:uppercase;color:rgba(17,17,17,.55);
  }
  footer a:hover{color:#111}
  footer nav{display:flex;gap:22px}
  @media (prefers-reduced-motion:reduce){ .btn{transition:none} }
</style>
<!-- Meta Pixel: Meta's base code, then the product viewed, matched to the
     catalog by product id (the feed's g:id). -->
<script>
  !function(f,b,e,v,n,t,s)
  {if(f.fbq)return;n=f.fbq=function(){n.callMethod?
  n.callMethod.apply(n,arguments):n.queue.push(arguments)};
  if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';
  n.queue=[];t=b.createElement(e);t.async=!0;
  t.src=v;s=b.getElementsByTagName(e)[0];
  s.parentNode.insertBefore(t,s)}(window, document,'script',
  'https://connect.facebook.net/en_US/fbevents.js');
  fbq('init', ${JSON.stringify(META_PIXEL_ID)});
  fbq('track', 'PageView');
  fbq('track', 'ViewContent', {
    content_ids: [${JSON.stringify(product.id)}],
    content_type: 'product',
    content_name: ${JSON.stringify(product.title)},
    value: ${(product.priceCents / 100).toFixed(2)},
    currency: 'USD'
  });
</script>
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
      ${photo
        ? `<img src="${escapeHtml(photo)}" alt="${title}" />`
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
          ? `<a class="btn btn--solid" href="${escapeHtml(shopHref(shop, req, product.id))}">Shop this</a>`
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
          : availability.state === "upcoming" || availability.state === "ended"
            ? `<p class="note">${availability.state === "ended" ? "This piece has sold out." : "This piece isn&rsquo;t in the current drop."} ${shop ? `<a href="${escapeHtml(shopHref(shop, req))}" style="text-decoration:underline;text-underline-offset:3px">See what&rsquo;s live</a>.` : ""}</p>`
            : ""}
    </div>
  </main>

  <footer>
    <a href="${escapeHtml(shop || "/")}">no-connection.com</a>
    ${shop
      ? `<nav><a href="${escapeHtml(shopHref(shop, req))}">Shop</a><a href="${escapeHtml(shop)}/privacy">Privacy</a></nav>`
      : ""}
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
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
<meta name="theme-color" content="#f2f2ee" />
<script>
  if (navigator.userAgent.indexOf("Instagram") !== -1) {
    document.documentElement.classList.add("in-instagram");
    var themeColor = document.querySelector('meta[name="theme-color"]');
    if (themeColor) themeColor.setAttribute("content", "#ffffff");
  }
</script>
<title>Not found — NO CONNECTION</title>
<meta name="robots" content="noindex" />
<style>
  :root{--page-bg:#f2f2ee}
  html.in-instagram{--page-bg:#ffffff}
  html,body{margin:0}
  body{background:var(--page-bg);color:#111;min-height:100svh;display:grid;place-items:center;text-align:center;
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
