import { Router } from "express";
import { listCatalog } from "../lib/inventory.js";
import { absoluteUrl, availabilityOf, frontendOrigin, trimSlash } from "../lib/storefront.js";

/**
 * Product feeds that other platforms pull on a schedule.
 *
 * GET /feeds/meta-catalog.xml — the catalog for Meta Commerce Manager
 * (Facebook/Instagram shops, product tags, catalog ads). Commerce Manager
 * re-fetches it on the schedule set there, so product changes made in the
 * admin reach Meta without anyone uploading anything.
 *
 * - Lists every product set to Show in the admin. Hide one and Meta removes it
 *   from the catalog on its next fetch.
 * - g:id is the product id, exactly. It's what the Meta Pixel sends as
 *   content_ids (frontend/src/lib/metaPixel.ts), and the two matching is how
 *   Meta ties site visits and purchases to catalog items.
 * - Availability is the share page's, and g:link points at that page:
 *   "in stock" only while a drop is live with stock left.
 *
 * Format: RSS 2.0 with Google's g: namespace, which Meta reads natively.
 */
export const feedsRouter = Router();

const BRAND = "NO CONNECTION";
const CURRENCY = "USD";
/** Meta rejects an item whose title runs past this. */
const MAX_TITLE = 200;

function escapeXml(value: string): string {
  return (
    value
      // XML 1.0 forbids control characters other than tab and newlines; one
      // pasted into a title would otherwise make Meta reject the entire file.
      .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, "")
      .replace(/[&<>"']/g, (ch) =>
        ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" })[ch] ?? ch,
      )
  );
}

/**
 * How catalog photos are delivered: flattened onto white, padded to a square.
 * Product shots are transparent PNG cutouts, which Meta can render on black (a
 * black tee on black), and it crops tall shots to fill square placements.
 * Commas are percent-encoded because Meta may split image links on commas;
 * Cloudinary serves the encoded form byte-for-byte the same.
 */
const META_IMAGE_TRANSFORM = "b_white%2Cc_pad%2Car_1:1";

/**
 * Cloudinary renders the transform from the URL alone, and the .jpg extension
 * makes any upload (PNG, HEIC, WebP) arrive as a JPEG, which Meta always takes.
 */
function metaImageUrl(url: string): string {
  const match = /^(https:\/\/res\.cloudinary\.com\/[^/]+\/image\/upload\/)([^?#]+)\.[a-z0-9]+$/i.exec(url);
  return match ? `${match[1]}${META_IMAGE_TRANSFORM}/${match[2]}.jpg` : url;
}

feedsRouter.get("/meta-catalog.xml", (req, res) => {
  const site =
    frontendOrigin() ||
    trimSlash(process.env.BACKEND_ORIGIN) ||
    `${req.protocol}://${req.get("host") ?? ""}`;

  const items = listCatalog()
    .filter((product) => product.enabled !== false)
    .flatMap((product) => {
      const images = (product.images?.length ? product.images : product.imageUrl ? [product.imageUrl] : [])
        .map((url) => metaImageUrl(absoluteUrl(req, url)))
        .filter(Boolean);
      // Meta won't take an item without a photo; it joins the feed once it has one.
      if (!images.length) return [];

      const { state } = availabilityOf(product.id);
      const fields: Array<[tag: string, value: string]> = [
        ["g:id", product.id],
        ["g:title", product.title.slice(0, MAX_TITLE)],
        ["g:description", `${product.title} from ${BRAND}. Limited drops, no restocks.`],
        ["g:link", `${site}/p/${encodeURIComponent(product.id)}`],
        ["g:image_link", images[0]],
        ...images.slice(1).map((url): [string, string] => ["g:additional_image_link", url]),
        ["g:brand", BRAND],
        ["g:condition", "new"],
        ["g:availability", state === "available" || state === "low" ? "in stock" : "out of stock"],
        ["g:price", `${(product.priceCents / 100).toFixed(2)} ${CURRENCY}`],
      ];
      return [
        [
          "    <item>",
          ...fields.map(([tag, value]) => `      <${tag}>${escapeXml(value)}</${tag}>`),
          "    </item>",
        ].join("\n"),
      ];
    });

  res
    .type("application/xml")
    // Meta fetches on its own schedule; a cached copy would hand it stale stock.
    .set("Cache-Control", "no-store")
    .send(
      [
        `<?xml version="1.0" encoding="UTF-8"?>`,
        `<rss version="2.0" xmlns:g="http://base.google.com/ns/1.0">`,
        `  <channel>`,
        `    <title>${BRAND}</title>`,
        `    <link>${escapeXml(site)}</link>`,
        `    <description>Limited drops. No restocks.</description>`,
        ...items,
        `  </channel>`,
        `</rss>`,
        "",
      ].join("\n"),
    );
});
