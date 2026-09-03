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
