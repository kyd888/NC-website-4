import type { CatalogItem } from "./types.js";
import fs from "fs";
import path from "path";

export type OrderItem = {
  productId: string;
  title: string;
  priceCents: number;
  qty: number;
};

export type ShippingAddress = {
  line1: string;
  line2?: string;
  city?: string;
  state?: string;
  postalCode?: string;
  country?: string;
};

export type Order = {
  id: string;
  ts: string;
  items: OrderItem[];
  totalCents: number;
  customerName?: string;
  customerEmail?: string;
  shippingAddress?: ShippingAddress;
  paymentIntentId?: string;
  dropId?: string;
};

let orders: Order[] = [];
const MAX_ORDERS = 1000;
const DATA_DIR = path.resolve("data");
const DATA_FILE = path.join(DATA_DIR, "orders.json");

function ensureDataDir() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

function sanitizeShippingAddress(input: unknown): ShippingAddress | undefined {
  if (!input || typeof input !== "object") return undefined;
  const value = input as Record<string, unknown>;
  const line1 = typeof value.line1 === "string" ? value.line1.trim() : "";
  if (!line1) return undefined;
  return {
    line1,
    line2: typeof value.line2 === "string" ? value.line2.trim() : undefined,
    city: typeof value.city === "string" ? value.city.trim() : undefined,
    state: typeof value.state === "string" ? value.state.trim() : undefined,
    postalCode: typeof value.postalCode === "string" ? value.postalCode.trim() : undefined,
    country: typeof value.country === "string" ? value.country.trim().toUpperCase() : undefined,
  };
}

function sanitizeOrderItem(input: unknown): OrderItem | null {
  if (!input || typeof input !== "object") return null;
  const value = input as Record<string, unknown>;
  const productId = typeof value.productId === "string" ? value.productId : "";
  const title = typeof value.title === "string" ? value.title : "";
  const priceCents = Math.max(0, Math.floor(Number(value.priceCents) || 0));
  const qty = Math.max(1, Math.floor(Number(value.qty) || 0));
  if (!productId || !title) return null;
  return { productId, title, priceCents, qty };
}

function sanitizeOrder(input: unknown): Order | null {
  if (!input || typeof input !== "object") return null;
  const value = input as Record<string, unknown>;
  const id = typeof value.id === "string" ? value.id : "";
  const ts = typeof value.ts === "string" ? value.ts : new Date().toISOString();
  const items = Array.isArray(value.items)
    ? value.items.map((entry) => sanitizeOrderItem(entry)).filter((entry): entry is OrderItem => entry !== null)
    : [];
  const totalCents = Math.max(0, Math.floor(Number(value.totalCents) || 0));
  if (!id || !items.length) return null;
  return {
    id,
    ts,
    items,
    totalCents,
    customerName: typeof value.customerName === "string" ? value.customerName : undefined,
    customerEmail: typeof value.customerEmail === "string" ? value.customerEmail : undefined,
    shippingAddress: sanitizeShippingAddress(value.shippingAddress),
    paymentIntentId: typeof value.paymentIntentId === "string" ? value.paymentIntentId : undefined,
    dropId: typeof value.dropId === "string" ? value.dropId : undefined,
  };
}

function saveToDisk() {
  try {
    ensureDataDir();
    fs.writeFileSync(DATA_FILE, JSON.stringify(orders, null, 2), "utf8");
  } catch (error) {
    console.error("[orders] Failed to persist orders.json", error);
  }
}

function loadFromDisk() {
  ensureDataDir();
  if (!fs.existsSync(DATA_FILE)) return;
  try {
    const raw = fs.readFileSync(DATA_FILE, "utf8");
    if (!raw.trim()) return;
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return;
    orders = parsed
      .map((row) => sanitizeOrder(row))
      .filter((row): row is Order => row !== null)
      .slice(-MAX_ORDERS);
  } catch (error) {
    console.error("[orders] Failed to load orders.json", error);
  }
}

loadFromDisk();

export function recordOrder(order: Omit<Order, "id" | "ts"> & { id?: string; ts?: string }) {
  const now = new Date().toISOString();
  const id = order.id ?? `order_${Date.now()}_${Math.random().toString(36).slice(2)}`;
  const row: Order = {
    id,
    ts: order.ts ?? now,
    items: order.items.map((item) => ({ ...item })),
    totalCents: order.totalCents,
    customerName: order.customerName,
    customerEmail: order.customerEmail,
    shippingAddress: order.shippingAddress ? { ...order.shippingAddress } : undefined,
    paymentIntentId: order.paymentIntentId,
    dropId: order.dropId,
  };
  orders.push(row);
  if (orders.length > MAX_ORDERS) orders = orders.slice(-MAX_ORDERS);
  saveToDisk();
  return row;
}

export function listOrders(limit = 200) {
  return orders.slice(-limit).reverse();
}

export function summarizeOrders(rows: Order[]) {
  let grossCents = 0;
  let items = 0;
  for (const order of rows) {
    grossCents += order.totalCents;
    for (const line of order.items) {
      items += line.qty;
    }
  }
  return {
    count: rows.length,
    items,
    grossCents,
  };
}
