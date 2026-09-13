/** Stocked items reserve real units in a drop; made-to-order items don't run out. */
export type InventoryMode = "stocked" | "made_to_order";

/** Where the artwork is printed. Shown to customers, so a blank back is never a surprise. */
export type PrintPlacement = "front" | "front_back";

export type SizeGuideRow = { size: string; chest: string; length: string };

/** Measurements of the actual blank, as printed on its spec sheet. */
export type SizeGuide = {
  /** e.g. "Measured flat, in inches." */
  note?: string;
  rows: SizeGuideRow[];
};

/**
 * Everything the shop says about a garment beyond its name and price. All
 * optional: products that predate these fields keep working unchanged.
 */
export type ProductDetails = {
  /** Short customer-facing description. */
  description?: string;
  printPlacement?: PrintPlacement;
  /** The blank it's printed on, as verified with the printer: "Standard black tee". */
  garment?: string;
  sizeGuide?: SizeGuide;
  /** Sizes offered, overriding the tag-based default (S/M/L/XL). */
  sizes?: string[];
  /** Label per image URL — "Front", "Back (blank)", "Artwork close-up". */
  imageLabels?: Record<string, string>;
  inventoryMode?: InventoryMode;
};

export type CatalogItem = ProductDetails & {
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

/**
 * Saved on each order line at purchase. Everything a customer was told about
 * pickup or shipping is copied here, so editing a show, a policy or a product
 * afterwards never rewrites what a paid order promised.
 */
export type SaleFulfillment = {
  method: FulfillmentMethod;
  /** Bought under a show merch setup (pickup at a show, or ship after it). */
  showMerch?: boolean;
  /** The setup it was sold under, for reports. */
  setupId?: string;
  /** Pickup only: where the customer collects it. */
  show?: ShowSnapshot;
  /** Pickup only: the bonus that goes with it. */
  bonus?: string;
  /** Pickup only: the essentials and the policy, as shown at checkout. */
  pickupHours?: string;
  pickupInstructions?: string;
  missedPickupPolicy?: string;
  /** Show merch shipping only: what the customer was told at purchase. */
  shipsAfter?: string;
  dispatchEstimate?: string;
  /** Show merch shipping only: whether standard shipping was in the price, or what was charged. */
  shippingIncluded?: boolean;
  shippingFeeCents?: number;
};
