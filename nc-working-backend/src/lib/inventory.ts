import { EventEmitter } from "events";
import dayjs from "dayjs";
import { nanoid } from "nanoid";
import type { CatalogItem, Drop, DropCode, DropStatus, RemainingMap } from "./types.js";
import { listSales } from "./sales.js";

type InventoryEvent = { productId: string; remaining: number };
type VelocityPoint = { ts: number; qty: number };

type DropProductAnalytics = {
  productId: string;
  title: string;
  priceCents: number;
  initialQty: number;
  remainingQty: number;
  soldQty: number;
  views: number;
  revenueCents: number;
  sellThrough: number;
};

export type DropAnalytics = {
  id: string;
  code: string;
  status: DropStatus;
  scheduledStartsAt: string;
  scheduledEndsAt: string;
  startedAt: string | null;
  endedAt: string | null;
  durationSeconds: number | null;
  products: DropProductAnalytics[];
  totals: {
    initialQty: number;
    soldQty: number;
    remainingQty: number;
    revenueCents: number;
    views: number;
    sellThrough: number;
  };
};

type DropEvent =
  | { type: "scheduled"; drop: Drop }
  | { type: "activated"; drop: Drop }
  | { type: "ended"; drop: Drop };

const velocityWindow10m = 10 * 60 * 1000;
const velocityWindow30m = 30 * 60 * 1000;
const DEFAULT_DURATION_MINUTES = 120;
const DEFAULT_SAVE_WINDOW_HOURS = Number.parseFloat(process.env.VAULT_SAVE_WINDOW_HOURS ?? "4");
const DEFAULT_SAVE_WINDOW_MS =
  Number.isFinite(DEFAULT_SAVE_WINDOW_HOURS) && DEFAULT_SAVE_WINDOW_HOURS > 0
    ? DEFAULT_SAVE_WINDOW_HOURS * 3_600_000
    : 4 * 3_600_000;

const events = new EventEmitter();
events.setMaxListeners(0);

let catalog: CatalogItem[] = [];
let remaining: RemainingMap = {};
let currentDrop: Drop | null = null;
let startTimer: NodeJS.Timeout | null = null;
let endTimer: NodeJS.Timeout | null = null;
let plannedInitial: RemainingMap = {};
let currentViews: Record<string, number> = {};
let currentDropStartedAt: string | null = null;
let dropHistory: DropAnalytics[] = [];
let lastLiveSeen: Record<string, string> = {};

const DROP_HISTORY_LIMIT = 20;

export function getVaultSaveWindowMs() {
  return DEFAULT_SAVE_WINDOW_MS;
}

function normalizeTags(input?: string[] | string): string[] {
  if (Array.isArray(input)) {
    return input
      .map((tag) => String(tag).trim())
      .filter((tag) => tag.length > 0);
  }
  if (typeof input === "string") {
    return input
      .split(",")
      .map((tag) => tag.trim())
      .filter((tag) => tag.length > 0);
  }
  return [];
}

function normalizeProduct(input: CatalogItem): CatalogItem {
  return {
    ...input,
    enabled: input.enabled !== false,
    tags: normalizeTags(input.tags),
  };
}

function cloneRemainingMap(map: RemainingMap): RemainingMap {
  const out: RemainingMap = {};
  for (const [key, value] of Object.entries(map)) {
    out[key] = Math.max(0, Number.isFinite(value) ? Number(value) : 0);
  }
  return out;
}

function collectDropSales(dropId: string) {
  const perProduct: Record<string, { qty: number; revenueCents: number }> = {};
  const sales = listSales(5000);
  for (const sale of sales) {
    if (sale.dropId !== dropId) continue;
    const entry = perProduct[sale.productId] ?? { qty: 0, revenueCents: 0 };
    entry.qty += sale.qty;
    entry.revenueCents += sale.lineTotalCents ?? sale.qty * sale.priceCents;
    perProduct[sale.productId] = entry;
  }
  return perProduct;
}

function buildDropAnalyticsSnapshot(
  drop: Drop,
  initialMap: RemainingMap,
  remainingMap: RemainingMap,
  viewsMap: Record<string, number>,
  startedAt: string | null,
  endedAt: string | null,
  salesMap?: Record<string, { qty: number; revenueCents: number }>,
): DropAnalytics {
  const catalogIndex = new Map(listCatalog().map((item) => [item.id, item]));
  const salesByProduct = salesMap ?? (drop.id ? collectDropSales(drop.id) : {});
  const productIds = new Set<string>([
    ...Object.keys(initialMap),
    ...Object.keys(remainingMap),
    ...Object.keys(viewsMap),
  ]);
  for (const productId of Object.keys(salesByProduct)) {
    productIds.add(productId);
  }

  let totalInitial = 0;
  let totalRemaining = 0;
  let totalSold = 0;
  let totalViews = 0;
  let totalRevenue = 0;

  const products: DropProductAnalytics[] = Array.from(productIds).map((productId) => {
    const product = catalogIndex.get(productId);
    const priceCents = product?.priceCents ?? 0;
    const title = product?.title ?? productId;
    const initialQty = Math.max(0, Math.floor(initialMap[productId] ?? 0));
    const remainingQty = Math.max(0, Math.floor(remainingMap[productId] ?? 0));
    const salesEntry = salesByProduct[productId] ?? { qty: 0, revenueCents: 0 };
    const soldQty = Math.max(0, salesEntry.qty);
    const views = Math.max(0, Math.floor(viewsMap[productId] ?? 0));
    const revenueCents =
      Number.isFinite(salesEntry.revenueCents) && salesEntry.revenueCents !== undefined
        ? salesEntry.revenueCents
        : soldQty * priceCents;
    const sellThrough =
      initialQty > 0 ? Math.min(1, soldQty / initialQty) : soldQty > 0 ? 1 : 0;

    totalInitial += initialQty;
    totalRemaining += remainingQty;
    totalSold += soldQty;
    totalViews += views;
    totalRevenue += revenueCents;

    return {
      productId,
      title,
      priceCents,
      initialQty,
      remainingQty,
      soldQty,
      views,
      revenueCents,
      sellThrough,
    };
  });

  const durationSeconds =
    startedAt && endedAt ? Math.max(0, (new Date(endedAt).getTime() - new Date(startedAt).getTime()) / 1000) : null;

  return {
    id: drop.id,
    code: drop.code,
    status: drop.status,
    scheduledStartsAt: drop.startsAt,
    scheduledEndsAt: drop.endsAt,
    startedAt,
    endedAt,
    durationSeconds,
    products,
    totals: {
      initialQty: totalInitial,
      soldQty: totalSold,
      remainingQty: totalRemaining,
      revenueCents: totalRevenue,
      views: totalViews,
      sellThrough: totalInitial > 0 ? Math.min(1, totalSold / totalInitial) : totalSold > 0 ? 1 : 0,
    },
  };
}

export function seedInventory() {
  if (catalog.length) return;
  catalog = [
    { id: "tee-black", title: "NC Tee - Black", priceCents: 4000, enabled: true, tags: ["T-Shirt"] },
  ];
}

export function listCatalog(): CatalogItem[] {
  return catalog.map((item) => normalizeProduct(item));
}

export function getProduct(id: string): CatalogItem | undefined {
  const found = catalog.find((item) => item.id === id);
  return found ? normalizeProduct(found) : undefined;
}

export function getCurrentDrop(): Drop | null {
  return currentDrop ? { ...currentDrop } : null;
}

export function getAllRemaining(): RemainingMap {
  return { ...remaining };
}

export function upsertProduct(p: CatalogItem) {
  const next = normalizeProduct(p);
  const i = catalog.findIndex((x) => x.id === p.id);
  if (i >= 0) {
    catalog[i] = normalizeProduct({ ...catalog[i], ...next });
  } else {
    catalog.push(next);
  }
}

export function patchProduct(id: string, patch: Partial<CatalogItem>) {
  const i = catalog.findIndex((x) => x.id === id);
  if (i < 0) return false;
  const merged: CatalogItem = { ...catalog[i], ...patch };
  merged.enabled = patch.enabled === undefined ? catalog[i].enabled : patch.enabled !== false;
  if (patch.tags !== undefined) {
    merged.tags = normalizeTags(patch.tags as any);
  }
  catalog[i] = normalizeProduct(merged);
  return true;
}

export function deleteProduct(id: string) {
  catalog = catalog.filter((x) => x.id !== id);
  delete remaining[id];
  emitInventory(id);
}

function toRemainingMap(input: RemainingMap | number): RemainingMap {
  if (typeof input === "number") {
    const qty = Math.max(0, Number.isFinite(input) ? input : 0);
    return Object.fromEntries(
      catalog.map((c) => [c.id, qty]),
    );
  }
  const out: RemainingMap = {};
  for (const [key, value] of Object.entries(input)) {
    out[key] = Math.max(0, Number.isFinite(value) ? Number(value) : 0);
  }
  return out;
}

function clearTimers() {
  if (startTimer) {
    clearTimeout(startTimer);
    startTimer = null;
  }
  if (endTimer) {
    clearTimeout(endTimer);
    endTimer = null;
  }
}

function emitInventory(productId: string) {
  events.emit("inventory", {
    productId,
    remaining: remaining[productId] ?? 0,
  } satisfies InventoryEvent);
}

function emitSnapshot(map: RemainingMap) {
  for (const [id, qty] of Object.entries(map)) {
    events.emit("inventory", { productId: id, remaining: qty } satisfies InventoryEvent);
  }
}

function scheduleEndTimer() {
  if (!currentDrop) return;
  if (endTimer) {
    clearTimeout(endTimer);
    endTimer = null;
  }
  const now = dayjs();
  const endsAt = dayjs(currentDrop.endsAt);
  if (now.isAfter(endsAt)) {
    endCurrentDrop();
    return;
  }
  endTimer = setTimeout(() => endCurrentDrop(), Math.max(0, endsAt.diff(now)));
}

function activateDrop() {
  if (!currentDrop) return;
  remaining = { ...plannedInitial };
  emitSnapshot(remaining);
  currentDrop = { ...currentDrop, status: "live" };
  const nowIso = new Date().toISOString();
  for (const [productId, qty] of Object.entries(remaining)) {
    if (Number.isFinite(qty) && Number(qty) > 0) {
      lastLiveSeen[productId] = nowIso;
    }
  }
  events.emit("drop:event", { type: "activated", drop: { ...currentDrop } } as DropEvent);
  currentViews = {};
  currentDropStartedAt = new Date().toISOString();
  scheduleEndTimer();
}

function scheduleLifecycle() {
  if (!currentDrop) return;
  clearTimers();
  const now = dayjs();
  const startAt = dayjs(currentDrop.startsAt);
  if (now.isAfter(startAt) || now.isSame(startAt)) {
    activateDrop();
  } else {
    startTimer = setTimeout(() => activateDrop(), Math.max(0, startAt.diff(now)));
    emitSnapshot(remaining);
  }
}

export function createManualDrop(opts: {
  startsAt: "now" | string;
  durationMinutes: number;
  initialQty: RemainingMap | number;
  code?: DropCode;
}) {
  seedInventory();
  const startsAtIso =
    opts.startsAt === "now"
      ? new Date().toISOString()
      : dayjs(opts.startsAt).toISOString();
  const duration = Number.isFinite(opts.durationMinutes)
    ? Math.max(1, Math.floor(opts.durationMinutes))
    : DEFAULT_DURATION_MINUTES;

  const init = toRemainingMap(opts.initialQty);
  plannedInitial = { ...init };
  remaining = { ...init };
  currentViews = {};
  currentDropStartedAt = null;

  const drop: Drop = {
    id: `drop-${nanoid()}`,
    code: opts.code ?? "MANUAL",
    startsAt: startsAtIso,
    endsAt: dayjs(startsAtIso).add(duration, "minute").toISOString(),
    status: "scheduled",
  };

  currentDrop = drop;
  events.emit("drop:event", { type: "scheduled", drop: { ...currentDrop } } as DropEvent);
  scheduleLifecycle();
  return currentDrop;
}

export function goLiveNow(initial: RemainingMap | number) {
  return createManualDrop({
    startsAt: "now",
    durationMinutes: DEFAULT_DURATION_MINUTES,
    initialQty: initial,
  });
}

export function endCurrentDrop() {
  if (!currentDrop) return;
  clearTimers();
  const endedAt = new Date().toISOString();
  const snapshotDrop: Drop = { ...currentDrop, status: "ended" };
  const liveIds = Object.entries(plannedInitial)
    .filter(([, qty]) => Number.isFinite(qty) && Number(qty) > 0)
    .map(([productId]) => productId);
  liveIds.forEach((productId) => {
    lastLiveSeen[productId] = endedAt;
  });
  events.emit("drop:event", { type: "ended", drop: snapshotDrop } as DropEvent);
  const salesMap = collectDropSales(snapshotDrop.id);
  const analytics = buildDropAnalyticsSnapshot(
    snapshotDrop,
    cloneRemainingMap(plannedInitial),
    cloneRemainingMap(remaining),
    { ...currentViews },
    currentDropStartedAt,
    endedAt,
    salesMap,
  );
  dropHistory.push(analytics);
  if (dropHistory.length > DROP_HISTORY_LIMIT) {
    dropHistory = dropHistory.slice(-DROP_HISTORY_LIMIT);
  }
  currentDrop = null;
  plannedInitial = {};
  remaining = {};
  currentViews = {};
  currentDropStartedAt = null;
  emitSnapshot(remaining);
}

export function reserve(productId: string, qty: number) {
  if (!currentDrop || currentDrop.status !== "live") return false;
  const amount = Math.max(1, Math.floor(qty));
  const left = remaining[productId] ?? 0;
  if (left < amount) return false;
  remaining[productId] = left - amount;
  emitInventory(productId);
  return true;
}

export function release(productId: string, qty: number) {
  const amount = Math.max(1, Math.floor(qty));
  remaining[productId] = (remaining[productId] ?? 0) + amount;
  emitInventory(productId);
}

export function resetRemaining(map: RemainingMap) {
  remaining = { ...map };
  emitSnapshot(remaining);
}

export function onInventoryUpdate(listener: (event: InventoryEvent) => void) {
  events.on("inventory", listener);
  return () => events.off("inventory", listener);
}

export function onDropEvent(listener: (event: DropEvent) => void) {
  events.on("drop:event", listener);
  return () => events.off("drop:event", listener);
}

export function getRecentlyLiveProductIds(windowMs = DEFAULT_SAVE_WINDOW_MS) {
  if (!Number.isFinite(windowMs) || windowMs <= 0) return [];
  const now = Date.now();
  const eligible: string[] = [];
  for (const [productId, iso] of Object.entries(lastLiveSeen)) {
    const ts = new Date(iso).getTime();
    if (!Number.isFinite(ts)) continue;
    if (now - ts <= windowMs) {
      eligible.push(productId);
    } else if (now - ts > windowMs * 8) {
      delete lastLiveSeen[productId];
    }
  }
  return eligible;
}

export function getVaultReadyProducts(windowMs = DEFAULT_SAVE_WINDOW_MS) {
  const ids = getRecentlyLiveProductIds(windowMs);
  if (!ids.length) return [];
  const catalogIndex = new Map(listCatalog().map((item) => [item.id, item]));
  const rows = ids
    .map((productId) => {
      const product = catalogIndex.get(productId);
      if (!product || product.enabled === false) return null;
      const lastLiveAt = lastLiveSeen[productId];
      return {
        id: productId,
        lastLiveAt,
        remaining: Math.max(0, Math.floor(remaining[productId] ?? 0)),
        product: normalizeProduct(product),
      };
    })
    .filter((entry): entry is { id: string; lastLiveAt: string; remaining: number; product: CatalogItem } => entry !== null)
          .sort((a, b) => {
        const aTime = new Date(a.lastLiveAt ?? 0).getTime();
        const bTime = new Date(b.lastLiveAt ?? 0).getTime();
        return bTime - aTime;
      });
    return rows;
  }
  export function computePredictions() {
  const now = Date.now();
  const drop = getCurrentDrop();
  const remainingMap = getAllRemaining();

  const products: Array<{
    id: string;
    title: string;
    remaining: number;
    velocity_per_hour_10m: number;
    velocity_per_hour_30m: number;
    projected_sellout_eta_10m: string | null;
    projected_sellout_eta_30m: string | null;
  }> = [];

  const sales = listSales(2000);
  const idx: Record<string, VelocityPoint[]> = {};
  for (const s of sales) {
    const t = new Date(s.ts).getTime();
    if (!idx[s.productId]) idx[s.productId] = [];
    idx[s.productId].push({ ts: t, qty: s.qty });
  }

  const cat = listCatalog();
  for (const p of cat) {
    const pts = idx[p.id] ?? [];
    const v10 = ratePerHour(pts, now, velocityWindow10m);
    const v30 = ratePerHour(pts, now, velocityWindow30m);
    const rem = remainingMap[p.id] ?? 0;
    const eta10 = v10 > 0 ? new Date(now + (rem / v10) * 3_600_000).toISOString() : null;
    const eta30 = v30 > 0 ? new Date(now + (rem / v30) * 3_600_000).toISOString() : null;

    products.push({
      id: p.id,
      title: p.title,
      remaining: rem,
      velocity_per_hour_10m: round1(v10),
      velocity_per_hour_30m: round1(v30),
      projected_sellout_eta_10m: eta10,
      projected_sellout_eta_30m: eta30,
    });
  }

  let next_drop_projection: { startsAt: string; note?: string } | null = null;
  if (drop?.status === "scheduled") next_drop_projection = { startsAt: drop.startsAt };
  if (!drop) next_drop_projection = null;

  return {
    generated_at: new Date().toISOString(),
    next_drop_projection,
    products,
  };
}


export function recordProductViews(ids: string[]) {
  if (!currentDrop || currentDrop.status !== "live") return;
  for (const id of ids) {
    currentViews[id] = (currentViews[id] ?? 0) + 1;
  }
}

export function getCurrentDropAnalytics(): DropAnalytics | null {
  if (!currentDrop) return null;
  const initialSnapshot = cloneRemainingMap(plannedInitial);
  const remainingSnapshot = cloneRemainingMap(remaining);
  const viewsSnapshot = { ...currentViews };
  const endedAt = currentDrop.status === "ended" ? currentDrop.endsAt : null;
  const salesMap = currentDrop.id ? collectDropSales(currentDrop.id) : {};
  return buildDropAnalyticsSnapshot(
    currentDrop,
    initialSnapshot,
    remainingSnapshot,
    viewsSnapshot,
    currentDropStartedAt,
    endedAt,
    salesMap,
  );
}

export function getDropHistory(limit = DROP_HISTORY_LIMIT): DropAnalytics[] {
  return dropHistory.slice(-Math.max(1, limit)).reverse();
}

export function setLiveInventory(productId: string, nextQty: number) {
  if (!currentDrop || currentDrop.status !== "live") return null;
  const sanitized = Math.max(0, Math.floor(Number(nextQty) || 0));
  const prevRemaining = Math.max(0, Math.floor(remaining[productId] ?? 0));
  if (!(productId in plannedInitial)) {
    plannedInitial[productId] = prevRemaining;
  }
  remaining[productId] = sanitized;
  if (sanitized > prevRemaining) {
    plannedInitial[productId] = (plannedInitial[productId] ?? 0) + (sanitized - prevRemaining);
    lastLiveSeen[productId] = new Date().toISOString();
  }
  emitInventory(productId);
  const analytics = getCurrentDropAnalytics();
  return analytics?.products.find((p) => p.productId === productId) ?? null;
}

export function addInventoryToLive(additions: RemainingMap | number) {
  if (!currentDrop || currentDrop.status !== "live") return null;
  const map = toRemainingMap(additions);
  const applied: Record<
    string,
    { remainingQty: number; addedQty: number }
  > = {};
  for (const [productId, value] of Object.entries(map)) {
    const addQty = Math.max(0, Math.floor(value));
    if (!addQty) continue;
    const prevRemaining = Math.max(0, Math.floor(remaining[productId] ?? 0));
    const nextRemaining = prevRemaining + addQty;
    remaining[productId] = nextRemaining;
    if (!(productId in plannedInitial)) {
      plannedInitial[productId] = nextRemaining;
      lastLiveSeen[productId] = new Date().toISOString();
    } else {
      plannedInitial[productId] = (plannedInitial[productId] ?? 0) + addQty;
      lastLiveSeen[productId] = new Date().toISOString();
    }
    applied[productId] = { remainingQty: nextRemaining, addedQty: addQty };
    emitInventory(productId);
  }
  return {
    applied,
    analytics: getCurrentDropAnalytics(),
  };
}

export function ensureLiveDropWindow(durationMinutes: number) {
  if (!currentDrop || currentDrop.status !== "live") return null;
  const minutes = Math.max(1, Math.floor(Number(durationMinutes) || 0));
  const now = dayjs();
  const desiredEnd = now.add(minutes, "minute");
  const currentEnd = dayjs(currentDrop.endsAt);
  let extended = false;
  if (currentEnd.isBefore(desiredEnd)) {
    currentDrop = { ...currentDrop, endsAt: desiredEnd.toISOString() };
    extended = true;
    scheduleEndTimer();
  }
  return { drop: getCurrentDrop(), extended };
}

function ratePerHour(points: VelocityPoint[], now: number, windowMs: number) {
  const since = now - windowMs;
  let qty = 0;
  for (const pt of points) {
    if (pt.ts >= since) qty += pt.qty;
  }
  const hours = windowMs / 3_600_000;
  return qty / hours;
}

const round1 = (n: number) => Math.round(n * 10) / 10;

export type AutoDropConfig = {
  enabled: boolean;
  minVelocityToStayLive: number;
  minVelocityToStart: number;
  defaultDurationMinutes: number;
  initialQty: number;
  productIds: string[];
};

let autoDrop: AutoDropConfig = {
  enabled: false,
  minVelocityToStayLive: 5,
  minVelocityToStart: 15,
  defaultDurationMinutes: DEFAULT_DURATION_MINUTES,
  initialQty: 50,
  productIds: [],
};

export function getAutoDropConfig() {
  return { ...autoDrop };
}

export function setAutoDropConfig(cfg: Partial<AutoDropConfig>) {
  autoDrop = { ...autoDrop, ...cfg };
}

setInterval(() => {
  if (!autoDrop.enabled) return;
  const drop = getCurrentDrop();
  const pred = computePredictions();

  if (!drop || drop.status === "ended") {
    const hot = pred.products.some(
      (p) => p.velocity_per_hour_10m >= autoDrop.minVelocityToStart,
    );
    if (hot) {
      const ids =
        autoDrop.productIds.length > 0
          ? autoDrop.productIds
          : listCatalog().map((p) => p.id);
      const qty: RemainingMap = {};
      ids.forEach((id) => {
        qty[id] = autoDrop.initialQty;
      });
      goLiveNow(qty);
    }
    return;
  }

  if (drop.status === "live") {
    const allCold = pred.products.every(
      (p) => p.velocity_per_hour_10m < autoDrop.minVelocityToStayLive,
    );
    if (allCold) endCurrentDrop();
  }
}, 60_000);

