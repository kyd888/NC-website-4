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
  addInventoryToLive,
  getVaultReadyProducts,
  getVaultSaveWindowMs,
} from "../lib/inventory.js";
import { getVaultSnapshot } from "../lib/vault.js";
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

import { getSalesCsvPath, groupSalesByOrder, listSales, summarizeSales } from "../lib/sales.js";
import { sendPurchaseNotificationEmail, sendVaultReleaseEmail } from "../lib/mailer.js";

export const adminRouter = Router();

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

adminRouter.post("/products", requireKey, async (req, res) => {
  try {
    const { id, title, priceCents, imageUrl, tags } = req.body || {};
    if (!id || !title || !Number.isFinite(priceCents)) {
      return res.status(400).json({ error: "Missing fields" });
    }
    await upsertProduct({ id, title, priceCents, imageUrl, tags: parseTags(tags) });
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
    const ok = await patchProduct(req.params.id, body || {});
    if (!ok) return res.status(404).json({ error: "Not found" });
    res.json({ ok: true });
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

/** ========= Test email ========= **/
adminRouter.post("/test-email", requireKey, async (req, res) => {
  const to = typeof req.body?.to === "string" && req.body.to.trim()
    ? req.body.to.trim()
    : process.env.ORDER_NOTIFY_EMAIL;

  const type = req.body?.type === "vault" ? "vault" : "purchase";

  if (!to) {
    return res.status(400).json({ error: "No recipient — set ORDER_NOTIFY_EMAIL or pass { to } in the request body" });
  }

  try {
    let ok = false;
    if (type === "vault") {
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

