import { dbEnabled, dbQuery } from "./db.js";
import { loadInventoryFromDb } from "./inventory.js";
import { loadSalesFromDb } from "./sales.js";
import { loadUsersFromDb } from "./users.js";
import { loadVaultFromDb } from "./vault.js";
import { loadKydContent } from "./siteContent.js";
import { schemaSql } from "./schema.js";

const CONNECT_ATTEMPTS = Math.max(1, Number.parseInt(process.env.DB_CONNECT_ATTEMPTS || "5", 10) || 5);
const CONNECT_BASE_DELAY_MS = Math.max(
  100,
  Number.parseInt(process.env.DB_CONNECT_RETRY_DELAY_MS || "1000", 10) || 1000,
);

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function describeConnectionFailure(error: unknown) {
  const code = (error as { code?: string } | null)?.code;
  const host = (error as { hostname?: string } | null)?.hostname;
  if (code === "ENOTFOUND") {
    return [
      `[database] Cannot resolve the Postgres host${host ? ` "${host}"` : ""}.`,
      "  A Render internal hostname (dpg-…-a) only resolves when the database still exists",
      "  and lives in the SAME region as this service. Check, in order:",
      "    1. The Postgres instance still exists and is not suspended or expired.",
      "    2. It is in the same region as this web service.",
      "    3. DATABASE_URL holds the current Internal Database URL — re-copy it from the",
      "       database's dashboard page, since the host changes if the instance was recreated.",
      "    4. Connecting from outside Render? Use the External Database URL instead.",
    ].join("\n");
  }
  return [
    "[database] DATABASE_URL is set, but Postgres is unreachable.",
    "  On Render, use the Internal Database URL from a Postgres instance in the same region",
    "  as this service. For local development, use the External Database URL instead.",
  ].join("\n");
}

/**
 * Applies the schema, retrying briefly so a database that is still provisioning
 * or waking from idle does not take the whole service down. If it still cannot
 * connect, the error propagates and startup aborts rather than silently running
 * on the JSON file stores — writing orders to a datastore that is about to be
 * discarded is worse than a visible outage.
 */
async function connectWithRetry() {
  for (let attempt = 1; attempt <= CONNECT_ATTEMPTS; attempt += 1) {
    try {
      await dbQuery(schemaSql);
      if (attempt > 1) console.log(`[database] Connected on attempt ${attempt}.`);
      return;
    } catch (error) {
      if (attempt === CONNECT_ATTEMPTS) {
        console.error(describeConnectionFailure(error));
        throw error;
      }
      const delay = CONNECT_BASE_DELAY_MS * 2 ** (attempt - 1);
      const reason = (error as { code?: string } | null)?.code ?? "connection error";
      console.warn(
        `[database] ${reason} on attempt ${attempt}/${CONNECT_ATTEMPTS}; retrying in ${delay}ms.`,
      );
      await sleep(delay);
    }
  }
}

export async function initializePersistentStores() {
  // KYD content falls back to disk, so it loads with or without a database.
  await loadKydContent();
  if (!dbEnabled) {
    // Without a database everything lives in DATA_DIR. On a host with an
    // ephemeral filesystem (Render, unless that path is a mounted disk) each
    // restart starts from nothing: no catalog, no live drop, so the shop shows
    // "drop paused" until someone sets it up again. Say so loudly rather than
    // letting it look like the shop broke.
    console.warn(
      "[storage] DATABASE_URL is not set — catalog, drops, inventory, orders and accounts are\n" +
      "[storage] being written to the local filesystem only. If that path is not a persistent\n" +
      "[storage] disk, ALL OF IT IS LOST on every restart and deploy, and the shop will come\n" +
      "[storage] back with no products. Set DATABASE_URL to persist properly.",
    );
    return;
  }
  await connectWithRetry();
  await loadUsersFromDb();
  await loadSalesFromDb();
  await loadInventoryFromDb();
  await loadVaultFromDb();
}
