/**
 * Show pickup at checkout: instead of shipping, a customer can collect the
 * whole order at a KYD show. The server decides what's offered
 * (GET /api/pickup) and checks again right before payment, so nothing here
 * is authoritative; it only renders the option and holds the customer's choice.
 */

export type PickupShow = {
  id: string;
  name: string;
  date: string;
  dateLabel: string;
  location: string;
  /** When pickup orders close, in the show's own time. */
  cutoffLabel: string;
  /** The essentials: "Merch table, 6–10 pm". */
  hours: string;
  /** How to collect, in full. */
  instructions: string;
  /** "Sticker pack", or empty. */
  bonus: string;
  missedPolicy: string;
};

export type PickupOffer = {
  labels: { pickup: string; ship: string };
  state: "available" | "closed" | "unavailable";
  shows: PickupShow[];
  closedShow: PickupShow | null;
  /** Why pickup isn't offered; empty while it is. */
  message: string;
  checkedAt: string;
};

/** Shipping unless the customer chooses pickup. Never changed on their behalf. */
export type DeliveryChoice = {
  method: "ship" | "pickup";
  showId: string | null;
};

export const SHIP_BY_DEFAULT: DeliveryChoice = { method: "ship", showId: null };

/** Pickup details for a paid order, as the server recorded them. method is null when it ships. */
export type ConfirmedFulfillment = {
  method: "pickup" | null;
  show?: { name: string; dateLabel: string; location: string };
  pickupHours?: string;
  pickupInstructions?: string;
  missedPickupPolicy?: string;
  bonus?: string;
};

export async function fetchPickup(backendUrl: string): Promise<PickupOffer | null> {
  try {
    const res = await fetch(`${backendUrl}/api/pickup`, { cache: "no-store" });
    if (!res.ok) return null;
    const json = (await res.json()) as PickupOffer;
    return Array.isArray(json?.shows) ? json : null;
  } catch {
    return null;
  }
}

/** The show a pickup choice refers to: the one picked, or the only open one. */
export function chosenShow(offer: PickupOffer | null, choice: DeliveryChoice): PickupShow | null {
  if (!offer || choice.method !== "pickup") return null;
  if (choice.showId) return offer.shows.find((show) => show.id === choice.showId) ?? null;
  return offer.shows.length === 1 ? offer.shows[0] : null;
}

/** Why the order can't be paid with this choice, or null when it can. */
export function pickupProblem(offer: PickupOffer | null, choice: DeliveryChoice): string | null {
  if (choice.method !== "pickup") return null;
  if (!offer || offer.state !== "available") return `${offer?.message || "Pickup isn't available."} Choose “Ship to me” to continue.`;
  if (!chosenShow(offer, choice)) return choice.showId ? "Pickup orders for that show have closed. Choose another show, or ship it." : "Choose which show you’ll pick up at.";
  return null;
}
