// src/lib/sales.ts
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
  // keep last 5000 in memory
  if (sales.length > 5000) sales = sales.slice(-5000);
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
    grossCents += row.priceCents * row.qty;
    items += row.qty;
  }
  return {
    count: rows.length,
    items,
    grossCents,
  };
}

