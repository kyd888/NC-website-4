import fs from "fs";
import path from "path";
import { randomBytes } from "crypto";
import { dbEnabled, dbQuery, logDbError } from "./db.js";

/**
 * Where each order stands after payment: whether its pickup items were
 * collected, and whether its shipped items went out (with carrier and
 * tracking). Kept per order, apart from the sale lines, so updating a status
 * never rewrites what the customer bought or chose.
 *
 * Also here: the record of shipping-update emails (so one isn't sent twice by
 * accident), and the missed-pickup path — a secure link the customer uses to
 * give an address, or an address staff typed in — which turns an uncollected
 * pickup order into a shipment without charging anything again.
 *
 * Orders without a record are simply awaiting both — nothing is written at
 * checkout, only when someone updates an order in the admin.
 */

export type PickupStatus = "awaiting" | "picked_up" | "missed";
export type ShippingStatus = "awaiting" | "shipped";

export type FulfillmentAddress = {
  line1: string;
  line2?: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
};

export type OrderFulfillmentRecord = {
  orderId: string;
  pickupStatus: PickupStatus;
  shippingStatus: ShippingStatus;
  carrier?: string;
  trackingNumber?: string;
  updatedAt?: string;
  /** When the pickup was checked in at the show — shown so an accidental tap can be undone. */
  pickedUpAt?: string;
  /** Shipping-update emails: the last send and how many, so a second send is deliberate. */
  shippingUpdateSentAt?: string;
  shippingUpdateCount?: number;
  /** Missed pickup: the secure link the customer was given to enter an address. */
  addressToken?: string;
  addressTokenCreatedAt?: string;
  addressRequestSentAt?: string;
  /** Missed pickup: the address to ship to instead, and where it came from. */
  missedPickupAddress?: FulfillmentAddress;
  missedPickupAddressAt?: string;
  missedPickupAddressSource?: "customer" | "staff";
};

export const PICKUP_STATUSES: PickupStatus[] = ["awaiting", "picked_up", "missed"];
export const SHIPPING_STATUSES: ShippingStatus[] = ["awaiting", "shipped"];

/** Address links stop working after this, whether or not they were used. */
export const ADDRESS_TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000;

const DATA_DIR = path.resolve(process.env.DATA_DIR || "data");
const DATA_FILE = path.join(DATA_DIR, "order-fulfillment.json");

let records = new Map<string, OrderFulfillmentRecord>();

const optionalText = (value: unknown, max: number) =>
  typeof value === "string" && value.trim() ? value.trim().slice(0, max) : undefined;
const optionalIso = (value: unknown) =>
  value instanceof Date ? value.toISOString() : typeof value === "string" && value ? value : undefined;

function sanitizeAddress(input: unknown): FulfillmentAddress | undefined {
  if (!input || typeof input !== "object") return undefined;
  const v = input as Record<string, unknown>;
  const line1 = optionalText(v.line1, 100);
  const city = optionalText(v.city, 60);
  const state = optionalText(v.state, 20);
  const postalCode = optionalText(v.postalCode, 20);
  const country = optionalText(v.country, 2);
  if (!line1 || !city || !state || !postalCode || !country) return undefined;
  return { line1, line2: optionalText(v.line2, 100), city, state: state.toUpperCase(), postalCode, country: country.toUpperCase() };
}

function sanitize(input: unknown): OrderFulfillmentRecord | null {
  if (!input || typeof input !== "object") return null;
  const v = input as Record<string, unknown>;
  const orderId = typeof v.orderId === "string" ? v.orderId : typeof v.order_id === "string" ? v.order_id : "";
  if (!orderId) return null;
  // DB rows keep the extras in one jsonb column; JSON files keep them inline.
  const extra = (v.extra && typeof v.extra === "object" ? v.extra : v) as Record<string, unknown>;
  const pickup = v.pickupStatus ?? v.pickup_status;
  const shipping = v.shippingStatus ?? v.shipping_status;
  const count = Number(extra.shippingUpdateCount);
  const source = extra.missedPickupAddressSource;
  const out: OrderFulfillmentRecord = {
    orderId,
    pickupStatus: PICKUP_STATUSES.includes(pickup as PickupStatus) ? (pickup as PickupStatus) : "awaiting",
    shippingStatus: SHIPPING_STATUSES.includes(shipping as ShippingStatus) ? (shipping as ShippingStatus) : "awaiting",
    carrier: optionalText(v.carrier, 60),
    trackingNumber: optionalText(v.trackingNumber ?? v.tracking_number, 80),
    updatedAt: optionalIso(v.updatedAt ?? v.updated_at),
    pickedUpAt: optionalIso(extra.pickedUpAt),
    shippingUpdateSentAt: optionalIso(extra.shippingUpdateSentAt),
    shippingUpdateCount: Number.isFinite(count) && count > 0 ? Math.floor(count) : undefined,
    addressToken: optionalText(extra.addressToken, 64),
    addressTokenCreatedAt: optionalIso(extra.addressTokenCreatedAt),
    addressRequestSentAt: optionalIso(extra.addressRequestSentAt),
    missedPickupAddress: sanitizeAddress(extra.missedPickupAddress),
    missedPickupAddressAt: optionalIso(extra.missedPickupAddressAt),
    missedPickupAddressSource: source === "customer" || source === "staff" ? source : undefined,
  };
  for (const key of Object.keys(out) as Array<keyof OrderFulfillmentRecord>) {
    if (out[key] === undefined) delete out[key];
  }
  return out;
}

/** The columns beyond the fixed ones, for the jsonb column. */
function extraOf(record: OrderFulfillmentRecord) {
  const {
    orderId: _id, pickupStatus: _p, shippingStatus: _s, carrier: _c, trackingNumber: _t, updatedAt: _u,
    ...extra
  } = record;
  return extra;
}

export async function loadOrderFulfillment() {
  if (dbEnabled) {
    try {
      const result = await dbQuery(
        "SELECT order_id, pickup_status, shipping_status, carrier, tracking_number, updated_at, extra FROM order_fulfillment",
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
  const found = records.get(orderId);
  return found ? { ...found } : { orderId, pickupStatus: "awaiting", shippingStatus: "awaiting" };
}

export function listOrderFulfillment(): OrderFulfillmentRecord[] {
  return [...records.values()].map((r) => ({ ...r }));
}

async function write(next: OrderFulfillmentRecord) {
  next.updatedAt = new Date().toISOString();
  records.set(next.orderId, next);
  if (dbEnabled) {
    await dbQuery(
      `INSERT INTO order_fulfillment (order_id, pickup_status, shipping_status, carrier, tracking_number, updated_at, extra)
       VALUES ($1, $2, $3, $4, $5, now(), $6::jsonb)
       ON CONFLICT (order_id) DO UPDATE SET
         pickup_status = EXCLUDED.pickup_status,
         shipping_status = EXCLUDED.shipping_status,
         carrier = EXCLUDED.carrier,
         tracking_number = EXCLUDED.tracking_number,
         updated_at = now(),
         extra = EXCLUDED.extra`,
      [next.orderId, next.pickupStatus, next.shippingStatus, next.carrier ?? null, next.trackingNumber ?? null, JSON.stringify(extraOf(next))],
    );
    return;
  }
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(DATA_FILE, JSON.stringify([...records.values()], null, 2), "utf8");
  } catch (error) {
    console.error("[order-fulfillment] could not write records:", error);
  }
}

export type OrderFulfillmentPatch = {
  pickupStatus?: unknown;
  shippingStatus?: unknown;
  carrier?: unknown;
  trackingNumber?: unknown;
  /** Staff-entered address for a missed pickup. null clears it. */
  missedPickupAddress?: unknown;
};

export async function updateOrderFulfillment(
  orderId: string,
  patch: OrderFulfillmentPatch,
): Promise<OrderFulfillmentRecord | { error: string }> {
  const next = getOrderFulfillment(orderId);

  if (patch.pickupStatus !== undefined) {
    if (!PICKUP_STATUSES.includes(patch.pickupStatus as PickupStatus)) return { error: "Unknown pickup status" };
    const status = patch.pickupStatus as PickupStatus;
    if (status !== next.pickupStatus) {
      next.pickupStatus = status;
      if (status === "picked_up") next.pickedUpAt = new Date().toISOString();
      else delete next.pickedUpAt;
    }
  }
  if (patch.shippingStatus !== undefined) {
    if (!SHIPPING_STATUSES.includes(patch.shippingStatus as ShippingStatus)) return { error: "Unknown shipping status" };
    next.shippingStatus = patch.shippingStatus as ShippingStatus;
  }
  if (patch.carrier !== undefined) {
    const carrier = optionalText(patch.carrier, 60);
    if (carrier) next.carrier = carrier;
    else delete next.carrier;
  }
  if (patch.trackingNumber !== undefined) {
    const tracking = optionalText(patch.trackingNumber, 80);
    if (tracking) next.trackingNumber = tracking;
    else delete next.trackingNumber;
  }
  if (patch.missedPickupAddress !== undefined) {
    if (patch.missedPickupAddress === null || patch.missedPickupAddress === "") {
      delete next.missedPickupAddress;
      delete next.missedPickupAddressAt;
      delete next.missedPickupAddressSource;
    } else {
      const address = sanitizeAddress(patch.missedPickupAddress);
      if (!address) return { error: "Complete the address: street, city, state, postal code and country." };
      next.missedPickupAddress = address;
      next.missedPickupAddressAt = new Date().toISOString();
      next.missedPickupAddressSource = "staff";
    }
  }

  await write(next);
  return { ...next };
}

/** A fresh secure link for the customer to enter an address. Replaces any earlier one. */
export async function issueAddressToken(orderId: string): Promise<OrderFulfillmentRecord> {
  const next = getOrderFulfillment(orderId);
  next.addressToken = randomBytes(24).toString("hex");
  next.addressTokenCreatedAt = new Date().toISOString();
  await write(next);
  return { ...next };
}

export async function noteAddressRequestSent(orderId: string): Promise<OrderFulfillmentRecord> {
  const next = getOrderFulfillment(orderId);
  next.addressRequestSentAt = new Date().toISOString();
  await write(next);
  return { ...next };
}

/** The order an address link belongs to, if the link is real and not too old. */
export function findByAddressToken(token: string): OrderFulfillmentRecord | undefined {
  if (!/^[a-f0-9]{48}$/.test(token)) return undefined;
  for (const record of records.values()) {
    if (record.addressToken !== token) continue;
    const created = new Date(record.addressTokenCreatedAt ?? 0).getTime();
    if (!Number.isFinite(created) || Date.now() - created > ADDRESS_TOKEN_TTL_MS) return undefined;
    return { ...record };
  }
  return undefined;
}

/** The customer sent an address through their link: it ships there, and nothing is charged. */
export async function recordCustomerAddress(orderId: string, address: FulfillmentAddress): Promise<OrderFulfillmentRecord> {
  const next = getOrderFulfillment(orderId);
  next.missedPickupAddress = address;
  next.missedPickupAddressAt = new Date().toISOString();
  next.missedPickupAddressSource = "customer";
  if (next.pickupStatus !== "missed") next.pickupStatus = "missed";
  await write(next);
  return { ...next };
}

export async function noteShippingUpdateSent(orderId: string): Promise<OrderFulfillmentRecord> {
  const next = getOrderFulfillment(orderId);
  next.shippingStatus = "shipped";
  next.shippingUpdateSentAt = new Date().toISOString();
  next.shippingUpdateCount = (next.shippingUpdateCount ?? 0) + 1;
  await write(next);
  return { ...next };
}
