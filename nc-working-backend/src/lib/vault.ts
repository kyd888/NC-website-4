import fs from "fs";
import path from "path";
import dayjs from "dayjs";
import { nanoid } from "nanoid";

import {
  addInventoryToLive,
  ensureLiveDropWindow,
  createManualDrop,
  getCurrentDrop,
  getProduct,
  onDropEvent,
} from "./inventory.js";
import { sendVaultReleaseEmail } from "./mailer.js";
import type { Drop } from "./types.js";

type SaverEntry = {
  email: string;
  userId?: string;
  name?: string;
  savedAt: string;
};

type PendingRelease = {
  releaseId: string;
  restockQty: number;
  durationMinutes: number;
  triggeredAt: string;
};

type VaultRelease = {
  id: string;
  productId: string;
  restockQty: number;
  durationMinutes: number;
  triggeredAt: string;
  dropId?: string;
  startsAt?: string;
  endsAt?: string;
  notifiedEmails: string[];
  status: "pending" | "live" | "completed";
};

type VaultRecord = {
  productId: string;
  saves: SaverEntry[];
  releases: VaultRelease[];
  pendingRelease?: PendingRelease | null;
};

type StoredVaultRecord = {
  productId: string;
  saves?: SaverEntry[];
  releases?: VaultRelease[];
  pendingRelease?: PendingRelease | null;
};

type AddSaveInput = {
  productId: string;
  email: string;
  userId?: string;
  name?: string;
};

export type VaultSnapshot = Record<
  string,
  {
    saves: number;
    threshold: number;
    pendingRelease?: PendingRelease;
    activeRelease?: VaultRelease | null;
    lastRelease?: VaultRelease | null;
  }
>;

const DATA_DIR = path.resolve("data");
const DATA_FILE = path.join(DATA_DIR, "vault.json");

const DEFAULT_THRESHOLD = Math.max(1, Number.parseInt(process.env.VAULT_THRESHOLD || "5", 5) || 5);
const STOCK_MULTIPLIER = Math.max(1, Number.parseFloat(process.env.VAULT_STOCK_MULTIPLIER || "1"));
const MIN_DURATION_MINUTES = Math.max(30, Number.parseInt(process.env.VAULT_MIN_DURATION_MINUTES || "120", 10) || 120);
const MAX_DURATION_MINUTES = Math.max(
  MIN_DURATION_MINUTES,
  Number.parseInt(process.env.VAULT_MAX_DURATION_MINUTES || "180", 5) || 180,
);

const vault = new Map<string, VaultRecord>();

function ensureDataDir() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

function loadFromDisk() {
  ensureDataDir();
  if (!fs.existsSync(DATA_FILE)) return;
  try {
    const raw = fs.readFileSync(DATA_FILE, "utf8");
    if (!raw) return;
    const parsed = JSON.parse(raw) as StoredVaultRecord[] | undefined;
    if (!Array.isArray(parsed)) return;
    for (const entry of parsed) {
      if (!entry || typeof entry !== "object" || typeof entry.productId !== "string") continue;
      vault.set(entry.productId, {
        productId: entry.productId,
        saves: Array.isArray(entry.saves)
          ? entry.saves
              .filter((saver): saver is SaverEntry => typeof saver?.email === "string")
              .map((saver) => ({
                email: normalizeEmail(saver.email),
                userId: saver.userId,
                name: saver.name,
                savedAt: typeof saver.savedAt === "string" ? saver.savedAt : new Date().toISOString(),
              }))
          : [],
        releases: Array.isArray(entry.releases)
          ? entry.releases
              .filter((release): release is VaultRelease => typeof release?.id === "string")
              .map((release) => ({
                id: release.id,
                productId: release.productId,
                restockQty: release.restockQty,
                durationMinutes: release.durationMinutes,
                triggeredAt: release.triggeredAt,
                dropId: release.dropId,
                startsAt: release.startsAt,
                endsAt: release.endsAt,
                notifiedEmails: Array.isArray(release.notifiedEmails)
                  ? release.notifiedEmails.map((email) => normalizeEmail(String(email)))
                  : [],
                status: release.status === "completed" ? "completed" : release.status === "live" ? "live" : "pending",
              }))
          : [],
        pendingRelease: entry.pendingRelease
          ? {
              releaseId: entry.pendingRelease.releaseId,
              restockQty: entry.pendingRelease.restockQty,
              durationMinutes: entry.pendingRelease.durationMinutes,
              triggeredAt: entry.pendingRelease.triggeredAt,
            }
          : null,
      });
    }
  } catch (error) {
    console.error("[vault] Failed to load vault watchers:", error);
  }
}

function saveToDisk() {
  try {
    ensureDataDir();
    const rows: StoredVaultRecord[] = Array.from(vault.values()).map((record) => ({
      productId: record.productId,
      saves: record.saves,
      releases: record.releases,
      pendingRelease: record.pendingRelease ?? undefined,
    }));
    fs.writeFileSync(DATA_FILE, JSON.stringify(rows, null, 2), "utf8");
  } catch (error) {
    console.error("[vault] Failed to persist vault watchers:", error);
  }
}

loadFromDisk();

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

function ensureRecord(productId: string): VaultRecord {
  let record = vault.get(productId);
  if (!record) {
    record = { productId, saves: [], releases: [], pendingRelease: null };
    vault.set(productId, record);
  }
  return record;
}

function getThreshold(): number {
  return DEFAULT_THRESHOLD;
}

function pickDurationMinutes(): number {
  if (MIN_DURATION_MINUTES === MAX_DURATION_MINUTES) return MIN_DURATION_MINUTES;
  const span = MAX_DURATION_MINUTES - MIN_DURATION_MINUTES;
  return MIN_DURATION_MINUTES + Math.floor(Math.random() * (span + 1));
}

function computeRestockQty(saveCount: number): number {
  const base = Math.max(saveCount, getThreshold());
  const scaled = Math.ceil(base * STOCK_MULTIPLIER);
  return Math.max(1, scaled);
}

async function notifySavers(record: VaultRecord, release: VaultRelease, productTitle: string) {
  const startIso = release.startsAt ?? new Date().toISOString();
  const endIso =
    release.endsAt ?? dayjs(startIso).add(release.durationMinutes, "minute").toISOString();

  const notified: string[] = [];
  const promises = record.saves.map(async (saver) => {
    const ok = await sendVaultReleaseEmail({
      email: saver.email,
      productId: record.productId,
      productTitle,
      windowMinutes: release.durationMinutes,
      releaseStartsAt: startIso,
      releaseEndsAt: endIso,
      dropId: release.dropId,
    });
    if (ok) notified.push(saver.email);
  });
  await Promise.all(promises);
  release.notifiedEmails = notified;
  release.status = "live";
  record.saves = [];
  record.pendingRelease = null;
  saveToDisk();
}

async function finalizeRelease(
  record: VaultRecord,
  release: VaultRelease,
  drop: Drop | null,
  productTitle: string,
) {
  const nowIso = new Date().toISOString();
  release.dropId = drop?.id ?? release.dropId;
  release.startsAt = release.startsAt ?? nowIso;
  release.endsAt =
    drop?.endsAt ??
    release.endsAt ??
    dayjs(release.startsAt ?? nowIso).add(release.durationMinutes, "minute").toISOString();
  await notifySavers(record, release, productTitle);
}

async function triggerRelease(record: VaultRecord, productTitle: string) {
  const productId = record.productId;
  const threshold = getThreshold();
  if (record.saves.length < threshold) {
    return { triggered: false, pending: Boolean(record.pendingRelease) };
  }

  const nowIso = new Date().toISOString();
  const durationMinutes = pickDurationMinutes();
  const restockQty = computeRestockQty(record.saves.length);
  const release: VaultRelease = {
    id: `vault_${nanoid()}`,
    productId,
    restockQty,
    durationMinutes,
    triggeredAt: nowIso,
    status: "pending",
    notifiedEmails: [],
  };
  record.releases.push(release);

  const drop = getCurrentDrop();
  if (drop && drop.status === "live") {
    addInventoryToLive({ [productId]: restockQty });
    ensureLiveDropWindow(durationMinutes);
    const liveDrop = getCurrentDrop();
    release.status = "live";
    release.dropId = liveDrop?.id ?? drop.id;
    release.startsAt = nowIso;
    release.endsAt = liveDrop?.endsAt ?? dayjs(nowIso).add(durationMinutes, "minute").toISOString();
    await finalizeRelease(record, release, liveDrop, productTitle);
    return { triggered: true, pending: false };
  }

  if (drop && drop.status === "scheduled") {
    record.pendingRelease = {
      releaseId: release.id,
      restockQty,
      durationMinutes,
      triggeredAt: nowIso,
    };
    saveToDisk();
    return { triggered: true, pending: true };
  }

  const scheduledDrop = createManualDrop({
    startsAt: "now",
    durationMinutes,
    initialQty: { [productId]: restockQty },
    code: "VAULT",
  });
  const liveDrop = getCurrentDrop();
  release.status = "live";
  release.dropId = liveDrop?.id ?? scheduledDrop.id;
  release.startsAt = liveDrop?.startsAt ?? scheduledDrop.startsAt ?? nowIso;
  release.endsAt = liveDrop?.endsAt ?? scheduledDrop.endsAt;
  await finalizeRelease(record, release, liveDrop ?? scheduledDrop, productTitle);
  return { triggered: true, pending: false };
}

async function applyPendingRelease(record: VaultRecord, drop: Drop) {
  const pending = record.pendingRelease;
  if (!pending) return;
  const release = record.releases.find((item) => item.id === pending.releaseId);
  if (!release) {
    record.pendingRelease = null;
    saveToDisk();
    return;
  }
  addInventoryToLive({ [record.productId]: pending.restockQty });
  ensureLiveDropWindow(pending.durationMinutes);
  release.status = "live";
  release.startsAt = new Date().toISOString();
  release.endsAt = drop.endsAt;
  await finalizeRelease(record, release, drop, getProduct(record.productId)?.title ?? record.productId);
}

onDropEvent(async (event) => {
  if (event.type === "activated") {
    let changed = false;
    for (const record of vault.values()) {
      if (!record.pendingRelease) continue;
      await applyPendingRelease(record, event.drop);
      changed = true;
    }
    if (changed) saveToDisk();
    return;
  }
  if (event.type === "ended") {
    let changed = false;
    for (const record of vault.values()) {
      const release = record.releases.find(
        (item) => item.dropId === event.drop.id && item.status === "live",
      );
      if (release) {
        release.status = "completed";
        changed = true;
      }
    }
    if (changed) saveToDisk();
  }
});

function snapshotActiveRelease(record: VaultRecord): VaultRelease | null {
  const live = [...record.releases].reverse().find((release) => release.status === "live");
  return live ?? null;
}

export async function addSaveToVault(input: AddSaveInput) {
  const email = normalizeEmail(input.email);
  if (!email) {
    throw new Error("Email is required");
  }
  const product = getProduct(input.productId);
  if (!product) {
    throw new Error("Product not found");
  }

  const record = ensureRecord(product.id);
  if (record.saves.some((saver) => saver.email === email)) {
    return {
      added: false,
      alreadySaved: true,
      count: record.saves.length,
      threshold: getThreshold(),
      releaseTriggered: false,
      pendingRelease: Boolean(record.pendingRelease),
    };
  }

  record.saves.push({
    email,
    userId: input.userId,
    name: input.name?.trim() || undefined,
    savedAt: new Date().toISOString(),
  });
  saveToDisk();

  const result = await triggerRelease(record, product.title);

  return {
    added: true,
    alreadySaved: false,
    count: record.saves.length,
    threshold: getThreshold(),
    releaseTriggered: result.triggered,
    pendingRelease: result.pending,
  };
}

export function getVaultSnapshot(): VaultSnapshot {
  const threshold = getThreshold();
  const snapshot: VaultSnapshot = {};
  for (const [productId, record] of vault.entries()) {
    const activeRelease = snapshotActiveRelease(record);
    const lastRelease = record.releases.length ? record.releases[record.releases.length - 1] : null;
    snapshot[productId] = {
      saves: record.saves.length,
      threshold,
      pendingRelease: record.pendingRelease ?? undefined,
      activeRelease,
      lastRelease,
    };
  }
  return snapshot;
}
