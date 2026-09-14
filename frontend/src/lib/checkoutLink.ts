import { requireBackendUrl } from "../config";
import { fetchWithSession } from "./session";

/**
 * Checkout links: /shop?products=<id>:<qty>,<id>:<qty>&coupon=<CODE>
 *
 * One URL that opens the shop with the bag already filled — what goes in a
 * post, an email, or a QR code at a show. Quantity is optional, so a link to a
 * single piece is just `/shop?products=tee-black`.
 *
 * The link is only ever a request. What it names can have sold out, left the
 * drop, or never existed, so the shop asks the server to resolve it against
 * the live catalog before touching the bag, and says plainly what it could not
 * add. Parsing lives on the server so there is one definition of the format.
 */

export type CheckoutLinkStatus =
  /** For sale right now. */
  | "ok"
  /** No such product, or it has been pulled from the shop. */
  | "unknown"
  | "sold_out"
  /** In a drop that hasn't opened yet. */
  | "scheduled"
  /** Between drops, or past its window. */
  | "unavailable";

export type ResolvedLinkItem = {
  productId: string;
  title?: string;
  priceCents?: number;
  imageUrl?: string;
  sizes?: string[];
  qty: number;
  status: CheckoutLinkStatus;
};

export type ResolvedCheckoutLink = {
  ok: boolean;
  items: ResolvedLinkItem[];
  subtotalCents: number;
  coupon: string | null;
  couponNote: string;
  problems: Array<{ input: string; reason: string }>;
  maxQtyPerItem: number;
  link: string | null;
};

/** True when the URL carries a checkout link worth resolving. */
export function hasCheckoutLink(search: string): boolean {
  const params = new URLSearchParams(search);
  return Boolean(params.get("products")?.trim());
}

/** Reads the link out of a query string, untouched — the server does the parsing. */
export function readCheckoutLinkParams(search: string): { products: string; coupon: string } {
  const params = new URLSearchParams(search);
  return {
    products: params.get("products")?.trim() ?? "",
    coupon: params.get("coupon")?.trim() ?? "",
  };
}

/** Asks the server what the link actually resolves to. Reserves nothing. */
export async function resolveCheckoutLink(
  input: { products: string; coupon: string },
  signal?: AbortSignal,
): Promise<ResolvedCheckoutLink | null> {
  if (!input.products) return null;
  // Commas and colons are legal unencoded in a query string and keep the link
  // readable, so they are passed through rather than percent-encoded.
  const query = new URLSearchParams();
  query.set("products", input.products);
  if (input.coupon) query.set("coupon", input.coupon);

  try {
    const res = await fetchWithSession(`${requireBackendUrl()}/api/checkout/link?${query.toString()}`, {
      headers: { Accept: "application/json" },
      signal,
    });
    if (!res.ok) return null;
    const json = (await res.json()) as ResolvedCheckoutLink;
    return json && Array.isArray(json.items) ? json : null;
  } catch {
    return null;
  }
}

/**
 * What to tell someone whose link was only partly usable. Empty when
 * everything in it went into the bag.
 */
export function describeLeftOut(items: ResolvedLinkItem[]): string {
  const missing = items.filter((item) => item.status !== "ok");
  if (!missing.length) return "";
  const name = (item: ResolvedLinkItem) => item.title ?? item.productId;
  const soldOut = missing.filter((item) => item.status === "sold_out");
  if (soldOut.length === missing.length) {
    return soldOut.length === 1 ? `${name(soldOut[0])} is sold out` : "Some of that link is sold out";
  }
  return missing.length === 1 ? `${name(missing[0])} isn't available` : "Some of that link isn't available";
}
