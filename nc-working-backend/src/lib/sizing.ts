import type { CatalogItem } from "./types.js";

/**
 * Which products need a size, and what sizes they offer.
 *
 * Sizing is driven by tags rather than a per-product field, so tagging a
 * product "T-Shirt" is all it takes — the same tag the shop already shows.
 * Both lists are overridable by env so a new garment type doesn't need a
 * deploy: SIZED_TAGS="t-shirt,hoodie,cap", SIZE_OPTIONS="S,M,L,XL,XXL".
 */

const DEFAULT_SIZED_TAGS = [
  "shirt",
  "t-shirt",
  "tshirt",
  "tee",
  "hoodie",
  "crewneck",
  "sweatshirt",
  "sweater",
  "longsleeve",
  "long sleeve",
  "jacket",
  "shorts",
  "pants",
  "apparel",
];

const DEFAULT_SIZE_OPTIONS = ["S", "M", "L", "XL"];

function fromEnv(name: string, fallback: string[]): string[] {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = raw
    .split(",")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
  return parsed.length ? parsed : fallback;
}

/** Compared case-insensitively, so "T-Shirt" and "t-shirt" both match. */
export function sizedTags(): string[] {
  return fromEnv("SIZED_TAGS", DEFAULT_SIZED_TAGS).map((tag) => tag.toLowerCase());
}

export function sizeOptions(): string[] {
  return fromEnv("SIZE_OPTIONS", DEFAULT_SIZE_OPTIONS);
}

/**
 * The sizes a product offers. Empty means it needs no size at all — a poster
 * or a record behaves exactly as it did before sizing existed.
 */
export function sizesForProduct(product: Pick<CatalogItem, "tags">): string[] {
  const tags = (product.tags ?? []).map((tag) => String(tag).trim().toLowerCase());
  if (!tags.length) return [];
  const sized = new Set(sizedTags());
  return tags.some((tag) => sized.has(tag)) ? sizeOptions() : [];
}

export function productNeedsSize(product: Pick<CatalogItem, "tags">): boolean {
  return sizesForProduct(product).length > 0;
}

/** Normalises a submitted size to one the product actually offers, else null. */
export function normalizeSize(
  product: Pick<CatalogItem, "tags">,
  submitted: unknown,
): string | null {
  const options = sizesForProduct(product);
  if (!options.length) return null;
  const wanted = String(submitted ?? "").trim().toLowerCase();
  if (!wanted) return null;
  return options.find((option) => option.toLowerCase() === wanted) ?? null;
}
