export type CatalogItem = {
  id: string;
  title: string;
  priceCents: number;
  /** Primary shot. Kept as its own field so existing products keep working. */
  imageUrl?: string;
  /** Every shot, primary first — front, back, detail. imageUrl mirrors images[0]. */
  images?: string[];
  enabled?: boolean;
  tags?: string[];
};
export type DropStatus = "scheduled" | "live" | "ended";
export type DropCode = "MANUAL" | "VAULT";
export type Drop = { id: string; code: DropCode; startsAt: string; endsAt: string; status: DropStatus };
export type RemainingMap = Record<string, number>;
export type Sale = { id: string; ts: string; productId: string; qty: number; priceCents: number; ref?: string; ua?: string };

/** How an order line reaches the customer. */
export type FulfillmentMethod = "pickup" | "ship";

/** A show as it stood when an order was paid. Later edits to the show don't change it. */
export type ShowSnapshot = {
  id: string;
  name: string;
  /** YYYY-MM-DD, in the show's own timezone. */
  date: string;
  /** Venue and city, as displayed. */
  location: string;
  timezone?: string;
};

/** Saved on each order line at purchase. */
export type SaleFulfillment = {
  method: FulfillmentMethod;
  /** Bought under the show merch offer (pickup at a show, or ship after it). */
  showMerch?: boolean;
  /** Pickup only: where the customer collects it. */
  show?: ShowSnapshot;
  /** Pickup only: the bonus that goes with it. */
  bonus?: string;
  /** Show merch shipping only: what the customer was told at purchase. */
  shipsAfter?: string;
  dispatchEstimate?: string;
};
