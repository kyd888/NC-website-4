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
  /**
   * Where this product sits in the shop, lowest first. Set with the Up and
   * Down buttons in Admin → Catalog, which number every product at once.
   *
   * It has to be stored rather than inferred from the order of the catalog
   * array: with a database the rows come back ordered by updated_at, so the
   * array order doesn't survive a restart. Products that have never been
   * arranged have none and sit after the ones that have.
   */
  sortIndex?: number;
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
 * their pickup is copied here, so editing the show afterwards never rewrites
 * what a paid order promised.
 */
export type SaleFulfillment = {
  method: FulfillmentMethod;
  /** Pickup only: where the customer collects it. */
  show?: ShowSnapshot;
  /** Pickup only: the bonus, the essentials and the policy, as shown at checkout. */
  bonus?: string;
  pickupHours?: string;
  pickupInstructions?: string;
  missedPickupPolicy?: string;
  /** Orders from the first show merch release may carry these; nothing writes them now. */
  showMerch?: boolean;
  shipsAfter?: string;
  dispatchEstimate?: string;
};
