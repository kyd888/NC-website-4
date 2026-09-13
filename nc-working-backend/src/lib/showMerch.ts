import fs from "fs";
import path from "path";
import { createHash, randomUUID } from "crypto";
import { dbEnabled, dbQuery, logDbError } from "./db.js";
import { getKydContent, isValidTimeZone, type KydShow } from "./siteContent.js";
import { getAllRemaining, getCurrentDrop, getProduct, listCatalog } from "./inventory.js";
import { sizesForProduct } from "./sizing.js";
import type { CatalogItem, FulfillmentMethod, SaleFulfillment, ShowSnapshot } from "./types.js";

/**
 * Show merch: products a customer can pick up at a KYD show (with a bonus
 * thrown in) or have shipped after the show, at the same price either way.
 *
 * Everything is organised as *setups*. A setup ties one existing show to some
 * catalog products and carries the offer's fulfillment settings: shipping
 * region and timing, pickup bonus, missed-pickup policy, per-product order
 * cutoffs. Shows, products and drops keep living where they always have (KYD
 * content, the catalog, the drop controls) — a setup only points at them, so
 * nothing is stored twice.
 *
 * A setup sells nothing until it is published, and it can't be published
 * until its required fields are filled, nothing customer-facing still reads
 * as a test placeholder, and each group of settings has been approved after
 * its last change. The storefront and checkout only ever read published
 * setups; the admin can preview an unpublished one.
 *
 * Nothing operational is defaulted. A blank setting stays blank, and whatever
 * needs it stays switched off until someone fills it in.
 */

export type ApprovalKey = "show" | "products" | "prices" | "pickup" | "shipping";
export const APPROVAL_KEYS: ApprovalKey[] = ["show", "products", "prices", "pickup", "shipping"];

export type ShowMerchSetup = {
  id: string;
  /** Admin-facing name, e.g. "Wheeler · Sep 2026". */
  name: string;
  /** The KydShow this setup sells for. Empty on a fresh draft or a duplicate. */
  showId: string;
  /** Catalog product ids sold under this setup. Everything else keeps its normal checkout. */
  productIds: string[];
  /** Per-product pickup order cutoff (YYYY-MM-DDTHH:mm in the show's timezone), overriding the show's. */
  productCutoffs: Record<string, string>;
  /** Shows further out than this (calendar months, in the show's timezone) don't open pickup yet. */
  pickupWindowMonths: number;
  /** What comes with a pickup order. The badge reads "<bonus> included". */
  pickupBonus: string;
  /** Standard shipping is built into the product price: delivery adds nothing. */
  shippingIncluded: boolean;
  /** Charged per order for delivery when shipping is not included. */
  shippingFeeCents: number;
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
  /**
   * Approval per settings group: the fingerprint of that group's fields at the
   * moment someone approved it. Approval only counts while the fields still
   * match, so any later edit (here or on the show or the product) asks for a
   * fresh review. Empty = never approved.
   */
  approvals: Record<ApprovalKey, string>;
  /** Approved for launch: the storefront reads it. */
  published: boolean;
  createdAt: string;
  updatedAt: string;
  /** Set on a duplicate, for the record. */
  copiedFrom?: string;
};

export const PICKUP_OPTION_LABEL = "Show pickup";
export const SHIP_OPTION_LABEL = "Ship after the show";
export const DEFAULT_PICKUP_BONUS = "Sticker pack";
export const DEFAULT_PICKUP_WINDOW_MONTHS = 2;

const PICKUP_CLOSED_TEXT = "Pickup orders for this show have closed.";
const SHIPPING_AVAILABLE_TEXT = "Shipping is available.";

const DATA_DIR = path.resolve(process.env.DATA_DIR || "data");
const SETTINGS_FILE = path.join(DATA_DIR, "show-merch.json");
const CONTENT_ID = "show-merch";

let setups: ShowMerchSetup[] = [];

// ---------------------------------------------------------------------------
// Small helpers
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

const NUMBER_WORDS = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve"];
function monthsLabel(n: number): string {
  const word = NUMBER_WORDS[n] ?? String(n);
  return `${word} month${n === 1 ? "" : "s"}`;
}

const LOCAL_MINUTE = /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})(?::\d{2})?$/;
function localMinute(value: unknown): string {
  const m = LOCAL_MINUTE.exec(str(value));
  return m ? `${m[1]}T${m[2]}:${m[3]}` : "";
}

/** "Open for pickup orders (closed for: Ticket Tee)" needs product names. */
function titleOf(productId: string): string {
  return getProduct(productId)?.title ?? productId;
}

function joinNames(names: string[]): string {
  if (names.length <= 1) return names[0] ?? "";
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

// ---------------------------------------------------------------------------
// Placeholders: test text must never reach a customer
// ---------------------------------------------------------------------------

const PLACEHOLDER_PATTERNS = [
  /\[[^\]]*\]/, // "[Pickup instructions go here]"
  /\b(tbd|tba|todo|lorem|ipsum|placeholder|dummy|sample text|test product|test show|test venue|xxx+)\b/i,
  /\bgoes? here\b/i,
  /\(test\)/i,
  /\?\?\?/,
];

/** True when text reads like something typed to fill a gap, not to be published. */
export function looksLikePlaceholder(value: string | undefined | null): boolean {
  const text = (value ?? "").trim();
  if (!text) return false;
  return PLACEHOLDER_PATTERNS.some((pattern) => pattern.test(text));
}

// ---------------------------------------------------------------------------
// Setups: sanitize, store
// ---------------------------------------------------------------------------

function emptyApprovals(): Record<ApprovalKey, string> {
  return { show: "", products: "", prices: "", pickup: "", shipping: "" };
}

export function sanitizeSetup(input: unknown, existing?: ShowMerchSetup): ShowMerchSetup {
  const r = (input && typeof input === "object" ? input : {}) as Record<string, unknown>;
  const now = new Date().toISOString();
  const productIds = list(r.productIds).slice(0, 50);
  const cutoffs: Record<string, string> = {};
  if (r.productCutoffs && typeof r.productCutoffs === "object") {
    for (const [productId, value] of Object.entries(r.productCutoffs as Record<string, unknown>)) {
      const cutoff = localMinute(value);
      if (cutoff && productIds.includes(productId)) cutoffs[productId] = cutoff;
    }
  }
  const windowRaw = Number(r.pickupWindowMonths);
  const shipsAfterDate = str(r.shipsAfterDate);
  const approvals = emptyApprovals();
  if (r.approvals && typeof r.approvals === "object") {
    for (const key of APPROVAL_KEYS) {
      const value = (r.approvals as Record<string, unknown>)[key];
      if (typeof value === "string" && /^[a-f0-9]{10}$/.test(value)) approvals[key] = value;
    }
  }
  const feeRaw = Number(r.shippingFeeCents);
  return {
    id: existing?.id ?? (str(r.id) || `setup-${randomUUID().slice(0, 8)}`),
    name: str(r.name).slice(0, 80) || existing?.name || "Untitled setup",
    showId: str(r.showId).slice(0, 120),
    productIds,
    productCutoffs: cutoffs,
    pickupWindowMonths:
      Number.isFinite(windowRaw) && windowRaw >= 1 && windowRaw <= 12 ? Math.floor(windowRaw) : DEFAULT_PICKUP_WINDOW_MONTHS,
    pickupBonus: str(r.pickupBonus).slice(0, 60),
    shippingIncluded: r.shippingIncluded !== false,
    shippingFeeCents: Number.isFinite(feeRaw) && feeRaw >= 0 ? Math.min(100000, Math.round(feeRaw)) : 0,
    shippingCountries: list(r.shippingCountries, (c) => c.toUpperCase()).filter((c) => /^[A-Z]{2}$/.test(c)),
    excludedRegions: list(r.excludedRegions, (c) => c.toUpperCase()).filter((c) => /^[A-Z0-9-]{1,6}$/.test(c)),
    shipsAfterDate: /^\d{4}-\d{2}-\d{2}$/.test(shipsAfterDate) ? shipsAfterDate : "",
    dispatchEstimate: str(r.dispatchEstimate).slice(0, 300),
    missedPickupPolicy: str(r.missedPickupPolicy).slice(0, 500),
    approvals,
    published: r.published === true,
    createdAt: existing?.createdAt ?? (str(r.createdAt) || now),
    updatedAt: now,
    ...(existing?.copiedFrom || str(r.copiedFrom) ? { copiedFrom: existing?.copiedFrom ?? str(r.copiedFrom) } : {}),
  };
}

function sanitizeStore(input: unknown): ShowMerchSetup[] {
  const r = (input && typeof input === "object" ? input : {}) as Record<string, unknown>;
  const raw = Array.isArray(r.setups) ? r.setups : [];
  const out: ShowMerchSetup[] = [];
  for (const entry of raw) {
    const setup = sanitizeSetup(entry);
    if (!out.some((s) => s.id === setup.id)) out.push(setup);
  }
  return out;
}

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

export function listSetups(): ShowMerchSetup[] {
  return clone(setups);
}

export function getSetup(id: string): ShowMerchSetup | undefined {
  const found = setups.find((s) => s.id === id);
  return found ? clone(found) : undefined;
}

export async function loadShowMerchSettings() {
  if (dbEnabled) {
    try {
      const rows = await dbQuery("SELECT data FROM site_content WHERE id = $1 LIMIT 1", [CONTENT_ID]);
      setups = sanitizeStore(rows.rows[0]?.data ?? {});
    } catch (error) {
      logDbError("show-merch:load", error);
    }
    return;
  }
  try {
    if (fs.existsSync(SETTINGS_FILE)) {
      setups = sanitizeStore(JSON.parse(fs.readFileSync(SETTINGS_FILE, "utf8") || "{}"));
    }
  } catch (error) {
    console.error("[show-merch] could not read settings:", error);
  }
}

async function persist() {
  const payload = { setups };
  if (dbEnabled) {
    await dbQuery(
      `INSERT INTO site_content (id, data, updated_at) VALUES ($1, $2::jsonb, now())
       ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data, updated_at = now()`,
      [CONTENT_ID, JSON.stringify(payload)],
    );
  } else {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(SETTINGS_FILE, JSON.stringify(payload, null, 2), "utf8");
  }
}

/** Create or replace a setup. Approvals are kept as stored; whether they still count is judged on read. */
export async function saveSetup(input: unknown, id?: string): Promise<ShowMerchSetup> {
  const existing = id ? setups.find((s) => s.id === id) : undefined;
  if (id && !existing) throw new Error("Setup not found");
  const next = sanitizeSetup({ ...(existing ?? {}), ...(input as object), approvals: existing?.approvals ?? emptyApprovals(), published: existing?.published ?? false }, existing);
  if (existing) {
    setups = setups.map((s) => (s.id === existing.id ? next : s));
  } else {
    setups.push(next);
  }
  await persist();
  return clone(next);
}

export async function deleteSetup(id: string): Promise<boolean> {
  const before = setups.length;
  setups = setups.filter((s) => s.id !== id);
  if (setups.length === before) return false;
  await persist();
  return true;
}

/**
 * A copy for another show: everything about the offer comes along, but it
 * starts unpublished with no show, no approvals and no date-bound values —
 * so someone has to pick the show, re-enter the dates and re-approve every
 * group before it can sell anything.
 */
export async function duplicateSetup(id: string): Promise<ShowMerchSetup | undefined> {
  const source = setups.find((s) => s.id === id);
  if (!source) return undefined;
  const copy = sanitizeSetup({
    ...source,
    id: `setup-${randomUUID().slice(0, 8)}`,
    name: `Copy of ${source.name}`.slice(0, 80),
    showId: "",
    productCutoffs: {},
    shipsAfterDate: "",
    approvals: emptyApprovals(),
    published: false,
    copiedFrom: source.id,
    createdAt: "",
  });
  setups.push(copy);
  await persist();
  return clone(copy);
}

export async function setSetupApproval(id: string, key: ApprovalKey, approved: boolean): Promise<ShowMerchSetup | undefined> {
  const setup = setups.find((s) => s.id === id);
  if (!setup) return undefined;
  setup.approvals[key] = approved ? groupFingerprint(setup, key) : "";
  setup.updatedAt = new Date().toISOString();
  await persist();
  return clone(setup);
}

export async function setSetupPublished(id: string, published: boolean): Promise<{ ok: true; setup: ShowMerchSetup } | { ok: false; error: string; blockers: ChecklistItem[] }> {
  const setup = setups.find((s) => s.id === id);
  if (!setup) return { ok: false, error: "Setup not found", blockers: [] };
  if (published) {
    const blockers = publishBlockers(setup);
    if (blockers.length) {
      return { ok: false, error: "This setup isn't ready to publish yet.", blockers };
    }
  }
  setup.published = published;
  setup.updatedAt = new Date().toISOString();
  await persist();
  return { ok: true, setup: clone(setup) };
}

// ---------------------------------------------------------------------------
// Which setups are live
// ---------------------------------------------------------------------------

export type ActiveOptions = {
  /** Treat these setups as published too — the admin's preview of a draft. */
  includeSetupIds?: string[];
};

function activeSetups(opts: ActiveOptions = {}): ShowMerchSetup[] {
  const include = new Set(opts.includeSetupIds ?? []);
  return setups.filter((s) => s.published || include.has(s.id));
}

function showOf(setup: ShowMerchSetup, shows: KydShow[] = getKydContent().shows): KydShow | undefined {
  return setup.showId ? shows.find((s) => s.id === setup.showId) : undefined;
}

export function isShowMerchProduct(productId: string, opts: ActiveOptions = {}): boolean {
  return activeSetups(opts).some((s) => s.productIds.includes(productId));
}

/**
 * The setup whose shipping and bonus the storefront quotes: the published one
 * with the soonest show that hasn't happened, else the soonest of the rest.
 */
export function primarySetup(now = new Date(), opts: ActiveOptions = {}): ShowMerchSetup | undefined {
  const shows = getKydContent().shows;
  const ranked = activeSetups(opts)
    .map((setup) => {
      const show = showOf(setup, shows);
      const past = show && isValidTimeZone(show.timezone) ? show.date < localDateIn(show.timezone, now) : false;
      return { setup, date: show?.date ?? "9999-12-31", past };
    })
    .sort((a, b) => Number(a.past) - Number(b.past) || a.date.localeCompare(b.date));
  return ranked[0]?.setup;
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
// Pickup eligibility
// ---------------------------------------------------------------------------

/** The location customers see: the pickup spot when one is set, else venue · city. */
export function showLocation(show: KydShow): string {
  return show.merchPickup?.location || [show.venue, show.city].filter(Boolean).join(" · ");
}

export function snapshotOfShow(show: KydShow): ShowSnapshot {
  return {
    id: show.id,
    name: show.title,
    date: show.date,
    location: showLocation(show),
    timezone: show.timezone,
  };
}

export type ProductCutoffCheck = {
  cutoff: string;
  cutoffAt: string;
  cutoffLabel: string;
  closed: boolean;
  /** The product has its own cutoff, not the show's. */
  override: boolean;
};

export type ShowPickupCheck = ShowSnapshot & {
  eligible: boolean;
  /** Everything but the cutoff qualifies — the cutoff has passed (for every product). */
  closed: boolean;
  /** Plain-language status for the admin. */
  reason: string;
  cutoff?: string;
  cutoffAt?: string;
  cutoffLabel?: string;
  hours?: string;
  instructions?: string;
  /** The setup this check was made for, when any. */
  setupId?: string;
  bonus?: string;
  productIds: string[];
  /** Per product, when the setup has products: its effective cutoff and whether it passed. */
  productCutoffs: Record<string, ProductCutoffCheck>;
  closedProductIds: string[];
};

export type PickupCheckOptions = {
  windowMonths?: number;
  setup?: ShowMerchSetup;
};

/**
 * Eligible only when the show is confirmed, falls within the pickup window,
 * has merch pickup on with its essentials filled in, and its pickup order
 * cutoff hasn't passed — all read in the show's own timezone. Canceled and
 * past shows never qualify, and a show without a timezone or cutoff can't be
 * evaluated, so it stays closed rather than guessing. A product with its own
 * cutoff closes on its own schedule; the show stays open for the others.
 */
export function checkShowPickup(show: KydShow, now: Date, options: PickupCheckOptions = {}): ShowPickupCheck {
  const setup = options.setup;
  const windowMonths = options.windowMonths ?? setup?.pickupWindowMonths ?? DEFAULT_PICKUP_WINDOW_MONTHS;
  const base: ShowPickupCheck = {
    ...snapshotOfShow(show),
    eligible: false,
    closed: false,
    reason: "",
    setupId: setup?.id,
    bonus: setup?.pickupBonus || undefined,
    productIds: setup?.productIds ?? [],
    productCutoffs: {},
    closedProductIds: [],
  };
  const no = (reason: string): ShowPickupCheck => ({ ...base, reason });

  if (show.status === "canceled") return no("Canceled");
  if (show.status !== "confirmed") return no("Not marked confirmed");
  if (!isValidTimeZone(show.timezone)) return no("No timezone set");

  const today = localDateIn(show.timezone, now);
  if (show.date < today) return no("Already happened");
  if (show.date > addCalendarMonths(today, windowMonths)) return no(`More than ${monthsLabel(windowMonths)} away`);

  const pickup = show.merchPickup;
  if (!pickup?.enabled) return no("Merch pickup is off");
  if (!pickup.cutoff) return no("No pickup order cutoff set");
  const cutoffAt = zonedTimeToInstant(pickup.cutoff, show.timezone);
  if (!cutoffAt) return no("Pickup cutoff isn't a valid time");
  if (!pickup.hours) return no("Pickup hours missing");
  if (!pickup.instructions) return no("Pickup instructions missing");

  const detail = {
    cutoff: pickup.cutoff,
    cutoffAt: cutoffAt.toISOString(),
    cutoffLabel: cutoffLabel(pickup.cutoff, show.timezone),
    hours: pickup.hours,
    instructions: pickup.instructions,
  };
  const showClosed = now.getTime() >= cutoffAt.getTime();

  // Per product: its own cutoff when the setup gives it one, else the show's.
  const productCutoffs: Record<string, ProductCutoffCheck> = {};
  const closedProductIds: string[] = [];
  for (const productId of base.productIds) {
    const override = setup?.productCutoffs[productId];
    const overrideAt = override ? zonedTimeToInstant(override, show.timezone) : null;
    const at = overrideAt ?? cutoffAt;
    const local = overrideAt ? override! : pickup.cutoff;
    const closed = now.getTime() >= at.getTime();
    productCutoffs[productId] = {
      cutoff: local,
      cutoffAt: at.toISOString(),
      cutoffLabel: cutoffLabel(local, show.timezone),
      closed,
      override: Boolean(overrideAt),
    };
    if (closed) closedProductIds.push(productId);
  }

  const allClosed = base.productIds.length ? closedProductIds.length === base.productIds.length : showClosed;
  if (allClosed) {
    return { ...base, ...detail, productCutoffs, closedProductIds, closed: true, reason: "Pickup order cutoff has passed" };
  }
  const partly = closedProductIds.length ? ` (closed for ${joinNames(closedProductIds.map(titleOf))})` : "";
  return { ...base, ...detail, productCutoffs, closedProductIds, eligible: true, reason: `Open for pickup orders${partly}` };
}

export type PickupAvailability = {
  state: "available" | "closed" | "unavailable";
  /** Open shows, soonest first. */
  shows: ShowPickupCheck[];
  /** The soonest show whose cutoff passed, when nothing is open. */
  closedShow?: ShowPickupCheck;
  /** Every show checked — for the admin. */
  checks: ShowPickupCheck[];
};

const byDate = (a: ShowPickupCheck, b: ShowPickupCheck) => a.date.localeCompare(b.date);

/**
 * Pickup across every active setup: one check per setup, for its show. Two
 * setups pointing at the same show are still two entries, with their own
 * products.
 */
export function pickupAvailability(now = new Date(), opts: ActiveOptions = {}, shows: KydShow[] = getKydContent().shows): PickupAvailability {
  const checks = activeSetups(opts)
    .map((setup) => {
      const show = showOf(setup, shows);
      return show ? checkShowPickup(show, now, { setup }) : null;
    })
    .filter((check): check is ShowPickupCheck => check !== null);
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

export function shippingAvailable(setup: ShowMerchSetup | undefined): boolean {
  return Boolean(setup && setup.shippingCountries.length > 0 && setup.shipsAfterDate);
}

/** "United States (excluding AK, HI)" — built only from what's configured. */
export function shippingRegionLabel(setup: ShowMerchSetup | undefined): string {
  if (!setup || !setup.shippingCountries.length) return "";
  const countries = setup.shippingCountries.map(countryName).join(", ");
  return setup.excludedRegions.length ? `${countries} (excluding ${setup.excludedRegions.join(", ")})` : countries;
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
  setup: ShowMerchSetup | undefined = primarySetup(),
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
    if (!setup || !setup.shippingCountries.includes(country)) {
      return { ok: false, error: `Shipping for show merch goes to ${shippingRegionLabel(setup) || "the listed region"} only.` };
    }
    if (country === "US") {
      if (!US_REGION_CODES.has(state)) return { ok: false, error: "Use the 2-letter state code (e.g. OK)." };
      if (!/^\d{5}(-\d{4})?$/.test(postalCode)) return { ok: false, error: "Enter a 5-digit ZIP code." };
    }
    if (setup.excludedRegions.includes(state)) {
      return { ok: false, error: `Show merch can't ship to ${state}. ${shippingRegionLabel(setup)} only.` };
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
  const productCutoffs: Record<string, { cutoffLabel: string; closed: boolean; override: boolean }> = {};
  for (const [productId, c] of Object.entries(check.productCutoffs)) {
    productCutoffs[productId] = { cutoffLabel: c.cutoffLabel, closed: c.closed, override: c.override };
  }
  return {
    id: check.id,
    name: check.name,
    date: check.date,
    dateLabel: dateLabel(check.date),
    location: check.location,
    timezone: check.timezone ?? "",
    cutoffLabel: check.cutoffLabel ?? "",
    hours: check.hours ?? "",
    instructions: check.instructions ?? "",
    setupId: check.setupId ?? "",
    bonus: check.bonus ?? "",
    productIds: check.productIds,
    productCutoffs,
    closedProductIds: check.closedProductIds,
  };
}

export type PublicShowMerch = ReturnType<typeof publicShowMerch>;

/** Everything the shop needs to render the two options. Re-checked on the server before payment. */
export function publicShowMerch(now = new Date(), opts: ActiveOptions = {}) {
  const active = activeSetups(opts);
  const primary = primarySetup(now, opts);
  const availability = pickupAvailability(now, opts);
  const canShip = shippingAvailable(primary);
  const withShipping = (text: string) => (canShip ? `${text} ${SHIPPING_AVAILABLE_TEXT}` : text);
  const windowMonths = primary?.pickupWindowMonths ?? DEFAULT_PICKUP_WINDOW_MONTHS;
  const unavailableText = `Show pickup opens when an eligible show is within ${monthsLabel(windowMonths)}.`;
  const bonus = primary?.pickupBonus ?? "";
  const included = primary?.shippingIncluded ?? true;
  const feeCents = included ? 0 : primary?.shippingFeeCents ?? 0;

  const products: Record<string, { setupIds: string[] }> = {};
  for (const setup of active) {
    for (const productId of setup.productIds) {
      (products[productId] ??= { setupIds: [] }).setupIds.push(setup.id);
    }
  }

  return {
    productIds: Object.keys(products),
    products,
    labels: { pickup: PICKUP_OPTION_LABEL, ship: SHIP_OPTION_LABEL },
    bonus,
    bonusBadge: bonus ? `${bonus} included` : "",
    /** Delivery costs nothing extra, so both options come to the same total. */
    samePrice: feeCents === 0,
    pickup: {
      state: availability.state,
      shows: availability.shows.map(publicShow),
      closedShow: availability.closedShow ? publicShow(availability.closedShow) : null,
      message:
        availability.state === "available"
          ? ""
          : withShipping(availability.state === "closed" ? PICKUP_CLOSED_TEXT : unavailableText),
      missedPickupPolicy: primary?.missedPickupPolicy ?? "",
      windowMonths,
    },
    shipping: {
      available: canShip,
      shipsAfter: primary?.shipsAfterDate ?? "",
      shipsAfterLabel: primary?.shipsAfterDate ? dateLabel(primary.shipsAfterDate) : "",
      dispatchEstimate: primary?.dispatchEstimate ?? "",
      regionLabel: shippingRegionLabel(primary),
      countries: primary?.shippingCountries ?? [],
      excludedRegions: primary?.excludedRegions ?? [],
      included,
      feeCents,
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
  /** The setup the show merch is sold under; null when the cart has none. */
  setup: ShowMerchSetup | null;
  /** Pickup only. */
  show: ShowPickupCheck | null;
  /** An address is required: show merch ships, or other items do. */
  needsAddress: boolean;
  /** Show merch ships, so the configured shipping region applies. */
  showMerchShips: boolean;
  /** Added to the order total for delivery. Zero when shipping is in the price. */
  shippingFeeCents: number;
};

export type PlanFailure = { status: number; code: string; error: string };

/**
 * Decides fulfillment for a cart from the customer's explicit choice,
 * re-checking eligibility against the clock and the current settings.
 * It never picks for the customer: an unavailable choice is reported back,
 * not quietly swapped for the other one.
 */
export function planFulfillment(
  productIds: string[],
  choice: FulfillmentChoice,
  now = new Date(),
  opts: ActiveOptions = {},
): { ok: true; plan: FulfillmentPlan } | ({ ok: false } & PlanFailure) {
  const showMerchIds = productIds.filter((id) => isShowMerchProduct(id, opts));
  const otherIds = productIds.filter((id) => !isShowMerchProduct(id, opts));
  const primary = primarySetup(now, opts);

  if (!showMerchIds.length) {
    return {
      ok: true,
      plan: { showMerchIds, otherIds, method: null, setup: null, show: null, needsAddress: true, showMerchShips: false, shippingFeeCents: 0 },
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
    if (!primary || !shippingAvailable(primary)) {
      return { ok: false, status: 409, code: "SHIPPING_UNAVAILABLE", error: "Shipping for show merch isn't available yet." };
    }
    return {
      ok: true,
      plan: {
        showMerchIds,
        otherIds,
        method,
        setup: primary,
        show: null,
        needsAddress: true,
        showMerchShips: true,
        shippingFeeCents: primary.shippingIncluded ? 0 : primary.shippingFeeCents,
      },
    };
  }

  const availability = pickupAvailability(now, opts);
  const switchPrompt = shippingAvailable(primary) ? ` Choose “${SHIP_OPTION_LABEL}” and enter your address to continue.` : "";
  if (availability.state !== "available") {
    const windowMonths = primary?.pickupWindowMonths ?? DEFAULT_PICKUP_WINDOW_MONTHS;
    const why =
      availability.state === "closed"
        ? PICKUP_CLOSED_TEXT
        : `Show pickup opens when an eligible show is within ${monthsLabel(windowMonths)}.`;
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

  // Every show merch item in the bag has to be on offer at that show, with its own cutoff still open.
  const notOffered = showMerchIds.filter((id) => !show!.productIds.includes(id));
  if (notOffered.length) {
    return {
      ok: false,
      status: 409,
      code: "PICKUP_UNAVAILABLE",
      error: `${joinNames(notOffered.map(titleOf))} can’t be picked up at ${show.name}.${switchPrompt}`,
    };
  }
  const closedIds = showMerchIds.filter((id) => show!.productCutoffs[id]?.closed);
  if (closedIds.length) {
    return {
      ok: false,
      status: 409,
      code: "PICKUP_UNAVAILABLE",
      error: `Pickup orders for ${joinNames(closedIds.map(titleOf))} have closed for this show.${switchPrompt}`,
    };
  }

  const setup = setups.find((s) => s.id === show!.setupId) ?? primary ?? null;
  return {
    ok: true,
    plan: { showMerchIds, otherIds, method, setup, show, needsAddress: otherIds.length > 0, showMerchShips: false, shippingFeeCents: 0 },
  };
}

/** The fulfillment saved on one order line: everything the customer was told, as told. */
export function lineFulfillment(productId: string, plan: FulfillmentPlan): SaleFulfillment {
  if (!plan.method || !plan.showMerchIds.includes(productId)) return { method: "ship" };
  const setup = plan.setup;
  if (plan.method === "pickup" && plan.show) {
    const { id, name, date, location, timezone } = plan.show;
    return {
      method: "pickup",
      showMerch: true,
      setupId: setup?.id,
      show: { id, name, date, location, timezone },
      bonus: setup?.pickupBonus || undefined,
      pickupHours: plan.show.hours || undefined,
      pickupInstructions: plan.show.instructions || undefined,
      missedPickupPolicy: setup?.missedPickupPolicy || undefined,
    };
  }
  return {
    method: "ship",
    showMerch: true,
    setupId: setup?.id,
    shipsAfter: setup?.shipsAfterDate || undefined,
    dispatchEstimate: setup?.dispatchEstimate || undefined,
    shippingIncluded: setup?.shippingIncluded ?? true,
    shippingFeeCents: plan.shippingFeeCents,
  };
}

// ---------------------------------------------------------------------------
// Readiness, approvals and status — for the admin
// ---------------------------------------------------------------------------

export type SetupStatus = "draft" | "ready" | "selling" | "closed";

export const SETUP_STATUS_LABEL: Record<SetupStatus, string> = {
  draft: "Draft",
  ready: "Ready to launch",
  selling: "Selling",
  closed: "Closed",
};

/** Draft until published; Selling while a live drop carries its products; Closed once the show is over. */
export function setupStatus(setup: ShowMerchSetup, now = new Date()): SetupStatus {
  if (!setup.published) return "draft";
  const drop = getCurrentDrop();
  if (drop?.status === "live" && dropProductIds().some((id) => setup.productIds.includes(id))) return "selling";
  const show = showOf(setup);
  if (show?.status === "canceled") return "closed";
  if (show && isValidTimeZone(show.timezone) && show.date < localDateIn(show.timezone, now)) return "closed";
  return "ready";
}

/** A product is "in the drop" when the drop has an entry for it, whatever the count. */
function dropProductIds(): string[] {
  return Object.keys(getAllRemaining());
}

function fingerprint(value: unknown): string {
  return createHash("sha1").update(JSON.stringify(value)).digest("hex").slice(0, 10);
}

function productForFingerprint(p: CatalogItem | undefined) {
  if (!p) return null;
  return {
    title: p.title,
    images: p.images ?? [],
    imageLabels: p.imageLabels ?? {},
    enabled: p.enabled !== false,
    inventoryMode: p.inventoryMode ?? "stocked",
    printPlacement: p.printPlacement ?? "",
    garment: p.garment ?? "",
    description: p.description ?? "",
    sizes: sizesForProduct(p),
    sizeGuide: p.sizeGuide ?? null,
  };
}

/** What each approval covers. Any change to these fields voids the approval. */
export function groupFingerprint(setup: ShowMerchSetup, key: ApprovalKey): string {
  const show = showOf(setup);
  const products = setup.productIds.map((id) => getProduct(id));
  switch (key) {
    case "show":
      return fingerprint({
        showId: setup.showId,
        title: show?.title ?? "",
        date: show?.date ?? "",
        venue: show?.venue ?? "",
        city: show?.city ?? "",
        status: show?.status ?? "",
        timezone: show?.timezone ?? "",
        location: show?.merchPickup?.location ?? "",
      });
    case "products":
      return fingerprint({ productIds: setup.productIds, products: products.map(productForFingerprint) });
    case "prices":
      return fingerprint({
        prices: setup.productIds.map((id) => [id, getProduct(id)?.priceCents ?? null]),
        shippingIncluded: setup.shippingIncluded,
        shippingFeeCents: setup.shippingFeeCents,
      });
    case "pickup":
      return fingerprint({
        pickup: show?.merchPickup ?? null,
        productCutoffs: setup.productCutoffs,
        windowMonths: setup.pickupWindowMonths,
        bonus: setup.pickupBonus,
        missedPickupPolicy: setup.missedPickupPolicy,
      });
    case "shipping":
      return fingerprint({
        countries: setup.shippingCountries,
        excluded: setup.excludedRegions,
        shipsAfter: setup.shipsAfterDate,
        dispatch: setup.dispatchEstimate,
        included: setup.shippingIncluded,
        fee: setup.shippingFeeCents,
      });
  }
}

export type ApprovalState = "approved" | "changed" | "pending";

/** Approved only while the group's fields still match what was approved. */
export function approvalState(setup: ShowMerchSetup, key: ApprovalKey): ApprovalState {
  const stored = setup.approvals[key];
  if (!stored) return "pending";
  return stored === groupFingerprint(setup, key) ? "approved" : "changed";
}

export type ChecklistItem = {
  key: string;
  group: ApprovalKey | "drop";
  required: boolean;
  ok: boolean;
  label: string;
  /** Input id in the admin to jump to. */
  field?: string;
  /** Filled in, but with text that reads like a test placeholder. */
  placeholder?: boolean;
};

/**
 * Field-by-field readiness. "ok" means filled in and valid; a placeholder is
 * flagged separately so previews can carry labeled test data while publishing
 * is refused.
 */
export function setupChecklist(setup: ShowMerchSetup, now = new Date()): ChecklistItem[] {
  const items: ChecklistItem[] = [];
  const add = (item: ChecklistItem) => items.push(item);
  const show = showOf(setup);
  const products = setup.productIds.map((id) => ({ id, product: getProduct(id) }));

  // ---- show
  add({ key: "show", group: "show", required: true, ok: Boolean(show), label: show ? `Show: ${show.title}` : "Choose the show", field: "sm-f-show" });
  if (show) {
    const today = isValidTimeZone(show.timezone) ? localDateIn(show.timezone, now) : "";
    add({ key: "show-status", group: "show", required: true, ok: show.status === "confirmed", label: show.status === "confirmed" ? "Show status: confirmed" : show.status === "canceled" ? "Show is canceled" : "Mark the show confirmed", field: "sm-f-show-status" });
    add({ key: "show-timezone", group: "show", required: true, ok: isValidTimeZone(show.timezone), label: isValidTimeZone(show.timezone) ? `Timezone: ${show.timezone}` : "Set the show's timezone", field: "sm-f-show-timezone" });
    add({ key: "show-date", group: "show", required: true, ok: Boolean(today) && show.date >= today, label: today && show.date < today ? `Show date has passed (${dateLabel(show.date)})` : `Show date: ${dateLabel(show.date)}`, field: "sm-f-show-date" });
    const location = showLocation(show);
    add({ key: "show-location", group: "show", required: true, ok: Boolean(location), label: location ? `Location: ${location}` : "Add the venue and city", field: "sm-f-show-venue", placeholder: looksLikePlaceholder(location) || looksLikePlaceholder(show.title) });
  }

  // ---- products
  add({ key: "products", group: "products", required: true, ok: products.length > 0 && products.every((p) => p.product), label: products.length ? (products.every((p) => p.product) ? `${products.length} product${products.length === 1 ? "" : "s"} attached` : `Missing product: ${products.filter((p) => !p.product).map((p) => p.id).join(", ")}`) : "Attach at least one product", field: "sm-f-products" });
  for (const { id, product } of products) {
    if (!product) continue;
    const title = product.title;
    const pid = encodeURIComponent(id);
    add({ key: `product-${id}-title`, group: "products", required: true, ok: Boolean(title), label: `${title}: name`, field: `sm-p-${pid}-title`, placeholder: looksLikePlaceholder(title) || /test/i.test(id) });
    add({ key: `product-${id}-enabled`, group: "products", required: true, ok: product.enabled !== false, label: product.enabled !== false ? `${title}: shown in the shop` : `${title} is hidden — show it`, field: `sm-p-${pid}-enabled` });
    const images = product.images ?? [];
    add({ key: `product-${id}-images`, group: "products", required: true, ok: images.length > 0, label: images.length ? `${title}: ${images.length} image${images.length === 1 ? "" : "s"}` : `${title}: add product images`, field: `sm-p-${pid}-images` });
    const labeled = images.filter((url) => product.imageLabels?.[url]);
    add({ key: `product-${id}-image-labels`, group: "products", required: false, ok: images.length > 0 && labeled.length === images.length, label: images.length && labeled.length === images.length ? `${title}: every image labeled (front / back / detail)` : `${title}: label each image (front, back, artwork)`, field: `sm-p-${pid}-images` });
    // Apparel (anything with sizes) has to say what it's printed on and where.
    const sizes = sizesForProduct(product);
    const apparel = sizes.length > 0;
    add({ key: `product-${id}-print`, group: "products", required: apparel, ok: Boolean(product.printPlacement) || !apparel, label: product.printPlacement ? `${title}: ${product.printPlacement === "front_back" ? "front + back print" : "front print, blank back"}` : apparel ? `${title}: set the print placement` : `${title}: print placement (not apparel)`, field: `sm-p-${pid}-print` });
    add({ key: `product-${id}-garment`, group: "products", required: apparel, ok: Boolean(product.garment) || !apparel, label: product.garment ? `${title}: ${product.garment}` : apparel ? `${title}: name the blank (verified with the printer)` : `${title}: garment (not apparel)`, field: `sm-p-${pid}-garment`, placeholder: looksLikePlaceholder(product.garment) });
    add({ key: `product-${id}-description`, group: "products", required: false, ok: Boolean(product.description), label: product.description ? `${title}: description written` : `${title}: add a description`, field: `sm-p-${pid}-description`, placeholder: looksLikePlaceholder(product.description) });
    if (apparel) {
      const guide = product.sizeGuide?.rows ?? [];
      add({ key: `product-${id}-sizes`, group: "products", required: true, ok: sizes.length > 0, label: `${title}: sizes ${sizes.join(" / ")}`, field: `sm-p-${pid}-sizes` });
      add({ key: `product-${id}-size-guide`, group: "products", required: true, ok: guide.length > 0, label: guide.length ? `${title}: size guide (${guide.length} sizes)` : `${title}: enter the blank's size guide`, field: `sm-p-${pid}-size-guide`, placeholder: looksLikePlaceholder(product.sizeGuide?.note) });
    }
    add({ key: `product-${id}-inventory`, group: "products", required: false, ok: true, label: `${title}: ${product.inventoryMode === "made_to_order" ? "made to order" : "stocked (units reserved while in a bag)"}`, field: `sm-p-${pid}-inventory` });
  }

  // ---- prices
  for (const { id, product } of products) {
    if (!product) continue;
    const pid = encodeURIComponent(id);
    add({ key: `price-${id}`, group: "prices", required: true, ok: product.priceCents > 0, label: product.priceCents > 0 ? `${product.title}: $${(product.priceCents / 100).toFixed(2)}` : `${product.title}: set a price`, field: `sm-p-${pid}-price` });
  }
  add({ key: "shipping-included", group: "prices", required: true, ok: setup.shippingIncluded || setup.shippingFeeCents >= 0, label: setup.shippingIncluded ? "Standard shipping is included in the price" : setup.shippingFeeCents > 0 ? `Delivery adds $${(setup.shippingFeeCents / 100).toFixed(2)}` : "Delivery adds nothing (not described as included)", field: "sm-f-shipping-included" });

  // ---- pickup
  const pickup = show?.merchPickup;
  add({ key: "pickup-enabled", group: "pickup", required: true, ok: Boolean(pickup?.enabled), label: pickup?.enabled ? "Merch pickup is on for this show" : "Turn on merch pickup for this show", field: "sm-f-pickup-enabled" });
  const cutoffAt = show && pickup?.cutoff && isValidTimeZone(show.timezone) ? zonedTimeToInstant(pickup.cutoff, show.timezone) : null;
  const cutoffOk = Boolean(cutoffAt) && (!show || pickup!.cutoff!.slice(0, 10) <= show.date) && (cutoffAt as Date).getTime() > now.getTime();
  add({ key: "pickup-cutoff", group: "pickup", required: true, ok: cutoffOk, label: !pickup?.cutoff ? "Set the pickup order cutoff" : !cutoffAt ? "Pickup cutoff isn't a valid time" : show && pickup.cutoff.slice(0, 10) > show.date ? "Pickup cutoff is after the show" : cutoffAt.getTime() <= now.getTime() ? `Pickup cutoff has passed (${cutoffLabel(pickup.cutoff, show!.timezone!)})` : `Pickup orders close ${cutoffLabel(pickup.cutoff, show!.timezone!)}`, field: "sm-f-pickup-cutoff" });
  for (const [productId, cutoff] of Object.entries(setup.productCutoffs)) {
    const at = show && isValidTimeZone(show.timezone) ? zonedTimeToInstant(cutoff, show.timezone) : null;
    add({ key: `pickup-cutoff-${productId}`, group: "pickup", required: false, ok: Boolean(at) && (at as Date).getTime() > now.getTime(), label: at ? `${titleOf(productId)}: own cutoff ${cutoffLabel(cutoff, show!.timezone!)}${at.getTime() <= now.getTime() ? " (passed)" : ""}` : `${titleOf(productId)}: own cutoff isn't a valid time`, field: `sm-f-cutoff-${encodeURIComponent(productId)}` });
  }
  add({ key: "pickup-hours", group: "pickup", required: true, ok: Boolean(pickup?.hours), label: pickup?.hours ? `Pickup hours: ${pickup.hours}` : "Add the pickup hours (when to collect)", field: "sm-f-pickup-hours", placeholder: looksLikePlaceholder(pickup?.hours) });
  add({ key: "pickup-location", group: "pickup", required: false, ok: Boolean(pickup?.location), label: pickup?.location ? `Pickup location: ${pickup.location}` : "Pickup location (optional; venue · city is used)", field: "sm-f-pickup-location", placeholder: looksLikePlaceholder(pickup?.location) });
  add({ key: "pickup-instructions", group: "pickup", required: true, ok: Boolean(pickup?.instructions), label: pickup?.instructions ? "Pickup instructions written" : "Write the pickup instructions", field: "sm-f-pickup-instructions", placeholder: looksLikePlaceholder(pickup?.instructions) });
  add({ key: "pickup-bonus", group: "pickup", required: true, ok: Boolean(setup.pickupBonus), label: setup.pickupBonus ? `Pickup bonus: ${setup.pickupBonus}` : "Name the pickup bonus (or clear it if there is none)", field: "sm-f-bonus", placeholder: looksLikePlaceholder(setup.pickupBonus) });
  add({ key: "missed-policy", group: "pickup", required: true, ok: Boolean(setup.missedPickupPolicy), label: setup.missedPickupPolicy ? "Missed-pickup policy written" : "Write the missed-pickup policy", field: "sm-f-missed", placeholder: looksLikePlaceholder(setup.missedPickupPolicy) });
  add({ key: "pickup-window", group: "pickup", required: false, ok: true, label: `Pickup opens ${monthsLabel(setup.pickupWindowMonths)} before a show`, field: "sm-f-window" });

  // ---- shipping
  add({ key: "shipping-region", group: "shipping", required: true, ok: setup.shippingCountries.length > 0, label: setup.shippingCountries.length ? `Ships to ${shippingRegionLabel(setup)}` : "Set the eligible shipping region", field: "sm-f-countries" });
  add({ key: "ships-after", group: "shipping", required: true, ok: Boolean(setup.shipsAfterDate), label: setup.shipsAfterDate ? `Ships after ${dateLabel(setup.shipsAfterDate)}${show && setup.shipsAfterDate < show.date ? " (before the show!)" : ""}` : "Set the date shipping orders go out after", field: "sm-f-ships-after" });
  add({ key: "dispatch", group: "shipping", required: true, ok: Boolean(setup.dispatchEstimate), label: setup.dispatchEstimate ? `Dispatch estimate: “${setup.dispatchEstimate}”` : "Add a dispatch estimate", field: "sm-f-dispatch", placeholder: looksLikePlaceholder(setup.dispatchEstimate) });

  // ---- drop (informational: publishing doesn't need it, selling does)
  const drop = getCurrentDrop();
  const inDrop = drop ? setup.productIds.filter((id) => dropProductIds().includes(id)) : [];
  add({
    key: "drop",
    group: "drop",
    required: false,
    ok: Boolean(drop && drop.status !== "ended" && inDrop.length === setup.productIds.length && setup.productIds.length > 0),
    label: !drop || drop.status === "ended"
      ? "No drop scheduled: sales open when a drop with these products goes live"
      : inDrop.length === setup.productIds.length
        ? `${drop.status === "live" ? "Live" : "Scheduled"} drop carries every product (sales close ${new Date(drop.endsAt).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" })})`
        : `The ${drop.status} drop is missing: ${setup.productIds.filter((id) => !inDrop.includes(id)).map(titleOf).join(", ")}`,
    field: "sm-f-drop",
  });

  return items;
}

/** What still stops publishing: required fields, placeholders, and approvals. */
export function publishBlockers(setup: ShowMerchSetup, now = new Date()): ChecklistItem[] {
  const blockers = setupChecklist(setup, now).filter((item) => (item.required && !item.ok) || item.placeholder);
  for (const key of APPROVAL_KEYS) {
    const state = approvalState(setup, key);
    if (state !== "approved") {
      blockers.push({
        key: `approval-${key}`,
        group: key,
        required: true,
        ok: false,
        label: state === "changed" ? `${APPROVAL_LABEL[key]} changed since approval — review and approve again` : `${APPROVAL_LABEL[key]} not approved yet`,
        field: `sm-a-${key}`,
      });
    }
  }
  return blockers;
}

export const APPROVAL_LABEL: Record<ApprovalKey, string> = {
  show: "Show dates and venue",
  products: "Products and availability",
  prices: "Prices",
  pickup: "Pickup details",
  shipping: "Shipping details",
};

/** Everything the admin overview shows for one setup. */
export function describeSetup(setup: ShowMerchSetup, now = new Date()) {
  const show = showOf(setup);
  const check = show ? checkShowPickup(show, now, { setup }) : null;
  const approvals = {} as Record<ApprovalKey, ApprovalState>;
  for (const key of APPROVAL_KEYS) approvals[key] = approvalState(setup, key);
  const drop = getCurrentDrop();
  return {
    ...setup,
    status: setupStatus(setup, now),
    statusLabel: SETUP_STATUS_LABEL[setupStatus(setup, now)],
    show: show ? { ...show, location: showLocation(show) } : null,
    pickup: check,
    approvals,
    approvalLabels: APPROVAL_LABEL,
    checklist: setupChecklist(setup, now),
    blockers: publishBlockers(setup, now),
    drop: drop ? { id: drop.id, status: drop.status, startsAt: drop.startsAt, endsAt: drop.endsAt, productIds: dropProductIds() } : null,
    products: setup.productIds.map((id) => getProduct(id) ?? null),
    catalog: listCatalog().map((p) => ({ id: p.id, title: p.title, priceCents: p.priceCents, enabled: p.enabled !== false })),
    // Exactly what the shop would show customers if this setup were live right now.
    customerView: publicShowMerch(now, { includeSetupIds: [setup.id] }),
  };
}
