import { dbEnabled, dbQuery } from "./db.js";
import { loadInventoryFromDb } from "./inventory.js";
import { loadSalesFromDb } from "./sales.js";
import { loadUsersFromDb } from "./users.js";
import { loadVaultFromDb } from "./vault.js";
import { schemaSql } from "./schema.js";

export async function initializePersistentStores() {
  if (!dbEnabled) return;
  await dbQuery(schemaSql);
  await loadUsersFromDb();
  await loadSalesFromDb();
  await loadInventoryFromDb();
  await loadVaultFromDb();
}
