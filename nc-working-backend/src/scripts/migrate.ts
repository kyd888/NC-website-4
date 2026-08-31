import dotenv from "dotenv";
import { closeDb, dbEnabled, dbQuery } from "../lib/db.js";
import { schemaSql } from "../lib/schema.js";

dotenv.config();

async function main() {
  if (!dbEnabled) {
    // No Postgres configured — the app falls back to the JSON file stores in
    // DATA_DIR, so this is a supported setup. Skip instead of failing, or the
    // deploy's start command aborts before the server ever binds a port.
    console.log("DATABASE_URL is not set; skipping Postgres migrations.");
    return;
  }
  await dbQuery(schemaSql);
  console.log("Postgres schema is ready");
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await closeDb();
  });
