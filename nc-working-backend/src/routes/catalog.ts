import { randomUUID } from "crypto";
import type { Request, Response } from "express";
import { Router } from "express";
import Stripe from "stripe";
import { z } from "zod";
import {
  listCatalog,
  getCurrentDrop,
  getAllRemaining,
  computePredictions,
  onInventoryUpdate,
  reserve,
  release,
  getProduct,
  seedInventory,
  recordProductViews,
  getRecentlyLiveProductIds,
  getVaultSaveWindowMs,
  getCurrentDropProductIds,
} from "../lib/inventory.js";
import { recordSale } from "../lib/sales.js";
import { sendReceiptEmail } from "../lib/mailer.js";
import type { CatalogItem } from "../lib/types.js";
import { getAuthContext } from "../lib/auth.js";
import { updateUser } from "../lib/users.js";
import { addSaveToVault, getVaultSnapshot } from "../lib/vault.js";

type DropState = "idle" | "scheduled" | "live";
type SessionCartLine = { qty: number; reservedAt: number };
type SessionCart = Record<string, SessionCartLine>;
type SessionData = { cart: SessionCart; updatedAt: number };

const optionalString = z
  .string()
  .optional()
  .transform((value) => {
    if (typeof value !== "string") return undefined;
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : undefined;
  });

const checkoutCustomerSchema = z
  .object({
    name: optionalString,
    email: z.string().trim().min(1).email(),
    address: z.object({
      line1: z.string().trim().min(1),
      line2: optionalString,
      city: z.string().trim().min(1),
      state: z.string().trim().min(1),
      postalCode: z.string().trim().min(1),
      country: z.string().trim().min(2).max(2).optional(),
    }),
  })
  .transform((value) => ({
    name: value.name,
    email: value.email.trim(),
    address: {
      line1: value.address.line1.trim(),
      line2: value.address.line2,
      city: value.address.city.trim(),
      state: value.address.state.trim(),
      postalCode: value.address.postalCode.trim(),
      country: ((value.address.country ?? "US") || "US").trim().toUpperCase(),
    },
  }));

type CheckoutCustomer = z.infer<typeof checkoutCustomerSchema>;

const SESSION_COOKIE = "nc_session";
const SESSION_TTL_MS = 30 * 60 * 1000;
const CART_HOLD_TTL_MS = 5 * 60 * 1000;

const sessions = new Map<string, SessionData>();

const SAVE_WINDOW_MS = getVaultSaveWindowMs();

const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
const stripe =
  typeof stripeSecretKey === "string" && stripeSecretKey.length > 0
    ? new Stripe(stripeSecretKey, { apiVersion: "2023-10-16" })
    : null;
if (!stripe) {
  console.warn("[stripe] STRIPE_SECRET_KEY is missing; payment endpoints disabled.");
} else {
  console.log("[stripe] Stripe client configured");
}

seedInventory();

export const catalogRouter = Router();

type CartLine = { product: CatalogItem; qty: number };

function normalizeCartLine(entry: SessionCartLine | number | undefined): SessionCartLine | null {
  if (entry == null) return null;
  if (typeof entry === "number") {
    const qty = Math.max(0, Math.floor(entry));
    if (qty <= 0) return null;
    return { qty, reservedAt: Date.now() };
  }
  const qty = Math.max(0, Math.floor(entry.qty ?? 0));
  if (qty <= 0) return null;
  const reservedAt =
    typeof entry.reservedAt === "number" && Number.isFinite(entry.reservedAt)
      ? entry.reservedAt
      : Date.now();
  return { qty, reservedAt };
}

function purgeExpiredCart(session: SessionData) {
  const now = Date.now();
  for (const [productId, raw] of Object.entries(session.cart)) {
    const line = normalizeCartLine(raw);
    if (!line) {
      delete session.cart[productId];
      continue;
    }
    if (line.reservedAt + CART_HOLD_TTL_MS <= now) {
      if (line.qty > 0) {
        release(productId, line.qty);
      }
      delete session.cart[productId];
      continue;
    }
    session.cart[productId] = line;
  }
}

function getActiveCartEntries(session: SessionData) {
  purgeExpiredCart(session);
  const entries: [string, number][] = [];
  for (const [productId, line] of Object.entries(session.cart)) {
    const qty = Math.max(0, Math.floor(line.qty));
    if (qty > 0) entries.push([productId, qty]);
  }
  return entries;
}

function serializeCart(session: SessionData) {
  purgeExpiredCart(session);
  const now = Date.now();
  const out: Record<string, { qty: number; holdMsRemaining: number }> = {};
  for (const [productId, line] of Object.entries(session.cart)) {
    const qty = Math.max(0, Math.floor(line.qty));
    if (!qty) continue;
    const holdMsRemaining = Math.max(0, line.reservedAt + CART_HOLD_TTL_MS - now);
    out[productId] = { qty, holdMsRemaining };
  }
  return out;
}

function summarizeCart(entries: [string, number][]) {
  const lines: CartLine[] = [];
  let grossCents = 0;
  let totalItems = 0;

  for (const [productId, qtyRaw] of entries) {
    const qty = Math.max(0, Math.floor(qtyRaw));
    if (qty <= 0) continue;
    const product = getProduct(productId);
    if (!product) {
      return { error: "Item removed", productId } as const;
    }
    lines.push({ product, qty });
    grossCents += product.priceCents * qty;
    totalItems += qty;
  }

  return { lines, grossCents, totalItems } as const;
}

catalogRouter.get("/products", (_req, res) => {
  const drop = getCurrentDrop();
  const items = listCatalog();
  const remaining = getAllRemaining();
  const active = items.filter((p) => p.enabled !== false);
  const recentIds = new Set(getRecentlyLiveProductIds(SAVE_WINDOW_MS));

  const payload = active.map((p) => ({
    id: p.id,
    title: p.title,
    priceCents: p.priceCents,
    imageUrl: p.imageUrl,
    tags: p.tags ?? [],
    remaining: remaining[p.id] ?? 0,
  }));

  let filtered: typeof payload;
  if (drop?.status === "live") {
    filtered = payload;
    const liveViewIds = filtered.filter((p) => (remaining[p.id] ?? 0) > 0).map((p) => p.id);
    if (liveViewIds.length) recordProductViews(liveViewIds);
  } else if (!drop || drop.status === "ended") {
    filtered = payload.filter((p) => recentIds.has(p.id));
  } else {
    filtered = [];
  }

  return res.json({ products: filtered });
});

catalogRouter.get("/drop/state", (_req, res) => {
  const drop = getCurrentDrop();
  const remaining = getAllRemaining();
  const items = listCatalog();
  const active = items.filter((p) => p.enabled !== false);
  const recentIds = new Set(getRecentlyLiveProductIds(SAVE_WINDOW_MS));

  let state: DropState = "idle";
  if (drop?.status === "scheduled") state = "scheduled";
  if (drop?.status === "live") state = "live";

  const baseProducts = active.map((p) => ({
    id: p.id,
    title: p.title,
    priceCents: p.priceCents,
    imageUrl: p.imageUrl,
    remaining: remaining[p.id] ?? 0,
    enabled: p.enabled !== false,
    tags: p.tags ?? [],
  }));

  let filteredProducts: typeof baseProducts;
  if (drop?.status === "live") {
    filteredProducts = baseProducts;
  } else if (!drop || drop.status === "ended") {
    filteredProducts = baseProducts.filter((p) => recentIds.has(p.id));
  } else {
    filteredProducts = [];
  }

  res.json({
    state,
    drop,
    remaining,
    products: filteredProducts,
    vault: getVaultSnapshot(),
  });
});

catalogRouter.get("/drop", (_req, res) => {
  const drop = getCurrentDrop();
  const remaining = getAllRemaining();
  const items = listCatalog();
  const active = items.filter((p) => p.enabled !== false);
  const recentIds = new Set(getRecentlyLiveProductIds(SAVE_WINDOW_MS));

  let state: DropState = "idle";
  if (drop?.status === "scheduled") state = "scheduled";
  if (drop?.status === "live") state = "live";

  const baseProducts = active.map((p) => ({
    id: p.id,
    title: p.title,
    priceCents: p.priceCents,
    imageUrl: p.imageUrl,
    remaining: remaining[p.id] ?? 0,
    enabled: p.enabled !== false,
    tags: p.tags ?? [],
  }));

  let filteredProducts: typeof baseProducts;
  if (drop?.status === "live") {
    filteredProducts = baseProducts;
  } else if (!drop || drop.status === "ended") {
    filteredProducts = baseProducts.filter((p) => recentIds.has(p.id));
  } else {
    filteredProducts = [];
  }

  res.json({
    state,
    drop,
    products: filteredProducts,
    vault: getVaultSnapshot(),
  });
});

const saveWatchSchema = z.object({
  productId: z.string().trim().min(1),
  email: z.string().trim().email().optional(),
  name: optionalString,
});

catalogRouter.post("/save", async (req, res) => {
  const parsed = saveWatchSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid input" });
  }
  try {
    const auth = getAuthContext(req);
    const productId = parsed.data.productId;
    const product = getProduct(productId);
    if (!product || product.enabled === false) {
      return res.status(404).json({ error: "Product not found" });
    }
    const email = auth?.user?.email ?? parsed.data.email;
    const name = auth?.user?.name ?? parsed.data.name;
    if (!email) {
      return res.status(400).json({ error: "Email required to save this item" });
    }

    const drop = getCurrentDrop();
    const remaining = getAllRemaining();
    const qty = remaining[productId] ?? 0;
    const recentIds = new Set(getRecentlyLiveProductIds(SAVE_WINDOW_MS));

    if (drop?.status === "live") {
      if (qty > 0) {
        return res.status(409).json({ error: "Drop is live" });
      }
      if (!(productId in remaining)) {
        return res.status(404).json({ error: "Unknown drop item" });
      }
    } else {
      if (!recentIds.has(productId)) {
        return res.status(404).json({ error: "This item is no longer available to save" });
      }
    }

    const result = await addSaveToVault({
      productId,
      email,
      userId: auth?.user?.id,
      name,
    });

    const snapshot = getVaultSnapshot();
    res.json({
      ok: true,
      saved: result.added,
      alreadySaved: result.alreadySaved,
      releaseTriggered: result.releaseTriggered,
      pendingRelease: result.pendingRelease,
      vault: snapshot[productId] ?? null,
    });
  } catch (error) {
    console.error("[vault] failed to record save", error);
    res.status(500).json({ error: "Unable to save this item right now" });
  }
});

catalogRouter.get("/inventory/stream", (req, res) => {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");

  res.write("retry: 5000\n\n");

  const send = (payload: { productId: string; remaining: number }) => {
    res.write(`event: inv\n`);
    res.write(`data: ${JSON.stringify(payload)}\n\n`);
  };

  const snapshot = getAllRemaining();
  for (const [id, qty] of Object.entries(snapshot)) {
    send({ productId: id, remaining: qty });
  }

  const unsubscribe = onInventoryUpdate(send);

  req.on("close", () => {
    unsubscribe();
    res.end();
  });
});

catalogRouter.get("/predict", (_req, res) => {
  const data = computePredictions();
  res.json({
    generated_at: data.generated_at,
    next_drop_projection: data.next_drop_projection ?? null,
    products: data.products ?? [],
  });
});

catalogRouter.post("/cart/add", (req, res) => {
  const { session, id } = ensureSession(req, res);
  const productId = typeof req.body?.productId === "string" ? req.body.productId : "";
  const qtyRaw = Number(req.body?.qty ?? 1);
  const qty = Number.isFinite(qtyRaw) && qtyRaw > 0 ? Math.floor(qtyRaw) : 1;

  if (!productId) {
    return res.status(400).json({ error: "Missing productId" });
  }

  const product = getProduct(productId);
  if (!product) {
    return res.status(404).json({ error: "Product not found" });
  }

  const drop = getCurrentDrop();
  if (!drop || drop.status !== "live") {
    return res.status(409).json({ error: "Drop is not live" });
  }

  session.updatedAt = Date.now();
  purgeExpiredCart(session);

  const existing = session.cart[productId];
  const currentQty = existing ? Math.max(0, Math.floor(existing.qty)) : 0;

  const success = reserve(productId, qty);
  if (!success) {
    return res.status(409).json({ error: "Sold out" });
  }

  session.cart[productId] = {
    qty: currentQty + qty,
    reservedAt: Date.now(),
  };

  res.json({
    ok: true,
    cart: serializeCart(session),
    session: id,
    remaining: getAllRemaining(),
  });
});

catalogRouter.post("/cart/remove", (req, res) => {
  const { session } = ensureSession(req, res);
  const productId = typeof req.body?.productId === "string" ? req.body.productId : "";
  const qtyRaw = Number(req.body?.qty ?? 1);
  const qty = Number.isFinite(qtyRaw) && qtyRaw > 0 ? Math.floor(qtyRaw) : 1;

  if (!productId) {
    return res.status(400).json({ error: "Missing productId" });
  }

  purgeExpiredCart(session);

  const current = session.cart[productId]?.qty ?? 0;
  if (current <= 0) {
    return res.status(404).json({ error: "Item not in cart" });
  }

  const removeQty = Math.min(current, qty);
  const remainingQty = current - removeQty;
  if (remainingQty > 0) {
    session.cart[productId] = {
      qty: remainingQty,
      reservedAt: session.cart[productId]?.reservedAt ?? Date.now(),
    };
  } else {
    delete session.cart[productId];
  }
  release(productId, removeQty);

  res.json({
    ok: true,
    cart: serializeCart(session),
    remaining: getAllRemaining(),
  });
});

catalogRouter.get("/cart/state", (req, res) => {
  const { session } = ensureSession(req, res);
  res.json({
    ok: true,
    cart: serializeCart(session),
    remaining: getAllRemaining(),
  });
});

catalogRouter.post("/checkout/create-intent", async (req, res) => {
  if (!stripe) {
    return res.status(500).json({ error: "Stripe is not configured" });
  }

  const { session } = ensureSession(req, res);
  const entries = getActiveCartEntries(session);
  if (!entries.length) {
    return res.status(400).json({ error: "Cart is empty" });
  }

  const drop = getCurrentDrop();
  if (!drop || drop.status !== "live") {
    releaseCart(session.cart);
    session.cart = {};
    return res.status(409).json({ error: "Drop closed" });
  }

  const summary = summarizeCart(entries);
  if ("error" in summary) {
    releaseCart(session.cart);
    session.cart = {};
    return res.status(400).json({ error: summary.error });
  }

  if (!summary.lines.length) {
    return res.status(400).json({ error: "Cart is empty" });
  }

  try {
    const intent = await stripe.paymentIntents.create({
      amount: summary.grossCents,
      currency: "usd",
      automatic_payment_methods: { enabled: true },
      metadata: {
        dropId: drop.id,
        items: summary.lines.map((line) => `${line.product.id}:${line.qty}`).join(","),
      },
    });

    res.json({
      ok: true,
      clientSecret: intent.client_secret,
      paymentIntentId: intent.id,
      amount: summary.grossCents,
    });
  } catch (error) {
    console.error("[stripe] createIntent error", error);
    res.status(500).json({ error: "Unable to initiate payment" });
  }
});

catalogRouter.post("/checkout/confirm", async (req, res) => {
  const { session } = ensureSession(req, res);
  const entries = getActiveCartEntries(session);

  if (!entries.length) {
    return res.status(400).json({ error: "Cart is empty" });
  }

  const drop = getCurrentDrop();
  if (!drop || drop.status !== "live") {
    releaseCart(session.cart);
    session.cart = {};
    return res.status(409).json({ error: "Drop closed" });
  }

  const summary = summarizeCart(entries);
  if ("error" in summary) {
    releaseCart(session.cart);
    session.cart = {};
    return res.status(400).json({ error: summary.error });
  }

  if (!summary.lines.length) {
    return res.status(400).json({ error: "Cart is empty" });
  }

  const paymentIntentId =
    typeof req.body?.paymentIntentId === "string" ? req.body.paymentIntentId : null;

  const customerResult = checkoutCustomerSchema.safeParse(req.body?.customer ?? {});
  if (!customerResult.success) {
    return res.status(400).json({ error: "Invalid customer details" });
  }
  const customer = customerResult.data;
  const auth = getAuthContext(req);
  const userId = auth?.user?.id;
  const customerEmail = customer.email ?? auth?.user?.email;

  if (stripe) {
    if (!paymentIntentId) {
      return res.status(400).json({ error: "Payment verification missing" });
    }
    try {
      const intent = await stripe.paymentIntents.retrieve(paymentIntentId);
      if (intent.status !== "succeeded") {
        return res.status(400).json({ error: "Payment not completed" });
      }
      if ((intent.amount_received ?? 0) < summary.grossCents) {
        return res.status(400).json({ error: "Payment amount mismatch" });
      }
    } catch (error) {
      console.error("[stripe] retrieveIntent error", error);
      return res.status(400).json({ error: "Unable to verify payment" });
    }
  }

  const orderId = paymentIntentId ?? `order_${randomUUID()}`;
  const orderItems = summary.lines.map((line) => ({
    productId: line.product.id,
    title: line.product.title,
    qty: line.qty,
    priceCents: line.product.priceCents,
    lineTotalCents: line.product.priceCents * line.qty,
  }));

  for (const item of orderItems) {
    recordSale({
      productId: item.productId,
      productTitle: item.title,
      qty: item.qty,
      priceCents: item.priceCents,
      lineTotalCents: item.lineTotalCents,
      ua: req.get("user-agent") ?? undefined,
      ref: paymentIntentId ?? undefined,
      userId,
      customerName: customer.name,
      customerEmail: customerEmail,
      shippingAddress: customer.address,
      orderId,
      dropId: drop.id,
    });
  }

  if (userId) {
    try {
      updateUser(userId, {
        name: customer.name ?? auth?.user?.name,
        defaultShipping: customer.address,
      });
    } catch (error) {
      console.error("[account] Failed to update user profile after checkout", error);
    }
  }

  await sendReceiptEmail({
    orderId,
    totalCents: summary.grossCents,
    customerName: customer.name,
    customerEmail: customerEmail,
    shippingAddress: customer.address,
    items: orderItems,
    paymentRef: paymentIntentId ?? undefined,
  });

  session.cart = {};
  session.updatedAt = Date.now();

  res.json({
    ok: true,
    orderId,
    totals: {
      grossCents: summary.grossCents,
      items: summary.totalItems,
    },
  });
});

function ensureSession(req: Request, res: Response) {
  const sidFromCookie = readSessionId(req);
  let sid = sidFromCookie && sessions.has(sidFromCookie) ? sidFromCookie : null;
  if (!sid) {
    sid = randomUUID();
    sessions.set(sid, { cart: {}, updatedAt: Date.now() });
  }

  const session = sessions.get(sid)!;
  session.updatedAt = Date.now();
  purgeExpiredCart(session);

  if (sid !== sidFromCookie) {
    setSessionCookie(res, sid);
  }

  return { id: sid, session };
}

function readSessionId(req: Request) {
  const header = req.headers.cookie;
  if (!header) return null;
  const cookies = header.split(";").map((part) => part.trim());
  for (const cookie of cookies) {
    const [name, value] = cookie.split("=");
    if (name === SESSION_COOKIE && value) return decodeURIComponent(value);
  }
  return null;
}

function setSessionCookie(res: Response, id: string) {
  const secureRequired = Boolean(process.env.RENDER) || process.env.NODE_ENV === "production";
  const secure = secureRequired ? "; Secure" : "";
  const sameSite = secureRequired ? "None" : "Lax";
  const cookie = `${SESSION_COOKIE}=${encodeURIComponent(id)}; Path=/; HttpOnly; SameSite=${sameSite}; Max-Age=${SESSION_TTL_MS / 1000}${secure}`;
  if (typeof res.append === "function") {
    res.append("Set-Cookie", cookie);
  } else {
    const existing = res.getHeader("Set-Cookie");
    if (Array.isArray(existing)) {
      res.setHeader("Set-Cookie", [...existing, cookie]);
    } else if (typeof existing === "string") {
      res.setHeader("Set-Cookie", [existing, cookie]);
    } else {
      res.setHeader("Set-Cookie", cookie);
    }
  }
}

function releaseCart(cart: SessionCart) {
  for (const [productId, raw] of Object.entries(cart)) {
    const line = normalizeCartLine(raw);
    if (line && line.qty > 0) {
      release(productId, line.qty);
    }
    delete cart[productId];
  }
}

setInterval(() => {
  const cutoff = Date.now() - SESSION_TTL_MS;
  for (const [sid, session] of sessions) {
    purgeExpiredCart(session);
    if (session.updatedAt < cutoff) {
      releaseCart(session.cart);
      sessions.delete(sid);
    }
  }
}, 60_000);
