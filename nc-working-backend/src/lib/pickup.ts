import { getKydContent, isValidTimeZone, type KydShow } from "./siteContent.js";
import type { SaleFulfillment, ShowSnapshot } from "./types.js";

/**
 * Show pickup: an extra delivery option at checkout. Instead of shipping, a
 * customer can collect the whole order at a KYD show.
 *
 * It's turned on per show, on the show's row under Live dates in the admin
 * (KydShow.merchPickup: on/off, order cutoff, pickup hours, location,
 * instructions, bonus, missed-pickup policy). Nothing else needs setting up:
 * no product is flagged, and the price is the same either way.
 *
 * Each show sets its own delivery: ship only (pickup off), ship or pick up, or
 * pickup only (merchPickup.shipping = "off"), which withholds shipping while
 * that show's pickup is open.
 *
 * A show offers pickup only when it is confirmed, has a timezone, falls within
 * the next two calendar months, has pickup on with hours and instructions
 * written, and its order cutoff hasn't passed — all read in the show's own
 * timezone. Nothing is defaulted: a missing setting keeps pickup off.
 */

export const PICKUP_WINDOW_MONTHS = 2;
export const PICKUP_LABEL = "Pick up at the show";
export const SHIP_LABEL = "Ship to me";

const NOT_OPEN_TEXT = "Pickup opens when the show is within two months.";
const CLOSED_TEXT = "Pickup orders for this show have closed.";
const PICKUP_ONLY_TEXT = "This drop is pickup only — collect it at the show.";

// ---------------------------------------------------------------------------
// Time, in a show's own timezone
// ---------------------------------------------------------------------------

const pad = (n: number) => String(n).padStart(2, "0");

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

/** "Tue, Sep 15, 11:59 PM CDT" */
export function cutoffLabel(local: string, timeZone: string): string {
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
// Eligibility
// ---------------------------------------------------------------------------

/** The location customers see: the pickup spot when one is set, else venue · city. */
export function showLocation(show: KydShow): string {
  return show.merchPickup?.location || [show.venue, show.city].filter(Boolean).join(" · ");
}

export function snapshotOfShow(show: KydShow): ShowSnapshot {
  return { id: show.id, name: show.title, date: show.date, location: showLocation(show), timezone: show.timezone };
}

export type ShowPickupCheck = ShowSnapshot & {
  eligible: boolean;
  /** Everything else qualifies, but the cutoff has passed. */
  closed: boolean;
  /** This show is set to pickup only: no shipping while its pickup is open. */
  pickupOnly: boolean;
  /** Plain-language status for the admin. */
  reason: string;
  cutoffAt?: string;
  cutoffLabel?: string;
  hours?: string;
  instructions?: string;
  bonus?: string;
  missedPolicy?: string;
};

export function checkShowPickup(show: KydShow, now: Date): ShowPickupCheck {
  const pickup = show.merchPickup;
  const base: ShowPickupCheck = {
    ...snapshotOfShow(show),
    eligible: false,
    closed: false,
    pickupOnly: pickup?.shipping === "off",
    reason: "",
    hours: pickup?.hours,
    instructions: pickup?.instructions,
    bonus: pickup?.bonus,
    missedPolicy: pickup?.missedPolicy,
  };
  const no = (reason: string): ShowPickupCheck => ({ ...base, reason });

  if (!pickup?.enabled) return no("Pickup is off");
  if (show.status === "canceled") return no("Canceled");
  if (show.status !== "confirmed") return no("Not marked confirmed");
  if (!isValidTimeZone(show.timezone)) return no("No timezone set");

  const today = localDateIn(show.timezone, now);
  if (show.date < today) return no("Already happened");
  if (!pickup.cutoff) return no("No pickup order cutoff set");
  const cutoffAt = zonedTimeToInstant(pickup.cutoff, show.timezone);
  if (!cutoffAt) return no("Pickup cutoff isn't a valid time");
  if (!pickup.hours) return no("Pickup hours missing");
  if (!pickup.instructions) return no("Pickup instructions missing");

  const detail = { cutoffAt: cutoffAt.toISOString(), cutoffLabel: cutoffLabel(pickup.cutoff, show.timezone) };
  if (now.getTime() >= cutoffAt.getTime()) {
    return { ...base, ...detail, closed: true, reason: "Pickup order cutoff has passed" };
  }
  if (show.date > addCalendarMonths(today, PICKUP_WINDOW_MONTHS)) {
    return { ...base, ...detail, reason: "More than two months away" };
  }
  return {
    ...base,
    ...detail,
    eligible: true,
    reason: base.pickupOnly ? "Open for pickup orders · no shipping" : "Open for pickup orders",
  };
}

export type PickupAvailability = {
  state: "available" | "closed" | "unavailable";
  /** Open shows, soonest first. */
  shows: ShowPickupCheck[];
  /** The soonest show whose cutoff passed, when nothing is open. */
  closedShow?: ShowPickupCheck;
  /** Every show with pickup turned on, checked — for the admin. */
  checks: ShowPickupCheck[];
  /** False only while pickup is open and every open show is pickup only. */
  shipAllowed: boolean;
};

const byDate = (a: ShowPickupCheck, b: ShowPickupCheck) => a.date.localeCompare(b.date);

/**
 * Shipping is only ever withheld while pickup is genuinely open, and only when
 * no open show still offers it. So a passed cutoff, a canceled show or a show
 * that has been and gone all bring shipping back by themselves — the piece
 * can't be left with no way to buy it.
 */
function shippingAllowed(open: ShowPickupCheck[]): boolean {
  return open.length === 0 || open.some((show) => !show.pickupOnly);
}

export function pickupAvailability(now = new Date(), shows: KydShow[] = getKydContent().shows): PickupAvailability {
  const checks = shows.map((show) => checkShowPickup(show, now));
  const open = checks.filter((c) => c.eligible).sort(byDate);
  if (open.length) return { state: "available", shows: open, checks, shipAllowed: shippingAllowed(open) };
  const closed = checks.filter((c) => c.closed).sort(byDate);
  if (closed.length) return { state: "closed", shows: [], closedShow: closed[0], checks, shipAllowed: true };
  return { state: "unavailable", shows: [], checks, shipAllowed: true };
}

function publicShow(check: ShowPickupCheck) {
  return {
    id: check.id,
    name: check.name,
    date: check.date,
    dateLabel: dateLabel(check.date),
    location: check.location,
    cutoffLabel: check.cutoffLabel ?? "",
    hours: check.hours ?? "",
    instructions: check.instructions ?? "",
    bonus: check.bonus ?? "",
    missedPolicy: check.missedPolicy ?? "",
  };
}

export type PublicPickup = ReturnType<typeof publicPickup>;

/** What checkout needs to offer pickup. Checked again on the server right before payment. */
export function publicPickup(now = new Date()) {
  const availability = pickupAvailability(now);
  return {
    labels: { pickup: PICKUP_LABEL, ship: SHIP_LABEL },
    state: availability.state,
    shows: availability.shows.map(publicShow),
    closedShow: availability.closedShow ? publicShow(availability.closedShow) : null,
    message: availability.state === "available" ? "" : availability.state === "closed" ? CLOSED_TEXT : NOT_OPEN_TEXT,
    /** False means checkout must not offer shipping: this drop is pickup only. */
    shipAllowed: availability.shipAllowed,
    shipMessage: availability.shipAllowed ? "" : PICKUP_ONLY_TEXT,
    checkedAt: now.toISOString(),
  };
}

// ---------------------------------------------------------------------------
// Checkout
// ---------------------------------------------------------------------------

export type PickupChoice = { method?: unknown; showId?: unknown } | null | undefined;

/**
 * Shipping unless the customer chose pickup. A pickup choice is re-checked
 * against the clock and the show's settings; if it no longer holds, it's
 * reported back — never quietly turned into shipping.
 */
export function planPickup(
  choice: PickupChoice,
  now = new Date(),
): { ok: true; pickup: ShowPickupCheck | null } | { ok: false; status: number; code: string; error: string } {
  if (choice?.method !== "pickup") {
    // Shipping, while an open show is pickup only. Checkout hides shipping in
    // that case, so this catches a stale page or a request that skipped it —
    // including the wallet sheet, which always asks to ship.
    const availability = pickupAvailability(now);
    if (!availability.shipAllowed) {
      return {
        ok: false,
        status: 409,
        code: "SHIPPING_UNAVAILABLE",
        error: `${PICKUP_ONLY_TEXT} Choose “${PICKUP_LABEL}” to continue.`,
      };
    }
    return { ok: true, pickup: null };
  }

  const availability = pickupAvailability(now);
  const switchPrompt = ` Choose “${SHIP_LABEL}” to continue.`;
  if (availability.state !== "available") {
    const why = availability.state === "closed" ? CLOSED_TEXT : "Pickup isn't available for this order.";
    return { ok: false, status: 409, code: "PICKUP_UNAVAILABLE", error: `${why}${switchPrompt}` };
  }

  const showId = typeof choice.showId === "string" ? choice.showId : "";
  if (showId) {
    const show = availability.shows.find((s) => s.id === showId);
    if (show) return { ok: true, pickup: show };
    const named = availability.checks.find((c) => c.id === showId);
    return {
      ok: false,
      status: 409,
      code: "PICKUP_UNAVAILABLE",
      error: `Pickup orders for ${named ? named.name : "that show"} have closed.${availability.shows.length ? " Choose another show, or ship it." : switchPrompt}`,
    };
  }
  if (availability.shows.length === 1) return { ok: true, pickup: availability.shows[0] };
  return { ok: false, status: 400, code: "SHOW_REQUIRED", error: "Choose which show you’ll pick up at." };
}

/** Saved on every order line: what the customer was told about their pickup, as told. */
export function pickupFulfillment(pickup: ShowPickupCheck | null): SaleFulfillment {
  if (!pickup) return { method: "ship" };
  const { id, name, date, location, timezone } = pickup;
  return {
    method: "pickup",
    show: { id, name, date, location, timezone },
    bonus: pickup.bonus || undefined,
    pickupHours: pickup.hours || undefined,
    pickupInstructions: pickup.instructions || undefined,
    missedPickupPolicy: pickup.missedPolicy || undefined,
  };
}

// ---------------------------------------------------------------------------
// Addresses (the shop's own rules)
// ---------------------------------------------------------------------------

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

const str = (value: unknown) => (typeof value === "string" ? value.trim() : "");

export function validateShippingAddress(
  input: AddressInput | undefined | null,
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
  return { ok: true, address: { line1, line2: line2 || undefined, city, state, postalCode, country } };
}
