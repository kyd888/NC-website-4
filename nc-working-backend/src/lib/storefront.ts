import type { Request } from "express";
import {
  getCurrentDrop,
  getAllRemaining,
  getDisplayedRemaining,
  getRecentlyLiveProductIds,
  getVaultSaveWindowMs,
} from "./inventory.js";

/**
 * What the public storefront says about a product outside the shop itself:
 * whether it can be bought right now, and absolute URLs that point at it.
 * Shared by the share page (/p/:id) and the Meta catalog feed, so a product
 * never reads as in stock in one place and sold out in the other.
 */

/** Below this, the page names the number instead of just saying "in stock". */
export const LOW_STOCK_AT = 5;

export type Availability =
  | { state: "available"; qty: number }
  | { state: "low"; qty: number }
  | { state: "soldout" }
  /** In a drop that hasn't opened yet — the link works, the buying doesn't. */
  | { state: "scheduled"; startsAt: string }
  | { state: "upcoming"; startsAt: string | null };

export function trimSlash(value: string | undefined | null): string {
  return (value ?? "").trim().replace(/\/+$/, "");
}

/** Where the shop lives, so "Shop this" leaves the API host. */
export function frontendOrigin(): string {
  return trimSlash(process.env.FRONTEND_ORIGIN) || trimSlash(process.env.FRONTEND_ORIGIN_2) || "";
}

/** Crawlers need an absolute og:image; uploads are stored as site-relative paths. */
export function absoluteUrl(req: Request, url: string | undefined): string {
  if (!url) return "";
  if (/^https?:\/\//i.test(url)) return url;
  const base =
    trimSlash(process.env.BACKEND_ORIGIN) ||
    `${req.protocol}://${req.get("host") ?? ""}`;
  return `${base}${url.startsWith("/") ? "" : "/"}${url}`;
}

export function availabilityOf(productId: string): Availability {
  const drop = getCurrentDrop();
  // Same source the shop reads, so the two never contradict each other.
  const qty = getDisplayedRemaining()[productId] ?? 0;

  if (drop?.status === "live") {
    if (qty <= 0) return { state: "soldout" };
    return qty <= LOW_STOCK_AT ? { state: "low", qty } : { state: "available", qty };
  }

  // Scheduled drop this product is part of: say when, so the link is worth
  // sharing before the drop opens.
  if (drop?.status === "scheduled" && drop.startsAt && productId in getAllRemaining()) {
    return { state: "scheduled", startsAt: drop.startsAt };
  }

  // Between drops: an item that was just live is sold out rather than unreleased.
  const recent = new Set(getRecentlyLiveProductIds(getVaultSaveWindowMs()));
  if (recent.has(productId)) return { state: "soldout" };
  return { state: "upcoming", startsAt: drop?.startsAt ?? null };
}
