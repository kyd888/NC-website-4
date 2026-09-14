/**
 * Show merch in the shop: products picked up at a KYD show (with a bonus
 * thrown in) or shipped after the show, at the same price either way.
 *
 * The server decides what's available (GET /api/show-merch) and checks again
 * right before payment, so nothing here is authoritative — it only renders
 * the offer and holds the customer's choice.
 */

export type FulfillmentMethod = "pickup" | "ship";

export type ShowMerchShow = {
  id: string;
  name: string;
  date: string;
  dateLabel: string;
  location: string;
  timezone: string;
  /** When pickup orders close, in the show's own time. */
  cutoffLabel: string;
  /** The essentials: "Merch table, 6–10 pm". */
  hours: string;
  /** How to collect, in full. */
  instructions: string;
  setupId: string;
  bonus: string;
  /** Products offered for pickup at this show. */
  productIds: string[];
  /** A product's own cutoff, when it differs from the show's. */
  productCutoffs: Record<string, { cutoffLabel: string; closed: boolean; override: boolean }>;
  closedProductIds: string[];
};

export type ShowMerchOffer = {
  productIds: string[];
  products: Record<string, { setupIds: string[] }>;
  labels: { pickup: string; ship: string };
  bonus: string;
  /** "Sticker pack included" — empty when the offer has no bonus. */
  bonusBadge: string;
  /** Delivery adds nothing, so both options come to the same total. */
  samePrice: boolean;
  pickup: {
    state: "available" | "closed" | "unavailable";
    shows: ShowMerchShow[];
    closedShow: ShowMerchShow | null;
    /** Why pickup is greyed out; empty while it's open. */
    message: string;
    missedPickupPolicy: string;
    windowMonths: number;
  };
  shipping: {
    available: boolean;
    shipsAfter: string;
    shipsAfterLabel: string;
    dispatchEstimate: string;
    regionLabel: string;
    countries: string[];
    excludedRegions: string[];
    /** Standard shipping is in the product price. */
    included: boolean;
    /** Charged per order for delivery when it isn't. */
    feeCents: number;
  };
  checkedAt: string;
};

/** What the customer picked. Never filled in or changed on their behalf. */
export type FulfillmentChoice = {
  method: FulfillmentMethod | null;
  showId: string | null;
};

/** Pickup or shipping details for a paid order, as the server recorded them. */
export type ConfirmedFulfillment = {
  method: FulfillmentMethod | null;
  show?: { name: string; dateLabel: string; location: string };
  pickupHours?: string;
  pickupInstructions?: string;
  missedPickupPolicy?: string;
  bonus?: string;
  shipsAfterLabel?: string;
  dispatchEstimate?: string;
  shippingFeeCents?: number;
  otherItemsShip: boolean;
};

export async function fetchShowMerch(backendUrl: string): Promise<ShowMerchOffer | null> {
  try {
    const res = await fetch(`${backendUrl}/api/show-merch`, { cache: "no-store" });
    if (!res.ok) return null;
    const json = (await res.json()) as ShowMerchOffer;
    return Array.isArray(json?.productIds) && json.pickup && json.shipping ? json : null;
  } catch {
    return null;
  }
}

/** The show a pickup choice refers to: the one picked, or the only open one. */
export function chosenShow(offer: ShowMerchOffer | null, choice: FulfillmentChoice): ShowMerchShow | null {
  if (!offer || choice.method !== "pickup") return null;
  const shows = offer.pickup.shows;
  if (choice.showId) return shows.find((show) => show.id === choice.showId) ?? null;
  return shows.length === 1 ? shows[0] : null;
}

function joinNames(names: string[]): string {
  if (names.length <= 1) return names[0] ?? "";
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

/** Which show merch items in the bag can't be picked up at this show, and why. */
export function showProblemFor(
  show: ShowMerchShow,
  cartShowMerchIds: string[],
  titleOf: (id: string) => string,
): string | null {
  const notOffered = cartShowMerchIds.filter((id) => !show.productIds.includes(id));
  if (notOffered.length) return `${joinNames(notOffered.map(titleOf))} can’t be picked up at ${show.name}.`;
  const closed = cartShowMerchIds.filter((id) => show.productCutoffs[id]?.closed);
  if (closed.length) return `Pickup orders for ${joinNames(closed.map(titleOf))} have closed for this show.`;
  return null;
}

/**
 * Why checkout can't start with this choice, or null when it can. A choice
 * that stopped being available is reported, not replaced.
 */
export function choiceProblem(
  offer: ShowMerchOffer | null,
  choice: FulfillmentChoice,
  cartShowMerchIds: string[] = [],
  titleOf: (id: string) => string = (id) => id,
): string | null {
  if (!offer) return "Loading pickup and shipping options…";
  if (!choice.method) return "Choose pickup or shipping to check out.";
  if (choice.method === "pickup") {
    const switchPrompt = offer.shipping.available ? ` Choose “${offer.labels.ship}” and enter your address to continue.` : "";
    if (offer.pickup.state !== "available") return `${offer.pickup.message}${switchPrompt}`;
    const show = chosenShow(offer, choice);
    if (!show) {
      return choice.showId
        ? `Pickup orders for that show have closed. Choose another show, or “${offer.labels.ship}”.`
        : "Choose which show you’ll pick up at.";
    }
    const problem = showProblemFor(show, cartShowMerchIds, titleOf);
    return problem ? `${problem}${switchPrompt}` : null;
  }
  return offer.shipping.available ? null : "Shipping isn’t available for this item yet.";
}

/** Mirrors the server's check so the wallet sheet can reject an address early. It re-checks anyway. */
export function addressInShippingRegion(offer: ShowMerchOffer, country: string, region: string): boolean {
  const c = (country || "").trim().toUpperCase();
  const r = (region || "").trim().toUpperCase();
  return offer.shipping.countries.includes(c) && !offer.shipping.excludedRegions.includes(r);
}
