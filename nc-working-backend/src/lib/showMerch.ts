import fs from "fs";
import path from "path";
import { dbEnabled, dbQuery, logDbError } from "./db.js";
import { getKydContent, isValidTimeZone, type KydShow } from "./siteContent.js";
import type { FulfillmentMethod, SaleFulfillment, ShowSnapshot } from "./types.js";

/**
 * Show merch: products a customer can pick up at a KYD show (with a free
 * sticker pack) or have shipped after the show — at the same price either way.
 *
 * The product price already includes standard shipping, so neither option
 * adds a charge at checkout: pickup customers never pay for shipping, and
 * shipping customers aren't charged for it a second time.
 *
 * Operational details are edited in the admin, in two places:
 *  - per show (KYD tab): status, timezone, pickup on/off, order cutoff and
 *    pickup instructions — the fields on KydShow in siteContent.ts;
 *  - offer settings (Catalog tab, stored here): which products are show
 *    merch, the shipping region, the ships-after date, the dispatch estimate
 *    and the missed-pickup policy.
 * Nothing here is defaulted. A blank setting stays blank, and whatever needs
 * it stays switched off until someone fills it in.
 */

export type ShowMerchSettings = {
  /** Catalog product ids sold under this offer. Everything else keeps its normal checkout. */
  productIds: string[];
  /** ISO country codes shipping goes to, e.g. ["US"]. Empty = shipping not set up. */
  shippingCountries: string[];
  /** State/region codes inside those countries that shipping excludes, e.g. ["AK", "HI"]. */
  excludedRegions: string[];
  /** Local date (YYYY-MM-DD) shipping orders go out after. Empty = shipping not set up. */
  shipsAfterDate: string;
  /** Shown exactly as written. No delivery date is ever derived from it. */
  dispatchEstimate: string;
  /** What happens to pickup orders nobody collects. Shown exactly as written. */
  missedPickupPolicy: string;
};

export const PICKUP_OPTION_LABEL = "Pick up at a show + free sticker pack";
export const SHIP_OPTION_LABEL = "Ship after the show";
export const PICKUP_BONUS = "Free exclusive sticker pack";
/** Shows further out than this (in calendar months, in the show's timezone) don't open pickup yet. */
export const PICKUP_WINDOW_MONTHS = 2;

const PICKUP_UNAVAILABLE_TEXT = "Show pickup opens when an eligible show is within two months.";
const PICKUP_CLOSED_TEXT = "Pickup orders for this show have closed.";
const SHIPPING_AVAILABLE_TEXT = "Shipping is available.";

const EMPTY_SETTINGS: ShowMerchSettings = {
  productIds: [],
  shippingCountries: [],
  excludedRegions: [],
  shipsAfterDate: "",
  dispatchEstimate: "",
  missedPickupPolicy: "",
};

const DATA_DIR = path.resolve(process.env.DATA_DIR || "data");
const SETTINGS_FILE = path.join(DATA_DIR, "show-merch.json");
const CONTENT_ID = "show-merch";

let settings: ShowMerchSettings = { ...EMPTY_SETTINGS };

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------

function str(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

/** Accepts an array or a comma/newline separated string; trims, dedupes, drops blanks. */
function list(value: unknown, transform: (entry: string) => string = (entry) => entry): string[] {
  const raw = Array.isArray(value) ? value : typeof value === "string" ? value.split(/[\n,]/) : [];
  const out: string[] = [];
  for (const entry of raw) {
    const item = transform(String(entry ?? "").trim());
    if (item && !out.includes(item)) out.push(item);
  }
  return out;
}

export function sanitizeShowMerchSettings(input: unknown): ShowMerchSettings {
  const r = (input && typeof input === "object" ? input : {}) as Record<string, unknown>;
  const shipsAfterDate = str(r.shipsAfterDate);
  return {
    productIds: list(r.productIds).slice(0, 50),
    shippingCountries: list(r.shippingCountries, (c) => c.toUpperCase()).filter((c) => /^[A-Z]{2}$/.test(c)),
    excludedRegions: list(r.excludedRegions, (c) => c.toUpperCase()).filter((c) => /^[A-Z0-9-]{1,6}$/.test(c)),
    shipsAfterDate: /^\d{4}-\d{2}-\d{2}$/.test(shipsAfterDate) ? shipsAfterDate : "",
    dispatchEstimate: str(r.dispatchEstimate).slice(0, 300),
    missedPickupPolicy: str(r.missedPickupPolicy).slice(0, 1000),
  };
}

export function getShowMerchSettings(): ShowMerchSettings {
  return JSON.parse(JSON.stringify(settings)) as ShowMerchSettings;
}

export async function loadShowMerchSettings() {
  if (dbEnabled) {
    try {
      const rows = await dbQuery("SELECT data FROM site_content WHERE id = $1 LIMIT 1", [CONTENT_ID]);
      settings = sanitizeShowMerchSettings(rows.rows[0]?.data ?? {});
    } catch (error) {
      logDbError("show-merch:load", error);
    }
    return;
  }
  try {
    if (fs.existsSync(SETTINGS_FILE)) {
      settings = sanitizeShowMerchSettings(JSON.parse(fs.readFileSync(SETTINGS_FILE, "utf8") || "{}"));
    }
  } catch (error) {
    console.error("[show-merch] could not read settings:", error);
  }
}

export async function saveShowMerchSettings(input: unknown): Promise<ShowMerchSettings> {
  settings = sanitizeShowMerchSettings(input);
  if (dbEnabled) {
    await dbQuery(
      `INSERT INTO site_content (id, data, updated_at) VALUES ($1, $2::jsonb, now())
       ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data, updated_at = now()`,
      [CONTENT_ID, JSON.stringify(settings)],
    );
  } else {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(SETTINGS_FILE, JSON.stringify(settings, null, 2), "utf8");
  }
  return getShowMerchSettings();
}

export function isShowMerchProduct(productId: string, current = settings): boolean {
  return current.productIds.includes(productId);
}

// ---------------------------------------------------------------------------
// Time, in a show's own timezone
// ---------------------------------------------------------------------------

const pad = (n: number) => String(n).padStart(2, "0");

/** Wall-clock parts of an instant as seen in a timezone. */
function zonedParts(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(date);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0);
  return { year: get("year"), month: get("month"), day: get("day"), hour: get("hour"), minute: get("minute"), second: get("second") };
}

/** The calendar date (YYYY-MM-DD) it is at `now` in a timezone. */
export function localDateIn(timeZone: string, now: Date): string {
  const p = zonedParts(now, timeZone);
  return `${p.year}-${pad(p.month)}-${pad(p.day)}`;
}

/**
 * The instant a wall-clock time (YYYY-MM-DDTHH:mm) happens in a timezone,
 * resolved against that zone's offset on that date — so a cutoff on either
 * side of a daylight-saving change still lands on the hour the admin typed.
 */
export function zonedTimeToInstant(local: string, timeZone: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(local);
  if (!m || !isValidTimeZone(timeZone)) return null;
  const wall = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(m[4]), Number(m[5]));
  let guess = wall;
  for (let i = 0; i < 3; i++) {
    const p = zonedParts(new Date(guess), timeZone);
    const shown = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
    if (shown === wall) break;
    guess += wall - shown;
  }
  return new Date(guess);
}

/** A calendar date some months on, clamped to the month's last day (Dec 31 + 2 → Feb 28/29). */
export function addCalendarMonths(ymd: string, months: number): string {
  const [y, m, d] = ymd.split("-").map(Number);
  const first = new Date(Date.UTC(y, m - 1 + months, 1));
  const lastDay = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate();
  return `${first.getUTCFullYear()}-${pad(first.getUTCMonth() + 1)}-${pad(Math.min(d, lastDay))}`;
}

/** "Friday, September 18, 2026". The date is a calendar date, so no timezone shift applies. */
export function dateLabel(ymd: string): string {
  const date = new Date(`${ymd}T12:00:00Z`);
  if (Number.isNaN(date.getTime())) return ymd;
  return date.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric", timeZone: "UTC" });
}

function cutoffLabel(local: string, timeZone: string): string {
  const at = zonedTimeToInstant(local, timeZone);
  if (!at) return "";
  return at.toLocaleString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone,
    timeZoneName: "short",
  });
}

// ---------------------------------------------------------------------------
// Pickup eligibility
// ---------------------------------------------------------------------------

export function snapshotOfShow(show: KydShow): ShowSnapshot {
  return {
    id: show.id,
    name: show.title,
    date: show.date,
    location: [show.venue, show.city].filter(Boolean).join(", "),
    timezone: show.timezone,
  };
}

export type ShowPickupCheck = ShowSnapshot & {
  eligible: boolean;
  /** Everything but the cutoff qualifies — the cutoff has passed. */
  closed: boolean;
  /** Plain-language status for the admin. */
  reason: string;
  cutoff?: string;
  cutoffAt?: string;
  cutoffLabel?: string;
  instructions?: string;
};

/**
 * Eligible only when the show is confirmed, falls within the next two
 * calendar months, has merch pickup on, and its pickup order cutoff hasn't
 * passed — all read in the show's own timezone. Canceled and past shows never
 * qualify, and a show without a timezone or cutoff can't be evaluated, so it
 * stays closed rather than guessing.
 */
export function checkShowPickup(show: KydShow, now: Date): ShowPickupCheck {
  const base = snapshotOfShow(show);
  const no = (reason: string): ShowPickupCheck => ({ ...base, eligible: false, closed: false, reason });

  if (show.status === "canceled") return no("Canceled");
  if (show.status !== "confirmed") return no("Not marked confirmed");
  if (!isValidTimeZone(show.timezone)) return no("No timezone set");

  const today = localDateIn(show.timezone, now);
  if (show.date < today) return no("Already happened");
  if (show.date > addCalendarMonths(today, PICKUP_WINDOW_MONTHS)) return no("More than two months away");

  const pickup = show.merchPickup;
  if (!pickup?.enabled) return no("Merch pickup is off");
  if (!pickup.cutoff) return no("No pickup order cutoff set");
  const cutoffAt = zonedTimeToInstant(pickup.cutoff, show.timezone);
  if (!cutoffAt) return no("Pickup cutoff isn't a valid time");

  const detail = {
    cutoff: pickup.cutoff,
    cutoffAt: cutoffAt.toISOString(),
    cutoffLabel: cutoffLabel(pickup.cutoff, show.timezone),
    instructions: pickup.instructions ?? "",
  };
  if (now.getTime() >= cutoffAt.getTime()) {
    return { ...base, ...detail, eligible: false, closed: true, reason: "Pickup order cutoff has passed" };
  }
  return { ...base, ...detail, eligible: true, closed: false, reason: "Open for pickup orders" };
}

export type PickupAvailability = {
  state: "available" | "closed" | "unavailable";
  /** Open shows, soonest first. */
  shows: ShowPickupCheck[];
  /** The soonest show whose cutoff passed, when nothing is open. */
  closedShow?: ShowPickupCheck;
  /** Every show, checked — for the admin. */
  checks: ShowPickupCheck[];
};

const byDate = (a: ShowPickupCheck, b: ShowPickupCheck) => a.date.localeCompare(b.date);

export function pickupAvailability(now = new Date(), shows: KydShow[] = getKydContent().shows): PickupAvailability {
  const checks = shows.map((show) => checkShowPickup(show, now));
  const open = checks.filter((c) => c.eligible).sort(byDate);
  if (open.length) return { state: "available", shows: open, checks };
  const closed = checks.filter((c) => c.closed).sort(byDate);
  if (closed.length) return { state: "closed", shows: [], closedShow: closed[0], checks };
  return { state: "unavailable", shows: [], checks };
}

// ---------------------------------------------------------------------------
// Shipping
// ---------------------------------------------------------------------------

/** USPS state, territory and military codes. */
const US_REGION_CODES = new Set(
  (
    "AL AK AZ AR CA CO CT DE FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS MO MT NE NV NH NJ NM NY NC " +
    "ND OH OK OR PA RI SC SD TN TX UT VT VA WA WV WI WY DC PR VI GU AS MP AA AE AP"
  ).split(" "),
);

function countryName(code: string): string {
  try {
    return new Intl.DisplayNames(["en"], { type: "region" }).of(code) ?? code;
  } catch {
    return code;
  }
}

export function shippingAvailable(current = settings): boolean {
  return current.shippingCountries.length > 0 && Boolean(current.shipsAfterDate);
}

/** "United States (excluding AK, HI)" — built only from what's configured. */
export function shippingRegionLabel(current = settings): string {
  if (!current.shippingCountries.length) return "";
  const countries = current.shippingCountries.map(countryName).join(", ");
  return current.excludedRegions.length ? `${countries} (excluding ${current.excludedRegions.join(", ")})` : countries;
}

export type AddressInput = {
  line1?: unknown;
  line2?: unknown;
  city?: unknown;
  state?: unknown;
  postalCode?: unknown;
  country?: unknown;
};

export type ShippingAddress = {
  line1: string;
  line2?: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
};

/**
 * Checks a shipping address. `showMerchShips` applies the offer's rules —
 * the configured region, plus US state and ZIP formats; without it, the shop's
 * existing rules apply unchanged, so other products keep shipping as before.
 */
export function validateShippingAddress(
  input: AddressInput | undefined | null,
  showMerchShips: boolean,
  current = settings,
): { ok: true; address: ShippingAddress } | { ok: false; error: string } {
  const a = input ?? {};
  const line1 = str(a.line1);
  const line2 = str(a.line2);
  const city = str(a.city);
  const state = str(a.state).toUpperCase();
  const postalCode = str(a.postalCode);
  const country = (str(a.country) || "US").toUpperCase();

  if (!line1 || !city || !state || !postalCode) return { ok: false, error: "Complete the shipping address." };
  if (!/^[A-Z]{2}$/.test(country)) return { ok: false, error: "Use the 2-letter country code (e.g. US)." };

  if (showMerchShips) {
    if (!current.shippingCountries.includes(country)) {
      return { ok: false, error: `Shipping for show merch goes to ${shippingRegionLabel(current)} only.` };
    }
    if (country === "US") {
      if (!US_REGION_CODES.has(state)) return { ok: false, error: "Use the 2-letter state code (e.g. OK)." };
      if (!/^\d{5}(-\d{4})?$/.test(postalCode)) return { ok: false, error: "Enter a 5-digit ZIP code." };
    }
    if (current.excludedRegions.includes(state)) {
      return { ok: false, error: `Show merch can't ship to ${state}. ${shippingRegionLabel(current)} only.` };
    }
  }

  return {
    ok: true,
    address: { line1, line2: line2 || undefined, city, state, postalCode, country },
  };
}

// ---------------------------------------------------------------------------
// What customers see
// ---------------------------------------------------------------------------

function publicShow(check: ShowPickupCheck) {
  return {
    id: check.id,
    name: check.name,
    date: check.date,
    dateLabel: dateLabel(check.date),
    location: check.location,
    cutoffLabel: check.cutoffLabel ?? "",
    instructions: check.instructions ?? "",
  };
}

export type PublicShowMerch = ReturnType<typeof publicShowMerch>;

/** Everything the shop needs to render the two options. Re-checked on the server before payment. */
export function publicShowMerch(now = new Date()) {
  const current = settings;
  const availability = pickupAvailability(now);
  const canShip = shippingAvailable(current);
  const withShipping = (text: string) => (canShip ? `${text} ${SHIPPING_AVAILABLE_TEXT}` : text);

  return {
    productIds: current.productIds,
    labels: { pickup: PICKUP_OPTION_LABEL, ship: SHIP_OPTION_LABEL },
    bonus: PICKUP_BONUS,
    pickup: {
      state: availability.state,
      shows: availability.shows.map(publicShow),
      closedShow: availability.closedShow ? publicShow(availability.closedShow) : null,
      message:
        availability.state === "available"
          ? ""
          : withShipping(availability.state === "closed" ? PICKUP_CLOSED_TEXT : PICKUP_UNAVAILABLE_TEXT),
      missedPickupPolicy: current.missedPickupPolicy,
    },
    shipping: {
      available: canShip,
      shipsAfter: current.shipsAfterDate,
      shipsAfterLabel: current.shipsAfterDate ? dateLabel(current.shipsAfterDate) : "",
      dispatchEstimate: current.dispatchEstimate,
      regionLabel: shippingRegionLabel(current),
      countries: current.shippingCountries,
      excludedRegions: current.excludedRegions,
    },
    checkedAt: now.toISOString(),
  };
}

// ---------------------------------------------------------------------------
// Checkout
// ---------------------------------------------------------------------------

export type FulfillmentChoice = { method?: unknown; showId?: unknown } | null | undefined;

export type FulfillmentPlan = {
  /** Show merch products in the cart. */
  showMerchIds: string[];
  /** Everything else in the cart — it ships the way it always has. */
  otherIds: string[];
  /** For the show merch lines; null when the cart has none. */
  method: FulfillmentMethod | null;
  /** Pickup only. */
  show: ShowPickupCheck | null;
  /** An address is required: show merch ships, or other items do. */
  needsAddress: boolean;
  /** Show merch ships, so the configured shipping region applies. */
  showMerchShips: boolean;
};

export type PlanFailure = { status: number; code: string; error: string };

/**
 * Decides fulfillment for a cart from the customer's explicit choice,
 * re-checking eligibility against the clock and the current show settings.
 * It never picks for the customer: an unavailable choice is reported back,
 * not quietly swapped for the other one.
 */
export function planFulfillment(
  productIds: string[],
  choice: FulfillmentChoice,
  now = new Date(),
): { ok: true; plan: FulfillmentPlan } | ({ ok: false } & PlanFailure) {
  const current = settings;
  const showMerchIds = productIds.filter((id) => isShowMerchProduct(id, current));
  const otherIds = productIds.filter((id) => !isShowMerchProduct(id, current));

  if (!showMerchIds.length) {
    return {
      ok: true,
      plan: { showMerchIds, otherIds, method: null, show: null, needsAddress: true, showMerchShips: false },
    };
  }

  const method = choice?.method === "pickup" || choice?.method === "ship" ? choice.method : null;
  if (!method) {
    return {
      ok: false,
      status: 400,
      code: "FULFILLMENT_REQUIRED",
      error: `Choose “${PICKUP_OPTION_LABEL}” or “${SHIP_OPTION_LABEL}” to check out.`,
    };
  }

  if (method === "ship") {
    if (!shippingAvailable(current)) {
      return { ok: false, status: 409, code: "SHIPPING_UNAVAILABLE", error: "Shipping for show merch isn't available yet." };
    }
    return {
      ok: true,
      plan: { showMerchIds, otherIds, method, show: null, needsAddress: true, showMerchShips: true },
    };
  }

  const availability = pickupAvailability(now);
  const switchPrompt = shippingAvailable(current)
    ? ` Choose “${SHIP_OPTION_LABEL}” and enter your address to continue.`
    : "";
  if (availability.state !== "available") {
    const why = availability.state === "closed" ? PICKUP_CLOSED_TEXT : PICKUP_UNAVAILABLE_TEXT;
    return { ok: false, status: 409, code: "PICKUP_UNAVAILABLE", error: `${why}${switchPrompt}` };
  }

  const showId = typeof choice?.showId === "string" ? choice.showId : "";
  let show: ShowPickupCheck | undefined;
  if (showId) {
    show = availability.shows.find((s) => s.id === showId);
    if (!show) {
      const named = availability.checks.find((c) => c.id === showId);
      return {
        ok: false,
        status: 409,
        code: "PICKUP_UNAVAILABLE",
        error: `Pickup orders for ${named ? named.name : "that show"} have closed.${
          availability.shows.length ? " Choose another show, or ship after the show." : switchPrompt
        }`,
      };
    }
  } else if (availability.shows.length === 1) {
    show = availability.shows[0];
  } else {
    return { ok: false, status: 400, code: "SHOW_REQUIRED", error: "Choose which show you’ll pick up at." };
  }

  return {
    ok: true,
    plan: { showMerchIds, otherIds, method, show, needsAddress: otherIds.length > 0, showMerchShips: false },
  };
}

/** The fulfillment saved on one order line. */
export function lineFulfillment(productId: string, plan: FulfillmentPlan, current = settings): SaleFulfillment {
  if (!plan.method || !plan.showMerchIds.includes(productId)) return { method: "ship" };
  if (plan.method === "pickup" && plan.show) {
    const { id, name, date, location, timezone } = plan.show;
    return { method: "pickup", showMerch: true, show: { id, name, date, location, timezone }, bonus: PICKUP_BONUS };
  }
  return {
    method: "ship",
    showMerch: true,
    shipsAfter: current.shipsAfterDate || undefined,
    dispatchEstimate: current.dispatchEstimate || undefined,
  };
}

// ---------------------------------------------------------------------------
// Launch readiness, for the admin
// ---------------------------------------------------------------------------

export type ReadinessItem = { key: string; ok: boolean; label: string };

export function showMerchReadiness(productTitles: Map<string, string>, now = new Date()): ReadinessItem[] {
  const current = settings;
  const availability = pickupAvailability(now);
  const missingProducts = current.productIds.filter((id) => !productTitles.has(id));
  return [
    {
      key: "products",
      ok: current.productIds.length > 0 && missingProducts.length === 0,
      label: current.productIds.length
        ? missingProducts.length
          ? `Show merch includes ids with no matching product: ${missingProducts.join(", ")}`
          : `Show merch products: ${current.productIds.map((id) => productTitles.get(id) ?? id).join(", ")}`
        : "Choose which products are show merch",
    },
    {
      key: "shippingRegion",
      ok: current.shippingCountries.length > 0,
      label: current.shippingCountries.length
        ? `Ships to ${shippingRegionLabel(current)}`
        : "Set the eligible shipping region",
    },
    {
      key: "shipsAfter",
      ok: Boolean(current.shipsAfterDate),
      label: current.shipsAfterDate ? `Ships after ${dateLabel(current.shipsAfterDate)}` : "Set the date shipping orders go out after",
    },
    {
      key: "dispatchEstimate",
      ok: Boolean(current.dispatchEstimate),
      label: current.dispatchEstimate ? `Dispatch estimate: “${current.dispatchEstimate}”` : "Add a dispatch estimate",
    },
    {
      key: "missedPickupPolicy",
      ok: Boolean(current.missedPickupPolicy),
      label: current.missedPickupPolicy ? "Missed-pickup policy is set" : "Add a missed-pickup policy",
    },
    {
      key: "pickupShow",
      ok: availability.state === "available",
      label:
        availability.state === "available"
          ? `Pickup open for ${availability.shows.map((s) => s.name).join(", ")}`
          : availability.state === "closed"
          ? `Pickup closed for ${availability.closedShow?.name ?? "the upcoming show"} (cutoff passed)`
          : "No show is open for pickup — see Live dates in the KYD tab",
    },
  ];
}
