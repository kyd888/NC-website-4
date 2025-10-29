import { Router } from "express";
import multer from "multer";
import fs from "fs";
import path from "path";

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

// ensure directory exists at startup
const UPLOAD_DIR = path.resolve("public/uploads");
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

// name files: <timestamp>-<random>-<original>
const storage = multer.diskStorage({
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

import { groupSalesByOrder, listSales, summarizeSales } from "../lib/sales.js";

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

// Simple header key auth
function requireKey(req: any, res: any, next: any) {
  const need = process.env.ADMIN_KEY || "super-secret-key";
  if ((req.headers["x-admin-key"] || "") !== need) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  next();
}

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

/** ========= Catalog / Products ========= **/
adminRouter.get("/products", requireKey, (_req, res) => {
  res.json({ products: listCatalog() });
});

adminRouter.post("/products", requireKey, (req, res) => {
  const { id, title, priceCents, imageUrl, tags } = req.body || {};
  if (!id || !title || !Number.isFinite(priceCents)) {
    return res.status(400).json({ error: "Missing fields" });
  }
  upsertProduct({ id, title, priceCents, imageUrl, tags: parseTags(tags) });
  res.json({ ok: true });
});

adminRouter.patch("/products/:id", requireKey, (req, res) => {
  const body = { ...req.body };
  if (body.tags !== undefined) {
    body.tags = parseTags(body.tags);
  }
  const ok = patchProduct(req.params.id, body || {});
  if (!ok) return res.status(404).json({ error: "Not found" });
  res.json({ ok: true });
});

adminRouter.delete("/products/:id", requireKey, (req, res) => {
  deleteProduct(req.params.id);
  res.json({ ok: true });
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
  (req, res) => {
    if (!req.file) return res.status(400).json({ error: "No file" });
    // return a URL the frontend can use directly
    const url = `/uploads/${req.file.filename}`;
    res.json({ url });
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

