/**
 * Meta Pixel — the website "dataset" in Meta Events Manager — wired for Meta
 * Commerce.
 *
 * Sends the standard shopping events Commerce Manager matches against a
 * product catalog: ViewContent, AddToCart, InitiateCheckout and Purchase.
 * `content_ids` are this shop's product ids (e.g. "Tee-miss-her-black"), the
 * same ids the catalog feed publishes as g:id
 * (nc-working-backend/src/routes/feeds.ts), which is how events match items.
 *
 * Loading and page views: Meta's base code sits in index.html's <head> (init
 * with the dataset ID, then PageView). The pixel script follows client-side
 * route changes itself, so routing code does not track page views.
 *
 * Safety: tracking must never break browsing or checkout. Every call is
 * wrapped, and where the pixel isn't loaded (admin pages, blockers) every call
 * is a no-op.
 */

const CURRENCY = "USD";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Fbq = ((...args: any[]) => void) & Record<string, any>;

declare global {
  interface Window {
    fbq?: Fbq;
  }
}

export type PixelProduct = { id: string; title?: string; priceCents: number };
export type PixelLine = { id: string; quantity: number; priceCents: number };

const dollars = (cents: number) => Math.round(Number(cents) || 0) / 100;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function send(...args: any[]) {
  try {
    if (typeof window !== "undefined" && typeof window.fbq === "function") window.fbq(...args);
  } catch {
    // Tracking is best-effort; never let it surface to the shopper.
  }
}

// ViewContent fires as shoppers scroll between products; count each product
// once per page load so scrolling back and forth doesn't inflate views.
const viewed = new Set<string>();

export function trackViewContent(product: PixelProduct) {
  try {
    if (!product?.id || viewed.has(product.id)) return;
    viewed.add(product.id);
    send("track", "ViewContent", {
      content_ids: [product.id],
      content_type: "product",
      content_name: product.title,
      value: dollars(product.priceCents),
      currency: CURRENCY,
    });
  } catch {
    /* best-effort */
  }
}

export function trackAddToCart(product: PixelProduct, quantity = 1) {
  try {
    if (!product?.id) return;
    send("track", "AddToCart", {
      content_ids: [product.id],
      content_type: "product",
      content_name: product.title,
      contents: [{ id: product.id, quantity, item_price: dollars(product.priceCents) }],
      value: dollars(product.priceCents * quantity),
      currency: CURRENCY,
    });
  } catch {
    /* best-effort */
  }
}

function checkoutData(lines: PixelLine[], totalCents: number) {
  const items = (lines ?? []).filter((l) => l && l.id && l.quantity > 0);
  const summed = items.reduce((acc, l) => acc + l.priceCents * l.quantity, 0);
  return {
    content_ids: items.map((l) => l.id),
    content_type: "product",
    contents: items.map((l) => ({ id: l.id, quantity: l.quantity, item_price: dollars(l.priceCents) })),
    num_items: items.reduce((acc, l) => acc + l.quantity, 0),
    value: dollars(totalCents > 0 ? totalCents : summed),
    currency: CURRENCY,
  };
}

export function trackInitiateCheckout(lines: PixelLine[], totalCents: number) {
  try {
    send("track", "InitiateCheckout", checkoutData(lines, totalCents));
  } catch {
    /* best-effort */
  }
}

// One Purchase per order, even if a confirmation re-renders.
const purchased = new Set<string>();

export function trackPurchase(orderId: string, lines: PixelLine[], totalCents: number) {
  try {
    const id = String(orderId || "");
    if (id && purchased.has(id)) return;
    if (id) purchased.add(id);
    // eventID lets Meta de-duplicate against a server-side (Conversions API)
    // Purchase for the same order if one is added later.
    const data = checkoutData(lines, totalCents);
    if (id) send("track", "Purchase", data, { eventID: `order-${id}` });
    else send("track", "Purchase", data);
  } catch {
    /* best-effort */
  }
}
