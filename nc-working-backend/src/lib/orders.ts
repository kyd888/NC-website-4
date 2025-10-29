import type { CatalogItem } from "./types.js";

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
  if (orders.length > 1000) orders = orders.slice(-1000);
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
