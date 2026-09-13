import fs from "fs";
import path from "path";
import { dbEnabled, dbQuery, logDbError } from "./db.js";

/**
 * Where each order stands after payment: whether its pickup items were
 * collected, and whether its shipped items went out (with carrier and
 * tracking). Kept per order, apart from the sale lines, so updating a status
 * never rewrites what the customer bought or chose.
 *
 * Orders without a record are simply awaiting both — nothing is written at
 * checkout, only when someone updates an order in the admin.
 */

export type PickupStatus = "awaiting" | "picked_up" | "missed";
export type ShippingStatus = "awaiting" | "shipped";

export type OrderFulfillmentRecord = {
  orderId: string;
  pickupStatus: PickupStatus;
  shippingStatus: ShippingStatus;
  carrier?: string;
  trackingNumber?: string;
  updatedAt?: string;
};

export const PICKUP_STATUSES: PickupStatus[] = ["awaiting", "picked_up", "missed"];
export const SHIPPING_STATUSES: ShippingStatus[] = ["awaiting", "shipped"];

const DATA_DIR = path.resolve(process.env.DATA_DIR || "data");
const DATA_FILE = path.join(DATA_DIR, "order-fulfillment.json");

let records = new Map<string, OrderFulfillmentRecord>();

function sanitize(input: unknown): OrderFulfillmentRecord | null {
  if (!input || typeof input !== "object") return null;
  const v = input as Record<string, unknown>;
  const orderId = typeof v.orderId === "string" ? v.orderId : typeof v.order_id === "string" ? v.order_id : "";
  if (!orderId) return null;
  const pickup = v.pickupStatus ?? v.pickup_status;
  const shipping = v.shippingStatus ?? v.shipping_status;
  const carrier = v.carrier;
  const tracking = v.trackingNumber ?? v.tracking_number;
  const updated = v.updatedAt ?? v.updated_at;
  return {
    orderId,
    pickupStatus: PICKUP_STATUSES.includes(pickup as PickupStatus) ? (pickup as PickupStatus) : "awaiting",
    shippingStatus: SHIPPING_STATUSES.includes(shipping as ShippingStatus) ? (shipping as ShippingStatus) : "awaiting",
    carrier: typeof carrier === "string" && carrier.trim() ? carrier.trim().slice(0, 60) : undefined,
    trackingNumber: typeof tracking === "string" && tracking.trim() ? tracking.trim().slice(0, 80) : undefined,
    updatedAt: updated instanceof Date ? updated.toISOString() : typeof updated === "string" ? updated : undefined,
  };
}

export async function loadOrderFulfillment() {
  if (dbEnabled) {
    try {
      const result = await dbQuery(
        "SELECT order_id, pickup_status, shipping_status, carrier, tracking_number, updated_at FROM order_fulfillment",
      );
      records = new Map(
        result.rows
          .map((row) => sanitize(row))
          .filter((row): row is OrderFulfillmentRecord => row !== null)
          .map((row) => [row.orderId, row]),
      );
    } catch (error) {
      logDbError("failed to load order fulfillment", error);
    }
    return;
  }
  try {
    if (!fs.existsSync(DATA_FILE)) return;
    const parsed = JSON.parse(fs.readFileSync(DATA_FILE, "utf8") || "[]");
    if (!Array.isArray(parsed)) return;
    records = new Map(
      parsed
        .map((row) => sanitize(row))
        .filter((row): row is OrderFulfillmentRecord => row !== null)
        .map((row) => [row.orderId, row]),
    );
  } catch (error) {
    console.error("[order-fulfillment] could not read records:", error);
  }
}

export function getOrderFulfillment(orderId: string): OrderFulfillmentRecord {
  return records.get(orderId) ?? { orderId, pickupStatus: "awaiting", shippingStatus: "awaiting" };
}

export type OrderFulfillmentPatch = {
  pickupStatus?: unknown;
  shippingStatus?: unknown;
  carrier?: unknown;
  trackingNumber?: unknown;
};

export async function updateOrderFulfillment(
  orderId: string,
  patch: OrderFulfillmentPatch,
): Promise<OrderFulfillmentRecord | { error: string }> {
  const current = getOrderFulfillment(orderId);
  const next: OrderFulfillmentRecord = { ...current };

  if (patch.pickupStatus !== undefined) {
    if (!PICKUP_STATUSES.includes(patch.pickupStatus as PickupStatus)) return { error: "Unknown pickup status" };
    next.pickupStatus = patch.pickupStatus as PickupStatus;
  }
  if (patch.shippingStatus !== undefined) {
    if (!SHIPPING_STATUSES.includes(patch.shippingStatus as ShippingStatus)) return { error: "Unknown shipping status" };
    next.shippingStatus = patch.shippingStatus as ShippingStatus;
  }
  if (patch.carrier !== undefined) {
    next.carrier = typeof patch.carrier === "string" && patch.carrier.trim() ? patch.carrier.trim().slice(0, 60) : undefined;
  }
  if (patch.trackingNumber !== undefined) {
    next.trackingNumber =
      typeof patch.trackingNumber === "string" && patch.trackingNumber.trim()
        ? patch.trackingNumber.trim().slice(0, 80)
        : undefined;
  }
  next.updatedAt = new Date().toISOString();

  if (dbEnabled) {
    await dbQuery(
      `INSERT INTO order_fulfillment (order_id, pickup_status, shipping_status, carrier, tracking_number, updated_at)
       VALUES ($1, $2, $3, $4, $5, now())
       ON CONFLICT (order_id) DO UPDATE SET
         pickup_status = EXCLUDED.pickup_status,
         shipping_status = EXCLUDED.shipping_status,
         carrier = EXCLUDED.carrier,
         tracking_number = EXCLUDED.tracking_number,
         updated_at = now()`,
      [orderId, next.pickupStatus, next.shippingStatus, next.carrier ?? null, next.trackingNumber ?? null],
    );
    records.set(orderId, next);
  } else {
    records.set(orderId, next);
    try {
      fs.mkdirSync(DATA_DIR, { recursive: true });
      fs.writeFileSync(DATA_FILE, JSON.stringify([...records.values()], null, 2), "utf8");
    } catch (error) {
      console.error("[order-fulfillment] could not write records:", error);
    }
  }
  return next;
}
