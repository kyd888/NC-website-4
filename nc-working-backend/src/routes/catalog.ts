import { randomUUID } from "crypto";
import type { Request, Response } from "express";
import { Router } from "express";
import Stripe from "stripe";
import { z } from "zod";
import {
  listCatalog,
  getCurrentDrop,
  getAllRemaining,
  getDisplayedRemaining,
  computePredictions,
  onInventoryUpdate,
  reserve,
  release,
  getProduct,
  seedInventory,
  recordProductViews,
  getRecentlyLiveProductIds,
  getVaultSaveWindowMs,
  isMadeToOrder,
} from "../lib/inventory.js";
import { customerOrderNumber, recordSale } from "../lib/sales.js";
import {
  sendPurchaseNotificationEmail,
  sendReceiptEmail,
  sendCartAbandonmentEmail,
  type ReceiptFulfillment,
} from "../lib/mailer.js";
import { noteCartAdd } from "../lib/cartAlerts.js";
import type { CatalogItem, FulfillmentMethod, SaleFulfillment, ShowSnapshot } from "../lib/types.js";
import {
  dateLabel,
  planFulfillment,
  publicShowMerch,
  validateShippingAddress,
  type FulfillmentPlan,
  type ShippingAddress,
} from "../lib/showMerch.js";
import { getAuthContext } from "../lib/auth.js";
import { getKydContent } from "../lib/siteContent.js";
import { sizesForProduct, normalizeSize } from "../lib/sizing.js";
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

// Name and email. The address is checked separately, and only when something
// in the order ships: a pickup-only order never asks for one.
const checkoutContactSchema = z
  .object({
    name: optionalString,
    email: z.string().trim().min(1).email(),
  })
  .transform((value) => ({ name: value.name, email: value.email.trim() }));

type CheckoutContact = z.infer<typeof checkoutContactSchema>;

const SESSION_COOKIE = "nc_session";
const SESSION_TTL_MS = 30 * 60 * 1000;
const CART_HOLD_TTL_MS = 3 * 60 * 1000;
const MAX_QTY_PER_ITEM = 3;

const sessions = new Map<string, SessionData>();

// Cart abandonment — keyed by session ID
const ABANDONMENT_TTL_MS = 15 * 60 * 1000;
type AbandonmentEntry = { email: string; timer: NodeJS.Timeout };
const abandonmentTimers = new Map<string, AbandonmentEntry>();

function scheduleAbandonmentCheck(sessionId: string, email: string, getCart: () => CartLine[]) {
  const existing = abandonmentTimers.get(sessionId);
  if (existing) clearTimeout(existing.timer);
  const timer = setTimeout(() => {
    abandonmentTimers.delete(sessionId);
    const cartLines = getCart();
    if (!cartLines.length) return; // checkout already completed
    const remaining = getAllRemaining();
    const stillAvailable = cartLines.some(
      (l) => (remaining[l.product.id] ?? 0) > 0 || (isMadeToOrder(l.product.id) && l.product.id in remaining),
    );
    void sendCartAbandonmentEmail({
      email,
      stillAvailable,
      items: cartLines.map((l) => ({
        title: l.product.title,
        priceCents: l.product.priceCents,
        imageUrl: l.product.imageUrl,
        qty: l.qty,
      })),
    }).catch((err) => console.error("[abandonment-email] send failed", err));
  }, ABANDONMENT_TTL_MS);
  abandonmentTimers.set(sessionId, { email, timer });
}

const SAVE_WINDOW_MS = getVaultSaveWindowMs();

const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
// Local testing only: STRIPE_API_BASE points the client at a Stripe mock so
// checkout can be exercised end to end without real keys. Never set in production.
const stripeApiBase = process.env.STRIPE_API_BASE ? new URL(process.env.STRIPE_API_BASE) : null;
const stripe =
  typeof stripeSecretKey === "string" && stripeSecretKey.length > 0
    ? new Stripe(
        stripeSecretKey,
        stripeApiBase
          ? {
              host: stripeApiBase.hostname,
              port: Number(stripeApiBase.port) || (stripeApiBase.protocol === "https:" ? 443 : 80),
              protocol: stripeApiBase.protocol === "https:" ? "https" : "http",
            }
          : undefined,
      )
    : null;
if (!stripe) {
  console.warn("[stripe] STRIPE_SECRET_KEY is missing; payment endpoints disabled.");
} else if (stripeApiBase) {
  console.warn(`[stripe] Using a Stripe mock at ${stripeApiBase.origin} (STRIPE_API_BASE). Test use only.`);
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
    // A made-to-order line holds no units, so there is nothing to give back:
    // it stays in the bag until the session itself expires.
    if (!isMadeToOrder(productId) && line.reservedAt + CART_HOLD_TTL_MS <= now) {
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
  const out: Record<string, { qty: number; holdMsRemaining: number | null }> = {};
  for (const [productId, line] of Object.entries(session.cart)) {
    const qty = Math.max(0, Math.floor(line.qty));
    if (!qty) continue;
    const holdMsRemaining = isMadeToOrder(productId) ? null : Math.max(0, line.reservedAt + CART_HOLD_TTL_MS - now);
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

function toAbsoluteUrl(input: string | undefined, baseUrl: string): string | undefined {
  if (!input) return undefined;
  if (/^https?:\/\//i.test(input)) return input;
  if (input.startsWith("//")) return `https:${input}`;
  const normalizedBase = baseUrl ? baseUrl.replace(/\/+$/g, "") : "";
  const normalizedPath = input.startsWith("/") ? input : `/${input}`;
  return normalizedBase ? `${normalizedBase}${normalizedPath}` : input;
}

/// ---------- Checkout helpers ----------

/** Sizes are picked in the bag: { productId: ["M", "L"] }, one per unit, all valid. */
function checkSizes(
  lines: CartLine[],
  submitted: unknown,
): { ok: true; chosen: Map<string, string[]> } | { ok: false; error: string; productId: string; sizes: string[] } {
  const submittedSizes = (submitted ?? {}) as Record<string, unknown>;
  const chosen = new Map<string, string[]>();
  for (const line of lines) {
    const options = sizesForProduct(line.product);
    if (!options.length) continue;
    const raw = submittedSizes[line.product.id];
    const list = Array.isArray(raw) ? raw : raw == null ? [] : [raw];
    const normalized = list
      .map((entry) => normalizeSize(line.product, entry))
      .filter((entry): entry is string => entry !== null);
    if (normalized.length !== line.qty) {
      return { ok: false, error: `Choose a size for each ${line.product.title}`, productId: line.product.id, sizes: options };
    }
    chosen.set(line.product.id, normalized);
  }
  return { ok: true, chosen };
}

/** "Front print · Standard black tee" — what the customer was told, kept on the order. */
export function productDetailOf(product: Pick<CatalogItem, "printPlacement" | "garment">): string | undefined {
  const parts = [
    product.printPlacement === "front_back" ? "Front + back print" : product.printPlacement === "front" ? "Front print" : "",
    product.garment ?? "",
  ].filter(Boolean);
  return parts.length ? parts.join(" · ") : undefined;
}

/** Items, delivery (when it isn't in the price) and the total the card is charged. */
function orderTotals(summary: { grossCents: number }, plan: FulfillmentPlan) {
  const shippingFeeCents = plan.method === "ship" ? plan.shippingFeeCents : 0;
  return { itemsCents: summary.grossCents, shippingFeeCents, totalCents: summary.grossCents + shippingFeeCents };
}

/**
 * What was validated on the server right before payment, saved on the Stripe
 * PaymentIntent. Confirm reads it back instead of trusting the browser again,
 * and never re-checks eligibility: once paid, an order keeps the fulfillment
 * it was paid under even if the show's settings change a second later. The
 * texts the customer saw (hours, instructions, policy) ride along too, so a
 * later edit in the admin can't rewrite what a paid order promised.
 */
type PreparedCheckout = {
  method: FulfillmentMethod | null;
  showMerchIds: string[];
  setupId?: string;
  show?: ShowSnapshot;
  address?: ShippingAddress;
  contact?: { name?: string; email?: string };
  bonus?: string;
  pickupHours?: string;
  pickupInstructions?: string;
  missedPickupPolicy?: string;
  shipsAfter?: string;
  dispatchEstimate?: string;
  shippingIncluded?: boolean;
  shippingFeeCents: number;
};

// Stripe metadata values cap at 500 characters, so every stored field is bounded.
const clip = (value: string | undefined, max: number) => (value ? value.slice(0, max) : value);

function preparedMetadata(plan: FulfillmentPlan, contact: CheckoutContact, address: ShippingAddress | undefined) {
  const setup = plan.setup;
  const show = plan.show
    ? {
        id: clip(plan.show.id, 80),
        name: clip(plan.show.name, 120),
        date: plan.show.date,
        location: clip(plan.show.location, 160),
        timezone: plan.show.timezone,
      }
    : null;
  const ship = address
    ? {
        line1: clip(address.line1, 100),
        line2: clip(address.line2, 100),
        city: clip(address.city, 60),
        state: clip(address.state, 20),
        postalCode: clip(address.postalCode, 20),
        country: address.country,
      }
    : null;
  const pickup = plan.method === "pickup";
  const ships = plan.method === "ship";
  return {
    nc_fulfillment: plan.method ?? "none",
    nc_show_merch_ids: clip(plan.showMerchIds.join(","), 500) ?? "",
    nc_setup: setup?.id ?? "",
    nc_show: show ? JSON.stringify(show) : "",
    nc_ship: ship ? JSON.stringify(ship) : "",
    nc_contact: JSON.stringify({ name: clip(contact.name, 120) ?? "", email: clip(contact.email, 200) }),
    nc_bonus: pickup ? clip(setup?.pickupBonus, 60) ?? "" : "",
    nc_pickup_hours: pickup ? clip(plan.show?.hours, 160) ?? "" : "",
    nc_pickup_instructions: pickup ? clip(plan.show?.instructions, 500) ?? "" : "",
    nc_policy: pickup ? clip(setup?.missedPickupPolicy, 500) ?? "" : "",
    nc_ships_after: ships ? setup?.shipsAfterDate ?? "" : "",
    nc_dispatch: ships ? clip(setup?.dispatchEstimate, 300) ?? "" : "",
    nc_ship_included: ships ? (setup?.shippingIncluded === false ? "no" : "yes") : "",
    nc_ship_fee: String(ships ? plan.shippingFeeCents : 0),
    nc_prepared_at: new Date().toISOString(),
  };
}

function parseJson<T>(raw: string | undefined): T | undefined {
  if (!raw) return undefined;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return undefined;
  }
}

function readPreparedCheckout(metadata: Record<string, string> | undefined | null): PreparedCheckout | null {
  const method = metadata?.nc_fulfillment;
  if (!method) return null; // Paid through a checkout that never ran prepare (an older browser tab).
  const fee = Number(metadata?.nc_ship_fee ?? 0);
  return {
    method: method === "pickup" || method === "ship" ? method : null,
    showMerchIds: (metadata?.nc_show_merch_ids ?? "").split(",").filter(Boolean),
    setupId: metadata?.nc_setup || undefined,
    show: parseJson<ShowSnapshot>(metadata?.nc_show),
    address: parseJson<ShippingAddress>(metadata?.nc_ship),
    contact: parseJson<{ name?: string; email?: string }>(metadata?.nc_contact),
    bonus: metadata?.nc_bonus || undefined,
    pickupHours: metadata?.nc_pickup_hours || undefined,
    pickupInstructions: metadata?.nc_pickup_instructions || undefined,
    missedPickupPolicy: metadata?.nc_policy || undefined,
    shipsAfter: metadata?.nc_ships_after || undefined,
    dispatchEstimate: metadata?.nc_dispatch || undefined,
    shippingIncluded: metadata?.nc_ship_included ? metadata.nc_ship_included === "yes" : undefined,
    shippingFeeCents: Number.isFinite(fee) && fee > 0 ? Math.round(fee) : 0,
  };
}

function preparedLineFulfillment(productId: string, prepared: PreparedCheckout | null): SaleFulfillment {
  if (!prepared?.method || !prepared.showMerchIds.includes(productId)) return { method: "ship" };
  if (prepared.method === "pickup") {
    return {
      method: "pickup",
      showMerch: true,
      setupId: prepared.setupId,
      show: prepared.show,
      bonus: prepared.bonus,
      pickupHours: prepared.pickupHours,
      pickupInstructions: prepared.pickupInstructions,
      missedPickupPolicy: prepared.missedPickupPolicy,
    };
  }
  return {
    method: "ship",
    showMerch: true,
    setupId: prepared.setupId,
    shipsAfter: prepared.shipsAfter,
    dispatchEstimate: prepared.dispatchEstimate,
    shippingIncluded: prepared.shippingIncluded ?? true,
    shippingFeeCents: prepared.shippingFeeCents,
  };
}

/** The details a customer sees on the confirmation page and in the receipt — from the snapshot, never live data. */
function describePrepared(prepared: PreparedCheckout | null, lines: CartLine[]): ReceiptFulfillment {
  const method = prepared?.method ?? null;
  const otherItemsShip = lines.some((line) => !prepared?.showMerchIds.includes(line.product.id));
  if (method === "pickup") {
    return {
      method,
      show: prepared?.show
        ? { name: prepared.show.name, dateLabel: dateLabel(prepared.show.date), location: prepared.show.location }
        : undefined,
      pickupHours: prepared?.pickupHours,
      pickupInstructions: prepared?.pickupInstructions,
      missedPickupPolicy: prepared?.missedPickupPolicy,
      bonus: prepared?.bonus,
      otherItemsShip,
    };
  }
  if (method === "ship") {
    return {
      method,
      shipsAfterLabel: prepared?.shipsAfter ? dateLabel(prepared.shipsAfter) : undefined,
      dispatchEstimate: prepared?.dispatchEstimate,
      shippingFeeCents: prepared?.shippingFeeCents || undefined,
      otherItemsShip,
    };
  }
  return { method: null, otherItemsShip: true };
}

/** A fulfillment problem in the shape the shop reads: a message, plus a code to act on. */
function sendPlanFailure(res: Response, failure: { status: number; code: string; error: string }) {
  return res.status(failure.status).json({ error: failure.error, code: failure.code });
}

// Everything the shop needs to show pickup and shipping options. Eligibility is
// computed here, and checked again on the server right before payment.
catalogRouter.get("/show-merch", (_req, res) => {
  res.set("Cache-Control", "no-store");
  res.json(publicShowMerch());
});

// KYD page content — live dates, music, visuals, booking.
catalogRouter.get("/kyd", (_req, res) => {
  res.json(getKydContent());
});

catalogRouter.get("/products", (_req, res) => {
  const drop = getCurrentDrop();
  const items = listCatalog();
  const actualRemaining = getAllRemaining();
  const displayRemaining = getDisplayedRemaining();
  const active = items.filter((p) => p.enabled !== false);
  const recentIds = new Set(getRecentlyLiveProductIds(SAVE_WINDOW_MS));

  const payload = active.map((p) => ({
    id: p.id,
    title: p.title,
    priceCents: p.priceCents,
    imageUrl: p.imageUrl,
    images: p.images?.length ? p.images : p.imageUrl ? [p.imageUrl] : [],
    imageLabels: p.imageLabels ?? {},
    tags: p.tags ?? [],
    description: p.description ?? "",
    printPlacement: p.printPlacement ?? "",
    garment: p.garment ?? "",
    sizeGuide: p.sizeGuide ?? null,
    inventoryMode: p.inventoryMode ?? "stocked",
    // Empty for anything that doesn't need one — posters behave as before.
    sizes: sizesForProduct(p),
    // Meaningless for made-to-order products; the shop shows "Made to order" instead.
    remaining: displayRemaining[p.id] ?? 0,
    inDrop: drop?.status === "live" && p.id in actualRemaining,
  }));

  let filtered: typeof payload;
  if (drop?.status === "live") {
    filtered = payload;
    const liveViewIds = filtered.filter((p) => (actualRemaining[p.id] ?? 0) > 0 || (p.inventoryMode === "made_to_order" && p.inDrop)).map((p) => p.id);
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
  const displayRemaining = getDisplayedRemaining();
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
    remaining: displayRemaining[p.id] ?? 0,
    enabled: p.enabled !== false,
    tags: p.tags ?? [],
    inventoryMode: p.inventoryMode ?? "stocked",
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
    remaining: displayRemaining,
    products: filteredProducts,
    vault: getVaultSnapshot(),
  });
});

catalogRouter.get("/drop", (_req, res) => {
  const drop = getCurrentDrop();
  const displayRemaining = getDisplayedRemaining();
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
    remaining: displayRemaining[p.id] ?? 0,
    enabled: p.enabled !== false,
    tags: p.tags ?? [],
    inventoryMode: p.inventoryMode ?? "stocked",
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
    // Apply phantom decay so SSE updates stay consistent with polled state
    const displayed = getDisplayedRemaining();
    const displayedQty = displayed[payload.productId] ?? payload.remaining;
    res.write(`event: inv\n`);
    res.write(`data: ${JSON.stringify({ ...payload, remaining: displayedQty })}\n\n`);
  };

  const snapshot = getDisplayedRemaining();
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

  if (currentQty >= MAX_QTY_PER_ITEM) {
    return res.status(409).json({ error: `Limit of ${MAX_QTY_PER_ITEM} per item` });
  }

  const addQty = Math.min(qty, MAX_QTY_PER_ITEM - currentQty);
  const success = reserve(productId, addQty);
  if (!success) {
    return res.status(409).json({ error: "Sold out" });
  }

  session.cart[productId] = {
    qty: currentQty + addQty,
    reservedAt: Date.now(),
  };

  const auth = getAuthContext(req);
  const userEmail = auth?.user?.email;

  // Batched so a browsing session doesn't turn into a stream of emails.
  noteCartAdd({
    sessionId: id,
    productId,
    title: product.title,
    qty: addQty,
    priceCents: product.priceCents,
    email: userEmail,
  });

  // Schedule abandonment check if we have the user's email
  if (userEmail) {
    scheduleAbandonmentCheck(id, userEmail, () => {
      const summary = summarizeCart(getActiveCartEntries(session));
      return "error" in summary ? [] : summary.lines;
    });
  }

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

  // Show merch needs an explicit pickup-or-ship choice before checkout starts.
  // The amount only moves when delivery isn't in the price (a configured fee).
  const planned = planFulfillment(summary.lines.map((line) => line.product.id), req.body?.fulfillment);
  if (!planned.ok) return sendPlanFailure(res, planned);
  const totals = orderTotals(summary, planned.plan);

  try {
    const intent = await stripe.paymentIntents.create({
      amount: totals.totalCents,
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
      amount: totals.totalCents,
      itemsCents: totals.itemsCents,
      shippingFeeCents: totals.shippingFeeCents,
      needsAddress: planned.plan.needsAddress,
    });
  } catch (error) {
    console.error("[stripe] createIntent error", error);
    res.status(500).json({ error: "Unable to initiate payment" });
  }
});

// Runs right before the card is charged. Re-checks the fulfillment choice,
// pickup eligibility, contact details, address and sizes on the server, then
// saves the result on the PaymentIntent for confirm to use. If pickup closed
// while the customer was filling in the form, it says so and changes nothing:
// the customer chooses shipping and enters an address themselves.
catalogRouter.post("/checkout/prepare", async (req, res) => {
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

  const paymentIntentId = typeof req.body?.paymentIntentId === "string" ? req.body.paymentIntentId : "";
  if (!paymentIntentId) {
    return res.status(400).json({ error: "Payment verification missing" });
  }

  const planned = planFulfillment(summary.lines.map((line) => line.product.id), req.body?.fulfillment);
  if (!planned.ok) return sendPlanFailure(res, planned);
  const { plan } = planned;
  const totals = orderTotals(summary, plan);

  const contact = checkoutContactSchema.safeParse(req.body?.customer ?? {});
  if (!contact.success) {
    return res.status(400).json({ error: "Enter your name and a valid email address.", code: "CONTACT_INVALID" });
  }
  if (!contact.data.name) {
    return res.status(400).json({ error: "Name is required.", code: "CONTACT_INVALID" });
  }

  let address: ShippingAddress | undefined;
  if (plan.needsAddress) {
    const checked = validateShippingAddress(req.body?.customer?.address, plan.showMerchShips, plan.setup ?? undefined);
    if (!checked.ok) {
      return res.status(400).json({ error: checked.error, code: "ADDRESS_INVALID" });
    }
    address = checked.address;
  }

  // Sizes used to be checked only after payment; a missing one now stops
  // checkout before the card is charged.
  const sizes = checkSizes(summary.lines, req.body?.sizes);
  if (!sizes.ok) {
    return res.status(400).json({
      error: sizes.error,
      code: "SIZE_REQUIRED",
      productId: sizes.productId,
      sizes: sizes.sizes,
    });
  }

  try {
    const intent = await stripe.paymentIntents.retrieve(paymentIntentId);
    if (intent.status === "succeeded" || intent.status === "canceled") {
      return res.status(409).json({ error: "This checkout already finished. Start again from your bag.", code: "INTENT_DONE" });
    }
    // The amount was fixed when checkout opened; a different bag — or a
    // switch that adds or drops a delivery fee — needs a fresh one.
    if (intent.amount !== totals.totalCents) {
      return res.status(409).json({ error: "Your bag or delivery choice changed. Close checkout and start again.", code: "CART_CHANGED" });
    }
    await stripe.paymentIntents.update(paymentIntentId, {
      metadata: preparedMetadata(plan, contact.data, address),
    });
  } catch (error) {
    console.error("[stripe] prepare error", error);
    return res.status(502).json({ error: "Unable to prepare payment. Try again." });
  }

  res.json({ ok: true, method: plan.method, needsAddress: plan.needsAddress, ...totals });
});

catalogRouter.post("/checkout/confirm", async (req, res) => {
  const { session, id } = ensureSession(req, res);
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

  // What the server validated right before payment. Eligibility is not checked
  // again here: the customer has paid for the fulfillment they chose.
  let prepared: PreparedCheckout | null = null;
  let paidCents = summary.grossCents;
  if (stripe) {
    if (!paymentIntentId) {
      return res.status(400).json({ error: "Payment verification missing" });
    }
    try {
      const intent = await stripe.paymentIntents.retrieve(paymentIntentId);
      if (intent.status !== "succeeded") {
        return res.status(400).json({ error: "Payment not completed" });
      }
      prepared = readPreparedCheckout(intent.metadata);
      const expected = summary.grossCents + (prepared?.shippingFeeCents ?? 0);
      if ((intent.amount_received ?? 0) < expected) {
        return res.status(400).json({ error: "Payment amount mismatch" });
      }
      paidCents = intent.amount_received ?? expected;
    } catch (error) {
      console.error("[stripe] retrieveIntent error", error);
      return res.status(400).json({ error: "Unable to verify payment" });
    }
  }

  const submittedContact = checkoutContactSchema.safeParse(req.body?.customer ?? {});
  const contact: CheckoutContact | null = prepared?.contact?.email
    ? { name: prepared.contact.name || undefined, email: prepared.contact.email }
    : submittedContact.success
    ? submittedContact.data
    : null;
  if (!contact) {
    return res.status(400).json({ error: "Invalid customer details" });
  }

  const lineFulfillments = new Map(
    summary.lines.map((line) => [line.product.id, preparedLineFulfillment(line.product.id, prepared)]),
  );
  const needsAddress = [...lineFulfillments.values()].some((f) => f.method === "ship");

  let address: ShippingAddress | undefined;
  if (needsAddress) {
    if (prepared?.address) {
      address = prepared.address;
    } else {
      // A checkout that never ran prepare: the shop's original address rules.
      const checked = validateShippingAddress(req.body?.customer?.address, false);
      if (!checked.ok) {
        return res.status(400).json({ error: "Invalid customer details" });
      }
      address = checked.address;
    }
  }

  const auth = getAuthContext(req);
  const userId = auth?.user?.id;
  const customerEmail = contact.email ?? auth?.user?.email;

  const sizes = checkSizes(summary.lines, req.body?.sizes);
  if (!sizes.ok) {
    return res.status(400).json({ error: sizes.error, productId: sizes.productId, sizes: sizes.sizes });
  }
  const chosen = sizes.chosen;

  const orderId = paymentIntentId ?? `order_${randomUUID()}`;
  const orderNumber = customerOrderNumber(orderId);
  const assetBase = process.env.FRONTEND_ORIGIN ?? process.env.BACKEND_ORIGIN ?? "";
  // A line with mixed sizes becomes one item per size, so the order reads as
  // something you can actually pick and pack.
  const orderItems = summary.lines.flatMap((line) => {
    const fulfillment = lineFulfillments.get(line.product.id) ?? { method: "ship" as const };
    const base = {
      productId: line.product.id,
      title: line.product.title,
      priceCents: line.product.priceCents,
      imageUrl: line.product.imageUrl
        ? toAbsoluteUrl(line.product.imageUrl, assetBase)
        : undefined,
      detail: productDetailOf(line.product),
      fulfillment,
      method: fulfillment.method,
    };
    const lineSizes = chosen.get(line.product.id);
    if (!lineSizes) {
      return [{ ...base, qty: line.qty, lineTotalCents: line.product.priceCents * line.qty, size: undefined as string | undefined }];
    }
    const counts = new Map<string, number>();
    for (const size of lineSizes) counts.set(size, (counts.get(size) ?? 0) + 1);
    return [...counts.entries()].map(([size, qty]) => ({
      ...base,
      qty,
      lineTotalCents: line.product.priceCents * qty,
      size: size as string | undefined,
    }));
  });

  for (const item of orderItems) {
    await recordSale({
      productId: item.productId,
      productTitle: item.title,
      qty: item.qty,
      priceCents: item.priceCents,
      lineTotalCents: item.lineTotalCents,
      size: item.size,
      productDetail: item.detail,
      ua: req.get("user-agent") ?? undefined,
      ref: paymentIntentId ?? undefined,
      userId,
      customerName: contact.name,
      customerEmail: customerEmail,
      shippingAddress: address,
      orderId,
      dropId: drop.id,
      fulfillment: item.fulfillment,
    });
  }

  if (userId) {
    try {
      await updateUser(userId, {
        name: contact.name ?? auth?.user?.name,
        // A pickup-only order has no address; the saved one stays as it was.
        ...(address ? { defaultShipping: address } : {}),
      });
    } catch (error) {
      console.error("[account] Failed to update user profile after checkout", error);
    }
  }

  const fulfillment = describePrepared(prepared, summary.lines);
  const shippingFeeCents = prepared?.shippingFeeCents ?? 0;
  const totalCents = summary.grossCents + shippingFeeCents;

  await sendReceiptEmail({
    orderId,
    orderNumber,
    totalCents,
    customerName: contact.name,
    customerEmail: customerEmail,
    shippingAddress: address,
    items: orderItems,
    paymentRef: paymentIntentId ?? undefined,
    fulfillment,
  });
  void sendPurchaseNotificationEmail({
    orderId,
    orderNumber,
    totalCents,
    customerName: contact.name,
    customerEmail: customerEmail,
    shippingAddress: address,
    items: orderItems,
    paymentRef: paymentIntentId ?? undefined,
    orderedAt: new Date().toISOString(),
    fulfillment,
  })
    .then((sent) => {
      if (sent) console.log(`[mailer] Purchase notification sent for ${orderId}`);
      else
        console.warn(
          `[mailer] Purchase notification for ${orderId} was NOT sent — check ORDER_NOTIFY_EMAIL and the mail transport.`,
        );
    })
    .catch((error) => {
      console.error("[mailer] Purchase notification failed:", error);
    });

  session.cart = {};
  session.updatedAt = Date.now();
  const abandoned = abandonmentTimers.get(id);
  if (abandoned) { clearTimeout(abandoned.timer); abandonmentTimers.delete(id); }

  res.json({
    ok: true,
    orderId,
    orderNumber,
    totals: {
      grossCents: totalCents,
      itemsCents: summary.grossCents,
      shippingFeeCents,
      paidCents,
      items: summary.totalItems,
    },
    // The customer-facing summary: no payment processor references here.
    items: orderItems.map((item) => ({
      productId: item.productId,
      title: item.title,
      size: item.size ?? null,
      qty: item.qty,
      imageUrl: item.imageUrl ?? null,
      detail: item.detail ?? null,
      method: item.method,
      lineTotalCents: item.lineTotalCents,
    })),
    fulfillment,
    customer: { name: contact.name ?? null, email: customerEmail ?? null },
    shippingAddress: address ?? null,
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
  res.setHeader("X-Session-Id", sid);

  return { id: sid, session };
}

function readSessionId(req: Request) {
  const headerId = req.get("x-session-id");
  if (typeof headerId === "string") {
    const trimmed = headerId.trim();
    if (/^[A-Za-z0-9\-_]{8,}$/.test(trimmed)) {
      return trimmed;
    }
  }

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
