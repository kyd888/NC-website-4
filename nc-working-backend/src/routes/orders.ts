import { Router } from "express";
import { findByAddressToken, recordCustomerAddress } from "../lib/orderFulfillment.js";
import { groupSalesByOrder, listSales } from "../lib/sales.js";
import { validateShippingAddress } from "../lib/pickup.js";
import { frontendOrigin } from "../lib/storefront.js";

/**
 * Customer-facing order pages that don't belong in the shop app.
 *
 * GET/POST /orders/address/:token — a missed pickup: the customer gives the
 * address to ship to instead. The link is unique to their order (issued from
 * the admin), works for 30 days, and charges nothing. Same address rules as
 * checkout.
 */
export const ordersRouter = Router();

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch] ?? ch);
}

function page(title: string, body: string, shop: string): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
<meta name="robots" content="noindex" />
<title>${escapeHtml(title)} — NO CONNECTION</title>
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
  .card{background:#fff;border:1px solid rgba(0,0,0,.08);border-radius:20px;padding:18px 20px;display:grid;gap:8px}
  .eyebrow{font-size:11px;letter-spacing:.2em;text-transform:uppercase;color:#6b7280}
  .item{display:flex;justify-content:space-between;gap:12px;font-size:14px}
  .item span:last-child{color:rgba(17,17,17,.6);white-space:nowrap}
  form{display:grid;gap:12px}
  .row{display:grid;gap:6px}
  .grid{display:grid;gap:12px;grid-template-columns:1fr 1fr}
  @media (max-width:520px){.grid{grid-template-columns:1fr}}
  label{font-size:11px;letter-spacing:.16em;text-transform:uppercase;color:#6b7280}
  input{width:100%;font:inherit;font-size:16px;color:#111;background:#fff;border:1px solid rgba(0,0,0,.14);border-radius:12px;padding:12px 14px}
  input:focus-visible{outline:2px solid #111;outline-offset:2px}
  .btn{display:inline-flex;align-items:center;justify-content:center;border:1px solid #111;background:#111;color:#fdfdfb;cursor:pointer;border-radius:999px;padding:14px 24px;font:inherit;font-size:13px;letter-spacing:.12em;text-transform:uppercase;font-weight:600}
  .error{background:#fee2e2;color:#991b1b;padding:10px 12px;border-radius:12px;font-size:13px}
  .note{font-size:12.5px;color:rgba(17,17,17,.6)}
  footer{max-width:720px;width:100%;margin:0 auto;padding:16px 20px calc(22px + env(safe-area-inset-bottom));border-top:1px solid rgba(0,0,0,.08);font-size:11px;letter-spacing:.18em;text-transform:uppercase;color:rgba(17,17,17,.55)}
</style>
</head>
<body>
  <div class="top">
    <a href="${escapeHtml(shop || "/")}" aria-label="No Connection — home"><img class="mark" src="${escapeHtml(`${shop}/nc-star.png`)}" alt="" width="39" height="26" /></a>
    <span class="label">Order update</span>
  </div>
  <main>${body}</main>
  <footer><a href="${escapeHtml(shop || "/")}">no-connection.com</a></footer>
</body>
</html>`;
}

function expiredPage(shop: string) {
  return page(
    "Link expired",
    `<h1>This link isn’t valid any more.</h1>
     <p>Address links work for 30 days. Reply to the email you got from us and we’ll sort it out.</p>`,
    shop,
  );
}

function orderFor(token: string) {
  const record = findByAddressToken(token);
  if (!record) return null;
  const order = groupSalesByOrder(listSales(5000)).find((o) => o.orderId === record.orderId);
  if (!order) return null;
  const pickupLine = order.items.find((l) => l.fulfillment.method === "pickup");
  return { record, order, pickupLine };
}

type FormValues = { line1: string; line2: string; city: string; state: string; postalCode: string; country: string };

function formPage(data: NonNullable<ReturnType<typeof orderFor>>, values: FormValues, error: string, shop: string) {
  const { order, pickupLine, record } = data;
  const items = order.items
    .filter((l) => l.fulfillment.method === "pickup")
    .map((l) => `<div class="item"><span>${escapeHtml(l.productTitle ?? l.productId)}${l.size ? ` · Size ${escapeHtml(l.size)}` : ""}</span><span>× ${l.qty}</span></div>`)
    .join("");
  const show = pickupLine?.fulfillment.show;
  const saved = record.missedPickupAddress;
  const field = (name: keyof FormValues, label: string, autocomplete: string, placeholder = "") =>
    `<div class="row"><label for="f-${name}">${label}</label><input id="f-${name}" name="${name}" value="${escapeHtml(values[name])}" autocomplete="${autocomplete}" placeholder="${escapeHtml(placeholder)}" /></div>`;
  return page(
    "Where should we send it?",
    `<h1>Where should we send it?</h1>
     <p>Order <strong>${escapeHtml(order.orderNumber)}</strong>${show ? ` wasn’t collected at ${escapeHtml(show.name)}` : ""}. Enter the address to ship it to. There’s nothing more to pay.</p>
     <div class="card"><div class="eyebrow">Shipping</div>${items || "<div class='item'><span>Your order</span></div>"}</div>
     ${saved ? `<div class="card"><div class="eyebrow">Address on file</div><div>${escapeHtml([saved.line1, saved.line2, `${saved.city}, ${saved.state} ${saved.postalCode}`, saved.country].filter(Boolean).join(" · "))}</div><div class="note">Submit the form to change it.</div></div>` : ""}
     <form method="post" class="card">
       <div class="eyebrow">Ship to</div>
       ${error ? `<div class="error" role="alert">${escapeHtml(error)}</div>` : ""}
       ${field("line1", "Address line 1", "address-line1", "123 Market St")}
       ${field("line2", "Address line 2 (optional)", "address-line2", "Apt, suite, etc.")}
       <div class="grid">
         ${field("city", "City", "address-level2")}
         ${field("state", "State", "address-level1", "OK")}
       </div>
       <div class="grid">
         ${field("postalCode", "ZIP / postal code", "postal-code")}
         ${field("country", "Country", "country", "US")}
       </div>
       <button class="btn" type="submit">Send it here</button>
     </form>`,
    shop,
  );
}

ordersRouter.get("/address/:token", (req, res) => {
  const shop = frontendOrigin();
  const data = orderFor(req.params.token);
  res.set("Cache-Control", "no-store");
  if (!data) return res.status(404).type("html").send(expiredPage(shop));
  const saved = data.record.missedPickupAddress;
  res.type("html").send(
    formPage(
      data,
      {
        line1: saved?.line1 ?? "",
        line2: saved?.line2 ?? "",
        city: saved?.city ?? "",
        state: saved?.state ?? "",
        postalCode: saved?.postalCode ?? "",
        country: saved?.country ?? "US",
      },
      "",
      shop,
    ),
  );
});

ordersRouter.post("/address/:token", async (req, res) => {
  const shop = frontendOrigin();
  const data = orderFor(req.params.token);
  res.set("Cache-Control", "no-store");
  if (!data) return res.status(404).type("html").send(expiredPage(shop));
  const body = (req.body ?? {}) as Record<string, unknown>;
  const values: FormValues = {
    line1: String(body.line1 ?? ""),
    line2: String(body.line2 ?? ""),
    city: String(body.city ?? ""),
    state: String(body.state ?? ""),
    postalCode: String(body.postalCode ?? ""),
    country: String(body.country ?? "US"),
  };
  const checked = validateShippingAddress(values);
  if (!checked.ok) return res.status(400).type("html").send(formPage(data, values, checked.error, shop));
  await recordCustomerAddress(data.order.orderId, checked.address);
  const a = checked.address;
  res.type("html").send(
    page(
      "Address received",
      `<h1>Got it. It’s on its way soon.</h1>
       <p>Order <strong>${escapeHtml(data.order.orderNumber)}</strong> will ship to:</p>
       <div class="card"><div>${escapeHtml(a.line1)}</div>${a.line2 ? `<div>${escapeHtml(a.line2)}</div>` : ""}<div>${escapeHtml(`${a.city}, ${a.state} ${a.postalCode}`)}</div><div>${escapeHtml(a.country)}</div></div>
       <p>We’ll email you when it ships. Need to change it? Open the same link again.</p>`,
      shop,
    ),
  );
});
