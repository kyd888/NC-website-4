import fs from "fs";
import path from "path";

export type Sale = {
  id: string;
  ts: string;          // ISO
  productId: string;
  qty: number;
  priceCents: number;
  ref?: string;
  ua?: string;
  userId?: string;
  customerName?: string;
  customerEmail?: string;
  productTitle?: string;
  dropId?: string;
  shippingAddress?: {
    line1: string;
    line2?: string;
    city?: string;
    state?: string;
    postalCode?: string;
    country?: string;
  };
  orderId?: string;
  lineTotalCents?: number;
};

let sales: Sale[] = [];
const MAX_SALES = 5000;
const DATA_DIR = path.resolve("data");
const DATA_FILE = path.join(DATA_DIR, "sales.json");

function ensureDataDir() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

function sanitizeShippingAddress(input: unknown): Sale["shippingAddress"] | undefined {
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

function sanitizeSale(input: unknown): Sale | null {
  if (!input || typeof input !== "object") return null;
  const value = input as Record<string, unknown>;
  const id = typeof value.id === "string" ? value.id : "";
  const ts = typeof value.ts === "string" ? value.ts : new Date().toISOString();
  const productId = typeof value.productId === "string" ? value.productId : "";
  const qty = Math.max(1, Math.floor(Number(value.qty) || 0));
  const priceCents = Math.max(0, Math.floor(Number(value.priceCents) || 0));
  if (!id || !productId || !Number.isFinite(qty) || !Number.isFinite(priceCents)) return null;
  const lineTotalRaw = Number(value.lineTotalCents);
  const lineTotalCents =
    Number.isFinite(lineTotalRaw) && lineTotalRaw >= 0 ? Math.floor(lineTotalRaw) : qty * priceCents;
  return {
    id,
    ts,
    productId,
    qty,
    priceCents,
    ref: typeof value.ref === "string" ? value.ref : undefined,
    ua: typeof value.ua === "string" ? value.ua : undefined,
    userId: typeof value.userId === "string" ? value.userId : undefined,
    customerName: typeof value.customerName === "string" ? value.customerName : undefined,
    customerEmail: typeof value.customerEmail === "string" ? value.customerEmail : undefined,
    productTitle: typeof value.productTitle === "string" ? value.productTitle : undefined,
    dropId: typeof value.dropId === "string" ? value.dropId : undefined,
    shippingAddress: sanitizeShippingAddress(value.shippingAddress),
    orderId: typeof value.orderId === "string" ? value.orderId : undefined,
    lineTotalCents,
  };
}

function saveToDisk() {
  try {
    ensureDataDir();
    fs.writeFileSync(DATA_FILE, JSON.stringify(sales, null, 2), "utf8");
  } catch (error) {
    console.error("[sales] Failed to persist sales.json", error);
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
    sales = parsed
      .map((row) => sanitizeSale(row))
      .filter((row): row is Sale => row !== null)
      .slice(-MAX_SALES);
  } catch (error) {
    console.error("[sales] Failed to load sales.json", error);
  }
}

loadFromDisk();

export function recordSale(s: Omit<Sale, "id"|"ts"> & { id?: string; ts?: string }) {
  const row: Sale = {
    id: s.id ?? `sale_${Date.now()}_${Math.random().toString(36).slice(2)}`,
    ts: s.ts ?? new Date().toISOString(),
    productId: s.productId,
    qty: s.qty,
    priceCents: s.priceCents,
    ref: s.ref,
    ua: s.ua,
    userId: s.userId,
    customerName: s.customerName,
    customerEmail: s.customerEmail,
    productTitle: s.productTitle,
    shippingAddress: s.shippingAddress
      ? {
          line1: s.shippingAddress.line1,
          line2: s.shippingAddress.line2,
          city: s.shippingAddress.city,
          state: s.shippingAddress.state,
          postalCode: s.shippingAddress.postalCode,
          country: s.shippingAddress.country,
      }
      : undefined,
    orderId: s.orderId,
    lineTotalCents: s.lineTotalCents ?? s.priceCents * s.qty,
    dropId: s.dropId,
  };
  sales.push(row);
  if (sales.length > MAX_SALES) sales = sales.slice(-MAX_SALES);
  saveToDisk();
  return row;
}

export function listSales(limit = 200) {
  return sales.slice(-limit).reverse();
}

export type OrderLineItem = {
  productId: string;
  productTitle?: string;
  qty: number;
  priceCents: number;
  lineTotalCents: number;
};

export type OrderSummary = {
  orderId: string;
  ts: string;
  userId?: string;
  dropId?: string;
  customerName?: string;
  customerEmail?: string;
  shippingAddress?: Sale["shippingAddress"];
  paymentRef?: string;
  totalCents: number;
  totalItems: number;
  items: OrderLineItem[];
};

export function groupSalesByOrder(rows: Sale[]): OrderSummary[] {
  const orders: OrderSummary[] = [];
  const index = new Map<string, number>();

  for (const sale of rows) {
    const key = sale.orderId ?? sale.id;
    let orderIdx = index.get(key);
    let order: OrderSummary | undefined = typeof orderIdx === "number" ? orders[orderIdx] : undefined;
    if (!order) {
      order = {
        orderId: key,
        ts: sale.ts,
        userId: sale.userId,
        dropId: sale.dropId,
        customerName: sale.customerName,
        customerEmail: sale.customerEmail,
        shippingAddress: sale.shippingAddress,
        paymentRef: sale.ref,
        totalCents: 0,
        totalItems: 0,
        items: [],
      };
      orders.push(order);
      index.set(key, orders.length - 1);
    } else {
      if (!order.customerName && sale.customerName) order.customerName = sale.customerName;
      if (!order.customerEmail && sale.customerEmail) order.customerEmail = sale.customerEmail;
      if (!order.shippingAddress && sale.shippingAddress) order.shippingAddress = sale.shippingAddress;
      if (!order.paymentRef && sale.ref) order.paymentRef = sale.ref;
      if (!order.userId && sale.userId) order.userId = sale.userId;
      if (!order.dropId && sale.dropId) order.dropId = sale.dropId;
      if (sale.ts && sale.ts > order.ts) order.ts = sale.ts;
    }

    const lineTotal = sale.lineTotalCents ?? sale.priceCents * sale.qty;
    order.totalCents += lineTotal;
    order.totalItems += sale.qty;
    order.items.push({
      productId: sale.productId,
      productTitle: sale.productTitle,
      qty: sale.qty,
      priceCents: sale.priceCents,
      lineTotalCents: lineTotal,
    });
  }

  return orders;
}

export function summarizeSales(rows: Sale[]) {
  let grossCents = 0;
  let items = 0;
  for (const row of rows) {
    grossCents += row.lineTotalCents ?? row.priceCents * row.qty;
    items += row.qty;
  }
  return {
    count: rows.length,
    items,
    grossCents,
  };
}

