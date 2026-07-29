import { dbEnabled, dbQuery } from "./db.js";
import { loadInventoryFromDb } from "./inventory.js";
import { loadSalesFromDb } from "./sales.js";
import { loadUsersFromDb } from "./users.js";
import { loadVaultFromDb } from "./vault.js";
import { schemaSql } from "./schema.js";

export async function initializePersistentStores() {
  if (!dbEnabled) return;
  try {
    await dbQuery(schemaSql);
  } catch (error) {
    console.error(
      "[database] DATABASE_URL is set, but Postgres is unreachable. On Render, use the Internal Database URL from the Postgres instance available to this backend service. If this is local development, use the External Database URL instead.",
    );
    throw error;
  }
  await loadUsersFromDb();
  await loadSalesFromDb();
  await loadInventoryFromDb();
  await loadVaultFromDb();
}
