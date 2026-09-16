import { Router } from "express";
import multer from "multer";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { Readable } from "stream";
import { v2 as cloudinary } from "cloudinary";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ---- inventory (you have these in src/lib/inventory.ts) ----
import {
  listCatalog,
  setCatalogOrder,
  upsertProduct,
  patchProduct,
  deleteProduct,
  getCurrentDrop,
  getAllRemaining,
  goLiveNow,
  createManualDrop,
  endCurrentDrop,
  computePredictions,
  getAutoDropConfig,
  setAutoDropConfig,
  getCurrentDropAnalytics,
  getDropHistory,
  setLiveInventory,
  getVaultAdminRows,
  setVaultHidden,
  setVaultExpiry,
  extendVault,
  addInventoryToLive,
  getVaultReadyProducts,
  getProduct,
  getVaultSaveWindowMs,
} from "../lib/inventory.js";
import { getVaultSnapshot } from "../lib/vault.js";
import { getKydContent, saveKydContent } from "../lib/siteContent.js";
import { listUsers } from "../lib/users.js";
import { requireAdminApi } from "../lib/adminAuth.js";

// --- Cloudinary setup ---
const CLOUDINARY_ENABLED = Boolean(process.env.CLOUDINARY_CLOUD_NAME);
if (CLOUDINARY_ENABLED) {
  cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
  });
}

function uploadToCloudinary(buffer: Buffer): Promise<string> {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      { folder: "nc-uploads", resource_type: "image" },
      (error, result) => {
        if (error) return reject(error);
        if (result?.secure_url) return resolve(result.secure_url);
        reject(new Error("Cloudinary upload returned no URL"));
      },
    );
    Readable.from(buffer).pipe(stream);
  });
}

// --- Local disk fallback (used when Cloudinary env vars are not set) ---
const UPLOAD_DIR = path.resolve(__dirname, "../../public/uploads");
if (!CLOUDINARY_ENABLED) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

const storage = CLOUDINARY_ENABLED
  ? multer.memoryStorage()
  : multer.diskStorage({
      destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
      filename: (_req, file, cb) => {
        const safe = file.originalname.replace(/[^a-z0-9.\-_]/gi, "_");
        cb(null, `${Date.now()}-${Math.random().toString(36).slice(2)}-${safe}`);
      },
    });
const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
});

import { getSalesCsvPath, groupSalesByOrder, listSales, summarizeSales, type OrderSummary } from "../lib/sales.js";
import {
  cartNotificationRecipient,
  mailerConfigured,
  orderNotificationRecipient,
  sendAddressRequestEmail,
  sendCartActivityEmail,
  sendPurchaseNotificationEmail,
  sendShippingUpdateEmail,
  sendVaultReleaseEmail,
  type ShippingAddress,
} from "../lib/mailer.js";
import {
  dateLabel,
  pickupAvailability,
  validateShippingAddress,
  type AddressInput,
} from "../lib/pickup.js";
import {
  getOrderFulfillment,
  issueAddressToken,
  noteAddressRequestSent,
  noteShippingUpdateSent,
  updateOrderFulfillment,
} from "../lib/orderFulfillment.js";

export const adminRouter = Router();

/** Accepts an array or a newline/comma separated string of image URLs. */
function parseImages(input: unknown): string[] {
  const raw = Array.isArray(input)
    ? input
    : typeof input === "string"
      ? input.split(/[\n,]/)
      : [];
  const out: string[] = [];
  for (const entry of raw) {
    const url = String(entry).trim();
    if (url && !out.includes(url)) out.push(url);
  }
  return out.slice(0, 8);
}

function parseTags(input: unknown): string[] {
  if (Array.isArray(input)) {
    return input
      .map((tag) => String(tag).trim())
      .filter((tag) => tag.length > 0);
  }
  if (typeof input === "string") {
    return input
      .split(",")
      .map((tag) => tag.trim())
      .filter((tag) => tag.length > 0);
  }
  return [];
}

const requireKey = requireAdminApi;

/** ========= State ========= **/
adminRouter.get("/state", requireKey, (_req, res) => {
  res.json({
    ok: true,
    drop: getCurrentDrop(),          // {id, code, startsAt, endsAt, status}
    remaining: getAllRemaining(),    // { [productId]: number }
  });
});

// KYD page content. PUT replaces whole sections; sections left out are kept.
adminRouter.get("/kyd", requireKey, (_req, res) => {
  res.json(getKydContent());
});

adminRouter.put("/kyd", requireKey, async (req, res) => {
  try {
    const saved = await saveKydContent(req.body ?? {});
    res.json({ ok: true, content: saved });
  } catch (error) {
    console.error("[admin] failed to save KYD content", error);
    res.status(500).json({ error: "Unable to save content" });
  }
});

// Every product that has been live, with how long it has left in the vault.
adminRouter.get("/vault", requireKey, (_req, res) => {
  res.json({ windowMs: getVaultSaveWindowMs(), products: getVaultAdminRows(getVaultSaveWindowMs()) });
});

// Hide/show, set an exact expiry, or nudge it by minutes.
adminRouter.patch("/vault/:id", requireKey, (req, res) => {
  const id = req.params.id;
  const body = req.body ?? {};
  let touched = false;

  if (body.hidden !== undefined) {
    if (!setVaultHidden(id, body.hidden !== false)) {
      return res.status(404).json({ error: "Not found" });
    }
    touched = true;
  }

  if (body.expiresAt !== undefined) {
    // null clears the override and falls back to the global save window.
    const value = body.expiresAt === null || body.expiresAt === "" ? null : String(body.expiresAt);
    if (!setVaultExpiry(id, value)) {
      return res.status(400).json({ error: "Invalid expiry" });
    }
    touched = true;
  }

  if (body.extendMinutes !== undefined) {
    const minutes = Number(body.extendMinutes);
    if (!Number.isFinite(minutes)) {
      return res.status(400).json({ error: "Invalid minutes" });
    }
    if (!extendVault(id, minutes, getVaultSaveWindowMs())) {
      return res.status(404).json({ error: "Not found" });
    }
    touched = true;
  }

  if (!touched) return res.status(400).json({ error: "Nothing to change" });
  const row = getVaultAdminRows(getVaultSaveWindowMs()).find((r) => r.id === id);
  res.json({ ok: true, product: row ?? null });
});

adminRouter.get("/vault-ready", requireKey, (_req, res) => {
  const windowMs = getVaultSaveWindowMs();
  const items = getVaultReadyProducts(windowMs);
  res.json({ ok: true, windowMs, items });
});

adminRouter.get("/vault-saves", requireKey, (_req, res) => {
  const snapshot = getVaultSnapshot();
  const catalogIndex = new Map(listCatalog().map((item) => [item.id, item]));
  const items = Object.entries(snapshot)
    .map(([productId, entry]) => {
      const product = catalogIndex.get(productId);
      if (!product) return null;
      return {
        productId,
        saves: entry.saves,
        threshold: entry.threshold,
        pendingRelease: entry.pendingRelease ?? null,
        activeRelease: entry.activeRelease ?? null,
        lastRelease: entry.lastRelease ?? null,
        product,
      };
    })
    .filter((item): item is NonNullable<typeof item> => item !== null)
    .sort((a, b) => b.saves - a.saves);
  res.json({ ok: true, items });
});

adminRouter.get("/saved-data", requireKey, (_req, res) => {
  const products = listCatalog();
  const remaining = getAllRemaining();
  const drop = getCurrentDrop();
  const sales = listSales(1000);
  const totals = summarizeSales(sales);
  const orders = groupSalesByOrder(sales);
  const vault = getVaultSnapshot();
  const uploads = fs
    .readdirSync(UPLOAD_DIR, { withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => {
      const fullPath = path.join(UPLOAD_DIR, entry.name);
      const stat = fs.statSync(fullPath);
      return {
        filename: entry.name,
        url: `/uploads/${entry.name}`,
        sizeBytes: stat.size,
        updatedAt: stat.mtime.toISOString(),
      };
    })
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));

  res.json({
    ok: true,
    generatedAt: new Date().toISOString(),
    storage: {
      database: process.env.DATABASE_URL ? "postgres" : "json",
      uploads: "render-disk",
    },
    customers: listUsers(),
    products,
    uploads,
    state: { drop, remaining },
    vault,
    sales: { rows: sales, totals, orders },
    drops: {
      current: getCurrentDropAnalytics(),
      history: getDropHistory(20),
    },
    predictions: computePredictions(),
    autoDrop: getAutoDropConfig(),
  });
});

/** ========= Catalog / Products ========= **/
adminRouter.get("/products", requireKey, (_req, res) => {
  res.json({ products: listCatalog() });
});

/** Arranges the shop: ids front to back, as the admin list shows them. */
adminRouter.put("/products/order", requireKey, async (req, res) => {
  try {
    const ids = Array.isArray(req.body?.ids) ? req.body.ids.filter((id: unknown): id is string => typeof id === "string") : [];
    if (!ids.length) return res.status(400).json({ error: "Send the product ids in their new order." });
    const ok = await setCatalogOrder(ids);
    if (!ok) return res.status(400).json({ error: "None of those products exist." });
    res.json({ ok: true, products: listCatalog() });
  } catch (error) {
    console.error("[admin] failed to reorder products", error);
    res.status(500).json({ error: "Unable to save the order" });
  }
});

/** The garment fields an admin can set, taken from a request body as-is (the catalog sanitizes them). */
function productDetailFields(body: Record<string, unknown>) {
  const out: Record<string, unknown> = {};
  for (const key of ["description", "printPlacement", "garment", "sizeGuide", "sizes", "imageLabels", "inventoryMode"]) {
    if (key in body) out[key] = body[key];
  }
  return out;
}

adminRouter.post("/products", requireKey, async (req, res) => {
  try {
    const { id, title, priceCents, imageUrl, images, tags } = req.body || {};
    if (!id || !title || !Number.isFinite(priceCents)) {
      return res.status(400).json({ error: "Missing fields" });
    }
    await upsertProduct({
      id,
      title,
      priceCents,
      imageUrl,
      images: parseImages(images),
      tags: parseTags(tags),
      ...productDetailFields(req.body ?? {}),
    });
    res.json({ ok: true });
  } catch (error) {
    console.error("[admin] failed to save product", error);
    res.status(500).json({ error: "Unable to save product" });
  }
});

adminRouter.patch("/products/:id", requireKey, async (req, res) => {
  try {
    const body = { ...req.body };
    if (body.tags !== undefined) {
      body.tags = parseTags(body.tags);
    }
    if (body.images !== undefined) {
      body.images = parseImages(body.images);
    }
    if (body.priceCents !== undefined) {
      const price = Math.round(Number(body.priceCents));
      if (!Number.isFinite(price) || price < 0) return res.status(400).json({ error: "Invalid price" });
      body.priceCents = price;
    }
    const ok = await patchProduct(req.params.id, body || {});
    if (!ok) return res.status(404).json({ error: "Not found" });
    res.json({ ok: true, product: getProduct(req.params.id) ?? null });
  } catch (error) {
    console.error("[admin] failed to update product", error);
    res.status(500).json({ error: "Unable to update product" });
  }
});

adminRouter.delete("/products/:id", requireKey, async (req, res) => {
  try {
    await deleteProduct(req.params.id);
    res.json({ ok: true });
  } catch (error) {
    console.error("[admin] failed to delete product", error);
    res.status(500).json({ error: "Unable to delete product" });
  }
});

/** ========= Drops ========= **/
adminRouter.post("/drop/live-now", requireKey, (req, res) => {
  const payload = req.body?.qty;
  const qty =
    typeof payload === "number" || typeof payload === "string"
      ? Number(payload)
      : payload && typeof payload === "object"
      ? payload
      : 50;
  const drop = goLiveNow(qty);
  res.json({ ok: true, drop, remaining: getAllRemaining() });
});

adminRouter.post("/drop/manual", requireKey, (req, res) => {
  const { startsAt = "now", durationMinutes = 120, initialQty = 50 } = req.body || {};
  const drop = createManualDrop({ startsAt, durationMinutes, initialQty });
  res.json({ ok: true, drop, remaining: getAllRemaining() });
});

// requireKey is your existing middleware
adminRouter.post(
  "/upload-image",
  requireKey,
  upload.single("file"),
  async (req, res) => {
    if (!req.file) return res.status(400).json({ error: "No file" });
    try {
      let url: string;
      if (CLOUDINARY_ENABLED && req.file.buffer) {
        url = await uploadToCloudinary(req.file.buffer);
      } else {
        url = `/uploads/${req.file.filename}`;
      }
      res.json({ url });
    } catch (err) {
      console.error("[upload] failed to upload image", err);
      res.status(500).json({ error: "Image upload failed" });
    }
  }
);

// Same as /upload-image but for a whole gallery in one go — front, back, detail.
// Returns urls in the order the files were given so the caller keeps its ordering.
adminRouter.post(
  "/upload-images",
  requireKey,
  upload.array("files", 8),
  async (req, res) => {
    const files = Array.isArray(req.files) ? (req.files as Express.Multer.File[]) : [];
    if (!files.length) return res.status(400).json({ error: "No files" });
    try {
      const urls = await Promise.all(
        files.map(async (file) =>
          CLOUDINARY_ENABLED && file.buffer
            ? await uploadToCloudinary(file.buffer)
            : `/uploads/${file.filename}`,
        ),
      );
      res.json({ urls });
    } catch (err) {
      console.error("[upload] failed to upload images", err);
      res.status(500).json({ error: "Image upload failed" });
    }
  },
);

adminRouter.post("/drop/end", requireKey, (_req, res) => {
  endCurrentDrop();
  res.json({ ok: true });
});

adminRouter.get("/drops", requireKey, (req, res) => {
  const limit = Number.isFinite(Number(req.query.limit))
    ? Math.max(1, Math.min(50, Number(req.query.limit)))
    : 10;
  const current = getCurrentDropAnalytics();
  const history = getDropHistory(limit);
  res.json({ current, history });
});

adminRouter.patch("/drops/current/inventory", requireKey, (req, res) => {
  const productId = typeof req.body?.productId === "string" ? req.body.productId : "";
  const qtyRaw = req.body?.remaining ?? req.body?.qty ?? req.body?.quantity;
  const remainingQty = Number.isFinite(Number(qtyRaw)) ? Math.floor(Number(qtyRaw)) : NaN;
  if (!productId) {
    return res.status(400).json({ error: "Missing productId" });
  }
  if (!Number.isFinite(remainingQty)) {
    return res.status(400).json({ error: "Invalid remaining quantity" });
  }
  const updated = setLiveInventory(productId, remainingQty);
  if (!updated) {
    return res.status(409).json({ error: "No live drop" });
  }
  res.json({ ok: true, product: updated, current: getCurrentDropAnalytics() });
});

adminRouter.post("/drops/current/add", requireKey, (req, res) => {
  const additions = req.body?.additions ?? req.body?.items ?? req.body?.qty ?? {};
  if (!additions || typeof additions !== "object" || Array.isArray(additions)) {
    return res.status(400).json({ error: "Invalid additions payload" });
  }
  const map: Record<string, number> = {};
  for (const [productId, value] of Object.entries(additions)) {
    if (typeof productId !== "string" || !productId.trim()) continue;
    const qty = Number(value);
    if (!Number.isFinite(qty) || qty <= 0) continue;
    map[productId.trim()] = Math.floor(qty);
  }
  if (!Object.keys(map).length) {
    return res.status(400).json({ error: "No quantities provided" });
  }
  const result = addInventoryToLive(map);
  if (!result) {
    return res.status(409).json({ error: "No live drop" });
  }
  res.json({ ok: true, applied: result.applied, current: result.analytics });
});

/** ========= Sales (for Trends & Sales table) ========= **/
adminRouter.get("/sales", requireKey, (req, res) => {
  const limit = Number.isFinite(Number(req.query.limit))
    ? Math.max(1, Math.min(1000, Number(req.query.limit)))
    : 200;
  const sales = listSales(limit);
  const totals = summarizeSales(sales);
  const orders = groupSalesByOrder(sales);
  res.json({ sales, totals, orders });
});

adminRouter.get("/sales/export.csv", requireKey, (_req, res) => {
  const csvPath = getSalesCsvPath();
  const filename = `orders-export-${new Date().toISOString().slice(0, 10)}.csv`;
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  res.sendFile(csvPath);
});

/** ========= Show pickup ========= **/
// Every show's pickup verdict, for the pills on Live dates in the KYD tab.
adminRouter.get("/pickup", requireKey, (_req, res) => {
  res.json({ ok: true, shows: pickupAvailability(new Date()).checks });
});

/** ========= Orders by fulfillment ========= **/
type Queue = "all" | "pickup" | "ship";

function parseQueue(value: unknown): Queue {
  return value === "pickup" || value === "ship" ? value : "all";
}

type AdminOrder = OrderSummary & { status: ReturnType<typeof getOrderFulfillment> };

/** A missed pickup that got an address ships too, so it shows in the shipping queue. */
function orderShipsAnything(order: AdminOrder) {
  return order.items.some((line) => line.fulfillment.method === "ship") || Boolean(order.status.missedPickupAddress);
}

function orderInQueue(order: AdminOrder, queue: Queue, showId: string) {
  if (queue === "all") return true;
  if (queue === "ship") return orderShipsAnything(order);
  return order.items.some((line) => line.fulfillment.method === "pickup" && (!showId || line.fulfillment.show?.id === showId));
}

/** Free-text search: name, email, the short order number, the full id. */
function orderMatches(order: AdminOrder, q: string) {
  if (!q) return true;
  const needle = q.trim().toLowerCase();
  if (!needle) return true;
  const hay = [order.customerName, order.customerEmail, order.orderNumber, order.orderId, ...order.items.map((l) => l.productTitle ?? "")]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  return hay.includes(needle) || hay.replace(/-/g, "").includes(needle.replace(/-/g, ""));
}

function ordersForQueue(queue: Queue, showId: string, lineLimit: number, q = "") {
  return groupSalesByOrder(listSales(lineLimit))
    .map((order): AdminOrder => ({ ...order, status: getOrderFulfillment(order.orderId) }))
    .filter((order) => orderInQueue(order, queue, showId) && orderMatches(order, q));
}

adminRouter.get("/orders", requireKey, (req, res) => {
  const queue = parseQueue(req.query.fulfillment);
  const showId = typeof req.query.showId === "string" ? req.query.showId : "";
  const q = typeof req.query.q === "string" ? req.query.q : "";
  const all = groupSalesByOrder(listSales(1000)).map((order): AdminOrder => ({ ...order, status: getOrderFulfillment(order.orderId) }));
  const orders = ordersForQueue(queue, showId, 1000, q);

  // The shows that pickup orders were placed for, for the admin's filter.
  const pickupShows = new Map<string, { id: string; name: string; date: string; location: string }>();
  for (const order of all) {
    for (const line of order.items) {
      const show = line.fulfillment.method === "pickup" ? line.fulfillment.show : undefined;
      if (show && !pickupShows.has(show.id)) pickupShows.set(show.id, { id: show.id, name: show.name, date: show.date, location: show.location });
    }
  }

  res.json({
    ok: true,
    queue,
    showId,
    q,
    orders,
    counts: {
      all: all.length,
      pickup: all.filter((o) => o.fulfillment.methods.includes("pickup")).length,
      ship: all.filter(orderShipsAnything).length,
    },
    pickupShows: [...pickupShows.values()].sort((a, b) => a.date.localeCompare(b.date)),
    totals: summarizeSales(listSales(1000)),
    mailer: { configured: mailerConfigured() },
  });
});

/** The pickup list for one show, trimmed for a phone at the merch table. */
adminRouter.get("/checkin", requireKey, (req, res) => {
  const showId = typeof req.query.showId === "string" ? req.query.showId : "";
  const q = typeof req.query.q === "string" ? req.query.q : "";
  const orders = ordersForQueue("pickup", showId, 5000, q)
    .map((order) => ({
      orderId: order.orderId,
      orderNumber: order.orderNumber,
      customerName: order.customerName ?? "",
      customerEmail: order.customerEmail ?? "",
      ts: order.ts,
      pickupStatus: order.status.pickupStatus,
      pickedUpAt: order.status.pickedUpAt ?? null,
      show: order.fulfillment.pickupShow ?? null,
      bonus: order.items.find((l) => l.fulfillment.bonus)?.fulfillment.bonus ?? "",
      items: order.items
        .filter((l) => l.fulfillment.method === "pickup" && (!showId || l.fulfillment.show?.id === showId))
        .map((l) => ({ title: l.productTitle ?? l.productId, size: l.size ?? "", qty: l.qty })),
      otherItemsShip: order.items.some((l) => l.fulfillment.method === "ship"),
    }))
    .sort((a, b) => a.customerName.localeCompare(b.customerName, "en", { sensitivity: "base" }));
  const shows = new Map<string, { id: string; name: string; date: string }>();
  for (const order of ordersForQueue("pickup", "", 5000)) {
    const show = order.fulfillment.pickupShow;
    if (show && !shows.has(show.id)) shows.set(show.id, { id: show.id, name: show.name, date: show.date });
  }
  res.json({
    ok: true,
    orders,
    shows: [...shows.values()].sort((a, b) => a.date.localeCompare(b.date)),
    counts: {
      total: orders.length,
      pickedUp: orders.filter((o) => o.pickupStatus === "picked_up").length,
      missed: orders.filter((o) => o.pickupStatus === "missed").length,
    },
  });
});

function findAdminOrder(orderId: string): AdminOrder | undefined {
  const order = groupSalesByOrder(listSales(5000)).find((o) => o.orderId === orderId);
  return order ? { ...order, status: getOrderFulfillment(order.orderId) } : undefined;
}

// Pickup progress, shipping progress, tracking and a staff-entered address for a
// missed pickup. Only touches the status record; what the customer bought and
// chose stays exactly as it was paid.
adminRouter.patch("/orders/:orderId/fulfillment", requireKey, async (req, res) => {
  const orderId = req.params.orderId;
  const order = findAdminOrder(orderId);
  if (!order) return res.status(404).json({ error: "Order not found" });
  const body = (req.body ?? {}) as Record<string, unknown>;
  try {
    if (body.missedPickupAddress && typeof body.missedPickupAddress === "object") {
      // Same rules as checkout for show merch shipping, so it can actually be shipped.
      const checked = validateShippingAddress(body.missedPickupAddress as AddressInput);
      if (!checked.ok) return res.status(400).json({ error: checked.error });
      body.missedPickupAddress = checked.address;
    }
    const result = await updateOrderFulfillment(orderId, body);
    if ("error" in result) return res.status(400).json({ error: result.error });
    res.json({ ok: true, status: result });
  } catch (error) {
    console.error("[admin] failed to update order fulfillment", error);
    res.status(500).json({ error: "Unable to update order" });
  }
});

function receiptItems(order: OrderSummary, assetBase: string) {
  return order.items.map((line) => ({
    productId: line.productId,
    title: line.productTitle ?? line.productId,
    qty: line.qty,
    priceCents: line.priceCents,
    lineTotalCents: line.lineTotalCents,
    size: line.size,
    detail: line.productDetail,
    method: line.fulfillment.method,
    imageUrl: absoluteImage(getProduct(line.productId)?.imageUrl, assetBase),
  }));
}

function absoluteImage(url: string | undefined, base: string) {
  if (!url) return undefined;
  if (/^https?:\/\//i.test(url)) return url;
  return base ? `${base.replace(/\/+$/, "")}${url.startsWith("/") ? url : `/${url}`}` : undefined;
}

/**
 * "Your order has shipped": a deliberate send from the admin. Marks the order
 * shipped, records the send, and refuses a repeat unless asked twice.
 */
adminRouter.post("/orders/:orderId/shipping-update", requireKey, async (req, res) => {
  const order = findAdminOrder(req.params.orderId);
  if (!order) return res.status(404).json({ error: "Order not found" });
  if (!order.customerEmail) return res.status(400).json({ error: "This order has no customer email." });
  if (!mailerConfigured()) return res.status(409).json({ error: "No email transport is configured (RESEND_API_KEY or SMTP_HOST), so nothing can be sent." });
  const address = order.status.missedPickupAddress ?? order.shippingAddress;
  if (!orderShipsAnything(order)) return res.status(409).json({ error: "Nothing in this order ships." });
  if (order.status.shippingUpdateSentAt && req.body?.force !== true) {
    return res.status(409).json({
      error: `A shipping update was already sent ${new Date(order.status.shippingUpdateSentAt).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" })}. Send it again on purpose by confirming.`,
      code: "ALREADY_SENT",
      sentAt: order.status.shippingUpdateSentAt,
      count: order.status.shippingUpdateCount ?? 1,
    });
  }
  const carrier = typeof req.body?.carrier === "string" ? req.body.carrier : order.status.carrier;
  const trackingNumber = typeof req.body?.trackingNumber === "string" ? req.body.trackingNumber : order.status.trackingNumber;
  const shipLines = order.items.filter((l) => l.fulfillment.method === "ship" || order.status.missedPickupAddress);
  try {
    await updateOrderFulfillment(order.orderId, { carrier: carrier ?? "", trackingNumber: trackingNumber ?? "" });
    const sent = await sendShippingUpdateEmail({
      orderId: order.orderId,
      orderNumber: order.orderNumber,
      customerName: order.customerName,
      customerEmail: order.customerEmail,
      items: receiptItems({ ...order, items: shipLines }, process.env.FRONTEND_ORIGIN ?? process.env.BACKEND_ORIGIN ?? ""),
      shippingAddress: address as ShippingAddress | undefined,
      carrier: carrier || undefined,
      trackingNumber: trackingNumber || undefined,
    });
    if (!sent) return res.status(502).json({ error: "The email could not be sent. Check the mail transport and try again." });
    const status = await noteShippingUpdateSent(order.orderId);
    res.json({ ok: true, status });
  } catch (error) {
    console.error("[admin] shipping update failed", error);
    res.status(500).json({ error: "Unable to send the shipping update" });
  }
});

/**
 * Missed pickup: a secure link for the customer to give an address. The link
 * is returned to copy into any message, and emailed when mail is configured.
 * Nothing is charged: standard shipping was already in the price.
 */
adminRouter.post("/orders/:orderId/address-request", requireKey, async (req, res) => {
  const order = findAdminOrder(req.params.orderId);
  if (!order) return res.status(404).json({ error: "Order not found" });
  const pickupLine = order.items.find((l) => l.fulfillment.method === "pickup");
  if (!pickupLine) return res.status(409).json({ error: "This order has nothing to pick up." });
  try {
    if (order.status.pickupStatus !== "missed") await updateOrderFulfillment(order.orderId, { pickupStatus: "missed" });
    const status = await issueAddressToken(order.orderId);
    const base = (process.env.FRONTEND_ORIGIN || process.env.BACKEND_ORIGIN || `${req.protocol}://${req.get("host") ?? ""}`).replace(/\/+$/, "");
    const link = `${base}/orders/address/${status.addressToken}`;
    let emailed = false;
    if (req.body?.send !== false && order.customerEmail && mailerConfigured()) {
      emailed = await sendAddressRequestEmail({
        orderId: order.orderId,
        orderNumber: order.orderNumber,
        customerName: order.customerName,
        customerEmail: order.customerEmail,
        items: receiptItems({ ...order, items: order.items.filter((l) => l.fulfillment.method === "pickup") }, base),
        show: pickupLine.fulfillment.show ? { name: pickupLine.fulfillment.show.name, dateLabel: dateLabel(pickupLine.fulfillment.show.date) } : undefined,
        link,
        missedPickupPolicy: pickupLine.fulfillment.missedPickupPolicy,
      });
      if (emailed) await noteAddressRequestSent(order.orderId);
    }
    res.json({ ok: true, link, emailed, status: getOrderFulfillment(order.orderId) });
  } catch (error) {
    console.error("[admin] address request failed", error);
    res.status(500).json({ error: "Unable to create the address request" });
  }
});

function csvCell(value: unknown) {
  const text = String(value ?? "");
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function csvRows(header: string[], rows: unknown[][]) {
  return [header, ...rows].map((row) => row.map(csvCell).join(",")).join("\n");
}

const PICKUP_STATUS_LABEL: Record<string, string> = { awaiting: "Awaiting pickup", picked_up: "Picked up", missed: "Missed" };
const SHIPPING_STATUS_LABEL: Record<string, string> = { awaiting: "Awaiting shipment", shipped: "Shipped" };

// One row per item and size, so the list works at the merch table or the packing bench.
adminRouter.get("/orders/export.csv", requireKey, (req, res) => {
  const queue = parseQueue(req.query.fulfillment);
  const showId = typeof req.query.showId === "string" ? req.query.showId : "";
  const orders = ordersForQueue(queue === "all" ? "pickup" : queue, showId, 5000);
  const stamp = new Date().toISOString().slice(0, 10);
  let csv: string;
  let name: string;

  if (queue === "ship") {
    name = `shipping-queue-${stamp}.csv`;
    const rows = orders
      .sort((a, b) => a.ts.localeCompare(b.ts))
      .flatMap((order) => {
        const address = order.status.missedPickupAddress ?? order.shippingAddress;
        return order.items
          .filter((line) => line.fulfillment.method === "ship" || (line.fulfillment.method === "pickup" && order.status.missedPickupAddress))
          .map((line) => [
            order.orderId,
            order.orderNumber,
            order.ts,
            order.customerName ?? "",
            order.customerEmail ?? "",
            address?.line1 ?? "",
            address?.line2 ?? "",
            address?.city ?? "",
            address?.state ?? "",
            address?.postalCode ?? "",
            address?.country ?? "",
            line.productTitle ?? line.productId,
            line.size ?? "",
            line.qty,
            line.fulfillment.method === "pickup" ? "yes" : "",
            SHIPPING_STATUS_LABEL[order.status.shippingStatus] ?? order.status.shippingStatus,
            order.status.carrier ?? "",
            order.status.trackingNumber ?? "",
            order.status.shippingUpdateSentAt ?? "",
          ]);
      });
    csv = csvRows(
      [
        "order_id", "order_number", "ordered_at", "customer_name", "customer_email",
        "ship_line_1", "ship_line_2", "ship_city", "ship_state", "ship_postal_code", "ship_country",
        "item", "size", "quantity", "missed_pickup", "shipping_status", "carrier", "tracking_number", "shipping_update_sent_at",
      ],
      rows,
    );
  } else {
    name = `pickup-list-${showId || "all-shows"}-${stamp}.csv`;
    const rows = orders
      .sort((a, b) => (a.customerName ?? "").localeCompare(b.customerName ?? "", "en", { sensitivity: "base" }))
      .flatMap((order) =>
        order.items
          .filter((line) => line.fulfillment.method === "pickup" && (!showId || line.fulfillment.show?.id === showId))
          .map((line) => [
            order.orderId,
            order.orderNumber,
            order.customerName ?? "",
            order.customerEmail ?? "",
            line.fulfillment.show?.name ?? "",
            line.fulfillment.show?.date ?? "",
            line.fulfillment.show?.location ?? "",
            line.productTitle ?? line.productId,
            line.size ?? "",
            line.qty,
            line.fulfillment.bonus ?? "",
            PICKUP_STATUS_LABEL[order.status.pickupStatus] ?? order.status.pickupStatus,
            order.ts,
          ]),
      );
    csv = csvRows(
      [
        "order_id", "order_number", "customer_name", "customer_email", "show", "show_date", "show_location",
        "item", "size", "quantity", "pickup_bonus", "pickup_status", "ordered_at",
      ],
      rows,
    );
  }

  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="${name.replace(/[^\w.-]/g, "-")}"`);
  res.send(csv);
});

/** ========= Predictions (same JSON shape as /api/predict) ========= **/
adminRouter.get("/predict", (_req, res) => {
  // Not secret; returns safe, stable JSON for UIs
  const j = computePredictions();
  res.json({
    generated_at: j.generated_at,
    next_drop_projection: j.next_drop_projection ?? null,
    products: j.products ?? [],
  });
});

/** ========= Auto-Drop config ========= **/
adminRouter.get("/autodrop", requireKey, (_req, res) => {
  res.json(getAutoDropConfig());
});

adminRouter.post("/autodrop", requireKey, (req, res) => {
  setAutoDropConfig(req.body || {});
  res.json({ ok: true, config: getAutoDropConfig() });
});

/** ========= Notifications ========= **/
adminRouter.get("/notifications", requireKey, (_req, res) => {
  const from =
    process.env.EMAIL_FROM || process.env.SMTP_FROM || "NC Studio <onboarding@resend.dev>";
  const windowRaw = Number.parseFloat(process.env.CART_NOTIFY_WINDOW_MINUTES ?? "");
  res.json({
    orderTo: orderNotificationRecipient(),
    cartTo: cartNotificationRecipient(),
    cartWindowMinutes:
      Number.isFinite(windowRaw) && windowRaw > 0 ? Math.min(120, Math.max(1, windowRaw)) : 10,
    transport: process.env.RESEND_API_KEY ? "resend" : process.env.SMTP_HOST ? "smtp" : "none",
    from,
    // The sandbox sender only delivers to the Resend account owner, which is
    // the usual reason a correctly configured address still hears nothing.
    sandboxSender: from.includes("resend.dev"),
  });
});

/** ========= Test email ========= **/
adminRouter.post("/test-email", requireKey, async (req, res) => {
  const to = typeof req.body?.to === "string" && req.body.to.trim()
    ? req.body.to.trim()
    : orderNotificationRecipient();

  const requested = req.body?.type;
  const type: "vault" | "cart" | "purchase" =
    requested === "vault" ? "vault" : requested === "cart" ? "cart" : "purchase";

  if (!to) {
    return res.status(400).json({ error: "No recipient — set ORDER_NOTIFY_EMAIL or pass { to } in the request body" });
  }

  try {
    let ok = false;
    if (type === "cart") {
      const product = listCatalog()[0];
      ok = await sendCartActivityEmail({
        lines: [
          {
            title: product?.title ?? "Test Product",
            qty: 2,
            priceCents: product?.priceCents ?? 4000,
          },
        ],
        carts: 1,
        windowMinutes: 10,
        shoppers: ["customer@example.com"],
        notifyTo: to,
      });
    } else if (type === "vault") {
      const products = listCatalog();
      const product = products[0];
      ok = await sendVaultReleaseEmail({
        email: to,
        productId: product?.id ?? "test-product",
        productTitle: product?.title ?? "Test Product",
        productImageUrl: product?.imageUrl,
        priceCents: product?.priceCents,
        windowMinutes: 120,
        releaseStartsAt: new Date().toISOString(),
        releaseEndsAt: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(),
      });
    } else {
      ok = await sendPurchaseNotificationEmail({
        orderId: "test-order-001",
        totalCents: 4000,
        customerName: "Test Customer",
        customerEmail: "customer@example.com",
        items: [{ productId: "test", title: "Test Product", qty: 1, priceCents: 4000, lineTotalCents: 4000 }],
        orderedAt: new Date().toISOString(),
        notifyTo: to,
      });
    }
    if (ok) {
      res.json({ ok: true, message: `${type} test email sent to ${to}` });
    } else {
      res.status(500).json({ ok: false, error: "Mailer returned false — check server logs for SMTP errors (SMTP_HOST, SMTP_USER, SMTP_PASS may be missing or wrong)" });
    }
  } catch (err: any) {
    console.error("[admin] test-email error", err);
    res.status(500).json({ ok: false, error: err?.message ?? String(err) });
  }
});

