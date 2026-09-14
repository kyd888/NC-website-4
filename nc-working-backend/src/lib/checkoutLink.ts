/**
 * Checkout links: /shop?products=<id>:<qty>,<id>:<qty>&coupon=<CODE>
 *
 * One URL that opens the shop with a bag already filled — what a post, an
 * email or a QR code at a show points at. The reference implementation this
 * was adapted from splits on "," then ":" and calls parseInt on whatever comes
 * back, which throws on every link a real visitor can produce: a trailing
 * comma, an id with no quantity, "two" instead of 2. A link that arrives
 * malformed is the normal case here, not the exception — it was typed by hand,
 * truncated by a messaging app, or edited by someone guessing at the format —
 * so nothing in this file throws. Anything unreadable is dropped and named in
 * `problems`, and whatever else was in the link still opens a bag.
 *
 * Quantity is optional: "?products=tee-black" means one.
 *
 * Parsing is deliberately separate from resolving. Nothing here looks at the
 * catalog, reserves a unit, or decides what a coupon is worth: it turns text
 * into intent. The endpoint in routes/catalog.ts checks that intent against
 * what is actually for sale.
 */

/** Matches the shop's own per-item cap, so a link can't ask for more than the bag allows. */
export const MAX_QTY_PER_ITEM = 3;

/** A link is a bag, not a wholesale order. Anything longer is a mistake or a probe. */
export const MAX_LINK_ITEMS = 20;

/** Product ids are slugs from the catalog; the bound stops a megabyte of junk in a query string. */
const PRODUCT_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;

/** Coupon codes are printed on flyers and read aloud, so: letters, digits, dash. */
const COUPON_PATTERN = /^[A-Za-z0-9-]{3,32}$/;

export type CheckoutLinkItem = { productId: string; qty: number };

export type CheckoutLinkProblem = {
  /** The offending fragment, as it appeared in the URL. */
  input: string;
  reason: string;
};

export type ParsedCheckoutLink = {
  items: CheckoutLinkItem[];
  /** Upper-cased when valid; null when absent or unusable. */
  coupon: string | null;
  problems: CheckoutLinkProblem[];
};

/** One `products` entry: "tee-black:2", or "tee-black" for a single unit. */
function parseEntry(entry: string): CheckoutLinkItem | CheckoutLinkProblem {
  const trimmed = entry.trim();
  if (!trimmed) return { input: entry, reason: "Empty item" };

  // Split on the LAST colon: ids never contain one today, but if that ever
  // changes the quantity is still the part after the final separator.
  const split = trimmed.lastIndexOf(":");
  const productId = (split === -1 ? trimmed : trimmed.slice(0, split)).trim();
  const qtyText = split === -1 ? "" : trimmed.slice(split + 1).trim();

  if (!PRODUCT_ID_PATTERN.test(productId)) {
    return { input: trimmed, reason: "Not a product id" };
  }

  // No quantity means one — the common case for a link to a single piece.
  if (!qtyText) return { productId, qty: 1 };

  // Number() over parseInt: parseInt("2kg") is 2, which silently buys
  // something nobody asked for. Reject the whole quantity instead.
  const qty = Number(qtyText);
  if (!Number.isInteger(qty) || qty < 1) {
    return { input: trimmed, reason: "Quantity must be a whole number, 1 or more" };
  }

  return { productId, qty: Math.min(qty, MAX_QTY_PER_ITEM) };
}

function isProblem(value: CheckoutLinkItem | CheckoutLinkProblem): value is CheckoutLinkProblem {
  return "reason" in value;
}

/**
 * Reads the `products` and `coupon` query values. Never throws: a link that is
 * partly readable yields the part that is readable.
 *
 * Repeats of the same id are added together, then capped — "tee:2,tee:2"
 * asks for four and gets the bag limit, rather than the second entry quietly
 * replacing the first.
 */
export function parseCheckoutLink(input: {
  products?: string | null;
  coupon?: string | null;
}): ParsedCheckoutLink {
  const problems: CheckoutLinkProblem[] = [];
  const byId = new Map<string, number>();

  const productsText = typeof input.products === "string" ? input.products : "";
  const entries = productsText.split(",").filter((entry) => entry.trim().length > 0);

  for (const entry of entries) {
    const parsed = parseEntry(entry);
    if (isProblem(parsed)) {
      problems.push(parsed);
      continue;
    }
    // The cap counts distinct products, so a repeat of one already in the bag
    // is never the entry that gets turned away.
    if (!byId.has(parsed.productId) && byId.size >= MAX_LINK_ITEMS) {
      problems.push({ input: entry.trim(), reason: `A link carries at most ${MAX_LINK_ITEMS} products` });
      continue;
    }
    const running = (byId.get(parsed.productId) ?? 0) + parsed.qty;
    byId.set(parsed.productId, Math.min(running, MAX_QTY_PER_ITEM));
  }

  const couponText = typeof input.coupon === "string" ? input.coupon.trim() : "";
  let coupon: string | null = null;
  if (couponText) {
    if (COUPON_PATTERN.test(couponText)) {
      coupon = couponText.toUpperCase();
    } else {
      problems.push({ input: couponText, reason: "Not a usable coupon code" });
    }
  }

  return {
    items: [...byId.entries()].map(([productId, qty]) => ({ productId, qty })),
    coupon,
    problems,
  };
}

/** True when the string is a coupon code we would accept from a link. */
export function isCouponCode(value: unknown): value is string {
  return typeof value === "string" && COUPON_PATTERN.test(value.trim());
}

/** A coupon as it should be stored and compared: upper-cased, or null. */
export function normalizeCoupon(value: unknown): string | null {
  return isCouponCode(value) ? value.trim().toUpperCase() : null;
}

/**
 * The inverse: turns a bag back into a link to share. Quantities of one are
 * left off, so the common link stays short enough to read out loud.
 *
 * `base` is the shop URL ("https://no-connection.com/shop"); the query is
 * appended to whatever it already carries.
 */
export function buildCheckoutLink(
  base: string,
  input: { items: CheckoutLinkItem[]; coupon?: string | null },
): string {
  const products = input.items
    .filter((item) => PRODUCT_ID_PATTERN.test(item.productId) && Number.isInteger(item.qty) && item.qty >= 1)
    .slice(0, MAX_LINK_ITEMS)
    .map((item) => {
      const qty = Math.min(item.qty, MAX_QTY_PER_ITEM);
      return qty > 1 ? `${item.productId}:${qty}` : item.productId;
    })
    .join(",");

  // Built by hand rather than with URLSearchParams: that would percent-encode
  // the commas and colons that make the link readable, and both are legal
  // unencoded in a query string.
  const parts: string[] = [];
  if (products) parts.push(`products=${products}`);
  const coupon = normalizeCoupon(input.coupon);
  if (coupon) parts.push(`coupon=${coupon}`);
  if (!parts.length) return base;

  const separator = base.includes("?") ? "&" : "?";
  return `${base}${separator}${parts.join("&")}`;
}
