export type CatalogItem = {
  id: string;
  title: string;
  priceCents: number;
  imageUrl?: string;
  enabled?: boolean;
  tags?: string[];
};
export type DropStatus = "scheduled" | "live" | "ended";
export type DropCode = "MANUAL" | "VAULT";
export type Drop = { id: string; code: DropCode; startsAt: string; endsAt: string; status: DropStatus };
export type RemainingMap = Record<string, number>;
export type Sale = { id: string; ts: string; productId: string; qty: number; priceCents: number; ref?: string; ua?: string };
